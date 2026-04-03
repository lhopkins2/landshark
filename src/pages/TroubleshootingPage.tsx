import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bug, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, Loader, Copy, Check,
} from "lucide-react";
import { analysesApi } from "../api/analysis";
import { ANALYSIS_STATUSES, PROGRESS_STEPS } from "../utils/constants";
import type { COTAnalysis } from "../types/models";

export default function TroubleshootingPage() {
  const { data: pastAnalyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: () => analysesApi.list(),
    select: (res) => res.data,
  });

  const analyses = pastAnalyses?.results ?? [];

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
          <Bug size={24} style={{ color: "var(--ls-primary)" }} />
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Troubleshooting</h2>
        </div>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Developer debug tools — view full prompts, AI responses, and analysis metadata
        </p>
      </div>

      {analyses.length === 0 ? (
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", textAlign: "center", padding: "var(--ls-space-xl)" }}>
          No analyses found. Run an analysis from the Chain of Title page first.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "var(--ls-space-md)" }}>
          {analyses.map((a) => (
            <AnalysisDebugCard key={a.id} analysis={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnalysisDebugCard({ analysis }: { analysis: COTAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"prompt" | "result" | "error">("prompt");

  const { data: debugData, isLoading } = useQuery({
    queryKey: ["analysis-debug", analysis.id],
    queryFn: () => analysesApi.debug(analysis.id).then((r) => r.data),
    enabled: expanded,
  });

  const duration = analysis.created_at && analysis.updated_at
    ? Math.round((new Date(analysis.updated_at).getTime() - new Date(analysis.created_at).getTime()) / 1000)
    : 0;

  return (
    <div style={{
      border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)",
      backgroundColor: "var(--ls-surface)", overflow: "hidden",
    }}>
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
          padding: "var(--ls-space-md) var(--ls-space-lg)", cursor: "pointer",
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <StatusIcon status={analysis.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {analysis.document_name ?? "Unknown document"}
          </div>
          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", display: "flex", gap: "var(--ls-space-sm)", flexWrap: "wrap" }}>
            <span>{new Date(analysis.created_at).toLocaleString()}</span>
            <span>&middot; {analysis.ai_provider}/{analysis.ai_model || "default"}</span>
            <span>&middot; {analysis.analysis_order}</span>
            <span>&middot; {analysis.output_format}</span>
            {duration > 0 && <span>&middot; {duration}s</span>}
          </div>
        </div>
        <StatusBadge status={analysis.status} />
      </div>

      {/* Expanded debug content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--ls-border)", padding: "var(--ls-space-md) var(--ls-space-lg)" }}>
          {/* Metadata grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)",
            padding: "var(--ls-space-md)", backgroundColor: "var(--ls-bg)", borderRadius: "var(--ls-radius-md)",
          }}>
            <MetaField label="Analysis ID" value={analysis.id} mono />
            <MetaField label="Status" value={ANALYSIS_STATUSES[analysis.status as keyof typeof ANALYSIS_STATUSES] ?? analysis.status} />
            <MetaField label="Progress Step" value={PROGRESS_STEPS[analysis.progress_step as keyof typeof PROGRESS_STEPS]?.label ?? analysis.progress_step} />
            <MetaField label="Provider" value={analysis.ai_provider} />
            <MetaField label="Model" value={analysis.ai_model || "(default)"} />
            <MetaField label="Output Format" value={analysis.output_format?.toUpperCase()} />
            <MetaField label="Duration" value={duration > 0 ? `${duration}s` : "—"} />
            <MetaField label="Created" value={new Date(analysis.created_at).toLocaleString()} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-md)" }}>
            <TabBtn active={activeTab === "prompt"} onClick={() => setActiveTab("prompt")}>Full Prompt</TabBtn>
            <TabBtn active={activeTab === "result"} onClick={() => setActiveTab("result")}>AI Result</TabBtn>
            {analysis.error_message && (
              <TabBtn active={activeTab === "error"} onClick={() => setActiveTab("error")}>Error</TabBtn>
            )}
          </div>

          {/* Tab content */}
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", padding: "var(--ls-space-lg)", justifyContent: "center" }}>
              <Loader size={16} className="spin" />
              <span style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Loading debug data...</span>
            </div>
          ) : (
            <>
              {activeTab === "prompt" && (
                <CodeBlock
                  content={debugData?.prompt_text || "(No prompt saved — this analysis was run before prompt logging was added.)"}
                  label="Full prompt sent to AI"
                />
              )}
              {activeTab === "result" && (
                <CodeBlock
                  content={debugData?.result_text || analysis.result_text || "(No result text)"}
                  label="Raw AI response"
                />
              )}
              {activeTab === "error" && (
                <CodeBlock
                  content={analysis.error_message || "(No error)"}
                  label="Error traceback"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-xs)" }}>
        <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 500 }}>{label}</span>
        <button
          onClick={handleCopy}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
            borderRadius: "var(--ls-radius-sm)", border: "1px solid var(--ls-border)",
            backgroundColor: "var(--ls-bg)", cursor: "pointer", fontSize: "var(--ls-text-xs)",
            color: copied ? "#22c55e" : "var(--ls-text-secondary)",
          }}
        >
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <pre style={{
        padding: "var(--ls-space-md)", backgroundColor: "var(--ls-bg)",
        border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)",
        fontSize: "var(--ls-text-xs)", color: "var(--ls-text)", lineHeight: 1.6,
        whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 600, overflowY: "auto",
        fontFamily: "var(--ls-font-mono)", margin: 0,
      }}>
        {content}
      </pre>
      <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 4, textAlign: "right" }}>
        {content.length.toLocaleString()} chars
      </div>
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: "var(--ls-text-sm)", color: "var(--ls-text)",
        fontFamily: mono ? "var(--ls-font-mono)" : "inherit",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
        border: active ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
        backgroundColor: active ? "rgba(139,105,20,0.08)" : "transparent",
        color: active ? "var(--ls-primary)" : "var(--ls-text-secondary)",
        fontSize: "var(--ls-text-xs)", fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle size={16} style={{ color: "#22c55e", flexShrink: 0 }} />;
  if (status === "failed") return <XCircle size={16} style={{ color: "#ef4444", flexShrink: 0 }} />;
  if (status === "cancelled") return <XCircle size={16} style={{ color: "#9ca3af", flexShrink: 0 }} />;
  if (status === "processing") return <Loader size={16} className="spin" style={{ color: "#3b82f6", flexShrink: 0 }} />;
  return <Clock size={16} style={{ color: "#eab308", flexShrink: 0 }} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: "rgba(34,197,94,0.1)", text: "#22c55e" },
    failed: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
    processing: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6" },
    pending: { bg: "rgba(234,179,8,0.1)", text: "#eab308" },
    cancelled: { bg: "rgba(156,163,175,0.1)", text: "#9ca3af" },
  };
  const c = colors[status] ?? colors.pending;
  const label = ANALYSIS_STATUSES[status as keyof typeof ANALYSIS_STATUSES] ?? status;

  return (
    <span style={{
      padding: "2px 8px", borderRadius: "var(--ls-radius-full)",
      backgroundColor: c.bg, color: c.text, fontSize: "var(--ls-text-xs)", fontWeight: 600,
    }}>
      {label}
    </span>
  );
}
