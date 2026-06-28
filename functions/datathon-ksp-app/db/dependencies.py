import os

from db.sqlite_repository import SQLiteEmployeeRepository
from db.catalyst_repository import CatalystEmployeeRepository
from db.catalyst import get_catalyst_app

from dotenv import load_dotenv
load_dotenv()

DATABASE = os.getenv("DATABASE", "sqlite")


def get_employee_repository():

    if DATABASE == "sqlite":
        return SQLiteEmployeeRepository()

    catalyst = get_catalyst_app()
    return CatalystEmployeeRepository(catalyst)