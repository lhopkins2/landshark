import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Zap, Users, ChevronDown, ChevronRight } from "lucide-react";
import { enterpriseApi, type UserUsageRow } from "../../api/enterprise";

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Last 12 months as { value: "YYYY-MM", label: "March 2026" } for the picker.
function recentMonths(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

export default function EnterpriseUsagePage() {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);

  const { data, isLoading } = useQuery({
    queryKey: ["enterprise-user-usage", month],
    queryFn: () => enterpriseApi.userUsage(month),
    select: (res) => res.data,
    refetchInterval: 30000,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--ls-space-md)", marginBottom: "var(--ls-space-xl)", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>User Usage</h2>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
            Analyses and token usage per user
          </p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: "var(--ls-space-sm) var(--ls-space-md)",
              borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)",
              backgroundColor: "var(--ls-surface)",
              color: "var(--ls-text)",
              fontSize: "var(--ls-text-sm)",
              minWidth: 180,
            }}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "var(--ls-space-md)",
        marginBottom: "var(--ls-space-xl)",
      }}>
        <StatCard icon={Users} label="Active Users" value={data?.totals.user_count ?? "—"} />
        <StatCard icon={Activity} label="Analyses" value={data?.totals.analysis_count ?? "—"} />
        <StatCard icon={Zap} label="Input Tokens" value={data ? formatTokenCount(data.totals.input_tokens) : "—"} />
        <StatCard icon={Zap} label="Output Tokens" value={data ? formatTokenCount(data.totals.output_tokens) : "—"} />
      </div>

      <div style={{
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        padding: "var(--ls-space-lg)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "24px 1fr auto auto auto",
          gap: "var(--ls-space-sm)", padding: "0 0 var(--ls-space-sm) 0",
          borderBottom: "1px solid var(--ls-border)",
          fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 600,
        }}>
          <div />
          <div>User</div>
          <div style={{ textAlign: "right", minWidth: 70 }}>Analyses</div>
          <div style={{ textAlign: "right", minWidth: 70 }}>Input</div>
          <div style={{ textAlign: "right", minWidth: 70 }}>Output</div>
        </div>

        {isLoading ? (
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-md) 0" }}>Loading…</p>
        ) : !data?.users.length ? (
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-md) 0" }}>No usage this month</p>
        ) : (
          data.users.map((u) => <UserRow key={u.user_id} user={u} />)
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string }) {
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
    </div>
  );
}

function UserRow({ user }: { user: UserUsageRow }) {
  const [open, setOpen] = useState(false);
  const maxDay = user.daily.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div style={{ borderBottom: "1px solid var(--ls-border)" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "grid", gridTemplateColumns: "24px 1fr auto auto auto",
          gap: "var(--ls-space-sm)", padding: "var(--ls-space-sm) 0",
          alignItems: "center", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ls-text-muted)" }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </div>
          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.org_name} · {user.email}
          </div>
        </div>
        <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 70, fontWeight: 600 }}>{user.analysis_count}</div>
        <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 70 }}>{formatTokenCount(user.input_tokens)}</div>
        <div style={{ fontSize: "var(--ls-text-sm)", textAlign: "right", minWidth: 70 }}>{formatTokenCount(user.output_tokens)}</div>
      </div>

      {open && (
        <div style={{
          padding: "var(--ls-space-sm) 0 var(--ls-space-md) 24px",
        }}>
          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 600, marginBottom: "var(--ls-space-sm)" }}>
            Analyses per day
          </div>
          {!user.daily.length ? (
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>No daily activity</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: 420 }}>
              {user.daily.map((d) => (
                <div key={d.date} style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: "var(--ls-space-sm)", alignItems: "center" }}>
                  <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-secondary)" }}>
                    {new Date(d.date + "T00:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}
                  </div>
                  <div style={{ height: 6, borderRadius: 3, backgroundColor: "color-mix(in srgb, var(--ls-primary) 15%, transparent)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      backgroundColor: "var(--ls-primary)",
                      width: `${maxDay > 0 ? Math.max(4, (d.count / maxDay) * 100) : 0}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: "var(--ls-text-xs)", textAlign: "right", fontWeight: 600 }}>{d.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
