# api/routes/investigations.py

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_user
from auth.roles import case_in_scope
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

        data = repo.get_summary(employee_id, scope=current_user.get("scope"))

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
@router.get("", status_code=status.HTTP_200_OK)
async def get_investigations(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),

    status_filter: str | None = Query(None),
    gravity: str | None = Query(None),
    station: str | None = Query(None),
    district: str | None = Query(None),
    crime_head: str | None = Query(None),
    officer: str | None = Query(None),
    search: str | None = Query(None),
    sort: str = Query("priority"),
    sort_dir: str = Query("desc"),
    only_overdue: bool = Query(False),
    only_chargesheet_pending: bool = Query(False),
    only_arrest_pending: bool = Query(False),

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

        result = repo.get_investigations(
            employee_id=employee_id,
            page=page,
            page_size=page_size,
            status=status_filter,
            gravity=gravity,
            station=station,
            district=district,
            crime_head=crime_head,
            officer=officer,
            search=search,
            sort=sort,
            sort_dir=sort_dir,
            scope=current_user.get("scope"),
            only_overdue=only_overdue,
            only_chargesheet_pending=only_chargesheet_pending,
            only_arrest_pending=only_arrest_pending,
        )

        total = result["total"]
        total_pages = max(1, (total + page_size - 1) // page_size)

        return {
            "status": "success",
            "data": result["data"],
            "pagination": {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
            },
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
def _assert_case_visible(case: dict | None, scope: dict | None):
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    if not case_in_scope(scope or {}, case):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role is not authorized to view this case.",
        )


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

        _assert_case_visible(data, current_user.get("scope"))

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

        details = repo.get_case_details(case_id)
        _assert_case_visible(details, current_user.get("scope"))
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

        details = repo.get_case_details(case_id)
        _assert_case_visible(details, current_user.get("scope"))
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


# ---------------------------------------------------------------------
# AI Case Brief (standalone, like crime-map patrol endpoints)
# ---------------------------------------------------------------------
@router.get("/{case_id}/brief", status_code=status.HTTP_200_OK)
async def get_case_brief(
    case_id: int,
    language: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: SQLiteInvestigationRepository = Depends(
        get_investigation_repository
    ),
):
    try:

        details = repo.get_case_details(case_id)

        _assert_case_visible(details, current_user.get("scope"))

        intel = repo.get_case_intelligence(case_id)

        # Lazy import — keeps cold starts light (same pattern as chat graph)
        from services.case_brief_service import generate_case_brief

        result = generate_case_brief(
            details, intel or {}, (language or "en")[:2]
        )

        return {
            "status": "success",
            "data": result or {"brief": None, "generated_at": None},
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to generate case brief."
        )