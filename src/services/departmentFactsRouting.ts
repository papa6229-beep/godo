// Department Facts Routing v0 — 팀별 역할 라우팅
//
// 역할 구조(패치 기준):
//   - 상품팀(product): 매출/상품 통계 "공급자". 분석/기획 안 함 → 마케팅팀에 handoff.
//   - CS팀(cs): 고객 이슈(문의/리뷰/클레임) 통계 "공급자". 분석/기획 안 함 → 마케팅팀에 handoff.
//   - 마케팅팀(marketing): 상품팀+CS팀 자료 + 직접 고객/채널 facts로 "분석·기획·제안"(recommendationCandidates).
//   - 총괄(manager): 각 팀 보고 + 마케팅 제안 → executiveSummary + approvalQueueCandidates(승인/우선순위).
//
// 원칙: 숫자는 Analytics Query Engine이 계산(AI 생성 금지). 분석 제안은 마케팅팀만.
//   PII(이름/전화/주소/계좌)는 CS팀 fakeContacts에만(분석 packet엔 없음).

import {
  runAnalyticsQuery, getAnalyticsMetric,
  type AnalyticsDataset, type AnalyticsMetric, type AnalyticsGroupBy, type AnalyticsRow, type AnalyticsQueryResult, type MetricSupportLevel
} from './analyticsQueryEngine';

export type DeptTeam = 'product' | 'cs' | 'marketing' | 'manager';

export type AnalyticsPacket = {
  id: string;
  title: string;
  team: DeptTeam;
  metric: AnalyticsMetric;
  groupBy?: AnalyticsGroupBy;
  rows: AnalyticsRow[];
  summary: AnalyticsQueryResult['summary'];
  supportLevel: MetricSupportLevel;
  chartHint?: AnalyticsQueryResult['chartHint'];
  warnings?: string[];
};

export type MarketingRecommendationCandidate = {
  id: string;
  title: string;
  rationale: string;
  basedOn: string[]; // packet id 참조
  suggestedAction: string;
  priorityHint?: 'high' | 'medium' | 'low';
  requiredData?: string[]; // 외부 데이터 필요 시
};

export type ApprovalCandidate = {
  id: string;
  title: string;
  type: 'marketing_recommendation';
  fromTeam: 'marketing';
  requiresApproval: true;
  summary: string;
};

export type FakeContactForCsOnly = {
  customerId: string;
  memberKey: string;
  customerName: string;
  phone: string;
  address: string;
  origin: { isSynthetic: boolean; isFakePii: boolean; piiType: 'fake' };
};

export type DepartmentFactsBundle = {
  productTeam?: { role: 'sales_statistics_provider'; salesStatisticsPacket: AnalyticsPacket[]; handoffToMarketing: AnalyticsPacket[] };
  csTeam?: { role: 'customer_issue_provider'; customerIssuePacket: AnalyticsPacket[]; handoffToMarketing: AnalyticsPacket[]; fakeContacts?: FakeContactForCsOnly[] };
  marketingTeam?: {
    role: 'analysis_and_planning';
    receivedFromProductTeam: AnalyticsPacket[];
    receivedFromCsTeam: AnalyticsPacket[];
    directMarketingFacts: AnalyticsPacket[];
    recommendationCandidates: MarketingRecommendationCandidate[];
  };
  manager?: {
    role: 'approval_and_priority';
    executiveSummary: AnalyticsPacket[];
    teamReports: { productTeam?: AnalyticsPacket[]; csTeam?: AnalyticsPacket[]; marketingTeam?: MarketingRecommendationCandidate[] };
    approvalQueueCandidates: ApprovalCandidate[];
  };
  meta: { sourceType: 'synthetic' | 'real' | 'mixed'; syntheticSource?: 'commerce_universe_v1' | 'godoRaw' | 'legacy'; generatedAt: string };
};

// ── 팀별 metric pack (역할 경계) ─────────────────────────────────────────────
type PackSpec = { metric: AnalyticsMetric; groupBy?: AnalyticsGroupBy };

