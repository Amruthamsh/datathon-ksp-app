# schemas/auth.py
from pydantic import BaseModel, EmailStr, field_validator
from datetime import date
import re

class SignUpRequest(BaseModel):
    kgid: str
    dob: date
    password: str
    phone: str | None = None
    email: EmailStr | None = None

    @field_validator("kgid")
    @classmethod
    def kgid_format(cls, v: str) -> str:
        # KGIDs are typically alphanumeric, adjust regex to match real format
        if not re.fullmatch(r"[A-Z]{4}\d{8}", v.upper()):
            raise ValueError("Invalid KGID format")
        return v.upper()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SignInRequest(BaseModel):
    kgid: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    officer: dict  # rank, name, district