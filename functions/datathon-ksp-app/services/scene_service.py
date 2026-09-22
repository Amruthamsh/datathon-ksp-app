"""Scene Intel service — deterministic radius queries around a dropped pin.

Answers "what's around here?" without an LLM round-trip:

- **Crime history**: FIR counts in radius, broken down by crime type,
  plus stations covering the area and the most recent cases.
- **Repeat offenders**: accused names with >1 FIR inside the radius.
- **POIs**: cached OSM points of interest (``DistrictPOI``: ATM, Bank,
  Liquor_Store, Bus_Stop, Railway_Station) in radius, with risk weights.

Read-only bounding-box queries (same approximation as the crime-map
``get_hotspot_detail``). At a 10 km radius the box-vs-circle error is
negligible for policing purposes.

Usage:
    from services.scene_service import get_scene_intel, build_scene_context
    cards = get_scene_intel(lat=12.9716, lng=77.5946, radius_km=10)
"""

import logging
import math
import re
import urllib.parse

logger = logging.getLogger("fastapi_function")

_KM_PER_DEG_LAT = 111.32
_DEFAULT_RADIUS_KM = 10.0
_MAX_RADIUS_KM = 50.0
_MIN_RADIUS_KM = 1.0


def clamp_radius(radius_km) -> float:
    try:
        r = float(radius_km)
    except (TypeError, ValueError):
        return _DEFAULT_RADIUS_KM
    if not math.isfinite(r):
        return _DEFAULT_RADIUS_KM
    return max(_MIN_RADIUS_KM, min(_MAX_RADIUS_KM, r))


def maps_url(lat, lng, label: str | None = None) -> str:
    """Universal Google Maps link. No API key needed.

    A bare ``query=lat,lng`` drops an *unlabeled* pin — Google then shows
    whatever labeled businesses happen to be nearby, which reads as "wrong
    place". When a real OSM name exists, ``query=<name>,<lat>,<lng>``
    biases Google's search so it surfaces the actual place listing (its
    fresher index also corrects small OSM offsets). Coordinates always
    travel along, so an unknown name still lands on the right spot.

    ``label`` is used only for genuine names — never for synthetic names
    (station jurisdictions), fallback names ("ATM 12345"), or bare numbers
    ("1522"), which would poison the search.
    """
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return ""
    if not (math.isfinite(la) and math.isfinite(ln)):
        return ""
    if label and _has_real_name(label):
        q = urllib.parse.quote(f"{label.strip()},{la:.6f},{ln:.6f}")
        return f"https://www.google.com/maps/search/?api=1&query={q}"
    return f"https://www.google.com/maps/search/?api=1&query={la:.6f},{ln:.6f}"


_FALLBACK_NAME_RE = re.compile(
    r"^(ATM|Bank|Liquor_Store|Bus_Stop|Railway_Station|Other)\s+\d+$", re.I
)


def _has_real_name(name) -> bool:
    if not name or not isinstance(name, str):
        return False
    s = name.strip()
    if not s or _FALLBACK_NAME_RE.match(s):
        return False
    # Bare numbers / refs ("1522", "10") carry no search signal.
    return sum(c.isalpha() for c in s) >= 3


def valid_coords(lat, lng) -> bool:
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    return (
        math.isfinite(la)
        and math.isfinite(ln)
        and -90.0 <= la <= 90.0
        and -180.0 <= ln <= 180.0
    )


def radius_bounds(lat: float, lng: float, radius_km: float):
    """(min_lat, max_lat, min_lng, max_lng) bounding box for the radius."""
    lat = float(lat)
    lng = float(lng)
    r = clamp_radius(radius_km)
    d_lat = r / _KM_PER_DEG_LAT
    d_lng = r / (_KM_PER_DEG_LAT * max(math.cos(math.radians(lat)), 0.2))
    return (lat - d_lat, lat + d_lat, lng - d_lng, lng + d_lng)


