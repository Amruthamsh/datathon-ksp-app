"""Auth crypto + request-schema validation tests (offline)."""
import pytest
from pydantic import ValidationError

from auth.security import create_token, decode_token, hash_password, verify_password
from schemas.auth import ChangePasswordRequest, SignInRequest, SignUpRequest
from schemas.chat import FeedbackRequest, RenameConversationRequest


def test_password_roundtrip():
    hashed = hash_password("KspSecure123")
    assert hashed != "KspSecure123"
    assert verify_password("KspSecure123", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_token_roundtrip():
    token = create_token(kgid="ABCD12345678", rank="Inspector")
    payload = decode_token(token)
    assert payload["sub"] == "ABCD12345678"
    assert payload["rank"] == "Inspector"


def test_tampered_token_rejected():
    token = create_token(kgid="ABCD12345678", rank="Inspector")
    with pytest.raises(ValueError):
        decode_token(token + "tamper")


def test_signup_kgid_format_enforced():
    ok = SignUpRequest(kgid="abcd12345678", dob="1990-01-01", password="longenough")
    assert ok.kgid == "ABCD12345678"
    with pytest.raises(ValidationError):
        SignUpRequest(kgid="bad-kgid", dob="1990-01-01", password="longenough")
    with pytest.raises(ValidationError):
        SignUpRequest(kgid="ABCD12345678", dob="1990-01-01", password="short")


def test_signin_requires_both_fields():
    with pytest.raises(ValidationError):
        SignInRequest(kgid="ABCD12345678")
    with pytest.raises(ValidationError):
        SignInRequest(password="x" * 10)


def test_change_password_min_length():
    with pytest.raises(ValidationError):
        ChangePasswordRequest(current_password="old12345", new_password="short")


def test_rename_rejects_blank_and_truncates():
    with pytest.raises(ValidationError):
        RenameConversationRequest(title="   ")
    long_title = RenameConversationRequest(title="x" * 500)
    assert len(long_title.title) == 100


def test_feedback_enum():
    assert FeedbackRequest(conversation_id="c1", created_at="t", feedback="up").feedback == "up"
    assert FeedbackRequest(conversation_id="c1", created_at="t", feedback=None).feedback is None
    with pytest.raises(ValidationError):
        FeedbackRequest(conversation_id="c1", created_at="t", feedback="maybe")
