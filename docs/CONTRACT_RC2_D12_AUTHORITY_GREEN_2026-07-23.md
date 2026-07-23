# RC-2 D-1.2 — 지휘 권한 정책 정정 (GREEN 완료)

- 브랜치: `fix/rc-2-task-lifecycle-contract`
- **HEAD(40자리)**: `febb6f324f8586bfaed53f5a032c59188b50f408`
- 상태: **로컬 GREEN 도달.** push·Preview·main 병합·Production·RC-3 **없음**.

## 0. Git 원문 증거

```
$ git rev-parse HEAD
febb6f324f8586bfaed53f5a032c59188b50f408

$ git log -1 --format="%H %s"
febb6f324f8586bfaed53f5a032c59188b50f408 feat(rc-2): D-1.2 GREEN 4 — 상시 지시(자동 스케줄) 사전 승인 게이트

$ git cat-file -e HEAD^{commit}
(exit 0 — 존재 확인)

$ git status --short
(출력 없음 — 작업 트리 깨끗)
```

## 1. 쉬운 말로 본 흐름 (바뀐 것)

| 단계 | 전 (D-1.1) | 후 (D-1.2) |
|---|---|---|
| 총괄이 일을 시킨다 | 화면에서 **AI를 직접 골라** 배정 | **팀에게** 보낸다. AI는 못 고른다 |
| 업무가 도착하면 | 곧바로 "승인 대기"로 뜸 | **"할 일"로 도착**. 아직 승인할 게 없다 |
| 누가 할지 정한다 | 이미 AI로 정해져 있음 | **담당 팀장이** AI 배정 / 직접 처리 중 선택 |
| 결과가 나오면 | 총괄 승인함에 바로 올라감 | 결과물이 있어야 **팀장 확인 대기**가 된다 |
| 총괄 확인 | 팀장 건너뛰기 가능 여부 불명확 | 팀장 확인 **뒤에만** 총괄에게 올라간다 |
| 수정 요청 | 같은 AI에게 **자동 재배정** | **팀장에게 반환**, 팀장이 수행 방식 재선택 |
| 수정본 경로 | 이전 팀장 확인을 **승계** | **처음부터 다시** (팀장 확인 재수행) |
| 팀장이 인수 | 표현할 자리가 없었음 | 이전 AI 시도·결과를 **지우지 않고** 이력에 쌓음 |
| 다른 팀에 부탁 | 카드 1건, 반송 버튼 안 나옴 | **요청팀 카드 + 수행팀 카드**, 반송 가능 |
| 목록에 보이는 범위 | 누구나 **전체** 업무가 보임 | 팀장=자기 팀+자기 요청 / 총괄=전체를 한 흐름으로 |
| 모르는 AI | **총괄 소속**으로 승격 | **'소속 확인 필요'**로 격리(삭제 안 함) |
| 화면에 뜨는 담당자 | 내부 ID(`INVENTORY_MONITOR`), '알 수 없음' | 사람이 읽는 이름 / '수행자 미정' / '소속 확인 필요' |
| 자동 스케줄 | 조건 없이 실행 | **팀장이 미리 승인한 상시 지시만** 실행 |
| 고위험 자동 업무 | 자동 완료 | 상시 승인이 있어도 **팀장 확인 후** 보고 |
| 시험 스케줄 | 구분 없음 | 결과를 **시험 자료**로 구분 표시 |

### 확정된 업무 흐름

```
총괄이 팀에 지시
  → 담당 팀장이 받는다 (수행자 미정)
  → 팀장이 정한다: 우리 팀 AI에게 맡김 / 내가 직접 처리
  → 결과가 나온다 (결과물 없으면 제출 자체가 거부됨)
  → 담당 팀장이 먼저 확인
  → 총괄에게 보고
  → 총괄이 승인 or 수정 요청
       └ 수정 요청 → 팀장에게 반환 → 팀장이 다시 수행 방식 선택
                     → 결과 → 팀장 확인 → 총괄 재보고
```

## 2. 검사 결과

`scripts/smoke-rc2-d12-authority-policy-red-v0.mjs`

```
[BASE]  2 pass / 0 fail
[RED ] 51 met  / 0 unmet   (확정 권한 정책 P1~P49 + A26R/A27R)
✓ 전부 충족 — RC-2 D-1.2 GREEN 도달
```

