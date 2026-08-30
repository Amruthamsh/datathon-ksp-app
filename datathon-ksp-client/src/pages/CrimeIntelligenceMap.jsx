import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DeckGL from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import { ScatterplotLayer, GeoJsonLayer, LineLayer } from "@deck.gl/layers";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AlertTriangle,
  X,
  Loader2,
  Users,
  Route,
  Target,
  TrendingUp,
  Shield,
  Clock,
  Zap,
  Download,
  FileText,
  Sparkles,
  MapPin,
  Building2,
  Beer,
  Landmark,
  Bus,
  CloudRain,
  Database,
  RefreshCw,
} from "lucide-react";
import PropTypes from "prop-types";
import { useAuth } from "../auth/AuthContext";
import * as crimeMapApi from "../api/crimeMap";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

function formatNumber(num) {
  if (num === null || num === undefined) return "—";
  return num.toLocaleString();
}

function formatMonthLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

const getCrimeHeads = (t) => [
  { id: null, label: t("crimeMap.patrol.allCrimes") },
  { id: 1, label: t("crimeMap.patrol.crimesAgainstBody") },
  { id: 2, label: t("crimeMap.patrol.crimesAgainstProperty") },
  { id: 3, label: t("crimeMap.patrol.crimesAgainstWomen") },
  { id: 4, label: t("crimeMap.patrol.crimesAgainstPublicOrder") },
  { id: 5, label: t("crimeMap.patrol.economicOffences") },
];

const getTimeOptions = (t) => [
  {
    value: "morning",
    label: t("crimeMap.patrol.morning"),
    sub: "6 AM – 12 PM",
  },
  {
    value: "afternoon",
    label: t("crimeMap.patrol.afternoon"),
    sub: "12 PM – 5 PM",
  },
  { value: "evening", label: t("crimeMap.patrol.evening"), sub: "5 PM – 9 PM" },
  { value: "night", label: t("crimeMap.patrol.night"), sub: "9 PM – 2 AM" },
];

const SUBHEAD_TO_HEAD_ID = {
  Murder: 1,
  "Attempt to Murder": 1,
  "Grievous Hurt": 1,
  Assault: 1,
  Kidnapping: 1,
  Theft: 2,
  Burglary: 2,
  Robbery: 2,
  "Vehicle Theft": 2,
  Mischief: 2,
  "Domestic Violence": 3,
  "Dowry Harassment": 3,
  "Sexual Assault": 3,
  Stalking: 3,
  Rioting: 4,
  "Unlawful Assembly": 4,
  "Public Nuisance": 4,
  Cheating: 5,
  Forgery: 5,
  "Criminal Breach of Trust": 5,
  "Cybercrime / Online Fraud": 5,
  "Crimes Against Body": 1,
  "Crimes Against Property": 2,
  "Crimes Against Women": 3,
  "Crimes Against Public Order": 4,
  "Economic Offences": 5,
};

function getHeadIdForSubType(subType) {
  if (!subType) return null;
  if (SUBHEAD_TO_HEAD_ID[subType] != null) return SUBHEAD_TO_HEAD_ID[subType];
  const s = subType.toLowerCase();
  if (
    s.includes("body") ||
    s.includes("murder") ||
    s.includes("hurt") ||
    s.includes("assault") ||
    s.includes("kidnap")
  )
    return 1;
  if (
    s.includes("property") ||
    s.includes("theft") ||
    s.includes("burglary") ||
    s.includes("robbery") ||
    s.includes("mischief") ||
    s.includes("vehicle")
  )
    return 2;
  if (
    s.includes("women") ||
    s.includes("domestic") ||
    s.includes("dowry") ||
    s.includes("sexual") ||
    s.includes("stalking")
  )
    return 3;
  if (
    s.includes("public order") ||
    s.includes("rioting") ||
    s.includes("assembly") ||
    s.includes("nuisance")
  )
    return 4;
  if (
    s.includes("economic") ||
    s.includes("cheating") ||
    s.includes("forgery") ||
    s.includes("breach") ||
    s.includes("cyber")
  )
    return 5;
  return null;
}

function peakToTimeRange(peak) {
  if (!peak) return "night";
  const p = peak.toLowerCase();
  if (p.includes("6 am")) return "morning";
  if (p.includes("12 pm")) return "afternoon";
  if (p.includes("5 pm")) return "evening";
  return "night";
}

