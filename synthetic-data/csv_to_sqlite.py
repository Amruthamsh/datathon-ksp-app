"""
Karnataka Police FIR System — CSV to SQLite loader
=========================================================
Loads the CSVs produced by generate_fir_data.py into a single SQLite
database file, with proper types, primary keys, and foreign keys matching
the ER diagram — so you can run real SQL against realistic, FK-consistent
data while testing locally (before pushing to Catalyst).

Usage:
    python3 csv_to_sqlite.py
"""

import csv
import os
import sqlite3

CSV_DIR = "sample_data_csv"
DB_PATH = "fir_system.db"

# ----------------------------------------------------------------------------
# Schema — one CREATE TABLE per table, in FK dependency order
# ----------------------------------------------------------------------------
SCHEMA_SQL = """
CREATE TABLE State (
    StateID INTEGER PRIMARY KEY,
    StateName TEXT,
    NationalityID INTEGER,
    Active INTEGER
);

CREATE TABLE District (
    DistrictID INTEGER PRIMARY KEY,
    DistrictName TEXT,
    StateID INTEGER REFERENCES State(StateID),
    Active INTEGER
);

CREATE TABLE UnitType (
    UnitTypeID INTEGER PRIMARY KEY,
    UnitTypeName TEXT,
    CityDistState TEXT,
    Hierarchy INTEGER,
    Active INTEGER
);

CREATE TABLE Rank (
    RankID INTEGER PRIMARY KEY,
    RankName TEXT,
    Hierarchy INTEGER,
    Active INTEGER
);

CREATE TABLE Designation (
    DesignationID INTEGER PRIMARY KEY,
    DesignationName TEXT,
    Active INTEGER,
    SortOrder INTEGER
);

CREATE TABLE CaseCategory (
    CaseCategoryID INTEGER PRIMARY KEY,
    LookupValue TEXT
);

CREATE TABLE GravityOffence (
    GravityOffenceID INTEGER PRIMARY KEY,
    LookupValue TEXT
);

CREATE TABLE CrimeHead (
    CrimeHeadID INTEGER PRIMARY KEY,
    CrimeGroupName TEXT,
    Active INTEGER
);

CREATE TABLE CrimeSubHead (
    CrimeSubHeadID INTEGER PRIMARY KEY,
    CrimeHeadID INTEGER REFERENCES CrimeHead(CrimeHeadID),
    CrimeHeadName TEXT,
    SeqID INTEGER
);

CREATE TABLE Act (
    ActCode TEXT PRIMARY KEY,
    ActDescription TEXT,
    ShortName TEXT,
    Active INTEGER
);

CREATE TABLE Section (
    ActCode TEXT REFERENCES Act(ActCode),
    SectionCode TEXT,
    SectionDescription TEXT,
    Active INTEGER
);

CREATE TABLE CrimeHeadActSection (
    CrimeHeadID INTEGER REFERENCES CrimeHead(CrimeHeadID),
    ActCode TEXT REFERENCES Act(ActCode),
    SectionCode TEXT
);

CREATE TABLE ReligionMaster (
    ReligionID INTEGER PRIMARY KEY,
    ReligionName TEXT
);

CREATE TABLE CasteMaster (
    caste_master_id INTEGER PRIMARY KEY,
    caste_master_name TEXT
);

CREATE TABLE OccupationMaster (
    OccupationID INTEGER PRIMARY KEY,
    OccupationName TEXT
);

CREATE TABLE CaseStatusMaster (
    CaseStatusID INTEGER PRIMARY KEY,
    CaseStatusName TEXT
);

CREATE TABLE Unit (
    UnitID INTEGER PRIMARY KEY,
    UnitName TEXT,
    TypeID INTEGER REFERENCES UnitType(UnitTypeID),
    ParentUnit INTEGER REFERENCES Unit(UnitID),
    NationalityID INTEGER,
    StateID INTEGER REFERENCES State(StateID),
    DistrictID INTEGER REFERENCES District(DistrictID),
    Active INTEGER
);

CREATE TABLE Court (
    CourtID INTEGER PRIMARY KEY,
    CourtName TEXT,
    DistrictID INTEGER REFERENCES District(DistrictID),
    StateID INTEGER REFERENCES State(StateID),
    Active INTEGER
);

CREATE TABLE Employee (
    EmployeeID INTEGER PRIMARY KEY,
    DistrictID INTEGER REFERENCES District(DistrictID),
    UnitID INTEGER REFERENCES Unit(UnitID),
    RankID INTEGER REFERENCES Rank(RankID),
    DesignationID INTEGER REFERENCES Designation(DesignationID),
    KGID TEXT,
    FirstName TEXT,
    EmployeeDOB TEXT,
    GenderID TEXT,
    BloodGroupID TEXT,
    PhysicallyChallenged INTEGER,
    AppointmentDate TEXT
);

CREATE TABLE CaseMaster (
    CaseMasterID INTEGER PRIMARY KEY,
    CrimeNo TEXT,
    CaseNo TEXT,
    CrimeRegisteredDate TEXT,
    PolicePersonID INTEGER REFERENCES Employee(EmployeeID),
    PoliceStationID INTEGER REFERENCES Unit(UnitID),
    CaseCategoryID INTEGER REFERENCES CaseCategory(CaseCategoryID),
    GravityOffenceID INTEGER REFERENCES GravityOffence(GravityOffenceID),
    CrimeMajorHeadID INTEGER REFERENCES CrimeHead(CrimeHeadID),
    CrimeMinorHeadID INTEGER REFERENCES CrimeSubHead(CrimeSubHeadID),
    CaseStatusID INTEGER REFERENCES CaseStatusMaster(CaseStatusID),
    CourtID INTEGER REFERENCES Court(CourtID),
    IncidentFromDate TEXT,
    IncidentToDate TEXT,
    InfoReceivedPSDate TEXT,
    latitude REAL,
    longitude REAL,
    BriefFacts TEXT
);

CREATE TABLE ComplainantDetails (
    ComplainantID INTEGER PRIMARY KEY,
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    ComplainantName TEXT,
    AgeYear INTEGER,
    OccupationID INTEGER REFERENCES OccupationMaster(OccupationID),
    ReligionID INTEGER REFERENCES ReligionMaster(ReligionID),
    CasteID INTEGER REFERENCES CasteMaster(caste_master_id),
    GenderID TEXT
);

CREATE TABLE ActSectionAssociation (
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    ActID TEXT REFERENCES Act(ActCode),
    SectionID TEXT,
    ActOrderID INTEGER,
    SectionOrderID INTEGER
);

CREATE TABLE Victim (
    VictimMasterID INTEGER PRIMARY KEY,
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    VictimName TEXT,
    AgeYear INTEGER,
    GenderID TEXT,
    VictimPolice INTEGER
);

CREATE TABLE Accused (
    AccusedMasterID INTEGER PRIMARY KEY,
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    AccusedName TEXT,
    AgeYear INTEGER,
    GenderID TEXT,
    PersonID TEXT
);

CREATE TABLE ChargesheetDetails (
    CSID INTEGER PRIMARY KEY,
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    csdate TEXT,
    cstype TEXT,
    PolicePersonID INTEGER REFERENCES Employee(EmployeeID)
);

CREATE TABLE ArrestSurrender (
    ArrestSurrenderID INTEGER PRIMARY KEY,
    CaseMasterID INTEGER REFERENCES CaseMaster(CaseMasterID),
    ArrestSurrenderTypeID INTEGER,
    ArrestSurrenderDate TEXT,
    ArrestSurrenderStateId INTEGER REFERENCES State(StateID),
    ArrestSurrenderDistrictId INTEGER REFERENCES District(DistrictID),
    PoliceStationID INTEGER REFERENCES Unit(UnitID),
    IOID INTEGER REFERENCES Employee(EmployeeID),
    CourtID INTEGER REFERENCES Court(CourtID),
    AccusedMasterID INTEGER REFERENCES Accused(AccusedMasterID),
    IsAccused INTEGER,
    IsComplainantAccused INTEGER
);

CREATE TABLE inv_arrestsurrenderaccused (
    ID INTEGER PRIMARY KEY,
    ArrestSurrenderID INTEGER REFERENCES ArrestSurrender(ArrestSurrenderID),
    AccusedMasterID INTEGER REFERENCES Accused(AccusedMasterID)
);
"""

