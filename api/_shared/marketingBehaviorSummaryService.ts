import type { SafeMarketingBehaviorEvent } from './marketingBehaviorCollectionValidator.js';
import { getMarketingBehaviorStorage } from './marketingBehaviorPersistentStore.js';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Summary Service v0 (server-only)
//
// storage의 최근 safe events를 "서버에서" 집계해 insights만 반환한다.
//   raw event/세션·주문 식별자는 응답에 절대 포함하지 않는다(집계 후 사라짐).
//
// ★ 집계 로직은 src/services/marketingBehaviorAggregatedPatterns.ts의 deterministic builder를
//   "서버 사이드로 포팅"한 것이다. api(tsconfig.node)와 src(tsconfig.app)는 별도 프로젝트라
//   직접 import 시 프로젝트 레퍼런스 충돌(TS6307) 위험 → 경계 안에서 동형 구현(validator가
//   allowlist를 자체 보유하는 것과 동일한 신뢰-경계 패턴). 출력 shape는 MarketingBehaviorInsights와 동일.
// ────────────────────────────────────────────────────────────────────────────

export interface SummaryInsights {
  dataStatus: { mode: 'demo' | 'collecting' | 'live'; label: string; eventCount: number; connectedSources: string[]; isDemo: boolean };
  acquisition: { topSources: Array<{ label: string; source: string; sessions: number; sharePercent: number }> };
  topPaths: Array<{ rank: number; pathLabels: string[]; sessions: number; sharePercent: number }>;
  topClicks: {
    banners: Array<{ label: string; clicks: number; clickPercent: number }>;
    categories: Array<{ label: string; clicks: number; clickPercent: number }>;
    products: Array<{ label: string; clicks: number; clickPercent: number }>;
  };
  dropOffs: Array<{ label: string; sessions: number; dropOffPercent: number }>;
  summaryCards: { topSourceLabel: string; topSourcePercent: number; topPathLabel: string; topClickLabel: string; topDropOffLabel: string; topDropOffPercent: number };
}

export interface MarketingBehaviorSummaryApiResponse {
  ok: boolean;
  hasLiveData: boolean;
  generatedAt: string;
  storage: { mode: string; persistentReady: boolean };
  dataStatus: { mode: 'live' | 'empty' | 'collecting'; eventCount: number; sessionCount: number; rangeLabel: string; isEmpty: boolean };
  insights: SummaryInsights | null;
}

const SOURCE_LABEL: Record<string, string> = {
  blog: '블로그', search: '검색', ad: '광고', sns: 'SNS', direct: '직접 방문', referral: '외부 링크', unknown: '알 수 없음'
};
const sourceLabel = (s?: string): string => SOURCE_LABEL[s ?? 'unknown'] ?? '알 수 없음';
const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const parseMs = (s?: string): number | null => { if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : t; };

const stepLabel = (e: SafeMarketingBehaviorEvent): string | null => {
  switch (e.eventName) {
    case 'visit': case 'landing': return e.pageTitle || e.pagePath || '메인페이지';
    case 'banner_click': return `배너: ${e.bannerName || '배너'}`;
    case 'category_click': return `카테고리: ${e.categoryName || '카테고리'}`;
    case 'product_view': return `상품: ${e.productName || '상품'}`;
    case 'search': return '검색';
    case 'add_to_cart': return '장바구니';
    case 'checkout_start': return '결제 시작';
    case 'purchase': return '구매 완료';
    default: return null; // exit 등
  }
};
const dropOffLabelFor = (events: SafeMarketingBehaviorEvent[]): string => {
  const exit = [...events].reverse().find((e) => e.eventName === 'exit');
  if (exit) return exit.pageTitle || exit.pagePath || '이탈';
  const last = [...events].reverse().find((e) => e.eventName !== 'exit');
  switch (last?.eventName) {
    case 'product_view': return '상품 상세 보기 후 이탈';
    case 'category_click': return '카테고리 보기 후 이탈';
    case 'banner_click': return '배너 클릭 후 이탈';
    case 'add_to_cart': return '장바구니 후 이탈';
    case 'checkout_start': return '결제 시작 후 이탈';
    case 'search': return '검색 후 이탈';
    case 'visit': case 'landing': return '메인페이지에서 이탈';
    default: return '알 수 없는 지점에서 이탈';
  }
};
const clickRank = (events: SafeMarketingBehaviorEvent[], labelOf: (e: SafeMarketingBehaviorEvent) => string | undefined, limit: number) => {
  const counts = new Map<string, number>();
  for (const e of events) { const l = labelOf(e); if (!l) continue; counts.set(l, (counts.get(l) ?? 0) + 1); }
  let total = 0; for (const v of counts.values()) total += v;
  return [...counts.entries()].map(([label, clicks]) => ({ label, clicks, clickPercent: pct(clicks, total) })).sort((a, b) => b.clicks - a.clicks).slice(0, limit);
};

