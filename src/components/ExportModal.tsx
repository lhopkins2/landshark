/**
 * Export modal for analyzed-COT outputs.
 *
 * Lets the user rename the file, swap between PDF/DOCX, and optionally strip
 * the "Doc Pg" column before downloading. Re-renders server-side from the
 * analysis's stored markdown — no PDF round-tripping.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Loader, Download } from "lucide-react";
import { analysesApi, formTemplatesApi } from "../api/analysis";

interface Props {
  analysisId: string;
  /** Base filename without extension. */
  defaultBaseName: string;
  /** The format the analysis was originally rendered in. The modal defaults to the *opposite* format. */
  sourceFormat: "pdf" | "docx";
  onClose: () => void;
}

export default function ExportModal({ analysisId, defaultBaseName, sourceFormat, onClose }: Props) {
  // Default to the opposite format — the typical use of this modal is to convert.
  // The user can flip back to the same format with one click.
  const [chosenFormat, setChosenFormat] = useState<"pdf" | "docx">(
    sourceFormat === "pdf" ? "docx" : "pdf",
  );
  const [filename, setFilename] = useState(defaultBaseName);
  const [stripDocPg, setStripDocPg] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const { data: templates = [] } = useQuery({
    queryKey: ["form-templates"],
    queryFn: () => formTemplatesApi.list().then((r) => r.data.results),
  });

  // Templated exports are DOCX only — force DOCX whenever a template is selected, derived
  // (not stored) so we don't fight the user's last toggle if they unpick the template.
  const targetFormat: "pdf" | "docx" = templateId ? "docx" : chosenFormat;
  const setTargetFormat = setChosenFormat;

  const exportMutation = useMutation({
    mutationFn: () =>
      analysesApi.export(analysisId, {
        format: targetFormat,
        strip_doc_pg: stripDocPg,
        filename: filename.trim() || defaultBaseName,
        template_id: templateId || undefined,
      }),
    onSuccess: () => onClose(),
  });

  const errorMsg =
    exportMutation.error &&
    (((exportMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail) ||
      (exportMutation.error instanceof Error ? exportMutation.error.message : "Export failed"));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export analyzed COT"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--ls-surface)", borderRadius: "var(--ls-radius-lg)",
          border: "1px solid var(--ls-border)", padding: "var(--ls-space-lg)",
          width: 460, maxWidth: "92vw", boxShadow: "var(--ls-shadow-xl)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--ls-space-md)" }}>
          <h3 style={{ fontWeight: 600, fontSize: "var(--ls-text-base)", margin: 0 }}>Export analyzed COT</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={exportMutation.isPending}
            aria-label="Close"
            style={{ display: "flex", border: "none", background: "none", cursor: "pointer", color: "var(--ls-text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gap: "var(--ls-space-md)" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-secondary)" }}>
              Filename
            </span>
            <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={exportMutation.isPending}
                placeholder={defaultBaseName}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                  border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                  fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)",
                }}
              />
              <span style={{
                display: "inline-flex", alignItems: "center", padding: "0 10px",
                borderRadius: "var(--ls-radius-md)", border: "1px solid var(--ls-border)",
                backgroundColor: "var(--ls-bg)", color: "var(--ls-text-muted)",
                fontSize: "var(--ls-text-sm)", fontFamily: "var(--ls-font-mono)",
              }}>
                .{targetFormat}
              </span>
            </div>
          </label>

          {templates.length > 0 && (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-secondary)" }}>
                Template
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={exportMutation.isPending}
                style={{
                  padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                  border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
                  fontSize: "var(--ls-text-sm)", outline: "none", color: "var(--ls-text)",
                }}
              >
                <option value="">Default (plain layout)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {templateId && (
                <span style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                  Templated exports are DOCX only.
                </span>
              )}
            </label>
          )}

          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--ls-text-xs)", fontWeight: 600, color: "var(--ls-text-secondary)" }}>
              Format
              {sourceFormat !== targetFormat && (
                <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--ls-text-muted)" }}>
                  (converting from {sourceFormat.toUpperCase()})
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["pdf", "docx"] as const).map((fmt) => {
                const active = targetFormat === fmt;
                // Templated exports are DOCX only — disable the PDF button when a template is picked.
                const disabledByTemplate = !!templateId && fmt === "pdf";
                const isDisabled = exportMutation.isPending || disabledByTemplate;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => !disabledByTemplate && setTargetFormat(fmt)}
                    disabled={isDisabled}
                    title={disabledByTemplate ? "Templated exports are DOCX only" : undefined}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: "var(--ls-radius-md)",
                      border: active ? "1px solid var(--ls-primary)" : "1px solid var(--ls-border)",
                      backgroundColor: active ? "rgba(139,105,20,0.08)" : "var(--ls-bg)",
                      color: active ? "var(--ls-primary)" : "var(--ls-text-secondary)",
                      fontSize: "var(--ls-text-sm)", fontWeight: active ? 600 : 500,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: disabledByTemplate ? 0.4 : 1,
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "8px 10px", borderRadius: "var(--ls-radius-md)",
            border: "1px solid var(--ls-border)", backgroundColor: "var(--ls-bg)",
            cursor: exportMutation.isPending ? "wait" : "pointer",
          }}>
            <input
              type="checkbox"
              checked={stripDocPg}
              onChange={(e) => setStripDocPg(e.target.checked)}
              disabled={exportMutation.isPending}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: "var(--ls-text-sm)", fontWeight: 500 }}>
                Remove Doc Pg column
              </div>
              <div style={{ fontSize: "var(--ls-text-xs)", color: "var(--ls-text-muted)" }}>
                Drops the page-reference column from the instrument table.
              </div>
            </div>
          </label>

          {errorMsg && (
            <div style={{
              fontSize: "var(--ls-text-xs)", color: "#ef4444",
              padding: "8px 10px", borderRadius: "var(--ls-radius-md)",
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
            }}>
              {errorMsg}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "var(--ls-space-lg)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={exportMutation.isPending}
            style={{
              padding: "8px 14px", borderRadius: "var(--ls-radius-md)",
              border: "1px solid var(--ls-border)", background: "transparent",
              color: "var(--ls-text-secondary)", cursor: "pointer", fontSize: "var(--ls-text-sm)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: "var(--ls-radius-md)",
              border: "none", background: "var(--ls-primary)",
              color: "var(--ls-text-on-primary)", cursor: exportMutation.isPending ? "wait" : "pointer",
              fontSize: "var(--ls-text-sm)", fontWeight: 600,
              opacity: exportMutation.isPending ? 0.7 : 1,
            }}
          >
            {exportMutation.isPending ? <Loader size={14} className="spin" /> : <Download size={14} />}
            {exportMutation.isPending ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
