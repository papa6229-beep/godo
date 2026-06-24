# Orders 상태 코드 기준표 & 매출용 리치 주문 타입 설계 (2026-06-24)

> 목적: 상품관리팀 매출 대시보드 / 가상 매출 데이터 생성 전에 **고도몰 주문 상태 코드 기준을 잠그고**, 매출 계산에 필요한 **리치 주문 타입을 설계**하기 위한 기록 문서.
> 근거: `Order_Search.php` 실응답 + dev/preview 전용 value probe(`chore/orders-status-probe`, main 미머지, 확인 후 정리) 1회 실측.
> 연관: `docs/PROJECT_STATE.md` §29(Products READ v0), Orders READ v0 (main `8bee446`).

---

## 1. 실측으로 확정된 사실 (2026-06-24, 실주문 1건)

테스트몰의 수기 주문 1건(미결제)을 value probe로 확인한 결과:

| 필드 | 실측값 | 의미 |
|---|---|---|
| `orderStatus` (헤더) | **`o1`** | 입금대기 / 미결제 |
| `orderGoodsData.orderStatus` (라인) | **`o1`** | 라인도 동일(입금대기) |
| `paymentDt` | `0000-00-00 00:00:00` | **결제 안 됨**(sentinel) |
| `invoiceDt` | (빈값) | 송장 미발행 |
| `deliveryDt` | (빈값) | 배송 시작 안 됨 |
| `deliveryCompleteDt` | (빈값) | 배송 완료 안 됨 |
| `finishDt` | (빈값) | 구매확정 아님 |
| `cancelDt` | (빈값) | 취소 아님 |

### 확정 결론
- **`o1` = 입금대기/미결제 상태 코드**로 확정. (헤더·라인 동일)
- **`paymentDt`가 `0000-00-00 00:00:00` 또는 빈값이면 미결제**로 판단(결제완료 아님). → v0 매퍼 `hasPaymentDate()`가 `^0000` 패턴을 미결제로 처리하는 로직이 실측과 일치함(검증됨).
- `invoiceDt/deliveryDt/deliveryCompleteDt/finishDt/cancelDt`가 모두 비어 있으면 **배송 전 · 구매확정 아님 · 취소 아님**.

---

## 2. 상태 코드 기준표 (confirmed / 추정)

> ⚠️ **현재 실데이터가 미결제 1건뿐**이라 `o1` 외 코드는 **미확정**이다. 아래 "추정 코드"는 고도몰5의 관례적 체계이며, 해당 상태의 실주문이 생기면 같은 probe로 재확인해 잠근다. **1차 구현은 코드값보다 "날짜필드 존재 여부"를 우선 신뢰**(아래 §3)한다.

형식: 상태 / 판단(권장: 날짜필드) / orderStatus 코드 / 매출 반영 / 확정여부

```
입금대기/미결제 / paymentDt 무효(빈값·0000)                 / o1            / ❌            / ✅ 확정
결제완료        / paymentDt 유효                              / p* (추정)     / ✅ 총매출      / ⛔ 미확정
상품준비중      / paymentDt 유효 + invoiceDt 없음             / p*/g* (추정)  / ✅            / ⛔ 미확정
배송중          / invoiceDt 또는 deliveryDt 있음              / d1 (추정)     / ✅            / ⛔ 미확정
배송완료        / deliveryCompleteDt 있음                     / d2 (추정)     / ✅            / ⛔ 미확정
구매확정        / finishDt 있음                               / s*/g* (추정)  / ✅ 확정매출    / ⛔ 미확정
취소            / cancelDt 있음                               / c* (추정)     / ❌ 차감        / ⛔ 미확정
반품            / cancelDt 있음 + 상태 반품계열               / r* (추정)     / ❌ 차감        / ⛔ 미확정
교환            / 상태 교환계열                               / e* (추정)     / ➖ 중립(불변)  / ⛔ 미확정
환불            / cancelDt + 정산 결과                        / (추정)        / ❌ 차감        / ⛔ 미확정
결제실패        / paymentDt 무효 + 상태 실패계열              / f* (추정)     / ❌            / ⛔ 미확정
```

---

## 3. 날짜필드 기반 상태 판별 규칙 (코드값 비의존 — 권장)

`orderStatus` 코드 실값을 다 몰라도, **날짜필드 존재 여부**로 핵심 상태를 견고하게 역산할 수 있다(실측으로 방향 검증됨). 1차 매출 로직은 이 규칙을 1순위로 쓴다.

```
paid       = paymentDt 유효(빈값/0000 아님)
shipped    = invoiceDt 또는 deliveryDt 유효
delivered  = deliveryCompleteDt 유효
confirmed  = finishDt 유효
canceled   = cancelDt 유효
unpaid     = !paid
undelivered= !shipped && !delivered
```
- `orderStatus` 코드는 **보조 신호**로만 사용(예: `o1`→unpaid 확정, 향후 확정된 코드 보강).
- 날짜 유효성: 빈 문자열, `0000-00-00...`, 숫자 0만 → 무효.

