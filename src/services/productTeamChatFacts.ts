// 상품관리팀 채팅 facts builder v0.7
//
// 원칙: 숫자 계산·기간 해석·필터링은 코드가 먼저 한다. Claude는 facts 안에서만 답한다.
// 입력은 상품관리팀 기준 데이터셋(RevenueResult: orders + summary + stockImpact).
// "현재 화면 기준" 질문은 dashboard view state가 채팅에 연결되어 있지 않으므로(대시보드
// 내부 state) 데이터셋 기준으로 답하되 그 사실을 guidance로 안내한다.

import type { RevenueResult } from './departmentDataService';
import { parseAnalyticsQuery } from './analyticsQueryParser';
import { executeAnalyticsQuery } from './analyticsQueryExecutor';
import type { AnalyticsQueryResult } from './analyticsQueryTypes';
import { formatSharePercent } from './productCategoryDisplay';

export interface ProductTeamFacts {
  intent: string;
  periodLabel?: string;
  facts: string[];
  answerGuidance: string;
}

// AnalyticsQueryResult → ProductTeamFacts 변환. 숫자는 executor(코드)가 계산, Claude는 문장화만.
function factsFromAnalyticsResult(result: AnalyticsQueryResult, srcLabel: string): ProductTeamFacts {
  const q = result.query;
  const baseFact = `데이터 기준: ${srcLabel}.`;
  if (result.unsupported) {
    return {
      intent: 'analytics_unsupported', periodLabel: result.periodLabel || undefined,
      facts: [`사용자 질문은 현재 미연결 데이터가 필요하다.`, result.unsupportedReason || result.summaryText, baseFact],
      answerGuidance: '요청은 현재 연결된 주문 데이터로 계산할 수 없다고 솔직히 안내하라. 방문자/광고비/전환 같은 값을 추측하거나 지어내지 마라.'
    };
  }
  const wonN = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const lines: string[] = [];
  if (q.dimension === 'product' && q.aggregation === 'rank') {
    result.rows.forEach((r, i) => lines.push(`${i + 1}위 ${r.label}: 매출 ${wonN(r.revenue ?? r.value)} (판매 ${r.quantity ?? 0}개${r.share != null ? `, 비중 ${formatSharePercent(r.share)}` : ''})`));
  } else if (q.dimension === 'category') {
    result.rows.forEach((r) => lines.push(`${r.label}: 매출 ${wonN(r.revenue ?? r.value)}${r.share != null ? ` (${formatSharePercent(r.share)})` : ''}`));
  } else if (q.dimension === 'time' && q.aggregation === 'trend') {
    result.rows.forEach((r) => lines.push(`${r.label}: 매출 ${wonN(r.revenue ?? r.value)} (주문 ${r.orderCount ?? 0}건)`));
  } else {
    const r = result.rows[0];
    if (r) lines.push(`${r.label}: 매출 ${wonN(r.revenue ?? 0)}, 주문 ${r.orderCount ?? 0}건, 판매수량 ${r.quantity ?? 0}개`);
  }
  return {
    intent: `analytics_${q.dimension}_${q.aggregation}`,
    periodLabel: result.periodLabel || undefined,
    facts: [
      `사용자 질문 해석: ${result.periodLabel || '전체 기간'} 기준 ${q.dimension} ${q.aggregation}.`,
      result.summaryText,
      ...lines,
      `상품팀 대시보드의 같은 기간 상품별 매출순위/비중/추이와 동일한 계산 기준(상품 라인매출)으로 산출했다.`,
      baseFact
    ],
    answerGuidance:
      '제공된 기간 기준 값만 사용하라. 반드시 답변에 기간 기준을 명시하라(예: "2024년 7월 기준"). 순위/비중/추이 질문에 총매출만 답하지 마라. 없는 값은 추측하지 말고, 고도몰 관리자 확인을 권하지 마라. 이 값은 상품팀 전용 상품 라인매출 기준이며 대표 운영 KPI(net)와 다를 수 있다는 점은 필요할 때만 짧게 밝혀라.'
  };
}

// 카탈로그 taxonomy lookup (category_search/brand_search 결과 → 코드 라벨 해석).
// 서버 canonical은 api/_shared/godomallCatalogBinding.ts. 프론트는 경계상 자체 경량 버전을 쓴다.
export interface ProductTeamCatalogLookup {
  categoriesByCode: Record<string, { cateCd: string; cateNm?: string }>;
  brandsByCode: Record<string, { brandCd: string; brandNm?: string }>;
}

