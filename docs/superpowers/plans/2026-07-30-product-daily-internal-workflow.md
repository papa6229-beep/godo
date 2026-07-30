# Product Daily Internal Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상품관리팀의 `재고·매출 일일 점검`을 시험자료로 실제 사용 가능한 팀 내부 업무로 완주시키되, HQ에 일상 보고·승인 항목을 자동 생성하지 않고 HQ가 필요할 때 업무기록을 열람할 수 있게 한다.

**Architecture:** 기존 `buildDepartmentSourceOfTruthSnapshot`과 `inventoryRiskContract`로 결과를 만들고, 반복 AI 업무의 상태 정본은 기존 append-only `activityLedger`에 둔다. `AgentTaskPanel`은 로컬 React 상태가 아니라 `activityLedgerRepository`를 구독해 상태를 복원한다. HQ 지시·팀 간 협업용 `taskLifecycleAppAdapter`는 그대로 두고, 이번 팀 내부 반복 점검을 중복 등록하지 않는다.

**Tech Stack:** React 19, TypeScript, localStorage-backed repository/facade, Node smoke tests, ESLint

## Global Constraints

- 구현 브랜치는 현재 `codex/d0-parallel-team-readiness-plan`을 그대로 사용한다.
- 먼저 이 계획에 동의하는지 저장소와 대조한다. 이견이 있으면 구현하지 말고 근거와 대안을 Codex에 보고한다.
- 이번 범위는 `task-product-daily` 한 경로의 팀 내부 완주다. 다른 팀 자동 업무를 함께 일반화하지 않는다.
- 새 데이터 계산식·재고 위험 기준을 만들지 않는다.
- `taskLifecycleAppAdapter`에 팀 내부 반복 업무를 등록하지 않는다.
- 새 저장소를 만들지 않는다. `activityLedger`와 `activityLedgerRepository`를 사용한다.
- 스케줄러, 서버 DB, 고도몰 키, 실제 상품 등록, 외부 WRITE, 환경변수, Preview/Vercel, 배포를 건드리지 않는다.
- HQ가 지시한 업무의 기존 `지시→수행→결과→HQ 확인` 흐름은 변경하지 않는다.
- Claude는 집중검사·타입검사·변경 파일 lint까지만 실행한다. 전체 `npm test`는 구현 묶음이 끝난 뒤 Codex가 독립검증으로 한 번 실행한다.
- 구현은 제품·검사 1커밋, 문서 1커밋을 기본으로 한다. 실패 수정 때문에 논리적으로 분리할 이유가 없다면 더 잘게 쪼개지 않는다.
- `amend`, `rebase`, main 병합, push, 배포를 하지 않는다.

---

## Task 1: 업무기록 장부에서 반복 업무 상태를 복원하는 순수 계약 추가

**Files:**

- Modify: `src/types/teamMessage.ts`
- Modify: `src/types/activityLedger.ts`
- Modify: `src/services/activityLedger.ts`
- Create: `src/services/agentTaskRunState.ts`
- Test: `scripts/smoke-agent-task-runner-v0.mjs`

### 계약

`TeamMessageActor`에 사람 계정 식별을 보존하는 `userId?: string`을 추가한다. `ActivityEvent`와 `LogActivityInput`에는 반복 업무 결과를 구조적으로 복원하는 선택 필드를 추가한다. 과거 저장분에는 필드가 없어도 그대로 읽혀야 한다.

```ts
export type ActivityDataProvenance = 'actual' | 'simulation' | 'unavailable';

export interface ActivityEvent {
  resultBody?: string;
  dataProvenance?: ActivityDataProvenance;
  decisionReason?: string;
}
```

`ActivityStatus`에는 `failed`를 추가한다. `createActivity`는 세 선택 필드를 그대로 전달한다. `teamSummary`의 기존 집계 의미는 바꾸지 않는다.

새 순수 모듈은 원장의 이벤트 배열을 받아 한 업무의 최신 상태를 계산한다.

