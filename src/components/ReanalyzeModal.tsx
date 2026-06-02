/**
 * Re-analyze modal — combines three optional modifiers in one submission:
 *   - Cell-level instrument edits (no AI)
 *   - Targeted page re-scan via "12-15, 22" range syntax (Stage 1 AI)
 *   - Free-form instructions fed into Stage 2b
 *
 * POSTs to /api/analysis/{id}/reanalyze/, creating a child COTAnalysis linked to the parent.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Loader } from "lucide-react";
import { analysesApi } from "../api/analysis";
import { parsePageRange } from "../utils/pageRange";
import type {
  COTAnalysis,
  ParsedInstrument,
  Party,
  ReanalyzeInstrumentEdit,
  ReanalyzePayload,
} from "../types/models";

interface Props {
  analysis: COTAnalysis;
  onClose: () => void;
  onSubmitted: (newAnalysisId: string) => void;
}

type EditMap = Record<number, ParsedInstrument>;

const SIMPLE_TEXT_COLUMNS: ReadonlyArray<keyof ParsedInstrument> = [
  "instrument_type",
  "instrument_date",
  "recording_date",
];

function partiesAsString(parties: Party[]): string {
  return (parties ?? []).map((p) => p.name).filter(Boolean).join("; ");
}

function stringToParties(value: string): Party[] {
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export default function ReanalyzeModal({ analysis, onClose, onSubmitted }: Props) {
  const parsedDoc = analysis.parsed_documents?.[0];
  const instruments = useMemo(() => parsedDoc?.instruments ?? [], [parsedDoc]);
  const totalPages = parsedDoc?.total_pages ?? 0;

  const [edits, setEdits] = useState<EditMap>({});
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [pageRangeError, setPageRangeError] = useState("");
  const [instructions, setInstructions] = useState("");

  const reanalyzeMutation = useMutation({
    mutationFn: (payload: ReanalyzePayload) =>
      analysesApi.reanalyze(analysis.id, payload).then((r) => r.data),
    onSuccess: (newAnalysis) => {
      onSubmitted(newAnalysis.id);
    },
  });

  function effectiveInstrument(idx: number): ParsedInstrument {
    return edits[idx] ?? instruments[idx];
  }

  function updateField<K extends keyof ParsedInstrument>(
    idx: number,
    key: K,
    value: ParsedInstrument[K],
  ) {
    setEdits((prev) => ({
      ...prev,
      [idx]: { ...effectiveInstrument(idx), [key]: value },
    }));
  }

  function clearEdit(idx: number) {
    setEdits((prev) => {
      const { [idx]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }

  function validateAndBuildPayload(): ReanalyzePayload | null {
    setPageRangeError("");
    let pages: number[] = [];
    if (pageRangeInput.trim()) {
      try {
        pages = parsePageRange(pageRangeInput, totalPages || 9999);
      } catch (err) {
        setPageRangeError(err instanceof Error ? err.message : "Invalid page range");
        return null;
      }
    }
    const instrument_edits: ReanalyzeInstrumentEdit[] = Object.entries(edits).map(
      ([idx, inst]) => ({ index: Number(idx), instrument: inst }),
    );
    return {
      instrument_edits,
      pages_to_rescan: pages,
      user_instructions: instructions.trim(),
    };
  }

  function handleSubmit() {
    const payload = validateAndBuildPayload();
    if (!payload) return;
    reanalyzeMutation.mutate(payload);
  }

  const editCount = Object.keys(edits).length;
  const rescanCount = (() => {
    if (!pageRangeInput.trim()) return 0;
    try {
      return parsePageRange(pageRangeInput, totalPages || 9999).length;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="ls-reanalyze-backdrop" role="dialog" aria-modal="true" aria-label="Re-analyze with changes">
      <div className="ls-reanalyze-modal">
        <header className="ls-reanalyze-header">
          <div>
            <h2 className="ls-reanalyze-title">Re-analyze with changes</h2>
            <p className="ls-reanalyze-subtitle">
              {analysis.document_name ?? "Analysis"}
            </p>
          </div>
          <button
            type="button"
            className="ls-reanalyze-close"
            onClick={onClose}
            aria-label="Close"
            disabled={reanalyzeMutation.isPending}
          >
            <X size={18} />
          </button>
        </header>

        <div className="ls-reanalyze-body">
          <section className="ls-reanalyze-section">
            <h3>Edit instruments</h3>
            <p className="ls-reanalyze-hint">
              Click any field to fix it. Cell edits don't cost anything — they
              skip the AI.
            </p>
            <div className="ls-reanalyze-table-wrap">
              <table className="ls-reanalyze-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Instrument date</th>
                    <th>Recording date</th>
                    <th>Grantors</th>
                    <th>Grantees</th>
                    <th>Legal/Comments</th>
                    <th>Pg</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((_, idx) => {
                    const inst = effectiveInstrument(idx);
                    const edited = idx in edits;
                    return (
                      <tr key={idx} className={edited ? "edited" : undefined}>
                        <td className="ls-reanalyze-cell-idx">{idx + 1}</td>
                        {SIMPLE_TEXT_COLUMNS.map((key) => (
                          <td key={key}>
                            <input
                              className="ls-reanalyze-cell-input"
                              value={(inst[key] ?? "") as string}
                              onChange={(e) =>
                                updateField(idx, key, e.target.value as never)
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            className="ls-reanalyze-cell-input"
                            value={partiesAsString(inst.grantors)}
                            onChange={(e) =>
                              updateField(idx, "grantors", stringToParties(e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="ls-reanalyze-cell-input"
                            value={partiesAsString(inst.grantees)}
                            onChange={(e) =>
                              updateField(idx, "grantees", stringToParties(e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <textarea
                            className="ls-reanalyze-cell-input ls-reanalyze-cell-textarea"
                            value={inst.comments ?? ""}
                            onChange={(e) => updateField(idx, "comments", e.target.value)}
                            rows={2}
                          />
                        </td>
                        <td className="ls-reanalyze-cell-pg">{inst.start_page || ""}</td>
                        <td>
                          {edited && (
                            <button
                              type="button"
                              className="ls-reanalyze-revert"
                              onClick={() => clearEdit(idx)}
                              title="Revert this row to its original values"
                            >
                              revert
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ls-reanalyze-section">
            <h3>Re-scan specific pages (optional)</h3>
            <p className="ls-reanalyze-hint">
              Re-read these pages with the vision AI — useful when the model
              missed something. Format: <code>12-15, 22</code>. Source PDF has{" "}
              {totalPages || "?"} page{totalPages === 1 ? "" : "s"}.
              Costs roughly $0.01 per page on Gemini Flash.
            </p>
            <input
              className="ls-reanalyze-input"
              type="text"
              placeholder="e.g. 12-15, 22"
              value={pageRangeInput}
              onChange={(e) => setPageRangeInput(e.target.value)}
            />
            {pageRangeError && (
              <p className="ls-reanalyze-error">{pageRangeError}</p>
            )}
          </section>

          <section className="ls-reanalyze-section">
            <h3>Additional instructions (optional)</h3>
            <p className="ls-reanalyze-hint">
              Free-form guidance for the narrative. e.g. "The 1973 gap is
              actually an intervening probate" or "Treat instrument #4 as a
              correction deed."
            </p>
            <textarea
              className="ls-reanalyze-input ls-reanalyze-textarea"
              placeholder="Anything else the AI should know about this chain..."
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </section>

          {reanalyzeMutation.isError && (
            <p className="ls-reanalyze-error">
              {(reanalyzeMutation.error as Error)?.message || "Re-analyze failed"}
            </p>
          )}
        </div>

        <footer className="ls-reanalyze-footer">
          <span className="ls-reanalyze-summary">
            {editCount > 0 && <>{editCount} edit{editCount === 1 ? "" : "s"} · </>}
            {rescanCount > 0 && <>{rescanCount} page{rescanCount === 1 ? "" : "s"} to re-scan · </>}
            {instructions.trim() && <>+ instructions</>}
            {editCount === 0 && rescanCount === 0 && !instructions.trim() && (
              <em>No changes yet</em>
            )}
          </span>
          <div className="ls-reanalyze-actions">
            <button
              type="button"
              className="ls-reanalyze-cancel"
              onClick={onClose}
              disabled={reanalyzeMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ls-reanalyze-submit"
              onClick={handleSubmit}
              disabled={
                reanalyzeMutation.isPending ||
                (editCount === 0 && rescanCount === 0 && !instructions.trim())
              }
            >
              {reanalyzeMutation.isPending ? (
                <>
                  <Loader size={14} className="spin" /> Re-analyzing...
                </>
              ) : (
                "Re-analyze"
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
