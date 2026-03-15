import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2, FileText } from "lucide-react";
import { documentsApi } from "../api/documents";
import { useAuthStore } from "../stores/authStore";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: documentCount } = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(),
    select: (res) => res.data.count,
  });

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Dashboard</h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Welcome back{user ? `, ${user.first_name}` : ""}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "var(--ls-space-lg)",
      }}>
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
          stat={documentCount !== undefined ? `${documentCount} document${documentCount !== 1 ? "s" : ""}` : undefined}
        />
      </div>
    </div>
  );
}

function FeatureCard({
  to,
  icon: Icon,
  title,
  description,
  badge,
  stat,
}: {
  to: string;
  icon: typeof Link2;
  title: string;
  description: string;
  badge?: string;
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
        {badge && (
          <span style={{
            padding: "2px 10px", borderRadius: "var(--ls-radius-full)",
            fontSize: "var(--ls-text-xs)", fontWeight: 600,
            backgroundColor: "rgba(245,158,11,0.1)", color: "var(--ls-warning)",
            marginLeft: "auto",
          }}>
            {badge}
          </span>
        )}
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
