import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, UserPlus, Upload, Trash2, FileText, Download } from "lucide-react";
import { isAxiosError } from "axios";
import { enterpriseApi, type EnterpriseOrgMember, type EnterpriseOrgTemplate, type OrgTier } from "../../api/enterprise";
import { formTemplatesApi } from "../../api/analysis";
import { formatFileSize } from "../../utils/format";
import { formatDistanceToNow } from "date-fns";

export default function EnterpriseOrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const [editName, setEditName] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["enterprise-org", orgId],
    queryFn: () => enterpriseApi.getOrg(orgId!),
    select: (res) => res.data,
    enabled: !!orgId,
  });

  const { data: members } = useQuery({
    queryKey: ["enterprise-org-members", orgId],
    queryFn: () => enterpriseApi.listMembers(orgId!),
    select: (res) => res.data,
    enabled: !!orgId,
  });

  const updateMut = useMutation({
    mutationFn: (data: { name?: string; is_active?: boolean; tier?: OrgTier }) =>
      enterpriseApi.updateOrg(orgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise-org", orgId] });
      queryClient.invalidateQueries({ queryKey: ["enterprise-orgs"] });
      setEditName(null);
    },
  });

  if (!org) return <p style={{ color: "var(--ls-text-muted)" }}>Loading...</p>;

  return (
    <div>
      <Link
        to="/enterprise/organizations"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--ls-space-xs)",
          fontSize: "var(--ls-text-sm)",
          color: "var(--ls-text-muted)",
          textDecoration: "none",
          marginBottom: "var(--ls-space-md)",
        }}
      >
        <ArrowLeft size={14} /> Back to Organizations
      </Link>

      <div style={{
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        padding: "var(--ls-space-lg)",
        marginBottom: "var(--ls-space-lg)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--ls-space-md)" }}>
          <div style={{ flex: 1 }}>
            {editName !== null ? (
              <div style={{ display: "flex", gap: "var(--ls-space-sm)", alignItems: "center" }}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)",
                    backgroundColor: "var(--ls-bg)",
                    fontSize: "var(--ls-text-lg)",
                    fontWeight: 700,
                    outline: "none",
                    flex: 1,
                  }}
                />
                <button
                  onClick={() => updateMut.mutate({ name: editName })}
                  style={{ padding: "6px 12px", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", border: "none", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: "pointer" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditName(null)}
                  style={{ padding: "6px 12px", backgroundColor: "transparent", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2
                style={{ fontSize: "var(--ls-text-xl)", fontWeight: 700, cursor: "pointer" }}
                onClick={() => setEditName(org.name)}
                title="Click to edit"
              >
                {org.name}
              </h2>
            )}
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
              {org.member_count} member{org.member_count !== 1 ? "s" : ""} · Created {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-md)" }}>
              <label
                htmlFor="org-tier-select"
                style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Tier
              </label>
              <select
                id="org-tier-select"
                value={org.tier}
                onChange={(e) => updateMut.mutate({ tier: e.target.value as OrgTier })}
                disabled={updateMut.isPending}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--ls-radius-md)",
                  border: "1px solid var(--ls-border)",
                  backgroundColor: "var(--ls-bg)",
                  color: "var(--ls-text)",
                  fontSize: "var(--ls-text-sm)",
                  cursor: "pointer",
                }}
                title="Enterprise-tier orgs run analyses on an isolated worker pool that can't be starved by standard-tier traffic."
              >
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                {org.tier === "enterprise"
                  ? "Isolated worker pool"
                  : "Shared worker pool"}
              </span>
            </div>
          </div>
          <button
            onClick={() => updateMut.mutate({ is_active: !org.is_active })}
            style={{
              padding: "var(--ls-space-xs) var(--ls-space-md)",
              borderRadius: "var(--ls-radius-md)",
              border: "1px solid",
              borderColor: org.is_active ? "#ef4444" : "#22c55e",
              backgroundColor: "transparent",
              color: org.is_active ? "#ef4444" : "#22c55e",
              fontSize: "var(--ls-text-sm)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {org.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <div style={{
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--ls-space-md) var(--ls-space-lg)",
          borderBottom: "1px solid var(--ls-border)",
        }}>
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-base)" }}>Members</h3>
          <button
            onClick={() => setShowAddMember(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--ls-space-xs)",
              padding: "var(--ls-space-xs) var(--ls-space-md)",
              backgroundColor: "var(--ls-primary)",
              color: "var(--ls-text-on-primary)",
              border: "none",
              borderRadius: "var(--ls-radius-md)",
              fontSize: "var(--ls-text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus size={14} /> Add Member
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody>
            {!members?.length ? (
              <tr><td colSpan={4} style={{ padding: "var(--ls-space-lg)", textAlign: "center", color: "var(--ls-text-muted)", fontSize: "var(--ls-text-sm)" }}>No members</td></tr>
            ) : (
              members.map((m) => <MemberRow key={m.id} member={m} />)
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "var(--ls-space-lg)" }}>
        <TemplatesSection orgId={orgId!} />
      </div>

      {showAddMember && <AddMemberModal orgId={orgId!} onClose={() => setShowAddMember(false)} />}
    </div>
  );
}

function TemplatesSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showFields, setShowFields] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["enterprise-org-templates", orgId],
    queryFn: () => enterpriseApi.listTemplates(orgId).then((r) => r.data),
  });

  const uploadMut = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      return enterpriseApi.uploadTemplate(orgId, fd).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise-org-templates", orgId] });
      setName("");
      setError(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: unknown) => {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : null;
      setError(detail ?? "Upload failed.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => enterpriseApi.deleteTemplate(orgId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enterprise-org-templates", orgId] }),
  });

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Pick a .docx file first."); return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { setError("Only .docx files are supported."); return; }
    uploadMut.mutate({ file, name: name.trim() || file.name.replace(/\.docx$/i, "") });
  };

  return (
    <div style={{
      backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--ls-space-md) var(--ls-space-lg)", borderBottom: "1px solid var(--ls-border)",
      }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-base)" }}>COT Templates</h3>
          <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
            DOCX templates this org can pick at export. Plain forms are auto-prepared; hand-built ones pass through.
          </p>
        </div>
        <button
          type="button"
          onClick={() => formTemplatesApi.downloadStarter()}
          style={{
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            padding: "6px 12px", borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
            fontSize: "var(--ls-text-xs)", fontWeight: 600, cursor: "pointer", color: "var(--ls-text-secondary)",
          }}
        >
          <Download size={12} /> Download starter
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
            <Th>Template</Th>
            <Th>Size</Th>
            <Th>Added by</Th>
            <Th>Added</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {!templates.length ? (
            <tr><td colSpan={5} style={{ padding: "var(--ls-space-lg)", textAlign: "center", color: "var(--ls-text-muted)", fontSize: "var(--ls-text-sm)" }}>No templates yet</td></tr>
          ) : (
            templates.map((t: EnterpriseOrgTemplate) => (
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
                <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>{formatFileSize(t.file_size)}</td>
                <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>{t.uploaded_by_name ?? "—"}</td>
                <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</td>
                <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(`Delete template "${t.name}"?`)) deleteMut.mutate(t.id); }}
                    disabled={deleteMut.isPending}
                    title="Delete template"
                    style={{ display: "inline-flex", padding: 6, borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "transparent", color: "#ef4444", cursor: "pointer" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ padding: "var(--ls-space-md) var(--ls-space-lg)", borderTop: "1px solid var(--ls-border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".docx" style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text)" }} />
          <input
            type="text"
            placeholder="Template name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)" }}
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploadMut.isPending}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--ls-radius-md)", border: "none", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: uploadMut.isPending ? "wait" : "pointer", opacity: uploadMut.isPending ? 0.7 : 1 }}
          >
            <Upload size={14} /> {uploadMut.isPending ? "Uploading…" : "Upload Template"}
          </button>
        </div>
        {error && <div style={{ fontSize: "var(--ls-text-xs)", color: "#ef4444" }}>{error}</div>}
        <button
          type="button"
          onClick={() => setShowFields((s) => !s)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--ls-text-muted)", fontSize: "var(--ls-text-xs)", cursor: "pointer", textDecoration: "underline" }}
        >
          {showFields ? "Hide" : "Show"} available template fields
        </button>
        {showFields && (
          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontFamily: "var(--ls-font-mono)", lineHeight: 1.7, background: "var(--ls-bg)", padding: "8px 10px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)" }}>
            Header: {"{{ tax_id }}"} {"{{ tract_number }}"} {"{{ record_owner }}"} {"{{ address }}"} {"{{ acres }}"} {"{{ legal_description }}"} {"{{ begin_search_date }}"} {"{{ end_search_date }}"} {"{{ title_agent }}"}<br />
            Subject premises: {"{{ subject_premises }}"}<br />
            Instrument table row: {"{%tr for inst in instruments %}"} {"{{ inst.caption }}"} {"{{ inst.book_page }}"} {"{{ inst.reception }}"} {"{{ inst.recording_date }}"} {"{{ inst.grantor }}"} {"{{ inst.grantee }}"} {"{{ inst.comments }}"} {"{%tr endfor %}"}<br />
            Notes: {"{%p for note in notes %}"} {"{{ note.text }}"} {"{%p endfor %}"}<br />
            <span style={{ fontFamily: "inherit" }}>(Or upload a plain form with labels like TAX ID / GRANTOR / GRANTEE — we inject these for you.)</span>
          </div>
        )}
      </div>
    </div>
  );
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

