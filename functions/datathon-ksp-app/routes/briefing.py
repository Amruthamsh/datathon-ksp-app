import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import get_current_user
from db.sqlite.briefing_repository import get_briefing

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/briefing", tags=["Briefing"])


@router.get("", status_code=status.HTTP_200_OK)
async def command_briefing(current_user: dict = Depends(get_current_user)):
    """Jurisdiction-scoped command briefing for the Home landing panel."""
    try:
        return {"status": "success", "data": get_briefing(current_user.get("scope") or {})}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to build command briefing.")
