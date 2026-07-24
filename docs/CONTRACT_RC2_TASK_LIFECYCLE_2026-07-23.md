# RC-2 — 업무·실행·결과물·승인 생명주기 계약 (RED 진단)

- 기준선: `main` `6dca85db57bef1c4317f3fa0adfc42e0b87b149c`
- 브랜치: `fix/rc-2-task-lifecycle-contract`
- 상태: **RED 진단 전용.** 제품 소스 변경 0. GREEN 미승인.
- 검사: `scripts/smoke-rc2-task-lifecycle-red-v0.mjs` — 실제 함수 호출(문자열 grep 판정 아님), 결정적 fixture(고정 `nowIso`·고정 `runId`), localStorage in-memory shim

결과: **BASE 5/0 · RED 0 met / 20 unmet**

## 1. 현재 생성자 → 소비자 흐름도

```
[런타임 경로]
 runNativeAgentOperation(objective)
   runId = `run-${Date.now()}`                         ← 여기서만 생성
     ├ planJobs → AgentJob.id = `job-${agentId}-${runId}`      (runId 보유)
     ├ executeAgentJob → AgentResult{id, runId, jobId, agentId} (연결 유지)
     │    └ AgentArtifact{id, runId, agentId}                  ✗ jobId/resultId 없음
     ├ aggregateTeamResults → AgentResult(status 항상 'success') ✗ 부분실패 소실
     ├ processHandoffs → AgentHandoff{referencedResultIds}      ✗ 부서당 첫 결과만
     └ orchestrateManager
          proposedTasks[]        {title, agentId, description}  ✗ id 없음
          proposedApprovalItems[]{title, …, agentId, artifact}  ✗ task 참조 없음
                    │
                    ▼  ← 여기서 추적이 끊긴다
 App.tsx
   OperationTask.id  = `runtime-task-${idx}-${Date.now()}`   ┐ 서로 무관하게
   ApprovalItem.taskId = `task-${agentId}-${Date.now()}`     ┘ 각각 생성
   handleApprove/handleReject → tasks.find(t => t.id === item.taskId)  → 영구 미스매치
   agents 매핑: a.id==='stock' → job.assignedAgentId==='inventory_monitor' (if-else 9줄)

[자동업무 경로 — 런타임과 별개 계통]
 AgentTaskSpec{id, teamId, agentId}
   ├ stageApprovalTask → logActivity(status:'pending', refId: 없음)   ✗ dedup 우회
   └ postAgentReport   → postTeamMessage → logActivity(refId: posted.id)
                                              ↑ 메시지 id (업무 id 아님)
 teamSummary: refId 로 dedup, refId 없는 이벤트는 무조건 별건 집계
```

## 2. 식별자별 생성·전달·소실 위치

| 식별자 | 생성 위치 | 전달되는 곳 | **소실 지점** |
|---|---|---|---|
| `runId` | `nativeAgentRuntime.ts` (`run-${Date.now()}`) | job/result/artifact/handoff 전부 | **App 으로 넘어갈 때 소실** — `OperationTask`·`ApprovalItem` 에 `runId` 칸이 없음 |
| `jobId` | `jobPlanner` (`job-${agentId}-${runId}`) | `AgentResult.jobId` | **artifact 에 없음**, App 에 없음 |
| `taskId` | **두 곳에서 따로** — App `runtime-task-${idx}-…` / `task-${agentId}-…` | — | **생성 즉시 분기** → 승인이 원 업무를 못 찾음 |
| `artifactId` | `agentExecutor` (`AgentArtifact.id`) | result.artifacts → App approval | **result/job 역참조 없음** → 어느 실행의 산출물인지 불명 |
| `approvalId` | App (`appr-runtime-${idx}-…`) | approvalQueue | 큐에서 제거되면 소멸 — 원장에 남지 않음 |
| `refId` | `agentTaskRunner.postAgentReport` = **메시지 id** | `ActivityEvent.refId` | `stageApprovalTask` 는 **아예 미설정** · 승인 시 refId 가 달라 pending 과 매칭 실패 |
| `correlationId` | **부재** | — | 해당 개념 자체가 없음. `runId` 가 런타임 내부에서만 그 역할 |
| `agentId` | 두 네임스페이스 병존 | — | 화면/제안 = `stock`,`order`,`cs`,`marketing` (`data/agents.ts`) · 런타임 = `inventory_monitor`,`product_analyst`,… (`defaultNativeAgentRuntime.ts`) |

## 3. RED 20건 — 기대값 vs 현재 실제값

