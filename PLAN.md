# Crime Intelligence Map — Full Redesign Plan

## Context

The Crime Intelligence Map page currently has three view modes (Heatmap, Clusters, Administrative) that all show essentially the same data — crime density — in different visual styles. This redesign gives each view a distinct operational question, transforms the right panel from generic placeholder into contextual intelligence, and adds a proper Patrol Planner modal.

**Data facts driving the plan:**
- 50,000 cases spanning 2022-01-02 to 2026-06-28
- 5 crime heads: Body, Property, Economic, Women, Public Order
- 31 active districts, ~100K accused names
- IncidentFromDate is populated for all records (enables time-of-day analysis)

---

## Architecture After Redesign

```
Crime Intelligence Map
├── Heatmap      → "Where is crime increasing?" (trend comparison)
├── Clusters     → "Where are crimes concentrated?" (enriched intel)
├── Administrative → "Which district needs intervention?" (risk scoring)
└── Network Overlay → "Which criminal groups operate here?" (enhanced)
```

Right Panel becomes contextual:
- Nothing selected → Operational Summary (highest-priority district)
- Hotspot clicked → Hotspot Intelligence (trend, breakdown, suggest patrol)
- District clicked → District Intelligence (risk score, ranking, metrics)
- Network clicked → Network Intelligence (members, FIRs, linked stations)

Patrol Planner becomes a modal with time/unit/focus inputs and route output.

---

## Files to Modify

### 1. `functions/datathon-ksp-app/db/sqlite/crime_map_repository.py`

#### 1a. New method: `get_heatmap_trends()`

Replaces `get_heatmap()` for the Heatmap view. Instead of raw crime counts, computes **change percentage** between two periods.

**Logic:**
- Current period: last 30 days from max(CrimeRegisteredDate)
- Previous period: 30 days before that
- Group by `ROUND(lat, 2), ROUND(lng, 2)` (same grid as current heatmap)
- For each grid cell return: `lat, lng, current_count, previous_count, change_pct`
- `change_pct = ((current - previous) / max(previous, 1)) * 100`
- Filter to cells with `current_count >= 2` (noise reduction)
- Return sorted by `abs(change_pct)` descending, limit 500

**Response shape:**
```json
[
  {
    "lat": 15.32,
    "lng": 75.71,
    "current_count": 12,
    "previous_count": 5,
    "change_pct": 140.0
  }
]
```

#### 1b. New method: `get_district_risk_summary()`

Replaces `get_district_summary()`. Computes an **Operational Risk Score** per district using weighted rules.

**Scoring formula:**
```
risk_score = (
    crime_volume_score * 0.40 +
    repeat_offender_score * 0.30 +
    pending_investigations_score * 0.20 +
    emerging_trend_score * 0.10
)
```

Each component is normalized 0–100 before weighting:
- `crime_volume_score`: district crime count in current 30d, scaled 0–100 relative to max district
- `repeat_offender_score`: count of accused with >1 FIR in district, scaled 0–100
- `pending_investigations_score`: count of cases without chargesheet in district, scaled 0–100
- `emerging_trend_score`: percentage change vs previous 30d, clamped 0–100

**Additional fields per district:**
- `risk_level`: "CRITICAL" (≥75), "HIGH" (≥50), "MEDIUM" (≥25), "LOW" (<25)
- `crime_count`, `repeat_offenders`, `pending_investigations`, `change_pct`
- `top_crime`: most common crime head name
- `bounds`: min/max lat/lng (existing logic, using actual min/max from data, not AVG)

**Response shape:**
```json
[
  {
    "district": "Bagalkot",
    "risk_score": 91,
    "risk_level": "CRITICAL",
    "crime_count": 132,
    "repeat_offenders": 28,
    "pending_investigations": 42,
    "change_pct": 18.5,
    "top_crime": "Crimes Against Property",
    "bounds": { "min_lat": ..., "max_lat": ..., "min_lng": ..., "max_lng": ... }
  }
]
```

Sorted by `risk_score` descending (rank 1 = highest risk).

#### 1c. New method: `get_cluster_intel(lat, lng)`

Enhanced replacement for `get_hotspot_detail()`. Returns richer cluster intelligence.

