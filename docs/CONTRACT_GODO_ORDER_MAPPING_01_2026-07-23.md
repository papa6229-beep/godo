# GODO-ORDER-MAPPING-01 — 주문 표시 필드 소실 RED 보고 (2026-07-23)

> 상태: **RED 제출 · GREEN 미착수.** 이 문서 + `scripts/smoke-godo-order-mapping-01-v0.mjs`만 포함(**제품 소스 변경 0파일**).
> 브랜치 `fix/godo-order-mapping-01` (기준선 main `cd148c04`). main·Production 미변경.

## 1. 근본 원인 (한 문장)

`/api/godomall/orders`(=`resolveResource('orders')`)만 **실제 리스트 키 `order_data`를 후보에서 빠뜨리고 0건 응답 phantom 가드(`normalizeOrderData`)를 통과하지 않은 채 중첩을 못 읽는 평면 매퍼(`mapOrderList`)** 를 쓰기 때문에, 상류에 주문이 없거나 중첩 구조로 올 때 **`pick()` 기본값으로만 채워진 가짜 주문 1건**(주문번호·일자·상품명 공백, 0원, 단품, 결제완료/배송대기)을 만들어 낸다.

## 2. 실제 증상 재현 (2026-07-23, Production 실제 모드 · 형태만 기록)

| 경로 | HTTP | sourceType | live | records |
|---|---|---|---|---|
| `GET /api/godomall/orders` | 200 | `api_proxy_real` | — | **1건** |
| `GET /api/godomall/orders-admin` | 200 | `api_proxy_real` | true | **0건** |
| `GET /api/godomall/orders-revenue?includeSynthetic=false` | 200 | (secure_proxy) | true | **실주문 0건**, errorMessage 없음 |

`/api/godomall/orders` records[0] 형태 (값 원문 미기록):

| 필드 | 형태 | 판정 |
|---|---|---|
| orderNo | `string<empty>` | `pick(...,'')` 기본값 |
| orderDate | `string<empty>` | 기본값 |
| productName | `string<empty>` | 기본값 |
| optionName | `string(len=2)` = 단품 | 기본값 `'단품'` |
| quantity | `string(len=1, numeric<nonzero>)` = 1 | 기본값 `'1'` |
| paymentStatus | `string(len=4)` = 결제완료 | 기본값 `'결제완료'` |
| deliveryStatus | `string(len=4)` = 배송대기 | 기본값 `'배송대기'` |
| invoiceNo | `string<empty>` | 기본값 |
| amount | `string(len=1, numeric<0>)` = 0 | 기본값 `'0'` |
| customerNameMasked | `string<empty>` | 마스킹 결과(원본도 빈 값) |
| (meta) maskedPiiCount | 4 | **PII 키 존재 기준 계수** — 실 PII 존재 근거 아님 |

→ **10개 필드 전부가 매퍼 기본값**이다. 즉 이 레코드는 "필드가 일부 빠진 주문"이 아니라 **주문이 아닌 것에서 만들어진 유령 레코드**다.

Data Preview 표시(2026-07-23 Production 육안): 주문번호·주문일자·상품명 공백 / 옵션명 단품 / 수량 1 / 금액 0원 / 상태 `결제완료 | 배송대기` — 위 형태와 1:1 일치.

## 3. 경계별 추적 (A~G)

