import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DeckGL from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import { ScatterplotLayer, GeoJsonLayer, LineLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AlertTriangle,
  X,
  Loader2,
  Users,
  Route,
  Target,
  TrendingUp,
  TrendingDown,
  Shield,
  Clock,
  Zap,
  Download,
  FileText,
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

  const [viewState, setViewState] = useState({
    longitude: 75.7139,
    latitude: 15.3173,
    zoom: 7.5,
    pitch: 0,
    bearing: 0,
  });

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const sRes = await crimeMapApi.getSummary(token);
        setSummary(sRes.data);
      } catch (e) {
        console.error("Failed to load summary", e);
      } finally {
        setLoading((prev) => ({ ...prev, summary: false }));
      }
    })();
  }, [token]);

  const handleSelectSpot = useCallback((spot) => {
    setSelectedSpot(spot);
    setHotspotDetail(null);
  }, []);

  const handleClusterClick = useCallback(
    (lat, lng) => {
      crimeMapApi
        .getClusterIntel(token, lat, lng)
        .then((r) => setHotspotDetail(r.data))
        .catch(() => {});
    },
    [token],
  );

  return (
    <div className="flex h-full bg-slate-50 text-slate-900 font-sans">
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
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm">
              <Route className="h-4 w-4" /> {t("crimeMap.generatePatrolPlan")}
            </button> */}
          </div>

          <div className="flex-1 flex gap-4 min-h-0 relative">
            <div className="flex-1 bg-slate-200 rounded-xl border border-slate-200 relative overflow-hidden shadow-inner flex flex-col">
              <MapView
                viewState={viewState}
                onViewStateChange={setViewState}
                viewMode={viewMode}
                showNetworks={showNetworks}
                onSelectSpot={handleSelectSpot}
                onClusterClick={handleClusterClick}
                token={token}
              />

              <LayerSwitcher
                viewMode={viewMode}
                onModeChange={(m) => {
                  setViewMode(m);
                  setSelectedSpot(null);
                  setHotspotDetail(null);
                }}
                showNetworks={showNetworks}
                onToggleNetworks={() => setShowNetworks(!showNetworks)}
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
              onOpenPatrol={() => setShowPatrolModal(true)}
            />
          </div>
        </div>
      </main>

      {showPatrolModal && (
        <PatrolModal
          token={token}
          selectedSpot={selectedSpot}
          onClose={() => setShowPatrolModal(false)}
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

  return (
    <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md border border-slate-200 p-1 flex flex-col gap-1 z-10 w-44">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
        {t("crimeMap.layers.title")}
      </span>
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors flex items-center gap-2 ${
            viewMode === id
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Icon className="h-3 w-3" /> {label}
        </button>
      ))}
      <div className="border-t border-slate-100 mt-1 pt-1">
        <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer">
          <input
            type="checkbox"
            checked={showNetworks}
            onChange={onToggleNetworks}
            className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5"
          />
          <span className="text-xs font-medium text-slate-700">
            <Users className="h-3 w-3 inline mr-1" />{" "}
            {t("crimeMap.layers.networkOverlay")}
          </span>
        </label>
      </div>
    </div>
  );
}

