// Canonical POI type metadata shared by the Crime Intelligence Map
// (layer filters, marker colors, detail panel) and any other POI surface.
// Sources: osm-overpass (all 11 types) + overture (all except Bus_Stop /
// Railway_Station — Overture excludes transit stops by definition).

import {
  Beer,
  Landmark,
  Bus,
  Building2,
  MapPin,
  Shield,
  Hotel,
  Cross,
  GraduationCap,
  Fuel,
  Church,
} from "lucide-react";

export const POI_TYPE_META = {
  Liquor_Store: {
    labelKey: "crimeMap.overlays.liquorShops",
    Icon: Beer,
    color: "#b45309",
    deck: [180, 83, 9, 200],
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    weight: 5,
  },
  ATM: {
    labelKey: "crimeMap.overlays.atms",
    Icon: Landmark,
    color: "#2563eb",
    deck: [37, 99, 235, 200],
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    weight: 3,
  },
  Bus_Stop: {
    labelKey: "crimeMap.overlays.busStops",
    Icon: Bus,
    color: "#16a34a",
    deck: [22, 163, 74, 200],
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    weight: 2,
  },
  Bank: {
    labelKey: "crimeMap.overlays.banks",
    Icon: Building2,
    color: "#1e3a8a",
    deck: [124, 58, 237, 200],
    chip: "bg-slate-50 text-slate-700 border-slate-200",
    weight: 2,
  },
  Railway_Station: {
    labelKey: "crimeMap.overlays.railway",
    Icon: MapPin,
    color: "#dc2626",
    deck: [220, 38, 38, 200],
    chip: "bg-red-50 text-red-700 border-red-200",
    weight: 2,
  },
  Police_Station: {
    labelKey: "crimeMap.overlays.policeStations",
    Icon: Shield,
    color: "#0d9488",
    deck: [13, 148, 136, 200],
    chip: "bg-teal-50 text-teal-800 border-teal-200",
    weight: 1,
  },
  Hotel: {
    labelKey: "crimeMap.overlays.hotels",
    Icon: Hotel,
    color: "#7c3aed",
    deck: [124, 58, 237, 200],
    chip: "bg-violet-50 text-violet-800 border-violet-200",
    weight: 3,
  },
  Hospital: {
    labelKey: "crimeMap.overlays.hospitals",
    Icon: Cross,
    color: "#e11d48",
    deck: [225, 29, 72, 200],
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    weight: 1,
  },
  School: {
    labelKey: "crimeMap.overlays.schools",
    Icon: GraduationCap,
    color: "#ea580c",
    deck: [234, 88, 12, 200],
    chip: "bg-orange-50 text-orange-800 border-orange-200",
    weight: 2,
  },
  Fuel_Station: {
    labelKey: "crimeMap.overlays.fuelStations",
    Icon: Fuel,
    color: "#ca8a04",
    deck: [202, 138, 4, 200],
    chip: "bg-yellow-50 text-yellow-800 border-yellow-200",
    weight: 3,
  },
  Place_of_Worship: {
    labelKey: "crimeMap.overlays.worship",
    Icon: Church,
    color: "#6d28d9",
    deck: [109, 40, 217, 200],
    chip: "bg-purple-50 text-purple-800 border-purple-200",
    weight: 2,
  },
};

export const POI_TYPE_IDS = Object.keys(POI_TYPE_META);

export function poiMeta(type) {
  return (
    POI_TYPE_META[type] || {
      labelKey: null,
      Icon: MapPin,
      color: "#64748b",
      deck: [100, 116, 139, 180],
      chip: "bg-slate-50 text-slate-700 border-slate-200",
      weight: 1,
    }
  );
}