export default function CrimeIntelligenceMap() {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [summary, setSummary] = useState(null);
  const [, setLoading] = useState({
    summary: true,
    mapData: false,
    patrol: false,
  });
  const [viewMode, setViewMode] = useState("Heatmap");
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [hotspotDetail, setHotspotDetail] = useState(null);
  const [showNetworks, setShowNetworks] = useState(false);
  const [showPatrolModal, setShowPatrolModal] = useState(false);
  const [patrolContext, setPatrolContext] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [crimesData, setCrimesData] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [selectedHeads, setSelectedHeads] = useState(null);

  const [viewState, setViewState] = useState({
    longitude: 75.7139,
    latitude: 15.3173,
    zoom: 7.5,
    pitch: 0,
    bearing: 0,
  });
  // Intelligence overlays
  const [poiFilters, setPoiFilters] = useState({
    ATM: true,
    Bank: false,
    Liquor_Store: true,
    Bus_Stop: false,
    Railway_Station: false,
  });
  const [showSocioOverlay, setShowSocioOverlay] = useState(false);
  const [enhancedRisk, setEnhancedRisk] = useState([]);
  const [intelligenceStatus, setIntelligenceStatus] = useState(null);
  const [refreshingIntel, setRefreshingIntel] = useState(false);

  const activeSubType = useMemo(() => {
    if (selectedHeads && selectedHeads.size === 1) {
      return Array.from(selectedHeads)[0];
    }
    return undefined;
  }, [selectedHeads]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const params = {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          crime_sub_head_name: activeSubType,
        };
        const sRes = await crimeMapApi.getSummary(token, params);
        setSummary(sRes.data);
      } catch (e) {
        console.error("Failed to load summary", e);
      } finally {
        setLoading((prev) => ({ ...prev, summary: false }));
      }
    })();
  }, [token, dateFrom, dateTo, activeSubType]);

  const handleSelectSpot = useCallback(
    (spot) => {
      setHotspotDetail(null);
      if (spot.type === "Crime" && spot.id) {
        setSelectedSpot({ ...spot, loading: true });
        crimeMapApi
          .getCrimeDetail(token, spot.id)
          .then((r) => {
            setSelectedSpot({
              ...spot,
              ...r.data,
              loading: false,
              type: "Crime",
            });
          })
          .catch(() => {
            setSelectedSpot((prev) =>
              prev ? { ...prev, loading: false, error: true } : prev,
            );
          });
      } else {
        setSelectedSpot(spot);
      }
    },
    [token],
  );

  const handleClusterClick = useCallback(
    (lat, lng) => {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      crimeMapApi
        .getClusterIntel(token, lat, lng, params)
        .then((r) => setHotspotDetail(r.data))
        .catch(() => {});
    },
    [token, dateFrom, dateTo],
  );

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const timelineRes = await crimeMapApi.getTimeline(token);
        setTimelineData(timelineRes.data || []);
      } catch (e) {
        console.error("Timeline fetch error", e);
      }
    })();
  }, [token]);

  // Default to last 3 months (to = max month, from = 3 months earlier)
  useEffect(() => {
    if (!timelineData?.length) return;
    if (dateFrom || dateTo) return;
    const months = [...timelineData].map((d) => d.month).sort();
    const lastMonth = months[months.length - 1];
    if (!lastMonth) return;
    const [y, m] = lastMonth.split("-").map(Number);
    const fromDate = new Date(y, m - 1 - 3, 1);
    const fromYM = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
    let fromIdx = months.findIndex((mm) => mm >= fromYM);
    if (fromIdx === -1) fromIdx = Math.max(0, months.length - 4);
    const toIdx = months.length - 1;
    const fromMonthStr = months[fromIdx];
    const toMonthStr = months[toIdx];
    const from = `${fromMonthStr}-01`;
    const lastDay = new Date(
      Number(toMonthStr.slice(0, 4)),
      Number(toMonthStr.slice(5, 7)),
      0,
    ).getDate();
    const to = `${toMonthStr}-${String(lastDay).padStart(2, "0")}`;
    setDateFrom(from);
    setDateTo(to);
  }, [timelineData, dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const params = {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        };
        const crimesRes = await crimeMapApi.getCrimesLight(token, params);
        setCrimesData(crimesRes.data || []);
      } catch (e) {
        console.error("Crime data fetch error", e);
      }
    })();
  }, [token, dateFrom, dateTo]);

  // Intelligence data — enhanced risk + status (live ETL)
  useEffect(() => {
    if (!token) return;
    crimeMapApi
      .getDistrictRiskEnhanced(token)
      .then((r) => setEnhancedRisk(r.data || []))
      .catch(() => {});
    crimeMapApi
      .getIntelligenceStatus(token)
      .then((r) => setIntelligenceStatus(r.data))
      .catch(() => {});
  }, [token]);

  const handleRefreshIntel = useCallback(async () => {
    if (!token || refreshingIntel) return;
    setRefreshingIntel(true);
    try {
      const r = await crimeMapApi.refreshIntelligence(token);
      if (r.data?.status) setIntelligenceStatus(r.data.status);
      // reload enhanced risk after refresh
      const er = await crimeMapApi.getDistrictRiskEnhanced(token);
      setEnhancedRisk(er.data || []);
    } catch (e) {
      console.error("intel refresh failed", e);
    }
    setRefreshingIntel(false);
  }, [token, refreshingIntel]);

  const headOptions = useMemo(() => {
    const seen = {};
    crimesData.forEach((d) => {
      const key = d.sub_type || "Unknown";
      if (!seen[key]) seen[key] = { ...d, sub_type: key };
    });
    return Object.values(seen).sort((a, b) =>
      (a.sub_type || "").localeCompare(b.sub_type || ""),
    );
  }, [crimesData]);

  const subTypeColorMap = useMemo(() => {
    const map = {};
    headOptions.forEach((o, i) => {
      map[o.sub_type] = SUB_COLORS[i % SUB_COLORS.length];
    });
    return map;
  }, [headOptions]);

  const filteredCrimesData = useMemo(() => {
    if (!selectedHeads) return crimesData;
    return crimesData.filter((d) => selectedHeads.has(d.sub_type || "Unknown"));
  }, [crimesData, selectedHeads]);

  const toggleHead = useCallback(
    (name) => {
      setSelectedHeads((prev) => {
        const all = new Set(headOptions.map((o) => o.sub_type));
        const next = new Set(prev || all);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        if (next.size === 0) return prev || next;
        return next;
      });
    },
    [headOptions],
  );

  const handleDateRangeChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
    setSelectedSpot(null);
    setHotspotDetail(null);
  }, []);

  const openPatrol = useCallback((ctx) => {
    setPatrolContext(ctx || null);
    setShowPatrolModal(true);
  }, []);

  // Auto-disable network overlay in District Risk view
  useEffect(() => {
    if (viewMode === "Administrative" && showNetworks) {
      setShowNetworks(false);
    }
  }, [viewMode, showNetworks]);

  return (
    <div className="flex h-full bg-[#F4F6F9] text-slate-900 font-sans">
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col p-6 overflow-hidden gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {t("crimeMap.title")}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t("crimeMap.subtitle")}
              </p>
            </div>
            {/* <button onClick={() => setShowPatrolModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-900/90 text-white rounded-full text-xs font-bold hover:bg-blue-900 transition-colors shadow-sm">
              <Route className="h-4 w-4" /> {t("crimeMap.generatePatrolPlan")}
            </button> */}
          </div>

          <div className="flex-1 flex gap-4 min-h-0 relative">
            <div className="flex-1 bg-[#E5E7EB] rounded-xl border border-[#E5E7EB] relative overflow-hidden shadow-inner flex flex-col">
              <MapView
                viewState={viewState}
                onViewStateChange={setViewState}
                viewMode={viewMode}
                showNetworks={showNetworks}
                onSelectSpot={handleSelectSpot}
                onClusterClick={handleClusterClick}
                token={token}
                crimesData={filteredCrimesData}
                subTypeColorMap={subTypeColorMap}
                dateFrom={dateFrom}
                dateTo={dateTo}
                poiFilters={poiFilters}
                enhancedRisk={enhancedRisk}
                showSocioOverlay={showSocioOverlay}
              />

              {viewMode === "Heatmap" && (
                <CrimeLegend
                  heads={headOptions}
                  selectedHeads={selectedHeads}
                  colorMap={subTypeColorMap}
                  onToggle={toggleHead}
                  onToggleAll={() =>
                    setSelectedHeads((prev) =>
                      prev && prev.size === headOptions.length
                        ? new Set()
                        : new Set(headOptions.map((o) => o.sub_type)),
                    )
                  }
                />
              )}

              <LayerSwitcher
                viewMode={viewMode}
                onModeChange={(m) => {
                  setViewMode(m);
                  setSelectedSpot(null);
                  setHotspotDetail(null);
                }}
                showNetworks={showNetworks}
                onToggleNetworks={() => setShowNetworks(!showNetworks)}
                poiFilters={poiFilters}
                onTogglePoi={(k) =>
                  setPoiFilters((p) => ({ ...p, [k]: !p[k] }))
                }
                showSocioOverlay={showSocioOverlay}
                onToggleSocio={() => setShowSocioOverlay((v) => !v)}
                intelligenceStatus={intelligenceStatus}
                onRefreshIntel={handleRefreshIntel}
                refreshingIntel={refreshingIntel}
                enhancedRisk={enhancedRisk}
              />

              {showSocioOverlay && (
                <div className="absolute bottom-[5.2rem] left-4 bg-white/95 backdrop-blur rounded-lg shadow-md border border-slate-200 px-3 py-2 z-10 flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-violet-600" />{" "}
                    Unemployment
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: "#14b8a6" }}
                    />{" "}
                    5–6%
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: "#f59e0b" }}
                    />{" "}
                    7–8%
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: "#8b5cf6" }}
                    />{" "}
                    9%+{" "}
                  </span>
                  <span className="text-[9px] text-slate-400 ml-1">
                    violet border = critical · deeper violet = lower literacy
                  </span>
                </div>
              )}

              <RangeSlider
                dateFrom={dateFrom}
                dateTo={dateTo}
                timelineData={timelineData}
                onChange={handleDateRangeChange}
              />
            </div>

            <RightPanel
              selectedSpot={selectedSpot}
              hotspotDetail={hotspotDetail}
              onClose={() => {
                setSelectedSpot(null);
                setHotspotDetail(null);
              }}
              summary={summary}
              onOpenPatrol={openPatrol}
              enhancedRisk={enhancedRisk}
              token={token}
            />
          </div>
        </div>
      </main>

      {showPatrolModal && (
        <PatrolModal
          token={token}
          selectedSpot={selectedSpot}
          initialContext={patrolContext}
          onClose={() => {
            setShowPatrolModal(false);
            setPatrolContext(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Layer Switcher ─────────────────────────────────────────────── */

function LayerSwitcher({
  viewMode,
  onModeChange,
  showNetworks,
  onToggleNetworks,
  poiFilters,
  onTogglePoi,
  showSocioOverlay,
  onToggleSocio,
  intelligenceStatus,
  onRefreshIntel,
  refreshingIntel,
  enhancedRisk,
}) {
  const { t } = useTranslation();
  const modes = [
    {
      id: "Heatmap",
      label: t("crimeMap.layers.trendHeatmap"),
      icon: TrendingUp,
    },
    { id: "Clusters", label: t("crimeMap.layers.clusterView"), icon: Target },
    {
      id: "Administrative",
      label: t("crimeMap.layers.districtRisk"),
      icon: Shield,
    },
  ];

  const networkDisabled = viewMode === "Administrative";
  const poiTypes = [
    {
      id: "Liquor_Store",
      label: "Liquor Shops",
      icon: Beer,
      weight: 5,
      color: "#b45309",
    },
    { id: "ATM", label: "ATMs", icon: Landmark, weight: 3, color: "#2563eb" },
    {
      id: "Bus_Stop",
      label: "Bus Stops",
      icon: Bus,
      weight: 2,
      color: "#16a34a",
    },
    {
      id: "Bank",
      label: "Banks",
      icon: Building2,
      weight: 2,
      color: "#7c3aed",
    },
    {
      id: "Railway_Station",
      label: "Railway",
      icon: MapPin,
      weight: 2,
      color: "#dc2626",
    },
  ];
  const intelReady =
    intelligenceStatus?.poi_total && Number(intelligenceStatus.poi_total) > 0;

  return (
    <div className="absolute top-4 left-4 bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-1.5 flex flex-col gap-1 z-10 w-52 max-h-[calc(100%-6rem)] overflow-y-auto">
      <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.08em] px-2 py-1">
        {t("crimeMap.layers.title")}
      </span>
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          className={`px-3 py-1.5 text-xs font-bold rounded-full text-left transition-colors flex items-center gap-2 ${
            viewMode === id
              ? "bg-blue-900/90 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 border border-transparent hover:border-[#E5E7EB]"
          }`}
        >
          <Icon className="h-3 w-3" /> {label}
        </button>
      ))}
      <div className="border-t border-[#E5E7EB] mt-1 pt-1">
        <label
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${networkDisabled ? "opacity-40 cursor-not-allowed border-transparent" : "hover:bg-slate-50 cursor-pointer border-transparent hover:border-[#E5E7EB]"}`}
        >
          <input
            type="checkbox"
            checked={showNetworks}
            onChange={onToggleNetworks}
            disabled={networkDisabled}
            className="rounded border-slate-300 text-blue-900 w-3.5 h-3.5 disabled:opacity-50 accent-blue-900"
            title={
              networkDisabled
                ? "Network overlay is unavailable in District Risk view"
                : undefined
            }
          />
          <span className="text-xs font-bold text-[#1A1A2E] flex items-center gap-1">
            <Users className="h-3 w-3" /> {t("crimeMap.layers.networkOverlay")}
          </span>
        </label>
        {networkDisabled && (
          <p className="text-[9px] text-slate-400 px-3 pb-1">
            Unavailable in District Risk view
          </p>
        )}
      </div>
      {/* Predictive Intelligence — POI overlays */}
      <div className="border-t border-[#E5E7EB] mt-1 pt-1">
        <span className="text-[10px] font-bold text-[#1A1A2E] uppercase tracking-[0.08em] px-2 py-1 flex items-center gap-1">
          <Database className="h-3 w-3 text-blue-900" /> Predictive Intel
          {intelReady && (
            <span
              className="ml-auto w-1.5 h-1.5 rounded-full bg-red-700"
              title="Live OSM data loaded"
            />
          )}
          {!intelReady && (
            <span
              className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400"
              title="No POI data yet — click refresh"
            />
          )}
        </span>
        {poiTypes.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-2 px-3 py-1 rounded-full hover:bg-slate-50 cursor-pointer border border-transparent hover:border-[#E5E7EB]"
          >
            <input
              type="checkbox"
              checked={!!poiFilters?.[p.id]}
              onChange={() => onTogglePoi(p.id)}
              className="rounded border-slate-300 text-blue-900 w-3.5 h-3.5 accent-blue-900"
            />
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-xs font-bold text-[#1A1A2E] flex-1">
              {p.label}
            </span>
            <span className="text-[9px] font-bold text-slate-400">
              ×{p.weight}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 px-3 py-1 rounded-full hover:bg-slate-50 cursor-pointer mt-1 border border-transparent hover:border-[#E5E7EB]">
          <input
            type="checkbox"
            checked={!!showSocioOverlay}
            onChange={onToggleSocio}
            className="rounded border-slate-300 text-blue-900 w-3.5 h-3.5 accent-blue-900"
          />
          <CloudRain className="h-3 w-3 text-blue-900" />
          <span className="text-xs font-bold text-[#1A1A2E]">
            Socio-Economic tint
          </span>
        </label>
        <div className="px-2 py-1.5 mt-1">
          <button
            onClick={onRefreshIntel}
            disabled={refreshingIntel}
            className="mx-auto flex items-center justify-center gap-1 px-3.5 py-1.5 bg-blue-900/90 text-white rounded-full text-[10px] font-bold tracking-wide hover:bg-blue-900 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshingIntel ? "animate-spin" : ""}`}
            />{" "}
            {refreshingIntel ? "Refreshing…" : "Refresh Live Data"}
          </button>
          {intelligenceStatus && (
            <p className="text-[9px] text-slate-400 mt-1 text-center">
              POIs: {intelligenceStatus.poi_total || 0} · Weather:{" "}
              {intelligenceStatus.weather_rows || 0}
              {intelligenceStatus.poi_last_refresh &&
                ` · ${new Date(intelligenceStatus.poi_last_refresh).toLocaleDateString()}`}
            </p>
          )}
          {enhancedRisk?.length > 0 && (
            <p className="text-[9px] text-emerald-600 font-semibold text-center mt-0.5">
              Enhanced risk active
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

LayerSwitcher.propTypes = {
  viewMode: PropTypes.string.isRequired,
  onModeChange: PropTypes.func.isRequired,
  showNetworks: PropTypes.bool.isRequired,
  onToggleNetworks: PropTypes.func.isRequired,
  poiFilters: PropTypes.object,
  onTogglePoi: PropTypes.func,
  showSocioOverlay: PropTypes.bool,
  onToggleSocio: PropTypes.func,
  intelligenceStatus: PropTypes.object,
  onRefreshIntel: PropTypes.func,
  refreshingIntel: PropTypes.bool,
  enhancedRisk: PropTypes.array,
};

/* ── Crime Category Legend ─────────────────────────────────────── */

const SUB_COLORS = [
  "#dc2626",
  "#2563eb",
  "#d946ef",
  "#f59e0b",
  "#16a34a",
  "#0891b2",
  "#db2777",
  "#7c3aed",
  "#ea580c",
  "#65a30d",
  "#0d9488",
  "#e11d48",
  "#6366f1",
  "#ca8a04",
  "#059669",
  "#9333ea",
  "#f97316",
  "#0284c7",
  "#84cc16",
  "#be123c",
  "#475569",
  "#c026d3",
];

function headColor(name) {
  if (!name) return "#64748b";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const idx = hash % SUB_COLORS.length;
  return SUB_COLORS[idx];
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function CrimeLegend({
  heads,
  selectedHeads,
  colorMap,
  onToggle,
  onToggleAll,
}) {
  const { t } = useTranslation();
  if (!heads || heads.length === 0) return null;
  const allSelected = !selectedHeads || selectedHeads.size === heads.length;

  return (
    <div className="absolute top-4 right-4 bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-3 z-20 w-56 max-h-[calc(100%-12rem)] flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-[10px] font-bold text-[#1A1A2E] uppercase tracking-[0.08em]">
          {t("crimeMap.legend.crimeTypes")}
        </span>
        <button
          onClick={onToggleAll}
          className="text-[10px] font-black uppercase tracking-wide text-blue-900 hover:text-red-700 border border-[#E5E7EB] rounded-full px-2 py-0.5 bg-white hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          {allSelected ? t("crimeMap.legend.none") : t("crimeMap.legend.all")}
        </button>
      </div>
      <div className="flex flex-col gap-0.5 overflow-y-auto min-h-0">
        {heads.map((h) => {
          const active =
            !selectedHeads || selectedHeads.has(h.sub_type) || allSelected;
          return (
            <button
              key={h.sub_type}
              onClick={() => onToggle(h.sub_type)}
              className="flex items-center gap-2 text-left w-full rounded px-1.5 py-1 hover:bg-slate-100 transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm"
                style={{
                  backgroundColor: active
                    ? colorMap[h.sub_type] || headColor(h.sub_type)
                    : "#cbd5e1",
                }}
              />
              <span
                className={`text-xs font-bold ${
                  active ? "text-[#1A1A2E]" : "text-slate-300 line-through"
                }`}
              >
                {h.sub_type}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

CrimeLegend.propTypes = {
  heads: PropTypes.array,
  selectedHeads: PropTypes.object,
  colorMap: PropTypes.object,
  onToggle: PropTypes.func.isRequired,
  onToggleAll: PropTypes.func.isRequired,
};

/* ── Date Range Slider ──────────────────────────────────────────── */

function RangeSlider({ dateFrom, dateTo, timelineData, onChange }) {
  const { t } = useTranslation();
  const months = useMemo(
    () => (timelineData || []).map((d) => d.month).sort(),
    [timelineData],
  );
  const last = months.length - 1;
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(0);

  const applyRange = (a, b) => {
    setLo(a);
    setHi(b);
    const from = `${months[a]}-01`;
    const toMonth = months[b];
    const lastDay = new Date(
      Number(toMonth.slice(0, 4)),
      Number(toMonth.slice(5, 7)),
      0,
    ).getDate();
    const to = `${toMonth}-${String(lastDay).padStart(2, "0")}`;
    onChange(from, to);
  };

  useEffect(() => {
    if (last < 1) return;
    const minIdx = dateFrom
      ? months.findIndex((m) => m >= dateFrom.slice(0, 7))
      : Math.max(0, last - 3);
    const maxIdx = dateTo
      ? months.findIndex((m) => m > dateTo.slice(0, 7)) - 1
      : last;
    const nextLo = minIdx < 0 ? Math.max(0, last - 3) : minIdx;
    const nextHi = maxIdx < 0 || maxIdx < nextLo ? last : maxIdx;
    // only sync if parent has values or initial 3-month default not yet applied
    if (nextLo !== lo || nextHi !== hi) {
      setLo(nextLo);
      setHi(nextHi);
    }
  }, [dateFrom, dateTo, months, last]); // eslint-disable-line react-hooks/exhaustive-deps

  if (last < 1) {
    return (
      <div className="absolute bottom-3 left-4 right-4 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 z-10">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Clock className="h-3 w-3" /> {t("crimeMap.dateRange.title")}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {t("crimeMap.timeline.empty")}
        </p>
      </div>
    );
  }

  const safeLo = Math.min(Math.max(lo, 0), last);
  const safeHi = Math.min(Math.max(hi, safeLo), last);

  const rangeLabel = `${formatMonthLabel(months[safeLo])} — ${formatMonthLabel(months[safeHi])}`;

  const loPct = (safeLo / last) * 100;
  const hiPct = (safeHi / last) * 100;
  const selectedWidth = hiPct - loPct;

  return (
    <>
      <style>{`
        .range-dual { position: relative; height: 18px; }
        .range-dual input[type="range"] {
          -webkit-appearance: none; appearance: none;
          position: absolute; top: 0; left: 0;
          width: 100%; height: 18px;
          background: transparent; outline: none;
          margin: 0; pointer-events: none;
        }
        .range-dual input[type="range"]::-webkit-slider-runnable-track {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 4px; border-radius: 9999px; background: transparent;
        }
        .range-dual input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 12px; height: 12px; border-radius: 9999px;
          background: #fff; border: 2px solid #1e3a8a;
          box-shadow: 0 1px 4px rgba(30,58,138,0.22);
          cursor: pointer; pointer-events: auto; margin-top: -4px;
          transition: transform 0.12s;
        }
        .range-dual input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.08); }
        .range-dual input[type="range"]::-moz-range-track {
          width: 100%; height: 4px; border-radius: 9999px; background: transparent;
        }
        .range-dual input[type="range"]::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 9999px;
          background: #fff; border: 2px solid #1e3a8a;
          box-shadow: 0 1px 4px rgba(30,58,138,0.22);
          cursor: pointer; pointer-events: auto;
        }
      `}</style>
      <div className="absolute bottom-3 left-3 right-3 bg-white rounded-2xl shadow-lg border border-[#E5E7EB] px-3 py-2.5 z-10">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <p className="text-[10px] font-bold text-[#1A1A2E] uppercase tracking-[0.08em] flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3 text-blue-900" />{" "}
            {t("crimeMap.dateRange.title")}
          </p>
          <span className="text-[10px] font-bold tracking-wide text-white bg-blue-900/90 px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
            {rangeLabel}
          </span>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            {/* <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
              <span className="w-1 h-1 rounded-full bg-blue-900/90" />
              {t("crimeMap.dateRange.from")} {formatMonthLabel(months[safeLo])}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
              {t("crimeMap.dateRange.to")} {formatMonthLabel(months[safeHi])}
              <span className="w-1 h-1 rounded-full bg-blue-900/90" />
            </span> */}
          </div>

          <div className="relative">
            <div className="absolute top-[7px] left-0 right-0 h-[4px] rounded-full bg-slate-200" />
            <div
              className="absolute top-[7px] h-[4px] rounded-full bg-blue-900/90"
              style={{ left: `${loPct}%`, width: `${selectedWidth}%` }}
            />
            <div className="range-dual">
              <input
                type="range"
                min={0}
                max={last}
                value={safeLo}
                aria-label="from"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v <= safeHi) applyRange(v, safeHi);
                }}
              />
              <input
                type="range"
                min={0}
                max={last}
                value={safeHi}
                aria-label="to"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= safeLo) applyRange(safeLo, v);
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-400 tracking-wide">
            <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded-full text-[10px]">
              {formatMonthLabel(months[0])}
            </span>
            <span className="text-slate-300 text-[8px]">{months.length}m</span>
            <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded-full text-[10px]">
              {formatMonthLabel(months[last])}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

RangeSlider.propTypes = {
  dateFrom: PropTypes.string,
  dateTo: PropTypes.string,
  timelineData: PropTypes.array,
  onChange: PropTypes.func.isRequired,
};

/* ── Map View ───────────────────────────────────────────────────── */

function MapView({
  viewState,
  onViewStateChange,
  viewMode,
  showNetworks,
  onSelectSpot,
  onClusterClick,
  token,
  crimesData,
  subTypeColorMap,
  dateFrom,
  dateTo,
  poiFilters,
  enhancedRisk,
  showSocioOverlay,
}) {
  const [clusterData, setClusterData] = useState([]);
  const [districtRisk, setDistrictRisk] = useState([]);
  const [networkOverlay, setNetworkOverlay] = useState([]);
  const [poiData, setPoiData] = useState([]);

  useEffect(() => {
    if (!token) return;
    const src = enhancedRisk && enhancedRisk.length ? enhancedRisk : null;
    if (src) {
      setDistrictRisk(src);
    } else {
      crimeMapApi
        .getDistrictRisk(token)
        .then((r) => setDistrictRisk(r.data || []))
        .catch(() => {});
    }
  }, [token, enhancedRisk]);

  useEffect(() => {
    if (!token) return;
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    crimeMapApi
      .getClusters(token, params)
      .then((r) => setClusterData(r.data || []))
      .catch(() => {});
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    crimeMapApi
      .getNetworkOverlayEnhanced(token)
      .then((r) => setNetworkOverlay(r.data || []))
      .catch(() => {});
  }, [token]);

  // Fetch live POIs (OSM)
  useEffect(() => {
    if (!token) return;
    const activeTypes = Object.entries(poiFilters || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!activeTypes.length) {
      setPoiData([]);
      return;
    }
    // fetch all then filter client-side for speed (single request) — limit 5000 covers 31 districts
    crimeMapApi
      .getPOIs(token, { limit: 5000 })
      .then((r) => {
        const all = r.data || [];
        const filtered = all.filter((d) => activeTypes.includes(d.POIType));
        setPoiData(filtered);
      })
      .catch(() => {});
  }, [token, poiFilters]);

  const crimePointsData = useMemo(
    () =>
      crimesData.map((d) => ({
        id: d.id,
        coordinates: [d.lng, d.lat],
        sub_type: d.sub_type || "Unknown",
        date: d.date,
      })),
    [crimesData],
  );

  const clusterLayerData = useMemo(
    () =>
      clusterData.map((d) => ({
        coordinates: [d.center[1], d.center[0]],
        crime_count: d.crime_count,
        dominant_crime: d.dominant_crime,
        lat: d.center[0],
        lng: d.center[1],
      })),
    [clusterData],
  );

  const districtGeoJson = useMemo(() => {
    if (!districtRisk.length) return null;
    return {
      type: "FeatureCollection",
      features: districtRisk.map((d) => ({
        type: "Feature",
        properties: {
          name: d.district,
          risk_score: d.risk_score,
          risk_score_base: d.risk_score_base,
          risk_level: d.risk_level,
          crime_count: d.crime_count,
          repeat_offenders: d.repeat_offenders,
          pending_investigations: d.pending_investigations,
          change_pct: d.change_pct,
          top_crime: d.top_crime,
          rank: d.rank,
          unemployment_rate:
            d.multipliers?.unemployment_rate ?? d.socio?.unemployment_rate,
          literacy_rate: d.socio?.literacy_rate,
          population_density: d.socio?.population_density,
          per_capita_income: d.socio?.per_capita_income,
          poi_total: d.multipliers?.poi_total,
          weather_rain: d.multipliers?.weather_rain_14d_avg,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [d.bounds.min_lng, d.bounds.min_lat],
              [d.bounds.max_lng, d.bounds.min_lat],
              [d.bounds.max_lng, d.bounds.max_lat],
              [d.bounds.min_lng, d.bounds.max_lat],
              [d.bounds.min_lng, d.bounds.min_lat],
            ],
          ],
        },
      })),
    };
  }, [districtRisk]);

  const networkEdges = useMemo(() => {
    if (!networkOverlay.length) return [];
    const edges = [];
    networkOverlay.forEach((net) => {
      if (!net.members || net.members.length < 2) return;
      for (let i = 0; i < Math.min(net.members.length, 5); i++) {
        for (let j = i + 1; j < Math.min(net.members.length, 5); j++) {
          edges.push({
            source: [net.lng + i * 0.02, net.lat + i * 0.01],
            target: [net.lng + j * 0.02, net.lat + j * 0.01],
            network_name: net.network_name,
          });
        }
      }
    });
    return edges;
  }, [networkOverlay]);

  const layers = useMemo(() => {
    const activeLayers = [];

    if (viewMode === "Heatmap") {
      if (crimePointsData.length) {
        activeLayers.push(
          new ScatterplotLayer({
            id: "crime-points",
            data: crimePointsData,
            getPosition: (d) => d.coordinates,
            getRadius: 4,
            radiusMinPixels: 2,
            radiusMaxPixels: 6,
            getFillColor: (d) => {
              const hex = subTypeColorMap[d.sub_type] || headColor(d.sub_type);
              const [r, g, b] = hexToRgb(hex) || [100, 116, 139];
              return [r, g, b, 200];
            },
            strokeWidth: 1,
            getLineColor: [255, 255, 255, 120],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 0, 120],
            onClick: (info) => {
              if (info.object) {
                const d = info.object;
                onSelectSpot({
                  id: d.id,
                  type: "Crime",
                  sub_type: d.sub_type,
                  date: d.date,
                  lat: d.coordinates[1],
                  lng: d.coordinates[0],
                });
              }
            },
          }),
        );
      }
    }

    // Socio-economic tint overlay — visible in ANY view when toggled (heat + cluster get choropleth underlay)
    if (showSocioOverlay && districtGeoJson) {
      activeLayers.unshift(
        new GeoJsonLayer({
          id: "socio-choropleth",
          data: districtGeoJson,
          pickable: viewMode !== "Administrative",
          stroked: true,
          filled: true,
          lineWidthMinPixels: viewMode === "Administrative" ? 0 : 1,
          getFillColor: (d) => {
            const u = d.properties.unemployment_rate ?? 7;
            // unemployment choropleth: 5% teal → 10% purple, plus literacy wash
            const lit = d.properties.literacy_rate ?? 75;
            // interpolate unemployment 5-10% to color ramp
            const t = Math.max(0, Math.min(1, (u - 5) / 5));
            // low unemp teal, mid amber, high violet — highly visible
            if (t < 0.33)
              return [20, 184, 166, viewMode === "Administrative" ? 0 : 55]; // teal (~5-6.6%)
            if (t < 0.66)
              return [245, 158, 11, viewMode === "Administrative" ? 0 : 60]; // amber (~6.6-8.3%)
            // high unemployment: violet with literacy alpha boost (lower literacy = more opaque)
            const alpha =
              viewMode === "Administrative"
                ? 0
                : Math.round(55 + (75 - lit) * 1.2);
            return [139, 92, 246, Math.max(50, Math.min(95, alpha))];
          },
          getLineColor: [139, 92, 246, 60],
          getLineWidth: 1,
          // show socio tooltip even in Administrative (district click still works via next layer)
          onClick:
            viewMode !== "Administrative"
              ? (info) => {
                  if (info.object) {
                    const p = info.object.properties;
                    onSelectSpot({
                      id: p.name,
                      name: p.name,
                      type: "District",
                      ...p,
                    });
                  }
                }
              : undefined,
        }),
      );
    }

    if (viewMode === "Administrative" && districtGeoJson) {
      activeLayers.push(
        new GeoJsonLayer({
          id: "geojson-districts",
          data: districtGeoJson,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: showSocioOverlay ? 2.5 : 2,
          getFillColor: (d) => {
            const score = d.properties.risk_score || 0;
            const u = d.properties.unemployment_rate ?? 7;
            let base;
            if (score >= 75) base = [220, 38, 38, 60];
            else if (score >= 50) base = [245, 158, 11, 50];
            else if (score >= 25) base = [59, 130, 246, 40];
            else base = [34, 197, 94, 30];
            if (!showSocioOverlay) return base;
            // Socio tint: blend violet haze proportional to unemployment premium over 7%
            const premium = Math.max(0, u - 7); // 0-~4
            const violet = [
              139,
              92,
              246,
              Math.round(Math.min(75, 18 + premium * 14)),
            ];
            // alpha blend: mix base + violet (simple avg for visibility)
            if (premium > 0.5) {
              const mix = Math.min(0.45, premium * 0.12);
              return [
                Math.round(base[0] * (1 - mix) + violet[0] * mix),
                Math.round(base[1] * (1 - mix) + violet[1] * mix),
                Math.round(base[2] * (1 - mix) + violet[2] * mix),
                Math.round(base[3] + violet[3] * 0.55),
              ];
            }
            // also show hatched border for high-unemp districts
            return base;
          },
          getLineColor: (d) => {
            const u = d.properties.unemployment_rate ?? 7;
            if (showSocioOverlay && u >= 9) return [109, 40, 217, 255]; // violet border for critical unemp
            if (showSocioOverlay && u >= 8) return [147, 51, 234, 255];
            const score = d.properties.risk_score || 0;
            if (score >= 75) return [185, 28, 28, 255];
            if (score >= 50) return [180, 83, 9, 255];
            if (score >= 25) return [37, 99, 235, 255];
            return [21, 128, 61, 255];
          },
          getLineWidth: (d) => {
            if (showSocioOverlay) {
              const u = d.properties.unemployment_rate ?? 7;
              if (u >= 9) return 3.5;
              if (u >= 8) return 2.8;
            }
            return 2;
          },
          onClick: (info) => {
            if (info.object) {
              const p = info.object.properties;
              onSelectSpot({
                id: p.name,
                name: p.name,
                type: "District",
                ...p,
              });
            }
          },
        }),
      );
    }

    if (viewMode === "Clusters" && clusterLayerData.length) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "crime-clusters",
          data: clusterLayerData,
          getPosition: (d) => d.coordinates,
          getRadius: (d) => Math.min(d.crime_count * 500, 5000),
          getFillColor: [220, 38, 38, 200],
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              const d = info.object;
              onSelectSpot({
                id: `CLS-${d.lat.toFixed(2)}-${d.lng.toFixed(2)}`,
                name: `${d.dominant_crime} Cluster`,
                type: "Cluster",
                totalCrimes: d.crime_count,
                dominant_crime: d.dominant_crime,
                lat: d.lat,
                lng: d.lng,
              });
              onClusterClick(d.lat, d.lng);
            }
          },
        }),
      );
    }

    const networkVisible =
      showNetworks && viewMode !== "Administrative" && networkOverlay.length;
    if (networkVisible) {
      if (networkEdges.length) {
        activeLayers.push(
          new LineLayer({
            id: "network-edges",
            data: networkEdges,
            getSourcePosition: (d) => d.source,
            getTargetPosition: (d) => d.target,
            getColor: [239, 68, 68, 120],
            getWidth: 2,
          }),
        );
      }

      activeLayers.push(
        new ScatterplotLayer({
          id: "network-overlay",
          data: networkOverlay.filter((n) => n.lat && n.lng),
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => Math.min(d.total_firs * 800, 8000),
          getFillColor: (d) => {
            if (d.risk === "High") return [239, 68, 68, 160];
            if (d.risk === "Medium") return [239, 68, 68, 100];
            return [239, 68, 68, 60];
          },
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              onSelectSpot({
                id: info.object.network_name,
                name: info.object.network_name,
                type: "Criminal Network",
                ...info.object,
              });
            }
          },
        }),
      );
    }

    // POI overlays — live OSM data, visible in Heatmap/Cluster modes
    if (poiData.length && viewMode !== "Administrative") {
      const poiColors = {
        Liquor_Store: [180, 83, 9, 200],
        ATM: [37, 99, 235, 200],
        Bus_Stop: [22, 163, 74, 200],
        Bank: [124, 58, 237, 200],
        Railway_Station: [220, 38, 38, 200],
      };
      const grouped = {};
      poiData.forEach((p) => {
        (grouped[p.POIType] = grouped[p.POIType] || []).push(p);
      });
      Object.entries(grouped).forEach(([type, data]) => {
        activeLayers.push(
          new ScatterplotLayer({
            id: `poi-${type}`,
            data,
            getPosition: (d) => [d.lng, d.lat],
            getRadius: type === "Liquor_Store" ? 6 : 5,
            radiusMinPixels: type === "Liquor_Store" ? 5 : 4,
            radiusMaxPixels: 9,
            getFillColor: poiColors[type] || [100, 116, 139, 180],
            getLineColor: [255, 255, 255, 220],
            stroked: true,
            lineWidthMinPixels: 1,
            pickable: true,
            autoHighlight: true,
            onClick: (info) => {
              if (info.object) {
                const d = info.object;
                onSelectSpot({
                  id: `POI-${d.PoiID}`,
                  name: d.POIName || d.POIType,
                  type: "POI",
                  poi_type: d.POIType,
                  risk_weight: d.RiskWeight,
                  lat: d.lat,
                  lng: d.lng,
                  district: d.DistrictName,
                });
              }
            },
          }),
        );
      });
    }

    return activeLayers;
  }, [
    viewMode,
    crimePointsData,
    clusterLayerData,
    districtGeoJson,
    showNetworks,
    networkOverlay,
    networkEdges,
    onSelectSpot,
    onClusterClick,
    subTypeColorMap,
    poiData,
    showSocioOverlay,
  ]);

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={(e) => onViewStateChange(e.viewState)}
      controller={true}
      layers={layers}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "default")}
    >
      <Map
        reuseMaps
        mapLib={import("maplibre-gl")}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        preventStyleDiffing={true}
      />
    </DeckGL>
  );
}

