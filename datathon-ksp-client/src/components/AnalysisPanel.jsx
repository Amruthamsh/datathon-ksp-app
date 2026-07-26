import { useState } from "react";
import { Save, Download } from "lucide-react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { toBlob } from "html-to-image";

import ChartRenderer, { computeChartHeight } from "./ChartRenderer";
import { formatValue } from "../utils/chatUtils";
import { saveReport } from "../api/reports";
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
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <Download size={14} className="text-slate-500" />
          <span>{t("analysis.exportExcel")}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-slate-200 px-3 py-3 align-top font-semibold text-slate-700"
                  >
                    <button
                      onClick={() => toggleSort(col)}
                      className="flex items-center gap-1 hover:text-blue-600 transition"
                    >
                      <span className="whitespace-normal wrap-break-word">
                        {col}
                      </span>
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
                        className="border-b border-slate-100 px-3 py-3 align-top text-slate-700"
                      >
                        <span className="block whitespace-normal wrap-break-word">
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

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AnalysisPanel({ analysis }) {
  const { t } = useTranslation();
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const charts = Array.isArray(analysis?.charts) ? analysis.charts : [];
  const rowCount = rows.length;

  const [saving, setSaving] = useState(false);
  const { token } = useAuth();

  async function handleSaveReport() {
    try {
      setSaving(true);
      await saveReport(token, {
        title: charts[0]?.title || charts[0]?.intent || "Query Analysis",
        sql_query: analysis.sql_query,
        charts: analysis.charts,
        summary: analysis.response || "",
      });
      alert(t("analysis.reportAdded"));
    } catch (err) {
      console.error(err);
      alert(t("analysis.unableToSaveReport"));
    } finally {
      setSaving(false);
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
        generated_by: "KSP Intelligence Officer",
        executive_summary: analysis.response ?? "",
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
    (analysis.sql_result?.length === 0 && analysis.charts?.length === 0)
  ) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80 px-8 text-center text-slate-500 shadow-sm">
        {t("analysis.pickResponse")}
      </div>
    );
  }

  const hasCharts = charts.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-linear-to-b from-white via-slate-50 to-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur z-10">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {t("analysis.workspace")}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-900">
              {charts[0]?.title || charts[0]?.intent || t("analysis.queryAnalysis")}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {hasCharts
                ? `${charts.length} chart${charts.length > 1 ? "s" : ""}`
                : t("analysis.table")}
            </div>
            <button
              onClick={handleSaveReport}
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 cursor-pointer"
            >
              <Save size={15} />
              {saving ? t("analysis.adding") : t("analysis.addToReports")}
            </button>
            <div className="relative group">
              <button className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer">
                <Download size={15} /> {t("analysis.export")}
              </button>
              <div className="absolute right-0 top-full z-50 pt-2 hidden w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl group-hover:block">
                <button
                  onClick={() => exportAnalysis("pdf")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 cursor-pointer"
                >
                  PDF
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
        <section className="space-y-4">
          {hasCharts &&
            charts.map((chartConfig, idx) => {
              const containerHeight = computeChartHeight(chartConfig, rows);
              return (
                <div
                  key={idx}
                  id={`chart-${idx}`}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {chartConfig.title}
                    </h3>
                  </div>
                  <div
                    style={{ height: containerHeight }}
                    className="rounded-2xl bg-linear-to-br from-slate-50 to-slate-100 p-3 flex flex-col overflow-hidden transition-[height] duration-300 ease-out"
                  >
                    <ChartRenderer rawConfig={chartConfig} rawRows={rows} />
                  </div>
                </div>
              );
            })}

          <details
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            open
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              {t("analysis.sqlResults")}
              {rowCount > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {t("analysis.rows", { count: rowCount })}
                </span>
              )}
            </summary>
            <div className="mt-4">
              <DataTable rows={rows} columns={columns} />
            </div>
          </details>

          <details
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            open
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              {t("analysis.sqlQuery")}
            </summary>
            <div className="mt-4">
              <pre className="overflow-x-hidden whitespace-pre-wrap wrap-break-word rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100 shadow-inner">
                {analysis?.sql_query || t("analysis.noQueryAvailable")}
              </pre>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
