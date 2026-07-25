# SIMULATION-CATALOG-BASELINE-01 D-1.2.1 — 환불 완료 근거·S29 보호력 RED 감사

- 날짜: 2026-07-25 · 기준 HEAD: `4a5ff9c` · main=origin/main=`8981bdf`
- 성격: **RED 진단 전용. 제품 소스 변경 0.** 수치는 현재 제품 함수(claimEventContract) 직접 실행 관측.
- 두 핵심 질문:
  1. `handleCompleteFl='y'` = "클레임 처리 완료"인가 "실제 금전 환불 완료"인가?
  2. S29 = 계산식 의미 가드인가, 파일명 커밋 트리wire인가?

---

## 1. 조합별 현재 실제 판정값 (claimEventContract, paid 기준)

| 조합 | eventKind | refundStatus | completedRefundAmount | refundedAt | 판정 |
|---|---|---|---|---|---|
| c4 + handleCompleteFl=y + refundPrice + handleDt | cancel | **completed** | **5000** | **=handleDt** | ⚠️ 취소를 y만으로 환불완료 단정 |
| b4 + handleCompleteFl=y (r3 없음) | return | pending | 0 | 없음 | ✅ 회수완료≠환불완료(현행 옳음) |
| r1 환불접수 | refund_only | unknown | 0 | 없음 | ✅ |
| r2 환불보류 | refund_only | unknown | 0 | 없음 | ✅ |
| r3 환불완료 | refund_only | completed | 10000 | 없음 | 상태코드 근거(단 실측 미확인) |
| refund + handleCompleteFl=n | refund_only | pending | 0 | 없음 | ✅ |
| cancel + handleDt만(completeFl·r3 없음) | cancel | unknown | 0 | 없음 | ✅ handleDt 단독은 완료 아님 |
| e5 교환완료 | exchange | none | 0 | 없음 | ✅ 환불 아님 |
| 부분환불 금액有·완료근거無 | refund_only | unknown | 0 | 없음 | ✅ 0으로 완료 단정 안 함 |
| 미결제 취소 c4+y (unpaid) | cancel | none | 0 | 없음 | ✅ 환불 없음 |

**특히 확인한 것:**
- `b4` 회수완료가 completed로? → **아니오**(pending). 현행 옳음·보존 대상.
- 일반 `handleCompleteFl=y`만으로 completedRefundAmount 합산? → **예(cancel/refund_only)**. ⚠️
- 일반 처리일 `handleDt`가 refundedAt으로 오인? → **예(완료로 판정될 때)**. ⚠️
- 취소 `c4`만으로 환불 완료 단정? → c4 단독은 unknown, 그러나 **c4+handleCompleteFl=y → completed**(사실상 y로 단정). ⚠️
- 완료근거 없는 값을 0/완료로 단정? → 완료로는 단정 안 함. 단 **handleCompleteFl=y 를 완료 근거로 과신**.

---

## 2. 금융 환불 완료 근거 vs 미확정 근거 분리 (실제 2년치 1,315주문)

`completedRefundRevenue` 현재 **4,211,219원**을 근거 강도로 분해:

| 근거 | 금액 | 강도 |
|---|---|---|
| r3(orderStatus '환불완료' 상태코드) | 1,685,274 (환불만 24건) | 상태 수준 명시 — 단 실측 미확인 |
| **handleCompleteFl='y' 만 (c4 취소 37건)** | **2,525,945** | **미확정 — "처리완료"≠"환불완료" 소지** |

- fail-closed 적용 시(handleCompleteFl=y 를 처리완료로만 인정) 완료 인정액 ≈ **1,685,274**, 나머지 **2,525,945 은 unknown 강등**(0 아님).
- `handleDt→refundedAt` 표기 건: 실데이터 0건(universe claimData 에 handleDt 부재, regDt만) — 그러나 로직상 handleDt 존재 시 발화(조합표 1행). 잠재 위험.