| 경계 | 위치 | orderNo | orderDate | 상품명 | 상품코드 | 수량 | 금액 | 옵션명 | 주문/결제/배송 상태 |
|---|---|---|---|---|---|---|---|---|---|
| **A. 고도몰 Order_Search 원응답** | 상류 | **오늘 미관측** | 미관측 | 미관측 | 미관측 | 미관측 | 미관측 | 미관측 | 미관측 |
| **B. 서버 주문 매퍼** | `godomallMapper.mapOrderList` | 상위 평면 키만 조회 → **''** | **''** | 상위 `goodsNm`만 → **''** | (매핑 없음) | 기본값 `'1'` | 상위 `settlePrice`만 → **'0'** | 기본값 `'단품'` | 기본값 `결제완료`/`배송대기` |
| **C. `/api/godomall/orders` 정규화 응답** | `resolveResource` | `string<empty>` | `string<empty>` | `string<empty>` | 필드 없음 | `'1'` | `'0'` | `'단품'` | `결제완료`/`배송대기` |
| **D. secureProxyClient** | `syncProxyResource` | 통과(변형 없음) | 통과 | 통과 | — | 통과 | 통과 | 통과 | 통과 |
| **E. dataConnector 적재** | `dataNormalizer.normalizeOrder` | `''` 유지 + **errors에 "필수값 누락" 기록** | `''` | `''` | — | 1 | 0 | `'단품'` 유지 | 유지 |
| **F. Data Preview 표시 모델** | `DataPanel.tsx:788~` | 빈 셀 | 빈 셀 | 빈 셀 | — | 1 | `0원` | 단품 | `결제완료 \| 배송대기` |
| **G. 최종 UI** | Data Center / 일일요약 | 공백 | 공백 | 공백 | — | 1 | 0원 | 단품 | 결제완료·배송대기 |

**값이 처음 사라지는 지점**: **B(서버 매퍼 입력 단계)** — 정확히는 그 직전 리스트 추출이다.

- `api/_shared/godomallResource.ts:63` — `ORDER_LIST_KEYS = ['order','item','list','row','data']` (**`order_data` 없음**)
- `api/_shared/godomallResource.ts:103-104` — `extractList(parsed.root, ORDER_LIST_KEYS)` → `mapOrderList(...)`
  (`normalizeOrderData` **미적용**)
- `api/_shared/godomallMapper.ts:147-164` — `mapOrderList`가 중첩 `orderGoodsData`/`orderInfoData`를 읽지 않고 전 필드에 기본값 부여
- `api/_shared/godomallXmlParser.ts:141-145` — 배열이 없으면(단건/0건) 후보 키 단일 객체 탐색 → `'data'` 래퍼가 "1건"으로 잡힘

대조군(정상 경로): `godomallResource.ts:206`(admin) · `:299`(revenue) 은 `normalizeOrderData(extractList(root, ADMIN_ORDER_LIST_KEYS))` 사용. `ADMIN_ORDER_LIST_KEYS`(`:66`)는 `order_data`를 **첫 후보**로 둔다.

## 4. 전수조사에서 확인한 사실

| 확인 항목 | 결과 |
|---|---|
| 주문 매핑 함수·호출 경로 | `mapOrderList`(orders 리소스·sync) / `mapOrdersToAdmin`(orders-admin) / `mapOrdersToRevenue`(orders-revenue) **3계통** |
| 고도몰 실제 필드명 | 헤더 `orderNo`·`orderDate`·`settlePrice`·`totalGoodsPrice`·`totalDeliveryCharge`·`orderStatus`·`paymentDt`, 중첩 `orderGoodsData.goodsNm/goodsCnt/goodsPrice/goodsNo`, 중첩 `orderInfoData.*`(PII) — `docs/ORDER_SEARCH_REAL_RAW_VALIDATION_V1.md` §3 실측 |
| 상품 매핑 vs 주문 매핑 차이 | `GOODS_LIST_KEYS`에는 실제 키 `goods_data`가 **포함** → 상품·재고 13건 정상. 주문만 실제 키 누락 |
| orders-revenue 경로 필드 | ADMIN 키 + phantom 가드 + `deriveOrderState`(헤더+라인 폴백) 사용 → 이 결함 없음 |
| Data Preview 기대 필드 | `orderNo`·`orderDate`·`productName` **필수**(`DataPanel.tsx:208`, `dataNormalizer.ts:133`) |
| 수기/일반 주문 구조 차이 | 구조 차이 아님. 표본은 수기 주문 1건(미결제)이며 응답 구조는 동일 |
| 빈 값 폴백이 0원·공백을 만드는 위치 | `godomallMapper.ts:149-162`(`pick` fallback) + `dataNormalizer.ts:122-130`(2차 기본값) |
| 주문 라인 배열 중첩 | `order_data` 단건=객체/다건=배열, `orderGoodsData` 단일=객체/복수=배열 (`mapOrderList`는 둘 다 미처리) |
| PII 마스킹 전후 비즈니스 필드 | **손실 없음** — `maskRecordPii`는 `customerName/Phone/Email/address`(+content·title·memo)만 처리. 주문번호·일자·상품명·금액 미변경 (RED B6로 잠금) → **마스킹 범위 결함 아님** |
| 최근 RC-1 변경 영향 | `git diff` 확인 결과 C-2·C-3·C-4·출처 계약 커밋은 `godomallMapper.ts`·`godomallResource.ts`의 주문 표시 경로를 **변경하지 않았다**. 이 결함은 `00bfd51`(2026-06-26) 이전부터 존재 |