// 상품팀: 매출/상품/카테고리/브랜드 통계만 (review/inquiry/campaign/customerSegment 제외)
export const PRODUCT_TEAM_PACK: PackSpec[] = [
  { metric: 'revenue', groupBy: 'month' },
  { metric: 'orderCount', groupBy: 'month' },
  { metric: 'unitCount', groupBy: 'month' },
  { metric: 'averageOrderValue', groupBy: 'month' },
  { metric: 'salesGrowthRate', groupBy: 'month' },
  { metric: 'productRevenue', groupBy: 'product' },
  { metric: 'productUnitCount', groupBy: 'product' },
  { metric: 'categoryRevenue', groupBy: 'category' },
  { metric: 'brandRevenue', groupBy: 'brand' },
  { metric: 'revenueShare', groupBy: 'category' }
];
// 상품팀이 마케팅에 넘기는 핵심 요약
const PRODUCT_HANDOFF: PackSpec[] = [
  { metric: 'revenue', groupBy: 'month' },
  { metric: 'averageOrderValue', groupBy: 'month' },
  { metric: 'categoryRevenue', groupBy: 'category' },
  { metric: 'productRevenue', groupBy: 'product' }
];

// CS팀: 문의/리뷰/클레임 이슈 통계만 (campaign/marketing 제외)
export const CS_TEAM_PACK: PackSpec[] = [
  { metric: 'inquiryCount' },
  { metric: 'inquiryTopicBreakdown', groupBy: 'inquiryTopic' },
  { metric: 'unansweredInquiryCount' },
  { metric: 'urgentInquiryCount' },
  { metric: 'reviewAverageRating' },
  { metric: 'reviewSentimentShare', groupBy: 'reviewSentiment' },
  { metric: 'reviewTopicBreakdown', groupBy: 'reviewTopic' },
  { metric: 'claimRate' },
  { metric: 'refundRate' },
  { metric: 'csIssueTopProducts', groupBy: 'product' },
  { metric: 'refundRiskProducts', groupBy: 'product' },
  { metric: 'reviewRiskProducts', groupBy: 'product' }
];
const CS_HANDOFF: PackSpec[] = [
  { metric: 'csIssueTopProducts', groupBy: 'product' },
  { metric: 'refundRiskProducts', groupBy: 'product' },
  { metric: 'reviewRiskProducts', groupBy: 'product' },
  { metric: 'claimRate' }
];

// 마케팅팀 직접 조회 facts (고객/채널/세그먼트)
export const MARKETING_DIRECT_PACK: PackSpec[] = [
  { metric: 'customerCount' },
  { metric: 'returningCustomerCount' },
  { metric: 'repurchaseRate' },
  { metric: 'purchaseFrequency' },
  { metric: 'customerSegmentRevenue', groupBy: 'customerSegment' },
  { metric: 'paymentMethodRevenue', groupBy: 'paymentMethod' },
  { metric: 'orderChannelRevenue', groupBy: 'orderChannel' },
  { metric: 'periodComparison' }
];

const MANAGER_SUMMARY_PACK: PackSpec[] = [
  { metric: 'revenue', groupBy: 'month' },
  { metric: 'repurchaseRate' },
  { metric: 'claimRate' },
  { metric: 'inquiryTopicBreakdown', groupBy: 'inquiryTopic' }
];

