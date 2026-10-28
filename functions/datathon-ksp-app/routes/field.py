import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import require_tier
from auth.roles import FIELD_FORCE
from services.field_service import get_field_overview

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/field", tags=["Field"])

require_field = require_tier(FIELD_FORCE)


@router.get("/overview", status_code=status.HTTP_200_OK)
async def field_overview(current_user: dict = Depends(require_field)):
    """Assigned cases, field tasks and beat context for one investigator."""
    try:
        return {"status": "success", "data": get_field_overview(current_user.get("scope") or {})}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to build the field workbench view.")
