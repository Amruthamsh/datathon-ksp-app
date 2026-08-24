from fastapi import FastAPI
import io
import logging
import time
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


@app.middleware("http")
async def log_request_time(request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - started
    logger.info(
        "%s %s -> %s in %.2fs",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response

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
    response_state = {}

    environ = request.environ

    if hasattr(request, "get_data"):
        raw_body = request.get_data()
        environ["wsgi.input"] = io.BytesIO(raw_body)
        environ["CONTENT_LENGTH"] = str(len(raw_body))

    def start_response(status, headers, exc_info=None):
        response_state["status"] = status
        response_state["headers"] = headers

    body_chunks = _wsgi_app(environ, start_response)
    body = b"".join(body_chunks)

    status_code = int(response_state["status"].split(" ", 1)[0])
    return FlaskResponse(body, status=status_code, headers=response_state["headers"])

 
# Local-only entry point for a quick `python main.py` sanity check outside
# Catalyst. Catalyst's own `catalyst serve` / `catalyst deploy` call
# `handler(request)` above, not this block.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)