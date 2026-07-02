// ────────────────────────────────────────────────────────────────────────────
// Commerce Query Plan Compiler — 이해=LLM, 검증=코드
//
// 자연어 질문 → Claude가 QueryPlan(원시연산 조립 지시서) JSON으로 "구조화"만 한다(숫자 계산 금지).
//   Validator(코드)가 Data Catalog(허용 축·지표·연산)만 통과시키고, 숫자 결과를 넣으면 reject한다.
//   LLM 실패(키 미연결/파싱 실패/검증 실패) 시 deterministic regex 파서 → QueryPlan 어댑터로 fallback.
//
// 원칙: "오픈북" — LLM은 "무엇을 어떻게 조립할지"만 정하고, 숫자는 executor(코드)가 계산한다.
// ────────────────────────────────────────────────────────────────────────────

import type { AnalyticsQuery, AnalyticsTeam, AnalyticsPeriod } from './analyticsQueryTypes';
import { parseAnalyticsQuery } from './analyticsQueryParser';
import {
  AXES, METRICS, OPERATIONS, METRIC_SOURCE, UNSUPPORTED_METRICS,
  type Axis, type Metric, type Operation, type PlanFilters, type QueryPlan
} from './commerceQueryPlan';

// 데이터 조회·계산 신호(deterministic fallback에서 "열린 질문"과 구분).
const DATA_SIGNAL_RE = /매출|주문|객단가|판매|수량|상품|카테고리|쿠폰|회원|채널|비중|순위|랭킹|추이|흐름|최고|최저|가장|피크|top\b|월별|몇\s*월|어느\s*달|분기|비교|평균|합계|문의|리뷰|평점|(?:20)\d{2}\s*년/i;
// 원인/전략/해석형(열린 질문) — 데이터 단순 조회가 아님 → 엔진 미처리, 열린 경로로.
const OPEN_QUESTION_RE = /왜|이유|원인|때문|전략|제안|추천해|개선|인사이트|어떻게\s*해|분석해\s*줘\s*$/i;

// LLM이 절대 만들면 안 되는 "계산 결과" 성격 키(숫자를 지어내면 reject).
const FORBIDDEN_RESULT_KEYS = ['value', 'result', 'answer', 'total', 'sum', 'revenue', 'ordercount', 'orders', 'aov', 'averageordervalue', 'amount', 'count', 'computed', 'numericanswer'];

// 미연결(외부) 데이터 — 계산 금지, unsupported.
const UNSUPPORTED_CATALOG = [
  { re: /roas|광고\s*수익|광고비|투자\s*대비\s*수익/i, reason: 'ROAS·광고 성과는 광고비/attribution 데이터가 필요해 현재 데이터로는 산출할 수 없습니다.' },
  { re: /방문자|세션|visitor|전환\s*율|전환율|conversion/i, reason: '방문자/전환율은 방문자·세션 데이터가 필요합니다.' },
  { re: /노출|impression|클릭수|ctr/i, reason: '노출/클릭은 광고·유입 데이터가 필요합니다.' },
  { re: /장바구니|cart\s*abandon/i, reason: '장바구니 지표는 장바구니 이벤트 데이터가 필요합니다.' }
];

// 지표 소스별 허용 축(축이 그 소스에서 추출 가능한지 — Data Catalog 정합성).
const AXES_FOR_SOURCE: Record<'orders' | 'inquiries' | 'reviews', Set<Axis>> = {
  orders: new Set<Axis>(['year', 'month', 'product', 'category', 'couponUsed', 'memberGroup', 'channel', 'customerType']),
  inquiries: new Set<Axis>(['year', 'month', 'product', 'category', 'inquiryProduct']),
  reviews: new Set<Axis>(['year', 'month', 'product', 'category', 'reviewRating'])
};

