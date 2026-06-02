"""Shared formatting helpers and wire-shape types for parsed instruments.

Single source of truth for instrument-type labels and party-name joining.
Mirrors `src/utils/markdownTable.ts` on the frontend; keep both in sync.
"""

from collections.abc import Iterable, Mapping
from typing import TypedDict

# These TypedDicts describe the wire shape that crosses pipeline stages,
# the DB layer, and the API boundary. `total=False` because Stage 1's raw
# model output and downstream code both tolerate missing keys.


class PartyDict(TypedDict, total=False):
    name: str


class PageStatusDict(TypedDict):
    page: int
    status: str  # "ok" | "failed" | "unknown"
    error: str


class NoteDict(TypedDict):
    source: str  # "instrument" | "page" | "chain"
    page: int
    text: str


class RecordingInfoDict(TypedDict, total=False):
    reception_number: str
    book: str
    page: str


class InstrumentDict(TypedDict, total=False):
    instrument_type: str
    instrument_date: str
    recording_date: str
    recording_info: RecordingInfoDict
    grantors: list[PartyDict]
    grantees: list[PartyDict]
    legal_description: str
    subject_premises_relationship: str
    encumbrances_created: list[str]
    encumbrances_released: list[str]
    comments: str
    start_page: int
    end_page: int
    notes: list[str]
    _chain_index: int  # attached by Stage 2 after sorting


INSTRUMENT_TYPE_LABELS: dict[str, str] = {
    "warranty_deed": "WARRANTY DEED",
    "quitclaim_deed": "QUITCLAIM DEED",
    "joint_tenancy_deed": "JOINT TENANCY DEED",
    "correction_deed": "CORRECTION DEED",
    "personal_representative_deed": "PERSONAL REPRESENTATIVE'S DEED",
    "trustee_deed": "TRUSTEE'S DEED",
    "deed_of_trust": "DEED OF TRUST",
    "mortgage": "MORTGAGE",
    "release_of_deed_of_trust": "RELEASE OF DEED OF TRUST",
    "release_of_mortgage": "RELEASE OF MORTGAGE",
    "assignment": "ASSIGNMENT",
    "lease": "LEASE",
    "oil_and_gas_lease": "OIL AND GAS LEASE",
    "easement": "EASEMENT",
    "right_of_way": "RIGHT OF WAY",
    "judgment": "JUDGMENT",
    "lien": "LIEN",
    "lis_pendens": "LIS PENDENS",
    "decree_of_heirship": "DECREE OF HEIRSHIP",
    "probate_order": "PROBATE ORDER",
    "certificate_of_trust": "CERTIFICATE OF TRUST",
    "affidavit": "AFFIDAVIT",
    "patent": "PATENT",
    "notice": "NOTICE",
    "other": "OTHER",
}


def format_instrument_type_upper(value: str | None) -> str:
    """ALL-CAPS label for the markdown deliverable table."""
    return INSTRUMENT_TYPE_LABELS.get(value or "", (value or "OTHER").replace("_", " ").upper())


def format_instrument_type_readable(value: str | None) -> str:
    """Title-case label for the deterministic narrative prose."""
    return (value or "instrument").replace("_", " ").title()


def format_party_list(parties: Iterable[Mapping[str, object]] | None, empty: str = "") -> str:
    """Join party names with semicolons, or return `empty` when none are present."""
    names = [str(p.get("name", "")) for p in (parties or []) if p.get("name")]
    return "; ".join(names) if names else empty


def normalize_page_statuses(
    raw_statuses: Iterable[Mapping[str, object]] | None,
    pages: Iterable[int],
) -> list[PageStatusDict]:
    """Map raw model page statuses to a stable list aligned with `pages`.

    Pages not reported by the model are filled with an "unknown" entry so callers
    can rely on every requested page having a status.
    """
    seen: dict[int, PageStatusDict] = {}
    for entry in raw_statuses or []:
        try:
            page = int(entry.get("page"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        seen[page] = {
            "page": page,
            "status": str(entry.get("status", "unknown")),
            "error": str(entry.get("error", "") or ""),
        }

    return [
        seen.get(p, {"page": p, "status": "unknown", "error": "no status reported by model"})
        for p in pages
    ]


def build_flat_notes(
    instruments: Iterable[Mapping[str, object]] | None,
    page_statuses: Iterable[Mapping[str, object]] | None,
) -> list[NoteDict]:
    """Flatten per-instrument notes + failed-page entries into a single list."""
    flat_notes: list[NoteDict] = []
    for inst in instruments or []:
        inst_notes = inst.get("notes") or []
        if not isinstance(inst_notes, list):
            continue
        for note in inst_notes:
            flat_notes.append({
                "source": "instrument",
                "page": int(inst.get("start_page", 0) or 0),
                "text": str(note),
            })
    for status in page_statuses or []:
        if status.get("status") == "failed":
            flat_notes.append({
                "source": "page",
                "page": int(status.get("page", 0) or 0),
                "text": f"Page {status.get('page')} failed: {status.get('error', 'unknown reason')}",
            })
    return flat_notes
