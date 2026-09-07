"""
Karnataka Police FIR System — Synthetic Data Generator
=========================================================
Generates FK-consistent synthetic CSV data for every table in the schema,
in dependency order, ready for Zoho Catalyst Data Store Bulk Write jobs.

All data is entirely synthetic (Faker-generated names + randomized fields).
No real persons, cases, or incidents are represented.

Usage:
    python3 generate_fir_data.py

Tune the CONFIG block below to control data volume.
"""

import csv
import os
import random
from datetime import date, datetime, timedelta

from faker import Faker

# ----------------------------------------------------------------------------
# CONFIG — tune these to control output volume
# ----------------------------------------------------------------------------
SEED = 42
OUTPUT_DIR = "output_csv"

NUM_CASES = 50_000          # CaseMaster rows — the main volume driver
UNITS_PER_DISTRICT = (4, 10)        # police stations per district (min, max)
EMPLOYEES_PER_UNIT = (8, 18)        # staff per police station
CASE_YEAR_RANGE = (2022, 2026)      # FIRs registered across these years

# Per-case child record counts (min, max), sampled per case
VICTIMS_PER_CASE = (1, 3)
ACCUSED_PER_CASE = (1, 4)
ACT_SECTIONS_PER_CASE = (1, 3)
COMPLAINANTS_PER_CASE = (1, 1)       # almost always exactly one
CHARGESHEET_PROBABILITY = 0.55       # fraction of cases with a chargesheet
ARREST_PROBABILITY = 0.65            # fraction of cases with an arrest/surrender event

random.seed(SEED)
fake = Faker("en_IN")
Faker.seed(SEED)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Karnataka boundary — accurate polygon for lat/lng clipping
try:
    from karnataka_boundary import point_in_karnataka  # when run from synthetic-data/
except ImportError:
    from synthetic_data.karnataka_boundary import point_in_karnataka  # fallback


# ----------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------
def path(table_name: str) -> str:
    return os.path.join(OUTPUT_DIR, f"{table_name}.csv")


class CsvWriterHandle:
    """Thin wrapper so we can open a writer, write a header once, and stream rows."""

    def __init__(self, table_name: str, columns: list[str]):
        self.f = open(path(table_name), "w", newline="", encoding="utf-8")
        self.writer = csv.DictWriter(self.f, fieldnames=columns)
        self.writer.writeheader()
        self.count = 0

    def write(self, row: dict):
        self.writer.writerow(row)
        self.count += 1

    def close(self):
        self.f.close()


def id_gen(start=1):
    n = start
    while True:
        yield n
        n += 1


def random_date_between(start_year: int, end_year: int) -> date:
    start = date(start_year, 1, 1)
    end = date(end_year, 12, 31)
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def fmt_d(d: date) -> str:
    return d.strftime("%Y-%m-%d")


GENDER_WEIGHTS = [("M", 0.62), ("F", 0.37), ("T", 0.01)]


def random_gender() -> str:
    return random.choices([g for g, _ in GENDER_WEIGHTS], weights=[w for _, w in GENDER_WEIGHTS])[0]


# Today's date — used to make sure no generated record lands in the future
TODAY = date(2026, 6, 28)
TODAY_DT = datetime(2026, 6, 28, 23, 59, 59)


def random_date_in_year(year: int) -> date:
    """A random date within `year`, never exceeding TODAY for the current year."""
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    if year >= TODAY.year:
        end = min(end, TODAY)
    delta = max((end - start).days, 0)
    return start + timedelta(days=random.randint(0, delta))


def clamp_dt(dt: datetime) -> datetime:
    return min(dt, TODAY_DT)


print(f"Writing CSVs to ./{OUTPUT_DIR}/  (NUM_CASES={NUM_CASES:,})")

# ============================================================================
# PHASE 1 — Pure lookup tables (no FKs out)
# ============================================================================

# ---- State -------------------------------------------------------------
state_w = CsvWriterHandle("State", ["StateID", "StateName", "NationalityID", "Active"])
STATE_ID = 1
state_w.write({"StateID": STATE_ID, "StateName": "Karnataka", "NationalityID": 1, "Active": 1})
state_w.close()

