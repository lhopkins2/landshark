"""Stage 2 of the COT pipeline.

- `build_chain`: deterministic walk over Stage 1 instruments; emits events and
  open questions. Pure Python, no AI.
- `resolve_chain`: single AI call that answers the open questions and produces
  the human-readable narrative.
"""

import json
import re
from collections.abc import Iterable
from datetime import date
from pathlib import Path
from typing import Any, TypedDict

from dateutil import parser as date_parser
from django.conf import settings as django_settings

from .ai_providers import ContentBlock, UsageDict, run_structured_analysis
from .instrument_format import (
    InstrumentDict,
    PartyDict,
    format_instrument_type_readable,
    format_party_list,
)

STAGE2_PROMPT_FILE = Path(django_settings.BASE_DIR) / "prompts" / "stage2_resolve_chain.txt"


class InstrumentRef(TypedDict):
    """Compact instrument reference embedded in ChainEvent payloads."""

    index: int
    instrument_type: str
    instrument_date: str
    recording_date: str
    start_page: int


class ChainEvent(TypedDict, total=False):
    """One event emitted by the deterministic chain walk."""

    type: str  # "chain_start" | "link_ok" | "name_mismatch" | "gap" | ...
    instrument: InstrumentRef
    description: str


class OpenQuestion(TypedDict):
    """An anomaly the deterministic walk couldn't resolve on its own."""

    id: str
    type: str
    related_instrument_indexes: list[int]
    question: str


class ChainResult(TypedDict):
    """Output of `build_chain`; input to `resolve_chain` / `build_template_narrative`."""

    sorted_instruments: list[InstrumentDict]
    events: list[ChainEvent]
    open_questions: list[OpenQuestion]


class ResolvedQuestion(TypedDict, total=False):
    id: str
    resolution: str


class ChainResolutionResult(TypedDict):
    """Output of `resolve_chain` (Stage 2b AI answer)."""

    resolved_questions: list[ResolvedQuestion]
    narrative: str
    chain_notes: list[str]
    usage: UsageDict
    error: str


_PUNCTUATION_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_name(name: str | None) -> str:
    """Lowercase, strip punctuation, collapse whitespace — for coarse equality checks."""
    if not name:
        return ""
    cleaned = _PUNCTUATION_RE.sub(" ", name.lower())
    return _WHITESPACE_RE.sub(" ", cleaned).strip()


