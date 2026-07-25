import { useState, useEffect, useMemo, useCallback } from "react";
import DeckGL from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MapPin, AlertTriangle,
  Sparkles, X, Loader2,
  Users, Route, Target, Activity, Eye,
} from "lucide-react";
import PropTypes from "prop-types";
import { useAuth } from "../auth/AuthContext";
import * as crimeMapApi from "../api/crimeMap";

function formatNumber(num) {
  if (num === null || num === undefined) return "—";
  return num.toLocaleString();
}

export default function CrimeIntelligenceMap() {
  const { token } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState({ summary: true, mapData: false, patrol: false });
  const [viewMode, setViewMode] = useState("Heatmap");
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [hotspotDetail, setHotspotDetail] = useState(null);
  const [patrolData, setPatrolData] = useState([]);
  const [showNetworks, setShowNetworks] = useState(false);
  const [networkOverlay, setNetworkOverlay] = useState([]);
  const [showPatrolPanel, setShowPatrolPanel] = useState(false);

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
        const [sRes, nRes] = await Promise.all([
          crimeMapApi.getSummary(token),
          crimeMapApi.getNetworkOverlay(token),
        ]);
        setSummary(sRes.data);
        setNetworkOverlay(nRes.data || []);
      } catch (e) {
        console.error("Failed to load initial data", e);
      } finally {
        setLoading((prev) => ({ ...prev, summary: false }));
      }
    })();
  }, [token]);

  const handleGeneratePatrol = async () => {
    setLoading((prev) => ({ ...prev, patrol: true }));
    setShowPatrolPanel(true);
    try {
      const res = await crimeMapApi.getPatrolRecommendations(token);
      setPatrolData(res.data || []);
    } catch (e) {
      console.error("Failed to generate patrol", e);
    } finally {
      setLoading((prev) => ({ ...prev, patrol: false }));
    }
  };

  return (
    <div className="flex h-full bg-slate-50 text-slate-900 font-sans">
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col p-6 overflow-hidden gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Crime Intelligence Map</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Decide where to deploy police resources
              </p>
            </div>
            <button onClick={handleGeneratePatrol}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm">
              <Route className="h-4 w-4" /> Generate Patrol Plan
            </button>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <MetricCard
              title="Today's Risk"
              value={summary?.today_risk || "—"}
              highlight={summary?.today_risk === "HIGH" ? "text-red-600" : summary?.today_risk === "MEDIUM" ? "text-amber-600" : "text-green-600"}
              loading={loading.summary}
            />
            <MetricCard
              title="Patrol Recommendations"
              value={formatNumber(summary?.patrol_recommendations)}
              loading={loading.summary}
            />
            <MetricCard
              title="Emerging Hotspots"
              value={formatNumber(summary?.emerging_hotspots)}
              highlight="text-amber-500"
              loading={loading.summary}
            />
            <MetricCard
              title="Repeat Offender Zones"
              value={formatNumber(summary?.repeat_offender_areas)}
              loading={loading.summary}
            />
            <MetricCard
              title="Total Crimes (30d)"
              value={formatNumber(summary?.active_hotspots)}
              loading={loading.summary}
            />
          </div>

          <div className="flex-1 flex gap-4 min-h-0 relative">
            <div className="flex-1 bg-slate-200 rounded-xl border border-slate-200 relative overflow-hidden shadow-inner flex flex-col">
              <MapView
                viewState={viewState}
                onViewStateChange={setViewState}
                viewMode={viewMode}
                showNetworks={showNetworks}
                networkOverlay={networkOverlay}
                onSelectSpot={setSelectedSpot}
                onHotspotDetail={setHotspotDetail}
                token={token}
              />

              <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md border border-slate-200 p-1 flex flex-col gap-1 z-10 w-40">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Map Layers</span>
                {["Heatmap", "Clusters", "Administrative"].map((mode) => (
                  <button key={mode}
                    onClick={() => { setViewMode(mode); setSelectedSpot(null); setHotspotDetail(null); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors ${
                      viewMode === mode ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    }`}>
                    {mode} View
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer">
                    <input type="checkbox" checked={showNetworks}
                      onChange={() => setShowNetworks(!showNetworks)}
                      className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
                    <span className="text-xs font-medium text-slate-700">
                      <Users className="h-3 w-3 inline mr-1" /> Network Overlay
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <RightPanel
              selectedSpot={selectedSpot}
              hotspotDetail={hotspotDetail}
              onClose={() => { setSelectedSpot(null); setHotspotDetail(null); }}
              showPatrol={showPatrolPanel}
              patrolData={patrolData}
              loadingPatrol={loading.patrol}
              onClosePatrol={() => setShowPatrolPanel(false)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function MapView({ viewState, onViewStateChange, viewMode, showNetworks, networkOverlay, onSelectSpot, onHotspotDetail, token }) {
  const [heatmapData, setHeatmapData] = useState([]);
  const [clusterData, setClusterData] = useState([]);
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const [heatRes, clusterRes, districtRes] = await Promise.all([
          crimeMapApi.getHeatmap(token),
          crimeMapApi.getClusters(token),
          crimeMapApi.getDistrictSummary(token),
        ]);
        setHeatmapData(heatRes.data || []);
        setClusterData(clusterRes.data || []);
        setDistrictData(districtRes.data || []);
      } catch (e) {
        console.error("Map fetch error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const heatmapLayerData = useMemo(
    () => heatmapData.map((d) => ({ coordinates: [d.lng, d.lat], weight: d.weight })),
    [heatmapData],
  );

  const clusterLayerData = useMemo(
    () => clusterData.map((d) => ({
      coordinates: [d.center[1], d.center[0]],
      crime_count: d.crime_count,
      dominant_crime: d.dominant_crime,
    })),
    [clusterData],
  );

  const districtGeoJson = useMemo(() => {
    if (!districtData.length) return null;
    return {
      type: "FeatureCollection",
      features: districtData.map((d) => ({
        type: "Feature",
        properties: { name: d.district, cases: d.cases, change: d.change },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [d.bounds.min_lng, d.bounds.min_lat],
            [d.bounds.max_lng, d.bounds.min_lat],
            [d.bounds.max_lng, d.bounds.max_lat],
            [d.bounds.min_lng, d.bounds.max_lat],
            [d.bounds.min_lng, d.bounds.min_lat],
          ]],
        },
      })),
    };
  }, [districtData]);

  const layers = useMemo(() => {
    const activeLayers = [];

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
            const change = d.properties.change || 0;
            if (change > 20) return [239, 68, 68, 40];
            if (change > 5) return [245, 158, 11, 40];
            return [34, 197, 94, 40];
          },
          getLineColor: [148, 163, 184, 255],
          onClick: (info) => {
            if (info.object) {
              const p = info.object.properties;
              onSelectSpot({ id: p.name, name: p.name, type: "District", totalCrimes: p.cases });
            }
          },
        }),
      );
    }

    if (viewMode === "Heatmap" && heatmapLayerData.length) {
      activeLayers.push(
        new HeatmapLayer({
          id: "crime-heatmap",
          data: heatmapLayerData,
          getPosition: (d) => d.coordinates,
          getWeight: (d) => d.weight,
          radiusPixels: 60,
          intensity: 1,
          threshold: 0.05,
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
                id: `CLS-${d.coordinates[1].toFixed(2)}-${d.coordinates[0].toFixed(2)}`,
                name: `${d.dominant_crime} Cluster`,
                type: "Cluster",
                totalCrimes: d.crime_count,
                lat: d.coordinates[1],
                lng: d.coordinates[0],
              });
              if (d.coordinates) {
                crimeMapApi.getHotspotDetail(token, d.coordinates[1], d.coordinates[0])
                  .then((r) => onHotspotDetail(r.data))
                  .catch(() => {});
              }
            }
          },
        }),
      );
    }

    if (showNetworks && networkOverlay?.length) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "network-overlay",
          data: networkOverlay.filter((n) => n.lat && n.lng),
          getPosition: (d) => [d.lng || 75.7, d.lat || 15.3],
          getRadius: (d) => Math.min(d.total_firs * 1000, 10000),
          getFillColor: [168, 85, 247, 120],
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              onSelectSpot({
                id: info.object.network_name,
                name: `Network: ${info.object.network_name}`,
                type: "Criminal Network",
                totalCrimes: info.object.total_firs,
              });
            }
          },
        }),
      );
    }

    return activeLayers;
  }, [viewMode, heatmapLayerData, clusterLayerData, districtGeoJson, showNetworks, networkOverlay, onSelectSpot, onHotspotDetail, token]);

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
  networkOverlay: PropTypes.array,
  onSelectSpot: PropTypes.func.isRequired,
  onHotspotDetail: PropTypes.func.isRequired,
  token: PropTypes.string,
};

function RightPanel({ selectedSpot, hotspotDetail, onClose, showPatrol, patrolData, loadingPatrol, onClosePatrol }) {
  if (showPatrol) {
    return (
      <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Patrol Planner</span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">Recommended Patrol Routes</h2>
          </div>
          <button onClick={onClosePatrol} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingPatrol ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
            </div>
          ) : patrolData.length > 0 ? (
            patrolData.slice(0, 10).map((p, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-3.5 hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-sm text-slate-800">{p.station}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.priority_score >= 200 ? "bg-red-100 text-red-700" :
                    p.priority_score >= 100 ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    Score: {p.priority_score}
                  </span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>{p.district} · Peak: {p.peak_time}</p>
                  <p>Suggested: <strong>{p.suggested_units} units</strong></p>
                  <div className="flex gap-3 mt-1.5 text-[10px]">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{p.crime_density} crimes</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{p.repeat_offenders} repeat</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{p.gravity_cases} heinous</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {p.gravity_cases > 3 ? "High gravity offence concentration" :
                   p.repeat_offenders > 5 ? "Repeat offender hotspot" :
                   "Routine patrol coverage"}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-sm text-slate-400">
              <Route className="h-8 w-8 mx-auto mb-2 text-slate-200" />
              <p>No patrol recommendations available.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all duration-300 ${
      selectedSpot ? "opacity-100" : "opacity-60 bg-slate-50/50 pointer-events-none"
    }`}>
      {selectedSpot ? (
        <>
          <div className="p-4 border-b border-slate-100 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-400">{selectedSpot.id || "Hotspot"}</span>
                {selectedSpot.type === "Criminal Network" ? (
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded flex items-center gap-1 border border-purple-100">
                    <Users size={10} /> NETWORK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded flex items-center gap-1 border border-red-100">
                    <AlertTriangle size={10} /> HOTSPOT
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900">{selectedSpot.name}</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium">
                <MapPin size={12} className="text-slate-400" /> {selectedSpot.type || "Location"}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {hotspotDetail ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-medium text-slate-500">Total Incidents</p>
                    <p className="text-lg font-bold text-slate-900">{formatNumber(hotspotDetail.crime_count)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-medium text-slate-500">Peak Window</p>
                    <p className="text-xs font-bold text-slate-900 mt-1.5">{hotspotDetail.peak_time}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Crime Breakdown</p>
                  <div className="space-y-1">
                    {(hotspotDetail.top_crimes || []).slice(0, 5).map((c, i) => (
                      <div key={i}
                        className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-100 rounded-lg">
                        <span className="text-xs font-semibold text-slate-700">{c.CrimeGroupName}</span>
                        <span className="text-xs font-bold text-slate-900">{c.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {hotspotDetail.stations?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Nearby Stations</p>
                    <div className="flex flex-wrap gap-1">
                      {hotspotDetail.stations.map((s) => (
                        <span key={s.id}
                          className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3.5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={14} className="text-blue-600" />
                    <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">Why is this hotspot growing?</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1">
                    {hotspotDetail.top_crimes?.[0] && (
                      <li>• <strong>{hotspotDetail.top_crimes[0].CrimeGroupName}</strong> dominates ({hotspotDetail.top_crimes[0].cnt} incidents)</li>
                    )}
                    {hotspotDetail.stations?.length > 1 && (
                      <li>• <strong>{hotspotDetail.stations.length} police stations</strong> reporting incidents</li>
                    )}
                    <li>• Peak activity at <strong>{hotspotDetail.peak_time}</strong></li>
                    <li>• {hotspotDetail.crime_count > 10 ? "High crime density - patrol recommended" : "Moderate activity - monitor"}</li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-sm text-slate-400">
                <Eye className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                <p>Click a cluster or district on the map to view hotspot intelligence.</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 flex flex-col gap-2 bg-white">
            <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm">
              <Target className="h-3.5 w-3.5 inline mr-1.5" /> Deep Dive Analysis
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-blue-600 border border-blue-100">
            <Activity size={20} />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Operational Intelligence</h3>
          <p className="text-xs text-slate-400 max-w-[240px] mt-1 mb-5 leading-normal">
            Select a hotspot, district, or network on the map to view intelligence and resource recommendations.
          </p>
          <div className="w-full space-y-2 text-left px-2">
            <Suggestion text="Switch to Cluster view to see crime concentration areas" />
            <Suggestion text="Enable Network Overlay to see criminal group territories" />
            <Suggestion text="Generate Patrol Plan for resource allocation" />
          </div>
        </div>
      )}
    </div>
  );
}

RightPanel.propTypes = {
  selectedSpot: PropTypes.object,
  hotspotDetail: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  showPatrol: PropTypes.bool.isRequired,
  patrolData: PropTypes.array,
  loadingPatrol: PropTypes.bool,
  onClosePatrol: PropTypes.func.isRequired,
};

function MetricCard({ title, value, highlight, alert, loading }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{title}</p>
      <div className="mt-2 flex items-end justify-between">
        {loading ? (
          <div className="h-7 w-16 bg-slate-200 rounded animate-pulse" />
        ) : (
          <span className={`text-xl font-black tracking-tight ${highlight || "text-slate-900"}`}>{value}</span>
        )}
        {alert && !loading && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-200">
            {alert}
          </span>
        )}
      </div>
    </div>
  );
}

MetricCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  highlight: PropTypes.string,
  alert: PropTypes.string,
  loading: PropTypes.bool,
};

function Suggestion({ text }) {
  return (
    <div className="w-full text-left px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-medium shadow-sm">
      {text}
    </div>
  );
}

Suggestion.propTypes = { text: PropTypes.string.isRequired };
