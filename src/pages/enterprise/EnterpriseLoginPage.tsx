import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { authApi } from "../../api/auth";

export default function EnterpriseLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { setTokens, setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await authApi.login({ email, password });
      setTokens(data.access, data.refresh);

      const { data: profile } = await authApi.getProfile();
      if (!profile.is_developer) {
        useAuthStore.getState().logout();
        setError("Access denied. Enterprise access requires developer privileges.");
        return;
      }
      setUser(profile);
      navigate("/enterprise", { replace: true });
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--ls-bg)",
        padding: "var(--ls-space-lg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          backgroundColor: "var(--ls-surface)",
          borderRadius: "var(--ls-radius-lg)",
          border: "1px solid var(--ls-border)",
          padding: "var(--ls-space-2xl)",
          boxShadow: "var(--ls-shadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--ls-space-xl)" }}>
          <h1
            style={{
              fontSize: "var(--ls-text-2xl)",
              fontWeight: 700,
              color: "var(--ls-primary)",
            }}
          >
            LandShark Enterprise
          </h1>
          <p
            style={{
              fontSize: "var(--ls-text-sm)",
              color: "var(--ls-text-muted)",
              marginTop: "var(--ls-space-xs)",
            }}
          >
            Platform Management
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: "var(--ls-space-sm) var(--ls-space-md)",
                backgroundColor: "var(--ls-error-bg)",
                color: "var(--ls-error)",
                borderRadius: "var(--ls-radius-md)",
                fontSize: "var(--ls-text-sm)",
                marginBottom: "var(--ls-space-md)",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: "var(--ls-space-md)" }}>
            <label
              htmlFor="enterprise-email"
              style={{
                display: "block",
                fontSize: "var(--ls-text-sm)",
                fontWeight: 500,
                color: "var(--ls-text-secondary)",
                marginBottom: "var(--ls-space-xs)",
              }}
            >
              Email
            </label>
            <input
              id="enterprise-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--ls-radius-md)",
                border: "1px solid var(--ls-border)",
                backgroundColor: "var(--ls-bg)",
                fontSize: "var(--ls-text-base)",
                outline: "none",
                transition: "border-color var(--ls-transition-fast)",
              }}
            />
          </div>

          <div style={{ marginBottom: "var(--ls-space-lg)" }}>
            <label
              htmlFor="enterprise-password"
              style={{
                display: "block",
                fontSize: "var(--ls-text-sm)",
                fontWeight: 500,
                color: "var(--ls-text-secondary)",
                marginBottom: "var(--ls-space-xs)",
              }}
            >
              Password
            </label>
            <input
              id="enterprise-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--ls-radius-md)",
                border: "1px solid var(--ls-border)",
                backgroundColor: "var(--ls-bg)",
                fontSize: "var(--ls-text-base)",
                outline: "none",
                transition: "border-color var(--ls-transition-fast)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-primary)",
              color: "var(--ls-text-on-primary)",
              fontSize: "var(--ls-text-base)",
              fontWeight: 600,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "all var(--ls-transition-fast)",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
