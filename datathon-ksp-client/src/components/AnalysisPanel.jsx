import { useState, useMemo } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Save,
  Download,
  FileText,
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
  Label,
} from "recharts";
import { toBlob } from "html-to-image";
import * as XLSX from "xlsx";

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

// ── Data Profiling Helpers ───────────────────────────────────────────────────

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

// ── Deterministic Layout Engine ──────────────────────────────────────────────

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
    if (unique > 8) {
      chart_type = "horizontal_bar";
    } else {
      chart_type = "donut";
    }
  } else {
    const unique = getUniqueCount(data, categoryKey);
    const maxLen = getMaxLabelLength(data, categoryKey);
    if (unique > 12 || maxLen > 15) {
      chart_type = "horizontal_bar";
    } else {
      chart_type = "bar";
    }
  }

  return { chart_type, xKey, yKey, categoryKey, valueKey, seriesKey };
}

// ── Heatmap Component ────────────────────────────────────────────────────────

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
      {/* Legend / Scale */}
      <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-slate-500">
        <span>Low</span>
        <div className="h-2 flex-1 rounded-full bg-linear-to-r from-[#dbeafe] via-[#38bdf8] to-[#1d4ed8]" />
        <span>High</span>
      </div>

      {/* Scrollable Viewport */}
      <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid min-w-max bg-white"
          style={{
            gridTemplateColumns: `160px repeat(${xLabels.length}, minmax(130px, 1fr))`,
          }}
        >
          {/* Top-Left Corner Piece */}
          <div className="sticky top-0 left-0 z-30 bg-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b-2 border-r-2 border-slate-300 select-none flex items-center justify-center">
            {formatHeaderLabel(yKey)} / {formatHeaderLabel(xKey)}
          </div>

          {/* X-Axis Headers */}
          {xLabels.map((label) => (
            <div
              key={label}
              className="sticky top-0 z-20 bg-slate-100 px-3 py-3 text-center text-xs font-bold text-slate-700 border-b-2 border-r border-slate-200 flex items-center justify-center"
            >
              {formatValue(label)}
            </div>
          ))}

          {/* Matrix Rows */}
          {yLabels.map((rowLabel) => {
            return (
              <div key={`row-${rowLabel}`} className="contents">
                {/* Y-Axis Headers */}
                <div className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 border-b border-r-2 border-slate-200 shadow-[1px_0_0_rgba(0,0,0,0.05)] flex items-center">
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
                      className="flex h-11 items-center justify-center border-b border-r border-slate-100 text-xs font-semibold text-slate-900 transition-colors hover:bg-black/5"
                      style={{ background }}
                      title={`${formatHeaderLabel(yKey)}: ${formatValue(rowLabel)} | ${formatHeaderLabel(xKey)}: ${formatValue(colLabel)} | Value: ${formatValue(cellValue)}`}
                    >
                      {formatValue(cellValue)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Chart Renderer ──────────────────────────────────────────────────────

function renderChart(rawConfig, data) {
  if (!rawConfig || !Array.isArray(data) || data.length === 0) return null;

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
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={categoryKey}
            innerRadius={chart_type === "donut" ? 72 : 0}
            outerRadius={150}
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
        <ScatterChart margin={{ top: 20, right: 24, bottom: 45, left: 65 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            dataKey={xKey}
            type="number"
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={{ stroke: "#94a3b8" }}
            tickLine={{ stroke: "#94a3b8" }}
          >
            <Label
              value={formatHeaderLabel(xKey)}
              position="insideBottom"
              offset={-25}
              style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            />
          </XAxis>
          <YAxis
            dataKey={yKey}
            type="number"
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={{ stroke: "#94a3b8" }}
            tickLine={{ stroke: "#94a3b8" }}
          >
            <Label
              value={formatHeaderLabel(yKey)}
              angle={-90}
              position="insideLeft"
              offset={-10}
              style={{
                fill: "#475569",
                fontSize: 12,
                fontWeight: 600,
                textAnchor: "middle",
              }}
            />
          </YAxis>
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
            cursor={{ strokeDasharray: "3 3" }}
          />
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
          margin={{ top: 20, right: 20, bottom: 45, left: 65 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={{ stroke: "#94a3b8" }}
          >
            <Label
              value={formatHeaderLabel(xKey)}
              position="insideBottom"
              offset={-25}
              style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
            />
          </XAxis>
          <YAxis
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={{ stroke: "#94a3b8" }}
          >
            <Label
              value={formatHeaderLabel(yKey)}
              angle={-90}
              position="insideLeft"
              offset={-10}
              style={{
                fill: "#475569",
                fontSize: 12,
                fontWeight: 600,
                textAnchor: "middle",
              }}
            />
          </YAxis>
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="#2563eb"
            strokeWidth={3}
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
            bottom: 45,
            left: isHorizontal ? 30 : 65,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                dataKey={valueKey}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(valueKey)}
                  position="insideBottom"
                  offset={-25}
                  style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
                />
              </XAxis>
              <YAxis
                type="category"
                dataKey={categoryKey}
                width={150}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(categoryKey)}
                  angle={-90}
                  position="insideLeft"
                  offset={-10}
                  style={{
                    fill: "#475569",
                    fontSize: 12,
                    fontWeight: 600,
                    textAnchor: "middle",
                  }}
                />
              </YAxis>
            </>
          ) : (
            <>
              <XAxis
                dataKey={categoryKey}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(categoryKey)}
                  position="insideBottom"
                  offset={-25}
                  style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
                />
              </XAxis>
              <YAxis
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(valueKey)}
                  angle={-90}
                  position="insideLeft"
                  offset={-10}
                  style={{
                    fill: "#475569",
                    fontSize: 12,
                    fontWeight: 600,
                    textAnchor: "middle",
                  }}
                />
              </YAxis>
            </>
          )}
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Bar
            dataKey={valueKey}
            radius={isHorizontal ? [0, 14, 14, 0] : [14, 14, 0, 0]}
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
    <div className="flex h-full items-center justify-center text-slate-400">
      Could not map columns {JSON.stringify(columns)} to a visualization.
    </div>
  );
}

// ── Data Table ───────────────────────────────────────────────────────────────
function DataTable({ rows = [], columns = [], filename = "export_data" }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filter, setFilter] = useState("");

  const toggleSort = (col) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
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
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Export filtered & sorted data to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!sorted.length) return;

    // Prepare data mapping only the displayed columns in order
    const exportData = sorted.map((row) => {
      const rowData = {};
      columns.forEach((col) => {
        rowData[col] = row?.[col] ?? "";
      });
      return rowData;
    });

    // Create worksheet & workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    // Auto-fit column widths (optional enhancement)
    const colWidths = columns.map((col) => ({
      wch:
        Math.max(
          col.length,
          ...sorted.map((r) => String(r?.[col] ?? "").length),
        ) + 3,
    }));
    worksheet["!cols"] = colWidths;

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* Top Bar with Filter & Export Button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Filter rows…"
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

        {/* Export Button */}
        <button
          onClick={handleExportExcel}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <Download size={14} className="text-slate-500" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* Table Section */}
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
                sorted.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
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
                      ? "No rows match the filter."
                      : "No result rows were returned."}
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

