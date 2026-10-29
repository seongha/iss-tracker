import { RETENTION_MS } from './db.js';
import { propagate, wrapLon, angularErrorDeg, orbitalDistanceKm } from './orbit.js';

const STEP_MS = 30 * 1000;               // 유추 궤적 샘플 간격
const NEIGHBOR_MAX_MS = 10 * 60 * 1000;  // 진행 방향 판단에 쓸 이웃 좌표의 최대 시간차

/** points[i] 가 북상(ascending) 중인지 이웃 좌표로 판단. 판단 불가 시 null */
function ascendingAt(points, i) {
  for (const j of [i + 1, i - 1]) {
    const n = points[j];
    if (!n || Math.abs(n.ts - points[i].ts) > NEIGHBOR_MAX_MS || n.lat === points[i].lat) continue;
    const [early, late] = n.ts > points[i].ts ? [points[i], n] : [n, points[i]];
    return late.lat > early.lat;
  }
  return null;
}

/** 방향을 모를 때: 두 후보 중 target 시점의 기준 좌표에 더 가깝게 도달하는 쪽을 고른다. */
function resolveAscending(p, asc, target) {
  if (asc !== null) return asc;
  if (!target) return true;
  const dt = (target.ts - p.ts) / 1000;
  return angularErrorDeg(propagate(p, true, dt), target) <= angularErrorDeg(propagate(p, false, dt), target);
}

/** fromTs 이전 시점의 궤적을 기준점에서 역산 */
function inferBackward(p, asc, fromTs) {
  const coords = [];
  for (let t = fromTs; t < p.ts; t += STEP_MS) {
    const q = propagate(p, asc, (t - p.ts) / 1000);
    coords.push([q.lat, q.lon]);
  }
  coords.push([p.lat, p.lon]);
  return coords;
}

/** 단절 구간 a→b 를 양 끝에서 각각 추정한 뒤 시간 가중치로 섞어 연결 */
function inferGap(a, ascA, b, ascB) {
  const coords = [[a.lat, a.lon]];
  const span = b.ts - a.ts;
  for (let t = a.ts + STEP_MS; t < b.ts; t += STEP_MS) {
    const w = (t - a.ts) / span;
    const pa = propagate(a, ascA, (t - a.ts) / 1000);
    const pb = propagate(b, ascB, (t - b.ts) / 1000);
    const dLon = wrapLon(pb.lon - pa.lon);
    coords.push([pa.lat * (1 - w) + pb.lat * w, wrapLon(pa.lon + dLon * w)]);
  }
  coords.push([b.lat, b.lon]);
  return coords;
}

/**
 * 저장된 실측 좌표로 최근 4시간 궤적을 구성한다.
 * 반환: [{ inferred: boolean, coords: [[lat, lon], ...] }]
 */
export function buildTrajectory(points, now, gapMs) {
  if (points.length === 0) return [];
  const windowStart = now - RETENTION_MS;
  const segments = [];

  // 1) 4시간 창의 앞부분이 비어 있으면 첫 실측점에서 역산
  const first = points[0];
  if (first.ts - windowStart > gapMs) {
    const asc = resolveAscending(first, ascendingAt(points, 0), null);
    segments.push({ inferred: true, coords: inferBackward(first, asc, windowStart) });
  }

  // 2) 실측 구간과 단절 구간 분리
  let actual = [[first.lat, first.lon]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (b.ts - a.ts > gapMs) {
      segments.push({ inferred: false, coords: actual });
      const ascB = resolveAscending(b, ascendingAt(points, i), a);
      const ascA = resolveAscending(a, ascendingAt(points, i - 1), b);
      segments.push({ inferred: true, coords: inferGap(a, ascA, b, ascB) });
      actual = [];
    }
    actual.push([b.lat, b.lon]);
  }
  segments.push({ inferred: false, coords: actual });

  return segments
    .filter((s) => s.coords.length > 1)
    .flatMap((s) => splitAntimeridian(s.coords).map((coords) => ({ inferred: s.inferred, coords })));
}

/** 경도 ±180° 를 넘는 선분을 경계에서 끊어 지도에 가로줄이 생기지 않도록 한다. */
export function splitAntimeridian(coords) {
  const parts = [];
  let current = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    if (Math.abs(lon2 - lon1) > 180) {
      const edge = lon1 > 0 ? 180 : -180;
      const unwrapped = lon2 + (lon1 > 0 ? 360 : -360);
      const f = (edge - lon1) / (unwrapped - lon1);
      const latC = lat1 + f * (lat2 - lat1);
      current.push([latC, edge]);
      parts.push(current);
      current = [[latC, -edge]];
    }
    current.push(coords[i]);
  }
  parts.push(current);
  return parts.filter((p) => p.length > 1);
}

/** 최근 windowMs 동안의 실측 좌표로 평균 이동 속도(km/h) 계산 */
export function computeSpeedKmh(points, windowMs = 60 * 1000) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  let dist = 0;
  let start = last;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    if (last.ts - a.ts > windowMs && start !== last) break;
    if (b.ts - a.ts > windowMs) break; // 단절 구간은 속도 계산에서 제외
    dist += orbitalDistanceKm(a, b);
    start = a;
  }
  const hours = (last.ts - start.ts) / 3_600_000;
  return hours > 0 ? dist / hours : null;
}
