# 후속 대장 — GODO-CLAIM-STATS-PARITY-01 (실제 고도몰 클레임·매출통계 대조)

- 등록일: 2026-07-25 (SIMULATION-CATALOG-BASELINE-01 D-1.2 GREEN A 완료 시)
- 선행: D-1.2 GREEN A(취소·반품·환불 원본 보존·단일 분류·요청/완료 금액 분리). 현재 전부 synthetic — 실측 미연동.
- 상태: **대기(착수 조건 미충족)**

## 착수 조건(모두 충족 시 착수)
1. 새 판매몰 개발자 등록 승인
2. API 키 발급
3. 관리자에서 익명 시험 주문·취소·반품·환불 생성 가능

## 배경(왜 필요한가)
D-1.2 GREEN A 는 RAW 근거를 보존하고 확정 업무 기준으로 분류하되, **실제 고도몰 관측값이 없어**
다음을 보수적·명시적으로 두었다(실측 후 확정):
- `handleCompleteFl`/orderStatus 코드의 실측 의미(특히 반품 b4=회수완료 시 환불 완료 여부).
  - 현행 계약(잠정): 반품(return)은 명시적 환불완료 코드(r3)가 없으면 `refundStatus=pending`.
    cancel·refund_only 는 `handleCompleteFl='y'` 또는 r3 → completed.
- RAW 에 없는 '검수 중'·'환불 거절' 단계는 생성하지 않음(내부 fixture 시험만, 실측 정본 아님).
- 반품 단계는 RAW b1~b4(접수/반송중/보류/회수완료)만 매핑. 검수/거절은 실측 후.

## 후속 검증 대상(대조)
- **고도몰 관리자 통계**(취소/반품/환불/교환 건수·금액·완료 상태)
- **API 원본**(Order_Search orderStatus 코드, claimData.handleMode/handleCompleteFl/handleDt/refundPrice)
- **우리 시스템 계산**(claimEventContract 분류 · DS claimUniverse · 완료 환불금액)
- **3층 계산 구조 정합**:
  1. 고도몰 기준(관리자 통계와 동일 정의)
  2. 회사 기본 기준(운영 순매출/유효주문 등 내부 canonical)
  3. 질문별 맞춤 기준(채팅 Query Plan 축·필터)

## 확정할 항목(실측 후)
- 반품 회수완료(b4) ↔ 환불완료(r3)의 실제 시간·상태 관계 → 반품 refundStatus 규칙 확정.
- `handleCompleteFl`/`handleDt`의 실제 채워짐 여부·의미 → completed/ pending/ unknown 판정 확정.
- 부분 환불의 실제 완료금액 필드(refundPrice vs refundUseDeposit/Mileage/DeliveryCharge/Charge 합산 규칙).
- 환불 거절·검수 단계의 실제 코드 유무 → returnStage 확장 여부.
- 취소↔반품 net(운영 순매출) 취급 최종 결정(§ D-1.2 진단 §9-1: 반품 주문의 매출 포함/제외).
- 교환 차액(exchageInfoData)의 매출 반영 여부.

## 참고
- D-1.2 RED 진단: `docs/DIAG_SIMCATALOG_D12_CLAIM_SEMANTICS_2026-07-25.md`
- D-1.2 GREEN A 계약: `docs/CONTRACT_SIMCATALOG_D12_CLAIM_SEMANTICS_GREEN_2026-07-25.md`
- 분류기: `src/services/claimEventContract.ts`

---

## 병행 후속 — LINT-FLOWROUTE-01
- `scripts/flowRouteSmoke.ts:49` `@typescript-eslint/no-explicit-any` 1건(기존, D-1.1/D-1.2 무관).
- 이번 작업에 섞지 않음. 별도 정정 예정(기록 유지).
