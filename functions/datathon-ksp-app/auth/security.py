# auth/security.py
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.context import CryptContext

load_dotenv()  # Load environment variables from .env file if present

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-key")  # Ensure you set this in your environment for production
TOKEN_EXPIRE_MINUTES = 480  # 8hr shift
TOKEN_SALT = "ksp-auth-token"

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(kgid: str, rank: str) -> str:
    payload = {
        "sub": kgid,
        "rank": rank,
        "iat": datetime.now(timezone.utc).isoformat(),
    }
    serializer = URLSafeTimedSerializer(SECRET_KEY, salt=TOKEN_SALT)
    return serializer.dumps(payload)


def decode_token(token: str) -> dict:
    serializer = URLSafeTimedSerializer(SECRET_KEY, salt=TOKEN_SALT)
    try:
        return serializer.loads(token, max_age=TOKEN_EXPIRE_MINUTES * 60)
    except (BadSignature, SignatureExpired) as err:
        raise ValueError("Invalid or expired token") from err