/**
 * Enterprise → Templates: the COT template catalog (dev admins only).
 *
 * A template is a DOCX assigned to any number of orgs. Dev admins upload
 * templates here, assign each to one or more orgs, and filter the list by org.
 * Org users then pick from their org's assigned templates at export.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, FileText, Download, Building2, ChevronDown } from "lucide-react";
import { isAxiosError } from "axios";
import { enterpriseApi, type EnterpriseTemplate } from "../../api/enterprise";
import { formTemplatesApi } from "../../api/analysis";
import { formatFileSize } from "../../utils/format";
import { formatDistanceToNow } from "date-fns";

export default function EnterpriseTemplatesPage() {
  const queryClient = useQueryClient();
  const [filterOrg, setFilterOrg] = useState<string>("");
  const [assigning, setAssigning] = useState<EnterpriseTemplate | null>(null);
  const [showFields, setShowFields] = useState(false);

  const { data: orgs = [] } = useQuery({
    queryKey: ["enterprise-orgs-all"],
    queryFn: () => enterpriseApi.listOrgs().then((r) => r.data.results),
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["enterprise-templates", filterOrg],
    queryFn: () => enterpriseApi.listTemplates(filterOrg || undefined).then((r) => r.data),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--ls-space-lg)", gap: "var(--ls-space-md)", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>COT Templates</h2>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
            Upload templates, then assign each to any number of organizations.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
          <Building2 size={14} style={{ color: "var(--ls-text-muted)" }} />
          <div style={{ position: "relative" }}>
            <select
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              style={{
                appearance: "none", padding: "6px 30px 6px 10px", borderRadius: "var(--ls-radius-md)",
                border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-surface)",
                color: "var(--ls-text)", fontSize: "var(--ls-text-sm)", cursor: "pointer",
              }}
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ls-text-muted)" }} />
          </div>
        </div>
      </div>

      <UploadBar
        onUploaded={() => queryClient.invalidateQueries({ queryKey: ["enterprise-templates"] })}
        showFields={showFields}
        toggleFields={() => setShowFields((s) => !s)}
      />

      <div style={{ backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)", overflow: "hidden", marginTop: "var(--ls-space-lg)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
              <Th>Template</Th>
              <Th>Assigned to</Th>
              <Th>Size</Th>
              <Th>Added</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={cellMuted}>Loading…</td></tr>
            ) : !templates.length ? (
              <tr><td colSpan={5} style={cellMuted}>{filterOrg ? "No templates assigned to this org" : "No templates yet — upload one above"}</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--ls-border)" }}>
                  <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FileText size={14} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>{t.original_filename}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
                    <button
                      type="button"
                      onClick={() => setAssigning(t)}
                      style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                      title="Click to assign organizations"
                    >
                      {t.organizations.length === 0 ? (
                        <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontStyle: "italic" }}>Unassigned — click to assign</span>
                      ) : (
                        t.organizations.map((o) => (
                          <span key={o.id} style={{ fontSize: "var(--ls-text-xs)", padding: "2px 8px", borderRadius: "var(--ls-radius-sm)", backgroundColor: "rgba(139,105,20,0.1)", color: "var(--ls-primary)", fontWeight: 500 }}>{o.name}</span>
                        ))
                      )}
                    </button>
                  </td>
                  <td style={cellMuted2}>{formatFileSize(t.file_size)}</td>
                  <td style={cellMuted2}>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</td>
                  <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => setAssigning(t)}
                      style={{ padding: "4px 10px", marginRight: 6, borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", color: "var(--ls-text-secondary)", fontSize: "var(--ls-text-xs)", fontWeight: 600, cursor: "pointer" }}
                    >
                      Assign
                    </button>
                    <DeleteButton templateId={t.id} name={t.name} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {assigning && (
        <AssignModal
          template={assigning}
          orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

const cellMuted: React.CSSProperties = { padding: "var(--ls-space-lg)", textAlign: "center", color: "var(--ls-text-muted)", fontSize: "var(--ls-text-sm)" };
const cellMuted2: React.CSSProperties = { padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" };

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {children}
    </th>
  );
}

function DeleteButton({ templateId, name }: { templateId: string; name: string }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => enterpriseApi.deleteTemplate(templateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enterprise-templates"] }),
  });
  return (
    <button
      type="button"
      onClick={() => { if (window.confirm(`Delete template "${name}"?`)) del.mutate(); }}
      disabled={del.isPending}
      title="Delete template"
      style={{ display: "inline-flex", padding: 6, borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "transparent", color: "#ef4444", cursor: "pointer" }}
    >
      <Trash2 size={14} />
    </button>
  );
}

function UploadBar({ onUploaded, showFields, toggleFields }: { onUploaded: () => void; showFields: boolean; toggleFields: () => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      fd.append("name", name.trim() || file!.name.replace(/\.docx$/i, ""));
      return enterpriseApi.uploadTemplate(fd).then((r) => r.data);
    },
    onSuccess: () => { setName(""); setFile(null); setError(null); onUploaded(); },
    onError: (err: unknown) => {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : null;
      setError(detail ?? "Upload failed.");
    },
  });

  const submit = () => {
    if (!file) { setError("Pick a .docx file first."); return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { setError("Only .docx files are supported."); return; }
    upload.mutate();
  };

  return (
    <div style={{ backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)", padding: "var(--ls-space-md) var(--ls-space-lg)", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept=".docx"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
          style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text)" }}
        />
        <input
          type="text"
          placeholder="Template name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={upload.isPending}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--ls-radius-md)", border: "none", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: upload.isPending ? "wait" : "pointer", opacity: upload.isPending ? 0.7 : 1 }}
        >
          <Upload size={14} /> {upload.isPending ? "Uploading…" : "Upload Template"}
        </button>
        <button
          type="button"
          onClick={() => formTemplatesApi.downloadStarter()}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-xs)", fontWeight: 600, cursor: "pointer", color: "var(--ls-text-secondary)" }}
        >
          <Download size={12} /> Starter
        </button>
      </div>
      {error && <div style={{ fontSize: "var(--ls-text-xs)", color: "#ef4444" }}>{error}</div>}
      <button type="button" onClick={toggleFields} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--ls-text-muted)", fontSize: "var(--ls-text-xs)", cursor: "pointer", textDecoration: "underline" }}>
        {showFields ? "Hide" : "Show"} available template fields
      </button>
      {showFields && (
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontFamily: "var(--ls-font-mono)", lineHeight: 1.7, background: "var(--ls-bg)", padding: "8px 10px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)" }}>
          Header: {"{{ tax_id }}"} {"{{ tract_number }}"} {"{{ record_owner }}"} {"{{ address }}"} {"{{ acres }}"} {"{{ legal_description }}"} {"{{ begin_search_date }}"} {"{{ end_search_date }}"} {"{{ title_agent }}"}<br />
          Subject premises: {"{{ subject_premises }}"}<br />
          Instrument row: {"{%tr for inst in instruments %}"} {"{{ inst.caption }}"} {"{{ inst.book_page }}"} {"{{ inst.reception }}"} {"{{ inst.recording_date }}"} {"{{ inst.grantor }}"} {"{{ inst.grantee }}"} {"{{ inst.comments }}"} {"{%tr endfor %}"}<br />
          Notes: {"{%p for note in notes %}"} {"{{ note.text }}"} {"{%p endfor %}"}<br />
          <span style={{ fontFamily: "inherit" }}>(Or upload a plain form with labels like TAX ID / GRANTOR / GRANTEE — we inject these for you.)</span>
        </div>
      )}
    </div>
  );
}

function AssignModal({ template, orgs, onClose }: { template: EnterpriseTemplate; orgs: { id: string; name: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set(template.organizations.map((o) => o.id)));
  const [filter, setFilter] = useState("");

  const save = useMutation({
    mutationFn: () => enterpriseApi.setTemplateOrgs(template.id, Array.from(selected)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["enterprise-templates"] }); onClose(); },
  });

  const visible = useMemo(
    () => orgs.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase())),
    [orgs, filter],
  );
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, backgroundColor: "var(--ls-surface)", borderRadius: "var(--ls-radius-lg)", padding: "var(--ls-space-xl)", border: "1px solid var(--ls-border)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)", marginBottom: 4 }}>Assign “{template.name}”</h3>
        <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: "var(--ls-space-md)" }}>
          Select every org that should be able to use this template at export.
        </p>
        <input
          type="text"
          placeholder="Filter organizations…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)", marginBottom: "var(--ls-space-sm)" }}
        />
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)" }}>
          {visible.length === 0 ? (
            <div style={{ padding: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", textAlign: "center" }}>No organizations</div>
          ) : (
            visible.map((o) => (
              <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--ls-border)" }}>
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                <span style={{ fontSize: "var(--ls-text-sm)" }}>{o.name}</span>
              </label>
            ))
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--ls-space-md)" }}>
          <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>{selected.size} selected</span>
          <div style={{ display: "flex", gap: "var(--ls-space-sm)" }}>
            <button type="button" onClick={onClose} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "transparent", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text-secondary)" }}>Cancel</button>
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", border: "none", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: "pointer", opacity: save.isPending ? 0.7 : 1 }}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
