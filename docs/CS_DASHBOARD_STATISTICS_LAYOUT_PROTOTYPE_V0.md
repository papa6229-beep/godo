# CS Dashboard Statistics Layout Prototype v0

> **작업명**: `CS Dashboard Statistics Layout Prototype v0`
> **브랜치**: `feature/cs-dashboard-statistics-layout-prototype-v0`
> **상위 컨텍스트**: `docs/CS_LOCAL_STATE_PERSISTENCE_V0.md` 등 CS 줄기 전체.
> **범위**: CS 메인 대시보드 중앙을 리스트 화면 → **통계 상황판**으로 재구성(눈검수용 프로토타입). 실제 WRITE 없음.

---

## 1. 목적

KPI 카드 여백 개선 + 긴 "우선 처리 문의" 리스트 제거 + 5개 통계 블록으로 CS팀장 상황판화. 직원별 처리량·미처리 경과시간 분포는 **의도적 제외**(감시/저우선).

---

## 2. 산출물 / 변경

### 신규
* `src/services/csDashboardStatistics.ts` — `buildCsDashboardStatistics(...)`(leaf, 순환 회피) + 타입. admin workflow·issue products·customer hub 재사용 + completed/approvals/caution/blacklist 반영.
* `scripts/smoke-cs-dashboard-statistics-layout-prototype.mjs` — **17/17 통과**.
* `docs/CS_DASHBOARD_STATISTICS_LAYOUT_PROTOTYPE_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx` — 하단 리스트(우선 처리 문의/주의 리뷰/이슈 상품 리스트)·`PriorityRow`/`ReviewRow`/`IssueRow` 제거 → **5 통계 블록** 렌더. `stats` useMemo(local state 의존). KPI 카드 유지.
* `src/components/CsTeamDashboard.css` — 중앙 padding(6/20/20)·KPI gap 16·min-height + 통계 블록 스타일(막대/flow/랭킹/리스크 카드).

> **미변경**: KPI 4개·팝업·승인 큐·고객관리 Profile Hub·persistence·타 부서. `buildCsDashboardFacts` 등 helper는 유지(다른 smoke 사용).

---

## 3. 통계 블록 (5)

1. **문의 유형 비중**: 결제/주문·환불/취소·배송·상품·일반 + 리뷰, 가로 막대(percent+count). 문의+리뷰 합 기준.
2. **CS 업무 흐름**: 미처리 → 승인 대기 → 승인됨 → 처리완료 → 반려/보류 (flow 카드). **직원별 표시 없음.**
3. **AI 처리 성과**: AI 초안 후보·승인요청·승인·반려·AI 처리완료·승인율. "AI가 초안을 만들고, 운영자가 승인합니다" 문구.
4. **CS 이슈 상품 TOP**: 상품별 문의/리뷰이슈/클레임/주요유형/위험도 랭킹(상위 5).
5. **고객 리스크 요약**: 반복문의·반복환불·취소·주의 고객·블랙리스트 후보·고액 + TOP3(고위험). 블랙리스트는 별도 KPI 아님.

배치: 2열 반응형(유형비중·업무흐름 / AI성과·이슈상품 / 고객리스크 풀폭).

---

## 4. local state 반영

* 처리완료: `completed.length` + answered → workflowSummary.completed, `ai_draft`/`ai_auto_batch` → aiPerformance.aiCompletedCount.
* 승인 큐: approvals status → pendingApproval/approved/rejected, approvalRate.
* 고객관리 toggle: `cautionByKey`/`blacklistByKey`(memberKey) → 고객 리스크 카운트 override.
(smoke #15·#16·#17 검증.)

---

## 5. 제외 (의도)

* **미처리 경과 시간 분포**: 실무 저우선 + KPI/팝업에서 확인 가능 → 미추가(#14).
* **직원별 처리 현황/순위**: 감시·압박 우려 → 미추가(#13). 필요 시 관리자 전용 리포트로 분리.

---

## 6. 안전 검증 (smoke)

KPI 여백/gap class(#1) · 우선처리 리스트·Row 제거(#2) · 5블록 마커 · 직원/경과시간 통계 부재(#13·#14) · 유형비중 6종·percent~100(#3~#5) · workflow 5필드(#6·#7) · AI성과(#8·#9) · 이슈상품 claimCount(#10) · 고객 리스크(#11·#12) · completed/approvals/caution 반영(#15·#16·#17) · WRITE 없음(#18) · 고객관리/승인큐 유지(#19·#20).

---

## 7. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke **17/17** ✅
* 관련 smoke: persistence 20 · approval-queue 20 · customer-hub 22 · work-completion 19 · admin-workflow 20 · data-layout 20 · assignee-layout 15 · popup-ux-polish 19 — 전부 ✅

---

## 8. 다음 작업 제안

* CS Dashboard Statistics UX Polish v0.1(차트 정교화) · 마케팅팀 대시보드 v0 · Approval Queue UX polish · Godomall Board READ/WRITE.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-dashboard-statistics-layout-prototype-v0`, smoke 17/17)*
