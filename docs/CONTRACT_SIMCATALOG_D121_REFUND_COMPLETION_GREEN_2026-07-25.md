# SIMULATION-CATALOG-BASELINE-01 D-1.2.1 GREEN B — 환불 완료 fail-closed · S29 의미 가드

- 날짜: 2026-07-25 · 선행 RED: `DIAG_SIMCATALOG_D121_REFUND_COMPLETION_S29_2026-07-25.md`
- 범위: (B-1) 환불 완료 판정 보정 · (B-2) S29 를 값·의미 회귀검사로 대체. 제품 순매출 공식·기준값 불변.

## B-1. 환불 완료 판정 (claimEventContract)

계약(fail-closed):
- `handleCompleteFl='y'` = 스펙 필드명 "처리완료여부" → **클레임 처리 완료일 뿐, 금전 환불 완료 근거 아님**. completed 로 보지 않는다.
- `handleDt` = "처리완료일자" → 단독으로 `refundedAt` 에 넣지 않는다.
- **명시 환불완료 상태코드 `r3`** 만 `refundStatus=completed` 의 근거로 인정. (반품 b4 는 r3 없으면 pending 유지.)
- `refundedAt` 은 **확인된 환불완료 시각 필드(`refundCompletedAt`)** 가 있을 때만 기록(현재 RAW 미제공 → 대개 비움).
- handleCompleteFl='n' → pending · 그 외(미확인·'y'만) → **unknown**(0원 단정 금지).
- 미결제 취소 → none·0. 교환 → none(영향 없음). 부분환불 금액만 있고 완료근거 없으면 unknown.
- 원본 rawClaim·handleCompleteFl·handleDt 는 바이트 수준 보존(분류기 무변형).

### 수정 전후 판정표 (paid 기준)
| 조합 | 전(GREEN A) | 후(GREEN B) |
|---|---|---|
| c4 + handleCompleteFl=y | completed·refundedAt=handleDt | **unknown·refundedAt 없음** |
| c4 + handleCompleteFl=y + **r3** | completed | completed(명시 근거) |
| b4 + handleCompleteFl=y (r3 없음) | pending | pending(불변) |
| r3 환불완료 | completed | completed(불변) |
| handleCompleteFl=n | pending | pending(불변) |
| 미결제 취소 | none | none(불변) |
| 부분환불·완료근거無 | unknown | unknown(불변) |

### 실데이터 효과 (2년치 1,315주문)
- **completedRefundRevenue 4,211,219 → 1,685,274** = r3 근거(환불만 24건)만.
- 제외된 **2,525,945**(취소 37건, 처리완료이나 금전환불 미확인)는 소실·0단정 없이
  `claimUniverse.unknownRefundRevenue` 로 **금액 보존**(원본 rawClaim 도 보존).
- pendingRefundRevenue 1,366,172(반품 20) · requestedRefundAmount 6,329,071 불변.
- 구성: requested 6,329,071 = completed 1,685,274 + pending 1,366,172 + unknown 2,525,945 + 교환(none) 751,680.

### refundedAt 생성 조건
`refundStatus==='completed'` **그리고** `refundCompletedAt`(확인된 환불완료 시각) 존재 시에만.
handleDt(처리완료일자)로는 채우지 않는다. 현재 RAW 는 refundCompletedAt 미제공 → 완료여도 비움.

## B-2. S29 보호력 보정 (값·의미 회귀검사)

- 파일 두 개 단순 제외/regex 보정 금지. 대신 **값-잠금 스모크**(`smoke-...-d121-value-lock-green-v0`)를
  신설: 손검산 RAW fixture 를 **실제 파이프라인**(mapOrdersToRevenue→summarizeRevenue→DS)에 태워
  값 비교.
- **S29 의미 변경**: "고정 기준점 이후 특정 파일 변경 여부"(파일명 커밋 감시) →
  "**계산 의미·기준값 회귀**"(값-잠금 스모크 통과 여부). 번호 S29 유지, 주석·본 문서에 의미 변경 명시.

### 보호 범위 표 (값-잠금, 빠진 숫자 없음)
| 값 | 검사 | 손계산 |
|---|---|---|
| 전체 주문금액 totalAmount | V1 | 41000 |
| line/gross productRevenueByLines | V2·V4 | 37000 |
| 배송비 합계 deliveryFeeTotal · shippingRevenue | V3 | 6000 |
| paid/unpaid/canceled 주문수 | V5 | 4/1/3 |
| totalOrders/validOrders/unpaidOrders | V6 | 5/1/1 |
| net operationalRevenue | V7 | 12000 |
| 취소/반품접수/환불만/교환/unknown 사건수 | V8 | 1/1/1/0/0 |
| completedRefundRevenue(완료·r3만) | V9 | 5000 |
| pending/unknown 환불 구별 | V10 | 8000/6000 |
| requestedRefundAmount(=완료+대기+미확인) | V11 | 19000 |
| RAW 보존·완료 오단정 0 | V12 | — |

(기존 D-1.1 보호값 — 배송·미결제·수량·고객·CS — 는 D-1.1 스모크에서 계속 보호.)

### 음성 변형별 실제 실패 증거 (변형→값-잠금 실패→원복 diff 0)
| 변형 | 검출 검사 |
|---|---|
| deliveryFeeTotal +1 | V3 (fee=6005) |
| canceledOrderCount +2 | V5 (canceled=6) |
| lineRevenue +1 (gross) | V2·V4 (37005) — 이전 무보호였음 |
| handleCompleteFl=y 를 환불완료로 재오분류 | V9·V10 (completed 11000·unknown 0) |

## 불변 유지
`88,116,982 / 98,363,022 / 1,315 / 1,182 / stockImpact 13 / 재고위험 4` · `computeNetOrderRevenue`
변경 없음. 취소 37·반품 20 불변. 쓰기 API·상태 변경·환불 실행 없음.

## 실측 후 재확정 (→ GODO-CLAIM-STATS-01)
handleCompleteFl/handleDt/r3 실제 금융 의미, 부분환불 완료금액 필드, 취소·반품·환불 완료 시각 관계.
확정 전까지 완료 환불 fail-closed 유지.
