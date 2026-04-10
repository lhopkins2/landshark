import { useState, useRef, useCallback, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, FileText, Plus, Upload, Pencil, X, Download, FolderOpen, Folder, ChevronLeft, FolderPlus, Archive, AlertTriangle } from "lucide-react";
import JSZip from "jszip";
import { documentsApi, foldersApi } from "../api/documents";
import DocumentDetailDrawer from "../components/DocumentDetailDrawer";
import type { Document, DocumentFolder } from "../types/models";

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<Document | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (currentFolderId) params.folder = currentFolderId;

  const { data, isLoading } = useQuery({
    queryKey: ["documents", params],
    queryFn: () => documentsApi.list(Object.keys(params).length > 0 ? params : undefined),
    select: (res) => res.data,
  });

  const { data: foldersData } = useQuery({
    queryKey: ["document-folders"],
    queryFn: () => foldersApi.list(),
    select: (res) => res.data,
  });

  // When viewing "All Documents" (no folder), also fetch unfiled docs
  const { data: unfiledData, isLoading: isLoadingUnfiled } = useQuery({
    queryKey: ["documents", { folder__isnull: "true", ...(search ? { search } : {}) }],
    queryFn: () => {
      const p: Record<string, string> = { folder__isnull: "true" };
      if (search) p.search = search;
      return documentsApi.list(p);
    },
    select: (res) => res.data,
    enabled: !currentFolderId,
  });

  const documents = currentFolderId ? (data?.results ?? []) : (unfiledData?.results ?? []);
  const folders = foldersData?.results ?? [];
  const currentFolder = currentFolderId ? folders.find((f) => f.id === currentFolderId) : null;

  const deleteMutation = useMutation({
    mutationFn: () => Promise.all([...selectedIds].map((id) => documentsApi.delete(id))),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
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

  const moveToFolderMutation = useMutation({
    mutationFn: ({ docIds, folderId }: { docIds: string[]; folderId: string | null }) =>
      documentsApi.moveToFolder(docIds, folderId),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => foldersApi.create({ name }),
    onSuccess: () => {
      setShowNewFolder(false);
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => foldersApi.update(id, { name }),
    onSuccess: () => {
      setEditingFolder(null);
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => foldersApi.delete(id),
    onSuccess: () => {
      if (currentFolderId) setCurrentFolderId(null);
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const [isExporting, setIsExporting] = useState(false);
  const [dragOverPage, setDragOverPage] = useState(false);
  const dragCounter = useRef(0);

  const handleDownload = async (doc: Document) => {
    if (doc.download_url) {
      await documentsApi.download(doc.download_url, doc.original_filename);
    }
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    try {
      const selected = documents.filter((d) => selectedIds.has(d.id));
      const zip = new JSZip();
      for (const doc of selected) {
        const res = await documentsApi.downloadBlob(doc.id);
        zip.file(doc.original_filename, res.data);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documents-${selected.length}-files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  // Upload files dropped from OS
  const uploadFiles = useCallback(async (files: FileList, folderId: string | null) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (folderId) formData.append("folder", folderId);
      await documentsApi.upload(formData);
    }
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["document-folders"] });
  }, [queryClient]);

  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  // Folder drop: handle both document-move and file-upload
  const handleFolderDropCombined = (e: DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files, folderId);
    } else {
      try {
        const ids = JSON.parse(e.dataTransfer.getData("application/json")) as string[];
        if (ids.length > 0) moveToFolderMutation.mutate({ docIds: ids, folderId });
      } catch { /* ignore */ }
    }
  };

  // Page-level drop zone for uploading to current folder
  const handlePageDragEnter = (e: DragEvent) => {
    e.preventDefault();
    if (isFileDrag(e)) { dragCounter.current++; setDragOverPage(true); }
  };
  const handlePageDragLeave = (e: DragEvent) => {
    e.preventDefault();
    if (isFileDrag(e)) { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOverPage(false); } }
  };
  const handlePageDragOver = (e: DragEvent) => { e.preventDefault(); if (isFileDrag(e)) e.dataTransfer.dropEffect = "copy"; };
  const handlePageDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverPage(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files, currentFolderId);
    }
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

  // Drag and drop handlers for moving docs into folders
  const handleDragStart = (e: DragEvent, docId: string) => {
    const ids = selectedIds.has(docId) ? [...selectedIds] : [docId];
    e.dataTransfer.setData("application/json", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragOver = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isFileDrag(e) ? "copy" : "move";
    setDragOverFolderId(folderId);
  };

  return (
    <div
      onDragEnter={handlePageDragEnter}
      onDragLeave={handlePageDragLeave}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
      style={{ position: "relative" }}
    >
      {/* Page-level drop overlay */}
      {dragOverPage && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          backgroundColor: "rgba(139,105,20,0.06)",
          border: "3px dashed var(--ls-primary)",
          borderRadius: "var(--ls-radius-lg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            padding: "var(--ls-space-xl) var(--ls-space-2xl)",
            backgroundColor: "var(--ls-surface)",
            borderRadius: "var(--ls-radius-lg)",
            boxShadow: "var(--ls-shadow-lg, 0 8px 24px rgba(0,0,0,0.12))",
            textAlign: "center",
          }}>
            <Upload size={32} style={{ color: "var(--ls-primary)", marginBottom: "var(--ls-space-sm)" }} />
            <p style={{ fontWeight: 600, fontSize: "var(--ls-text-lg)" }}>
              Drop files to upload
            </p>
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: 4 }}>
              {currentFolder ? `Into "${currentFolder.name}"` : "To Documents"}
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-lg)" }}>
        <div>
          <h2 style={{ fontSize: "var(--ls-text-2xl)", fontWeight: 700 }}>Documents</h2>
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: "var(--ls-space-xs)" }}>
            Upload and manage your documents
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--ls-space-sm)" }}>
          <button
            className="doc-btn"
            onClick={() => setShowNewFolder(true)}
            style={{
              display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
              padding: "10px 16px", borderRadius: "var(--ls-radius-md)",
              backgroundColor: "var(--ls-surface)", color: "var(--ls-text-secondary)",
              fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "1px solid var(--ls-border)", cursor: "pointer",
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            <FolderPlus size={16} /> New Folder
          </button>
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
      </div>

      {/* New Folder Inline Form */}
      {showNewFolder && (
        <NewFolderForm
          isPending={createFolderMutation.isPending}
          onSave={(name) => createFolderMutation.mutate(name)}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {showUploadForm && (
        <UploadForm
          folders={folders}
          currentFolderId={currentFolderId}
          onClose={() => setShowUploadForm(false)}
          onUploaded={() => {
            setShowUploadForm(false);
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            queryClient.invalidateQueries({ queryKey: ["document-folders"] });
          }}
        />
      )}

      {/* Folder breadcrumb / navigation */}
      {currentFolderId && currentFolder && (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
          marginBottom: "var(--ls-space-md)", fontSize: "var(--ls-text-sm)",
        }}>
          <button
            onClick={() => { setCurrentFolderId(null); setSelectedIds(new Set()); }}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ls-primary)", fontWeight: 600, padding: 0,
            }}
          >
            <ChevronLeft size={16} /> All Documents
          </button>
          <span style={{ color: "var(--ls-text-muted)" }}>/</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
            <FolderOpen size={16} style={{ color: "var(--ls-primary)" }} />
            {currentFolder.name}
          </span>
          <span style={{ color: "var(--ls-text-muted)", marginLeft: "var(--ls-space-xs)" }}>
            ({currentFolder.document_count} file{currentFolder.document_count !== 1 ? "s" : ""})
          </span>
          <button
            onClick={() => setEditingFolder(currentFolder)}
            title="Rename folder"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "transparent",
              color: "var(--ls-text-muted)", cursor: "pointer", marginLeft: 4,
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete folder "${currentFolder.name}"? Documents inside will be moved out, not deleted.`)) {
                deleteFolderMutation.mutate(currentFolder.id);
              }
            }}
            title="Delete folder"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--ls-radius-md)",
              border: "1px solid rgba(239,68,68,0.3)", backgroundColor: "transparent",
              color: "#ef4444", cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Rename Folder Modal */}
      {editingFolder && (
        <RenameFolderModal
          folder={editingFolder}
          isPending={renameFolderMutation.isPending}
          onSave={(name) => renameFolderMutation.mutate({ id: editingFolder.id, name })}
          onClose={() => setEditingFolder(null)}
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
          borderRadius: "var(--ls-radius-md)", flexWrap: "wrap",
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
            <Archive size={13} /> {isExporting ? "Zipping..." : "Download as Zip"}
          </button>
          {/* Move to folder dropdown */}
          <MoveToFolderButton
            folders={folders}
            currentFolderId={currentFolderId}
            onMove={(folderId) => moveToFolderMutation.mutate({ docIds: [...selectedIds], folderId })}
          />
          <button
            onClick={() => setShowDeleteConfirm(true)}
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
          initialNotes={editingDoc.description || ""}
          isPending={editMutation.isPending}
          onSave={(name, tract, holder, notes) => editMutation.mutate({ id: editingDoc.id, data: { original_filename: name, tract_number: tract, last_record_holder: holder, description: notes } })}
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
          onSave={(name, tract, holder, notes) => {
            const data: Record<string, string> = {};
            if (name) data.original_filename = name;
            if (tract) data.tract_number = tract;
            if (holder) data.last_record_holder = holder;
            if (notes) data.description = notes;
            if (Object.keys(data).length > 0) bulkEditMutation.mutate(data);
          }}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {/* Folder grid (only at root level) */}
      {!currentFolderId && folders.length > 0 && !search && (
        <div style={{ marginBottom: "var(--ls-space-lg)" }}>
          <div style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--ls-space-sm)" }}>
            Folders
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--ls-space-sm)" }}>
            {folders.map((folder) => (
              <div
                className="doc-folder"
                key={folder.id}
                onClick={() => { setCurrentFolderId(folder.id); setSelectedIds(new Set()); }}
                onDrop={(e) => handleFolderDropCombined(e, folder.id)}
                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                onDragLeave={() => setDragOverFolderId(null)}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
                  padding: "var(--ls-space-md)",
                  backgroundColor: dragOverFolderId === folder.id ? "rgba(139,105,20,0.08)" : "var(--ls-surface)",
                  border: dragOverFolderId === folder.id ? "2px solid var(--ls-primary)" : "1px solid var(--ls-border)",
                  borderRadius: "var(--ls-radius-lg)",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
              >
                <Folder size={20} style={{ color: "var(--ls-primary)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--ls-text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {folder.name}
                  </div>
                  <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                    {folder.document_count} file{folder.document_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unfiled documents label */}
      {!currentFolderId && folders.length > 0 && !search && (
        <div
          onDrop={(e) => handleFolderDropCombined(e, null)}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--ls-space-sm)" }}
        >
          {documents.length > 0 ? "Unfiled Documents" : ""}
        </div>
      )}

      {/* Document list */}
      {(currentFolderId ? isLoading : isLoadingUnfiled) ? (
        <p style={{ color: "var(--ls-text-muted)" }}>Loading...</p>
      ) : documents.length === 0 && (!folders.length || currentFolderId || search) ? (
        <div style={{
          textAlign: "center", padding: "var(--ls-space-2xl)",
          backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)", color: "var(--ls-text-muted)",
        }}>
          <FileText size={48} style={{ margin: "0 auto var(--ls-space-md)", opacity: 0.3 }} />
          <p style={{ fontSize: "var(--ls-text-lg)" }}>
            {currentFolderId ? "This folder is empty" : "No documents found"}
          </p>
          <p style={{ fontSize: "var(--ls-text-sm)", marginTop: "var(--ls-space-xs)" }}>
            {currentFolderId ? "Upload or drag documents into this folder." : "Upload your first document to get started."}
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
              onClick={() => setDetailDoc(doc)}
              onEdit={() => setEditingDoc(doc)}
              onDownload={() => handleDownload(doc)}
              onDragStart={(e) => handleDragStart(e, doc.id)}
            />
          ))}
        </div>
      )}

      {/* Document Detail Drawer */}
      {detailDoc && (
        <DocumentDetailDrawer
          document={detailDoc}
          onClose={() => setDetailDoc(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          onClick={() => setShowDeleteConfirm(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--ls-surface)",
              border: "1px solid var(--ls-border)",
              borderRadius: "var(--ls-radius-lg)",
              padding: "var(--ls-space-xl)",
              maxWidth: 440, width: "90%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", marginBottom: "var(--ls-space-md)" }}>
              <AlertTriangle size={24} style={{ color: "var(--ls-error, #ef4444)", flexShrink: 0 }} />
              <h3 style={{ fontSize: "var(--ls-text-lg)", fontWeight: 700 }}>Confirm Deletion</h3>
            </div>
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)", lineHeight: 1.5, marginBottom: "var(--ls-space-sm)" }}>
              You are about to delete <strong>{selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""}</strong>.
            </p>
            <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-error, #ef4444)", fontWeight: 700, marginBottom: "var(--ls-space-lg)" }}>
              This will be gone forever. Are you sure?
            </p>
            <div style={{ display: "flex", gap: "var(--ls-space-sm)", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
                  backgroundColor: "transparent", color: "var(--ls-text-secondary)",
                  fontWeight: 500, fontSize: "var(--ls-text-sm)",
                  border: "1px solid var(--ls-border)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); deleteMutation.mutate(); }}
                style={{
                  padding: "8px 20px", borderRadius: "var(--ls-radius-md)",
                  backgroundColor: "var(--ls-error, #ef4444)", color: "#fff",
                  fontWeight: 600, fontSize: "var(--ls-text-sm)",
                  border: "none", cursor: "pointer",
                }}
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Sub-components ---- */

function NewFolderForm({ isPending, onSave, onClose }: { isPending: boolean; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
      marginBottom: "var(--ls-space-md)", padding: "var(--ls-space-sm) var(--ls-space-md)",
      backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-md)",
    }}>
      <FolderPlus size={16} style={{ color: "var(--ls-primary)", flexShrink: 0 }} />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); if (e.key === "Escape") onClose(); }}
        placeholder="Folder name..."
        style={{
          flex: 1, padding: "6px 10px", borderRadius: "var(--ls-radius-md)",
          border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
          fontSize: "var(--ls-text-sm)", outline: "none",
        }}
      />
      <button
        onClick={() => { if (name.trim()) onSave(name.trim()); }}
        disabled={!name.trim() || isPending}
        style={{
          padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
          backgroundColor: name.trim() ? "var(--ls-primary)" : "var(--ls-border)",
          color: name.trim() ? "#fff" : "var(--ls-text-muted)",
          fontSize: "var(--ls-text-xs)", fontWeight: 600, border: "none",
          cursor: name.trim() ? "pointer" : "not-allowed",
        }}
      >
        {isPending ? "Creating..." : "Create"}
      </button>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ls-text-muted)", padding: 4 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function RenameFolderModal({ folder, isPending, onSave, onClose }: { folder: DocumentFolder; isPending: boolean; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(folder.name);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "var(--ls-surface)", borderRadius: "var(--ls-radius-lg)", padding: "var(--ls-space-xl)", width: 380, maxWidth: "90vw", border: "1px solid var(--ls-border)" }}>
        <h3 style={{ fontWeight: 700, fontSize: "var(--ls-text-lg)", marginBottom: "var(--ls-space-md)" }}>Rename Folder</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none" }}
        />
        <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-lg)" }}>
          <button onClick={() => { if (name.trim()) onSave(name.trim()); }} disabled={!name.trim() || isPending} style={{ padding: "8px 20px", borderRadius: "var(--ls-radius-md)", backgroundColor: "var(--ls-primary)", color: "#fff", fontWeight: 600, fontSize: "var(--ls-text-sm)", border: "none", cursor: "pointer" }}>
            {isPending ? "Saving..." : "Save"}
          </button>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: "var(--ls-radius-md)", backgroundColor: "transparent", color: "var(--ls-text-secondary)", fontWeight: 500, fontSize: "var(--ls-text-sm)", border: "1px solid var(--ls-border)", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveToFolderButton({ folders, currentFolderId, onMove }: { folders: DocumentFolder[]; currentFolderId: string | null; onMove: (folderId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "6px 14px", borderRadius: "var(--ls-radius-md)",
          backgroundColor: "var(--ls-surface)", color: "var(--ls-text-secondary)",
          fontSize: "var(--ls-text-xs)", fontWeight: 600,
          border: "1px solid var(--ls-border)", cursor: "pointer",
        }}
      >
        <Folder size={13} /> Move to Folder
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
          backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-md)", minWidth: 180, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          maxHeight: 240, overflowY: "auto",
        }}>
          {currentFolderId && (
            <button
              onClick={() => { onMove(null); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
                width: "100%", padding: "8px 12px", border: "none",
                backgroundColor: "transparent", cursor: "pointer",
                fontSize: "var(--ls-text-sm)", color: "var(--ls-text-secondary)",
                textAlign: "left",
              }}
            >
              <FileText size={14} /> Remove from folder
            </button>
          )}
          {folders.filter((f) => f.id !== currentFolderId).map((folder) => (
            <button
              key={folder.id}
              onClick={() => { onMove(folder.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: "var(--ls-space-xs)",
                width: "100%", padding: "8px 12px", border: "none",
                backgroundColor: "transparent", cursor: "pointer",
                fontSize: "var(--ls-text-sm)", color: "var(--ls-text)",
                textAlign: "left",
              }}
            >
              <Folder size={14} style={{ color: "var(--ls-primary)" }} /> {folder.name}
            </button>
          ))}
          {folders.filter((f) => f.id !== currentFolderId).length === 0 && !currentFolderId && (
            <div style={{ padding: "8px 12px", fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
              No folders yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadForm({ folders, currentFolderId, onClose, onUploaded }: { folders: DocumentFolder[]; currentFolderId: string | null; onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [tractNumber, setTractNumber] = useState("");
  const [lastRecordHolder, setLastRecordHolder] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string>(currentFolderId || "");
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
      if (folderId) formData.append("folder", folderId);
      return documentsApi.upload(formData);
    },
    onSuccess: () => onUploaded(),
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: Record<string, unknown> } };
      const detail = axiosErr?.response?.data?.detail || axiosErr?.response?.data?.file;
      setError(detail ? String(detail) : "Failed to upload document.");
    },
  });

  return (
    <div style={{
      marginBottom: "var(--ls-space-lg)", padding: "var(--ls-space-lg)",
      backgroundColor: "var(--ls-surface)", border: "1px solid var(--ls-border)",
      borderRadius: "var(--ls-radius-lg)",
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: "var(--ls-space-md)" }}>Upload Document</h3>
      {error && <p style={{ color: "var(--ls-error)", fontSize: "var(--ls-text-sm)", marginBottom: "var(--ls-space-sm)" }}>{error}</p>}

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
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
          <p style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)" }}>Click or drag a file here</p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ls-space-sm)" }}>
        <FormField label="Tract Number" value={tractNumber} onChange={setTractNumber} placeholder="e.g. 12345" />
        <FormField label="Last Record Holder" value={lastRecordHolder} onChange={setLastRecordHolder} placeholder="e.g. John Smith" />
        <div>
          <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>
            Folder <span style={{ fontWeight: 400, color: "var(--ls-text-muted)" }}>(optional)</span>
          </label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
              fontSize: "var(--ls-text-sm)", cursor: "pointer", color: "var(--ls-text)",
            }}
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <FormField label="Notes (optional)" value={description} onChange={setDescription} placeholder="Add notes..." />
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

function DocumentCard({ document: doc, selected, onToggle, onClick, onEdit, onDownload, onDragStart }: {
  document: Document; selected: boolean; onToggle: () => void; onClick: () => void; onEdit: () => void; onDownload: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="doc-card"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "var(--ls-space-sm)",
        padding: "var(--ls-space-md) var(--ls-space-lg)",
        backgroundColor: "var(--ls-surface)",
        border: selected ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
        borderRadius: "var(--ls-radius-lg)",
        cursor: "pointer",
        transition: "background-color 0.15s, border-color 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 12, height: 12, cursor: "pointer", flexShrink: 0, accentColor: "var(--ls-text-muted)", opacity: 0.6, marginLeft: -8 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ls-space-sm)", flex: 1, minWidth: 0 }}>
        <FileText size={18} style={{ color: "var(--ls-text-muted)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "var(--ls-text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_filename}
          </div>
          {doc.description && (
            <span style={{
              display: "inline-block",
              fontSize: "var(--ls-text-xs, 11px)",
              color: "var(--ls-primary)",
              backgroundColor: "color-mix(in srgb, var(--ls-primary) 12%, transparent)",
              padding: "1px 8px",
              borderRadius: "var(--ls-radius-full, 999px)",
              fontWeight: 500,
              marginTop: 2,
              maxWidth: 250,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {doc.description}
            </span>
          )}
          <div style={{ fontSize: "var(--ls-text-sm)", color: "var(--ls-text-muted)", marginTop: 2 }}>
            {formatFileSize(doc.file_size)}
            {doc.tract_number && <> &middot; Tract {doc.tract_number}</>}
            {doc.last_record_holder && <> &middot; {doc.last_record_holder}</>}
            {doc.folder_name && <> &middot; <Folder size={12} style={{ verticalAlign: "middle", marginRight: 2 }} />{doc.folder_name}</>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--ls-space-xs)", flexShrink: 0 }}>
        {doc.download_url && (
          <button
            className="doc-btn"
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Download document"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", backgroundColor: "transparent",
              color: "var(--ls-text-muted)", cursor: "pointer",
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            <Download size={14} />
          </button>
        )}
        <button
          className="doc-btn"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit tract number & last record holder"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "transparent",
            color: "var(--ls-text-muted)", cursor: "pointer",
            transition: "background-color 0.15s, color 0.15s",
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
  initialNotes,
  isPending,
  isBulk,
  onSave,
  onClose,
}: {
  title: string;
  initialName?: string;
  initialTract: string;
  initialHolder: string;
  initialNotes?: string;
  isPending: boolean;
  isBulk?: boolean;
  onSave: (name: string, tract: string, holder: string, notes: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName || "");
  const [tract, setTract] = useState(initialTract);
  const [holder, setHolder] = useState(initialHolder);
  const [notes, setNotes] = useState(initialNotes || "");

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
          <div>
            <label style={{ display: "block", fontSize: "var(--ls-text-xs)", fontWeight: 500, color: "var(--ls-text-secondary)", marginBottom: 4 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this document..."
              rows={3}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)", fontSize: "var(--ls-text-sm)", outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--ls-space-sm)", marginTop: "var(--ls-space-lg)" }}>
          <button
            onClick={() => onSave(name, tract, holder, notes)}
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
