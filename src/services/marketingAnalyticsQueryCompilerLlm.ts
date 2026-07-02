// ────────────────────────────────────────────────────────────────────────────
// Marketing Analytics Query Compiler (LLM) — 이해=LLM, 검증=코드
//
// 사용자 자연어 질문 → Claude가 AnalyticsQuery JSON으로 "구조화"만 한다(숫자 계산 금지).
//   코드 validator가 enum/스키마를 강제하고, 계산 결과 필드가 섞이면 reject한다.
//   LLM 실패(키 미연결/파싱 실패/검증 실패) 시 deterministic regex 파서로 fallback.
//
// 원칙: "오픈북" — LLM은 "몇 페이지를 볼지"(질의 스펙)만 정하고, 숫자 계산은 executor(코드)가 한다.
// ────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsQuery, AnalyticsTeam, AnalyticsMetric, AnalyticsDimension, AnalyticsAggregation, AnalyticsPeriod
} from './analyticsQueryTypes';
import { parseAnalyticsQuery } from './analyticsQueryParser';

const METRICS: AnalyticsMetric[] = ['revenue', 'orderCount', 'averageOrderValue', 'quantity', 'stock', 'reviewCount', 'inquiryCount', 'rating', 'claimCount'];
const DIMENSIONS: AnalyticsDimension[] = ['time', 'product', 'category', 'coupon', 'firstRepeat', 'memberGroup', 'channel', 'review', 'inquiry', 'customer'];
const AGGREGATIONS: AnalyticsAggregation[] = ['sum', 'average', 'ratio', 'rank', 'argmax', 'argmin', 'trend', 'share', 'compare', 'summarize'];
const PERIOD_TYPES = ['singleDay', 'dayRange', 'singleMonth', 'monthRange', 'quarter', 'halfYear', 'year', 'relative', 'all'];

// LLM이 절대 만들면 안 되는 "계산 결과" 성격 키(숫자를 지어내면 reject).
const FORBIDDEN_RESULT_KEYS = ['value', 'result', 'answer', 'total', 'sum', 'revenue', 'ordercount', 'orders', 'aov', 'averageordervalue', 'amount', 'count', 'computed', 'numericanswer', 'revenuevalue', 'totalrevenue'];

// 미연결(외부) 데이터 — 계산 금지, unsupported로.
const UNSUPPORTED_CATALOG = [
  { re: /roas|광고\s*수익|광고비|투자\s*대비\s*수익/i, reason: 'ROAS·광고 성과는 광고비/attribution 데이터가 필요해 현재 주문 데이터로는 산출할 수 없습니다.' },
  { re: /방문자|세션|visitor|전환\s*율|전환율|conversion/i, reason: '방문자/전환율은 방문자·세션 데이터가 필요합니다.' },
  { re: /노출|impression|클릭수|ctr/i, reason: '노출/클릭은 광고·유입 데이터가 필요합니다.' },
  { re: /장바구니|cart\s*abandon/i, reason: '장바구니 지표는 장바구니 이벤트 데이터가 필요합니다.' }
];