# ---- District ------------------------------------------------------------
KARNATAKA_DISTRICTS = [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
    "Bidar", "Chamarajanagar", "Chikballapur", "Chikkamagaluru", "Chitradurga",
    "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
    "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
    "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
    "Vijayapura", "Yadgir", "Vijayanagara",
]

district_w = CsvWriterHandle("District", ["DistrictID", "DistrictName", "StateID", "Active"])
district_ids = []
for i, name in enumerate(KARNATAKA_DISTRICTS, start=1):
    district_w.write({"DistrictID": i, "DistrictName": name, "StateID": STATE_ID, "Active": 1})
    district_ids.append(i)
district_w.close()

# ---- UnitType --------------------------------------------------------------
UNIT_TYPES = [
    # (Name, CityDistState, Hierarchy)
    ("State Headquarters", "State", 1),
    ("District Police Office", "District", 2),
    ("Circle Office", "District", 3),
    ("Police Station", "City", 4),
]
unittype_w = CsvWriterHandle("UnitType", ["UnitTypeID", "UnitTypeName", "CityDistState", "Hierarchy", "Active"])
unit_type_ids = {}
for i, (name, level, hier) in enumerate(UNIT_TYPES, start=1):
    unittype_w.write({"UnitTypeID": i, "UnitTypeName": name, "CityDistState": level, "Hierarchy": hier, "Active": 1})
    unit_type_ids[name] = i
unittype_w.close()

# ---- Rank --------------------------------------------------------------
RANKS = [
    # (Name, Hierarchy) — lower hierarchy number = higher rank
    ("Director General of Police", 1),
    ("Additional Director General of Police", 2),
    ("Inspector General of Police", 3),
    ("Deputy Inspector General of Police", 4),
    ("Superintendent of Police", 5),
    ("Deputy Superintendent of Police", 6),
    ("Inspector", 7),
    ("Sub-Inspector", 8),
    ("Assistant Sub-Inspector", 9),
    ("Head Constable", 10),
    ("Police Constable", 11),
]
rank_w = CsvWriterHandle("Rank", ["RankID", "RankName", "Hierarchy", "Active"])
rank_ids = {}
for i, (name, hier) in enumerate(RANKS, start=1):
    rank_w.write({"RankID": i, "RankName": name, "Hierarchy": hier, "Active": 1})
    rank_ids[name] = i
rank_w.close()

# ---- Designation ------------------------------------------------------
DESIGNATIONS = [
    "Station House Officer", "Investigating Officer", "Beat Officer",
    "Desk Officer", "Crime Branch Officer", "Traffic Officer",
    "Women Helpline Officer", "Cyber Cell Officer", "Reserve Officer",
]
designation_w = CsvWriterHandle("Designation", ["DesignationID", "DesignationName", "Active", "SortOrder"])
designation_ids = []
for i, name in enumerate(DESIGNATIONS, start=1):
    designation_w.write({"DesignationID": i, "DesignationName": name, "Active": 1, "SortOrder": i})
    designation_ids.append(i)
designation_w.close()

# ---- CaseCategory (code maps to the CrimeNo prefix digit per the spec) ----
CASE_CATEGORIES = [
    # (CategoryCodeDigit, LookupValue)
    (1, "FIR"),
    (3, "UDR"),
    (4, "PAR"),
    (8, "Zero FIR"),
]
casecategory_w = CsvWriterHandle("CaseCategory", ["CaseCategoryID", "LookupValue"])
case_category_ids = []  # (id, code_digit, name)
for i, (code, name) in enumerate(CASE_CATEGORIES, start=1):
    casecategory_w.write({"CaseCategoryID": i, "LookupValue": name})
    case_category_ids.append((i, code, name))
casecategory_w.close()

# ---- GravityOffence --------------------------------------------------
GRAVITY_LEVELS = ["Heinous", "Non-Heinous", "Petty"]
gravity_w = CsvWriterHandle("GravityOffence", ["GravityOffenceID", "LookupValue"])
gravity_ids = []
for i, name in enumerate(GRAVITY_LEVELS, start=1):
    gravity_w.write({"GravityOffenceID": i, "LookupValue": name})
    gravity_ids.append(i)
