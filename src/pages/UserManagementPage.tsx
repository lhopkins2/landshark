import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Shield, User, KeyRound, Loader } from "lucide-react";
import { orgApi } from "../api/organization";
import CreateUserModal from "../components/CreateUserModal";
import type { OrgMember, UserRole } from "../types/models";
import { useAuthStore } from "../stores/authStore";

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["org-members"],
    queryFn: () => orgApi.listMembers().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: orgApi.createMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      setShowCreateModal(false);
      setCreateError(null);
    },
    onError: (err: { response?: { data?: Record<string, string[]> } }) => {
      const detail = err?.response?.data;
      if (typeof detail === "object") {
        const messages = Object.values(detail).flat().join(". ");
        setCreateError(messages);
      } else {
        setCreateError("Failed to create user.");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      orgApi.updateMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      setEditingMember(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: orgApi.deactivateMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
  });

  function handleToggleApiAccess(member: OrgMember) {
    updateMutation.mutate({
      id: member.id,
      data: { has_api_key_access: !member.has_api_key_access },
    });
  }

  function handleChangeRole(member: OrgMember, newRole: UserRole) {
    updateMutation.mutate({
      id: member.id,
      data: { role: newRole },
    });
  }

  function handleToggleActive(member: OrgMember) {
    if (member.is_active) {
      if (!confirm(`Deactivate ${member.email}? They will no longer be able to log in.`)) return;
      deactivateMutation.mutate(member.id);
    } else {
      updateMutation.mutate({
        id: member.id,
        data: { is_active: true },
      });
    }
  }

  return (
    <div style={{ padding: "var(--ls-space-xl)", maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ls-space-xl)" }}>
        <div>
          <h1 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700, color: "var(--ls-text-primary)", margin: 0 }}>
            User Management
          </h1>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: 4 }}>
            Manage your organization's users and permissions
          </p>
        </div>
        <button
          className="ls-btn ls-btn-primary"
          onClick={() => { setCreateError(null); setShowCreateModal(true); }}
          style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)" }}
        >
          <UserPlus size={16} />
          Create User
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", padding: "var(--ls-space-xl)", color: "var(--ls-text-muted)" }}>
          <Loader size={18} className="spin" /> Loading members...
        </div>
      ) : members.length === 0 ? (
        <div style={{ padding: "var(--ls-space-xl)", textAlign: "center", color: "var(--ls-text-muted)" }}>
          No members found.
        </div>
      ) : (
        <div style={{
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--ls-surface-2)", borderBottom: "1px solid var(--ls-border)" }}>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>API Keys</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = String(member.user_id) === String(currentUser?.id);
                const isEditing = editingMember === member.id;
                return (
                  <tr
                    key={member.id}
                    style={{ borderBottom: "1px solid var(--ls-border)" }}
                  >
                    <td style={tdStyle}>
                      <div>
                        <div style={{ fontWeight: 500, color: "var(--ls-text-primary)" }}>
                          {member.first_name || member.last_name
                            ? `${member.first_name} ${member.last_name}`.trim()
                            : member.email}
                        </div>
                        {(member.first_name || member.last_name) && (
                          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                            {member.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <div className="ls-select-wrapper" style={{ maxWidth: 130 }}>
                          <select
                            className="ls-select"
                            value={member.role}
                            onChange={(e) => handleChangeRole(member, e.target.value as UserRole)}
                            disabled={isSelf}
                          >
                            <option value="admin">Admin</option>
                            <option value="operator">Operator</option>
                          </select>
                        </div>
                      ) : (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: "var(--ls-radius-sm)",
                          fontSize: "var(--ls-text-xs)",
                          fontWeight: 500,
                          backgroundColor: member.role === "admin" ? "var(--ls-primary-bg)" : "var(--ls-surface-2)",
                          color: member.role === "admin" ? "var(--ls-primary)" : "var(--ls-text-secondary)",
                        }}>
                          {member.role === "admin" ? <Shield size={12} /> : <User size={12} />}
                          {member.role === "admin" ? "Admin" : "Operator"}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {member.role === "admin" ? (
                        <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>Always</span>
                      ) : (
                        <button
                          onClick={() => handleToggleApiAccess(member)}
                          disabled={isSelf}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: "var(--ls-radius-sm)",
                            fontSize: "var(--ls-text-xs)",
                            fontWeight: 500,
                            border: "1px solid var(--ls-border)",
                            cursor: isSelf ? "default" : "pointer",
                            backgroundColor: member.has_api_key_access ? "var(--ls-success-bg, #e8f5e9)" : "var(--ls-surface)",
                            color: member.has_api_key_access ? "var(--ls-success, #2e7d32)" : "var(--ls-text-muted)",
                          }}
                        >
                          <KeyRound size={12} />
                          {member.has_api_key_access ? "Enabled" : "Disabled"}
                        </button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "var(--ls-radius-sm)",
                        fontSize: "var(--ls-text-xs)",
                        fontWeight: 500,
                        backgroundColor: member.is_active ? "var(--ls-success-bg, #e8f5e9)" : "var(--ls-error-bg, #fbe9e7)",
                        color: member.is_active ? "var(--ls-success, #2e7d32)" : "var(--ls-error)",
                      }}>
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {!isSelf && (
                        <div style={{ display: "flex", gap: "var(--ls-space-xs)", justifyContent: "flex-end" }}>
                          <button
                            className="ls-btn ls-btn-secondary"
                            style={{ fontSize: "var(--ls-text-xs)", padding: "4px 10px" }}
                            onClick={() => setEditingMember(isEditing ? null : member.id)}
                          >
                            {isEditing ? "Done" : "Edit"}
                          </button>
                          <button
                            className="ls-btn ls-btn-secondary"
                            style={{
                              fontSize: "var(--ls-text-xs)",
                              padding: "4px 10px",
                              color: member.is_active ? "var(--ls-error)" : "var(--ls-success, #2e7d32)",
                            }}
                            onClick={() => handleToggleActive(member)}
                          >
                            {member.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
          error={createError}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "var(--ls-text-xs)",
  fontWeight: 600,
  color: "var(--ls-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "var(--ls-text-sm)",
};
