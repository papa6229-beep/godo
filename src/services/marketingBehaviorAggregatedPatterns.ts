import type { MarketingBehaviorEvent, MarketingTrafficSource, MarketingBehaviorInsights } from './marketingBehaviorTypes';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Aggregated Pattern Builder v0
//
// 저장된/수집된 행동 이벤트(MarketingBehaviorEvent[])를 운영자용 누적 패턴으로 계산한다.
//   events → aggregateMarketingBehaviorPatterns() → MarketingBehaviorAggregatedPattern
//
// ★ deterministic(LLM/난수 없음). 입력은 sanitized event라고 가정하되,
//   출력에는 sessionIdHash/orderIdHash 등 식별자·PII를 절대 포함하지 않는다(집계 후 사라짐).
//   searchTerm은 민감할 수 있어 v0에서는 search top list/경로 라벨에 노출하지 않는다('검색'만).
//   대시보드 live wiring은 후속 — 이 파일은 계산만 한다(모달 미연결).
// ────────────────────────────────────────────────────────────────────────────

export type MarketingBehaviorPatternRange = {
  startDate?: string;
  endDate?: string;
  label?: string;
};

export type MarketingBehaviorAggregatedPattern = {
  dataStatus: {
    mode: 'demo' | 'collecting' | 'live' | 'empty';
    eventCount: number;
    sessionCount: number;
    rangeLabel: string;
    isEmpty: boolean;
  };
  acquisition: {
    totalSessions: number;
    topSources: Array<{ source: string; label: string; sessions: number; sharePercent: number }>;
  };
  paths: {
    topPaths: Array<{ rank: number; pathLabels: string[]; sessions: number; sharePercent: number; lastStepLabel: string }>;
  };
  clicks: {
    banners: Array<{ label: string; clicks: number; clickPercent: number }>;
    categories: Array<{ label: string; clicks: number; clickPercent: number }>;
    products: Array<{ label: string; clicks: number; clickPercent: number }>;
  };
  dropOffs: Array<{ label: string; sessions: number; dropOffPercent: number }>;
  summary: {
    topSourceLabel: string;
    topSourcePercent: number;
    topPathLabel: string;
    topClickLabel: string;
    topDropOffLabel: string;
    topDropOffPercent: number;
  };
};

const SOURCE_LABEL: Record<string, string> = {
  blog: '블로그', search: '검색', ad: '광고', sns: 'SNS',
  direct: '직접 방문', referral: '외부 링크', unknown: '알 수 없음'
};
const sourceLabel = (s?: string): string => SOURCE_LABEL[s ?? 'unknown'] ?? '알 수 없음';

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// 경로 노드 라벨(운영자용). exit는 경로에서 제외(이탈 계산에서 사용). searchTerm 미노출.
const stepLabel = (e: MarketingBehaviorEvent): string | null => {
  switch (e.eventName) {
    case 'visit':
    case 'landing': return e.pageTitle || e.pagePath || '메인페이지';
    case 'banner_click': return `배너: ${e.bannerName || '배너'}`;
    case 'category_click': return `카테고리: ${e.categoryName || '카테고리'}`;
    case 'product_view': return `상품: ${e.productName || '상품'}`;
    case 'search': return '검색';
    case 'add_to_cart': return '장바구니';
    case 'checkout_start': return '결제 시작';
    case 'purchase': return '구매 완료';
    case 'exit': return null;
    default: return null;
  }
};

// 마지막 meaningful 이벤트 → 이탈 지점 라벨.
const dropOffLabelFor = (events: MarketingBehaviorEvent[]): string => {
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
    case 'visit':
    case 'landing': return '메인페이지에서 이탈';
    default: return '알 수 없는 지점에서 이탈';
  }
};

const parseMs = (s?: string): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t; // 잘못된 날짜 bound는 무시(전체 빈 결과 대신 해당 bound 미적용)
};