gravity_w.close()

# ---- CrimeHead / CrimeSubHead -----------------------------------------
CRIME_TAXONOMY = {
    "Crimes Against Body": ["Murder", "Attempt to Murder", "Grievous Hurt", "Assault", "Kidnapping"],
    "Crimes Against Property": ["Theft", "Burglary", "Robbery", "Vehicle Theft", "Mischief"],
    "Crimes Against Women": ["Domestic Violence", "Dowry Harassment", "Sexual Assault", "Stalking"],
    "Crimes Against Public Order": ["Rioting", "Unlawful Assembly", "Public Nuisance"],
    "Economic Offences": ["Cheating", "Forgery", "Criminal Breach of Trust", "Cybercrime / Online Fraud"],
}

crimehead_w = CsvWriterHandle("CrimeHead", ["CrimeHeadID", "CrimeGroupName", "Active"])
crimesubhead_w = CsvWriterHandle("CrimeSubHead", ["CrimeSubHeadID", "CrimeHeadID", "CrimeHeadName", "SeqID"])

crime_head_ids = []
crime_subhead_ids = []  # (subhead_id, head_id)
SUBHEAD_NAME_BY_ID = {}  # subhead_id -> sub-head name, used later for BriefFacts templating
head_id_counter = id_gen()
subhead_id_counter = id_gen()

for head_name, subheads in CRIME_TAXONOMY.items():
    hid = next(head_id_counter)
    crimehead_w.write({"CrimeHeadID": hid, "CrimeGroupName": head_name, "Active": 1})
    crime_head_ids.append(hid)
    for seq, sub_name in enumerate(subheads, start=1):
        sid = next(subhead_id_counter)
        crimesubhead_w.write({"CrimeSubHeadID": sid, "CrimeHeadID": hid, "CrimeHeadName": sub_name, "SeqID": seq})
        crime_subhead_ids.append((sid, hid))
        SUBHEAD_NAME_BY_ID[sid] = sub_name

crimehead_w.close()
crimesubhead_w.close()

# ---- Act / Section -----------------------------------------------------
ACTS = {
    "IPC": ("Indian Penal Code", ["302", "307", "323", "324", "354", "376", "379", "392", "406", "420", "498A"]),
    "NDPS": ("Narcotic Drugs and Psychotropic Substances Act", ["8", "20", "21", "22"]),
    "POCSO": ("Protection of Children from Sexual Offences Act", ["4", "6", "8", "10"]),
    "ARMS": ("Arms Act", ["25", "27"]),
    "MV": ("Motor Vehicles Act", ["184", "185", "196"]),
    "IT": ("Information Technology Act", ["66", "66C", "66D", "67"]),
}

act_w = CsvWriterHandle("Act", ["ActCode", "ActDescription", "ShortName", "Active"])
section_w = CsvWriterHandle("Section", ["ActCode", "SectionCode", "SectionDescription", "Active"])

act_codes = []
act_sections = {}  # act_code -> [section_codes]
for code, (desc, sections) in ACTS.items():
    act_w.write({"ActCode": code, "ActDescription": desc, "ShortName": code, "Active": 1})
    act_codes.append(code)
    act_sections[code] = sections
    for s in sections:
        section_w.write({"ActCode": code, "SectionCode": s, "SectionDescription": f"{code} Section {s}", "Active": 1})

act_w.close()
section_w.close()

# ---- CrimeHeadActSection (rough many-to-many mapping) -------------------
crimeheadactsection_w = CsvWriterHandle("CrimeHeadActSection", ["CrimeHeadID", "ActCode", "SectionCode"])
for hid in crime_head_ids:
    # link each crime head to 2-4 random act-sections
    for _ in range(random.randint(2, 4)):
        act_code = random.choice(act_codes)
        section_code = random.choice(act_sections[act_code])
        crimeheadactsection_w.write({"CrimeHeadID": hid, "ActCode": act_code, "SectionCode": section_code})
crimeheadactsection_w.close()

