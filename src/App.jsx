import { useMemo, useState } from 'react';
import IssMap from './IssMap.jsx';
import { buildTrajectory, computeSpeedKmh } from './trajectory.js';
import { useIssPosition, useIssTrack, usePersistPosition } from './useIss.js';

const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('ko-KR') : '—');
const fmtNum = (n, d = 0) => (n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: d }));

export default function App() {
  const [follow, setFollow] = useState(true);
  const position = useIssPosition();
  const track = useIssTrack();
  usePersistPosition(position.data);

  const points = useMemo(() => track.data ?? [], [track.data]);
  const { stats } = position;
  // 정상 Polling 간격의 3배(최소 60초) 이상 비어 있으면 단절 구간으로 본다.
  const gapMs = Math.max(60_000, stats.interval * 3);

  const segments = useMemo(
    () => buildTrajectory(points, track.dataUpdatedAt || Date.now(), gapMs),
    [points, track.dataUpdatedAt, gapMs],
  );
  const speedKmh = useMemo(() => computeSpeedKmh(points), [points]);

  const coveredMin = points.length ? Math.round((points.at(-1).ts - points[0].ts) / 60000) : 0;
  const inferredCount = segments.filter((s) => s.inferred).length;

  return (
    <>
      <div className="topbar">
        <a className="brand" href="#map">🛰️ ISS Tracker</a>
        <nav>
          <a href="#map">실시간 지도</a>
          <a href="#stats">상태</a>
          <a href="#how">작동 방식</a>
        </nav>
      </div>

      <header className="hero">
        <span className="badge">React 19 · TanStack Query · IndexedDB</span>
        <h1>국제 우주 정거장 실시간 추적</h1>
        <p>open-notify API로 ISS의 현재 위치를 받아 최근 4시간의 궤적을 지도 위에 그립니다. 끊긴 구간은 궤도 모델로 유추해 점선으로 표시합니다.</p>
      </header>

      <main>
        <section id="map">
          <div className="section-head">
            <span className="chip">LIVE</span>
            <h2>현재 위치와 최근 4시간 궤적</h2>
          </div>

          <div className="card map-card">
            <IssMap position={position.data} segments={segments} follow={follow} />
            <div className="map-toolbar">
              <div className="legend">
                <span><i className="line solid" />실측 궤적</span>
                <span><i className="line dashed" />계산/유추 궤적</span>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                ISS 따라가기
              </label>
            </div>
          </div>
        </section>

        <section id="stats">
          <div className="section-head">
            <span className="chip">STATUS</span>
            <h2>이동 속도 · Polling 상태</h2>
          </div>

          <div className="card">
            <div className="status-grid">
              <div className="status s3">
                <b>{fmtNum(speedKmh)} km/h</b>
                이동 속도 ({fmtNum(speedKmh && speedKmh / 3600, 2)} km/s)
              </div>
              <div className="status s2">
                <b>{(stats.interval / 1000).toFixed(1)} s</b>
                API Polling 간격
              </div>
              <div className="status s4">
                <b>{fmtMs(stats.lastMs)}</b>
                API 응답속도 (평균 {fmtMs(stats.avgMs)})
              </div>
              <div className={`status ${position.isError ? 's5' : 's2'}`}>
                <b>{position.isError ? '오류' : position.isFetching ? '요청 중…' : '정상'}</b>
                {position.isError ? position.error.message : `최근 수신 ${fmtTime(position.dataUpdatedAt)}`}
              </div>
            </div>

            <table>
              <tbody>
                <tr><th>위도 / 경도</th><td>{position.data ? `${position.data.lat.toFixed(4)}°, ${position.data.lon.toFixed(4)}°` : '—'}</td></tr>
                <tr><th>API 타임스탬프</th><td>{fmtTime(position.data?.ts)}</td></tr>
                <tr><th>저장된 좌표 (IndexedDB)</th><td>{fmtNum(points.length)}개 · 약 {coveredMin}분 분량</td></tr>
                <tr><th>유추 구간</th><td>{inferredCount}개 (단절 기준 {Math.round(gapMs / 1000)}초 이상)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <span className="chip">HOW</span>
            <h2>작동 방식</h2>
          </div>

          <div className="card">
            <h3>⏱️ 적응형 Polling</h3>
            <ol className="steps">
              <li>요청마다 <code>performance.now()</code>로 응답속도를 측정하고 지수이동평균(EMA)을 갱신합니다.</li>
              <li>다음 간격 = 평균 응답속도 × 10 — 요청이 전체 시간의 10%를 넘지 않도록 조절합니다.</li>
              <li>간격은 항상 <code>5초</code> 이상, 최대 60초이며 실패 시 지수 백오프가 적용됩니다.</li>
            </ol>
          </div>

          <div className="card">
            <h3>🗄️ IndexedDB 저장과 궤적 유추</h3>
            <ul>
              <li>수신한 좌표는 IndexedDB에 저장되며 4시간이 지난 좌표는 자동으로 삭제됩니다.</li>
              <li>좌표 사이가 끊긴 구간은 양 끝점에서 궤도(경사각 51.64°, 주기 92.9분)를 전파해 이어 붙입니다.</li>
              <li>4시간 이전 데이터가 없으면 가장 오래된 수집 시점부터 4시간 전까지 역산해 점선으로 표시합니다.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer>
        데이터 출처: <a href="http://open-notify.org/" target="_blank" rel="noreferrer">open-notify.org</a> · 지도 © OpenStreetMap
      </footer>
    </>
  );
}
