from fastapi import APIRouter
from httpcore import request
from llm.ollama_service import ollama_service
from llm.groq_service import groq_service
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import json

class ChatRequest(BaseModel):
    user_query: str

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("/generate", status_code=200)
async def generate_response(request: ChatRequest):
    try:
        system_prompt = "You are a helpful assistant."
        response = ollama_service.generate(request.user_query, system_prompt)
        # response = groq_service.generate(request.user_query, system_prompt)
        return {"status": "success", "response": response}
    except Exception as err:
        return {"status": "error", "message": str(err)}
    
# @router.post("/stream")
# currently not working due to Zoho Catalyst's limitations on streaming responses. 
# This endpoint is intended to stream responses from the LLM service, but it may not function as expected in the current environment.
async def chat_stream(request: ChatRequest):
    print("Endpoint entered")

    system_prompt = "You are a helpful assistant."

    async def event_stream():
        print("Generator started")

        for token in ollama_service.stream(
            request.user_query,
            system_prompt
        ):
            print("Sending", repr(token))
            yield f"data: {json.dumps({'token': token})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
    )