```ts
export type AgentTaskRunPhase =
  | 'idle'
  | 'awaiting_review'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface AgentTaskRunState {
  phase: AgentTaskRunPhase;
  taskId: string;
  resultBody?: string;
  dataProvenance?: ActivityDataProvenance;
  decisionReason?: string;
  actor?: TeamMessageActor;
  at?: string;
}

export const agentTaskActivityId = (specId: string): string =>
  `agenttask-${specId}`;

export function latestAgentTaskRunState(
  events: readonly ActivityEvent[],
  specId: string
): AgentTaskRunState;
```

판정 규칙:

- 같은 `taskId`의 이벤트만 본다.
- 입력 배열의 저장 순서를 보존해 마지막 상태변화를 적용한다. 같은 `at` 값이어도 배열 뒤의 이벤트가 최신이다.
- `task_run/pending` → `awaiting_review`
- `task_run/done` 또는 `approval/done` → `completed`
- `task_run/rejected` 또는 `approval/rejected` → `rejected`
- `task_run/failed` → `failed`
- 결과 본문·출처·사유는 마지막 이벤트에 없으면 같은 업무의 직전 값에서 이어받는다.
- 관련 이벤트가 없으면 `idle`.

### TDD 순서

- [ ] `scripts/smoke-agent-task-runner-v0.mjs`의 임시 컴파일 대상에 새 모듈이 포함되도록 하고 다음 RED를 먼저 추가한다.

임시 컴파일 대상에 `src/services/agentTaskRunState.ts`와 `src/data/defaultAgentTasks.ts`를 추가하고, 컴파일 뒤 각각 `S`와 `DEFAULTS`로 import한다.

```js
ok('상태 1. pending 복원', state.phase === 'awaiting_review');
ok('상태 2. 완료 뒤 결과·출처 복원',
  done.phase === 'completed'
  && done.resultBody === '재고 위험 4건'
  && done.dataProvenance === 'simulation');
ok('상태 3. 반려 사유 복원',
  rejected.phase === 'rejected'
  && rejected.decisionReason === '재고 수치를 다시 확인해 주세요');
ok('상태 4. 같은 시각에는 배열 뒤 이벤트가 최신',
  sameTime.phase === 'completed');
ok('상태 5. 과거 이벤트 선택 필드 누락 허용',
  legacy.phase === 'awaiting_review');
```

- [ ] RED 실행:

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
```

예상: 새 모듈·필드가 없어 추가한 상태 복원 검사가 실패한다.

- [ ] 타입·생성 함수·순수 상태 복원기를 최소 구현한다.
- [ ] 같은 집중검사를 다시 실행해 Task 1 추가 검사가 GREEN인지 확인한다.

---

## Task 2: 상품 일일 점검을 팀 내부 완료로 전환하고 출처·행위자·중복 방지 고정

**Files:**

- Modify: `src/data/defaultAgentTasks.ts`
- Modify: `src/services/agentTaskRunner.ts`
- Modify: `scripts/smoke-agent-task-runner-v0.mjs`

### 2.1 기본 업무의 전달 범위

`task-product-daily`만 다음처럼 바꾼다.

```ts
{
  id: 'task-product-daily',
  teamId: 'product',
  reportTo: 'product',
  approvalMode: 'approval',
  // 나머지 기존 값 유지
}
```

이번 구현에서 `reportTo === teamId`의 의미는 “팀 내부 기록”이다.

- 팀 내부 기록은 `postTeamMessage`를 호출하지 않는다.
- HQ 요청함·HQ 승인대기·팀 간 메시지를 만들지 않는다.
- 다른 기본 업무의 `reportTo: 'hq'` 동작은 그대로 유지한다.
- `AgentTaskSpec`에 큰 범용 정책 체계를 새로 추가하지 않는다.

### 2.2 출처 판정

`standing.source`를 결과 출처로 사용하지 않는다. 실제 계산에 사용된 `DepartmentSourceOfTruthSnapshot.sourceMode`만 사용한다.

```ts
const provenanceOf = (
  snap: DepartmentSourceOfTruthSnapshot | null
): ActivityDataProvenance => {
  if (!snap || snap.sourceMode === 'unavailable') return 'unavailable';
  if (snap.sourceMode === 'real') return 'actual';
  return 'simulation'; // synthetic, mixed
};
```

사용자 라벨은 기존 `dataSourceProvenanceContract.userLabelOf`를 재사용한다.

- `actual` → `실제 데이터`
- `simulation` → `시험 데이터`
- `unavailable` → `연결 안 됨`

`formatTaskReport`의 반환 계약을 다음처럼 명시한다.

```ts
export interface AgentTaskReport {
  title: string;
  body: string;
  dataProvenance: ActivityDataProvenance;
  dataLabel: ProvenanceUserLabel;
}
```

본문 첫머리에 `[${dataLabel}]`을 붙이고 같은 구조값을 원장에도 저장한다. `AgentTaskRunOutcome`의 기존 `dataKind:'real'|'fixture'`는 실제 계산 출처가 아니므로 제거하고 `dataProvenance`와 `dataLabel`로 교체한다. 시험자료 결과를 “실제 데이터”라고 표시하는 경로는 없어야 한다.

### 2.3 실행·확인·반려 행위자

공개 함수는 축약 actor가 아니라 실제 `ActorRef`를 받는다.

```ts
runManualAgentTask(
  spec: AgentTaskSpec,
  actor: ActorRef,
  ctx: RunAgentTaskContext
): AgentTaskRunOutcome

