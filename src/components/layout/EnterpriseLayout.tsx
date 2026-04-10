import { Outlet } from "react-router-dom";
import EnterpriseSidebar from "./EnterpriseSidebar";
import Header from "./Header";

export default function EnterpriseLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <EnterpriseSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Header />
        <main
          style={{
            flex: 1,
            padding: "var(--ls-space-lg)",
            backgroundColor: "var(--ls-bg)",
            overflow: "auto",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
