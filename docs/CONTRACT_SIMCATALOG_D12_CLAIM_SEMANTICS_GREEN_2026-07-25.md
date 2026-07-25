# SIMULATION-CATALOG-BASELINE-01 D-1.2 GREEN A — 취소·반품·환불 계약

- 날짜: 2026-07-25 · 선행 RED: `DIAG_SIMCATALOG_D12_CLAIM_SEMANTICS_2026-07-25.md`
- 범위: 클레임 원본 보존 · 취소/반품/환불 단일 분류 · 요청↔완료 금액 분리 · 명백한 오분류 교정.
  운영 순매출 공식·기준값 6종 불변. 쓰기 API·상태 변경·환불 실행 없음.

## 1. RAW → 정규화 필드 매핑

RAW(고도몰 스펙)은 **보존**한다(덮어쓰지 않음). 분류는 공통 분류기 `claimEventContract`가 수행.

| RAW(godomallOrderTypes/Codes) | 보존 위치(RevenueClaimSummary) | 정규화 산출(claimEventContract) |
|---|---|---|
| claimData.handleMode (c/r/b/e/z) | `handleModes[]` | eventKind: c→cancel · b→return · r→refund_only · e/z→exchange |
| 라인 orderStatus (c4/b4/r3/e5 …) | `rawStatuses[]` | eventKind 보강 · returnStage(b1~b4) · 완료(r3) |
| claimData.handleCompleteFl (y/n) | `handleCompleteFl` | refundStatus completed(y)/pending(n) |
| claimData.handleDt | `handleDt` | refundedAt(완료 시) |
| claimData.refundPrice | `claimAmount`=`requestedRefundAmount` | requestedRefundAmount(요청) · completedRefundAmount(완료 시만) |
| 헤더 cancelDt(호환 cancel 태그) | `claimTypes`(보존) | 우선순위로 해소(return>refund_only>exchange>cancel) |
| state.shipped/delivered | RevenueOrderLite.shipped/delivered(승격) | 발송 전/후 근거 |

산출 유니온: `eventKind` = cancel/return/exchange/refund_only/unknown · `returnStage` = received/in_transit/on_hold/collected/unknown · `refundStatus` = none/pending/completed/unknown.

## 2. 분류·집계 규칙(확정 업무 기준)

- **취소** = eventKind cancel(발송 전 중단). 반품 건수 미포함.
- **반품 접수** = eventKind return(접수 시점 1건). 회수/입고/검수/환불은 별도 단계·상태.
- **환불 완료금액** = refundStatus completed 인 건의 completedRefundAmount 합만. 요청/대기/미확인 분리.
  - completed: cancel·refund_only 는 `handleCompleteFl='y'` 또는 r3 (결제됨). return 은 r3 있을 때만(그 외 pending).
  - none: 미결제 취소(환불 없음). unknown: 근거 부족(0 단정 금지).
- **동일 사건 중복 집계 0**: eventKind 단일 분류로 취소·반품 양쪽 계상 방지.
- 소비자(SourceOfTruth·CS facts·analytics rate)는 모두 이 분류기를 사용(제각각 정규식 폐기).

## 3. 취소·반품·환불 분류 전후 (실제 2년치 1,315주문)

| 지표 | 전(오분류) | 후(GREEN) |
|---|---|---|
| 반품 건수 | returnedOrders 81 (취소·환불 혼입) | returnReceivedOrders **20** |
| 취소 건수 | cancelledOrders 81 (반품·환불 혼입) | cancelOrders **37** |
| 환불(금액) | refundedRevenue 3,051,446 (요청·완료무관) | completedRefundRevenue **4,211,219**(완료) · pendingRefundRevenue **1,366,172**(반품 대기) · requestedRefundAmount **6,329,071**(요청) |
| 이중집계 | 44건 cancel+refund/return | **0** (취소37+반품20+환불24+교환12+unknown0=93=claim보유) |
| 반품 단계 | 없음 | returnStageBreakdown.collected **20**(b4) |

## 4. 기준값 6종 불변(증거)

net 88,116,982 · 전체 주문 합 98,363,022 · 주문 1,315 · 유효 주문 1,182 · stockImpact 13 · 재고위험 4.
`computeNetOrderRevenue`(유효=paid&&!canceled) 미변경. state.canceled(cancelDt)는 **기준선 전용**으로 유지하고,
claim 분류(eventKind)와 디커플. 검증: `smoke-...-d12-claim-semantics-green-v0.mjs` check 12.

## 5. 정본 vs CS팀장 커스텀 경계

- 정본(불변): eventKind·returnStage·refundStatus·completedRefundAmount·refundedAt. 데이터가 결정.
  CS팀장이 취소↔반품, 미환불↔환불완료로 **변경 불가**.
- 커스텀(표시만): 접수/회수/입고/검수/환불완료 중 우선 표시 지표 선택(뷰 설정). 정본 사건·상태 불변.

## 6. 실제 고도몰 연동 후 재확정(→ GODO-CLAIM-STATS-PARITY-01)

반품 b4↔환불 r3 관계, handleCompleteFl/handleDt 실측 의미, 부분환불 완료금액 필드, 검수/거절 단계,
반품 주문 net 취급, 교환 차액 매출 반영 — 모두 실측 후 확정. 상세: `FOLLOWUP_GODO_CLAIM_STATS_PARITY_01.md`.

## 7. 폐기·교체된 검사(사유)

- D-1.1(`smoke-...-d11...`) `returnedOrders=3` → **returnReceivedOrders=1**: 옛 지표가 취소·환불을 반품으로 오집계(RED F1).
- D-1.1 `refundedRevenue=24000` → **completedRefundRevenue=22000 + pending/requested 분리**: 옛 지표가 완료여부 무시·요청금액 합산(RED F3).
- D-1.1 `cancelledOrders` 근거를 o.canceled→eventKind cancel로 정정(값 동일).
- 나머지 D-1.1 지역 집계 회귀 보호(배송·미결제·수량·고객·CS)는 유지.
