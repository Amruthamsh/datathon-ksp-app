import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from auth.dependencies import get_current_user
from services.bnss_service import get_compliance

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.get("", status_code=status.HTTP_200_OK)
async def bnss_compliance(current_user: dict = Depends(get_current_user)):
    """BNSS statutory-clock board, scoped to the caller's jurisdiction."""
    try:
        return {"status": "success", "data": get_compliance(current_user.get("scope") or {})}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to build BNSS compliance board.")