# ---- ReligionMaster -----------------------------------------------------
RELIGIONS = ["Hindu", "Muslim", "Christian", "Sikh", "Jain", "Buddhist", "Other"]
religion_w = CsvWriterHandle("ReligionMaster", ["ReligionID", "ReligionName"])
religion_ids = []
for i, name in enumerate(RELIGIONS, start=1):
    religion_w.write({"ReligionID": i, "ReligionName": name})
    religion_ids.append(i)
religion_w.close()

# ---- CasteMaster (standard government administrative categories) -------
CASTE_CATEGORIES = ["General", "OBC", "SC", "ST", "Other"]
caste_w = CsvWriterHandle("CasteMaster", ["caste_master_id", "caste_master_name"])
caste_ids = []
for i, name in enumerate(CASTE_CATEGORIES, start=1):
    caste_w.write({"caste_master_id": i, "caste_master_name": name})
    caste_ids.append(i)
caste_w.close()

# ---- OccupationMaster ---------------------------------------------------
OCCUPATIONS = [
    "Farmer", "Daily Wage Laborer", "Government Employee", "Private Employee",
    "Business / Self-Employed", "Student", "Homemaker", "Driver", "Unemployed", "Retired",
]
occupation_w = CsvWriterHandle("OccupationMaster", ["OccupationID", "OccupationName"])
occupation_ids = []
for i, name in enumerate(OCCUPATIONS, start=1):
    occupation_w.write({"OccupationID": i, "OccupationName": name})
    occupation_ids.append(i)
occupation_w.close()

# ---- CaseStatusMaster ----------------------------------------------------
CASE_STATUSES = ["Under Investigation", "Charge Sheeted", "Closed", "Convicted", "Acquitted", "Pending Trial"]
casestatus_w = CsvWriterHandle("CaseStatusMaster", ["CaseStatusID", "CaseStatusName"])
case_status_ids = []
for i, name in enumerate(CASE_STATUSES, start=1):
    casestatus_w.write({"CaseStatusID": i, "CaseStatusName": name})
    case_status_ids.append(i)
casestatus_w.close()

print("Phase 1 done: pure lookup tables")

# ============================================================================
# PHASE 2 — Tables that depend on Phase 1 (Unit, Court)
# ============================================================================

unit_w = CsvWriterHandle(
    "Unit",
    ["UnitID", "UnitName", "TypeID", "ParentUnit", "NationalityID", "StateID", "DistrictID", "Active"],
)

unit_id_counter = id_gen()
district_hq_unit_id = {}      # district_id -> unit_id of its District Police Office
police_station_ids_by_district = {}  # district_id -> [unit_ids]
all_police_station_ids = []

for did in district_ids:
    dname = KARNATAKA_DISTRICTS[did - 1]

    # one District Police Office per district
    hq_id = next(unit_id_counter)
    unit_w.write({
        "UnitID": hq_id, "UnitName": f"{dname} District Police Office",
        "TypeID": unit_type_ids["District Police Office"], "ParentUnit": "",
        "NationalityID": 1, "StateID": STATE_ID, "DistrictID": did, "Active": 1,
    })
    district_hq_unit_id[did] = hq_id

    # N police stations under it
    n_stations = random.randint(*UNITS_PER_DISTRICT)
    station_ids = []
    for s in range(1, n_stations + 1):
        sid = next(unit_id_counter)
        unit_w.write({
            "UnitID": sid, "UnitName": f"{dname} Town PS {s}",
            "TypeID": unit_type_ids["Police Station"], "ParentUnit": hq_id,
            "NationalityID": 1, "StateID": STATE_ID, "DistrictID": did, "Active": 1,
        })
        station_ids.append(sid)

    police_station_ids_by_district[did] = station_ids
    all_police_station_ids.extend(station_ids)

unit_w.close()

# ---- Court ---------------------------------------------------------------
court_w = CsvWriterHandle("Court", ["CourtID", "CourtName", "DistrictID", "StateID", "Active"])
court_ids_by_district = {}
court_id_counter = id_gen()
for did in district_ids:
    dname = KARNATAKA_DISTRICTS[did - 1]
    my_courts = []
    for court_name in [f"{dname} District & Sessions Court", f"{dname} JMFC Court"]:
        cid = next(court_id_counter)
        court_w.write({"CourtID": cid, "CourtName": court_name, "DistrictID": did, "StateID": STATE_ID, "Active": 1})
        my_courts.append(cid)
    court_ids_by_district[did] = my_courts
