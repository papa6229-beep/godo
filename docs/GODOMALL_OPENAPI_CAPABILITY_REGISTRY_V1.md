# GodoMall OpenAPI Capability Registry v1

> **작성일**: 2026-06-26 · **코드**: `api/_shared/godomallApiRegistry.ts` · **smoke**: `scripts/smoke-godomall-api-registry.mjs`

## 1. 목적
고도몰5 Open API 전체를 GODO AI OS 내부 정적 지도(Capability Registry)로 구조화한다. "무엇을 호출할 수 있고 / 무엇이 구현됐고 / 어느 부서가 쓰고 / READ·WRITE / PII·Rate Limit 위험도 / 다음 액션"의 단일 진실. 실제 호출·실행 로직은 포함하지 않는다(WRITE route 미생성).

## 2. 기준 문서
- 기준: `godomall5_openAPI_spec_v1.0_20250616` (PDF, 91p)
- 참고: `enamoo_openAPI_spec_v1.0_20221231` (PDF, 146p) — 충돌 시 고도몰5 우선
- 독해 상세 + 한글 폰트 미추출 한계: `docs/GODOMALL_OPENAPI_FULL_SPEC_READING_LOG_V1.md`

## 3. PDF 전체 독해 방식
`pdftotext`로 전 페이지 텍스트 추출 → 분할 독해(영문 구조 100%, 한글 CID 폰트 미추출 → 엔드포인트 의미·기존 구현·확정 코드표로 한글명 확정). PDF 원본은 `docs/*.pdf` gitignore.

## 4. 고도몰5 API 전체 목록 (23개 + 레거시참고 2)

### 상품 (product) — 10
| id | API | endpoint | R/W | status | 부서 | PII | P |
|---|---|---|---|---|---|---|---|
| goods_search | 상품조회 | /goods/Goods_Search.php | R | **done** | product/marketing/stock | low | p0 |
| category_search | 카테고리조회 | /goods/Category_Search.php | R | not_started | product/marketing | none | p1 |
| brand_search | 브랜드조회 | /goods/Brand_Search.php | R | not_started | product/marketing | none | p2 |
| goods_add_search | 추가상품조회 | /goods/Goods_Add_Search.php | R | not_started | product | low | p2 |
| goods_stock | 재고변경 | /goods/Goods_Stock.php | W | write_locked | product/stock | none | p2 |
| goods_soldout_status | 품절상태변경 | /goods/Goods_Soldout_Status.php | W | write_locked | product/stock | none | p2 |
| goods_insert | 상품등록 | /goods/Goods_Insert.php | W | write_locked | product | low | p3 |
| goods_update | 상품수정 | /goods/Goods_Update.php | W | write_locked | product | low | p3 |
| goods_delete | 상품삭제 | /goods/Goods_Delete.php | W | write_locked | product | none | p3 |
| goods_totally_delete | 상품완전삭제 | /goods/Goods_Totally_Delete.php | W | write_locked | product | none | p3 |

### 주문 (order) — 2
| id | API | endpoint | R/W | status | 부서 | PII | P |
|---|---|---|---|---|---|---|---|
| order_search | 주문조회 | /order/Order_Search.php | R | **partial** | order/delivery/finance/marketing | **high** | p0 |
| order_status | 주문상태변경 | /order/Order_Status.php | W | write_locked | order/delivery/cs/finance | **high** | p1 |

### 게시판 (board) — CS/리뷰 — 10
| id | API | endpoint | R/W | status | 부서 | PII | P |
|---|---|---|---|---|---|---|---|
| board_inventory | 게시판 목록조회 | /board/Board_Inventory.php | R | not_started | cs/review | none | p1 |
| board_list | 게시물 목록조회 | /board/Board_List.php | R | not_started | cs/review/marketing | **high** | p1 |
| board_reply | 게시물 답변 등록 | /board/Board_Reply.php | W | write_locked | cs/review | medium | p2 |
| board_write | 게시물 등록 | /board/Board_Write.php | W | write_locked | cs | medium | p3 |
| board_update | 게시물 수정 | /board/Board_Update.php | W | write_locked | cs | medium | p3 |
| board_delete | 게시물 삭제 | /board/Board_Delete.php | W | write_locked | cs | none | p3 |
| memo_write | 댓글 등록 | /board/Memo_Write.php | W | write_locked | cs | medium | p3 |
| memo_update | 댓글 수정 | /board/Memo_Update.php | W | write_locked | cs | medium | p3 |
| memo_delete | 댓글 삭제 | /board/Memo_Delete.php | W | write_locked | cs | none | p3 |
| memo_reply | 댓글의 댓글등록 | /board/Memo_Reply.php | W | write_locked | cs | medium | p3 |

