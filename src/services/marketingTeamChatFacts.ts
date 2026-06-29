// Marketing Team Chat Facts v0 — 마케팅팀 우측 팀장 채팅을 분석 facts에 grounding.
//
// 원칙(대시보드와 동일 기준):
//   - 채팅 답변의 숫자는 buildMarketingAnalysisFacts(순수 helper)가 계산한 facts만 근거. AI 추측 금지.
//   - 마케팅 분석 대시보드와 "같은 데이터 기준"(동일 builder)을 사용 → 화면/채팅 수치 일치.
//   - 없는 데이터(ROAS/방문전환/상품조회전환/장바구니/ GA4/SNS)는 절대 추정하지 않고 requiredData로 안내.
//   - PII(이름/전화/이메일/주소) 미포함. memberKey도 출력에 노출하지 않음(집계/그룹/차원 라벨만).
//   - 인과관계 단정 금지("때문에/덕분에" X) → 관찰 표현("높게 나타납니다/집중되어 있습니다/확인 필요").

import {
  buildMarketingAnalysisFacts,
  type MarketingAnalysisPeriod,
  type MarketingAnalysisPeriodPreset,
  type MarketingDimensionMetric,
  assertMarketingFactsNoPii
} from './marketingAnalysisFacts';

export type ChatMetric = {
  label: string;
  value: string;
  subValue?: string;
  sharePercent?: number;
};

export type MarketingTeamChatFacts = {
  source: 'marketing_analysis_facts';
  generatedAt: string;
  periodLabel: string;

  summary: {
    totalRevenue: number;
    orderCount: number;
    averageOrderValue: number;
    firstPurchaseRevenue: number;
    repeatPurchaseRevenue: number;
    couponOrderCount: number;
    totalCouponDiscountAmount: number;
    totalRewardUseAmount: number;
  };

  topMemberGroups: ChatMetric[];
  topOrderChannels: ChatMetric[];
  couponComparison: ChatMetric[];
  rewardComparison: ChatMetric[];
  topProducts: ChatMetric[];
  topCategories: ChatMetric[];
  topBrands: ChatMetric[];

  insights: {
    title: string;
    summary: string;
    severity: 'info' | 'positive' | 'warning';
    evidence: string[];
    recommendedNextAction?: string;
  }[];

  requiredData: {
    key: string;
    label: string;
    reason: string;
    unlocks: string[];
  }[];

  guardrails: {
    canAnswerRoas: boolean;
    canAnswerVisitorConversion: boolean;
    canAnswerProductViewConversion: boolean;
    canAnswerCartAbandonment: boolean;
    containsPii: boolean;
  };
};

// ── intent ───────────────────────────────────────────────────────────────────
export type MarketingChatIntent =
  | 'marketing_overview'
  | 'member_group_performance'
  | 'coupon_performance'
  | 'reward_performance'
  | 'first_repeat_purchase'
  | 'order_channel_performance'
  | 'top_products'
  | 'category_brand_performance'
  | 'required_data_question'
  | 'unsupported_roas'
  | 'unsupported_visitor_conversion'
  | 'unsupported_product_view_conversion'
  | 'unsupported_cart_abandonment';

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;

const PERIOD_LABEL: Record<MarketingAnalysisPeriodPreset, string> = {
  all: '전체 기간',
  today: '오늘',
  last7d: '최근 7일',
  last30d: '최근 30일',
  thisMonth: '이번 달',
  lastMonth: '지난 달',
  thisYear: '올해',
  custom: '직접 선택 기간'
};

