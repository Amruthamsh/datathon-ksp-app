from pydantic import BaseModel, field_validator
from typing import Optional


class ChatRequest(BaseModel):
    user_query: str
    conversation_id: Optional[str] = None
    language: Optional[str] = None


class RenameConversationRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be empty")
        return v[:100]


class FeedbackRequest(BaseModel):
    conversation_id: str
    created_at: str
    feedback: Optional[str] = None

    @field_validator("feedback")
    @classmethod
    def validate_feedback(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("up", "down"):
            raise ValueError('feedback must be "up", "down", or null')
        return v