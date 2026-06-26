# Analytics Query Engine v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/analytics-query-engine-v0`
> **코드**: `src/services/analyticsQueryEngine.ts` · **smoke**: `scripts/smoke-analytics-query-engine.mjs`(25/25, 61 metrics)

## 1. 작업 목적
마케팅·상품·CS·총괄이 공통으로 쓸 **숫자 계산 엔진**. AI가 숫자를 만들지 않고, 엔진이 계산한 결과만 설명한다. 채팅·향후 Analytics Result Modal·Preset Panel·Department Facts Routing이 재사용한다.

## 2. Grounding Fix와의 관계
Grounding Fix는 상품팀 채팅의 "월 범위" 해석을 고쳤다. 이 엔진은 그걸 일반화 — **임의 metric × groupBy × 기간 × 비교기간 × 필터**를 구조화된 QuerySpec으로 계산한다. (자연어 파싱은 v0 핵심 아님 — QuerySpec 직접 호출, 채팅 연결은 다음 단계.)

## 3. Metric Registry 구조
`AnalyticsMetricDefinition { key, labelKo, description, domain, supportLevel, requiredData, defaultGroupBy?, recommendedChart? }`. **61개 metric** 정의(`ANALYTICS_METRIC_REGISTRY`) + `listAnalyticsMetrics()`/`getAnalyticsMetric(key)`.

## 4. QuerySpec 구조
`{ metric, groupBy?, startDate?, endDate?, compareTo?{startDate,endDate,label?}, filters?{category/brand/product/paymentMethod/orderChannel/customerSegment/...} }`.

## 5. 지원 metric (domain)
sales(매출/순매출/주문/수량/객단가/성장률/점유율/기간비교) · customer(고객수/신규/재구매/재구매율/구매빈도/구매주기/세그먼트/LTV proxy) · product(상품매출/수량/순위/저성과/환불위험/재구매유망) · category·brand(매출/객단가) · payment·channel(매출/주문수) · claim(클레임/취소/환불/반품/교환율·금액) · review(수/평점/감정/주제/저평점상품) · cs(문의수/주제/미답변/긴급/이슈상품) · campaign·conversion(이벤트비교/전환율/ROAS/쿠폰).

## 6. 지원 groupBy
month/week/day/category/brand/product/paymentMethod/orderChannel/customerSegment/memberKey/reviewTopic/reviewSentiment/inquiryTopic/claimType/claimReason/campaign/cohortMonth.

## 7. supportLevel 정책
| level | 의미 |
|---|---|
| `supported` | 현재 orders/orderLines로 계산 |
| `derived` | 파생 계산(객단가/성장률/재구매율/클레임율 등) |
| `synthetic_only` | Universe(customers/reviews/inquiries)로만 가능, real은 board/회원 READ 필요 |
| `requires_external_data` | 회원가입/방문/광고/캠페인 데이터 필요 → 계산 불가, 필요 데이터 반환 |
| `not_supported_yet` | registry 정의·미구현(예: cohortRetention) |
- AI는 "계산 불가"만 말하지 않고 **어떤 데이터가 연결되면 가능한지** 안내(`requiredData` 반환).

## 8. 기간 필터 정책
startDate/endDate로 먼저 필터 → groupBy → 계산. 기간 밖 데이터 제외. **0건일 때만** no_data(ok:false). compareTo가 있으면 같은 metric을 비교기간에도 계산(periodComparison).

## 9. 계산 공식
객단가=매출/주문수 · 재구매율=2회+구매 고객/구매 고객(memberKey 기준) · 구매빈도=주문수/구매고객 · 클레임율=hasClaim 주문/전체 · 환불률=refund 포함 주문/전체 · 리뷰평점=rating 평균 · LTV proxy=고객당 누적매출 평균(warnings 표시).

## 10. chartHint 정책
각 결과에 `chartHint{type}` 포함(bar/line/bar_line/donut/table/scorecard) — 향후 그래프 팝업/패널이 사용. v0는 팝업 미구현.

## 11. PII 제외 원칙
결과(rows/summary)에 customerName/phone/address/email/refundAccount/deliveryMemo **절대 미포함**. 고객 식별은 가명 `memberKey`·segment만. (smoke 23으로 검증.)

## 12. requires_external_data 지표
campaignRevenueComparison · campaignAovComparison · campaignRepurchaseComparison · signupPurchaseConversionRate · trafficPurchaseConversionRate · adRoas · couponUsageRate · claimReasonBreakdown. → 필요 데이터(campaignCalendar/signupEvents/trafficEvents/adSpend/claims reason codes) 반환.

## 13. v0 구현 범위 / 채팅 연결 보류
- **엔진 + smoke(25)** 가 이번 deliverable. Tier 1/2 metric 실계산, Tier 3 requires_external_data.
- `RevenueOrderLite`에 Contract v0 분석 필드(memberKey/paymentMethodCode/orderChannel/claim) **가산** — 프론트가 엔진에 주입할 준비. (orders-revenue 응답엔 이미 존재, 라이브 확인: paymentMethodCode 826/memberKey 826/claimSummary 85.)
- **채팅 연결은 보류**: productTeamChatFacts에 엔진을 직접 import하면 standalone-emit smoke(Node ESM, 확장자 없는 import)가 깨져, 데이터 흐름을 제대로 설계하는 **Department Facts Routing v0**에서 연결한다(작업지시서 §13 "연결 최소화" 준수).

## 14. 다음 단계 — Analytics Result Modal / Department Facts Routing
- Department Facts Routing v0: 부서별로 적절한 metric 묶음을 엔진으로 계산해 CS/마케팅/총괄 채팅에 라우팅(상품팀 wiring 패턴 + 모듈 해상도 정리).
- Analytics Result Modal v0: chartHint 기반 그래프 팝업.
- 자연어 → QuerySpec 변환 확장.
