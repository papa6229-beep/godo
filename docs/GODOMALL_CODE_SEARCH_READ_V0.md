# GodoMall Code_Search READ Bridge v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/godomall-code-search-read-v0`
> **코드**: `api/godomall/codes.ts` + `api/_shared/godomallCodes.ts` · **smoke**: `scripts/smoke-godomall-code-search.mjs`

## 1. 구현 목적
고도몰 공통코드조회(`Code_Search.php`)를 서버 READ 브리지로 연결해, 운영자가 설정한 **동적 코드**(공급사/배송정책/클레임사유/환불은행/택배사/아이콘 등)를 GODO AI OS 내부에서 조회한다. 코드표 하드코딩 대신 고도몰 기준 코드를 동기화하는 기반.

- 기존 `godomallOrderCodes.ts`(정적 enum: 주문상태/결제수단/채널/정렬/상점)와 **역할 분리**. Code_Search는 운영자 설정 동적 코드.

## 2. Endpoint / 요청 방식
- `POST {base}/common/Code_Search.php` (서버 전용, 키는 환경변수)
- Request: `code_type`(필수), `scmNo`(선택, 숫자)
- 프론트 호출: **`GET /api/godomall/read?capability=code_search&codeType=<type>[&scmNo=N]`** (통합 READ 게이트웨이 v1로 이전. 구 `/api/godomall/codes`는 제거됨 — `docs/GODOMALL_ROUTE_BUDGET_POLICY_V1.md`)
- 응답: 정규화된 code list만(raw XML/키 미반환). 공통코드 = PII none.

## 3. allowlist code_type (PDF §7.2 확정 13종)
`scm` / `imagePath` / `memberGroup` / `delivery` / `deliveryInfo` / `asInfo` / `refundInfo` / `exchangeInfo` / `claimCode` / `claimPayment` / `claimBank` / `deliveryCompany` / `iconInfo`
- allowlist 밖/누락 → **400 `INVALID_CODE_TYPE`** (safe error). 주문상태/결제수단 등 정적 enum은 Code_Search 대상 아님.

## 4. normalize 규칙
- **code_type마다 응답 필드가 다르다**(§7.2) → `CODE_FIELD_MAP`으로 type별 code/label 필드 매핑:

| code_type | code 필드 | label 필드 |
|---|---|---|
| scm | scmNo | companyNm |
| imagePath | storageName | imageStorage |
| memberGroup | sno | groupNm |
| delivery | sno | method |
| deliveryInfo/asInfo/refundInfo/exchangeInfo | informCd | informNm |
| claimCode/claimPayment/claimBank | itemCd | itemNm |
| deliveryCompany | invoiceCompanySno | invoiceCompanyName |
| iconInfo | iconCd | iconNm |

- 매핑 외 필드도 견고하게: 일반 후보(`*Cd/*No/*Sno`→code, `*Nm/*Name`→label) fallback.
- 표준형: `{ codeType, code, labelKo, labelRaw, sortNo?, useFl?, raw? }`. (route 응답은 raw 생략)
- 단건 object / 배열 / 빈값(`''`/null/`{}`/`[]`) 모두 처리. code·label 둘 다 없는 항목은 제외(빈 응답/래퍼 guard).

## 5. real / mock 응답 구분
- 라이브 성공 → `source:'real'`, `mode:'real'`.
- 라이브 비성공 코드 → `source:'real'` + `apiSuccess:false` + `apiCode`/`apiMsg`(위장 안 함).
- 라이브 미설정/호출 실패 → `source:'mock'`, `mode:'mock_fallback'`, 최소 데모 코드(라벨에 `(mock)` 명시). real과 절대 안 섞음.

## 6. 라이브 실측 결과 (2026-06-26, Production 테스트몰)
`GET https://godo-psi.vercel.app/api/godomall/codes?codeType=<t>` — **13종 전부 source:real 동작, 한글 라벨 정규화 성공**:

| code_type | total | 예시(code → labelKo) |
|---|---|---|
| claimBank | 29 | 04002001 → KB국민은행, 04002002 → IBK기업은행 |
| claimCode | 14 | 04001001 → 고객변심, 04001002 → 품절취소 |
| claimPayment | 5 | 04003001 → 현금환불, 04003002 → PG환불 |
| deliveryCompany | 7 | 12 → 우체국택배, 37 → 기타 택배 |
| iconInfo | 13 | icon0001 → 베스트상품, icon0002 → 이벤트상품 |
| delivery | 4 | 1 → 기본-고정배송비, 2 → 기본-금액별배송비 |
| memberGroup | 1 | 1 → 일반회원 |
| deliveryInfo/asInfo/refundInfo/exchangeInfo | 1 each | 002001 → 배송안내-기본 등 |
| scm / imagePath | 0 | (테스트몰 미설정 — 빈 응답 정상) |

- allowlist 거부 확인: `?codeType=orderStatus` / 누락 → `ok:false, errorCode:INVALID_CODE_TYPE`.
- **PDF §7.2 필드 매핑이 실데이터와 100% 일치.** claim/은행/택배 한글 라벨은 PDF가 아닌 **실API 응답**에서 획득(향후 주문 claimData/환불 라벨 해석 기반).

## 7. Registry 반영
- `code_search`: `not_started` → **`partial`**
- `currentRoutes`: `['api/godomall/codes.ts']`
- `currentSharedFiles`: `['api/_shared/godomallCodes.ts']`
- `businessPriority`: `p1`, `piiRisk`: `none`, `rateLimitSensitive`: `true`

## 8. 인프라 메모 (중요)
- **Vercel Hobby 플랜은 배포당 Serverless Function 최대 12개**. `codes.ts` 추가 시 13개 → 배포 실패.
- → 일회성 진단 route `api/godomall/order-search-raw-audit.ts`를 **제거**(실측 결과는 `ORDER_SEARCH_REAL_RAW_VALIDATION_V1.md`에 보존, 공유 로직 `orderRawAudit.ts`는 유지). 현재 12개.
- 향후 READ API(category_search/board_list 등) 추가 시 또 한도 도달 → **route 통합(쿼리 파라미터로 다중 리소스)** 또는 Pro 플랜 필요.

## 9. 남은 이슈
- 미확인 code_type 실데이터: scm/imagePath는 테스트몰 0건 → 공급사/이미지 설정 후 재확인.
- `godomallOrderCodes.ts`(정적) vs Code_Search(동적) 비교/병합 정책: claimCode(클레임사유)·claimBank(환불은행)는 정적 enum에 없음 → Code_Search가 보강. 주문상태/결제수단은 정적 유지.
- 다음: ① `claimCode`/`claimBank`/`deliveryCompany`를 order_status(WRITE 준비)·환불 UI 라벨에 활용 ② category_search READ로 RevenueOrder 카테고리 한글화 ③ board_list READ v0(CS/리뷰).
