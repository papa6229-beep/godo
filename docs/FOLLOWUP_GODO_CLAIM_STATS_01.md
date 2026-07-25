# 후속 대장 — GODO-CLAIM-STATS-01 (실제 판매몰 API 연결 후 클레임·환불 완료 의미 확정)

- 등록일: 2026-07-25 (D-1.2.1 GREEN B 완료 시) · 상태: **대기(기록 전용, 현재 추측 확정 금지)**
- 배경: D-1.2.1 GREEN B 는 환불 완료를 fail-closed 로 처리(명시 상태코드 r3 만 completed,
  handleCompleteFl='y' 단독·handleDt 는 완료 근거 아님). 실제 고도몰 미연동 상태라 아래 의미를
  **실측으로 확정**해야 한다. 현 단계에서 고도몰 의미를 추측해 확정하지 않는다.

## 착수 조건
- 실제 판매몰 API 연결(개발자 등록 승인·API 키·관리자 익명 시험 주문/취소/반품/환불 생성).

## 실측 확인 항목
1. **handleCompleteFl** — 실제 의미가 "클레임 처리 완료"인가 "금전 환불 완료"인가.
   handleMode(취소 c/반품 b/교환 e/환불 r)별로 y 의 의미가 다른가(단일 코드표 실제 적용 방식).
   - 근거 관찰: `docs/godomall_order_search_spec.md` 필드 설명은 "처리완료여부"이나 코드표는 y="환불완료".
2. **handleDt** — "처리완료일자"가 실제 금전 환불 완료 시각인가, 단순 처리일인가.
   금전 환불 완료 시각 전용 필드(refundCompletedAt 대응)가 실제 응답에 존재하는가.
3. **r3(환불완료 상태코드)** — 실제로 금전 환불이 끝난 시점에만 부여되는가. r1/r2 와의 전이·시점.
4. **부분환불 금액 필드** — refundPrice vs refundUseDeposit/refundUseMileage/refundDeliveryCharge/
   refundCharge 의 합산 규칙, 실제 완료금액 산정식.
5. **취소·반품·환불 완료 시각의 실제 관계** — 취소완료↔환불완료, 반품 회수완료(b4)↔환불완료(r3) 의
   시간 순서·조건.

## 확정 후 반영
- `claimEventContract` 완료 판정 규칙 확정(현 fail-closed 를 실측 기준으로 정밀화).
- `refundCompletedAt` 실 매핑(godomallRevenue.deriveClaimSummary) 연결.
- completedRefundRevenue 실측 대조(현 synthetic 1,685,274 → 실 데이터 값).

## 참고
- D-1.2.1 RED 진단: `docs/DIAG_SIMCATALOG_D121_REFUND_COMPLETION_S29_2026-07-25.md`
- D-1.2.1 GREEN B 계약: `docs/CONTRACT_SIMCATALOG_D121_REFUND_COMPLETION_GREEN_2026-07-25.md`
- 상위 대조 대장: `docs/FOLLOWUP_GODO_CLAIM_STATS_PARITY_01.md`
- 병행: `LINT-FLOWROUTE-01`(기존 lint 1건, 기록 유지)
