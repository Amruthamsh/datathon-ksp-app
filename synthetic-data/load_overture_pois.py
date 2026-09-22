#!/usr/bin/env python3
"""Overture Maps POI loader for Karnataka — replaces flaky Overpass refreshes.

Pulls the Overture `places` theme (monthly GeoParquet on S3/Azure, ~74M
global places from Meta/Microsoft/Foursquare/AllThePlaces conflation),
filters to the Karnataka bounding box with DuckDB, maps the Overture
taxonomy to our POIType + risk weights, and upserts into
``functions/datathon-ksp-app/fir_system.db`` (DistrictPOI, Source='overture').

Why Overture instead of Overpass here:
- No API, no rate limits, no 504/429 roulette — a deterministic file read.
- Multi-source conflation with confidence scores (filter junk explicitly).
- Categories Overpass can't give us: police stations, hotels, hospitals,
  schools, fuel stations, places of worship.
- Note: Overture *excludes* transit stops by definition (bus stops, train
  platforms live in its base theme). Existing osm-overpass Bus_Stop /
  Railway_Station rows are KEPT — only Source='overture' rows are replaced.

Requires:  pip install duckdb   (NOT in backend requirements.txt — keep
the Catalyst deploy bundle light; this is a data-pipeline script.)

Usage:
    python3 load_overture_pois.py [--release 2026-08-19.0]
        [--min-confidence 0.5] [--dry-run]
        [--db ../functions/datathon-ksp-app/fir_system.db]

After loading, re-ship the bundle DB:
    python3 -c "import gzip; f='../functions/datathon-ksp-app/fir_system.db'; \
      g='../functions/datathon-ksp-app/fir_system.db.gz'; \
      open(g,'wb').write(gzip.compress(open(f,'rb').read(), compresslevel=6))"

Docs: https://docs.overturemaps.org/guides/places/
License note: places data ships under CDLA-Permissive-2.0 / Apache-2.0
(per-source). We store it side-by-side with OSM rows (not joined into OSM),
so no ODbL share-alike is triggered on our side.
"""

import argparse
import math
import re
import sqlite3
import sys
from collections import Counter

# Karnataka bounding box (lon/lat) with a small margin.
KA_BBOX = (73.4, 11.4, 78.6, 18.6)

# POIType -> (risk_weight, taxonomy token set). Matching is done against the
# Overture taxonomy.primary + full hierarchy + basic_category (lowercased):
# a place maps to the first POIType whose token set intersects. Token sets
# are deliberately generous — the loader prints the top UNMATCHED primaries
# afterwards so the mapping can be extended with real observed values.
TAXONOMY_MAP: list[tuple[str, int, set[str]]] = [
    ("ATM", 3, {"atm", "cash_machine", "cashpoint"}),
    ("Bank", 2, {"bank", "bank_or_credit_union", "credit_union", "savings_bank"}),
    ("Liquor_Store", 5, {
        "bar", "pub", "liquor_store", "nightclub", "brewery",
        "beer_bar", "cocktail_bar", "wine_bar", "beer_garden",
        "beer_store", "liquor", "wine_shop", "beer_shop",
    }),
    ("Police_Station", 1, {"police_station", "police", "police_post"}),
    ("Hotel", 3, {
        "hotel", "motel", "hostel", "guest_house", "lodging",
        "resort", "inn", "bed_and_breakfast", "lodge",
    }),
    ("Hospital", 1, {
        "hospital", "clinic", "medical_center", "medical_clinic",
        "urgent_care", "health_clinic", "doctor", "dentist",
    }),
    ("School", 2, {
        "school", "college", "university", "college_university",
        "education", "primary_school", "secondary_school",
        "high_school", "middle_school", "kindergarten", "preschool",
        "training_center", "music_school",
    }),
    ("Fuel_Station", 3, {
        "fuel", "gas_station", "petrol_station", "fuel_station",
        "petrol_pump", "gas", "charging_station",
    }),
    ("Place_of_Worship", 2, {
        "place_of_worship", "church", "mosque", "temple",
        "hindu_temple", "synagogue", "gurdwara", "shrine",
        "monastery", "cathedral", "chapel", "gurudwara",
    }),
    # Transit stops DO exist in Overture places despite the docs steering
    # them to the base theme — take them, keyed as overture rows so the
    # OSM bus/rail rows underneath are kept, not replaced.
    ("Bus_Stop", 2, {"bus_station", "bus_stop", "bus_depot", "bus_terminal"}),
    ("Railway_Station", 2, {
        "train_station", "railway_station", "metro_station", "railway",
        "railway_platform",
    }),
]


