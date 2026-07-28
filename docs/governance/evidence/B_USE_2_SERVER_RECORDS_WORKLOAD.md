# B-use-2 서버 기록 — 저장 요구량·현재 구조·이관 난이도 (기술 입력)

작성: 2026-07-28 · 브랜치 `codex/b-use-2-server-records-decision-input` (`c22586b` 에서 분기)
목적: **DB를 고르기 위한 입력**을 저장소 사실로 만든다. 이 문서는 DB를 고르지 않고, 서버 저장을 구현하지 않는다.

이 문서의 규칙(헌법 §10): 주장에는 `파일:행` 근거와 확인 범위를 함께 쓴다. 저장소에서 확인되지 않는 값은 **`가정`** 으로 명시하고 사실과 섞지 않는다.

---

## 1. 쉬운 결론

**① 지금 업무 기록은 전부 한 사람의 브라우저 안에만 있다.** 다섯 영역이 localStorage 키 5개에 들어간다. 다른 직원의 브라우저에는 그 기록이 **존재하지 않는다**(공유도, 충돌도 없다 — 서로 고립돼 있다).

**② 기록이 소리 없이 사라지는 상한이 세 군데 있다.** 업무 500건·활동 원장 500건·팀 메시지 300건을 넘으면 오래된 것부터 잘려 나가고, 저장 실패도 화면에 나타나지 않는다. 헌법 §5(“오래됐다는 이유로 조용히 삭제하지 않는다”)와 어긋나는 현재 상태다.

**③ 용량을 실제로 위협하는 것은 업무 건수가 아니라 첨부파일이다.** 텍스트 기록 1건은 **0.4~1.2KB**로 아주 작다(실측). 그런데 팀 메시지 첨부는 파일 원문을 base64로 그대로 안고 있어서 **1건이 약 1.2MB**까지 커진다(실측). 텍스트 기록 **약 2,000건 분량**이 첨부 1건과 맞먹는다.

**④ 서버로 옮길 때 화면을 안 건드려도 된다는 말은 지금 그대로는 성립하지 않는다.** 저장 함수가 전부 **즉시 값을 돌려주는 동기 방식**이라, 네트워크 저장으로 바꾸면 호출부가 기다려야 한다. 화면을 지키려면 “읽기 캐시 + 비동기 쓰기” 계층을 저장 경계 안에 하나 더 넣어야 한다.

**⑤ 지금은 서로 덮어쓰는 게 아니라 서로 안 보이는 것이다 — 다만 그 구조가 서버로 가면 덮어쓰기가 된다.** (2026-07-28 표현 교정)

- **서로 다른 직원의 브라우저**: localStorage 는 브라우저마다 따로다. 지금은 서로의 기록을 덮어쓰는 것이 아니라 **각자 고립돼 아예 보이지 않는다.**
- **같은 브라우저의 여러 탭**: localStorage 를 공유한다. 모든 쓰기가 “전체 목록을 읽어 → 고쳐 → 전체를 다시 저장”이라서 두 탭이 거의 같은 때 저장하면 **나중 저장이 앞 저장을 지운다**(현재도 발생 가능).
- **앞으로 서버에서**: 지금의 전체 배열 교체 방식을 그대로 쓰면 여러 사용자 사이에서 **lost update** 가 생긴다. 그래서 서버 저장은 **행 단위(append/upsert)** 로 바꿔야 한다.

**⑥ 이미 쓸 수 있는 선례가 저장소 안에 있다.** 마케팅 행동수집이 `포트 ← Postgres 어댑터 ← 소비자` 구조로 이미 동작하고 `pg` 패키지도 설치돼 있다. 새 구조를 발명할 필요가 없다.

**⑦ 지금은 실제 고객 개인정보가 없지만, 그릇은 이미 있다.** CS 완료 기록 타입에 고객 이름·전화·이메일 칸이 있고 저장 경로까지 연결돼 있다. 지금 값은 합성 자료지만, C단계에서 실데이터가 연결되면 **그 순간부터 서버에 실제 개인정보가 쌓인다.** DB를 고를 때 이 조건을 미리 넣어야 한다.

---

## 2. 확인 범위

**확인한 것** — 다섯 기록 영역의 생산자·포트·어댑터·주요 소비자만 따라갔다.

| 대상 | 방법 |
|---|---|
| 저장 구현 5종 | `taskLifecycleStore.ts` · `activityLedger.ts` · `teamMessageCenter.ts` · `csLocalStatePersistence.ts` · `agentTaskStore.ts` 전문 읽기 |
| 도메인 경계 | `src/services/repositories/` 5파일 + `README.md` 전문 읽기 |
| 정본 타입 | `taskLifecycleContract.ts:102-222` · `types/activityLedger.ts` · `types/teamMessage.ts` · `types/agentTask.ts` · `csWorkCompletionState.ts:21-50` · `csApprovalQueueBridge.ts:16-33` · `csTeamDashboardFacts.ts:484-504` |
| 실행 경로 | `agentTaskRunner.ts` 전문 · `App.tsx` lifecycle 핸들러 · `CsTeamDashboard.tsx:795-825, 898-913` |
| 소비자 수 | `grep -rl` 로 import 전수 계수 (아래 §3.0) |
| 레코드 크기 | **실측** — 실제 계약 함수를 호출해 만든 레코드를 `JSON.stringify` 후 UTF-8 바이트 계측 (§4.1, 재현 명령은 §9) |
| Postgres 선례 | `api/_shared/marketingBehaviorPersistentStore.ts` 전문 · `marketingBehaviorPostgresStore.ts:1-60` · `package.json` |

**확인하지 않은 것(이 문서가 말하지 않는 것)**

