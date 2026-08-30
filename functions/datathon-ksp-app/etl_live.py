#!/usr/bin/env python3
"""
Live ETL runner — fetches OSM POIs + Open-Meteo weather + socio-economic and rebuilds fir_system.db.gz
Usage: python etl_live.py [--quick]  # quick = 8 districts, full = 31 districts
Requires: requests (already in requirements)
Set DATA_GOV_API_KEY env to unlock full data.gov.in socio-economic fetch.
"""
import argparse
import gzip
import shutil
import os
import sys
from pathlib import Path

# ensure project root imports work when run as `python etl_live.py`
sys.path.insert(0, str(Path(__file__).parent))

from db.sqlite.intelligence_schema import ensure_intelligence_tables
from services.intelligence_etl_service import fetch_live_pois, fetch_live_weather, fetch_live_socio_economic, get_status

def rebuild_gz():
    src = Path(__file__).parent / "fir_system.db"
    # The runtime DB path may be in temp after gz extraction; ensure we gzip the canonical DB
    # Synthetic-data canonical is ../synthetic-data/fir_system.db but etl writes to functions db
    gz = Path(__file__).parent / "fir_system.db.gz"
    # Find actual writable DB location
    from db.sqlite.sqlite import SQLITE_DATABASE_PATH
    actual = Path(SQLITE_DATABASE_PATH)
    print(f"Actual SQLITE path: {actual} exists={actual.exists()}")
    target_gz = gz
    src_db = actual if actual.exists() else src
    if not src_db.exists():
        print(f"No DB found at {src_db}")
        return
    print(f"Gzipping {src_db} -> {target_gz} ...")
    with open(src_db, "rb") as f_in, gzip.open(target_gz, "wb", compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)
    print(f"Done: {target_gz} {target_gz.stat().st_size/1e6:.1f} MB")
    # also sync synthetic-data copy for redundancy
    syn = Path(__file__).parent.parent.parent / "synthetic-data" / "fir_system.db"
    if syn.exists():
        print(f"Syncing to {syn} ...")
        shutil.copy2(src_db, syn)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="only 8 high-priority districts")
    parser.add_argument("--weather-days", type=int, default=30)
    parser.add_argument("--radius", type=int, default=20000)
    args = parser.parse_args()

    print("Ensuring intelligence tables ...")
    ensure_intelligence_tables()
    print(f"Quick={args.quick} radius={args.radius} weather_days={args.weather_days}")

    if args.quick:
        quick = ["Bengaluru Urban","Mysuru","Belagavi","Dakshina Kannada","Kalaburagi","Dharwad","Ballari","Tumakuru"]
        print("Fetching POIs quick (8 districts) ...")
        print(fetch_live_pois(limit_districts=quick, radius_m=args.radius))
    else:
        print("Fetching POIs full (31 districts, ~40s) ...")
        print(fetch_live_pois(limit_districts=None, radius_m=args.radius))

    print("Fetching weather ...")
    print(fetch_live_weather(days=args.weather_days))

    print("Fetching socio-economic ...")
    print(fetch_live_socio_economic())

    print("Status:", get_status())

    # Rebuild gz so next deploy ships live-enriched DB
    try:
        rebuild_gz()
    except Exception as e:
        print(f"gz rebuild skipped: {e}")

if __name__ == "__main__":
    main()
