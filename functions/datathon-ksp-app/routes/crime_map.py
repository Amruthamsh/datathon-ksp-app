import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_user
from db.dependencies import get_crime_map_repository
from db.sqlite.crime_map_repository import CrimeMapRepository

logger = logging.getLogger("fastapi_function")

router = APIRouter(
    prefix="/crime-map",
    tags=["Crime Map"],
)


@router.get("/summary", status_code=status.HTTP_200_OK)
async def get_summary(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_summary()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch map summary.")


@router.get("/filters", status_code=status.HTTP_200_OK)
async def get_filters(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_filters()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch filters.")


@router.get("/heatmap", status_code=status.HTTP_200_OK)
async def get_heatmap(
    district: int = Query(None),
    station: int = Query(None),
    crime_head: int = Query(None),
    gravity: int = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    month: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_heatmap(
            district=district, station=station, crime_head=crime_head,
            gravity=gravity, date_from=date_from, date_to=date_to, month=month,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap.")


@router.get("/clusters", status_code=status.HTTP_200_OK)
async def get_clusters(
    district: int = Query(None),
    station: int = Query(None),
    crime_head: int = Query(None),
    gravity: int = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    month: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_clusters(
            district=district, station=station, crime_head=crime_head,
            gravity=gravity, date_from=date_from, date_to=date_to, month=month,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch clusters.")


@router.get("/district-summary", status_code=status.HTTP_200_OK)
async def get_district_summary(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_district_summary()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch district summary.")


@router.get("/timeline", status_code=status.HTTP_200_OK)
async def get_timeline(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_timeline()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch timeline.")


@router.get("/hotspot", status_code=status.HTTP_200_OK)
async def get_hotspot_detail(
    lat: float = Query(...),
    lng: float = Query(...),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_hotspot_detail(lat, lng)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch hotspot detail.")


@router.get("/repeat-offenders", status_code=status.HTTP_200_OK)
async def get_repeat_offenders(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_repeat_offenders()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch repeat offenders.")


@router.get("/emerging-hotspots", status_code=status.HTTP_200_OK)
async def get_emerging_hotspots(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_emerging_hotspots()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch emerging hotspots.")


@router.get("/distribution", status_code=status.HTTP_200_OK)
async def get_distribution(
    group_by: str = Query("station"),
    district: int = Query(None),
    station: int = Query(None),
    crime_head: int = Query(None),
    gravity: int = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_distribution(
            group_by=group_by, district=district, station=station,
            crime_head=crime_head, gravity=gravity,
            date_from=date_from, date_to=date_to,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch distribution.")


# ------------------------------------------------------------------
# New endpoints for Intelligence Map
# ------------------------------------------------------------------

@router.get("/emerging", status_code=status.HTTP_200_OK)
async def get_emerging(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_emerging_hotspots()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch emerging hotspots.")


@router.get("/repeat-offender-zones", status_code=status.HTTP_200_OK)
async def get_repeat_offender_zones(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_repeat_offender_zones()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch repeat offender zones.")


@router.get("/patrol-recommendations", status_code=status.HTTP_200_OK)
async def get_patrol_recommendations(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_patrol_recommendations()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch patrol recommendations.")


@router.get("/network-overlay", status_code=status.HTTP_200_OK)
async def get_network_overlay(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_network_overlay()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch network overlay.")


# ------------------------------------------------------------------
# Intelligence Map — new endpoints
# ------------------------------------------------------------------

@router.get("/heatmap-trends", status_code=status.HTTP_200_OK)
async def get_heatmap_trends(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_heatmap_trends()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap trends.")


@router.get("/district-risk", status_code=status.HTTP_200_OK)
async def get_district_risk(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_district_risk_summary()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch district risk data.")


@router.get("/cluster-intel", status_code=status.HTTP_200_OK)
async def get_cluster_intel(
    lat: float = Query(...),
    lng: float = Query(...),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_cluster_intel(lat, lng)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch cluster intelligence.")


@router.get("/patrol-plan", status_code=status.HTTP_200_OK)
async def get_patrol_plan(
    time_range: str = Query("night"),
    units: int = Query(6),
    crime_focus: int = Query(None),
    area: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_patrol_plan(
            time_range=time_range, units=units,
            crime_focus=crime_focus, area=area,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to generate patrol plan.")


@router.get("/network-overlay-enhanced", status_code=status.HTTP_200_OK)
async def get_network_overlay_enhanced(
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_network_overlay_enhanced()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch enhanced network overlay.")