approveAgentTask(
  spec: AgentTaskSpec,
  actor: ActorRef,
  ctx: RunAgentTaskContext,
  body: string
): AgentTaskDecisionOutcome

rejectAgentTask(
  spec: AgentTaskSpec,
  actor: ActorRef,
  ctx: RunAgentTaskContext,
  reason: string
): AgentTaskDecisionOutcome

cancelAgentTask(
  spec: AgentTaskSpec,
  actor: ActorRef,
  ctx: RunAgentTaskContext,
  reason: string
): AgentTaskDecisionOutcome

export type AgentTaskDecisionOutcome =
  | { ok: true; posted?: TeamMessage }
  | { ok: false; reason: string };
```

서비스 경계에서 다음을 재검증한다.

- `actor.kind === 'human'`
- `actor.teamId === spec.teamId`
- `hasLeadAuthority(actor) === true`

실행 계산은 AI actor로, 확인·반려·중단은 전달받은 실제 human actor로 원장에 기록한다. `'운영자'` 하드코딩은 제거한다.

확인·반려·중단은 최신 원장 상태가 `awaiting_review`일 때만 성공한다. 확인 시 결과 출처는 현재 화면 자료로 다시 추정하지 않고 pending 이벤트에 저장된 `dataProvenance`를 이어받는다. 반려 이유는 `trim()` 뒤 비어 있으면 실패 결과를 반환하고 원장을 바꾸지 않는다.

### 2.4 데이터 없음·중복 실행

- `buildDepartmentSourceOfTruthSnapshot`이 `null`이거나 출처가 `unavailable`이면 pending/done/message를 하나도 만들지 않고 `ran:false, staged:false`와 정직한 사유를 반환한다.
- `runManualAgentTask`와 `runScheduledAgentTask`는 실행 직전 `loadActivity()`와 `latestAgentTaskRunState`를 확인한다.
- 최신 상태가 `awaiting_review`이면 같은 업무를 다시 pending으로 만들지 않는다.
- 완료·반려 뒤 재실행은 허용한다.

### 2.5 팀 내부 확인 완료

상품 점검 확인 시 원장에는 다음 두 사실이 남아야 한다.

1. AI가 만든 결과와 출처: `task_run/done`, actor=상품 관리 AI
2. 누가 확인했는지: `approval/done`, actor=로그인한 상품팀장

`resultBody`, `dataProvenance`는 새로고침 뒤에도 복원 가능한 형태로 기록한다. 반려는 `approval/rejected`와 `decisionReason` 한 문장을 남긴다.

### TDD 순서

- [ ] 기존 smoke의 과거 기대 중 “`revenue=null`이어도 보고 전송”을 새 계약으로 교체한다.
- [ ] 다음 RED를 먼저 추가한다.

```js
const ledger = () => JSON.parse(store.get('godo_activity_ledger_v0') || '[]');
const inbox = (teamId) => TC.inboxFor(TC.loadTeamMessages(), teamId);
const productDaily = DEFAULTS.DEFAULT_AGENT_TASKS.find((task) => task.id === 'task-product-daily');
const internalSpec = { ...productDaily, schedule: { kind: 'manual' } };

