# GodoMall OpenAPI Full Spec Reading Log v1

> **작성일**: 2026-06-26
> **브랜치**: `chore/godomall-openapi-full-spec-registry-v1`

## 1. 기준 문서
- **고도몰5 PDF (기준)**: `docs/godomall5_openAPI_spec_v1.0_20250616 (2).pdf` — 91페이지
- **e나무 PDF (참고)**: `docs/enamoo_openAPI_spec_v1.0_20221231 (1).pdf` — 146페이지
- 두 PDF 모두 `.gitignore`(`docs/*.pdf`) 처리 → 커밋 비대상.

## 0. 독해 방법 & 한계 (반드시 읽을 것)
- Claude의 PDF Read 도구는 `pdftoppm`(poppler 렌더러)를 요구하나 이 환경에 없어 **시각 렌더링 불가**.
- 대신 **`pdftotext -layout`**(poppler)으로 91p/146p **전 페이지 텍스트 추출** 후 분할 독해.
- **한계(중요)**: 두 PDF 모두 한글이 **CID 임베디드 폰트**라 **한글 문자가 0자 추출**됨. 영문(엔드포인트명·필드명·코드값·URL·페이지번호·날짜)은 정상 추출.
  - → **API 한글명/필드 한글 설명은 엔드포인트 의미 + 기존 구현 + 코드표(`godomall_order_search_spec.md`)로 확정**했다(추정이 아니라 영문 구조 + 확정된 코드표 교차검증).
  - → 코드값(o1/p1/eb/shop 등)은 영문이라 정확. 코드의 한글 라벨은 기존 `godomallOrderCodes.ts` / `godomall_order_search_spec.md`에 이미 확정되어 있어 그대로 사용.

## 2. 고도몰5 PDF 독해 로그 (페이지 범위별)

### Pages 1-16 (인트로 / 인증 / 공통 응답 / 에러코드)
- AUTHORIZATION: `partner_key` + `key` 인증. 전송 `POST` + XML.
- 공통 응답 envelope: `code`(RETURN CODE) / `msg`(RETURN MESSAGE) / `total` / `max_page` / `now_page`(페이징).
- **에러/Rate Limit**: `429 Too Many Requests`. NHN API는 **`ratelimit-available-level`** 응답 헤더 제공. 값이 `EXHAUSTED`이면 이후 429 반환 → **rateLimitSensitive 설계 근거**.
- 확실치 않은 항목: 한글 에러 메시지 표(폰트로 미추출).

### Pages 17-49 (3. 상품 API)
| 섹션 | API | endpoint | 성격 | 비고 |
|---|---|---|---|---|
| 3.1 | 상품조회 | `/goods/Goods_Search.php` | READ | Request goodsNm/goodsNo/cateCd/searchDateType/page/size. **구현 done** |
| 3.2 | 카테고리조회 | `/goods/Category_Search.php` | READ | cateCd→cateNm/cateDisplayFl |
| 3.3 | 브랜드조회 | `/goods/Brand_Search.php` | READ | |
| 3.4 | 상품삭제 | `/goods/Goods_Delete.php` | WRITE | goodsNo/data_url |
| 3.5 | 재고변경 | `/goods/Goods_Stock.php` | WRITE | data_url>goodsNo/optionFl/totalStock/stockOptionData |
| 3.6 | 상품등록 | `/goods/Goods_Insert.php` | WRITE | 대형 param |
| 3.7 | 상품수정 | `/goods/Goods_Update.php` | WRITE | 대형 param |
| 3.8 | 추가상품조회 | `/goods/Goods_Add_Search.php` | READ | scmNo/addGoodsNo/goodsNm/brandCd |
| 3.9 | 상품완전삭제 | `/goods/Goods_Totally_Delete.php` | WRITE | DB 완전삭제(위험) |
| 3.10 | 품절상태변경 | `/goods/Goods_Soldout_Status.php` | WRITE | goodsNo/soldoutFl(y/n) |

### Pages 50-68 (4. 주문 API)
- 4.1 주문조회 `/order/Order_Search.php` — READ — **구현 done(+edge pending)**. 조회기간 **최대 30일**(초과 시 code 201). 상세 raw 구조는 `docs/ORDER_SEARCH_REAL_RAW_VALIDATION_V1.md` 실측 완료.
- 4.2 주문상태변경 `/order/Order_Status.php` — WRITE — orderStatus/invoiceNo/invoiceCompanySno/handleReason/refundMethod/refundBankName/refundAccountNumber/refundDepositor. 배송/취소/반품/교환/환불 처리. **환불계좌=고PII**.