- DB 제품별 가격·무료 등급 한도·운영 난이도 — **Codex 조사 범위**
- 브라우저 localStorage 실제 총 한도 — 저장소 코드에 없는 외부 환경값
- 실제 운영 데이터량 — 아직 존재하지 않음(§5 전부 가정)
- 다섯 영역 밖의 저장(채팅 기록·마케팅 분석 메모리·변환기 자산 등) — 지시 범위 밖
- 브라우저 실측·Vercel·Preview·Production — 이번 작업에서 실행하지 않음

---

## 3. 다섯 기록 영역별 현재 구조

### 3.0 공통 — 경계와 소비자 (전수 계수)

| 항목 | 실측 |
|---|---|
| 화면(`src/components/`)이 저장 구현을 직접 import | **0건** (facade 경계 유지) |
| `services/repositories/` facade 를 import 하는 화면 | **9개 파일** |
| lifecycle 은 facade 가 아니라 **어댑터** `taskLifecycleAppAdapter` 뒤 | 화면 **10개 파일**이 어댑터만 import |
| `taskLifecycleStore` 를 import 하는 곳 | **1곳**(어댑터) — 화면 0 |

확인 명령은 §9. `src/services/repositories/README.md:3` 이 선언한 경계는 **현재 지켜지고 있다**.

예외 1건: `agentTaskRunner.ts:7-8` 은 서비스 계층이라 facade 를 거치지 않고 `teamMessageCenter`·`activityLedger` 를 직접 import 한다. 화면이 아니므로 경계 위반은 아니지만, **서버 어댑터 전환 시 이 파일도 함께 바뀌는 호출부**다.

**다섯 영역의 저장키 전부**

| 영역 | 저장키 | 근거 |
|---|---|---|
| lifecycle | `godo.rc2.taskLifecycle.v1` | `taskLifecycleStore.ts:15` |
| activity ledger | `godo_activity_ledger_v0` | `activityLedger.ts:9` |
| team messages | `godo_team_messages_v0` | `teamMessageCenter.ts:13` |
| CS 상태 | `godo_ai_os.cs_state.v0` | `csLocalStatePersistence.ts:13` |
| agent task 정의 | `godo_agent_tasks_v0` | `agentTaskStore.ts:8` |

---

### 3.1 lifecycle 업무·결과·승인·수행자 변경 이력

| 항목 | 사실 | 근거 |
|---|---|---|
| 정본 타입 | `LifecycleTask` — `ref`(taskId/correlationId/parentTaskId/revisionOfTaskId) · `title` · `ownerTeamId` · `requestingTeamId?` · `executorKind`/`executorId` · `executorHistory[]` · `submittedBy?`/`submittedAt?` · `status` · `approvalRoute` · `createdBy`(ActorRef) · `decisions[]` · `artifactRefs?`/`inputRefs?` · `resultSummary?` · `stopRequests?` · `trackingOnly?`/`reviewOnly?` | `taskLifecycleContract.ts:154-209` |
| 경계 | facade 없음. **어댑터** `taskLifecycleAppAdapter.ts` 가 도메인 경계다 | `repositories/README.md` 대상 외 · `CURRENT_STATE.md §5-1` |
| 어댑터 | localStorage 단일 구현 | `taskLifecycleStore.ts:34-57` |
| schemaVersion | **있음** `SCHEMA_VERSION = 1`, 구자료 후퇴 읽기 구현 | `taskLifecycleStore.ts:14, 41-43` |
| 구자료 이관 규칙 | 배열만 저장된 구형(`schemaVersion 0`)도 **삭제 없이** 읽는다 | `taskLifecycleStore.ts:41` |
| 생성·수정 | `saveLifecycleTask`(taskId upsert) · `saveLifecycleTasks`(다건) · **삭제 API 없음** | `:64-82` |
| 조회 | `loadLifecycleTasks()` 전량 · `tasksByCorrelation` · `childTasksOf` · `findTask` | `:60-93` |
| **구독** | **없음** — `storage` 이벤트 리스너가 이 영역에만 없다 | `taskLifecycleStore.ts` 전문 · `taskLifecycleAppAdapter.ts` 검색 0건 |
| append-only 이력 | `decisions[]`(`:183-184` “어떤 결정도 이 배열을 지우지 않는다”) · `executorHistory[]`(`:166-167`) · `stopRequests[]`(`:194-197`) · 상태는 전이만, 레코드 삭제 없음(`taskLifecycleStore.ts:9`) |
| 추적 키 | `ref.taskId`(고유) · `ref.correlationId`(흐름) · `ref.parentTaskId`(협업 자식) · `inputRefs`(`teammsg:<id>` 역참조) |
| 멱등 키 | HQ 확인 요청은 **원본 메시지 참조로 멱등** — 같은 `messageRef` 를 가진 업무가 있으면 새로 만들지 않고 기존 것을 돌려준다. **다른 세 경로(HQ 지시·팀 내부·협업)에는 멱등 장치가 없다** | `taskLifecycleAppAdapter.ts:926-927` |
| 건수 제한 | **`MAX_TASKS = 500`**, 저장 시 `slice(-500)` → **501번째부터 오래된 업무가 경고 없이 사라짐** | `:16, 52` |
| 저장 실패 | `catch {}` 로 **조용히 무시** | `:54-56` |
| 첨부 원문 | **저장하지 않는다.** `data:`/`;base64,` 패턴을 `sanitizeTask` 가 걸러낸다 — 실측: 입력 2건 중 base64 1건이 버려지고 `teammsg:` 참조만 남음 | `:23-32` · §4.1 실측 |

### 3.2 activity ledger