**Logic (within ±0.05° of lat/lng):**
- Total incidents
- Top 5 crimes
- Nearby stations
- Repeat offenders count (distinct AccusedName with >1 FIR in this area)
- Linked investigations count (cases with chargesheet in this area)
- Active criminal networks count (co-accused pairs with ≥2 shared cases)
- Peak time bucket (Morning/Afternoon/Evening/Night based on IncidentFromDate hour distribution)

**Response shape:**
```json
{
  "crime_count": 30,
  "dominant_crime": "Burglary",
  "repeat_offenders": 8,
  "linked_investigations": 4,
  "active_networks": 2,
  "peak_time": "9 PM – 2 AM",
  "top_crimes": [...],
  "stations": [...],
  "risk_factors": [
    "+8 Repeat offenders",
    "+4 Linked investigations",
    "+2 Active criminal networks",
    "+12 Crime increase vs previous period",
    "+11 Night-time offences"
  ]
}
```

#### 1d. Modify existing: `get_clusters()`

Enrich cluster data with `dominant_crime` count (not just name), and return `center` as `[lat, lng]` (currently `[lat, lng]` — check if frontend expects `[lng, lat]`). No schema change, just add fields.

#### 1e. Modify existing: `get_network_overlay()`

Group co-accused pairs into **network clusters** using union-find (connected components). For each network:
- `network_name`: derived from most-connected member
- `member_count`: distinct accused names
- `total_firs`: total cases
- `districts`: list of distinct district names
- `risk`: "HIGH" (≥5 members), "MEDIUM" (≥3), "LOW"
- `lat`, `lng`: centroid of all cases in this network
- `members`: list of top 5 member names with their FIR counts

**Response shape:**
```json
[
  {
    "network_name": "Network A",
    "member_count": 18,
    "total_firs": 46,
    "districts": ["Bagalkot", "Hubli"],
    "risk": "HIGH",
    "lat": 15.85,
    "lng": 75.52,
    "members": [{"name": "Ravi Kumar", "firs": 8}, ...]
  }
]
```

#### 1f. New method: `get_patrol_plan(time_range, units, crime_focus, area)`

Replaces generic `get_patrol_recommendations()` with parameterized planning.

**Parameters:**
- `time_range`: "morning" | "afternoon" | "evening" | "night"
- `units`: int (number of patrol units available)
- `crime_focus`: crime head ID or null (all)
- `area`: district name or null (all)

**Logic:**
- Filter stations by area and crime_focus
- Score each station: `crime_density * 10 + repeat_offenders * 15 + gravity_cases * 20`
- Take top N stations where N = units
- For each station, generate a route reason based on its dominant factor
- Return `routes[]` with `station, district, officer_label (Route 1, Route 2...), reason, priority_score`

#### 1g. Modify existing: `get_summary()`

Add `highest_priority_district` field (name + risk score + reason) for the default right panel state.

---

### 2. `functions/datathon-ksp-app/routes/crime_map.py`

