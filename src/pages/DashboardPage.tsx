import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2, FileText, Activity, Clock, CheckCircle, XCircle, Loader, AlertCircle } from "lucide-react";
import { dashboardApi } from "../api/analysis";
import { useAuthStore } from "../stores/authStore";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.stats(),
    select: (res) => res.data,
    refetchInterval: 30000,
  });

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>
          {user?.organization_name || "Dashboard"}
        </h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Welcome back{user ? `, ${user.first_name}` : ""}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "var(--ls-space-md)",
        marginBottom: "var(--ls-space-xl)",
      }}>
        <StatCard icon={FileText} label="Total Documents" value={stats?.total_documents ?? "—"} />
        <StatCard icon={Activity} label="Analyses This Month" value={stats?.analyses_this_month ?? "—"} />
        <StatCard icon={Clock} label="Pending Analyses" value={stats?.pending_analyses ?? "—"} highlight={!!stats?.pending_analyses} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "var(--ls-space-lg)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ls-space-lg)" }}>
          <FeatureCard
            to="/chain-of-title"
            icon={Link2}
            title="Chain of Title"
            description="Analyze chain of title documents using AI. Upload documents, select form templates, and generate formatted output."
          />
          <FeatureCard
            to="/documents"
            icon={FileText}
            title="Documents"
            description="Upload and manage documents across all features. Search, tag, and organize your files."
            stat={stats?.total_documents !== undefined ? `${stats.total_documents} document${stats.total_documents !== 1 ? "s" : ""}` : undefined}
          />
        </div>

        <div style={{
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          padding: "var(--ls-space-lg)",
        }}>
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-base)", marginBottom: "var(--ls-space-md)" }}>
            Recent Activity
          </h3>
          {!stats?.recent_activity?.length ? (
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>
              No recent activity
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {stats.recent_activity.map((item) => (
                <ActivityItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight }: {
  icon: typeof FileText;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)",
      border: highlight ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-sm)" }}>
        <Icon size={16} style={{ color: "var(--ls-text-muted)" }} />
        <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700, color: highlight ? "var(--ls-primary)" : "var(--ls-text)" }}>
        {value}
      </div>
    </div>
  );
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: "#22c55e", label: "Completed" },
  failed: { icon: XCircle, color: "#ef4444", label: "Failed" },
  processing: { icon: Loader, color: "var(--ls-primary)", label: "Processing" },
  pending: { icon: Clock, color: "var(--ls-text-muted)", label: "Pending" },
  cancelled: { icon: AlertCircle, color: "var(--ls-text-muted)", label: "Cancelled" },
};

function ActivityItem({ item }: { item: { id: string; status: string; document_name: string | null; created_by_name: string | null; created_at: string } }) {
  const config = statusConfig[item.status] || statusConfig.pending;
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
      padding: "var(--ls-space-sm) 0",
      borderBottom: "1px solid var(--ls-border)",
    }}>
      <Icon size={16} style={{ color: config.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.document_name || "Unknown document"}
        </div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {config.label}{item.created_by_name ? ` by ${item.created_by_name}` : ""} &middot; {timeAgo}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  to,
  icon: Icon,
  title,
  description,
  stat,
}: {
  to: string;
  icon: typeof Link2;
  title: string;
  description: string;
  stat?: string;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: "var(--ls-space-xl)",
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color var(--ls-transition-fast), box-shadow var(--ls-transition-fast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--ls-primary)";
        e.currentTarget.style.boxShadow = "var(--ls-shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ls-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "var(--ls-radius-md)",
          backgroundColor: "rgba(139,105,20,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={20} style={{ color: "var(--ls-primary)" }} />
        </div>
        <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)" }}>{title}</h3>
      </div>
      <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", lineHeight: 1.6 }}>
        {description}
      </p>
      {stat && (
        <div style={{
          marginTop: "var(--ls-space-md)", paddingTop: "var(--ls-space-md)",
          borderTop: "1px solid var(--ls-border)",
          fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", fontWeight: 500,
        }}>
          {stat}
        </div>
      )}
    </Link>
  );
}
