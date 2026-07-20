from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from flask import Response as FlaskResponse
from a2wsgi import ASGIMiddleware

from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.investigations import router as investigations_router
from routes.reports import router as reports_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fastapi_function")

app = FastAPI(title="Datathon KSP App", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(auth_router)
app.include_router(investigations_router)
app.include_router(reports_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

_wsgi_app = ASGIMiddleware(app)
 
 
def handler(request):
    response_state = {}
 
    def start_response(status, headers, exc_info=None):
        response_state["status"] = status
        response_state["headers"] = headers
 
    body_chunks = _wsgi_app(request.environ, start_response)
    body = b"".join(body_chunks)
 
    status_code = int(response_state["status"].split(" ", 1)[0])
    return FlaskResponse(body, status=status_code, headers=response_state["headers"])

 
# Local-only entry point for a quick `python main.py` sanity check outside
# Catalyst. Catalyst's own `catalyst serve` / `catalyst deploy` call
# `handler(request)` above, not this block.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)