| ID | 기대 | **현재 실측** |
|---|---|---|
| R1a | 제안 업무가 `id` 보유 | `proposedTasks[0]` 키 = `[title, agentId, description]` — **id 없음** |
| R1b | 제안 승인건이 `taskId` 보유 | 키 = `[title, proposedAction, reason, agentId, artifact]` — **task 참조 없음** |
| R1c | App 이 id 를 각각 만들지 않음 | `runtime-task-${idx}-…` 와 `task-${agentId}-…` **독립 생성** |
| R2a | pending 기록에 refId | `refId = undefined` |
| R2b | 승인 후 pending 0 | **pending=1 · done=1** (닫히지 않음) |
| R2c | 반복 대기해도 누적 없음 | **pending=3건 누적** |
| R3a | 반려 API 존재 | `agentTaskRunner` export = `[approveAgentTask, computeAgentReport, formatTaskReport, postAgentReport, runAgentTask, stageApprovalTask]` — **반려 없음** |
| R3b | 취소 API 존재 | **없음** |
| R3c | App 취소 핸들러 | **없음** (승인/반려만) |
| R4a | 상품팀 재고 결과 handoff | 참조 = `[res-product-analyst, res-cs-inquiry, res-mkt-plan]` — **재고 누락** |
| R4b | CS 리뷰 결과 handoff | **누락** |
| R4c | 결과 수만큼 추적 | **5건 중 3건만 참조** |
| R5a | agentId 네임스페이스 일치 | 런타임에 없는 agentId = `[cs, marketing]` |
| R5b | 하드코딩 매핑 없음 | App `a.id==='stock' → 'inventory_monitor'` if-else |
| R6a | 실패 포함 시 success 아님 | 팀원 1건 실패인데 집계 **status=success** |
| R6b | 부분실패 상태값 존재 | `AgentResultStatus` 에 **partial 개념 없음** |
| R6c | run.status 조건부 | `nativeAgentRuntime` 이 **무조건 `'completed'` 하드코딩** |
| R7a | artifact → result 역추적 | artifact 키에 `resultId`/`jobId` **없음** |
| R7b | 원장 refId 가 업무 식별자 | **메시지 id** 라 업무로 못 돌아감 |
| R7c | 원장에 업무 식별자 흔적 | 이벤트에 `spec.id` **흔적 없음** |

## 4. 영향 소비자 전수

| 소비자 | 의존 | 현재 증상 |
|---|---|---|
| `App.handleApprove` / `handleReject` | `t.id === item.taskId` | **항상 미매치** → 승인해도 원 업무 상태 안 바뀜 |
| `App` agents 매핑 (525–545행) | if-else 9줄 | 네임스페이스 어긋나면 조용히 미갱신 |
| `activityLedger.teamSummary` | `refId` dedup | refId 없는 pending 무한 누적 |
| `OfficeView` / `TaskBoard` | `task.status` | 승인 결과 미반영 |
| `TaskResultModal` / `HandoffDetailModal` | `artifacts`, `referencedResultIds` | 재고·리뷰 결과 미표시 |
| `DepartmentWorkspacePanel` | 원장 집계 | 승인대기 건수 과다 표시 |
| `EngineUsageLog.taskId` | `item.taskId` | 존재하지 않는 task 를 가리키는 로그 축적 |
| `csApprovalQueueBridge` | ApprovalItem | 동일 taskId 문제 상속 |

## 5. 최소 공통 외피 계약 (제안 — 미구현)

새 저장소·새 구조를 만들지 않고, **모든 생명주기 객체가 공유하는 얇은 외피 4칸**만 정의한다.

```ts
export interface LifecycleRef {
  taskId: string;        // 업무 단위(제안 시점에 확정, 끝까지 불변)
  runId?: string;        // 실행 단위(런타임 1회)
  jobId?: string;        // 실행 내 개별 작업
  correlationId: string; // 한 업무 흐름 전체(=최초 taskId 로 초기화)
}
export type AgentNamespaceId = string; // 단일 네임스페이스로 통일 + 별칭표 1곳
```

- `OperationTask` / `ApprovalItem` / `AgentArtifact` / `ActivityEvent` 가 이 외피를 **포함**한다.
- **핵심 규칙**: `taskId` 는 **제안 생성 시 한 번만** 만들고, 소비자는 절대 새로 만들지 않는다.
- `ActivityEvent.refId` 는 유지하되(하위호환) 의미를 "표시용 참조"로 낮추고, dedup 은 `taskId` 기준.

### 재사용 가능 필드 vs 신규 필요

