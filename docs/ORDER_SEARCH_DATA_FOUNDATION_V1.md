# Order_Search Data Foundation v1

> **작성일**: 2026-06-26
> **브랜치**: `feature/order-search-data-foundation-v1`
> **기반 스펙**: `docs/godomall_order_search_spec.md` (고도몰 개발자센터 Order_Search.php 공식 export)

---

## ⚠️ 안전 고지 (먼저 읽기)

- **이번 작업은 실제 주문 쓰기(Write)가 아니다.** READ 전용 기반만 추가했다. 고도몰 Write API·주문 생성·외부 실행 일절 없음.
- **이번 작업은 실제 개인정보 사용이 아니다.** 생성되는 이름/전화/이메일/주소는 모두 명백한 가상값(`Synthetic User 001`, `010-0000-0001`, `synthetic001@example.test`, `서울시 테스트구 샘플로 1`)이다.
- **이번 작업은 공식 스펙 기반 raw order simulator foundation이다.** 실제 API raw 응답과 "유사한 형태"를 결정적으로 생성하는 기반이다.
- **기존 상품관리팀은 기본적으로 legacy `syntheticRevenue.ts`로 계속 동작한다.** 본 작업의 새 경로는 명시적 opt-in(`syntheticSource=godoRaw`)일 때만 사용된다. 기본 동작은 한 줄도 바뀌지 않았다.

---

## 1. 작업 목적

기존 GODO AI OS는 Products REAL READ + `syntheticRevenue.ts`(곧장 `RevenueOrder` 생성)로 상품관리팀 대시보드/채팅/운영일지를 구동한다. 이 작업은 그 위에, **고도몰 `Order_Search.php` 공식 스펙을 1급 객체로 삼는 데이터 기반**을 추가한다:

1. 공식 코드표를 TypeScript 상수/타입으로 고정한다(임의 코드 금지).
2. `Order_Search.php` raw 응답 구조를 타입으로 정의한다.
3. 실제 raw 응답과 유사한 synthetic raw order generator(결정적)를 추가한다.
4. generated raw order를 **기존 `mapOrdersToRevenue`에 그대로 통과**시켜 `RevenueOrder[]`로 변환하는 bridge를 만든다.
5. 기존 `syntheticRevenue.ts`는 **삭제하지 않는다**. 기존 대시보드/채팅/운영일지 동작은 절대 깨지지 않는다.

---

## 2. 추가된 파일

### 신규 (`api/_shared/`)
| 파일 | 역할 |
|---|---|
| `godomallOrderCodes.ts` | Order_Search 공식 코드표 상수화 (`*_LABELS` 맵 + `*_CODES` 배열 + 유니온 타입 + `labelOf`/`orderStatusGroupOf` 헬퍼) |
| `godomallOrderTypes.ts` | Order_Search raw 응답 shape 타입(`GodomallOrderSearchResponse` 외 9종). 비즈니스 모델 아님 = "API 원형" |
| `godomallOrderNormalize.ts` | raw 정규화 제네릭 유틸 (`asArray` / `isValidGodoDate` / `toNumber` / `toInt` / `toStringValue`) |
| `syntheticGodomallOrders.ts` | synthetic raw Order_Search 생성기 + **RevenueOrder bridge** |

### 수정 (`api/`)
| 파일 | 변경 |
|---|---|
| `_shared/godomallResource.ts` | `resolveOrdersRevenue`에 opt-in `syntheticSource` 옵션 추가('legacy' 기본 = 무변경, 'godoRaw' = 새 경로) |
| `godomall/orders-revenue.ts` | `?syntheticSource=godoRaw` 쿼리 파싱(기본 'legacy') |

### 신규 (`docs/`)
- `docs/ORDER_SEARCH_DATA_FOUNDATION_V1.md` (이 문서)

---

## 3. 코드표 상수 목록 (`godomallOrderCodes.ts`)

모두 `docs/godomall_order_search_spec.md` 기준. 각 항목은 `*_LABELS`(코드→설명) + `*_CODES`(코드 배열) + 유니온 타입을 제공.

