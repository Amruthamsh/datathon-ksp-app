import { useCallback } from "react";
import PropTypes from "prop-types";
import { Map, Marker } from "react-map-gl/maplibre";

const FALLBACK = { lng: 77.5946, lat: 12.9716 }; // Bengaluru

// Miniature scene-pin picker — click to drop, drag to adjust.
// Loaded lazily by Home so the main chat chunk never pays for the map.
export default function ScenePinMap({ lat, lng, onPick }) {
  const handleClick = useCallback(
    (e) => {
      onPick(e.lngLat.lat, e.lngLat.lng);
    },
    [onPick],
  );

  const handleDragEnd = useCallback(
    (e) => {
      onPick(e.lngLat.lat, e.lngLat.lng);
    },
    [onPick],
  );

  return (
    <Map
      mapLib={import("maplibre-gl")}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      initialViewState={{
        longitude: lng ?? FALLBACK.lng,
        latitude: lat ?? FALLBACK.lat,
        zoom: lat != null ? 13 : 10,
      }}
      style={{ width: "100%", height: 190, borderRadius: 12, cursor: "crosshair" }}
      onClick={handleClick}
      attributionControl={false}
    >
      {lat != null && lng != null && (
        <Marker
          latitude={lat}
          longitude={lng}
          draggable
          onDragEnd={handleDragEnd}
        />
      )}
    </Map>
  );
}

ScenePinMap.propTypes = {
  lat: PropTypes.number,
  lng: PropTypes.number,
  onPick: PropTypes.func.isRequired,
};
