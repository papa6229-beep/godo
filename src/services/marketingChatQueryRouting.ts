// ────────────────────────────────────────────────────────────────────────────
// Marketing Chat Query Routing v0 — 마케팅 채팅 질문을 정확한 분석 파라미터로 해석한다.
//
// 배경: 0순위 Scope Insight Engine이 "2024+2025"만 보면 metric/month를 무시하고
//   전체 2024~2025 월별 매출 비교로 고정해, 객단가/주문수/특정월 질문이 모두 같은 답으로 떨어졌다.
//
// 이 파일은 질문에서 metric / years / single-month / chart-suppression을 파싱하고,
// "특정 월 연도 비교"(예: 2024년 7월 vs 2025년 7월 객단가)는 canonical 운영 지표(net 유효 주문)로
// 직접 계산해 compact 결과를 만든다. 숫자는 코드가 계산하고, LLM은 해석/요약만 한다(여기선 숫자 생성 없음).
// ────────────────────────────────────────────────────────────────────────────

import { isValidOrder } from './revenueMetricContract';
import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartNarrative } from './marketingChatChartSpec';

export type MarketingChatMetric = 'revenue' | 'orderCount' | 'averageOrderValue';

export interface MarketingChatQueryParse {
  metric: MarketingChatMetric;
  metricLabel: string;
  years: number[];
  month: number | null;       // 1~12, 단일 월만(범위는 null)
  suppressChart: boolean;
  narrowOnly: boolean;        // "~만 비교/알려" → 좁은 답변
  isMonthYearCompare: boolean; // 2개 연도 + 동일 단일 월
}

const METRIC_LABEL: Record<MarketingChatMetric, string> = {
  revenue: '매출', orderCount: '주문수', averageOrderValue: '객단가'
};

const detectYears = (t: string): number[] =>
  [...new Set([...t.matchAll(/((?:20)\d{2})\s*년?/g)].map((m) => Number(m[1])).filter((y) => y >= 2000 && y <= 2100))];

/** 질문에서 metric / years / single-month / suppress / narrow 를 파싱(deterministic). */
export function parseMarketingChatQuery(message: string): MarketingChatQueryParse {
  const t = message || '';

  // metric 우선순위: 객단가 > 주문수 > 매출(기본)
  let metric: MarketingChatMetric = 'revenue';
  if (/객단가|평균\s*(?:주문|구매)\s*(?:금액|단가)?|\baov\b/i.test(t)) metric = 'averageOrderValue';
  else if (/주문\s*수|주문\s*건수|주문건수|건수/.test(t)) metric = 'orderCount';
  else if (/매출|매상/.test(t)) metric = 'revenue';

  const years = detectYears(t);

  // 단일 월(범위 "X월부터 Y월"은 제외). "2024-07" / "2024년 7월" / "7월" 모두 수용.
  const hasRange = /(\d{1,2})\s*월\s*(?:부터|~|-|에서)\s*(\d{1,2})\s*월/.test(t);
  let month: number | null = null;
  if (!hasRange) {
    const ymMatch = t.match(/(?:20)\d{2}\s*[-/]\s*(\d{1,2})\b/);  // 2024-07
    const monMatch = t.match(/(\d{1,2})\s*월/);                    // 7월
    const mm = ymMatch ? Number(ymMatch[1]) : (monMatch ? Number(monMatch[1]) : NaN);
    if (Number.isFinite(mm) && mm >= 1 && mm <= 12) month = mm;
  }

  const suppressChart =
    /(?:그래프|차트)\s*(?:는|은)?\s*(?:보여주지\s*마|보여주지마|빼|빼줘|생략|제외|없이|안\s*보여|숨겨|만들지\s*마)/.test(t)
    || /텍스트로만|텍스트만|답변만|표로만|표만|그래프\s*없이|차트\s*없이/.test(t);

  const narrowOnly = /만\s*(?:비교|알려|보여|봐|줘|구해|뽑아)/.test(t);

  const uniqueYears = [...new Set(years)].sort((a, b) => a - b);
  const isMonthYearCompare = uniqueYears.length >= 2 && month !== null;

  return { metric, metricLabel: METRIC_LABEL[metric], years: uniqueYears, month, suppressChart, narrowOnly, isMonthYearCompare };
}

// ── canonical 운영 지표(net 유효 주문) — 특정 연-월 범위 ──────────────────────────
interface OrderLike { orderDate?: unknown; totalAmount?: unknown; paid?: unknown; canceled?: unknown; state?: { paid?: unknown; canceled?: unknown } }
const numAmt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function operationalForMonth(orders: OrderLike[], year: number, month: number): { year: number; revenue: number; orderCount: number; aov: number } {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  let revenue = 0, count = 0;
  for (const o of orders) {
    const d = String(o.orderDate ?? '');
    if (!d.startsWith(prefix)) continue;
    if (!isValidOrder(o)) continue;
    revenue += numAmt(o.totalAmount);
    count += 1;
  }
  return { year, revenue, orderCount: count, aov: count > 0 ? Math.round(revenue / count) : 0 };
}

