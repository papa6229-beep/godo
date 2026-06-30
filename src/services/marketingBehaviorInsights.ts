import type {
  MarketingBehaviorEvent,
  MarketingBehaviorInsights,
  MarketingBehaviorDataMode,
  MarketingTrafficSource
} from './marketingBehaviorTypes';
import { DEMO_BEHAVIOR_INSIGHTS } from './marketingBehaviorDemoData';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Data Contract v0 — 분석 변환 레이어
//
// buildMarketingBehaviorInsights(events, options)
//   - events 있음 → 실제 deterministic 집계(유입/이동/클릭/이탈) → live 인사이트
//   - events 없음 + fallbackDemo → 데모 인사이트(승인 예시값)
//   - events 없음 + !fallbackDemo → 수집 대기(empty) 인사이트
//   - mode:'demo' 명시 → 항상 데모 인사이트(현재 모달이 사용)
//
// ★ 실 수집 시작 시점에 모달 호출을 (liveEvents, {mode:'live', fallbackDemo:false})로 바꾸면
//   동일 빌더가 같은 화면을 실데이터로 채운다. UI/계약 변경 불필요.
// LLM 숫자 생성 없음 / fake 수치 없음(데모는 isDemo로 명시) / PII 없음(해시·공개정보만).
// ────────────────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<MarketingTrafficSource, string> = {
  blog: '블로그', search: '검색', ad: '광고', sns: 'SNS',
  direct: '직접 방문', referral: '추천 링크', unknown: '알 수 없음'
};

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// 경로 노드 라벨(이탈/세션시작 외 이동 단계). null이면 경로에서 제외.
const nodeLabel = (e: MarketingBehaviorEvent): string | null => {
  switch (e.eventName) {
    case 'visit':
    case 'landing': return e.pageTitle || e.pagePath || '메인페이지';
    case 'banner_click': return e.bannerName || '배너';
    case 'category_click': return e.categoryName || '카테고리';
    case 'product_view': return e.productName || '상품';
    case 'search': return '검색';
    case 'add_to_cart': return '장바구니';
    case 'checkout_start': return '결제 시작';
    case 'purchase': return '구매 완료';
    case 'exit': return null;
    default: return null;
  }
};

const dropOffLabel = (e: MarketingBehaviorEvent): string => e.pageTitle || e.pagePath || '알 수 없음';