const resolveCatNm = (code: string | undefined, catalog?: ProductTeamCatalogLookup): string | null => {
  const c = (code || '').trim();
  if (!c || c === 'uncategorized') return null;
  const hit = catalog?.categoriesByCode?.[c];
  return hit?.cateNm || null;
};

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

const MONTH_LABEL = (ym: string): string => {
  // 'YYYY-MM' → 'M월'
  const m = parseInt(ym.slice(5, 7), 10);
  return `${m}월`;
};

interface MonthAgg { ym: string; revenue: number; orders: number; units: number; }

function aggregateMonthly(revenue: RevenueResult): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  for (const o of revenue.orders) {
    const ym = (o.orderDate || '').slice(0, 7); // YYYY-MM
    if (!ym) continue;
    const cur = map.get(ym) || { ym, revenue: 0, orders: 0, units: 0 };
    cur.revenue += o.productRevenueByLines || 0;
    cur.orders += 1;
    cur.units += (o.lines || []).reduce((s, l) => s + (l.quantity || 0), 0);
    map.set(ym, cur);
  }
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

// ── 기간(월 범위) 파싱/집계 — 대시보드와 같은 데이터 기준으로 grounding ──
const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymYearLabel = (ym: string): string => `${ym.slice(0, 4)}년 ${parseInt(ym.slice(5, 7), 10)}월`;
const ymAdd = (ym: string, delta: number): string => {
  const y = parseInt(ym.slice(0, 4), 10);
  const m0 = parseInt(ym.slice(5, 7), 10) - 1 + delta;
  const ny = y + Math.floor(m0 / 12);
  const nm = ((m0 % 12) + 12) % 12;
  return `${ny}-${pad2(nm + 1)}`;
};
const enumerateMonths = (startYm: string, endYm: string): string[] => {
  const out: string[] = [];
  if (!startYm || !endYm || startYm > endYm) return out;
  let cur = startYm;
  let guard = 0;
  while (cur <= endYm && guard < 240) { out.push(cur); cur = ymAdd(cur, 1); guard += 1; }
  return out;
};
// 보유 데이터의 월 범위(min~max)
export const availableMonthRange = (monthly: MonthAgg[]): { min: string; max: string } | null =>
  monthly.length ? { min: monthly[0].ym, max: monthly[monthly.length - 1].ym } : null;

// "YYYY(년) M월 ~ YYYY(년) M월" / "부터~까지" / "최근 N개월" 파싱
export const parseRequestedMonthRange = (
  userText: string,
  monthly: MonthAgg[]
): { startYm: string; endYm: string } | null => {
  const m = userText.match(/(\d{4})\s*년?\s*(\d{1,2})\s*월[\s\S]*?(\d{4})\s*년?\s*(\d{1,2})\s*월/);
  if (m) {
    const a = `${m[1]}-${pad2(parseInt(m[2], 10))}`;
    const b = `${m[3]}-${pad2(parseInt(m[4], 10))}`;
    return a <= b ? { startYm: a, endYm: b } : { startYm: b, endYm: a };
  }
  const r = userText.match(/최근\s*(\d{1,2})\s*개\s*월/);
  if (r) {
    const avail = availableMonthRange(monthly);
    if (!avail) return null;
    const n = Math.max(1, parseInt(r[1], 10));
    return { startYm: ymAdd(avail.max, -(n - 1)), endYm: avail.max };
  }
  return null;
};

// 요청 범위를 보유 범위로 클램프 후 월별 매출/주문 라인 생성(전월 대비 포함)
const deriveMonthlyRangeLines = (monthly: MonthAgg[], startYm: string, endYm: string): string[] => {
  const map = new Map(monthly.map((x) => [x.ym, x]));
  const avail = availableMonthRange(monthly);
  const start = avail && startYm < avail.min ? avail.min : startYm;
  const end = avail && endYm > avail.max ? avail.max : endYm;
  const lines: string[] = [];
  let prev: number | null = null;
  for (const ym of enumerateMonths(start, end)) {
    const agg = map.get(ym);
    const rev = agg?.revenue ?? 0;
    const ord = agg?.orders ?? 0;
    const mom = prev !== null && prev > 0 ? `${(((rev - prev) / prev) * 100).toFixed(1)}%` : '-';
    lines.push(`${ymYearLabel(ym)}: 매출 ${won(rev)}, 주문 ${ord}건 (전월 대비 ${mom})`);
    prev = rev;
  }
  return lines;
};