def _crime_in_bounds(conn, bounds, limit_types: int = 8, limit_recent: int = 5) -> dict:
    min_lat, max_lat, min_lng, max_lng = bounds
    total = conn.execute(
        """
        SELECT COUNT(*) AS n FROM CaseMaster
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
        """,
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchone()["n"]

    by_type = [
        dict(r)
        for r in conn.execute(
            """
            SELECT csh.CrimeHeadName AS type, COUNT(*) AS count
            FROM CaseMaster cm
            LEFT JOIN CrimeSubHead csh
              ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            WHERE cm.latitude BETWEEN ? AND ?
              AND cm.longitude BETWEEN ? AND ?
            GROUP BY csh.CrimeHeadName
            ORDER BY count DESC
            LIMIT ?
            """,
            (min_lat, max_lat, min_lng, max_lng, limit_types),
        ).fetchall()
    ]

    stations = [
        dict(r)
        for r in conn.execute(
            """
            SELECT u.UnitName AS station, COUNT(*) AS count,
                   AVG(cm.latitude) AS lat, AVG(cm.longitude) AS lng
            FROM CaseMaster cm
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            WHERE cm.latitude BETWEEN ? AND ?
              AND cm.longitude BETWEEN ? AND ?
            GROUP BY u.UnitName
            ORDER BY count DESC
            LIMIT 6
            """,
            (min_lat, max_lat, min_lng, max_lng),
        ).fetchall()
    ]
    for s in stations:
        if s.get("lat") is not None and s.get("lng") is not None:
            s["lat"] = round(s["lat"], 4)
            s["lng"] = round(s["lng"], 4)
            s["maps_url"] = maps_url(s["lat"], s["lng"])

    recent = [
        dict(r)
        for r in conn.execute(
            """
            SELECT cm.CrimeNo AS crime_no,
                   cm.CrimeRegisteredDate AS date,
                   csh.CrimeHeadName AS type,
                   u.UnitName AS station,
                   cm.latitude AS lat, cm.longitude AS lng
            FROM CaseMaster cm
            LEFT JOIN CrimeSubHead csh
              ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            WHERE cm.latitude BETWEEN ? AND ?
              AND cm.longitude BETWEEN ? AND ?
            ORDER BY cm.CrimeRegisteredDate DESC
            LIMIT ?
            """,
            (min_lat, max_lat, min_lng, max_lng, limit_recent),
        ).fetchall()
    ]
    for c in recent:
        if c.get("lat") is not None and c.get("lng") is not None:
            c["maps_url"] = maps_url(c["lat"], c["lng"])

    return {
        "total": total or 0,
        "by_type": by_type,
        "stations": stations,
        "recent": recent,
    }


def _repeat_offenders_in_bounds(conn, bounds, limit: int = 8) -> list:
    # Known repeat offenders active in this area: ≥1 FIR inside the radius
    # AND >1 FIR overall. (Requiring 2+ FIRs *inside* the radius misses
    # mobile offenders whose record spans districts.)
    min_lat, max_lat, min_lng, max_lng = bounds
    rows = [
        dict(r)
        for r in conn.execute(
            """
            SELECT a.AccusedName AS name,
                   SUM(CASE WHEN cm.latitude BETWEEN ? AND ?
                             AND cm.longitude BETWEEN ? AND ?
                            THEN 1 ELSE 0 END) AS fir_in_radius,
                   COUNT(DISTINCT a.CaseMasterID) AS fir_total,
                   COUNT(DISTINCT cm.PoliceStationID) AS stations,
                   MAX(cm.CrimeRegisteredDate) AS last_seen,
                   AVG(CASE WHEN cm.latitude BETWEEN ? AND ?
                             AND cm.longitude BETWEEN ? AND ?
                            THEN cm.latitude END) AS area_lat,
                   AVG(CASE WHEN cm.latitude BETWEEN ? AND ?
                             AND cm.longitude BETWEEN ? AND ?
                            THEN cm.longitude END) AS area_lng
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            WHERE a.AccusedName IS NOT NULL
            GROUP BY a.AccusedName
            HAVING fir_in_radius >= 1 AND fir_total > 1
            ORDER BY fir_in_radius DESC, fir_total DESC
            LIMIT ?
            """,
            (min_lat, max_lat, min_lng, max_lng,
             min_lat, max_lat, min_lng, max_lng,
             min_lat, max_lat, min_lng, max_lng, limit),
        ).fetchall()
    ]
    for o in rows:
        if o.get("area_lat") is not None and o.get("area_lng") is not None:
            o["area_lat"] = round(o["area_lat"], 4)
            o["area_lng"] = round(o["area_lng"], 4)
            o["maps_url"] = maps_url(o["area_lat"], o["area_lng"])
    return rows


def _pois_in_bounds(conn, bounds, limit_items: int = 30, per_type_cap: int = 6) -> dict:
    min_lat, max_lat, min_lng, max_lng = bounds
    try:
        # Dedupe: the OSM ETL stores the same element multiple times
        # (9113 rows / 6690 distinct OSMIds). Count distinct places only.
        by_type = [
            dict(r)
            for r in conn.execute(
                """
                SELECT POIType AS type, COUNT(*) AS count,
                       ROUND(AVG(RiskWeight), 1) AS avg_risk
                FROM (
                    SELECT DISTINCT OSMId, POIType, RiskWeight
                    FROM DistrictPOI
                    WHERE Latitude BETWEEN ? AND ?
                      AND Longitude BETWEEN ? AND ?
                )
                GROUP BY POIType
                ORDER BY count DESC
                """,
                (min_lat, max_lat, min_lng, max_lng),
            ).fetchall()
        ]
        rows = [
            dict(r)
            for r in conn.execute(
                """
                SELECT name, type, lat, lng, risk, source FROM (
                    SELECT MIN(POIName) AS name, POIType AS type,
                           AVG(Latitude) AS lat, AVG(Longitude) AS lng,
                           MAX(RiskWeight) AS risk, MAX(Source) AS source,
                           ROW_NUMBER() OVER (
                               PARTITION BY POIType
                               ORDER BY MAX(RiskWeight) DESC, MIN(POIName) ASC
                           ) AS rn
                    FROM DistrictPOI
                    WHERE Latitude BETWEEN ? AND ?
                      AND Longitude BETWEEN ? AND ?
                    GROUP BY OSMId
                )
                WHERE rn <= ?
                ORDER BY risk DESC, type ASC, name ASC
                LIMIT ?
                """,
                (min_lat, max_lat, min_lng, max_lng, per_type_cap, limit_items),
            ).fetchall()
        ]
    except Exception as e:
        # DistrictPOI is a lazily-migrated intelligence table — it may not
        # exist on older bundles. Degrade gracefully, never fail the turn.
        logger.warning(f"Scene POI lookup unavailable (non-fatal): {e}")
        return {"by_type": [], "items": [], "unavailable": True}

    items = rows
    for p in items:
        if p.get("lat") is not None and p.get("lng") is not None:
            # POIs carry OSM names — pass them so Google shows the place
            # listing, not an unlabeled pin. Stations/cases/offenders keep
            # coords-only links (their names are synthetic case data).
            p["maps_url"] = maps_url(p["lat"], p["lng"], p.get("name"))
    # Interleave by type so the first N items span all categories instead
    # of showing only the highest-risk type.
    buckets: dict[str, list] = {}
    for p in items:
        buckets.setdefault(p["type"], []).append(p)
    interleaved = []
    while any(buckets.values()):
        for t in sorted(buckets):
            if buckets[t]:
                interleaved.append(buckets[t].pop(0))
    total = sum(t["count"] for t in by_type)
    return {"total": total, "by_type": by_type, "items": interleaved}


def get_scene_intel(lat, lng, radius_km=_DEFAULT_RADIUS_KM) -> dict:
    """Full scene workup. Returns {} when coords are invalid."""
    if not valid_coords(lat, lng):
        return {}
    from db.sqlite.sqlite import get_connection

    lat, lng = round(float(lat), 4), round(float(lng), 4)
    radius = clamp_radius(radius_km)
    bounds = radius_bounds(lat, lng, radius)

    with get_connection() as conn:
        crime = _crime_in_bounds(conn, bounds)
        offenders = _repeat_offenders_in_bounds(conn, bounds)
        pois = _pois_in_bounds(conn, bounds)

    return {
        "pin": {
            "lat": lat,
            "lng": lng,
            "radius_km": radius,
            "maps_url": maps_url(lat, lng),
        },
        "crime": crime,
        "repeat_offenders": offenders,
        "pois": pois,
    }


def build_scene_context(cards: dict) -> str:
    """Compact citable block injected into LLM prompts + workspace."""
    if not cards or "pin" not in cards:
        return ""
    pin = cards["pin"]
    crime = cards.get("crime", {})
    offenders = cards.get("repeat_offenders", []) or []
    pois = cards.get("pois", {}) or {}

    lines = [
        f"Scene Intel for pin {pin['lat']}, {pin['lng']} (radius {pin['radius_km']} km) — "
        "cite these exact values, never invent nearby counts:"
    ]
    total = crime.get("total", 0)
    by_type = crime.get("type", crime.get("by_type", [])) or []
    if total:
        mix = ", ".join(f"{t['type']} {t['count']}" for t in by_type[:6])
        lines.append(f"- Crime history: {total} FIRs in radius" + (f" ({mix})" if mix else "") + ".")
        stations = crime.get("stations", []) or []
        if stations:
            lines.append(
                "- Covering stations: "
                + ", ".join(f"{s['station']} ({s['count']})" for s in stations[:4])
                + "."
            )
    else:
        lines.append("- Crime history: no FIRs geocoded inside this radius.")

    if offenders:
        lines.append(
            "- Repeat offenders active in radius: "
            + "; ".join(
                f"{o['name']} ({o['fir_in_radius']} FIR(s) in radius, "
                f"{o['fir_total']} total, last seen {o.get('last_seen') or 'unknown'})"
                for o in offenders[:6]
            )
            + "."
        )
    else:
        lines.append("- Repeat offenders in radius: none with >1 FIR.")

    poi_types = pois.get("by_type", []) or []
    if poi_types:
        lines.append(
            "- Nearby POIs (cached OSM data): "
            + ", ".join(f"{t['count']}× {t['type']}" for t in poi_types)
            + "."
        )
    elif pois.get("unavailable"):
        lines.append("- Nearby POIs: POI index unavailable on this bundle.")
    else:
        lines.append("- Nearby POIs: none indexed inside this radius.")

    return "\n".join(lines)