| 구분 | 항목 |
|---|---|
| **그대로 재사용** | `AgentResult.id/runId/jobId/agentId`, `AgentArtifact.id/runId/agentId`, `AgentHandoff.id/runId`, `AgentJob.id/runId`, `ActivityEvent.refId`, `OperationTask.approvalItemIds` |
| **신규 필요(최소)** | `proposedTasks[].id` · `proposedApprovalItems[].taskId` · `AgentArtifact.resultId`(+`jobId`) · `ActivityEvent.taskId` · `AgentResultStatus`에 부분실패 값 · 취소 상태값 |
| **정리 필요** | agentId 네임스페이스 단일화(또는 별칭표 1개 모듈로 격리) |

## 6. 저장자료 마이그레이션

| 저장 키 | 영향 | 판단 |
|---|---|---|
| `godo_activity_ledger_v0` | `taskId` 신설 시 기존 이벤트에 없음 | **마이그레이션 필요(경량)** — 기존 이벤트는 `taskId=undefined` 로 두고 dedup 은 `taskId ?? refId` 순으로 후퇴. 삭제·재작성 불필요 |
| `godo.data.activeSnapshot` | 무관 | 불필요 |
| tasks/approvalQueue | App 메모리 state (미영속) | 불필요 |
| `godo.agentTaskStore` | spec 정의만 보관 | 불필요(확인 필요) |

**신규 저장 키·전면 재설계는 제안하지 않는다.**

## 7. GREEN 조각 제안 (5조각)

| 조각 | 범위 | 닫는 RED |
|---|---|---|
| **G1** 제안 단계 id 확정 | `orchestrateManager` 가 `taskId` 생성 → `proposedTasks[].id` · `proposedApprovalItems[].taskId` | R1a·R1b |
| **G2** 소비자 배선 | App 이 id 를 만들지 않고 받은 것을 사용 (승인/반려가 원 업무를 찾음) | R1c·R7 일부 |
| **G3** 원장 추적 | `ActivityEvent.taskId` + `stageApprovalTask` 가 taskId 기록 + dedup 기준 정정 | R2a·R2b·R2c·R7b·R7c |
| **G4** 3경로 상태 | 반려·취소 API + 상태값, 부분실패 표현(`aggregate`/`run.status`) | R3a~c·R6a~c |
| **G5** handoff·네임스페이스 | 부서 결과 전수 handoff, agentId 별칭표 단일 모듈 | R4a~c·R5a·R5b·R7a |

의존: G1 → G2 → G3 은 순차. G4·G5 는 G1 이후 병렬 가능.

## 8. 착수 전 결정이 필요한 정책 질문

1. **taskId 발급 주체** — `orchestrateManager`(런타임)인가, App(소비자)인가? 제안: 런타임. 단 자동업무 경로(`AgentTaskSpec.id`)와 형식을 통일할지 별개로 둘지 결정 필요.
2. **agentId 네임스페이스 단일화 방향** — 런타임 id(`inventory_monitor`)로 통일 / 화면 id(`stock`)로 통일 / 별칭표 유지 중 택1. 화면 캐릭터·brainKnowledge·studio 기본값이 화면 id 를 참조하므로 파급 범위가 다름.
3. **취소의 의미** — 사람이 승인 전에 거두는 것인가, 실행 중단인가? 상태값(`cancelled`)을 `TaskStatus`·`ActivityStatus`·`ApprovalItem.status` 어디까지 추가할지.
4. **부분 실패 표현 위치** — `AgentResultStatus` 에 `partial` 추가 vs `run` 레벨 카운트(`failedJobCount`)만. 계약 확장 최소화 관점에서 후자 선호 여부.
5. **원장 dedup 전환** — `taskId` 우선으로 바꾸면 기존 이벤트 집계 수치가 달라진다. 과거 이벤트를 그대로 둘지(수치 변동 허용) 재작성할지.
6. **handoff 다건화 시 id 규칙** — 현재 `ho-prod-mkt-${runId}` 는 부서쌍당 1건 전제. 결과별로 쪼갤지, 1건에 `referencedResultIds` 를 다 담을지.
7. **App 상태의 영속성** — tasks/approvalQueue 가 메모리라 새로고침 시 소멸한다. RC-2 범위에서 영속화까지 볼지, 계약만 정리할지.

## 9. 이번 단계 범위

제품 소스 변경 **0파일**. 신규 파일 2개(RED 검사 1 + 이 문서 1).
전체 스모크 96개 중 **RC-2 RED 1건만 의도된 실패**, 나머지 95 pass(회귀 0).
main·Production·기존 브랜치 무변경. push·Preview 없음.

**범위 밖(미착수)**: RC-3 산출물 · AI 프롬프트/모델/도구 설정 · UI 전면개편 · 저장소 전면 재설계 · 실제 WRITE · DATA-SOURCE-SERVER-02 · C4-SERVER-01.
