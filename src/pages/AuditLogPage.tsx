import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search, FileUp, Pencil, Trash2, Download, Cpu } from "lucide-react";
import { auditLogApi, type AuditLogEntry } from "../api/auditLog";
import { formatDistanceToNow } from "date-fns";

const ACTION_CONFIG: Record<string, { label: string; icon: typeof FileUp; color: string }> = {
  upload: { label: "Upload", icon: FileUp, color: "#22c55e" },
  update: { label: "Update", icon: Pencil, color: "#3b82f6" },
  delete: { label: "Delete", icon: Trash2, color: "#ef4444" },
  download: { label: "Download", icon: Download, color: "#8b5cf6" },
  analysis_run: { label: "Analysis", icon: Cpu, color: "#f59e0b" },
};

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", search, actionFilter, page],
    queryFn: () =>
      auditLogApi.list({
        search: search || undefined,
        action: actionFilter || undefined,
        page,
      }),
    select: (res) => res.data,
  });

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
          <ClipboardList size={24} style={{ color: "var(--ls-primary)" }} />
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Audit Log</h2>
        </div>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Track all document and analysis activity
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ls-text-muted)" }} />
          <input
            type="text"
            placeholder="Search by filename or user..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: "100%",
              padding: "8px 12px 8px 32px",
              borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)",
              backgroundColor: "var(--ls-surface)",
              fontSize: "var(--ls-text-sm)",
              outline: "none",
              color: "var(--ls-text)",
            }}
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          style={{
            padding: "8px 12px",
            borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)",
            backgroundColor: "var(--ls-surface)",
            fontSize: "var(--ls-text-sm)",
            outline: "none",
            color: "var(--ls-text)",
          }}
        >
          <option value="">All Actions</option>
          <option value="upload">Upload</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="download">Download</option>
          <option value="analysis_run">Analysis</option>
        </select>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
              <Th>Action</Th>
              <Th>User</Th>
              <Th>Document</Th>
              <Th>Details</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={emptyStyle}>Loading...</td></tr>
            ) : !data?.results?.length ? (
              <tr><td colSpan={5} style={emptyStyle}>No audit log entries found</td></tr>
            ) : (
              data.results.map((entry) => <AuditRow key={entry.id} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (data.next || data.previous) && (
        <div style={{ display: "flex", justifyContent: "center", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-md)" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!data.previous}
            style={paginationBtnStyle(!data.previous)}
          >
            Previous
          </button>
          <span style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", display: "flex", alignItems: "center" }}>
            Page {page}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!data.next}
            style={paginationBtnStyle(!data.next)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: "var(--ls-space-lg)",
  textAlign: "center",
  color: "var(--ls-text-muted)",
  fontSize: "var(--ls-text-sm)",
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: "var(--ls-radius-md)",
    border: "1px solid var(--ls-border)",
    backgroundColor: "var(--ls-surface)",
    fontSize: "var(--ls-text-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    color: "var(--ls-text-secondary)",
  };
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left",
      padding: "var(--ls-space-sm) var(--ls-space-md)",
      fontSize: "var(--ls-text-xs)",
      fontWeight: 600,
      color: "var(--ls-text-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      {children}
    </th>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const config = ACTION_CONFIG[entry.action] || ACTION_CONFIG.upload;
  const Icon = config.icon;

  return (
    <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "var(--ls-text-xs)",
          padding: "2px 8px",
          borderRadius: "var(--ls-radius-sm)",
          backgroundColor: `${config.color}15`,
          color: config.color,
          fontWeight: 500,
        }}>
          <Icon size={12} />
          {config.label}
        </span>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{entry.user_name}</div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>{entry.user_email}</div>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)" }}>
        {entry.document_name || "—"}
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", maxWidth: 300 }}>
        <DetailsSummary details={entry.details} action={entry.action} />
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", whiteSpace: "nowrap" }}>
        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
      </td>
    </tr>
  );
}

function DetailsSummary({ details, action }: { details: Record<string, unknown>; action: string }) {
  if (!details || Object.keys(details).length === 0) return <span>—</span>;

  if (action === "analysis_run") {
    const parts: string[] = [];
    if (details.provider) parts.push(`Provider: ${details.provider}`);
    if (details.model) parts.push(`Model: ${details.model}`);
    if (details.legal_description) parts.push(`Legal desc: ${String(details.legal_description).slice(0, 80)}${String(details.legal_description).length > 80 ? "..." : ""}`);
    if (details.custom_request) parts.push(`Custom: ${String(details.custom_request).slice(0, 80)}${String(details.custom_request).length > 80 ? "..." : ""}`);
    if (details.output_format) parts.push(`Format: ${details.output_format}`);
    return <span style={{ lineHeight: 1.6 }}>{parts.map((p, i) => <span key={i}>{p}<br /></span>)}</span>;
  }

  if (action === "upload" && details.file_size) {
    const size = Number(details.file_size);
    const label = size > 1_000_000 ? `${(size / 1_000_000).toFixed(1)} MB` : `${(size / 1_000).toFixed(1)} KB`;
    return <span>Size: {label}</span>;
  }

  if (action === "update" && details.changed_fields) {
    return <span>Changed: {(details.changed_fields as string[]).join(", ")}</span>;
  }

  return <span>—</span>;
}