export function buildQueryPlanPrompt(message: string): string {
  return [
    '너는 쇼핑몰 데이터 질문을 "원시연산 조립 지시서(QueryPlan JSON)"로 변환하는 컴파일러다.',
    '숫자를 계산하지 마라. 아래 스키마의 JSON 하나만 출력한다(설명/코드펜스 금지).',
    '',
    '[허용 지표(metric)] ' + METRICS.join(' | '),
    '[허용 축(groupBy/seriesBy)] ' + AXES.join(' | '),
    '[허용 연산(operation)] ' + OPERATIONS.join(' | '),
    '[불가능] 방문자·광고비·노출·클릭·전환율·장바구니·ROAS → unsupportedReason에 이유를 적어라.',
    '',
    '[스키마]',
    'metric: 위 허용 지표 중 하나(주 지표).',
    'secondaryMetric?: 보조/교차 지표(예: "문의 많은 상품 중 매출" → metric:inquiryCount, secondaryMetric:revenue).',
    'groupBy?: 1차로 묶는 축(예: 월별→month, 상품별→product, 쿠폰 사용/미사용→couponUsed).',
    'seriesBy?: 나란히 비교할 series 축(예: 연도별 비교→year, 세그먼트 비교→couponUsed).',
    'operation: summarize | trend | rank | compare | share | extremes | argmax | argmin',
    'filters?: { years?:[정수], months?:[정수], start?:"YYYY-MM-DD", end?:"YYYY-MM-DD", couponUsed?:bool, customerType?:"first"|"repeat", memberGroup?:문자열, channel?:문자열, category?:코드, goodsNo?:코드 }',
    'topN?:정수, sort?:"asc"|"desc", chartRequested?:bool, chartSuppressed?:bool, unsupportedReason?:문자열',
    '',
    '[핵심 규칙]',
    '- "월별/추이/흐름"은 groupBy:month. 연도 여러 개를 "비교"하면 seriesBy:year 를 반드시 넣어 나란히 비교한다.',
    '- 값 계산 결과(value/total/매출액 숫자 등)는 절대 넣지 마라. 기간은 질문 그대로 보존(넓히지 마라).',
    '- "가장 높은/최고" → argmax, "가장 낮은/최저" → argmin, "최고와 최저 함께" → extremes.',
    '- "순위/베스트/많이 팔린" → rank. "비중/점유율" → share.',
    '- 쿠폰 사용 vs 미사용처럼 두 그룹 비교는 groupBy:couponUsed (또는 seriesBy).',
    '- 왜/원인/전략/제안 같은 열린 질문이면 {"notData":true} 만 출력.',
    '',
    '[예시]',
    '질문: 2024년과 2025년의 월별 매출을 그래프로 비교해줘',
    '출력: {"metric":"revenue","groupBy":"month","seriesBy":"year","operation":"trend","filters":{"years":[2024,2025]},"chartRequested":true}',
    '질문: 2024년과 2025년의 월별 객단가를 그래프로 보여줘',
    '출력: {"metric":"averageOrderValue","groupBy":"month","seriesBy":"year","operation":"trend","filters":{"years":[2024,2025]},"chartRequested":true}',
    '질문: 2025년 매출 가장 높았던 달과 낮았던 달',
    '출력: {"metric":"revenue","groupBy":"month","operation":"extremes","filters":{"years":[2025]},"chartRequested":true}',
    '질문: 쿠폰 사용 고객과 미사용 고객 객단가 비교해줘',
    '출력: {"metric":"averageOrderValue","groupBy":"couponUsed","operation":"compare","chartRequested":true}',
    '질문: 문의 많은 상품 중 매출 높은 상품 알려줘',
    '출력: {"metric":"inquiryCount","secondaryMetric":"revenue","groupBy":"product","operation":"rank","chartRequested":true}',
    '질문: 2025년 카테고리별 매출 비중',
    '출력: {"metric":"revenue","groupBy":"category","operation":"share","filters":{"years":[2025]},"chartRequested":true}',
    '질문: 왜 3월 매출이 떨어졌어?',
    '출력: {"notData":true}',
    '',
    `질문: ${message}`,
    '출력:'
  ].join('\n');
}

