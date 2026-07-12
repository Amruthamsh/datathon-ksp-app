from pydantic import BaseModel, field_validator
from typing import Optional


class ChatRequest(BaseModel):
    user_query: str
    conversation_id: Optional[str] = None


class RenameConversationRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be empty")
        return v[:100]