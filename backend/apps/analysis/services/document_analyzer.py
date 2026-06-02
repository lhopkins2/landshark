"""Stage 1: extract structured instrument data from a single PDF.

The model returns an array of instruments with start/end pages; per-page
success/failure is captured so the UI can surface unprocessable pages.
"""

from pathlib import Path
from typing import TYPE_CHECKING, Any, TypedDict

from django.conf import settings as django_settings

from .ai_providers import ContentBlock, UsageDict, run_structured_analysis
from .document_parser import IMAGE_DPI, MAX_PAGES_REDUCED, render_pdf_pages
from .instrument_format import (
    InstrumentDict,
    NoteDict,
    PageStatusDict,
    build_flat_notes,
    normalize_page_statuses,
)

if TYPE_CHECKING:
    from apps.documents.models import Document

STAGE1_PROMPT_FILE = Path(django_settings.BASE_DIR) / "prompts" / "stage1_extract_instruments.txt"


class ParsedDocumentDict(TypedDict):
    """Stage 1 output for a single source document."""

    document_id: str
    filename: str
    total_pages: int
    instruments: list[InstrumentDict]
    page_statuses: list[PageStatusDict]
    notes: list[NoteDict]
    usage: UsageDict
    error: str


def _load_prompt() -> str:
    return STAGE1_PROMPT_FILE.read_text(encoding="utf-8")


def _build_stage1_content(
    page_images: list[tuple[int, bytes]],
    total_pages: int,
    legal_description: str,
) -> list[ContentBlock]:
    """Build the Stage 1 content blocks: prompt + legal + image-tagged pages."""
    preamble = _load_prompt()
    legal_block = legal_description.strip() if legal_description else "(No legal description provided.)"

    content: list[ContentBlock] = [
        {"type": "text", "text": preamble},
        {
            "type": "text",
            "text": (
                "## LEGAL DESCRIPTION OF SUBJECT PREMISES\n\n"
                f"{legal_block}\n\n"
                "## DOCUMENT CONTENT\n\n"
                f"{len(page_images)} page(s) of the document follow. "
                "Each is preceded by a `--- Page N of M ---` marker."
            ),
        },
    ]
    for page_num, png_bytes in page_images:
        content.append({"type": "text", "text": f"--- Page {page_num} of {total_pages} ---"})
        content.append({"type": "image", "data": png_bytes, "media_type": "image/png"})

    return content


def normalize_instrument(raw: dict[str, Any]) -> InstrumentDict:
    """Coerce a raw model response into the canonical InstrumentDict shape with defaults."""
    return {
        "instrument_type": raw.get("instrument_type", "other"),
        "instrument_date": raw.get("instrument_date", "") or "",
        "recording_date": raw.get("recording_date", "") or "",
        "recording_info": {
            "reception_number": (raw.get("recording_info") or {}).get("reception_number", "") or "",
            "book": (raw.get("recording_info") or {}).get("book", "") or "",
            "page": (raw.get("recording_info") or {}).get("page", "") or "",
        },
        "grantors": [{"name": g.get("name", "")} for g in (raw.get("grantors") or []) if g.get("name")],
        "grantees": [{"name": g.get("name", "")} for g in (raw.get("grantees") or []) if g.get("name")],
        "legal_description": raw.get("legal_description", "") or "",
        "subject_premises_relationship": raw.get("subject_premises_relationship", "unknown") or "unknown",
        "encumbrances_created": list(raw.get("encumbrances_created") or []),
        "encumbrances_released": list(raw.get("encumbrances_released") or []),
        "comments": raw.get("comments", "") or "",
        "start_page": int(raw.get("start_page") or 0),
        "end_page": int(raw.get("end_page") or 0),
        "notes": list(raw.get("notes") or []),
    }


def analyze_document(
    document: "Document",
    provider: str,
    api_key: str,
    model: str = "",
    legal_description: str = "",
) -> ParsedDocumentDict:
    """Run Stage 1 against a single Document.

    Never raises: hard failures (unreadable PDF, model error after retry) return a
    result with `error` populated and `instruments` empty.
    """
    result: ParsedDocumentDict = {
        "document_id": str(document.id),
        "filename": document.original_filename,
        "total_pages": 0,
        "instruments": [],
        "page_statuses": [],
        "notes": [],
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "error": "",
    }

    try:
        page_images, total_pages = render_pdf_pages(
            document.file, dpi=IMAGE_DPI, max_pages=MAX_PAGES_REDUCED
        )
    except Exception as exc:
        result["error"] = f"failed to render PDF pages: {exc}"
        return result

    result["total_pages"] = total_pages
    if not page_images:
        result["error"] = "PDF rendered no pages"
        return result

    content = _build_stage1_content(page_images, total_pages, legal_description)

    try:
        # Extraction is mechanical; disable Gemini thinking to save output tokens.
        parsed, usage = run_structured_analysis(content, provider, api_key, model, thinking_budget=0)
    except Exception as exc:
        result["error"] = f"Stage 1 AI call failed: {exc}"
        result["page_statuses"] = [
            {"page": p, "status": "failed", "error": "Stage 1 AI call failed for this batch"}
            for p, _ in page_images
        ]
        return result

    result["usage"] = usage

    raw_instruments = parsed.get("instruments") if isinstance(parsed, dict) else None
    if not isinstance(raw_instruments, list):
        result["error"] = "Stage 1 response missing 'instruments' array"
        return result

    instruments = [normalize_instrument(i) for i in raw_instruments if isinstance(i, dict)]
    result["instruments"] = instruments
    result["page_statuses"] = normalize_page_statuses(
        parsed.get("page_statuses"), range(1, len(page_images) + 1)
    )
    result["notes"] = build_flat_notes(instruments, result["page_statuses"])

    return result