# Indexes on FK columns — SQLite only auto-indexes the PK side of a
# relationship, so joins/filters on the FK side need these for any
# realistic query-testing workload.
INDEX_SQL = """
CREATE INDEX idx_district_state ON District(StateID);
CREATE INDEX idx_unit_district ON Unit(DistrictID);
CREATE INDEX idx_unit_parent ON Unit(ParentUnit);
CREATE INDEX idx_court_district ON Court(DistrictID);
CREATE INDEX idx_employee_unit ON Employee(UnitID);
CREATE INDEX idx_employee_rank ON Employee(RankID);
CREATE INDEX idx_crimesubhead_head ON CrimeSubHead(CrimeHeadID);
CREATE INDEX idx_section_act ON Section(ActCode);
CREATE INDEX idx_casemaster_station ON CaseMaster(PoliceStationID);
CREATE INDEX idx_casemaster_officer ON CaseMaster(PolicePersonID);
CREATE INDEX idx_casemaster_category ON CaseMaster(CaseCategoryID);
CREATE INDEX idx_casemaster_status ON CaseMaster(CaseStatusID);
CREATE INDEX idx_casemaster_subhead ON CaseMaster(CrimeMinorHeadID);
CREATE INDEX idx_casemaster_court ON CaseMaster(CourtID);
CREATE INDEX idx_casemaster_regdate ON CaseMaster(CrimeRegisteredDate);
CREATE INDEX idx_complainant_case ON ComplainantDetails(CaseMasterID);
CREATE INDEX idx_actsection_case ON ActSectionAssociation(CaseMasterID);
CREATE INDEX idx_victim_case ON Victim(CaseMasterID);
CREATE INDEX idx_accused_case ON Accused(CaseMasterID);
CREATE INDEX idx_chargesheet_case ON ChargesheetDetails(CaseMasterID);
CREATE INDEX idx_arrest_case ON ArrestSurrender(CaseMasterID);
CREATE INDEX idx_arrest_accused ON ArrestSurrender(AccusedMasterID);
CREATE INDEX idx_junction_arrest ON inv_arrestsurrenderaccused(ArrestSurrenderID);
CREATE INDEX idx_junction_accused ON inv_arrestsurrenderaccused(AccusedMasterID);
"""