- P1~P19 — HQ의 AI 직접 지정 차단, 팀장 단계 선행, 미상 AI 격리, 내부 ID 비노출, 소비자 5곳 정리
- P20~P36 — 업무 **수신**과 결과 **승인** 분리(생성 즉시 승인 대기 금지), 결과물 없는 승인 금지
- P37~P41 — 협업 부모/자식 흐름, 역할별 열람 범위, 수정본 반환
- P42~P49 — 상시 지시 사전 승인, 중지/재개/범위변경 이력, 고위험 확인 필수, 시험 출처 구분
- A26R / A27R — 폐기한 A26·A27(HQ→AI 직접 지시 전제)의 교체 검사. 2단계 검증 취지는 유지

## 3. 무회귀

```
전체 스모크        98 pass / 0 fail   (98개 전부)
tsc -b             exit 0
npm run build      ✓ built
eslint src api     0 problems (신규 lint 0)
git status --short (출력 없음)
```

지표 정합성:

| 하네스 | 결과 |
|---|---|
| `smoke-metric-definition-parity-v0` | 163 pass / 0 fail / 0 skip |
| `smoke-cross-team-revenue-metric-parity-v0` | 20 pass / 0 fail |
| `smoke-c2-revenue-basis-parity-v0` | 17/17 met |
| RC-2 생명주기 계약 | 40/40 met |
| RC-2 D-1 App 실배선 | 39/39 met |

매출·주문·재고·문의 계산 로직은 **변경하지 않았다**(변경 파일 목록에 계산 모듈 없음).

## 4. 커밋별 역할

| 커밋 | 역할 |
|---|---|
| `245eb1d` | GREEN 1 — 생명주기 모델·전이. `ExecutorKind`/`executorHistory`/`submittedBy` 추가, 생성 즉시 `awaiting_approval` 금지, 수정본 단계 0 재시작, `createDirectiveTask`/`assignExecutor`/`submitResult`/`designateActingLead`/`visibleTasksFor`/`createCollaborationRequest` |
| `f24dca9` | GREEN 2 — 지휘 경로. `teamOfAgent` 미상→null(hq 승격 금지), `executorDisplayName`, `createManualTask` 배정 조건, `acceptRuntimeProposals` 결과 유무 분기, ChatConsole·TaskBoard·AgentDetailModal·App 정리 |
| `323914c` | 통합검사 전제 갱신 — '생성=승인대기' 낡은 전제만 실제 경로로 교체(단언 약화 없음) |
| `2c41033` | D-1.2 검사 판정 전환(전부 충족 시 통과) |
| `2c3fcc5` | GREEN 3 — 협업 흐름·수정본 반환·역할별 열람 범위 (P37~P41 추가 후 구현) |
| `febb6f3` | GREEN 4 — 상시 지시 사전 승인 게이트 (P42~P49 추가 후 구현) |

## 5. 변경 파일 (15)

**계약·서비스**
- `src/services/taskLifecycleContract.ts` — 수행자 유형·이력·제출자 필드, 생성/수정본 전이
- `src/services/taskLifecycleAppAdapter.ts` — 전이 API, 담당팀 판정, 표시 이름, 열람 범위
- `src/services/standingDirectiveContract.ts` **(신규)** — 상시 지시 승인·이력·고위험·출처
- `src/services/agentTaskRunner.ts` — `canAutoRunAgentTask` 게이트
- `src/types/agentTask.ts` — `standing` 필드

**화면**
- `src/App.tsx` — 팀 지시 경로, 직접 지시 권한 재확인, 역할별 목록
- `src/components/ChatConsole.tsx` · `TaskBoard.tsx` — AI 드롭다운 → 팀 선택
- `src/components/AgentDetailModal.tsx` — 직접 지시를 해당 팀장에게만
- `src/components/ApprovalDetailModal.tsx` · `ApprovalListModal.tsx` — 내부 ID·'알 수 없음' 제거
- `src/components/AgentTaskPanel.tsx` · `DepartmentWorkspacePanel.css` — 자동 완료 게이트·차단 사유 표시

**검사**
- `scripts/smoke-rc2-d12-authority-policy-red-v0.mjs` — P37~P49 추가, 판정 전환
- `scripts/smoke-rc2-app-integration-red-v0.mjs` — 낡은 전제 fixture 교체

## 6. 남은 것 / 아직 아닌 것

- 실제 시각 자동 발화(스케줄러 상주 프로세스)는 여전히 **미구현**이다. 이번 작업은
  "돌아도 되는가"를 판정하는 게이트와 이력이며, 시각 트리거 자체는 백엔드 단계 몫이다.
- 상시 지시 편집 UI(AI 직원 → 자동 업무 탭에서 소유·범위·승인 조작)는 계약만 갖췄고
  화면 편집기는 붙이지 않았다. 지금은 `standing` 이 없는 자동 업무 = 자동 실행 안 함이 기본값이다.
- 역할 전환기는 데모용이다(실제 로그인·백엔드 권한 격리는 범위 밖).
