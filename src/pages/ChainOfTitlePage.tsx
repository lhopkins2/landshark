import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2, Upload, FileText, Search, Plus, Trash2, X, Pencil,
  Play, Loader, AlertTriangle, ChevronDown, Clock, CheckCircle, XCircle, Download, Info,
} from "lucide-react";
import { documentsApi } from "../api/documents";
import { formTemplatesApi, analysesApi, analysisSettingsApi } from "../api/analysis";
import { ANALYSIS_ORDERS, ANALYSIS_STATUSES, PROGRESS_STEPS, PROGRESS_STEP_ORDER } from "../utils/constants";
import type { Document, FormTemplate, COTAnalysis, AnalysisOrder, OutputFormat } from "../types/models";

export default function ChainOfTitlePage() {
  const queryClient = useQueryClient();

  // Document selection
  const [docMode, setDocMode] = useState<"existing" | "upload">("existing");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");

  // Form template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);

  // Analysis options
  const [analysisOrder, setAnalysisOrder] = useState<AnalysisOrder>("chronological");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf");
  const [customRequest, setCustomRequest] = useState("");
  const [showPdfWarning, setShowPdfWarning] = useState(false);

  // Result
  const [currentResult, setCurrentResult] = useState<COTAnalysis | null>(null);

  // Progress tracking
  const [pollingAnalysisId, setPollingAnalysisId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Queries
  const docParams: Record<string, string> = {};
  if (docSearch) docParams.search = docSearch;

  const { data: docsData } = useQuery({
    queryKey: ["documents", docParams],
    queryFn: () => documentsApi.list(Object.keys(docParams).length > 0 ? docParams : undefined),
    select: (res) => res.data,
  });

  const { data: templatesData } = useQuery({
    queryKey: ["form-templates"],
    queryFn: () => formTemplatesApi.list(),
    select: (res) => res.data,
  });

  const { data: pastAnalyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: () => analysesApi.list(),
    select: (res) => res.data,
  });

  const { data: settings } = useQuery({
    queryKey: ["analysis-settings"],
    queryFn: () => analysisSettingsApi.get().then((r) => r.data),
  });

  const documents = docsData?.results ?? [];
  const templates = templatesData?.results ?? [];
  const analyses = pastAnalyses?.results ?? [];
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const selectedTemplateIsDocx = selectedTemplate?.original_filename?.toLowerCase().endsWith(".docx") ?? false;

  // Check if the default provider has an API key configured
  const defaultProvider = settings?.default_provider || "anthropic";
  const providerKeyMap: Record<string, boolean> = {
    anthropic: !!settings?.anthropic_api_key_display,
    openai: !!settings?.openai_api_key_display,
    gemini: !!settings?.gemini_api_key_display,
  };
  const hasApiKey = providerKeyMap[defaultProvider] ?? false;

  // Upload document with metadata popup
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadMeta, setShowUploadMeta] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadDocMutation = useMutation({
    mutationFn: (data: { file: File; tract_number: string; last_record_holder: string }) => {
      const fd = new FormData();
      fd.append("file", data.file);
      if (data.tract_number) fd.append("tract_number", data.tract_number);
      if (data.last_record_holder) fd.append("last_record_holder", data.last_record_holder);
      return documentsApi.upload(fd);
    },
    onSuccess: (res) => {
      setSelectedDocId(res.data.id);
      setDocMode("existing");
      setUploadFile(null);
      setShowUploadMeta(false);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  // Edit document metadata
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const editDocMutation = useMutation({
    mutationFn: (data: { id: string; tract_number: string; last_record_holder: string }) =>
      documentsApi.update(data.id, { tract_number: data.tract_number, last_record_holder: data.last_record_holder }),
    onSuccess: () => {
      setEditingDoc(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  // Analyze mutation — returns immediately, then we poll
  const analyzeMutation = useMutation({
    mutationFn: () => {
      if (!selectedDocId) throw new Error("Select a document");
      return analysesApi.run({
        document_id: selectedDocId,
        form_template_id: selectedTemplateId || null,
        analysis_order: analysisOrder,
        output_format: outputFormat,
        custom_request: customRequest || undefined,
      });
    },
    onSuccess: (res) => {
      hasHandledCompletion.current = false;
      setPollingAnalysisId(res.data.id);
      setElapsedSeconds(0);
      setCurrentResult(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: COTAnalysis } };
      if (axiosErr?.response?.data?.id) {
        setCurrentResult(axiosErr.response.data);
      }
    },
  });

  // Poll for analysis progress
  const { data: polledAnalysis, refetch: refetchProgress } = useQuery({
    queryKey: ["analysis-progress", pollingAnalysisId],
    queryFn: () => analysesApi.get(pollingAnalysisId!).then((r) => r.data),
    enabled: !!pollingAnalysisId,
  });

  // Derived polling state
  const pollingDone = polledAnalysis?.status === "completed" || polledAnalysis?.status === "failed";
  const isAnalyzing = !!pollingAnalysisId && !pollingDone;

  // Manual polling — more robust than refetchInterval under React 19 Strict Mode
  useEffect(() => {
    if (!pollingAnalysisId || pollingDone) return;
    const interval = setInterval(() => { refetchProgress(); }, 2000);
    return () => clearInterval(interval);
  }, [pollingAnalysisId, pollingDone, refetchProgress]);

  // When polling completes, persist the result and refresh lists
  const hasHandledCompletion = useRef(false);
  useEffect(() => {
    if (pollingDone && polledAnalysis && !hasHandledCompletion.current) {
      hasHandledCompletion.current = true;
      setCurrentResult(polledAnalysis);
      setElapsedSeconds(0);
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  }, [pollingDone, polledAnalysis, queryClient]);

  // Elapsed timer
  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const canAnalyze = selectedDocId && hasApiKey && !analyzeMutation.isPending && !isAnalyzing;

  return (
    <div>
      <div style={{ marginBottom: "var(--ls-space-xl)" }}>
        <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Chain of Title</h2>
        <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
          Analyze chain of title documents using AI
        </p>
      </div>

      {/* API Key Warning */}
      {settings && !hasApiKey && (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
          padding: "var(--ls-space-md)", marginBottom: "var(--ls-space-lg)",
          backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)",
          borderRadius: "var(--ls-radius-md)", fontSize: "var(--ls-text-sm)",
        }}>
          <AlertTriangle size={16} style={{ color: "#eab308", flexShrink: 0 }} />
          <span>
            No API key configured for {settings.default_provider}.{" "}
            <a href="/settings" style={{ color: "var(--ls-primary)", fontWeight: 600, textDecoration: "underline" }}>
              Add one in Settings
            </a>
          </span>
        </div>
      )}

      {/* Section 1: Document Selection */}
      <SectionCard title="1. Select Document">
        <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
          <TabButton active={docMode === "existing"} onClick={() => setDocMode("existing")}>Select Existing</TabButton>
          <TabButton active={docMode === "upload"} onClick={() => setDocMode("upload")}>Upload New</TabButton>
        </div>

        {docMode === "existing" ? (
          <div>
            <div style={{ position: "relative", marginBottom: "var(--ls-space-sm)" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ls-text-muted)" }} />
              <input
                type="text"
                placeholder="Search documents..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px 8px 36px",
                  borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)",
                  backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none",
                }}
              />
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", display: "grid", gap: "var(--ls-space-xs)" }}>
              {documents.length === 0 ? (
                <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-md)", textAlign: "center" }}>
                  No documents found
                </p>
              ) : documents.map((doc) => (
                <DocSelectItem
                  key={doc.id}
                  document={doc}
                  selected={selectedDocId === doc.id}
                  onSelect={() => setSelectedDocId(doc.id)}
                  onEdit={() => setEditingDoc(doc)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div
              onClick={() => uploadFileRef.current?.click()}
              style={{
                border: "2px dashed var(--ls-border)", borderRadius: "var(--ls-radius-md)",
                padding: "var(--ls-space-lg)", textAlign: "center", cursor: "pointer",
                backgroundColor: uploadFile ? "rgba(34,197,94,0.05)" : undefined,
              }}
            >
              <input
                ref={uploadFileRef}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                  if (f) setShowUploadMeta(true);
                }}
                style={{ display: "none" }}
              />
              <Upload size={24} style={{ margin: "0 auto var(--ls-space-sm)", color: "var(--ls-text-muted)" }} />
              {uploadFile ? (
                <p style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>
              ) : (
                <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Click to select a file</p>
              )}
            </div>
          </div>
        )}

        {/* Upload metadata popup */}
        {showUploadMeta && uploadFile && (
          <DocMetadataModal
            title="Upload Document"
            fileName={uploadFile.name}
            fileSize={uploadFile.size}
            initialTract=""
            initialHolder=""
            isPending={uploadDocMutation.isPending}
            onSave={(tract, holder) => uploadDocMutation.mutate({ file: uploadFile, tract_number: tract, last_record_holder: holder })}
            onClose={() => { setShowUploadMeta(false); setUploadFile(null); }}
          />
        )}

        {/* Edit document metadata popup */}
        {editingDoc && (
          <DocMetadataModal
            title="Edit Document Details"
            fileName={editingDoc.original_filename}
            fileSize={editingDoc.file_size}
            initialTract={editingDoc.tract_number}
            initialHolder={editingDoc.last_record_holder}
            isPending={editDocMutation.isPending}
            onSave={(tract, holder) => editDocMutation.mutate({ id: editingDoc.id, tract_number: tract, last_record_holder: holder })}
            onClose={() => setEditingDoc(null)}
          />
        )}

        {selectedDocId && (
          <div style={{
            marginTop: "var(--ls-space-sm)", padding: "var(--ls-space-sm) var(--ls-space-md)",
            backgroundColor: "rgba(34,197,94,0.06)", borderRadius: "var(--ls-radius-md)",
            display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
            fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)",
          }}>
            <CheckCircle size={14} style={{ color: "#22c55e" }} />
            Document selected: {documents.find((d) => d.id === selectedDocId)?.original_filename ?? "..."}
          </div>
        )}
      </SectionCard>

      {/* Section 2: Form Template */}
      <SectionCard title="2. Select Form Template">
        {showTemplateUpload ? (
          <TemplateUploadForm
            onClose={() => setShowTemplateUpload(false)}
            onUploaded={(id) => {
              setSelectedTemplateId(id);
              setShowTemplateUpload(false);
              queryClient.invalidateQueries({ queryKey: ["form-templates"] });
            }}
          />
        ) : (
          <div>
            <div style={{ display: "flex", gap: "var(--ls-space-sm)", alignItems: "center", marginBottom: "var(--ls-space-sm)" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <select
                  value={selectedTemplateId ?? ""}
                  onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                    fontSize: "var(--ls-text-sm)", cursor: "pointer", appearance: "none",
                    paddingRight: 32, color: "var(--ls-text)",
                  }}
                >
                  <option value="">No Form (Generic Table)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.original_filename})</option>
                  ))}
                </select>
                <ChevronDown size={16} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ls-text-muted)" }} />
              </div>
              <button
                onClick={() => setShowTemplateUpload(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
                  padding: "8px 16px", borderRadius: "var(--ls-radius-md)",
                  border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                  fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text)",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={14} /> Add Template
              </button>
            </div>

            {templates.length === 0 && (
              <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", textAlign: "center", padding: "var(--ls-space-md)" }}>
                No custom templates yet. The generic table format will be used, or upload a form template.
              </p>
            )}

            {/* Template list for management */}
            {templates.length > 0 && (
              <div style={{ display: "grid", gap: "var(--ls-space-xs)", marginTop: "var(--ls-space-sm)" }}>
                {templates.map((t) => (
                  <TemplateItem
                    key={t.id}
                    template={t}
                    selected={selectedTemplateId === t.id}
                    onSelect={() => setSelectedTemplateId(t.id)}
                    onDelete={() => {
                      if (selectedTemplateId === t.id) setSelectedTemplateId(null);
                      formTemplatesApi.delete(t.id).then(() =>
                        queryClient.invalidateQueries({ queryKey: ["form-templates"] })
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Section 3: Analysis Options */}
      <SectionCard title="3. Analysis Options">
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Analysis Order
          </label>
          <div style={{ position: "relative", maxWidth: 320 }}>
            <select
              value={analysisOrder}
              onChange={(e) => setAnalysisOrder(e.target.value as AnalysisOrder)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                fontSize: "var(--ls-text-sm)", cursor: "pointer", appearance: "none",
                paddingRight: 32, color: "var(--ls-text)",
              }}
            >
              {Object.entries(ANALYSIS_ORDERS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <ChevronDown size={16} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ls-text-muted)" }} />
          </div>
        </div>

        <div style={{ marginTop: "var(--ls-space-md)" }}>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Custom Request <span style={{ fontWeight: 400, color: "var(--ls-text-muted)" }}>(optional)</span>
          </label>
          <textarea
            value={customRequest}
            onChange={(e) => setCustomRequest(e.target.value)}
            placeholder="Add specific instructions for this analysis (e.g., &quot;Only extract warranty deeds&quot;, &quot;Include mortgage assignments&quot;, &quot;Flag any gaps in the chain&quot;)..."
            rows={3}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", color: "var(--ls-text)",
              resize: "vertical", fontFamily: "inherit",
            }}
          />
          <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 4 }}>
            These instructions will be prioritized by the AI during analysis.
          </p>
        </div>
      </SectionCard>

      {/* Analyze Button + Format Selector */}
      <div style={{ marginBottom: "var(--ls-space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)" }}>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={!canAnalyze}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
              padding: "12px 32px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: canAnalyze ? "var(--ls-primary)" : "var(--ls-border)",
              color: canAnalyze ? "var(--ls-text-on-primary)" : "var(--ls-text-muted)",
              fontWeight: 700, fontSize: "var(--ls-text-base)", border: "none",
              cursor: canAnalyze ? "pointer" : "not-allowed",
            }}
          >
            {analyzeMutation.isPending ? (
              <><Loader size={18} className="spin" /> Starting...</>
            ) : isAnalyzing ? (
              <><Loader size={18} className="spin" /> Analyzing...</>
            ) : (
              <><Play size={18} /> Analyze</>
            )}
          </button>
          <div style={{ position: "relative", display: "flex", borderRadius: "var(--ls-radius-md)", overflow: "visible", border: "1px solid var(--ls-border)" }}>
            {(["pdf", "docx"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => {
                  if (fmt === "pdf" && selectedTemplateIsDocx) {
                    setShowPdfWarning(true);
                    setTimeout(() => setShowPdfWarning(false), 4000);
                    return;
                  }
                  setOutputFormat(fmt);
                  setShowPdfWarning(false);
                }}
                style={{
                  padding: "10px 16px", border: "none",
                  backgroundColor: (selectedTemplateIsDocx ? fmt === "docx" : outputFormat === fmt) ? "var(--ls-primary)" : "var(--ls-bg)",
                  color: (selectedTemplateIsDocx ? fmt === "docx" : outputFormat === fmt) ? "var(--ls-text-on-primary)" : "var(--ls-text-secondary)",
                  fontWeight: (selectedTemplateIsDocx ? fmt === "docx" : outputFormat === fmt) ? 700 : 400,
                  fontSize: "var(--ls-text-sm)", cursor: fmt === "pdf" && selectedTemplateIsDocx ? "not-allowed" : "pointer",
                  borderRight: fmt === "pdf" ? "1px solid var(--ls-border)" : "none",
                  borderRadius: fmt === "pdf" ? "var(--ls-radius-md) 0 0 var(--ls-radius-md)" : "0 var(--ls-radius-md) var(--ls-radius-md) 0",
                  opacity: fmt === "pdf" && selectedTemplateIsDocx ? 0.5 : 1,
                }}
              >
                {fmt === "pdf" ? "PDF" : "DOCX"}
              </button>
            ))}
            {showPdfWarning && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 10,
                backgroundColor: "var(--ls-bg-card)", border: "1px solid var(--ls-warning, #e6a817)",
                borderRadius: "var(--ls-radius-md)", padding: "10px 14px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)", width: 280,
                fontSize: "var(--ls-text-xs)", color: "var(--ls-text-secondary)", lineHeight: 1.5,
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <AlertTriangle size={16} style={{ color: "var(--ls-warning, #e6a817)", flexShrink: 0, marginTop: 1 }} />
                  <span>
                    PDF output is not available when using a DOCX form template. The output must be DOCX to preserve the template's exact formatting, images, and layout.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        {!selectedDocId && <HintText>Select a document above</HintText>}
        {selectedDocId && !hasApiKey && <HintText>Configure an API key in Settings</HintText>}
      </div>

      {/* Progress Tracker */}
      {isAnalyzing && polledAnalysis && (
        <AnalysisProgressTracker analysis={polledAnalysis} elapsedSeconds={elapsedSeconds} />
      )}

      {/* Current Result */}
      {(currentResult || (pollingDone && polledAnalysis)) && (
        <SectionCard title="Result">
          <AnalysisResultCard analysis={(currentResult || polledAnalysis)!} />
        </SectionCard>
      )}

      {/* Past Analyses */}
      {analyses.length > 0 && (
        <SectionCard title="Past Analyses">
          <div style={{ display: "grid", gap: "var(--ls-space-xs)" }}>
            {analyses.map((a) => (
              <PastAnalysisItem
                key={a.id}
                analysis={a}
                onView={() => setCurrentResult(a)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// -- Subcomponents --

function AnalysisProgressTracker({ analysis, elapsedSeconds }: { analysis: COTAnalysis; elapsedSeconds: number }) {
  const steps = PROGRESS_STEP_ORDER;
  const currentIndex = steps.indexOf(analysis.progress_step as typeof steps[number]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div style={{
      padding: "var(--ls-space-lg)", backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)",
      marginBottom: "var(--ls-space-lg)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "var(--ls-space-md)",
      }}>
        <h3 style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
          Analysis in Progress
        </h3>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "var(--ls-space-xs)",
          fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)",
        }}>
          <Clock size={12} />
          {formatTime(elapsedSeconds)}
        </span>
      </div>

      <div style={{ display: "grid", gap: "var(--ls-space-xs)" }}>
        {steps.map((step, index) => {
          const info = PROGRESS_STEPS[step];
          const isComplete = step === "complete"
            ? analysis.progress_step === "complete"
            : currentIndex > index;
          const isCurrent = step === analysis.progress_step;
          const isPending = !isComplete && !isCurrent;

          return (
            <div
              key={step}
              style={{
                display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
                padding: "var(--ls-space-sm) var(--ls-space-md)",
                borderRadius: "var(--ls-radius-md)",
                backgroundColor: isCurrent ? "rgba(59,130,246,0.06)" : isComplete ? "rgba(34,197,94,0.04)" : "transparent",
                border: isCurrent ? "1px solid rgba(59,130,246,0.2)" : "1px solid transparent",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                {isComplete ? (
                  <CheckCircle size={18} style={{ color: "#22c55e" }} />
                ) : isCurrent ? (
                  <Loader size={18} className="spin" style={{ color: "#3b82f6" }} />
                ) : (
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid var(--ls-border)",
                  }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "var(--ls-text-sm)",
                  fontWeight: isCurrent ? 600 : 400,
                  color: isPending ? "var(--ls-text-muted)" : "var(--ls-text)",
                }}>
                  {info.label}
                </div>
                {isCurrent && (
                  <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
                    {info.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "var(--ls-space-lg)", backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)",
      marginBottom: "var(--ls-space-lg)",
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px", borderRadius: "var(--ls-radius-md)",
        border: active ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
        backgroundColor: active ? "rgba(139,105,20,0.08)" : "transparent",
        color: active ? "var(--ls-primary)" : "var(--ls-text-secondary)",
        fontSize: "var(--ls-text-sm)", fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function DocSelectItem({ document: doc, selected, onSelect, onEdit }: {
  document: Document; selected: boolean; onSelect: () => void; onEdit: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-sm) var(--ls-space-md)", cursor: "pointer",
        borderRadius: "var(--ls-radius-md)",
        border: selected ? "1px solid var(--ls-primary)" : "1px solid transparent",
        backgroundColor: selected ? "rgba(139,105,20,0.06)" : "var(--ls-bg)",
      }}
    >
      <FileText size={16} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.original_filename}
        </div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {formatFileSize(doc.file_size)}
          {doc.tract_number && <> &middot; Tract {doc.tract_number}</>}
          {doc.last_record_holder && <> &middot; {doc.last_record_holder}</>}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        style={{
          display: "flex", alignItems: "center", padding: 4, borderRadius: "var(--ls-radius-sm)",
          border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--ls-text-muted)",
        }}
        title="Edit details"
      >
        <Pencil size={14} />
      </button>
      {selected && <CheckCircle size={16} style={{ color: "var(--ls-primary)", flexShrink: 0 }} />}
    </div>
  );
}

function TemplateItem({ template, selected, onSelect, onDelete }: {
  template: FormTemplate; selected: boolean; onSelect: () => void; onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-sm) var(--ls-space-md)", cursor: "pointer",
        borderRadius: "var(--ls-radius-md)",
        border: selected ? "1px solid var(--ls-primary)" : "1px solid transparent",
        backgroundColor: selected ? "rgba(139,105,20,0.06)" : "var(--ls-bg)",
      }}
    >
      <FileText size={16} style={{ color: "var(--ls-accent)", flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{template.name}</div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {template.original_filename} &middot; {formatFileSize(template.file_size)}
        </div>
      </div>
      {selected && <CheckCircle size={16} style={{ color: "var(--ls-primary)", flexShrink: 0, marginRight: 4 }} />}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          display: "flex", alignItems: "center", padding: 4, borderRadius: "var(--ls-radius-sm)",
          border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--ls-text-muted)",
        }}
        title="Delete template"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TemplateUploadForm({ onClose, onUploaded }: { onClose: () => void; onUploaded: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file || !name) throw new Error("Name and file required");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      if (description) fd.append("description", description);
      return formTemplatesApi.upload(fd);
    },
    onSuccess: (res) => onUploaded(res.data.id),
    onError: () => setError("Failed to upload template. Only PDF and DOCX files are allowed."),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-md)" }}>
        <span style={{ fontWeight: 500, fontSize: "var(--ls-text-sm)" }}>Upload New Template</span>
        <button onClick={onClose} style={{ display: "flex", border: "none", background: "none", cursor: "pointer", color: "var(--ls-text-muted)" }}>
          <X size={16} />
        </button>
      </div>
      {error && <p style={{ color: "var(--ls-error)", fontSize: "var(--ls-text-xs)", marginBottom: "var(--ls-space-sm)" }}>{error}</p>}

      <div style={{ display: "grid", gap: "var(--ls-space-sm)" }}>
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Template Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard COT Form"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", outline: "none",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            File (DOCX) *
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed var(--ls-border)", borderRadius: "var(--ls-radius-md)",
              padding: "var(--ls-space-md)", textAlign: "center", cursor: "pointer",
              backgroundColor: file ? "rgba(34,197,94,0.05)" : undefined,
            }}
          >
            <input ref={fileRef} type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
            {file ? (
              <p style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{file.name}</p>
            ) : (
              <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Click to select DOCX file</p>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6 }}>
            <Info size={13} style={{ color: "var(--ls-text-muted)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", lineHeight: 1.4 }}>
              DOCX templates preserve exact formatting, images, and layout in the output. PDF files cannot be used as form templates.
            </span>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Description (optional)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this template..."
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-md)" }}>
        <button
          onClick={() => mutation.mutate()}
          disabled={!file || !name || mutation.isPending}
          style={{
            padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
            backgroundColor: (!file || !name) ? "var(--ls-border)" : "var(--ls-primary)",
            color: (!file || !name) ? "var(--ls-text-muted)" : "var(--ls-text-on-primary)",
            fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none",
            cursor: (!file || !name) ? "not-allowed" : "pointer",
          }}
        >
          {mutation.isPending ? "Uploading..." : "Upload Template"}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
            backgroundColor: "transparent", color: "var(--ls-text-secondary)",
            fontWeight: 500, fontSize: "var(--ls-text-sm)", border: "1px solid var(--ls-border)", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AnalysisResultCard({ analysis }: { analysis: COTAnalysis }) {
  const isError = analysis.status === "failed";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
        <StatusBadge status={analysis.status} />
        {analysis.ai_provider && (
          <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
            via {analysis.ai_provider}
          </span>
        )}
        {analysis.document_name && (
          <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
            &middot; {analysis.document_name}
          </span>
        )}
      </div>

      {/* Generated Document Link */}
      {analysis.generated_document_url && analysis.generated_document_name && (
        <a
          href={analysis.generated_document_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
            padding: "var(--ls-space-sm) var(--ls-space-md)", marginBottom: "var(--ls-space-md)",
            backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: "var(--ls-radius-md)", textDecoration: "none", color: "var(--ls-text)",
            cursor: "pointer",
          }}
        >
          <Download size={16} style={{ color: "#22c55e", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 600 }}>
              {analysis.generated_document_name}
            </div>
            <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
              Click to view/download &middot; {analysis.output_format?.toUpperCase()}
            </div>
          </div>
          <FileText size={16} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
        </a>
      )}

      {isError ? (
        <div style={{
          padding: "var(--ls-space-md)", backgroundColor: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--ls-radius-md)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-xs)", marginBottom: "var(--ls-space-xs)" }}>
            <AlertTriangle size={14} style={{ color: "#ef4444" }} />
            <span style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)", color: "#ef4444" }}>Analysis Failed</span>
          </div>
          <pre style={{
            fontSize: "var(--ls-text-xs)", color: "var(--ls-text-secondary)",
            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
            fontFamily: "var(--ls-font-mono)",
          }}>
            {analysis.error_message || "Unknown error"}
          </pre>
        </div>
      ) : (
        <div style={{
          padding: "var(--ls-space-md)", backgroundColor: "var(--ls-bg)",
          border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-md)",
          maxHeight: 500, overflowY: "auto",
        }}>
          <pre style={{
            fontSize: "var(--ls-text-sm)", color: "var(--ls-text)",
            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
            fontFamily: "var(--ls-font-mono)", lineHeight: 1.6,
          }}>
            {analysis.result_text || "No result text available."}
          </pre>
        </div>
      )}
    </div>
  );
}

