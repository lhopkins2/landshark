import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore, selectCanManageUsers } from "./stores/authStore";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ChainOfTitlePage from "./pages/ChainOfTitlePage";
import DocumentsPage from "./pages/DocumentsPage";
import SettingsPage from "./pages/SettingsPage";
import ReviewPage from "./pages/ReviewPage";
import UserManagementPage from "./pages/UserManagementPage";
import TroubleshootingPage from "./pages/TroubleshootingPage";
import NotFoundPage from "./pages/NotFoundPage";

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

function DeveloperRoute({ children }: { children: React.ReactNode }) {
  const isDeveloper = useAuthStore((s) => s.user?.is_developer);
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
        <Route path="troubleshooting" element={<DeveloperRoute><TroubleshootingPage /></DeveloperRoute>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
