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
import { saveReport } from "../api/reports";
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function isNumeric(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function looksLikeDate(value) {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function looksLikeIdentifier(colName) {
  return /(^|_)(id|uuid|guid|pk|caseid|casemasterid|employeeid|fir)$/i.test(
    colName,
  );
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

// ── Data Aggregation Engine ───────────────────────────────────────────────────
//
// Transforms raw SQL rows + chart config into chart-ready data.
// This is the core fix: whenever the LLM sends a single-column config
// (e.g. ["CaseStatusName"] or ["CrimeRegisteredDate"]), we aggregate
// frequencies/counts here so the renderer always has {category, value} pairs.

function aggregateData(rows, intent, requestedColumns) {
  if (!rows || rows.length === 0)
    return { data: [], columns: requestedColumns };

  const cols = requestedColumns.filter(Boolean);
  const allKeys = Object.keys(rows[0]);

  // ── Classify each requested column ──────────────────────────────────────
  const numericCols = cols.filter(
    (c) =>
      !looksLikeIdentifier(c) &&
      rows.every((r) => r[c] === null || r[c] === undefined || isNumeric(r[c])),
  );
  const dateCols = cols.filter(
    (c) => !looksLikeIdentifier(c) && rows.some((r) => looksLikeDate(r[c])),
  );
  const categoricalCols = cols.filter(
    (c) =>
      !looksLikeIdentifier(c) &&
      !numericCols.includes(c) &&
      !dateCols.includes(c),
  );

  // ── time_series ───────────────────────────────────────────────────────────
  if (intent === "time_series") {
    const dateCol = dateCols[0] || cols[0];
    const valueCol = numericCols[0] || null;

    if (valueCol) {
      // date + numeric already present — pass through sorted by date
      const sorted = [...rows].sort((a, b) =>
        String(a[dateCol]).localeCompare(String(b[dateCol])),
      );
      return { data: sorted, columns: [dateCol, valueCol] };
    }

    // Only a date column — count occurrences per month/date bucket
    const buckets = new Map();
    rows.forEach((row) => {
      const raw = String(row[dateCol] || "");
      // Bucket by YYYY-MM for readability
      const key = raw.length >= 7 ? raw.slice(0, 7) : raw;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    const data = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ Period: period, Count: count }));

    return { data, columns: ["Period", "Count"] };
  }

  // ── heatmap ───────────────────────────────────────────────────────────────
  if (intent === "heatmap") {
    // Needs exactly two categorical + one numeric
    // If all three explicit cols provided, pass through
    if (cols.length >= 3) {
      const xKey = categoricalCols[0] || cols[0];
      const yKey = categoricalCols[1] || cols[1];
      const vKey = numericCols[0] || cols[2];
      return { data: rows, columns: [xKey, yKey, vKey] };
    }
    // Two categoricals, no numeric — count occurrences
    if (categoricalCols.length >= 2) {
      const xKey = categoricalCols[0];
      const yKey = categoricalCols[1];
      const buckets = new Map();
      rows.forEach((row) => {
        const key = `${row[xKey]}__${row[yKey]}`;
        if (!buckets.has(key))
          buckets.set(key, { [xKey]: row[xKey], [yKey]: row[yKey], Count: 0 });
        buckets.get(key).Count++;
      });
      return {
        data: Array.from(buckets.values()),
        columns: [xKey, yKey, "Count"],
      };
    }
  }

  // ── correlation ───────────────────────────────────────────────────────────
  if (intent === "correlation") {
    if (numericCols.length >= 2) {
      return { data: rows, columns: numericCols.slice(0, 2) };
    }
  }

  // ── distribution / ranking / part_of_whole ────────────────────────────────
  // Canonical cases:
  //   A) One categorical + one numeric   → pass through
  //   B) One categorical only            → frequency count
  //   C) Two categoricals + one numeric  → treat as distribution on first categorical
  //   D) Only numerics                   → histogram buckets

  const catCol = categoricalCols[0] || dateCols[0] || null;
  const valCol = numericCols[0] || null;

  if (catCol && valCol) {
    // Case A — already aggregated by SQL
    return { data: rows, columns: [catCol, valCol] };
  }

  if (catCol && !valCol) {
    // Case B — need to count frequencies
    const freq = new Map();
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown");
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    const data = Array.from(freq.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => ({ [catCol]: label, Count: count }));
    return { data, columns: [catCol, "Count"] };
  }

  if (!catCol && numericCols.length >= 1) {
    // Case D — histogram of a numeric column
    const col = numericCols[0];
    const values = rows.map((r) => Number(r[col])).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bucketCount = Math.min(10, getUniqueCount(rows, col));
    const step = (max - min) / bucketCount || 1;
    const buckets = new Map();
    for (let i = 0; i < bucketCount; i++) {
      const label = `${Math.round(min + i * step)}–${Math.round(min + (i + 1) * step)}`;
      buckets.set(label, 0);
    }
    values.forEach((v) => {
      const idx = Math.min(Math.floor((v - min) / step), bucketCount - 1);
      const label = Array.from(buckets.keys())[idx];
      if (label !== undefined) buckets.set(label, buckets.get(label) + 1);
    });
    const data = Array.from(buckets.entries()).map(([range, count]) => ({
      Range: range,
      Count: count,
    }));
    return { data, columns: ["Range", "Count"] };
  }

  // Final fallback — return raw rows with original columns
  return { data: rows, columns: cols };
}

// ── Layout Resolution (runs on AGGREGATED data) ───────────────────────────────

function resolveChartLayout(intent, columns, aggregatedData) {
  if (!aggregatedData || aggregatedData.length === 0) return null;

  const sampleRow = aggregatedData[0];
  const availableKeys = Object.keys(sampleRow);

  // Only consider columns that actually exist after aggregation
  const validCols = columns.filter((c) => availableKeys.includes(c));
  if (validCols.length === 0) return null;

  const numericCols = validCols.filter((c) =>
    aggregatedData.every(
      (r) => r[c] === null || r[c] === undefined || isNumeric(r[c]),
    ),
  );
  const categoricalCols = validCols.filter((c) => !numericCols.includes(c));

  const categoryKey = categoricalCols[0] || null;
  const valueKey = numericCols[0] || null;

  // ── Specific intent overrides ─────────────────────────────────────────────
  if (intent === "time_series" && validCols.length >= 2) {
    return {
      chart_type: "line",
      xKey: validCols[0],
      yKey: validCols[1],
      categoryKey: validCols[0],
      valueKey: validCols[1],
    };
  }

  if (intent === "correlation" && numericCols.length >= 2) {
    return {
      chart_type: "scatter",
      xKey: numericCols[0],
      yKey: numericCols[1],
      categoryKey: null,
      valueKey: null,
    };
  }

  if (intent === "heatmap" && validCols.length >= 3) {
    return {
      chart_type: "heatmap",
      xKey: validCols[0],
      yKey: validCols[1],
      valueKey: validCols[2],
      categoryKey: null,
    };
  }

  if (intent === "part_of_whole" && categoryKey && valueKey) {
    const unique = getUniqueCount(aggregatedData, categoryKey);
    return {
      chart_type: unique > 8 ? "horizontal_bar" : "donut",
      categoryKey,
      valueKey,
      xKey: categoryKey,
      yKey: valueKey,
    };
  }

  // distribution / ranking / fallback
  if (categoryKey && valueKey) {
    const unique = getUniqueCount(aggregatedData, categoryKey);
    const maxLen = getMaxLabelLength(aggregatedData, categoryKey);
    const chart_type = unique > 12 || maxLen > 15 ? "horizontal_bar" : "bar";
    return {
      chart_type,
      categoryKey,
      valueKey,
      xKey: categoryKey,
      yKey: valueKey,
    };
  }

  // Only numeric columns — bar with index
  if (valueKey && !categoryKey) {
    return {
      chart_type: "bar",
      categoryKey: null,
      valueKey,
      xKey: null,
      yKey: valueKey,
    };
  }

  return null;
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
      <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-slate-500">
        <span>Low</span>
        <div className="h-2 flex-1 rounded-full bg-linear-to-r from-[#dbeafe] via-[#38bdf8] to-[#1d4ed8]" />
        <span>High</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid min-w-max bg-white"
          style={{
            gridTemplateColumns: `160px repeat(${xLabels.length}, minmax(130px, 1fr))`,
          }}
        >
          <div className="sticky top-0 left-0 z-30 bg-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b-2 border-r-2 border-slate-300 select-none flex items-center justify-center">
            {formatHeaderLabel(yKey)} / {formatHeaderLabel(xKey)}
          </div>
          {xLabels.map((label) => (
            <div
              key={label}
              className="sticky top-0 z-20 bg-slate-100 px-3 py-3 text-center text-xs font-bold text-slate-700 border-b-2 border-r border-slate-200 flex items-center justify-center"
            >
              {formatValue(label)}
            </div>
          ))}
          {yLabels.map((rowLabel) => (
            <div key={`row-${rowLabel}`} className="contents">
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
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Chart Renderer ───────────────────────────────────────────────────────

function renderChart(rawConfig, rawRows) {
  if (!rawConfig || !Array.isArray(rawRows) || rawRows.length === 0)
    return null;

  const { intent, columns } = rawConfig;

  // 1. Aggregate raw rows into chart-ready data
  const { data, columns: resolvedCols } = aggregateData(
    rawRows,
    intent,
    columns,
  );

  if (!data || data.length === 0) return null;

  // 2. Resolve layout from aggregated data
  const layout = resolveChartLayout(intent, resolvedCols, data);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        No visualization available for this result.
      </div>
    );
  }

  const { chart_type, xKey, yKey, categoryKey, valueKey } = layout;

  // 3. Render by chart type

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
              boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
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
              boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
            }}
            cursor={{ strokeDasharray: "3 3" }}
          />
          <Legend verticalAlign="top" height={36} />
          <Scatter
            name={formatHeaderLabel(yKey)}
            data={data}
            fill={CHART_COLORS[0]}
          />
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
              boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
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

  if ((chart_type === "bar" || chart_type === "horizontal_bar") && valueKey) {
    const isHorizontal = chart_type === "horizontal_bar";
    // categoryKey may be null if only numerics; fall back to row index label
    const effectiveCategoryKey = categoryKey || "_index";
    const chartData = categoryKey
      ? data
      : data.map((row, i) => ({ ...row, _index: `Row ${i + 1}` }));

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout={isHorizontal ? "vertical" : "horizontal"}
          data={chartData}
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
                dataKey={effectiveCategoryKey}
                width={150}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(effectiveCategoryKey)}
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
                dataKey={effectiveCategoryKey}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={{ stroke: "#94a3b8" }}
              >
                <Label
                  value={formatHeaderLabel(effectiveCategoryKey)}
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
              boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Bar
            dataKey={valueKey}
            radius={isHorizontal ? [0, 14, 14, 0] : [14, 14, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`${entry?.[effectiveCategoryKey] ?? index}`}
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
      No visualization available for this result.
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

  const handleExportExcel = () => {
    if (!sorted.length) return;
    const exportData = sorted.map((row) => {
      const rowData = {};
      columns.forEach((col) => {
        rowData[col] = row?.[col] ?? "";
      });
      return rowData;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    const colWidths = columns.map((col) => ({
      wch:
        Math.max(
          col.length,
          ...sorted.map((r) => String(r?.[col] ?? "").length),
        ) + 3,
    }));
    worksheet["!cols"] = colWidths;
    XLSX.writeFile(workbook, `${filename}.xlsx`);
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
        <button
          onClick={handleExportExcel}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <Download size={14} className="text-slate-500" />
          <span>Export Excel</span>
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
      alert("Report added.");
    } catch (err) {
      console.error(err);
      alert("Unable to save report.");
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

      if (Array.isArray(analysis.charts)) {
        for (let i = 0; i < analysis.charts.length; i++) {
          const element = document.getElementById(`chart-${i}`);
          if (element) {
            const blob = await toBlob(element, {
              backgroundColor: "#ffffff",
              cacheBust: true,
              pixelRatio: 2,
            });
            if (blob) formData.append("charts", blob, `chart-${i}.png`);
          }
        }
      }

      const response = await fetch(`/api/reports/export/${format}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `ksp_analysis_report_${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export generation error:", err);
      alert("Export failed. Please check backend logs or try again.");
    }
  }

  if (
    !analysis ||
    (analysis.sql_result?.length === 0 && analysis.charts?.length === 0)
  ) {
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
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Analysis Workspace
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-900">
              {charts[0]?.title || charts[0]?.intent || "Query Analysis"}
            </h2>
          </div>

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
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 cursor-pointer"
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
              // Pre-aggregate to determine container sizing
              const { data: aggData, columns: aggCols } = aggregateData(
                rows,
                chartConfig.intent,
                chartConfig.columns,
              );
              const layout = resolveChartLayout(
                chartConfig.intent,
                aggCols,
                aggData,
              );

              let containerStyle = { height: "550px" };
              if (layout?.chart_type === "heatmap" && layout.yKey) {
                const uniqueYCount = new Set(
                  aggData.map((r) => String(r?.[layout.yKey])),
                ).size;
                const calculatedHeight = uniqueYCount * 44 + 110;
                containerStyle = {
                  height: `${Math.min(Math.max(calculatedHeight, 250), 550)}px`,
                };
              }

              const chartNode = renderChart(chartConfig, rows);
              if (!chartNode) return null;

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