function extractJsonObject(raw: string): unknown {
  if (!raw) return null;
  const fenced = raw.replace(/```json?/gi, '').replace(/```/g, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

// 최상위에 계산결과 성격 키가 있으면 LLM이 숫자를 지어낸 것 → reject.
function hasForbiddenResultKey(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => FORBIDDEN_RESULT_KEYS.includes(k.toLowerCase()));
}

function parseFilters(rf: Record<string, unknown> | undefined): PlanFilters | undefined {
  if (!rf) return undefined;
  const numArr = (v: unknown): number[] | undefined => Array.isArray(v) ? (v.map((x) => (typeof x === 'number' ? x : parseInt(String(x), 10))).filter((x) => Number.isFinite(x))) : undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const f: PlanFilters = {
    years: numArr(rf.years), months: numArr(rf.months),
    start: str(rf.start), end: str(rf.end),
    couponUsed: typeof rf.couponUsed === 'boolean' ? rf.couponUsed : undefined,
    customerType: rf.customerType === 'first' || rf.customerType === 'repeat' ? rf.customerType : undefined,
    memberGroup: str(rf.memberGroup), channel: str(rf.channel), category: str(rf.category), goodsNo: str(rf.goodsNo)
  };
  return Object.values(f).some((v) => v != null && !(Array.isArray(v) && v.length === 0)) ? f : undefined;
}

// QueryPlan 검증: Data Catalog(허용 축·지표·연산)만 통과. 없는 데이터/숫자결과 → 폐기 또는 unsupported.
export function validateQueryPlan(obj: unknown, message: string): QueryPlan | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o.notData === true) return null;
  if (hasForbiddenResultKey(o)) return null;

  const metric = o.metric as Metric;
  if (!METRICS.includes(metric)) return null;
  const operation = (OPERATIONS.includes(o.operation as Operation) ? o.operation : 'summarize') as Operation;
  const groupBy = AXES.includes(o.groupBy as Axis) ? (o.groupBy as Axis) : undefined;
  const seriesBy = AXES.includes(o.seriesBy as Axis) ? (o.seriesBy as Axis) : undefined;
  const secondaryMetric = METRICS.includes(o.secondaryMetric as Metric) ? (o.secondaryMetric as Metric) : undefined;
  const filters = parseFilters(o.filters && typeof o.filters === 'object' ? o.filters as Record<string, unknown> : undefined);

  // unsupported: 메시지가 미연결 데이터를 요구하면 무조건 unsupported.
  let unsupportedReason = typeof o.unsupportedReason === 'string' && o.unsupportedReason.trim() ? o.unsupportedReason.trim() : undefined;
  const low = message.toLowerCase();
  if (!unsupportedReason && UNSUPPORTED_METRICS.some((w) => low.includes(w))) unsupportedReason = 'ROAS·방문자·광고비 등 외부 데이터가 필요한 지표는 현재 데이터로 산출할 수 없습니다.';
  if (!unsupportedReason) for (const u of UNSUPPORTED_CATALOG) { if (u.re.test(message)) { unsupportedReason = u.reason; break; } }
  // Data Catalog 정합성: 축이 지표 소스에서 추출 불가하면 unsupported(허구 금지).
  if (!unsupportedReason) {
    const allow = AXES_FOR_SOURCE[METRIC_SOURCE[metric]];
    for (const ax of [groupBy, seriesBy]) if (ax && !allow.has(ax)) { unsupportedReason = `'${metric}'은(는) '${ax}' 축으로 나눌 수 있는 데이터가 없습니다.`; break; }
  }

  const sort = (o.sort === 'asc' || o.sort === 'desc') ? o.sort : (operation === 'argmin' ? 'asc' : undefined);
  const topN = typeof o.topN === 'number' && Number.isFinite(o.topN) ? o.topN : undefined;
  return {
    metric, secondaryMetric, groupBy, seriesBy, operation,
    ...(filters ? { filters } : {}),
    sort, topN,
    chartRequested: o.chartRequested === true, chartSuppressed: o.chartSuppressed === true,
    unsupportedReason, originalQuestion: message
  };
}

