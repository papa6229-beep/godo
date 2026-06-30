# Cross-Team Revenue Metric Parity v0

> **핵심 원칙**: "부서별 화면은 목적에 따라 다른 매출 관점을 가질 수 있지만, 같은 이름의 KPI가 서로 다른 계산식을 사용해서는 안 된다."

공통 정의: [`src/services/revenueMetricContract.ts`](../src/services/revenueMetricContract.ts) · 진단: `scripts/audit-cross-team-revenue-metrics-v0.mjs`

## 1. 문제 상황

상품관리팀과 마케팅팀 대시보드에서 "전체 기간 매출/주문"처럼 보이는 KPI가 서로 다르게 표시됐다.

| 팀 | 매출 | 주문 | 객단가 |
|---|---|---|---|
| 상품관리팀 | 상품매출 **99,740,356원** | 총 주문 **1,315건** | — |
| 마케팅팀 | 총매출 **88,116,982원** | 주문수 **1,182건** | 74,549원 |
| **차이** | **11,623,374원** | **133건** | |

같은 "전체 매출"처럼 보이는 KPI가 부서마다 다르면 AI 직원의 분석·운영 지시가 신뢰를 잃는다.

## 2. 원인 분석 (버그 아님 — 의도된 다른 관점 + 라벨 모호성)

두 팀은 **같은 주문 원천**(synthetic commerce universe + 실주문)을 쓰지만 **두 개의 축**에서 다르게 집계한다.

**[축 1] 주문 포함 범위**
- 상품관리팀(`ProductTeamDashboard.kpi`): `relevantOrders.length` = **전체 주문**(결제완료·미입금·취소·가상 모두 포함).
- 마케팅팀(`marketingAnalysisFacts`): `counted = orders.filter(isCounted)` = **유효 주문**(결제완료 & 미취소)만.
- → 마케팅이 취소·미입금 주문만큼 적다. (133건 차이)

**[축 2] 매출 기준**
- 상품관리팀: `Σ lineRevenue` = **상품 라인합**(배송비 제외). 상품 판매흐름/재고 영향 분석용.
- 마케팅팀: `Σ totalAmount` = **주문 총액**. 마케팅 성과/객단가 분석용.
- → 같은 주문이어도 기준이 달라 금액이 다르다.

**audit 실증**(synthetic seed=42, 축소 샘플): 전체 822건 − 유효 745건 = **77건(취소 43 + 미입금 34)**, 금액차 6,867,138원. 운영 화면(1,315 vs 1,182)도 동일 메커니즘이 더 큰 규모로 나타난 것이다.

결론: **계산 버그가 아니라 의도적으로 다른 매출 관점**이다. 문제는 두 KPI가 비슷한 이름("총매출"/"총 주문" vs "상품매출"/"주문수")으로 표시돼 사용자가 같은 값으로 오인한다는 점이다.

## 3. 최종 metric contract

`src/services/revenueMetricContract.ts`에 단일 정의를 둔다. 모든 부서 대시보드는 매출/주문 metric의 **판정·계산·라벨을 이 파일에서 참조**한다.

| RevenueMetricKind | 정의 | 포함 | 제외 |
|---|---|---|---|
| **grossProductRevenue** | 전체 주문의 상품 라인합(`Σ lineRevenue`), 배송비 제외 | 전체 주문(취소·미입금·가상) | 배송비 |
| **netOrderRevenue** | 유효 주문의 주문 총액(`Σ totalAmount`) | 유효 주문(결제완료·미취소) | 취소·반품·미입금 |
| **validOrderRevenue** | 유효 상태 주문 매출(net과 동일 기준) | 유효 상태 주문 | 취소·반품·미입금 |
| **orderCountAll** | 전체 주문 수 | 전체 | 없음 |
| **orderCountValid** | 유효 주문 수 | 유효 | 취소·반품·미입금 |
| **averageOrderValue** | netOrderRevenue ÷ orderCountValid (denominator 명시) | 유효 | 취소·반품·미입금 |

유효 주문 판정 `isValidOrder`는 결제완료(paid) & 미취소(!canceled). 마케팅 `marketingAnalysisFacts.isCounted`가 이 함수로 단일화되어 **마케팅 수치는 그대로**다(audit cross-check: contract net == facts.totalRevenue, MATCH).

## 4. 각 팀이 쓰는 KPI 기준

| 팀 | KPI | metric | 화면 보조문구 |
|---|---|---|---|
| 상품관리팀 | 상품매출 | grossProductRevenue | "라인합·배송비 제외 · 전체 주문(취소·가상 포함)" |
| 상품관리팀 | 총 주문 | orderCountAll | "전체 주문(취소·미입금·가상 포함)" |
| 마케팅팀 | 총매출 | netOrderRevenue | "취소·반품 제외 유효 주문(결제완료·미취소) 기준" |
| 마케팅팀 | 주문수 | orderCountValid | "유효 주문" |
| 마케팅팀 | 객단가 | averageOrderValue | "유효 매출 ÷ 유효 주문수" |

두 대시보드에 **기준 보조문구(`*-kpi-basis-note`)** 를 추가해, 같은 화면 안에서 "왜 수치가 다른지"를 사용자가 바로 이해하도록 했다.

## 5. 왜 다른 경우 라벨을 다르게 해야 하나

- 상품관리팀은 **재고/상품 회전/판매 영향**을 보려고 취소·가상까지 포함한 gross를 본다 → "상품매출"(총매출 아님).
- 마케팅팀은 **객단가/성과**를 보려고 유효 주문만의 net을 본다 → "총매출(유효 주문)".
- 두 관점 모두 정당하다. 다만 **같은 이름("총매출")을 다른 계산식에 쓰면 안 된다.** 기준이 다르면 라벨/보조문구로 분리한다.

## 6. 향후 부서 추가 원칙

- 새 부서 대시보드가 매출/주문 KPI를 추가할 때는 **반드시 `revenueMetricContract`의 metric/라벨을 참조**한다. 같은 metric을 부서별로 다시 inline 계산하지 않는다.
- 새로운 매출 관점이 필요하면 `RevenueMetricKind`에 **새 종류를 추가**하고 라벨/정의를 명시한다 — 기존 종류의 이름을 다른 계산으로 덮어쓰지 않는다.
- smoke `scripts/smoke-cross-team-revenue-metric-parity-v0.mjs`가 이 원칙(공통 contract 참조·라벨 분리·contract↔facts parity)을 회귀 검증한다.