function MemberRow({ member }: { member: EnterpriseOrgMember }) {
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ");
  return (
    <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{name || member.email}</div>
        {name && <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>{member.email}</div>}
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <span style={{
          fontSize: "var(--ls-text-xs)",
          padding: "2px 8px",
          borderRadius: "var(--ls-radius-sm)",
          backgroundColor: member.role === "admin" ? "rgba(139,105,20,0.1)" : "rgba(100,100,100,0.1)",
          color: member.role === "admin" ? "var(--ls-primary)" : "var(--ls-text-secondary)",
          fontWeight: 500,
          textTransform: "capitalize",
        }}>
          {member.role}
        </span>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <span style={{
          fontSize: "var(--ls-text-xs)",
          padding: "2px 8px",
          borderRadius: "var(--ls-radius-sm)",
          backgroundColor: member.is_active ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          color: member.is_active ? "#22c55e" : "#ef4444",
          fontWeight: 500,
        }}>
          {member.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>
        {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
      </td>
    </tr>
  );
}

function AddMemberModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", password: "", role: "operator" });
  const [error, setError] = useState("");

  const addMut = useMutation({
    mutationFn: () => enterpriseApi.addMember(orgId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise-org-members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["enterprise-org", orgId] });
      onClose();
    },
    onError: (err: Error) => {
      if (isAxiosError<Record<string, string[]>>(err)) {
        const d = err.response?.data;
        if (d) {
          const msg = Object.values(d).flat().join(", ");
          setError(msg || "Failed to add member");
          return;
        }
      }
      setError("Failed to add member");
    },
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, backgroundColor: "var(--ls-surface)",
          borderRadius: "var(--ls-radius-lg)", padding: "var(--ls-space-xl)",
          border: "1px solid var(--ls-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-lg)" }}>
          <UserPlus size={20} style={{ color: "var(--ls-primary)" }} />
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)" }}>Add Member</h3>
        </div>

        {error && (
          <div style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "var(--ls-error-bg)", color: "var(--ls-error)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", marginBottom: "var(--ls-space-md)" }}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }}>
          <FieldLabel label="Email" required />
          <input type="email" value={form.email} onChange={set("email")} required style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-sm)" }}>
            <div>
              <FieldLabel label="First Name" />
              <input value={form.first_name} onChange={set("first_name")} style={inputStyle} />
            </div>
            <div>
              <FieldLabel label="Last Name" />
              <input value={form.last_name} onChange={set("last_name")} style={inputStyle} />
            </div>
          </div>
          <FieldLabel label="Password" required />
          <input type="password" value={form.password} onChange={set("password")} required minLength={8} style={inputStyle} />
          <FieldLabel label="Role" />
          <select value={form.role} onChange={set("role")} style={inputStyle}>
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
          </select>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-lg)" }}>
            <button type="button" onClick={onClose} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "transparent", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text-secondary)" }}>Cancel</button>
            <button type="submit" disabled={addMut.isPending} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", border: "none", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: "pointer", opacity: addMut.isPending ? 0.7 : 1 }}>
              {addMut.isPending ? "Adding..." : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--ls-radius-md)",
  border: "1px solid var(--ls-border)",
  backgroundColor: "var(--ls-bg)",
  fontSize: "var(--ls-text-sm)",
  outline: "none",
  color: "var(--ls-text)",
  marginBottom: "var(--ls-space-sm)",
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: "4px" }}>
      {label}{required && " *"}
    </label>
  );
}