---

## 4. 매출 계산 기준 (v0 확정)

### 4-1. 상품매출 (상품별/카테고리별 성과)
- 상품별/카테고리별 성과 분석은 **주문 라인 기준**으로 계산한다.
- 기본 공식: `lineRevenue = goodsPrice × goodsCnt`, 상품매출 = `Σ lineRevenue`.
- ⚠️ **단, 현재 실주문이 수량 1건뿐이라 `goodsPrice`가 단가인지 라인합계인지 아직 확정되지 않았다**(111×1=111이라 구분 불가).
- 따라서 **v0에서는 헤더 `totalGoodsPrice`를 주문 단위 상품매출 기준값으로 대조**한다(라인합과 불일치 시 플래그/로그).
- 향후 **수량 2개 이상 주문**으로 `goodsPrice` 의미(단가 vs 라인합계)를 확인해 잠근다.

### 4-2. 배송비 분리
- 배송비(`totalDeliveryCharge` / `deliveryFee`)는 **상품매출에 절대 섞지 않는다.**
- 배송비는 **배송/운영 지표로 별도 집계**한다.
- **총 주문금액 = `settlePrice` / `totalAmount`** 기준으로 본다.

### 4-3. 할인 / 쿠폰 / 적립
- 할인·쿠폰·적립 사용 시 **`settlePrice ≠ totalGoodsPrice + totalDeliveryCharge`** 가 될 수 있다.
- 따라서 **총상품매출 / 할인액 / 배송비 / 실결제금액을 구분**해야 한다.
  - 총상품매출(gross) = `totalGoodsPrice` (또는 라인합)
  - 배송비 = `totalDeliveryCharge`
  - 실결제금액 = `settlePrice`
  - 할인액 = `(총상품매출 + 배송비) − 실결제금액` 으로 근사 역산(전용 필드 확인 전까지)
- v0는 **할인 없는 테스트 주문 기준**으로 시작한다.
- **TODO**: 할인/쿠폰/적립 전용 필드(예: `totalDcPrice` / 쿠폰 / 적립금 등) 실응답 존재 여부 확인 후 정식 반영.

### 4-4. 매출 기준 지표
- **확정매출(메인)** = `confirmed(finishDt 있음)` 주문의 상품매출 → 취소/반품이 구조적으로 제외되어 신뢰도 최상.
- **결제완료 총매출(보조)** = `paid && !canceled` 주문의 상품매출 → 선행지표("잠정매출"로 라벨).
- **취소 차감** = `canceled(cancelDt 있음)` 주문 상품매출 별도 표기.
- 상품 성과는 **라인 단위** 기준(부분취소·헤더/라인 불일치 대비), 배송비는 주문 단위 별도 합산.
- gross / net(할인 후) 여부는 **대시보드 라벨에 명시**.

> 미확인 리스크: 취소/환불 금액이 원주문 갱신(A)인지 별도 레코드(B)인지 아직 미검증. 1차는 **확정매출(finishDt) 기준**으로 우회. 해당 상태 실주문 발생 시 재검증.

---

## 5. 매출용 리치 주문 타입 설계 (다음 구현 단계 스펙)

현재 `StandardOrderAdmin`(표시용)은 라인/코드/날짜를 버리는 lossy 구조 → **매출용 별도 타입 신설**(표시용은 그대로 유지).

```ts
// 매출 분석용 — 헤더 + 라인(array) 구조. 실/가상 동일 스키마.
type OrderSourceType = 'real_godomall' | 'synthetic_test';

interface RevenueOrderLine {
  goodsNo: string;        // ← Products.productId 조인 키 (1순위)
  goodsCd: string;        // ← Products.productCode 조인 키 (보조)
  goodsNm: string;
  goodsCnt: number;
  goodsPrice: number;     // 단가(추정) — 단가/라인합계 미확정, §4-1 참조
  lineOrderStatus: string;// orderGoodsData.orderStatus (예: o1)
  // 파생(런타임): lineRevenue = goodsPrice × goodsCnt, category(Products 조인)
}

interface RevenueOrder {
  orderId: string;
  orderNo: string;
  orderDate: string;
  // 상태 판별용 날짜필드 (원본 보존)
  paymentDt: string;
  invoiceDt: string;
  deliveryDt: string;
  deliveryCompleteDt: string;
  finishDt: string;
  cancelDt: string;
  orderStatus: string;          // 헤더 raw 코드 (예: o1)
  // 금액
  settleKind: string;
  settlePrice: number;          // 총 주문금액
  totalGoodsPrice: number;      // 헤더 상품금액(대조용)
  totalDeliveryCharge: number;  // 배송비
  lines: RevenueOrderLine[];    // ★ array (단일상품도 [1])
  sourceType: OrderSourceType;  // 실/가상 구분
  // 파생(런타임): paid/shipped/delivered/confirmed/canceled, productRevenue
}
```

