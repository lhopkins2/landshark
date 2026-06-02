/** Lists every analysis run against one document. Reached via "Review" in Documents. */
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, FileSearch, Download, Loader, AlertCircle } from "lucide-react";
import { analysesApi } from "../api/analysis";
import { documentsApi } from "../api/documents";
import StatusBadge from "../components/StatusBadge";
import type { COTAnalysis } from "../types/models";

export default function DocumentAnalysesPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  const { data: doc, isLoading: docLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => documentsApi.get(documentId!).then((r) => r.data),
    enabled: !!documentId,
  });

  // If the user opened the history page for a generated/analyzed doc, redirect
  // to the source doc's history — the analyses list "belongs" to the source.
  // Otherwise the page is empty ("No analyses yet") because generated docs are
  // outputs, not inputs, of the pipeline.
  useEffect(() => {
    if (doc?.source_document_id && doc.source_document_id !== documentId) {
      navigate(`/documents/${doc.source_document_id}/analyses`, { replace: true });
    }
  }, [doc?.source_document_id, documentId, navigate]);

  const shouldQueryAnalyses = !!documentId && !doc?.source_document_id;

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ["analyses", { document: documentId }],
    queryFn: () => analysesApi.list({ document: documentId! }),
    select: (res) => res.data.results,
    enabled: shouldQueryAnalyses,
  });

  const sorted = useMemo(
    () =>
      [...(analyses ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [analyses],
  );

  const latestCompletedId = useMemo(
    () => sorted.find((a) => a.status === "completed")?.id ?? null,
    [sorted],
  );

  // Keep the loading state up while the redirect-to-source effect is in flight,
  // so the empty state doesn't flash for one frame on an analyzed-output doc.
  const redirecting = !!doc?.source_document_id && doc.source_document_id !== documentId;

  if (docLoading || analysesLoading || redirecting) {
    return (
      <div className="ls-doc-review-loading">
        <Loader size={20} className="spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="ls-doc-review-page">
      <header className="ls-doc-review-header">
        <button
          type="button"
          onClick={() => navigate("/documents")}
          className="ls-doc-review-back"
        >
          <ArrowLeft size={14} /> Back to documents
        </button>
        <h1 className="ls-doc-review-title">
          {doc?.original_filename ?? "Document"}
        </h1>
        <p className="ls-doc-review-subtitle">
          {sorted.length === 0 ? "No analyses yet" : `${sorted.length} analyses`}
        </p>
      </header>

      {sorted.length === 0 ? (
        <div className="ls-doc-review-empty">
          <AlertCircle size={28} />
          <h2>No analyses for this document yet</h2>
          <p>
            Start an analysis from the Chain of Title page to get a structured
            instrument breakdown, narrative, and downloadable report.
          </p>
          <button
            type="button"
            className="ls-doc-review-empty-cta"
            onClick={() => navigate("/chain-of-title")}
          >
            Go to Chain of Title
          </button>
        </div>
      ) : (
        <ul className="ls-doc-review-list">
          {sorted.map((a) => (
            <AnalysisCard
              key={a.id}
              analysis={a}
              isLatestCompleted={a.id === latestCompletedId}
              onOpen={() => navigate(`/review/${a.id}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalysisCard({
  analysis: a,
  isLatestCompleted,
  onOpen,
}: {
  analysis: COTAnalysis;
  isLatestCompleted: boolean;
  onOpen: () => void;
}) {
  const isCompleted = a.status === "completed";
  const isRevision = a.revision_kind === "revision";
  const instrumentCount =
    a.parsed_documents?.reduce((sum, pd) => sum + (pd.instruments?.length ?? 0), 0) ?? 0;

  return (
    <li className="ls-doc-review-card" onClick={isCompleted ? onOpen : undefined}>
      <div className="ls-doc-review-card-left">
        <Clock size={16} aria-hidden="true" />
      </div>
      <div className="ls-doc-review-card-body">
        <div className="ls-doc-review-card-row1">
          <span className="ls-doc-review-card-title">
            {a.generated_document_name ||
              new Date(a.created_at).toLocaleString()}
          </span>
          {isLatestCompleted && (
            <span className="ls-doc-review-badge latest">Latest</span>
          )}
          {isRevision && (
            <span className="ls-doc-review-badge revision">Revision</span>
          )}
          {a.document_deleted && (
            <span className="ls-doc-review-badge deleted">Source Deleted</span>
          )}
          <StatusBadge status={a.status} />
        </div>
        <div className="ls-doc-review-card-row2">
          {new Date(a.created_at).toLocaleString()}
          {a.ai_provider && <> · {a.ai_provider}</>}
          {a.ai_model && <> · {a.ai_model}</>}
          {a.pipeline_version && <> · pipeline {a.pipeline_version}</>}
          {instrumentCount > 0 && <> · {instrumentCount} instruments</>}
          {a.failed_pages_count > 0 && (
            <> · {a.failed_pages_count} failed page{a.failed_pages_count === 1 ? "" : "s"}</>
          )}
        </div>
        {a.revision_instructions && (
          <div className="ls-doc-review-card-row3">
            <em>Revision note:</em> {a.revision_instructions.length > 140
              ? a.revision_instructions.slice(0, 137) + "..."
              : a.revision_instructions}
          </div>
        )}
        {a.error_message && (
          <div className="ls-doc-review-card-error">{a.error_message}</div>
        )}
      </div>
      <div className="ls-doc-review-card-right">
        {isCompleted && a.generated_document_url && a.generated_document_name && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              documentsApi.download(a.generated_document_url!, a.generated_document_name!);
            }}
            title="Download result"
            className="ls-doc-review-icon-btn"
          >
            <Download size={14} />
          </button>
        )}
        {isCompleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="ls-doc-review-open-btn"
          >
            <FileSearch size={14} /> Open
          </button>
        )}
      </div>
    </li>
  );
}