| 항목 | 사실 | 근거 |
|---|---|---|
| 정본 타입 | `ActivityEvent` — `id` · `teamId` · `type`(5종) · `status`(5종) · `title` · `detail?` · `actor` · `relatedTeam?` · `refId?` · `taskId?` · `correlationId?` · `at` | `types/activityLedger.ts:17-32` |
| 경계 | `repositories/activityLedgerRepository.ts` (재수출) |
| 어댑터 | localStorage | `activityLedger.ts:22-41` |
| schemaVersion | **없음.** 배열을 그대로 저장한다 | `:34-41` |
| 구자료 이관 규칙 | 집계가 `taskId ?? refId` 로 안전 후퇴 — 구버전 이벤트에 `taskId` 가 없어도 깨지지 않는다 | `:92-100` · `types/activityLedger.ts:27-28` |
| 생성 | `logActivity()` — load → append → save 전체 재작성 | `:125-130` |
| **수정·삭제** | **없음.** append 전용 | `activityLedger.ts` 전문 |
| 조회·구독 | `loadActivity` · `activityForTeam` · `teamSummary` · `allTeamsSummary` / `subscribeActivity`(다른 탭 `storage` 이벤트) | `:22-48, 82-122` |
| append-only 이력 | **영역 전체가 append-only 이력이다** |
| 추적 키 | `taskId` · `correlationId` · `refId`(메시지 id) |
| 멱등 키 | **없음.** 같은 행동을 두 번 부르면 이벤트가 2건 쌓인다. 화면 쪽에서 “사용자 행동 1건 = 원장 1건” 규율로만 지킨다 | `CURRENT_STATE.md` B-use-3 절 · `App.tsx` 각 핸들러 |
| 건수 제한 | **`MAX_EVENTS = 500`**, `slice(-500)` | `:10, 37` |
| 저장 실패 | `catch {}` 로 조용히 무시 | `:38-40` |
| 첨부 원문 | 없음(참조 id 만) |
| ID 생성 | `act_<base36 시각>_<seq>_<random>` — **시각+난수 기반이라 클라이언트마다 독립 생성**. 서버 이관 시 충돌 가능성은 낮지만 정렬 근거로 쓰면 안 된다(정렬은 `at`) | `:12-17` |

### 3.3 team messages

| 항목 | 사실 | 근거 |
|---|---|---|
| 정본 타입 | `TeamMessage` — `id` · `from`(actor) · `toTeam` · `kind`(support/confirm/info) · `title` · `body` · **`attachments[]`** · `status` · `createdAt`/`updatedAt` · `readByTo` · **`events[]`** | `types/teamMessage.ts:49-62` |
| 경계 | `repositories/teamMessageRepository.ts` |
| 어댑터 | localStorage | `teamMessageCenter.ts:29-49` |
| schemaVersion | **없음.** 배열 그대로 | `:41-49` |
| 생성·수정 | `postTeamMessage` · `resolveTeamMessage`(상태 전이) · `markInboxRead` — 전부 load → map → save 전체 재작성 | `:122-143` |
| **삭제** | **없음** |
| 조회·구독 | `inboxFor` · `outboxFor` · `unreadCountFor` · `openInboxCountFor` / `subscribeTeamMessages` | `:52-57, 106-118` |
| append-only 이력 | **`events[]`** — `created`/`read`/`status`/`reply` 가 덮어쓰기 없이 쌓인다 | `:95-103` · `types/teamMessage.ts:41-47` |
| 추적 키 | `id`(→ lifecycle 의 `inputRefs` 가 `teammsg:<id>` 로 참조) |
| 멱등 키 | **없음.** 같은 내용을 두 번 보내면 2건이 된다 |
| 건수 제한 | **`MAX_MESSAGES = 300`**, `slice(-300)` | `:14, 44` |
| 저장 실패 | `catch {}` 로 조용히 무시 | `:46-48` |
| **첨부 원문** | **base64 `dataUrl` 을 그대로 보관한다.** 개별 원본 **1.5MB 이하**면 인라인, 초과하면 메타만 남기고 `omitted: true` | `:15-16, 60-65` · `types/teamMessage.ts:31-39` |
| 동시사용 직결 | 디자인팀 작업 큐가 **팀 메시지에서 파생**된다(`inboxFor(messages,'design')`) — 확인된 4명 동시작업 근거가 이 저장키를 직접 친다 | `DesignTeamDashboard.tsx:19-23` · `DepartmentWorkspacePanel.tsx:621` · `docs/MASTER_REPORT_2026-07-03_FINAL.md:210` |

### 3.4 CS completion·처리 이력