court_w.close()

print(f"Phase 2 done: {len(all_police_station_ids):,} police stations, courts created")

# ============================================================================
# PHASE 3 — Employee (depends on Unit, Rank, Designation, District)
# ============================================================================

employee_w = CsvWriterHandle(
    "Employee",
    ["EmployeeID", "DistrictID", "UnitID", "RankID", "DesignationID", "KGID",
     "FirstName", "EmployeeDOB", "GenderID", "BloodGroupID", "PhysicallyChallenged", "AppointmentDate"],
)

employee_id_counter = id_gen()
employees_by_station = {}   # unit_id -> [employee_ids]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

# rank distribution per station: 1 Inspector/SI, a couple of ASIs/Head Constables, rest Constables
RANK_POOL_WEIGHTS = [
    (rank_ids["Inspector"], 0.04),
    (rank_ids["Sub-Inspector"], 0.08),
    (rank_ids["Assistant Sub-Inspector"], 0.12),
    (rank_ids["Head Constable"], 0.16),
    (rank_ids["Police Constable"], 0.60),
]

for did, stations in police_station_ids_by_district.items():
    for unit_id in stations:
        n_emp = random.randint(*EMPLOYEES_PER_UNIT)
        emp_ids = []
        for _ in range(n_emp):
            eid = next(employee_id_counter)
            rid = random.choices([r for r, _ in RANK_POOL_WEIGHTS], weights=[w for _, w in RANK_POOL_WEIGHTS])[0]
            dob = random_date_between(1968, 2002)
            appointment = random_date_between(max(1990, dob.year + 21), 2024)
            employee_w.write({
                "EmployeeID": eid, "DistrictID": did, "UnitID": unit_id, "RankID": rid,
                "DesignationID": random.choice(designation_ids), "KGID": f"KGID{eid:08d}",
                "FirstName": fake.first_name(), "EmployeeDOB": fmt_d(dob),
                "GenderID": random_gender(), "BloodGroupID": random.choice(BLOOD_GROUPS),
                "PhysicallyChallenged": 0 if random.random() > 0.02 else 1,
                "AppointmentDate": fmt_d(appointment),
            })
            emp_ids.append(eid)
        employees_by_station[unit_id] = emp_ids

employee_w.close()
print(f"Phase 3 done: {next(employee_id_counter) - 1:,} employees created")

# ============================================================================
# PHASE 4 — CaseMaster + all per-case child tables (single streaming pass)
# ============================================================================

casemaster_w = CsvWriterHandle(
    "CaseMaster",
    ["CaseMasterID", "CrimeNo", "CaseNo", "CrimeRegisteredDate", "PolicePersonID", "PoliceStationID",
     "CaseCategoryID", "GravityOffenceID", "CrimeMajorHeadID", "CrimeMinorHeadID", "CaseStatusID", "CourtID",
     "IncidentFromDate", "IncidentToDate", "InfoReceivedPSDate", "latitude", "longitude", "BriefFacts"],
)
complainant_w = CsvWriterHandle(
    "ComplainantDetails",
    ["ComplainantID", "CaseMasterID", "ComplainantName", "AgeYear", "OccupationID", "ReligionID", "CasteID", "GenderID"],
)
actsection_w = CsvWriterHandle(
    "ActSectionAssociation", ["CaseMasterID", "ActID", "SectionID", "ActOrderID", "SectionOrderID"],
)
victim_w = CsvWriterHandle("Victim", ["VictimMasterID", "CaseMasterID", "VictimName", "AgeYear", "GenderID", "VictimPolice"])
accused_w = CsvWriterHandle("Accused", ["AccusedMasterID", "CaseMasterID", "AccusedName", "AgeYear", "GenderID", "PersonID"])
chargesheet_w = CsvWriterHandle("ChargesheetDetails", ["CSID", "CaseMasterID", "csdate", "cstype", "PolicePersonID"])
arrest_w = CsvWriterHandle(
    "ArrestSurrender",
    ["ArrestSurrenderID", "CaseMasterID", "ArrestSurrenderTypeID", "ArrestSurrenderDate",
     "ArrestSurrenderStateId", "ArrestSurrenderDistrictId", "PoliceStationID", "IOID", "CourtID",
     "AccusedMasterID", "IsAccused", "IsComplainantAccused"],
)
# Junction table inferred from the relationship matrix (not separately defined in the
# source document) — links one arrest/surrender event to multiple accused persons.
junction_w = CsvWriterHandle("inv_arrestsurrenderaccused", ["ID", "ArrestSurrenderID", "AccusedMasterID"])

