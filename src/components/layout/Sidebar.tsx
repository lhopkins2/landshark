import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Link2,
  FileText,
  Settings,
  Users,
  Bug,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuthStore, selectCanManageUsers } from "../../stores/authStore";
import { useSidebarStore } from "../../stores/sidebarStore";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chain-of-title", icon: Link2, label: "Chain of Title" },
  { to: "/documents", icon: FileText, label: "Documents" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const adminNavItems = [
  { to: "/users", icon: Users, label: "Users" },
];

const devNavItems = [
  { to: "/troubleshooting", icon: Bug, label: "Troubleshooting" },
];

export default function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebarStore();
  const user = useAuthStore((s) => s.user);
  const isDeveloper = user?.is_developer ?? false;
  const canManageUsers = useAuthStore(selectCanManageUsers);

  return (
    <aside
      style={{
        width: collapsed ? 64 : "var(--ls-sidebar-width)",
        minWidth: collapsed ? 64 : "var(--ls-sidebar-width)",
        backgroundColor: "var(--ls-surface)",
        borderRight: "1px solid var(--ls-border)",
        display: "flex",
        flexDirection: "column",
        padding: "var(--ls-space-md) 0",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "var(--ls-space-md) var(--ls-space-lg)",
          marginBottom: "var(--ls-space-lg)",
          display: "flex",
          alignItems: "center",
          gap: "var(--ls-space-sm)",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <img
          src="/landshark-icon.png"
          alt="LandShark Group"
          style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }}
        />
        {!collapsed && (
          <div>
            <h1
              style={{
                fontSize: "var(--ls-text-xl)",
                fontWeight: 700,
                color: "var(--ls-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              LandShark Group
            </h1>
            <p
              style={{
                fontSize: "var(--ls-text-xs)",
                color: "var(--ls-text-muted)",
                marginTop: "2px",
              }}
            >
              Document Management
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "var(--ls-space-sm)",
              padding: collapsed
                ? "var(--ls-space-sm)"
                : "var(--ls-space-sm) var(--ls-space-lg)",
              margin: "2px var(--ls-space-sm)",
              borderRadius: "var(--ls-radius-md)",
              fontSize: "var(--ls-text-sm)",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--ls-primary)" : "var(--ls-text-secondary)",
              backgroundColor: isActive ? "var(--ls-surface-2)" : "transparent",
              textDecoration: "none",
              transition: "all var(--ls-transition-fast)",
              justifyContent: collapsed ? "center" : "flex-start",
              whiteSpace: "nowrap",
              overflow: "hidden",
            })}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            {!collapsed && label}
          </NavLink>
        ))}

        {/* Admin-only nav */}
        {canManageUsers && (
          <>
            <div style={{
              height: 1, backgroundColor: "var(--ls-border)",
              margin: "var(--ls-space-sm) var(--ls-space-md)",
            }} />
            {adminNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ls-space-sm)",
                  padding: collapsed
                    ? "var(--ls-space-sm)"
                    : "var(--ls-space-sm) var(--ls-space-lg)",
                  margin: "2px var(--ls-space-sm)",
                  borderRadius: "var(--ls-radius-md)",
                  fontSize: "var(--ls-text-sm)",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ls-primary)" : "var(--ls-text-secondary)",
                  backgroundColor: isActive ? "var(--ls-surface-2)" : "transparent",
                  textDecoration: "none",
                  transition: "all var(--ls-transition-fast)",
                  justifyContent: collapsed ? "center" : "flex-start",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                })}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && label}
              </NavLink>
            ))}
          </>
        )}

        {/* Developer-only nav */}
        {isDeveloper && (
          <>
            <div style={{
              height: 1, backgroundColor: "var(--ls-border)",
              margin: "var(--ls-space-sm) var(--ls-space-md)",
            }} />
            {devNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ls-space-sm)",
                  padding: collapsed
                    ? "var(--ls-space-sm)"
                    : "var(--ls-space-sm) var(--ls-space-lg)",
                  margin: "2px var(--ls-space-sm)",
                  borderRadius: "var(--ls-radius-md)",
                  fontSize: "var(--ls-text-sm)",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ls-primary)" : "var(--ls-text-secondary)",
                  backgroundColor: isActive ? "var(--ls-surface-2)" : "transparent",
                  textDecoration: "none",
                  transition: "all var(--ls-transition-fast)",
                  justifyContent: collapsed ? "center" : "flex-start",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                })}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: "var(--ls-space-sm)",
          padding: collapsed
            ? "var(--ls-space-sm)"
            : "var(--ls-space-sm) var(--ls-space-lg)",
          margin: "var(--ls-space-sm)",
          borderRadius: "var(--ls-radius-md)",
          fontSize: "var(--ls-text-sm)",
          color: "var(--ls-text-secondary)",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "all var(--ls-transition-fast)",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
