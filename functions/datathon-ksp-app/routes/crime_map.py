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
    date_from: str = Query(None),
    date_to: str = Query(None),
    crime_head: int = Query(None),
    crime_sub_head_name: str = Query(None),
    district: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_summary(
            date_from=date_from, date_to=date_to, crime_head=crime_head,
            crime_sub_head_name=crime_sub_head_name, district=district,
        )
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
    date_from: str = Query(None),
    date_to: str = Query(None),
    district: int = Query(None),
    station: int = Query(None),
    crime_head: int = Query(None),
    gravity: int = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_heatmap_trends(
            date_from=date_from, date_to=date_to,
            district=district, station=station,
            crime_head=crime_head, gravity=gravity,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap trends.")


@router.get("/timeline-range", status_code=status.HTTP_200_OK)
async def get_timeline_range(
    date_from: str = Query(None),
    date_to: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_timeline_range(date_from=date_from, date_to=date_to)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch timeline range.")


@router.get("/crimes", status_code=status.HTTP_200_OK)
async def get_crimes(
    date_from: str = Query(None),
    date_to: str = Query(None),
    district: int = Query(None),
    station: int = Query(None),
    crime_head: int = Query(None),
    crime_sub_head: int = Query(None),
    gravity: int = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_crimes(
            date_from=date_from, date_to=date_to, district=district,
            crime_head=crime_head, crime_sub_head=crime_sub_head,
            gravity=gravity, station=station,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch crimes.")


@router.get("/crimes-light", status_code=status.HTTP_200_OK)
async def get_crimes_light(
    date_from: str = Query(None),
    date_to: str = Query(None),
    district: int = Query(None),
    crime_head: int = Query(None),
    crime_sub_head: int = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_crimes_light(
            date_from=date_from, date_to=date_to, district=district,
            crime_head=crime_head, crime_sub_head=crime_sub_head,
        )
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch crime points.")


@router.get("/crime/{case_id}", status_code=status.HTTP_200_OK)
async def get_crime_detail(
    case_id: int,
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_crime_detail(case_id)
        if not data:
            raise HTTPException(status_code=404, detail="Crime not found.")
        return {"status": "success", "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch crime detail.")


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
    date_from: str = Query(None),
    date_to: str = Query(None),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        data = repo.get_cluster_intel(lat, lng, date_from=date_from, date_to=date_to)
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


@router.get("/prevention-plan", status_code=status.HTTP_200_OK)
async def get_prevention_plan(
    crime_label: str = Query(None),
    area: str = Query(None),
    time_range: str = Query("night"),
    units: int = Query(6),
    current_user: dict = Depends(get_current_user),
    repo: CrimeMapRepository = Depends(get_crime_map_repository),
):
    try:
        stats = repo.get_prevention_stats(crime_label=crime_label, district=area)
        # keep physical routes for context where relevant
        routes = []
        try:
            # map label to head for route generation
            head_map = {
                "Crimes Against Body": 1, "Crimes Against Property": 2, "Crimes Against Women": 3,
                "Crimes Against Public Order": 4, "Economic Offences": 5,
            }
            # also subheads
            sub_to_head = {
                "Murder": 1, "Attempt to Murder": 1, "Grievous Hurt": 1, "Assault": 1, "Kidnapping": 1,
                "Theft": 2, "Burglary": 2, "Robbery": 2, "Vehicle Theft": 2, "Mischief": 2,
                "Domestic Violence": 3, "Dowry Harassment": 3, "Sexual Assault": 3, "Stalking": 3,
                "Rioting": 4, "Unlawful Assembly": 4, "Public Nuisance": 4,
                "Cheating": 5, "Forgery": 5, "Criminal Breach of Trust": 5, "Cybercrime / Online Fraud": 5,
            }
            head = sub_to_head.get(crime_label) or head_map.get(crime_label)
            if head:
                routes = repo.get_patrol_plan(time_range=time_range, units=units, crime_focus=head, area=area)
            else:
                routes = repo.get_patrol_plan(time_range=time_range, units=units, crime_focus=None, area=area)
        except Exception:
            routes = []

        from services.prevention_plan_service import generate_prevention_plan
        advisory = generate_prevention_plan(stats, area, crime_label or "All Crimes", time_range)

        return {"status": "success", "data": {"stats": stats, "routes": routes, "advisory": advisory}}
    except Exception as e:
        logger.error(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to generate prevention plan.")


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
