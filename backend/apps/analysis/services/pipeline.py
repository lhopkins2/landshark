"""Orchestrator for the two-stage COT analysis pipeline.

Stage 1: per-document extraction (document_analyzer).
Stage 2: deterministic chain walk + optional AI resolution (chain_analyzer).

The returned dict is persisted onto a COTAnalysis row by `tasks.run_analysis_task`.
Keep this module orchestration-only — real logic lives in the stage modules.
"""

from collections.abc import Iterable
from typing import TYPE_CHECKING, TypedDict

from .ai_providers import UsageDict
from .chain_analyzer import (
    ChainEvent,
    OpenQuestion,
    ResolvedQuestion,
    build_chain,
    build_template_narrative,
    is_chain_clean,
    resolve_chain,
)
from .document_analyzer import ParsedDocumentDict, analyze_document
from .instrument_format import (
    InstrumentDict,
    NoteDict,
    format_comments_cell,
    format_display_date,
    format_instrument_type_upper,
    format_party_list,
)

if TYPE_CHECKING:
    from apps.documents.models import Document

PIPELINE_VERSION = "v1"


class ChainEventsBlock(TypedDict):
    """Structured `chain_events` payload persisted onto COTAnalysis."""

    events: list[ChainEvent]
    open_questions: list[OpenQuestion]
    resolved_questions: list[ResolvedQuestion]


class PipelineResult(TypedDict):
    """Output of `run_pipeline`, shape-compatible with `run_reanalyze`.

    `chain_events` is briefly a list during Stage 2a, then becomes a ChainEventsBlock
    once Stage 2b finishes. Consumed by `tasks._save_pipeline_result_to_analysis`.
    """

    pipeline_version: str
    parsed_documents: list[ParsedDocumentDict]
    chain_events: ChainEventsBlock | list[ChainEvent]
    narrative: str
    notes: list[NoteDict]
    failed_pages_count: int
    result_text: str
    header_extracted: dict[str, str]
    usage: UsageDict
    error: str


def build_markdown_output(
    parsed_documents: Iterable[ParsedDocumentDict] | None,
    narrative: str,
    notes: Iterable[NoteDict] | None,
    analysis_order: str,
    header_fields: dict[str, str] | None = None,
    subject_premises: str = "",
) -> str:
    """Render the markdown document fed to the PDF/DOCX generator.

    Sections: header (BEGIN/END SEARCH DATE + caller-supplied fields like
    PROPERTY ADDRESS, TAX ID, RECORD HOLDER, TITLE AGENT, DESCRIPTION), the
    Subject Premises (Recommended) block, instrument table, narrative, notes.

    `header_fields` is rendered in insertion order; empty values are skipped so
    the header stays tight.
    """
    instruments: list[InstrumentDict] = []
    for pd in parsed_documents or []:
        instruments.extend(pd.get("instruments") or [])

    def _date_key(inst: InstrumentDict) -> str:
        return inst.get("recording_date") or inst.get("instrument_date") or ""

    sorted_inst = sorted(instruments, key=_date_key, reverse=(analysis_order == "reverse_chronological"))

    lines = []
    if sorted_inst:
        # BEGIN/END always reflect chronological extremes, even when display is reversed.
        chronological = sorted(instruments, key=_date_key)
        begin = chronological[0].get("recording_date") or chronological[0].get("instrument_date") or ""
        end = chronological[-1].get("recording_date") or chronological[-1].get("instrument_date") or ""
        if begin:
            lines.append(f"BEGIN SEARCH DATE: {format_display_date(begin)}")
        if end:
            lines.append(f"END SEARCH DATE: {format_display_date(end)}")
    for label, value in (header_fields or {}).items():
        if value:
            lines.append(f"{label}: {value}")
    if sorted_inst or header_fields:
        lines.append("")

    # Subject Premises gets its own labelled section (the operator's search basis).
    if (subject_premises or "").strip():
        lines.append("## Subject Premises (Recommended)")
        lines.append("")
        lines.append(subject_premises.strip())
        lines.append("")

    lines.append("| Document Caption | Reception # | Date Recorded | Grantor | Grantee | Legal/Comments | Doc Pg |")
    lines.append("|---|---|---|---|---|---|---|")
    for inst in sorted_inst:
        reception = (inst.get("recording_info") or {}).get("reception_number", "")
        recording_date = inst.get("recording_date") or inst.get("instrument_date") or ""
        row = [
            format_instrument_type_upper(inst.get("instrument_type")),
            reception,
            format_display_date(recording_date),
            format_party_list(inst.get("grantors")),
            format_party_list(inst.get("grantees")),
            format_comments_cell(
                inst.get("subject_premises_relationship"),
                inst.get("comments"),
            ),
            str(inst.get("start_page") or ""),
        ]
        lines.append("| " + " | ".join(row) + " |")

    if narrative:
        lines.append("")
        lines.append("## Summary")
        lines.append("")
        lines.append(narrative)

    if notes:
        lines.append("")
        lines.append("## Notes")
        lines.append("")
        for n in notes:
            page_ref = f" (p.{n['page']})" if n.get("page") else ""
            lines.append(f"- {n.get('text', '')}{page_ref}")

    return "\n".join(lines)