### 저장소·명세 근거 (직접 인용)
- `api/_shared/godomallOrderTypes.ts:181` `handleCompleteFl?: string; // 처리완료여부 (코드표 y/n)` — 필드 의미 **"처리완료여부"**.
- `api/_shared/godomallOrderTypes.ts:184` `handleDt?: DateStr; // 처리완료일자` — **"처리완료일자"**(환불완료일 아님).
- `docs/godomall_order_search_spec.md:378` `handleCompleteFl | STRING | 처리완료여부 코드표 참조` · `:381` `handleDt | DATETIME | 처리완료일자`.
- `docs/godomall_order_search_spec.md` 코드표(619~): `handleCompleteFl 코드값: y 환불완료 / n 환불접수`.
- **모순**: 필드 설명은 "처리완료여부/처리완료일자"인데 코드 라벨은 "환불완료". 단일 코드표가 handleMode(취소 c/반품 b/교환 e/환불 r) 전체에 적용됨 — 반품·교환의 y도 "환불완료"로 라벨됨(의미 혼재).
- **실측 부재**: godomall 미연동(전부 synthetic). 생성기 `syntheticCommerceUniverse.ts:340`·`syntheticGodomallOrders.ts:273` 이 handleCompleteFl='y' 를 **모든 클레임에 무조건** 부여.

### 판정
- **"handleCompleteFl='y' = 실제 금전 환불 완료" 는 미확정**: 명세 코드 라벨(환불완료)은 존재하나, ①필드명(처리완료)과 불일치 ②전 handleMode 공용 ③실측 미연동·생성기 무조건 부여 — 신뢰 근거 불충분.
- **"handleDt = 환불 완료일" 은 직접 근거 없음**: 명세가 "처리완료일자"로 명시. 환불완료일이라는 문구 없음.
- **r3(환불완료 상태코드)** 은 상태 수준의 명시 근거로 상대적으로 강하나, 역시 실측 미확인 → 최종은 GODO-CLAIM-STATS-PARITY-01.

---

## 3. 잘못 표시될 가능성 있는 소비자 전수

현재 `completedRefundRevenue`·`refundStatus`·`refundedAt`·`completedRefundAmount`·`claimUniverse`·`returnReceivedOrders` 를 **읽는 UI/engine/service 는 없음**(grep 0건). 오표시는 **잠재**(정본 DS 스냅샷엔 존재, 미렌더).

노출 경로가 될 지점(장래 소비 시 미확정분 2,525,945를 "환불 완료"로 표시할 위험):
- `departmentDataSourceOfTruth` `revenueUniverse.completedRefundRevenue` · `claimUniverse.completedRefundAmount/completedRefundCount` — DS 스냅샷 정본 필드.
- `claimEventContract.userLabelOfClaim` → refundStatus completed 시 문구 **"환불 완료"**(취소 미확정분 포함).
- (분류만 소비, refundStatus 미사용이라 현재 영향 없음): `analyticsQueryEngine` cancel/return/refund/exchangeRate, `csCustomerManagementFacts`·`csTeamDashboardFacts` refundCancelCount — eventKind 만 사용.

---

## 4. S29 실패의 정확한 원인

- 스모크: `scripts/smoke-rc2-d131-stop-request-collab-testrun-red-v0.mjs` S29(라인 469~).
- 기준선: `d4334f38bee1125553e26b392ccf30420ea58c23` · 판정: `git diff --name-only <baseline> HEAD` 결과에 regex 매칭 여부.
- regex: `/departmentDataService|godomallRevenue|godomallMapper|inquiryStatusContract|commerceDataQueryEngine/`.
- 감지 파일(현재): `api/_shared/godomallRevenue.ts`, `src/services/departmentDataService.ts` — **D-1.2 claim 원본 보존·RevenueOrderLite 확장** 때문(계산식 변경 아님).
- 성격: **커밋 기반 파일 트리wire**. 계산식 "의미"를 검증하지 않고, 파일이 커밋에서 바뀌었는지만 본다. 작업 트리 계산식 변형엔 무반응(음성 실험 §5).
- 전체 스모크 현재 `116 pass / 1 fail`(유일 실패=S29) 재현됨.

---

## 5. 파일 가드 제거 시 빠지는 보호 범위 (음성 실험)

godomallRevenue 계산식을 일부러 변형(작업 트리)하고 값 스모크 7종으로 검출력 조사 후 즉시 원복(diff 0):

