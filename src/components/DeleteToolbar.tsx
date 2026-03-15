import { useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteToolbarProps {
  selectedCount: number;
  itemLabel: string;
  cascadeWarning?: string;
  onDelete: () => void;
  onClearSelection: () => void;
  isDeleting: boolean;
}

export default function DeleteToolbar({
  selectedCount,
  itemLabel,
  cascadeWarning,
  onDelete,
  onClearSelection,
  isDeleting,
}: DeleteToolbarProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ls-space-md)",
          padding: "var(--ls-space-sm) var(--ls-space-lg)",
          backgroundColor: "var(--ls-surface)",
          border: "1px solid var(--ls-border)",
          borderRadius: "var(--ls-radius-lg)",
          marginBottom: "var(--ls-space-md)",
        }}
      >
        <span style={{ fontSize: "var(--ls-text-sm)", fontWeight: 600 }}>
          {selectedCount} selected
        </span>
        <button
          onClick={onClearSelection}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 12px",
            borderRadius: "var(--ls-radius-md)",
            backgroundColor: "transparent",
            color: "var(--ls-text-secondary)",
            fontSize: "var(--ls-text-sm)",
            border: "1px solid var(--ls-border)",
            cursor: "pointer",
          }}
        >
          <X size={14} /> Clear
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            borderRadius: "var(--ls-radius-md)",
            backgroundColor: "var(--ls-error, #ef4444)",
            color: "#fff",
            fontSize: "var(--ls-text-sm)",
            fontWeight: 600,
            border: "none",
            cursor: isDeleting ? "not-allowed" : "pointer",
            opacity: isDeleting ? 0.6 : 1,
          }}
        >
          <Trash2 size={14} />
          {isDeleting ? "Deleting..." : "Delete Selected"}
        </button>
      </div>

      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--ls-surface)",
              border: "1px solid var(--ls-border)",
              borderRadius: "var(--ls-radius-lg)",
              padding: "var(--ls-space-xl)",
              maxWidth: 440,
              width: "90%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ls-space-sm)",
                marginBottom: "var(--ls-space-md)",
              }}
            >
              <AlertTriangle
                size={24}
                style={{ color: "var(--ls-error, #ef4444)", flexShrink: 0 }}
              />
              <h3 style={{ fontSize: "var(--ls-text-lg)", fontWeight: 700 }}>
                Confirm Deletion
              </h3>
            </div>
            <p
              style={{
                fontSize: "var(--ls-text-sm)",
                color: "var(--ls-error, #ef4444)",
                fontWeight: 700,
                marginBottom: "var(--ls-space-sm)",
              }}
            >
              This action cannot be undone.
            </p>
            <p
              style={{
                fontSize: "var(--ls-text-sm)",
                color: "var(--ls-text-secondary)",
                lineHeight: 1.5,
                marginBottom: cascadeWarning ? "var(--ls-space-sm)" : "var(--ls-space-lg)",
              }}
            >
              You are about to permanently delete{" "}
              <strong>
                {selectedCount} {itemLabel}
                {selectedCount !== 1 ? "s" : ""}
              </strong>
              .
            </p>
            {cascadeWarning && (
              <p
                style={{
                  fontSize: "var(--ls-text-sm)",
                  color: "var(--ls-warning, #f59e0b)",
                  lineHeight: 1.5,
                  marginBottom: "var(--ls-space-lg)",
                }}
              >
                {cascadeWarning}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--ls-space-sm)", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "var(--ls-radius-md)",
                  backgroundColor: "transparent",
                  color: "var(--ls-text-secondary)",
                  fontWeight: 500,
                  fontSize: "var(--ls-text-sm)",
                  border: "1px solid var(--ls-border)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onDelete();
                }}
                disabled={isDeleting}
                style={{
                  padding: "8px 20px",
                  borderRadius: "var(--ls-radius-md)",
                  backgroundColor: "var(--ls-error, #ef4444)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "var(--ls-text-sm)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
