import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, FileText, Activity, Zap } from "lucide-react";
import { enterpriseApi, type EnterpriseOrg, type OrgTokenUsage } from "../../api/enterprise";
import { formatDistanceToNow } from "date-fns";

export default function EnterpriseDashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["enterprise-stats"],
    queryFn: () => enterpriseApi.stats(),
    select: (res) => res.data,
    refetchInterval: 30000,
  });

  const { data: recentOrgs } = useQuery({
    queryKey: ["enterprise-orgs-recent"],
    queryFn: () => enterpriseApi.listOrgs(),
    select: (res) => res.data.results.slice(0, 5),
  });

  const { data: apiUsage } = useQuery({
    queryKey: ["enterprise-api-usage"],
    queryFn: () => enterpriseApi.apiUsage(),
    select: (res) => res.data,
    refetchInterval: 30000,
  });

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Enterprise Dashboard</h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Platform-wide overview
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "var(--ls-space-md)",
        marginBottom: "var(--ls-space-xl)",
      }}>
        <StatCard icon={Building2} label="Organizations" value={stats?.total_organizations ?? "—"} sub={stats ? `${stats.active_organizations} active` : undefined} />
        <StatCard icon={Users} label="Total Users" value={stats?.total_users ?? "—"} />
        <StatCard icon={FileText} label="Total Documents" value={stats?.total_documents ?? "—"} />
        <StatCard icon={Activity} label="Total Analyses" value={stats?.total_analyses ?? "—"} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
        gap: "var(--ls-space-lg)",
      }}>
        <div style={{
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          padding: "var(--ls-space-lg)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-md)" }}>
            <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-base)" }}>Recent Organizations</h3>
            <Link to="/enterprise/organizations" style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-primary)", textDecoration: "none" }}>
              View all
            </Link>
          </div>
          {!recentOrgs?.length ? (
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>No organizations yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentOrgs.map((org) => (
                <OrgRow key={org.id} org={org} />
              ))}
            </div>
          )}
        </div>

        <div style={{
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          padding: "var(--ls-space-lg)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-md)" }}>
            <Zap size={16} style={{ color: "var(--ls-primary)" }} />
            <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-base)" }}>
              API Usage {apiUsage?.period ? `(${apiUsage.period})` : ""}
            </h3>
          </div>

          {apiUsage?.platform_totals && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)",
              padding: "var(--ls-space-md)",
              backgroundColor: "var(--ls-bg)",
              borderRadius: "var(--ls-radius-md)",
            }}>
              <div>
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>Analyses</div>
                <div style={{ fontSize: "var(--ls-text-lg)", fontWeight: 700 }}>{apiUsage.platform_totals.analysis_count}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>Input Tokens</div>
                <div style={{ fontSize: "var(--ls-text-lg)", fontWeight: 700 }}>{formatTokenCount(apiUsage.platform_totals.input_tokens)}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>Output Tokens</div>
                <div style={{ fontSize: "var(--ls-text-lg)", fontWeight: 700 }}>{formatTokenCount(apiUsage.platform_totals.output_tokens)}</div>
              </div>
            </div>
          )}

          {!apiUsage?.organizations?.length ? (
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>No usage this month</p>
          ) : (
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto",
                gap: "var(--ls-space-sm)", padding: "0 0 var(--ls-space-xs) 0",
                borderBottom: "1px solid var(--ls-border)",
                fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 600,
              }}>
                <div>Organization</div>
                <div style={{ textAlign: "right" }}>Analyses</div>
                <div style={{ textAlign: "right" }}>Input</div>
                <div style={{ textAlign: "right" }}>Output</div>
              </div>
              {apiUsage.organizations.map((org) => (
                <OrgUsageRow key={org.org_id} org={org} maxTokens={apiUsage.platform_totals.total_tokens} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div style={{
      padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-sm)" }}>
        <Icon size={16} style={{ color: "var(--ls-text-muted)" }} />
        <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700, color: "var(--ls-text)" }}>{value}</div>
      {sub && <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>{sub}</div>}
    </div>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function OrgUsageRow({ org, maxTokens }: { org: OrgTokenUsage; maxTokens: number }) {
  const barWidth = maxTokens > 0 ? Math.max(2, (org.total_tokens / maxTokens) * 100) : 0;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto auto auto",
      gap: "var(--ls-space-sm)", padding: "var(--ls-space-sm) 0",
      borderBottom: "1px solid var(--ls-border)",
      alignItems: "center",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {org.org_name}
        </div>
        <div style={{
          height: 4, borderRadius: 2, marginTop: 4,
          backgroundColor: "color-mix(in srgb, var(--ls-primary) 15%, transparent)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            backgroundColor: "var(--ls-primary)",
            width: `${barWidth}%`,
            transition: "width 0.3s",
          }} />
        </div>
      </div>
      <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 50 }}>{org.analysis_count}</div>
      <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 60 }}>{formatTokenCount(org.input_tokens)}</div>
      <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 60 }}>{formatTokenCount(org.output_tokens)}</div>
    </div>
  );
}

function OrgRow({ org }: { org: EnterpriseOrg }) {
  return (
    <Link
      to={`/enterprise/organizations/${org.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-sm) 0",
        borderBottom: "1px solid var(--ls-border)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <Building2 size={16} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{org.name}</div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {org.member_count} member{org.member_count !== 1 ? "s" : ""} · {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
        </div>
      </div>
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
    </Link>
  );
}
