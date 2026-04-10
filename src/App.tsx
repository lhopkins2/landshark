import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore, selectCanManageUsers, selectIsDeveloper } from "./stores/authStore";
import AppLayout from "./components/layout/AppLayout";
import EnterpriseLayout from "./components/layout/EnterpriseLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ChainOfTitlePage from "./pages/ChainOfTitlePage";
import DocumentsPage from "./pages/DocumentsPage";
import SettingsPage from "./pages/SettingsPage";
import ReviewPage from "./pages/ReviewPage";
import UserManagementPage from "./pages/UserManagementPage";
import TroubleshootingPage from "./pages/TroubleshootingPage";
import NotFoundPage from "./pages/NotFoundPage";
import EnterpriseLoginPage from "./pages/enterprise/EnterpriseLoginPage";
import EnterpriseDashboardPage from "./pages/enterprise/EnterpriseDashboardPage";
import EnterpriseOrgsPage from "./pages/enterprise/EnterpriseOrgsPage";
import EnterpriseOrgDetailPage from "./pages/enterprise/EnterpriseOrgDetailPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const canManage = useAuthStore(selectCanManageUsers);
  if (!canManage) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function EnterpriseRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDeveloper = useAuthStore(selectIsDeveloper);
  if (!isAuthenticated) {
    return <Navigate to="/enterprise/login" replace />;
  }
  if (!isDeveloper) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="chain-of-title" element={<ChainOfTitlePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="review/:analysisId" element={<ReviewPage />} />
        <Route path="users" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
        <Route path="troubleshooting" element={<AdminRoute><TroubleshootingPage /></AdminRoute>} />
      </Route>

      {/* Enterprise routes */}
      <Route path="/enterprise/login" element={<EnterpriseLoginPage />} />
      <Route
        path="/enterprise"
        element={
          <EnterpriseRoute>
            <EnterpriseLayout />
          </EnterpriseRoute>
        }
      >
        <Route index element={<EnterpriseDashboardPage />} />
        <Route path="organizations" element={<EnterpriseOrgsPage />} />
        <Route path="organizations/:orgId" element={<EnterpriseOrgDetailPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
