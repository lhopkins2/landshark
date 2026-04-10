import { CheckCircle, XCircle, Clock, Loader } from "lucide-react";
import { ANALYSIS_STATUSES } from "../utils/constants";

const colors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  completed: { bg: "rgba(34,197,94,0.1)", text: "#22c55e", icon: <CheckCircle size={12} /> },
  failed: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", icon: <XCircle size={12} /> },
  processing: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6", icon: <Loader size={12} className="spin" /> },
  pending: { bg: "rgba(234,179,8,0.1)", text: "#eab308", icon: <Clock size={12} /> },
  cancelled: { bg: "rgba(156,163,175,0.1)", text: "#9ca3af", icon: <XCircle size={12} /> },
};

export default function StatusBadge({ status }: { status: string }) {
  const c = colors[status] ?? colors.pending;
  const label = ANALYSIS_STATUSES[status as keyof typeof ANALYSIS_STATUSES] ?? status;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: "var(--ls-radius-full)",
      backgroundColor: c.bg, color: c.text, fontSize: "var(--ls-text-xs)", fontWeight: 600,
    }}>
      {c.icon} {label}
    </span>
  );
}