// events(safe) → { eventCount, sessionCount, insights }. range 필터 + 세션 집계.
function aggregateSafeEvents(
  events: SafeMarketingBehaviorEvent[],
  options: { startDate?: string; endDate?: string; rangeLabel: string; topLimit: number }
): { eventCount: number; sessionCount: number; insights: SummaryInsights } {
  const startMs = parseMs(options.startDate);
  const endMs = parseMs(options.endDate);
  const filtered = events.filter((e) => {
    if (!e || typeof e.occurredAt !== 'string') return false;
    const t = Date.parse(e.occurredAt);
    if (Number.isNaN(t)) return false;
    if (startMs != null && t < startMs) return false;
    if (endMs != null && t > endMs) return false;
    return true;
  });

  const sessions = new Map<string, SafeMarketingBehaviorEvent[]>();
  for (const e of filtered) {
    const key = typeof e.sessionIdHash === 'string' && e.sessionIdHash ? e.sessionIdHash : '__nosession__';
    const arr = sessions.get(key); if (arr) arr.push(e); else sessions.set(key, [e]);
  }
  for (const arr of sessions.values()) arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const totalSessions = sessions.size;

  const sourceCounts = new Map<string, number>();
  for (const evs of sessions.values()) {
    const entry = evs.find((e) => (e.eventName === 'visit' || e.eventName === 'landing') && e.source) ?? evs.find((e) => e.source);
    const src = entry?.source ?? 'unknown';
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .map(([source, sCount]) => ({ source, label: sourceLabel(source), sessions: sCount, sharePercent: pct(sCount, totalSessions) }))
    .sort((a, b) => b.sessions - a.sessions);

  const pathCounts = new Map<string, { labels: string[]; sessions: number }>();
  for (const evs of sessions.values()) {
    const labels: string[] = [];
    for (const e of evs) { const l = stepLabel(e); if (l && labels[labels.length - 1] !== l) labels.push(l); }
    if (labels.length === 0) continue;
    const limited = labels.slice(0, 5);
    const key = limited.join(' > ');
    const cur = pathCounts.get(key); if (cur) cur.sessions += 1; else pathCounts.set(key, { labels: limited, sessions: 1 });
  }
  const topPaths = [...pathCounts.values()].sort((a, b) => b.sessions - a.sessions).slice(0, options.topLimit)
    .map((p, i) => ({ rank: i + 1, pathLabels: p.labels, sessions: p.sessions, sharePercent: pct(p.sessions, totalSessions) }));

  const banners = clickRank(filtered.filter((e) => e.eventName === 'banner_click'), (e) => e.bannerName, options.topLimit);
  const categories = clickRank(filtered.filter((e) => e.eventName === 'category_click'), (e) => e.categoryName, options.topLimit);
  const products = clickRank(filtered.filter((e) => e.eventName === 'product_view'), (e) => e.productName, options.topLimit);

  const dropCounts = new Map<string, number>();
  for (const evs of sessions.values()) {
    if (evs.some((e) => e.eventName === 'purchase')) continue;
    const label = dropOffLabelFor(evs);
    dropCounts.set(label, (dropCounts.get(label) ?? 0) + 1);
  }
  const dropOffs = [...dropCounts.entries()].map(([label, sCount]) => ({ label, sessions: sCount, dropOffPercent: pct(sCount, totalSessions) })).sort((a, b) => b.sessions - a.sessions).slice(0, options.topLimit + 1);

  const allClicks = [...banners, ...categories, ...products].sort((a, b) => b.clicks - a.clicks);

  const insights: SummaryInsights = {
    dataStatus: { mode: 'live', label: options.rangeLabel, eventCount: filtered.length, connectedSources: topSources.map((s) => s.label), isDemo: false },
    acquisition: { topSources },
    topPaths,
    topClicks: { banners, categories, products },
    dropOffs,
    summaryCards: {
      topSourceLabel: topSources[0]?.label ?? '수집 대기',
      topSourcePercent: topSources[0]?.sharePercent ?? 0,
      topPathLabel: topPaths[0] ? topPaths[0].pathLabels.join(' > ') : '수집 대기',
      topClickLabel: allClicks[0]?.label ?? '수집 대기',
      topDropOffLabel: dropOffs[0]?.label ?? '수집 대기',
      topDropOffPercent: dropOffs[0]?.dropOffPercent ?? 0
    }
  };
  return { eventCount: filtered.length, sessionCount: totalSessions, insights };
}

// summary API route가 호출하는 메인 함수. demo는 만들지 않는다(empty/collecting/live만).
export async function buildMarketingBehaviorSummaryResponse(options?: {
  startDate?: string; endDate?: string; rangeLabel?: string; topLimit?: number;
}): Promise<MarketingBehaviorSummaryApiResponse> {
  const rangeLabel = options?.rangeLabel ?? '전체';
  const topLimit = Math.min(10, Math.max(1, options?.topLimit ?? 5));
  const generatedAt = new Date().toISOString();

  const storage = getMarketingBehaviorStorage();
  const stats = await storage.getStats();
  const storageInfo = { mode: stats.mode, persistentReady: stats.persistentReady };
  const events = await storage.getRecentEventsForAggregation();

  if (!Array.isArray(events) || events.length === 0) {
    // pending이면 collecting, 그 외 empty. demo는 client/modal fallback에서 처리.
    const mode = stats.mode === 'pending' ? 'collecting' : 'empty';
    return {
      ok: true, hasLiveData: false, generatedAt, storage: storageInfo,
      dataStatus: { mode, eventCount: 0, sessionCount: 0, rangeLabel, isEmpty: true },
      insights: null
    };
  }

  const { eventCount, sessionCount, insights } = aggregateSafeEvents(events, { startDate: options?.startDate, endDate: options?.endDate, rangeLabel, topLimit });
  if (eventCount === 0) {
    return {
      ok: true, hasLiveData: false, generatedAt, storage: storageInfo,
      dataStatus: { mode: 'empty', eventCount: 0, sessionCount: 0, rangeLabel, isEmpty: true },
      insights: null
    };
  }
  return {
    ok: true, hasLiveData: true, generatedAt, storage: storageInfo,
    dataStatus: { mode: 'live', eventCount, sessionCount, rangeLabel, isEmpty: false },
    insights
  };
}