case_id_counter = id_gen()
complainant_id_counter = id_gen()
victim_id_counter = id_gen()
accused_id_counter = id_gen()
chargesheet_id_counter = id_gen()
arrest_id_counter = id_gen()
junction_id_counter = id_gen()

# per (unit_id, category_code, year) running serial, per the CrimeNo spec
serial_counters = {}

# District centroids — used to keep lat/lng tightly within Karnataka
# (same coordinates as crime_map_repository for consistency)
_KARNATAKA_DISTRICT_CENTERS = {
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
# jitter radius in degrees (~28 km) — small enough to stay inside district
_DISTRICT_JITTER = 0.25
# Fallback bbox (only if district lookup fails — should not happen)
LAT_RANGE = (11.6, 18.4)
LON_RANGE = (74.1, 78.6)

def _generate_karnataka_point(district_name: str):
    """Generate a (lat, lng) inside Karnataka, biased to the given district.
    Uses rejection sampling against the true state polygon."""
    center = _KARNATAKA_DISTRICT_CENTERS.get(district_name)
    # try district-biased sampling first (fast: most hits are inside)
    for _ in range(30):
        if center:
            lat = random.gauss(center[0], 0.12)
            lng = random.gauss(center[1], 0.12)
            # clamp jitter to keep within _DISTRICT_JITTER worst case
            # gaussian may overshoot but rejection handles it
            if point_in_karnataka(lng, lat):
                return round(lat, 6), round(lng, 6)
        else:
            lat = random.uniform(*LAT_RANGE)
            lng = random.uniform(*LON_RANGE)
            if point_in_karnataka(lng, lat):
                return round(lat, 6), round(lng, 6)
    # fallback: pure bbox rejection (guaranteed to terminate)
    for _ in range(200):
        lat = random.uniform(*LAT_RANGE)
        lng = random.uniform(*LON_RANGE)
        if point_in_karnataka(lng, lat):
            return round(lat, 6), round(lng, 6)
    # last resort: return district center (always inside)
    if center:
        return round(center[0], 6), round(center[1], 6)
    return round(15.3173, 6), round(75.7139, 6)

BRIEF_TEMPLATES = {
    "Murder": "Complainant reported the death of the victim under suspicious circumstances at the scene.",
    "Attempt to Murder": "Complainant alleges the accused attacked the victim with intent to kill.",
    "Grievous Hurt": "Complainant reported a physical assault resulting in serious injury.",
    "Assault": "Complainant reported being physically assaulted by the accused.",
    "Kidnapping": "Complainant reported that the victim was forcibly taken away by the accused.",
    "Theft": "Complainant reported the theft of personal property from the premises.",
    "Burglary": "Complainant reported that the premises were broken into and valuables removed.",
    "Robbery": "Complainant reported being robbed of belongings by the accused.",
    "Vehicle Theft": "Complainant reported that a vehicle was stolen from the parking area.",
    "Mischief": "Complainant reported intentional damage to property by the accused.",
    "Domestic Violence": "Complainant reported repeated harassment and abuse within the household.",
    "Dowry Harassment": "Complainant reported harassment related to dowry demands.",
    "Sexual Assault": "Complainant reported an act of sexual assault by the accused.",
    "Stalking": "Complainant reported being repeatedly followed and harassed by the accused.",
    "Rioting": "Complainant reported a violent disturbance involving a group at the location.",
    "Unlawful Assembly": "Complainant reported an unauthorized gathering causing disturbance.",
    "Public Nuisance": "Complainant reported a disturbance affecting public order in the area.",
    "Cheating": "Complainant reported being deceived into a financial loss by the accused.",
    "Forgery": "Complainant reported the use of forged documents by the accused.",
    "Criminal Breach of Trust": "Complainant reported misappropriation of entrusted property.",
    "Cybercrime / Online Fraud": "Complainant reported an online fraud resulting in financial loss.",
}

ACCUSED_NAME_PREFIX = "A"  # PersonID like A1, A2 per spec

for _ in range(NUM_CASES):
    case_id = next(case_id_counter)

    # --- pick station / district / employee / court context ---
    district_id = random.choice(district_ids)
    station_id = random.choice(police_station_ids_by_district[district_id])
    officer_id = random.choice(employees_by_station[station_id])
    court_id = random.choice(court_ids_by_district[district_id])

    # --- category, crime head/sub-head, gravity, status ---
    cat_id, cat_code, _ = random.choice(case_category_ids)
    subhead_id, head_id = random.choice(crime_subhead_ids)
    gravity_id = random.choice(gravity_ids)
    status_id = random.choice(case_status_ids)

    # --- dates (causal order: incident -> info received by PS -> FIR registered) ---
    reg_year = random.randint(*CASE_YEAR_RANGE)
    incident_from = datetime.combine(
        random_date_in_year(reg_year), datetime.min.time()
    ) + timedelta(hours=random.randint(0, 23), minutes=random.randint(0, 59))
    incident_to = clamp_dt(incident_from + timedelta(hours=random.randint(0, 48)))
    info_received = clamp_dt(incident_to + timedelta(hours=random.randint(0, 72)))
    crime_registered_date = min(
        info_received.date() + timedelta(days=random.randint(0, 2)), TODAY
    )

    # --- CrimeNo / CaseNo per the documented format ---
    reg_year_actual = crime_registered_date.year
    key = (station_id, cat_code, reg_year_actual)
    serial_counters[key] = serial_counters.get(key, 0) + 1
    serial = serial_counters[key]
    crime_no = f"{cat_code}{district_id:04d}{station_id:04d}{reg_year_actual}{serial:05d}"
    case_no = f"{reg_year_actual}{serial:05d}"

    district_name = KARNATAKA_DISTRICTS[district_id - 1]
    lat, lon = _generate_karnataka_point(district_name)

    brief = BRIEF_TEMPLATES.get(SUBHEAD_NAME_BY_ID.get(subhead_id), "Complainant reported an incident requiring investigation.")

    casemaster_w.write({
        "CaseMasterID": case_id, "CrimeNo": crime_no, "CaseNo": case_no,
        "CrimeRegisteredDate": fmt_d(crime_registered_date),
        "PolicePersonID": officer_id, "PoliceStationID": station_id,
        "CaseCategoryID": cat_id, "GravityOffenceID": gravity_id,
        "CrimeMajorHeadID": head_id, "CrimeMinorHeadID": subhead_id,
        "CaseStatusID": status_id, "CourtID": court_id,
        "IncidentFromDate": fmt_dt(incident_from), "IncidentToDate": fmt_dt(incident_to),
        "InfoReceivedPSDate": fmt_dt(info_received), "latitude": lat, "longitude": lon,
        "BriefFacts": brief,
    })

    # --- ComplainantDetails (usually 1) ---
    for _ in range(random.randint(*COMPLAINANTS_PER_CASE)):
        cid = next(complainant_id_counter)
        complainant_w.write({
            "ComplainantID": cid, "CaseMasterID": case_id,
            "ComplainantName": fake.name(), "AgeYear": random.randint(18, 75),
            "OccupationID": random.choice(occupation_ids), "ReligionID": random.choice(religion_ids),
            "CasteID": random.choice(caste_ids), "GenderID": random_gender(),
        })

    # --- Victim(s) ---
    for _ in range(random.randint(*VICTIMS_PER_CASE)):
        vid = next(victim_id_counter)
        is_police = 1 if random.random() < 0.02 else 0
        victim_w.write({
            "VictimMasterID": vid, "CaseMasterID": case_id,
            "VictimName": fake.name(), "AgeYear": random.randint(1, 85),
            "GenderID": random_gender(), "VictimPolice": is_police,
        })

    # --- Accused (track ids for this case for ArrestSurrender linking) ---
    case_accused_ids = []
    n_accused = random.randint(*ACCUSED_PER_CASE)
    for person_idx in range(1, n_accused + 1):
        aid = next(accused_id_counter)
        accused_w.write({
            "AccusedMasterID": aid, "CaseMasterID": case_id,
            "AccusedName": fake.name(), "AgeYear": random.randint(16, 70),
            "GenderID": random_gender(), "PersonID": f"{ACCUSED_NAME_PREFIX}{person_idx}",
        })
        case_accused_ids.append(aid)

    # --- ActSectionAssociation ---
    for order in range(1, random.randint(*ACT_SECTIONS_PER_CASE) + 1):
        act_code = random.choice(act_codes)
        section_code = random.choice(act_sections[act_code])
        actsection_w.write({
            "CaseMasterID": case_id, "ActID": act_code, "SectionID": section_code,
            "ActOrderID": order, "SectionOrderID": order,
        })

    # --- ChargesheetDetails (only for a fraction of cases, usually older + non-pending) ---
    if random.random() < CHARGESHEET_PROBABILITY:
        csid = next(chargesheet_id_counter)
        cs_date = min(crime_registered_date + timedelta(days=random.randint(30, 180)), TODAY)
        cstype = random.choices(["A", "B", "C"], weights=[0.7, 0.15, 0.15])[0]
        chargesheet_w.write({
            "CSID": csid, "CaseMasterID": case_id,
            "csdate": fmt_dt(datetime(cs_date.year, cs_date.month, cs_date.day)),
            "cstype": cstype, "PolicePersonID": officer_id,
        })

    # --- ArrestSurrender (only for a fraction of cases, linked to one or more accused) ---
    if case_accused_ids and random.random() < ARREST_PROBABILITY:
        n_events = random.randint(1, min(2, len(case_accused_ids)))
        chosen_accused = random.sample(case_accused_ids, n_events)
        for primary_accused in chosen_accused:
            arrest_id = next(arrest_id_counter)
            arrest_date = min(crime_registered_date + timedelta(days=random.randint(0, 60)), TODAY)
            arrest_w.write({
                "ArrestSurrenderID": arrest_id, "CaseMasterID": case_id,
                "ArrestSurrenderTypeID": random.choices([1, 2], weights=[0.75, 0.25])[0],  # 1=Arrest, 2=Surrender
                "ArrestSurrenderDate": fmt_d(arrest_date),
                "ArrestSurrenderStateId": STATE_ID, "ArrestSurrenderDistrictId": district_id,
                "PoliceStationID": station_id, "IOID": officer_id, "CourtID": court_id,
                "AccusedMasterID": primary_accused,
                "IsAccused": 1, "IsComplainantAccused": 1 if random.random() < 0.01 else 0,
            })
            # junction row(s): occasionally an arrest event covers a second accused too
            jid = next(junction_id_counter)
            junction_w.write({"ID": jid, "ArrestSurrenderID": arrest_id, "AccusedMasterID": primary_accused})
            if len(case_accused_ids) > 1 and random.random() < 0.2:
                extra = random.choice([a for a in case_accused_ids if a != primary_accused])
                jid2 = next(junction_id_counter)
                junction_w.write({"ID": jid2, "ArrestSurrenderID": arrest_id, "AccusedMasterID": extra})

    if case_id % 10_000 == 0:
        print(f"  ... {case_id:,} / {NUM_CASES:,} cases generated")

casemaster_w.close()
complainant_w.close()
actsection_w.close()
victim_w.close()
accused_w.close()
chargesheet_w.close()
arrest_w.close()
junction_w.close()

print("Phase 4 done: CaseMaster and all per-case child tables")
print("\nAll done. Row counts:")
for fname in sorted(os.listdir(OUTPUT_DIR)):
    fpath = os.path.join(OUTPUT_DIR, fname)
    with open(fpath, encoding="utf-8") as f:
        n = sum(1 for _ in f) - 1  # minus header
    print(f"  {fname:<32s} {n:>10,} rows")