### 설계 원칙
1. `orderGoodsData` object|array **항상 array 정규화**(현 v0 firstRecordOf를 전체 라인 보존으로 확장).
2. **Products 조인**: 주문 라인 `goodsNo` → `Products.productId` 연결(1순위). `goodsCd` → `productCode` 보조키. 카테고리는 `Products.categoryCode/allCategoryCode`에서 가져온다(주문 단독 불가, 키 존재 확인됨).
3. **상품명 기준 조인 금지** — `goodsNo`(불변) 기준. `goodsNm` 텍스트 매칭 사용 안 함.
4. **Products 조인 실패 폴백**: `goodsNo`를 Products에서 못 찾으면 `category = 'uncategorized'`, 상품명 없으면 `'unknown_product'`로 처리.
5. 실/가상 = `sourceType`으로 분리, 집계 시 필터 가능. 가상은 고도몰 미등록(Write 금지), GODO 내부 전용.
6. **상태 판별 = §3 날짜필드 우선**, `orderStatus` 코드는 보조:
   - `o1` = 입금대기/미결제 (확정)
   - `paymentDt` 없음/`0000-00-00 00:00:00` → 미결제
   - `finishDt` 있음 → 구매확정(확정매출 기준)
   - `cancelDt` 있음 → 취소 계열
   - 그 외 상태 코드는 실데이터 발생 시 추가 검증.
7. **상태 파생은 단일 순수함수**(`deriveOrderState(order)`)로 계산(paid/shipped/delivered/confirmed/canceled) → 실/가상 동일 경로 보장.

### 구현 방식 결정 (v0 = A안, 안전 우선)
- **v0는 A안(분리) 채택**: 기존 `orders-admin` / `StandardOrderAdmin`은 **건드리지 않는다.**
- 매출 분석용 `RevenueOrder` / `RevenueOrderLine` 타입과 매퍼/리졸버/라우트를 **별도로 신설**한다.
- 이후 안정화되면 `RevenueOrder`를 canonical 기준으로 두고 `StandardOrderAdmin`을 그 **projection으로 파생**하는 **B안 통합을 검토**한다.
- ⚠️ A안은 동일 데이터(Order_Search.php)를 표시용/매출용 **2회 fetch**할 수 있음 — v0 격리·안전을 우선해 수용, B안 통합 시 1회로 합침.

### 가상 데이터 생성 시 필요한 필드 (위 RevenueOrder 스키마와 동일)
헤더: orderId, orderNo, orderDate, paymentDt, invoiceDt, deliveryDt, deliveryCompleteDt, finishDt, cancelDt, orderStatus, settleKind, settlePrice, totalGoodsPrice, totalDeliveryCharge, sourceType(`synthetic_test`)
라인: goodsNo, goodsCd, goodsNm, goodsCnt, goodsPrice, lineOrderStatus

---

## 6. 미해결/후속 확인 항목 (TODO)
- `goodsPrice` **단가 vs 라인합계** — 수량 2개 이상 주문으로 확인(§4-1). 그 전까지 헤더 `totalGoodsPrice` 대조 기준.
- **할인/쿠폰/적립 전용 필드** — `totalDcPrice`/쿠폰/적립금 등 실응답 존재 여부 확인 후 §4-3 정식 반영.
- 결제완료/배송/구매확정/취소/반품/환불 **코드 실값** — 해당 상태 실주문 발생 시 동일 probe로 확인해 §2 표 잠금.
- 취소/환불 **금액 표현 방식(원주문 갱신 vs 별도 레코드)** — 취소 실주문 발생 시 검증. 그 전까지 확정매출(finishDt) 기준으로 우회.
- 부분취소/부분반품 라인 단위 수량·금액 차감 — CS/주문관리팀 단계 과제.
- **Products 페이징** — 상품 수가 100개를 넘으면 Products 단일 페이지 fetch로는 조인 누락 → 페이징 필요(현재 13개라 무방).

## 7. v0 구현 범위 요약 (다음 단계 = feature/revenue-order-model)
- A안: 기존 orders-admin/StandardOrderAdmin 무수정, `RevenueOrder`/`RevenueOrderLine` + 매퍼/리졸버/라우트 신설.
- 상태: 날짜필드 우선 파생(`deriveOrderState`), o1=미결제 확정 코드 보조.
- 매출: 라인합 상품매출(헤더 totalGoodsPrice 대조) + 배송비 별도 + 확정매출(finishDt) 메인.
- 조인: `goodsNo→productId`(보조 `goodsCd→productCode`), 실패 시 uncategorized/unknown_product.
- 실/가상: `sourceType`(real_godomall/synthetic_test) 동일 스키마, 가상은 내부 전용(Write 금지).
- 할인/취소금액/코드 실값은 TODO(§6)로 남기고 v0는 무할인·미결제 기준에서 시작.

*문서 끝. (작성: 2026-06-24 · 보완: 2026-06-24 설계검토 반영)*