| 항목 | 사실 | 근거 |
|---|---|---|
| 정본 타입 | `CsPersistedStateV0` — `schemaVersion` · `savedAt` · `completedWorkItems[]` · `approvalItems[]` · `assigneeByItem{}` · `memoByItem{}` · `customerManagement{메모/주의/블랙리스트후보}` | `csLocalStatePersistence.ts:22-30` |
| 경계 | `repositories/csWorkflowRepository.ts` |
| 어댑터 | localStorage | `:87-120` |
| schemaVersion | **있음** `0`. **불일치하면 `null` 반환 = 조용히 버림**(다른 영역의 “후퇴 읽기”와 다른 정책) | `:14, 70` |
| 구자료 이관 규칙 | `sanitizeCsPersistedState` 가 형식 검사 후 필드별로 정규화 | `:68-85` |
| 생성·수정 | **레코드 단위 API가 없다.** 화면 상태 전체를 통째로 덮어쓴다 | `:99-114` · `CsTeamDashboard.tsx:811-816` |
| 쓰기 트리거 | `useEffect` 의존 배열 7개 중 **하나라도 바뀌면 전체 재직렬화** | `CsTeamDashboard.tsx:810-817` |
| **삭제** | **다섯 영역 중 유일하게 삭제 API 존재** — `clearCsPersistedState()`, 화면의 `handleClearLocal` 이 `confirm` 후 호출 | `:116-120` · `CsTeamDashboard.tsx:819-823` |
| 구독 | **없음** |
| append-only 이력 | **없음.** 완료 이력은 배열 통째 교체이므로 append-only 보장이 코드에 없다 |
| 멱등 키 | **있음(2종)** — 완료 중복 방지 `completionKey = sourceType:originalId`, 승인 큐 중복 방지 `csApprovalKey = sourceType:originalId:answerText` | `csWorkCompletionState.ts:46` · `csApprovalQueueBridge.ts:32-33` |
| 건수 제한 | **없음**(상한 없이 계속 커짐) |
| 저장 실패 | `catch {}` 로 조용히 무시 | `:113` |
| **개인정보** | `CsCompletedWorkItem` 에 `customerName?` · `memberId?` · `orderNo?` · `originalText?` 가 있고, `customer?: CsDetailCustomerBlock` 에 **`name` · `phone` · `email`** 이 있다. 화면이 `customer: d.customer` 로 **실제로 전달한다** | `csWorkCompletionState.ts:21-43` · `csTeamDashboardFacts.ts:496-504` · `CsTeamDashboard.tsx:902, 913` |
| 현재 값의 성격 | 문의·리뷰는 **미연결(`unavailable` 0건)** 이고 CS 화면 자료는 합성(`isSynthetic` 플래그·`csOnlyFakeContacts`) — **오늘 실제 PII 는 없다.** 다만 그릇과 경로는 이미 있다 | `CURRENT_STATE.md §3` · `csTeamDashboardFacts.ts:497, 556` · `DepartmentWorkspacePanel.tsx:298` |
| 모듈 주석과의 불일치 | `:5` 는 “고객 기본 PII 는 굳이 복제 저장하지 않는다”라고 적었지만, `customer` 블록 경로로 이름·전화·이메일이 들어올 수 있다. **주석이 현재 코드보다 좁다** |

### 3.5 agent tasks·실행 결과

| 항목 | 사실 | 근거 |
|---|---|---|
| 정본 타입(정의) | `AgentTaskSpec` — `id` · `teamId` · `agentId`/`agentLabel` · `title` · `focus` · `reportTo`/`reportKind` · `schedule` · `approvalMode` · `standing?` | `types/agentTask.ts:26-42` |
| 경계 | `repositories/agentTaskRepository.ts` — 원시 배열 저장(`saveAgentTasks`)은 **의도적으로 미노출** | `agentTaskRepository.ts:2-3` |
| 어댑터 | localStorage, 없으면 `DEFAULT_AGENT_TASKS` **3건** 시드 | `agentTaskStore.ts:17-27` · `data/defaultAgentTasks.ts:7` |
| schemaVersion | **없음** |
| 생성·수정·삭제 | `saveUpsertTask` · `saveRemoveTask` · `resetAgentTasks` — **삭제가 실재한다**(정의 한정) | `:56-69` |
| 조회·구독 | `loadAgentTasks` / `subscribeAgentTasks` | `:17-43` |
| 건수 제한 | **없음** |
| 저장 실패 | `catch {}` 로 조용히 무시 | `:33` |
| **실행 결과의 저장 위치** | **이 영역에 실행 결과 저장소가 없다.** 결과는 두 곳으로 흩어진다 — ① 팀 메시지 1건(보고 본문) ② 활동 원장 1~2건(`task_run`, 사람 승인 시 `approval` 추가) | `agentTaskRunner.ts:62-78` |
| 멱등 키 | **있음** `lifecycleTaskId(spec) = 'agenttask-' + spec.id` 를 `taskId`·`correlationId` 양쪽에 넣어 “같은 spec 의 대기→완료”가 같은 키로 닫힌다. 원장 자체는 append 라 이벤트는 쌓이고, 집계가 `taskId` 로 dedup 한다 | `:50-51, 66-71` · `activityLedger.ts:92-100` |
| 승인 대기 재실행 | `stageApprovalTask` 를 두 번 부르면 **pending 이벤트가 2건 쌓인다**(집계는 최신 1건만 보지만 원장 행수는 증가) | `:101-110` |
| 실행 진입점 | 사람 `runManualAgentTask` ← `AgentTaskPanel.tsx:38` / 스케줄 `runScheduledAgentTask` — **제품 코드 내 호출자 0건** | `:145, 169` · `CURRENT_STATE.md §5` |

---

## 4. 저장량 계산 변수와 보수적 시나리오

### 4.1 레코드 1건 크기 — **실측** (사실)

실제 계약 함수로 레코드를 만들어 `JSON.stringify` 후 UTF-8 바이트로 계측했다. 재현 명령은 §9.

| 레코드 | 실측 크기 |
|---|---|
| lifecycle 업무 — 생성 직후(HQ 지시, 원본 참조 1) | **631 B** |
| lifecycle 업무 — 완주(결정 2 + 수행자 이력 1 + 결과문 1) | **1,218 B** |
| lifecycle — 수정요청 흐름 전체(원본 superseded + 수정본, 2건 합) | **1,720 B** |
| lifecycle — 협업(추적 부모 + 수행 자식, 2건 합) | **1,196 B** |
| activity event 1건(taskId·correlationId 포함) | **412 B** |
| team message — 첨부 없음, 짧은 본문 | **560 B** |
| team message — 이벤트 4건 누적(생성·읽음·진행·완료) | **890 B** |
| team message — **900KB 첨부를 base64 인라인 보관** | **1,200,646 B (≈1.2 MB)** |
| team message — 상한 초과 첨부(메타만, `omitted`) | **605 B** |

