import type { COTAnalysis, ParsedInstrument, Party } from "../types/models";

interface ParsedResultText {
  headerFields: Record<string, string>;
  headers: string[];
  rows: string[][];
}

const INSTRUMENT_TYPE_LABELS: Record<string, string> = {
  warranty_deed: "WARRANTY DEED",
  quitclaim_deed: "QUITCLAIM DEED",
  joint_tenancy_deed: "JOINT TENANCY DEED",
  correction_deed: "CORRECTION DEED",
  personal_representative_deed: "PERSONAL REPRESENTATIVE'S DEED",
  trustee_deed: "TRUSTEE'S DEED",
  deed_of_trust: "DEED OF TRUST",
  mortgage: "MORTGAGE",
  release_of_deed_of_trust: "RELEASE OF DEED OF TRUST",
  release_of_mortgage: "RELEASE OF MORTGAGE",
  assignment: "ASSIGNMENT",
  lease: "LEASE",
  oil_and_gas_lease: "OIL AND GAS LEASE",
  easement: "EASEMENT",
  right_of_way: "RIGHT OF WAY",
  judgment: "JUDGMENT",
  lien: "LIEN",
  lis_pendens: "LIS PENDENS",
  decree_of_heirship: "DECREE OF HEIRSHIP",
  probate_order: "PROBATE ORDER",
  certificate_of_trust: "CERTIFICATE OF TRUST",
  affidavit: "AFFIDAVIT",
  patent: "PATENT",
  notice: "NOTICE",
  other: "OTHER",
};

function formatInstrumentType(type: string): string {
  return INSTRUMENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toUpperCase();
}

function formatPartyList(parties: Party[]): string {
  return (parties ?? []).map((p) => p.name).filter(Boolean).join("; ");
}

function compareInstrumentsByDate(a: ParsedInstrument, b: ParsedInstrument): number {
  const dateA = a.recording_date || a.instrument_date || "";
  const dateB = b.recording_date || b.instrument_date || "";
  return dateA.localeCompare(dateB);
}

/** Convert the pipeline's structured parsed_documents output into ReviewPage's table shape. */
export function buildTableFromParsedDocuments(analysis: COTAnalysis): ParsedResultText {
  const headers = [
    "Document Caption",
    "Reception #",
    "Date Recorded",
    "Grantor",
    "Grantee",
    "Legal/Comments",
    "Doc Pg",
  ];

  const instruments: ParsedInstrument[] = (analysis.parsed_documents ?? []).flatMap(
    (d) => d.instruments ?? [],
  );

  const sorted = [...instruments].sort((a, b) => {
    const cmp = compareInstrumentsByDate(a, b);
    return analysis.analysis_order === "reverse_chronological" ? -cmp : cmp;
  });

  const rows: string[][] = sorted.map((inst) => [
    formatInstrumentType(inst.instrument_type),
    inst.recording_info?.reception_number ?? "",
    inst.recording_date || inst.instrument_date || "",
    formatPartyList(inst.grantors),
    formatPartyList(inst.grantees),
    inst.comments ?? "",
    String(inst.start_page ?? ""),
  ]);

  const first = sorted[0];
  const headerFields: Record<string, string> = {};
  if (first?.legal_description) {
    headerFields.DESCRIPTION = first.legal_description;
  }
  if (sorted.length > 0) {
    const beginDate = sorted[0].recording_date || sorted[0].instrument_date;
    const endDate =
      sorted[sorted.length - 1].recording_date ||
      sorted[sorted.length - 1].instrument_date;
    if (beginDate) headerFields["BEGIN SEARCH DATE"] = beginDate;
    if (endDate) headerFields["END SEARCH DATE"] = endDate;
  }

  return { headerFields, headers, rows };
}
