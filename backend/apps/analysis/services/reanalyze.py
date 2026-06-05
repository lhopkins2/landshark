"""Re-analyze orchestrator.

Derives a new analysis result from a parent, optionally applying:
- cell-level edits to instruments (no AI),
- a targeted page re-scan (Stage 1 AI on a page subset),
- free-form user guidance fed into Stage 2b.

Output shape matches `pipeline.run_pipeline` so tasks.py can consume either.
"""

import copy
import json
from collections.abc import Iterable
from pathlib import Path
from typing import TYPE_CHECKING, Any, TypedDict

from django.conf import settings as django_settings

from .ai_providers import ContentBlock, UsageDict, run_structured_analysis
from .chain_analyzer import build_chain, resolve_chain
from .document_analyzer import normalize_instrument
from .document_parser import IMAGE_DPI, render_pdf_pages
from .instrument_format import (
    InstrumentDict,
    PageStatusDict,
    build_flat_notes,
    normalize_page_statuses,
)
from .pipeline import PIPELINE_VERSION, PipelineResult, _build_header_fields, build_markdown_output

if TYPE_CHECKING:
    from apps.analysis.models import COTAnalysis

REEXTRACT_PROMPT_FILE = (
    Path(django_settings.BASE_DIR) / "prompts" / "stage1_reextract_pages.txt"
)


class _RescanResult(TypedDict):
    instruments: list[InstrumentDict]
    page_statuses: list[PageStatusDict]
    usage: UsageDict
    error: str


class InstrumentEditDict(TypedDict, total=False):
    """One entry in the `instrument_edits` input to `run_reanalyze`."""

    index: int
    instrument: dict[str, Any]


def _load_reextract_prompt() -> str:
    return REEXTRACT_PROMPT_FILE.read_text(encoding="utf-8")


def _add_usage(a: UsageDict | None, b: UsageDict | None) -> UsageDict:
    return {
        "input_tokens": (a or {}).get("input_tokens", 0) + (b or {}).get("input_tokens", 0),
        "output_tokens": (a or {}).get("output_tokens", 0) + (b or {}).get("output_tokens", 0),
    }


def _build_reextract_content(
    page_images: list[tuple[int, bytes]],
    total_pages: int,
    prior_instruments: Iterable[InstrumentDict],
    page_set: set[int],
    legal_description: str,
) -> list[ContentBlock]:
    """Content blocks for the targeted Stage 1 re-extract call."""
    prior_subset = [
        inst for inst in prior_instruments
        if inst.get("start_page") in page_set or inst.get("end_page") in page_set
    ]
    legal_block = legal_description.strip() if legal_description else "(No legal description provided.)"

    content: list[ContentBlock] = [
        {"type": "text", "text": _load_reextract_prompt()},
        {
            "type": "text",
            "text": (
                "## LEGAL DESCRIPTION OF SUBJECT PREMISES\n\n"
                f"{legal_block}\n\n"
                "## PRIOR EXTRACTION CONTEXT\n\n"
                "Instruments the prior pass extracted on or overlapping these pages:\n\n"
                f"{json.dumps(prior_subset, indent=2)}\n\n"
                "## PAGES TO RE-EXTRACT\n\n"
                f"{len(page_images)} page(s) follow. Page numbers are absolute "
                "(matching the source PDF). Return only instruments whose start_page "
                "is in this set; preserve absolute page numbers in your output."
            ),
        },
    ]
    for page_num, image_bytes in page_images:
        content.append({"type": "text", "text": f"--- Page {page_num} of {total_pages} ---"})
        content.append({"type": "image", "data": image_bytes, "media_type": "image/jpeg"})
    return content


def _reextract_pages(
    document: Any,
    page_indexes: Iterable[int],
    prior_instruments: list[InstrumentDict],
    provider: str,
    api_key: str,
    model: str,
    legal_description: str,
) -> _RescanResult:
    """Run Stage 1 against a subset of pages."""
    out: _RescanResult = {
        "instruments": [],
        "page_statuses": [],
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "error": "",
    }
    try:
        page_images, total_pages = render_pdf_pages(
            document.file, dpi=IMAGE_DPI, page_indexes=page_indexes
        )
    except Exception as exc:
        out["error"] = f"failed to render PDF pages for re-scan: {exc}"
        return out

    if not page_images:
        out["error"] = "No pages rendered for re-scan (page numbers may be out of range)."
        return out

    page_set = {p for p, _ in page_images}
    content = _build_reextract_content(
        page_images, total_pages, prior_instruments, page_set, legal_description
    )

    try:
        parsed, usage = run_structured_analysis(
            content, provider, api_key, model, thinking_budget=0
        )
    except Exception as exc:
        out["error"] = f"Re-scan AI call failed: {exc}"
        out["page_statuses"] = [
            {"page": p, "status": "failed", "error": "Re-scan AI call failed"}
            for p in page_set
        ]
        return out

    out["usage"] = usage
    raw_instruments = parsed.get("instruments") if isinstance(parsed, dict) else None
    if not isinstance(raw_instruments, list):
        out["error"] = "Re-scan response missing 'instruments' array"
        return out

    out["instruments"] = [normalize_instrument(i) for i in raw_instruments if isinstance(i, dict)]
    out["page_statuses"] = normalize_page_statuses(parsed.get("page_statuses"), sorted(page_set))
    return out