// ── Main Layout Component ────────────────────────────────────────────────────

export default function AnalysisPanel({ analysis }) {
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const charts = Array.isArray(analysis?.charts) ? analysis.charts : [];
  const rowCount = rows.length;

  const [saving, setSaving] = useState(false);

  async function handleSaveReport() {
    console.log("Saving analysis report ", analysis);
    try {
      setSaving(true);

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: charts[0]?.title || charts[0]?.intent || "Query Analysis",

          sql_query: analysis.sql_query,
          sql_result: analysis.sql_result,
          charts: analysis.charts,
          summary: analysis.response,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save report");
      }

      alert("Analysis saved.");
    } catch (err) {
      console.error(err);
      alert("Unable to save analysis.");
    } finally {
      setSaving(false);
    }
  }

  async function exportAnalysis(format) {
    try {
      if (!analysis) return;

      // 1. Construct standardized Report Data structure
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
          id: `chart-${i}`, // Matched with JSX id tag: <div id={`chart-${i}`}>
          title: c.title || `Visualization ${i + 1}`,
          intent: c.intent,
          reason: c.reason,
        })),
        follow_up_questions: analysis.follow_up_questions || [],
      };

      const formData = new FormData();

      // Pass raw JSON string directly into 'report' form field
      formData.append("report", JSON.stringify(reportData));

      // 2. Capture dynamic elements using DOM lookups
      if (Array.isArray(analysis.charts)) {
        for (let i = 0; i < analysis.charts.length; i++) {
          const chartId = `chart-${i}`;
          const element = document.getElementById(chartId);

          if (element) {
            const blob = await toBlob(element, {
              backgroundColor: "#ffffff",
              cacheBust: true,
              pixelRatio: 2, // High resolution capture for crisp printing
            });

            if (blob) {
              // Append with matching ID filename (e.g., "chart-0.png")
              formData.append("charts", blob, `${chartId}.png`);
            }
          }
        }
      }

      // 3. POST multipart data to backend endpoint
      const response = await fetch(`/api/reports/export/${format}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }

      // 4. Trigger direct user file download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `ksp_analysis_report_${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();

      // Clean up memory
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export generation error:", err);
      alert("Export failed. Please check backend logs or try again.");
    }
  }

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80 px-8 text-center text-slate-500 shadow-sm">
        Pick a response with analysis to inspect the visualization and query
        data.
      </div>
    );
  }

  const hasCharts = charts.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-linear-to-b from-white via-slate-50 to-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur z-100000000">
        <div className="flex items-center justify-between gap-6">
          {/* Left */}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Analysis Workspace
            </p>

            <h2 className="mt-1 truncate text-xl font-semibold text-slate-900">
              {charts[0]?.title || charts[0]?.intent || "Query Analysis"}
            </h2>
          </div>

          {/* Right */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {hasCharts
                ? `${charts.length} chart${charts.length > 1 ? "s" : ""}`
                : "Table"}
            </div>

            <button
              onClick={handleSaveReport}
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"
            >
              <Save size={15} />
              {saving ? "Adding..." : "Add to Reports"}
            </button>

            <div className="relative group">
              <button className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer">
                <Download size={15} />
                Export
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
                  Word
                </button>
                {/* 
                <button
                  onClick={() => exportAnalysis("html")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                >
                  HTML
                </button>

                <button
                  onClick={() => exportAnalysis("json")}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                >
                  JSON
                </button> */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
        <section className="space-y-4">
          {/* Charts Rendering Loop */}
          {hasCharts &&
            charts.map((chartConfig, idx) => {
              const chartNode = renderChart(chartConfig, rows);
              if (!chartNode) return null;

              const layout = resolveChartLayout(
                chartConfig.intent,
                chartConfig.columns,
                rows,
              );

              // Standard fallback height updated to 550px as customized
              let containerStyle = { height: "550px" };
              if (layout.chart_type === "heatmap" && layout.yKey) {
                const uniqueYCount = new Set(
                  rows.map((r) => String(r?.[layout.yKey])),
                ).size;
                const calculatedHeight = uniqueYCount * 44 + 110;
                // Adapt dynamically if space is not fully utilized, otherwise cap clean limits at 550px
                containerStyle = {
                  height: `${Math.min(Math.max(calculatedHeight, 250), 550)}px`,
                };
              }

              return (
                <div
                  key={idx}
                  id={`chart-${idx}`}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {chartConfig.title}
                    </h3>
                  </div>

                  <div
                    style={containerStyle}
                    className="rounded-2xl bg-linear-to-br from-slate-50 to-slate-100 p-3 flex flex-col overflow-hidden transition-[height] duration-300 ease-out"
                  >
                    {chartNode}
                  </div>
                </div>
              );
            })}

          {/* SQL Results table */}
          <details
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            open
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              SQL Results
              {rowCount > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({rowCount} rows)
                </span>
              )}
            </summary>
            <div className="mt-4">
              <DataTable rows={rows} columns={columns} />
            </div>
          </details>

          {/* SQL Query */}
          <details
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            open
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              SQL Query
            </summary>
            <div className="mt-4">
              <pre className="overflow-x-hidden whitespace-pre-wrap wrap-break-word rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100 shadow-inner">
                {analysis?.sql_query || "No query available."}
              </pre>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