### Pages 68-80 (5. 게시판 API — CS/리뷰)
- 5.1 게시판 목록조회 `/board/Board_Inventory.php` — READ — bdId/bdNm/bdKind(default/gallery/event/qa=1:1)/bdSecretFl/bdReplyFl.
- 5.2 게시물 목록조회 `/board/Board_List.php` — READ — Request bdId/dateType/startDate/endDate/searchField/searchWord/page/size. **bdId=goodsqa(상품문의)/goodsreview(상품후기)**. Response writerNm/writerMobile/writerEmail/subject/content/isSecret/replyData/memoData. **PII high(작성자 연락처)**.
- 5.3~5.10 게시물 등록/수정/삭제/답변 + 댓글 등록/수정/삭제/댓글의댓글 (`Board_Write/Update/Delete/Reply`, `Memo_Write/Update/Delete/Reply`) — 전부 WRITE.

### Pages 81 (6. 공통 API)
- 6.1 공통코드조회 `/common/Code_Search.php` — READ — Request code_type/scmNo.

### Pages 82-91 (7. 코드정보)
- 7.1 **주문상태코드** o1~z5 (+ data_url 적용 가능 컬럼). 기존 `godomallOrderCodes.ts`/`godomall_order_search_spec.md`와 일치.
- 7.2 **공통코드(code_type 값)**: `scm` / `imagePath` / `memberGroup` / `delivery` / `deliveryInfo` / `asInfo` / `refundInfo` / `exchangeInfo` / `claimCode` / `claimPayment` / `claimBank` / `deliveryCompany` / `iconInfo` — Code_Search의 code_type 입력값.
- 7.3 상품 대표색상 코드 (hex: 8E562E/E91818/F4AA24/F4D324/F2F325/6F822E/191919/1E2C89/97D0E8/3030F8/FDC4DA/FFFFFF/C5C5C6/8C8C8C/37B300/A4DC0C).
- 7.4 네이버페이 환불사유 코드 (한글 라벨 폰트 미추출 — Code_Search 동적 조회 권장).
- 7.5 **결제수단코드(settleKind)**: eb/ec/ev/fb/fc/fa/fh/fp/fv/gb/gd/gm/gz/pb/pc/ph/pv/pk/pl/pn/gr. (기존 godomallOrderCodes 일치)
- 7.6 **주문채널코드**: shop/payco/naverpay.
- 7.7 주문정렬코드: orderNo desc/asc.
- 7.8 상점코드(mallSno): 1/2/3/4.
- 7.9 KC인증코드: kcCd01~kcCd013.

## 3. e나무 PDF 참고 독해 로그 (146p, 텍스트 추출 — 한글 동일 미추출)
- 추출 엔드포인트(영문)로 **구버전 구조** 파악. 고도몰5와의 핵심 차이:
  - e나무는 상품 Q&A/후기/회원Q&A가 **별도 엔드포인트**: `Goods_Qna_Search`/`Goods_Qna_Reply`, `Goods_Review_Search`/`Goods_Review_Reply`, `Goods_Memberqna_Search`/`Goods_Memberqna_Reply`.
  - e나무는 옵션/카테고리 CRUD 별도: `Goods_Option_Search/Update/Delete`, `Goods_Category_Search/Insert/Delete`.
  - e나무 전용: `Key_Check`, `Provider_List`, `Order_Search_Checkout`, `Order_Status_Check(out)` 등 체크아웃/네이버페이 변형.

## 4. 충돌/차이점 (고도몰5 우선)
- **상품 Q&A/후기 조회**: 고도몰5는 `Goods_Qna_Search`/`Goods_Review_Search`를 폐기하고 **`Board_List.php`(bdId=goodsqa/goodsreview)로 통합**. → GODO AI OS는 **Board_List 사용**. e나무 별도 엔드포인트 채택 안 함.
- 옵션/카테고리 CRUD: 고도몰5는 Category_Search(READ)만 1급. 옵션은 Goods_Search/Insert/Update 안에 포함.
- 충돌 시 **전부 고도몰5(2025-06-16) 채택**.

## 5. 최종 추출 대상
- **Registry 반영(고도몰5 23개)**: 상품 10 + 주문 2 + 게시판 10 + 공통 1.
- **참고만(legacy_reference, enamoo)**: Goods_Qna_Search / Goods_Review_Search 등 → Board로 대체 표기.
- **제외**: enamoo 전용 체크아웃/Key_Check/Provider_List(현 단계 불필요).

## 6. 읽지 못한/오인식 가능 항목
- 한글 본문 설명 전체(CID 폰트) — 영문 구조로 대체 확정. 한글 라벨이 꼭 필요한 코드표는 `Code_Search.php` 동적 조회 또는 기존 확정 코드표 사용.
- 네이버페이 환불사유 코드(7.4) 한글 라벨 — 미확정(동적 조회 권장).
- WRITE API 대형 파라미터(상품등록/수정)의 전 필드 한글 의미 — Registry엔 불필요(write_locked).
