import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Download, FileWarning, FileText, Loader2, Expand } from "lucide-react";
import { fetchEvidenceBlob } from "../api/chat";

// Images open in an in-app viewer (FileStore has no public URLs, and the
// backend always streams as application/octet-stream, so re-wrap the blob
// with the stored content type for correct rendering).
export function isViewableImage(ev) {
  if (!ev) return false;
  if ((ev.content_type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(ev.filename || "");
}

function useEvidenceObjectUrl(token, ev) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadUrl = ev?.download_url;
  const contentType = ev?.content_type;
  const filename = ev?.filename;

  useEffect(() => {
    if (!downloadUrl) return;
    let cancelled = false;
    let objUrl = null;
    setLoading(true);
    setError(null);
    fetchEvidenceBlob(token, downloadUrl)
      .then((blob) => {
        if (cancelled) return;
        const typed = new Blob([blob], {
          type: contentType || blob.type || "application/octet-stream",
        });
        objUrl = window.URL.createObjectURL(typed);
        setUrl(objUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objUrl) window.URL.revokeObjectURL(objUrl);
    };
  }, [token, downloadUrl, contentType, filename]);

  return { url, loading, error };
}

// Full document preview for the analysis workspace: renders the uploaded
// file itself (image / PDF / text inline; file card otherwise) with a meta
// footer. Images expand into the EvidenceLightbox via onOpenImage.
export function DocumentPreview({ token, ev, onOpenImage }) {
  const { t } = useTranslation();
  const { url, loading, error } = useEvidenceObjectUrl(token, ev || {});
  const [text, setText] = useState(null);

  const filename = ev?.filename || "evidence";
  const ctype = ev?.content_type || "";
  const lower = filename.toLowerCase();
  const image = isViewableImage(ev);
  const pdf = ctype === "application/pdf" || lower.endsWith(".pdf");
  const textish =
    ctype.startsWith("text/") || /\.(txt|csv|md|json|log)$/i.test(lower);

  useEffect(() => {
    setText(null);
    if (!textish || !ev?.download_url) return;
    let cancelled = false;
    fetchEvidenceBlob(token, ev.download_url)
      .then((b) => b.text())
      .then((txt) => {
        if (!cancelled) setText(txt.slice(0, 20000));
      })
      .catch(() => {
        if (!cancelled) setText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ev?.download_url, textish]);

  if (!ev) return null;

  return (
    <div>
      <div className="flex min-h-[240px] items-center justify-center bg-slate-950/[0.02] p-4">
        {loading && (
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            {t("analysis.loadingFile", { defaultValue: "Loading file…" })}
          </span>
        )}
        {error && !loading && (
          <span className="flex items-center gap-2 text-sm text-red-600">
            <FileWarning size={16} />
            {t("home.upload.openFailed", { name: filename })}
          </span>
        )}
        {!loading && !error && image && url && (
          <button
            onClick={onOpenImage}
            title={t("analysis.expandFile", { defaultValue: "Click to expand" })}
            className="cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg"
          >
            <img
              src={url}
              alt={filename}
              className="max-h-[420px] w-auto max-w-full rounded-lg object-contain shadow"
            />
          </button>
        )}
        {!loading && !error && pdf && url && (
          <iframe
            src={url}
            title={filename}
            className="h-[480px] w-full rounded-lg border border-slate-200 bg-white shadow-sm"
          />
        )}
        {!loading && !error && textish && text != null && (
          <pre className="max-h-[420px] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 text-left text-xs leading-5 text-slate-100 shadow-inner whitespace-pre-wrap wrap-break-word">
            {text || t("analysis.emptyFile", { defaultValue: "(empty file)" })}
          </pre>
        )}
        {!loading && !error && !image && !pdf && !textish && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <FileText size={22} />
            </span>
            <p className="max-w-[280px] truncate text-sm font-medium text-slate-700">
              {filename}
            </p>
            <p className="text-xs text-slate-500">
              {t("analysis.noPreview", {
                defaultValue: "No inline preview for this file type — download to view.",
              })}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-violet-100 px-5 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
          <span className="font-medium text-slate-700">{filename}</span>
          {ev.size_bytes
            ? ` · ${(ev.size_bytes / 1024).toFixed(1)} KB`
            : ""}
          {ev.storage === "filestore"
            ? t("analysis.evidenceStored", {
                defaultValue: " · Stored in FileStore",
              })
            : ""}
        </p>
        {image && url && (
          <button
            onClick={onOpenImage}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors cursor-pointer"
          >
            <Expand size={13} />
            {t("analysis.viewFile", { defaultValue: "View" })}
          </button>
        )}
        {url && (
          <a
            href={url}
            download={filename}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-900/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-900 transition-colors cursor-pointer"
          >
            <Download size={13} />
            {t("analysis.downloadFile", { defaultValue: "Download" })}
          </a>
        )}
      </div>
    </div>
  );
}

// Fullscreen viewer: image preview + explicit Download button.
// Mounted once per surface (Home chat, AnalysisPanel) and fed via `ev`.
export function EvidenceLightbox({ token, ev, onClose }) {
  const { t } = useTranslation();
  const { url, loading, error } = useEvidenceObjectUrl(token, ev || {});
  const name = ev?.filename || "evidence";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!ev) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div
        className="flex max-h-full w-auto max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
          <div className="flex shrink-0 items-center gap-2">
            {url && (
              <a
                href={url}
                download={name}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-900/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-900 transition cursor-pointer"
              >
                <Download size={13} />
                {t("analysis.downloadFile", { defaultValue: "Download" })}
              </a>
            )}
            <button
              onClick={onClose}
              aria-label={t("analysis.close", { defaultValue: "Close" })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex min-h-[200px] items-center justify-center bg-slate-100 p-4">
          {loading && (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              {t("analysis.loadingFile", { defaultValue: "Loading file…" })}
            </span>
          )}
          {error && (
            <span className="flex items-center gap-2 text-sm text-red-600">
              <FileWarning size={16} />
              {t("home.upload.openFailed", { name })}
            </span>
          )}
          {url && !error && (
            <img
              src={url}
              alt={name}
              className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow"
            />
          )}
        </div>
      </div>
    </div>
  );
}
