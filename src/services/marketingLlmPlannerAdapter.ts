// Marketing LLM Planner Adapter v0 — LLM은 "분석 계획(plan)"만 생성, 숫자는 절대 만들지 않는다.
//
// 흐름: capability map + 허용 schema를 LLM에 제공 → LLM이 strict JSON plan 초안 작성 →
//   validator가 정화/거부(허용 enum만, 숫자 결과/ PII/인과 단정 reject) → deterministic executor가 계산.
//   JSON parse/validation 실패 시 deterministic planner fallback.
//
// 원칙:
//   - LLM은 revenue/orderCount/AOV/전환율 등 숫자 결과를 생성하지 않는다(프롬프트 명시 + validator reject).
//   - narrative/evidence는 항상 deterministic builder가 생성(LLM raw narrative 미사용).
//   - callPlannerLlm은 외부 주입(이 파일에서 직접 API/네트워크 호출 없음). PII/인과 단정 금지.

import {
  buildMarketingDataCapabilityMap,
  validateMarketingIntelligencePlan,
  recommendMarketingChartForPlan,
  buildMarketingResponseFromPlan,
  buildMarketingIntelligenceResponse,
  type MarketingDataCapabilityMap,
  type MarketingIntelligencePlan,
  type MarketingIntelligenceResult,
  type MarketingPlanGoal,
  type MarketingPlannedSegment,
  type MarketingPlannedFilter,
  type MarketingPlannedPeriod,
  type MarketingPlannedDimension
} from './marketingIntelligencePlanner';
import type { MarketingChatChartArtifact } from './marketingChatChartSpec';

const ALLOWED_GOALS: MarketingPlanGoal[] = ['compare', 'trend', 'rank', 'share', 'relationship', 'conversion', 'diagnose', 'summary'];
const ALLOWED_COMPARISONS = ['period_over_period', 'year_over_year', 'segment_vs_segment', 'coupon_vs_non_coupon', 'baseline_vs_promotion', 'before_after', 'none'];
const ALLOWED_CHART_TYPES = ['line', 'groupedBar', 'stackedBar', 'rankedBar', 'donut', 'table', 'unsupported'];
const ALLOWED_TIME_BUCKETS = ['day', 'week', 'month', 'quarter', 'year', 'scenario'];

// LLM이 숫자 결과를 담으려 할 때 reject할 키 / 패턴
const FORBIDDEN_RESULT_KEYS = ['revenueValue', 'orderCountValue', 'averageOrderValueValue', 'computedResult', 'totalRevenue', 'estimatedRevenue', 'conversionRateValue', 'numericAnswer', 'result', 'value', 'computed'];
const FORBIDDEN_PII_KEYS = ['name', 'customerName', 'phone', 'mobile', 'email', 'address', 'receiverName', 'receiverPhone', 'receiverAddress', 'memberKey'];
const CAUSAL_WORDS = ['때문에', '덕분에', '원인입니다'];

