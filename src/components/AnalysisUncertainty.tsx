/** Uncertainty summary + per-document notes panel. Renders nothing for pre-pipeline rows. */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { COTAnalysis, AnalysisNote, ParsedDocument } from "../types/models";

interface Props {
  analysis: COTAnalysis;
}

export default function AnalysisUncertainty({ analysis }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!analysis.pipeline_version) return null;

  const notes: AnalysisNote[] = analysis.notes ?? [];
  const parsedDocs: ParsedDocument[] = analysis.parsed_documents ?? [];
  const totalInstruments = parsedDocs.reduce(
    (sum, d) => sum + (d.instruments?.length ?? 0),
    0,
  );
  const docsWithNotes = parsedDocs.filter((d) =>
    (d.instruments ?? []).some((i) => (i.notes ?? []).length > 0),
  ).length;
  const failedPages = analysis.failed_pages_count ?? 0;
  const chainNotes = notes.filter((n) => n.source === "chain").length;

  const hasSomethingToShow =
    totalInstruments > 0 || notes.length > 0 || failedPages > 0;
  if (!hasSomethingToShow) return null;

  return (
    <section className="ls-analysis-uncertainty">
      <button
        type="button"
        className="ls-analysis-uncertainty-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          {totalInstruments} instrument{totalInstruments === 1 ? "" : "s"} parsed
          {docsWithNotes > 0 && (
            <>
              {" · "}
              {docsWithNotes} doc{docsWithNotes === 1 ? "" : "s"} with notes
            </>
          )}
          {chainNotes > 0 && (
            <>
              {" · "}
              {chainNotes} chain note{chainNotes === 1 ? "" : "s"}
            </>
          )}
          {failedPages > 0 && (
            <>
              {" · "}
              {failedPages} page{failedPages === 1 ? "" : "s"} failed
            </>
          )}
        </span>
        {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      </button>

      {expanded && (
        <div className="ls-analysis-uncertainty-body">
          {chainNotes > 0 && (
            <div className="ls-analysis-uncertainty-section">
              <h4>Chain-level notes</h4>
              <ul>
                {notes.filter((n) => n.source === "chain").map((n, i) => (
                  <li key={`chain-${i}`}>{n.text}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedDocs.map((doc) => {
            const docNotes = (doc.instruments ?? []).flatMap((inst, idx) =>
              (inst.notes ?? []).map((text) => ({
                text,
                pageRef: inst.start_page,
                key: `${doc.document_id}-${idx}`,
                instrumentType: inst.instrument_type,
              })),
            );
            const failed = (doc.page_statuses ?? []).filter(
              (s) => s.status === "failed",
            );
            if (docNotes.length === 0 && failed.length === 0) return null;
            return (
              <div key={doc.document_id} className="ls-analysis-uncertainty-section">
                <h4>{doc.filename || "Document"}</h4>
                {failed.length > 0 && (
                  <div className="ls-analysis-uncertainty-failed">
                    <strong>Failed pages:</strong>
                    <ul>
                      {failed.map((p) => (
                        <li key={p.page}>
                          Page {p.page} — {p.error || "unknown reason"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {docNotes.length > 0 && (
                  <ul>
                    {docNotes.map((n, i) => (
                      <li key={`${n.key}-${i}`}>
                        <span className="ls-analysis-uncertainty-pageref">
                          p.{n.pageRef} · {n.instrumentType}:
                        </span>{" "}
                        {n.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
