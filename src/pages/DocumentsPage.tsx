import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, FileText, Plus, Upload, Pencil, X, Download } from "lucide-react";
import { documentsApi } from "../api/documents";
import type { Document } from "../types/models";

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const queryClient = useQueryClient();

  const params: Record<string, string> = {};
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ["documents", params],
    queryFn: () => documentsApi.list(Object.keys(params).length > 0 ? params : undefined),
    select: (res) => res.data,
  });

  const documents = data?.results ?? [];

  const deleteMutation = useMutation({
    mutationFn: () => Promise.all([...selectedIds].map((id) => documentsApi.delete(id))),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Document> }) => documentsApi.update(id, data),
    onSuccess: () => {
      setEditingDoc(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const bulkEditMutation = useMutation({
    mutationFn: (data: { original_filename?: string; tract_number?: string; last_record_holder?: string }) =>
      Promise.all([...selectedIds].map((id) => documentsApi.update(id, data))),
    onSuccess: () => {
      setShowBulkEdit(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async (doc: Document) => {
    if (doc.download_url) {
      await documentsApi.download(doc.download_url, doc.original_filename);
    }
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    const selected = documents.filter((d) => selectedIds.has(d.id));
    for (const doc of selected) {
      await handleDownload(doc);
    }
    setIsExporting(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-lg)" }}>
        <div>
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Documents</h2>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
            Upload and manage your documents
          </p>
        </div>
        <button
          onClick={() => setShowUploadForm(true)}
          style={{
            display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
            padding: "10px 20px", borderRadius: "var(--ls-radius-md)",
            backgroundColor: "var(--ls-primary)", color: "var(--ls-text-on-primary)",
            fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none", cursor: "pointer",
          }}
        >
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {showUploadForm && (
        <UploadForm
          onClose={() => setShowUploadForm(false)}
          onUploaded={() => {
            setShowUploadForm(false);
            queryClient.invalidateQueries({ queryKey: ["documents"] });
          }}
        />
      )}

      {/* Search */}
      <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-lg)", alignItems: "center" }}>
        {documents.length > 0 && (
          <input
            type="checkbox"
            checked={documents.length > 0 && selectedIds.size === documents.length}
            onChange={toggleSelectAll}
            style={{ width: 12, height: 12, cursor: "pointer", accentColor: "var(--ls-text-muted)", opacity: 0.6 }}
            title="Select all"
          />
        )}
        <div style={{ position: "relative", maxWidth: 500, flex: 1 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ls-text-muted)" }} />
          <input
            type="text"
            placeholder="Search by filename, tract number, or last record holder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px 10px 36px",
              borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)",
              backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none",
            }}
          />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
          marginBottom: "var(--ls-space-md)", padding: "var(--ls-space-sm) var(--ls-space-md)",
          backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-md)",
        }}>
          <span style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setShowBulkEdit(true)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-primary)", color: "#fff",
              fontSize: "var(--ls-text-xs)", fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            <Pencil size={13} /> Edit Selected
          </button>
          <button
            onClick={handleBulkExport}
            disabled={isExporting}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-accent, #D4A017)", color: "#fff",
              fontSize: "var(--ls-text-xs)", fontWeight: 600, border: "none",
              cursor: isExporting ? "not-allowed" : "pointer",
              opacity: isExporting ? 0.7 : 1,
            }}
          >
            <Download size={13} /> {isExporting ? "Exporting..." : "Export Selected"}
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-error)", color: "#fff",
              fontSize: "var(--ls-text-xs)", fontWeight: 600, border: "none",
              cursor: deleteMutation.isPending ? "not-allowed" : "pointer",
              opacity: deleteMutation.isPending ? 0.7 : 1,
            }}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              marginLeft: "auto", padding: "4px 8px", borderRadius: "var(--ls-radius-sm)",
              backgroundColor: "transparent", color: "var(--ls-text-muted)",
              fontSize: "var(--ls-text-xs)", border: "none", cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingDoc && (
        <DocMetadataModal
          title="Edit Document"
          initialName={editingDoc.original_filename}
          initialTract={editingDoc.tract_number || ""}
          initialHolder={editingDoc.last_record_holder || ""}
          isPending={editMutation.isPending}
          onSave={(name, tract, holder) => editMutation.mutate({ id: editingDoc.id, data: { original_filename: name, tract_number: tract, last_record_holder: holder } })}
          onClose={() => setEditingDoc(null)}
        />
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <DocMetadataModal
          title={`Edit ${selectedIds.size} Document${selectedIds.size !== 1 ? "s" : ""}`}
          initialTract=""
          initialHolder=""
          isPending={bulkEditMutation.isPending}
          isBulk
          onSave={(name, tract, holder) => {
            const data: Record<string, string> = {};
            if (name) data.original_filename = name;
            if (tract) data.tract_number = tract;
            if (holder) data.last_record_holder = holder;
            if (Object.keys(data).length > 0) bulkEditMutation.mutate(data);
          }}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {/* Document list */}
      {isLoading ? (
        <p style={{ color: "var(--ls-text-muted)" }}>Loading...</p>
      ) : documents.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "var(--ls-space-2xl)",
          backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)", color: "var(--ls-text-muted)",
        }}>
          <FileText size={48} style={{ margin: "0 auto var(--ls-space-md)", opacity: 0.3 }} />
          <p style={{ fontSize: "var(--ls-text-lg)" }}>No documents found</p>
          <p style={{ fontSize: "var(--ls-text-sm)", marginTop: "var(--ls-space-xs)" }}>
            Upload your first document to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "var(--ls-space-sm)" }}>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              selected={selectedIds.has(doc.id)}
              onToggle={() => toggleSelect(doc.id)}
              onEdit={() => setEditingDoc(doc)}
              onDownload={() => handleDownload(doc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadForm({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [tractNumber, setTractNumber] = useState("");
  const [lastRecordHolder, setLastRecordHolder] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      if (tractNumber) formData.append("tract_number", tractNumber);
      if (lastRecordHolder) formData.append("last_record_holder", lastRecordHolder);
      if (description) formData.append("description", description);
      return documentsApi.upload(formData);
    },
    onSuccess: () => onUploaded(),
    onError: () => setError("Failed to upload document."),
  });

  return (
    <div style={{
      marginBottom: "var(--ls-space-lg)", padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)" }}>Upload Document</h3>
      {error && <p style={{ color: "var(--ls-error)", fontSize: "var(--ls-text-sm)", marginBottom: "var(--ls-space-sm)" }}>{error}</p>}

      {/* File drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: "2px dashed var(--ls-border)",
          borderRadius: "var(--ls-radius-md)",
          padding: "var(--ls-space-xl)",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: "var(--ls-space-md)",
          backgroundColor: file ? "rgba(34,197,94,0.05)" : undefined,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        <Upload size={24} style={{ margin: "0 auto var(--ls-space-sm)", color: "var(--ls-text-muted)" }} />
        {file ? (
          <p style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>{file.name} ({formatFileSize(file.size)})</p>
        ) : (
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Click to select a file</p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ls-space-sm)" }}>
        <FormField label="Tract Number" value={tractNumber} onChange={setTractNumber} placeholder="e.g. 12345" />
        <FormField label="Last Record Holder" value={lastRecordHolder} onChange={setLastRecordHolder} placeholder="e.g. John Smith" />
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Description (optional)" value={description} onChange={setDescription} placeholder="Brief description..." />
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-md)" }}>
        <button
          onClick={() => mutation.mutate()}
          disabled={!file || mutation.isPending}
          style={{
            padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
            backgroundColor: !file ? "var(--ls-border)" : "var(--ls-primary)",
            color: !file ? "var(--ls-text-muted)" : "var(--ls-text-on-primary)",
            fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none",
            cursor: !file ? "not-allowed" : "pointer",
          }}
        >
          {mutation.isPending ? "Uploading..." : "Upload"}
        </button>
        <button
          onClick={onClose}
          style={{ padding: "8px 20px", borderRadius: "var(--ls-radius-md)", backgroundColor: "transparent", color: "var(--ls-text-secondary)", fontWeight: 500, fontSize: "var(--ls-text-sm)", border: "1px solid var(--ls-border)", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DocumentCard({ document: doc, selected, onToggle, onEdit, onDownload }: { document: Document; selected: boolean; onToggle: () => void; onEdit: () => void; onDownload: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-md) var(--ls-space-lg)",
        backgroundColor: "var(--ls-surface)",
        border: selected ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        style={{ width: 12, height: 12, cursor: "pointer", flexShrink: 0, accentColor: "var(--ls-text-muted)", opacity: 0.6, marginLeft: -8 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", flex: 1, minWidth: 0 }}>
        <FileText size={18} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "var(--ls-text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_filename}
          </div>
          {doc.description && doc.description.startsWith("Processed from") && (
            <span style={{
              display: "inline-block",
              fontSize: "var(--ls-text-xs, 11px)",
              color: "var(--ls-primary)",
              backgroundColor: "color-mix(in srgb, var(--ls-primary) 12%, transparent)",
              padding: "1px 8px",
              borderRadius: "var(--ls-radius-full, 999px)",
              fontWeight: 500,
              marginTop: 2,
            }}>
              {doc.description}
            </span>
          )}
          <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: 2 }}>
            {formatFileSize(doc.file_size)}
            {doc.tract_number && <> &middot; Tract {doc.tract_number}</>}
            {doc.last_record_holder && <> &middot; {doc.last_record_holder}</>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--ls-space-xs)", flexShrink: 0 }}>
        {doc.download_url && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Download document"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "transparent",
              color: "var(--ls-text-muted)", cursor: "pointer",
            }}
          >
            <Download size={14} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit tract number & last record holder"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "transparent",
            color: "var(--ls-text-muted)", cursor: "pointer",
          }}
        >
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none" }}
      />
    </div>
  );
}

function DocMetadataModal({
  title,
  initialName,
  initialTract,
  initialHolder,
  isPending,
  isBulk,
  onSave,
  onClose,
}: {
  title: string;
  initialName?: string;
  initialTract: string;
  initialHolder: string;
  isPending: boolean;
  isBulk?: boolean;
  onSave: (name: string, tract: string, holder: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName || "");
  const [tract, setTract] = useState(initialTract);
  const [holder, setHolder] = useState(initialHolder);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--ls-surface)", borderRadius: "var(--ls-radius-lg)",
          padding: "var(--ls-space-xl)", width: 420, maxWidth: "90vw",
          border: "1px solid var(--ls-border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-lg)" }}>
          <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ls-text-muted)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {isBulk && (
          <p style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)", marginBottom: "var(--ls-space-md)" }}>
            Leave a field blank to keep existing values unchanged.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ls-space-md)" }}>
          <FormField label="Document Name" value={name} onChange={setName} placeholder="e.g. Unprocessed COT.pdf" />
          <FormField label="Tract Number" value={tract} onChange={setTract} placeholder="e.g. 12345" />
          <FormField label="Last Record Holder" value={holder} onChange={setHolder} placeholder="e.g. John Smith" />
        </div>
        <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-lg)" }}>
          <button
            onClick={() => onSave(name, tract, holder)}
            disabled={isPending}
            style={{
              padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-primary)", color: "#fff",
              fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none",
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "transparent", color: "var(--ls-text-secondary)",
              fontWeight: 500, fontSize: "var(--ls-text-sm)",
              border: "1px solid var(--ls-border)", cursor: "pointer",
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