// 지원 불가(외부 데이터 필요) 의도를 우선 판별 → 그 다음 지원 의도 → overview fallback.
export function detectMarketingChatIntent(text: string): MarketingChatIntent {
  const t = (text || '').toLowerCase();
  // 1) 외부 데이터 필요(미계산) — 추정 금지 대상
  if (/roas|광고\s*수익|광고비\s*대비|투자\s*대비\s*수익률?/i.test(t)) return 'unsupported_roas';
  if (/방문자?\s*전환|방문\s*전환|방문→\s*주문|visitor\s*conversion/i.test(t)) return 'unsupported_visitor_conversion';
  if (/상품\s*조회\s*전환|조회수?\s*전환|상품조회|product\s*view/i.test(t)) return 'unsupported_product_view_conversion';
  if (/장바구니\s*(이탈|포기)|cart\s*abandon/i.test(t)) return 'unsupported_cart_abandonment';
  // 2) 지원 의도
  if (/회원\s*그룹|회원그룹|등급별|그룹별|vip/i.test(t)) return 'member_group_performance';
  if (/쿠폰|할인/i.test(t)) return 'coupon_performance';
  if (/마일리지|적립금|예치금|리워드|포인트/i.test(t)) return 'reward_performance';
  if (/첫\s*구매|재구매|신규\s*구매|repeat\s*purchase|first\s*purchase/i.test(t)) return 'first_repeat_purchase';
  if (/채널|네이버페이|페이코|자사몰/i.test(t)) return 'order_channel_performance';
  if (/인기\s*상품|잘\s*팔|많이\s*팔|베스트|상품\s*(순위|매출|랭킹)|top\s*product/i.test(t)) return 'top_products';
  if (/카테고리|브랜드|category|brand/i.test(t)) return 'category_brand_performance';
  if (/필요\s*데이터|어떤\s*데이터|무슨\s*데이터|외부\s*데이터|연동\s*필요|required\s*data/i.test(t)) return 'required_data_question';
  return 'marketing_overview';
}

const UNSUPPORTED_INTENTS = new Set<MarketingChatIntent>([
  'unsupported_roas',
  'unsupported_visitor_conversion',
  'unsupported_product_view_conversion',
  'unsupported_cart_abandonment'
]);
export const isUnsupportedMarketingIntent = (intent: MarketingChatIntent): boolean => UNSUPPORTED_INTENTS.has(intent);

// 차원 metric → ChatMetric
const toChatMetric = (m: MarketingDimensionMetric): ChatMetric => ({
  label: m.label || '미분류',
  value: won(m.revenue),
  subValue: `주문 ${m.orderCount}건 · 객단가 ${won(m.averageOrderValue)}`,
  sharePercent: m.sharePercent
});

// ── facts builder ─────────────────────────────────────────────────────────────
export function buildMarketingTeamChatFacts(input: {
  orders: unknown[];
  products?: unknown[];
  reviews?: unknown[];
  inquiries?: unknown[];
  period?: MarketingAnalysisPeriod;
  nowMs?: number;
}): MarketingTeamChatFacts {
  const period = input.period ?? { preset: 'all' as const };
  const facts = buildMarketingAnalysisFacts({
    orders: input.orders,
    products: input.products,
    reviews: input.reviews,
    inquiries: input.inquiries,
    period,
    nowMs: input.nowMs
  });
  const s = facts.summary;

  const evLabel = (id: string): string => {
    const e = facts.evidence.find((x) => x.id === id);
    return e ? `${e.label} ${e.value}` : id;
  };

  return {
    source: 'marketing_analysis_facts',
    generatedAt: facts.generatedAt,
    periodLabel: PERIOD_LABEL[period.preset],
    summary: {
      totalRevenue: s.totalRevenue,
      orderCount: s.orderCount,
      averageOrderValue: s.averageOrderValue,
      firstPurchaseRevenue: s.firstPurchaseRevenue,
      repeatPurchaseRevenue: s.repeatPurchaseRevenue,
      couponOrderCount: s.couponOrderCount,
      totalCouponDiscountAmount: s.totalCouponDiscountAmount,
      totalRewardUseAmount: s.totalRewardUseAmount
    },
    topMemberGroups: facts.byMemberGroup.slice(0, 6).map(toChatMetric),
    topOrderChannels: facts.byOrderChannel.slice(0, 6).map(toChatMetric),
    couponComparison: facts.byCouponUsage.map(toChatMetric),
    rewardComparison: facts.byRewardUsage.map(toChatMetric),
    topProducts: facts.topProducts.slice(0, 8).map(toChatMetric),
    topCategories: facts.topCategories.slice(0, 8).map(toChatMetric),
    topBrands: facts.topBrands.slice(0, 8).map(toChatMetric),
    insights: facts.insights.map((i) => ({
      title: i.title,
      summary: i.summary,
      severity: i.severity,
      evidence: i.evidenceIds.map(evLabel),
      recommendedNextAction: i.recommendedNextAction
    })),
    requiredData: facts.requiredData.map((r) => ({ key: r.key, label: r.label, reason: r.reason, unlocks: r.unlocks })),
    guardrails: {
      canAnswerRoas: false,
      canAnswerVisitorConversion: false,
      canAnswerProductViewConversion: false,
      canAnswerCartAbandonment: false,
      containsPii: facts.piiCheck.containsPii
    }
  };
}

