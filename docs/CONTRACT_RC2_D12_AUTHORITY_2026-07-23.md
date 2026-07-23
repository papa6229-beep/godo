# RC-2 D-1.2 — 지휘 권한 정책 정정 (RED 진단)

- 브랜치: `fix/rc-2-task-lifecycle-contract`
- **HEAD(40자리)**: `44e3401ff83de9a8f3b03996d9be5291c9f0faac`
- 상태: **RED 진단 전용.** 제품 소스 변경 0. GREEN 미승인.
- 검사: `scripts/smoke-rc2-d12-authority-policy-red-v0.mjs` — 실제 함수 호출 + 소비자 소스 가드

결과: **BASE 2/0 · RED 4 met / 15 unmet**

## 0. Git 원문 증거

```
$ git rev-parse HEAD
44e3401ff83de9a8f3b03996d9be5291c9f0faac

$ git log -1 --format="%H %s"
44e3401ff83de9a8f3b03996d9be5291c9f0faac fix(rc-2): D-1.1 — 역할 전환 연결 · 담당팀 단일근거 · 승인목록 유지 · 팀장 확인함

$ git cat-file -e HEAD^{commit}
(exit 0 — 존재 확인)

$ git status --short
?? scripts/smoke-rc2-d12-authority-policy-red-v0.mjs
```

**직전 보고 정정**: 제가 D-1.1 커밋 해시를 `72a2f4c`로 보고했으나 `git cat-file -e 72a2f4c` → `fatal: Not a valid object name`. 저장소에 존재하지 않는 해시였고, 원문을 읽지 않고 적은 제 잘못입니다. 실제 해시는 위 `44e3401…`입니다.

## 1. 현재 흐름 vs 확정 목표 흐름

| 단계 | **현재 (D-1.1)** | **확정 목표** |
|---|---|---|
| 지시 | HQ가 **AI를 직접 선택**(드롭다운/후보/빠른추가) | HQ는 **인간 팀장에게** 지시 |
| 수행자 결정 | 생성 시 `assignedAgentId`로 **AI 확정** | **팀장이** AI 배정 / 직접 처리 선택 |
| 담당팀 | AI 소속에서 역산 | 지시 대상 **팀장의 팀**이 1차 근거 |
| 결과 제출 | 팀장 단계 선행은 지켜짐 ✅ | 동일 |
| HQ 수정 요청 | 수정본이 **같은 AI로 자동 승계** | 팀장에게 반환 → **팀장이 재선택** |
| 수정본 경로 | `currentStageIndex=1` **승계** | **0부터 재시작**(팀장 확인 재수행) |
| 수행자 변경 | 표현 불가(필드 없음) | AI 시도·인수 이력 보존 |
| 협업 반송 | `parentTaskId` 없어 **버튼 미노출** | 협업 업무에서 반송 가능 |

## 2. HQ → AI 직접 연결 소비자 전수

| # | 위치 | 코드 | 판정 |
|---|---|---|---|
| 1 | `ChatConsole.tsx:339` | `onAddTask(quickTaskTitle, quickTaskAgent)` | 빠른 추가가 AI 직접 선택 (P15) |
| 2 | `ChatConsole.tsx:483` | `onAddTask(candidate.title, candidate.agentId)` | 후보 업무가 AI 직접 배정 (P16) |
| 3 | `TaskBoard.tsx:148` + `:270` | `onAddTask(newTitle, selectedAgentId)` + AI 드롭다운 | 보드에서 AI 직접 배정 (P17) |
| 4 | `AgentDetailModal.tsx:86` | `onDirectInstruct(agent.id, instruction)` | AI에게 **직접 지시** (P18) |
| 5 | `App.tsx:663` | `{ title, assignedAgentId: agentId, createdBy: sessionActor() }` | 역할 무관하게 AI 수행자 확정 (P19) |
| 6 | `taskLifecycleAppAdapter.createManualTask` | `ownerTeamId = teamOfAgent(assignedAgentId)` | HQ의 AI 지정을 그대로 수용 (P1·P2) |
| 7 | `acceptRuntimeProposals` | `assignedAgentId: toCanonicalAgentId(p.agentId)` | runtime 제안이 AI 확정 (P3은 팀장 선행이라 MET) |
| 8 | `managerOrchestrator.addTask` | `agentId: toCanonicalAgentId(t.agentId)` | 제안 자체가 AI 지목 |
| 9 | `agentTaskRunner` / `AgentTaskSpec.agentId` | spec에 AI 고정 | 팀장 지시 경유 없음 |

## 3. 데이터 모델이 "팀장 직접 수행"을 표현할 수 있는가

**아니오.** 현재 `LifecycleTask` 키:
```
ref, title, ownerTeamId, ownerHumanId, requestingTeamId, assignedAgentId,
status, dependencyMode, approvalRoute, createdBy, createdAt, decisions
```
- 수행자가 **AI 고정**(`assignedAgentId: string`) — 인간 수행을 표현할 자리가 없음 (P5)
- 수행자 **변경 이력**을 남길 필드 없음 (P6·P14)
- `지시자`는 `createdBy`로 있으나 **제출자**(팀장→HQ 보고 주체) 없음

## 4. 최소 필드 제안 (신규 구조 없이 확장)

