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

## 4. 매출 계산 기준 (설계 합의)

```
상품매출(상품성과) = Σ(line.goodsPrice × line.goodsCnt)   ← 라인합 (헤더 totalGoodsPrice는 검증용 대조)
배송비(별도)       = Σ totalDeliveryCharge                ← 상품매출에 미혼입
총 주문금액        = settlePrice (또는 상품매출 + 배송비)
```
- **확정매출(메인)** = `confirmed(finishDt 있음)` 주문의 상품매출 → 취소/반품이 구조적으로 제외되어 가장 신뢰도 높음.
- **결제완료 총매출(보조)** = `paid && !canceled` 주문의 상품매출 → 선행지표("잠정매출"로 라벨).
- **취소 차감** = `canceled` 주문 상품매출 별도 표기.
- 상품 성과는 **라인 단위 `goodsPrice×goodsCnt`** 기준(헤더-라인 불일치/부분취소 대비). 배송비는 주문 단위 별도 합산.

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
  goodsPrice: number;     // 단가
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
2. 카테고리별 매출 = `goodsNo → Products.categoryCode/allCategoryCode` 조인(주문 단독 불가, 키 존재 확인됨).
3. 상품명 변경 내성 = `goodsNo`(불변) 기준 조인. `goodsNm` 텍스트 매칭 금지.
4. 실/가상 = `sourceType`으로 분리, 집계 시 필터 가능. 가상은 고도몰 미등록(Write 금지), GODO 내부 전용.
5. 상태 판별 = §3 날짜필드 우선 + 확정 코드(o1 등) 보조.

### 가상 데이터 생성 시 필요한 필드 (위 RevenueOrder 스키마와 동일)
헤더: orderId, orderNo, orderDate, paymentDt, invoiceDt, deliveryDt, deliveryCompleteDt, finishDt, cancelDt, orderStatus, settleKind, settlePrice, totalGoodsPrice, totalDeliveryCharge, sourceType(`synthetic_test`)
라인: goodsNo, goodsCd, goodsNm, goodsCnt, goodsPrice, lineOrderStatus

---

## 6. 미해결/후속 확인 항목
- 결제완료/배송/구매확정/취소/반품/환불 **코드 실값** — 해당 상태 실주문 발생 시 동일 probe로 확인해 §2 표 잠금.
- 취소/환불 **금액 표현 방식(원주문 갱신 vs 별도 레코드)** — 취소 실주문 발생 시 검증. 그 전까지 확정매출(finishDt) 기준으로 우회.
- 부분취소/부분반품 라인 단위 수량·금액 차감 — CS/주문관리팀 단계 과제.

*문서 끝. (작성: 2026-06-24)*
