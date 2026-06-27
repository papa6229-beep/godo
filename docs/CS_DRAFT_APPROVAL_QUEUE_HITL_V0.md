# CS Draft → Approval Queue HITL v0

> **작업명**: `CS Draft → Approval Queue HITL v0`
> **브랜치**: `feature/cs-draft-approval-queue-hitl-v0`
> **상위 컨텍스트**: `docs/CS_WORK_COMPLETION_FLOW_V0.md` · `docs/CS_CUSTOMER_MANAGEMENT_PROFILE_HUB_V0.md`.
> **범위**: CS 답변/초안을 승인 큐로 보내 사람 검수(승인/반려). **실제 WRITE 없음.**

---

## 1. 목적

처리 완료 외에 **Human-in-the-loop 승인 흐름**을 추가: AI 초안/직접 답변 → 승인요청 → 운영자 검수(승인/반려). 승인해도 v0는 고도몰 WRITE 없음(`writeStatus: not_connected`).

---

## 2. 설계 결정 (기존 승인 인프라와의 관계)

* 저장소에 기존 `src/types/approval.ts`(`ApprovalItem`) + `ApprovalDetailModal`/`ApprovalListModal`이 있으나, 이는 **task/agent 엔진 도메인**(taskId·requestedByAgentId·riskLevel)으로 CS 답변과 성격이 다름.
* 대규모 교차 개편을 피하고 CS 흐름과 일관되게 **CS 전용 Approval Queue surface**를 추가(자체 bridge + CS 대시보드 내 팝업). 기존 전역 승인 시스템은 건드리지 않음.

---

## 3. 산출물 / 변경

### 신규
* `src/services/csApprovalQueueBridge.ts` — 순수: `CsApprovalQueueItem` + `buildCsApprovalItem` / `addCsApprovalItems`(dedup) / `approveCsApprovalItem` / `rejectCsApprovalItem` / `csApprovalStatusByOriginalId` / `isCsApprovalDuplicate` / `csApprovalKey`.
* `scripts/smoke-cs-draft-approval-queue-hitl.mjs` — **20/20 통과**.
* `docs/CS_DRAFT_APPROVAL_QUEUE_HITL_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx`
  * 미처리 상세에 **승인요청** 버튼(처리 완료와 별도), AI함 actions에 **선택/전체 승인요청**(처리완료와 병행).
  * 승인 상태 배지(승인 대기/승인됨/반려됨) — 미처리·AI함 리스트.
  * **CS 승인 큐 팝업**(`CsApprovalQueuePopup`): 탭(전체/승인대기/승인됨/반려됨) + 검수 상세(답변·원문·담당직원, PII 최소) + 승인/반려(+사유).
  * 대시보드 상단에 "🗳️ CS 승인 큐 (대기 N)" 오프너.
* `src/components/CsTeamDashboard.css` — 승인 큐 버튼/노트행 스타일.

> **미변경**: 전역 ApprovalItem/모달, 처리완료 흐름, 고객관리 Profile Hub, product/marketing/manager. 실제 WRITE/발송 없음.

---

## 4. 승인 대상 / 제외

* **대상**: 미처리 문의 AI 초안·직접 답변(`inquiry_reply`), AI 자동처리함 리뷰답글(`review_reply`)·배송안내(`delivery_reply`).
* **제외**: AI 자동처리함은 리뷰/배송만 → 상품/결제/일반/환불/교환 문의는 자동처리 승인요청 대상 아님(애초 AI함에 없음). 고객관리 메모/주의/블랙리스트/회원정보는 이번 범위 밖(구조만 유지).

---

## 5. Approval item 구조 / PII

```ts
CsApprovalQueueItem = { id, source:'cs', sourceType:'inquiry_reply'|'review_reply'|'delivery_reply',
  status:'pending_approval'|'approved_local'|'rejected', title, answerText,
  target:{ originalId, orderNo?, productName?, customerId?, memberId? },   // 전화/이메일/주소 없음
  context:{ originalText?, type?, createdAt?, elapsedDays?, assignee?, completionMethod? },
  writeTarget:{ platform:'godomall', targetType:'inquiry_reply'|'review_reply', targetId }, writeStatus:'not_connected', rejectReason?, createdAt }
```

* **PII 최소**: 검수에 필요한 memberId/customerId·상품·주문번호·담당직원만. **전화/이메일/주소 미포함**(smoke #20). 고객 전체정보는 CS 상세/고객관리에서.
* **중복 방지**: key = `sourceType:originalId:answerText`. 동일 답변 재요청 차단, 답변 바뀌면 새 요청 허용(#14).

---

## 6. 흐름 / 상태

```
작성(AI초안/직접답변) → 승인요청(pending_approval, 원본에 "승인 대기" 배지)
  → CS 승인 큐에서 승인(approved_local) 또는 반려(rejected, 사유)
승인해도 writeStatus=not_connected (실제 등록 아님)
처리완료는 기존 버튼으로 별도 수행(승인만으로 처리완료 이동 안 함)
향후 Godomall WRITE Bridge: approved_local → write pending → success → 처리완료
```

---

## 7. 안전 검증 (smoke)

승인요청 버튼·핸들러(#1·#4·#5) · status pending 기본·writeStatus not_connected·writeTarget(#11~#13) · 리뷰/배송 sourceType(#6·#7) · 중복 방지/답변변경 허용(#14) · 승인/반려 전이(#17·#18) · 배지 맵(#15) · **전화/이메일/주소 미포함**(#20) · **WRITE/네트워크 호출 없음**(#19) · 고객관리/처리완료 흐름 유지(#22·#23).

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-draft-approval-queue-hitl.mjs` **20/20** ✅
* 관련 smoke: customer-hub 22 · work-completion 19 · assignee-layout 15 · popup-ux-polish 19 · admin-workflow 20 · detail-enrichment 19 · kpi-popup-revision 19 — 전부 ✅

---

## 9. 다음 작업 제안

* **Godomall WRITE Bridge v0**: `writeTarget` 기반 실제 inquiry/review 답변 등록 — approved_local → pending → success → 처리완료.
* Approval Queue UX polish(반려 재작성 루프), 완료/승인 이력 영속화, 직원 등록/담당자 관리.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-draft-approval-queue-hitl-v0`, smoke 20/20)*