function aggregateCategory(revenue: RevenueResult, catalog?: ProductTeamCatalogLookup): { label: string; revenue: number }[] {
  const map = new Map<string, number>();
  for (const o of revenue.orders) {
    for (const l of o.lines || []) {
      // catalog가 있으면 cateCd→cateNm 한글 라벨 우선, 없으면 기존 categoryLabel(코드) 유지.
      const key = resolveCatNm(l.categoryCode, catalog) || l.categoryLabel || '미분류';
      map.set(key, (map.get(key) || 0) + (l.lineRevenue || 0));
    }
  }
  return [...map.entries()].map(([label, rev]) => ({ label, revenue: rev })).sort((a, b) => b.revenue - a.revenue);
}

// 카탈로그 taxonomy facts (catalog가 주어졌을 때만). 라인의 카테고리 코드 해석률 + 카탈로그 규모.
function buildCatalogTaxonomyFacts(revenue: RevenueResult, catalog: ProductTeamCatalogLookup): string[] {
  const categoryCount = Object.keys(catalog.categoriesByCode || {}).length;
  const brandCount = Object.keys(catalog.brandsByCode || {}).length;
  const lineCodes = new Set<string>();
  for (const o of revenue.orders) {
    for (const l of o.lines || []) {
      const c = (l.categoryCode || '').trim();
      if (c && c !== 'uncategorized') lineCodes.add(c);
    }
  }
  const codes = [...lineCodes];
  const resolved = codes.filter((c) => resolveCatNm(c, catalog));
  const unresolved = codes.filter((c) => !resolveCatNm(c, catalog));
  const rate = codes.length ? Math.round((resolved.length / codes.length) * 100) : 0;
  return [
    `카탈로그 규모: 카테고리 ${categoryCount}종, 브랜드 ${brandCount}종 (category_search/brand_search 기준).`,
    `주문 라인의 카테고리 코드 ${codes.length}종 중 ${resolved.length}종 라벨 해석됨 (해석률 ${rate}%).`,
    unresolved.length ? `미해석 카테고리 코드: ${unresolved.map((c) => `unknown category ${c}`).join(', ')}` : '미해석 카테고리 코드 없음.',
    '브랜드는 현재 주문 라인에 코드가 없어 라인 단위 브랜드 해석은 미지원(상품 brandCd 연결은 다음 단계).'
  ];
}

