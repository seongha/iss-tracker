import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllPositions, pruneOld, savePosition } from './db.js';

// open-notify 는 HTTP 전용이라 HTTPS 페이지에서 Mixed Content 로 차단된다.
// 같은 출처 경로로 요청하고 Vercel rewrite / Vite proxy 가 대신 전달한다.
const API_URL = '/api/iss-now';

export const MIN_INTERVAL_MS = 5_000;   // Polling 간격 하한
const MAX_INTERVAL_MS = 60_000;         // Polling 간격 상한
const LOAD_RATIO = 10;                  // 간격 = 평균 응답시간 × 10 (요청이 전체 시간의 10% 이하)
const EMA_ALPHA = 0.3;                  // 응답시간 지수이동평균 가중치
const REQUEST_TIMEOUT_MS = 15_000;

function nextInterval({ avgMs, errors }) {
  const byLatency = (avgMs ?? 0) * LOAD_RATIO;
  const byBackoff = errors > 0 ? MIN_INTERVAL_MS * 2 ** errors : 0; // 실패 시 지수 백오프
  return Math.round(Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, byLatency, byBackoff)));
}

/** ISS 현재 위치를 응답속도 기반 적응형 간격으로 Polling 한다. */
export function useIssPosition() {
  const stats = useRef({ lastMs: null, avgMs: null, errors: 0, interval: MIN_INTERVAL_MS });

  const query = useQuery({
    queryKey: ['iss-now'],
    queryFn: async ({ signal }) => {
      const s = stats.current;
      const started = performance.now();
      try {
        const res = await fetch(API_URL, {
          cache: 'no-store',
          signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.message !== 'success') throw new Error('API 응답 오류');

        s.lastMs = performance.now() - started;
        s.avgMs = s.avgMs == null ? s.lastMs : s.avgMs * (1 - EMA_ALPHA) + s.lastMs * EMA_ALPHA;
        s.errors = 0;
        s.interval = nextInterval(s);
        return {
          ts: json.timestamp * 1000,
          lat: Number(json.iss_position.latitude),
          lon: Number(json.iss_position.longitude),
        };
      } catch (err) {
        s.lastMs = performance.now() - started;
        s.errors += 1;
        s.interval = nextInterval(s);
        throw err;
      }
    },
    refetchInterval: () => stats.current.interval,
    refetchIntervalInBackground: true,
    retry: false,
  });

  return { ...query, stats: { ...stats.current } };
}

/** IndexedDB 에 저장된 최근 4시간 좌표. 1분마다 만료 데이터를 정리한다. */
export function useIssTrack() {
  return useQuery({
    queryKey: ['iss-track'],
    queryFn: async () => {
      await pruneOld();
      return getAllPositions();
    },
    refetchInterval: 60_000,
  });
}

/** 새 위치를 받으면 IndexedDB 에 저장하고 궤적 쿼리를 갱신한다. */
export function usePersistPosition(position) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: savePosition,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['iss-track'] }),
  });

  useEffect(() => {
    if (position) mutate(position);
  }, [position, mutate]);
}
