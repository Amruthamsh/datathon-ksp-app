import React, { useState, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Search,
  ChevronDown,
  MapPin,
  Filter,
  Play,
  Clock,
  Building2,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Crosshair,
  CloudRain,
  ShieldAlert,
  X,
} from "lucide-react";

// ==========================================
// MOCK SPATIAL DATASETS (Karnataka Focus)
// ==========================================

// Mock Crime Incidents: Centered around Hubballi, Belagavi, Bagalkot, and Bengaluru
const MOCK_CRIME_POINTS = [
  {
    coordinates: [75.7139, 15.3173],
    weight: 8,
    type: "Property Crime",
    id: "HS-442",
    name: "Bagalkot Bus Stand",
    peakTime: "20:00 - 23:00",
    gravity: "Heinous",
    repeatOffenders: 7,
    rainPercent: "18%",
  },
  {
    coordinates: [75.72, 15.325],
    weight: 6,
    type: "Property Crime",
    id: "HS-443",
    name: "Bagalkot Market Yard",
    peakTime: "19:00 - 22:00",
    gravity: "Simple",
    repeatOffenders: 3,
    rainPercent: "12%",
  },
  {
    coordinates: [74.5089, 15.8497],
    weight: 9,
    type: "Violent Crime",
    id: "HS-102",
    name: "Belagavi Central",
    peakTime: "22:00 - 02:00",
    gravity: "Heinous",
    repeatOffenders: 12,
    rainPercent: "40%",
  },
  {
    coordinates: [74.52, 15.86],
    weight: 4,
    type: "Economic Crime",
    id: "HS-103",
    name: "Belagavi Tech Zone",
    peakTime: "11:00 - 15:00",
    gravity: "Simple",
    repeatOffenders: 2,
    rainPercent: "5%",
  },
  {
    coordinates: [77.5946, 12.9716],
    weight: 10,
    type: "Property Crime",
    id: "HS-001",
    name: "Bengaluru Majestic",
    peakTime: "18:00 - 21:00",
    gravity: "Heinous",
    repeatOffenders: 15,
    rainPercent: "22%",
  },
];

// Mock POI Data (Banks, Transit Hubs)
const MOCK_POI_POINTS = [
  { coordinates: [75.711, 15.316], poiType: "ATM", name: "SBI ATM" },
  { coordinates: [75.716, 15.319], poiType: "Bank", name: "HDFC Bank" },
  {
    coordinates: [74.505, 15.848],
    poiType: "Transit",
    name: "Belagavi Railway Station",
  },
];

// Mock GeoJSON District Boundaries (Simplified bounding polygons)
const MOCK_DISTRICTS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Bagalkot Division",
        crimeRate: "High",
        color: [239, 68, 68, 40],
      }, // Red alpha
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [75.4, 15.1],
            [76.0, 15.1],
            [76.0, 15.6],
            [75.4, 15.6],
            [75.4, 15.1],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Belagavi Division",
        crimeRate: "Medium",
        color: [245, 158, 11, 40],
      }, // Amber alpha
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [74.2, 15.6],
            [74.9, 15.6],
            [74.9, 16.2],
            [74.2, 16.2],
            [74.2, 15.6],
          ],
        ],
      },
    },
  ],
};

