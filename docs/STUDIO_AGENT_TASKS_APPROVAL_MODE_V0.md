# Studio 자동 업무 정의 + 승인모드 + Studio↔실행 연결 (V0) — 배관 2단계

> 2026-07-03 · 역할 기반 재편 배관 2단계. 완료보고서.

## 목표
- 팀 자동 업무를 **하드코딩이 아니라 AI 직원(Studio)에서 편집** 가능하게.
- 업무별 **승인모드 3종**: 자동 완료 / 승인 후 보고 / 검토·수정 후 등록.
- **Studio 설정이 실제 실행에 반영**(Studio↔런타임 첫 연결). 실행 결과는 1단계 활동 원장에 기록.

## 구현
### 스펙 + 스토어(편집 가능)
- `types/agentTask.ts`: `approvalMode: 'auto'|'approval'|'draft'` 추가 + `APPROVAL_MODE_META`·`FOCUS_META`.
- `services/agentTaskStore.ts`: **편집 가능한 스토어**(localStorage, 최초 DEFAULT_AGENT_TASKS 시드).
  순수 CRUD(`upsertTask`/`removeTask`) + persist(`saveUpsertTask`/`saveRemoveTask`/`resetAgentTasks`) + 구독.
- 기본 승인모드 예시: 상품=승인 후 보고 / 마케팅=자동 완료 / CS=검토·수정 후 등록(3종 시연).

### 실행기(승인모드 반영)
- `services/agentTaskRunner.ts` 리팩터:
  - `computeAgentReport`(계산만) / `postAgentReport`(발신+원장) 분리.
  - `runAgentTask`(auto): 계산→발신→원장 `task_run(done)`.
  - `stageApprovalTask`(approval/draft): 계산→원장 `task_run(pending)`만(발신 없음).
  - `approveAgentTask`: 사람이 승인/수정한 본문으로 발신 + 원장 `task_run(done)` + `approval(done)`.

### UI
- `components/AgentTaskStudio.tsx`(+css): **Studio 새 탭 "🗓️ 자동 업무"**. 팀별 그룹, 업무 추가/편집(팀·에이전트·초점·보고대상·승인모드·주기·시각)/삭제/기본값 복원. 저장 시 스토어 반영.
  - `App.tsx`/`MainLayout.tsx`/`StudioPanel.tsx`: subtab union에 `agent_tasks` 추가 + 탭 버튼/렌더.
- `components/AgentTaskPanel.tsx`(부서 보드): **스토어에서 로드**. 승인모드 반영 —
  auto→"지금 실행"(즉시 완료), approval/draft→"지금 점검"→**승인 대기**(draft는 본문 편집)→"승인·보고"/"검토 완료·등록".
- `DepartmentWorkspacePanel`: 자동 업무 스펙을 스토어에서 로드·구독하여 패널/탭에 전달.

## 검증
- smoke: `agent-task-store-v0` **8/0**(시드·CRUD·승인모드), `agent-task-runner-v0` **19/0**(+stage/approve·원장 pending→approval), `activity-ledger-v0` 12/0, `team-message-center-v0` 22/0.
- `tsc -b`/`lint`/`vite build` 그린.
- **Playwright E2E**: Studio 자동업무 탭에서 상품팀 업무명 편집·저장 → 부서 보드에 **반영 확인**(제목 "재고·매출 점검 (수정됨)") → 승인모드 approval이라 "지금 점검"→**승인 대기**→"승인·보고" → localStorage 원장 `task_run(pending)→task_run(done)→approval(done)` + HQ 요청함에 agent 명의 보고 확인.

## 다음 (배관 3단계)
**오늘의 운영 재편**: 좌=팀 관제 카드(오늘 활동 집계·클릭 팝업)·중앙=HQ 채팅 유지·우측=전사 브리핑/주의 알림. 전부 **활동 원장 읽기**. 최고관리자 읽기 전용.

## 위치
- 신규: `services/agentTaskStore.ts`, `components/AgentTaskStudio.tsx`(+css), `scripts/smoke-agent-task-store-v0.mjs`.
- 변경: `types/agentTask.ts`, `data/defaultAgentTasks.ts`, `services/agentTaskRunner.ts`, `components/AgentTaskPanel.tsx`,
  `components/DepartmentWorkspacePanel.tsx`, `components/StudioPanel.tsx`, `App.tsx`, `components/MainLayout.tsx`,
  `scripts/smoke-agent-task-runner-v0.mjs`.
