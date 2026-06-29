# Marketing Intelligence Planner v0 (2026-06-29)

> **종류**: 분석 계획 엔진(서비스) — UI 대규모 변경 없음, 실제 WRITE 없음, 고도몰 API 호출 추가 없음, synthetic/외부 데이터 생성 없음, localStorage 변경 없음.
> **한 줄**: 마케팅 채팅이 질문을 **고정 intent로 맞추는 대신 "분석 계획(plan)"으로 변환**해 — 필요한 데이터 조각 판단 → 계산 가능/불가능 구분 → 기간/세그먼트/비교축/지표 추출 → deterministic 계산 → 관계/패턴 탐색 → 적합한 그래프 선택 → 근거·주의점 설명 — 까지 수행한다.
> **산출물**: `src/services/marketingIntelligencePlanner.ts`(신규) · `marketingChatChartSpec.ts`(artifact 확장) · `DepartmentWorkspacePanel.tsx`(planner-first 연결) + 본 문서 + `scripts/smoke-marketing-intelligence-planner-v0.mjs`(32/32).

---

## 1. 작업 목적 / 왜 fixed intent로는 부족한가

기존 구조는 `question → fixed intent → fixed request → chartSpec`이라, 질문이 정해진 문장과 조금만 달라지면 대응하지 못했다. 마케팅팀은 **통계 조회팀이 아니라** 데이터 간 관계를 분석하고 그래프로 설명하는 팀이어야 한다(상품관리팀처럼 수치만 읽어주는 화면 ≠ 마케팅 분석). 그래서 `question → MarketingIntelligencePlan → capability validation → executable analysis → chartSpec → narrative(근거 포함)` 구조로 바꾼다.

## 2. 마케팅팀 vs 상품관리팀

* 상품관리팀: 연결된 facts에서 **수치를 읽어** 답한다(단일 지표 조회).
* 마케팅팀: 주문일·금액·쿠폰·회원그룹·첫구매/재구매·시나리오 등 **여러 조각을 조합**해 비교/추이/관계/진단을 만들고, 그래프와 근거로 설명한다.

## 3. Data Capability Map (`buildMarketingDataCapabilityMap`)

"지금 가진 데이터로 무엇을 계산할 수 있는가"를 명시. availableSources(orders/orderLines/products/reviews/inquiries/customers/syntheticScenario) + availableFields + availableMetrics(19종: revenue/orderCount/averageOrderValue/quantity/discountAmount/couponDiscountAmount/couponUsageRateWithinOrders/rewardUseAmount/rewardUsageRateWithinOrders/revenueShare/orderShare/first·repeatPurchaseRevenue/OrderCount/reviewCount/averageRating/inquiryCount/claimCount) + availableDimensions(time/scenario/couponUsage/memberGroup/firstRepeat/orderChannel/rewardUsage/product/category/brand/reviewRating/inquiryStatus/claimStatus) + **unavailableMetrics**(visitorConversionRate/productViewConversionRate/cartAbandonmentRate/ROAS/adCTR/GA4Behavior/SNSPerformance/signupToPurchaseConversionRate).

> 전환율은 분모에 따라 다르다: 방문자 기준 → visitorSessions, 가입자 기준 → signup/member 데이터. 단 **주문 기준 신규회원 구매 성과는 proxy로 제공 가능**.

## 4. MarketingIntelligencePlan 구조

`goal`(compare/trend/rank/share/relationship/conversion/diagnose/summary) · requestedMetrics/executableMetrics · periods · timeBucket · dimensions · segments · filters · comparison · relationshipTargets · chartRecommendation · dataRequirements · proxyPlan · confidence · warnings. 즉 **질문 → 분석계획 → 실행** 구조가 드러난다.

## 5. Question Parser (`parseMarketingQuestionToPlan`)

intent switch가 아니라 요소 추출: 분석 목적·지표·기간(2025년/2026년 1~6월 등 deterministic 파싱)·시간버킷·세그먼트(신규/VIP/재구매)·필터(쿠폰기간→promotion, baseline)·비교축·그래프 힌트. **정해진 문장과 정확히 일치하지 않아도** 계획이 생성된다.
* 핵심 분기: "A보다 B"/2+ 그룹 → memberGroup을 **그룹 축**(series). "신규회원의 X" 단일 주어 → **필터**(segment). "작년 대비" + 명시 연도 없음 → baseline/promotion 시나리오 축.

## 6. Capability Validator (`validateMarketingIntelligencePlan`)

요청 지표가 계산 가능한지 판정 → 불가능은 `dataRequirements`로, 가능한 대체가 있으면 `proxyPlan` 생성, 계산 가능한 것만 `executableMetrics`. (예: 신규회원 구매전환율 → exact requiredData(memberSignupDate) + proxy(신규회원 주문수/매출/AOV/첫구매 추이). ROAS → requiredData만, proxy 없음. 쿠폰 사용률 → orders+discountSummary.hasCoupon으로 available.)