Add new endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /crime-map/heatmap-trends` | `get_heatmap_trends` | Trend comparison heatmap |
| `GET /crime-map/district-risk` | `get_district_risk` | Risk-scored district data |
| `GET /crime-map/cluster-intel` | `get_cluster_intel(lat, lng)` | Enhanced cluster detail |
| `GET /crime-map/patrol-plan` | `get_patrol_plan(time_range, units, crime_focus, area)` | Parameterized patrol |
| `GET /crime-map/network-overlay-enhanced` | `get_network_overlay_enhanced` | Network clustering |

Keep existing endpoints (`/heatmap`, `/clusters`, `/district-summary`, etc.) for backward compatibility — they won't break anything.

---

### 3. `datathon-ksp-client/src/api/crimeMap.js`

Add new API functions:

```js
getHeatmapTrends(token)
getDistrictRisk(token)
getClusterIntel(token, lat, lng)
getPatrolPlan(token, { time_range, units, crime_focus, area })
getNetworkOverlayEnhanced(token)
```

---

### 4. `datathon-ksp-client/src/pages/CrimeIntelligenceMap.jsx`

This is the largest change. Full rewrite of the component structure.

#### 4a. State additions

```js
const [viewMode, setViewMode] = useState("Heatmap");
const [heatmapTrends, setHeatmapTrends] = useState([]);
const [clusterData, setClusterData] = useState([]);
const [districtRisk, setDistrictRisk] = useState([]);
const [networkOverlay, setNetworkOverlay] = useState([]);
const [selectedSpot, setSelectedSpot] = useState(null);
const [hotspotDetail, setHotspotDetail] = useState(null);
const [showPatrolModal, setShowPatrolModal] = useState(false);
const [patrolParams, setPatrolParams] = useState({ time_range: "night", units: 6, crime_focus: null, area: null });
const [patrolData, setPatrolData] = useState([]);
const [showNetworks, setShowNetworks] = useState(false);
```

#### 4b. Data fetching

On mount: fetch summary, heatmap trends, clusters, district risk, network overlay (all in parallel).

When viewMode changes to "Heatmap": fetch heatmap trends (if not already loaded).
When viewMode changes to "Administrative": fetch district risk (if not already loaded).
When clicking a cluster: fetch cluster intel for that lat/lng.

#### 4c. Map Layers (MapView component)

**Heatmap mode:**
- Use `HeatmapLayer` with `weight = abs(change_pct)` (absolute change magnitude)
- Color gradient: red (increasing) to green (decreasing) using `ColorRange`
- OR: use two ScatterplotLayers — red circles for increasing areas, green for decreasing, sized by `abs(change_pct)`

Actually, deck.gl HeatmapLayer doesn't support per-point colors natively. Better approach:
- Use `ScatterplotLayer` with color encoding direction:
  - `change_pct > 20` → red `[239, 68, 68, 180]` (increasing)
  - `change_pct 5–20` → amber `[245, 158, 11, 150]` (stable/slight increase)
  - `change_pct < -5` → green `[34, 197, 94, 150]` (decreasing)
  - `change_pct -5 to 5` → grey `[148, 163, 184, 100]` (stable)
- `getRadius`: `Math.min(abs(change_pct) * 100, 3000)`
- Pickable: clicking shows trend details in right panel

**Administrative mode:**
- Keep existing `GeoJsonLayer` but color by `risk_score` instead of `change`:
  - CRITICAL (≥75): `[220, 38, 38, 60]` (red)
  - HIGH (≥50): `[245, 158, 11, 50]` (amber)
  - MEDIUM (≥25): `[59, 130, 246, 40]` (blue)
  - LOW (<25): `[34, 197, 94, 30]` (green)
- `getLineColor`: white border for clarity
- onClick → sets selectedSpot with full risk data

**Clusters mode:**
- Keep existing `ScatterplotLayer`
- Enrich click handler to call `getClusterIntel()` for detailed intel
- Show dominant crime label on hover (using tooltip or deck.gl picking)

**Network Overlay:**
- Keep existing ScatterplotLayer for network nodes
- Add `LineLayer` connecting co-accused members (draw edges between network centroids and member locations)
- Color: purple `[168, 85, 247, 160]`

#### 4d. Right Panel — Contextual

**Default state (nothing selected):**
```
Operational Summary
├── Today's Highest Priority
│   ├── District: Bagalkot
│   ├── Risk Score: 91 CRITICAL
│   └── Why: Crime +18%, 2 emerging hotspots
├── Quick Stats
│   ├── Emerging Hotspots: X
│   ├── Repeat Offender Zones: Y
│   └── Total Crimes (30d): Z
└── Suggested Actions
    ├── Switch to Clusters to see concentration
    ├── Enable Network Overlay for criminal groups
    └── Generate Patrol Plan for deployment
