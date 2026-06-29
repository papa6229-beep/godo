# Marketing Chat-Driven ChartSpec Bridge v0 (2026-06-29)

> **종류**: bridge 계약 + 순수 함수 — UI 변경 없음, 실제 WRITE 없음, 고도몰 API 호출 추가 없음, synthetic/외부 데이터 생성 없음, localStorage 변경 없음.
> **한 줄**: 마케팅 채팅의 자연어 분석 질문을 **intent → MarketingCrossTabRequest → buildMarketingTemporalCrosstab → chartSpec + narrative** 로 잇는 단일 진입점 `buildMarketingChatChartResponse`를 추가했다(중앙 그래프 렌더는 다음 작업).
> **산출물**: `src/services/marketingChatChartSpec.ts` · 본 문서 · `scripts/smoke-marketing-chat-driven-chartspec-bridge-v0.mjs`(37/37). 기존 파일 미수정(완전 additive).

---

## 1. 작업 목적 / 왜 bridge가 필요한가

직전 작업의 `buildMarketingTemporalCrosstab`(교차분석 엔진)은 강력하지만, 사용자는 `MarketingCrossTabRequest`를 직접 쓰지 않는다. 채팅에서 "월별 쿠폰 사용/미사용 객단가 비교해줘"라고 물으면 → intent를 감지 → 알맞은 CrossTabRequest를 만들고 → 엔진을 돌려 → **그래프 명세(chartSpec)와 설명(narrative)** 로 변환하는 다리가 필요하다. 이 bridge가 다음 작업(대시보드/채팅 중앙 그래프 동적 출력)의 단일 진입점이 된다.

## 2. 흐름

```
사용자 질문(message)
→ detectMarketingChartIntent           (자연어 → MarketingChartIntent)
→ buildMarketingCrossTabRequestFromIntent (intent → MarketingCrossTabRequest | null)
→ buildMarketingTemporalCrosstab        (요청 실행, 직전 작업 엔진)
→ buildMarketingChartSpecFromCrosstab   (결과 → chartSpec)
→ buildMarketingChartNarrative          (chartSpec/crosstab → narrative)
= buildMarketingChatChartResponse       (단일 진입점)
```

## 3. 지원하는 질문 유형 (intent)

| intent | 질문 예 | 차트 |
|---|---|---|
| `monthly_coupon_aov` | "월별 쿠폰 사용/미사용 객단가 비교", "쿠폰 쓴 주문과 안 쓴 주문의 월별 객단가" | groupedBar |
| `yearly_revenue_compare` | "작년이랑 올해 월별 매출 비교" | groupedBar |
| `scenario_revenue_compare` | "baseline이랑 promotion 매출 비교" | groupedBar |
| `member_group_revenue` | "회원그룹별 매출", "VIP 매출 비중" | rankedBar |
| `monthly_first_repeat` | "월별 첫구매 재구매 매출" | groupedBar |
| `monthly_order_channel` | "월별 주문채널 매출" | line |
| `monthly_reward_aov` | "마일리지 사용 주문 객단가" | groupedBar |
| `category_revenue_trend` | "카테고리별 월별 매출" | rankedBar |
| `top_product_trend` | "상품별 매출 추이" | rankedBar |
| `unsupported_*` / `unknown` | ROAS/방문/상품조회/장바구니 등 | unsupported |

## 4. 계산 가능한 질문 (주문 데이터 조합)

위 9개 지원 intent는 전부 `buildMarketingTemporalCrosstab`로 **실제 계산**된다(주문일·주문금액·쿠폰 적용 결과·회원그룹·채널·첫구매 플래그·라인 카테고리/상품 조합). 절대 "데이터 없음"으로 답하지 않는다. 월별 쿠폰 사용/미사용 객단가 질문은 반드시 `available:true` + `series:[쿠폰 사용, 쿠폰 미사용]`로 처리(smoke 강제).

