# Synthetic Commerce Universe Activation v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/synthetic-commerce-universe-activation-v0`
> **smoke**: `scripts/smoke-synthetic-commerce-universe-activation.mjs`(10/10)

## 1. 작업 목적
오늘 만든 **Synthetic Commerce Universe v1**을 화면/채팅의 **기본 가상 데이터**로 승격한다. 상품팀 대시보드가 구 synthetic(godoRaw ~480 / legacy 240)이 아니라 **Universe(~826건)** 기준으로 계산되게 한다. 새 가상 데이터 생성이 아니라 **기본 source 전환**.

## 2. 왜 Universe를 기본으로 승격했나
Universe는 고객(320)·재구매·리뷰·문의·CS contact까지 엮인 일관 세계이고, 주문은 godoRaw 흐름(`mapOrdersToRevenue`)을 타 RevenueOrder 계약을 그대로 지킨다. 따라서 대시보드/facts 코드를 바꾸지 않고 **기본 source만 바꿔** 운영 시뮬레이션 데이터를 살릴 수 있다.

## 3. 기존 legacy/godoRaw의 남은 역할
| source | 역할 | 트리거 |
|---|---|---|
| `commerce_universe_v1` | **기본** — 운영 시뮬레이션 메인 데이터 | 미지정(기본) |
| `godoRaw` | raw mapper/Order_Search 통로 검증용 | `?syntheticSource=godoRaw` |
| `legacy` | 과거 비교/후퇴용 | `?syntheticSource=legacy` |
- `syntheticRevenue.ts`(legacy)·`syntheticGodomallOrders.ts`(godoRaw)·`syntheticCommerceUniverse.ts` **전부 삭제 안 함**.

## 4. orders-revenue source 정책
```
GET /api/godomall/orders-revenue?includeSynthetic=true                                  → commerce_universe_v1 (기본)
GET /api/godomall/orders-revenue?includeSynthetic=true&syntheticSource=commerce_universe_v1 → Universe
GET /api/godomall/orders-revenue?includeSynthetic=true&syntheticSource=godoRaw           → godoRaw
GET /api/godomall/orders-revenue?includeSynthetic=true&syntheticSource=legacy            → legacy
```
- 구현: `godomallResource.pickSyntheticSource`(기본 commerce_universe_v1) + `resolveOrdersRevenue`가 `buildSyntheticCommerceUniverse(products).orders` 사용. 새 route 없음.
- **라이브 검증(2026-06-26 Production)**: 기본 826건(synSrc=commerce_universe_v1, memberKey 826) / godoRaw 480 / legacy 240. PII 누출 없음(전 변형).

## 5. ProductTeamDashboard 영향
- **로직 변경 없음.** `revenue.orders`가 Universe(~826)로 들어오면 KPI/매출추이/상품순위/카테고리 비중/재고영향이 기존 로직으로 자동 계산.
- summary.syntheticOrderCount가 ~826으로 자동 반영. props/chart 구조 미변경.

## 6. productTeamChatFacts 영향
- 같은 `revenue`(orders-revenue=Universe)를 사용 → 채팅 facts도 Universe ~826 기준. category/brand 라벨 유지(catalog wiring). memberKey/claimSummary 기반 분석 가능.
- 기존 intent(월매출/추이/순위/재고/카테고리/총매출/데이터한계) 무변경.
- AI 컨텍스트 노트에 가상 소스 표기 "Commerce Universe 가상 N건"(소폭).

## 7. PII 격리 원칙
- **orders-revenue 응답에 fake PII 미포함**(라이브·smoke 검증). Universe의 fake PII는 `contacts`(CS Contact 계약)에만 있고, orders-revenue는 analytics(RevenueOrder, 가명 memberKey)만 반환.
- analytics/contact 분리 유지.

## 8. 프론트 연결
- `departmentDataService.fetchRevenue(includeSynthetic=true, syntheticSource='commerce_universe_v1')` — 기본 commerce_universe_v1을 명시 요청. `RevenueResult.syntheticSource`로 배지 표기.
- `DepartmentWorkspacePanel`은 `fetchRevenue(true)` 호출(기본값 적용). source 라벨 소폭 갱신.

## 9. 다음 단계 — Department Facts Routing v0
Universe는 주문뿐 아니라 customers/reviews/inquiries/CS facts를 갖는다. 다음은 이 facts를 CS/마케팅/총괄 채팅에 라우팅(`syntheticCommerceFacts` + 부서별 facts builder)하여 Universe의 고유 자산(재구매·리뷰·문의·CS)을 실제로 활용하는 것.
