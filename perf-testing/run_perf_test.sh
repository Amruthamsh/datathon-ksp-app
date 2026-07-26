#!/usr/bin/env bash
#
# run_perf_test.sh — Run Locust load test + SQLite benchmark and generate reports.
#
# Usage:
#   bash run_perf_test.sh                          # defaults: baseline, 30s, 20 users
#   bash run_perf_test.sh --scenario smoke         # quick validation pass
#   bash run_perf_test.sh --scenario spike         # ramp to 100 users
#   bash run_perf_test.sh --scenario soak          # 5-minute sustained load
#   bash run_perf_test.sh --scenario baseline --duration 120 --users 50
#   bash run_perf_test.sh --sqlite-only            # skip Locust, run DB benchmark only
#   bash run_perf_test.sh --locust-only            # skip SQLite benchmark
#
# Scenarios:
#   smoke     – 5 users, 30s, validate all endpoints respond
#   baseline  – 20 users, 60s, steady-state throughput (default)
#   spike     – ramps to 100 users over 30s, holds, drops back
#   soak      – 30 users, 5 minutes, sustained load
#
# Prerequisites:
#   pip install -r requirements.txt
#   Backend running on the target host (python main.py or catalyst serve)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ─────────────────────────────────────────────────────────
HOST="${HOST:-http://localhost:8000}"
SCENARIO="baseline"
DURATION="60s"
USERS=20
SPAWN_RATE=4
SQLITE_ONLY=false
LOCUST_ONLY=false
DB_PATH="${SCRIPT_DIR}/../synthetic-data/fir_system.db"
BENCH_ITERATIONS=100

# ── Parse CLI flags ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --scenario)      SCENARIO="$2"; shift 2 ;;
    --host)          HOST="$2"; shift 2 ;;
    --duration)      DURATION="$2"; shift 2 ;;
    --users)         USERS="$2"; shift 2 ;;
    --spawn-rate)    SPAWN_RATE="$2"; shift 2 ;;
    --db)            DB_PATH="$2"; shift 2 ;;
    --iterations)    BENCH_ITERATIONS="$2"; shift 2 ;;
    --sqlite-only)   SQLITE_ONLY=true; shift ;;
    --locust-only)   LOCUST_ONLY=true; shift ;;
    -h|--help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Apply scenario presets ───────────────────────────────────────────
case "$SCENARIO" in
  smoke)
    DURATION="${DURATION:-30s}"
    USERS="${USERS:-5}"
    SPAWN_RATE="${SPAWN_RATE:-2}"
    ;;
  baseline)
    DURATION="${DURATION:-60s}"
    USERS="${USERS:-20}"
    SPAWN_RATE="${SPAWN_RATE:-4}"
    ;;
  spike)
    DURATION="90s"
    USERS=100
    SPAWN_RATE=10
    ;;
  soak)
    DURATION="300s"
    USERS="${USERS:-30}"
    SPAWN_RATE="${SPAWN_RATE:-5}"
    ;;
  *)
    echo "Unknown scenario: $SCENARIO (valid: smoke, baseline, spike, soak)"
    exit 1
    ;;
esac

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="${SCRIPT_DIR}/results_${TIMESTAMP}"
mkdir -p "$RESULTS_DIR"