ok('내부 1. 상품 일일 점검 reportTo=product',
  internalSpec.reportTo === 'product');
ok('내부 2. 시험 결과는 시험 데이터',
  R.formatTaskReport(internalSpec, { ...snap, sourceMode: 'synthetic' }).dataProvenance === 'simulation');

store.clear();
const noData = R.runManualAgentTask(internalSpec, productLead, { revenue: null, nowIso: NOW });
ok('내부 3. 데이터 없음은 완료·pending·메시지 0건',
  noData.ran === false
  && noData.staged === false
  && ledger().length === 0
  && inbox('hq').length === 0
  && inbox('product').length === 0);

store.clear();
const memberAttempt = R.runManualAgentTask(internalSpec, productMember, { revenue: SIM_REVENUE, nowIso: NOW });
ok('내부 4. 상품팀 member는 실행 불가',
  memberAttempt.ran === false && memberAttempt.staged === false && ledger().length === 0);
const leadAttempt = R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
ok('내부 5. 상품팀장만 실행 가능',
  leadAttempt.ran === false && leadAttempt.staged === true);
ok('내부 6. 실행 뒤 pending 1건',
  ledger().filter((event) => event.type === 'task_run' && event.status === 'pending').length === 1);

const beforeDuplicate = ledger().length;
const duplicate = R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
ok('내부 7. pending 중 재클릭은 새 pending 0건',
  duplicate.ran === false && duplicate.staged === false && ledger().length === beforeDuplicate);

R.approveAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, leadAttempt.body);
ok('내부 8. 확인 뒤 HQ 메시지 0건', inbox('hq').length === 0);
ok('내부 9. 확인 뒤 product 자기 메시지도 0건', inbox('product').length === 0);
ok('내부 10. task_run done의 actor는 agent',
  ledger().some((event) => event.type === 'task_run' && event.status === 'done'
    && event.actor.kind === 'agent' && event.actor.agentId === internalSpec.agentId));
ok('내부 11. approval done의 actor는 실제 팀장 label/userId',
  ledger().some((event) => event.type === 'approval' && event.status === 'done'
    && event.actor.label === productLead.label && event.actor.userId === productLead.userId));

store.clear();
R.runManualAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
R.rejectAgentTask(internalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW }, '재고 수치를 다시 확인해 주세요');
const rejectedState = S.latestAgentTaskRunState(ledger(), internalSpec.id);
ok('내부 12. 반려 사유 한 문장 복원',
  rejectedState.phase === 'rejected'
  && rejectedState.decisionReason === '재고 수치를 다시 확인해 주세요');

store.clear();
const externalSpec = { ...internalSpec, id: 'external-regression', reportTo: 'hq', approvalMode: 'auto' };
const externalRun = R.runManualAgentTask(externalSpec, productLead, { revenue: SIM_REVENUE, nowIso: NOW });
ok('회귀 1. reportTo가 다른 팀인 기존 업무는 메시지 전송 유지',
  externalRun.ran === true && inbox('hq').length === 1);
```

member와 팀장 actor는 실제 계약 형태로 만든다.

```js
const productLead = {
  kind: 'human',
  teamId: 'product',
  label: '[시험] 상품팀장',
  userId: 'u-product-lead',
  accountRole: 'team_lead'
};
const productMember = {
  kind: 'human',
  teamId: 'product',
  label: '[시험] 상품팀원',
  userId: 'u-product-member',
  accountRole: 'member'
};

const SIM_REVENUE = {
  count: 0,
  source: 'mock',
  live: false,
  realOrdersStatus: 'unavailable',
  syntheticStatus: 'success',
  summary: {
    syntheticOrderCount: 1,
    realOrderCount: 0,
    syntheticTotalNetSoldQuantity: 0
  },
  stockImpact: [],
  orders: []
};
```

- [ ] RED 실행:

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
```

