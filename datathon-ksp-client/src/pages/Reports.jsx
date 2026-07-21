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
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { listReports, executeReportQuery, deleteReport } from "../api/reports";
import { useAuth } from "../auth/AuthContext";

const CHART_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#f97316",
  "#db2777",
  "#16a34a",
  "#dc2626",
  "#0284c7",
];

// ── Data Profiling & Helper Functions ────────────────────────────────────────

function isNumeric(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat().format(value);
  }
  return String(value);
}

function formatHeaderLabel(str) {
  if (!str) return "";
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function looksLikeIdentifier(colName) {
  return /(id|uuid|guid|caseid|casemasterid|fir|pk)$/i.test(colName);
}

function getColumnTypes(data, requestedColumns = []) {
  if (!Array.isArray(data) || data.length === 0)
    return { numeric: [], categorical: [] };

  const colsToCheck =
    requestedColumns.length > 0 ? requestedColumns : Object.keys(data[0]);

  const numeric = [];
  const categorical = [];

  colsToCheck.forEach((col) => {
    if (looksLikeIdentifier(col)) return;

    const isNum = data.every((row) => {
      const val = row?.[col];
      return val === null || val === undefined || isNumeric(val);
    });

    if (isNum) numeric.push(col);
    else categorical.push(col);
  });

  return { numeric, categorical };
}

function getUniqueCount(data, col) {
  if (!col) return 0;
  return new Set(data.map((row) => row?.[col])).size;
}

function getMaxLabelLength(data, col) {
  if (!col) return 0;
  let max = 0;
  data.forEach((row) => {
    const len = String(row?.[col] || "").length;
    if (len > max) max = len;
  });
  return max;
}

function resolveChartLayout(intent, requestedColumns, data) {
  const { numeric, categorical } = getColumnTypes(data, requestedColumns);

  let chart_type = "bar";
  let xKey = null;
  let yKey = null;
  let categoryKey = categorical[0] || null;
  let valueKey = numeric[0] || null;
  let seriesKey = categorical[1] || null;

  if (intent === "time_series") {
    chart_type = "line";
    xKey = categoryKey;
    yKey = valueKey;
  } else if (intent === "correlation" && numeric.length >= 2) {
    chart_type = "scatter";
    xKey = numeric[0];
    yKey = numeric[1];
    seriesKey = categoryKey;
  } else if (
    intent === "heatmap" ||
    (intent === "distribution" &&
      categorical.length >= 2 &&
      numeric.length >= 1)
  ) {
    chart_type = "heatmap";
    xKey = categorical[0];
    yKey = categorical[1];
    valueKey = numeric[0];
  } else if (intent === "part_of_whole") {
    const unique = getUniqueCount(data, categoryKey);
    chart_type = unique > 8 ? "horizontal_bar" : "donut";
  } else {
    const unique = getUniqueCount(data, categoryKey);
    const maxLen = getMaxLabelLength(data, categoryKey);
    chart_type = unique > 12 || maxLen > 15 ? "horizontal_bar" : "bar";
  }

  return { chart_type, xKey, yKey, categoryKey, valueKey, seriesKey };
}

function buildHeatmapBuckets(data, xKey, yKey, valueKey) {
  const xLabels = Array.from(new Set(data.map((row) => String(row?.[xKey]))));
  const yLabels = Array.from(new Set(data.map((row) => String(row?.[yKey]))));
  const buckets = new Map();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  data.forEach((row) => {
    const xValue = String(row?.[xKey]);
    const yValue = String(row?.[yKey]);
    const rawValue = Number(row?.[valueKey] ?? 0);
    const key = `${xValue}__${yValue}`;
    buckets.set(key, rawValue);
    min = Math.min(min, rawValue);
    max = Math.max(max, rawValue);
  });

  return { xLabels, yLabels, buckets, min, max };
}

function HeatmapChart({ data, xKey, yKey, valueKey }) {
  const { xLabels, yLabels, buckets, min, max } = buildHeatmapBuckets(
    data,
    xKey,
    yKey,
    valueKey,
  );
  const range = max - min || 1;

  return (
    <div className="flex h-full w-full flex-col space-y-3 min-h-0 max-h-full">
      <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-slate-500">
        <span>Low</span>
        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-[#dbeafe] via-[#38bdf8] to-[#1d4ed8]" />
        <span>High</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white">
        <div
          className="grid min-w-max bg-white"
          style={{
            gridTemplateColumns: `140px repeat(${xLabels.length}, minmax(110px, 1fr))`,
          }}
        >
          <div className="sticky top-0 left-0 z-30 bg-slate-200 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b-2 border-r-2 border-slate-300 select-none flex items-center justify-center">
            {formatHeaderLabel(yKey)} / {formatHeaderLabel(xKey)}
          </div>

          {xLabels.map((label) => (
            <div
              key={label}
              className="sticky top-0 z-20 bg-slate-100 px-2 py-2 text-center text-xs font-bold text-slate-700 border-b-2 border-r border-slate-200 flex items-center justify-center"
            >
              {formatValue(label)}
            </div>
          ))}

          {yLabels.map((rowLabel) => (
            <div key={`row-${rowLabel}`} className="contents">
              <div className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 border-b border-r-2 border-slate-200 flex items-center">
                {formatValue(rowLabel)}
              </div>

              {xLabels.map((colLabel) => {
                const cellValue = buckets.get(`${colLabel}__${rowLabel}`);
                const normalized =
                  cellValue === undefined ? 0 : (cellValue - min) / range;
                const background = `rgba(29, 78, 216, ${0.08 + normalized * 0.85})`;

                return (
                  <div
                    key={`${rowLabel}-${colLabel}`}
                    className="flex h-10 items-center justify-center border-b border-r border-slate-100 text-xs font-semibold text-slate-900 transition-colors hover:bg-black/5"
                    style={{ background }}
                    title={`${formatHeaderLabel(yKey)}: ${formatValue(rowLabel)} | ${formatHeaderLabel(xKey)}: ${formatValue(colLabel)} | Value: ${formatValue(cellValue)}`}
                  >
                    {formatValue(cellValue)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RenderChart({ rawConfig, data }) {
  if (!rawConfig || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        No preview data available
      </div>
    );
  }

  const { intent, columns } = rawConfig;
  const layout = resolveChartLayout(intent, columns, data);
  const { chart_type, xKey, yKey, categoryKey, valueKey, seriesKey } = layout;

  if (chart_type === "heatmap" && xKey && yKey && valueKey) {
    return (
      <HeatmapChart data={data} xKey={xKey} yKey={yKey} valueKey={valueKey} />
    );
  }

  if (
    (chart_type === "pie" || chart_type === "donut") &&
    categoryKey &&
    valueKey
  ) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 25px rgba(15, 23, 42, 0.1)",
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={categoryKey}
            innerRadius={chart_type === "donut" ? 50 : 0}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry?.[categoryKey] ?? index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart_type === "scatter" && xKey && yKey) {
    const seriesGroups = seriesKey
      ? Array.from(new Set(data.map((r) => r?.[seriesKey]))).map((val) => ({
          name: String(val),
          data: data.filter((r) => r?.[seriesKey] === val),
        }))
      : [{ name: null, data }];

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            dataKey={xKey}
            type="number"
            tick={{ fill: "#475569", fontSize: 11 }}
          />
          <YAxis
            dataKey={yKey}
            type="number"
            tick={{ fill: "#475569", fontSize: 11 }}
          />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Legend verticalAlign="top" height={36} />
          {seriesGroups.map((group, idx) => (
            <Scatter
              key={group.name ?? "default"}
              name={group.name ?? undefined}
              data={group.data}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if ((chart_type === "line" || chart_type === "area") && xKey && yKey) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis dataKey={xKey} tick={{ fill: "#475569", fontSize: 11 }} />
          <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
          <Tooltip />
          <Legend verticalAlign="top" height={36} />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (
    (chart_type === "bar" || chart_type === "horizontal_bar") &&
    categoryKey &&
    valueKey
  ) {
    const isHorizontal = chart_type === "horizontal_bar";
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout={isHorizontal ? "vertical" : "horizontal"}
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: isHorizontal ? 30 : 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                dataKey={valueKey}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey={categoryKey}
                width={100}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={categoryKey}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
            </>
          )}
          <Tooltip />
          <Legend verticalAlign="top" height={36} />
          <Bar
            dataKey={valueKey}
            radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry?.[categoryKey] ?? index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-slate-400 text-sm">
      Could not render visualization layout
    </div>
  );
}

// ── SQL & Reasoning Details Component ──────────────────────────────────────

function SqlDetailsDrawer({ report, chartConfig }) {
  const [copied, setCopied] = useState(false);

  const handleCopySql = () => {
    if (report.sql_query) {
      navigator.clipboard.writeText(report.sql_query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 text-slate-900 text-xs space-y-3 border-t border-slate-700">
      {chartConfig?.reason && (
        <div>
          <span className="font-bold text-slate-700 block mb-1 uppercase tracking-wider text-[10px]">
            AI Reasoning
          </span>
          <p className="bg-slate-950 text-blue-300 leading-relaxed p-2.5 rounded-lg border border-slate-700/60">
            {chartConfig.reason}
          </p>
        </div>
      )}

      {report.sql_query && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              Executed SQL Query
            </span>
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-blue-400 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> Copy SQL
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

// ── Main Dashboard Component ────────────────────────────────────────────────

const Reports = () => {
  const { token } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dashboard Widget State Management
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState(new Set());
  const [minimizedWidgetIds, setMinimizedWidgetIds] = useState(new Set());
  const [expandedWidgetId, setExpandedWidgetId] = useState(null);
  const [showSqlWidgetIds, setShowSqlWidgetIds] = useState(new Set());

  useEffect(() => {
    let isMounted = true;

    const fetchAndExecuteReports = async () => {
      try {
        setLoading(true);
        const response = await listReports(token);
        const fetchedReports = response?.reports || [];

        const populatedReports = await Promise.all(
          fetchedReports.map(async (report) => {
            if (report.sql_query) {
              try {
                const queryResult = await executeReportQuery(
                  report.sql_query,
                  token,
                );
                return {
                  ...report,
                  data: queryResult?.data || queryResult || [],
                };
              } catch (err) {
                console.error(
                  `Error executing query for report ${report.report_id}:`,
                  err,
                );
                return { ...report, data: [], error: "Failed to load data" };
              }
            }
            return report;
          }),
        );

        if (isMounted) {
          setReports(populatedReports);
        }
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAndExecuteReports();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const DeleteReport = async (reportId) => {
    if (!window.confirm("Are you sure you want to delete this report?")) {
      return;
    }

    try {
      const response = await deleteReport(token, reportId);

      // Remove the deleted report from the state
      setReports((prevReports) =>
        prevReports.filter((report) => report.report_id !== reportId),
      );
    } catch (error) {
      console.error("Error deleting report:", error);
      alert("Failed to delete the report. Please try again.");
    }
  };

  const parsedCharts = useMemo(() => {
    return reports.map((report) => {
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
        console.error("Failed to parse chart configuration:", e);
      }
      return { report, chartConfig };
    });
  }, [reports]);

  const handleToggleMinimize = (id) => {
    setMinimizedWidgetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSqlView = (id) => {
    setShowSqlWidgetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemoveWidget = (id) => {
    setHiddenWidgetIds((prev) => new Set(prev).add(id));
  };

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
          Executing queries and generating dashboard...
        </span>
      </div>
    );
  }

  const visibleItems = parsedCharts.filter(
    ({ report }) => !hiddenWidgetIds.has(String(report.report_id)),
  );

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-blue-600" /> Saved Analytics
            Reports
          </h1>
          <p className="text-sm text-slate-500">
            View visualizations or inspect dynamic queries.
          </p>
        </div>

        {hiddenWidgetIds.size > 0 && (
          <button
            onClick={handleResetDashboard}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore (
            {hiddenWidgetIds.size}) Hidden Widgets
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6 pt-6">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center bg-white my-auto">
            <BarChart2 className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700">
              No active widgets
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              All reports are currently hidden or no data was returned.
            </p>
            <button
              onClick={handleResetDashboard}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer"
            >
              Reset Dashboard
            </button>
          </div>
        ) : (
          /* Dynamic 2-Column Grid with Native Page Scrolling */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {visibleItems.map(({ report, chartConfig }) => {
              const id = String(report.report_id);
              const isMinimized = minimizedWidgetIds.has(id);
              const isSqlVisible = showSqlWidgetIds.has(id);

              return (
                <div
                  key={id}
                  className={`flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs transition-all duration-200 hover:shadow-md overflow-hidden ${
                    isMinimized ? "h-auto" : "h-105"
                  }`}
                >
                  {/* Header Bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 select-none shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <h2 className="truncate text-sm font-semibold text-slate-800">
                        {report.title || "Untitled Report"}
                      </h2>
                    </div>

                    {/* Control Icons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => DeleteReport(id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                        title="Delete Report"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleSqlView(id)}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          isSqlVisible
                            ? "bg-slate-200 text-blue-600"
                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
                        }`}
                        title="View SQL Query & Reason"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleMinimize(id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition cursor-pointer"
                        title={isMinimized ? "Expand Card" : "Minimize Card"}
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
                        title="Full Screen View"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveWidget(id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                        title="Hide Widget"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Body Content - Collapsible when Minimized */}
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
                            <RenderChart
                              rawConfig={chartConfig}
                              data={report.data || []}
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
      {/* Full Screen Viewport Modal */}
      {expandedWidgetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-6">
          {(() => {
            const selectedItem = parsedCharts.find(
              ({ report }) => String(report.report_id) === expandedWidgetId,
            );
            if (!selectedItem) return null;

            const { report, chartConfig } = selectedItem;

            return (
              <div className="flex h-[90vh] w-[95vw] max-w-7xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {report.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Detailed view and source query
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
                    <RenderChart
                      rawConfig={chartConfig}
                      data={report.data || []}
                    />
                  </div>

                  <SqlDetailsDrawer report={report} chartConfig={chartConfig} />
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default Reports;
