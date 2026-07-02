// ────────────────────────────────────────────────────────────────────────────
// Analytics Query Parser v0 — 자연어 질문 → AnalyticsQuery (Department Analytics Query Layer v0)
//
// v0 구현 범위: product 중심(기간·상품순위·카테고리비중·추이·합계). marketing/cs 확장은 타입만 열어둠.
// 핵심 규칙(작업지시서 §4):
//   - "월별"과 "1~5월"이 같이 나오면 둘 다 보존한다(monthlyTrend + monthRange).  ← 마케팅 버그 1 원인 차단
//   - "특정 월 + 상품순위"는 총매출이 아니라 상품순위로 처리(dimension=product, aggregation=rank).  ← 버그 2/3
//   - 좁은 질문을 broad로 확장하지 않는다.
//   - ROAS/방문자/전환/장바구니처럼 실제 미연결 데이터가 필요한 경우에만 unsupported.
//   - 숫자 계산은 executor가 한다(파서는 "무엇을 계산할지"만).
// ────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsQuery,
  AnalyticsTeam,
  AnalyticsMetric,
  AnalyticsDimension,
  AnalyticsAggregation,
  AnalyticsComparison,
  AnalyticsPeriod
} from './analyticsQueryTypes';

const UNSUPPORTED: { re: RegExp; reason: string }[] = [
  { re: /roas|광고\s*수익|광고비\s*대비|투자\s*대비\s*수익/i, reason: 'ROAS는 광고비·캠페인 attribution 데이터가 필요해 현재 주문 데이터만으로는 산출할 수 없습니다.' },
  { re: /방문자?\s*(?:전환|수)|방문\s*전환|visitor/i, reason: '방문/방문→주문 전환은 방문자 세션 데이터가 필요합니다.' },
  { re: /상품\s*조회\s*전환|조회수\s*전환|product\s*view/i, reason: '상품조회→구매 전환은 상품 조회 이벤트 데이터가 필요합니다.' },
  { re: /장바구니\s*(?:이탈|포기)|cart\s*abandon/i, reason: '장바구니 이탈률은 장바구니 이벤트 데이터가 필요합니다.' },
  { re: /전환\s*율|전환\s*률|conversion\s*rate/i, reason: '전환율은 방문자·세션 데이터가 필요해 현재 주문 데이터만으로는 산출할 수 없습니다.' }
];

