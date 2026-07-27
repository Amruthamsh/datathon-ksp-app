# api/routes/investigations.py

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_user
from db.dependencies import get_investigation_repository
from db.sqlite.sqlite_investigation_repository import (
    SQLiteInvestigationRepository,
)

logger = logging.getLogger("fastapi_function")

router = APIRouter(
    prefix="/investigations",
    tags=["Investigations"],
)


# ---------------------------------------------------------------------
# Dashboard Summary Cards
# ---------------------------------------------------------------------
@router.get("/summary", status_code=status.HTTP_200_OK)
async def get_summary(
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:
        employee_id = repo.get_user_employee_id(current_user["kgid"])

        if not employee_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user."
            )

        data = repo.get_summary(employee_id)

        return {
            "status": "success",
            "data": data
        }

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch dashboard summary."
        )


# ---------------------------------------------------------------------
# Filter Values
# ---------------------------------------------------------------------
@router.get("/filters", status_code=status.HTTP_200_OK)
async def get_filters(
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:
        data = repo.get_filter_values()

        return {
            "status": "success",
            "data": data
        }

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch filters."
        )


# ---------------------------------------------------------------------
# Investigation Table
# ---------------------------------------------------------------------
@router.get("/", status_code=status.HTTP_200_OK)
async def get_investigations(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),

    status_filter: str | None = Query(None),
    gravity: str | None = Query(None),
    station: int | None = Query(None),
    district: int |None = Query(None),
    crime_head: int | None = Query(None),
    search: str | None = Query(None),
    sort: str = Query("priority"),

    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:

        employee_id = repo.get_user_employee_id(current_user["kgid"])

        if not employee_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user."
            )

        data = repo.get_investigations(
            employee_id=employee_id,
            page=page,
            page_size=page_size,
            status=status_filter,
            gravity=gravity,
            station=station,
            district=district,
            crime_head=crime_head,
            search=search,
            sort=sort,
        )

        return {
            "status": "success",
            "data": data
        }

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch investigations."
        )


# ---------------------------------------------------------------------
# Right Side Panel
# ---------------------------------------------------------------------
@router.get("/{case_id}", status_code=status.HTTP_200_OK)
async def get_case_details(
    case_id: int,
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:

        data = repo.get_case_details(case_id)

        if not data:
            raise HTTPException(
                status_code=404,
                detail="Case not found."
            )

        return {
            "status": "success",
            "data": data
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch case details."
        )


# ---------------------------------------------------------------------
# Intelligence Panel
# ---------------------------------------------------------------------
@router.get("/{case_id}/intel", status_code=status.HTTP_200_OK)
async def get_case_intelligence(
    case_id: int,
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:

        data = repo.get_case_intelligence(case_id)

        return {
            "status": "success",
            "data": data
        }

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch investigation intelligence."
        )


# ---------------------------------------------------------------------
# Similar Cases
# ---------------------------------------------------------------------
@router.get("/{case_id}/similar", status_code=status.HTTP_200_OK)
async def get_similar_cases(
    case_id: int,
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:

        data = repo.get_similar_cases(case_id)

        return {
            "status": "success",
            "data": data
        }

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to fetch similar cases."
        )