export function buildMarketingQueryCompilerPrompt(message: string): string {
  return [
    '너는 쇼핑몰 마케팅 분석 질문을 "분석 질의 스펙(JSON)"으로 변환하는 컴파일러다.',
    '숫자를 계산하지 마라. 오직 아래 스키마의 JSON 하나만 출력한다(설명/코드펜스 금지).',
    '',
    '[사용 가능한 데이터]',
    '매출, 주문수, 객단가(AOV), 판매수량, 상품, 카테고리, 쿠폰 사용여부, 신규/재구매, 회원그룹, 채널, 문의/리뷰.',
    '[불가능한 데이터] 방문자, 광고비, 노출수, 클릭수, 전환율, 장바구니, ROAS → 이런 걸 요구하면 unsupportedReason에 이유를 적어라.',
    '',
    '[스키마]',
    `metric: ${METRICS.join(' | ')}`,
    `dimension: ${DIMENSIONS.join(' | ')}`,
    `aggregation: ${AGGREGATIONS.join(' | ')}`,
    `period.type: ${PERIOD_TYPES.join(' | ')} (+ year, years[], month, startMonth, endMonth, quarter, half, startDate, endDate, relativeKey, recentCount)`,
    'topN?(정수), sort?("asc"|"desc"), chartRequested?(bool), chartSuppressed?(bool), unsupportedReason?(string)',
    '',
    '[규칙]',
    '- "가장 높은/최고/제일 높은/피크 + 달/월" → dimension:time, aggregation:argmax',
    '- "가장 낮은/최저 + 달/월" → dimension:time, aggregation:argmin',
    '- "월별/추이/흐름" → dimension:time, aggregation:trend',
    '- "상품 순위/베스트/가장 많이 팔린 상품" → dimension:product, aggregation:rank',
    '- "카테고리 비중" → dimension:category, aggregation:share',
    '- 객단가/AOV → metric:averageOrderValue',
    '- 기간을 정확히 보존(예: "1~5월" → monthRange startMonth 1 endMonth 5, "2025년" → year 2025). 넓히지 마라.',
    '- value/result/total 같은 "계산 결과" 필드는 절대 넣지 마라(숫자 금지).',
    '',
    '[예시]',
    '질문: 2025년 중 객단가 제일 쎈 달이 언제야?',
    '출력: {"metric":"averageOrderValue","dimension":"time","aggregation":"argmax","period":{"type":"year","year":2025}}',
    '질문: 2025년 월별 매출 추이 그래프로 보여줘',
    '출력: {"metric":"revenue","dimension":"time","aggregation":"trend","period":{"type":"year","year":2025},"chartRequested":true}',
    '질문: 2024년과 2025년 1월부터 5월까지 월별 객단가 비교해줘',
    '출력: {"metric":"averageOrderValue","dimension":"time","aggregation":"trend","period":{"type":"monthRange","years":[2024,2025],"startMonth":1,"endMonth":5}}',
    '질문: ROAS 비교해줘',
    '출력: {"metric":"revenue","dimension":"time","aggregation":"summarize","period":{"type":"all"},"unsupportedReason":"ROAS는 광고비 데이터가 필요합니다."}',
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

// 재귀적으로 계산 결과 성격 키가 있는지 검사(있으면 LLM이 숫자를 지어낸 것 → reject).
function hasForbiddenResultKey(obj: unknown, depth = 0): boolean {
  if (!obj || typeof obj !== 'object' || depth > 4) return false;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nk = k.toLowerCase();
    // period 내부 숫자 필드(year/month/startMonth 등)는 허용. 최상위 계산결과 키만 금지.
    if (depth === 0 && FORBIDDEN_RESULT_KEYS.includes(nk)) return true;
    if (hasForbiddenResultKey(v, depth + 1)) return true;
  }
  return false;
}

export function validateAnalyticsQueryJson(obj: unknown, message: string, team: AnalyticsTeam): AnalyticsQuery | null {
  if (!obj || typeof obj !== 'object') return null;
  if (hasForbiddenResultKey(obj)) return null; // LLM이 숫자 결과를 넣으면 폐기
  const o = obj as Record<string, unknown>;

  const metric = o.metric as AnalyticsMetric;
  const dimension = o.dimension as AnalyticsDimension;
  const aggregation = o.aggregation as AnalyticsAggregation;
  if (!METRICS.includes(metric) || !DIMENSIONS.includes(dimension) || !AGGREGATIONS.includes(aggregation)) return null;

  const rawPeriod = (o.period && typeof o.period === 'object') ? o.period as Record<string, unknown> : { type: 'all' };
  const ptype = String(rawPeriod.type ?? 'all');
  if (!PERIOD_TYPES.includes(ptype)) return null;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const period: AnalyticsPeriod = {
    type: ptype as AnalyticsPeriod['type'],
    year: num(rawPeriod.year),
    years: Array.isArray(rawPeriod.years) ? (rawPeriod.years as unknown[]).map((x) => num(x)).filter((x): x is number => x != null) : undefined,
    month: num(rawPeriod.month), startMonth: num(rawPeriod.startMonth), endMonth: num(rawPeriod.endMonth),
    quarter: num(rawPeriod.quarter) as AnalyticsPeriod['quarter'], half: num(rawPeriod.half) as AnalyticsPeriod['half'],
    startDate: typeof rawPeriod.startDate === 'string' ? rawPeriod.startDate : undefined,
    endDate: typeof rawPeriod.endDate === 'string' ? rawPeriod.endDate : undefined,
    relativeKey: typeof rawPeriod.relativeKey === 'string' ? rawPeriod.relativeKey as AnalyticsPeriod['relativeKey'] : undefined,
    recentCount: num(rawPeriod.recentCount)
  };

  // unsupported 이중 가드: 메시지가 미연결 데이터를 요구하면 무조건 unsupported.
  let unsupportedReason = typeof o.unsupportedReason === 'string' && o.unsupportedReason.trim() ? o.unsupportedReason.trim() : undefined;
  for (const u of UNSUPPORTED_CATALOG) { if (u.re.test(message)) { unsupportedReason = unsupportedReason ?? u.reason; break; } }

  const sort = (o.sort === 'asc' || o.sort === 'desc') ? o.sort : (aggregation === 'argmin' ? 'asc' : aggregation === 'argmax' ? 'desc' : undefined);
  return {
    originalQuestion: message, team, metric, dimension, aggregation,
    comparison: (period.years && period.years.length >= 2) ? (aggregation === 'trend' ? 'monthlyTrend' : 'yearOverYear') : 'none',
    period,
    topN: num(o.topN) ?? (aggregation === 'argmax' || aggregation === 'argmin' ? 1 : undefined),
    sort,
    chartRequested: o.chartRequested === true,
    chartSuppressed: o.chartSuppressed === true,
    tableRequested: false,
    confidence: 'high',
    unsupportedReason
  };
}

/**
 * 이해 레이어: LLM 우선(질문→AnalyticsQuery), 실패 시 deterministic regex 파서로 fallback.
 * 숫자는 절대 LLM이 만들지 않는다(스키마 검증). callLlm 미제공/실패 시에도 안전하게 동작.
 */
export async function understandMarketingQuery(
  message: string,
  opts: { callLlm?: (prompt: string) => Promise<string>; nowMs?: number }
): Promise<AnalyticsQuery> {
  if (opts.callLlm) {
    try {
      const raw = await opts.callLlm(buildMarketingQueryCompilerPrompt(message));
      const q = validateAnalyticsQueryJson(extractJsonObject(raw), message, 'marketing');
      if (q) return q;
    } catch { /* fall through to deterministic */ }
  }
  return parseAnalyticsQuery(message, { team: 'marketing', nowMs: opts.nowMs });
}