- `DATE_TYPE_LABELS` (order / modify)
- `ORDER_STATUS_LABELS` (**35개** 전체: o1·p1·g1~g4·d1·d2·s1·c1~c4·f1~f4·b1~b4·e1~e5·r1~r3·z1~z5) + `orderStatusGroupOf()` (prefix 기반 상태군 분류)
- `ORDER_CHANNEL_LABELS` (shop / payco / naverpay)
- `SEARCH_TYPE_LABELS` (orderPhone / receiverPhone / orderCellPhone / receiverCellPhone)
- `SORT_LABELS` (orderNo desc / asc)
- `MALL_SNO_LABELS` (1~4)
- `ORDER_TYPE_LABELS` (pc / mobile / write)
- `FIRST_SALE_LABELS` (y)
- `SETTLE_KIND_LABELS` (**21개**: eb·ec·ev·fb·fc·fh·fp·fv·fa·gb·pb·pc·ph·pv·pk·pl·pn·gd·gm·gz·gr)
- `DELIVERY_FIX_LABELS` (fixed / free / price / weight / count)
- `DELIVERY_COLLECT_LABELS` (pre / later)
- 플래그(y/n): `DEDUCT_FLAG_LABELS`·`RESTORE_FLAG_LABELS` + 의미별 별칭 `MINUS_DEPOSIT_FL_LABELS`·`MINUS_RESTORE_DEPOSIT_FL_LABELS`·`MINUS_MILEAGE_FL_LABELS`·`MINUS_RESTORE_MILEAGE_FL_LABELS`·`PLUS_MILEAGE_FL_LABELS`·`PLUS_RESTORE_MILEAGE_FL_LABELS`·`MINUS_STOCK_FL_LABELS`·`MINUS_RESTORE_STOCK_FL_LABELS`
- `CLAIM_HANDLE_MODE_LABELS` (r / b / e / z / c)
- `HANDLE_COMPLETE_LABELS` (y=환불완료 / n=환불접수)

---

## 4. raw type vs RevenueOrder 차이

| 구분 | raw type (`godomallOrderTypes.ts`) | RevenueOrder (`godomallRevenue.ts`) |
|---|---|---|
| 성격 | 고도몰 API "원형" 응답 shape | 매출 분석용 "가공" 모델 |
| 필드 수 | 스펙 100+ 필드 중 핵심 명시 + `[key:string]:unknown` (forward-compat) | 매출 분석에 필요한 최소 필드만 |
| 수치 | `number \| string` (XML 파서가 문자열로 줄 수 있음) | `number` (변환 완료) |
| 컬렉션 | `T \| T[]` (단일/배열/빈값 흔들림) | `RevenueOrderLine[]` (정규화 완료) |
| PII | 포함(orderName/orderCellPhone 등) — **로그/응답 노출 금지** | 미포함(매출 분석용이라 애초에 없음) |
| 상태 | `orderStatus` 코드 문자열 | `state: RevenueOrderState` (날짜필드 파생 boolean) |

> 핵심: raw type은 "들어온 그대로"를, RevenueOrder는 "분석 가능하게 가공한" 것을 표현한다. 둘을 혼동하지 말 것.

---

## 5. syntheticGodomallOrders 생성 방식

`buildSyntheticGodomallOrderSearchResponse(products, options?)` → `GodomallOrderSearchResponse`

- **결정적**: 숫자 seed → mulberry32 PRNG (`Math.random` 미사용). 같은 옵션 → 같은 데이터.
- **실 상품 기반**: `StandardProduct[]`의 productId/productCode/productName/price로 주문상품 라인 구성(실 Products 없으면 빈 응답).
- **상태 시나리오**(가중, 공식 코드표 기준):

  | 시나리오 | 코드 | 비중 | 흐름 |
  |---|---|---|---|
  | 구매확정 | s1 | 50% | p1→g1→d1→d2→s1 |
  | 배송완료 | d2 | 12% | …→d2 |
  | 배송중 | d1 | 10% | …→d1 |
  | 상품준비중 | g1 | 6% | p1→g1 |
  | 결제완료 | p1 | 5% | p1 |
  | 입금대기 | o1 | 5% | o1(미결제) |
  | 취소 | c4 | 5% | p1→c4 (재고 복원) |
  | 반품→환불 | r3 | 4% | d2→b1→b2→b4→r3 (재고 복원) |
  | 교환완료 | e5 | 3% | d2→e1→e2→e3→e5 (매출 유지) |

- **옵션**: `months`(12) / `orderCount`(480) / `seed`(고정 20260626) / `endDate`(기본 호출시점) / `includeClaims`(true) / `includeMembers`(true).
- **클레임**: 취소/반품/교환 시 `claimData`(handleMode/handleCompleteFl/handleReason/refundPrice, 교환은 `exchageInfoData`) 부착.
- **PII**: 명백히 가상(`Synthetic User NNN` / `010-0000-NNNN` / `synthetic NNN@example.test` / `서울시 테스트구 샘플로 N`).