# Load order — parents before children, matching generate_fir_data.py
LOAD_ORDER = [
    "State", "District", "UnitType", "Rank", "Designation", "CaseCategory",
    "GravityOffence", "CrimeHead", "CrimeSubHead", "Act", "Section",
    "CrimeHeadActSection", "ReligionMaster", "CasteMaster", "OccupationMaster",
    "CaseStatusMaster", "Unit", "Court", "Employee", "CaseMaster",
    "ComplainantDetails", "ActSectionAssociation", "Victim", "Accused",
    "ChargesheetDetails", "ArrestSurrender", "inv_arrestsurrenderaccused",
]


def load_csv_into_table(conn: sqlite3.Connection, table: str, csv_path: str, chunk_size: int = 50_000) -> int:
    cur = conn.cursor()
    col_info = cur.execute(f"PRAGMA table_info('{table}')").fetchall()
    numeric_cols = {row[1] for row in col_info if row[2].upper() in ("INTEGER", "REAL")}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        insert_sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})"

        total = 0
        batch = []
        for row in reader:
            # CSV stores blank for NULL — sqlite3 would otherwise insert the
            # literal empty string into a numeric FK column (e.g. Unit.ParentUnit
            # for HQ-level units with no parent), which breaks FK enforcement.
            vals = [None if (row[c] == "" and c in numeric_cols) else row[c] for c in cols]
            batch.append(vals)
            if len(batch) >= chunk_size:
                cur.executemany(insert_sql, batch)
                total += len(batch)
                batch = []
        if batch:
            cur.executemany(insert_sql, batch)
            total += len(batch)

    conn.commit()
    return total


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    # FK enforcement is OFF during the bulk load (faster, avoids ordering
    # edge cases) and verified explicitly afterward with foreign_key_check.
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(SCHEMA_SQL)

    print(f"Loading CSVs from ./{CSV_DIR}/ into {DB_PATH} ...")
    for table in LOAD_ORDER:
        csv_path = os.path.join(CSV_DIR, f"{table}.csv")
        if not os.path.exists(csv_path):
            print(f"  (skipped {table} — no CSV found at {csv_path})")
            continue
        n = load_csv_into_table(conn, table, csv_path)
        print(f"  {table:<28s} {n:>10,} rows loaded")

    print("\nCreating indexes ...")
    conn.executescript(INDEX_SQL)
    conn.commit()

    print("\nVerifying referential integrity ...")
    conn.execute("PRAGMA foreign_keys = ON")
    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        print(f"  FOUND {len(violations)} FOREIGN KEY VIOLATIONS:")
        for v in violations[:20]:
            print("   ", v)
        if len(violations) > 20:
            print(f"    ... and {len(violations) - 20} more")
    else:
        print("  No foreign key violations — database is fully consistent.")

    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"\nDone. {DB_PATH} is {db_size_mb:.1f} MB.")
    conn.close()


if __name__ == "__main__":
    main()