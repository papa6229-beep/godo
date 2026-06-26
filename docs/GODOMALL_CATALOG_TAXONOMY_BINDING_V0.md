# GodoMall Catalog Taxonomy Binding v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/godomall-catalog-taxonomy-binding-v0`
> **코드**: `api/_shared/godomallCatalogBinding.ts` · **smoke**: `scripts/smoke-godomall-catalog-binding.mjs`(19/19)

## 1. 작업 목적
이미 READ로 붙인 카테고리/브랜드 taxonomy(`category_search`/`brand_search`)를 **상품·매출·facts에 연결**한다. 즉 `cateCd`/`brandCd` 코드를 사람이 읽는 라벨(`오나홀`/`스마트홈`)로 해석하고, 라벨이 없으면 코드를 유지·unresolved를 명확히 표시한다. 새 API/route 추가 없음.

## 2. 현재 taxonomy READ 상태
- `category_search`(9건, cateCd/cateNm)·`brand_search`(2건, brandCd/brandNm) — 게이트웨이 READ 완료(`docs/GODOMALL_CATALOG_TAXONOMY_READ_V0.md`).
- 본 작업은 그 데이터를 lookup으로 만들어 분석에 조인.

## 3. 구현 (binding 규칙)
### 3-1. 실제 타입 기준(추측 금지)
- `StandardProduct`(godomallMapper): `categoryCode`(cateCd)·`allCategoryCode`(allCateCd) 존재. **`brandCode`(brandCd) 신규 추가**(Goods_Search 실응답에 brandCd 존재 → 가산 매핑).
- `RevenueOrderLine`(godomallRevenue): `categoryCode`/`allCategoryCode`/`categoryLabel`(현재 코드값)/`goodsNo` 존재. **brand 필드 없음** → 매출 브랜드 분해는 `goodsNo→상품.brandCode` 역참조로 처리(RevenueOrder 미변경).

### 3-2. 핵심 함수 (`godomallCatalogBinding.ts`, 순수)
- `buildCatalogLookup(categories, brands)` → `{categoriesByCode, brandsByCode}`
- `resolveCategoryLabel(code, lookup)` / `resolveBrandLabel(code, lookup)` → `CatalogLabelResolution`
- `pickPrimaryCategoryCode(categoryCode, allCategoryCode)` — 대표코드 선택(categoryCode 우선 → allCateCd 마지막 depth)
- `attachProductCatalogLabels(product, lookup)` → `{category, brand}` 라벨
- `buildBrandByProductId(products)` → `goodsNo→brandCd` 맵
- `deriveRevenueCatalogBreakdown(orders, lookup, brandByProductId?)` → `{byCategory, byBrand, unresolved}` (summarizeRevenue **미변경**, 별도 derived)
- `deriveCatalogTaxonomyFacts(products, lookup)` → 카운트·해석률·unresolved

## 4. label resolution 정책
| 상황 | resolved | source | label |
|---|---|---|---|
| 코드가 taxonomy에 있고 라벨 존재 | true | `category_search`/`brand_search` | 실제 한글명 |
| 코드는 있으나 taxonomy에 없음 | false | `fallback` | 코드 유지 |
| 코드 자체 없음(빈값/`uncategorized`/`unknown_product`) | false | `missing` | (없음) |

## 5. unresolved 처리 원칙
- 라벨을 확정 못 하면 **억지로 만들지 않는다**. 코드를 유지(`fallback`)하거나 `missing` 표시.
- 매출 분해/그리고 facts는 `unresolved.categoryCodes`/`brandCodes`를 따로 모아 노출 → "unknown category 999"처럼 솔직히 표시.

## 6. productTeamChatFacts 확장 (`src/services/productTeamChatFacts.ts`)
- **하위호환**: 선택적 3번째 인자 `catalog?: ProductTeamCatalogLookup` 추가. 기존 단일 호출부(`DepartmentWorkspacePanel`, 2인자)는 그대로 동작(카탈로그 미전달 → 기존 행동 동일).
- catalog 전달 시:
  - 카테고리 비중 집계가 `cateCd→cateNm` 한글 라벨 우선 사용(예: `003 매출` → `오나홀 카테고리 매출`). 미해석 코드는 기존 categoryLabel(코드) 유지.
  - 신규 intent `catalog_taxonomy`(브랜드/분류축/카탈로그/카테고리수 질문): `categoryCount`/`brandCount`/라인 카테고리 해석률/미해석 코드 facts.
- **기존 facts 무변경**: 월매출/추이/상품랭킹/재고/total 계산 로직 그대로. 경계상 src는 api/_shared를 import하지 않으므로 프론트는 자체 경량 lookup 타입 사용(서버 canonical은 godomallCatalogBinding).
- **주의**: 프론트가 catalog를 실제로 채우려면 `/api/godomall/read?capability=category_search`를 fetch해 전달해야 한다(다음 단계 — 본 v0는 facts에 capability만 추가, UI 데이터 흐름 미변경).

## 7. Revenue 분석 확장
`deriveRevenueCatalogBreakdown(orders, lookup, brandByProductId)`:
```
byCategory: [{ code:'003', label:'오나홀', resolved:true, revenue, orderCount, lineCount, units }]
byBrand:    [{ code:'001', label:'스마트홈', resolved:true, revenue, orderCount, ... }]
unresolved: { categoryCodes:['999'], brandCodes:[] }
```
- 카테고리: 라인 `categoryCode`(없으면 allCateCd 마지막 depth)로 합산.
- 브랜드: 라인엔 brand 없음 → `goodsNo→상품.brandCode` 역참조(`brandByProductId`).

## 8. Synthetic Commerce Universe v1과의 연결
- 본 바인딩은 카테고리별 매출·브랜드별 성과·상품군별 환불률·리뷰 만족도 등을 만들기 위한 **분류축 해석 기반**이다.
- Synthetic Commerce Universe v1에서 합성 주문에 `brandCode`/다양한 `cateCd`를 부여하면, 동일 `deriveRevenueCatalogBreakdown`으로 카테고리·브랜드 분석이 즉시 가능.

## 9. 기존 기능 영향 (전부 무변경)
Products READ route / Orders READ route / orders-revenue 응답 필드명 / RevenueOrder 필드명 / ProductTeamDashboard props / syntheticRevenue / syntheticGodomallOrders / mockProxyData — **변경/삭제 없음**. 새 route 파일 없음(함수 12개 유지). 유일한 가산: `StandardProduct.brandCode`(신규 필드), `buildProductTeamChatFacts` 선택 파라미터.

## 10. 남은 이슈 / 다음
- **프론트 wiring**: departmentDataService가 category/brand를 fetch해 `catalog`를 facts에 전달(상품팀 채팅에서 카테고리 한글 라벨·브랜드 facts 실사용).
- **카테고리 계층 트리**: 현재 평면 + 마지막-depth. 부모-자식 트리 필요 시 allCateCd 파싱 확장.
- **브랜드 라인 매출**: 합성/실주문 상품에 brandCode 채워지면 byBrand 정밀도 향상.
- 다음: RevenueOrder 카테고리 한글화를 orders-revenue 또는 facts wiring으로 실제 노출.
