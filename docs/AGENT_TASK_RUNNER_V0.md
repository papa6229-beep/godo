# 팀 에이전트 자동 업무 실행기 (Agent Task Runner) V0

> 2026-07-03 · Agent Runtime 첫 슬라이스. 완료보고서.

## 왜 이걸 먼저 했나 (조사 결과)
`nativeAgentRuntime`(에이전트 실행 런타임)은 이미 있으나 다음이 비어 있었음:
- **트리거가 수동뿐**(START OPERATION 클릭). 스케줄/시각 자동 발화 전무.
- **작업 정의(WHAT/WHEN)가 없음** — 무슨 일을 하는지 `agentExecutor`에 하드코딩(agentId 분기).
- **canonical 데이터 엔진 미사용** — dashboard/chat은 `buildDepartmentSourceOfTruthSnapshot`·Query Plan을 쓰는데,
  런타임은 별도 ad-hoc 필터를 씀(두 갈래).
- **팀 메시지 센터 미연동**(방금 만든 것).

→ 가장 작고 확실한 첫 슬라이스: **"팀 에이전트가 정의된 작업을 canonical 엔진으로 계산 → 팀 메시지 센터에
AI-에이전트 명의로 보고"** 루프. 새 계산 로직 없이 기존 3개(snapshot·메시지센터·팀모델)를 조립.

## 구현
### 선언형 작업 정의
- `src/types/agentTask.ts`: `AgentTaskSpec`(teamId·agentId·title·**focus**·reportTo·reportKind·**schedule**),
  `AgentTaskSchedule`(manual/daily/weekly + at/weekday), `scheduleLabel()`.
- `src/data/defaultAgentTasks.ts`: 팀별 기본 작업(선언만) — 상품=재고·매출 점검, 마케팅=매출 요약, CS=문의·리뷰 점검.
  모두 **매일 09:00대 → 총괄팀(hq)에 보고**. 총괄팀이 각 팀 일일 보고를 한곳에서 받는 구조.

### 실행기 (canonical only)
- `src/services/agentTaskRunner.ts`:
  - `formatTaskReport(spec, snap)`: **전 부서 공통 `buildDepartmentSourceOfTruthSnapshot` 하나**에서
    팀 focus별(inventory/sales/cs/overview) 지표만 골라 포맷. 새 숫자 로직 없음. snapshot 없으면 정직한 안내.
  - `runAgentTask(spec, ctx)`: 계산 → `postTeamMessage`로 **actor.kind='agent'(agentId 포함)** 명의 보고 발신.
  - 사람 UI "지금 실행"과 (미래) 스케줄 트리거가 **같은 runAgentTask** 호출.

### UI
- `src/components/AgentTaskPanel.tsx`: 팀의 자동 업무 목록(제목·스케줄 라벨·보고 대상·지금 실행). 실행 시 결과 인라인 표시.
- `DepartmentWorkspacePanel`: 우측 3번째 탭 **[🤖 자동 업무]**(자동 업무 있는 팀만). 총괄팀 전환 시 탭 자동 정리.

## 검증
- `smoke-agent-task-runner-v0`: **15/0** — scheduleLabel, focus별 포맷(crafted snapshot 실수치 인용),
  runAgentTask가 AI-에이전트 명의로 reportTo에 발신, 데이터 없음 정직 경로.
- `smoke-team-message-center-v0`: **22/0**(회귀 없음).
- `tsc -b` / `lint` / `vite build`: 그린. 기존 서비스/계산/런타임 무변경(추가만).
- **Playwright E2E**: 상품팀 자동업무 "지금 실행" → 총괄팀 팀 간 요청에 **"상품관리팀 · AI"** 명의 보고 도착
  → 총괄팀이 완료 처리. (로컬 dev는 데이터 0이라 0원 표시 — 배포 시 실수치. 숫자 정확성은 smoke로 검증.)

## 의미 / 다음
- **에이전트가 처음으로 "스스로 계산하고 보고"함.** 방금 만든 팀 메시지 센터를 에이전트가 dogfooding.
- 계산은 canonical 엔진 재사용(두 갈래 데이터 스택을 이 경로에선 통일).
- **다음 단계 후보**:
  1. 실제 스케줄 발화(백엔드/상주 프로세스, 2단계) — 지금은 선언 + 수동.
  2. focus/스펙 확장(더 많은 작업·지원요청 자동 발신).
  3. Agent Studio(systemPrompt/knowledge) ↔ 런타임 연결(별개 큰 작업).
  4. `nativeAgentRuntime` 결과도 이 브릿지로 메시지화.

## 위치
- 신규: `src/types/agentTask.ts`, `src/data/defaultAgentTasks.ts`, `src/services/agentTaskRunner.ts`,
  `src/components/AgentTaskPanel.tsx`, `scripts/smoke-agent-task-runner-v0.mjs`.
- 변경: `src/components/DepartmentWorkspacePanel.tsx`, `DepartmentWorkspacePanel.css`.
