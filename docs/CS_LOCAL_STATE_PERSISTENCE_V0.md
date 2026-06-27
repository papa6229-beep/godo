# CS Local State Persistence v0

> **작업명**: `CS Local State Persistence v0`
> **브랜치**: `feature/cs-local-state-persistence-v0`
> **상위 컨텍스트**: `docs/CS_DRAFT_APPROVAL_QUEUE_HITL_V0.md` · `docs/CS_WORK_COMPLETION_FLOW_V0.md` · `docs/CS_CUSTOMER_MANAGEMENT_PROFILE_HUB_V0.md`.
> **범위**: CS 운영 상태를 브라우저 localStorage에 영속화. **실제 고도몰 WRITE/서버 저장 없음.**

---

## 1. 목적

세션 local에만 있던 CS 운영 상태(처리완료 이력·승인 큐·담당직원·메모·고객관리 메모/태그)를 localStorage에 저장 → 새로고침 후에도 유지.

---

## 2. 산출물 / 변경

### 신규
* `src/services/csLocalStatePersistence.ts` — `load/save/clear/createEmpty/sanitize` + 타입 `CsPersistedStateV0`. window/localStorage guard, schemaVersion·broken-JSON 안전.
* `scripts/smoke-cs-local-state-persistence.mjs` — **20/20 통과**.
* `docs/CS_LOCAL_STATE_PERSISTENCE_V0.md`(본 문서).

### 수정
* `src/components/CsTeamDashboard.tsx`
  * 영속 대상 state를 메인으로 lift: `completed`·`approvals`(기존) + `assigneeByItem`·`memoByItem`(미처리) + `custMemo`·`custCaution`·`custBlacklist`(고객관리). mount 시 `loadCsPersistedState()` lazy 복원, 변경 시 `useEffect`로 `saveCsPersistedState`.
  * `CsItemPopup`(assignee/memo)·`CsCustomerProfilePopup`(memo/watch/black)을 controlled props로 전환(내부 useState 제거).
  * "CS 로컬 상태 초기화" 버튼(확인창 → `clearCsPersistedState` + state 리셋).
* `src/components/CsTeamDashboard.css` — 초기화/노트행 버튼 스타일.

> **미변경**: 실제 WRITE/서버/회원수정/답변등록 없음. 타 부서·전역 승인 무변경.

---

## 3. 저장 구조

```ts
key = 'godo_ai_os.cs_state.v0'
CsPersistedStateV0 = {
  schemaVersion: 0, savedAt,
  completedWorkItems, approvalItems,
  assigneeByItem, memoByItem,
  customerManagement: { memoByCustomerId, cautionByCustomerId, blacklistCandidateByCustomerId }
}
```

* **schemaVersion 0**: 로드 시 불일치 → null(무시). 깨진 JSON → null(앱 안 깨짐). 형식 불량 필드는 sanitize에서 제거.
* **저장 타이밍**: 7개 state 변경 시 useEffect 저장(debounce 없음, v0 허용).
* **복원**: mount 1회 lazy. 존재하지 않는 originalId/customerId가 있어도 UI에서 자연 무시.

---

## 4. PII 정책

* 저장: 운영자가 만든 상태/산출물 중심 — completed/approval의 answerText·assignee, 고객관리 memo·caution·blacklist toggle.
* **고객 기본 PII(전화/이메일/주소)는 localStorage에 복제 저장하지 않음**(smoke #18: 저장 payload에 phone/email/address 없음). 고객 기본정보는 원본 data source(contacts)에서 다시 읽음.

---

## 5. 저장/복원 검증 (smoke)

completedWorkItems(#5)·approvalItems(승인/반려 status #6·#16·#17)·assigneeByItem(#7)·memoByItem(#8)·고객 memo/caution/blacklist(#9~#11) 라운드트립 ✅. broken JSON → null(#12)·schema 불일치 → null(#13)·window 없는 환경 안전(#14)·clear 제거(#15)·PII 미복제(#18)·WRITE 없음(#19)·초기화 버튼/영속 연결(#20).

---

## 6. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-local-state-persistence.mjs` **20/20** ✅
* 관련 smoke: approval-queue 20 · customer-hub 22 · work-completion 19 · assignee-layout 15 · popup-ux-polish 19 · admin-workflow 20 · detail-enrichment 19 — 전부 ✅

---

## 7. 한계 / 다음 작업 제안

* localStorage(브라우저 1대) 한정 — 서버/멀티유저 공유 아님. 서버 persistence로 교체 시 동일 load/save 어댑터 자리에 끼우면 됨.
* **다음 작업 후보**: Godomall Board READ v0(실데이터) · Godomall WRITE Bridge v0(approved_local → 실제 등록) · Approval Queue UX polish · 직원 등록/담당자 관리 탭.

> *문서 끝. (작성: 2026-06-27, 브랜치 `feature/cs-local-state-persistence-v0`, smoke 20/20)*
