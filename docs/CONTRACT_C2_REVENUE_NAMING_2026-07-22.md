# C-2 매출 명명 계약 (사장 승인 반영) + RED 범위 — 2026-07-22

> 상태: **RED 제출 · GREEN 미착수.** 이 문서와 `scripts/smoke-c2-revenue-basis-parity-v0.mjs`만 이번 커밋에 포함(제품 계산 소스 변경 없음).
> 근거 값(소형 fixture, 실제 모듈 재현): 현행 analytics "매출"=50,000 / 유효주문 결제금액=39,500 / 상품매출(유효·라인)=38,000.

## 1. 명칭 계약 (확정)

| 개념 | 사용자 명칭 | 신규 공통 계약명(안) | 계산 |
|---|---|---|---|
| 기본 "매출" | **유효주문 결제금액** (= 운영매출) | `operationalRevenue` / `validOrderPaymentAmount` | 유효주문(결제완료·미취소) Σ `totalAmount` (배송비 포함·할인 차감 후) |
| 상품 성과 | **상품매출** | `grossProductRevenue`(기존 유지) | 라인합·배송비 제외 |
| 배송비 | 배송비 | `shippingRevenue`(이미 `departmentDataSourceOfTruth:145`에 분리 존재) | 유효주문 배송비 합 |
| 할인 | 할인금액 | (원천 `discountSummary`) | 참고 |
| 환불 | 환불 | **미반영(원천 계약 전까지 산출 금지)** | `state.refunded` 하드코딩 false — 원천 없음 |

**금지**: `netOrderRevenue`는 환불을 반영하지 않으므로 **"순매출"로 부르지 않는다.** "총매출"도 모호하므로 신규 표기에서 지양하고 **"유효주문 결제금액"**(또는 운영매출)으로 명시한다. 배송비 포함 값임을 화면·계약에 표기.

**호환(즉시 삭제 금지)**
- `computeNetOrderRevenue` / `netOrderRevenue` export는 **삭제하지 않는다.** 신규 명칭(`operationalRevenue`/`validOrderPaymentAmount`)을 정본으로 두고, 기존 이름은 **동일 계산을 가리키는 deprecated 별칭**으로 보존(`@deprecated` 주석 + 별칭 재-export). 라벨 상수 `REVENUE_METRIC_LABELS.netOrderRevenue`의 표시 문구만 "유효주문 결제금액"으로 교정.
- `analyticsQueryEngine`의 `netRevenue`(순매출) 메트릭은 **삭제하지 않되**, 라벨을 "라인매출−클레임(근사)"로 강등하고 **신규 UI·AI 답변에서는 숨김/비노출**(환불 원천 계약 전까지 실제값처럼 표기 금지).

## 2. RED (의도된 실패 — GREEN 대상)

`scripts/smoke-c2-revenue-basis-parity-v0.mjs` 기준(9개 항목 확장). **[BASE] 9 pass/0 fail(기준선 불변) · [RED] 1 met/16 unmet(계약 목표) · exit 1.** 서로 다른 계산 분기마다 실제 반환값 검증.

| # | RED 목표 | 현재 |
|---|---|---|
| R1 | 헤드라인 매출 = **39,500** | 50,000 |
| R2 | 객단가 = 39,500÷3 = **13,167** (분모 유효 3) | 10,000 |
| R3 | 유효주문 수 지표 = **3** | 5 |
| R4/R5/R6 | 결제수단·채널·고객군 매출 각 **39,500** | 각 50,000 |
| R7 | 상품별 매출 = **38,000** | 50,000 |
| R8/R9/R10 | 상품·카테고리·브랜드에서 취소·미결제 라인(G3·G4·003·004·B3·B4) **제외** | 포함 |
| R11 | 주문기준 비중 분모 = **39,500** (합계 100%=BASE) | 50,000 |
| R12 | 상품기준 비중 분모 = **38,000** (합계 100%=BASE) | 50,000 |
| R13 | 성장률 6월 = **0%** (취소 30,000 제외) | +150% (한쪽 기간에만 취소) |
| R14 | 기간비교 6월 매출 = **20,000** | 50,000 |
| R15 | 주문 매출 라벨 = **유효주문 결제금액/운영매출** | `"매출"` |
| R16 | 상품 매출 라벨에 "상품" 포함(주문과 구분) | 이미 MET(`상품별 매출`) |
| R17 | `netRevenue` 라벨에서 **"순매출" 제거** | `"순매출(라인매출-클레임)"` |

**값 관계(BASE로 잠금)**: 현행 라인기준 매출 50,000 − 계약 유효결제 39,500 = **10,500** = 취소·미결제 라인 **12,000** − 유효주문 배송비·할인 순증 **1,500**. 그리고 **유효결제 39,500 ≠ 상품매출 38,000(차 1,500=배송비2,500−할인1,000)은 오류가 아니라 서로 다른 정상 계약** — 상품축에 배송비·주문할인을 임의 배분하지 않는다.

## 3. 영향 소비자 전수 (RED 범위 — 같은 계산 `orderRevenue`=`productRevenueByLines`, 취소·미결제 미필터)

**주문 단위 매출(→ 유효주문 결제금액 기준으로 교정 대상)** — `groupOrders`가 `paid/canceled` 미적용:
- `revenue`(매출), `revenueShare`(매출 점유율), `paymentMethodRevenue`(결제수단별), `orderChannelRevenue`(주문채널별), `customerSegmentRevenue`(세그먼트별)
- `averageOrderValue`(객단가) — 분자=라인합, 분모=`orders.size`(전체) 둘 다 오염
- `salesGrowthRate`(성장률) — 월별 `groupOrders` 매출 기반
- `periodComparison`(기간 비교) — `Σ orderRevenue`
- `netRevenue` — `groupOrders` 매출 − 클레임

**라인 단위 매출(→ 상품매출 계약: 유효주문 라인, 별도 지표 유지)** — `groupLines`도 `paid/canceled` 미필터:
- `categoryRevenue`, `brandRevenue`, `productRevenue`, `topProducts`, `lowPerformingProducts`, `categoryAov`, `brandAov`

**관련(별도 확인)**: `orderCount`/`*OrderCount`는 기간 내 전체 주문(취소·미결제 포함) 수 — 유효/전체 구분(`orderCountValid` vs `orderCountAll`)은 매출 계약과 함께 정리 필요.

> GREEN 설계 시 결정할 하위 항목(사장 승인 필요): **주문 단위 매출은 유효주문 결제금액(totalAmount)**, **라인 단위(카테고리/상품/브랜드)는 유효주문 라인 매출**로 기준을 분리한다(둘 다 취소·미결제 제외). 헤드라인 "매출"에 라인기준을 섞지 않는다.

## 4. GREEN 착수 조건 (승인 대기)

1. `analyticsQueryEngine`의 주문 단위 매출 경로에 **유효주문 필터(isValidOrder)** 도입 + 헤드라인 매출을 `operationalRevenue`(totalAmount) 기준으로.
2. 라인 단위 지표는 유효주문 라인으로 제한(상품매출 계약 유지).
3. 라벨 교정(순매출 제거·유효주문 결제금액 명시), 기존 export는 deprecated 별칭 보존.
4. 위 RED 4항목 MET + BASE 불변 + 지표 정합성/전체 스모크/tsc·build/신규 lint 0.
5. 환불은 이번 범위에서 **미반영 유지**(원천 계약은 별도).
