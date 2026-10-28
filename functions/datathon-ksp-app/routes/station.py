import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import require_tier
from auth.roles import STATION_COMMAND
from services.station_service import get_station_overview

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/station", tags=["Station"])

# The station command workspace is for the officer running a police station.
require_station = require_tier(STATION_COMMAND)


@router.get("/overview", status_code=status.HTTP_200_OK)
async def station_overview(current_user: dict = Depends(require_station)):
    """Morning action queue, IO workload and local picture for one station."""
    try:
        return {"status": "success", "data": get_station_overview(current_user.get("scope") or {})}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to build the station command view.")
