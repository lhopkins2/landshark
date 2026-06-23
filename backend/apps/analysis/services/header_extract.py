"""AI extraction of report-header metadata from analyzed instruments.

One cheap text-only call (no page images — it reads the already-extracted
instrument JSON) that pulls Tax ID, Record Owner, Address, and Acres for the
COT report header. Operator-entered values always win over these; this only
fills fields the operator left blank. See services/header.py for the merge.

Never raises: on any failure returns an empty dict so the pipeline continues
and the header simply falls back to saved records / blanks.
"""

import json
import logging
from pathlib import Path

from django.conf import settings as django_settings

from .ai_providers import ContentBlock, UsageDict, run_structured_analysis
from .instrument_format import InstrumentDict, format_party_list

logger = logging.getLogger(__name__)

HEADER_PROMPT_FILE = Path(django_settings.BASE_DIR) / "prompts" / "header_extract.txt"

# Keys the model is asked to return.
_EXTRACTED_KEYS = ("tax_id", "tract_number", "record_owner", "address", "acres")


def _slim_instrument(inst: InstrumentDict) -> dict[str, str]:
    """Reduce an instrument to the fields useful for header extraction (keeps tokens low)."""
    recording = inst.get("recording_info") or {}
    return {
        "type": inst.get("instrument_type", ""),
        "instrument_date": inst.get("instrument_date", ""),
        "recording_date": inst.get("recording_date", ""),
        "reception": recording.get("reception_number", ""),
        "grantors": format_party_list(inst.get("grantors")),
        "grantees": format_party_list(inst.get("grantees")),
        "legal_description": inst.get("legal_description", ""),
        "subject_premises_relationship": inst.get("subject_premises_relationship", ""),
        "comments": inst.get("comments", ""),
    }


def extract_header_metadata(
    instruments: list[InstrumentDict],
    legal_description: str,
    provider: str,
    api_key: str,
    model: str = "",
) -> tuple[dict[str, str], UsageDict]:
    """Return ({tax_id, record_owner, address, acres}, usage).

    Empty dict + zero usage if there are no instruments or the call/parse fails.
    """
    empty_usage: UsageDict = {"input_tokens": 0, "output_tokens": 0}
    if not instruments:
        return {}, empty_usage

    try:
        prompt = HEADER_PROMPT_FILE.read_text(encoding="utf-8")
        payload = {
            "subject_premises_legal": legal_description or "",
            "instruments": [_slim_instrument(i) for i in instruments],
        }
        content: list[ContentBlock] = [
            {"type": "text", "text": prompt},
            {"type": "text", "text": "## INPUT DATA\n\n" + json.dumps(payload, indent=2)},
        ]
        parsed, usage = run_structured_analysis(content, provider, api_key, model, thinking_budget=0)
    except Exception:
        logger.exception("Header metadata extraction failed; falling back to blanks")
        return {}, empty_usage

    if not isinstance(parsed, dict):
        return {}, usage

    extracted = {key: str(parsed.get(key, "") or "").strip() for key in _EXTRACTED_KEYS}
    return extracted, usage
