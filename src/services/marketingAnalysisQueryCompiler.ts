// ────────────────────────────────────────────────────────────────────────────
// Marketing Analysis Query Compiler v0
//
// 마케팅 채팅 질문을 "개별 케이스 regex 땜질"이 아니라 공통 AnalysisPlan으로 컴파일한다.
//   질문 → AnalysisPlan(intent/metric/period/comparison/aggregation/chart/...) → (executor가 실행)
//
// 원칙: 숫자는 코드가 계산(executor). 컴파일러는 "무엇을 계산할지"만 결정한다.
//   - 월 범위(3~5월)는 합산, 객단가는 기간합 매출 ÷ 기간합 주문수(weighted).
//   - 모르는 질문은 기본 year_compare로 떨어뜨리지 않고 unsupported로 명시.
// ────────────────────────────────────────────────────────────────────────────

export type MarketingAnalysisMetric = 'revenue' | 'orderCount' | 'averageOrderValue' | 'quantity';
export type MarketingSegmentDimension = 'coupon' | 'firstRepeat' | 'memberGroup' | 'channel';

export type MarketingPeriod =
  | { type: 'singleMonth'; year?: number; month: number }
  | { type: 'monthRange'; year?: number; startMonth: number; endMonth: number }
  | { type: 'year'; year?: number }
  | { type: 'quarter'; year?: number; quarter: 1 | 2 | 3 | 4 }
  | { type: 'halfYear'; year?: number; half: 1 | 2 }
  | { type: 'relative'; value: 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' };

export type MarketingComparison =
  | { type: 'yearOverYear'; years: number[]; period: MarketingPeriod }   // 같은 기간을 여러 해로 비교
  | { type: 'monthlyTrend'; years: number[]; startMonth?: number; endMonth?: number } // 월별 연도 비교(기본 1~12, 범위 지정 시 그 범위만)
  | { type: 'segmentCompare'; dimension: MarketingSegmentDimension; period?: MarketingPeriod };

export type MarketingChartPref = {
  requested: boolean;
  suppressed: boolean;
  type?: 'compactBars' | 'groupedBars' | 'line' | 'rankedBars' | 'table' | 'none';
};

export type MarketingAnalysisPlan = {
  intent: 'compare' | 'summarize' | 'rank' | 'trend' | 'explain' | 'unsupported';
  metric: MarketingAnalysisMetric;
  period?: MarketingPeriod;             // 단일 값 질문(비교 아님)
  comparison?: MarketingComparison;
  aggregation: 'sum' | 'average' | 'ratio' | 'rank' | 'trend';
  dimension?: 'time' | MarketingSegmentDimension;
  chart: MarketingChartPref;
  answerScope: 'narrow' | 'broad';
  confidence: 'high' | 'medium' | 'low';
  unsupportedReason?: string;
  originalQuestion: string;
};

export const METRIC_LABEL: Record<MarketingAnalysisMetric, string> = {
  revenue: '매출', orderCount: '주문수', averageOrderValue: '객단가', quantity: '판매수량'
};

// ── 파싱 helper ──────────────────────────────────────────────────────────────
const detectYears = (t: string): number[] =>
  [...new Set([...t.matchAll(/((?:20)\d{2})\s*년?/g)].map((m) => Number(m[1])).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);

function detectMetric(t: string): MarketingAnalysisMetric {
  if (/객단가|평균\s*(?:주문|구매)\s*(?:금액|단가)?|\baov\b/i.test(t)) return 'averageOrderValue';
  if (/판매\s*량|판매수량|수량/.test(t)) return 'quantity';
  if (/주문\s*수|주문\s*건수|주문건수|건수/.test(t)) return 'orderCount';
  return 'revenue'; // 매출/총매출/운영매출 및 기본
}

function detectChartPref(t: string): MarketingChartPref {
  const suppressed =
    /(?:그래프|차트)\s*(?:는|은)?\s*(?:보여주지\s*마|보여주지마|빼|빼줘|생략|제외|없이|안\s*보여|숨겨|만들지\s*마)/.test(t)
    || /텍스트로만|텍스트만|답변만|그래프\s*없이|차트\s*없이/.test(t);
  const wantsTable = /표로\s*(?:보여|만들|비교)|표만/.test(t);
  return { requested: !suppressed, suppressed, type: wantsTable ? 'table' : undefined };
}

const detectSegment = (t: string): MarketingSegmentDimension | null => {
  if (/쿠폰\s*(?:사용|미사용|쓴|안\s*쓴)/.test(t) || /쿠폰\s*사용\s*(?:여부|vs|대비)/.test(t)) return 'coupon';
  if (/첫\s*구매.*재구매|재구매.*첫\s*구매|신규.*재구매/.test(t)) return 'firstRepeat';
  if (/회원\s*그룹|등급별|회원등급/.test(t)) return 'memberGroup';
  if (/주문\s*채널|채널별/.test(t)) return 'channel';
  return null;
};

const UNSUPPORTED: { re: RegExp; reason: string }[] = [
  { re: /roas|광고\s*수익|광고비\s*대비|투자\s*대비\s*수익/i, reason: 'ROAS는 광고비·캠페인 attribution 데이터가 필요해 현재 고도몰 주문 데이터만으로는 산출할 수 없습니다.' },
  { re: /방문자?\s*(?:전환|수)|방문\s*전환|visitor/i, reason: '방문/방문→주문 전환은 방문자 세션 데이터가 필요합니다.' },
  { re: /상품\s*조회\s*전환|조회수\s*전환|product\s*view/i, reason: '상품조회→구매 전환은 상품 조회 이벤트 데이터가 필요합니다.' },
  { re: /장바구니\s*(?:이탈|포기)|cart\s*abandon/i, reason: '장바구니 이탈률은 장바구니 이벤트 데이터가 필요합니다.' }
];

// 연도 없이 "기간 표현"만 해석한다(연도는 별도 결합).
type PeriodDescriptor =
  | { type: 'monthRange'; startMonth: number; endMonth: number }
  | { type: 'singleMonth'; month: number }
  | { type: 'quarter'; quarter: 1 | 2 | 3 | 4 }
  | { type: 'halfYear'; half: 1 | 2 }
  | { type: 'monthlyTrend' }
  | { type: 'wholeYear' }
  | null;

function parsePeriodDescriptor(t: string): PeriodDescriptor {
  // 분기
  const q = t.match(/([1-4])\s*분기/);
  if (q) return { type: 'quarter', quarter: Number(q[1]) as 1 | 2 | 3 | 4 };
  // 상/하반기
  if (/상반기/.test(t)) return { type: 'halfYear', half: 1 };
  if (/하반기/.test(t)) return { type: 'halfYear', half: 2 };
  // 월별(12개월 추이) — "월별"이 명시되면 구간 합산보다 우선(월 단위 분해 의도).
  if (/월별|매월|달별/.test(t)) return { type: 'monthlyTrend' };
  // 월 범위: "3~5월", "3월~5월", "3월부터 5월까지", "3-5월"
  const range = t.match(/(\d{1,2})\s*월?\s*(?:부터|~|-|–|에서|에)\s*(\d{1,2})\s*월/);
  if (range) {
    const a = Number(range[1]); const b = Number(range[2]);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12) return { type: 'monthRange', startMonth: Math.min(a, b), endMonth: Math.max(a, b) };
  }
  // 단일 월: "2024-07" 또는 "7월"
  const ym = t.match(/(?:20)\d{2}\s*[-/]\s*(\d{1,2})\b/);
  const mon = t.match(/(\d{1,2})\s*월/);
  const mm = ym ? Number(ym[1]) : (mon ? Number(mon[1]) : NaN);
  if (Number.isFinite(mm) && mm >= 1 && mm <= 12) return { type: 'singleMonth', month: mm };
  return null;
}

function descriptorToPeriod(d: Exclude<PeriodDescriptor, null | { type: 'monthlyTrend' }>, year?: number): MarketingPeriod {
  switch (d.type) {
    case 'monthRange': return { type: 'monthRange', year, startMonth: d.startMonth, endMonth: d.endMonth };
    case 'singleMonth': return { type: 'singleMonth', year, month: d.month };
    case 'quarter': return { type: 'quarter', year, quarter: d.quarter };
    case 'halfYear': return { type: 'halfYear', year, half: d.half };
    case 'wholeYear': return { type: 'year', year };
  }
}

function detectRelative(t: string): MarketingPeriod | null {
  if (/이번\s*달|금월|당월/.test(t)) return { type: 'relative', value: 'thisMonth' };
  if (/지난\s*달|전월|저번\s*달/.test(t)) return { type: 'relative', value: 'lastMonth' };
  if (/올해|금년|올\s*해/.test(t)) return { type: 'relative', value: 'thisYear' };
  if (/작년|지난\s*해|전년/.test(t)) return { type: 'relative', value: 'lastYear' };
  return null;
}

// ── compile ──────────────────────────────────────────────────────────────────
export function compileMarketingAnalysisQuery(question: string, options?: { nowMs?: number }): MarketingAnalysisPlan {
  const t = question || '';
  const metric = detectMetric(t);
  const chart = detectChartPref(t);
  const aggregation: MarketingAnalysisPlan['aggregation'] = metric === 'averageOrderValue' ? 'ratio' : 'sum';
  const base: MarketingAnalysisPlan = {
    intent: 'summarize', metric, aggregation, chart, answerScope: 'narrow', confidence: 'low', originalQuestion: question
  };

  // 1) 지원 불가(외부 데이터)
  for (const u of UNSUPPORTED) {
    if (u.re.test(t)) return { ...base, intent: 'unsupported', confidence: 'high', unsupportedReason: u.reason, chart: { ...chart, type: 'none' } };
  }

  const explicitYears = detectYears(t);
  // 상대연도 비교("올해 ... 작년 ..." / "작년 ... 올해 ...")는 nowMs 기준으로 두 해를 만든다.
  const hasThisYear = /올해|금년|올\s*해/.test(t);
  const hasLastYear = /작년|지난\s*해|전년/.test(t);
  const nowYear = new Date(options?.nowMs ?? Date.now()).getFullYear();
  const years = (explicitYears.length >= 2)
    ? explicitYears
    : (explicitYears.length < 2 && hasThisYear && hasLastYear ? [nowYear - 1, nowYear] : explicitYears);
  const desc = parsePeriodDescriptor(t);
  const segment = detectSegment(t);

  // 2) 세그먼트 비교(쿠폰/첫구매·재구매/회원그룹/채널)
  if (segment && /비교|vs|대비|차이/.test(t)) {
    const period = desc && desc.type !== 'monthlyTrend' ? descriptorToPeriod(desc, years[0]) : undefined;
    return {
      ...base, intent: 'compare', dimension: segment, confidence: 'high', answerScope: 'narrow',
      comparison: { type: 'segmentCompare', dimension: segment, period },
      chart: { ...chart, type: chart.type ?? 'compactBars' }
    };
  }

  // 3) 연도 비교(year over year) — 동일 기간(월/월범위/분기/반기)을 여러 해로
  if (years.length >= 2 && desc && desc.type !== 'monthlyTrend' && desc.type !== 'wholeYear') {
    const period = descriptorToPeriod(desc, undefined);
    return {
      ...base, intent: 'compare', confidence: 'high', answerScope: 'narrow',
      comparison: { type: 'yearOverYear', years, period },
      aggregation: metric === 'averageOrderValue' ? 'ratio' : 'sum',
      chart: { ...chart, type: chart.type ?? 'compactBars' }
    };
  }

  // 4) 월별 추이 연도 비교(12개월) — "2024년과 2025년 월별 주문수/객단가 비교"
  //    revenue 월별/연도 비교는 기존 broad scope 분석에 위임(기존 동작 보존). 여기선 broad가 못 하는 metric만.
  if (years.length >= 2 && metric !== 'revenue' && (!desc || desc.type === 'monthlyTrend' || /월별|매월|추이|흐름/.test(t))) {
    return {
      ...base, intent: 'trend', confidence: 'high', answerScope: 'narrow', aggregation: 'trend', dimension: 'time',
      comparison: { type: 'monthlyTrend', years },
      chart: { ...chart, type: chart.type ?? 'groupedBars' }
    };
  }

  // 5) 단일 기간 값(비교 아님) — "2025년 7월 객단가", "2025년 1분기 주문수"
  if (years.length === 1 && desc && desc.type !== 'monthlyTrend') {
    return {
      ...base, intent: 'summarize', confidence: 'high', answerScope: 'narrow',
      period: descriptorToPeriod(desc, years[0]),
      chart: { ...chart, type: chart.type ?? (desc.type === 'singleMonth' ? 'compactBars' : 'compactBars') }
    };
  }

  // 6) 상대 기간(올해/작년/이번달/지난달)
  const rel = detectRelative(t);
  if (rel) {
    return { ...base, intent: 'summarize', confidence: 'medium', period: rel, chart: { ...chart, type: chart.type ?? 'compactBars' } };
  }

  // 7) 해석 실패 → broad 분석에 위임(엉뚱한 year_compare 강제 금지)
  return { ...base, intent: 'summarize', confidence: 'low', answerScope: 'broad' };
}

// ── period → 구체 연-월 구간(executor에서 사용) ─────────────────────────────────
export interface ResolvedRange { label: string; year: number; startMonth: number; endMonth: number }

export function resolvePeriodToRange(period: MarketingPeriod, ctxYear: number, nowMs: number): ResolvedRange {
  const yr = (period as { year?: number }).year ?? ctxYear;
  const ymLabel = (y: number, sm: number, em: number): string => (sm === em ? `${y}년 ${sm}월` : sm === 1 && em === 12 ? `${y}년` : `${y}년 ${sm}~${em}월`);
  switch (period.type) {
    case 'singleMonth': return { label: ymLabel(yr, period.month, period.month), year: yr, startMonth: period.month, endMonth: period.month };
    case 'monthRange': return { label: ymLabel(yr, period.startMonth, period.endMonth), year: yr, startMonth: period.startMonth, endMonth: period.endMonth };
    case 'quarter': { const s = period.quarter * 3 - 2; return { label: `${yr}년 ${period.quarter}분기`, year: yr, startMonth: s, endMonth: s + 2 }; }
    case 'halfYear': return period.half === 1 ? { label: `${yr}년 상반기`, year: yr, startMonth: 1, endMonth: 6 } : { label: `${yr}년 하반기`, year: yr, startMonth: 7, endMonth: 12 };
    case 'year': return { label: `${yr}년`, year: yr, startMonth: 1, endMonth: 12 };
    case 'relative': {
      const d = new Date(nowMs);
      const y = d.getFullYear(); const m = d.getMonth() + 1;
      if (period.value === 'thisMonth') return { label: `${y}년 ${m}월`, year: y, startMonth: m, endMonth: m };
      if (period.value === 'lastMonth') { const lm = m === 1 ? 12 : m - 1; const ly = m === 1 ? y - 1 : y; return { label: `${ly}년 ${lm}월`, year: ly, startMonth: lm, endMonth: lm }; }
      if (period.value === 'thisYear') return { label: `${y}년`, year: y, startMonth: 1, endMonth: 12 };
      return { label: `${y - 1}년`, year: y - 1, startMonth: 1, endMonth: 12 };
    }
  }
}