function PastAnalysisItem({ analysis, onView }: { analysis: COTAnalysis; onView: () => void }) {
  return (
    <div
      onClick={onView}
      style={{
        display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-sm) var(--ls-space-md)", cursor: "pointer",
        borderRadius: "var(--ls-radius-md)", backgroundColor: "var(--ls-bg)",
      }}
    >
      <Clock size={14} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {analysis.document_name ?? "Unknown document"}
          {analysis.form_template_name && <span style={{ color: "var(--ls-text-muted)" }}> &rarr; {analysis.form_template_name}</span>}
        </div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {new Date(analysis.created_at).toLocaleString()}
          {analysis.ai_provider && <> &middot; {analysis.ai_provider}</>}
        </div>
      </div>
      <StatusBadge status={analysis.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    completed: { bg: "rgba(34,197,94,0.1)", text: "#22c55e", icon: <CheckCircle size={12} /> },
    failed: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", icon: <XCircle size={12} /> },
    processing: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6", icon: <Loader size={12} className="spin" /> },
    pending: { bg: "rgba(234,179,8,0.1)", text: "#eab308", icon: <Clock size={12} /> },
  };
  const c = colors[status] ?? colors.pending;
  const label = ANALYSIS_STATUSES[status as keyof typeof ANALYSIS_STATUSES] ?? status;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: "var(--ls-radius-full)",
      backgroundColor: c.bg, color: c.text, fontSize: "var(--ls-text-xs)", fontWeight: 600,
    }}>
      {c.icon} {label}
    </span>
  );
}

