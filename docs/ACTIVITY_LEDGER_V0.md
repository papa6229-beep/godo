# 업무 활동 원장 (Activity Ledger) V0 — 배관 1단계

> 2026-07-03 · 역할 기반 재편의 뼈대. "오늘의 운영"이 읽을 단일 활동 기록소.

## 왜 이걸 먼저 (배관 1단계)
역할 기반 재편(팀장=본인 팀 실행 / 최고관리자=오늘의 운영에서 읽기·승인·HQ채팅)의 핵심 전제:
**각 팀이 하는 모든 일을 한 곳에 이벤트로 append하고, 오늘의 운영·HQ 채팅은 거기서 읽기만** 한다.
→ 오늘의 운영이 별도 상태 없이 원장의 **거울(프로젝션)**이 됨 → 두 운영 표면의 중복 제거.
AI 세팅이 아니라 **파이프라인 구조**를 먼저 세우는 단계(사장님과 합의한 순서).

## 구현 (스토어 + 순수함수 + persist API + 집계, 백엔드 스왑 가능)
- `src/types/activityLedger.ts`: `ActivityEvent`(teamId·type·status·title·actor·relatedTeam·refId·at),
  유형 `task_run|message_sent|approval|chat_query|note`, 상태 `done|pending|in_progress|rejected|info`,
  `TeamActivitySummary`(오늘 집계). actor는 teamMessage와 동일 모델(사람/AI 에이전트).
- `src/services/activityLedger.ts`:
  - 스토어 `loadActivity`/`saveActivity`(localStorage, 500 cap)/`subscribeActivity`(storage 이벤트).
  - 순수 `createActivity`, 조회 `activityForTeam`·`activitySince`·`teamSummary`·`allTeamsSummary`.
  - **persist API `logActivity`(사람 UI·미래 에이전트 공용)**.

## 배선(write 지점 연결)
- `agentTaskRunner.runAgentTask` → 자동업무 실행 시 **`task_run`(done) 기록**(actor=AI 에이전트, relatedTeam=보고대상).
- `DepartmentWorkspacePanel`:
  - 팀 간 요청 발신 → **`message_sent`** 기록.
  - 요청 완료/진행 처리 → **`approval`**(done/in_progress) 기록.
- 이후(3단계) 오늘의 운영이 `teamSummary`/`activityForTeam`을 읽어 팀 카드·브리핑·팝업으로 표시.

## 검증
- `smoke-activity-ledger-v0`: **12/0** — persist, 팀별·최신순, 집계(자동업무 진행/완료·전달·승인·대기),
  allTeamsSummary, 오늘 필터, AI 에이전트 actor 보존.
- 회귀: agent-task-runner 15/0, team-message-center 22/0.
- `tsc -b`/`lint`/`vite build` 그린.
- **Playwright(실 번들 배선)**: 상품팀 자동업무 실행 → localStorage 원장에 `task_run`(product·agent product-lead·done·→hq) 1건 + 팀 메시지 1건 기록 확인.

## 다음 (배관 순서)
2. **Studio(AI 직원)에서 자동업무/승인모드 정의** + 실제 실행 반영(Studio↔런타임 첫 연결).
3. **오늘의 운영 재편**: 좌 팀 관제 카드(클릭 팝업)·중앙 HQ 채팅 유지·우측을 **전사 브리핑/주의 알림**으로 교체 — 전부 이 원장 읽기.
4. **역할 전환기**(총괄/팀장 가시성 스코프). 5.(2단계) 로그인/권한/실시간.

## 위치
- 신규: `src/types/activityLedger.ts`, `src/services/activityLedger.ts`, `scripts/smoke-activity-ledger-v0.mjs`.
- 변경: `src/services/agentTaskRunner.ts`, `src/components/DepartmentWorkspacePanel.tsx`.