MapView.propTypes = {
  viewState: PropTypes.object.isRequired,
  onViewStateChange: PropTypes.func.isRequired,
  viewMode: PropTypes.string.isRequired,
  showNetworks: PropTypes.bool.isRequired,
  onSelectSpot: PropTypes.func.isRequired,
  onClusterClick: PropTypes.func.isRequired,
  token: PropTypes.string,
  crimesData: PropTypes.array,
  subTypeColorMap: PropTypes.object,
  dateFrom: PropTypes.string,
  dateTo: PropTypes.string,
  poiFilters: PropTypes.object,
  enhancedRisk: PropTypes.array,
  showSocioOverlay: PropTypes.bool,
};

/* ── Right Panel (Contextual) ───────────────────────────────────── */

function RightPanel({
  selectedSpot,
  hotspotDetail,
  onClose,
  summary,
  onOpenPatrol,
  enhancedRisk,
  token,
}) {
  if (!selectedSpot) {
    return (
      <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
        <DefaultPanel
          summary={summary}
          enhancedRisk={enhancedRisk}
          onOpenPatrol={onOpenPatrol}
        />
      </div>
    );
  }

  if (selectedSpot.type === "POI") {
    return (
      <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
        <POIPanel
          spot={selectedSpot}
          onClose={onClose}
          onOpenPatrol={onOpenPatrol}
        />
      </div>
    );
  }

  if (selectedSpot.type === "Trend" || selectedSpot.type === "Crime") {
    return (
      <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
        <TrendPanel
          spot={selectedSpot}
          onClose={onClose}
          onOpenPatrol={onOpenPatrol}
        />
      </div>
    );
  }

  if (selectedSpot.type === "District") {
    return (
      <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
        <DistrictPanel
          spot={selectedSpot}
          onClose={onClose}
          onOpenPatrol={onOpenPatrol}
          enhancedRisk={enhancedRisk}
          token={token}
        />
      </div>
    );
  }

  if (selectedSpot.type === "Criminal Network") {
    return (
      <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
        <NetworkPanel spot={selectedSpot} onClose={onClose} />
      </div>
    );
  }

  // Cluster / Hotspot
  return (
    <div className="w-96 bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col min-h-0 overflow-hidden">
      <ClusterPanel
        spot={selectedSpot}
        detail={hotspotDetail}
        onClose={onClose}
        onOpenPatrol={onOpenPatrol}
      />
    </div>
  );
}

