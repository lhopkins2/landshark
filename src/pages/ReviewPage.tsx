import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText, Type, Loader, Search, X, Edit3, Upload } from "lucide-react";
import DOMPurify from "dompurify";
import { analysesApi } from "../api/analysis";
import { documentsApi } from "../api/documents";
import AnalysisUncertainty from "../components/AnalysisUncertainty";
import DocumentViewer from "../components/DocumentViewer";
import ReanalyzeModal from "../components/ReanalyzeModal";
import ExportModal from "../components/ExportModal";
import { buildTableFromParsedDocuments } from "../utils/markdownTable";
import { extractSearchTerms } from "../utils/textHighlight";

export default function ReviewPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();

  const [leftMode, setLeftMode] = useState<"document" | "text">("text");
  const [rightMode, setRightMode] = useState<"document" | "text">("document");
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showReanalyze, setShowReanalyze] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ["analysis", analysisId],
    queryFn: () => analysesApi.get(analysisId!).then((r) => r.data),
    enabled: !!analysisId,
  });

  const { data: sourceDoc } = useQuery({
    queryKey: ["document", analysis?.document],
    queryFn: () => documentsApi.get(analysis!.document!).then((r) => r.data),
    enabled: !!analysis?.document,
  });

  const { data: generatedDoc } = useQuery({
    queryKey: ["document", analysis?.generated_document],
    queryFn: () => documentsApi.get(analysis!.generated_document!).then((r) => r.data),
    enabled: !!analysis?.generated_document,
  });

  const parsed = useMemo(() => {
    if (!analysis) return null;
    // parsed_documents are present for pipeline-produced rows; legacy rows fall back to null.
    if ((analysis.parsed_documents?.length ?? 0) > 0) {
      return buildTableFromParsedDocuments(analysis);
    }
    return null;
  }, [analysis]);

  const highlightTerms = useMemo(() => {
    if (selectedRowIdx === null || !parsed) return [];
    return extractSearchTerms(parsed.rows[selectedRowIdx]);
  }, [selectedRowIdx, parsed]);

  // Index of a page-number column in the parsed table, or -1 if not present.
  // Matches "Doc Pg", "Page(s)", "Page", "Pg", etc.
  const docPgColIdx = useMemo(() => {
    if (!parsed) return -1;
    return parsed.headers.findIndex((h) => {
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      return norm === "docpg" || norm === "page" || norm === "pages" || norm === "pg";
    });
  }, [parsed]);

  const matchingIndices = useMemo(() => {
    if (!parsed || !searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    const indices = new Set<number>();
    parsed.rows.forEach((row, idx) => {
      if (row.some((cell) => cell.toLowerCase().includes(term))) {
        indices.add(idx);
      }
    });
    return indices;
  }, [parsed, searchTerm]);

  function highlightCell(text: string): string {
    if (!searchTerm.trim()) return "";
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    const html = text.replace(re, '<mark class="ls-highlight">$1</mark>');
    return DOMPurify.sanitize(html);
  }

  function handleRowClick(idx: number) {
    if (selectedRowIdx === idx) {
      setSelectedRowIdx(null);
      setSelectedPage(null);
      return;
    }
    setSelectedRowIdx(idx);

    if (docPgColIdx >= 0 && parsed) {
      // Strip markdown bold and take the first integer — handles ranges like "91-96".
      const rawVal = (parsed.rows[idx][docPgColIdx] ?? "").replace(/\*+/g, "").trim();
      const pageNum = parseInt(rawVal, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        setSelectedPage(pageNum);
        setRightMode("document");
        return;
      }
    }

    // No page column: fall back to text mode with term highlighting.
    setSelectedPage(null);
    setRightMode("text");
  }

  if (analysisLoading) {
    return (
      <div className="review-loading">
        <Loader size={24} className="spin" />
        <span>Loading analysis...</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="review-loading">
        <span>Analysis not found.</span>
        <button onClick={() => navigate("/chain-of-title")} className="review-back-link">
          Back to Chain of Title
        </button>
      </div>
    );
  }

  return (
    <div className="review-container">
      <div className="review-header">
        <button onClick={() => navigate("/chain-of-title")} className="review-back-link">
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="review-header-meta">
          <span className="review-header-title">
            {analysis.document_name ?? "Analysis Review"}
            {analysis.revision_kind === "revision" && (
              <span className="ls-review-revision-badge" title="This is a revision">
                revision
              </span>
            )}
          </span>
          <span className="review-header-detail">
            {new Date(analysis.created_at).toLocaleDateString()}
            {analysis.ai_provider && <> &middot; {analysis.ai_provider}</>}
            {analysis.form_template_name && <> &middot; {analysis.form_template_name}</>}
          </span>
          <div className="ls-review-revision-row">
            {analysis.parent_analysis && (
              <button
                type="button"
                className="ls-review-revision-chip"
                onClick={() => navigate(`/review/${analysis.parent_analysis}`)}
                title="View the previous version"
              >
                <ArrowLeft size={12} /> Previous version
              </button>
            )}
            {(analysis.revisions?.length ?? 0) > 0 && (
              <details className="ls-review-revisions-dropdown">
                <summary className="ls-review-revision-chip">
                  {analysis.revisions.length} revision
                  {analysis.revisions.length === 1 ? "" : "s"}{" "}
                  <ArrowRight size={12} />
                </summary>
                <ul>
                  {analysis.revisions.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/review/${r.id}`)}
                      >
                        <span className="ls-review-revision-date">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                        <span className="ls-review-revision-instr">
                          {r.revision_instructions
                            ? r.revision_instructions.length > 80
                              ? r.revision_instructions.slice(0, 77) + "..."
                              : r.revision_instructions
                            : "(no instructions)"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
        <div className="ls-review-header-actions">
          {analysis.result_text && (
            <button
              type="button"
              className="ls-review-strip-btn"
              onClick={() => setShowExport(true)}
              title="Export this analyzed COT — rename, swap PDF/DOCX, optionally drop Doc Pg column"
            >
              <Upload size={14} /> Export
            </button>
          )}
          {analysis.pipeline_version && (analysis.parsed_documents?.length ?? 0) > 0 && (
            <button
              type="button"
              className="ls-review-reanalyze-btn"
              onClick={() => setShowReanalyze(true)}
            >
              <Edit3 size={14} /> Re-analyze with changes
            </button>
          )}
        </div>
      </div>

      {showReanalyze && (
        <ReanalyzeModal
          analysis={analysis}
          onClose={() => setShowReanalyze(false)}
          onSubmitted={(newId) => {
            setShowReanalyze(false);
            navigate(`/review/${newId}`);
          }}
        />
      )}

      {showExport && (
        <ExportModal
          analysisId={analysis.id}
          defaultBaseName={
            (analysis.generated_document_name || analysis.document_name || "analysis").replace(/\.(pdf|docx)$/i, "")
          }
          sourceFormat={analysis.output_format === "docx" ? "docx" : "pdf"}
          onClose={() => setShowExport(false)}
        />
      )}

      <AnalysisUncertainty analysis={analysis} />

      <div className="review-panels">
        <div className="review-panel">
          <div className="review-panel-header">
            <span className="review-panel-label">Processed Output</span>
            <div className="review-panel-toggles">
              <button
                className={`review-toggle ${leftMode === "text" ? "active" : ""}`}
                onClick={() => setLeftMode("text")}
              >
                <Type size={14} /> Table
              </button>
              {analysis.generated_document && (
                <button
                  className={`review-toggle ${leftMode === "document" ? "active" : ""}`}
                  onClick={() => setLeftMode("document")}
                >
                  <FileText size={14} /> Document
                </button>
              )}
            </div>
          </div>
          {leftMode === "text" && parsed && parsed.headers.length > 0 && (
            <div className="review-search-bar">
              <Search size={14} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search results..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="review-search-input"
              />
              {matchingIndices && (
                <span className="review-search-count">
                  {matchingIndices.size} of {parsed.rows.length}
                </span>
              )}
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="review-search-clear">
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div className="review-panel-body">
            {leftMode === "text" && parsed ? (
              <div className="review-table-wrapper">
                {Object.keys(parsed.headerFields).length > 0 && (
                  <div className="review-header-fields">
                    {Object.entries(parsed.headerFields).map(([key, value]) => (
                      <div key={key} className="review-header-field">
                        <span className="review-field-key">{key}:</span>
                        <span className="review-field-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {parsed.headers.length > 0 && (
                  <table className="review-table">
                    <thead>
                      <tr>
                        {parsed.headers.map((h, i) => (
                          <th key={i} className={i === docPgColIdx ? "col-pg" : undefined}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.map((row, idx) => {
                        const isMatch = !matchingIndices || matchingIndices.has(idx);
                        const isDimmed = matchingIndices && !isMatch;
                        return (
                          <tr
                            key={idx}
                            className={`${selectedRowIdx === idx ? "selected" : ""} ${isDimmed ? "search-dimmed" : ""}`}
                            onClick={() => handleRowClick(idx)}
                          >
                            {row.map((cell, ci) => {
                              // highlightCell sanitizes via DOMPurify before injecting.
                              if (isMatch && searchTerm.trim()) {
                                const sanitizedHtml = highlightCell(cell);
                                return (
                                  <td
                                    key={ci}
                                    className={ci === docPgColIdx ? "col-pg" : undefined}
                                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                                  />
                                );
                              }
                              return (
                                <td key={ci} className={ci === docPgColIdx ? "col-pg" : undefined}>{cell}</td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {parsed.headers.length === 0 && (
                  <pre className="review-raw-text">{analysis.result_text}</pre>
                )}
              </div>
            ) : leftMode === "document" && analysis.generated_document && generatedDoc ? (
              <DocumentViewer
                documentId={analysis.generated_document}
                mimeType={generatedDoc.mime_type}
                mode="document"
              />
            ) : (
              <pre className="review-raw-text">{analysis.result_text || "No result text."}</pre>
            )}
          </div>
        </div>

        <div className="review-panel">
          <div className="review-panel-header">
            <span className="review-panel-label">Source Document</span>
            <div className="review-panel-toggles">
              {analysis.document && sourceDoc && (
                <button
                  className={`review-toggle ${rightMode === "document" ? "active" : ""}`}
                  onClick={() => setRightMode("document")}
                >
                  <FileText size={14} /> Document
                </button>
              )}
              <button
                className={`review-toggle ${rightMode === "text" ? "active" : ""}`}
                onClick={() => setRightMode("text")}
              >
                <Type size={14} /> Text
              </button>
            </div>
          </div>
          <div className="review-panel-body">
            {analysis.document && sourceDoc ? (
              <DocumentViewer
                documentId={analysis.document}
                mimeType={sourceDoc.mime_type}
                mode={rightMode}
                highlightTerms={rightMode === "text" ? highlightTerms : undefined}
                pageNumber={rightMode === "document" && selectedPage ? selectedPage : undefined}
              />
            ) : (
              <div className="review-viewer-error">No source document available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