- [ ] runner와 기본 spec을 최소 수정한다.
- [ ] GREEN 실행:

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
```

---

## Task 3: AgentTaskPanel을 장부 구독형 UI로 교체

**Files:**

- Modify: `src/components/AgentTaskPanel.tsx`
- Modify: `src/components/AgentTaskPanel.css`
- Modify: `src/components/DepartmentWorkspacePanel.tsx`
- Modify: `src/components/DeptActivityModal.tsx`
- Modify: `scripts/smoke-agent-task-runner-v0.mjs`

### 3.1 Props와 권한

`viewerRole`을 없애고 실제 행위자를 전달한다.

```ts
interface Props {
  teamId: DeptTeamId;
  actor: ActorRef | null;
  canOperate: boolean;
  tasks: AgentTaskSpec[];
  revenue: RevenueResult | null;
  onRan: () => void;
}
```

`DepartmentWorkspacePanel`에서 다음처럼 전달한다.

```tsx
<AgentTaskPanel
  teamId={selectedTeamId}
  actor={identity.actor}
  canOperate={
    identity.actor?.kind === 'human'
    && identity.teamId === selectedTeamId
    && identity.isLead
  }
  tasks={tasksForSelectedTeam}
  revenue={productData.revenue}
  onRan={refreshTeamMessages}
/>
```

서비스도 권한을 다시 검사하므로 UI 숨김만 보안 경계로 삼지 않는다.

### 3.2 상태 복원

다음 로컬 상태를 삭제한다.

- `done`
- `pending`
- `gateNote` 중 원장에 저장되어야 하는 상태

패널은 다음 패턴으로 장부를 구독한다.

```ts
const [activity, setActivity] = useState(() => loadActivity());

useEffect(
  () => subscribeActivity(() => setActivity(loadActivity())),
  []
);

const runState = latestAgentTaskRunState(activity, task.id);
```

단기적인 입력값만 React 상태에 둔다.

- draft 본문 편집값
- 반려 이유 입력값
- 현재 호출 실패 안내

새로고침·탭 이동·같은 계정 재진입 뒤에도 원장에서 `awaiting_review`, `completed`, `rejected`와 결과·출처·확인자·사유가 복원되어야 한다.

### 3.3 사용자 화면

`task-product-daily` 또는 `reportTo === teamId`인 경우:

- 메타: `팀 내부 점검`
- 대기: `팀장 확인 대기`
- 확인 버튼: `확인 완료`
- 완료: `팀 내부 확인 완료`
- HQ 전송 문구 없음

반려는 복잡한 승인 모달을 만들지 않는다.

- `확인하지 않음`을 누르면 한 줄 입력칸과 `반려`가 열린다.
- 공백이면 반려하지 않고 “이유를 한 문장 적어 주세요”를 표시한다.
- 반려 시 `rejectAgentTask`를 호출한다.
- `취소` 버튼이 UI만 닫는 기존 동작은 제거한다. 사용자가 실행을 실제로 중단하는 동작이라면 `cancelAgentTask`를 실제 actor와 사유로 호출한다.

### 3.4 HQ 열람

새 HQ 알림·승인 UI를 만들지 않는다. 이미 존재하는 다음 경로를 유지한다.

`HQ 오늘의 운영 → 상품관리팀 카드 → 부서 업무 확인 → DeptActivityModal`

완료 원장에 `teamId:'product'`, `taskId:'agenttask-task-product-daily'`, 결과 본문, 출처, 실제 확인 actor가 있으므로 이 경로에서 확인 가능하다.

`DeptActivityModal`의 상태 라벨에는 `failed: '실패'`를 추가해 실패 기록도 빈 문구로 보이지 않게 한다.

### TDD 순서

- [ ] 기존 smoke에 파일 배선 정적 검사를 추가한다.

```js
const panelSource = readFileSync(path.join(REPO, 'src/components/AgentTaskPanel.tsx'), 'utf8');
const workspaceSource = readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8');