**결정적 이력**: `00bfd51`(2026-06-26, Empty Response Guard v1)이 phantom 가드를 **`resolveOrdersAdmin`·`resolveOrdersRevenue`에만** 적용하고 `fetchLiveRecords('orders')`에는 적용하지 않았다. 당시 문서에도 phantom 현상이 "§8 후속 과제"로 기록돼 있다.

## 5. 실제 관측 필드 / 미확인 필드

**오늘(2026-07-23) 관측**
- `/api/godomall/orders` 응답 10필드 형태(위 §2) · `orders-admin` 0건 · `orders-revenue` 실주문 0건 · 세 경로 모두 `api_proxy_real`·`live:true`·에러 없음.

**미확인 (추측하지 않음)**
- **경계 A(상류 원응답) 오늘 구조**: 진단용 route `api/godomall/order-search-raw-audit.ts`가 이미 제거되어 오늘 A를 직접 관측할 수 없었다. 서버 route 신설·배포는 이번 RED 범위 밖이라 하지 않았다.
- **조회기간 내 실제 주문 존재 여부**: Order_Search는 **30일 제한**이며 두 경로가 0건을 보고했다. 실제 주문이 조회창(2026-06-23~07-23) 밖으로 벗어났을 가능성이 높으나 **확정하지 않는다**(A 미관측).
- 다건 주문·다라인 주문·결제완료/배송/취소 주문의 실제 라인 구조 — 표본 부재로 여전히 미관측(`ORDER_SEARCH_REAL_RAW_VALIDATION_V1.md` §7과 동일).
- 2026-07-22 보존 스키마(`docs/contracts/.../orders.schema.json`)의 `fields`도 이미 `orderNo/orderDate/productName`이 `string<empty>`였다. 즉 **어제 "실제 주문 1건"으로 표시된 것도 같은 유령일 가능성**이 있으나, 어제의 A를 관측하지 않았으므로 단정하지 않는다.

## 6. RED 결과 (`scripts/smoke-godo-order-mapping-01-v0.mjs`)

문서화된 실 응답 **구조만** 익명 재현한 fixture 3종(주문 1건 / 0건 / 상류 금액이 진짜 0인 주문)을 실제 모듈(`extractList`·`mapOrderList`·`normalizeOrderData`·`mapOrdersToAdmin`·`maskRecordPii`)과 실제 상수(`ORDER_LIST_KEYS`·`ADMIN_ORDER_LIST_KEYS`)에 투입.

**[BASE] 8 pass / 0 fail** — admin 경로 1건/0건 정확, 상류 값 보존, 미결제 상태 보존, **PII 마스킹이 비즈니스 필드를 지우지 않음**, 상류 금액이 진짜 0이면 0 유지.

**[RED] 1 met / 10 unmet**

