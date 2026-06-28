import sqlite3
from contextlib import contextmanager
import os
from dotenv import load_dotenv
load_dotenv()

SQLITE_DATABASE_PATH = os.getenv("SQLITE_DATABASE_PATH")


@contextmanager
def get_connection():
    conn = sqlite3.connect(SQLITE_DATABASE_PATH)
    conn.row_factory = sqlite3.Row

    try:
        yield conn
    finally:
        conn.close()