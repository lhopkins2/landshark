import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { enterpriseApi } from "../../api/enterprise";

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

export default function CreateOrgModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    admin_email: "",
    admin_first_name: "",
    admin_last_name: "",
    admin_password: "",
  });
  const [error, setError] = useState("");

  const createMut = useMutation({
    mutationFn: () => enterpriseApi.createOrg(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise-orgs"] });
      queryClient.invalidateQueries({ queryKey: ["enterprise-stats"] });
      onClose();
    },
    onError: (err: { response?: { data?: Record<string, string[]> } }) => {
      const d = err.response?.data;
      if (d) {
        const msg = Object.values(d).flat().join(", ");
        setError(msg || "Failed to create organization");
      } else {
        setError("Failed to create organization");
      }
    },
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
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
          width: "100%", maxWidth: 480, backgroundColor: "var(--ls-surface)",
          borderRadius: "var(--ls-radius-lg)", padding: "var(--ls-space-xl)",
          border: "1px solid var(--ls-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-lg)" }}>
          <Building2 size={20} style={{ color: "var(--ls-primary)" }} />
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)" }}>New Organization</h3>
        </div>

        {error && (
          <div style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "var(--ls-error-bg)", color: "var(--ls-error)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", marginBottom: "var(--ls-space-md)" }}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
          <FieldLabel label="Organization Name" required />
          <input value={form.name} onChange={set("name")} required style={inputStyle} placeholder="Acme Title Company" />

          <div style={{ borderTop: "1px solid var(--ls-border)", margin: "var(--ls-space-md) 0", paddingTop: "var(--ls-space-md)" }}>
            <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--ls-space-sm)" }}>
              Initial Admin User
            </p>
          </div>

          <FieldLabel label="Email" required />
          <input type="email" value={form.admin_email} onChange={set("admin_email")} required style={inputStyle} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ls-space-sm)" }}>
            <div>
              <FieldLabel label="First Name" />
              <input value={form.admin_first_name} onChange={set("admin_first_name")} style={inputStyle} />
            </div>
            <div>
              <FieldLabel label="Last Name" />
              <input value={form.admin_last_name} onChange={set("admin_last_name")} style={inputStyle} />
            </div>
          </div>

          <FieldLabel label="Password" required />
          <input type="password" value={form.admin_password} onChange={set("admin_password")} required minLength={8} style={inputStyle} />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-lg)" }}>
            <button type="button" onClick={onClose} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "transparent", border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text-secondary)" }}>Cancel</button>
            <button type="submit" disabled={createMut.isPending} style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)", border: "none", borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: "pointer", opacity: createMut.isPending ? 0.7 : 1 }}>
              {createMut.isPending ? "Creating..." : "Create Organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: "4px" }}>
      {label}{required && " *"}
    </label>
  );
}
