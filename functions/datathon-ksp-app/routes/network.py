import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_user
from db.dependencies import get_network_repository
from db.sqlite.network_repository import NetworkRepository

logger = logging.getLogger("fastapi_function")

router = APIRouter(
    prefix="/network",
    tags=["Network"],
)


@router.get("/summary", status_code=status.HTTP_200_OK)
async def get_summary(
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_summary()
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
        data = repo.search(q)
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
        data = repo.get_person_profile(person_name)
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
        data = repo.get_person_graph(person_name, depth=depth)
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
        data = repo.get_associates(person_name)
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
        data = repo.get_timeline(person_name)
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
        data = repo.get_analytics(person_name)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch analytics.")


@router.get("/communities", status_code=status.HTTP_200_OK)
async def get_communities(
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_communities()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch communities.")


@router.get("/bridge-individuals", status_code=status.HTTP_200_OK)
async def get_bridge_individuals(
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    repo: NetworkRepository = Depends(get_network_repository),
):
    try:
        data = repo.get_bridge_individuals(limit=limit)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch bridge individuals.")
