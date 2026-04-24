import { useEffect, useRef } from "react";
import { X, CheckCircle, XCircle, Info } from "lucide-react";
import { useNotificationStore } from "../stores/notificationStore";
import { useAuthStore } from "../stores/authStore";
import { analysesApi } from "../api/analysis";

const iconMap = {
  success: { Icon: CheckCircle, color: "#22c55e" },
  error: { Icon: XCircle, color: "#ef4444" },
  info: { Icon: Info, color: "var(--ls-primary)" },
};

export default function ToastContainer() {
  const toasts = useNotificationStore((s) => s.toasts);
  const removeToast = useNotificationStore((s) => s.removeToast);

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 380,
    }}>
      {toasts.map((toast) => {
        const { Icon, color } = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "12px 16px",
              backgroundColor: "var(--ls-surface)",
              border: "1px solid var(--ls-border)",
              borderRadius: "var(--ls-radius-lg)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              animation: "slideIn 0.2s ease-out",
            }}
          >
            <Icon size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)" }}>{toast.title}</div>
              {toast.message && (
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ls-text-muted)", padding: 0, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Hook that polls for in-progress analyses and fires toasts when they complete.
 * Mount once in AppLayout.
 */
export function useAnalysisNotifications() {
  const isLoggedIn = useAuthStore((s) => !!s.accessToken);
  const addToast = useNotificationStore((s) => s.addToast);
  const trackedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn) return;

    const poll = async () => {
      try {
        const { data } = await analysesApi.list({ ordering: "-created_at" });
        for (const analysis of data.results) {
          const id = analysis.id;

          if (analysis.status === "processing" || analysis.status === "pending") {
            trackedIds.current.add(id);
            continue;
          }

          // Only toast analyses we saw in-progress this session, to avoid re-firing on reload.
          if (trackedIds.current.has(id)) {
            trackedIds.current.delete(id);
            if (analysis.status === "completed") {
              addToast({
                type: "success",
                title: "Analysis Complete",
                message: analysis.document_name || "Your analysis has finished.",
              });
            } else if (analysis.status === "failed") {
              addToast({
                type: "error",
                title: "Analysis Failed",
                message: analysis.error_message || analysis.document_name || "Something went wrong.",
              });
            }
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [isLoggedIn, addToast]);
}