def _tokens(row: dict) -> set[str]:
    toks: set[str] = set()

    def add(v):
        if isinstance(v, str) and v:
            toks.add(v.lower())
        elif isinstance(v, (list, tuple)):
            for x in v:
                if isinstance(x, str) and x:
                    toks.add(x.lower())

    add(row.get("primary"))
    add(row.get("hierarchy"))
    add(row.get("basic"))
    add(row.get("legacy"))
    return toks


def map_taxonomy(row: dict) -> tuple[str, int] | None:
    """Map an Overture place to (POIType, risk_weight) or None to skip."""
    toks = _tokens(row)
    if not toks:
        return None
    for poi_type, weight, wanted in TAXONOMY_MAP:
        if toks & wanted:
            return poi_type, weight
    return None


# Name-keyword fallback — applied ONLY when taxonomy mapping returns None.
# ~3% of Karnataka rows are real named businesses (often high-confidence)
# whose provider feed never assigned a taxonomy category. Patterns are
# word-boundaried and conservative; ambiguous commercial terms (rooms,
# center, services, distributors) are deliberately excluded.
# Known tradeoff: road-name matches (e.g. a shop on "Mandir Road") can
# misfile — acceptable at weight 2, and taxonomy-matched rows always win.
NAME_PATTERNS: list[tuple[re.Pattern, str, int]] = [
    (re.compile(r"\b(oyo|hotel|lodge|residency|residense|suites|inn|motel|hostel|homestay|guest house)\b", re.I), "Hotel", 3),
    (re.compile(r"\b(hospital|clinic|dental|dentist|multispeciality|multispecialty|nursing home|health ?care|diagnostic|pathlab|physiotherapy|rehab)\b", re.I), "Hospital", 1),
    (re.compile(r"\b(school|college|university|academy|vidyalaya|vidya|institute|coaching|tuition|polytechnic|iti|kindergarten|preschool)\b", re.I), "School", 2),
    (re.compile(r"\b(temple|mandir|masjid|mosque|church|gurudwara|gurdwara|dargah|matha|mutt|ashram|shrine)\b", re.I), "Place_of_Worship", 2),
    (re.compile(r"\b(bar|pub|brewery|lounge|tavern)\b", re.I), "Liquor_Store", 5),
    (re.compile(r"\b(petrol|fuel|hpcl|bpcl|ioc|essar|nayara|shell)\b", re.I), "Fuel_Station", 3),
    (re.compile(r"\b(bank|atm)\b", re.I), "Bank", 2),
    (re.compile(r"\bpolice\b", re.I), "Police_Station", 1),
]


def map_name(name: str | None) -> tuple[str, int] | None:
    if not name or not isinstance(name, str):
        return None
    for pattern, poi_type, weight in NAME_PATTERNS:
        if pattern.search(name):
            return poi_type, weight
    return None


def _nearest_district(lat: float, lng: float, centers: dict[str, tuple]) -> tuple:
    best, best_d = None, float("inf")
    for name, (clat, clng) in centers.items():
        d = (lat - clat) ** 2 + (lng - clng) ** 2
        if d < best_d:
            best, best_d = name, d
    return best


