# KSP Evals — Golden Queries + Offline Harness

LLM evals for the LangGraph SQL agent. Offline by default (zero QuickML spend);
`--live` runs the full graph when credentials are available.

## Run

```bash
cd functions/datathon-ksp-app
python evals/run_evals.py                  # offline: language + SQL validity + router prompt
python evals/run_evals.py --live           # full graph (needs QuickML + Catalyst env)
python evals/run_evals.py --json evals/last_results.json
```

Exit code is 1 if any check fails (CI-friendly).

## Golden dataset (`golden_nl_sql.json`)

20 cases across 6 buckets:

| Bucket | IDs | What it guards |
|---|---|---|
| Core analytics (EN) | `count_all`, `murder_by_district`, `theft_2024`, `top_districts`, `monthly_trend`, `repeat_offenders`, `pending_chargesheet`, `gravity_breakdown`, `women_crimes` | Join paths (`Unit→District`, `CrimeSubHead`), `CrimeRegisteredDate` (not `FIRDate`), `GROUP BY/ORDER BY/LIMIT` discipline |
| Kannada (KN) | `kn_murder_count`, `kn_theft_bengaluru`, `kn_district_top` | Language detection + dictionary coverage (`ಕೊಲೆ→Murder`, `ಬೆಂಗಳೂರು ನಗರ→Bengaluru Urban`) |
| Chat intents | `chat_greeting_en`, `chat_help_kn` | Router returns `chat`, no SQL |
| Router edge rules | `chat_legal_only`→chat, `sql_legal_plus_stats`→sql, `evidence_greeting_only`→chat, `evidence_with_task`→sql, `scene_local`→chat, `scene_district_compare`→sql | The Evidence/Legal/Scene rules in `router_node.py` |

Each SQL case carries `must_contain` / `must_not_contain` tokens plus a
hand-verified `reference_sql` that must execute and return rows.

## Adding a case

1. Append to `golden_nl_sql.json` with a unique `id`.
2. For SQL cases: verify `reference_sql` in sqlite3 first.
3. Run `python evals/run_evals.py` — it validates statically + by execution.