## 5. requiredData로 막는 질문

`unsupported_roas / unsupported_visitor_conversion / unsupported_product_view_conversion / unsupported_cart_abandonment`(+ GA4/광고 CTR/SNS는 `unknown`)는 crosstab 실행 없이 **unsupported chartSpec + requiredData**로 반환:

| intent | requiredData |
|---|---|
| ROAS | adSpend, campaignAttribution |
| 방문→주문 전환율 | visitorSessions |
| 상품조회→구매 전환율 | productViewEvents |
| 장바구니 이탈률 | cartEvents |

0/추정값을 만들지 않고 narrative에 "현재 계산하지 않습니다 + 필요 데이터"만 안내.

## 6. chartSpec 구조

`MarketingChartSpec`: `chartType`(line/groupedBar/stackedBar/donut/rankedBar/table/unsupported) · `primaryMetric` · `series[]`(dimensionKey별, 시간 버킷 points) · `xAxisLabel/yAxisLabel/unit` · `source:'temporal_crosstab'` · `request` · `available` · `unavailableReason` · `requiredData` · `evidence[]` · `warnings[]`. **available:false면 chartType=unsupported, series 비움**(빈 series를 0으로 꾸미지 않음).

## 7. narrative 원칙

* 계산 가능한 요청: `summary`에 **"현재 주문 데이터 기준으로 계산 가능합니다"** + 어떤 주문 조합으로 계산하는지 명시(쿠폰 적용 결과/회원그룹 라벨/첫구매 판별 등). bullets는 series 요약 + crosstab 관찰 인사이트.
* unsupported: "현재 계산하지 않습니다 + 필요 데이터".
* 관찰 표현만("높게 나타납니다/비중이 큽니다/확인 필요합니다"). 인과 단정(때문에/덕분에/원인입니다) 금지.

## 8. 금지 답변 예시 (smoke 검사)

다음 문구는 현재 synthetic 데이터 기준 **틀린 답변**이라 금지(계산 가능 질문에서 등장 시 smoke 실패):
* "월별 주문 데이터가 없어서 어렵습니다"
* "쿠폰 사용 여부 데이터가 없어서 어렵습니다"
* "주문금액 데이터가 없어서 어렵습니다"

## 9. PII 금지

chartSpec/narrative는 집계 라벨(회원그룹/채널/카테고리/쿠폰 사용 여부)·버킷 라벨·숫자만 사용. name/phone/email/address/memberKey 미노출(smoke가 결과 JSON 스캔으로 검증).

## 10. 인과관계 단정 금지

narrative/warnings에서 때문에/덕분에/원인입니다 부재(smoke 검증). 관찰 표현만.

## 11. 실제 WRITE 없음

순수 함수 1개 파일 + 문서 + smoke. route/네트워크/localStorage/고도몰 WRITE 없음, 데이터 생성 없음, Math.random 미사용. 기존 파일 0개 수정(채팅 흐름 연결은 다음 작업의 hook).

## 12. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-chat-driven-chartspec-bridge-v0` ✅ 37/37
* 회귀: `temporal-crosstab` 30/30 · `baseline-year` 29/29 · `dashboard-focused-insight-layout-v01` 27/27 · `facts-core` 34/34 · `team-chat-facts` 32/32.

## 13. 다음 작업 후보

1. **채팅 흐름 연결** — `DepartmentWorkspacePanel`/`marketingTeamChatFacts`에서 `buildMarketingChatChartResponse` 호출 → 차트 의도 질문이면 chartSpec + narrative를 응답에 포함.
2. **중앙 그래프 동적 출력** — chartSpec을 대시보드 메인 그래프로 렌더(groupedBar/line/rankedBar).
3. **intent 보강** — GA4/광고 CTR/SNS 전용 requiredData intent, 기간 파싱("최근 6개월").
4. **2축 chartSpec** — 월 × 쿠폰 × 첫구매 stackedBar/heatmap.
