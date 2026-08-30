import gzip
import logging
import os
import shutil
import sqlite3
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger("fastapi_function")

_dir = Path(__file__).resolve().parent
for candidate in [_dir, *_dir.parents]:
    env_file = candidate / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        break

_BACKEND_ROOT = _dir.parent.parent
_CONFIGURED_DB_PATH = os.getenv(
    "SQLITE_DATABASE_PATH",
    str(_BACKEND_ROOT / "fir_system.db"),
)
if not Path(_CONFIGURED_DB_PATH).is_absolute():
    _CONFIGURED_DB_PATH = str((_BACKEND_ROOT / _CONFIGURED_DB_PATH).resolve())

_extract_lock = threading.Lock()


def _is_valid_sqlite(p: Path) -> bool:
    try:
        if not p.is_file() or p.stat().st_size < 1024:
            return False
        con = sqlite3.connect(str(p))
        try:
            con.execute("SELECT name FROM sqlite_master LIMIT 1")
            return True
        finally:
            con.close()
    except Exception:
        return False


def _ensure_database() -> str:
    path = Path(_CONFIGURED_DB_PATH)
    if _is_valid_sqlite(path):
        return str(path)
    # stale 0-byte placeholder from previous build — remove so gz extraction can run
    if path.is_file() and not _is_valid_sqlite(path):
        try:
            path.unlink()
        except Exception:
            pass

    gz_path = Path(f"{_CONFIGURED_DB_PATH}.gz")
    if not gz_path.is_file():
        return str(path)

    with _extract_lock:
        target = Path(tempfile.gettempdir()) / gz_path.stem
        if not _is_valid_sqlite(target):
            if target.is_file():
                try:
                    target.unlink()
                except Exception:
                    pass
            started = time.perf_counter()
            tmp_target = target.with_suffix(".db.tmp")
            with gzip.open(gz_path, "rb") as src, open(tmp_target, "wb") as dst:
                shutil.copyfileobj(src, dst)
            os.replace(tmp_target, target)
            logger.info(
                "SQLite DB extracted to %s in %.2fs",
                target,
                time.perf_counter() - started,
            )
    return str(target)


SQLITE_DATABASE_PATH = _ensure_database()

_READ_ONLY_PRAGMAS = (
    "PRAGMA query_only=1",
    "PRAGMA journal_mode=OFF",
    "PRAGMA synchronous=OFF",
    "PRAGMA temp_store=MEMORY",
    "PRAGMA cache_size=-4000",
    "PRAGMA mmap_size=0",
)


@contextmanager
def get_connection():
    conn = sqlite3.connect(SQLITE_DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        for pragma in _READ_ONLY_PRAGMAS:
            conn.execute(pragma)
        yield conn
    finally:
        conn.close()