**해석**: 텍스트 기록은 **0.4~1.2KB** 대역으로 매우 작다. 첨부 1건이 텍스트 기록 **약 2,000건**과 맞먹는다. → **저장량 설계의 지배 변수는 업무 건수가 아니라 첨부다.**

base64 팽창도 실측으로 확인됐다. 인라인 판정은 **선언된 원본 크기(`a.size`)** 로 하는데(`teamMessageCenter.ts:61`) 저장되는 것은 base64 문자열이므로 약 **1.33배**로 부푼다. 상한 `1,500,000 B` 직전 파일은 저장 시 **약 2.0MB**가 된다.

### 4.2 계산식

```
총 저장량 ≈ Σ(영역별)  직원 수 × 1인당 일 기록 건수 × 연간 운영일 × 보존 연수 × 레코드 크기
          + 첨부 총량 ( 첨부 건수 × 평균 원본 크기 × 1.33 )   ← base64 로 보관하는 한
```

### 4.3 한 업무에서 실제로 생기는 레코드 (사실)

| 사용자 행동 1회 | 만들어지는 레코드 | 근거 |
|---|---|---|
| HQ 지시 | 메시지 1 + 업무 1 + 원장 1 = **3건** | `App.tsx handleSendDirective` |
| 팀 내부 업무 등록 | 업무 1 + 원장 1 = **2건** | `App.tsx handleCreateTeamTask` |
| 팀 간 협업 요청 | 메시지 1 + 업무 **2**(추적 부모·수행 자식) + 원장 1 = **4건** | `taskLifecycleAppAdapter.ts:988` |
| 팀→HQ 확인 요청 | 메시지 1 + review-only 카드 1 + 원장 1 = **3건**(재요청은 멱등) | `:906` 정의 · `:926-927` 멱등 판정 |
| 수행자 지정 | 기존 업무의 `executorHistory` **+1 항목**(새 행 아님) | `taskLifecycleContract.ts:166` |
| 결과 제출 | 기존 업무에 `resultSummary`·`submittedBy` 갱신 | 동 `:169-192` |
| 승인·수정요청·중단 결정 | `decisions` **+1 항목** (수정요청은 **새 업무 1건 추가 생성**) | 동 `:183-184` · `createRevisionTask` |
| AI 자동 업무 1회 실행 | 메시지 1 + 원장 1 (사람 승인 경유면 원장 **2**) | `agentTaskRunner.ts:62-78` |

즉 **업무 1건의 수명주기 = lifecycle 행 1~2 + 원장 3~6 + 메시지 1~2** 규모다.

### 4.4 보수적 상한 시나리오 — **전부 `가정`**

아래 숫자는 저장소에서 확인되지 않는다. **회사 인원·업무량·보존 기간은 사용자 결정 사항이다**(§8). 계산 방법만 보이기 위한 예시다.

| 변수 | 확인된 사실 | 가정(예시) |
|---|---|---|
| 직원 수 | 디자인팀 **4명 동시작업**만 확인됨 | `가정` 전사 15명 — *4명 근거를 전사로 확대 해석하지 않는다* |
| 1인당 일 기록 건수 | 없음 | `가정` 20건(§4.3 기준 업무 4~6건 상당) |
| 연간 운영일 | 없음 | `가정` 250일 |
| 보존 연수 | 없음 | `가정` 3년 |
| 텍스트 레코드 평균 | **실측 0.4~1.2KB** | `가정` 평균 800 B |
| 첨부 건수 | 없음 | `가정` 일 5건 |
| 첨부 평균 원본 | 없음 (상한만 확인: 1.5MB) | `가정` 500KB |

예시 계산(가정 대입):

- 텍스트: 15 × 20 × 250 × 3 × 800 B ≈ **180 MB**
- 첨부(현재 base64 방식 유지 시): 5 × 250 × 3 × 500KB × 1.33 ≈ **2.5 GB**

→ **첨부가 텍스트의 약 14배**다. 첨부를 DB 안에 base64로 넣을지, 별도 파일 저장소(URL 참조)로 뺄지가 **DB 용량 요구를 한 자릿수 단위로 바꾼다.** 이 판단이 DB 후보 비교보다 먼저다.

### 4.5 동시 사용자가 영향을 주는 쓰기 경로 (사실)

모든 쓰기가 **전체 목록 재작성**이다.

**지금 실제로 일어나는 일 (2026-07-28 표현 교정)**
- 다른 직원의 브라우저와는 저장소 자체를 공유하지 않는다 → **덮어쓰기가 아니라 고립**이다.
- **같은 브라우저의 여러 탭**은 localStorage 를 공유하므로 전체 배열 재저장 과정에서 **덮어쓰기가 발생할 수 있다**(현재도).

**서버로 갔을 때**: 같은 전체 배열 교체 방식을 유지하면 여러 사용자 사이에서 **lost update** 가 생긴다.

| 경로 | 재작성 대상 | 근거 |
|---|---|---|
| `logActivity` | 원장 전체 배열 | `activityLedger.ts:126-128` |
| `postTeamMessage` / `resolveTeamMessage` / `markInboxRead` | 메시지 전체 배열 | `teamMessageCenter.ts:122-143` |
| `saveLifecycleTask` / `saveLifecycleTasks` | 업무 전체 배열 | `taskLifecycleStore.ts:65-82` |
| CS 저장 | CS 상태 **전체 객체**(7개 상태 중 하나만 바뀌어도) | `CsTeamDashboard.tsx:810-817` |
| `saveUpsertTask` / `saveRemoveTask` | 정의 전체 배열 | `agentTaskStore.ts:56-65` |

