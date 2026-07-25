from fastapi import Request

from db.sqlite.sqlite_metadata_repository import SQLiteMetadataRepository
from db.sqlite.officer_repository import SQLiteOfficerRepository
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from db.sqlite.crime_map_repository import CrimeMapRepository
from db.sqlite.network_repository import NetworkRepository
from db.catalyst.user_repository import CatalystUserRepository
from db.catalyst.nosql_chat_repository import ChatRepository, ConversationRepository
from db.catalyst.report_repository import CatalystReportRepository
from db.catalyst.catalyst import get_catalyst_app

from dotenv import load_dotenv
load_dotenv()


def get_metadata_repository():
    return SQLiteMetadataRepository()


def get_officer_repository():
    return SQLiteOfficerRepository()


def get_catalyst_user_repository(request: Request):
    try:
        catalyst = get_catalyst_app(request)
        return CatalystUserRepository(catalyst)
    except Exception:
        return None


def get_chat_repository(request: Request):
    try:
        catalyst = get_catalyst_app(request)
        return ChatRepository(catalyst)
    except Exception:
        return None


def get_conversation_repository(request: Request):
    try:
        catalyst = get_catalyst_app(request)
        return ConversationRepository(catalyst)
    except Exception:
        return None
    
def get_investigation_repository():
    return SQLiteInvestigationRepository()

def get_crime_map_repository():
    return CrimeMapRepository()

def get_network_repository():
    return NetworkRepository()

def get_report_repository(request: Request):
    try:
        catalyst = get_catalyst_app(request)
        return CatalystReportRepository(catalyst)
    except Exception:
        return None