// ── packet 빌더 ──────────────────────────────────────────────────────────────
const titleOf = (metric: AnalyticsMetric, groupBy?: AnalyticsGroupBy): string => {
  const base = getAnalyticsMetric(metric)?.labelKo || metric;
  const gb = groupBy ? { month: '월별', week: '주별', day: '일별', category: '카테고리별', brand: '브랜드별', product: '상품별', paymentMethod: '결제수단별', orderChannel: '주문채널별', customerSegment: '세그먼트별', reviewTopic: '리뷰주제별', reviewSentiment: '리뷰감정별', inquiryTopic: '문의주제별' }[groupBy as string] : '';
  return gb ? `${gb} ${base}` : base;
};
const toPacket = (team: DeptTeam, ds: AnalyticsDataset, spec: PackSpec, opts?: { compareTo?: { startDate: string; endDate: string }; startDate?: string; endDate?: string }): AnalyticsPacket => {
  const res = runAnalyticsQuery(ds, { metric: spec.metric, groupBy: spec.groupBy, startDate: opts?.startDate, endDate: opts?.endDate, compareTo: opts?.compareTo });
  return { id: `${team}:${spec.metric}${spec.groupBy ? ':' + spec.groupBy : ''}`, title: titleOf(spec.metric, spec.groupBy), team, metric: spec.metric, groupBy: spec.groupBy, rows: res.rows, summary: res.summary, supportLevel: res.supportLevel, chartHint: res.chartHint, warnings: res.warnings };
};
const runPack = (team: DeptTeam, ds: AnalyticsDataset, specs: PackSpec[], opts?: { startDate?: string; endDate?: string; compareTo?: { startDate: string; endDate: string } }): AnalyticsPacket[] =>
  specs.map((s) => toPacket(team, ds, s, opts));

// ── 마케팅 제안 후보 생성 (rule-based, 결정적 — AI 아님) ─────────────────────
const buildMarketingRecommendations = (ds: AnalyticsDataset, productHandoff: AnalyticsPacket[], csHandoff: AnalyticsPacket[]): MarketingRecommendationCandidate[] => {
  const out: MarketingRecommendationCandidate[] = [];
  const refundRisk = csHandoff.find((p) => p.metric === 'refundRiskProducts');
  if (refundRisk && refundRisk.rows.length) {
    const top = refundRisk.rows[0];
    out.push({ id: 'rec:refund_ad_cut', title: `환불 위험 상품 광고 축소 검토: ${top.label}`, rationale: `환불/반품 클레임이 ${top.value}건으로 가장 많음(CS팀 자료).`, basedOn: [refundRisk.id], suggestedAction: '해당 상품 광고/노출 축소 + 품질/배송 점검 요청', priorityHint: 'high' });
  }
  const reviewRisk = csHandoff.find((p) => p.metric === 'reviewRiskProducts');
  const prodRev = productHandoff.find((p) => p.metric === 'productRevenue');
  if (reviewRisk && reviewRisk.rows.length && prodRev) {
    // 리뷰는 좋은데 매출 낮은 상품 후보: 평점 높은 상품(reviewRisk 역순) ∩ 매출 하위
    const bestRated = [...reviewRisk.rows].sort((a, b) => b.value - a.value).slice(0, 3).map((r) => r.key);
    const revByGoods = new Map(prodRev.rows.map((r) => [r.key, r.value]));
    const sortedRev = [...prodRev.rows].sort((a, b) => a.value - b.value);
    const lowRevSet = new Set(sortedRev.slice(0, Math.max(1, Math.ceil(sortedRev.length / 2))).map((r) => r.key));
    const cand = bestRated.find((g) => lowRevSet.has(g));
    if (cand) out.push({ id: 'rec:good_review_low_sales', title: `리뷰 좋은데 매출 낮은 상품 캠페인 후보: ${cand}`, rationale: `리뷰 평점 상위지만 매출 하위(${(revByGoods.get(cand) || 0).toLocaleString()}원) — 노출 부족 가능.`, basedOn: [reviewRisk.id, prodRev.id], suggestedAction: '해당 상품 메인 노출/타겟 캠페인 후보로 검토', priorityHint: 'medium' });
  }
  const repurchase = runAnalyticsQuery(ds, { metric: 'repurchaseRate' });
  if (repurchase.ok && repurchase.rows.length) {
    out.push({ id: 'rec:repurchase_campaign', title: `재구매 유망 상품군 캠페인`, rationale: `재구매율 ${(repurchase.rows[0].value * 100).toFixed(1)}% — 재구매 유망 상품 대상 리텐션 캠페인 여지.`, basedOn: ['marketing:repurchaseRate'], suggestedAction: '재구매 유망 상품군(repurchaseCandidateProducts) 대상 리텐션 메시지 기획', priorityHint: 'medium' });
  }
  // 외부 데이터 필요 안내(ROAS/캠페인)
  out.push({ id: 'rec:requires_external', title: 'ROAS/캠페인 효율 분석은 추가 데이터 필요', rationale: '광고비/캠페인 캘린더 데이터가 없어 ROAS·캠페인 비교는 계산 불가.', basedOn: [], suggestedAction: 'adSpend·campaignCalendar·trafficEvents 연결 후 재분석', requiredData: ['adSpend', 'campaignCalendar', 'trafficEvents'], priorityHint: 'low' });
  return out;
};