const clickRank = (
  events: MarketingBehaviorEvent[],
  labelOf: (e: MarketingBehaviorEvent) => string | undefined,
  limit: number
): Array<{ label: string; clicks: number; clickPercent: number }> => {
  const counts = new Map<string, number>();
  for (const e of events) {
    const l = labelOf(e);
    if (!l) continue;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let total = 0;
  for (const v of counts.values()) total += v; // 그룹 내 분모(§9: 그룹별 따로)
  return [...counts.entries()]
    .map(([label, clicks]) => ({ label, clicks, clickPercent: pct(clicks, total) }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
};

function emptyPattern(mode: 'demo' | 'collecting' | 'live' | 'empty', rangeLabel: string): MarketingBehaviorAggregatedPattern {
  const wait = '수집 대기';
  return {
    dataStatus: { mode, eventCount: 0, sessionCount: 0, rangeLabel, isEmpty: true },
    acquisition: { totalSessions: 0, topSources: [] },
    paths: { topPaths: [] },
    clicks: { banners: [], categories: [], products: [] },
    dropOffs: [],
    summary: { topSourceLabel: wait, topSourcePercent: 0, topPathLabel: wait, topClickLabel: wait, topDropOffLabel: wait, topDropOffPercent: 0 }
  };
}

export function aggregateMarketingBehaviorPatterns(
  events: MarketingBehaviorEvent[],
  options?: {
    range?: MarketingBehaviorPatternRange;
    now?: Date | string;
    mode?: 'demo' | 'collecting' | 'live';
    topLimit?: number;
  }
): MarketingBehaviorAggregatedPattern {
  const rangeLabel = options?.range?.label ?? '전체';
  const topLimit = options?.topLimit ?? 5;

  // 1) range 필터(occurredAt 기준)
  const startMs = parseMs(options?.range?.startDate);
  const endMs = parseMs(options?.range?.endDate);
  const filtered = (Array.isArray(events) ? events : []).filter((e) => {
    if (!e || typeof e.occurredAt !== 'string') return false;
    const t = Date.parse(e.occurredAt);
    if (Number.isNaN(t)) return false;
    if (startMs != null && t < startMs) return false;
    if (endMs != null && t > endMs) return false;
    return true;
  });

  if (filtered.length === 0) {
    return emptyPattern(options?.mode ?? 'empty', rangeLabel);
  }

  // 2) sessionIdHash 기준 그룹화 + occurredAt 정렬
  const sessions = new Map<string, MarketingBehaviorEvent[]>();
  for (const e of filtered) {
    const key = typeof e.sessionIdHash === 'string' && e.sessionIdHash ? e.sessionIdHash : '__nosession__';
    const arr = sessions.get(key);
    if (arr) arr.push(e); else sessions.set(key, [e]);
  }
  for (const arr of sessions.values()) arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const totalSessions = sessions.size;

  // 4) 유입 source 집계(세션 첫 source 대표)
  const sourceCounts = new Map<string, number>();
  for (const evs of sessions.values()) {
    const entry = evs.find((e) => (e.eventName === 'visit' || e.eventName === 'landing') && e.source) ?? evs.find((e) => e.source);
    const src = (entry?.source ?? 'unknown') as MarketingTrafficSource;
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .map(([source, sCount]) => ({ source, label: sourceLabel(source), sessions: sCount, sharePercent: pct(sCount, totalSessions) }))
    .sort((a, b) => b.sessions - a.sessions);

  // 5) 이동 경로 TOP
  const pathCounts = new Map<string, { labels: string[]; sessions: number }>();
  for (const evs of sessions.values()) {
    const labels: string[] = [];
    for (const e of evs) {
      const l = stepLabel(e);
      if (l && labels[labels.length - 1] !== l) labels.push(l); // 연속 중복 압축
    }
    if (labels.length === 0) continue;
    const limited = labels.slice(0, 5); // 4~5단계 제한
    const key = limited.join(' > ');
    const cur = pathCounts.get(key);
    if (cur) cur.sessions += 1; else pathCounts.set(key, { labels: limited, sessions: 1 });
  }
  const topPaths = [...pathCounts.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, topLimit)
    .map((p, i) => ({ rank: i + 1, pathLabels: p.labels, sessions: p.sessions, sharePercent: pct(p.sessions, totalSessions), lastStepLabel: p.labels[p.labels.length - 1] }));

  // 6) 클릭 TOP (그룹별 분모)
  const banners = clickRank(filtered.filter((e) => e.eventName === 'banner_click'), (e) => e.bannerName, topLimit);
  const categories = clickRank(filtered.filter((e) => e.eventName === 'category_click'), (e) => e.categoryName, topLimit);
  const products = clickRank(filtered.filter((e) => e.eventName === 'product_view'), (e) => e.productName, topLimit);

  // 7) 이탈 지점 — purchase 있는 세션은 구매 완료로 제외(전체 세션 기준 분모).
  const dropCounts = new Map<string, number>();
  for (const evs of sessions.values()) {
    if (evs.some((e) => e.eventName === 'purchase')) continue; // 구매 완료 세션 제외
    const label = dropOffLabelFor(evs);
    dropCounts.set(label, (dropCounts.get(label) ?? 0) + 1);
  }
  const dropOffs = [...dropCounts.entries()]
    .map(([label, sCount]) => ({ label, sessions: sCount, dropOffPercent: pct(sCount, totalSessions) }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, topLimit + 1);

  // 8) summary
  const allClicks = [...banners, ...categories, ...products].sort((a, b) => b.clicks - a.clicks);
  const mode: 'demo' | 'collecting' | 'live' = options?.mode ?? 'live';

  return {
    dataStatus: { mode, eventCount: filtered.length, sessionCount: totalSessions, rangeLabel, isEmpty: false },
    acquisition: { totalSessions, topSources },
    paths: { topPaths },
    clicks: { banners, categories, products },
    dropOffs,
    summary: {
      topSourceLabel: topSources[0]?.label ?? '수집 대기',
      topSourcePercent: topSources[0]?.sharePercent ?? 0,
      topPathLabel: topPaths[0] ? topPaths[0].pathLabels.join(' > ') : '수집 대기',
      topClickLabel: allClicks[0]?.label ?? '수집 대기',
      topDropOffLabel: dropOffs[0]?.label ?? '수집 대기',
      topDropOffPercent: dropOffs[0]?.dropOffPercent ?? 0
    }
  };
}

// ── 향후 모달 live wiring용 변환 helper (이번 작업에서 모달에 연결하지 않음) ──────
// AggregatedPattern → 기존 MarketingBehaviorInsights 형태. shape만 맞춰 후속 wiring 대비.
export function convertAggregatedPatternToInsights(pattern: MarketingBehaviorAggregatedPattern): MarketingBehaviorInsights {
  const mode = pattern.dataStatus.mode === 'empty' ? 'collecting' : pattern.dataStatus.mode;
  return {
    dataStatus: {
      mode,
      label: pattern.dataStatus.rangeLabel,
      eventCount: pattern.dataStatus.eventCount,
      connectedSources: pattern.acquisition.topSources.map((s) => s.label),
      isDemo: false
    },
    acquisition: { topSources: pattern.acquisition.topSources.map((s) => ({ label: s.label, source: s.source as MarketingTrafficSource, sessions: s.sessions, sharePercent: s.sharePercent })) },
    topPaths: pattern.paths.topPaths.map((p) => ({ rank: p.rank, pathLabels: p.pathLabels, sessions: p.sessions, sharePercent: p.sharePercent })),
    topClicks: { banners: pattern.clicks.banners, categories: pattern.clicks.categories, products: pattern.clicks.products },
    dropOffs: pattern.dropOffs,
    summaryCards: {
      topSourceLabel: pattern.summary.topSourceLabel,
      topSourcePercent: pattern.summary.topSourcePercent,
      topPathLabel: pattern.summary.topPathLabel,
      topClickLabel: pattern.summary.topClickLabel,
      topDropOffLabel: pattern.summary.topDropOffLabel,
      topDropOffPercent: pattern.summary.topDropOffPercent
    }
  };
}
