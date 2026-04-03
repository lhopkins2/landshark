import { useState } from "react";
import { Sun, Moon, LogOut, Save, Check, RefreshCw, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore, selectHasApiKeyAccess } from "../stores/authStore";
import { analysisSettingsApi } from "../api/analysis";
import { AI_PROVIDERS, AI_MODELS } from "../utils/constants";
import type { AIProvider } from "../types/models";

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const hasApiKeyAccess = useAuthStore(selectHasApiKeyAccess);

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Settings</h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Manage your account and preferences
        </p>
      </div>

      {/* Theme */}
      <div style={{
        padding: "var(--ls-space-lg)",
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        marginBottom: "var(--ls-space-lg)",
      }}>
        <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
          Appearance
        </h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: "var(--ls-text-sm)" }}>Theme</div>
            <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
              Currently using {theme} mode
            </div>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
              padding: "8px 16px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text)",
            }}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            Switch to {theme === "light" ? "dark" : "light"}
          </button>
        </div>
      </div>

      {/* AI Configuration */}
      {hasApiKeyAccess ? (
        <AIConfigSection />
      ) : (
        <div style={{
          padding: "var(--ls-space-lg)",
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          marginBottom: "var(--ls-space-lg)",
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
            AI Configuration
          </h3>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ls-space-sm)",
            padding: "var(--ls-space-md)",
            backgroundColor: "var(--ls-surface-2)",
            borderRadius: "var(--ls-radius-md)",
            fontSize: "var(--ls-text-sm)",
            color: "var(--ls-text-secondary)",
          }}>
            <Info size={16} />
            Your organization's API keys are managed by an admin.
          </div>
        </div>
      )}

      {/* Profile */}
      {user && (
        <div style={{
          padding: "var(--ls-space-lg)",
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          marginBottom: "var(--ls-space-lg)",
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
            Profile
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--ls-space-md)" }}>
            <InfoItem label="Name" value={`${user.first_name} ${user.last_name}`} />
            <InfoItem label="Email" value={user.email} />
            {user.phone && <InfoItem label="Phone" value={user.phone} />}
          </div>
        </div>
      )}

      {/* Logout */}
      <div style={{
        padding: "var(--ls-space-lg)",
        backgroundColor: "var(--ls-surface)",
        border: "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: "var(--ls-text-sm)" }}>Sign Out</div>
            <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
              End your current session
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
              padding: "8px 16px", borderRadius: "var(--ls-radius-md)",
              border: "none", backgroundColor: "var(--ls-error)",
              color: "#fff", fontSize: "var(--ls-text-sm)", fontWeight: 600, cursor: "pointer",
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function AIConfigSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["analysis-settings"],
    queryFn: () => analysisSettingsApi.get().then((r) => r.data),
  });

  const [provider, setProvider] = useState<AIProvider | "">("");
  const [model, setModel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => analysisSettingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-settings"] });
      setAnthropicKey("");
      setOpenaiKey("");
      setGeminiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const activeProvider = provider || settings?.default_provider || "anthropic";

  // Check if the active provider has an API key configured
  const providerHasKey = settings && (
    (activeProvider === "anthropic" && settings.anthropic_api_key_display) ||
    (activeProvider === "openai" && settings.openai_api_key_display) ||
    (activeProvider === "gemini" && settings.gemini_api_key_display)
  );

  // Auto-fetch models from the provider's API
  const { data: liveModels, isLoading: loadingModels, error: modelsError, refetch: refetchModels } = useQuery({
    queryKey: ["provider-models", activeProvider],
    queryFn: () => analysisSettingsApi.listModels(activeProvider).then((r) => r.data.models),
    enabled: !!providerHasKey,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const hardcodedModels = AI_MODELS[activeProvider] || {};
  const modelList = liveModels ?? null;
  const activeModel = model || settings?.default_model || (modelList ? modelList[0]?.id : Object.keys(hardcodedModels)[0]) || "";

  const handleSave = () => {
    const data: Record<string, string> = {};
    if (activeProvider) data.default_provider = activeProvider;
    data.default_model = model || activeModel;
    if (anthropicKey) data.anthropic_api_key = anthropicKey;
    if (openaiKey) data.openai_api_key = openaiKey;
    if (geminiKey) data.gemini_api_key = geminiKey;
    saveMutation.mutate(data);
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "var(--ls-radius-md)",
    border: "1px solid var(--ls-border)",
    backgroundColor: "var(--ls-bg)",
    fontSize: "var(--ls-text-sm)",
    color: "var(--ls-text)",
    fontFamily: "var(--ls-font-mono)",
  };

  return (
    <div style={{
      padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
      marginBottom: "var(--ls-space-lg)",
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
        AI Configuration
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ls-space-md)" }}>
        {/* Provider Selection */}
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 4 }}>
            Default Provider
          </label>
          <select
            value={activeProvider}
            onChange={(e) => { setProvider(e.target.value as AIProvider); setModel(""); }}
            style={{
              ...inputStyle,
              fontFamily: "var(--ls-font-sans)",
              cursor: "pointer",
            }}
          >
            {Object.entries(AI_PROVIDERS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Model Selection */}
        <div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 4 }}>
            Model
            {providerHasKey && (
              <button
                onClick={() => refetchModels()}
                disabled={loadingModels}
                title="Refresh models from API"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: "var(--ls-radius-sm)",
                  border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                  fontSize: "var(--ls-text-xs)", cursor: loadingModels ? "not-allowed" : "pointer",
                  color: "var(--ls-text-muted)", opacity: loadingModels ? 0.6 : 1,
                }}
              >
                <RefreshCw size={12} style={loadingModels ? { animation: "spin 1s linear infinite" } : undefined} />
                {loadingModels ? "Loading..." : "Refresh"}
              </button>
            )}
          </label>
          <select
            value={activeModel}
            onChange={(e) => setModel(e.target.value)}
            style={{
              ...inputStyle,
              fontFamily: "var(--ls-font-sans)",
              cursor: "pointer",
            }}
          >
            {modelList
              ? modelList.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              : <>
                  {settings?.default_model && !(settings.default_model in hardcodedModels) && (
                    <option value={settings.default_model}>{settings.default_model}</option>
                  )}
                  {Object.entries(hardcodedModels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </>
            }
          </select>
          {!providerHasKey && (
            <span style={{
              fontSize: "var(--ls-text-xs)", color: "#b45309", marginTop: 4, display: "block",
            }}>
              Add an API key for {AI_PROVIDERS[activeProvider as AIProvider] || activeProvider} below, then refresh to load available models
            </span>
          )}
          {providerHasKey && modelsError && (
            <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-error)", marginTop: 4, display: "block" }}>
              Failed to fetch models — check your API key
            </span>
          )}
        </div>

        {/* API Keys */}
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 4 }}>
            Anthropic API Key
          </label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder={settings?.anthropic_api_key_display || "Enter API key..."}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 4 }}>
            OpenAI API Key
          </label>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={settings?.openai_api_key_display || "Enter API key..."}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 4 }}>
            Gemini API Key
          </label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={settings?.gemini_api_key_display || "Enter API key..."}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
              padding: "8px 16px", borderRadius: "var(--ls-radius-md)",
              border: "none", backgroundColor: "var(--ls-primary)",
              color: "#fff", fontSize: "var(--ls-text-sm)", fontWeight: 600,
              cursor: saveMutation.isPending ? "not-allowed" : "pointer",
              opacity: saveMutation.isPending ? 0.7 : 1,
            }}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saveMutation.isPending ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
          {saveMutation.isError && (
            <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-error)" }}>
              Failed to save settings
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{value || "\u2014"}</div>
    </div>
  );
}