def _district_centers() -> dict[str, tuple]:
    try:
        sys.path.insert(0, "../functions/datathon-ksp-app")
        from services.intelligence_etl_service import (  # noqa
            _DISTRICT_IDS,
            _KARNATAKA_CENTERS,
        )

        return _KARNATAKA_CENTERS, _DISTRICT_IDS
    except Exception:
        centers = {
            "Bagalkot": (16.18, 75.70), "Ballari": (15.14, 76.92),
            "Belagavi": (15.86, 74.50), "Bengaluru Rural": (13.24, 77.70),
            "Bengaluru Urban": (12.97, 77.59), "Bidar": (17.91, 77.33),
            "Chamarajanagar": (11.92, 76.94), "Chikballapur": (13.44, 77.73),
            "Chikkamagaluru": (13.32, 75.78), "Chitradurga": (14.23, 76.40),
            "Dakshina Kannada": (12.87, 75.21), "Davanagere": (14.47, 75.92),
            "Dharwad": (15.46, 75.01), "Gadag": (15.43, 75.63),
            "Hassan": (13.01, 76.10), "Haveri": (14.80, 75.40),
            "Kalaburagi": (17.33, 76.83), "Kodagu": (12.34, 75.81),
            "Kolar": (13.14, 78.13), "Koppal": (15.35, 76.27),
            "Mandya": (12.52, 76.90), "Mysuru": (12.30, 76.64),
            "Raichur": (16.21, 77.37), "Ramanagara": (12.72, 77.28),
            "Shivamogga": (13.93, 75.57), "Tumakuru": (13.34, 77.10),
            "Udupi": (13.34, 74.74), "Uttara Kannada": (14.79, 74.59),
            "Vijayapura": (16.83, 75.71), "Yadgir": (16.77, 77.14),
            "Vijayanagara": (15.21, 76.46),
        }
        ids = {n: i + 1 for i, n in enumerate([
            "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural",
            "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikballapur",
            "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere",
            "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
            "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara",
            "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura",
            "Yadgir", "Vijayanagara",
        ])}
        return centers, ids


def extract(release: str, min_confidence: float) -> list[dict]:
    import duckdb

    xmin, ymin, xmax, ymax = KA_BBOX
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2'")
    # taxonomy.primary is current; categories.primary is the deprecated twin
    # (removed after Sept 2026 releases) — read both, prefer taxonomy.
    # basic_category (~280 labels) catches anything the token sets miss.
    q = f"""
    SELECT id,
           names.primary AS name,
           taxonomy.primary AS primary,
           taxonomy.hierarchy AS hierarchy,
           basic_category AS basic,
           categories.primary AS legacy,
           confidence,
           ST_X(geometry) AS lng,
           ST_Y(geometry) AS lat
    FROM read_parquet(
        's3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*')
    WHERE bbox.xmin BETWEEN {xmin} AND {xmax}
      AND bbox.ymin BETWEEN {ymin} AND {ymax}
      AND (confidence IS NULL OR confidence >= {min_confidence})
      AND COALESCE(operating_status, '') != 'permanently_closed'
    """
    print(f"DuckDB: scanning release {release} for Karnataka bbox ...", flush=True)
    rows = con.execute(q).fetchall()
    cols = [d[0] for d in con.description]
    con.close()
    return [dict(zip(cols, r)) for r in rows]


def build_rows(raw: list[dict]) -> tuple[list[tuple], Counter, Counter, Counter]:
    centers, ids = _district_centers()
    try:
        import sys as _sys
        _sys.path.insert(0, ".")
        from karnataka_boundary import point_in_karnataka
    except Exception:
        point_in_karnataka = None
    out: list[tuple] = []
    per_type: Counter = Counter()
    via_name: Counter = Counter()
    unmatched: Counter = Counter()
    outside = 0
    for r in raw:
        mapped = map_taxonomy(r)
        name = (r.get("name") or "").strip()
        if not mapped:
            mapped = map_name(name)
            if mapped:
                via_name[mapped[0]] += 1
        if not mapped:
            unmatched[r.get("primary") or r.get("basic") or "?"] += 1
            continue
        poi_type, weight = mapped
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(lat) and math.isfinite(lng)):
            continue
        # Karnataka police index: drop out-of-state rows (35km centroid
        # boxes and the bbox margin pull in Kerala/TN/MH/Goa/AP places,
        # which render as markers outside the state boundary).
        if point_in_karnataka is not None and not point_in_karnataka(lng, lat):
            outside += 1
            continue
        name = (r.get("name") or "").strip() or f"{poi_type} {(r.get('id') or '')[:8]}"
        district = _nearest_district(lat, lng, centers)
        out.append((
            ids.get(district), district, poi_type, name,
            round(lat, 7), round(lng, 7), weight,
            f"ov:{r.get('id')}",
        ))
        per_type[poi_type] += 1
    return out, per_type, via_name, unmatched, outside