const detectYears = (t: string): number[] =>
  [...new Set([...t.matchAll(/((?:20)\d{2})\s*년?/g)].map((m) => Number(m[1])).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);

function detectMetric(t: string): AnalyticsMetric {
  if (/객단가|평균\s*(?:주문|구매)\s*(?:금액|단가)?|\baov\b/i.test(t)) return 'averageOrderValue';
  if (/재고|품절/.test(t)) return 'stock';
  if (/평점|별점|rating/i.test(t)) return 'rating';
  if (/리뷰/.test(t)) return 'reviewCount';
  if (/문의/.test(t)) return 'inquiryCount';
  if (/판매\s*량|판매수량|수량|개수/.test(t)) return 'quantity';
  if (/주문\s*수|주문\s*건수|주문건수|건수/.test(t)) return 'orderCount';
  return 'revenue';
}

// 차원: product/category 우선(상품팀 v0 실행). 나머지는 reserved(타입만 세팅, executor가 not handled 처리).
function detectDimension(t: string): AnalyticsDimension {
  if (/카테고리|분류/.test(t)) return 'category';
  if (/상품|제품|품목|goods|베스트|가장\s*많이\s*(?:팔|판매)/i.test(t)) return 'product';
  if (/쿠폰/.test(t)) return 'coupon';
  if (/첫\s*구매|재구매|신규\s*회원/.test(t)) return 'firstRepeat';
  if (/회원\s*그룹|등급별|회원등급/.test(t)) return 'memberGroup';
  if (/주문\s*채널|채널별/.test(t)) return 'channel';
  if (/평점|별점|리뷰/.test(t)) return 'review';
  if (/문의|클레임/.test(t)) return 'inquiry';
  if (/고객/.test(t)) return 'customer';
  return 'time';
}

const RANK_RE = /순위|랭킹|상위|베스트|가장\s*많이|top\b|best/i;
const SHARE_RE = /비중|구성|점유|share|퍼센트|percent/i;
const TREND_RE = /월별|매월|달별|추이|흐름|트렌드/i;
const COMPARE_RE = /비교|vs|대비|차이/i;
const TOP1_RE = /가장\s*많이|가장\s*(?:높|많)|최고|1\s*위|톱\s*1|top\s*1/i;
// argmax/argmin(최고·최저 버킷) + 시간축 신호. deterministic fallback용(LLM 이해가 1차).
// "가장/제일" 뒤에 지표어가 끼어도("가장 객단가가 높았던") 잡도록 사이 문자를 허용.
const ARGMAX_RE = /(?:가장|제일).{0,14}(?:높|많|크|쎈|센|비싸|잘\s*팔)|최고|최대|피크|peak|highest/i;
const ARGMIN_RE = /(?:가장|제일).{0,14}(?:낮|적|작)|최저|최소|lowest/i;

function detectTopN(t: string): number | undefined {
  if (TOP1_RE.test(t)) return 1;
  const m = t.match(/(?:상위|top|톱)\s*(\d{1,2})/i) || t.match(/(\d{1,2})\s*(?:위|개)\s*(?:상품|까지)?/);
  if (m) { const n = Number(m[1]); if (n >= 1 && n <= 50) return n; }
  return undefined;
}

// ── 기간 파싱 ──────────────────────────────────────────────────────────────
const pad2 = (n: number): string => String(n).padStart(2, '0');

function parsePeriod(t: string, years: number[]): AnalyticsPeriod {
  // 1) 일 범위: "2024년 7월 1일~7월 31일" / "7월 1일부터 7월 31일까지"
  const dr = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:부터|~|-|–|에서)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
  if (dr && years.length >= 1) {
    const y = years[0];
    const sm = Number(dr[1]); const sd = Number(dr[2]);
    const em = dr[3] ? Number(dr[3]) : sm; const ed = Number(dr[4]);
    return { type: 'dayRange', year: y, startDate: `${y}-${pad2(sm)}-${pad2(sd)}`, endDate: `${y}-${pad2(em)}-${pad2(ed)}` };
  }

  // 월 범위(월별 여부와 무관하게 항상 파싱 — 버그 1 차단): "3~5월", "3월~5월", "1월부터 5월까지"
  let monthRange: { s: number; e: number } | null = null;
  const mr = t.match(/(\d{1,2})\s*월?\s*(?:부터|~|-|–|에서)\s*(\d{1,2})\s*월/);
  if (mr) { const a = Number(mr[1]); const b = Number(mr[2]); if (a >= 1 && a <= 12 && b >= 1 && b <= 12) monthRange = { s: Math.min(a, b), e: Math.max(a, b) }; }

  const q = t.match(/([1-4])\s*분기/);
  const half = /상반기/.test(t) ? 1 : /하반기/.test(t) ? 2 : null;
  const ym = t.match(/(?:20)\d{2}\s*[-/]\s*(\d{1,2})\b/);
  const singleMonthMatch = ym ? Number(ym[1]) : (() => { const m = t.match(/(\d{1,2})\s*월/); return m ? Number(m[1]) : NaN; })();

  // 다연도: years 보존 + 하위 기간(월범위/단일월/분기/반기) 보존 → comparison에서 사용.
  if (years.length >= 2) {
    if (monthRange) return { type: 'monthRange', years, startMonth: monthRange.s, endMonth: monthRange.e };
    if (q) { const qq = Number(q[1]) as 1 | 2 | 3 | 4; return { type: 'quarter', years, quarter: qq }; }
    if (half) return { type: 'halfYear', years, half: half as 1 | 2 };
    if (Number.isFinite(singleMonthMatch) && singleMonthMatch >= 1 && singleMonthMatch <= 12) return { type: 'singleMonth', years, month: singleMonthMatch };
    return { type: 'year', years };
  }

  // 상대 기간
  const rec = t.match(/최근\s*(\d{1,2})\s*개\s*월/);
  if (rec) return { type: 'relative', relativeKey: 'recentMonths', recentCount: Math.max(1, Number(rec[1])) };
  if (/이번\s*달|금월|당월/.test(t)) return { type: 'relative', relativeKey: 'thisMonth' };
  if (/지난\s*달|전월|저번\s*달/.test(t)) return { type: 'relative', relativeKey: 'lastMonth' };
  if (/올해|금년|올\s*해/.test(t)) return { type: 'relative', relativeKey: 'thisYear' };
  if (/작년|지난\s*해|전년/.test(t)) return { type: 'relative', relativeKey: 'lastYear' };

  const y1 = years.length === 1 ? years[0] : undefined;
  if (monthRange) return { type: 'monthRange', year: y1, startMonth: monthRange.s, endMonth: monthRange.e };
  if (q) return { type: 'quarter', year: y1, quarter: Number(q[1]) as 1 | 2 | 3 | 4 };
  if (half) return { type: 'halfYear', year: y1, half: half as 1 | 2 };
  if (Number.isFinite(singleMonthMatch) && singleMonthMatch >= 1 && singleMonthMatch <= 12) return { type: 'singleMonth', year: y1, month: singleMonthMatch };
  if (y1 !== undefined) return { type: 'year', year: y1 };
  return { type: 'all' };
}

function detectComparison(t: string, years: number[], aggregation: AnalyticsAggregation): AnalyticsComparison {
  if (years.length >= 2) {
    // "월별"이 함께 있으면 monthlyTrend, 아니면 동일기간 yearOverYear. (월범위는 period에 이미 보존됨)
    return TREND_RE.test(t) ? 'monthlyTrend' : 'yearOverYear';
  }
  if (aggregation === 'compare') return 'periodOverPeriod';
  return 'none';
}