// ── deterministic → QueryPlan 어댑터(키 미연결/LLM 실패 시) ──────────────────────
function periodToFilters(p: AnalyticsPeriod, nowMs: number): PlanFilters {
  const years = p.years && p.years.length ? [...p.years] : (p.year != null ? [p.year] : []);
  const rangeMonths = (s?: number, e?: number): number[] | undefined => { if (s == null || e == null) return undefined; const out: number[] = []; for (let m = Math.min(s, e); m <= Math.max(s, e); m++) out.push(m); return out; };
  let months: number[] | undefined; let start: string | undefined; let end: string | undefined; let yrs = years;
  switch (p.type) {
    case 'singleMonth': if (p.month != null) months = [p.month]; break;
    case 'monthRange': months = rangeMonths(p.startMonth, p.endMonth); break;
    case 'quarter': if (p.quarter != null) months = rangeMonths(p.quarter * 3 - 2, p.quarter * 3); break;
    case 'halfYear': if (p.half != null) months = p.half === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]; break;
    case 'dayRange': start = p.startDate; end = p.endDate; break;
    case 'relative': { const d = new Date(nowMs); const y = d.getFullYear(); const m = d.getMonth() + 1; if (p.relativeKey === 'thisMonth') { yrs = [y]; months = [m]; } else if (p.relativeKey === 'lastMonth') { const lm = m === 1 ? 12 : m - 1; yrs = [m === 1 ? y - 1 : y]; months = [lm]; } else if (p.relativeKey === 'thisYear') yrs = [y]; else if (p.relativeKey === 'lastYear') yrs = [y - 1]; break; }
    default: break;
  }
  return { years: yrs.length ? yrs : undefined, months, start, end };
}
const METRIC_MAP: Record<string, Metric | undefined> = { revenue: 'revenue', orderCount: 'orderCount', averageOrderValue: 'averageOrderValue', quantity: 'quantity', reviewCount: 'reviewCount', inquiryCount: 'inquiryCount', rating: 'averageRating' };
const DIM_MAP: Record<string, Axis | undefined> = { time: 'month', product: 'product', category: 'category', coupon: 'couponUsed', firstRepeat: 'customerType', memberGroup: 'memberGroup', channel: 'channel', review: 'reviewRating', inquiry: 'inquiryProduct', customer: 'memberGroup' };
const OP_MAP: Record<string, Operation> = { sum: 'summarize', average: 'summarize', summarize: 'summarize', trend: 'trend', argmax: 'argmax', argmin: 'argmin', extremes: 'extremes', share: 'share', compare: 'compare', rank: 'rank', ratio: 'rank' };

export function analyticsQueryToPlan(aq: AnalyticsQuery, nowMs: number): QueryPlan {
  const metric = METRIC_MAP[aq.metric];
  if (!metric) return { metric: 'revenue', operation: 'summarize', originalQuestion: aq.originalQuestion, unsupportedReason: `'${aq.metric}' 지표는 현재 데이터로 계산하지 않습니다.` };
  const filters = periodToFilters(aq.period, nowMs);
  let groupBy = aq.unsupportedReason ? undefined : DIM_MAP[aq.dimension];
  let seriesBy: Axis | undefined;
  let operation = OP_MAP[aq.aggregation] ?? 'summarize';
  const multiYear = (filters.years?.length ?? 0) >= 2;
  // 시간축 + 여러 해: 월별 추이/비교면 month × year grouped(나란히), 아니면 연도 총계 비교.
  if (aq.dimension === 'time' && multiYear) {
    if (aq.aggregation === 'trend' || aq.comparison === 'monthlyTrend') { groupBy = 'month'; seriesBy = 'year'; operation = 'trend'; }
    else if (aq.aggregation === 'compare' || aq.comparison === 'yearOverYear') { groupBy = 'year'; operation = 'compare'; }
  }
  return {
    metric, groupBy, seriesBy, operation,
    ...(Object.values(filters).some((v) => v != null && !(Array.isArray(v) && v.length === 0)) ? { filters } : {}),
    sort: aq.sort, topN: aq.topN,
    chartRequested: aq.chartRequested === true, chartSuppressed: aq.chartSuppressed === true,
    unsupportedReason: aq.unsupportedReason, originalQuestion: aq.originalQuestion
  };
}

/**
 * 이해 레이어(전 팀 공용): 자연어 → QueryPlan. 열린 질문/신호 없음 → null(호출부가 열린 경로).
 * LLM 우선(notData 판단 포함) → 실패 시 deterministic 파서 → QueryPlan 어댑터.
 */
export async function understandCommerceQuery(
  message: string,
  opts: { callLlm?: (prompt: string) => Promise<string>; nowMs?: number; team?: AnalyticsTeam }
): Promise<QueryPlan | null> {
  const nowMs = opts.nowMs ?? Date.now();
  const team = opts.team ?? 'product';
  if (opts.callLlm) {
    try {
      const raw = await opts.callLlm(buildQueryPlanPrompt(message));
      const obj = extractJsonObject(raw);
      if (obj && typeof obj === 'object' && (obj as Record<string, unknown>).notData === true) return null;
      const plan = validateQueryPlan(obj, message);
      if (plan) return plan;
    } catch { /* fall through to deterministic */ }
  }
  // deterministic fallback.
  const aq = parseAnalyticsQuery(message, { team, nowMs });
  if (aq.unsupportedReason) return analyticsQueryToPlan(aq, nowMs);
  if (!DATA_SIGNAL_RE.test(message) || OPEN_QUESTION_RE.test(message)) return null;
  if (aq.confidence === 'low') return null;
  return analyticsQueryToPlan(aq, nowMs);
}