def _merge_instruments(
    prior: Iterable[InstrumentDict],
    rescanned: Iterable[InstrumentDict],
    rescanned_pages: set[int],
) -> list[InstrumentDict]:
    """Drop prior instruments starting on any rescanned page, then append the rescanned set."""
    kept = [i for i in prior if i.get("start_page") not in rescanned_pages]
    merged: list[InstrumentDict] = kept + list(rescanned)
    merged.sort(key=lambda i: (int(i.get("start_page") or 0), i.get("instrument_date") or ""))
    return merged


def _merge_page_statuses(
    prior: Iterable[PageStatusDict] | None,
    rescanned: Iterable[PageStatusDict] | None,
) -> list[PageStatusDict]:
    """Replace prior page statuses with rescanned ones for matching page numbers."""
    by_page: dict[int, PageStatusDict] = {s.get("page", 0): s for s in (prior or [])}
    for s in rescanned or []:
        by_page[s.get("page", 0)] = s
    return [by_page[p] for p in sorted(by_page.keys())]


def run_reanalyze(
    parent_analysis: "COTAnalysis",
    instrument_edits: Iterable[InstrumentEditDict] | None,
    pages_to_rescan: Iterable[int] | None,
    user_instructions: str,
    provider: str,
    api_key: str,
    model: str = "",
    legal_description: str = "",
    analysis_order: str = "chronological",
    title_agent_name: str = "",
) -> PipelineResult:
    """Build a new PipelineResult from `parent_analysis` plus optional edits/rescans/guidance."""
    out: PipelineResult = {
        "pipeline_version": PIPELINE_VERSION,
        "parsed_documents": [],
        "chain_events": [],
        "narrative": "",
        "notes": [],
        "failed_pages_count": 0,
        "result_text": "",
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "error": "",
    }

    parent_docs = parent_analysis.parsed_documents or []
    if not parent_docs:
        out["error"] = "Parent analysis has no parsed_documents — cannot re-analyze."
        return out

    parsed = copy.deepcopy(parent_docs)
    # One Document per analysis today; the pipeline shape supports more.
    pd = parsed[0]
    pd_instruments = list(pd.get("instruments") or [])

    rescanned_pages = set(int(p) for p in (pages_to_rescan or []))
    if rescanned_pages:
        rescan = _reextract_pages(
            document=parent_analysis.document,
            page_indexes=sorted(rescanned_pages),
            prior_instruments=pd_instruments,
            provider=provider,
            api_key=api_key,
            model=model,
            legal_description=legal_description,
        )
        out["usage"] = _add_usage(out["usage"], rescan["usage"])
        if rescan.get("error"):
            out["error"] = f"Page re-scan failed: {rescan['error']}"
            return out
        pd_instruments = _merge_instruments(
            pd_instruments, rescan["instruments"], rescanned_pages
        )
        pd["page_statuses"] = _merge_page_statuses(
            pd.get("page_statuses"), rescan["page_statuses"]
        )

    # Cell edits use parent indexes; silently drop edits whose row was removed by a rescan.
    for edit in instrument_edits or []:
        try:
            idx = int(edit.get("index"))
        except (TypeError, ValueError):
            continue
        instrument = edit.get("instrument")
        if not isinstance(instrument, dict):
            continue
        if 0 <= idx < len(pd_instruments):
            pd_instruments[idx] = normalize_instrument(instrument)

    pd["instruments"] = pd_instruments

    flat_notes = build_flat_notes(pd_instruments, pd.get("page_statuses"))
    pd["notes"] = flat_notes

    chain = build_chain(pd_instruments)

    # Always rerun Stage 2b so the narrative reflects edits, rescans, and user guidance.
    resolved = resolve_chain(
        chain, provider, api_key, model, user_guidance=user_instructions or ""
    )
    out["usage"] = _add_usage(out["usage"], resolved.get("usage"))

    merged_notes = list(flat_notes)
    for cn in resolved.get("chain_notes") or []:
        merged_notes.append({"source": "chain", "page": 0, "text": cn})
    if resolved.get("error"):
        merged_notes.append({
            "source": "chain",
            "page": 0,
            "text": f"Stage 2 error: {resolved['error']}",
        })

    out["parsed_documents"] = parsed
    out["narrative"] = resolved.get("narrative", "")
    out["notes"] = merged_notes
    out["failed_pages_count"] = sum(
        1 for s in pd.get("page_statuses") or [] if s.get("status") == "failed"
    )
    out["chain_events"] = {
        "events": chain.get("events", []),
        "open_questions": chain.get("open_questions", []),
        "resolved_questions": resolved.get("resolved_questions", []),
    }
    out["result_text"] = build_markdown_output(
        parsed_documents=parsed,
        narrative=out["narrative"],
        notes=merged_notes,
        analysis_order=analysis_order,
        header_fields=_build_header_fields(parent_analysis.document, legal_description, title_agent_name),
    )
    return out