function aggregateTopProducts(revenue: RevenueResult): { name: string; revenue: number; units: number }[] {
  const map = new Map<string, { name: string; revenue: number; units: number }>();
  for (const o of revenue.orders) {
    for (const l of o.lines || []) {
      const key = l.goodsName || l.goodsNo || '(이름 없음)';
      const cur = map.get(key) || { name: key, revenue: 0, units: 0 };
      cur.revenue += l.lineRevenue || 0;
      cur.units += l.quantity || 0;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

const dataSourceLabel = (revenue: RevenueResult): string => {
  const s = revenue.summary;
  if (s && s.syntheticOrderCount > 0 && s.realOrderCount > 0) return 'REAL 상품 + SYNTHETIC 매출/주문/재고';
  if (s && s.syntheticOrderCount > 0) return 'SYNTHETIC 매출/주문/재고';
  return 'REAL 상품 데이터';
};

// 데이터 한계(회원/세그먼트/유입 등) 질문 감지
const LIMIT_KEYWORDS = ['신규회원', '비회원', '기존회원', '충성고객', '회원', '연령', '재구매', '세그먼트', '유입', '성별', '나이'];

export function buildProductTeamChatFacts(
  userText: string,
  revenue: RevenueResult | null,
  catalog?: ProductTeamCatalogLookup
): ProductTeamFacts | null {
  if (!revenue || !revenue.orders || revenue.orders.length === 0) return null;

  const t = norm(userText);
  const totalRevenue = revenue.summary?.productRevenueByLines
    ?? revenue.orders.reduce((s, o) => s + (o.productRevenueByLines || 0), 0);
  const srcLabel = dataSourceLabel(revenue);
  const baseFact = `데이터 기준: ${srcLabel}. 전체 기간 상품매출 ${won(totalRevenue)}.`;

  // ★ 공통 Analytics Query 계층 우선 시도 — 대시보드와 같은 계산 경로.
  //   v0 인터셉트 범위 = 고신뢰 rank(상품순위)/share(카테고리비중) + unsupported.
  //   추이(trend)·범위/최근N개월·단일월요약·총합·회원/세그먼트/현재화면은 기존 분기가 이미 정상 → 그대로 둔다.
  //   (처리 불가/범위 밖이면 executor가 null 반환 → 아래 기존 fallback으로.)
  const aq = parseAnalyticsQuery(userText, { team: 'product' });
  if (aq.unsupportedReason || (aq.confidence === 'high' && (aq.aggregation === 'rank' || aq.aggregation === 'share'))) {
    const res = executeAnalyticsQuery(aq, { orders: revenue.orders });
    if (res) return factsFromAnalyticsResult(res, srcLabel);
  }

  // 0) 데이터 한계 질문 (회원/세그먼트 등) — 없는 데이터는 없다고 안내
  if (LIMIT_KEYWORDS.some(k => t.includes(k))) {
    return {
      intent: 'data_limit',
      facts: [
        '사용자가 회원 유형/연령/재구매/세그먼트/유입 등을 질문했다.',
        '현재 상품관리팀 데이터에는 회원 유형·연령·재구매율·고객 세그먼트·유입 경로 정보가 없다.',
        '답변 가능한 범위: 상품, 매출, 주문, 판매수량, 가상 재고.',
        baseFact
      ],
      answerGuidance:
        '없는 데이터(회원/연령/재구매/세그먼트/유입)는 추측하지 말고 "현재 상품관리팀에 연결된 데이터에는 해당 정보가 아직 포함되어 있지 않습니다"라고 솔직히 안내하라. 상품/매출/주문/판매수량/가상 재고 기준으로만 답할 수 있다고 설명하라.'
    };
  }

  // 1) 현재 화면 기준 질문 (가장 먼저 — 명시적 "현재 화면" 표현이면 데이터셋 기본 기준보다 우선)
  if (t.includes('현재화면') || t.includes('지금화면') || t.includes('화면기준') || t.includes('지금선택') || t.includes('필터적용') || t.includes('선택된기간')) {
    return {
      intent: 'current_screen',
      facts: [
        '사용자가 "현재 화면 기준"을 질문했다.',
        '채팅은 대시보드의 현재 필터/기간 선택 상태를 직접 읽지 못한다(대시보드 내부 상태).',
        baseFact
      ],
      answerGuidance:
        '현재 화면의 필터 상태는 채팅에서 직접 읽을 수 없다고 솔직히 안내하라. 대신 전체 데이터셋 기준 값을 알려주고, 특정 월/카테고리를 말해주면 그 기준으로 계산해 답하겠다고 제안하라. 고도몰 관리자 확인을 권하지 마라.'
    };
  }

  // 1.5) 기간 범위 질문 (YYYY년 M월~YYYY년 M월 / 최근 N개월) — 단일 월 매칭보다 먼저!
  const monthlyAll = aggregateMonthly(revenue);
  const reqRange = parseRequestedMonthRange(userText, monthlyAll);
  if (reqRange) {
    const avail = availableMonthRange(monthlyAll);
    const wantOrders = t.includes('주문');
    const rangeLabel = `${ymYearLabel(reqRange.startYm)} ~ ${ymYearLabel(reqRange.endYm)}`;
    // 요청 범위가 보유 데이터와 전혀 겹치지 않을 때만 "없음"
    if (avail && (reqRange.endYm < avail.min || reqRange.startYm > avail.max)) {
      return {
        intent: 'monthly_range',
        periodLabel: rangeLabel,
        facts: [
          `사용자는 ${rangeLabel} 기간을 질문했다.`,
          `데이터셋 보유 기간: ${ymYearLabel(avail.min)} ~ ${ymYearLabel(avail.max)} (${monthlyAll.length}개월).`,
          '요청 기간이 보유 기간과 겹치지 않는다.',
          baseFact
        ],
        answerGuidance: `요청 기간이 보유 데이터(${ymYearLabel(avail.min)}~${ymYearLabel(avail.max)})와 겹치지 않으면 그 사실만 안내하고 보유 기간을 알려줘라. 전체 값을 요청 기간 값처럼 답하지 마라.`
      };
    }
    const lines = deriveMonthlyRangeLines(monthlyAll, reqRange.startYm, reqRange.endYm);
    return {
      intent: 'monthly_range',
      periodLabel: rangeLabel,
      facts: [
        `사용자는 ${rangeLabel} 월별 ${wantOrders ? '주문 수' : '매출'}을 질문했다.`,
        `데이터셋 보유 기간: ${avail ? `${ymYearLabel(avail.min)} ~ ${ymYearLabel(avail.max)}` : '없음'} (요청 기간 중 보유분만 집계).`,
        ...lines,
        baseFact
      ],
      answerGuidance: `각 월 값을 표/목록으로 정리하라(${wantOrders ? '주문 수' : '매출'} 우선, 둘 다 제공됨). 제공된 월별 값만 사용하라. 보유 기간 내 데이터가 있으므로 "데이터 없음"이라고 단정하지 마라. 일부 월만 보고 전체 기간을 판단하지 마라. 고도몰 관리자 확인을 권하지 마라.`
    };
  }

  // 2) 특정 월 질문
  const monthMatch = userText.match(/(\d{1,2})\s*월/);
  const isThisMonth = t.includes('이번달');
  if (monthMatch || isThisMonth) {
    const monthly = aggregateMonthly(revenue);
    let targetYm: string | undefined;
    let periodLabel: string;
    if (monthMatch) {
      const m = parseInt(monthMatch[1], 10);
      periodLabel = `${m}월`;
      targetYm = monthly.find(x => parseInt(x.ym.slice(5, 7), 10) === m)?.ym;
    } else {
      targetYm = monthly[monthly.length - 1]?.ym;
      periodLabel = targetYm ? `${MONTH_LABEL(targetYm)}(최신)` : '이번 달';
    }
    const agg = targetYm ? monthly.find(x => x.ym === targetYm) : undefined;
    if (!agg) {
      return {
        intent: 'monthly_revenue',
        periodLabel,
        facts: [
          `사용자는 ${periodLabel} 상품매출을 질문했다.`,
          `현재 데이터셋에 ${periodLabel} 데이터가 없다. (보유 월: ${monthly.map(x => MONTH_LABEL(x.ym)).join(', ') || '없음'})`,
          baseFact
        ],
        answerGuidance: `${periodLabel} 데이터가 없으면 "현재 상품관리팀 데이터에는 ${periodLabel} 매출 데이터가 없습니다"라고 안내하고, 보유한 월 목록을 알려줘라. 전체 값을 ${periodLabel} 값처럼 답하지 마라.`
      };
    }
    const pct = totalRevenue > 0 ? (agg.revenue / totalRevenue) * 100 : 0;
    return {
      intent: 'monthly_revenue',
      periodLabel,
      facts: [
        `사용자는 ${periodLabel} 상품매출을 질문했다.`,
        `${periodLabel} 상품매출: ${won(agg.revenue)} (주문 ${agg.orders}건, 판매수량 ${agg.units}개)`,
        `전체 기간 상품매출: ${won(totalRevenue)} → ${periodLabel}은 전체의 약 ${pct.toFixed(1)}%`,
        baseFact
      ],
      answerGuidance: `반드시 ${periodLabel} 값(${won(agg.revenue)})을 우선 답하라. 전체 매출을 ${periodLabel} 매출처럼 답하지 마라. 값이 있으므로 "고도몰 관리자에서 확인"하라고 하지 마라.`
    };
  }

  // 2) 월별 추이
  if (t.includes('월별') || t.includes('월간') || t.includes('추이')) {
    const monthly = aggregateMonthly(revenue);
    const lines = monthly.map(x => `${MONTH_LABEL(x.ym)}: ${won(x.revenue)} (주문 ${x.orders}건)`);
    const top = [...monthly].sort((a, b) => b.revenue - a.revenue)[0];
    const low = [...monthly].sort((a, b) => a.revenue - b.revenue)[0];
    return {
      intent: 'monthly_trend',
      facts: [
        '사용자는 월별 매출 추이를 질문했다.',
        ...lines,
        top ? `최고 매출 월: ${MONTH_LABEL(top.ym)} (${won(top.revenue)})` : '',
        low ? `최저 매출 월: ${MONTH_LABEL(low.ym)} (${won(low.revenue)})` : '',
        baseFact
      ].filter(Boolean),
      answerGuidance: '월별 리스트를 간결히 정리하고 최고/최저 월을 함께 짚어줘라. 제공된 값만 사용하라.'
    };
  }

  // 2-b) 카탈로그 taxonomy (브랜드/분류축/카탈로그 질문) — catalog가 연결됐을 때만 의미
  if (catalog && (t.includes('브랜드') || t.includes('분류축') || t.includes('카탈로그') || t.includes('택소노미') || t.includes('카테고리종류') || t.includes('카테고리수'))) {
    return {
      intent: 'catalog_taxonomy',
      facts: ['사용자는 카탈로그 분류축(카테고리/브랜드)을 질문했다.', ...buildCatalogTaxonomyFacts(revenue, catalog), baseFact],
      answerGuidance: '카탈로그 규모와 카테고리 라벨 해석률을 정리해 답하라. 미해석 코드는 "unknown category <코드>"로 솔직히 표시하라. 브랜드는 라인 단위 데이터가 없으면 없다고 안내하라. 제공된 값만 사용하라.'
    };
  }

  // 3) 카테고리 비중
  if (t.includes('카테고리') || t.includes('비중') || t.includes('구성')) {
    const cats = aggregateCategory(revenue, catalog);
    const lines = cats.map(c => {
      const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
      return `${c.label}: ${won(c.revenue)} (약 ${pct.toFixed(1)}%)`;
    });
    return {
      intent: 'category_share',
      facts: ['사용자는 카테고리별 매출 비중을 질문했다.', ...lines, baseFact],
      answerGuidance: '카테고리별 매출과 비중을 정리해 답하라. 제공된 값만 사용하라.'
    };
  }

  // 4) 상품별 매출 순위 (명시적 순위 표현만)
  if (t.includes('순위') || t.includes('랭킹') || t.includes('상위') || t.includes('top') || t.includes('베스트')) {
    const tops = aggregateTopProducts(revenue).slice(0, 8);
    const lines = tops.map((p, i) => `${i + 1}위 ${p.name}: ${won(p.revenue)} (판매 ${p.units}개)`);
    return {
      intent: 'top_products',
      facts: ['사용자는 상품별 매출 순위를 질문했다.', ...lines, baseFact],
      answerGuidance: '상품별 매출 순위를 정리해 답하라. 제공된 순위/값만 사용하라.'
    };
  }

  // 5) 재고 위험
  if (t.includes('재고') || t.includes('품절') || t.includes('위험')) {
    const risks = revenue.stockImpact
      .map(s => ({
        name: s.productName,
        stock: s.syntheticProjectedStock,
        sold: s.syntheticSoldQuantity,
        restored: s.syntheticRestoredQuantity,
        level: s.syntheticProjectedStock <= 0 ? 'danger' : s.syntheticProjectedStock <= 5 ? 'warning' : 'ok'
      }))
      .filter(r => r.level !== 'ok')
      .sort((a, b) => a.stock - b.stock);
    const lines = risks.slice(0, 12).map(r => `${r.name}: 가상 재고 ${r.stock}개 (${r.level === 'danger' ? '위험' : '주의'}, 판매 ${r.sold}/복구 ${r.restored})`);
    return {
      intent: 'stock_risk',
      facts: [
        '사용자는 재고 위험 상품을 질문했다.',
        risks.length === 0 ? '현재 가상 재고 기준 위험/주의 상품이 없다.' : `위험/주의 상품 ${risks.length}종.`,
        ...lines,
        baseFact
      ],
      answerGuidance: '가상 재고(stockImpact) 기준으로 위험/주의 상품을 정리하라. 실제 고도몰 재고가 아니라 synthetic 가상 재고 기준임을 한 번 밝혀라. 제공된 값만 사용하라.'
    };
  }

  // 7) 전체/총합 또는 일반 매출 질문
  if (t.includes('전체') || t.includes('총') || t.includes('누적') || t.includes('매출')) {
    const s = revenue.summary;
    return {
      intent: 'total_revenue',
      facts: [
        '사용자는 전체/일반 매출을 질문했다.',
        `전체 기간 상품매출: ${won(totalRevenue)}`,
        s ? `총 주문 ${s.orderCount}건(실 ${s.realOrderCount} + 가상 ${s.syntheticOrderCount}), 배송비 ${won(s.deliveryFeeTotal)}, 총주문금액 ${won(s.totalAmount)}` : '',
        baseFact
      ].filter(Boolean),
      answerGuidance: '전체 기간 기준임을 명확히 밝히고 값을 답하라. 특정 월을 원하면 말해달라고 덧붙여라. 고도몰 관리자 확인을 권하지 마라.'
    };
  }

  // 그 외 — 일반 컨텍스트만 제공
  return {
    intent: 'general',
    facts: [baseFact, '상품/매출/주문/판매수량/가상 재고 데이터를 참고해 답할 수 있다.'],
    answerGuidance: '제공된 상품관리팀 데이터 범위에서 답하라. 없는 값은 추측하지 말고 없다고 안내하라. 고도몰 관리자 확인을 권하지 마라.'
  };
}