// ── 메인: 부서 facts 번들 생성 ───────────────────────────────────────────────
export function buildDepartmentFactsBundle(
  dataset: AnalyticsDataset,
  opts: { teams?: DeptTeam[]; startDate?: string; endDate?: string; compareTo?: { startDate: string; endDate: string }; fakeContacts?: FakeContactForCsOnly[]; generatedAt?: string } = {}
): DepartmentFactsBundle {
  const teams = opts.teams || ['product', 'cs', 'marketing', 'manager'];
  const want = (t: DeptTeam) => teams.includes(t);
  const meta = { sourceType: (dataset.source?.dataKind || 'synthetic') as 'synthetic' | 'real' | 'mixed', syntheticSource: dataset.source?.syntheticSource, generatedAt: opts.generatedAt || '' };

  // 상품팀/CS팀은 마케팅·총괄 입력으로도 쓰이므로 항상 계산
  const productStats = runPack('product', dataset, PRODUCT_TEAM_PACK, opts);
  const productHandoff = runPack('product', dataset, PRODUCT_HANDOFF, opts);
  const csStats = runPack('cs', dataset, CS_TEAM_PACK, opts);
  const csHandoff = runPack('cs', dataset, CS_HANDOFF, opts);

  const bundle: DepartmentFactsBundle = { meta };

  if (want('product')) {
    bundle.productTeam = { role: 'sales_statistics_provider', salesStatisticsPacket: productStats, handoffToMarketing: productHandoff };
  }
  if (want('cs')) {
    bundle.csTeam = { role: 'customer_issue_provider', customerIssuePacket: csStats, handoffToMarketing: csHandoff, ...(opts.fakeContacts ? { fakeContacts: opts.fakeContacts } : {}) };
  }
  if (want('marketing')) {
    const direct = runPack('marketing', dataset, MARKETING_DIRECT_PACK, opts);
    bundle.marketingTeam = {
      role: 'analysis_and_planning',
      receivedFromProductTeam: productHandoff,
      receivedFromCsTeam: csHandoff,
      directMarketingFacts: direct,
      recommendationCandidates: buildMarketingRecommendations(dataset, productHandoff, csHandoff)
    };
  }
  if (want('manager')) {
    const exec = runPack('manager', dataset, MANAGER_SUMMARY_PACK, opts);
    const recs = bundle.marketingTeam?.recommendationCandidates || buildMarketingRecommendations(dataset, productHandoff, csHandoff);
    bundle.manager = {
      role: 'approval_and_priority',
      executiveSummary: exec,
      teamReports: { productTeam: productHandoff, csTeam: csHandoff, marketingTeam: recs },
      approvalQueueCandidates: recs.map((r) => ({ id: `approval:${r.id}`, title: r.title, type: 'marketing_recommendation', fromTeam: 'marketing', requiresApproval: true, summary: r.suggestedAction }))
    };
  }
  return bundle;
}

// 특정 팀의 facts packet만 (채팅 연결용 — 각 팀 역할 경계 유지)
export function buildTeamFactsPackets(team: DeptTeam, dataset: AnalyticsDataset, opts: { startDate?: string; endDate?: string } = {}): AnalyticsPacket[] {
  if (team === 'product') return runPack('product', dataset, PRODUCT_TEAM_PACK, opts);
  if (team === 'cs') return runPack('cs', dataset, CS_TEAM_PACK, opts);
  if (team === 'marketing') return runPack('marketing', dataset, MARKETING_DIRECT_PACK, opts);
  return runPack('manager', dataset, MANAGER_SUMMARY_PACK, opts);
}
