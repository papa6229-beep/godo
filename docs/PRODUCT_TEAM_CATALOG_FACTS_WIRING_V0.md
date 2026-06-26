# Product Team Catalog Facts Wiring v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/product-team-catalog-facts-wiring-v0`
> **smoke**: `scripts/smoke-product-team-catalog-facts.mjs`(14/14)

## 1. 작업 목적
상품관리팀 채팅이 카테고리/브랜드 코드를 **한글 라벨**로 해석하도록, 프론트에서 `category_search`/`brand_search`를 fetch해 `buildProductTeamChatFacts`에 catalog로 전달한다. 해석 불가 시 코드를 유지(`unknown category 003`)한다.

## 2. 선행 상태
- **Catalog READ v0**: 게이트웨이 `?capability=category_search`/`brand_search` 라이브(카테고리 9·브랜드 2).
- **Catalog Binding v0**: `godomallCatalogBinding.ts`(서버) + `productTeamChatFacts`에 catalog optional param 이미 존재.
- **남았던 것**: 프론트 fetch→facts 전달 wiring. ← 이번 작업.

## 3. 프론트 fetch 흐름
- `src/services/departmentDataService.ts`: **`fetchCatalog()`** 신규.
  - `/api/godomall/read?capability=category_search` + `brand_search`를 **병렬 fetch**.
  - 응답 `items`를 `{categoriesByCode:{[cateCd]:{cateCd,cateNm}}, brandsByCode:{[brandCd]:{brandCd,brandNm}}}` lookup으로 변환.
  - `source`(real/mock/unavailable)·`categoryCount`·`brandCount` 포함.
- `src/components/DepartmentWorkspacePanel.tsx`:
  - `productData` state에 `catalog` 추가.
  - `loadProductTeamData`에서 `fetchAdminProducts()`/`fetchRevenue(true)`/**`fetchCatalog()`**를 **`Promise.all` 병렬** 로드.
  - `handleSend`에서 `buildProductTeamChatFacts(text, productData.revenue, productData.catalog ?? undefined)`.

## 4. fallback 정책
- `fetchCatalog` 실패/네트워크 오류 → **빈 lookup**(`source:'unavailable'`) 반환. 예외를 던지지 않음.
- catalog가 비었거나 null → `buildProductTeamChatFacts`는 **기존 동작 그대로**(코드 라벨 유지). 상품팀 채팅이 절대 깨지지 않음.
- catalog와 products/revenue는 병렬 — catalog 지연/실패가 매출 데이터 로드를 막지 않음.

## 5. productTeamChatFacts 연결 방식
- catalog 있으면:
  - 카테고리 비중 집계가 `cateCd→cateNm` 한글 라벨 우선(미해석은 코드 유지).
  - `브랜드`/`분류축`/`카탈로그`/`카테고리수` 질문 → `catalog_taxonomy` intent(카테고리/브랜드 수, 라인 해석률, 미해석 코드).
- catalog 없으면: 기존 facts(월매출/추이/상품랭킹/재고/총매출/데이터한계) 전부 불변.
- 경계: `src`는 `api/_shared`를 import하지 않음 → 프론트는 자체 lookup 타입(`ProductTeamCatalogLookup`)·경량 해석 사용. 서버 canonical은 `godomallCatalogBinding.ts`.

## 6. 검증 문장 예시 (상품팀 채팅)
| 질문 | 기대 |
|---|---|
| 카테고리별 매출 알려줘 | catalog 있으면 `오나홀`/`신상품` 등 한글 라벨, 미해석은 `unknown` |
| 브랜드별 성과 알려줘 | `catalog_taxonomy` — 카테고리 N종·브랜드 M종·라인 해석률 |
| 상품군별로 뭐가 잘 팔려? | 카테고리 라벨 기반 비중 |
| 카테고리 해석 안 된 상품 있어? | `unknown category <코드>` 목록 |
| (월별 추이/순위/재고/재구매) | 기존 facts 그대로 — 영향 없음 |

## 7. UI 영향
- 변경: 상품팀 채팅 답변에 카테고리 한글 라벨이 (catalog 로드 시) 반영되는 정도. `productData` state에 catalog 필드 추가.
- 변경 안 함: Dashboard layout/chart 구조/ProductTeamDashboard props/새 패널 — 없음.

## 8. 기존 기능 영향 (무변경)
Products READ route / Orders READ route / orders-revenue 응답 필드명 / RevenueOrder 필드명 / ProductTeamDashboard props / syntheticRevenue / syntheticGodomallOrders / mockProxyData / 새 route — **변경·삭제·추가 없음**(함수 12개 유지).

## 9. 남은 이슈 / 다음
- catalog `source` 표시: 현재 facts에 catalog source(real/mock)를 명시적으로 싣지 않음 — 필요 시 facts metadata에 추가.
- 브랜드 라인 매출: 라인에 brand 없음 → 상품 brandCode 연결(orders-revenue가 productId→brandCode 노출) 시 byBrand 정밀.
- 카테고리 트리(부모-자식): 현재 평면/마지막-depth.
- 다음: CS/리뷰(board_list) READ → 부서 facts 확장, 또는 Synthetic Commerce Universe로 카테고리/브랜드 매출 다양화.