### 변환 호환 메모(중요)
기존 `mapOrdersToRevenue`→`deriveOrderState`는 **주문 헤더** 레벨 날짜필드를 읽는다. 공식 스펙은 invoice/delivery/finish/cancel 일자를 `orderGoodsData`(라인)에 두지만, 본 시뮬레이터는 변환 호환을 위해 상태 구동 날짜필드를 **헤더+라인 양쪽**에 채운다. 덕분에 raw가 기존 변환 경로를 그대로 통과한다.

### Bridge
`buildSyntheticRevenueOrdersFromGodomallRaw(products, options?)` → `RevenueOrder[]`
```
buildSyntheticGodomallOrderSearchResponse(products, options)
  → asArray(order_data)
  → mapOrdersToRevenue(rawOrders, buildProductIndex(products), 'synthetic_test')
```
실데이터와 **동일한 변환 함수**를 통과하므로, 결과 `RevenueOrder[]`는 기존 `summarizeRevenue`/`computeSyntheticStockImpact`/대시보드/채팅이 그대로 소비할 수 있다.

### 검증(스모크 테스트, 480건/3상품 기준)
- raw 응답: code 200, order_data 480행, 헤더+중첩 구조 완비, orderNo 공식형태(`2511271042000001`).
- 결정성: 동일 옵션 → 동일 첫 주문번호·동일 매출합.
- bridge: `revenueMismatch=0`(헤더=라인합), 상품매칭 684/684(100%), 카테고리 조인 정상.
- 상태: confirmed 250(s1+e5), canceled 50(c4+r3), unpaid 19 — `deriveOrderState` 해석 일관.

---

## 6. 기존 syntheticRevenue와의 관계

| | legacy `syntheticRevenue.ts` | 신규 `syntheticGodomallOrders.ts` |
|---|---|---|
| 출력 | `RevenueOrder[]` 직접 생성 | `GodomallOrderSearchResponse`(raw) → bridge로 `RevenueOrder[]` |
| 변환 경로 | 자체 구성(매퍼 미경유) | **실데이터와 동일** `mapOrdersToRevenue` 경유 |
| 기간/건수 | 6개월 / 240건 | 12개월 / 480건 (기본) |
| 상태 표현 | 날짜필드 직접 | 공식 코드 시나리오 → 날짜필드 |
| 클레임/회원/PII | 없음 | 있음(가상) |
| 사용 시점 | **기본**(`syntheticSource` 미지정/`legacy`) | **opt-in**(`syntheticSource=godoRaw`) |

→ 두 생성기는 공존한다. legacy를 대체하지 않으며, 기본 동작은 legacy 그대로다.

---

## 7. 엔드포인트 옵션 (opt-in, 기본 무변경)

```
GET /api/godomall/orders-revenue?includeSynthetic=true                       # 기존(legacy) — 무변경
GET /api/godomall/orders-revenue?includeSynthetic=true&syntheticSource=godoRaw # 신규 raw 시뮬레이터 경로
```
`syntheticSource` 미지정/`legacy` 시 기존과 100% 동일하게 동작한다. 새 값은 순수 가산이라 기존 대시보드/채팅/운영일지에 영향이 없다.

---

## 8. 다음 단계 제안

1. **실제 API raw 샘플과 대조**: 실 주문 1건(샌드박스/리얼) raw 응답을 확보해 `godomallOrderTypes.ts` 필드/`orderGoodsData` 날짜필드 위치를 실측 보정.
2. **할인/쿠폰/적립 반영**: 현재 bridge는 상품매출(goodsPrice×수량)·배송비만 집계. `totalGoodsDcPrice`/`totalCoupon*DcPrice`/마일리지·예치금까지 RevenueOrder에 확장하면 순매출 정확도 향상.
3. **클레임 기반 환불/반품 매출 표현**: 현재 반품·취소는 `cancelDt`로 canceled 처리(보수적). `claimData.refundPrice`를 활용한 환불금액·반품률 KPI 추가.
4. **상품관리팀 채팅 facts 확장**: `productTeamChatFacts.ts`가 raw 시뮬레이터 데이터(주문채널·결제수단·첫구매 비중·회원/비회원)를 질문 의도로 다룰 수 있게 확장.
5. **대시보드 토글**: 대시보드/운영일지에서 legacy ↔ godoRaw 소스를 운영자가 비교해볼 수 있는 개발용 토글(필요 시).
