import io

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from flask import Response as FlaskResponse
from a2wsgi import ASGIMiddleware

from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.investigations import router as investigations_router
from routes.reports import router as reports_router
from routes.crime_map import router as crime_map_router
from routes.network import router as network_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fastapi_function")

app = FastAPI(title="Datathon KSP App", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization", "X-Auth-Token"],
)

app.include_router(chat_router)
app.include_router(auth_router)
app.include_router(investigations_router)
app.include_router(reports_router)
app.include_router(crime_map_router)
app.include_router(network_router)

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

_wsgi_app = ASGIMiddleware(app)


def handler(request):
    # For local dev (no Catalyst gateway), handle CORS for localhost only.
    # In production, the Catalyst gateway handles CORS via Authorized Domains.
    origin = request.environ.get("HTTP_ORIGIN", "")
    is_local = origin.startswith("http://localhost")

    if request.method == "OPTIONS" and is_local:
        resp = FlaskResponse("", status=204)
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Auth-Token"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp

    body_bytes = request.data
    environ = request.environ.copy()
    environ["wsgi.input"] = io.BytesIO(body_bytes)
    environ["CONTENT_LENGTH"] = str(len(body_bytes))

    response_state = {}

    def start_response(status, headers, exc_info=None):
        response_state["status"] = status
        response_state["headers"] = dict(headers)

    body_chunks = _wsgi_app(environ, start_response)
    body = b"".join(body_chunks)

    status_code = int(response_state["status"].split(" ", 1)[0])
    resp = FlaskResponse(body, status=status_code, headers=response_state["headers"])

    if is_local:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"

    return resp


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
