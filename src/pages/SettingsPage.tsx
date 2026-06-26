import { useState } from "react";
import { Sun, Moon, LogOut, Save, Check, RefreshCw, Info, Lock, Building2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore, selectHasApiKeyAccess } from "../stores/authStore";
import {
  analysisSettingsApi,
  orgAnalysisSettingsApi,
  type AnalysisSettingsUpdate,
} from "../api/analysis";
import { AI_PROVIDERS, AI_MODELS } from "../utils/constants";
import type { AIProvider, OrganizationAnalysisSettings, UserAnalysisSettings } from "../types/models";

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const hasApiKeyAccess = useAuthStore(selectHasApiKeyAccess);
  const isOrgAdmin = user?.role === "admin";

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Settings</h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Manage your account and preferences
        </p>
      </div>

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

      {isOrgAdmin && <OrgAIConfigSection />}

      {hasApiKeyAccess ? (
        <PersonalAIConfigSection />
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

/** Personal AI keys + model. Hidden behind the org lock when an admin has locked the org. */
function PersonalAIConfigSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["analysis-settings"],
    queryFn: () => analysisSettingsApi.get().then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: AnalysisSettingsUpdate) => analysisSettingsApi.update(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-settings"] }),
  });

  const locked = settings?.org_locks_api_keys === true;

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitleStyle}>AI Configuration</h3>
      {locked ? (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
          padding: "var(--ls-space-md)", backgroundColor: "var(--ls-surface-2)",
          borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)",
        }}>
          <Lock size={16} />
          Your organization requires everyone to use the organization's API key and model. Personal keys are
          disabled while this is on.
        </div>
      ) : (
        <AIConfigForm
          settings={settings}
          onSave={(data) => saveMutation.mutate(data)}
          isPending={saveMutation.isPending}
          isError={saveMutation.isError}
        />
      )}
    </div>
  );
}

/** Org-wide AI keys + model + the personal-key lock. Admin only. */
function OrgAIConfigSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["org-analysis-settings"],
    queryFn: () => orgAnalysisSettingsApi.get().then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: AnalysisSettingsUpdate) => orgAnalysisSettingsApi.update(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-analysis-settings"] }),
  });

  const lockMutation = useMutation({
    mutationFn: (lock: boolean) => orgAnalysisSettingsApi.update({ lock_member_api_keys: lock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-analysis-settings"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-settings"] });
    },
  });

  const locked = settings?.lock_member_api_keys === true;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-xs)" }}>
        <Building2 size={16} style={{ color: "var(--ls-primary)" }} />
        <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Organization AI Configuration</h3>
      </div>
      <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 0, marginBottom: "var(--ls-space-md)" }}>
        Shared API key and model used by everyone in your organization who doesn't have their own.
      </p>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ls-space-md)",
        padding: "var(--ls-space-md)", backgroundColor: "var(--ls-surface-2)",
        borderRadius: "var(--ls-radius-md)", marginBottom: "var(--ls-space-md)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ls-space-sm)" }}>
          <Lock size={16} style={{ marginTop: 2, color: "var(--ls-text-secondary)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 600 }}>Lock members to the organization key</div>
            <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2, maxWidth: 460 }}>
              When on, all members — including other admins — use this key and model. Personal keys and models
              are ignored. When off, admins and permitted users may use their own.
            </div>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={locked}
          onClick={() => lockMutation.mutate(!locked)}
          disabled={lockMutation.isPending}
          title={locked ? "Unlock personal keys" : "Lock to organization key"}
          style={{
            position: "relative", width: 44, height: 24, borderRadius: 999, border: "none",
            backgroundColor: locked ? "var(--ls-primary)" : "var(--ls-border)",
            cursor: lockMutation.isPending ? "not-allowed" : "pointer", flexShrink: 0,
            transition: "background-color var(--ls-transition-fast)", opacity: lockMutation.isPending ? 0.7 : 1,
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: locked ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
            backgroundColor: "#fff", transition: "left var(--ls-transition-fast)",
          }} />
        </button>
      </div>

      <AIConfigForm
        settings={settings}
        onSave={(data) => saveMutation.mutate(data)}
        isPending={saveMutation.isPending}
        isError={saveMutation.isError}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "var(--ls-space-lg)",
  backgroundColor: "var(--ls-surface)",
  border: "1px solid var(--ls-border)",
  borderRadius: "var(--ls-radius-lg)",
  marginBottom: "var(--ls-space-lg)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: "var(--ls-space-md)",
  fontSize: "var(--ls-text-sm)",
  color: "var(--ls-text-secondary)",
};

interface AIConfigFormProps {
  settings: UserAnalysisSettings | OrganizationAnalysisSettings | undefined;
  onSave: (data: AnalysisSettingsUpdate) => void;
  isPending: boolean;
  isError: boolean;
}

/** Shared provider + model + per-provider key inputs. Used by the personal and org sections. */
function AIConfigForm({ settings, onSave, isPending, isError }: AIConfigFormProps) {
  const [provider, setProvider] = useState<AIProvider | "">("");
  const [model, setModel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [saved, setSaved] = useState(false);

  const activeProvider = provider || settings?.default_provider || "anthropic";

  const providerHasKey = settings && (
    (activeProvider === "anthropic" && settings.anthropic_api_key_display) ||
    (activeProvider === "openai" && settings.openai_api_key_display) ||
    (activeProvider === "gemini" && settings.gemini_api_key_display)
  );

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
    const data: AnalysisSettingsUpdate = {};
    if (activeProvider) data.default_provider = activeProvider;
    data.default_model = model || activeModel;
    if (anthropicKey) data.anthropic_api_key = anthropicKey;
    if (openaiKey) data.openai_api_key = openaiKey;
    if (geminiKey) data.gemini_api_key = geminiKey;
    onSave(data);
    setAnthropicKey("");
    setOpenaiKey("");
    setGeminiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ls-space-md)" }}>
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
          {activeProvider === "gemini" && providerHasKey && (
            <span style={{
              fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 6, display: "block", lineHeight: 1.5,
            }}>
              <strong>Flash</strong> is recommended for most chains of title — typed deeds, recording stamps,
              and standard cursive read at the same accuracy as Pro for a fraction of the cost.
              Select <strong>Pro</strong> when working with heavy 1800s handwritten transcripts,
              water-damaged scans, or otherwise difficult source documents.
            </span>
          )}
        </div>

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
            disabled={isPending}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
              padding: "8px 16px", borderRadius: "var(--ls-radius-md)",
              border: "none", backgroundColor: "var(--ls-primary)",
              color: "#fff", fontSize: "var(--ls-text-sm)", fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {isPending ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
          {isError && (
            <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-error)" }}>
              Failed to save settings
            </span>
          )}
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
