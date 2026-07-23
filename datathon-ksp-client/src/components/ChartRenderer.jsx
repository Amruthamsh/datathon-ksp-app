// ── ChartRenderer.jsx ─────────────────────────────────────────────────────────
// Single source of truth for chart rendering.
// Used by both AnalysisPanel and Reports.
//
// Props:
//   rawConfig  — { intent: string, columns: string[], title?: string }
//   rawRows    — raw SQL result rows (unaggregated)
//   compact    — boolean: smaller radii/margins for dashboard cards (default false)

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

import {
  aggregateData,
  resolveChartLayout,
  buildHeatmapBuckets,
  formatValue,
  formatHeaderLabel,
} from "../utils/chatUtils";

export const CHART_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#f97316",
  "#db2777",
  "#16a34a",
  "#dc2626",
  "#0284c7",
];

// ── Heatmap ───────────────────────────────────────────────────────────────────

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
            gridTemplateColumns: `160px repeat(${xLabels.length}, minmax(120px, 1fr))`,
          }}
        >
          <div className="sticky top-0 left-0 z-30 bg-slate-200 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b-2 border-r-2 border-slate-300 select-none flex items-center justify-center">
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
              <div className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 border-b border-r-2 border-slate-200 flex items-center">
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
                    title={`${formatHeaderLabel(yKey)}: ${formatValue(rowLabel)} | ${formatHeaderLabel(xKey)}: ${formatValue(colLabel)} | ${formatValue(cellValue)}`}
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

// ── Main renderer ─────────────────────────────────────────────────────────────

export default function ChartRenderer({ rawConfig, rawRows, compact = false }) {
  if (!rawConfig || !Array.isArray(rawRows) || rawRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        No data available.
      </div>
    );
  }

  const { intent, columns } = rawConfig;
  const { data, columns: resolvedCols } = aggregateData(
    rawRows,
    intent,
    columns,
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        No data available.
      </div>
    );
  }

  const layout = resolveChartLayout(intent, resolvedCols, data);
  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        No visualization available for this result.
      </div>
    );
  }

  const { chart_type, xKey, yKey, categoryKey, valueKey } = layout;

  const tooltipStyle = {
    borderRadius: compact ? 12 : 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
  };
  const axisProps = {
    tick: { fill: "#475569", fontSize: 11 },
    axisLine: { stroke: "#94a3b8" },
    tickLine: { stroke: "#94a3b8" },
  };

  // ── heatmap ──────────────────────────────────────────────────────────────────
  if (chart_type === "heatmap" && xKey && yKey && valueKey) {
    return (
      <HeatmapChart data={data} xKey={xKey} yKey={yKey} valueKey={valueKey} />
    );
  }

  // ── pie / donut ───────────────────────────────────────────────────────────────
  if (
    (chart_type === "pie" || chart_type === "donut") &&
    categoryKey &&
    valueKey
  ) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="top" height={36} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={categoryKey}
            innerRadius={chart_type === "donut" ? (compact ? 50 : 72) : 0}
            outerRadius={compact ? 90 : 150}
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

  // ── scatter ───────────────────────────────────────────────────────────────────
  if (chart_type === "scatter" && xKey && yKey) {
    const margin = compact
      ? { top: 16, right: 16, bottom: 20, left: 16 }
      : { top: 20, right: 24, bottom: 45, left: 65 };
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis dataKey={xKey} type="number" {...axisProps}>
            {!compact && (
              <Label
                value={formatHeaderLabel(xKey)}
                position="insideBottom"
                offset={-25}
                style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
              />
            )}
          </XAxis>
          <YAxis dataKey={yKey} type="number" {...axisProps}>
            {!compact && (
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
            )}
          </YAxis>
          <Tooltip
            contentStyle={tooltipStyle}
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

  // ── line ──────────────────────────────────────────────────────────────────────
  if ((chart_type === "line" || chart_type === "area") && xKey && yKey) {
    const margin = compact
      ? { top: 16, right: 16, bottom: 20, left: 16 }
      : { top: 20, right: 20, bottom: 45, left: 65 };
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis dataKey={xKey} {...axisProps}>
            {!compact && (
              <Label
                value={formatHeaderLabel(xKey)}
                position="insideBottom"
                offset={-25}
                style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
              />
            )}
          </XAxis>
          <YAxis {...axisProps}>
            {!compact && (
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
            )}
          </YAxis>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="top" height={36} />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="#2563eb"
            strokeWidth={compact ? 2 : 3}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ── bar / horizontal_bar ──────────────────────────────────────────────────────
  if ((chart_type === "bar" || chart_type === "horizontal_bar") && valueKey) {
    const isHorizontal = chart_type === "horizontal_bar";
    const effectiveCategoryKey = categoryKey || "_index";
    const chartData = categoryKey
      ? data
      : data.map((row, i) => ({ ...row, _index: `Row ${i + 1}` }));
    const margin = compact
      ? { top: 16, right: 16, bottom: 20, left: isHorizontal ? 16 : 16 }
      : { top: 20, right: 20, bottom: 45, left: isHorizontal ? 30 : 65 };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout={isHorizontal ? "vertical" : "horizontal"}
          data={chartData}
          margin={margin}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          {isHorizontal ? (
            <>
              <XAxis type="number" dataKey={valueKey} {...axisProps}>
                {!compact && (
                  <Label
                    value={formatHeaderLabel(valueKey)}
                    position="insideBottom"
                    offset={-25}
                    style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
                  />
                )}
              </XAxis>
              <YAxis
                type="category"
                dataKey={effectiveCategoryKey}
                width={compact ? 100 : 150}
                {...axisProps}
              >
                {!compact && (
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
                )}
              </YAxis>
            </>
          ) : (
            <>
              <XAxis dataKey={effectiveCategoryKey} {...axisProps}>
                {!compact && (
                  <Label
                    value={formatHeaderLabel(effectiveCategoryKey)}
                    position="insideBottom"
                    offset={-25}
                    style={{ fill: "#475569", fontSize: 12, fontWeight: 600 }}
                  />
                )}
              </XAxis>
              <YAxis {...axisProps}>
                {!compact && (
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
                )}
              </YAxis>
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="top" height={36} />
          <Bar
            dataKey={valueKey}
            radius={
              isHorizontal
                ? [0, compact ? 8 : 14, compact ? 8 : 14, 0]
                : [compact ? 8 : 14, compact ? 8 : 14, 0, 0]
            }
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

// ── Utility: compute container height for AnalysisPanel chart wrapper ─────────

export function computeChartHeight(rawConfig, rawRows) {
  const { intent, columns } = rawConfig;
  const { data: aggData, columns: aggCols } = aggregateData(
    rawRows,
    intent,
    columns,
  );
  const layout = resolveChartLayout(intent, aggCols, aggData);
  if (layout?.chart_type === "heatmap" && layout.yKey) {
    const uniqueYCount = new Set(aggData.map((r) => String(r?.[layout.yKey])))
      .size;
    return `${Math.min(Math.max(uniqueYCount * 44 + 110, 250), 550)}px`;
  }
  return "550px";
}