/**
 * 특정 월 질문(단일 월 + 1~2개 연도)을 canonical 운영 지표로 직접 계산해 compact 응답 생성.
 * 월 지정이 없으면 null 반환 → 호출부가 기존 broad 분석으로 넘긴다.
 */
export function buildMarketingMonthMetricResponse(input: { message: string; orders: unknown[]; nowMs?: number }): {
  handled: true;
  artifact: MarketingChatChartArtifact;
  reply: string;
  suppressChart: boolean;
  parse: MarketingChatQueryParse;
} | null {
  const parse = parseMarketingChatQuery(input.message);
  if (parse.month === null || parse.years.length < 1) return null; // 특정 월 아님 → broad로

  const orders = (input.orders || []) as OrderLike[];
  const month = parse.month;
  const years = parse.years.slice(0, 4);
  const metric = parse.metric;
  const label = parse.metricLabel;
  const rows = years.map((y) => operationalForMonth(orders, y, month));

  const valueOf = (r: { revenue: number; orderCount: number; aov: number }): number =>
    (metric === 'revenue' ? r.revenue : metric === 'orderCount' ? r.orderCount : r.aov);
  const fmt = (v: number): string => (metric === 'orderCount' ? `${v.toLocaleString()}건` : `${v.toLocaleString()}원`);

  const points = rows.map((r) => ({
    bucketKey: `${r.year}-${String(month).padStart(2, '0')}`,
    bucketLabel: `${r.year}년 ${month}월`,
    value: valueOf(r), orderCount: r.orderCount, revenue: r.revenue, averageOrderValue: r.aov
  }));

  const title = years.length >= 2
    ? `${years.map((y) => `${y}년 ${month}월`).join(' vs ')} ${label} 비교`
    : `${years[0]}년 ${month}월 ${label}`;
  const unit: MarketingChartSpec['unit'] = metric === 'orderCount' ? 'count' : 'krw';

  const chartSpec: MarketingChartSpec = {
    id: `mkt_month_year_compare_${metric}`,
    title, subtitle: `${month}월 · ${label}`,
    chartType: 'groupedBar', primaryMetric: metric,
    series: [{ key: metric, label, metric, points }],
    xAxisLabel: '기간', yAxisLabel: label, unit, source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: points.some((p) => p.value > 0), evidence: [], warnings: []
  };

  // 좁은 답변(요청 범위 밖의 broad 관찰은 붙이지 않음)
  const lines: string[] = [title, ''];
  for (const r of rows) {
    const extra = metric !== 'orderCount' ? ` (주문 ${r.orderCount.toLocaleString()}건)` : '';
    lines.push(`- ${r.year}년 ${month}월 ${label}: ${fmt(valueOf(r))}${extra}`);
  }
  if (rows.length >= 2) {
    const a = valueOf(rows[0]); const b = valueOf(rows[rows.length - 1]);
    const diff = b - a;
    const pct = a > 0 ? Math.round((diff / a) * 1000) / 10 : 0;
    lines.push('', `- 차이: ${fmt(Math.abs(diff))} (${diff >= 0 ? '+' : '-'}${Math.abs(pct)}%)`);
    lines.push(`- 해석: ${rows[rows.length - 1].year}년 ${month}월 ${label}가 ${rows[0].year}년 ${month}월보다 ${diff > 0 ? '높' : diff < 0 ? '낮' : '같'}게 나타납니다.`);
    if (metric !== 'orderCount') lines.push(`- 객단가/매출 해석은 주문수 변화(${rows.map((r) => `${r.year}년 ${r.orderCount.toLocaleString()}건`).join(' → ')})와 함께 봐야 합니다.`);
  }
  lines.push('', '- 방문자·광고비 등 외부 데이터가 없어 원인은 단정하지 않습니다(관찰값).');
  const reply = lines.join('\n');

  const narrative: MarketingChartNarrative = {
    title, summary: title,
    bullets: lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
    evidence: [], warnings: ['위 수치는 관찰값이며 인과관계를 단정하지 않습니다.']
  };

  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: 'month_year_compare',
    plan: { metric, years, month, kind: 'month_year_compare' },
    request: chartSpec.request, chartSpec, narrative, evidence: [],
    createdAt: new Date(input.nowMs ?? 0).toISOString()
  };

  return { handled: true, artifact, reply, suppressChart: parse.suppressChart, parse };
}