### 4.6 상한이 틀렸을 때 어려워지는 지점

| 지점 | 왜 어려운가 |
|---|---|
| **첨부 보관 방식** | base64 인라인을 그대로 서버에 옮기면 나중에 파일 저장소로 빼는 것이 **데이터 이관 작업**이 된다. 처음에 참조 방식으로 정하면 그 비용이 없다 |
| **동기 API 5종** | 호출부가 전부 즉시 값을 기대한다. 뒤늦게 async 로 바꾸면 화면 10개 파일의 호출부가 함께 바뀐다 (§3.0) |
| **전체 배열 재작성** | 행 단위 저장으로 바꾸는 것은 저장 함수 시그니처 변경이라 어댑터 안에서 끝나지 않는다 |
| **원장 무제한 증가** | 원장은 append 전용이라 가장 빨리 커진다. 파티셔닝·보존정책을 나중에 넣으려면 이미 쌓인 행을 옮겨야 한다 |
| **CS 전체 객체 저장** | 완료 이력이 커질수록 **메모 한 글자 바꿀 때마다 전체를 다시 쓴다.** 행 단위로 쪼개는 것이 나중일수록 비싸다 |
| **ID 생성이 클라이언트** | `Date.now()+random` 기반(`activityLedger.ts:12-17` · `teamMessageCenter.ts:19-24`). 서버 채번으로 바꾸면 기존 id 체계와 섞인다 |

---

## 5. 동시사용·백업·복구 요구

### 확인된 사실

- **다중 사용자 근거**: 디자인팀 **4명 동시작업** — `docs/MASTER_REPORT_2026-07-03_FINAL.md:210`. 같은 줄이 “생성기는 클라이언트 완결이라 동시 접속 자체는 무해, 단 **배분·검수 등 공유 협업 상태는 백엔드 필요**”라고 적는다. 그 공유 상태가 지금 **팀 메시지**다(`DesignTeamDashboard.tsx:19-23`).
- **다중 탭 반영**: 원장·메시지·agent 정의는 `storage` 이벤트 구독이 있다. **lifecycle 과 CS 상태는 구독이 없다** → 같은 사람이 탭 두 개를 열면 업무 카드가 서로 다르게 보인다(§3.1·§3.4).
- **백업**: 저장소에 백업·export 기능이 **없다**. 전수 검색 결과 다섯 영역에 export/download 코드 없음.
- **복구**: 저장 실패가 다섯 영역 모두 `catch {}` 로 삼켜진다 → **실패했는지 사용자도 개발자도 모른다.**

### 서버 저장 전 반드시 정해야 하는 것

1. 동시 쓰기 충돌 처리 — 행 단위 저장 + 낙관적 잠금(`updatedAt` 비교) 또는 서버 권위 채번
2. 실패 표면화 — 조용한 `catch {}` 를 걷어내고 사용자에게 보이게 (헌법 §5 “저장 실패를 숨기지 않는다”)
3. 절단 제거 — 500/500/300 상한 폐지와 함께 **보존 정책**을 명시적으로 정할 것
4. 백업 주기·복구 목표 시간 — 현재 근거 없음, 사용자 결정
5. 기존 localStorage 자료의 JSON 백업 실물 생성(마스터 계획 B-use-2 “시험자료 처리” 5단계, **현재 미결정**)

---

## 6. 기존 자료 이관 대상

| 저장키 | 이관 난이도 | 선택 import 가능성 |
|---|---|---|
| `godo.rc2.taskLifecycle.v1` | **낮음** — `{schemaVersion, tasks[]}` 봉투 형태, 구형 배열도 후퇴 읽기됨 | **가능**. taskId 로 upsert 하면 됨 |
| `godo_activity_ledger_v0` | **낮음** — 평탄 배열, append 전용 | **가능**. `id` 중복만 거르면 됨 |
| `godo_team_messages_v0` | **중간** — 첨부 base64 가 섞여 있어 파일 저장소로 뺄지 먼저 정해야 함 | 가능하나 **첨부 처리 방침 선행 필요** |
| `godo_ai_os.cs_state.v0` | **중간** — 레코드 단위가 아니라 상태 통짜. 완료 이력·승인 큐만 골라 옮기려면 분해가 필요 | 부분 가능(배열 2개는 분리 가능, 메모 3종은 키-값) |
| `godo_agent_tasks_v0` | **낮음** — 정의 3건 시드 기준, 편집분만 있음 | **가능**(또는 재시드) |

**주의(사실)**: 세 영역이 이미 상한으로 잘려 있을 수 있다. 지금 남아 있는 자료가 **과거 전부가 아닐 수 있으며, 무엇이 잘렸는지 알 방법이 없다**(잘린 기록이 남지 않음). 백업 전에 이 사실을 사용자에게 그대로 알려야 한다.

**금지(마스터 계획 B-use-2)**: 사용자가 JSON 백업 실물을 확인하기 전 localStorage 삭제 금지. 선택 import 여부는 **미결정**이다(`DECISIONS.md D-006 정정 2`).

---

## 7. DB 후보 비교에 반드시 넣어야 할 기술 조건

Codex 가 가격·운영 난이도를 조사할 때, 아래는 **저장소 사실에서 나온 요구**다.