def _parse_date(value: object) -> date | None:
    """Best-effort date parsing; returns None on failure."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date_parser.parse(str(value), default=None).date()
    except (ValueError, TypeError, OverflowError):
        return None


def _sort_key(instrument: InstrumentDict) -> tuple[date, int]:
    """Sort by instrument_date, falling back to recording_date, then start_page."""
    d = _parse_date(instrument.get("instrument_date")) or _parse_date(instrument.get("recording_date"))
    return (
        d or date.min,
        int(instrument.get("start_page") or 0),
    )


def _names_set(parties: Iterable[PartyDict] | None) -> set[str]:
    """Set of normalized names from {'name': ...} entries."""
    return {_normalize_name(p.get("name", "")) for p in parties or [] if p.get("name")}


def _names_overlap(a: set[str], b: set[str]) -> bool:
    return bool(a & b)


def _is_close_match(a: set[str], b: set[str]) -> bool:
    """Loose substring match: one side contains the other, or they share a 4+ char token."""
    if not a or not b:
        return False
    for name_a in a:
        for name_b in b:
            if not name_a or not name_b:
                continue
            if name_a in name_b or name_b in name_a:
                return True
            tokens_a = {t for t in name_a.split() if len(t) >= 4}
            tokens_b = {t for t in name_b.split() if len(t) >= 4}
            if tokens_a & tokens_b:
                return True
    return False


def _summarize_for_event(instrument: InstrumentDict, index: int) -> InstrumentRef:
    return {
        "index": index,
        "instrument_type": instrument.get("instrument_type", "other"),
        "instrument_date": instrument.get("instrument_date", ""),
        "recording_date": instrument.get("recording_date", ""),
        "start_page": instrument.get("start_page", 0),
    }


def build_chain(instruments: Iterable[InstrumentDict]) -> ChainResult:
    """Sort instruments by date and emit chain events + open questions.

    Fully deterministic. Returned `sorted_instruments` carries a stable `_chain_index`
    used by downstream callers and AI prompts.
    """
    indexed: list[InstrumentDict] = [
        {**inst, "_chain_index": i}
        for i, inst in enumerate(sorted(instruments, key=_sort_key))
    ]

    events: list[ChainEvent] = []
    open_questions: list[OpenQuestion] = []
    prior_grantees: set[str] = set()
    prior_ref: InstrumentRef | None = None
    question_counter = 0

    def next_qid() -> str:
        nonlocal question_counter
        question_counter += 1
        return f"q{question_counter}"

    for i, inst in enumerate(indexed):
        ref = _summarize_for_event(inst, i)
        grantors = _names_set(inst.get("grantors"))
        grantees = _names_set(inst.get("grantees"))

        # Encumbrance events fire regardless of chain linkage status.
        for created in inst.get("encumbrances_created") or []:
            events.append({"type": "encumbrance_added", "instrument": ref, "description": created})
        for released in inst.get("encumbrances_released") or []:
            events.append({"type": "encumbrance_released", "instrument": ref, "description": released})

        if i == 0:
            events.append({"type": "chain_start", "instrument": ref})
        elif not grantors:
            events.append({"type": "missing_grantors", "instrument": ref})
            qid = next_qid()
            open_questions.append({
                "id": qid,
                "type": "missing_grantors",
                "related_instrument_indexes": [prior_ref["index"], i] if prior_ref else [i],
                "question": (
                    f"Instrument at index {i} ({inst.get('instrument_type')}) has no grantors recorded. "
                    "Is this a probate, patent, or other instrument that doesn't require a chain link?"
                ),
            })
        elif _names_overlap(grantors, prior_grantees):
            events.append({"type": "link_ok", "instrument": ref})
        elif _is_close_match(grantors, prior_grantees):
            events.append({"type": "name_mismatch", "instrument": ref})
            qid = next_qid()
            prior_grantees_str = _format_name_list(indexed[prior_ref["index"]].get("grantees"))
            this_grantors_str = _format_name_list(inst.get("grantors"))
            open_questions.append({
                "id": qid,
                "type": "name_mismatch",
                "related_instrument_indexes": [prior_ref["index"], i],
                "question": (
                    f"Grantor(s) on instrument {i} ({this_grantors_str}) "
                    "are similar but not identical "
                    f"to grantee(s) of the prior instrument {prior_ref['index']} "
                    f"({prior_grantees_str}). "
                    "Same party (alias / name change) or different?"
                ),
            })
        else:
            events.append({"type": "gap", "instrument": ref})
            qid = next_qid()
            open_questions.append({
                "id": qid,
                "type": "gap",
                "related_instrument_indexes": [prior_ref["index"], i] if prior_ref else [i],
                "question": (
                    f"No overlap between grantor(s) of instrument {i} "
                    f"({_format_name_list(inst.get('grantors'))}) and grantee(s) of the prior in-chain instrument "
                    f"({_format_name_list(indexed[prior_ref['index']].get('grantees')) if prior_ref else 'n/a'}). "
                    "Is this a genuine chain gap, an intervening probate, or something else?"
                ),
            })

        # Heuristic: flag possible fractional conveyances based on comment wording.
        comments = (inst.get("comments") or "").lower()
        if any(token in comments for token in ("undivided", "fractional", "1/2 interest", "one-half interest")):
            events.append({"type": "branch", "instrument": ref})
            qid = next_qid()
            open_questions.append({
                "id": qid,
                "type": "branch",
                "related_instrument_indexes": [i],
                "question": (
                    f"Instrument {i} comments suggest a partial conveyance ({inst.get('comments')}). "
                    "Does the chain fork here, and if so, which branch carries Subject Premises forward?"
                ),
            })

        # Only instruments that actually transfer title advance the prior grantees.
        if grantees and inst.get("subject_premises_relationship") in (
            "subject_premises", "subject_premises_and_more", "unknown"
        ):
            prior_grantees = grantees
            prior_ref = ref

    return {
        "sorted_instruments": indexed,
        "events": events,
        "open_questions": open_questions,
    }


def _format_name_list(parties: Iterable[PartyDict] | None) -> str:
    return format_party_list(parties, empty="(none)")


def _load_stage2_prompt() -> str:
    return STAGE2_PROMPT_FILE.read_text(encoding="utf-8")


def _summary_for_resolver(instrument: InstrumentDict) -> dict[str, Any]:
    """Trim a Stage 1 instrument down to the subset Stage 2b actually needs."""
    return {
        "index": instrument.get("_chain_index", 0),
        "instrument_type": instrument.get("instrument_type", "other"),
        "instrument_date": instrument.get("instrument_date", ""),
        "recording_date": instrument.get("recording_date", ""),
        "grantors": instrument.get("grantors", []),
        "grantees": instrument.get("grantees", []),
        "subject_premises_relationship": instrument.get("subject_premises_relationship", "unknown"),
        "encumbrances_created": instrument.get("encumbrances_created", []),
        "encumbrances_released": instrument.get("encumbrances_released", []),
        "comments": instrument.get("comments", ""),
        "start_page": instrument.get("start_page", 0),
    }


def is_chain_clean(chain_result: ChainResult) -> bool:
    """True when build_chain found no anomalies — Stage 2b is skipped in that case."""
    if (chain_result.get("open_questions") or []):
        return False
    # Defensive: also scan events in case open_questions was cleared upstream.
    anomalous = {"name_mismatch", "gap", "branch", "missing_grantors"}
    for event in chain_result.get("events") or []:
        if event.get("type") in anomalous:
            return False
    return True


def _format_party(parties: Iterable[PartyDict] | None) -> str:
    return format_party_list(parties, empty="(unrecorded)")


def build_template_narrative(chain_result: ChainResult) -> str:
    """Render a short prose summary deterministically when the chain is clean."""
    instruments = chain_result.get("sorted_instruments") or []
    if not instruments:
        return ""

    first = instruments[0]
    last = instruments[-1]
    encumbrance_added = []
    encumbrance_released = []
    for event in chain_result.get("events") or []:
        if event.get("type") == "encumbrance_added":
            encumbrance_added.append(event.get("description", ""))
        elif event.get("type") == "encumbrance_released":
            encumbrance_released.append(event.get("description", ""))

    first_date = first.get("recording_date") or first.get("instrument_date") or "(undated)"
    last_date = last.get("recording_date") or last.get("instrument_date") or "(undated)"
    first_grantees = _format_party(first.get("grantees"))
    last_grantees = _format_party(last.get("grantees"))
    first_type = format_instrument_type_readable(first.get("instrument_type"))
    last_type = format_instrument_type_readable(last.get("instrument_type"))

    parts = [
        f"Title to the Subject Premises begins with the {first_type} "
        f"recorded {first_date} conveying to {first_grantees}.",
        f" The chain consists of {len(instruments)} instrument"
        f"{'s' if len(instruments) != 1 else ''} with no detected gaps or name mismatches.",
    ]
    if encumbrance_added or encumbrance_released:
        if encumbrance_added:
            parts.append(
                f" Encumbrances recorded: {'; '.join(encumbrance_added)}."
            )
        if encumbrance_released:
            parts.append(
                f" Encumbrances released: {'; '.join(encumbrance_released)}."
            )
    parts.append(
        f" Title is most recently reflected in the {last_type} "
        f"recorded {last_date} to {last_grantees}."
    )
    return "".join(parts)


def resolve_chain(
    chain_result: ChainResult,
    provider: str,
    api_key: str,
    model: str = "",
    user_guidance: str = "",
) -> ChainResolutionResult:
    """Stage 2b: one AI call resolves open_questions and writes the narrative.

    `user_guidance` (free-form text from a human reviewer, used by re-analyze)
    is injected as a "## USER GUIDANCE" block.
    """
    out: ChainResolutionResult = {
        "resolved_questions": [],
        "narrative": "",
        "chain_notes": [],
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "error": "",
    }

    summaries = [_summary_for_resolver(i) for i in chain_result.get("sorted_instruments", [])]
    payload = {
        "instruments": summaries,
        "events": chain_result.get("events", []),
        "open_questions": chain_result.get("open_questions", []),
    }

    content: list[ContentBlock] = [
        {"type": "text", "text": _load_stage2_prompt()},
        {"type": "text", "text": "## CHAIN INPUT\n\n" + json.dumps(payload, indent=2)},
    ]
    if user_guidance and user_guidance.strip():
        content.append({
            "type": "text",
            "text": (
                "## USER GUIDANCE\n\n"
                "A human reviewer provided the following guidance for this analysis. "
                "Factor it into your resolutions and into the narrative:\n\n"
                f"{user_guidance.strip()}"
            ),
        })

    try:
        # Input is already structured and the resolutions are scoped — chain-of-thought is wasted cost.
        parsed, usage = run_structured_analysis(content, provider, api_key, model, thinking_budget=0)
    except Exception as exc:
        out["error"] = f"Stage 2 AI call failed: {exc}"
        return out

    out["usage"] = usage
    if isinstance(parsed, dict):
        out["resolved_questions"] = list(parsed.get("resolved_questions") or [])
        out["narrative"] = parsed.get("narrative", "") or ""
        out["chain_notes"] = list(parsed.get("chain_notes") or [])
    else:
        out["error"] = "Stage 2 response was not a JSON object"

    return out
