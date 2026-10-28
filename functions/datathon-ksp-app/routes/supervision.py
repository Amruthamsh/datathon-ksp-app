import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import require_tier
from auth.roles import DISTRICT_COMMAND, STATE_COMMAND, STATION_COMMAND
from services.supervision_service import get_officer_supervision

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/supervision", tags=["Supervision"])

# Supervising investigations is a command function — not for field force.
require_supervisor = require_tier(STATE_COMMAND, DISTRICT_COMMAND, STATION_COMMAND)


@router.get("/officers", status_code=status.HTTP_200_OK)
async def investigating_officers(current_user: dict = Depends(require_supervisor)):
    """IO workload, rank and BNSS exposure within the caller's jurisdiction."""
    try:
        return {"status": "success", "data": get_officer_supervision(current_user.get("scope") or {})}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to build officer supervision view.")