// ── 동의어 normalization ──────────────────────────────────────────────────────
const METRIC_SYNONYM: Record<string, string> = {
  sales: 'revenue', amount: 'revenue', 매출: 'revenue', orders: 'orderCount', ordercount: 'orderCount', 주문수: 'orderCount',
  aov: 'averageOrderValue', averageordervalue: 'averageOrderValue', 객단가: 'averageOrderValue',
  couponrate: 'couponUsageRateWithinOrders', couponusagerate: 'couponUsageRateWithinOrders', rewardrate: 'rewardUsageRateWithinOrders',
  reviewrating: 'averageRating', rating: 'averageRating', inquiries: 'inquiryCount', claims: 'claimCount', share: 'revenueShare'
};
const DIM_SYNONYM: Record<string, string> = {
  coupon: 'couponUsage', couponusage: 'couponUsage', membergroup: 'memberGroup', group: 'memberGroup',
  channel: 'orderChannel', orderchannel: 'orderChannel', firstrepeat: 'firstRepeat', reward: 'rewardUsage', rewardusage: 'rewardUsage',
  product: 'product', category: 'category', brand: 'brand', scenario: 'scenario', time: 'time'
};
const CHART_SYNONYM: Record<string, string> = { linechart: 'line', line: 'line', bar: 'groupedBar', barchart: 'groupedBar', groupedbar: 'groupedBar', rankedbar: 'rankedBar', stackedbar: 'stackedBar', donut: 'donut', pie: 'donut', table: 'table' };
const SEGMENT_SYNONYM: Record<string, { kind: MarketingPlannedSegment['kind']; key: string; label: string }> = {
  newmember: { kind: 'memberGroup', key: '신규회원', label: '신규회원' }, 신규회원: { kind: 'memberGroup', key: '신규회원', label: '신규회원' },
  vip: { kind: 'memberGroup', key: 'VIP', label: 'VIP' }, repeatpurchase: { kind: 'memberGroup', key: '재구매회원', label: '재구매회원' }, 재구매회원: { kind: 'memberGroup', key: '재구매회원', label: '재구매회원' },
  generalmember: { kind: 'memberGroup', key: '일반회원', label: '일반회원' }, existingcustomer: { kind: 'memberGroup', key: '재구매회원', label: '재구매회원' }
};
const FILTER_SYNONYM: Record<string, { kind: MarketingPlannedFilter['kind']; key: string; label: string }> = {
  couponusage: { kind: 'couponUsage', key: 'used', label: '쿠폰 사용' }, coupon: { kind: 'couponUsage', key: 'used', label: '쿠폰 사용' }, couponused: { kind: 'couponUsage', key: 'used', label: '쿠폰 사용' }, couponunused: { kind: 'couponUsage', key: 'unused', label: '쿠폰 미사용' },
  promotion: { kind: 'scenario', key: 'promotion', label: '프로모션년도' }, baseline: { kind: 'scenario', key: 'baseline', label: '기준년도' }, 쿠폰기간: { kind: 'scenario', key: 'promotion', label: '프로모션년도' }
};

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const isIsoDate = (s: unknown): boolean => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`));

// ── 프롬프트 ──────────────────────────────────────────────────────────────────
export function buildMarketingLlmPlannerPrompt(input: { message: string; capabilityMap: MarketingDataCapabilityMap; nowIso: string }): string {
  const cap = input.capabilityMap;
  const allowedMetrics = cap.availableMetrics.map((x) => x.key);
  const allowedDimensions = cap.availableDimensions.map((x) => x.key);
  const unavailableMetrics = cap.unavailableMetrics.map((x) => `${x.key}(필요:${x.requiredData.join('/')})`);
  return [
    '당신은 GODO AI OS 마케팅 분석 플래너입니다. 당신의 역할은 "분석 계획(JSON)"을 만드는 것뿐입니다.',
    '== 절대 규칙 ==',
    '- You are NOT allowed to calculate revenue, order count, AOV, conversion rate, or any numeric result.',
    '- 매출/주문수/객단가/전환율/비중 등 모든 숫자는 결정적 코드가 계산합니다. 당신은 숫자를 만들지 마세요.',
    '- 출력은 오직 하나의 JSON object만. 설명/마크다운/코드펜스 금지.',
    '- revenueValue/totalRevenue/computedResult/numericAnswer 같은 "숫자 결과" 필드를 만들지 마세요.',
    '- 고객 개인정보(name/phone/email/address/memberKey)를 출력하지 마세요.',
    '- 인과관계를 단정하지 마세요("때문에/덕분에/원인입니다" 금지). warnings에는 관찰 표현만.',
    '',
    '== 허용 enum (capability map 기반, 이 값들만 사용) ==',
    `allowedGoals: ${ALLOWED_GOALS.join(', ')}`,
    `allowedMetrics: ${allowedMetrics.join(', ')}`,
    `allowedDimensions: ${allowedDimensions.join(', ')}`,
    `allowedSegments: 신규회원, VIP, 재구매회원, 일반회원 (memberGroup)`,
    `allowedFilters: couponUsage(used/unused), scenario(baseline/promotion)`,
    `allowedComparisons: ${ALLOWED_COMPARISONS.join(', ')}`,
    `allowedChartTypes: ${ALLOWED_CHART_TYPES.join(', ')}`,
    `allowedTimeBuckets: ${ALLOWED_TIME_BUCKETS.join(', ')}`,
    `unavailableMetrics(계산 불가 — requestedMetrics에 넣되 결과는 requiredData로 안내됨): ${unavailableMetrics.join(', ')}`,
    '',
    '== 출력 JSON 형식 ==',
    '{ "goal": "...", "requestedMetrics": [...], "periods": [{"label":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}], "timeBucket": "month", "dimensions": [...], "segments": [...], "filters": [...], "comparison": "...", "chartRecommendation": {"chartType":"...","reason":"..."}, "requiredData": [], "warnings": ["관찰값이며 인과관계를 단정하지 않습니다."] }',
    '',
    `현재 시각: ${input.nowIso}`,
    `사용자 질문: ${input.message}`,
    'JSON만 출력하세요.'
  ].join('\n');
}

// ── JSON parse (코드펜스/잡텍스트 허용, 첫 {...} 추출) ─────────────────────────
export function parseMarketingLlmPlannerJson(raw: string): unknown {
  const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ── draft 검증 + normalize → MarketingIntelligencePlan ────────────────────────
export function validateMarketingLlmPlanDraft(input: { draft: unknown; capabilityMap: MarketingDataCapabilityMap; originalQuestion: string; nowMs?: number }): {
  ok: boolean;
  plan?: MarketingIntelligencePlan;
  errors: string[];
  normalizedFields: string[];
} {
  const errors: string[] = [];
  const normalizedFields: string[] = [];
  const d = input.draft;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, errors: ['draft is not a JSON object'], normalizedFields };
  const draft = d as Record<string, unknown>;

  // 숫자 결과 필드 reject
  for (const k of Object.keys(draft)) {
    const lk = k.toLowerCase();
    if (FORBIDDEN_RESULT_KEYS.includes(k) || /value$|computed|numericanswer|estimatedrevenue|totalrevenue/.test(lk)) {
      errors.push(`forbidden numeric result field: ${k}`);
    }
  }
  // PII / 인과 단정 reject (draft 전체 스캔)
  const scanPiiCausal = (v: unknown): void => {
    if (typeof v === 'string') { for (const c of CAUSAL_WORDS) if (v.includes(c)) errors.push(`causal assertion: ${c}`); return; }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN_PII_KEYS.includes(k)) errors.push(`PII key: ${k}`);
        if (typeof val === 'string' && /syn_member_/.test(val)) errors.push('PII value: syn_member_');
        scanPiiCausal(val);
      }
    }
  };
  scanPiiCausal(draft);

  // goal
  let goal = norm(draft.goal) as MarketingPlanGoal;
  if (!ALLOWED_GOALS.includes(goal)) { errors.push(`invalid goal: ${draft.goal}`); goal = 'summary'; }

  // metrics (synonym normalize → 허용/unavailable만 통과, 알 수 없으면 reject)
  const availSet = new Set(input.capabilityMap.availableMetrics.map((x) => x.key));
  const unavailSet = new Set(input.capabilityMap.unavailableMetrics.map((x) => x.key));
  const reqMetricsRaw = Array.isArray(draft.requestedMetrics) ? draft.requestedMetrics : [];
  const requestedMetrics: string[] = [];
  for (const mm of reqMetricsRaw) {
    let key = String(mm ?? '');
    if (!availSet.has(key) && !unavailSet.has(key)) { const syn = METRIC_SYNONYM[norm(mm)]; if (syn) { key = syn; normalizedFields.push(`metric:${mm}→${syn}`); } }
    if (availSet.has(key) || unavailSet.has(key)) requestedMetrics.push(key);
    else errors.push(`invalid metric: ${mm}`);
  }
  if (requestedMetrics.length === 0 && errors.length === 0) requestedMetrics.push('revenue');

  // dimensions
  const dimSet = new Set([...input.capabilityMap.availableDimensions.map((x) => x.key)]);
  const dimensions: MarketingPlannedDimension[] = [];
  for (const dd of Array.isArray(draft.dimensions) ? draft.dimensions : []) {
    let key = String(dd ?? '');
    if (!dimSet.has(key)) { const syn = DIM_SYNONYM[norm(dd)]; if (syn) { key = syn; normalizedFields.push(`dim:${dd}→${syn}`); } }
    if (dimSet.has(key)) dimensions.push(key as MarketingPlannedDimension);
    else errors.push(`invalid dimension: ${dd}`);
  }

  // segments
  const segments: MarketingPlannedSegment[] = [];
  for (const ss of Array.isArray(draft.segments) ? draft.segments : []) {
    const key = typeof ss === 'object' && ss ? norm((ss as Record<string, unknown>).key) : norm(ss);
    const syn = SEGMENT_SYNONYM[key];
    if (syn) segments.push(syn);
    else errors.push(`invalid segment: ${JSON.stringify(ss)}`);
  }

  // filters
  const filters: MarketingPlannedFilter[] = [];
  for (const ff of Array.isArray(draft.filters) ? draft.filters : []) {
    const key = typeof ff === 'object' && ff ? norm((ff as Record<string, unknown>).key || (ff as Record<string, unknown>).kind) : norm(ff);
    const syn = FILTER_SYNONYM[key];
    if (syn) filters.push(syn);
    else errors.push(`invalid filter: ${JSON.stringify(ff)}`);
  }

  // comparison
  let comparison = norm(draft.comparison) as MarketingIntelligencePlan['comparison'];
  if (draft.comparison !== undefined && !ALLOWED_COMPARISONS.includes(comparison as string)) { errors.push(`invalid comparison: ${draft.comparison}`); comparison = 'none'; }

  // timeBucket
  let timeBucket = norm(draft.timeBucket) as MarketingIntelligencePlan['timeBucket'];
  if (draft.timeBucket !== undefined && !ALLOWED_TIME_BUCKETS.includes(timeBucket as string)) { errors.push(`invalid timeBucket: ${draft.timeBucket}`); timeBucket = undefined; }
  else if (draft.timeBucket === undefined) timeBucket = undefined;

  // chartType
  let chartType = norm(draft.chartRecommendation && (draft.chartRecommendation as Record<string, unknown>).chartType);
  if (chartType && !ALLOWED_CHART_TYPES.includes(chartType)) { const syn = CHART_SYNONYM[chartType]; if (syn) { normalizedFields.push(`chart:${chartType}→${syn}`); chartType = syn; } else { errors.push(`invalid chartType: ${chartType}`); chartType = ''; } }

  // periods (ISO date 검증 — 유효한 것만)
  const periods: MarketingPlannedPeriod[] = [];
  for (const pp of Array.isArray(draft.periods) ? draft.periods : []) {
    if (!pp || typeof pp !== 'object') continue;
    const p = pp as Record<string, unknown>;
    const label = String(p.label ?? '');
    if (p.startDate && !isIsoDate(p.startDate)) { errors.push(`invalid period startDate: ${p.startDate}`); continue; }
    if (p.endDate && !isIsoDate(p.endDate)) { errors.push(`invalid period endDate: ${p.endDate}`); continue; }
    periods.push({ label: label || `${p.startDate ?? ''}~${p.endDate ?? ''}`, ...(p.startDate ? { startDate: String(p.startDate) } : {}), ...(p.endDate ? { endDate: String(p.endDate) } : {}) });
  }

  if (errors.length > 0) return { ok: false, errors, normalizedFields };

  // MarketingIntelligencePlan 조립 + capability validate(executableMetrics/dataRequirements/proxyPlan)
  const relationshipTargets = goal === 'relationship' || goal === 'diagnose'
    ? [{ xMetric: requestedMetrics.find((x) => /reviewCount|inquiryCount|averageRating/.test(x)) ?? requestedMetrics[0], yMetric: 'revenue', bucket: 'month' as const }]
    : undefined;
  const basePlan: MarketingIntelligencePlan = {
    id: 'mkt_plan_llm',
    originalQuestion: input.originalQuestion,
    goal,
    requestedMetrics,
    executableMetrics: [],
    periods,
    timeBucket,
    dimensions,
    segments,
    filters,
    comparison: comparison ?? 'none',
    relationshipTargets,
    chartRecommendation: { chartType: 'table', reason: '' },
    dataRequirements: [],
    confidence: 'high',
    warnings: Array.isArray(draft.warnings) ? draft.warnings.map((w) => String(w)) : []
  };
  basePlan.chartRecommendation = chartType
    ? { chartType: chartType as MarketingIntelligencePlan['chartRecommendation']['chartType'], reason: String((draft.chartRecommendation as Record<string, unknown> | undefined)?.reason ?? '') }
    : recommendMarketingChartForPlan(basePlan);

  const plan = validateMarketingIntelligencePlan({ plan: basePlan, capabilityMap: input.capabilityMap });
  return { ok: true, plan, errors: [], normalizedFields };
}

// ── LLM plan 생성 (prompt → callPlannerLlm → parse → validate). 실패 시 ok:false. ──
export async function buildMarketingLlmPlan(input: { message: string; capabilityMap: MarketingDataCapabilityMap; callPlannerLlm: (prompt: string) => Promise<string>; nowMs?: number }): Promise<{
  ok: boolean;
  plan: MarketingIntelligencePlan | null;
  raw?: string;
  errors: string[];
  source: 'llm_planner';
}> {
  const nowMs = input.nowMs ?? Date.now();
  const prompt = buildMarketingLlmPlannerPrompt({ message: input.message, capabilityMap: input.capabilityMap, nowIso: new Date(nowMs).toISOString() });
  let raw: string;
  try {
    raw = await input.callPlannerLlm(prompt);
  } catch (e) {
    return { ok: false, plan: null, errors: [`llm call failed: ${e instanceof Error ? e.message : String(e)}`], source: 'llm_planner' };
  }
  let draft: unknown;
  try {
    draft = parseMarketingLlmPlannerJson(raw);
  } catch (e) {
    return { ok: false, plan: null, raw, errors: [`json parse failed: ${e instanceof Error ? e.message : String(e)}`], source: 'llm_planner' };
  }
  const v = validateMarketingLlmPlanDraft({ draft, capabilityMap: input.capabilityMap, originalQuestion: input.message, nowMs });
  if (!v.ok || !v.plan) return { ok: false, plan: null, raw, errors: v.errors, source: 'llm_planner' };
  return { ok: true, plan: v.plan, raw, errors: [], source: 'llm_planner' };
}

// deterministic plan이 빈약(구조화 실패)한지 — LLM planner를 시도할지 판단용.
export function isWeakDeterministicPlan(plan: MarketingIntelligencePlan | null): boolean {
  if (!plan) return true;
  // requiredData(외부 데이터 필요)를 이미 정확히 식별했으면 deterministic 결과가 옳다 → LLM으로 덮지 않음.
  if (plan.dataRequirements && plan.dataRequirements.length > 0) return false;
  const noStructure = plan.dimensions.filter((d) => d !== 'time').length === 0 && plan.periods.length === 0 && plan.segments.length === 0 && plan.filters.length === 0 && (!plan.comparison || plan.comparison === 'none');
  return plan.goal === 'summary' && noStructure;
}

// ── runtime 통합 진입점: deterministic 우선, 빈약하면 LLM planner 시도(실패 시 fallback) ──
// narrative/evidence는 항상 deterministic builder가 생성한다.
export async function buildMarketingIntelligenceResponseWithLlm(input: { message: string; orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; nowMs?: number; callPlannerLlm?: (prompt: string) => Promise<string> }): Promise<{
  handled: boolean;
  plan: MarketingIntelligencePlan | null;
  result: MarketingIntelligenceResult | null;
  artifact: MarketingChatChartArtifact | null;
  reply: string | null;
  plannerSource: 'deterministic' | 'llm_planner';
}> {
  const nowMs = input.nowMs ?? Date.now();
  const deterministic = buildMarketingIntelligenceResponse({ message: input.message, orders: input.orders, products: input.products, reviews: input.reviews, inquiries: input.inquiries, nowMs });
  // deterministic이 구조를 잘 잡았거나, LLM 미주입이면 그대로 사용
  if (!deterministic.handled || !input.callPlannerLlm || !isWeakDeterministicPlan(deterministic.plan)) {
    return { ...deterministic, plannerSource: 'deterministic' };
  }
  // 빈약한 deterministic + LLM 주입 → LLM planner 시도
  try {
    const capabilityMap = buildMarketingDataCapabilityMap();
    const llm = await buildMarketingLlmPlan({ message: input.message, capabilityMap, callPlannerLlm: input.callPlannerLlm, nowMs });
    if (llm.ok && llm.plan) {
      const resp = buildMarketingResponseFromPlan({ plan: llm.plan, orders: input.orders, products: input.products, reviews: input.reviews, inquiries: input.inquiries, nowMs, source: 'marketingLlmPlannerAdapter' });
      return { ...resp, plannerSource: 'llm_planner' };
    }
  } catch {
    // LLM 실패 → deterministic fallback
  }
  return { ...deterministic, plannerSource: 'deterministic' };
}