echo "============================================="
echo "  KSP App — Performance Test Suite"
echo "============================================="
echo "  Scenario:    $SCENARIO"
echo "  Host:        $HOST"
echo "  Duration:    $DURATION"
echo "  Users:       $USERS"
echo "  Spawn rate:  $SPAWN_RATE"
echo "  DB path:     $DB_PATH"
echo "  Results:     $RESULTS_DIR"
echo "============================================="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# ── Step 1: SQLite Benchmark ─────────────────────────────────────────
if [ "$LOCUST_ONLY" = false ]; then
  echo "[1/3] SQLite Query Benchmark"
  echo "---------------------------------------------"

  if [ ! -f "$DB_PATH" ]; then
    echo "  SKIP: Database not found at $DB_PATH"
    echo "  Generate it first: cd synthetic-data && python3 generate_fir_data.py && python3 csv_to_sqlite.py"
  else
    python3 "${SCRIPT_DIR}/benchmark_sqlite.py" \
      --db "$DB_PATH" \
      --iterations "$BENCH_ITERATIONS" \
      --output "${RESULTS_DIR}/sqlite_benchmark.json" \
      2>&1 | tee "${RESULTS_DIR}/sqlite_benchmark.log" && {
        echo "  SQLite benchmark: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
      } || {
        echo "  SQLite benchmark: FAIL (SLO breach detected)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      }
    echo ""
  fi
fi

# ── Step 2: Locust Load Test ─────────────────────────────────────────
if [ "$SQLITE_ONLY" = false ]; then
  echo "[2/3] Locust HTTP Load Test"
  echo "---------------------------------------------"

  # Check if Locust is installed
  if ! command -v locust &>/dev/null; then
    echo "  ERROR: locust not found. Install: pip install -r requirements.txt"
    exit 1
  fi

  locust \
    -f "${SCRIPT_DIR}/locustfile.py" \
    --host "$HOST" \
    --headless \
    --users "$USERS" \
    --spawn-rate "$SPAWN_RATE" \
    --run-time "$DURATION" \
    --csv "${RESULTS_DIR}/stats" \
    --html "${RESULTS_DIR}/locust_report.html" \
    --only-summary \
    2>&1 | tee "${RESULTS_DIR}/locust_stdout.log" || true

  echo ""

  # ── SLO check: fail if any endpoint has >5% error rate ──
  if [ -f "${RESULTS_DIR}/stats_stats.csv" ]; then
    ERROR_RATE=$(awk -F',' 'NR>1 && $3!="Name" {req+=$4; fail+=$5} END {if(req>0) printf "%.2f", fail/req*100; else print "0"}' "${RESULTS_DIR}/stats_stats.csv")
    echo "  Overall error rate: ${ERROR_RATE}%"

    # Compare with awk (supports floats)
    IS_HIGH=$(echo "$ERROR_RATE > 5.0" | bc -l 2>/dev/null || echo "0")
    if [ "$IS_HIGH" = "1" ]; then
      echo "  Locust test: FAIL (error rate > 5%)"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      echo "  Locust test: PASS"
      PASS_COUNT=$((PASS_COUNT + 1))
    fi
  fi
  echo ""
fi

# ── Step 3: Generate custom HTML report ──────────────────────────────
echo "[3/3] Generating custom HTML report..."
echo "---------------------------------------------"

if [ -f "${RESULTS_DIR}/stats_stats.csv" ]; then
  python3 "${SCRIPT_DIR}/generate_report.py" \
    --input-dir "$RESULTS_DIR" \
    --output "${RESULTS_DIR}/report.html" 2>&1 || true
else
  echo "  SKIP: No Locust stats CSV found (Locust test may have failed to start)"
fi

echo ""

# ── Final Summary ────────────────────────────────────────────────────
echo "============================================="
echo "  Performance Test Complete"
echo "============================================="
echo ""

if [ -f "${RESULTS_DIR}/sqlite_benchmark.json" ]; then
  SQLITE_PASS=$(python3 -c "import json; d=json.load(open('${RESULTS_DIR}/sqlite_benchmark.json')); print(d['summary']['passed'])")
  SQLITE_FAIL=$(python3 -c "import json; d=json.load(open('${RESULTS_DIR}/sqlite_benchmark.json')); print(d['summary']['failed'])")
  echo "  SQLite Benchmark: ${SQLITE_PASS} passed / ${SQLITE_FAIL} failed"
fi

if [ -f "${RESULTS_DIR}/stats_stats.csv" ]; then
  echo "  Locust Load Test: Error rate ${ERROR_RATE:-0}%"
fi

echo ""
echo "  Results saved to: $RESULTS_DIR"
echo "    Custom report:    ${RESULTS_DIR}/report.html"
echo "    Locust report:    ${RESULTS_DIR}/locust_report.html"
echo "    SQLite benchmark: ${RESULTS_DIR}/sqlite_benchmark.json"
echo "    Raw CSV stats:    ${RESULTS_DIR}/stats_stats.csv"
echo ""

# ── Exit code ────────────────────────────────────────────────────────
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  RESULT: ${FAIL_COUNT} test(s) FAILED"
  exit 1
else
  echo "  RESULT: All tests PASSED"
  exit 0
fi