## 7. proxy analysis 정책

| 요청 | exact | proxy |
|---|---|---|
| 구매전환율 | requiredData(가입/방문) | 신규회원 주문수·매출·AOV·첫구매 추이 |
| 쿠폰 효과 | 인과 단정 금지 | 쿠폰 사용/미사용 AOV·주문수·매출, baseline/promotion 비교 |
| 회원 반응 | 일부 requiredData | 회원그룹별 주문/매출/AOV/쿠폰 사용률 |
| 리뷰/문의-매출 관계 | 인과 단정 금지 | 상품/카테고리별 리뷰·문의 수와 매출 같은 기간 비교 |

## 8. relationship / correlation 분석 (`buildMarketingRelationshipSummary`)

같은 버킷에서 두 지표의 동조/역행, 표본 부족 경고, Pearson 상관계수. **상관계수는 관계 강도 참고값이며 원인을 증명하지 않습니다**를 항상 명시. "상관관계가 있으므로 원인입니다"/"쿠폰 때문에 매출이 올랐습니다" 금지.

## 9. Chart Recommendation (`recommendMarketingChartForPlan`)

시간 흐름→line · 두 그룹/기간 비교→groupedBar · 순위→rankedBar · 구성비→donut(범주 많으면 rankedBar) · 관계→line · 외부데이터→unsupported · 단일값→table.

## 10. Narrative / Evidence

`MarketingIntelligenceNarrative`: title/summary/answerType(calculated/partial_with_proxy/required_data/unsupported)/bullets/evidence/relationshipNotes/causalCautions/requiredData/nextQuestions. 계산 가능→"현재 주문 데이터 기준으로 계산 가능합니다", proxy→"정확한 지표는 아직 계산하지 않지만 가능한 대체 분석은…", 원인은 "가능성/관찰됩니다" 수준. evidence는 사용한 데이터 조각 명시(주문일/쿠폰 사용 여부/결제금액/회원그룹/첫구매·재구매).

## 11. 기존 chartSpec bridge 연결

`DepartmentWorkspacePanel` 마케팅 분기: **0순위 `buildMarketingIntelligenceResponse`(planner) → 1순위 `runMarketingChartRequest`(기존 fixed intent) → 2순위 marketingTeamChatFacts/LLM**. fixed intent는 삭제하지 않고 fallback 유지. `runMarketingChartRequest` 계약 불변(기존 runtime/render smoke 무회귀).

## 12. artifact 확장

`MarketingChatChartArtifact.source: 'marketingIntelligencePlanner' | 'marketingChatChartSpec'` + optional `plan`(집계/계획만), `evidence`, `requiredData`. **raw order row / memberKey / PII 미포함**(집계 결과·근거 설명만). narrative는 대시보드 호환(MarketingChartNarrative)으로 변환.

## 13. 인과관계 단정 금지 / PII

* causalCautions 항상 첨부, "때문에/덕분에/원인입니다" 부재(smoke 검증).
* `assertMarketingIntelligenceNoPii`: name/phone/email/address/receiverName/memberKey/syn_member_ 검사. 모든 result `piiCheck.containsPii === false`.
* 계산 가능 질문에 "월별 데이터가 없습니다/쿠폰 사용 여부 데이터가 없습니다/주문금액 데이터가 없습니다" 금지(smoke 검증).

## 14. 실제 WRITE 없음

planner 순수 함수 + artifact 타입 확장 + 패널 분기 + 문서 + smoke. route/네트워크/localStorage 신규 없음(artifact는 state), 고도몰 WRITE 없음, Math.random 미사용. 기존 계산 엔진(crosstab/facts) 미변경.

## 15. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-intelligence-planner-v0` ✅ 32/32 (대표 12질문 전부 처리)
* 회귀: dynamic-smart-chart-render 30 · chat-chartspec-runtime-connection 32 · chat-driven-chartspec-bridge 37 · temporal-crosstab 30 · baseline-year 29 · dashboard-focused-insight-layout-v01 27 · analysis-dashboard-v0 30 · facts-core 34 · team-chat-facts 32.

## 16. 다음 작업 후보

1. **LLM planner adapter** — 질문 해석/계획 보강을 LLM이 돕되 숫자는 계속 deterministic(구조는 열려 있음).
2. **supportingChartSpecs 렌더** — 보조 차트(최대 2개) 중앙 표시.
3. **Member READ Contract** — 가입일 연결 → 정확한 전환율(proxy 졸업).
4. **relationship scatter 차트** — 관계 분석 전용 시각화.
5. **기간 자연어 확장** — "최근 6개월/지난 분기" 등.
