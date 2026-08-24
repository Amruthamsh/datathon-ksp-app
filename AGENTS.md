# AGENTS.md

## Architecture & Repo Structure

- **Monorepo Layout**:
  - `datathon-ksp-client/`: React 18 + Vite frontend (Zoho Catalyst Slate app).
  - `functions/datathon-ksp-app/`: Python 3.13 FastAPI backend deployed as a Zoho Catalyst Advanced I/O function (`main.py`).
  - `synthetic-data/`: Synthetic FIR crime data generators, SQLite loader, and Catalyst datastore seeders.
- **Dual Database Architecture**:
  - **SQLite** (`functions/datathon-ksp-app/fir_system.db.gz`, decompressed to the temp dir at runtime): Structured FIR crime data queried by the LangGraph SQL Agent for natural language analytics.
  - **Zoho Catalyst Datastore / NoSQL**: Handles user auth, chat/conversation history, and user reports.
- **No test suite exists**. There are no `test/`, `tests/`, or `__tests__/` directories anywhere in the repo. No pytest or Jest config.

## Developer Commands

### Full Stack (Recommended)
- **Start Catalyst Gateway**: `catalyst serve` (from repo root)
  - Frontend: `http://localhost:3000/app/`
  - Backend API: `http://localhost:3000/server/datathon-ksp-app/`

### Frontend (`datathon-ksp-client/`)
- **Dev Server**: `npm run dev`
- **Lint**: `npm run lint` (`eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0`)
- **Build**: `npm run build`

### Backend (`functions/datathon-ksp-app/`)
- **Standalone Dev Server**: `python main.py` (runs Uvicorn on `http://localhost:8000`)
- **Note**: Standalone Uvicorn mode supports SQLite endpoints but fails on Catalyst SDK routes (auth, chat persistence, reports) because `zcatalyst_sdk.initialize(req=request)` requires Catalyst request context.

### Synthetic Data Pipeline (`synthetic-data/`)
- **Generate CSVs**: `python3 generate_fir_data.py` (requires `pip install faker`)
- **Build SQLite DB**: `python3 csv_to_sqlite.py` (generates `fir_system.db` in the backend bundle)
- **Seed Catalyst Datastore**: `python3 push_to_catalyst.py`

## Operational & Framework Quirks

- **Environment Configuration**: `functions/datathon-ksp-app/.env` requires:
  - `SQLITE_DATABASE_PATH`: Path to `fir_system.db` (defaults to backend bundle; falls back to decompressing `fir_system.db.gz` into the temp dir; override with absolute path)
  - `GROQ_API_KEY`: Groq LLM API key
  - `SECRET_KEY`: Auth token signing key
- **FastAPI WSGI Adapter**: `main.py` uses `a2wsgi.ASGIMiddleware` and `FlaskResponse` inside `handler(request)` to adapt FastAPI to Zoho Catalyst's execution handler format.
- **Deploy Size Limits**: The Catalyst CLI vendors all `requirements.txt` packages into the deploy zip (~115 MB). Keep deps minimal: `playwright` and `ollama` were removed for size (PDF export now raises a graceful error; DOCX export still works). The SQLite DB ships gzipped (`fir_system.db.gz`) and is extracted to the temp dir at runtime.
- **Secrets**: `.env` is excluded from deploys via `catalyst.json` `functions.ignore`. Set `GROQ_API_KEY` / `SECRET_KEY` as environment variables in the Catalyst console (Function → Configuration → Environment Variables).
- **Cold Start & Lazy Imports**: The SQL agent stack (LangChain/LangGraph/Groq) is imported lazily inside `routes/chat.py` handlers (`_get_graph()`), NOT at startup — keeps cold start light (~0.55s import, ~70MB RSS) so SQLite-only endpoints never pay for LLM deps. Request-timing middleware in `main.py` logs every request duration; DB gz extraction time is logged once by `db/sqlite/sqlite.py`. Use Catalyst function logs to diagnose slow requests.
- **SQLite Tuning**: Connections are read-only (`query_only=ON`) with `journal_mode=OFF`, 32MB page cache, and 128MB mmap — no component writes to SQLite (reports/chat go to Catalyst Data Store).
- **Client API Routing**: `datathon-ksp-client/vite.config.js` proxies `/api` to `http://localhost:3000/server/datathon-ksp-app`.
- **SQL Agent Graph**: Implemented in `functions/datathon-ksp-app/agents/sql_query_db/` using LangGraph (`Language Detection` -> `Translate Query` -> `Router` -> `Chat` OR `Planner` -> `Fetch Values` -> `Generate SQL` -> `Execute SQL` -> `Response` / `Chart` -> `Finalize` -> `Translate Response`).

## Multilingual Support (English / Kannada)

- **Frontend i18n**: `react-i18next` with locale files at `src/locales/{en,kn}/common.json`. Language persisted in `localStorage("ksp-lang")`. The `LanguageSelector` component toggles via `i18n.changeLanguage()`.
- **Backend Language Pipeline**: Three new LangGraph nodes run before/after the existing agent:
  1. `language_detection_node` — Unicode range detection (>=30% Kannada chars = "kn")
  2. `translate_query_node` — LLM translates Kannada query to canonical English using domain dictionaries
  3. `translate_response_node` — LLM translates English analysis output back to natural Kannada
- **Domain Dictionary**: `functions/datathon-ksp-app/config/domain_dictionary.py` maps Kannada terms to canonical English for: crime heads (5), sub-heads (21), districts (31 + aliases), case statuses, gravity, ranks, acts, genders, religions, and common query terms.
- **Database stays English-only**: SQL generation always happens against English schema. Only input/output change language.
- **Chat API**: `POST /chat/generate` accepts optional `language` field ("en" or "kn"). Frontend passes `i18n.language` from the selector.

## Frontend Design & UI Development

- **`frontend-design` Skill**: A repo-local skill is installed at `.opencode/skills/frontend-design/SKILL.md`. It provides guidance on distinctive visual design, typography, and layout, ensuring choices don't read as generic defaults.
- **Styling Framework**: Tailwind CSS v4 is integrated via `@tailwindcss/vite`.
- **UI Guidelines**: Prioritize functional, high-contrast visual hierarchies suitable for law enforcement/investigative dashboards. Ensure layouts are fully responsive and keep interactive elements clean and accessible.
