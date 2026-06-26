# GodoMall Catalog Taxonomy READ v0 (Category + Brand)

> **작성일**: 2026-06-26 · **브랜치**: `feature/godomall-catalog-taxonomy-read-v0`
> **코드**: `api/godomall/read.ts`(게이트웨이 핸들러) + `api/_shared/godomallCatalog.ts` · **smoke**: `scripts/smoke-godomall-catalog.mjs`

## 1. 목적
상품 세계의 **분류축(카테고리·브랜드)**을 READ로 붙인다. 이후 상품관리팀/마케팅팀 분석(카테고리별 매출·브랜드별 성과 등)의 기준축이 된다. 큰 Facts Layer 이전, 가장 안전하고 작은 선행 기반.

- 통합 READ 게이트웨이(`read.ts?capability=...`)에 핸들러만 추가 → **함수 수 12 고정**(route 파일 미추가).

## 2. Endpoint / 호출
| capability | 고도몰 endpoint | 프론트 호출 |
|---|---|---|
| category_search | `POST /goods/Category_Search.php` | `GET /api/godomall/read?capability=category_search[&cateCd=NNN]` |
| brand_search | `POST /goods/Brand_Search.php` | `GET /api/godomall/read?capability=brand_search[&cateCd=NNN]` |

- 키는 서버 환경변수 전용. 정규화 결과만 반환(raw XML/키 미반환). PII none.

## 3. normalize 규칙 (`godomallCatalog.ts`)
- **카테고리**: `cateCd`(code) / `cateNm`(label) / `cateDisplayFl`→`displayPc` / `cateDisplayMobileFl`→`displayMobile`.
- **브랜드**: `brandCd`(code) / `brandNm`(label).
- 정확 필드 → 후보 → 접미사(`*Cd/*No`→code, `*Nm/*Name`→label) **3단 fallback**으로 견고화(필드명 흔들림·레이아웃 bleed 대비).
- 단건 object / 배열 / 빈값(`''`/null/`{}`/`[]`) 처리. code·label 둘 다 없는 항목 제외(빈 응답/래퍼 guard).
- 표준형: 카테고리 `{cateCd, cateNm?, displayPc?, displayMobile?}`, 브랜드 `{brandCd, brandNm?}`.

## 4. 라이브 실측 (2026-06-26, Production 테스트몰)
- **category_search**: `total=9`, 실 필드 `cateCd/cateNm/cateDisplayFl/cateDisplayMobileFl` — PDF §3.2 일치.
  - 예: `001`→신상품, `002`→베스트, `003`→오나홀, `004`→개인가전.
- **brand_search**: `total=2`, 실 필드 **`brandCd/brandNm`** — PDF 텍스트 추출(§3.3)이 §3.2와 레이아웃 bleed돼 불확실했으나, **실응답으로 brandCd/brandNm 확정**(추측 아님).
  - 예: `001`→스마트홈, `002`→리빙홈.
- 게이트웨이 분기 확인: `category_search`/`brand_search` 200 real, `board_list` 501, WRITE 403(불변).

## 5. Registry 반영
- `category_search`: `not_started` → **`partial`**, currentRoutes `read.ts?capability=category_search`, currentSharedFiles `godomallCatalog.ts`.
- `brand_search`: `not_started` → **`partial`**, currentRoutes `read.ts?capability=brand_search`, currentSharedFiles `godomallCatalog.ts`.

## 6. 기존 기능 영향
- Products READ / Orders READ / orders-revenue / ProductTeamDashboard / productTeamChatFacts / syntheticRevenue / syntheticGodomallOrders / mockProxyData — **전부 무변경**. 게이트웨이 핸들러 2개 + mapper 1개 추가만.

## 7. 남은 이슈 / 다음
- 카테고리 계층(부모-자식): 현재 평면 리스트. `cateCd=상위코드`로 하위 조회 가능(파라미터 지원). 트리 구성은 필요 시 다음.
- **다음 활용** ✅ **Binding v0 완료**: `cateCd→cateNm` 라벨 조인 + `goodsNo→brandCd` 역참조 매출 분해를 `api/_shared/godomallCatalogBinding.ts`로 구현(`docs/GODOMALL_CATALOG_TAXONOMY_BINDING_V0.md`). 다음: 프론트 facts wiring(departmentDataService가 catalog fetch→전달).
- 본 작업은 분류축 READ만. 카테고리별 매출/브랜드별 재구매율 등 facts는 후속(Synthetic Commerce Universe / 마케팅 facts 단계).
