"""
Generate a screenshot-friendly HTML performance report from Locust CSV output.

Reads:
  - stats.csv          (per-endpoint aggregated stats)
  - stats_history.csv  (time-series data, used for RPS chart)

Produces:
  - report.html        (self-contained, inline CSS, no external deps)

Usage:
    python generate_report.py [--input-dir DIR] [--output FILE]
"""

import csv
import os
import sys
import statistics
from datetime import datetime
from pathlib import Path
from collections import defaultdict


def _parse_args():
    import argparse

    parser = argparse.ArgumentParser(description="Generate Locust HTML report")
    parser.add_argument(
        "--input-dir",
        default=".",
        help="Directory containing stats.csv and stats_history.csv (default: cwd)",
    )
    parser.add_argument(
        "--output", default="report.html", help="Output HTML file (default: report.html)"
    )
    return parser.parse_args()


def _read_stats_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _read_history_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _safe_float(val: str, default=0.0) -> float:
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: str, default=0) -> int:
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _format_number(n: float) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,.0f}"


def _pct_bar(value: float, max_value: float, color: str = "#3b82f6") -> str:
    if max_value == 0:
        width = 0
    else:
        width = min((value / max_value) * 100, 100)
    return (
        f'<div style="background:#e5e7eb;border-radius:4px;height:18px;width:100%;overflow:hidden">'
        f'<div style="background:{color};height:100%;width:{width:.1f}%;border-radius:4px"></div>'
        f'</div>'
    )


