"""
Fix CaseMaster lat/lng to lie strictly within Karnataka polygon.
Updates both synthetic-data/fir_system.db and functions/.../fir_system.db.gz
"""
import sqlite3, random, sys, gzip, shutil, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from karnataka_boundary import point_in_karnataka

KARNATAKA_DISTRICT_CENTERS = {
    "Bagalkot": (16.18, 75.70), "Ballari": (15.14, 76.92), "Belagavi": (15.86, 74.50),
    "Bengaluru Rural": (13.24, 77.70), "Bengaluru Urban": (12.97, 77.59),
    "Bidar": (17.91, 77.33), "Chamarajanagar": (11.92, 76.94), "Chikballapur": (13.44, 77.73),
    "Chikkamagaluru": (13.32, 75.78), "Chitradurga": (14.23, 76.40),
    "Dakshina Kannada": (12.87, 75.21), "Davanagere": (14.47, 75.92), "Dharwad": (15.46, 75.01),
    "Gadag": (15.43, 75.63), "Hassan": (13.01, 76.10), "Haveri": (14.80, 75.40),
    "Kalaburagi": (17.33, 76.83), "Kodagu": (12.34, 75.81), "Kolar": (13.14, 78.13),
    "Koppal": (15.35, 76.27), "Mandya": (12.52, 76.90), "Mysuru": (12.30, 76.64),
    "Raichur": (16.21, 77.37), "Ramanagara": (12.72, 77.28), "Shivamogga": (13.93, 75.57),
    "Tumakuru": (13.34, 77.10), "Udupi": (13.34, 74.74), "Uttara Kannada": (14.79, 74.59),
    "Vijayapura": (16.83, 75.71), "Yadgir": (16.77, 77.14), "Vijayanagara": (15.21, 76.46),
}
LAT_RANGE=(11.6,18.4)
LON_RANGE=(74.1,78.6)

def gen_point(district_name):
    center=KARNATAKA_DISTRICT_CENTERS.get(district_name)
    for _ in range(30):
        if center:
            lat=random.gauss(center[0],0.12)
            lng=random.gauss(center[1],0.12)
            if point_in_karnataka(lng,lat):
                return round(lat,6),round(lng,6)
        else:
            lat=random.uniform(*LAT_RANGE);lng=random.uniform(*LON_RANGE)
            if point_in_karnataka(lng,lat):
                return round(lat,6),round(lng,6)
    for _ in range(200):
        lat=random.uniform(*LAT_RANGE);lng=random.uniform(*LON_RANGE)
        if point_in_karnataka(lng,lat):
            return round(lat,6),round(lng,6)
    if center:
        return round(center[0],6),round(center[1],6)
    return 15.3173,75.7139

def fix_db(path):
    print(f"Fixing {path}")
    con=sqlite3.connect(path)
    cur=con.cursor()
    rows=cur.execute("""
        SELECT cm.CaseMasterID, cm.latitude, cm.longitude, d.DistrictName
        FROM CaseMaster cm
        JOIN Unit u ON cm.PoliceStationID=u.UnitID
        JOIN District d ON u.DistrictID=d.DistrictID
    """).fetchall()
    updates=[]
    random.seed(42)
    for cid, lat, lng, dname in rows:
        if not point_in_karnataka(lng, lat):
            nlat,nlng=gen_point(dname)
            updates.append((nlat,nlng,cid))
    print(f"  {len(updates)} / {len(rows)} outside -> fixing")
    cur.executemany("UPDATE CaseMaster SET latitude=?, longitude=? WHERE CaseMasterID=?", updates)
    con.commit()
    # verify
    cur2=con.execute("SELECT latitude, longitude FROM CaseMaster").fetchall()
    bad=sum(1 for lat,lng in cur2 if not point_in_karnataka(lng,lat))
    print(f"  after: {bad} outside")
    con.close()
    return len(updates)

if __name__=="__main__":
    import pathlib
    root=pathlib.Path(__file__).parent
    # 1. synthetic-data/fir_system.db
    fix_db(str(root/"fir_system.db"))
    # 2. functions/.../fir_system.db (if exists, recreate gz)
    func_db=root.parent/"functions/datathon-ksp-app/fir_system.db"
    func_gz=root.parent/"functions/datathon-ksp-app/fir_system.db.gz"
    # we will overwrite func_db by copying fixed db, then gz it
    if func_db.exists() or func_gz.exists():
        # if func_db is not same as synthetic, copy
        import shutil, gzip as gz
        src=str(root/"fir_system.db")
        dst=str(func_db)
        # ensure parent exists
        print(f"Copying to {dst}")
        shutil.copyfile(src, dst)
        print(f"Gzipping to {func_gz}")
        with open(dst,'rb') as f_in, gz.open(str(func_gz),'wb', compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        print("Done")
