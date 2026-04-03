import { Sun, Moon, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useThemeStore } from "../../stores/themeStore";
import { useAuthStore } from "../../stores/authStore";
import { useSidebarStore } from "../../stores/sidebarStore";

export default function Header() {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { collapsed, toggleCollapsed } = useSidebarStore();

  return (
    <header
      style={{
        height: 56,
        backgroundColor: "var(--ls-surface)",
        borderBottom: "1px solid var(--ls-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 var(--ls-space-lg)",
        gap: "var(--ls-space-md)",
      }}
    >
      {/* Sidebar toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--ls-radius-md)",
          color: "var(--ls-text-secondary)",
          transition: "all var(--ls-transition-fast)",
          marginRight: "auto",
        }}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--ls-radius-md)",
          color: "var(--ls-text-secondary)",
          transition: "all var(--ls-transition-fast)",
        }}
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {/* User info */}
      {user && (
        <span
          style={{
            fontSize: "var(--ls-text-sm)",
            color: "var(--ls-text-secondary)",
          }}
        >
          {user.first_name} {user.last_name}
        </span>
      )}

      {/* Logout */}
      <button
        onClick={logout}
        title="Logout"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--ls-radius-md)",
          color: "var(--ls-text-muted)",
          transition: "all var(--ls-transition-fast)",
        }}
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