// ── 채팅 context 렌더 (productTeamChatFacts 패턴: {contextNote, answerGuidance}) ──
const dimLines = (title: string, items: ChatMetric[], emptyMsg: string): string => {
  if (!items.length) return `[${title}]\n- ${emptyMsg}`;
  const lines = items.map((m) => `- ${m.label}${m.sharePercent != null ? ` (${m.sharePercent}%)` : ''}: 매출 ${m.value}${m.subValue ? ` · ${m.subValue}` : ''}`);
  return `[${title}]\n${lines.join('\n')}`;
};

const requiredLine = (facts: MarketingTeamChatFacts, key: string): string => {
  const r = facts.requiredData.find((x) => x.key === key);
  if (!r) return '';
  return `- ${r.unlocks.join(' · ')}: 현재 계산하지 않음 — 필요 데이터 ${r.label}(${r.reason})`;
};

const MARKETING_ANSWER_GUIDANCE =
  '마케팅팀은 고도몰 주문/상품/CS 데이터 기반으로 "계산 가능한 분석만" 답한다. 숫자는 제공된 [마케팅 분석 facts]만 사용하고 추측하지 마라. ' +
  '외부 광고/방문자/상품조회/장바구니/GA4/SNS 데이터가 필요한 질문(ROAS·방문자 전환율·상품조회 전환율·장바구니 이탈률 등)은 절대 0이나 추정값을 만들지 말고, ' +
  '"현재 계산하지 않습니다 + 필요 데이터"를 [외부 연동 필요] 항목으로 안내하라. ' +
  '인과관계를 단정하지 마라("때문에 올랐다/덕분에 증가했다" 금지). "높게 나타납니다 / 집중되어 있습니다 / 확인이 필요합니다" 같은 관찰 표현을 사용하라. ' +
  '고객 개인정보(이름/전화/이메일/주소)와 가명 memberKey는 답변에 노출하지 마라. 회원그룹/채널/카테고리/브랜드 같은 집계 라벨만 사용하라.';

export interface MarketingChatContext {
  contextNote: string;
  answerGuidance: string;
}

