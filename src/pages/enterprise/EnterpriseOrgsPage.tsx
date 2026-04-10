import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import { enterpriseApi, type EnterpriseOrg } from "../../api/enterprise";
import { formatDistanceToNow } from "date-fns";
import CreateOrgModal from "../../components/enterprise/CreateOrgModal";

export default function EnterpriseOrgsPage() {
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<string | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["enterprise-orgs", search, filterActive],
    queryFn: () => enterpriseApi.listOrgs({
      search: search || undefined,
      is_active: filterActive,
    }),
    select: (res) => res.data.results,
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-lg)" }}>
        <div>
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Organizations</h2>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
            Manage all organizations on the platform
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ls-space-xs)",
            padding: "var(--ls-space-sm) var(--ls-space-md)",
            backgroundColor: "var(--ls-primary)",
            color: "var(--ls-text-on-primary)",
            border: "none",
            borderRadius: "var(--ls-radius-md)",
            fontSize: "var(--ls-text-sm)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> New Organization
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: "flex",
        gap: "var(--ls-space-sm)",
        marginBottom: "var(--ls-space-md)",
      }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ls-text-muted)" }} />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 32px",
              borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)",
              backgroundColor: "var(--ls-surface)",
              fontSize: "var(--ls-text-sm)",
              outline: "none",
            }}
          />
        </div>
        <select
          value={filterActive ?? ""}
          onChange={(e) => setFilterActive(e.target.value || undefined)}
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
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
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
              <Th>Organization</Th>
              <Th>Members</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} style={{ padding: "var(--ls-space-lg)", textAlign: "center", color: "var(--ls-text-muted)", fontSize: "var(--ls-text-sm)" }}>Loading...</td></tr>
            ) : !orgs?.length ? (
              <tr><td colSpan={4} style={{ padding: "var(--ls-space-lg)", textAlign: "center", color: "var(--ls-text-muted)", fontSize: "var(--ls-text-sm)" }}>No organizations found</td></tr>
            ) : (
              orgs.map((org) => <OrgRow key={org.id} org={org} />)
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} />}
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

function OrgRow({ org }: { org: EnterpriseOrg }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--ls-border)" }}>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <Link
          to={`/enterprise/organizations/${org.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ls-space-sm)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Building2 size={16} style={{ color: "var(--ls-text-muted)" }} />
          <span style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{org.name}</span>
        </Link>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
        {org.member_count}
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)" }}>
        <span style={{
          fontSize: "var(--ls-text-xs)",
          padding: "2px 8px",
          borderRadius: "var(--ls-radius-sm)",
          backgroundColor: org.is_active ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          color: org.is_active ? "#22c55e" : "#ef4444",
          fontWeight: 500,
        }}>
          {org.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td style={{ padding: "var(--ls-space-sm) var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>
        {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
      </td>
    </tr>
  );
}
