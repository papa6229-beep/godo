# GodoMall API Implementation Roadmap v1

> **작성일**: 2026-06-26 · 기준: `api/_shared/godomallApiRegistry.ts` + `docs/GODOMALL_OPENAPI_CAPABILITY_REGISTRY_V1.md`

고도몰5 23개 API를 READ 우선 → WRITE는 Approval 기반으로 단계 진입. 모든 WRITE는 기본 비활성(write_locked).

## Phase 0 — Full Spec Reading + Registry 구축 ✅ (이번 작업)
- 고도몰5/e나무 PDF 전 페이지 분할 독해(텍스트), 한글 폰트 미추출 한계 문서화.
- `godomallApiRegistry.ts` + 3종 문서 + smoke(13/13) 완료.
- 산출: 23 capability(+레거시 2), READ/WRITE/부서/PII/RateLimit 분류.

## Phase 1 — READ API 안정화 (진행/직후)
- **order_search**: edge case 잠그기(claimData/multi-shipping/partial cancel/return/exchange). 테스트몰 다양한 주문 생성 후 `order-search-raw-audit` 재실행.
- **goods_search**: 100개 초과 페이징 보강(현재 size=100 단일).
- 0건/에러 응답 가드(완료) 회귀 유지.

## Phase 2 — 공통코드 / 카테고리 / 브랜드 READ
- **code_search**(p1, 우선) ✅ **v0 완료** — `code_type` 13종 동적 조회(real bridge `codes.ts`/`godomallCodes.ts`, 라이브 검증). `docs/GODOMALL_CODE_SEARCH_READ_V0.md`. 다음: 정적 enum과 비교·병합.
- **category_search**(p1) ✅ **v0 완료** + **brand_search**(p2) ✅ **v0 완료** — Catalog Taxonomy READ(게이트웨이 `?capability=category_search`/`brand_search`, `godomallCatalog.ts`, 라이브 검증). `docs/GODOMALL_CATALOG_TAXONOMY_READ_V0.md`.
- **Catalog Taxonomy Binding** ✅ **v0 완료** — `godomallCatalogBinding.ts`(코드→라벨 해석, 매출 카테고리/브랜드 분해, taxonomy facts) + `StandardProduct.brandCode` 가산 + productTeamChatFacts catalog 옵션. `docs/GODOMALL_CATALOG_TAXONOMY_BINDING_V0.md`. 다음: 프론트 facts wiring(카테고리 한글 라벨 실노출).
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