def _build_header_fields(
    document: "Document",
    header_fields: dict[str, str] | None,
    title_agent_default: str = "",
    ai_extracted: dict[str, str] | None = None,
) -> dict[str, str]:
    """Compose the labelled header block for the deliverable.

    Sources values via `resolve_header_values` (operator entry → AI-extracted →
    saved chain/document records). Order is insertion order; empty values are
    dropped by the renderer.
    """
    from .header import resolve_header_values

    h = resolve_header_values(document, header_fields, title_agent_default, ai_extracted)
    return {
        "PROPERTY ADDRESS": h.get("address", ""),
        "COUNTY": h.get("county_state", ""),
        "TAX ID / PARCEL #": h.get("tax_id", ""),
        "TRACT #": h.get("tract_number", ""),
        "RECORD HOLDER": h.get("record_owner", ""),
        "ACRES": h.get("acres", ""),
        "TITLE AGENT": h.get("title_agent", ""),
        "DESCRIPTION": h.get("legal_description", ""),
    }


def run_pipeline(
    document: "Document",
    provider: str,
    api_key: str,
    model: str = "",
    legal_description: str = "",
    analysis_order: str = "chronological",
    title_agent_name: str = "",
    header_fields: dict[str, str] | None = None,
    custom_modifier: str = "",
) -> PipelineResult:
    """Run Stage 1 + Stage 2 against a single Document, returning a PipelineResult.

    The result shape supports multiple input documents even though the current
    COTAnalysis row binds one Document.
    """
    out: PipelineResult = {
        "pipeline_version": PIPELINE_VERSION,
        "parsed_documents": [],
        "chain_events": [],
        "narrative": "",
        "notes": [],
        "failed_pages_count": 0,
        "result_text": "",
        "header_extracted": {},
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "error": "",
    }

    # Stage 1's subject-premises comparison uses the effective legal description:
    # the operator's header override if present, else the explicit param / chain value.
    from .header import resolve_header_values

    effective_legal = (
        resolve_header_values(document, header_fields).get("legal_description", "")
        or legal_description
    )

    parsed = analyze_document(
        document=document,
        provider=provider,
        api_key=api_key,
        model=model,
        legal_description=effective_legal,
    )
    out["parsed_documents"].append(parsed)
    out["usage"]["input_tokens"] += parsed["usage"]["input_tokens"]
    out["usage"]["output_tokens"] += parsed["usage"]["output_tokens"]
    out["failed_pages_count"] = sum(
        1 for s in parsed.get("page_statuses", []) if s.get("status") == "failed"
    )

    if parsed.get("error"):
        out["error"] = f"Stage 1 failed: {parsed['error']}"
        out["notes"] = list(parsed.get("notes", []))
        return out

    if not parsed.get("instruments"):
        out["error"] = "Stage 1 returned no instruments"
        out["notes"] = list(parsed.get("notes", []))
        return out

    # Stage 2a: deterministic walk over all instruments from every parsed document.
    all_instruments = []
    for pd in out["parsed_documents"]:
        all_instruments.extend(pd.get("instruments", []))

    chain = build_chain(all_instruments)
    out["chain_events"] = chain["events"]

    # Extract report-header metadata (Tax ID, Record Owner, Address, Acres) from the
    # instruments — one cheap text-only call. Fills header fields the operator left
    # blank. Non-fatal: returns {} on any failure.
    from .header_extract import extract_header_metadata

    header_meta, header_usage = extract_header_metadata(
        all_instruments, effective_legal, provider, api_key, model
    )
    out["header_extracted"] = header_meta
    out["usage"]["input_tokens"] += header_usage.get("input_tokens", 0)
    out["usage"]["output_tokens"] += header_usage.get("output_tokens", 0)

    # Stage 2b: AI resolves open questions and writes the narrative.
    # Clean chains skip the AI call — the deterministic narrative is accurate
    # for them and saves a model round-trip.
    # A custom modifier is free-form operator guidance; it must reach the AI, so
    # skip the clean-chain template shortcut whenever one is supplied.
    has_modifier = bool(custom_modifier and custom_modifier.strip())
    merged_notes = list(parsed.get("notes", []))
    if is_chain_clean(chain) and not has_modifier:
        out["narrative"] = build_template_narrative(chain)
        resolved_questions = []
    else:
        resolved = resolve_chain(chain, provider, api_key, model, user_guidance=custom_modifier or "")
        out["usage"]["input_tokens"] += resolved["usage"]["input_tokens"]
        out["usage"]["output_tokens"] += resolved["usage"]["output_tokens"]
        out["narrative"] = resolved["narrative"]
        for cn in resolved.get("chain_notes", []):
            merged_notes.append({"source": "chain", "page": 0, "text": cn})
        if resolved.get("error"):
            merged_notes.append({"source": "chain", "page": 0, "text": f"Stage 2 error: {resolved['error']}"})
        resolved_questions = resolved.get("resolved_questions", [])

    out["notes"] = merged_notes

    out["chain_events"] = {
        "events": chain["events"],
        "open_questions": chain["open_questions"],
        "resolved_questions": resolved_questions,
    }

    out["result_text"] = build_markdown_output(
        parsed_documents=out["parsed_documents"],
        narrative=out["narrative"],
        notes=out["notes"],
        analysis_order=analysis_order,
        header_fields=_build_header_fields(document, header_fields, title_agent_name, header_meta),
        subject_premises=effective_legal,
    )

    return out