RightPanel.propTypes = {
  selectedSpot: PropTypes.object,
  hotspotDetail: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  summary: PropTypes.object,
  onOpenPatrol: PropTypes.func.isRequired,
  enhancedRisk: PropTypes.array,
  token: PropTypes.string,
};

/* ── Default Panel (nothing selected) ──────────────────────────── */

function DefaultPanel({ summary, enhancedRisk, onOpenPatrol }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hp = summary?.highest_priority_district;
  // Socio-economic state lens derived live from enhancedRisk
  const socioLens = useMemo(() => {
    if (!enhancedRisk || !enhancedRisk.length) return null;
    const vals = enhancedRisk.filter((d) => d.socio);
    if (!vals.length) return null;
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const avgUnemp = avg(vals.map((d) => d.socio.unemployment_rate));
    const avgLit = avg(vals.map((d) => d.socio.literacy_rate));
    const avgDensity = avg(vals.map((d) => d.socio.population_density));
    const avgIncome = avg(vals.map((d) => d.socio.per_capita_income));
    const sortedUnemp = [...vals].sort(
      (a, b) => b.socio.unemployment_rate - a.socio.unemployment_rate,
    );
    const sortedLit = [...vals].sort(
      (a, b) => a.socio.literacy_rate - b.socio.literacy_rate,
    );
    const highRiskHighUnemp = vals.filter(
      (d) => d.risk_score >= 50 && d.socio.unemployment_rate > avgUnemp,
    ).length;
    return {
      avgUnemp,
      avgLit,
      avgDensity,
      avgIncome,
      topUnemp: sortedUnemp.slice(0, 3),
      lowLit: sortedLit.slice(0, 3),
      highRiskHighUnemp,
      vals,
    };
  }, [enhancedRisk]);
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-4 border-b border-[#E5E7EB] bg-[#FAFBFC] shrink-0">
        <span className="text-[10px] font-bold text-blue-900 uppercase tracking-[0.08em]">
          {t("crimeMap.summary.operationalSummary")}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 overscroll-contain">
        {summary?.contextual && (
          <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-3.5 shadow-sm">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.08em] mb-1">
              {t("crimeMap.summary.filteredPriority")}
            </p>
            <p className="text-sm font-bold text-slate-900 leading-snug">
              {summary.contextual.priority}
            </p>
            {summary.contextual.key_stat && (
              <p className="text-xs font-semibold text-slate-700 mt-1.5">
                {summary.contextual.key_stat}
              </p>
            )}
            {summary.contextual.quick_action && (
              <span className="inline-block mt-2 px-2.5 py-1 bg-amber-100 border border-amber-200 rounded-full text-[10px] font-bold text-amber-800">
                ⚡ {summary.contextual.quick_action}
              </span>
            )}
          </div>
        )}

        {hp && (
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-3.5 shadow-sm">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-[0.08em] mb-1">
              {t("crimeMap.summary.todaysHighestPriority")}
            </p>
            <p className="text-sm font-bold text-[#1A1A2E]">{hp.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{hp.reason}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div
            className={`p-3 rounded-sm border ${summary?.today_risk === "HIGH" ? "bg-red-400 border-red-400" : summary?.today_risk === "MEDIUM" ? "bg-orange-300 border-orange-300" : "bg-blue-900/90 border-blue-900/90"}`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.08em] ${summary?.today_risk ? "text-white/85" : "text-white/85"}`}
            >
              {t("crimeMap.summary.todaysRisk")}
            </p>
            <p className="text-lg font-black text-white">
              {summary?.today_risk || "—"}
            </p>
          </div>
          <div className="p-3 bg-orange-300 rounded-sm border border-orange-300">
            <p className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.08em]">
              {t("crimeMap.summary.emergingHotspots")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(summary?.emerging_hotspots)}
            </p>
          </div>
          <div className="p-3 bg-blue-900/90 rounded-sm border border-blue-900/90">
            <p className="text-[10px] font-bold text-white/85 uppercase tracking-[0.08em]">
              {t("crimeMap.summary.repeatOffenders")}
            </p>
            <p className="text-lg font-black text-white">
              {formatNumber(summary?.repeat_offender_areas)}
            </p>
          </div>
          <div className="p-3 bg-white rounded-sm border border-[#DDE3EC]">
            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.08em]">
              {t("crimeMap.summary.crimes30d")}
            </p>
            <p className="text-lg font-black text-[#1A1A2E]">
              {formatNumber(summary?.active_hotspots)}
            </p>
          </div>
        </div>

        {/* ── Socio-Economic Intelligence — State Lens ── */}
        {socioLens ? (
          <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-slate-100 via-white to-sky-50 p-3.5 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black tracking-widest uppercase text-red-700 flex items-center gap-1.5">
                Socio-Economic Intelligence
              </p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/90 text-white">
                {socioLens.vals.length} districts
              </span>
            </div>
            {/* state averages */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white rounded-lg border border-violet-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Avg Unemp
                </p>
                <p className="text-sm font-black text-red-700">
                  {socioLens.avgUnemp.toFixed(1)}%
                </p>
                <p className="text-[9px] text-slate-500">state mean</p>
              </div>
              <div className="bg-white rounded-lg border border-sky-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Avg Literacy
                </p>
                <p className="text-sm font-black text-sky-700">
                  {socioLens.avgLit.toFixed(1)}%
                </p>
                <p className="text-[9px] text-slate-500">state mean</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Avg Density
                </p>
                <p className="text-sm font-black text-slate-900">
                  {Math.round(socioLens.avgDensity)}
                </p>
                <p className="text-[9px] text-slate-500">per km²</p>
              </div>
              <div className="bg-white rounded-lg border border-amber-100 p-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Avg Income
                </p>
                <p className="text-xs font-black text-amber-700">
                  ₹{(socioLens.avgIncome / 1000).toFixed(0)}k
                </p>
                <p className="text-[9px] text-slate-500">per capita</p>
              </div>
            </div>
            {/* how it affects risk — correlation insight */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Correlation
                </p>
                <p className="text-xs font-semibold text-slate-800 leading-snug mt-1">
                  <span className="font-black text-red-700">
                    {socioLens.highRiskHighUnemp}
                  </span>{" "}
                  high-risk districts sit above mean unemployment. Economic
                  stress is the strongest live multiplier.
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-500">
                    Formula:
                  </span>
                  <span className="text-[10px] font-mono bg-slate-900 text-violet-200 px-1.5 py-0.5 rounded">
                    Enhanced = Base + (Unemp-7)×3.5 + POI + Weather + Literacy
                  </span>
                </div>
              </div>
              <div className="w-20 grid grid-cols-3 gap-0.5 items-end h-12">
                {socioLens.vals
                  .slice(0, 9)
                  .sort(
                    (a, b) =>
                      a.socio.unemployment_rate - b.socio.unemployment_rate,
                  )
                  .map((d, i) => {
                    const h = 14 + (d.socio.unemployment_rate - 5) * 5;
                    const col = d.risk_score >= 50 ? "#8b5cf6" : "#14b8a6";
                    return (
                      <div
                        key={i}
                        title={`${d.district}: ${d.socio.unemployment_rate}% → risk ${Math.round(d.risk_score)}`}
                        className="rounded-sm"
                        style={{
                          height: `${Math.min(48, h)}px`,
                          background: col,
                        }}
                      />
                    );
                  })}
              </div>
            </div>
            {/* top drivers */}
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-red-600 mb-1 truncate">
                  Highest unemployment → risk +
                </p>
                {socioLens.topUnemp.map((d) => (
                  <div
                    key={d.district}
                    className="flex items-center justify-between gap-1 bg-white border border-red-100 rounded px-2 py-1.5 mb-1 min-w-0 overflow-hidden"
                  >
                    <span className="text-xs font-semibold text-slate-800 truncate min-w-0 flex-1">
                      {d.district}
                    </span>
                    <span className="text-xs font-black text-red-600 shrink-0 whitespace-nowrap tabular-nums">
                      {Number(d.socio.unemployment_rate).toFixed(1)}%{" "}
                      <span className="font-medium text-slate-400">→</span>{" "}
                      <span className="font-bold text-slate-600">
                        {Math.round(d.risk_score)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-sky-600 mb-1 truncate">
                  Lowest literacy → vulnerability
                </p>
                {socioLens.lowLit.map((d) => (
                  <div
                    key={d.district}
                    className="flex items-center justify-between gap-1 bg-white border border-sky-100 rounded px-2 py-1.5 mb-1 min-w-0 overflow-hidden"
                  >
                    <span className="text-xs font-semibold text-slate-800 truncate min-w-0 flex-1">
                      {d.district}
                    </span>
                    <span className="text-xs font-black text-sky-700 shrink-0 whitespace-nowrap tabular-nums">
                      {Number(d.socio.literacy_rate).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-slate-400 text-center">
              Live via OpenStreetMap + Open-Meteo + data.gov.in · tint toggle
              shows this on map
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center">
            <p className="text-xs font-semibold text-slate-600 flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading
              socio-economic intelligence…
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Refresh Live Data if empty (Overpass + Open-Meteo)
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-[#E5E7EB] space-y-3">
          {summary?.contextual?.top_sub_type ? (
            <button
              onClick={() =>
                onOpenPatrol({
                  crimeFocus: getHeadIdForSubType(
                    summary.contextual.top_sub_type,
                  ),
                  crimeLabel: summary.contextual.top_sub_type,
                  area: summary.contextual.top_district || hp?.name || "",
                  timeRange: "night",
                  title:
                    summary.contextual.quick_action ||
                    summary.contextual.priority,
                })
              }
              className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <Route className="h-3.5 w-3.5" />
              </span>
              Response Plan — {summary.contextual.top_sub_type}
              {summary.contextual.top_district
                ? ` · ${summary.contextual.top_district}`
                : ""}
            </button>
          ) : hp ? (
            <button
              onClick={() =>
                onOpenPatrol({
                  crimeFocus: null,
                  crimeLabel: null,
                  area: hp.name,
                  timeRange: "night",
                  title: `Highest priority: ${hp.name} — ${hp.reason}`,
                })
              }
              className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <Route className="h-3.5 w-3.5" />
              </span>
              Patrol plan — {hp.name}
            </button>
          ) : null}
          <button
            onClick={() => {
              const risk = summary?.today_risk || "N/A";
              const hotspots = summary?.emerging_hotspots ?? "N/A";
              const repeat = summary?.repeat_offender_areas ?? "N/A";
              const crimes = summary?.active_hotspots ?? "N/A";
              const priority = hp?.name
                ? `${hp.name} — ${hp.reason}`
                : "None identified";
              const msg = `Provide a deep dive analysis of crime in ${hp?.name || summary?.contextual?.top_district || "Karnataka"} district. Today's risk: ${risk}. Hotspots: ${hotspots}. Repeat: ${repeat}. Crimes 30d: ${crimes}. Priority: ${priority}. Highlight critical areas and recommend deployment.`;
              navigate("/", { state: { initialMessage: msg } });
            }}
            className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            Analyze This District
          </button>
        </div>
      </div>
    </div>
  );
}

DefaultPanel.propTypes = {
  summary: PropTypes.object,
  enhancedRisk: PropTypes.array,
  onOpenPatrol: PropTypes.func,
};

/* ── Trend Panel ────────────────────────────────────────────────── */

function TrendPanel({ spot, onClose, onOpenPatrol }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (spot.loading) {
    return (
      <>
        <PanelHeader
          id={spot.id || "…"}
          name={spot.sub_type || "Loading…"}
          type="Crime"
          typeColor="bg-blue-900/90 text-white border-blue-900/90"
          typeIcon={<Shield size={10} />}
          onClose={onClose}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
            <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            {t("crimeMap.crimes.loading")}
          </div>
        </div>
      </>
    );
  }

  const isCrime = spot.type === "Crime" && (spot.CrimeNo || spot.crime_type);

  return (
    <>
      <PanelHeader
        id={spot.CrimeNo || spot.CaseNo || spot.id || "LOCATION"}
        name={
          spot.name ||
          spot.sub_type ||
          spot.crime_type ||
          t("crimeMap.legend.crimeTypes")
        }
        type="Crime"
        typeColor="bg-blue-900/90 text-white border-blue-900/90"
        typeIcon={<Shield size={10} />}
        onClose={onClose}
        subtitle={
          spot.CrimeRegisteredDate ||
          spot.date ||
          (spot.station
            ? `${spot.station} · ${spot.district || ""}`.trim()
            : undefined)
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {isCrime
                ? t("crimeMap.detail.crimeType")
                : t("crimeMap.crimes.incidentCount")}
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">
              {isCrime
                ? spot.sub_type || spot.crime_type || "—"
                : formatNumber(spot.count || spot.current_count || 1)}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.crimes.gravity")}
            </p>
            <p className="text-sm font-black text-slate-900 mt-1">
              {spot.gravity || "—"}
            </p>
          </div>
        </div>

        {isCrime && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.detail.status")}
                </p>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  {spot.status || "—"}
                </p>
              </div>
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.detail.incidentDate")}
                </p>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  {spot.IncidentFromDate || spot.CrimeRegisteredDate || "—"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.crimes.station")}
                </p>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  {spot.station || "—"}
                </p>
              </div>
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.crimes.district")}
                </p>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  {spot.district || "—"}
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
              <p className="text-[10px] font-medium text-slate-500 mb-1">
                {t("crimeMap.detail.coordinates")}
              </p>
              <p className="text-[11px] font-bold text-slate-900">
                {Number(spot.lat).toFixed?.(4)}, {Number(spot.lng).toFixed?.(4)}
              </p>
            </div>

            {spot.BriefFacts && (
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500 mb-1">
                  {t("crimeMap.detail.briefFacts")}
                </p>
                <p className="text-xs font-medium text-slate-700 leading-relaxed">
                  {spot.BriefFacts}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
        {onOpenPatrol && (spot.sub_type || spot.crime_type) && (
          <button
            onClick={() =>
              onOpenPatrol({
                crimeFocus: getHeadIdForSubType(
                  spot.sub_type || spot.crime_type,
                ),
                crimeLabel: spot.sub_type || spot.crime_type,
                area: spot.district || "",
                timeRange: "night",
                title: `${spot.sub_type || spot.crime_type} — ${spot.district || spot.station || ""}`,
              })
            }
            className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
          >
            <Route className="h-3.5 w-3.5" />
            Patrol: {spot.sub_type || spot.crime_type}
            {spot.district ? ` — ${spot.district}` : ""}
          </button>
        )}
        <button
          onClick={() => {
            const msg = `Analyze this FIR: Crime No ${spot.CrimeNo || "N/A"}, ${spot.sub_type || spot.crime_type || "crime"}, registered ${spot.CrimeRegisteredDate || spot.date || "unknown"}. Status: ${spot.status || "unknown"}. Gravity: ${spot.gravity || "unknown"}. Station: ${spot.station || "unknown"}, District: ${spot.district || "Karnataka"}. Coordinates: ${spot.lat}, ${spot.lng}. Brief facts: ${spot.BriefFacts || "N/A"}. Identify factors and recommend investigation/intervention actions.`;
            navigate("/", { state: { initialMessage: msg } });
          }}
          className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
          </span>{" "}
          {t("crimeMap.askAI.trendAnalysis")}
        </button>
      </div>
    </>
  );
}

TrendPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenPatrol: PropTypes.func,
};

/* ── District Panel ─────────────────────────────────────────────── */

function DistrictPanel({ spot, onClose, onOpenPatrol, enhancedRisk, token }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [socio, setSocio] = useState(null);
  const [weather, setWeather] = useState([]);
  const [poiCount, setPoiCount] = useState(null);

  useEffect(() => {
    if (!token || !spot?.name) return;
    crimeMapApi
      .getSocioEconomic(token, { district: spot.name })
      .then((r) => setSocio((r.data || [])[0] || null))
      .catch(() => {});
    crimeMapApi
      .getWeather(token, { district: spot.name, days: 7 })
      .then((r) => setWeather(r.data || []))
      .catch(() => {});
    crimeMapApi
      .getPOIStats(token)
      .then((r) => {
        const tot = (r.data?.totals || []).find(
          (x) => x.district === spot.name,
        );
        setPoiCount(tot || null);
      })
      .catch(() => {});
  }, [token, spot?.name]);

  const m = spot.multipliers || {};
  const isEnhanced = !!spot.risk_score_enhanced;
  const riskColor =
    spot.risk_level === "CRITICAL"
      ? "text-red-600 bg-red-50 border-red-200"
      : spot.risk_level === "HIGH"
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : spot.risk_level === "MEDIUM"
          ? "text-blue-600 bg-blue-50 border-blue-200"
          : "text-green-600 bg-green-50 border-green-200";

  const crimeNorm = Math.min(100, spot.crime_count * 2);
  const repeatNorm = Math.min(100, spot.repeat_offenders * 3);
  const pendingNorm = Math.min(100, spot.pending_investigations * 2);
  const trendNorm = Math.min(100, Math.max(0, spot.change_pct + 50));

  return (
    <>
      <PanelHeader
        id={`DISTRICT`}
        name={spot.name}
        type="District"
        typeColor="bg-blue-900/90 text-white border-blue-900/90"
        typeIcon={<Shield size={10} />}
        onClose={onClose}
        subtitle={`Rank #${spot.rank || "—"} of 31 districts`}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        <div className={`p-4 rounded-lg border ${riskColor}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                {t("crimeMap.district.operationalRisk")}
              </p>
              <p className="text-3xl font-black mt-0.5">
                {Math.round(spot.risk_score)}
              </p>
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded">
              {spot.risk_level}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.district.crimeCount")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.crime_count)}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.repeatOffenders")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.repeat_offenders)}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.district.pendingInvestigations")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.pending_investigations)}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.district.trend")}
            </p>
            <p
              className={`text-lg font-black ${(spot.change_pct || 0) > 0 ? "text-red-600" : "text-green-600"}`}
            >
              {(spot.change_pct || 0) > 0 ? "+" : ""}
              {spot.change_pct || 0}%
            </p>
          </div>
        </div>

        {spot.top_crime && (
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              Top Crime Category
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {spot.top_crime}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            {t("crimeMap.district.riskBreakdown")}
          </p>
          <div className="space-y-2">
            <RiskBar
              label={t("crimeMap.district.crimeVolume")}
              value={crimeNorm}
            />
            <RiskBar
              label={t("crimeMap.district.repeatOffenders")}
              value={repeatNorm}
            />
            <RiskBar
              label={t("crimeMap.district.pendingCases")}
              value={pendingNorm}
            />
            <RiskBar
              label={t("crimeMap.district.emergingTrend")}
              value={trendNorm}
            />
            {isEnhanced && (
              <>
                <RiskBar
                  label={`Unemployment ${m.unemployment_rate ?? "—"}%`}
                  value={Math.min(
                    100,
                    Math.max(0, 50 + (m.unemployment_bonus || 0) * 4),
                  )}
                />
                <RiskBar
                  label={`POI density (${m.poi_total ?? 0} pts)`}
                  value={Math.min(100, (m.poi_bonus || 0) * 8)}
                />
                {m.weather_bonus ? (
                  <RiskBar
                    label={`Weather (rain ${m.weather_rain_14d_avg}mm)`}
                    value={Math.min(100, (m.weather_bonus || 0) * 20)}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Predictive Intelligence drivers */}
        {isEnhanced && spot.risk_drivers?.length > 0 && (
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Why risk is{" "}
              {spot.risk_level.toLowerCase()} (enhanced)
            </p>
            <ul className="text-xs text-slate-700 space-y-1">
              {spot.risk_drivers.map((d, i) => (
                <li key={i}>• {d}</li>
              ))}
            </ul>
            {spot.risk_score_base != null && (
              <p className="text-[10px] text-slate-500 mt-1">
                Base score {Math.round(spot.risk_score_base)} → Enhanced{" "}
                {Math.round(spot.risk_score)} (Δ{" "}
                {(spot.risk_score - spot.risk_score_base).toFixed(1)})
              </p>
            )}
          </div>
        )}

        {/* ── Socio-Economic Intelligence — Detailed ── */}
        {(() => {
          const s = socio || spot.socio;
          if (!s) {
            return (
              <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-3 text-center">
                <p className="text-xs font-bold text-violet-700 flex items-center justify-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Socio-economic
                  live data pending for {spot.name}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  No row in DistrictSocioEconomic — tap{" "}
                  <span className="font-bold">Refresh Live Data</span> in Layers
                  to ingest OSM + Open-Meteo + data.gov.in for all 31 districts.
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Fallback: state means will show once refreshed. Enhanced risk
                  currently uses base score only.
                </p>
              </div>
            );
          }
          // state averages from enhancedRisk
          const all = (enhancedRisk || []).filter((d) => d.socio);
          const avg = (k) =>
            all.length
              ? all.reduce((a, d) => a + (d.socio[k] || 0), 0) / all.length
              : null;
          const avgUnemp = avg("unemployment_rate");
          const avgLit = avg("literacy_rate");
          const avgDensity = avg("population_density");
          const avgIncome = avg("per_capita_income");
          const delta = (v, av) => (av ? ((v - av) / av) * 100 : 0);
          const dUnemp =
            s.unemployment_rate != null && avgUnemp
              ? delta(s.unemployment_rate, avgUnemp)
              : 0;
          const dLit =
            s.literacy_rate != null && avgLit
              ? delta(s.literacy_rate, avgLit)
              : 0;
          const dDensity =
            s.population_density != null && avgDensity
              ? delta(s.population_density, avgDensity)
              : 0;
          const dIncome =
            s.per_capita_income != null && avgIncome
              ? delta(s.per_capita_income, avgIncome)
              : 0;
          // risk equation
          const base =
            spot.risk_score_base ??
            spot.risk_score -
              (m.unemployment_bonus || 0) -
              (m.poi_bonus || 0) -
              (m.weather_bonus || 0);
          const bonuses = [
            { label: "Base", val: base, color: "bg-slate-800" },
            {
              label: `Unemp ${m.unemployment_rate ?? s.unemployment_rate}%`,
              val: m.unemployment_bonus || 0,
              color: "bg-violet-600",
            },
            {
              label: `POI ${m.poi_total || 0}`,
              val: m.poi_bonus || 0,
              color: "bg-amber-500",
            },
            {
              label: "Weather",
              val: m.weather_bonus || 0,
              color: "bg-sky-500",
            },
          ].filter((b) => b.val !== 0 || b.label === "Base");
          const total = bonuses.reduce((a, b) => a + b.val, 0);
          return (
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black tracking-widest uppercase text-violet-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Socio-Economic
                  Intelligence — Live
                </p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-600 text-white">
                  Year {s.year || new Date().getFullYear()}
                </span>
              </div>

              {/* 4 metrics vs state average */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Unemployment",
                    value: s.unemployment_rate,
                    unit: "%",
                    avg: avgUnemp,
                    delta: dUnemp,
                    inv: true,
                    icon: "◉",
                  },
                  {
                    label: "Literacy",
                    value: s.literacy_rate,
                    unit: "%",
                    avg: avgLit,
                    delta: dLit,
                    inv: false,
                  },
                  {
                    label: "Density",
                    value: s.population_density,
                    unit: "/km²",
                    avg: avgDensity,
                    delta: dDensity,
                  },
                  {
                    label: "Per-capita",
                    value: s.per_capita_income,
                    unit: "₹",
                    avg: avgIncome,
                    delta: dIncome,
                    fmt: (v) => `₹${(v / 1000).toFixed(0)}k`,
                  },
                ].map((metric) => {
                  const isBad = metric.inv
                    ? metric.delta > 8
                    : metric.delta < -8;
                  const isGood = metric.inv
                    ? metric.delta < -8
                    : metric.delta > 8;
                  return (
                    <div
                      key={metric.label}
                      className={`bg-white rounded-lg border p-2.5 ${isBad ? "border-red-200 bg-red-50/40" : isGood ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {metric.label}
                        </p>
                        <span
                          className={`text-[9px] font-black px-1 py-0.5 rounded ${isBad ? "bg-red-700 text-white" : isGood ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
                        >
                          {metric.delta > 0 ? "+" : ""}
                          {metric.delta.toFixed(1)}% vs avg
                        </span>
                      </div>
                      <p className="text-sm font-black text-slate-900 mt-1 tabular-nums">
                        {metric.fmt
                          ? metric.fmt(metric.value)
                          : `${Number(metric.value).toFixed(1)}${metric.unit}`}
                      </p>
                      <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(8, (metric.value / (metric.avg * 1.4)) * 100))}%`,
                            background:
                              metric.label === "Unemployment"
                                ? "#7c3aed"
                                : metric.label === "Literacy"
                                  ? "#0284c7"
                                  : metric.label === "Density"
                                    ? "#334155"
                                    : "#d97706",
                          }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
                          style={{
                            left: `${Math.min(100, Math.max(0, (metric.avg / (metric.avg * 1.4)) * 100))}%`,
                          }}
                          title={`State avg ${metric.avg?.toFixed(1)}`}
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1">
                        State avg{" "}
                        {metric.fmt
                          ? metric.fmt(metric.avg)
                          : `${metric.avg?.toFixed(1)}${metric.unit}`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* How it affects risk — equation */}
              <div className="bg-slate-900 rounded-lg p-3 text-white">
                <p className="text-[9px] font-black tracking-widest uppercase text-violet-300 mb-2">
                  How this district’s economy lifts risk
                </p>
                <div className="flex items-center gap-1 flex-wrap text-xs font-mono">
                  <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
                    {Math.round(base)}
                  </span>
                  {bonuses.slice(1).map((b) => (
                    <span key={b.label} className="flex items-center gap-1">
                      <span className="text-slate-500">+</span>
                      <span
                        className={`px-2 py-1 rounded text-white font-bold ${b.color}`}
                      >
                        {b.val > 0 ? "+" : ""}
                        {b.val.toFixed(1)}{" "}
                        <span className="font-normal text-[10px] opacity-80">
                          {b.label.split(" ")[0]}
                        </span>
                      </span>
                    </span>
                  ))}
                  <span className="text-slate-500">=</span>
                  <span className="px-2.5 py-1 rounded bg-white text-slate-900 font-black">
                    {total.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2.5 flex h-2 rounded-full overflow-hidden bg-slate-800">
                  {bonuses.map((b) => {
                    const w = Math.max(
                      2,
                      (Math.abs(b.val) / Math.max(1, Math.abs(total))) * 100,
                    );
                    return (
                      <div
                        key={b.label}
                        title={`${b.label}: ${b.val.toFixed(1)}`}
                        className={`${b.color}`}
                        style={{ width: `${w}%` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-2 text-[9px] font-bold uppercase tracking-wider">
                  {bonuses.map((b) => (
                    <span key={b.label} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-sm ${b.color}`} />
                      {b.label}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                  {s.unemployment_rate > (avgUnemp || 7)
                    ? `Unemployment ${Number(s.unemployment_rate).toFixed(1)}% is ${dUnemp.toFixed(0)}% above state mean — each +1% adds ~3.5 risk points (this district +${(m.unemployment_bonus || 0).toFixed(1)}).`
                    : `Unemployment below mean cushions risk.`}
                  {s.literacy_rate < (avgLit || 75)
                    ? ` Lower literacy (${Number(s.literacy_rate).toFixed(1)}%) correlates with vulnerability (+${((75 - s.literacy_rate) * 0.15).toFixed(1)}).`
                    : ""}
                  {poiCount?.total
                    ? ` ${poiCount.total} POIs (${poiCount.risk_sum} risk weight) near liquor/ATM clusters amplify opportunity.`
                    : ""}
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] text-slate-500 border-t border-violet-100 pt-2">
                <span>
                  Source:{" "}
                  <span className="font-semibold text-slate-700">
                    {s.source || "data.gov.in + OSM + Open-Meteo"}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{" "}
                  Live —{" "}
                  {s.updated_at
                    ? new Date(s.updated_at).toLocaleDateString()
                    : "today"}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Live POI & Weather */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-[10px] font-medium text-amber-700 flex items-center gap-1">
              <Beer className="h-3 w-3" /> POI Risk Points
            </p>
            {(() => {
              const total = poiCount?.total ?? m.poi_total;
              const liquor = m.poi_liquor ?? 0;
              const hasData = total != null;
              return (
                <>
                  <p className="text-lg font-black text-amber-800">
                    {hasData ? `${total} pts` : "—"}
                  </p>
                  <p className="text-[10px] text-amber-700">
                    {hasData
                      ? liquor
                        ? `${liquor} liquor outlets`
                        : poiCount?.risk_sum
                          ? `Risk sum ${poiCount.risk_sum}`
                          : `${total} POIs — liquor 0`
                      : "Not ingested — Refresh Live Data"}
                  </p>
                  {!hasData && (
                    <button
                      onClick={() =>
                        token &&
                        crimeMapApi
                          .refreshIntelligence(token, { district: spot.name })
                          .then(() => window.location.reload())
                      }
                      className="mt-1 text-[10px] font-bold text-amber-700 underline"
                    >
                      Ingest {spot.name} now
                    </button>
                  )}
                </>
              );
            })()}
          </div>
          <div className="p-3 bg-sky-50 rounded-lg border border-sky-100">
            <p className="text-[10px] font-medium text-sky-700 flex items-center gap-1">
              <CloudRain className="h-3 w-3" /> Weather (14d)
            </p>
            {weather.length ? (
              <>
                <p className="text-xs font-bold text-slate-900">
                  {weather[0].avg_temp?.toFixed?.(1) ??
                    m.weather_temp_14d_avg ??
                    "—"}
                  °C · {weather[0].rainfall ?? m.weather_rain_14d_avg ?? "—"}mm
                  rain
                </p>
                <p className="text-[10px] text-sky-700">
                  {weather.length} days live (Open-Meteo)
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-900">
                  {m.weather_temp_14d_avg ?? "—"}°C ·{" "}
                  {m.weather_rain_14d_avg ?? "—"}mm
                </p>
                <p className="text-[10px] text-slate-500">Open-Meteo live</p>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() =>
            onOpenPatrol({
              crimeFocus: getHeadIdForSubType(spot.top_crime),
              crimeLabel: spot.top_crime,
              area: spot.name,
              timeRange: "night",
              title: `${spot.top_crime || "All crimes"} in ${spot.name}`,
            })
          }
          className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
        >
          <Route className="h-3.5 w-3.5" />
          {spot.top_crime
            ? `Patrol: ${spot.top_crime} — ${spot.name}`
            : `${t("crimeMap.generatePatrolPlan")} — ${spot.name}`}
        </button>
        <button
          onClick={() => {
            const drivers = (spot.risk_drivers || []).join("; ");
            const se = socio
              ? `Unemployment ${socio.unemployment_rate}%, Density ${socio.population_density}/km², Income ₹${socio.per_capita_income}, Literacy ${socio.literacy_rate}%`
              : "";
            const poi = `POIs: ${m.poi_total ?? "N/A"} (${m.poi_liquor ?? 0} liquor)`;
            const wx = `Weather 14d avg: ${m.weather_rain_14d_avg ?? "N/A"}mm rain, ${m.weather_temp_14d_avg ?? "N/A"}°C`;
            const msg = `Provide a deep dive analysis of crime in ${spot.name} district. Enhanced risk score: ${Math.round(spot.risk_score)} (${spot.risk_level}) base ${spot.risk_score_base ? Math.round(spot.risk_score_base) : "N/A"}. Crime count: ${spot.crime_count}. Repeat offenders: ${spot.repeat_offenders}. Pending: ${spot.pending_investigations}. Trend: ${(spot.change_pct || 0) > 0 ? "+" : ""}${spot.change_pct || 0}%. Top crime: ${spot.top_crime || "N/A"}. Rank: ${spot.rank || "N/A"}.\nLive drivers: ${drivers || "None"}\nSocio-economic (live): ${se}\n${poi}\n${wx}\nCorrelate socio-economic unemployment, POI liquor/ATM density, and monsoon/heat weather with the crime pattern and recommend targeted patrols near liquor/ATM clusters and socio interventions.`;
            navigate("/", { state: { initialMessage: msg } });
          }}
          className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
          </span>{" "}
          {t("crimeMap.askAI.districtAnalysis")}
        </button>
      </div>
    </>
  );
}

DistrictPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenPatrol: PropTypes.func.isRequired,
  enhancedRisk: PropTypes.array,
  token: PropTypes.string,
};

function RiskBar({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-slate-600">
          {label}
        </span>
        <span className="text-[10px] font-bold text-slate-900">
          {Math.round(value)}/100
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-900/90 rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

RiskBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
};

function POIPanel({ spot, onClose, onOpenPatrol }) {
  const navigate = useNavigate();
  const typeColor =
    {
      Liquor_Store: "bg-amber-50 text-amber-800 border-amber-200",
      ATM: "bg-blue-50 text-blue-700 border-blue-200",
      Bank: "bg-violet-50 text-violet-700 border-violet-200",
      Bus_Stop: "bg-emerald-50 text-emerald-700 border-emerald-200",
      Railway_Station: "bg-red-50 text-red-700 border-red-200",
    }[spot.poi_type] || "bg-slate-50 text-slate-700 border-slate-200";
  const riskNote =
    spot.risk_weight >= 5
      ? "High-crime attractor — prioritize patrol"
      : spot.risk_weight === 3
        ? "Moderate risk — check CCTV"
        : "Baseline infrastructure";
  return (
    <>
      <PanelHeader
        id={`POI`}
        name={spot.name}
        type={spot.poi_type?.replace("_", " ")}
        typeColor={typeColor}
        typeIcon={<MapPin size={10} />}
        onClose={onClose}
        subtitle={`${spot.district || ""} · Risk weight ${spot.risk_weight ?? "—"} · ${riskNote}`}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        <div className={`p-3 rounded-lg border ${typeColor}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            Infrastructure Risk
          </p>
          <p className="text-sm font-bold mt-1">{riskNote}</p>
          <p className="text-[11px] mt-1 opacity-80">
            Live data via OpenStreetMap Overpass · OSM ID {spot.id}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] text-slate-500">Coordinates</p>
            <p className="text-xs font-bold">
              {Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] text-slate-500">District</p>
            <p className="text-xs font-bold">{spot.district || "—"}</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
            Predictive Insight
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {spot.poi_type === "Liquor_Store" &&
              "Liquor outlets correlate with brawls & public order offences — recommend evening beat near this POI."}
            {spot.poi_type === "ATM" &&
              "ATMs attract property crime — toggle ATM layer with crime heatmap to spot robbery clusters."}
            {spot.poi_type === "Bus_Stop" &&
              "Transit hubs see chain snatching & theft — align patrol with peak commute."}
            {spot.poi_type === "Bank" &&
              "Banks are economic-offence hotspots — coordinate with EOW."}
            {spot.poi_type === "Railway_Station" &&
              "Stations funnel inter-district movement — check repeat offender transit."}
          </p>
        </div>
        <button
          onClick={() =>
            onOpenPatrol &&
            onOpenPatrol({
              area: spot.district || "",
              crimeFocus:
                spot.poi_type === "Liquor_Store"
                  ? 4
                  : spot.poi_type === "ATM"
                    ? 2
                    : null,
              crimeLabel:
                spot.poi_type === "Liquor_Store"
                  ? "Public Order"
                  : spot.poi_type === "ATM"
                    ? "Theft"
                    : null,
              timeRange: "evening",
              title: `POI patrol · ${spot.name}`,
            })
          }
          className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
            <Route className="h-3.5 w-3.5" />
          </span>{" "}
          Patrol near this POI
        </button>
        <button
          onClick={() => {
            const msg = `Analyze this POI in Karnataka crime context: Type ${spot.poi_type}, Name ${spot.name}, District ${spot.district}, Coords ${spot.lat},${spot.lng}, Risk weight ${spot.risk_weight}. Explain its criminogenic relevance and suggest mitigation.`;
            navigate("/", { state: { initialMessage: msg } });
          }}
          className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
          </span>{" "}
          Ask AI about this POI
        </button>
      </div>
    </>
  );
}
POIPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenPatrol: PropTypes.func,
};

/* ── Cluster / Hotspot Panel ────────────────────────────────────── */

function ClusterPanel({ spot, detail, onClose, onOpenPatrol }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const displayName =
    detail?.dominant_crime && detail.dominant_crime !== "N/A"
      ? `${detail.dominant_crime} Cluster`
      : spot.name;
  return (
    <>
      <PanelHeader
        id={`CLS`}
        name={displayName}
        type="Hotspot"
        typeColor="bg-red-700 text-white border-red-700"
        typeIcon={<AlertTriangle size={10} />}
        onClose={onClose}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        {detail ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.cluster.totalIncidents")}
                </p>
                <p className="text-lg font-black text-slate-900">
                  {formatNumber(detail.crime_count)}
                </p>
              </div>
              <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.cluster.peakWindow")}
                </p>
                <p className="text-xs font-bold text-slate-900 mt-1.5">
                  {detail.peak_time}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-center">
                <p className="text-lg font-black text-amber-700">
                  {detail.repeat_offenders}
                </p>
                <p className="text-[10px] font-semibold text-amber-600">
                  {t("crimeMap.summary.repeatOffenders")}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <p className="text-lg font-black text-blue-700">
                  {detail.linked_investigations}
                </p>
                <p className="text-[10px] font-semibold text-blue-600">
                  {t("crimeMap.cluster.linkedCases")}
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-center">
                <p className="text-lg font-black text-purple-700">
                  {detail.active_networks}
                </p>
                <p className="text-[10px] font-semibold text-purple-600">
                  {t("crimeMap.cluster.networks")}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                {t("crimeMap.cluster.crimeBreakdown")}
              </p>
              <div className="space-y-1">
                {(detail.top_crimes || []).slice(0, 5).map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-100 rounded-lg"
                  >
                    <span className="text-xs font-semibold text-slate-700">
                      {c.CrimeGroupName}
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {c.cnt}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {detail.stations?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {t("crimeMap.cluster.nearbyStations")}
                </p>
                <div className="flex flex-wrap gap-1">
                  {detail.stations.map((s) => (
                    <span
                      key={s.id}
                      className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.risk_factors?.length > 0 && (
              <div className="bg-[#EFF6FF] border border-blue-100 rounded-xl p-3.5 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Zap size={14} className="text-blue-600" />
                  <span className="text-[10px] font-bold text-blue-900 uppercase tracking-[0.08em]">
                    {t("crimeMap.cluster.whyGrowing")}
                  </span>
                </div>
                <ul className="text-xs text-slate-700 space-y-1">
                  {detail.risk_factors.map((f, i) => (
                    <li key={i}>
                      • <strong>{f}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-sm text-slate-400">
            <Loader2 className="h-6 w-6 mx-auto mb-2 text-blue-500 animate-spin" />
            <p className="text-xs">{t("crimeMap.loadingCluster")}</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 flex flex-col gap-2 bg-white">
        <button
          onClick={() => {
            const dominant = detail?.dominant_crime || spot.dominant_crime;
            onOpenPatrol({
              crimeFocus: getHeadIdForSubType(dominant),
              crimeLabel: dominant,
              area: "",
              timeRange: peakToTimeRange(detail?.peak_time),
              title: dominant ? `${dominant} hotspot` : "Cluster hotspot",
            });
          }}
          className="w-full py-2.5 px-4 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-red-800 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-700"
        >
          <Route className="h-3.5 w-3.5" />
          {detail?.dominant_crime || spot.dominant_crime
            ? `Patrol: ${detail?.dominant_crime || spot.dominant_crime} hotspot`
            : t("crimeMap.generatePatrolPlan")}
        </button>
        {detail && (
          <button
            onClick={() => {
              const topCrimes = (detail.top_crimes || [])
                .map((c) => `${c.CrimeGroupName}: ${c.cnt}`)
                .join(", ");
              const stations = (detail.stations || [])
                .map((s) => s.name)
                .join(", ");
              const risks = (detail.risk_factors || []).join("; ");
              const msg = `Provide a deep dive analysis of this crime hotspot. Total incidents: ${detail.crime_count}. Peak time: ${detail.peak_time}. Repeat offenders: ${detail.repeat_offenders}. Linked investigations: ${detail.linked_investigations}. Active networks: ${detail.active_networks}. Top crimes: ${topCrimes || "N/A"}. Nearby stations: ${stations || "N/A"}. Risk factors: ${risks || "N/A"}. Identify patterns, correlations between risk factors, and recommend enforcement actions.`;
              navigate("/", { state: { initialMessage: msg } });
            }}
            className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
            </span>{" "}
            {t("crimeMap.askAI.clusterAnalysis")}
          </button>
        )}
      </div>
    </>
  );
}

ClusterPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  detail: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onOpenPatrol: PropTypes.func.isRequired,
};

/* ── Network Panel ──────────────────────────────────────────────── */

function NetworkPanel({ spot, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <PanelHeader
        id={spot.network_name || "NET"}
        name={spot.network_name || "Network"}
        type="Network"
        typeColor="bg-red-700 text-white border-red-700"
        typeIcon={<Users size={10} />}
        onClose={onClose}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.network.members")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {spot.member_count}
            </p>
          </div>
          <div className="p-3 bg-[#F4F6F9] rounded-xl border border-[#E5E7EB]">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.network.totalFirs")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {spot.total_firs}
            </p>
          </div>
        </div>

        <div
          className={`p-3 rounded-lg border ${
            spot.risk === "High"
              ? "bg-red-50 border-red-200"
              : spot.risk === "Medium"
                ? "bg-amber-50 border-amber-200"
                : "bg-green-50 border-green-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
              {t("crimeMap.network.networkRisk")}
            </span>
            <span
              className={`text-xs font-black px-2 py-0.5 rounded ${
                spot.risk === "High"
                  ? "bg-red-100 text-red-700"
                  : spot.risk === "Medium"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
              }`}
            >
              {spot.risk}
            </span>
          </div>
        </div>

        {spot.districts?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              {t("crimeMap.network.districtsCovered")}
            </p>
            <div className="flex flex-wrap gap-1">
              {spot.districts.map((d) => (
                <span
                  key={d}
                  className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {spot.members?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              {t("crimeMap.network.topMembers")}
            </p>
            <div className="space-y-1">
              {spot.members.slice(0, 8).map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-100 rounded-lg"
                >
                  <span className="text-xs font-semibold text-slate-700">
                    {m.name}
                  </span>
                  <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                    {m.firs} FIRs
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 flex flex-col gap-2 bg-white">
        <button
          onClick={() => navigate("/networks")}
          className="w-full py-3 bg-red-700 text-white rounded-full text-xs font-bold hover:bg-[#991b1b] transition-colors shadow-sm"
        >
          <Users className="h-3.5 w-3.5 inline mr-1.5" />{" "}
          {t("crimeMap.network.openInNetworks")}
        </button>
        <button
          onClick={() => {
            const members = (spot.members || [])
              .slice(0, 8)
              .map((m) => `${m.name} (${m.firs} FIRs)`)
              .join(", ");
            const districts = (spot.districts || []).join(", ");
            const msg = `Provide a deep dive analysis of the criminal network "${spot.network_name}". Members: ${spot.member_count}. Total FIRs: ${spot.total_firs}. Risk level: ${spot.risk}. Districts covered: ${districts || "N/A"}. Top members: ${members || "N/A"}. Identify key operatives, communication patterns, operational structure, and recommend disruption strategies.`;
            navigate("/", { state: { initialMessage: msg } });
          }}
          className="group w-full py-2.5 px-4 bg-white border border-[#DDE3EC] text-[#1A1A2E] rounded-full text-xs font-bold hover:border-blue-900/90 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
            <Sparkles className="h-3.5 w-3.5" />
          </span>{" "}
          {t("crimeMap.askAI.networkAnalysis")}
        </button>
      </div>
    </>
  );
}

NetworkPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
};

/* ── Patrol Planner Modal ───────────────────────────────────────── */

function PatrolModal({ token, selectedSpot, initialContext, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState(
    initialContext?.timeRange || "night",
  );
  const [units, setUnits] = useState(6);
  const [crimeFocus, setCrimeFocus] = useState(
    initialContext?.crimeFocus ?? null,
  );
  const [area, setArea] = useState(initialContext?.area || "");
  const [districts, setDistricts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [prevention, setPrevention] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (initialContext?.crimeFocus != null)
      setCrimeFocus(initialContext.crimeFocus);
    if (initialContext?.area) setArea(initialContext.area);
    if (initialContext?.timeRange) setTimeRange(initialContext.timeRange);
  }, [initialContext]);

  useEffect(() => {
    if (!token) return;
    crimeMapApi
      .getFilters(token)
      .then((r) => {
        setDistricts(r.data?.districts || []);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    // fallback to selectedSpot if no explicit context
    if (initialContext?.area) return;
    if (selectedSpot?.name && districts.length) {
      const match = districts.find(
        (d) =>
          d.DistrictName.toLowerCase().includes(
            selectedSpot.name.toLowerCase(),
          ) ||
          selectedSpot.name
            .toLowerCase()
            .includes(d.DistrictName.toLowerCase()),
      );
      if (match) setArea(match.DistrictName);
    }
    if (initialContext?.crimeFocus == null && selectedSpot?.top_crime) {
      const hid = getHeadIdForSubType(selectedSpot.top_crime);
      if (hid) setCrimeFocus(hid);
    }
  }, [selectedSpot, districts, initialContext]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const crimeLabel =
        initialContext?.crimeLabel ||
        (crimeFocus
          ? getCrimeHeads(t).find((c) => String(c.id) === String(crimeFocus))
              ?.label
          : null) ||
        null;
      const res = await crimeMapApi.getPreventionPlan(token, {
        crime_label: crimeLabel || undefined,
        area: area || undefined,
        time_range: timeRange,
        units,
      });
      const payload = res.data || {};
      setPrevention(payload.advisory || null);
      setStats(payload.stats || null);
      setRoutes(payload.routes || []);
      setGenerated(true);
    } catch (e) {
      console.error("Prevention plan failed", e);
      // fallback to legacy patrol
      try {
        const res2 = await crimeMapApi.getPatrolPlan(token, {
          time_range: timeRange,
          units,
          crime_focus: crimeFocus || undefined,
          area: area || undefined,
        });
        setRoutes(res2.data || []);
        setGenerated(true);
      } catch (e2) {
        console.error("Legacy patrol fallback failed", e2);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Patrol Plan", 14, 20);
    doc.setFontSize(10);
    doc.text(
      `Time: ${getTimeOptions(t).find((opt) => opt.value === timeRange)?.label} | Units: ${units} | Area: ${area || t("crimeMap.patrol.allDistricts")}`,
      14,
      28,
    );
    doc.autoTable({
      startY: 34,
      head: [
        [
          "Officer",
          "Station",
          "District",
          "Score",
          "Crimes",
          "Repeat",
          "Heinous",
          "Reason",
        ],
      ],
      body: routes.map((r) => [
        r.officer_label,
        r.station,
        r.district,
        r.priority_score,
        r.crime_density,
        r.repeat_offenders,
        r.gravity_cases,
        r.reason,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save("patrol-plan.pdf");
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      routes.map((r) => ({
        Officer: r.officer_label,
        Station: r.station,
        District: r.district,
        Score: r.priority_score,
        Crimes: r.crime_density,
        "Repeat Offenders": r.repeat_offenders,
        "Heinous Cases": r.gravity_cases,
        Reason: r.reason,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patrol Plan");
    XLSX.writeFile(wb, "patrol-plan.xlsx");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-[#E5E7EB] bg-[#FAFBFC] flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold text-blue-900 uppercase tracking-[0.08em]">
              {t("crimeMap.patrol.title")}
            </span>
            <h2 className="text-base font-bold text-[#1A1A2E] mt-0.5">
              {t("crimeMap.patrol.subtitle")}
            </h2>
            {initialContext?.crimeLabel && (
              <p className="text-xs font-bold text-white bg-blue-900/90 border border-blue-900/90 rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 mt-2">
                <Shield className="h-3 w-3" />
                {initialContext.crimeLabel}
                {initialContext.area ? ` · ${initialContext.area}` : ""}
                {initialContext.timeRange
                  ? ` · ${getTimeOptions(t).find((o) => o.value === initialContext.timeRange)?.label || initialContext.timeRange}`
                  : ""}
              </p>
            )}
            {initialContext?.title && !initialContext?.crimeLabel && (
              <p className="text-xs text-slate-500 mt-1">
                {initialContext.title}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-slate-500 hover:bg-slate-50 hover:text-[#1A1A2E] transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-5">
          {!generated ? (
            <>
              <div>
                <label className="text-[11px] font-bold text-[#1A1A2E] uppercase tracking-wide mb-2 block">
                  {t("crimeMap.patrol.timeOfDay")}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {getTimeOptions(t).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeRange(opt.value)}
                      className={`p-2.5 rounded-xl border text-center transition-colors ${
                        timeRange === opt.value
                          ? "bg-blue-900/90 border-blue-900/90 text-white shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-xs font-bold">{opt.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {opt.sub}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1A1A2E] uppercase tracking-wide mb-2 block">
                  {t("crimeMap.patrol.unitsAvailable")}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setUnits(Math.max(1, units - 1))}
                    className="w-8 h-8 rounded-full border border-[#DDE3EC] bg-white flex items-center justify-center text-[#1A1A2E] hover:border-[#1A1A2E] hover:bg-slate-50 font-bold transition"
                  >
                    -
                  </button>
                  <span className="text-xl font-black text-[#1A1A2E] w-8 text-center">
                    {units}
                  </span>
                  <button
                    onClick={() => setUnits(Math.min(20, units + 1))}
                    className="w-8 h-8 rounded-full border border-[#DDE3EC] bg-white flex items-center justify-center text-[#1A1A2E] hover:border-[#1A1A2E] hover:bg-slate-50 font-bold transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1A1A2E] uppercase tracking-wide mb-2 block">
                  {t("crimeMap.patrol.crimeFocus")}
                </label>
                <select
                  value={crimeFocus || ""}
                  onChange={(e) => setCrimeFocus(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDE3EC] text-sm text-[#1A1A2E] bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900"
                >
                  {getCrimeHeads(t).map((ch) => (
                    <option key={ch.id ?? "all"} value={ch.id ?? ""}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1A1A2E] uppercase tracking-wide mb-2 block">
                  {t("crimeMap.patrol.area")}
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDE3EC] text-sm text-[#1A1A2E] bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900"
                >
                  <option value="">{t("crimeMap.patrol.allDistricts")}</option>
                  {districts.map((d) => (
                    <option key={d.DistrictID} value={d.DistrictName}>
                      {d.DistrictName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {/* Advisory — tailored to crime category */}
              {prevention && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        prevention.deployment_type === "cyber_cell"
                          ? "bg-violet-50 text-violet-700 border-violet-200"
                          : prevention.deployment_type === "women_safety"
                            ? "bg-pink-50 text-pink-700 border-pink-200"
                            : prevention.deployment_type === "economic_cell"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : prevention.deployment_type === "public_order"
                                ? "bg-orange-50 text-orange-700 border-orange-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {prevention.deployment_type?.replace("_", " ")}
                    </span>
                    <button
                      onClick={() => {
                        setGenerated(false);
                        setRoutes([]);
                        setPrevention(null);
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      {t("crimeMap.patrol.reconfigure")}
                    </button>
                  </div>

                  {stats && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          {t("crimeMap.district.crimeCount")}
                        </p>
                        <p className="text-lg font-black text-slate-900">
                          {stats.total_30d}
                        </p>
                        <p
                          className={`text-[10px] font-bold ${stats.change_pct > 0 ? "text-red-600" : "text-emerald-600"}`}
                        >
                          {stats.change_pct > 0 ? "+" : ""}
                          {stats.change_pct}%
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          {t("crimeMap.cluster.peakWindow")}
                        </p>
                        <p className="text-xs font-bold text-slate-900 mt-1">
                          {stats.peak_time}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          {t("crimeMap.summary.repeatOffenders")}
                        </p>
                        <p className="text-lg font-black text-slate-900">
                          {stats.repeat_offenders}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3.5">
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">
                      Threat Summary
                    </p>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">
                      {prevention.threat_summary}
                    </p>
                    {prevention.why_this_deployment && (
                      <p className="text-[11px] text-slate-600 mt-2 bg-white border border-blue-100 rounded-lg px-2.5 py-1.5">
                        <span className="font-bold">Why</span>{" "}
                        {prevention.why_this_deployment}
                      </p>
                    )}
                    {prevention.physical_patrol_note && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                        {prevention.physical_patrol_note}
                      </p>
                    )}
                  </div>

                  {prevention.immediate_actions?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Immediate Actions
                      </p>
                      <div className="space-y-2">
                        {prevention.immediate_actions.map((a, i) => (
                          <div
                            key={i}
                            className="bg-white border border-slate-200 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-800">
                                {a.title}
                              </span>
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded ${a.priority === "High" ? "bg-red-100 text-red-700" : a.priority === "Medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                              >
                                {a.priority}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{a.detail}</p>
                            {a.where && (
                              <p className="text-[10px] text-slate-500 mt-1">
                                ↳ {a.where}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {prevention.preventive_measures?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Preventive Measures
                      </p>
                      <div className="space-y-1.5">
                        {prevention.preventive_measures.map((p, i) => (
                          <div
                            key={i}
                            className="flex gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"
                          >
                            <Shield className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-700">
                                {p.title}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {p.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {prevention.metrics_to_track?.length > 0 && (
                    <div className="bg-slate-900 text-slate-100 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Metrics to Track
                      </p>
                      <ul className="text-xs space-y-1">
                        {prevention.metrics_to_track.map((m, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-emerald-400">•</span>
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Physical routes — only when deployment is physical */}
              {(() => {
                const isPhysical =
                  !prevention ||
                  [
                    "physical_patrol",
                    "property_patrol",
                    "homicide_prevention",
                    "public_order",
                    "assault_prevention",
                  ].includes(prevention.deployment_type);
                if (!isPhysical)
                  return (
                    <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                      Physical patrol limited — focus on specialized cell
                      deployment above. Routes omitted.
                    </p>
                  );
                if (!routes.length) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {routes.length} {t("crimeMap.patrol.routesGenerated")}
                    </p>
                    {routes.map((r, i) => (
                      <div
                        key={i}
                        className="bg-white border border-slate-200 rounded-lg p-3.5 hover:border-blue-200 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-bold text-sm text-slate-800">
                              {r.officer_label}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {r.station} · {r.district}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.priority_score >= 200 ? "bg-red-100 text-red-700" : r.priority_score >= 100 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}
                          >
                            {t("crimeMap.patrol.score", {
                              count: r.priority_score,
                            })}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-1.5">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {
                            getTimeOptions(t).find(
                              (opt) => opt.value === timeRange,
                            )?.label
                          }{" "}
                          {t("crimeMap.patrol.shift")}
                        </p>
                        <p className="text-xs text-slate-600 font-medium">
                          {r.reason}
                        </p>
                        <div className="flex gap-3 mt-2 text-[10px]">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                            {r.crime_density} crimes
                          </span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                            {r.repeat_offenders} repeat
                          </span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                            {r.gravity_cases} heinous
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-white">
          {!generated ? (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-2.5 bg-blue-900/90 text-white rounded-full text-xs font-bold hover:bg-blue-900 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : initialContext?.crimeLabel
                  ?.toLowerCase()
                  .includes("cyber") ? (
                <Shield className="h-4 w-4" />
              ) : (
                <Route className="h-4 w-4" />
              )}
              {loading
                ? t("crimeMap.patrol.generating")
                : initialContext?.crimeLabel
                  ? `Generate ${initialContext.crimeLabel} Response Plan`
                  : t("crimeMap.generatePatrolPlan")}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                className="flex-1 py-2.5 bg-orange-300 text-slate-900 rounded-sm text-xs font-bold hover:bg-orange-400 transition-colors shadow-sm flex items-center justify-center gap-1.5 border border-orange-300"
              >
                <FileText className="h-3.5 w-3.5" />{" "}
                {t("crimeMap.patrol.exportPdf")}
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 py-2.5 bg-orange-300 text-slate-900 rounded-sm text-xs font-bold hover:bg-orange-400 transition-colors shadow-sm flex items-center justify-center gap-1.5 border border-orange-300"
              >
                <Download className="h-3.5 w-3.5" />{" "}
                {t("crimeMap.patrol.exportExcel")}
              </button>
              <button
                onClick={() => {
                  const timeLabel = getTimeOptions(t).find(
                    (opt) => opt.value === timeRange,
                  )?.label;
                  const crimeLabel =
                    initialContext?.crimeLabel ||
                    getCrimeHeads(t).find(
                      (c) => String(c.id) === String(crimeFocus),
                    )?.label ||
                    "All Crimes";
                  const routeSummary = routes
                    .map(
                      (r) =>
                        `${r.officer_label} at ${r.station} (${r.district}) — Score: ${r.priority_score}, Crimes: ${r.crime_density}`,
                    )
                    .join("\n");
                  const adv = prevention
                    ? `Advisory: ${prevention.threat_summary} Deployment: ${prevention.deployment_type}. Immediate: ${prevention.immediate_actions?.map((a) => a.title).join(", ")}`
                    : "";
                  const msg = `Analyze this prevention & response plan for ${crimeLabel} in ${area || "All Districts"}.\n\nParameters: Time: ${timeLabel} | Units: ${units} | Crime: ${crimeLabel}\nStats: ${JSON.stringify(stats)}\n${adv}\n\nRoutes (${routes.length}):\n${routeSummary}\n\nAssess effectiveness, gaps, and suggest adjustments tailored to this crime category.`;
                  navigate("/", { state: { initialMessage: msg } });
                }}
                className="flex-1 py-2.5 group bg-white border border-[#E5E7EB] text-slate-800 rounded-2xl hover:border-red-200 hover:bg-red-50/40 text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-700 transition-colors">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>{" "}
                {t("crimeMap.askAI.patrolInsights")}
              </button>
              {/* <button
                onClick={onClose}
                className="py-2.5 px-4 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors shadow-sm"
              >
                {t("crimeMap.patrol.close")}
              </button> */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

PatrolModal.propTypes = {
  token: PropTypes.string.isRequired,
  selectedSpot: PropTypes.object,
  initialContext: PropTypes.object,
  onClose: PropTypes.func.isRequired,
};

/* ── Shared Panel Header ────────────────────────────────────────── */

function PanelHeader({
  id,
  name,
  type,
  typeColor,
  typeIcon,
  onClose,
  subtitle,
}) {
  return (
    <div className="p-4 border-b border-[#E5E7EB] bg-[#FAFBFC] flex justify-between items-start shrink-0">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-[#6B7280] ksp-mono">
            {id}
          </span>
          <span
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] flex items-center gap-1 border ${typeColor}`}
          >
            {typeIcon} {type.toUpperCase()}
          </span>
        </div>
        <h2 className="text-base font-bold text-[#1A1A2E]">{name}</h2>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-slate-500 hover:bg-slate-50 hover:text-[#1A1A2E] transition"
      >
        <X size={14} />
      </button>
    </div>
  );
}

PanelHeader.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  typeColor: PropTypes.string.isRequired,
  typeIcon: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
  subtitle: PropTypes.string,
};

/* ── Suggestion ─────────────────────────────────────────────────── */

function Suggestion({ text }) {
  return (
    <div className="w-full text-left px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-medium shadow-sm">
      {text}
    </div>
  );
}

Suggestion.propTypes = { text: PropTypes.string.isRequired };
