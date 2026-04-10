import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, Search, X, Pencil,
  Play, Loader, AlertTriangle, ChevronDown, Clock, CheckCircle, XCircle, Download, Eye,
  Folder, ChevronLeft, FolderOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { documentsApi, foldersApi } from "../api/documents";
import { analysesApi, analysisSettingsApi } from "../api/analysis";
import { ANALYSIS_ORDERS, ANALYSIS_STATUSES, PROGRESS_STEPS } from "../utils/constants";
import type { Document, DocumentFolder, COTAnalysis, AnalysisOrder, OutputFormat } from "../types/models";

export default function ChainOfTitlePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Document selection
  const [docMode, setDocMode] = useState<"existing" | "upload">("existing");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);

  // Legal description
  const [legalDescription, setLegalDescription] = useState("");

  // Analysis options
  const [analysisOrder, setAnalysisOrder] = useState<AnalysisOrder>("chronological");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf");
  const [customRequest, setCustomRequest] = useState("");

  // Result
  const [currentResult, setCurrentResult] = useState<COTAnalysis | null>(null);

  // Progress tracking
  const [pollingAnalysisId, setPollingAnalysisId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workerError, setWorkerError] = useState<string | null>(null);

  // Queries
  const docParams: Record<string, string> = {};
  if (docSearch) docParams.search = docSearch;
  if (browseFolderId) docParams.folder = browseFolderId;

  const { data: docsData } = useQuery({
    queryKey: ["documents", docParams],
    queryFn: () => documentsApi.list(Object.keys(docParams).length > 0 ? docParams : undefined),
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

  const { data: foldersData } = useQuery({
    queryKey: ["document-folders"],
    queryFn: () => foldersApi.list(),
    select: (res) => res.data,
  });

  const documents = docsData?.results ?? [];
  const analyses = pastAnalyses?.results ?? [];
  const folders = foldersData?.results ?? [];
  const currentBrowseFolder = browseFolderId ? folders.find((f) => f.id === browseFolderId) : null;

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
    mutationFn: (data: { file: File; tract_number: string; last_record_holder: string; folder_id?: string }) => {
      const fd = new FormData();
      fd.append("file", data.file);
      if (data.tract_number) fd.append("tract_number", data.tract_number);
      if (data.last_record_holder) fd.append("last_record_holder", data.last_record_holder);
      if (data.folder_id) fd.append("folder", data.folder_id);
      return documentsApi.upload(fd);
    },
    onSuccess: (res) => {
      setSelectedDocId(res.data.id);
      setDocMode("existing");
      setUploadFile(null);
      setShowUploadMeta(false);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
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
        analysis_order: analysisOrder,
        output_format: outputFormat,
        legal_description: legalDescription || undefined,
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
      const axiosErr = err as { response?: { data?: { id?: string; detail?: string } } };
      if (axiosErr?.response?.data?.id) {
        setCurrentResult(axiosErr.response.data as COTAnalysis);
      }
      // Surface 503 worker-down error clearly
      if (axiosErr?.response?.data?.detail) {
        setWorkerError(axiosErr.response.data.detail);
      }
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!pollingAnalysisId) throw new Error("No analysis to cancel");
      return analysesApi.cancel(pollingAnalysisId);
    },
    onSuccess: (res) => {
      setCurrentResult(res.data);
      setPollingAnalysisId(null);
      setElapsedSeconds(0);
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
    },
  });

  // Poll for analysis progress
  const { data: polledAnalysis, refetch: refetchProgress } = useQuery({
    queryKey: ["analysis-progress", pollingAnalysisId],
    queryFn: () => analysesApi.get(pollingAnalysisId!).then((r) => r.data),
    enabled: !!pollingAnalysisId,
  });

  // Derived polling state
  const pollingDone = polledAnalysis?.status === "completed" || polledAnalysis?.status === "failed" || polledAnalysis?.status === "cancelled";
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
      setPollingAnalysisId(null);
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  }, [pollingDone, polledAnalysis, queryClient]);

  // On first load, resume polling if an analysis is already in-progress
  // (handles page refresh mid-analysis)
  const hasResumedRef = useRef(false);
  useEffect(() => {
    if (hasResumedRef.current || pollingAnalysisId || !analyses.length) return;
    const inProgress = analyses.find((a) => a.status === "processing" || a.status === "pending");
    if (inProgress) {
      hasResumedRef.current = true;
      hasHandledCompletion.current = false;
      setPollingAnalysisId(inProgress.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses]);

  // Elapsed timer — derive from server created_at so it survives page refresh
  useEffect(() => {
    if (!isAnalyzing) return;
    function tick() {
      if (polledAnalysis?.created_at) {
        const started = new Date(polledAnalysis.created_at).getTime();
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
      } else {
        setElapsedSeconds((s) => s + 1);
      }
    }
    tick(); // set immediately so we don't wait 1s on resume
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isAnalyzing, polledAnalysis?.created_at]);

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
            {/* Folder breadcrumb */}
            {browseFolderId && currentBrowseFolder && (
              <div style={{
                display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
                marginBottom: "var(--ls-space-sm)", fontSize: "var(--ls-text-xs)",
              }}>
                <button
                  onClick={() => setBrowseFolderId(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 2,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--ls-primary)", fontWeight: 600, padding: 0, fontSize: "var(--ls-text-xs)",
                  }}
                >
                  <ChevronLeft size={14} /> All
                </button>
                <span style={{ color: "var(--ls-text-muted)" }}>/</span>
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontWeight: 600 }}>
                  <FolderOpen size={14} style={{ color: "var(--ls-primary)" }} />
                  {currentBrowseFolder.name}
                </span>
              </div>
            )}
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
            <div style={{ maxHeight: 280, overflowY: "auto", display: "grid", gap: "var(--ls-space-xs)" }}>
              {/* Folder tiles (only at root level, not while searching) */}
              {!browseFolderId && !docSearch && folders.map((folder) => (
                <div
                  key={`folder-${folder.id}`}
                  onClick={() => setBrowseFolderId(folder.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
                    padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                    border: "1px solid var(--ls-border)", cursor: "pointer",
                    backgroundColor: "var(--ls-surface)",
                  }}
                >
                  <Folder size={16} style={{ color: "var(--ls-primary)", flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--ls-text-sm)", fontWeight: 600, flex: 1 }}>{folder.name}</span>
                  <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                    {folder.document_count} file{folder.document_count !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
              {documents.length === 0 && (browseFolderId || !folders.length || docSearch) ? (
                <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", padding: "var(--ls-space-md)", textAlign: "center" }}>
                  {browseFolderId ? "This folder is empty" : "No documents found"}
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
            folders={folders}
            initialFolderId={browseFolderId || undefined}
            onSave={(tract, holder, fId) => uploadDocMutation.mutate({ file: uploadFile, tract_number: tract, last_record_holder: holder, folder_id: fId })}
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

      {/* Section 2: Legal Description */}
      <SectionCard title="2. Legal Description">
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Subject Premises Legal Description
          </label>
          <textarea
            value={legalDescription}
            onChange={(e) => setLegalDescription(e.target.value)}
            placeholder="Enter the legal description of the Subject Premises (e.g., &quot;Lot 9, Block 6, HOMESTEAD MEADOWS UNIT 6, an Addition to the County of El Paso, according to the plat thereof on file in Book 55, Page 26, Plat Records, El Paso County, Texas&quot;)..."
            rows={4}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", color: "var(--ls-text)",
              resize: "vertical", fontFamily: "inherit",
            }}
          />
          <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 4 }}>
            Used to determine "Subject Premises," "Subject Premises and more," or "NOT Subject Premises" for each instrument. If left blank, the AI will use the legal description from the document.
          </p>
        </div>
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
          <div style={{ display: "flex", borderRadius: "var(--ls-radius-md)", overflow: "hidden", border: "1px solid var(--ls-border)" }}>
            {(["pdf", "docx"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setOutputFormat(fmt)}
                style={{
                  padding: "10px 16px", border: "none",
                  backgroundColor: outputFormat === fmt ? "var(--ls-primary)" : "var(--ls-bg)",
                  color: outputFormat === fmt ? "var(--ls-text-on-primary)" : "var(--ls-text-secondary)",
                  fontWeight: outputFormat === fmt ? 700 : 400,
                  fontSize: "var(--ls-text-sm)", cursor: "pointer",
                  borderRight: fmt === "pdf" ? "1px solid var(--ls-border)" : "none",
                }}
              >
                {fmt === "pdf" ? "PDF" : "DOCX"}
              </button>
            ))}
          </div>
        </div>
        {isAnalyzing && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-xs)" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)",
            }}>
              <Clock size={12} />
              {polledAnalysis?.progress_step
                ? PROGRESS_STEPS[polledAnalysis.progress_step as keyof typeof PROGRESS_STEPS]?.label ?? "Processing..."
                : "Processing..."}
              {" · "}
              {(() => {
                const m = Math.floor(elapsedSeconds / 60);
                const s = elapsedSeconds % 60;
                return m > 0 ? `${m}m ${s}s elapsed` : `${s}s elapsed`;
              })()}
            </span>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 12px", borderRadius: "var(--ls-radius-md)",
                border: "1px solid rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.08)",
                color: "#ef4444", fontSize: "var(--ls-text-xs)", fontWeight: 600,
                cursor: cancelMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              <XCircle size={12} />
              {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        )}
        {/* Stuck on queued warning — worker likely not running */}
        {isAnalyzing && polledAnalysis?.progress_step === "queued" && elapsedSeconds > 30 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "var(--ls-space-sm)",
            padding: "var(--ls-space-sm) var(--ls-space-md)", marginTop: "var(--ls-space-sm)",
            borderRadius: "var(--ls-radius-md)",
            backgroundColor: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
            color: "var(--ls-text)", fontSize: "var(--ls-text-sm)",
          }}>
            <AlertTriangle size={16} style={{ color: "#eab308", flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ color: "#eab308" }}>Task stuck in queue</strong>
              <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
                The background worker may not be running. Start it with{" "}
                <code style={{ backgroundColor: "var(--ls-surface-2)", padding: "1px 4px", borderRadius: 3 }}>
                  python manage.py qcluster
                </code>{" "}
                and the task will be picked up automatically.
              </div>
            </div>
          </div>
        )}
        {/* Worker error from 503 */}
        {workerError && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "var(--ls-space-sm)",
            padding: "var(--ls-space-sm) var(--ls-space-md)", marginTop: "var(--ls-space-sm)",
            borderRadius: "var(--ls-radius-md)",
            backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
            color: "var(--ls-text)", fontSize: "var(--ls-text-sm)",
          }}>
            <AlertTriangle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#ef4444" }}>Worker not running</strong>
              <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginTop: 2 }}>
                {workerError}
              </div>
            </div>
            <button
              onClick={() => setWorkerError(null)}
              style={{ background: "none", border: "none", color: "var(--ls-text-muted)", cursor: "pointer", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!selectedDocId && <HintText>Select a document above</HintText>}
        {selectedDocId && !hasApiKey && <HintText>Configure an API key in Settings</HintText>}
      </div>

      {/* Progress Note */}

      {/* Current Result */}
      {(currentResult || (pollingDone && polledAnalysis)) && (
        <SectionCard title="Result" onClose={() => setCurrentResult(null)}>
          <AnalysisResultCard
            analysis={(currentResult || polledAnalysis)!}
            onReview={(id) => navigate(`/review/${id}`)}
          />
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
                onReview={() => navigate(`/review/${a.id}`)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// -- Subcomponents --


function SectionCard({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div style={{
      padding: "var(--ls-space-lg)", backgroundColor: "var(--ls-surface)",
      border: "1px solid var(--ls-border)", borderRadius: "var(--ls-radius-lg)",
      marginBottom: "var(--ls-space-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ls-space-md)" }}>
        <h3 style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", margin: 0 }}>
          {title}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "transparent",
              color: "var(--ls-text-muted)", cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
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

function AnalysisResultCard({ analysis, onReview }: { analysis: COTAnalysis; onReview?: (id: string) => void }) {
  const isError = analysis.status === "failed";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
        <StatusBadge status={analysis.status} />
        {analysis.status === "completed" && onReview && (
          <button
            onClick={() => onReview(analysis.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-primary)", backgroundColor: "rgba(139,105,20,0.08)",
              color: "var(--ls-primary)", fontSize: "var(--ls-text-xs)", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Eye size={12} /> Review
          </button>
        )}
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
        {(analysis.status === "completed" || analysis.status === "failed") && analysis.created_at && analysis.updated_at && (() => {
          const secs = Math.round((new Date(analysis.updated_at).getTime() - new Date(analysis.created_at).getTime()) / 1000);
          if (secs <= 0) return null;
          const m = Math.floor(secs / 60), s = secs % 60;
          return (
            <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
              &middot; {m > 0 ? `${m}m ${s}s` : `${s}s`}
            </span>
          );
        })()}
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
      ) : null}
    </div>
  );
}

function PastAnalysisItem({ analysis, onView, onReview }: { analysis: COTAnalysis; onView: () => void; onReview: () => void }) {
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
        </div>
        <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
          {new Date(analysis.created_at).toLocaleString()}
          {analysis.ai_provider && <> &middot; {analysis.ai_provider}</>}
        </div>
      </div>
      {analysis.status === "completed" && analysis.generated_document_url && analysis.generated_document_name && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            documentsApi.download(analysis.generated_document_url!, analysis.generated_document_name!);
          }}
          title={`Download ${analysis.output_format?.toUpperCase() ?? "file"}`}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "transparent",
            color: "var(--ls-text-secondary)", cursor: "pointer", flexShrink: 0,
          }}
        >
          <Download size={14} />
        </button>
      )}
      {analysis.status === "completed" && (
        <button
          onClick={(e) => { e.stopPropagation(); onReview(); }}
          title="Review"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "transparent",
            color: "var(--ls-primary)", cursor: "pointer", flexShrink: 0,
          }}
        >
          <Eye size={14} />
        </button>
      )}
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
    cancelled: { bg: "rgba(156,163,175,0.1)", text: "#9ca3af", icon: <XCircle size={12} /> },
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

function DocMetadataModal({ title, fileName, fileSize, initialTract, initialHolder, isPending, folders, initialFolderId, onSave, onClose }: {
  title: string;
  fileName: string;
  fileSize: number;
  initialTract: string;
  initialHolder: string;
  isPending: boolean;
  folders?: DocumentFolder[];
  initialFolderId?: string;
  onSave: (tractNumber: string, lastRecordHolder: string, folderId?: string) => void;
  onClose: () => void;
}) {
  const [tract, setTract] = useState(initialTract);
  const [holder, setHolder] = useState(initialHolder);
  const [folderId, setFolderId] = useState(initialFolderId || "");

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
          {folders && folders.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
                Folder <span style={{ fontWeight: 400, color: "var(--ls-text-muted)" }}>(optional)</span>
              </label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">No folder</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "var(--ls-space-sm)" }}>
          <button
            onClick={() => onSave(tract, holder, folderId || undefined)}
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
