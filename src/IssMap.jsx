import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

const ISS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" width="56" height="35">
  <g stroke="#1e293b" stroke-width="1">
    <!-- 좌측 태양전지판 -->
    <rect x="2" y="3" width="9" height="15" fill="#4f46e5"/>
    <rect x="2" y="22" width="9" height="15" fill="#4f46e5"/>
    <rect x="13" y="3" width="9" height="15" fill="#4f46e5"/>
    <rect x="13" y="22" width="9" height="15" fill="#4f46e5"/>
    <!-- 우측 태양전지판 -->
    <rect x="42" y="3" width="9" height="15" fill="#4f46e5"/>
    <rect x="42" y="22" width="9" height="15" fill="#4f46e5"/>
    <rect x="53" y="3" width="9" height="15" fill="#4f46e5"/>
    <rect x="53" y="22" width="9" height="15" fill="#4f46e5"/>
    <!-- 트러스 -->
    <rect x="1" y="18.5" width="62" height="3" fill="#cbd5e1"/>
    <!-- 거주 모듈 -->
    <rect x="28" y="10" width="8" height="20" rx="2" fill="#f8fafc"/>
    <rect x="24" y="16" width="16" height="8" rx="2" fill="#e2e8f0"/>
    <!-- 방열판 -->
    <rect x="29.5" y="2" width="5" height="7" fill="#06b6d4"/>
    <rect x="29.5" y="31" width="5" height="7" fill="#06b6d4"/>
  </g>
  <g stroke="#a5b4fc" stroke-width=".6">
    <line x1="6.5" y1="3" x2="6.5" y2="18"/><line x1="17.5" y1="3" x2="17.5" y2="18"/>
    <line x1="6.5" y1="22" x2="6.5" y2="37"/><line x1="17.5" y1="22" x2="17.5" y2="37"/>
    <line x1="46.5" y1="3" x2="46.5" y2="18"/><line x1="57.5" y1="3" x2="57.5" y2="18"/>
    <line x1="46.5" y1="22" x2="46.5" y2="37"/><line x1="57.5" y1="22" x2="57.5" y2="37"/>
  </g>
</svg>`;

const issIcon = L.divIcon({
  html: ISS_SVG,
  className: 'iss-icon',
  iconSize: [56, 35],
  iconAnchor: [28, 17.5],
});

const SEGMENT_STYLE = {
  actual: { color: '#4f46e5', weight: 3, opacity: 0.9 },
  inferred: { color: '#06b6d4', weight: 2.5, opacity: 0.9, dashArray: '6 8' },
};

function FollowIss({ position, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && position) map.panTo([position.lat, position.lon], { animate: true });
  }, [map, position, enabled]);
  return null;
}

export default function IssMap({ position, segments, follow }) {
  return (
    <MapContainer
      className="iss-map"
      center={position ? [position.lat, position.lon] : [20, 0]}
      zoom={2}
      minZoom={2}
      worldCopyJump
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {segments.map((s, i) => (
        <Polyline
          key={i}
          positions={s.coords}
          pathOptions={s.inferred ? SEGMENT_STYLE.inferred : SEGMENT_STYLE.actual}
        />
      ))}
      {position && (
        <Marker position={[position.lat, position.lon]} icon={issIcon}>
          <Tooltip direction="top" offset={[0, -16]}>
            ISS · {position.lat.toFixed(2)}°, {position.lon.toFixed(2)}°
          </Tooltip>
        </Marker>
      )}
      <FollowIss position={position} enabled={follow} />
    </MapContainer>
  );
}