def generate_html(stats_rows: list[dict], history_rows: list[dict]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ── Aggregate stats ────────────────────────────────────────────────
    endpoints = []
    total_requests = 0
    total_failures = 0
    total_avg_ms = []
    rps_values = []

    for row in stats_rows:
        name = row.get("Name", "unknown")
        method = row.get("Method", "")
        label = f"{method} {name}" if method else name

        requests = _safe_int(row.get("Request Count", row.get("Requests", 0)))
        failures = _safe_int(row.get("Failure Count", row.get("Failures", 0)))
        avg_ms = _safe_float(row.get("Average Response Time", row.get("Avg Response Time", 0)))
        min_ms = _safe_float(row.get("Min Response Time", row.get("Min", 0)))
        max_ms = _safe_float(row.get("Max Response Time", row.get("Max", 0)))
        med_ms = _safe_float(row.get("Median Response Time", row.get("Median", 0)))
        p90 = _safe_float(row.get("90%", row.get("90 Percentile", 0)))
        p95 = _safe_float(row.get("95%", row.get("95 Percentile", 0)))
        p99 = _safe_float(row.get("99%", row.get("99 Percentile", 0)))
        rps = _safe_float(row.get("Requests/s", row.get("RPS", 0)))
        fail_pct = (failures / requests * 100) if requests > 0 else 0

        total_requests += requests
        total_failures += failures
        if avg_ms > 0:
            total_avg_ms.append(avg_ms)
        rps_values.append(rps)

        endpoints.append({
            "label": label,
            "requests": requests,
            "failures": failures,
            "fail_pct": fail_pct,
            "avg_ms": avg_ms,
            "min_ms": min_ms,
            "max_ms": max_ms,
            "med_ms": med_ms,
            "p90": p90,
            "p95": p95,
            "p99": p99,
            "rps": rps,
        })

    # Sort by request count descending
    endpoints.sort(key=lambda e: e["requests"], reverse=True)

    overall_rps = sum(rps_values)
    overall_avg = statistics.mean(total_avg_ms) if total_avg_ms else 0
    overall_fail_pct = (total_failures / total_requests * 100) if total_requests > 0 else 0

    # ── RPS time series for sparkline ──────────────────────────────────
    rps_timeline = []
    for row in history_rows:
        ts = row.get("Timestamp", "")
        rps_val = _safe_float(row.get("Requests/s", row.get("Total RPS", 0)))
        rps_timeline.append((ts, rps_val))

    max_rps = max((v for _, v in rps_timeline), default=1) or 1

    # Build SVG sparkline for RPS
    svg_width = 600
    svg_height = 80
    if rps_timeline:
        points = []
        n = len(rps_timeline)
        for i, (_, v) in enumerate(rps_timeline):
            x = (i / max(n - 1, 1)) * svg_width
            y = svg_height - (v / max_rps) * (svg_height - 10) - 5
            points.append(f"{x:.1f},{y:.1f}")
        sparkline_svg = (
            f'<svg width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}" '
            f'style="width:100%;max-width:{svg_width}px;height:{svg_height}px">'
            f'<polyline points="{" ".join(points)}" fill="none" stroke="#3b82f6" stroke-width="2"/>'
            f"</svg>"
        )
    else:
        sparkline_svg = '<span style="color:#9ca3af">No time-series data</span>'

    # ── Build endpoint table rows ──────────────────────────────────────
    max_requests = max((e["requests"] for e in endpoints), default=1) or 1

    table_rows = ""
    for i, ep in enumerate(endpoints):
        bg = "#f9fafb" if i % 2 == 0 else "#ffffff"
        fail_color = "#ef4444" if ep["fail_pct"] > 5 else "#f59e0b" if ep["fail_pct"] > 0 else "#22c55e"

        table_rows += f"""
        <tr style="background:{bg}">
            <td style="padding:10px 14px;font-family:'JetBrains Mono',monospace;font-size:13px;border-bottom:1px solid #e5e7eb;white-space:nowrap">{ep["label"]}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                    <span style="font-variant-numeric:tabular-nums">{_format_number(ep["requests"])}</span>
                    <div style="width:80px">{_pct_bar(ep["requests"], max_requests, "#3b82f6")}</div>
                </div>
            </td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">
                <span style="color:{fail_color};font-weight:600">{ep["fail_pct"]:.1f}%</span>
            </td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">{ep["avg_ms"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">{ep["med_ms"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;color:#6b7280">{ep["min_ms"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;color:#6b7280">{ep["max_ms"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">{ep["p90"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">{ep["p95"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums">{ep["p99"]:.0f}</td>
            <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;color:#2563eb;font-weight:500">{ep["rps"]:.1f}</td>
        </tr>"""

    # ── HTML template ──────────────────────────────────────────────────
    fail_badge_color = "#dc2626" if overall_fail_pct > 5 else "#f59e0b" if overall_fail_pct > 0 else "#16a34a"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KSP App — Performance Test Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family:'Inter',system-ui,sans-serif; background:#f1f5f9; color:#1e293b; }}
  .container {{ max-width:1200px; margin:0 auto; padding:32px 24px; }}
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div style="margin-bottom:32px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="width:40px;height:40px;background:#1e293b;border-radius:10px;display:flex;align-items:center;justify-content:center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>
      <h1 style="font-size:24px;font-weight:700;color:#0f172a">KSP App — Performance Test Report</h1>
    </div>
    <p style="color:#64748b;font-size:14px">Generated {now} &middot; Locust load test results</p>
  </div>

  <!-- Summary Cards -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px">Total Requests</div>
      <div style="font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;color:#0f172a">{_format_number(total_requests)}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px">Failure Rate</div>
      <div style="font-size:32px;font-weight:700;font-variant-numeric:tabular-nums">
        <span style="color:{fail_badge_color}">{overall_fail_pct:.1f}%</span>
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px">Avg Response Time</div>
      <div style="font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;color:#0f172a">{overall_avg:.0f}<span style="font-size:16px;color:#94a3b8;margin-left:4px">ms</span></div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px">Throughput</div>
      <div style="font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;color:#2563eb">{overall_rps:.1f}<span style="font-size:16px;color:#94a3b8;margin-left:4px">req/s</span></div>
    </div>
  </div>

  <!-- RPS Over Time -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:32px">
    <h2 style="font-size:16px;font-weight:600;margin-bottom:16px;color:#0f172a">Requests per Second — Over Time</h2>
    {sparkline_svg}
  </div>

  <!-- Endpoint Table -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px">
    <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0">
      <h2 style="font-size:16px;font-weight:600;color:#0f172a">Endpoint Breakdown</h2>
      <p style="font-size:13px;color:#94a3b8;margin-top:4px">{len(endpoints)} endpoints &middot; sorted by request count</p>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <th style="padding:12px 14px;text-align:left;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Endpoint</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Requests</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Fail %</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Avg (ms)</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Med (ms)</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Min</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Max</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">P90</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">P95</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">P99</th>
            <th style="padding:12px 14px;text-align:right;font-weight:600;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">RPS</th>
          </tr>
        </thead>
        <tbody>
          {table_rows}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;color:#94a3b8;font-size:12px;padding:16px 0">
    KSP Datathon Performance Report &middot; Generated by Locust + custom report generator
  </div>

</div>
</body>
</html>"""

    return html


def _find_csv(base_dir: Path, patterns: list[str]) -> Path | None:
    """Find the first matching CSV file from possible Locust naming conventions."""
    for pat in patterns:
        matches = sorted(base_dir.glob(pat))
        if matches:
            return matches[-1]  # most recent
    return None


def main():
    args = _parse_args()
    input_dir = Path(args.input_dir)

    # Locust CSV output uses prefix-based naming (e.g. stats_stats.csv)
    stats_path = _find_csv(input_dir, ["stats_stats.csv", "stats.csv", "*stats*.csv"])
    history_path = _find_csv(input_dir, ["stats_stats_history.csv", "stats_history.csv", "*history*.csv"])

    if not stats_path:
        print(f"Error: No stats CSV found in {input_dir}. Run Locust with --csv flag first.", file=sys.stderr)
        sys.exit(1)

    stats_rows = _read_stats_csv(str(stats_path))
    history_rows = _read_history_csv(str(history_path)) if history_path.exists() else []

    html = generate_html(stats_rows, history_rows)

    output_path = Path(args.output)
    output_path.write_text(html, encoding="utf-8")
    print(f"Report generated: {output_path.resolve()}")


if __name__ == "__main__":
    main()