| RED | 목표 | 현재 |
|---|---|---|
| R1 | `ORDER_LIST_KEYS`에 `order_data` 포함 | 없음 |
| R2 | 0건 응답 → orders도 0건 | **유령 1건** |
| R3 | 0건 응답에서 기본값 주문 미생성 | 단품·1·결제완료·배송대기·0원 생성 |
| R4 | 상류 주문번호 있으면 표시 비지 않음 | 빈 문자열 |
| R5 | 상류 주문일자 있으면 날짜 표시 | 빈 문자열 |
| R6 | 상류 상품명 있으면 표시(중첩 포함) | 빈 문자열 |
| R7 | 상류 결제금액 있으면 같은 계약 금액 표시 | 0 |
| R8 | 미결제(o1)를 결제완료로 표시 안 함 | 결제완료 |
| R9 | orders와 admin 건수 일치(0건) | 1 vs 0 |
| R10 | orders와 admin 건수 일치(1건) | ✅ MET |
| R11 | 상류 0원 주문은 0원 유지하되 번호·상품명 표시 | 번호·상품명 공백 |

전체 스모크: **기존 89개 전부 통과 · 신규 RED 1개만 실패**(의도).

## 7. 수정 예상 파일 (GREEN — 아직 착수 금지)

| 파일 | 예상 변경 |
|---|---|
| `api/_shared/godomallResource.ts` | `ORDER_LIST_KEYS`에 실제 키 `order_data` 추가(또는 ADMIN 키로 통일) + `fetchLiveRecords('orders')`에 `normalizeOrderData` 가드 적용 |
| `api/_shared/godomallMapper.ts` | `mapOrderList`가 중첩 `orderGoodsData`(상품명·수량·단가)·헤더 금액(`settlePrice`)·상태(`orderStatus`/`paymentDt`)를 읽도록 보강. **기본값으로 상태를 단정하지 않도록** 조정 |
| (검증) `scripts/smoke-godo-order-mapping-01-v0.mjs` | RED → GREEN 전환 확인 |

**금지 유지**: 주문번호·상품명 하드코딩, 특정 주문 1건만 통과시키는 예외, 결제금액과 라인합의 임의 동일시, 누락값을 다른 주문·상품 자료로 채우기.

## 8. 예상 영향 소비자 전수 (`activeOperationsData.orders` 소비 지점)

`resolveResource('orders')` → sync → `buildOperationsSnapshot('orders')` → `activeOperationsData.orders`를 읽는 곳:

| # | 소비자 | 영향 |
|---|---|---|
| 1 | `components/DataPanel.tsx` (Data Preview·Overview·기간·송장누락) | 표시 직접 영향 |
| 2 | `utils/dailySummaryBuilder.ts` (오늘 주문·일자별 요약) | 건수·일자 |
| 3 | `components/AiBriefing.tsx` (주문 이슈) | riskFlags |
| 4 | `engine/reportComposer.ts` (총 주문수·송장 누락) | 건수 |
| 5 | `services/controlChatService.ts:155,410` (운영 채팅 주문 건수) | 건수 |
| 6 | `components/ReportModal.tsx` (보고서 주문수·기간) | 건수·일자 |
| 7 | `App.tsx:52` (스냅샷 요약 orders 수) | 건수 |
| 8 | `utils/dataNormalizer.ts` 품질점수(errors "필수값 누락") | 품질 점수 |

**비영향(별도 계통)**: 상품관리팀 매출 대시보드·마케팅 분석은 `orders-revenue`(ADMIN 키 + 가드) 경로라 이 결함의 영향을 받지 않는다. 따라서 GREEN은 **매출·재고 계산에 파급되지 않아야 한다**(회귀 확인 대상).

## 9. 판정

- 상류 값이 있는데 하류에서 사라지는가 → **R4~R7이 값으로 증명**(fixture 기준). 제품 결함.
- 상류가 0건인데 1건을 만드는가 → **R2·R3이 증명**. 제품 결함(더 심각: 없는 주문을 만들어 냄).
- 상류 금액이 진짜 0이면 → **결함으로 단정하지 않음**(B8·R11로 분리).
- PII 마스킹 범위 결함인가 → **아니다**(B6로 잠금).

## 10. 이번 단계 상태

제품 소스 변경 **0파일**(신규 test 1 + 문서 1) · main·Production 무변경 · 작업 트리 clean · GREEN 미착수.
