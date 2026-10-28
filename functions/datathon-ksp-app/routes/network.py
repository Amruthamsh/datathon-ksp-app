import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_user, require_tier
from auth.roles import DISTRICT_COMMAND, STATE_COMMAND, STATION_COMMAND
from db.dependencies import get_network_repository
from db.sqlite.network_repository import NetworkRepository

logger = logging.getLogger("fastapi_function")

router = APIRouter(
    prefix="/network",
    tags=["Network"],
)

# Bulk intel (statewide aggregates) is command + station only — field force
# uses search + person endpoints scoped to their own cases.
require_networks_bulk = require_tier(STATE_COMMAND, DISTRICT_COMMAND, STATION_COMMAND)


@router.get("/summary", status_code=status.HTTP_200_OK)
async def get_summary(
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_summary(scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch network summary.")


@router.get("/search", status_code=status.HTTP_200_OK)
async def search(
    q: str = Query("", min_length=1),
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.search(q, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Search failed.")


@router.get("/person/{person_name}/profile", status_code=status.HTTP_200_OK)
async def get_person_profile(
    person_name: str,
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_person_profile(person_name, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch person profile.")


@router.get("/person/{person_name}/graph", status_code=status.HTTP_200_OK)
async def get_person_graph(
    person_name: str,
    depth: int = Query(1, ge=0, le=2),
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_person_graph(person_name, depth=depth, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch person graph.")


@router.get("/person/{person_name}/associates", status_code=status.HTTP_200_OK)
async def get_associates(
    person_name: str,
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_associates(person_name, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch associates.")


@router.get("/person/{person_name}/timeline", status_code=status.HTTP_200_OK)
async def get_timeline(
    person_name: str,
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_timeline(person_name, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch timeline.")


@router.get("/person/{person_name}/analytics", status_code=status.HTTP_200_OK)
async def get_analytics(
    person_name: str,
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_analytics(person_name, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch analytics.")


@router.get("/communities", status_code=status.HTTP_200_OK)
async def get_communities(
    current_user: dict = Depends(require_networks_bulk),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_communities(scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch communities.")


@router.get("/bridge-individuals", status_code=status.HTTP_200_OK)
async def get_bridge_individuals(
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_networks_bulk),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_bridge_individuals(limit=limit, scope=current_user.get("scope"))
        return {"status": "success", "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch bridge individuals.")


@router.get("/cross-border", status_code=status.HTTP_200_OK)
async def get_cross_border_offenders(
    limit: int = Query(15, ge=1, le=50),
    current_user: dict = Depends(require_networks_bulk),
):
    """Accused in the caller's jurisdiction who also appear in other
    districts — names and FIR counts only, no outside case details."""
    from services.cross_border_service import get_cross_border

    try:
        return {"status": "success", "data": get_cross_border(current_user.get("scope") or {}, limit=limit)}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch cross-border offenders.")
