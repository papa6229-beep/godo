import { useCallback, useEffect, useState } from 'react';
import type { MarketingBehaviorInsights } from '../services/marketingBehaviorTypes';

// ────────────────────────────────────────────────────────────────────────────
// useMarketingBehaviorSummary — 고객 행동 분석 모달용 안전 summary fetch hook
//
// GET /api/marketing/behavior-summary 만 호출한다(raw event endpoint 호출 금지).
//   응답은 집계 insights뿐 — sessionIdHash/orderIdHash/raw event 없음.
//   enabled일 때만 fetch / AbortController cleanup / 실패 시 throw 없이 error 상태.
//   demo fallback은 모달이 처리(이 hook은 live/empty/error만 반환).
// ────────────────────────────────────────────────────────────────────────────

const SUMMARY_ENDPOINT = '/api/marketing/behavior-summary';

export type MarketingBehaviorSummaryStatus = 'idle' | 'loading' | 'live' | 'empty' | 'error';

interface SummaryState {
  status: MarketingBehaviorSummaryStatus;
  insights: MarketingBehaviorInsights | null;
  hasLiveData: boolean;
  storageMode?: string;
  persistentReady?: boolean;
  eventCount?: number;
  sessionCount?: number;
  errorMessage?: string;
}

export interface UseMarketingBehaviorSummaryResult extends SummaryState {
  refresh: () => void;
}

interface SummaryApiShape {
  ok?: boolean;
  hasLiveData?: boolean;
  storage?: { mode?: string; persistentReady?: boolean };
  dataStatus?: { eventCount?: number; sessionCount?: number };
  insights?: MarketingBehaviorInsights | null;
}

export function useMarketingBehaviorSummary(options?: {
  enabled?: boolean;
  range?: { startDate?: string; endDate?: string; label?: string };
}): UseMarketingBehaviorSummaryResult {
  const enabled = options?.enabled ?? false;
  const startDate = options?.range?.startDate;
  const endDate = options?.range?.endDate;
  const rangeLabel = options?.range?.label;

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<SummaryState>({ status: 'idle', insights: null, hasLiveData: false });
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    // 동기 setState(로딩) 없이, fetch 결과(콜백)에서만 상태를 갱신한다.
    // 로딩 중에는 직전 상태(초기 idle)가 유지되고 모달은 demo fallback을 보여준다.
    const ctrl = new AbortController();

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (rangeLabel) params.set('rangeLabel', rangeLabel);
    const qs = params.toString();

    fetch(`${SUMMARY_ENDPOINT}${qs ? `?${qs}` : ''}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<SummaryApiShape>)
      .then((data) => {
        const storageMode = data.storage?.mode;
        const persistentReady = data.storage?.persistentReady;
        if (data && data.hasLiveData && data.insights) {
          setState({
            status: 'live', insights: data.insights, hasLiveData: true, storageMode, persistentReady,
            eventCount: data.dataStatus?.eventCount, sessionCount: data.dataStatus?.sessionCount
          });
        } else {
          setState({ status: 'empty', insights: null, hasLiveData: false, storageMode, persistentReady });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', insights: null, hasLiveData: false, errorMessage: '실제 행동 요약을 불러오지 못했습니다.' });
      });

    return () => ctrl.abort();
  }, [enabled, startDate, endDate, rangeLabel, nonce]);

  return { ...state, refresh };
}
