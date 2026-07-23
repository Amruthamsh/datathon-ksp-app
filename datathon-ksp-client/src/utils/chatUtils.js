// ── chartUtils.js ─────────────────────────────────────────────────────────────
// Shared chart logic for AnalysisPanel and Reports.
// Pure functions only — no React, no side effects.

// ── Primitive helpers ────────────────────────────────────────────────────────

export function isNumeric(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function looksLikeDate(value) {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

export function looksLikeIdentifier(colName) {
  return /(^|_)(id|uuid|guid|pk|caseid|casemasterid|employeeid|fir)$/i.test(
    colName,
  );
}

export function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  return String(value);
}

export function formatHeaderLabel(str) {
  if (!str) return "";
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function getUniqueCount(data, col) {
  if (!col) return 0;
  return new Set(data.map((row) => row?.[col])).size;
}

export function getMaxLabelLength(data, col) {
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
// Transforms raw SQL rows + chart config into chart-ready {category, value} data.
// Whenever the LLM sends a single-column config (e.g. ["CaseStatusName"] or
// ["CrimeRegisteredDate"]), we aggregate frequencies/counts here so the renderer
// always receives renderable pairs.
//
// Returns: { data: Row[], columns: string[] }

export function aggregateData(rows, intent, requestedColumns) {
  if (!rows || rows.length === 0)
    return { data: [], columns: requestedColumns ?? [] };

  const cols = (requestedColumns ?? []).filter(Boolean);
  if (cols.length === 0) return { data: rows, columns: Object.keys(rows[0]) };

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

  // ── time_series ─────────────────────────────────────────────────────────────
  if (intent === "time_series") {
    const dateCol = dateCols[0] || cols[0];
    const valueCol = numericCols[0] || null;

    if (valueCol) {
      const sorted = [...rows].sort((a, b) =>
        String(a[dateCol]).localeCompare(String(b[dateCol])),
      );
      return { data: sorted, columns: [dateCol, valueCol] };
    }

    const buckets = new Map();
    rows.forEach((row) => {
      const raw = String(row[dateCol] || "");
      const key = raw.length >= 7 ? raw.slice(0, 7) : raw;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const data = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ Period: period, Count: count }));
    return { data, columns: ["Period", "Count"] };
  }

  // ── heatmap ─────────────────────────────────────────────────────────────────
  if (intent === "heatmap") {
    if (cols.length >= 3) {
      return {
        data: rows,
        columns: [
          categoricalCols[0] || cols[0],
          categoricalCols[1] || cols[1],
          numericCols[0] || cols[2],
        ],
      };
    }
    if (categoricalCols.length >= 2) {
      const [xKey, yKey] = categoricalCols;
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

  // ── correlation ─────────────────────────────────────────────────────────────
  if (intent === "correlation" && numericCols.length >= 2) {
    return { data: rows, columns: numericCols.slice(0, 2) };
  }

  // ── distribution / ranking / part_of_whole / fallback ───────────────────────
  const catCol = categoricalCols[0] || dateCols[0] || null;
  const valCol = numericCols[0] || null;

  if (catCol && valCol) {
    return { data: rows, columns: [catCol, valCol] };
  }

  if (catCol && !valCol) {
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
    const col = numericCols[0];
    const values = rows.map((r) => Number(r[col])).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bucketCount = Math.min(10, getUniqueCount(rows, col));
    const step = (max - min) / bucketCount || 1;
    const bucketLabels = Array.from(
      { length: bucketCount },
      (_, i) =>
        `${Math.round(min + i * step)}–${Math.round(min + (i + 1) * step)}`,
    );
    const counts = new Array(bucketCount).fill(0);
    values.forEach((v) => {
      const idx = Math.min(Math.floor((v - min) / step), bucketCount - 1);
      counts[idx]++;
    });
    return {
      data: bucketLabels.map((range, i) => ({
        Range: range,
        Count: counts[i],
      })),
      columns: ["Range", "Count"],
    };
  }

  return { data: rows, columns: cols };
}

// ── Layout Resolution (always operates on AGGREGATED data) ────────────────────

export function resolveChartLayout(intent, columns, aggregatedData) {
  if (!aggregatedData || aggregatedData.length === 0) return null;

  const availableKeys = Object.keys(aggregatedData[0]);
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

// ── Heatmap bucket builder ────────────────────────────────────────────────────

export function buildHeatmapBuckets(data, xKey, yKey, valueKey) {
  const xLabels = Array.from(new Set(data.map((row) => String(row?.[xKey]))));
  const yLabels = Array.from(new Set(data.map((row) => String(row?.[yKey]))));
  const buckets = new Map();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  data.forEach((row) => {
    const key = `${String(row?.[xKey])}__${String(row?.[yKey])}`;
    const rawValue = Number(row?.[valueKey] ?? 0);
    buckets.set(key, rawValue);
    min = Math.min(min, rawValue);
    max = Math.max(max, rawValue);
  });

  return { xLabels, yLabels, buckets, min, max };
}