export function parseAnalyticsQuery(question: string, context?: { team?: AnalyticsTeam; nowMs?: number }): AnalyticsQuery {
  const raw = question || '';
  const t = raw.toLowerCase();
  const team: AnalyticsTeam = context?.team ?? 'product';

  const chartSuppressed =
    /(?:그래프|차트)\s*(?:는|은)?\s*(?:보여주지\s*마|보여주지마|빼|빼줘|생략|제외|없이|안\s*보여|숨겨|만들지\s*마)/.test(t)
    || /텍스트로만|텍스트만|답변만|그래프\s*없이|차트\s*없이/.test(t);
  const chartRequested = !chartSuppressed && /그래프|차트|시각화|graph|chart/i.test(t);
  const tableRequested = /표로\s*(?:보여|만들|비교)|표만/.test(t);

  const base = (partial: Partial<AnalyticsQuery>): AnalyticsQuery => ({
    originalQuestion: raw, team,
    metric: 'revenue', dimension: 'time', aggregation: 'summarize', comparison: 'none',
    period: { type: 'all' }, chartRequested, chartSuppressed, tableRequested, confidence: 'low',
    ...partial
  });

  // 1) 지원 불가(외부 데이터)
  for (const u of UNSUPPORTED) {
    if (u.re.test(t)) return base({ aggregation: 'summarize', confidence: 'high', unsupportedReason: u.reason });
  }

  const years = detectYears(t);
  const metric = detectMetric(t);
  let dimension = detectDimension(t);

  // 최고/최저 의도. "높은 …과 낮은 …"이 함께면 extremes(2개 비교).
  const rawMax = ARGMAX_RE.test(t) || RANK_RE.test(t);
  const rawMin = ARGMIN_RE.test(t);
  const wantExtremes = rawMax && rawMin;                         // 최고 AND 최저
  const wantMin = !wantExtremes && rawMin;
  const wantMax = !wantExtremes && !wantMin && rawMax;

  let aggregation: AnalyticsAggregation;
  if (dimension === 'category' && SHARE_RE.test(t)) {
    aggregation = 'share';
  } else if (wantExtremes) {
    aggregation = 'extremes';                                    // "가장 높은 달과 낮은 달 비교"
  } else if (dimension === 'time' && (wantMax || wantMin)) {
    aggregation = wantMin ? 'argmin' : 'argmax';                 // "어느 달이 최고/최저 <지표>"
  } else if ((dimension === 'product' || dimension === 'category') && (wantMax || wantMin || RANK_RE.test(t))) {
    aggregation = 'rank';                                        // 상품/카테고리 순위
  } else if (TREND_RE.test(t)) {
    aggregation = 'trend'; dimension = 'time';                   // 월별/추이
  } else if (COMPARE_RE.test(t) || years.length >= 2) {
    aggregation = 'compare';
  } else {
    aggregation = 'summarize';
  }
  // extremes/argmax/argmin에서 상품/카테고리 신호가 없으면 시간축으로 본다("가장 매출 높은 달과 낮은 달").
  if ((aggregation === 'extremes' || aggregation === 'argmax' || aggregation === 'argmin') && dimension !== 'product' && dimension !== 'category') dimension = 'time';
  // rank(순위)일 때만 상품 차원 보정 — 시간 argmax/argmin/extremes는 상품으로 강제하지 않음.
  if (aggregation === 'rank' && dimension !== 'category' && dimension !== 'time') dimension = 'product';

  const period = parsePeriod(t, years);
  const comparison = detectComparison(t, years, aggregation);
  const topN = aggregation === 'rank'
    ? (detectTopN(t) ?? undefined)
    : (aggregation === 'argmax' || aggregation === 'argmin' ? 1 : undefined);
  const sort: 'asc' | 'desc' | undefined =
    aggregation === 'rank' ? (wantMin || /낮은|적게|최저|하위|worst|bottom/i.test(t) ? 'asc' : 'desc')
    : aggregation === 'argmin' ? 'asc'
    : aggregation === 'argmax' ? 'desc'
    : undefined;

  // confidence: product/category/time + 해석된 기간이면 high.
  const resolvedPeriod = period.type !== 'all' || years.length > 0;
  const known = dimension === 'product' || dimension === 'category' || dimension === 'time';
  const opKnown = aggregation === 'rank' || aggregation === 'share' || aggregation === 'trend' || aggregation === 'argmax' || aggregation === 'argmin' || aggregation === 'extremes';
  const confidence: AnalyticsQuery['confidence'] =
    known && (resolvedPeriod || opKnown) ? 'high'
    : known ? 'medium' : 'low';

  return base({ metric, dimension, aggregation, comparison, period, topN, sort, confidence });
}
