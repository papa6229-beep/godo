# CS Work Completion Flow v0

> **작업명**: `CS Work Completion Flow v0`
> **브랜치**: `feature/cs-work-completion-flow-v0`
> **상위 컨텍스트**: `docs/CS_POPUP_ASSIGNEE_LAYOUT_HOTFIX_V0.md` · `docs/CS_DASHBOARD_ADMIN_WORKFLOW_RESTRUCTURE_V0.md`.
> **범위**: CS 업무 완료 트리거(로컬). 미처리/AI함 → 처리완료 이동. **고객관리 제외. 실제 WRITE 없음.**

---

## 1. 목적

CS 업무 흐름을 닫는다: 확인 → AI 초안/직접 답변 → 담당직원 → **처리 완료** → 미처리 목록 제외 → 처리완료 이력 기록. AI 자동처리함(리뷰·배송)도 선택/전체 처리완료 트리거.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csWorkCompletionState.ts` — 완료 상태 순수 모델: `CsCompletedWorkItem`, `buildCompletedWorkItem`, `addCompletedWorkItems`(dedup), `completedOriginalIdSet`, `isAiAutoCompletable`, `toResolvedItem`, `completionKey`.
* `scripts/smoke-cs-work-completion-flow.mjs` — **19/19 통과**.
* `docs/CS_WORK_COMPLETION_FLOW_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx` — 완료 state(`completed`) 메인으로 lift. 미처리 상세에 **"처리 완료" 버튼**(직접 답변 우선, 없으면 AI 초안). AI함 actions에 **"선택/전체 처리완료"**(disabled 승인요청 대체). 미처리/AI함 목록은 완료 originalId 제외, 처리완료 목록은 local 완료 prepend. 처리완료 상세는 local 완료의 **실제 answerText** 표시 + 처리방식/등록상태 배지.
* `src/services/csTeamDashboardFacts.ts` — `CsResolvedItem`에 `answerText`/`localCompleted`/`completionMethod`/`writeStatus` 추가.
* `src/components/CsTeamDashboard.css` — 처리 완료 버튼·완료 안내 스타일(+라이트).
* `scripts/smoke-cs-popup-ux-layout-polish.mjs` — AI함 버튼 단언을 처리완료로 갱신(무회귀).

> **미변경**: 고객관리(콜백/버튼 없음 확인). Approval Queue·직원 DB·Board READ 없음. product/marketing/manager 무변경.

---

## 3. 완료 흐름

```
미처리 문의 상세
  AI 초안 보기/다시 만들기 · 직접 답변 작성 · [처리 완료]
  → answerText(직접답변 우선, 없으면 AI 초안) + assignee + method
  → completed에 추가(dedup: sourceType:originalId)
  → 미처리 목록에서 제외(originalId) → 처리완료에 prepend

AI 자동처리함(리뷰·배송만)
  전체/선택 초안 만들기 · [선택/전체 처리완료]
  → draft 있는 리뷰/배송만(isAiAutoCompletable) → method 'ai_auto_batch'
  → AI함에서 제외 → 처리완료에 prepend
```

* **완료 조건**: 미처리는 답변/AI초안 없으면 "답변 내용 또는 AI 초안이 필요합니다" 안내. AI함은 draft 없는 항목 제외.
* **중복 방지**: `completionKey(sourceType, originalId)` 기준 dedup.

---

## 4. 완료 item 구조 (WRITE 대비)

```ts
CsCompletedWorkItem = {
  id, originalId, sourceType:'inquiry'|'review'|'delivery',
  title, type, productName, orderNo, customerName?, memberId?,
  originalText?, answerText, assignee?, completedAt,
  completionMethod:'ai_draft'|'manual_reply'|'ai_auto_batch',
  completionStatus:'completed_local', stage:'처리 완료',
  writeStatus:'not_connected', writeTarget:{ platform:'godomall', targetType:'inquiry_reply'|'review_reply', targetId },
  order?, customer?
}
```

* v0: `writeStatus` 항상 `not_connected`. UI "등록상태: WRITE 미연결". 나중에 WRITE 연결 시 동일 트리거 → `writeTarget`로 실제 등록.
* 고객 PII(customerName/memberId)는 CS UI 경로(contacts→customer 블록)에서만 채워짐. 미처리 입력 담당직원(`assignee`)이 완료 이력에 저장 → 처리완료 상세에 표시(없으면 "미기록").

---

## 5. 처리완료 표시

* 리스트: local 완료 prepend, "방금 완료" 배지 + 담당직원.
* 상세: "처리한 답변"에 **실제 answerText**(placeholder 아님) + "WRITE 미연결" 배지. 처리 기록에 처리방식(직접 답변/AI 초안/AI 자동처리 일괄)·등록상태.
* 기존 computed 완료 이력(answerText 없음)은 기존대로 placeholder 유지.

---

## 6. 안전 검증 (smoke)

처리 완료 버튼·조건(#1·#2) · 완료 item 필드/answerText/assignee/completedAt(#5~#8) · writeStatus not_connected + writeTarget(#9) · resolved 매핑 answerText/assignee(#12~#14) · AI함 선택/전체 처리완료(#15·#16) · draft 없으면 제외·리뷰/배송만(#17·#20·#21) · review writeTarget review_reply(#19) · 중복 방지(#22) · 미처리 제외/처리완료 추가(#10·#11) · **WRITE/네트워크 호출 없음(#23)** · **고객관리 콜백 없음(#24)**.

---

## 7. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-work-completion-flow.mjs` **19/19** ✅
* 관련 smoke: assignee-layout 15 · popup-ux-polish 19 · admin-workflow 20 · detail-enrichment 19 · kpi-popup-revision 19 · runtime-wiring 19 — 전부 ✅

---

## 8. 한계 / 다음 작업 제안

* 완료 상태는 세션 local(미영속). 새로고침 시 초기화(v0 허용).
* **다음 작업 후보**:
  1. **CS Draft → Approval Queue HITL**: 처리완료 트리거 → 승인 큐 → 실제 등록(WRITE). `writeStatus` pending→success 전이.
  2. **Godomall WRITE Bridge v0**: `writeTarget` 기반 실제 inquiry/review 답변 등록.
  3. 고객관리 UX 개편 / 완료 이력 영속화.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-work-completion-flow-v0`, smoke 19/19)*
