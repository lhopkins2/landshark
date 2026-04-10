import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X, Eye, Download, Clock } from "lucide-react";
import { analysesApi } from "../api/analysis";
import { documentsApi } from "../api/documents";
import DocumentViewer from "./DocumentViewer";
import StatusBadge from "./StatusBadge";
import { formatFileSize } from "../utils/format";
import type { Document, COTAnalysis } from "../types/models";

interface DocumentDetailDrawerProps {
  document: Document;
  onClose: () => void;
}

export default function DocumentDetailDrawer({ document: doc, onClose }: DocumentDetailDrawerProps) {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);
  const previewMode = "document" as const;

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ["analyses", { document: doc.id }],
    queryFn: () => analysesApi.list({ document: doc.id }),
    select: (res) => res.data.results,
  });

  return (
    <>
      <div className="doc-drawer-backdrop" onClick={onClose} />
      <div className={`doc-drawer ${showPreview ? "preview-active" : ""}`}>
        {/* Header */}
        <div className="doc-drawer-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "var(--ls-space-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "var(--ls-text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {doc.original_filename}
              </div>
              <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
                {formatFileSize(doc.file_size)}
                {doc.mime_type && <> &middot; {doc.mime_type.split("/").pop()?.toUpperCase()}</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--ls-space-xs)", flexShrink: 0, marginLeft: showPreview ? "var(--ls-space-md)" : 0 }}>
              {doc.download_url && (
                <button
                  onClick={() => documentsApi.download(doc.download_url!, doc.original_filename)}
                  title="Download"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)", backgroundColor: "transparent",
                    color: "var(--ls-text-muted)", cursor: "pointer",
                  }}
                >
                  <Download size={14} />
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
                  border: "none", backgroundColor: "transparent",
                  color: "var(--ls-text-muted)", cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Hide preview" : "Preview document"}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-accent)",
              backgroundColor: showPreview ? "var(--ls-accent)" : "rgba(212,160,23,0.1)",
              color: showPreview ? "var(--ls-text-on-accent)" : "var(--ls-accent)",
              fontSize: "var(--ls-text-xs)", fontWeight: 600, cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            <Eye size={14} /> {showPreview ? "Hide Preview" : "Preview"}
          </button>
        </div>

        {/* Body — two layouts depending on preview state */}
        {showPreview ? (
          <div className="doc-drawer-preview-layout">
            {/* Sidebar with info + history */}
            <div className="doc-drawer-sidebar">
              <DocumentInfo doc={doc} />
              <AnalysisHistory analyses={analyses} loading={analysesLoading} navigate={navigate} />
            </div>
            {/* Preview panel */}
            <div className="doc-drawer-preview-panel">
              <div className="doc-drawer-preview-header">
                <span style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Preview
                </span>
              </div>
              <div className="doc-drawer-preview-body">
                <DocumentViewer
                  documentId={doc.id}
                  mimeType={doc.mime_type}
                  mode={previewMode}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="doc-drawer-body">
            <DocumentInfo doc={doc} />
            <AnalysisHistory analyses={analyses} loading={analysesLoading} navigate={navigate} />
          </div>
        )}
      </div>
    </>
  );
}

function DocumentInfo({ doc }: { doc: Document }) {
  return (
    <div className="doc-drawer-section">
      <div className="doc-drawer-section-title">Details</div>
      <div className="doc-drawer-meta">
        {doc.tract_number && (
          <div className="doc-drawer-meta-row">
            <span className="doc-drawer-meta-key">Tract</span>
            <span className="doc-drawer-meta-value">{doc.tract_number}</span>
          </div>
        )}
        {doc.last_record_holder && (
          <div className="doc-drawer-meta-row">
            <span className="doc-drawer-meta-key">Record Holder</span>
            <span className="doc-drawer-meta-value">{doc.last_record_holder}</span>
          </div>
        )}
        {doc.folder_name && (
          <div className="doc-drawer-meta-row">
            <span className="doc-drawer-meta-key">Folder</span>
            <span className="doc-drawer-meta-value">{doc.folder_name}</span>
          </div>
        )}
        {doc.description && (
          <div className="doc-drawer-meta-row">
            <span className="doc-drawer-meta-key">Notes</span>
            <span className="doc-drawer-meta-value">{doc.description}</span>
          </div>
        )}
        <div className="doc-drawer-meta-row">
          <span className="doc-drawer-meta-key">Uploaded</span>
          <span className="doc-drawer-meta-value">
            {new Date(doc.created_at).toLocaleDateString()}
            {doc.uploaded_by_name && <> by {doc.uploaded_by_name}</>}
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalysisHistory({
  analyses,
  loading,
  navigate,
}: {
  analyses?: COTAnalysis[];
  loading: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <div className="doc-drawer-section">
      <div className="doc-drawer-section-title">
        Analysis History {analyses && analyses.length > 0 && `(${analyses.length})`}
      </div>
      {loading ? (
        <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-sm) 0" }}>
          Loading...
        </div>
      ) : !analyses || analyses.length === 0 ? (
        <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-sm) 0" }}>
          No analyses yet. Run one from Chain of Title.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "var(--ls-space-xs)" }}>
          {analyses.map((a) => (
            <div
              key={a.id}
              className="doc-drawer-analysis-item"
              onClick={() => {
                if (a.status === "completed") navigate(`/review/${a.id}`);
              }}
            >
              <Clock size={14} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.generated_document_name || new Date(a.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                  {new Date(a.created_at).toLocaleString()}
                  {a.ai_provider && <> &middot; {a.ai_provider}</>}
                  {a.output_format && <> &middot; {a.output_format.toUpperCase()}</>}
                  {(a.status === "completed" || a.status === "failed") && a.updated_at && (() => {
                    const secs = Math.round((new Date(a.updated_at).getTime() - new Date(a.created_at).getTime()) / 1000);
                    if (secs <= 0) return null;
                    const m = Math.floor(secs / 60), s = secs % 60;
                    return <> &middot; {m > 0 ? `${m}m ${s}s` : `${s}s`}</>;
                  })()}
                </div>
              </div>
              {a.status === "completed" && a.generated_document_url && a.generated_document_name && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    documentsApi.download(a.generated_document_url!, a.generated_document_name!);
                  }}
                  title="Download result"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)", backgroundColor: "transparent",
                    color: "var(--ls-text-secondary)", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <Download size={14} />
                </button>
              )}
              {a.status === "completed" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/review/${a.id}`);
                  }}
                  title="Review"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)", backgroundColor: "transparent",
                    color: "var(--ls-primary)", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <Eye size={14} />
                </button>
              )}
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
