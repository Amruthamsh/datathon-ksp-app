# Fix: Deployed Frontend API Login Error (405 + 422)

## Root Causes

### 1. Backend 422 — Request body not parsed
`functions/datathon-ksp-app/main.py:43-54`

The `handler(request)` passes `request.environ` to `a2wsgi.ASGIMiddleware` (which wraps FastAPI's ASGI as WSGI). The Catalyst SDK request object's `.environ` doesn't properly populate `wsgi.input` with the request body stream. FastAPI receives `null` for the body, so Pydantic validation on `SignInRequest` fails with `"Field required"`.

### 2. Frontend 405 — No API proxy in production
`datathon-ksp-client/src/pages/Login.jsx:44`, `Signup.jsx:80,113,131`, and all `src/api/*.js` files

All API calls use `"/api/..."` as the base path. In local dev, Vite's `server.proxy` rewrites `/api` → `/server/datathon-ksp-app`. In production (Slate at `onslate.in`), there is no such proxy — the static file server returns 405 for `POST /api/auth/signin`.

### 3. CORS blocks production frontend
`functions/datathon-ksp-app/main.py:21`

`allow_origins` is hardcoded to `["http://localhost:3001"]`. Even with the routing fix, requests from `onslate.in` would be CORS-blocked.

---

## Fix Plan

### Step 1: Create shared frontend API base URL (`datathon-ksp-client/src/api/config.js`)

New file that reads `import.meta.env.VITE_API_BASE_URL` and falls back to `"/api"` (which works with Vite proxy in dev):

```js
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
```

### Step 2: Update all frontend API files to use `API_BASE`

Replace `const BASE = "/api"` with `import { API_BASE } from "./config"` in:
- `src/api/chat.js`
- `src/api/investigations.js`
- `src/api/reports.js`
- `src/api/crimeMap.js`
- `src/api/network.js`

### Step 3: Update Login.jsx and Signup.jsx to use `API_BASE`

Replace hardcoded `"/api/auth/..."` strings with `` `${API_BASE}/auth/...` ``.

### Step 4: Fix backend body parsing (`functions/datathon-ksp-app/main.py`)

In `handler(request)`, read the raw body from the Catalyst request via `request.get_data()` and inject it into the WSGI environ as a fresh `io.BytesIO`. Also ensure `CONTENT_LENGTH` is set:

```python
import io

def handler(request):
    response_state = {}
    environ = request.environ

    if hasattr(request, "get_data"):
        raw_body = request.get_data()
        environ["wsgi.input"] = io.BytesIO(raw_body)
        environ["CONTENT_LENGTH"] = str(len(raw_body))

    def start_response(status, headers, exc_info=None):
        ...

    body_chunks = _wsgi_app(environ, start_response)
    ...
```

### Step 5: Fix CORS (`functions/datathon-ksp-app/main.py`)

Replace hardcoded origins with an env-var-driven list:

```python
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
] or [
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:3000",
]
```

Set `CORS_ALLOWED_ORIGINS` in `.env` for production:
```
CORS_ALLOWED_ORIGINS=https://datathon-ksp-client-ylravnfl.onslate.in
```

And in Catalyst's deployment env variables too.

### Step 6: Document production env setup

In `datathon-ksp-client/`, create a `.env.example` (or add to existing) showing:
```
VITE_API_BASE_URL=https://project-rainfall-60073558955.development.catalystserverless.in/server/datathon-ksp-app
```

---

## Files to modify

| File | Change |
|------|--------|
| `datathon-ksp-client/src/api/config.js` | **NEW** — shared `API_BASE` constant |
| `datathon-ksp-client/src/api/chat.js` | Import `API_BASE` from config |
| `datathon-ksp-client/src/api/investigations.js` | Import `API_BASE` from config |
| `datathon-ksp-client/src/api/reports.js` | Import `API_BASE` from config |
| `datathon-ksp-client/src/api/crimeMap.js` | Import `API_BASE` from config |
| `datathon-ksp-client/src/api/network.js` | Import `API_BASE` from config |
| `datathon-ksp-client/src/pages/Login.jsx` | Use `API_BASE` for auth fetch calls |
| `datathon-ksp-client/src/pages/Signup.jsx` | Use `API_BASE` for auth fetch calls |
| `functions/datathon-ksp-app/main.py` | Fix `handler()` body injection + CORS env var |

## Verification

1. Run `npm run lint` in `datathon-ksp-client/` to check for JS errors
2. Local test: `npm run dev` + `python main.py` → login should work via Vite proxy
3. Postman test: `POST .../server/datathon-ksp-app/auth/signin` with JSON body → should return 200 (not 422)
4. Production test: Deploy with `VITE_API_BASE_URL` set → login from `onslate.in` should work (no 405, no CORS)
