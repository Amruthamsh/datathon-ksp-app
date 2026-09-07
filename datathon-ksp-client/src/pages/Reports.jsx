import React, { useState, useEffect, useMemo } from "react";
import {
  Maximize2,
  Minimize2,
  ChevronDown,
  X,
  RotateCcw,
  LayoutGrid,
  BarChart2,
  Loader2,
  Code,
  Check,
  Copy,
  Trash,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import ChartRenderer from "../components/ChartRenderer.jsx";
import { listReports, executeReportQuery, deleteReport } from "../api/reports";
import { useAuth } from "../auth/AuthContext";

// ── SQL & Reasoning Details ───────────────────────────────────────────────────

function SqlDetailsDrawer({ report, chartConfig }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (report.sql_query) {
      navigator.clipboard.writeText(report.sql_query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 text-xs space-y-3 border-t border-slate-200">
      {chartConfig?.reason && (
        <div>
          <span className="font-bold text-slate-500 block mb-1 uppercase tracking-wider text-[10px]">
            {t("reports.aiReasoning")}
          </span>
          <p className="bg-slate-950 text-blue-300 leading-relaxed p-2.5 rounded-lg border border-slate-700/60">
            {chartConfig.reason}
          </p>
        </div>
      )}
      {report.sql_query && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              {t("reports.executedSql")}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-500 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" /> {t("reports.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> {t("reports.copySql")}
                </>
              )}
            </button>
          </div>
          <pre className="p-3 bg-slate-950 text-blue-300 rounded-lg overflow-x-auto font-mono text-[11px] border border-slate-800 whitespace-pre-wrap break-all leading-normal">
            {report.sql_query}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const Reports = () => {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [hiddenWidgetIds, setHiddenWidgetIds] = useState(new Set());
  const [minimizedWidgetIds, setMinimizedWidgetIds] = useState(new Set());
  const [expandedWidgetId, setExpandedWidgetId] = useState(null);
  const [showSqlWidgetIds, setShowSqlWidgetIds] = useState(new Set());

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await listReports(token);
        const fetched = response?.reports || [];

        const populated = await Promise.all(
          fetched.map(async (report) => {
            if (!report.sql_query) return report;
            try {
              const result = await executeReportQuery(report.sql_query, token);
              return { ...report, data: result?.data || result || [] };
            } catch (err) {
              console.error(
                `Query failed for report ${report.report_id}:`,
                err,
              );
              return { ...report, data: [], error: t("reports.loadFailed") };
            }
          }),
        );

        if (isMounted) setReports(populated);
      } catch (err) {
        console.error("Error fetching reports:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps -- t is stable; no refetch on language switch

  const handleDelete = async (reportId) => {
    if (!window.confirm(t("reports.deleteConfirm"))) return;
    try {
      await deleteReport(token, reportId);
      setReports((prev) => prev.filter((r) => r.report_id !== reportId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert(t("reports.deleteFailed"));
    }
  };

  const parsedCharts = useMemo(
    () =>
      reports.map((report) => {
        let chartConfig = null;
        try {
          if (typeof report.charts === "string") {
            const parsed = JSON.parse(report.charts);
            chartConfig = Array.isArray(parsed) ? parsed[0] : parsed;
          } else if (Array.isArray(report.charts)) {
            chartConfig = report.charts[0];
          } else {
            chartConfig = report.charts;
          }
        } catch (e) {
          console.error("Failed to parse chart config:", e);
        }
        return { report, chartConfig };
      }),
    [reports],
  );

  const toggleSet = (setter, id) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleResetDashboard = () => {
    setHiddenWidgetIds(new Set());
    setMinimizedWidgetIds(new Set());
    setExpandedWidgetId(null);
    setShowSqlWidgetIds(new Set());
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="text-sm font-medium">
          {t("reports.loading")}
        </span>
      </div>
    );
  }

  const visibleItems = parsedCharts.filter(
    ({ report }) => !hiddenWidgetIds.has(String(report.report_id)),
  );

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-blue-600" /> {t("reports.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {t("reports.subtitle")}
          </p>
        </div>
        {hiddenWidgetIds.size > 0 && (
          <button
            onClick={handleResetDashboard}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t("reports.restore", {count: hiddenWidgetIds.size})}
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center bg-white">
            <BarChart2 className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700">
              {t("reports.noActiveWidgets")}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {t("reports.allHidden")}
            </p>
            <button
              onClick={handleResetDashboard}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer"
            >
              {t("reports.resetDashboard")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {visibleItems.map(({ report, chartConfig }) => {
              const id = String(report.report_id);
              const isMinimized = minimizedWidgetIds.has(id);
              const isSqlVisible = showSqlWidgetIds.has(id);

              return (
                <div
                  key={id}
                  className={`flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs transition-all duration-200 hover:shadow-md overflow-hidden ${isMinimized ? "h-auto" : "h-[26rem]"}`}
                >
                  {/* Widget header */}
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 select-none shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <h2 className="truncate text-sm font-semibold text-slate-800">
                        {report.title || t("reports.untitledReport")}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDelete(id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                        title={t("reports.actions.deleteReport")}
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleSet(setShowSqlWidgetIds, id)}
                        className={`p-1.5 rounded transition cursor-pointer ${isSqlVisible ? "bg-slate-200 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"}`}
                        title={t("reports.actions.viewSql")}
                      >
                        <Code className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleSet(setMinimizedWidgetIds, id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition cursor-pointer"
                        title={isMinimized ? t("reports.actions.expand") : t("reports.actions.minimize")}
                      >
                        {isMinimized ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <Minimize2 className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setExpandedWidgetId(id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition cursor-pointer"
                        title={t("reports.actions.fullScreen")}
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setHiddenWidgetIds((prev) => new Set(prev).add(id))
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                        title={t("reports.actions.hideWidget")}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Widget body */}
                  {!isMinimized && (
                    <>
                      {isSqlVisible ? (
                        <div className="flex-1 overflow-y-auto">
                          <SqlDetailsDrawer
                            report={report}
                            chartConfig={chartConfig}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 min-h-0 p-4">
                          {report.error ? (
                            <div className="flex h-full items-center justify-center text-xs text-red-500">
                              {report.error}
                            </div>
                          ) : (
                            <ChartRenderer
                              rawConfig={chartConfig}
                              rawRows={report.data || []}
                              compact
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full-screen modal */}
      {expandedWidgetId &&
        (() => {
          const item = parsedCharts.find(
            ({ report }) => String(report.report_id) === expandedWidgetId,
          );
          if (!item) return null;
          const { report, chartConfig } = item;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
              <div className="flex h-[90vh] w-[95vw] max-w-7xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {report.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {t("reports.detailedView")}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedWidgetId(null)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 p-6 min-h-0 overflow-y-auto space-y-4">
                  <div className="h-[55vh] w-full">
                    {/* Full-size, not compact */}
                    <ChartRenderer
                      rawConfig={chartConfig}
                      rawRows={report.data || []}
                    />
                  </div>
                  <SqlDetailsDrawer report={report} chartConfig={chartConfig} />
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default Reports;
