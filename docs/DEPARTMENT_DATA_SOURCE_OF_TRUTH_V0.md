# Department Data Source of Truth v0

> **핵심 원칙**: "부서별 분석 관점은 다를 수 있지만, 운영자가 같은 급으로 보는 대표 KPI는 하나의 source of truth에서 나와야 한다."

공통 snapshot: [`src/services/departmentDataSourceOfTruth.ts`](../src/services/departmentDataSourceOfTruth.ts) · 운영 KPI 계약: [`src/services/departmentMetricContract.ts`](../src/services/departmentMetricContract.ts) · 진단: `scripts/audit-department-data-source-of-truth-v0.mjs`

## 1. 문제 상황

상품관리팀과 마케팅팀의 상단 대표 KPI가 서로 달랐다.

| 팀 | 매출 | 주문 |
|---|---|---|
| 상품관리팀 | 상품매출 99,740,356원 | 총 주문 1,315건 |
| 마케팅팀 | 총매출 88,116,982원 | 주문수 1,182건 |

운영자는 이를 **데이터 불일치**로 인식했다. 어느 쪽이 맞는지 모르는 상태에서는 CS팀 데이터도 신뢰할 수 없다.

## 2. 왜 이전 parity 작업(라벨 분리)이 부족했나

[Cross-Team Revenue Metric Parity v0](./CROSS_TEAM_REVENUE_METRIC_PARITY_V0.md)에서는 "두 팀이 다른 관점을 본다"고 보고 **라벨/보조문구만 추가**했다. 하지만:

- 화면에는 여전히 **같은 급의 대표 KPI(매출/주문수)가 부서마다 다른 숫자**로 떠 있었다.
- 운영자에게 "상품매출"과 "총매출"은 둘 다 "그 가게의 전체 매출"로 읽힌다 → 설명 문구로는 신뢰가 회복되지 않는다.

→ 필요한 것은 설명이 아니라 **대표 운영 KPI를 하나의 source of truth로 통일**하는 것이다.

## 3. 공통 운영 KPI vs 부서별 분석 KPI (2층 구조)

**(1) 공통 운영 KPI — 모든 부서 상단에서 같은 값**
- `operationalRevenue` = 유효 주문(결제완료·미취소) 순매출 (`netOrderRevenue`)
- `operationalOrderCount` = 유효 주문 건수 (`orderCountValid`)
- `operationalAOV` = operationalRevenue ÷ operationalOrderCount

**(2) 부서별 분석 KPI — 부서 목적에 따라 다를 수 있음(대표 KPI처럼 보이면 안 됨)**
- 상품관리팀: `상품 라인 매출`(전체 주문 라인합, 배송비 제외, 취소·가상 포함) — 재고/판매흐름 분석용
- 마케팅팀: 첫구매/재구매/쿠폰 사용 객단가 등(기간 필터 적용)
- CS팀: 미처리/처리완료 문의, AI 자동처리함, 고객관리 — 업무 흐름 지표

## 4. 부서별 기준

| 부서 | 상단 대표 KPI | source | 부서 전용값(분리) |
|---|---|---|---|
| 상품관리팀 | 운영매출 · 운영 주문수 | `snapshot.operational*` | 상품 라인 매출(gross), 전체 주문수 |
| 마케팅팀 | 운영매출 · 운영 주문수 | `snapshot.operational*` | 선택 지표(객단가/쿠폰 등, 기간 필터) |
| CS팀 | (매출 아님) 미처리/처리완료/AI함/고객관리 | 같은 Commerce Universe(safe)·같은 기간 필터 | — |
| 총괄팀(hq) | (예정) 모든 팀 요약 + 승인 큐 | `snapshot` 재사용 예정 | — |

상품관리팀과 마케팅팀의 **상단 매출·주문수는 이제 같은 값**이다(audit로 검증). 상품 라인 매출(gross)은 "상품관리 전용 분석"으로 분리 표시한다.

## 5. Source of Truth snapshot 구조

`buildDepartmentSourceOfTruthSnapshot(revenue)` — 모든 부서가 같은 `RevenueResult` universe로 호출하는 순수 함수.

```
DepartmentSourceOfTruthSnapshot {
  sourceMode: real | synthetic | mixed | unavailable
  orderUniverse:   { totalOrders, validOrders, cancelledOrders, unpaidOrders, returnedOrders }
  revenueUniverse: { grossProductRevenue, netOrderRevenue, shippingRevenue, refundedRevenue, operationalRevenue }
  productUniverse: { totalQuantitySold, productCount, riskyStockCount }
  customerUniverse:{ totalCustomers, repeatCustomers, highRiskCustomers }
  csUniverse:      { totalInquiries, unresolvedInquiries, resolvedInquiries, totalReviews, autoCandidates }
  metadata:        { includesSynthetic, realOrderCount, syntheticOrderCount, basisDescription }
  // 편의 접근자(대표 운영 KPI)
  operationalRevenue, operationalOrderCount, operationalAOV, productLineRevenue
}
```

부모 `DepartmentWorkspacePanel`은 `fetchRevenue`로 한 번 로드한 universe를 세 대시보드에 동일하게 전달하고, 각 대시보드는 이 builder로 같은 값을 읽는다. synthetic/demo 데이터면 `metadata`에 그대로 명시한다(실데이터처럼 꾸미지 않음).

## 6. CS팀 숫자 source 감사

- **미처리 문의** = `universeAux.inquiries` 중 `status != answered` (csDashboardStatistics와 동일 판정)
- **처리완료 문의** = 답변완료 + 세션 로컬 완료 이력
- **AI 자동처리함** = 리뷰 + 배송 문의(상품/결제/환불 제외)
- **고객관리 N명** = 주문 `memberKey` 기준 고유 고객 수
- 문의/리뷰/고객은 **매출 대시보드와 같은 Commerce Universe(safe)** 에서 **같은 기간 필터**로 집계된다. CS 지표는 매출 KPI와 별개의 업무 흐름 지표다. 고객 PII는 CS 화면 경로에서만 표시된다.

## 7. 향후 부서 추가 원칙

- 새 부서 대시보드의 **상단 대표 KPI는 반드시 `buildDepartmentSourceOfTruthSnapshot`의 operational* 값**을 읽는다. 부서별로 다시 inline 계산하지 않는다.
- 부서 전용 분석값은 별도 카드/섹션 + 명확한 라벨로 분리한다(대표 운영 KPI처럼 보이게 하지 않는다).
- 같은 이름/같은 급의 KPI가 부서마다 다른 계산식·다른 기준을 쓰면 안 된다.
- 회귀 검증: `scripts/smoke-department-data-source-of-truth-v0.mjs`.

> **분리 원칙**: "Vercel Demo Gateway Adapter는 배포 entry(함수 개수) 문제이고, 데이터 기준(source of truth) 문제와 분리한다." 이 작업은 배포가 아니라 데이터 신뢰성(P0) 작업이다.
