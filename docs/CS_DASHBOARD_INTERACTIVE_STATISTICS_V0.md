# CS Dashboard Interactive Statistics v0

> **작업명**: `CS Dashboard Interactive Statistics v0`
> **브랜치**: `feature/cs-dashboard-interactive-statistics-v0`
> **상위 컨텍스트**: `docs/CS_DASHBOARD_STATISTICS_LAYOUT_PROTOTYPE_V0.md`.
> **범위**: CS 통계를 **기간 필터 + 클릭 진입점**으로. 실제 WRITE 없음.

---

## 1. 목적

"통계는 보는 것이 아니라 클릭해서 처리하는 입구다." 기간 필터로 KPI·5통계 전체를 함께 바꾸고, 통계 항목 클릭 → 기존 CS 팝업(초기 필터/탭/선택 지정) → 처리 → KPI·통계 즉시 반영.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csDashboardTimeFilter.ts` — `CsTimeRange`/`CS_TIME_RANGES`/`inCsTimeRange`/`filterCsInputsByTime`(orders 제네릭으로 타입 보존). 날짜 없는 항목은 기간 필터 제외(전체엔 포함).
* `src/services/csDashboardInteractions.ts` — `CsPopupIntent` + 매퍼(`typeSliceToIntent`/`workflowStepToIntent`/`aiMetricToIntent`/`riskCardToIntent`/`riskCustomerToIntent`/`issueProductToIntent`).
* `scripts/smoke-cs-dashboard-interactive-statistics.mjs` — **27/27 통과**.
* `docs/CS_DASHBOARD_INTERACTIVE_STATISTICS_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx`
  * 기간 필터 pill(전체/오늘/7일/30일/이번 달 + 직접 선택 placeholder). `filtered` = 기간 적용 입력 → wf/stats/customerHub/리스트 전부 그 입력으로.
  * `openKpi`/`approvalOpen` → 단일 `intent` state. KPI 카드·승인큐 버튼·**모든 통계 항목 클릭** → intent. 팝업은 intent.kind로 렌더 + 초기 탭/필터/선택 전달.
  * 팝업 초기상태 props 추가: CsItemPopup `initialTab`, CsResolvedPopup `initialTab`(+AI 처리완료 탭), CsApprovalQueuePopup `initialTab`, CsCustomerProfilePopup `initialFilter`/`initialCustomerKey`.
  * 신규 `CsIssueProductPopup`(상품별 관련 문의/리뷰/클레임 + "상품관리팀 전달 후보" 표시).
* `src/components/CsTeamDashboard.css` — 기간 pill + 클릭 가능 통계 hover/cursor.

> **미변경**: 처리완료/승인큐 흐름·고객관리 Profile Hub·persistence·타 부서. 직원별/경과시간 통계 없음.

---

## 3. 기간 필터

* 적용 대상: KPI 4 + 5 통계 블록 전부(같은 `filtered` 입력 사용).
* 날짜 기준: 문의 createdAt · 리뷰 createdAt · 주문 orderDate · 완료 completedAt · 승인 createdAt.
* 날짜 없는 항목: 기간 필터에서 제외, '전체'엔 포함(smoke 검증).

---

## 4. 클릭 → intent 매핑

| 통계 | 클릭 → 팝업(초기) |
|---|---|
| 문의 유형(결제/환불/배송/상품/일반) | 미처리 팝업 + 해당 탭 |
| 문의 유형(리뷰) | AI 자동처리함 + 리뷰답글 탭 |
| 업무 흐름 미처리/승인대기/승인됨/처리완료/반려·보류 | 미처리 / 승인큐(pending) / 승인큐(approved) / 처리완료 / 승인큐(rejected) |
| AI 성과 초안후보/승인요청/승인/반려/AI처리완료 | aiAuto / 승인큐(pending/approved/rejected) / 처리완료(AI 탭) |
| 이슈 상품 row | 상품 이슈 상세 팝업 |
| 고객 리스크 카드 | 고객관리 + 해당 필터 |
| TOP 위험 고객 | 고객관리 + 해당 고객 선택 |

---

## 5. 작업 후 즉시 반영

통계 팝업에서 처리완료/승인/반려/고객 toggle → `completed`/`approvals`/`custCaution`·`custBlacklist` state 변경 → `filtered`/stats/wf/customerHub useMemo 재계산 → KPI·5통계 즉시 갱신(persistence도 저장). smoke #20·#21·#22로 입력 반영 검증.

---

## 6. 디자인

클릭 가능 통계에 `cs-stat-clickable`(cursor pointer + hover 강조 + "클릭해서 보기" title). 기간 pill segmented. 라이트/다크 hover 대비 유지.

---

## 7. 안전 검증 (smoke)

기간 pill/상태(#1·#2) · 클릭 가능(#9) · 직원/경과시간 통계 부재(#23·#24) · WRITE 없음(#25) · inCsTimeRange/날짜없음/7일 필터 · 기간→통계 반영(#3~#8) · intent 매퍼 10종(#10~#19) · completed/approvals/caution 반영(#20~#22).

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke **27/27** ✅
* 관련 smoke: statistics-prototype 17 · persistence 20 · approval-queue 20 · customer-hub 22 · work-completion 19 · admin-workflow 20 · assignee-layout 15 · popup-ux-polish 19 — 전부 ✅

---

## 9. 다음 작업 제안

* CS Dashboard Interactive UX Polish v0.1 · 마케팅팀 대시보드 v0 · Approval Queue UX polish · Godomall Board READ/WRITE Bridge.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-dashboard-interactive-statistics-v0`, smoke 27/27)*