| 변형 | 잡은 값 스모크 | 결론 |
|---|---|---|
| `totalAmount += o.totalAmount + 1` (기준선 98,363,022) | D-1 GREEN, D-1.2 GREEN | ✅ 값-잠금됨 |
| `deliveryFeeTotal += o.deliveryFee + 1` (배송매출·비기준선) | **없음** | ✗ 무보호 |
| `canceled += 2` (canceledOrderCount·비기준선) | **없음** | ✗ 무보호 |
| `lineRevenue = goodsPrice * quantity + 1` (gross/productRevenueByLines) | **없음** | ✗ 무보호 |

(값 스모크 7종: d1-green, d12-green, cross-team-parity, department-data-source, commerce-data-contract, metric-definition-parity, c2-revenue-basis-parity)

### 답: 기준값 6종 외 보호되지 않는 계산값
`net·전체합·주문수·유효주문·재고영향·재고위험` 6종만 값-잠금. **다음은 무보호**:
- `deliveryFeeTotal`(→ shippingRevenue), `productRevenueByLines`(gross), `canceledOrderCount`,
  그리고 같은 계열 `paidOrderCount·unpaidOrderCount·confirmedOrderCount·productRevenueByHeader·syntheticTotalNetSoldQuantity` 등 summarizeRevenue 비기준선 집계.

### 시사점
- S29 는 계산식 버그를 잡지 못한다(커밋 트리wire·의미 미검증). 위 무보호 계산식이 커밋으로 바뀌어도 S29 는 "파일 변경"만 알릴 뿐 값 검증은 못 한다.
- 따라서 **departmentDataService/godomallRevenue 를 S29 에서 단순 제외하면**, 유일한 남은 트리wire(강제 리뷰 신호)까지 사라지고, 무보호 계산식에 대한 실질 보호는 여전히 0 이다.
- **단순 파일 제외로 116/1 을 맞추면 안 된다**(업무 지시). 제외 전에 무보호 비기준선 계산식의 **값-잠금 보완**이 선행돼야 한다.

---

## 6. 최소 GREEN 예상 (미구현 — 승인 후)

### GREEN B-1 — 환불 완료 fail-closed (제품)
- `claimEventContract.ts`: cancel/refund_only 의 `handleCompleteFl='y'` 단독을 completed 로 보지 않는다.
  완료 인정 = **명시적 금융 근거(r3 상태코드)** 또는 실측 확정 근거만. 그 외 handleCompleteFl='y' → `unknown`(처리완료로 보존, 0 아님). `handleDt` → refundedAt 사용 중단(금융 완료일 근거 없음).
- 효과(실데이터): completedRefundRevenue 4,211,219 → r3 근거 1,685,274, 나머지 2,525,945 은 unknown.
- 기준값 6종·`computeNetOrderRevenue` 불변(claim 분류는 net 과 디커플).

### GREEN B-2 — S29 의미 정정 + 값-잠금 보완 (검사)
- 무보호 비기준선 계산식(deliveryFeeTotal/shippingRevenue·gross/productRevenueByLines·canceledOrderCount 등)을 **실데이터 값-잠금**(D-1.2 GREEN 스모크에 기준값 추가). 음성 실험으로 검출 확인.
- 그 후에만 S29 에서 departmentDataService/godomallRevenue 를 **의미 정정**(adab344 선례: 계산 공식 모듈로 좁히고, 값-잠금이 실질 보호를 대신함을 명시). 단순 제외 금지.

### 예상 파일·검사
- 제품: `src/services/claimEventContract.ts`(fail-closed).
- 검사: `smoke-...-d12-claim-semantics-green` 확장(비기준선 값-잠금·완료 근거), `smoke-...-d121-refund-completion` RED→GREEN 전환, `smoke-rc2-d131...` S29 의미 정정(값-잠금 선행 후).

---

## 7. 실제 고도몰 연동 후 재확정 (→ GODO-CLAIM-STATS-PARITY-01)
- handleCompleteFl='y' 의 실제 금융 의미(처리완료 vs 환불완료), handleMode별 차이.
- handleDt 가 환불 완료일인지 처리일인지.
- r3(환불완료) 상태의 실제 시점·금액 정합.
- 부분환불 실제 완료금액 필드(refundPrice vs refundUse* 합산).
- 위 확정 전까지 완료 환불은 fail-closed 유지.

## 8. 불변 유지
`88,116,982 / 98,363,022 / 1,315 / 1,182 / stockImpact 13 / 재고위험 4` · `computeNetOrderRevenue` 변경 없음. 쓰기 API·상태 변경·환불 실행 없음.
