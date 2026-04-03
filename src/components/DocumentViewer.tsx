import { useState, useEffect, useRef, useMemo } from "react";
import DOMPurify from "dompurify";
import { documentsApi } from "../api/documents";
import { highlightText } from "../utils/textHighlight";

interface DocumentViewerProps {
  documentId: string;
  mimeType?: string;
  mode: "document" | "text";
  highlightTerms?: string[];
  pageNumber?: number;
}

export default function DocumentViewer({ documentId, mimeType, mode, highlightTerms = [], pageNumber }: DocumentViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const isDocx = mimeType?.includes("wordprocessingml") || mimeType?.includes("msword");
  const isPdf = mimeType?.includes("pdf");

  // Fetch content when mode or documentId changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);

      if (mode === "text") {
        // Already have text cached
        if (text !== null) {
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const res = await documentsApi.extractText(documentId);
          if (!cancelled) {
            setText(res.data.text);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setError("Failed to extract text from document.");
            setLoading(false);
          }
        }
      } else {
        // Document mode
        if (isPdf) {
          if (blobUrl) { setLoading(false); return; }
          setLoading(true);
          try {
            const res = await documentsApi.downloadBlob(documentId);
            if (!cancelled) {
              const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
              setBlobUrl(url);
              setLoading(false);
            }
          } catch {
            if (!cancelled) { setError("Failed to load PDF."); setLoading(false); }
          }
        } else if (isDocx) {
          if (docHtml) { setLoading(false); return; }
          setLoading(true);
          try {
            const res = await documentsApi.downloadBlob(documentId);
            if (!cancelled) {
              const mammoth = await import("mammoth");
              const arrayBuffer = await (res.data as Blob).arrayBuffer();
              const result = await mammoth.convertToHtml({ arrayBuffer });
              setDocHtml(DOMPurify.sanitize(result.value));
              setLoading(false);
            }
          } catch {
            if (!cancelled) { setError("Failed to load DOCX."); setLoading(false); }
          }
        } else {
          if (text !== null) { setLoading(false); return; }
          setLoading(true);
          try {
            const res = await documentsApi.extractText(documentId);
            if (!cancelled) { setText(res.data.text); setLoading(false); }
          } catch {
            if (!cancelled) { setError("Cannot preview this file type."); setLoading(false); }
          }
        }
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, mode]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) window.URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sanitized via DOMPurify before setting dangerouslySetInnerHTML below
  const highlightedHtml = useMemo(() => {
    if (mode !== "text" || !text || highlightTerms.length === 0) return null;
    return DOMPurify.sanitize(highlightText(text, highlightTerms));
  }, [text, highlightTerms, mode]);

  // Auto-scroll to first highlight
  useEffect(() => {
    if (mode === "text" && highlightTerms.length > 0 && textRef.current) {
      setTimeout(() => {
        const mark = textRef.current?.querySelector("mark.ls-highlight");
        if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [highlightTerms, text, mode]);

  if (loading) {
    return <div className="review-viewer-loading">Loading...</div>;
  }

  if (error) {
    return <div className="review-viewer-error">{error}</div>;
  }

  // Text mode
  if (mode === "text") {
    if (highlightedHtml) {
      // highlightedHtml is pre-sanitized with DOMPurify (see useMemo above)
      return (
        <div
          ref={textRef}
          className="review-text-content"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      );
    }
    return (
      <div ref={textRef} className="review-text-content">
        {text ?? ""}
      </div>
    );
  }

  // Document mode — PDF
  if (isPdf && blobUrl) {
    const src = pageNumber ? `${blobUrl}#page=${pageNumber}` : blobUrl;
    // key forces iframe remount when page changes — blob URL fragment changes alone
    // don't reliably cause the browser's PDF viewer to navigate
    return <iframe key={pageNumber ?? 0} src={src} className="review-doc-iframe" title="PDF viewer" />;
  }

  // Document mode — DOCX
  if (isDocx && docHtml) {
    return (
      <div
        className="review-docx-content"
        dangerouslySetInnerHTML={{ __html: docHtml }}
      />
    );
  }

  // Fallback text
  if (text !== null) {
    return <div className="review-text-content">{text}</div>;
  }

  return null;
}