```

**Hotspot/Cluster selected:**
```
Hotspot Intelligence
├── Crime Trend: ↑18% vs previous period
├── Most Common Crime: Burglary (12 incidents)
├── Repeat Offenders: 8
├── Linked Investigations: 4
├── Active Networks: 2
├── Peak: 9 PM – 2 AM
├── Risk Factors
│   ├── +8 Repeat offenders
│   ├── +4 Linked investigations
│   ├── +2 Active criminal networks
│   └── +11 Night-time offences
├── Nearby Stations: [Badami, Bagalkot PS...]
└── [Deep Dive Analysis] [Generate Patrol]
```

**District selected:**
```
District Intelligence — Bagalkot
├── Risk Score: 91 CRITICAL
├── District Rank: #1 of 31
├── Crime Count: 132
├── Repeat Offenders: 28
├── Pending Investigations: 42
├── Emerging Trend: +18.5%
├── Top Crime: Crimes Against Property
├── Risk Breakdown
│   ├── Crime Volume:    ████████░░ 82/100
│   ├── Repeat Offenders: ██████████ 95/100
│   ├── Pending Cases:   ███████░░░ 70/100
│   └── Emerging Trend:  █████░░░░░ 50/100
└── [Generate Patrol Plan for Bagalkot]
```

**Network selected:**
```
Network Intelligence — Gang Alpha
├── Members: 18
├── Total FIRs: 46
├── Risk: HIGH
├── Districts: Bagalkot, Hubli
├── Top Members
│   ├── Ravi Kumar — 8 FIRs
│   ├── Suresh Patil — 6 FIRs
│   └── +16 more
├── Recent Activity: ...
└── [Open in Criminal Networks →]
```

#### 4e. Patrol Planner Modal

Replace the slide-in panel with a proper centered modal:

```
┌──────────────────────────────────────────┐
│  Patrol Planner                    [X]   │
├──────────────────────────────────────────┤
│                                          │
│  Time of Day                             │
│  [Morning] [Afternoon] [Evening] [Night] │
│                                          │
│  Units Available                         │
│  [-] 6 [+]                               │
│                                          │
│  Crime Focus                             │
│  [All Crimes ▼]                          │
│  Options: All, Body, Property, Economic, │
│           Women, Public Order            │
│                                          │
│  Area                                    │
│  [All Districts ▼]                       │
│  Options: All + 31 districts             │
│                                          │
│  [Generate Patrol Plan]                  │
├──────────────────────────────────────────┤
│  Route 1 — Officer A                     │
│  Station: Badami PS                      │
│  Priority: 285                           │
│  Reason: Repeat offender activity        │
│  ─────────────────────────────────────── │
│  Route 2 — Officer B                     │
│  ...                                     │
└──────────────────────────────────────────┘
```

#### 4f. Metric Cards (top bar)

Update to reflect new data:
1. **Today's Risk** → from summary (existing)
2. **Emerging Hotspots** → count from heatmap trends where `change_pct > 20`
3. **Repeat Offender Zones** → from summary (existing)
4. **Total Crimes (30d)** → from summary (existing)
5. **Highest Risk District** → name + risk score from district risk data

#### 4g. Map Layer Panel (left overlay)

Keep the existing layer switcher but update labels:

```
Map Layers
├── ◉ Trend Heatmap     (was "Heatmap View")
├── ◯ Cluster View      (unchanged)
├── ◯ District Risk     (was "Administrative View")
└── ☐ Network Overlay   (enhanced)
```

---

## Build Order

### Phase 1: Backend (crime_map_repository.py)
1. Add `get_heatmap_trends()` method
2. Add `get_district_risk_summary()` method
3. Add `get_cluster_intel(lat, lng)` method
4. Enhance `get_network_overlay()` with union-find grouping
5. Add `get_patrol_plan()` method
6. Update `get_summary()` to include highest-priority district

### Phase 2: Routes (crime_map.py)
7. Add new route handlers for the new repository methods
8. Add query parameter support for patrol plan

### Phase 3: API Client (crimeMap.js)
9. Add new fetch functions

### Phase 4: Frontend (CrimeIntelligenceMap.jsx)
10. Update state and data fetching
11. Rewrite MapView layers for trend heatmap
12. Rewrite Administrative view with risk coloring
13. Enrich Cluster click handler
14. Build contextual RightPanel with four states
15. Build Patrol Planner modal
16. Update metric cards
17. Update layer switcher labels

---

## Verification

1. **Backend**: Run `python main.py` from `functions/datathon-ksp-app/` and hit new endpoints with curl to verify response shapes
2. **Frontend**: Run `npm run dev` from `datathon-ksp-client/` and visually verify:
   - Heatmap shows colored circles (red=increasing, green=decreasing) not a density blob
   - Administrative shows districts colored by risk level (not just change%)
   - Clicking a district shows risk score breakdown in right panel
   - Clicking a cluster shows enriched intel (repeat offenders, networks, etc.)
   - Right panel default shows "Operational Summary" with highest-priority district
   - Patrol Planner opens as modal with time/focus/area inputs
   - Network Overlay shows connected nodes with member details
3. **Lint**: Run `npm run lint` from `datathon-ksp-client/`
4. **Build**: Run `npm run build` from `datathon-ksp-client/`
