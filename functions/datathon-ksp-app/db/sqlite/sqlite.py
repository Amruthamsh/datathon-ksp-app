import sqlite3
from contextlib import contextmanager
from pathlib import Path
import os
from dotenv import load_dotenv

_dir = Path(__file__).resolve().parent
for candidate in [_dir, *_dir.parents]:
    env_file = candidate / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        break

_BACKEND_ROOT = _dir.parent.parent
SQLITE_DATABASE_PATH = os.getenv(
    "SQLITE_DATABASE_PATH",
    str(_BACKEND_ROOT / "fir_system.db"),
)


@contextmanager
def get_connection():
    conn = sqlite3.connect(SQLITE_DATABASE_PATH)
    conn.row_factory = sqlite3.Row

    try:
        yield conn
    finally:
        conn.close()