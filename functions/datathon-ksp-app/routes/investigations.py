import logging
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
import httpx

from auth.dependencies import get_current_user
from db.dependencies import get_dashboard_repository
from db.sqlite.sqlite_dashboard_repository import SQLiteDashboardRepository

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/investigations", tags=["Investigations"])

@router.get("/", status_code=status.HTTP_200_OK)
async def get_investigations(
    current_user: dict = Depends(get_current_user),
    repo: SQLiteDashboardRepository = Depends(get_dashboard_repository),
):
    try:
        employee_id = repo.get_user_employee_id(current_user["kgid"])

        print(f"Retrieved employee_id: {employee_id} for KGID: {current_user['kgid']}")
        
        if not employee_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token context: missing user identification identifier."
            )

        data = repo.get_investigation_pipeline(employee_id=int(employee_id))
        return {"status": "success", "data": data}
        
    except Exception as e:
        logger.error(f"Failed to fetch investigation pipeline data: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to retrieve investigation data."
        )