ok('UI 1. AgentTaskPanel이 activityLedgerRepository를 구독',
  /subscribeActivity/.test(panelSource)
  && /latestAgentTaskRunState/.test(panelSource));
ok('UI 2. done/pending 결과 상태를 useState 정본으로 두지 않음',
  !/useState<Record<string, string>>\\(\\{\\}\\)/.test(panelSource)
  && !/useState<Record<string, Pending>>\\(\\{\\}\\)/.test(panelSource));
ok('UI 3. 실제 identity.actor 전달',
  /actor=\\{identity\\.actor\\}/.test(workspaceSource));
ok('UI 4. 팀 내부 완료 문구 존재',
  /팀 내부 확인 완료/.test(panelSource)
  && /팀 내부 점검/.test(panelSource));
ok('UI 5. 반려가 rejectAgentTask 호출',
  /rejectAgentTask\\(/.test(panelSource));
ok('UI 6. 취소가 로컬 pending 삭제만 하지 않음',
  /cancelAgentTask\\(/.test(panelSource)
  && !/delete n\\[t\\.id\\]/.test(panelSource));
```

- [ ] RED 실행:

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
```

- [ ] UI 배선을 구현한다.
- [ ] GREEN과 타입검사를 실행한다.

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
npx tsc -b
npx eslint src/components/AgentTaskPanel.tsx src/components/DepartmentWorkspacePanel.tsx src/services/agentTaskRunner.ts src/services/agentTaskRunState.ts src/services/activityLedger.ts src/types/activityLedger.ts src/data/defaultAgentTasks.ts scripts/smoke-agent-task-runner-v0.mjs
git diff --check
```

- [ ] 제품·검사 변경을 한 커밋으로 만든다. 예:

```powershell
git add src/types/teamMessage.ts src/types/activityLedger.ts src/services/activityLedger.ts src/services/agentTaskRunState.ts src/types/agentTask.ts src/data/defaultAgentTasks.ts src/services/agentTaskRunner.ts src/components/AgentTaskPanel.tsx src/components/AgentTaskPanel.css src/components/DepartmentWorkspacePanel.tsx src/components/DeptActivityModal.tsx scripts/smoke-agent-task-runner-v0.mjs
git commit -m "feat(d0): complete product daily check inside team"
```

`src/types/agentTask.ts`가 실제로 바뀌지 않았다면 add 목록에서 제외한다. 관계없는 변경은 함께 커밋하지 않는다.

---

## Task 4: 사용자 결정과 실제 구현 결과를 governance 정본에 기록

**Files:**

- Modify: `docs/governance/DECISIONS.md`
- Modify: `docs/governance/MASTER_PLAN.md`
- Modify: `docs/governance/CURRENT_STATE.md`
- Modify: `docs/governance/evidence/D0_PARALLEL_TEAM_READINESS_PLAN.md`
- Verify: `docs/superpowers/specs/2026-07-30-product-daily-internal-workflow-design.md`

### 기록할 결정

`DECISIONS.md`에 append-only 새 결정(D-010)을 추가한다.

- HQ 자동 보고 경계:
  1. HQ가 특정 업무 보고를 요청한 경우
  2. 팀장이 필요하다고 판단해 명시적으로 보고한 경우
- 일반 팀 내부 일상 업무는 팀 내부에서 완료·기록한다.
- HQ는 모든 팀의 일상 업무기록을 필요할 때 열람할 수 있다.
- “모든 일상 업무를 HQ에 자동 보고·자동 승인 요청”은 하지 않는다.

### 기록할 구현 사실

- `task-product-daily`가 팀 내부 점검으로 동작한다.
- 시험자료 출처가 `시험 데이터`로 유지된다.
- 결과·확인·반려·행위자가 새로고침 후 복원된다.
- HQ 메시지·승인 요청은 자동 생성되지 않는다.
- HQ는 기존 부서 업무 확인 화면에서 원장 기록을 열람한다.
- 기존 HQ 지시 업무 흐름은 변경하지 않았다.
- 고도몰 키 발급과 실제 상품 준비는 계속 병렬 대기이며, 이 구현을 C 실데이터 검증 완료로 표현하지 않는다.
- 전체 `npm test`는 Claude가 실행하지 않았고 Codex 독립검증 대기라고 정확히 쓴다.

`MASTER_PLAN.md §2`의 “다음 한 작업”은 이 구현이 끝났다고 가정해 임의로 크게 확장하지 않는다. 기존 D-0 후속 대장에서 다음 한 항목을 직접 관측해 선정하되, 이번 커밋에서 새 기능을 시작하지 않는다.

- [ ] 문서가 제품 코드와 일치하는지 파일:행을 대조한다.
- [ ] 숫자는 분모와 관측 커밋을 함께 쓴다.
- [ ] 문서 diff를 확인한다.

```powershell
git diff --check
git diff -- docs/governance docs/superpowers/specs/2026-07-30-product-daily-internal-workflow-design.md
```

- [ ] 문서만 별도 커밋한다.

```powershell
git add docs/governance/DECISIONS.md docs/governance/MASTER_PLAN.md docs/governance/CURRENT_STATE.md docs/governance/evidence/D0_PARALLEL_TEAM_READINESS_PLAN.md
git commit -m "docs(d0): record internal daily reporting boundary"
```

---

## Task 5: Claude 인계 보고와 Codex 독립검증 경계

Claude는 아래를 보고하고 멈춘다.

1. 지시 동의 여부와 구현 전 이견
2. 시작 branch·HEAD·local main·origin/main·clean 여부
3. RED에서 실제 실패한 항목과 값
4. GREEN에서 실제 통과한 항목과 값
5. 변경 파일과 각 파일의 역할
6. `task-product-daily` 실행→팀장 확인→새로고침 복원→HQ 원장 열람의 상태 변화
7. HQ inbox·승인 queue에 자동 생성된 항목이 0건이라는 직접 증거
8. 시험자료가 실제 데이터로 승격되지 않았다는 직접 증거
9. 실제 actor label/userId가 기록되었다는 직접 증거
10. 실행한 검사와 실행하지 않은 검사
11. 커밋 해시·작업 트리·main/origin 불변
12. 고도몰 키 상태

Claude는 다음을 하지 않는다.

- 전체 `npm test`
- Preview/Vercel/브라우저 육안검사
- main 통합·push·배포
- 후속 기능 착수

Codex는 Claude 보고를 받은 뒤 다음만 한 번 독립검증한다.

```powershell
node scripts/smoke-agent-task-runner-v0.mjs
npm test
git diff --check main..HEAD
git status --short
```

화면 동작이 코드·자동검사만으로 확정되지 않는 경우에만 로컬 또는 Preview의 실제 진입 경로를 한 번 확인한다. Vercel은 단순 병합 확인용으로 열지 않는다.

## Final Acceptance Checklist

- [ ] 상품팀장만 `재고·매출 일일 점검`을 실행·확인·반려할 수 있다.
- [ ] 상품팀원·다른 팀·HQ의 열람 화면에서는 조작할 수 없다.
- [ ] 시험자료 결과는 `시험 데이터`, 실데이터 결과는 `실제 데이터`, 미연결은 `연결 안 됨`이다.
- [ ] 데이터 없음·미연결은 완료나 pending으로 저장되지 않는다.
- [ ] pending 상태에서 재클릭해 중복 실행·중복 기록을 만들지 않는다.
- [ ] 확인 완료와 반려 사유가 새로고침 뒤 복원된다.
- [ ] AI 계산 actor와 실제 확인·반려 human actor가 각각 남는다.
- [ ] 팀 내부 일일 점검이 HQ 메시지·HQ 승인 요청을 자동 생성하지 않는다.
- [ ] HQ는 기존 부서 업무 확인 화면에서 상품팀 기록을 열람할 수 있다.
- [ ] HQ가 직접 요청한 기존 업무 흐름은 회귀하지 않는다.
- [ ] Claude 집중검사 통과 후 Codex 전체 `npm test`가 통과한다.
- [ ] 문서가 이를 “고도몰 실데이터 검증 완료”나 “전체 팀 기능 완료”로 확대하지 않는다.