export default function CrimeIntelligenceMap() {
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [mapMode, setMapMode] = useState("Heatmap"); // Heatmap, Cluster, Administrative
  const [layersVisibility, setLayersVisibility] = useState({
    weather: true,
    pois: true,
    density: false,
  });

  // Initial View State focused broadly over Karnataka region
  const [viewState, setViewState] = useState({
    longitude: 75.7139,
    latitude: 15.3173,
    zoom: 7.5,
    pitch: 0,
    bearing: 0,
  });

  // Toggle handlers for layers
  const handleLayerToggle = (layerKey) => {
    setLayersVisibility((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  // ==========================================
  // DECK.GL LAYER COMPOSITION ENGINE
  // ==========================================
  const layers = useMemo(() => {
    const activeLayers = [];

    // 1. BASE LAYER: Administrative Boundary Mode (Choropleth map)
    if (mapMode === "Administrative") {
      activeLayers.push(
        new GeoJsonLayer({
          id: "geojson-districts",
          data: MOCK_DISTRICTS_GEOJSON,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 2,
          getFillColor: (d) => d.properties.color,
          getLineColor: [148, 163, 184, 255], // slate-400
          onClick: (info) => {
            if (info.object) {
              setSelectedHotspot({
                id: "DIV-GEO",
                name: info.object.properties.name,
                type: "Administrative Boundary",
                totalCrimes: 412,
                trend: "+14%",
                mostCommon: "Varies by Station",
                peakTime: "18:00 - 00:00",
                repeatOffenders: 34,
                nearby: ["Multiple Jurisdictions Inside"],
                weatherContext: "Correlated with monsoon cycles",
              });
            }
          },
        }),
      );
    }

    // 2. CORE MODE LAYER: Heatmap Generation Layer
    if (mapMode === "Heatmap") {
      activeLayers.push(
        new HeatmapLayer({
          id: "crime-heatmap",
          data: MOCK_CRIME_POINTS,
          getPosition: (d) => d.coordinates,
          getWeight: (d) => d.weight,
          radiusPixels: 60,
          intensity: 1,
          threshold: 0.05,
        }),
      );
    }

    // 3. CORE MODE LAYER: Aggregated Incident / Cluster Representation Layer
    if (mapMode === "Cluster") {
      activeLayers.push(
        new ScatterplotLayer({
          id: "crime-clusters",
          data: MOCK_CRIME_POINTS,
          getPosition: (d) => d.coordinates,
          getRadius: (d) => d.weight * 1200, // Scaled for meter metrics
          getFillColor: [220, 38, 38, 200], // red-600
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              const item = info.object;
              setSelectedHotspot({
                id: item.id,
                name: item.name,
                type: item.type,
                totalCrimes: item.weight * 15,
                trend: item.weight > 7 ? "+28%" : "+8%",
                mostCommon: item.type,
                peakTime: item.peakTime,
                repeatOffenders: item.repeatOffenders,
                nearby: ["3 Banks", "2 ATMs", "4 Bus Stops"],
                weatherContext: `Rain during ${item.rainPercent} of incidents`,
              });
            }
          },
        }),
      );
    }

    // 4. OVERLAY CONTEXT LAYER: Points of Interest Map (POIs)
    if (layersVisibility.pois) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "poi-layer",
          data: MOCK_POI_POINTS,
          getPosition: (d) => d.coordinates,
          getRadius: 400,
          getFillColor: [37, 99, 235, 220], // blue-600
          pickable: true,
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 1.5,
        }),
      );
    }

    return activeLayers;
  }, [mapMode, layersVisibility]);

  return (
    <div className="flex h-full bg-slate-50 text-slate-900 font-sans">
      <main className="flex-1 flex flex-col min-w-0">
        {/* CONTAINER PANELS MAP STRATA */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden gap-4">
          {/* Workspace Titles */}
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Crime Intelligence Map
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Analyze spatial patterns, real-world context overlays, and
              strategic AI insights.
            </p>
          </div>

          {/* Metric Dashboard Stripe */}
          <div className="grid grid-cols-5 gap-4">
            <MetricCard
              title="Total Crimes (Active Filter)"
              value="1,432"
              trend="-4%"
            />
            <MetricCard
              title="Active Hotspots"
              value="12"
              highlight="text-red-600"
            />
            <MetricCard
              title="Emerging Hotspots"
              value="3"
              highlight="text-amber-500"
            />
            <MetricCard title="Repeat Offender Areas" value="8" />
            <MetricCard title="Weather Alerts" value="2" alert="Heavy Rain" />
          </div>

          {/* Filtering Array Controls */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <FilterButton label="Date Range" />
            <FilterButton label="Crime Head" />
            <FilterButton label="Gravity" />
            <FilterButton label="District" />
            <FilterButton label="Station" />
            <FilterButton label="Time of Day" />
            <div className="flex-1"></div>
            <button className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:underline">
              <Sparkles size={14} /> AI Filter
            </button>
          </div>

          {/* SUB-WORKSPACE SPLIT WINDOW */}
          <div className="flex-1 flex gap-4 min-h-0 relative">
            {/* INTERACTIVE VECTOR WEB GL MAP JURISDICTION */}
            <div className="flex-1 bg-slate-200 rounded-xl border border-slate-200 relative overflow-hidden shadow-inner flex flex-col">
              <DeckGL
                viewState={viewState}
                onViewStateChange={(e) => setViewState(e.viewState)}
                controller={true}
                layers={layers}
                getCursor={({ isHovering }) =>
                  isHovering ? "pointer" : "default"
                }
              >
                <Map
                  reuseMaps
                  mapLib={import("maplibre-gl")}
                  mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                  preventStyleDiffing={true}
                />
              </DeckGL>

              {/* OVERLAY ENGINE PANEL: Top Left Map Configuration Controls */}
              <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md border border-slate-200 p-1 flex flex-col gap-1 z-10 w-36">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  View Strategy
                </span>
                {["Heatmap", "Cluster", "Administrative"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMapMode(mode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors ${mapMode === mode ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {mode} View
                  </button>
                ))}
              </div>

              {/* OVERLAY ENGINE PANEL: Top Right Context Layer Swappers */}
              <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md border border-slate-200 p-2 z-10 flex flex-col gap-1.5 w-44">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Context Layers
                </span>

                <LayerToggle
                  checkboxId="weather"
                  icon={<CloudRain size={13} />}
                  label="Weather Cycles"
                  active={layersVisibility.weather}
                  onChange={() => handleLayerToggle("weather")}
                />
                <LayerToggle
                  checkboxId="pois"
                  icon={<Building2 size={13} />}
                  label="POIs (Banks, ATMs)"
                  active={layersVisibility.pois}
                  onChange={() => handleLayerToggle("pois")}
                />
                <LayerToggle
                  checkboxId="density"
                  icon={<Clock size={13} />}
                  label="Population Core"
                  active={layersVisibility.density}
                  onChange={() => handleLayerToggle("density")}
                />
              </div>

              {/* TIME SERIES CONSOLE TRACKER - Lower Centered Bar */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 max-w-xl bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-slate-200 px-4 py-2 flex items-center gap-4 z-10">
                <button className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 text-slate-700 shrink-0">
                  <Play size={14} fill="currentColor" />
                </button>
                <div className="flex-1 relative flex items-center h-8">
                  <div className="absolute w-full h-1.5 bg-slate-200 rounded-full"></div>
                  <div className="absolute w-1/3 h-1.5 bg-blue-500 rounded-full left-[20%]"></div>
                  <div className="absolute w-4 h-4 bg-white border-2 border-blue-600 rounded-full left-[53%] -ml-2 shadow-md cursor-grab"></div>
                </div>
                <div className="text-xs font-bold text-slate-600 whitespace-nowrap px-1">
                  Active Filter: June - July
                </div>
              </div>
            </div>

            {/* AI COPILOT JURISDICTION CONTEXT DRAWER */}
            <div
              className={`w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all duration-300 z-10 ${selectedHotspot ? "opacity-100 translate-x-0" : "opacity-60 bg-slate-50/50 pointer-events-none"}`}
            >
              {selectedHotspot ? (
                <>
                  {/* Drawer Identification Header */}
                  <div className="p-4 border-b border-slate-100 flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-400">
                          {selectedHotspot.id}
                        </span>
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded flex items-center gap-1 border border-red-100">
                          <AlertTriangle size={10} /> CRITICAL HOTSPOT
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        {selectedHotspot.name}
                      </h2>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium">
                        <MapPin size={12} className="text-slate-400" />{" "}
                        {selectedHotspot.type}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedHotspot(null)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Operational Core Analytics Metrics */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-[11px] font-medium text-slate-500">
                          Total Incidents
                        </p>
                        <p className="text-lg font-bold text-slate-900 mt-0.5">
                          {selectedHotspot.totalCrimes}{" "}
                          <span className="text-xs text-red-600 font-medium ml-1">
                            {selectedHotspot.trend}
                          </span>
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-[11px] font-medium text-slate-500">
                          Peak Window
                        </p>
                        <p className="text-xs font-bold text-slate-900 mt-1.5 whitespace-nowrap">
                          {selectedHotspot.peakTime}
                        </p>
                      </div>
                    </div>

                    {/* AI Reasoning Block Engine */}
                    <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3.5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles size={14} className="text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                          AI Copilot Core Context
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        Property crimes elevated by{" "}
                        <span className="font-bold text-slate-900">
                          {selectedHotspot.trend}
                        </span>{" "}
                        near{" "}
                        <span className="font-semibold text-slate-800">
                          {selectedHotspot.name}
                        </span>
                        . Anomalies track tightly post-sunset and occur within a
                        500-meter vector of localized commercial venues during{" "}
                        {selectedHotspot.weatherContext}.
                      </p>
                    </div>

                    {/* Local Vector Context Listing */}
                    <div className="space-y-3 pt-1">
                      <ContextItem
                        icon={<Crosshair size={14} />}
                        label="Primary Offense Vector"
                        value={selectedHotspot.mostCommon}
                      />
                      <ContextItem
                        icon={<ShieldAlert size={14} />}
                        label="Tracked Repeat Accused"
                        value={`${selectedHotspot.repeatOffenders} Recidivists Flagged`}
                      />
                      <ContextItem
                        icon={<Building2 size={14} />}
                        label="Proximity Spatial POIs"
                        value={selectedHotspot.nearby.join(" • ")}
                      />
                    </div>

                    {/* Context Specific Guided Dynamic Inquiries */}
                    <div className="pt-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Suggested Analytical Queries
                      </p>
                      <div className="space-y-1.5">
                        <SuggestedQuestion text="Why are anomalies escalating here?" />
                        <SuggestedQuestion text="Compare matrix with neighboring districts." />
                        <SuggestedQuestion text="Show connected repeat offender networks." />
                      </div>
                    </div>
                  </div>

                  {/* Formatted Control Base Drawer Footer */}
                  <div className="p-4 border-t border-slate-100 flex flex-col gap-2 bg-white">
                    <button className="w-full py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm">
                      Deep Dive Spatial Analytics
                    </button>
                    <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                      <Sparkles size={13} /> Ask AI Contextually
                    </button>
                  </div>
                </>
              ) : (
                /* Static Inactive Awaiting Selection State */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50">
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-blue-600 border border-blue-100">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                    Spatial Copilot Standby
                  </h3>
                  <p className="text-xs text-slate-400 max-w-[240px] mt-1 mb-5 leading-normal">
                    Select an active map hotspot point or boundary region layer
                    to anchor context analysis.
                  </p>
                  <div className="w-full space-y-2 text-left px-2">
                    <SuggestedQuestion text="Where are property crimes emerging?" />
                    <SuggestedQuestion text="Run macro analysis: Bagalkot vs Belagavi" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ==========================================
// SUBCOMPONENTS DECLARATIONS
// ==========================================

function MetricCard({ title, value, trend, highlight, alert }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
        {title}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <span
          className={`text-xl font-black tracking-tight ${highlight || "text-slate-900"}`}
        >
          {value}
        </span>
        {trend && (
          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
            {trend}
          </span>
        )}
        {alert && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-200">
            {alert}
          </span>
        )}
      </div>
    </div>
  );
}

function FilterButton({ label }) {
  return (
    <button className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm whitespace-nowrap">
      {label}
      <ChevronDown size={14} className="text-slate-400" />
    </button>
  );
}

function LayerToggle({ icon, label, active, onChange, checkboxId }) {
  return (
    <label
      htmlFor={checkboxId}
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer group select-none transition-colors"
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={active}
        onChange={onChange}
        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
      />
      <span
        className={`transition-colors ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-500"}`}
      >
        {icon}
      </span>
      <span className="text-xs text-slate-700 font-semibold tracking-tight">
        {label}
      </span>
    </label>
  );
}

function ContextItem({ icon, label, value }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-snug">
          {value}
        </p>
      </div>
    </div>
  );
}

function SuggestedQuestion({ text }) {
  return (
    <button className="w-full text-left px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-medium hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition-all shadow-sm truncate">
      {text}
    </button>
  );
}
