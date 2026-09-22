import { useEffect, useState } from "react";
import { Save, Download, Copy, Check, Paperclip, BookOpen, Minus, Plus, ExternalLink, Crosshair, Users, MapPin } from "lucide-react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { toBlob } from "html-to-image";

import ChartRenderer, { computeChartHeight } from "./ChartRenderer";
import { formatValue } from "../utils/chatUtils";
import { saveReport } from "../api/reports";
import { EvidenceLightbox, DocumentPreview } from "./EvidenceViewer";
import { useAuth } from "../auth/AuthContext";

// ── Data Table ───────────────────────────────────────────────────────────────

import { useMemo } from "react";

function DataTable({ rows = [], columns = [], filename = "export_data" }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filter, setFilter] = useState("");

  const toggleSort = (col) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) =>
        String(row?.[col] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, columns, filter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a?.[sortKey],
        bv = b?.[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleExportExcel = () => {
    if (!sorted.length) return;
    const exportData = sorted.map((row) => {
      const r = {};
      columns.forEach((col) => {
        r[col] = row?.[col] ?? "";
      });
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    ws["!cols"] = columns.map((col) => ({
      wch:
        Math.max(
          col.length,
          ...sorted.map((r) => String(r?.[col] ?? "").length),
        ) + 3,
    }));
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder={t("analysis.filterRows")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          onClick={handleExportExcel}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-blue-900/90 bg-blue-900/90 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <Download size={14} className="text-white" />
          <span>{t("analysis.exportExcel")}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap border-b border-slate-200 px-3 py-3 align-top font-semibold text-slate-700"
                  >
                    <button
                      onClick={() => toggleSort(col)}
                      className="flex items-center gap-1 hover:text-blue-600 transition"
                    >
                      <span className="whitespace-nowrap">{col}</span>
                      {sortKey === col ? (
                        sortDir === "asc" ? (
                          <ArrowUp
                            size={12}
                            className="shrink-0 text-blue-500"
                          />
                        ) : (
                          <ArrowDown
                            size={12}
                            className="shrink-0 text-blue-500"
                          />
                        )
                      ) : (
                        <ArrowUpDown
                          size={12}
                          className="shrink-0 text-slate-400"
                        />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length > 0 ? (
                sorted.map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50">
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="whitespace-nowrap border-b border-slate-100 px-3 py-3 align-top text-slate-700"
                      >
                        <span className="block whitespace-nowrap">
                          {formatValue(row?.[col])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-500"
                    colSpan={Math.max(columns.length, 1)}
                  >
                    {filter
                      ? t("analysis.noRowsMatch")
                      : t("analysis.noResultRows")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Section ────────────────────────────────────────────────────
// Every workspace block (evidence, legal, charts, results, query) uses this
// so each one can be minimized independently, like the SQL query panel.

function CollapsibleSection({
  icon,
  title,
  subtitle,
  action,
  children,
  defaultOpen = true,
  bodyClassName = "p-4",
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
        {icon}
        <h3 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="truncate">{title}</span>
          {subtitle && (
            <span className="shrink-0 text-xs font-normal text-slate-500">
              {subtitle}
            </span>
          )}
        </h3>
        {action}
        <button
          onClick={() => setOpen((v) => !v)}
          title={open ? t("analysis.minimize") : t("analysis.expand")}
          aria-expanded={open}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
        >
          {open ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      </div>
      {open && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}

// ── Legal Reference Cards ──────────────────────────────────────────────────

function LegalReferenceCards({ references = [] }) {
  const { t } = useTranslation();
  if (!references.length) return null;
  return (
    <div className="space-y-3">
      {references.map((ref, i) => {
        const missing = ref.source === "codebook-missing";
        const bailLabel =
          ref.bailable == null
            ? "—"
            : ref.bailable
              ? t("analysis.bailable")
              : t("analysis.nonBailable");
        const cogLabel =
          ref.cognizable == null
            ? "—"
            : ref.cognizable
              ? t("analysis.cognizable")
              : t("analysis.nonCognizable");
        const equiv = ref.bns_equivalent
          ? `BNS ${ref.bns_equivalent}`
          : ref.ipc_equivalent
            ? `IPC ${ref.ipc_equivalent}`
            : null;
        return (
          <div
            key={`${ref.act}-${ref.section}-${i}`}
            className="overflow-hidden rounded-lg border border-amber-200/70 bg-amber-50/40"
          >
            <div className="flex items-center gap-2 px-4 pt-3">
              <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
                {ref.act}
              </span>
              <span className="text-sm font-bold text-slate-900">
                {t("analysis.section", { number: ref.section })}
              </span>
              {equiv && (
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  ↔ {equiv}
                </span>
              )}
              {missing ? (
                <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {t("analysis.verifyStatute")}
                </span>
              ) : (
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    ref.bailable
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {bailLabel}
                </span>
              )}
            </div>
            {ref.title && (
              <p className="px-4 pt-1 text-[13px] font-semibold text-slate-800">
                {ref.title}
              </p>
            )}
            {ref.plain_language ? (
              <p className="px-4 pt-1 text-xs leading-relaxed text-slate-600">
                {ref.plain_language}
              </p>
            ) : (
              missing && (
                <p className="px-4 pt-1 text-xs leading-relaxed text-slate-600">
                  {t("analysis.notInCodebook", {
                    act: ref.act,
                    section: ref.section,
                  })}
                </p>
              )
            )}
            {!missing && (
              <dl className="mx-4 mb-1 mt-2 grid grid-cols-1 gap-1.5 rounded-md bg-white/70 p-2.5 text-xs sm:grid-cols-3">
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">
                    {t("analysis.punishment")}
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {ref.punishment || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">
                    {t("analysis.bailability")}
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {bailLabel}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">
                    {t("analysis.cognizability")}
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {cogLabel}
                  </dd>
                </div>
              </dl>
            )}
            <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-1">
              {ref.kanoon_url && (
                <a
                  href={ref.kanoon_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} />
                  {t("analysis.indianKanoon")}
                </a>
              )}
              {ref.indiacode_url && (
                <a
                  href={ref.indiacode_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  <ExternalLink size={11} />
                  {t("analysis.indiaCode")}
                </a>
              )}
              {ref.offence_category && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">
                  {ref.offence_category}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Scene Intel Cards ──────────────────────────────────────────────────────

function SceneIntelCards({ cards = {} }) {
  const { t } = useTranslation();
  const pin = cards.pin || {};
  const crime = cards.crime || {};
  const MapLink = ({ url, label }) =>
    url ? (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={t("analysis.viewOnMap")}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        <MapPin size={10} />
        {label || t("analysis.viewOnMap")}
      </a>
    ) : null;
  const offenders = Array.isArray(cards.repeat_offenders)
    ? cards.repeat_offenders
    : [];
  const pois = cards.pois || {};
  const poiTypes = Array.isArray(pois.by_type) ? pois.by_type : [];
  const poiItems = Array.isArray(pois.items) ? pois.items : [];
  const byType = Array.isArray(crime.by_type) ? crime.by_type : [];
  const stations = Array.isArray(crime.stations) ? crime.stations : [];
  const recent = Array.isArray(crime.recent) ? crime.recent : [];
  const maxType = Math.max(1, ...byType.map((x) => x.count || 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
          <MapPin size={13} />
          {pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)}
        </span>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {t("analysis.radiusKm", { radius: pin.radius_km ?? 10 })}
        </span>
        <MapLink url={pin.maps_url} />
        <span className="ml-auto text-lg font-bold leading-none text-emerald-900">
          {crime.total ?? 0}
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
            {t("analysis.firsInRadius")}
          </span>
        </span>
      </div>

      {byType.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("analysis.crimeMix")}
          </p>
          <ul className="divide-y divide-slate-100">
            {byType.slice(0, 8).map((x) => (
              <li key={x.type} className="px-4 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{x.type}</span>
                  <span className="font-bold text-slate-900">{x.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round((100 * (x.count || 0)) / maxType)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stations.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("analysis.coveringStations")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stations.map((s) => (
              <span
                key={s.station}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
              >
                {s.station}
                <span className="font-bold text-slate-900">{s.count}</span>
                {s.maps_url && (
                  <a
                    href={s.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    title={t("analysis.viewOnMap")}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <MapPin size={11} />
                  </a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <p className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Users size={12} />
          {t("analysis.repeatOffenders")}
          <span className="ml-auto rounded-full bg-slate-900 px-1.5 py-px text-[10px] font-bold text-white">
            {offenders.length}
          </span>
        </p>
        {offenders.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {offenders.slice(0, 6).map((o) => (
              <li key={o.name} className="flex items-center gap-2 px-4 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                  {o.name}
                </span>
                <span className="shrink-0 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  {t("analysis.firCount", {
                    near: o.fir_in_radius ?? 0,
                    total: o.fir_total ?? 0,
                  })}
                </span>
                {o.last_seen && (
                  <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">
                    {o.last_seen}
                  </span>
                )}
                {o.maps_url && (
                  <a
                    href={o.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    title={t("analysis.viewActiveArea")}
                    className="shrink-0 text-blue-600 hover:text-blue-800"
                  >
                    <MapPin size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-xs text-slate-500">
            {t("analysis.noOffendersInRadius")}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <p className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {t("analysis.nearbyPois")}
          {pois.total != null && (
            <span className="ml-1 font-normal normal-case">
              ({t("analysis.poiTotal", { count: pois.total })})
            </span>
          )}
        </p>
        {pois.unavailable ? (
          <p className="px-4 py-3 text-xs text-slate-500">
            {t("analysis.poiUnavailable")}
          </p>
        ) : poiTypes.length > 0 ? (
          <div className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {poiTypes.map((p) => (
                <span
                  key={p.type}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900"
                >
                  {String(p.type).replace(/_/g, " ")}
                  <span className="font-bold">{p.count}</span>
                </span>
              ))}
            </div>
            {poiItems.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                {poiItems.slice(0, 8).map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {p.name || String(p.type).replace(/_/g, " ")}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                      {String(p.type).replace(/_/g, " ")}
                    </span>
                    {p.risk >= 4 && (
                      <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-700">
                        {t("analysis.highRisk")}
                      </span>
                    )}
                    {p.maps_url && (
                      <a
                        href={p.maps_url}
                        target="_blank"
                        rel="noreferrer"
                        title={t("analysis.viewOnMap")}
                        className="shrink-0 text-blue-600 hover:text-blue-800"
                      >
                        <MapPin size={12} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="px-4 py-3 text-xs text-slate-500">
            {t("analysis.noPoisInRadius")}
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("analysis.recentCases")}
          </p>
          <ul className="divide-y divide-slate-100">
            {recent.map((c, i) => (
              <li key={`${c.crime_no}-${i}`} className="flex items-center gap-2 px-4 py-1.5 text-xs">
                <span className="shrink-0 font-mono font-semibold text-slate-800">
                  {c.crime_no}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {c.type} · {c.station}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">{c.date}</span>
                {c.maps_url && (
                  <a
                    href={c.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    title={t("analysis.viewOnMap")}
                    className="shrink-0 text-blue-600 hover:text-blue-800"
                  >
                    <MapPin size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AnalysisPanel({ analysis }) {
  const { t } = useTranslation();
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const charts = Array.isArray(analysis?.charts) ? analysis.charts : [];
  const evidenceFiles = Array.isArray(analysis?.evidence_files)
    ? analysis.evidence_files
    : [];
  const legalReferences = Array.isArray(analysis?.legal_references)
    ? analysis.legal_references
    : [];
  const sceneCards =
    analysis?.scene_cards && typeof analysis.scene_cards === "object"
      ? analysis.scene_cards
      : {};
  const hasScene = Boolean(sceneCards.pin);
  const rowCount = rows.length;

  const [savingIdx, setSavingIdx] = useState(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [lightboxEv, setLightboxEv] = useState(null);
  const [selectedEvidenceIdx, setSelectedEvidenceIdx] = useState(0);
  const { token, officer } = useAuth();

  // Reset the document selector whenever a different turn's evidence loads.
  const evidenceKey = evidenceFiles.map((f) => f.file_id || f.filename).join("|");
  useEffect(() => {
    setSelectedEvidenceIdx(0);
  }, [evidenceKey]);
  const selectedEvidence =
    evidenceFiles[Math.min(selectedEvidenceIdx, evidenceFiles.length - 1)];

  async function handleCopySql() {
    const sql = analysis?.sql_query;
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch (err) {
      console.error(err);
      alert(t("analysis.copyFailed"));
    }
  }

  async function handleSaveChart(chartIdx) {
    try {
      setSavingIdx(chartIdx);
      const chart = charts[chartIdx];
      await saveReport(token, {
        title: chart?.title || chart?.intent || "Query Analysis",
        sql_query: analysis.sql_query,
        charts: [chart],
        summary: analysis.response || "",
      });
      alert(t("analysis.reportAdded"));
    } catch (err) {
      console.error(err);
      alert(t("analysis.unableToSaveReport"));
    } finally {
      setSavingIdx(null);
    }
  }

  async function exportAnalysis(format) {
    try {
      if (!analysis) return;
      const reportData = {
        title: analysis.charts?.[0]?.title ?? "Investigation Analysis Report",
        generated_at: new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
        generated_by: officer
          ? `${officer.rank}, ${officer.full_name}`
          : "KSP Intelligence Officer",
        executive_summary: analysis.response ?? "",
        analysis_response: analysis.response ?? "",
        sql: {
          query: analysis.sql_query ?? "",
          row_count: analysis.sql_result?.length ?? 0,
          rows: analysis.sql_result ?? [],
        },
        visualizations: (analysis.charts || []).map((c, i) => ({
          id: `chart-${i}`,
          title: c.title || `Visualization ${i + 1}`,
          intent: c.intent,
          reason: c.reason,
        })),
        follow_up_questions: analysis.follow_up_questions || [],
      };

      const formData = new FormData();
      formData.append("report", JSON.stringify(reportData));

      for (let i = 0; i < (analysis.charts || []).length; i++) {
        const el = document.getElementById(`chart-${i}`);
        if (el) {
          const blob = await toBlob(el, {
            backgroundColor: "#ffffff",
            cacheBust: true,
            pixelRatio: 2,
          });
          if (blob) formData.append("charts", blob, `chart-${i}.png`);
        }
      }

      const response = await fetch(`/api/reports/export/${format}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ksp_analysis_report_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert(t("analysis.exportFailed"));
    }
  }

  if (
    !analysis ||
    (analysis.sql_result?.length === 0 &&
      analysis.charts?.length === 0 &&
      evidenceFiles.length === 0 &&
      legalReferences.length === 0 &&
      !hasScene)
  ) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 px-8 text-center text-slate-500 shadow-sm">
        {t("analysis.pickResponse")}
      </div>
    );
  }

  const hasCharts = charts.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l-2 border-slate-200">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur z-10">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {t("analysis.workspace")}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-900">
              {charts[0]?.title ||
                charts[0]?.intent ||
                t("analysis.queryAnalysis")}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {hasScene && !hasCharts && rowCount === 0 && legalReferences.length === 0
                ? t("analysis.sceneIntel")
                : legalReferences.length > 0 && !hasCharts && rowCount === 0
                  ? t("analysis.sectionsCount", {
                      count: legalReferences.length,
                    })
                  : hasCharts
                    ? `${charts.length} chart${charts.length > 1 ? "s" : ""}`
                    : t("analysis.table")}
            </div>
            <div className="relative group">
              <button className="flex h-9 items-center gap-2 rounded-md bg-blue-900/90 px-3 text-sm font-medium text-white hover:bg-blue-900 cursor-pointer">
                <Download size={15} /> {t("analysis.export")}
              </button>
              <div className="absolute right-0 top-full z-50 pt-2 hidden w-44 rounded-md border border-slate-200 bg-white py-1 shadow-xl group-hover:block">
                <button
                  onClick={() => exportAnalysis("pdf")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 cursor-pointer"
                >
                  {t("analysis.pdf")}
                </button>
                <button
                  onClick={() => exportAnalysis("docx")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 cursor-pointer"
                >
                  {t("analysis.word")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 bg-slate-100">
        <section className="space-y-4">
          {/* Evidence — the uploaded document itself, shown above the analysis */}
          {evidenceFiles.length > 0 && selectedEvidence && (
            <CollapsibleSection
              icon={<Paperclip size={14} className="shrink-0 text-slate-500" />}
              title={t("analysis.evidence", { defaultValue: "Evidence" })}
              subtitle={t("analysis.evidenceCount", {
                count: evidenceFiles.length,
                defaultValue: `{{count}} file${evidenceFiles.length > 1 ? "s" : ""}`,
              })}
            >
              {evidenceFiles.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {evidenceFiles.map((f, i) => (
                    <button
                      key={f.file_id || i}
                      onClick={() => setSelectedEvidenceIdx(i)}
                      className={`inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                        i === Math.min(selectedEvidenceIdx, evidenceFiles.length - 1)
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">
                        {f.filename || `Evidence ${i + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <DocumentPreview
                token={token}
                ev={selectedEvidence}
                onOpenImage={() => setLightboxEv(selectedEvidence)}
              />
            </CollapsibleSection>
          )}
          {/* Scene Intel — radius workup around the dropped pin */}
          {hasScene && (
            <CollapsibleSection
              icon={<Crosshair size={14} className="shrink-0 text-emerald-600" />}
              title={t("analysis.sceneIntel")}
              subtitle={t("analysis.radiusKm", {
                radius: sceneCards.pin?.radius_km ?? 10,
              })}
            >
              <SceneIntelCards cards={sceneCards} />
            </CollapsibleSection>
          )}
          {/* Legal Reference — codebook sections that grounded the answer */}
          {legalReferences.length > 0 && (
            <CollapsibleSection
              icon={<BookOpen size={14} className="shrink-0 text-amber-600" />}
              title={t("analysis.legalReference")}
              subtitle={t("analysis.sectionsCount", {
                count: legalReferences.length,
              })}
            >
              <LegalReferenceCards references={legalReferences} />
            </CollapsibleSection>
          )}
          {hasCharts &&
            charts.map((chartConfig, idx) => {
              const containerHeight = computeChartHeight(chartConfig, rows);
              return (
                <CollapsibleSection
                  key={idx}
                  title={chartConfig.title}
                  action={
                    <button
                      onClick={() => handleSaveChart(idx)}
                      disabled={savingIdx !== null}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-blue-900/90 bg-blue-900/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Save size={13} className="text-white" />
                      {savingIdx === idx
                        ? t("analysis.adding")
                        : t("analysis.addToReports")}
                    </button>
                  }
                  bodyClassName="p-0"
                >
                  <div id={`chart-${idx}`}>
                    {(chartConfig.reason || chartConfig.intent) && (
                      <div className="border-b border-slate-100 px-5 py-3">
                        <p className="text-xs leading-relaxed text-slate-600">
                          {chartConfig.reason ||
                            t("analysis.aboutThisChartFallback", {
                              intent: chartConfig.intent,
                              defaultValue: `Visualization selected to best represent the query result.`,
                            })}
                        </p>
                      </div>
                    )}
                    <div
                      style={{ height: containerHeight }}
                      className="flex flex-col overflow-hidden bg-white p-4 transition-[height] duration-300 ease-out"
                    >
                      <ChartRenderer rawConfig={chartConfig} rawRows={rows} />
                    </div>
                  </div>
                </CollapsibleSection>
              );
            })}

          <CollapsibleSection
            title={t("analysis.sqlResults")}
            subtitle={
              rowCount > 0
                ? t("analysis.rows", { count: rowCount })
                : undefined
            }
          >
            <DataTable rows={rows} columns={columns} />
          </CollapsibleSection>

          <CollapsibleSection
            title={t("analysis.sqlQuery")}
            action={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopySql();
                }}
                disabled={!analysis?.sql_query}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copiedSql ? (
                  <>
                    <Check size={13} className="text-emerald-600" />
                    <span className="text-emerald-700">
                      {t("analysis.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>{t("analysis.copy")}</span>
                  </>
                )}
              </button>
            }
          >
            <pre className="overflow-x-hidden whitespace-pre-wrap wrap-break-word rounded-lg border border-slate-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100 shadow-inner">
              {analysis?.sql_query || t("analysis.noQueryAvailable")}
            </pre>
          </CollapsibleSection>
        </section>
      </div>
      {/* In-app image viewer for evidence (auth-safe, no new-tab 401s) */}
      {lightboxEv && (
        <EvidenceLightbox
          token={token}
          ev={lightboxEv}
          onClose={() => setLightboxEv(null)}
        />
      )}
    </div>
  );
}
