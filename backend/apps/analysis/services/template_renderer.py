"""Render an analyzed COT using a user-uploaded DOCX template.

The template is a `.docx` containing docxtpl (Jinja2) placeholders. Shops
download the starter template from `/api/form-templates/starter/`, customize
fonts/headers/footer-legend in Word, and re-upload. This module reads the
analysis's stored structured output and renders into the user's docx.

Why docxtpl rather than placeholder string replacement: it preserves the
template's table-row structure (`{% tr for inst in instruments %}` repeats the
entire table row including its cell styling) and survives any visual edits the
user makes — fonts, borders, headers, footers, logos, footer legends all
render exactly as authored.
"""

import io
import os
from typing import TYPE_CHECKING, Any

from .instrument_format import (
    InstrumentDict,
    format_display_date,
    format_instrument_type_upper,
    format_party_list,
    format_subject_premises_label,
)

if TYPE_CHECKING:
    from apps.analysis.models import COTAnalysis, FormTemplate
    from apps.documents.models import Document


def _instrument_to_row(inst: InstrumentDict) -> dict[str, str]:
    """Flatten a structured instrument into the cell strings the template renders."""
    recording = inst.get("recording_info") or {}
    book = (recording.get("book") or "").strip()
    page = (recording.get("page") or "").strip()
    book_page = f"{book}/{page}" if (book or page) else ""
    recording_date = inst.get("recording_date") or inst.get("instrument_date") or ""
    spr_label = format_subject_premises_label(inst.get("subject_premises_relationship"))
    raw_comments = (inst.get("comments") or "").replace("\n", " ")
    legal = (inst.get("legal_description") or "").replace("\n", " ")
    # Match the markdown comments cell: "<Subject Premises label>. <comments>".
    combined_comments = ". ".join(p for p in (spr_label, raw_comments) if p)
    return {
        "caption": format_instrument_type_upper(inst.get("instrument_type")),
        "book_page": book_page,
        "book": book,
        "page": page,
        "reception": (recording.get("reception_number") or "").strip(),
        "recording_date": format_display_date(recording_date),
        "instrument_date": format_display_date(inst.get("instrument_date") or ""),
        "grantor": format_party_list(inst.get("grantors")),
        "grantee": format_party_list(inst.get("grantees")),
        "legal_description": legal,
        "comments": combined_comments,
        "subject_premises_relationship": inst.get("subject_premises_relationship") or "",
        "start_page": str(inst.get("start_page") or ""),
        "end_page": str(inst.get("end_page") or ""),
    }


def build_template_context(
    analysis: "COTAnalysis",
    document: "Document | None",
    legal_description: str,
    title_agent_name: str,
) -> dict[str, Any]:
    """Build the dict that docxtpl renders against.

    Keys mirror the placeholders documented in the starter template. New keys
    can be added freely without breaking templates that don't reference them.

    Header values come from `resolve_header_values`: the operator's per-run
    `analysis.header_fields` win, falling back to the saved chain/document
    records. `legal_description` (the explicit arg) is kept only as a final
    fallback for callers that pass it directly.
    """
    from .header import resolve_header_values

    h = resolve_header_values(
        document, analysis.header_fields, title_agent_name, getattr(analysis, "header_extracted", None)
    )

    # Flatten every parsed_document's instruments into one ordered list,
    # sorted chronologically (the template's `{% tr for inst in instruments %}`
    # loop will render them in this order).
    all_instruments: list[InstrumentDict] = []
    for pd in analysis.parsed_documents or []:
        all_instruments.extend(pd.get("instruments") or [])

    def _date_key(inst: InstrumentDict) -> str:
        return inst.get("recording_date") or inst.get("instrument_date") or ""

    sorted_instruments = sorted(all_instruments, key=_date_key)
    rows = [_instrument_to_row(inst) for inst in sorted_instruments]

    begin = sorted_instruments[0] if sorted_instruments else None
    end = sorted_instruments[-1] if sorted_instruments else None
    begin_iso = (begin.get("recording_date") or begin.get("instrument_date") or "") if begin else ""
    end_iso = (end.get("recording_date") or end.get("instrument_date") or "") if end else ""

    legal = h.get("legal_description", "") or (legal_description or "").strip()

    return {
        # Header fields (resolved: operator override → saved records)
        "tax_id": h.get("tax_id", ""),
        "parcel_number": h.get("tax_id", ""),
        "tract_number": h.get("tract_number", ""),
        "record_holder": h.get("record_owner", ""),
        "record_owner": h.get("record_owner", ""),  # alias for shop wording
        "property_address": h.get("address", ""),
        "address": h.get("address", ""),
        "county": h.get("county", ""),
        "state": h.get("state", ""),
        "county_state": h.get("county_state", ""),
        "legal_description": legal,
        "description": legal,  # alias
        "acres": h.get("acres", ""),
        "begin_search_date": format_display_date(begin_iso),
        "end_search_date": format_display_date(end_iso),
        "title_agent": h.get("title_agent", ""),
        # Subject Premises (the operator's recommended search basis) — its own section.
        "subject_premises": legal,
        # Repeating block
        "instruments": rows,
        # Narrative / notes
        "narrative": analysis.narrative or "",
        "notes": [
            {"page": n.get("page", 0), "text": n.get("text", ""), "source": n.get("source", "")}
            for n in (analysis.notes or [])
        ],
    }


def render_with_template(
    template_path_or_fileobj: Any,
    context: dict[str, Any],
) -> io.BytesIO:
    """Render a FormTemplate's .docx with `context`, returning the bytes.

    `template_path_or_fileobj` is a path string OR a file-like with a `.read()`
    method (e.g., a Django FieldFile or BytesIO). docxtpl needs a file path or
    a BytesIO, so we normalize.

    Placeholders are auto-prepared at render time (idempotent): a template that
    already contains docxtpl markers passes through untouched, while a plain
    customer form (just labels + an empty instrument table) gets its fill-in
    markers injected so it actually fills with data. Without this, a plain
    template renders as the empty form.
    """
    from docxtpl import DocxTemplate

    from .template_intake import prepare_uploaded_template

    if hasattr(template_path_or_fileobj, "read"):
        template_path_or_fileobj.open("rb") if hasattr(template_path_or_fileobj, "open") else None
        try:
            data = template_path_or_fileobj.read()
        finally:
            if hasattr(template_path_or_fileobj, "close"):
                template_path_or_fileobj.close()
    else:
        with open(template_path_or_fileobj, "rb") as fh:
            data = fh.read()

    # Inject fill-in markers if missing; passthrough if already templated.
    data = prepare_uploaded_template(data)

    doc = DocxTemplate(io.BytesIO(data))
    doc.render(context)
    out = io.BytesIO()
    doc.save(out)
    out.seek(0)
    return out


def render_analysis_with_template(
    analysis: "COTAnalysis",
    template: "FormTemplate",
    legal_description: str = "",
    title_agent_name: str = "",
) -> io.BytesIO:
    """Top-level entry: render the analysis through the supplied FormTemplate."""
    context = build_template_context(
        analysis=analysis,
        document=analysis.document,
        legal_description=legal_description,
        title_agent_name=title_agent_name,
    )
    return render_with_template(template.file, context)


# ---------------------------------------------------------------------------
# Starter template — bundled .docx with all supported placeholders, downloadable
# from /api/form-templates/starter/. Shops download, restyle in Word, re-upload.
# ---------------------------------------------------------------------------

STARTER_TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static_templates",
    "cot_starter_template.docx",
)