// 마케팅팀 채팅 1턴 context. orders 없으면 null(호출부 fallback).
export function buildMarketingChatContext(
  userText: string,
  input: { orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; period?: MarketingAnalysisPeriod; nowMs?: number }
): MarketingChatContext | null {
  if (!input.orders || input.orders.length === 0) return null;
  const facts = buildMarketingTeamChatFacts(input);
  const intent = detectMarketingChatIntent(userText);
  const s = facts.summary;

  const summaryBlock =
    `[마케팅 분석 요약 · ${facts.periodLabel}]\n` +
    `- 총매출 ${won(s.totalRevenue)} · 주문수 ${s.orderCount}건 · 객단가 ${won(s.averageOrderValue)}\n` +
    `- 첫구매 매출 ${won(s.firstPurchaseRevenue)} · 재구매 매출 ${won(s.repeatPurchaseRevenue)}\n` +
    `- 쿠폰 사용 주문 ${s.couponOrderCount}건 · 쿠폰 할인 총액 ${won(s.totalCouponDiscountAmount)} · 리워드 사용액 ${won(s.totalRewardUseAmount)}`;

  // intent별 상세 블록 (switch가 default 포함 모든 경로에서 할당)
  let detailBlock: string;
  switch (intent) {
    case 'member_group_performance':
      detailBlock = dimLines('회원그룹별 매출', facts.topMemberGroups, '데이터 없음');
      break;
    case 'coupon_performance':
      detailBlock = dimLines('쿠폰 사용/미사용 비교', facts.couponComparison, '쿠폰 데이터 없음');
      break;
    case 'reward_performance':
      detailBlock = dimLines('마일리지/예치금 사용 비교', facts.rewardComparison, '리워드 데이터 없음');
      break;
    case 'order_channel_performance':
      detailBlock = dimLines('주문채널별 매출', facts.topOrderChannels, '채널 데이터 없음');
      break;
    case 'top_products':
      detailBlock = dimLines('상품 매출 TOP', facts.topProducts, '상품 데이터 없음');
      break;
    case 'category_brand_performance':
      detailBlock = `${dimLines('카테고리 매출 TOP', facts.topCategories, '카테고리 데이터 없음')}\n${dimLines('브랜드 매출 TOP', facts.topBrands, '브랜드 미연동(상품 메타데이터 부족)')}`;
      break;
    case 'first_repeat_purchase':
      detailBlock =
        `[첫구매/재구매 비교]\n- 첫구매 매출 ${won(s.firstPurchaseRevenue)} · 재구매 매출 ${won(s.repeatPurchaseRevenue)} (관찰값)`;
      break;
    case 'unsupported_roas':
      detailBlock = `[외부 연동 필요 · 미계산]\n${requiredLine(facts, 'adSpend')}`;
      break;
    case 'unsupported_visitor_conversion':
      detailBlock = `[외부 연동 필요 · 미계산]\n${requiredLine(facts, 'visitorSessions')}`;
      break;
    case 'unsupported_product_view_conversion':
      detailBlock = `[외부 연동 필요 · 미계산]\n${requiredLine(facts, 'productViewEvents')}`;
      break;
    case 'unsupported_cart_abandonment':
      detailBlock = `[외부 연동 필요 · 미계산]\n${requiredLine(facts, 'cartEvents')}`;
      break;
    case 'required_data_question':
      detailBlock =
        `[외부 연동 필요(미계산) 전체]\n` +
        facts.requiredData.map((r) => `- ${r.unlocks.join(' · ')}: 필요 데이터 ${r.label}`).join('\n');
      break;
    default:
      // overview — 핵심 차원 요약
      detailBlock = `${dimLines('회원그룹별 매출', facts.topMemberGroups.slice(0, 3), '데이터 없음')}\n${dimLines('주문채널별 매출', facts.topOrderChannels.slice(0, 3), '데이터 없음')}`;
  }

  // 외부 연동 필요 전체 안내(요약) — 항상 첨부(추정 금지 가드)
  const requiredSummary =
    `[외부 연동 필요(미계산) — 추정/0 금지]\n` +
    `- ROAS / 방문→주문 전환율 / 상품조회→구매 전환율 / 장바구니 이탈률 / GA4 / SNS 성과: 현재 계산하지 않음(외부 데이터 연결 필요)`;

  const contextNote = [
    '기준 데이터: Commerce Universe (marketingAnalysisFacts 동일 기준)',
    summaryBlock,
    detailBlock,
    requiredSummary
  ]
    .filter(Boolean)
    .join('\n');

  const guidanceSuffix = isUnsupportedMarketingIntent(intent)
    ? ' 이 질문은 외부 데이터가 필요한 지표다. 숫자를 만들지 말고 [외부 연동 필요] 항목의 "필요 데이터"를 그대로 안내하라.'
    : '';

  return { contextNote, answerGuidance: MARKETING_ANSWER_GUIDANCE + guidanceSuffix };
}

// 마케팅 채팅 context에 PII 금지 키가 섞였는지 self-check(없으면 []).
export function marketingChatContextContainsPii(ctx: MarketingChatContext | MarketingTeamChatFacts): string[] {
  return assertMarketingFactsNoPii(ctx);
}