def upsert(db_path: str, rows: list[tuple]) -> None:
    from datetime import datetime, timezone

    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA query_only=OFF")
        # Overture rows live alongside osm-overpass rows (transit stops come
        # only from OSM — Overture excludes them by definition).
        con.execute("DELETE FROM DistrictPOI WHERE Source='overture'")
        con.executemany(
            "INSERT INTO DistrictPOI(DistrictID, DistrictName, POIType, POIName,"
            " Latitude, Longitude, RiskWeight, OSMId, Source, UpdatedAt)"
            " VALUES(?,?,?,?,?,?,?,?,'overture', datetime('now'))",
            rows,
        )
        # The map's LIVE INTELLIGENCE header reads IntelligenceMeta, not the
        # rows — without this it keeps showing the old Overpass-era count.
        total = con.execute("SELECT COUNT(*) FROM DistrictPOI").fetchone()[0]
        con.execute(
            "INSERT OR REPLACE INTO IntelligenceMeta(Key, Value, UpdatedAt)"
            " VALUES('poi_total', ?, datetime('now'))",
            (str(total),),
        )
        con.execute(
            "INSERT OR REPLACE INTO IntelligenceMeta(Key, Value, UpdatedAt)"
            " VALUES('poi_last_refresh', ?, datetime('now'))",
            (datetime.now(timezone.utc).isoformat(),),
        )
        con.commit()
    finally:
        con.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Load Overture places into DistrictPOI.")
    ap.add_argument("--release", default="2026-08-19.0")
    ap.add_argument("--min-confidence", type=float, default=0.5)
    ap.add_argument("--db", default="../functions/datathon-ksp-app/fir_system.db")
    ap.add_argument("--dry-run", action="store_true",
                    help="Extract + map, print counts, write nothing.")
    args = ap.parse_args()

    raw = extract(args.release, args.min_confidence)
    print(f"Extracted {len(raw)} Karnataka places from release {args.release}")
    rows, per_type, via_name, unmatched, outside = build_rows(raw)
    print("Mapped POIType counts:")
    for t, n in per_type.most_common():
        print(f"  {t:18s} {n}")
    if via_name:
        print(f"Name-fallback rescues (no taxonomy, matched by name): {sum(via_name.values())}")
        for t, n in via_name.most_common():
            print(f"  {t:18s} {n}")
    print(f"Skipped (no taxonomy match): {sum(unmatched.values())}")
    print(f"Dropped (outside Karnataka boundary): {outside}")
    print("Top unmatched taxonomy primaries (extend TAXONOMY_MAP with these):")
    for token, n in unmatched.most_common(20):
        print(f"  {str(token):40s} {n}")
    if args.dry_run:
        print("Dry run — nothing written.")
        return
    upsert(args.db, rows)
    print(f"Wrote {len(rows)} overture rows to {args.db} (osm-overpass rows kept).")
    print("Re-ship the bundle DB with:")
    print("  python3 -c \"import gzip; f='../functions/datathon-ksp-app/fir_system.db';"
          " g='../functions/datathon-ksp-app/fir_system.db.gz';"
          " open(g,'wb').write(gzip.compress(open(f,'rb').read(), compresslevel=6))\"")


if __name__ == "__main__":
    main()