LayerSwitcher.propTypes = {
  viewMode: PropTypes.string.isRequired,
  onModeChange: PropTypes.func.isRequired,
  showNetworks: PropTypes.bool.isRequired,
  onToggleNetworks: PropTypes.func.isRequired,
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
}) {
  const [heatmapTrends, setHeatmapTrends] = useState([]);
  const [clusterData, setClusterData] = useState([]);
  const [districtRisk, setDistrictRisk] = useState([]);
  const [networkOverlay, setNetworkOverlay] = useState([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [heatRes, clusterRes, districtRes, netRes] = await Promise.all([
          crimeMapApi.getHeatmapTrends(token),
          crimeMapApi.getClusters(token),
          crimeMapApi.getDistrictRisk(token),
          crimeMapApi.getNetworkOverlayEnhanced(token),
        ]);
        setHeatmapTrends(heatRes.data || []);
        setClusterData(clusterRes.data || []);
        setDistrictRisk(districtRes.data || []);
        setNetworkOverlay(netRes.data || []);
      } catch (e) {
        console.error("Map fetch error", e);
      }
    })();
  }, [token]);

  const trendLayerData = useMemo(
    () =>
      heatmapTrends.map((d) => ({
        coordinates: [d.lng, d.lat],
        change_pct: d.change_pct,
        current_count: d.current_count,
        previous_count: d.previous_count,
      })),
    [heatmapTrends],
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
          risk_level: d.risk_level,
          crime_count: d.crime_count,
          repeat_offenders: d.repeat_offenders,
          pending_investigations: d.pending_investigations,
          change_pct: d.change_pct,
          top_crime: d.top_crime,
          rank: d.rank,
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

    if (viewMode === "Heatmap" && trendLayerData.length) {
      activeLayers.push(
        new HeatmapLayer({
          id: "trend-heatmap",
          data: trendLayerData,
          getPosition: (d) => d.coordinates,
          getWeight: (d) => Math.max(1, Math.abs(d.change_pct)),
          radiusPixels: 60,
          intensity: 1.2,
          threshold: 0.05,
          colorRange: [
            [99, 102, 241],
            [168, 85, 247],
            [239, 68, 68],
            [220, 38, 38],
            [127, 29, 29],
          ],
          aggregation: "SUM",
        }),
      );

      activeLayers.push(
        new ScatterplotLayer({
          id: "trend-scatter",
          data: trendLayerData,
          getPosition: (d) => d.coordinates,
          getRadius: 6,
          getFillColor: (d) => {
            if (d.change_pct > 20) return [220, 38, 38, 255];
            if (d.change_pct > 10) return [239, 88, 60, 255];
            if (d.change_pct > 5) return [245, 158, 11, 255];
            if (d.change_pct > 0) return [250, 204, 21, 255];
            if (d.change_pct < -5) return [34, 197, 94, 255];
            return [250, 204, 21, 200];
          },
          radiusMinPixels: 4,
          radiusMaxPixels: 8,
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              const d = info.object;
              onSelectSpot({
                id: `TREND-${d.coordinates[1].toFixed(2)}-${d.coordinates[0].toFixed(2)}`,
                name: `Trend Area`,
                type: "Trend",
                change_pct: d.change_pct,
                current_count: d.current_count,
                previous_count: d.previous_count,
                lat: d.coordinates[1],
                lng: d.coordinates[0],
              });
            }
          },
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
          lineWidthMinPixels: 2,
          getFillColor: (d) => {
            const score = d.properties.risk_score || 0;
            if (score >= 75) return [220, 38, 38, 60];
            if (score >= 50) return [245, 158, 11, 50];
            if (score >= 25) return [59, 130, 246, 40];
            return [34, 197, 94, 30];
          },
          getLineColor: (d) => {
            const score = d.properties.risk_score || 0;
            if (score >= 75) return [185, 28, 28, 255];
            if (score >= 50) return [180, 83, 9, 255];
            if (score >= 25) return [37, 99, 235, 255];
            return [21, 128, 61, 255];
          },
          getLineWidth: 2,
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

    if (showNetworks && networkOverlay.length) {
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

    return activeLayers;
  }, [
    viewMode,
    trendLayerData,
    clusterLayerData,
    districtGeoJson,
    showNetworks,
    networkOverlay,
    networkEdges,
    onSelectSpot,
    onClusterClick,
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
};

/* ── Right Panel (Contextual) ───────────────────────────────────── */

function RightPanel({
  selectedSpot,
  hotspotDetail,
  onClose,
  summary,
  onOpenPatrol,
}) {
  if (!selectedSpot) {
    return (
      <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <DefaultPanel summary={summary} onOpenPatrol={onOpenPatrol} />
      </div>
    );
  }

  if (selectedSpot.type === "Trend") {
    return (
      <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <TrendPanel spot={selectedSpot} onClose={onClose} />
      </div>
    );
  }

  if (selectedSpot.type === "District") {
    return (
      <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <DistrictPanel
          spot={selectedSpot}
          onClose={onClose}
          onOpenPatrol={onOpenPatrol}
        />
      </div>
    );
  }

  if (selectedSpot.type === "Criminal Network") {
    return (
      <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <NetworkPanel spot={selectedSpot} onClose={onClose} />
      </div>
    );
  }

  // Cluster / Hotspot
  return (
    <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
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
};

/* ── Default Panel (nothing selected) ──────────────────────────── */

function DefaultPanel({ summary, onOpenPatrol }) {
  const { t } = useTranslation();
  const hp = summary?.highest_priority_district;
  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-slate-100">
        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
          {t("crimeMap.summary.operationalSummary")}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hp && (
          <div className="bg-red-50/60 border border-red-100 rounded-lg p-3.5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">
              {t("crimeMap.summary.todaysHighestPriority")}
            </p>
            <p className="text-sm font-bold text-slate-900">{hp.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{hp.reason}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.todaysRisk")}
            </p>
            <p
              className={`text-lg font-black ${summary?.today_risk === "HIGH" ? "text-red-600" : summary?.today_risk === "MEDIUM" ? "text-amber-600" : "text-green-600"}`}
            >
              {summary?.today_risk || "—"}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.emergingHotspots")}
            </p>
            <p className="text-lg font-black text-amber-500">
              {formatNumber(summary?.emerging_hotspots)}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.repeatOffenders")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(summary?.repeat_offender_areas)}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.crimes30d")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(summary?.active_hotspots)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            {t("crimeMap.summary.quickActions")}
          </p>
          <div className="space-y-2 text-left">
            <Suggestion text={t("crimeMap.summary.switchToCluster")} />
            <Suggestion text={t("crimeMap.summary.enableNetwork")} />
            <button
              onClick={onOpenPatrol}
              className="w-full text-left px-2.5 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 font-semibold shadow-sm hover:bg-blue-100 transition-colors"
            >
              <Route className="h-3 w-3 inline mr-1.5" />{" "}
              {t("crimeMap.generatePatrolPlan")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

DefaultPanel.propTypes = {
  summary: PropTypes.object,
  onOpenPatrol: PropTypes.func.isRequired,
};

/* ── Trend Panel ────────────────────────────────────────────────── */

function TrendPanel({ spot, onClose }) {
  const { t } = useTranslation();
  const isUp = spot.change_pct > 0;
  const isStable = Math.abs(spot.change_pct) < 5;

  return (
    <>
      <PanelHeader
        id={`TREND`}
        name="Trend Area"
        type="Trend"
        typeColor={
          isUp
            ? "bg-red-50 text-red-700 border-red-100"
            : "bg-green-50 text-green-700 border-green-100"
        }
        typeIcon={isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.heatmap.change")}
            </p>
            <p
              className={`text-xl font-black ${isUp ? "text-red-600" : isStable ? "text-slate-600" : "text-green-600"}`}
            >
              {isUp ? "+" : ""}
              {spot.change_pct}%
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.heatmap.direction")}
            </p>
            <p className="text-xs font-bold text-slate-900 mt-1.5">
              {isUp
                ? t("crimeMap.heatmap.increasing")
                : isStable
                  ? t("crimeMap.heatmap.stable")
                  : t("crimeMap.heatmap.decreasing")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.heatmap.currentPeriod")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {spot.current_count}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.heatmap.previousPeriod")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {spot.previous_count}
            </p>
          </div>
        </div>

        <div
          className={`rounded-lg p-3.5 border ${isUp ? "bg-red-50/60 border-red-100" : "bg-green-50/60 border-green-100"}`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isUp ? "text-red-700" : "text-green-700"}`}
          >
            {isUp
              ? t("crimeMap.heatmap.trendIncreasing")
              : t("crimeMap.heatmap.trendDecreasing")}
          </p>
          <ul className="text-xs text-slate-700 space-y-1">
            <li>
              • {spot.current_count} incidents this period vs{" "}
              {spot.previous_count} previously
            </li>
            <li>
              •{" "}
              {isUp
                ? "Requires increased patrol attention"
                : "Positive trend — continue current strategy"}
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

TrendPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
};

/* ── District Panel ─────────────────────────────────────────────── */

function DistrictPanel({ spot, onClose, onOpenPatrol }) {
  const { t } = useTranslation();
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
        typeColor="bg-slate-100 text-slate-700 border-slate-200"
        typeIcon={<Shield size={10} />}
        onClose={onClose}
        subtitle={`Rank #${spot.rank || "—"} of 31 districts`}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.district.crimeCount")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.crime_count)}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.summary.repeatOffenders")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.repeat_offenders)}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.district.pendingInvestigations")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {formatNumber(spot.pending_investigations)}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
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
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
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
          </div>
        </div>

        <button
          onClick={onOpenPatrol}
          className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Route className="h-3.5 w-3.5 inline mr-1.5" />{" "}
          {t("crimeMap.generatePatrolPlan")} — {spot.name}
        </button>
      </div>
    </>
  );
}

DistrictPanel.propTypes = {
  spot: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenPatrol: PropTypes.func.isRequired,
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
          className="h-full bg-blue-500 rounded-full transition-all"
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

/* ── Cluster / Hotspot Panel ────────────────────────────────────── */

function ClusterPanel({ spot, detail, onClose, onOpenPatrol }) {
  const { t } = useTranslation();
  return (
    <>
      <PanelHeader
        id={`CLS`}
        name={spot.name}
        type="Hotspot"
        typeColor="bg-red-50 text-red-700 border-red-100"
        typeIcon={<AlertTriangle size={10} />}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {detail ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] font-medium text-slate-500">
                  {t("crimeMap.cluster.totalIncidents")}
                </p>
                <p className="text-lg font-black text-slate-900">
                  {formatNumber(detail.crime_count)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
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
              <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3.5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Zap size={14} className="text-blue-600" />
                  <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
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
          onClick={onOpenPatrol}
          className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Route className="h-3.5 w-3.5 inline mr-1.5" />{" "}
          {t("crimeMap.generatePatrolPlan")}
        </button>
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
        typeColor="bg-red-50 text-red-700 border-red-100"
        typeIcon={<Users size={10} />}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] font-medium text-slate-500">
              {t("crimeMap.network.members")}
            </p>
            <p className="text-lg font-black text-slate-900">
              {spot.member_count}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
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
          className="w-full py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
        >
          <Users className="h-3.5 w-3.5 inline mr-1.5" />{" "}
          {t("crimeMap.network.openInNetworks")}
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

function PatrolModal({ token, selectedSpot, onClose }) {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState("night");
  const [units, setUnits] = useState(6);
  const [crimeFocus, setCrimeFocus] = useState(null);
  const [area, setArea] = useState("");
  const [districts, setDistricts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

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
  }, [selectedSpot, districts]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await crimeMapApi.getPatrolPlan(token, {
        time_range: timeRange,
        units,
        crime_focus: crimeFocus || undefined,
        area: area || undefined,
      });
      setRoutes(res.data || []);
      setGenerated(true);
    } catch (e) {
      console.error("Patrol plan failed", e);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              {t("crimeMap.patrol.title")}
            </span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              {t("crimeMap.patrol.subtitle")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!generated ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block">
                  {t("crimeMap.patrol.timeOfDay")}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {getTimeOptions(t).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeRange(opt.value)}
                      className={`p-2.5 rounded-lg border text-center transition-colors ${
                        timeRange === opt.value
                          ? "bg-blue-50 border-blue-300 text-blue-700"
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
                <label className="text-xs font-bold text-slate-700 mb-2 block">
                  {t("crimeMap.patrol.unitsAvailable")}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setUnits(Math.max(1, units - 1))}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold"
                  >
                    -
                  </button>
                  <span className="text-xl font-black text-slate-900 w-8 text-center">
                    {units}
                  </span>
                  <button
                    onClick={() => setUnits(Math.min(20, units + 1))}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block">
                  {t("crimeMap.patrol.crimeFocus")}
                </label>
                <select
                  value={crimeFocus || ""}
                  onChange={(e) => setCrimeFocus(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {getCrimeHeads(t).map((ch) => (
                    <option key={ch.id ?? "all"} value={ch.id ?? ""}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block">
                  {t("crimeMap.patrol.area")}
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {routes.length} {t("crimeMap.patrol.routesGenerated")}
                </p>
                <button
                  onClick={() => {
                    setGenerated(false);
                    setRoutes([]);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                >
                  {t("crimeMap.patrol.reconfigure")}
                </button>
              </div>
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
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.priority_score >= 200
                          ? "bg-red-100 text-red-700"
                          : r.priority_score >= 100
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}
                    >
                      {t("crimeMap.patrol.score", { count: r.priority_score })}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1.5">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {
                      getTimeOptions(t).find((opt) => opt.value === timeRange)
                        ?.label
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
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-white">
          {!generated ? (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Route className="h-4 w-4" />
              )}
              {loading
                ? t("crimeMap.patrol.generating")
                : t("crimeMap.generatePatrolPlan")}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />{" "}
                {t("crimeMap.patrol.exportPdf")}
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />{" "}
                {t("crimeMap.patrol.exportExcel")}
              </button>
              <button
                onClick={onClose}
                className="py-2.5 px-4 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors shadow-sm"
              >
                {t("crimeMap.patrol.close")}
              </button>
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
    <div className="p-4 border-b border-slate-100 flex justify-between items-start">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-slate-400">{id}</span>
          <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 border ${typeColor}`}
          >
            {typeIcon} {type.toUpperCase()}
          </span>
        </div>
        <h2 className="text-base font-bold text-slate-900">{name}</h2>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
      >
        <X size={16} />
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
