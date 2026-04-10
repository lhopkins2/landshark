import { useState } from "react";
import { X } from "lucide-react";
import type { UserRole } from "../types/models";

interface CreateUserModalProps {
  onClose: () => void;
  onSubmit: (data: {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    role: UserRole;
    has_api_key_access: boolean;
    is_developer?: boolean;
  }) => void;
  isSubmitting: boolean;
  error: string | null;
  isDeveloper?: boolean;
}

export default function CreateUserModal({ onClose, onSubmit, isSubmitting, error, isDeveloper }: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [makeDeveloper, setMakeDeveloper] = useState(false);
  const [hasApiKeyAccess, setHasApiKeyAccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      email,
      first_name: firstName,
      last_name: lastName,
      password,
      role: makeDeveloper ? "admin" : role,
      has_api_key_access: makeDeveloper || role === "admin" ? true : hasApiKeyAccess,
      is_developer: makeDeveloper || undefined,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--ls-surface)",
          borderRadius: "var(--ls-radius-lg)",
          border: "1px solid var(--ls-border)",
          padding: "var(--ls-space-xl)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ls-space-lg)" }}>
          <h2 style={{ fontSize: "var(--ls-text-lg)", fontWeight: 600, color: "var(--ls-text)", margin: 0 }}>
            Create User
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ls-text-muted)",
              padding: 4,
              borderRadius: "var(--ls-radius-sm)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--ls-space-md)" }}>
          <div>
            <label style={{ display: "block", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ls-input"
              placeholder="user@example.com"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ls-space-md)" }}>
            <div>
              <label style={{ display: "block", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", marginBottom: 4 }}>
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="ls-input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", marginBottom: 4 }}>
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="ls-input"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", marginBottom: 4 }}>
              Temporary Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ls-input"
              placeholder="Minimum 8 characters"
            />
          </div>

          {isDeveloper && (
            <label style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={makeDeveloper}
                onChange={(e) => setMakeDeveloper(e.target.checked)}
              />
              <span style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
                Developer account
              </span>
            </label>
          )}

          {!makeDeveloper && (
            <div>
              <label style={{ display: "block", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", marginBottom: 4 }}>
                Role
              </label>
              <div className="ls-select-wrapper">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="ls-select"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          )}

          {!makeDeveloper && role === "operator" && (
            <label style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasApiKeyAccess}
                onChange={(e) => setHasApiKeyAccess(e.target.checked)}
              />
              <span style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
                Allow this user to manage their own API keys
              </span>
            </label>
          )}

          {error && (
            <div style={{ color: "var(--ls-error)", fontSize: "var(--ls-text-sm)" }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: "var(--ls-space-sm)", justifyContent: "flex-end", marginTop: "var(--ls-space-sm)" }}>
            <button
              type="button"
              onClick={onClose}
              className="ls-btn ls-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="ls-btn ls-btn-primary"
            >
              {isSubmitting ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
