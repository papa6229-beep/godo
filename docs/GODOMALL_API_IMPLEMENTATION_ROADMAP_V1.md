# GodoMall API Implementation Roadmap v1

> **작성일**: 2026-06-26 · 기준: `api/_shared/godomallApiRegistry.ts` + `docs/GODOMALL_OPENAPI_CAPABILITY_REGISTRY_V1.md`

고도몰5 23개 API를 READ 우선 → WRITE는 Approval 기반으로 단계 진입. 모든 WRITE는 기본 비활성(write_locked).

## Phase 0 — Full Spec Reading + Registry 구축 ✅ (이번 작업)
- 고도몰5/e나무 PDF 전 페이지 분할 독해(텍스트), 한글 폰트 미추출 한계 문서화.
- `godomallApiRegistry.ts` + 3종 문서 + smoke(13/13) 완료.
- 산출: 23 capability(+레거시 2), READ/WRITE/부서/PII/RateLimit 분류.

## Commerce Data Contract v0 ✅ (Phase 1과 병행 완료)
- `RevenueOrder` 가산 확장(memberKey·settleKind·orderChannel·claimSummary·isFirstPurchase·dataKind·syntheticSource) — 하위호환.
- synthetic 기본 경로 **legacy→godoRaw 전환**(real과 동일 mapper 통로). legacy는 `?syntheticSource=legacy` 유지.
- memberKey 가명화(real=해시/synthetic=syn_member_*), PII 미노출, claimData 축약(claimSummary).
- CS Contact Contract 타입 초안(`commerceContactContract.ts`) + fake PII 정책. `docs/COMMERCE_DATA_CONTRACT_V0.md`. (라이브 검증: 기본 godoRaw 480건·memberKey 350)
- 다음: Synthetic Commerce Universe v1(1년치 주문/고객/리뷰/문의/fake PII).

## Synthetic Commerce Universe v1 ✅ (Phase 1 데이터 기반 완료)
- `syntheticCommerceUniverse.ts`: 1년치 고객(320)/주문(~800)/리뷰/문의/CS contact(fake PII) 일관 생성(결정적, godoRaw 흐름 → RevenueOrder+Contract v0).
- `syntheticCommerceFacts.ts`: 재구매율·객단가·결제수단/채널 분포·취소/환불/반품/교환율·카테고리/브랜드 매출·리뷰 평점·CS 이슈 facts(PII 없음, 숫자는 helper 계산).
- Analytics(가명 memberKey)/CS Contact(fake PII) 분리, fake PII 표식 부착. `docs/SYNTHETIC_COMMERCE_UNIVERSE_V1.md`. smoke 26/26.
- 기존 syntheticRevenue/godoRaw/Contract 무영향, route/UI 미변경(다음: Facts Routing/Board READ).

## Synthetic Commerce Universe Activation v0 ✅
- orders-revenue 기본 synthetic source를 godoRaw → **commerce_universe_v1**로 승격(`pickSyntheticSource`). legacy/godoRaw는 명시 옵션 유지.
- 상품팀 대시보드/채팅이 Universe ~826건 기준으로 자동 계산(대시보드 로직 무변경). PII는 contacts에만, orders-revenue엔 없음.
- 라이브 검증: 기본 826 / godoRaw 480 / legacy 240. `docs/SYNTHETIC_COMMERCE_UNIVERSE_ACTIVATION_V0.md`. smoke 10/10.
- 다음: Department Facts Routing v0(customers/reviews/inquiries/CS facts를 부서 채팅에 연결).

## Analytics Query Engine v0 ✅
- `src/services/analyticsQueryEngine.ts`: 61-metric registry + QuerySpec + `runAnalyticsQuery(dataset, spec)` (기간필터/groupBy/compareTo/supportLevel/chartHint, PII 제외). Tier1/2 실계산, Tier3 requires_external_data.
- `RevenueOrderLite`에 Contract v0 분석필드(memberKey/paymentMethodCode/orderChannel/claim) 가산(프론트 엔진 주입 준비). `docs/ANALYTICS_QUERY_ENGINE_V0.md`. smoke 25/25.
- 채팅 연결은 Department Facts Routing v0로 보류(모듈 해상도 + 데이터흐름 정리).

## Product Team Chat Data Grounding Fix v0 ✅
- 상품팀 채팅 facts가 대시보드와 같은 Universe revenue 기준으로 기간을 해석하도록 수정. 신규 `monthly_range` intent + `parseRequestedMonthRange`(YYYY년 M월~M월, 최근 N개월) + availableMonthRange 기반 "데이터 없음" 판단. `docs/PRODUCT_TEAM_CHAT_DATA_GROUNDING_FIX_V0.md`. smoke 13/13. (UI/소스 무변경)

