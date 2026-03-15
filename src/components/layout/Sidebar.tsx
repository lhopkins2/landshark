import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Link2,
  FileText,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chain-of-title", icon: Link2, label: "Chain of Title" },
  { to: "/documents", icon: FileText, label: "Documents" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: "var(--ls-sidebar-width)",
        backgroundColor: "var(--ls-surface)",
        borderRight: "1px solid var(--ls-border)",
        display: "flex",
        flexDirection: "column",
        padding: "var(--ls-space-md) 0",
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
        }}
      >
        <img
          src="/landshark-icon.png"
          alt="LandShark Group"
          style={{ width: 40, height: 40, objectFit: "contain" }}
        />
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
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "var(--ls-space-sm)",
              padding: "var(--ls-space-sm) var(--ls-space-lg)",
              margin: "2px var(--ls-space-sm)",
              borderRadius: "var(--ls-radius-md)",
              fontSize: "var(--ls-text-sm)",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--ls-primary)" : "var(--ls-text-secondary)",
              backgroundColor: isActive ? "var(--ls-surface-2)" : "transparent",
              textDecoration: "none",
              transition: "all var(--ls-transition-fast)",
            })}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
