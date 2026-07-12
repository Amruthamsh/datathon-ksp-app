import logging
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_core.messages import HumanMessage, AIMessage

from agents.sql_query_db.graph import graph
from auth.dependencies import get_current_user
from db.dependencies import get_chat_repository, get_conversation_repository
from db.catalyst.nosql_chat_repository import ChatRepository, ConversationRepository
from schemas.chat import ChatRequest, RenameConversationRequest

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/chat", tags=["Chat"])


def _build_state_messages(history: list, current_query: str) -> list:
    messages = []
    for m in history:
        if m.get("role") == "user":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))
    messages.append(HumanMessage(content=current_query))
    return messages


@router.post("/generate", status_code=200)
async def generate_response(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    user_id = current_user["kgid"]
    conversation_id = request.conversation_id
    history = []

    # Persistence is best-effort — never block the query on a Catalyst failure
    if conv_repo and chat_repo:
        try:
            if conversation_id:
                conversation = conv_repo.get(conversation_id, user_id)
                if not conversation:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
                history = chat_repo.get_messages(conversation_id)
            else:
                conversation = conv_repo.create(user_id, request.user_query)
                conversation_id = conversation["conversation_id"]
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"NoSQL conversation setup failed (non-fatal): {e}")
            conversation_id = conversation_id  # keep whatever was passed in

        try:
            chat_repo.save_message(conversation_id, "user", request.user_query)
        except Exception as e:
            logger.warning(f"Failed to save user message (non-fatal): {e}")

    state = {"messages": _build_state_messages(history, request.user_query)}

    graph_error = None
    try:
        result = graph.invoke(state)
    except Exception:
        traceback.print_exc()
        graph_error = True
        result = {}

    response_text = result.get("response") or (
        "I encountered an error while processing your request. Please try again."
        if graph_error else ""
    )

    if chat_repo and conversation_id:
        try:
            chat_repo.save_message(
                conversation_id,
                "assistant",
                response_text,
                analysis={
                    "sql_query": result.get("sql_query"),
                    "sql_result": result.get("sql_result", []),
                    "charts": result.get("charts", []),
                    "follow_up_questions": result.get("follow_up_questions", []),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to save assistant message (non-fatal): {e}")

    if conv_repo and conversation_id:
        try:
            conv_repo.touch(conversation_id, user_id, request.user_query)
        except Exception as e:
            logger.warning(f"Failed to touch conversation (non-fatal): {e}")

    return {
        "status": "success",
        "conversation_id": conversation_id,
        "response": response_text,
        "sql_query": result.get("sql_query"),
        "sql_result": result.get("sql_result", []),
        "error": result.get("error"),
        "follow_up_questions": result.get("follow_up_questions", []),
        "charts": result.get("charts", []),
    }


@router.get("/conversations", status_code=200)
async def list_conversations(
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    if not conv_repo:
        return {"status": "success", "conversations": []}

    try:
        conversations = conv_repo.list_for_user(current_user["kgid"])
    except Exception as e:
        logger.warning(f"Failed to list conversations (non-fatal): {e}")
        return {"status": "success", "conversations": []}

    return {
        "status": "success",
        "conversations": [
            {
                "conversation_id": c["conversation_id"],
                "title": c.get("title", ""),
                "last_message": c.get("last_message", ""),
                "updated_at": c.get("updated_at", ""),
                "message_count": c.get("message_count", 0),
            }
            for c in conversations
        ],
    }


@router.patch("/conversation/{conversation_id}", status_code=200)
async def rename_conversation(
    conversation_id: str,
    body: RenameConversationRequest,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    if not conv_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    try:
        conv_repo.rename(conversation_id, current_user["kgid"], body.title)
    except Exception as e:
        logger.error(f"Failed to rename conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename conversation.")

    return {"status": "success", "conversation_id": conversation_id, "title": body.title}


@router.delete("/conversation/{conversation_id}", status_code=200)
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
):
    if not conv_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    try:
        conv_repo.delete(conversation_id, current_user["kgid"])
    except Exception as e:
        logger.error(f"Failed to delete conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete conversation.")

    if chat_repo:
        chat_repo.delete_messages(conversation_id)

    return {"status": "success", "conversation_id": conversation_id}


@router.get("/conversation/{conversation_id}", status_code=200)
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
):
    if not conv_repo or not chat_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    messages = chat_repo.get_messages(conversation_id, limit=100)
    return {
        "status": "success",
        "conversation_id": conversation_id,
        "title": conversation.get("title", ""),
        "messages": [
            {
                "role": m["role"],
                "content": m["content"],
                "analysis": m.get("analysis"),
                "created_at": m.get("created_at"),
            }
            for m in messages
        ],
    }
