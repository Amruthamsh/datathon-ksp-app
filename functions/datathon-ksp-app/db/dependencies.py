from fastapi import Request

from db.sqlite.sqlite_metadata_repository import SQLiteMetadataRepository
from db.sqlite.officer_repository import SQLiteOfficerRepository
from db.catalyst.user_repository import CatalystUserRepository
from db.catalyst.catalyst import get_catalyst_app

from dotenv import load_dotenv
load_dotenv()


def get_metadata_repository():
    return SQLiteMetadataRepository()


def get_officer_repository():
    return SQLiteOfficerRepository()


def get_catalyst_user_repository(request: Request):
    catalyst = get_catalyst_app(request)
    return CatalystUserRepository(catalyst)