## Product Dashboard Trend Chart Fix v0 ✅
- 매출추이 버킷을 선택 기간(effStart~effEnd) 연속 생성으로 수정(`productDashboardTrendBuckets.ts`) — 빈 구간 0 채움, 기간 밖 제외, x축 라벨 정책(month≤18 전부). KPI "가상 현재 재고"→"재고 위험 상품". `docs/PRODUCT_DASHBOARD_TREND_CHART_FIX_V0.md`. smoke 10/10. (UI 차트 로직만, 데이터 소스 무변경)

## Phase 1 — READ API 안정화 (진행/직후)
- **order_search**: edge case 잠그기(claimData/multi-shipping/partial cancel/return/exchange). 테스트몰 다양한 주문 생성 후 `order-search-raw-audit` 재실행.
- **goods_search**: 100개 초과 페이징 보강(현재 size=100 단일).
- 0건/에러 응답 가드(완료) 회귀 유지.

## Phase 2 — 공통코드 / 카테고리 / 브랜드 READ
- **code_search**(p1, 우선) ✅ **v0 완료** — `code_type` 13종 동적 조회(real bridge `codes.ts`/`godomallCodes.ts`, 라이브 검증). `docs/GODOMALL_CODE_SEARCH_READ_V0.md`. 다음: 정적 enum과 비교·병합.
- **category_search**(p1) ✅ **v0 완료** + **brand_search**(p2) ✅ **v0 완료** — Catalog Taxonomy READ(게이트웨이 `?capability=category_search`/`brand_search`, `godomallCatalog.ts`, 라이브 검증). `docs/GODOMALL_CATALOG_TAXONOMY_READ_V0.md`.
- **Catalog Taxonomy Binding** ✅ **v0 완료** — `godomallCatalogBinding.ts`(코드→라벨 해석, 매출 카테고리/브랜드 분해, taxonomy facts) + `StandardProduct.brandCode` 가산 + productTeamChatFacts catalog 옵션. `docs/GODOMALL_CATALOG_TAXONOMY_BINDING_V0.md`.
- **Product Team Catalog Facts Wiring** ✅ **v0 완료** — `departmentDataService.fetchCatalog()`(게이트웨이 병렬 fetch) → `DepartmentWorkspacePanel` → `buildProductTeamChatFacts` catalog 전달. 상품팀 채팅 카테고리 한글 라벨 실사용. `docs/PRODUCT_TEAM_CATALOG_FACTS_WIRING_V0.md`.
- **goods_add_search**(p2) 필요 시.

## Phase 3 — CS / 게시판 READ
- **board_inventory**(게시판 목록) → **board_list**(bdId=goodsqa/goodsreview) READ v0.
- PII high → 서버 마스킹 경유, 프론트 직접 호출 금지.
- csTeamChatFacts / reviewTeamChatFacts 데이터 소스 연결(상품팀 facts 패턴 재사용).

## Phase 4 — 문의/후기 답변 초안 생성
- board_list 데이터 + 페르소나로 CS/리뷰 **답변 초안만** 생성(실행 없음).
- 초안 → Approval Queue 적재.

## Phase 5 — Approval Queue 기반 WRITE 준비
- WRITE capability(board_reply/order_status/goods_soldout_status 등)를 Approval Queue에 연결하는 **설계/큐**만 준비(실행 비활성).
- requiresApproval=true 게이트, 사람 승인 후에만 다음 단계.

## Phase 6 — WRITE API 실제 실행 (기본 비활성)
- 순서: ① goods_soldout_status/goods_stock(상품팀, 저위험) → ② board_reply(CS 답변) → ③ order_status(주문/환불, 고PII·고위험).
- 각 WRITE는 Approval 승인 + Secure Proxy 경유. 기본 OFF, 명시적 활성화 필요.
- 환불계좌 등 고PII는 마스킹/감사 로그 필수.

## 비고
- 전 구간 READ-only 우선, WRITE는 Human-in-the-loop. 키는 서버 환경변수 전용.
- Rate Limit: Sync All 계열 throttle은 Phase 1~2 사이 도입 검토(`ratelimit-available-level` 관찰).
- **Route budget(중요)**: Vercel Hobby 함수 12개 한도 도달. 모든 고도몰 READ는 **통합 게이트웨이 `api/godomall/read.ts?capability=<id>`**로 확장(파일 수 고정). 새 READ는 route 파일이 아니라 게이트웨이 핸들러로 추가. WRITE route는 Approval Runtime 전까지 금지. 상세: `docs/GODOMALL_ROUTE_BUDGET_POLICY_V1.md`.