| # | 조건 | 왜(저장소 근거) |
|---|---|---|
| 1 | **행 단위 append/upsert** 지원 | 현재 전체 배열 재작성이 lost update 를 만든다 (§4.5) |
| 2 | **동시 쓰기 충돌 제어**(트랜잭션 또는 낙관적 잠금) | 디자인팀 4명이 같은 팀 메시지 큐를 공유 (§5) |
| 3 | **첨부를 DB 밖에 둘 수 있는 경로**(object storage + URL 참조) | 첨부가 저장량의 지배 변수, base64는 1.33배 팽창 (§4.1·§4.4) |
| 4 | **append-only 이력 보존**(원장·decisions·executorHistory·events) | 헌법 §5 · §3 각 영역 |
| 5 | **텍스트 검색 또는 인덱스**(`taskId`·`correlationId`·`teamId`·`at`) | 모든 조회가 이 축이다 (§3) |
| 6 | **연결 수 상한**이 소수 동시 사용자에 충분한지 | 선례 어댑터는 `max: 3` 풀 (`marketingBehaviorPostgresStore.ts:57`) |
| 7 | **serverless 친화**(lazy 연결·cold start) | Vercel 이 유일한 실행 환경 (`CURRENT_STATE §1`) · 선례가 lazy dynamic import 를 쓰는 이유 (`marketingBehaviorPostgresStore.ts:11-13`) |
| 8 | **개인정보 취급 조건**(저장 위치·암호화·접근 통제·보존기간) | CS 완료 기록에 이름·전화·이메일 그릇이 있고 경로가 연결됨 (§3.4) |
| 9 | **백업·PITR(시점 복구)와 export 형식** | 현재 백업 수단 0 (§5) |
| 10 | **무료 등급 초과 시 동작**(중단인지 과금인지) | `MASTER_PLAN §13` 이 사용자에게 설명하도록 요구 |
| 11 | **다른 DB 로 옮기는 비용** | 상한 가정이 틀릴 수 있음 (§4.4·§4.6) |
| 12 | **실시간 반영 수단 유무**(구독/폴링) | lifecycle·CS 에 구독이 없어 어차피 새로 설계해야 함 (§3.1·§3.4) |

**재사용 가능한 선례(발명 불필요)**

| 자산 | 위치 | 쓸모 |
|---|---|---|
| 포트 인터페이스 | `api/_shared/marketingBehaviorStorageTypes.ts` | 저장소 계약 형태 |
| 어댑터 선택기 | `marketingBehaviorPersistentStore.ts:80-107` | env 감지 → 실제/pending/dev 폴백, **없는 것을 있다고 하지 않는 패턴** |
| Postgres 어댑터 | `marketingBehaviorPostgresStore.ts` | lazy Pool(`:50-58`) · 테이블명 sanitize(`:37-42`) · **자동 DDL 없음** · 비밀값 미노출(`:16-18`) |
| 패키지 | `package.json` `pg@^8.22.0` + `@types/pg@^8.20.0` | **이미 설치돼 있다** |
| 도메인 경계 | `src/services/repositories/` 5 facade | 화면 0건 우회 확인 (§3.0) |

**단, 선례를 그대로 쓸 수 없는 한 가지**: 선례의 포트는 **async**(`async appendEvents`)이고 다섯 영역의 API 는 **전부 sync** 다. 그래서 —

> **서버 어댑터를 붙일 때 UI를 다시 건드리지 않아도 되는가? → 지금 구조 그대로는 아니다.**
> `repositories/README.md:6` 의 “저장소를 교체할 때 화면 코드를 건드리지 않는다”는 **localStorage 계열 교체**에는 성립하지만, 네트워크 저장에는 성립하지 않는다. 동기 `loadX(): T[]` 를 async 로 바꾸면 화면 호출부(§3.0의 9~10개 파일)가 함께 바뀐다.
> 화면을 지키려면 **facade 안에 “메모리 캐시(동기 읽기) + 비동기 쓰기 큐 + 구독 알림”** 계층을 두어, 화면에는 지금의 동기 시그니처를 유지하는 방법이 필요하다. 이 결정은 DB 선택과 **독립**이며, DB 를 고르기 전에 정할 수 있다.

---

## 8. 미확인 · 사용자 사업 결정이 필요한 값

**사용자 결정(두 AI가 임의로 정하지 않는다 — 헌법 §11)**

| 값 | 왜 필요한가 |
|---|---|
| 전사 직원 수와 팀별 인원 | 계산식의 첫 변수. **확인된 것은 디자인팀 4명뿐** |
| 1인당 일 업무 건수(대략) | 레코드 증가 속도 |
| 기록 보존 기간 | 총량과 보존 정책 |
| 첨부 실제 사용량과 평균 크기 | **저장량의 지배 변수** |
| 첨부를 DB 안에 둘지 파일 저장소로 뺄지 | 용량 요구가 한 자릿수 단위로 달라짐 |
| 시험자료 보존 방침(선택 import / 새로 시작) | `DECISIONS.md D-006 정정 2` — **미결정** |
| 백업 주기·복구 목표 시간 | 현재 수단 0 |
| DB 제품 | Codex 비교표를 본 뒤 (`MASTER_PLAN §13`) |

**미확인(관측하지 못한 사실)**

- 브라우저 localStorage 실제 총 한도 — 코드에 없음, 브라우저·기기별 상이
- 현재 사용자 브라우저에 실제로 쌓인 자료의 양 — 브라우저 실측을 하지 않았다
- 세 영역의 절단이 **실제로 발생했는지** — 잘린 기록이 남지 않아 사후 확인 불가
- 저장 실패가 실제로 일어났는지 — `catch {}` 로 삼켜져 흔적 없음
- DB 후보별 공식 가격·무료 등급 한도·연결 수 제한 — **Codex 조사 범위**

---

## 9. 재현 명령과 파일:행 근거

### 경계·소비자 계수