function HintText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
      {children}
    </p>
  );
}

function DocMetadataModal({ title, fileName, fileSize, initialTract, initialHolder, isPending, onSave, onClose }: {
  title: string;
  fileName: string;
  fileSize: number;
  initialTract: string;
  initialHolder: string;
  isPending: boolean;
  onSave: (tractNumber: string, lastRecordHolder: string) => void;
  onClose: () => void;
}) {
  const [tract, setTract] = useState(initialTract);
  const [holder, setHolder] = useState(initialHolder);

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
    border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
    fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.4)",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--ls-surface)", borderRadius: "var(--ls-radius-lg)",
          border: "1px solid var(--ls-border)", padding: "var(--ls-space-lg)",
          width: 420, maxWidth: "90vw", boxShadow: "var(--ls-shadow-xl)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-md)" }}>
          <h3 style={{ fontWeight: 600, fontSize: "var(--ls-text-base)" }}>{title}</h3>
          <button onClick={onClose} style={{ display: "flex", border: "none", background: "none", cursor: "pointer", color: "var(--ls-text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
          padding: "var(--ls-space-sm) var(--ls-space-md)", marginBottom: "var(--ls-space-md)",
          backgroundColor: "var(--ls-bg)", borderRadius: "var(--ls-radius-md)",
        }}>
          <FileText size={16} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName}
            </div>
            <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>{formatFileSize(fileSize)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
          <div>
            <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
              Tract Number
            </label>
            <input value={tract} onChange={(e) => setTract(e.target.value)} placeholder="e.g. 12345" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
              Last Record Holder
            </label>
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="e.g. John Smith" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--ls-space-sm)" }}>
          <button
            onClick={() => onSave(tract, holder)}
            disabled={isPending}
            style={{
              padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)",
              fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none",
              cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "transparent", color: "var(--ls-text-secondary)",
              fontWeight: 500, fontSize: "var(--ls-text-sm)", border: "1px solid var(--ls-border)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