### 공통 (common) — 1
| id | API | endpoint | R/W | status | 부서 | PII | P |
|---|---|---|---|---|---|---|---|
| code_search | 공통코드조회 | /common/Code_Search.php | R | not_started | hq/product/order/delivery | none | p1 |

## 5. e나무 참고 여부 (legacy_reference)
- `legacy_goods_qna_search` (Goods_Qna_Search) → **고도몰5 board_list(bdId=goodsqa)로 대체**. reference_only.
- `legacy_goods_review_search` (Goods_Review_Search) → **board_list(bdId=goodsreview)로 대체**. reference_only.
- 그 외 enamoo 전용(Key_Check/Provider_List/Order_Status_Checkout 등)은 현 단계 제외.

## 6. READ / WRITE 분류
- **READ(7)**: goods_search·category_search·brand_search·goods_add_search·order_search·board_inventory·board_list·code_search. (조회/리스트/코드)
- **WRITE(15)**: 모든 등록/수정/삭제/답변/댓글/재고변경/품절변경/주문상태변경.
- **WRITE 공통 속성**: `accessMode:'write'` + `implementationStatus:'write_locked'` + `requiresApproval:true` + `writeLocked:true`. **실행 route 미생성**(이번 작업 범위 아님).

## 7. 구현 상태
- **done**: goods_search.
- **partial**: order_search (core READ + RevenueOrder + raw audit + empty guard 완료 / edge: claimData·multi-shipping·partial cancel·return·exchange pending).
- **not_started(READ)**: category_search·brand_search·goods_add_search·board_inventory·board_list·code_search.
- **write_locked**: 15개 WRITE.
- **reference_only**: 2개 레거시.

## 8. 부서별 매핑
- **상품관리팀(product)**: goods_search(done)·category_search·brand_search·goods_add_search·goods_stock(WL)·goods_soldout_status(WL).
- **주문/배송팀(order/delivery)**: order_search(partial)·order_status(WL).
- **CS팀(cs)**: board_inventory·board_list(READ)·board_reply·memo_*(WL+approval).
- **리뷰팀(review)**: board_list(goodsreview)·board_reply(WL).
- **마케팅팀(marketing)**: goods_search·order_search·board_list **READ 분석만**(직접 WRITE 없음).
- **재고/정산(stock/finance)**: goods_stock(WL)·order_search 기반 매출/배송/취소/환불 분석.
- **총괄(hq)**: code_search + 전체 capability 상태/권한/위험도 관리.

## 9. PII / 승인 위험도
- **high**: order_search(주문자/수취인/연락처/주소), order_status(환불계좌), board_list(작성자 연락처). → 모두 **프론트 직접 호출 금지**(notes 명시), 서버 route + 마스킹 경유.
- **medium**: 게시물/댓글 내용 계열(board_write/update/reply, memo_*).
- **none/low**: 코드·카테고리·브랜드·상품 공개정보·재고.
- WRITE는 전부 `requiresApproval:true`.

## 10. Rate Limit 정책
- 고도몰5: `429 Too Many Requests` + 응답 헤더 `ratelimit-available-level`(EXHAUSTED 시 429). 모든 capability `rateLimitSensitive:true`.
- 정책(문서화만, 이번엔 throttle 미구현): ① 모든 호출 서버 route ② Sync All 계열 추후 throttle ③ 429 시 재시도 폭주 금지 ④ ratelimit 헤더 관찰 가능하게 설계.

## 11. 현재 완료된 API
- **상품조회(goods_search)**: `api/godomall/products.ts` + `godomallMapper.ts`(mapGoodsToProducts) + `godomallResource.ts`.
- **주문조회(order_search)**: `orders-revenue.ts`/`orders-admin.ts`/`order-search-raw-audit.ts` + `godomallRevenue.ts`/`godomallOrderTypes.ts`/`godomallOrderCodes.ts`/`godomallOrderNormalize.ts`/`syntheticGodomallOrders.ts`/`orderRawAudit.ts`.

## 12. 다음 구현 후보
1. **code_search**(p1) — 코드 동적 동기화(하드코딩 제거).
2. **category_search**(p1) — RevenueOrder 카테고리 한글 라벨.
3. **board_list**(p1) — CS/리뷰 READ v0 → csTeamChatFacts/reviewTeamChatFacts.
4. order_search edge cases 잠그기.

## 13. 금지 원칙
PDF 일부만 읽고 전체 보고 금지 / e나무 우선 적용 금지 / 기존 Products·Order_Search 재구현 금지 / WRITE 실행 route 추가 금지 / API key·raw XML/JSON 전문·PII 원문 출력 금지 / ProductTeamDashboard·productTeamChatFacts·syntheticRevenue·mockProxyData 변경/삭제 금지 / `git add .`로 PDF 커밋 금지.
