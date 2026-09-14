import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Download, FileWarning, FileText, Loader2, Expand, ScanLine, Eye, EyeOff } from "lucide-react";
import { fetchEvidenceBlob } from "../api/chat";

// Images open in an in-app viewer (FileStore has no public URLs, and the
// backend always streams as application/octet-stream, so re-wrap the blob
// with the stored content type for correct rendering).
export function isViewableImage(ev) {
  if (!ev) return false;
  if ((ev.content_type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(ev.filename || "");
}

// OCR overlay colours — same semantics as the DocOcrPanel POC (red FIR-No,
// amber sections, blue vehicles, green phones, purple stations, cyan dates).
export const OCR_KIND_STYLE = {
  fir_no: "border-red-600 text-red-700 bg-red-600/10",
  section: "border-amber-600 text-amber-800 bg-amber-500/10",
  vehicle: "border-blue-700 text-blue-800 bg-blue-600/10",
  phone: "border-green-700 text-green-800 bg-green-600/10",
  station: "border-purple-700 text-purple-800 bg-purple-600/10",
  date: "border-cyan-700 text-cyan-800 bg-cyan-600/10",
  name: "border-slate-700 text-slate-800 bg-slate-500/10",
  other: "border-slate-400 text-slate-600 bg-slate-400/10",
};

export function hasOcrData(ev) {
  if (!ev) return false;
  return Boolean(
    (Array.isArray(ev.ocr_blocks) && ev.ocr_blocks.length > 0) ||
      (ev.ocr_text || "").trim() ||
      (ev.doc_summary || "").trim() ||
      (ev.ocr_entities && Object.values(ev.ocr_entities).some((v) => (v || []).length > 0)),
  );
}

// Image with VLM bounding boxes overlaid (0-1000 relative coords → %).
// Hover any box for the transcribed text + confidence.
export function OcrOverlayImage({ url, filename, blocks, showBoxes, rounded = "rounded-lg" }) {
  return (
    <div className={`relative ${rounded} overflow-hidden bg-slate-100`}>
      <img
        src={url}
        alt={filename || "evidence"}
        className="block w-full object-contain"
      />
      {showBoxes &&
        (blocks || []).map((b, i) => (
          <div
            key={i}
            title={`${b.text || ""} (${Math.round((b.conf ?? 0.7) * 100)}%)`}
            className={`group absolute border-2 ${OCR_KIND_STYLE[b.kind] || OCR_KIND_STYLE.other}`}
            style={{
              left: `${(b.x || 0) / 10}%`,
              top: `${(b.y || 0) / 10}%`,
              width: `${(b.w || 8) / 10}%`,
              height: `${(b.h || 8) / 10}%`,
            }}
          >
            <span className="absolute -top-5 left-0 z-10 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
              {b.text} · {Math.round((b.conf ?? 0.7) * 100)}%
            </span>
            {b.kind && b.kind !== "other" && (
              <span className="absolute -top-2 -left-2 rounded-sm bg-slate-900 px-1 text-[9px] font-bold uppercase text-white">
                {String(b.kind).replace("_", " ")}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

// OCR analysis section for workspace evidence: vision summary, entity chips,
// full transcription. Rendered under the document preview when the backend
// attached OCR data to the evidence meta.
export function OcrDetails({ ev }) {
  const { t } = useTranslation();
  const entities = useMemo(() => {
    const out = [];
    for (const [group, vals] of Object.entries(ev?.ocr_entities || {})) {
      for (const v of vals || []) out.push({ group, value: v });
    }
    return out.slice(0, 40);
  }, [ev]);
  const transcription = (ev?.ocr_text || ev?.snippet || "").trim();
  if (!ev?.doc_summary && entities.length === 0 && !transcription) return null;
  return (
    <div className="space-y-3 border-t border-violet-100 px-5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-900">
        <ScanLine size={12} />
        {t("analysis.ocrAnalysis", { defaultValue: "OCR analysis" })}
      </p>
      {ev.doc_summary && (
        <p className="text-[13px] leading-6 text-slate-800">{ev.doc_summary}</p>
      )}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entities.map((c, i) => (
            <span
              key={i}
              title={c.group}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-800"
            >
              {c.value}
            </span>
          ))}
        </div>
      )}
      {transcription && (
        <details className="rounded-md border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
            {t("analysis.ocrText", {
              count: transcription.length,
              defaultValue: `Full OCR text (${transcription.length} chars)`,
            })}
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-5 text-slate-700">
            {transcription}
          </pre>
        </details>
      )}
    </div>
  );
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
  const [showBoxes, setShowBoxes] = useState(true);

  const filename = ev?.filename || "evidence";
  const ctype = ev?.content_type || "";
  const lower = filename.toLowerCase();
  const image = isViewableImage(ev);
  const ocr = hasOcrData(ev);
  const blocks = Array.isArray(ev?.ocr_blocks) ? ev.ocr_blocks : [];
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
          ocr ? (
            <div className="w-full">
              <button
                onClick={onOpenImage}
                title={t("analysis.expandFile", { defaultValue: "Click to expand" })}
                className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg"
              >
                <OcrOverlayImage
                  url={url}
                  filename={filename}
                  blocks={blocks}
                  showBoxes={showBoxes && blocks.length > 0}
                />
              </button>
              <p className="mt-1.5 text-center text-[11px] text-slate-500">
                {t("analysis.ocrHoverHint", {
                  count: blocks.length,
                  defaultValue:
                    blocks.length > 0
                      ? `${blocks.length} OCR regions — hover any box for text + confidence. Click image to expand.`
                      : "Click image to expand.",
                })}
              </p>
            </div>
          ) : (
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
          )
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
      {/* OCR analysis: vision summary, entity chips, transcription */}
      {!loading && !error && ocr && <OcrDetails ev={ev} />}
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
        {image && blocks.length > 0 && (
          <button
            onClick={() => setShowBoxes((s) => !s)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {showBoxes ? <EyeOff size={13} /> : <Eye size={13} />}
            {showBoxes
              ? t("analysis.hideBoxes", { defaultValue: "Hide boxes" })
              : t("analysis.showBoxes", { defaultValue: "Show boxes" })}
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
  const [showBoxes, setShowBoxes] = useState(true);
  const name = ev?.filename || "evidence";
  const ocr = hasOcrData(ev);
  const blocks = Array.isArray(ev?.ocr_blocks) ? ev.ocr_blocks : [];
  const transcription = (ev?.ocr_text || ev?.snippet || "").trim();

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
        <div className="flex max-h-[80vh] min-h-[200px] flex-col items-center justify-center overflow-y-auto bg-slate-100 p-4">
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
            ocr && blocks.length > 0 ? (
              <div className="w-full max-w-3xl">
                <OcrOverlayImage
                  url={url}
                  filename={name}
                  blocks={blocks}
                  showBoxes={showBoxes}
                />
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setShowBoxes((s) => !s)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {showBoxes ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showBoxes
                      ? t("analysis.hideBoxes", {
                          defaultValue: "Hide boxes",
                        })
                      : t("analysis.showBoxes", {
                          defaultValue: "Show boxes",
                        })}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {t("analysis.ocrHoverHintShort", {
                      count: blocks.length,
                      defaultValue: `${blocks.length} OCR regions — hover for text`,
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <img
                src={url}
                alt={name}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow"
              />
            )
          )}
          {url && !error && ocr && transcription && (
            <details className="mt-3 w-full max-w-3xl rounded-md border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
                {t("analysis.ocrText", {
                  count: transcription.length,
                  defaultValue: `Full OCR text (${transcription.length} chars)`,
                })}
              </summary>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-5 text-slate-700">
                {transcription}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