```bash
# 화면이 저장 구현을 직접 import 하는가 (기대: 0건)
grep -rn "from '\.\./services/\(taskLifecycleStore\|activityLedger\|teamMessageCenter\|agentTaskStore\|csLocalStatePersistence\)'" src/components/

# repositories facade 를 쓰는 화면 수 (관측: 9)
grep -rl "services/repositories/" src/components/ | wc -l

# lifecycle 어댑터를 쓰는 화면 수 (관측: 10)
grep -rl "taskLifecycleAppAdapter" src/components/ | wc -l

# lifecycle 구독 존재 여부 (기대: 출력 없음)
grep -rn "subscribe\|addEventListener" src/services/taskLifecycleStore.ts src/services/taskLifecycleAppAdapter.ts

# 다섯 영역 저장키
grep -rn "STORAGE_KEY = '" src/services/taskLifecycleStore.ts src/services/activityLedger.ts src/services/teamMessageCenter.ts src/services/agentTaskStore.ts
grep -n "CS_STATE_STORAGE_KEY =" src/services/csLocalStatePersistence.ts

# Postgres 선례 패키지
node -e "const p=require('./package.json');console.log(p.dependencies.pg, p.devDependencies['@types/pg'])"
```

### 레코드 크기 실측 재현

§4.1 수치는 임시 측정 스크립트로 냈다. **저장소에 남기지 않았다**(제품·검사 코드 무변경 원칙). 재현하려면 `scripts/smoke-b-use-3-hq-directive-flow-v0.mjs:20-70` 의 모듈 로딩 방식을 그대로 쓰고 —

1. `taskLifecycleAppAdapter` · `activityLedger` · `teamMessageCenter` · `taskLifecycleStore` 를 `tsc --ignoreConfig` 로 임시 컴파일해 import
2. `createDirectiveTask` → `assignExecutor` → `submitResult` → `applyDecision` ×2 로 업무 1건을 완주시킨 뒤 `loadLifecycleTasks()` 에서 되읽어 `Buffer.byteLength(JSON.stringify(t),'utf8')`
3. 첨부는 `createTeamMessage` 에 `{size: 900_000, dataUrl: 'data:image/png;base64,'+'A'.repeat(1_200_000)}` 를 넣어 인라인 보관 크기를, `size: 20_000_000` 으로 `omitted` 크기를 잰다
4. base64 유입 차단은 `createDirectiveTask` 의 `inputRefs` 에 `'data:image/png;base64,AAAA'` 와 정상 `messageRef` 를 함께 넣고 되읽어 **1건만 남는지** 확인

관측값: 631 / 1,218 / 412 / 560 / 1,200,646 / 605 B, sanitize 후 `["teammsg:..."]` 1건.

### 핵심 파일:행 색인

| 사실 | 위치 |
|---|---|
| 업무 상한 500·조용한 실패 | `src/services/taskLifecycleStore.ts:16, 52, 54-56` |
| 업무 schemaVersion·구자료 후퇴 | `:14, 41-43` |
| 업무 base64 차단 | `:23-32` |
| 원장 상한 500·조용한 실패 | `src/services/activityLedger.ts:10, 37, 38-40` |
| 원장 집계 dedup 후퇴(`taskId ?? refId`) | `:92-100` |
| 메시지 상한 300 | `src/services/teamMessageCenter.ts:14, 44` |
| **첨부 base64 인라인 상한 1.5MB** | `:15-16, 60-65` |
| 메시지 이벤트 append | `:95-103` |
| CS schemaVersion 불일치 시 버림 | `src/services/csLocalStatePersistence.ts:70` |
| CS 삭제 API | `:116-120` |
| CS 전체 객체 저장 트리거 | `src/components/CsTeamDashboard.tsx:810-817` |
| **CS 고객 PII 필드·전달** | `src/services/csTeamDashboardFacts.ts:496-504` · `src/components/CsTeamDashboard.tsx:902, 913` |
| CS 멱등 키 2종 | `csWorkCompletionState.ts:46` · `csApprovalQueueBridge.ts:32-33` |
| agent 정의 시드 3건 | `src/data/defaultAgentTasks.ts:7` |
| **agent 실행 결과 저장소 부재** | `src/services/agentTaskRunner.ts:62-78` |
| agent 멱등 키 | `:50-51` |
| HQ 확인 요청 멱등 | `src/services/taskLifecycleAppAdapter.ts:906`(정의) · `:926-927`(멱등 판정) |
| 협업 요청 생성(부모+자식) | `src/services/taskLifecycleAppAdapter.ts:988` |
| lifecycle 이력 append-only 3종 | `src/services/taskLifecycleContract.ts:166-167, 183-184, 194-197` |
| 경계 선언 | `src/services/repositories/README.md:3, 6, 13-14` |
| Postgres 선례(lazy Pool·DDL 없음·비밀값 미노출) | `api/_shared/marketingBehaviorPostgresStore.ts:11-18, 37-42, 50-58` |
| 어댑터 선택기(거짓 persistent 금지) | `api/_shared/marketingBehaviorPersistentStore.ts:80-107` |
| 디자인팀 4명 동시작업 | `docs/MASTER_REPORT_2026-07-03_FINAL.md:210` |
| 디자인 작업 큐 = 팀 메시지 | `src/components/DesignTeamDashboard.tsx:19-23` · `DepartmentWorkspacePanel.tsx:621` |
| agent 수동 실행 진입점 | `src/components/AgentTaskPanel.tsx:38` |
| 선례 포트 인터페이스 파일 | `api/_shared/marketingBehaviorStorageTypes.ts` |

**행 번호 주의**: `src/components/DepartmentWorkspacePanel.tsx` 의 행 번호는 어제(`37343e4`) `onCreateTeamTask` 추가로 **+5 밀렸다**. 이 문서는 `c22586b` 기준 실측값이다. 이전 문서에서 `:616`·`:293` 으로 인용된 같은 지점은 현재 `:621`·`:298` 이다.