```ts
export type ExecutorKind = 'agent' | 'human' | 'unassigned';

interface LifecycleTask {
  // 기존 유지: ref, ownerTeamId, ownerHumanId, requestingTeamId, approvalRoute, decisions …
  executorKind: ExecutorKind;        // 'unassigned' 로 생성 → 팀장이 확정
  executorId?: string;               // agent id 또는 팀장 userId
  instructedBy: ActorRef;            // 지시자(HQ 또는 팀장) — createdBy 재사용 가능
  submittedBy?: ActorRef;            // 팀장이 HQ에 제출한 주체
  executorHistory: {                 // 수행자 변경 이력(삭제 없음)
    kind: ExecutorKind; id?: string; at: string; byLabel: string; reason?: string;
  }[];
  // ref.revisionOfTaskId / replacesTaskId 는 이미 존재 — 그대로 사용
}
```
`assignedAgentId`는 **하위호환용 파생 게터**로 남기고 정본은 `executorKind`/`executorId`.

## 5. 기존 parent/child 구조 재사용 가능한가

**가능합니다.** 다만 한 가지 정정이 필요합니다.

- 협업 업무를 `createManualTask`가 `requestingTeamId`만 채우고 **`parentTaskId`는 비워** 둡니다 → 반송 UI 조건(`parentTaskId` 존재)이 성립하지 않습니다(P9).
- 해결: 팀 간 협업 요청은 **요청팀 업무(부모) + 수행팀 업무(자식)** 두 건으로 만들고 기존 `createChildTask`를 그대로 씁니다. 새 구조 불필요.
- `revisionOfTaskId`/`replacesTaskId`도 이미 있으므로 재사용. 단 `createRevisionTask`가 `original.approvalRoute`를 **인덱스까지 통째로** 복사하는 부분만 `currentStageIndex: 0`으로 정정하면 P8이 해결됩니다.

## 6. 최소 수정 예상 파일 (GREEN 승인 시)

| 파일 | 예상 변경 |
|---|---|
| `src/services/taskLifecycleContract.ts` | `ExecutorKind`·`executorHistory` 필드, `createRevisionTask` 경로 0부터 재시작 |
| `src/services/taskLifecycleAppAdapter.ts` | `createManualTask`가 HQ의 AI 지정 거부·`unassigned` 생성, `assignExecutor`/`takeOverByLead`, `teamOfAgent` 미상 처리 |
| `src/App.tsx` | `handleAddTask`가 역할별로 대상(팀장 vs AI) 분기, `handleDirectInstruct` 경로 |
| `src/components/ChatConsole.tsx` | 빠른 추가·후보 배정 대상을 **팀**으로 |
| `src/components/TaskBoard.tsx` | AI 드롭다운 → 팀 선택(팀장 역할에서만 AI 선택 노출) |
| `src/components/AgentDetailModal.tsx` | 직접 지시 경로를 팀장 역할로 제한 |
| `src/components/ApprovalDetailModal.tsx`·`ApprovalListModal.tsx` | 내부 ID·'알 수 없음' 노출 제거 |

## 7. 기존 A1~A36 검사 처리

| 검사 | 처리 |
|---|---|
| **A26** ("HQ가 inventory_monitor에게 직접 지시 → 2단계") | **폐기·교체** — 새 정책에서 HQ는 AI를 지정하지 못함. "HQ가 상품팀장에게 지시 → 팀장이 수행자 선택" 으로 교체 |
| **A27** (동일 fixture로 팀장1차→HQ최종) | **교체** — fixture를 "팀장에게 지시" 기반으로 바꾸되 **2단계 검증 취지는 유지** |
| A25 (에이전트 소속=담당팀) | **유지하되 보완** — 미상 AI가 hq로 승격되지 않는 조건 추가 |
| A28·A29·A30·A30b·A12·A13·A31·A32 | **유지** (권한·보존 취지 그대로) |
| A1~A24·A33~A36 | **유지** |
| 신규 | P1~P19를 D-1.2 계약으로 추가 |

기존 GREEN 수치를 지키려고 잘못된 전제(A26/A27의 HQ→AI 직접 지시)를 보존하지 않겠습니다.

## 8. 제품 소스 무변경 증거

```
$ git status --short
?? scripts/smoke-rc2-d12-authority-policy-red-v0.mjs
```
`api/`·`src/` 변경 **0건**. 기존 스모크 무회귀: RC-2 `5/0·40/40`, D-1/D-1.1 `2/0·39/39`.

## 9. 정책 판단이 필요한 질문 (임의 결정하지 않음)

1. **HQ의 AI 열람 범위** — HQ가 AI 결과를 *열람*하는 것은 허용인가, 팀장 제출 전에는 목록에도 안 보여야 하는가?
2. **팀장 부재 시** — 담당 팀장이 없거나 응답 없을 때 HQ가 대행할 수 있는가, 아니면 무기한 대기인가?
3. **디자인팀 등 AI 미배치 팀** — 팀장 직접 수행만 가능한 팀의 기본 `executorKind`는?
4. **`handleDirectInstruct`(AI 상세 직접 지시)** — 팀장 역할에서만 허용으로 제한할지, 기능 자체를 제거할지?
5. **자동 스케줄 실행(`AgentTaskRunner`)** — 팀장 지시 없이 시각 트리거로 도는 자동 업무는 "팀장이 사전 승인한 상시 지시"로 볼 것인가?
6. **수정본의 수행자 기본값** — 팀장이 재선택할 때까지 `unassigned`인가, 직전 수행자를 제안값으로 보여줄 것인가?
7. **미상 AI 소속의 안전 기본값** — `hq` 승격 금지는 확정. 대신 오류로 거부할지, `unassigned` 보류 상태로 둘지?
8. **협업 업무의 부모/자식 2건 생성** — 요청팀에도 별도 업무 카드가 생기는 것이 운영상 맞는가?

## 10. 이번 단계 범위

제품 소스 변경 **0파일**. 신규 파일 2개(RED 검사 1 + 이 문서 1). GREEN 미착수.
push·Preview·main 병합·Production·RC-3 없음.
