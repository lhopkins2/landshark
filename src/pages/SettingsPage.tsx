import { useRef, useState } from "react";
import { Sun, Moon, LogOut, Save, Check, RefreshCw, Info, Upload, Trash2, FileText, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore, selectHasApiKeyAccess } from "../stores/authStore";
import { analysisSettingsApi, formTemplatesApi, type AnalysisSettingsUpdate } from "../api/analysis";
import { AI_PROVIDERS, AI_MODELS } from "../utils/constants";
import type { AIProvider, FormTemplate } from "../types/models";
import { formatFileSize } from "../utils/format";

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

      <TemplatesSection />

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
    mutationFn: (data: AnalysisSettingsUpdate) => analysisSettingsApi.update(data),
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

function TemplatesSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["form-templates"],
    queryFn: () => formTemplatesApi.list().then((r) => r.data.results),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      return formTemplatesApi.upload(fd).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
      setUploadName("");
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string; file?: string[] } } })?.response?.data;
      setUploadError(detail?.detail ?? detail?.file?.[0] ?? "Upload failed.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => formTemplatesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["form-templates"] }),
  });

  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("Pick a .docx file first.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setUploadError("Only .docx files are supported.");
      return;
    }
    const name = uploadName.trim() || file.name.replace(/\.docx$/i, "");
    uploadMutation.mutate({ file, name });
  };

  return (
    <div style={{
      padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
      marginBottom: "var(--ls-space-lg)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--ls-space-md)" }}>
        <div>
          <h3 style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", margin: 0 }}>
            COT Templates
          </h3>
          <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 4, marginBottom: 0 }}>
            DOCX templates with{" "}
            <code style={{ fontFamily: "var(--ls-font-mono)", fontSize: "var(--ls-text-xs)" }}>{"{{ placeholders }}"}</code>{" "}
            and a <code style={{ fontFamily: "var(--ls-font-mono)", fontSize: "var(--ls-text-xs)" }}>{"{%tr for inst in instruments %}"}</code>{" "}
            loop. Download the starter, restyle in Word, re-upload.
          </p>
        </div>
        <button
          type="button"
          onClick={() => formTemplatesApi.downloadStarter()}
          style={{
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            padding: "6px 12px", borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
            fontSize: "var(--ls-text-xs)", fontWeight: 600, cursor: "pointer",
            color: "var(--ls-text-secondary)",
          }}
        >
          <Download size={12} /> Download starter
        </button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Loading\u2026</div>
      ) : templates.length === 0 ? (
        <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginBottom: "var(--ls-space-md)" }}>
          No templates yet. Default plain-layout export is used until you upload one.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--ls-space-md) 0", display: "grid", gap: 6 }}>
          {templates.map((t: FormTemplate) => (
            <li
              key={t.id}
              style={{
                display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
                padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              }}
            >
              <FileText size={14} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </div>
                <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                  {t.original_filename} &middot; {formatFileSize(t.file_size)}
                  {t.uploaded_by_name && <> &middot; {t.uploaded_by_name}</>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate(t.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                title="Delete template"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
                  border: "1px solid var(--ls-border)", backgroundColor: "transparent",
                  color: "var(--ls-error)", cursor: "pointer", flexShrink: 0,
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{
        display: "grid", gap: 8, padding: "var(--ls-space-md)",
        borderRadius: "var(--ls-radius-md)", border: "1px dashed var(--ls-border)",
        backgroundColor: "var(--ls-bg)",
      }}>
        <div style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-secondary)" }}>
          Upload a new template
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text)" }}
          />
          <input
            type="text"
            placeholder="Template name (optional)"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            style={{
              flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-surface)",
              fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)",
            }}
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 12px", borderRadius: "var(--ls-radius-md)",
              border: "none", backgroundColor: "var(--ls-primary)",
              color: "var(--ls-text-on-primary)", fontSize: "var(--ls-text-sm)", fontWeight: 600,
              cursor: uploadMutation.isPending ? "wait" : "pointer",
              opacity: uploadMutation.isPending ? 0.7 : 1,
            }}
          >
            <Upload size={14} /> {uploadMutation.isPending ? "Uploading\u2026" : "Upload"}
          </button>
        </div>
        {uploadError && (
          <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-error)" }}>{uploadError}</div>
        )}
      </div>
    </div>
  );
}
