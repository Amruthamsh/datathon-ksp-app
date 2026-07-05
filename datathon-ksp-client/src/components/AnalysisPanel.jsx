import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Dot,
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

function getNumericColumns(data, excludedKeys = []) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const sample = data[0];

  return Object.keys(sample).filter(
    (key) =>
      !excludedKeys.includes(key) && data.every((row) => isNumeric(row?.[key])),
  );
}

function getCategoryColumns(data, excludedKeys = []) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const sample = data[0];

  return Object.keys(sample).filter((key) => !excludedKeys.includes(key));
}

function buildHeatmapBuckets(data, xKey, yKey, valueKey) {
  const xLabels = Array.from(new Set(data.map((row) => row?.[xKey])));
  const yLabels = Array.from(new Set(data.map((row) => row?.[yKey])));

  const buckets = new Map();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  data.forEach((row) => {
    const xValue = row?.[xKey];
    const yValue = row?.[yKey];
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>Low intensity</span>
        <div className="h-2 flex-1 rounded-full bg-linear-to-r from-[#dbeafe] via-[#38bdf8] to-[#1d4ed8]" />
        <span>High intensity</span>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `180px repeat(${xLabels.length}, minmax(44px, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {yKey} / {xKey}
          </div>
          {xLabels.map((label) => (
            <div
              key={label}
              className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600"
            >
              {formatValue(label)}
            </div>
          ))}

          {yLabels.map((rowLabel) => {
            const cells = xLabels.map((colLabel) => {
              const cellValue = buckets.get(`${colLabel}__${rowLabel}`);
              const normalized =
                cellValue === undefined ? 0 : (cellValue - min) / range;
              const background = `rgba(29, 78, 216, ${0.1 + normalized * 0.85})`;

              return (
                <div
                  key={`${rowLabel}-${colLabel}`}
                  className="flex h-11 items-center justify-center rounded-lg border border-white/60 text-xs font-semibold text-slate-900 shadow-sm"
                  style={{ background }}
                  title={`${formatValue(rowLabel)} / ${formatValue(colLabel)}: ${formatValue(cellValue)}`}
                >
                  {formatValue(cellValue)}
                </div>
              );
            });

            return (
              <>
                <div
                  key={rowLabel}
                  className="sticky left-0 z-10 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
                >
                  {formatValue(rowLabel)}
                </div>
                {cells}
              </>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderChart(config, data) {
  if (!config?.show_chart || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const { chart_type, x_axis, y_axis, series } = config;
  const numericColumns = getNumericColumns(
    data,
    [x_axis, y_axis, series].filter(Boolean),
  );
  const valueKey = series || y_axis || numericColumns[0];
  const categoryKeys = getCategoryColumns(data, [valueKey]);
  const firstCategoryKey = x_axis || categoryKeys[0];

  if (!chart_type) {
    return null;
  }

  if (chart_type === "heatmap") {
    const heatmapX = x_axis || categoryKeys[0];
    const heatmapY = y_axis || categoryKeys[1] || categoryKeys[0];

    if (!heatmapX || !heatmapY || !valueKey) {
      return null;
    }

    return (
      <HeatmapChart
        data={data}
        xKey={heatmapX}
        yKey={heatmapY}
        valueKey={valueKey}
      />
    );
  }

  if (chart_type === "pie" || chart_type === "donut") {
    const pieValueKey = valueKey || numericColumns[0];
    const nameKey = firstCategoryKey;

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
          <Legend />
          <Pie
            data={data}
            dataKey={pieValueKey}
            nameKey={nameKey}
            innerRadius={chart_type === "donut" ? 72 : 0}
            outerRadius={150}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry?.[nameKey] ?? index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart_type === "scatter") {
    const scatterX = x_axis || numericColumns[0];
    const scatterY = y_axis || numericColumns[1] || numericColumns[0];

    if (!scatterX || !scatterY) {
      return null;
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            dataKey={scatterX}
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={{ stroke: "#94a3b8" }}
          />
          <YAxis
            dataKey={scatterY}
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={{ stroke: "#94a3b8" }}
          />
          <Tooltip />
          <Scatter
            data={data}
            fill="#2563eb"
            shape={<Dot r={5} fill="#2563eb" />}
          />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chart_type === "line" || chart_type === "area") {
    const lineX = x_axis || firstCategoryKey;
    const lineY = y_axis || valueKey || numericColumns[0];

    if (!lineX || !lineY) {
      return null;
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 20, bottom: 12, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            dataKey={lineX}
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={{ stroke: "#94a3b8" }}
          />
          <YAxis
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={{ stroke: "#94a3b8" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={lineY}
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (chart_type === "bar" || chart_type === "horizontal_bar") {
    const barCategory = x_axis || firstCategoryKey;
    const barValue = y_axis || valueKey || numericColumns[0];

    if (!barCategory || !barValue) {
      return null;
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout={chart_type === "horizontal_bar" ? "vertical" : "horizontal"}
          data={data}
          margin={{
            top: 12,
            right: 20,
            bottom: 12,
            left: chart_type === "horizontal_bar" ? 28 : 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          {chart_type === "horizontal_bar" ? (
            <>
              <XAxis
                type="number"
                tick={{ fill: "#475569", fontSize: 12 }}
                axisLine={{ stroke: "#94a3b8" }}
              />
              <YAxis
                type="category"
                dataKey={barCategory}
                width={170}
                tick={{ fill: "#475569", fontSize: 12 }}
                axisLine={{ stroke: "#94a3b8" }}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={barCategory}
                tick={{ fill: "#475569", fontSize: 12 }}
                axisLine={{ stroke: "#94a3b8" }}
              />
              <YAxis
                tick={{ fill: "#475569", fontSize: 12 }}
                axisLine={{ stroke: "#94a3b8" }}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            }}
          />
          <Legend />
          <Bar
            dataKey={barValue}
            radius={
              chart_type === "horizontal_bar" ? [0, 14, 14, 0] : [14, 14, 0, 0]
            }
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry?.[barCategory] ?? index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

export default function AnalysisPanel({ analysis }) {
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const chartNode = renderChart(analysis?.chart_config, rows);
  const rowCount = rows.length;

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-8 text-center text-slate-500 shadow-sm">
        Pick a response with analysis to inspect the visualization and query
        data.
      </div>
    );
  }

  const chartType = analysis?.chart_config?.show_chart
    ? analysis.chart_config.chart_type
    : "table";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-linear-to-b from-white via-slate-50 to-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      <div className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Analysis Workspace
            </p>
            <h2 className="mt-2 truncate text-xl font-semibold text-slate-900">
              {analysis?.chart_config?.title || "Query Analysis"}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {chartType}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Rows
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {rowCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Columns
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {columns.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Chart
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-900">
              {analysis?.chart_config?.chart_type || "none"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Mode
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {analysis?.chart_config?.show_chart ? "visual" : "table"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Visualization
                </p>
                <h3 className="text-lg font-semibold text-slate-900">
                  {analysis?.chart_config?.show_chart
                    ? analysis.chart_config.chart_type
                    : "No chart suggested"}
                </h3>
              </div>
            </div>

            <div className="h-96 rounded-2xl bg-linear-to-br from-slate-50 to-slate-100 p-3">
              {chartNode || (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 text-center text-slate-500">
                  No visualization returned for this answer.
                </div>
              )}
            </div>
          </div>

          <details
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            open
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              SQL Results
            </summary>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-96 overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column}
                          className="border-b border-slate-200 px-3 py-3 align-top font-semibold text-slate-700"
                        >
                          <span className="block whitespace-normal wrap-break-word">
                            {column}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length > 0 ? (
                      rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="odd:bg-white even:bg-slate-50"
                        >
                          {columns.map((column) => (
                            <td
                              key={column}
                              className="border-b border-slate-100 px-3 py-3 align-top text-slate-700"
                            >
                              <span className="block whitespace-normal wrap-break-word">
                                {formatValue(row?.[column])}
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
                          No result rows were returned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
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
