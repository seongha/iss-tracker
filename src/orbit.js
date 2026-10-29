// ISS 궤도를 원궤도로 근사해 임의 시각의 지상 위치를 추정한다.
const DEG = Math.PI / 180;

export const INCLINATION = 51.64 * DEG;          // 궤도 경사각
export const PERIOD_S = 92.9 * 60;               // 공전 주기(초)
export const ALTITUDE_KM = 420;                  // 평균 고도
export const EARTH_RADIUS_KM = 6371;

const MEAN_MOTION = (2 * Math.PI) / PERIOD_S;    // rad/s
const EARTH_ROTATION = 7.2921159e-5;             // rad/s
const NODAL_PRECESSION = (-5.0 * DEG) / 86400;   // 승교점 세차 rad/s

const wrapRad = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * 기준점 p({lat, lon}, 도)에서 dtSec 초 뒤(음수면 이전)의 위치를 추정한다.
 * ascending: 기준점에서 북쪽으로 이동 중인지 여부.
 */
export function propagate(p, ascending, dtSec) {
  const sinI = Math.sin(INCLINATION);
  const cosI = Math.cos(INCLINATION);
  const lat = p.lat * DEG;
  const lon = p.lon * DEG;

  // 궤도 위 위상각(승교점으로부터의 각) u 를 구한다.
  const s = Math.max(-1, Math.min(1, Math.sin(lat) / sinI));
  const u0 = ascending ? Math.asin(s) : Math.PI - Math.asin(s);
  const node = lon - Math.atan2(cosI * Math.sin(u0), Math.cos(u0));

  const u = u0 + MEAN_MOTION * dtSec;
  const newLat = Math.asin(sinI * Math.sin(u));
  const newLon =
    node + Math.atan2(cosI * Math.sin(u), Math.cos(u)) + (NODAL_PRECESSION - EARTH_ROTATION) * dtSec;

  return { lat: newLat / DEG, lon: wrapRad(newLon) / DEG };
}

/** 궤도 고도에서의 두 지점 간 대원거리(km) */
export function orbitalDistanceKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * (EARTH_RADIUS_KM + ALTITUDE_KM) * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function angularErrorDeg(a, b) {
  return orbitalDistanceKm(a, b) / (EARTH_RADIUS_KM + ALTITUDE_KM) / DEG;
}
