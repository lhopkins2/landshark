"""Single source of truth for COT report-header values.

Header fields (TAX ID, ADDRESS, RECORD OWNER, TRACT, ACRES, TITLE AGENT,
DESCRIPTION) can be typed by the operator on the Analyze form and stored on the
`COTAnalysis.header_fields` JSON blob. This module resolves the final values used
by every renderer, with a fallback to the saved Chain-of-Title / Document records
for legacy analyses that pre-date the editable header.

Reused by:
  * `pipeline._build_header_fields` (default markdown/PDF/DOCX output)
  * `template_renderer.build_template_context` (customer DOCX templates)
  * `documents.serializers.DocumentSerializer.suggested_header` (form prefill)
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.documents.models import Document

# Canonical editable header keys. The frontend Analyze form posts exactly these
# (legal_description included), and they're persisted on COTAnalysis.header_fields.
EDITABLE_HEADER_KEYS = (
    "tax_id",
    "tract_number",
    "record_owner",
    "address",
    "acres",
    "title_agent",
    "legal_description",
)


def _chain_of(document: "Document | None") -> Any:
    return getattr(document, "chain_of_title", None) if document else None


def header_defaults(document: "Document | None", title_agent_default: str = "") -> dict[str, str]:
    """Compute prefill values from saved Chain-of-Title / Document records.

    These are the suggestions shown in the Analyze form before the operator
    edits anything. `legal_description` defaults to the chain's stored value;
    a per-run override is applied later in `resolve_header_values`.
    """
    chain = _chain_of(document)
    county = (getattr(chain, "county", "") or "") if chain else ""
    state = (getattr(chain, "state", "") or "") if chain else ""
    return {
        "tax_id": (getattr(chain, "parcel_number", "") or "") if chain else "",
        "tract_number": (document.tract_number or "") if document else "",
        "record_owner": (document.last_record_holder or "") if document else "",
        "address": (getattr(chain, "property_address", "") or "") if chain else "",
        "acres": "",  # no saved source yet; operator-entered only
        "title_agent": title_agent_default or "",
        "legal_description": (getattr(chain, "legal_description", "") or "") if chain else "",
        "county": county,
        "state": state,
        "county_state": ", ".join(p for p in (county, state) if p),
    }


# Fields the AI extractor (services/header_extract.py) can fill.
AI_FILLABLE_KEYS = ("tax_id", "tract_number", "record_owner", "address", "acres")


def resolve_header_values(
    document: "Document | None",
    header_fields: dict[str, Any] | None,
    title_agent_default: str = "",
    ai_extracted: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Resolve the header values a renderer should use.

    Per-field precedence: operator entry (non-blank) → AI-extracted (non-blank)
    → saved chain/document record → blank. So nothing the operator typed gets
    overwritten, and blanks are filled by the AI extractor when available.
    `county`/`state` always come from the chain (not on the form) for the
    default renderer's COUNTY line.
    """
    defaults = header_defaults(document, title_agent_default)
    operator = header_fields or {}
    ai = ai_extracted or {}

    resolved = dict(defaults)
    for key in EDITABLE_HEADER_KEYS:
        op_val = str(operator.get(key, "") or "").strip()
        ai_val = str(ai.get(key, "") or "").strip() if key in AI_FILLABLE_KEYS else ""
        resolved[key] = op_val or ai_val or resolved.get(key, "")

    # title_agent: never AI-filled; fall back to the default when the operator left it blank.
    if not resolved.get("title_agent"):
        resolved["title_agent"] = title_agent_default or ""
    resolved["county_state"] = ", ".join(p for p in (resolved.get("county", ""), resolved.get("state", "")) if p)
    return resolved