// 세션별로 이벤트를 시간순 정렬해 묶는다(원문 sessionId 없이 해시 키로만).
function groupSessions(events: MarketingBehaviorEvent[]): Map<string, MarketingBehaviorEvent[]> {
  const map = new Map<string, MarketingBehaviorEvent[]>();
  for (const e of events) {
    const arr = map.get(e.sessionIdHash);
    if (arr) arr.push(e); else map.set(e.sessionIdHash, [e]);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return map;
}

// 라벨별 클릭수 집계 → 정렬된 배열(clickPercent = 클릭수 / 전체 세션수).
function clickRank(events: MarketingBehaviorEvent[], labelOf: (e: MarketingBehaviorEvent) => string | undefined, totalSessions: number, limit = 5): Array<{ label: string; clicks: number; clickPercent: number }> {
  const counts = new Map<string, number>();
  for (const e of events) {
    const l = labelOf(e);
    if (!l) continue;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, clicks]) => ({ label, clicks, clickPercent: pct(clicks, totalSessions) }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}

function emptyInsights(mode: MarketingBehaviorDataMode): MarketingBehaviorInsights {
  const label = mode === 'collecting' ? '수집 대기 중 (아직 행동 데이터 없음)' : '데이터 없음';
  return {
    dataStatus: { mode, label, eventCount: 0, connectedSources: [], isDemo: false },
    acquisition: { topSources: [] },
    topPaths: [],
    topClicks: { banners: [], categories: [], products: [] },
    dropOffs: [],
    summaryCards: {
      topSourceLabel: '—', topSourcePercent: 0,
      topPathLabel: '—', topClickLabel: '—',
      topDropOffLabel: '—', topDropOffPercent: 0
    }
  };
}

export function buildMarketingBehaviorInsights(
  events: MarketingBehaviorEvent[],
  options?: { mode?: MarketingBehaviorDataMode; fallbackDemo?: boolean }
): MarketingBehaviorInsights {
  const mode = options?.mode;
  const fallbackDemo = options?.fallbackDemo ?? false;

  // demo 명시 → 승인 데모값(실데이터 오해 방지 isDemo=true).
  if (mode === 'demo') return DEMO_BEHAVIOR_INSIGHTS;

  // 실 이벤트 없음 → fallbackDemo면 데모, 아니면 수집 대기.
  if (!events || events.length === 0) {
    return fallbackDemo ? DEMO_BEHAVIOR_INSIGHTS : emptyInsights('collecting');
  }

  // ── 실데이터 집계 ──────────────────────────────────────────────────────────
  const sessions = groupSessions(events);
  const totalSessions = sessions.size;

  // 1) 유입: 세션의 (visit/landing) source별 세션수
  const sourceCounts = new Map<MarketingTrafficSource, number>();
  for (const evs of sessions.values()) {
    const entry = evs.find((e) => (e.eventName === 'visit' || e.eventName === 'landing') && e.source) ?? evs.find((e) => e.source);
    const src = (entry?.source ?? 'unknown') as MarketingTrafficSource;
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .map(([source, sCount]) => ({ label: SOURCE_LABEL[source] ?? source, source, sessions: sCount, sharePercent: pct(sCount, totalSessions) }))
    .sort((a, b) => b.sessions - a.sessions);

  // 2) 이동 경로: 세션별 노드 시퀀스(연속 중복 제거, exit 제외) → 동일 경로 세션수
  const pathCounts = new Map<string, { labels: string[]; sessions: number }>();
  for (const evs of sessions.values()) {
    const labels: string[] = [];
    for (const e of evs) {
      const l = nodeLabel(e);
      if (l && labels[labels.length - 1] !== l) labels.push(l);
    }
    if (labels.length === 0) continue;
    const key = labels.join(' > ');
    const cur = pathCounts.get(key);
    if (cur) cur.sessions += 1; else pathCounts.set(key, { labels, sessions: 1 });
  }
  const topPaths = [...pathCounts.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5)
    .map((p, i) => ({ rank: i + 1, pathLabels: p.labels, sessions: p.sessions, sharePercent: pct(p.sessions, totalSessions) }));

  // 3) 클릭 TOP: 배너/카테고리/상품
  const banners = clickRank(events.filter((e) => e.eventName === 'banner_click'), (e) => e.bannerName, totalSessions);
  const categories = clickRank(events.filter((e) => e.eventName === 'category_click'), (e) => e.categoryName, totalSessions);
  const products = clickRank(events.filter((e) => e.eventName === 'product_view'), (e) => e.productName, totalSessions);

  // 4) 이탈: exit 이벤트 라벨별 세션수
  const exitCounts = new Map<string, number>();
  for (const e of events) {
    if (e.eventName !== 'exit') continue;
    const l = dropOffLabel(e);
    exitCounts.set(l, (exitCounts.get(l) ?? 0) + 1);
  }
  const dropOffs = [...exitCounts.entries()]
    .map(([label, sCount]) => ({ label, sessions: sCount, dropOffPercent: pct(sCount, totalSessions) }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 6);

  // 가장 많이 클릭된 단일 항목(요약 카드용)
  const allClicks = [...banners, ...categories, ...products].sort((a, b) => b.clicks - a.clicks);

  const connectedSources = topSources.map((s) => s.label);
  const resolvedMode: MarketingBehaviorDataMode = mode ?? 'live';

  return {
    dataStatus: {
      mode: resolvedMode,
      label: resolvedMode === 'live' ? '실시간 수집 중' : '수집 중',
      eventCount: events.length,
      connectedSources,
      isDemo: false
    },
    acquisition: { topSources },
    topPaths,
    topClicks: { banners, categories, products },
    dropOffs,
    summaryCards: {
      topSourceLabel: topSources[0]?.label ?? '—',
      topSourcePercent: topSources[0]?.sharePercent ?? 0,
      topPathLabel: topPaths[0] ? topPaths[0].pathLabels.join(' > ') : '—',
      topClickLabel: allClicks[0]?.label ?? '—',
      topDropOffLabel: dropOffs[0]?.label ?? '—',
      topDropOffPercent: dropOffs[0]?.dropOffPercent ?? 0
    }
  };
}
