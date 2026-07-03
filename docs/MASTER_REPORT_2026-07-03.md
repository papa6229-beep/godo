# GODO AI OS — 마스터 보고서 (2026-07-03)

> 목적: 오늘 한 작업·과정·현재 상태·다음 방향을 남겨, 내일 이 문서만 읽고 곧바로 이어서 작업.
> 작성: Claude Opus 4.8 (1M) · 확정 지시자: 사장님(papa6229, 웹디자인 팀장)
> main HEAD = `0924da2`. 이전 보고서: `docs/MASTER_REPORT_2026-07-02.md`.

---

## 0. 한 줄 요약

오늘 두 개의 큰 흐름을 완주했다. (A) 어제 만든 Commerce Query 엔진 위에서 **상품 대시보드/부서 채팅 UX를 다듬고**, (B) 사장님과 논의해 **"역할 기반 재편"의 배관(1~4단계)을 전부 구축**했다 — 활동 원장 → Studio 자동업무·승인모드 → 오늘의 운영 재편(총괄 읽기 관제) → 역할 전환기. **AI가 처음으로 스스로 계산·보고하고, 총괄이 그걸 읽기 관제하고, 팀장은 본인 팀만 보는** 구조가 완성됐다. 다음은 **디자인팀 신설**(사장님이 아는 도메인)로 AI 실제 업무를 채우는 것.

---

## 1. 오늘의 큰 그림 — "역할 기반 재편"

사장님과의 논의로 확정된 방향(메모리 `role-based-restructure-plan`):
- **팀장(사람) = 본인 팀 보드(부서 업무 관장)에서만 실행.** 대시보드·자동업무·팀장지시·승인·팀 간 메시지.
- **최고관리자(총괄/HQ) = 오늘의 운영에서 읽기 관제.** 실행 불가. 좌=팀 관제카드, 중앙=HQ 채팅(통계/그래프·팀 지시), 우=팀별 크리티컬.
- **자동업무·승인모드·AI 능력 설정 = AI 직원(Studio)에서.** Studio↔실행 연결.
- **배관 먼저, 실제 AI 구성은 마지막에 사장님과.** 백엔드(로그인/권한/실시간)는 실오픈 직전.

**핵심 원칙:** 각 표면은 활동 원장/메시지센터를 read/write만(중복 상태 금지). 계산은 canonical 엔진 재사용. 사람·AI 에이전트가 같은 서비스 API를 쓴다(actor 모델). 각 작업 끝나면 push.

---

## 2. 오늘 한 작업 (시간순 · main 커밋)

### 2-A. 어제 엔진 위 UX 다듬기
1. **join 차트 데이터라벨** (`67f002f`): "문의 많은 상품×매출" 차트 막대에 1차 지표(문의수) 데이터라벨. 값은 기존 계산 재사용.
2. **상품 대시보드 필터 개편 A안** (`ae7f03f`): 상단 KPI가 카테고리 눌러도 안 바뀌던 문제 → `filteredSnap`(canonical builder를 필터된 주문에 재적용)으로 KPI 필터 반영. 전체 선택 시 전사값=마케팅 parity 유지.
3. **상품 기간 프리셋 CS 통일 + 팀별 채팅 차트 독립** (`00f953b`): 기간을 CS와 동일 프리셋(전체/오늘/최근7·30일/이번달/직접), 카테고리 드롭다운, 상대기간은 데이터 최신일 기준. 그리고 엔진 결과 차트가 단일 state라 팀 전환 시 새던 버그 → 팀별 분리.
4. **부서 업무 관장 3열 폭 재조정** (`0bbf0db`): 좌측 팀선택 210px 고정, 채팅창 확대.
5. **좌측 컬럼 줄맞춤** (`06b7ad1`): 한국어 어절 줄바꿈(word-break: keep-all).

### 2-B. 팀 간 소통 센터 (역할 재편의 첫 재료)
6. **팀 간 소통 센터 v0** (`ad265b0`): `teamMessageCenter`(스토어+순수함수+persist API) + `TeamMessagePanel`(받은/보낸/새). **actor = 사람 or AI 에이전트**(agent 대비 설계), 파일 첨부(base64), 완료 처리. 부서 업무 관장 우측 탭 [AI 팀장 지시 | 팀 간 메시지] + 팀 카드 안읽음 배지. smoke 22/0.

### 2-C. 배관 1~4단계 (역할 기반 재편)
7. **[배관 1] 활동 원장** (`e6c7352`): `activityLedger`(스토어+집계+persist `logActivity`). 자동업무 실행·팀 메시지·승인이 여기 기록. 오늘의 운영이 이걸 읽어 프로젝션. smoke 12/0.
   - 선행 재료 `0a1a159` **agentTaskRunner**: 자동업무를 canonical snapshot으로 계산 → 팀 메시지센터에 AI 명의 보고. (원장 도입 전 버전, 이후 원장 기록 추가)
8. **[배관 2] Studio 자동업무·승인모드** (`c52655d`): `agentTaskStore`(편집 가능) + Studio 새 탭 "🗓️ 자동 업무"(AgentTaskStudio, 팀별 CRUD). **승인모드 3종**(auto/approval/draft)이 실행에 반영: runAgentTask(auto)/stageApprovalTask(pending)/approveAgentTask(done+approval). Studio↔실행 첫 연결. smoke store 8/0·runner 19/0.
9. **[배관 3] 오늘의 운영 재편** (`71e5af3`→여러 커밋으로 최종형): 
   - 우측 = `ExecutiveBriefing` = **팀별 "승인·확인 필요" 크리티컬만**(`ed884b0`, 진행중은 처리중이라 제외).
   - 좌측 = `TeamOperationsBoard` **활동 원장 연동**(`c712ee3`): 카드 4칩=teamSummary, "부서 보기"→"부서 업무 확인"→`DeptActivityModal`(원장). manager→hq 매핑.
   - 중앙 = HQ 콘솔 채팅 유지 + Quick Task Add→**팀 지시+파일 바**(`cf4ba4f`, HqDirectiveComposer, HQ→팀 postTeamMessage) + **통계/그래프**(`a73ca3c`, ChatConsole가 answerCommerceQuestion 우선→MarketingChartSpecPanel, OfficeView fetchRevenue→commerceData) + 렌더 정합 수정(`7dc8154`).
   - (중간에 좌측을 HQ 지시함으로 바꿨다가 사장님 눈검수로 원복 `ef5e6d8` — 좌=부서 관제 보드 유지가 낫다는 판단.)
10. **오늘의 운영 디자인/상태 정리** (`2709873`): ① 헤더 START OPERATION 제거 ② 보드 '운영 대기중' 칩·타일 제거 ③ **카드 상태 기준 수정**(원장 상태를 refId로 dedup → 진행=in_progress·완료=done·전달=messages·승인=pending; 지시를 진행중 처리 시 '진행'에 집계+badge '진행 중', 이전엔 '승인'으로 오집계) ④ '요청'→'메시지'. + 우측 크리티컬에서 진행중 제외(중복 제거).
11. **[배관 4] 역할 전환기** (`0924da2`): `sessionRole`(ViewerRole hq/product/cs/marketing). MainLayout 헤더 드롭다운 + 탭 게이팅(팀장=부서 업무 관장만, 강제 이동), DepartmentWorkspacePanel 팀장=본인 팀만 표시·자동 선택. localStorage 데모 전환.

---

## 3. 현재 시스템 상태 (오늘 종료 시점)

### 데이터/서비스(사람·AI 공용, localStorage, 백엔드 스왑 가능)
- `services/teamMessageCenter.ts` — 팀 간 메시지(actor human/agent, 파일, 상태). `postTeamMessage`/`resolveTeamMessage`/`markInboxRead`.
- `services/activityLedger.ts` — 업무 활동 원장. `logActivity` + `teamSummary`(refId dedup: inProgress/done/pending/messagesSent/approvals)/`allTeamsSummary`/`activityForTeam`.
- `services/agentTaskStore.ts` + `data/defaultAgentTasks.ts` — 자동업무 스펙(편집 가능, 승인모드).
- `services/agentTaskRunner.ts` — canonical 계산(buildDepartmentSourceOfTruthSnapshot) → 보고. compute/post 분리, 승인모드 경로.
- `services/sessionRole.ts` — 세션 역할.
- 타입: `types/teamMessage.ts`(DeptTeamId·DEPT_TEAM_META·kind/status), `types/activityLedger.ts`, `types/agentTask.ts`.

### 화면
- **부서 업무 관장**(DepartmentWorkspacePanel): 좌 팀선택 · 중앙 팀 대시보드(상품/CS/마케팅=커머스 데이터) · 우 탭[AI 팀장 지시 | 팀 간 메시지 | 🤖 자동 업무]. 역할이 팀장이면 본인 팀만.
- **오늘의 운영**(OfficeView, 총괄 전용): 좌 부서 관제 보드(원장 연동·부서 업무 확인 모달) · 중앙 HQ 채팅(통계/그래프·팀 지시+파일) · 우 승인·확인 필요(크리티컬).
- **AI 직원 → 자동 업무**(AgentTaskStudio): 팀별 자동업무·승인모드 편집.
- 헤더: 역할 전환기(👤). 총괄=전체 탭, 팀장=부서 업무 관장만.

### 흐름(완성된 루프)
```
Studio에서 자동업무·승인모드 정의 → 팀 보드에서 실행/승인 → 활동 원장 기록
 → 오늘의 운영에서 총괄이 읽기 관제(좌 카드·우 크리티컬·중앙 HQ채팅) → HQ가 팀에 지시(메시지+파일)
팀↔팀·HQ↔팀 = 팀 간 메시지(파일). 역할로 가시성 스코프.
```

### 레거시(참조 0, 무해 · 정리 대상)
- `engine/nativeAgentRuntime/*`(START OPERATION 구동엔진, 이제 미사용), `engine/taskExecutor/taskPlanner/taskRouter`(死코드), `TaskBoard.tsx`, `DepartmentCommandPanel.tsx`, `MetricDrilldownModal`(오늘의 운영서 제거). 상세: 메모리 `agent-runtime-state`.

---

## 4. 검증

- 전 커밋 `tsc -b`/`lint`/`vite build` 그린. 각 작업 Playwright E2E 눈검수(사장님 배포 눈검수도 각 단계 통과).
- smoke: team-message-center 22/0, activity-ledger 12/0, agent-task-store 8/0, agent-task-runner 19/0, commerce-query-plan 30/0, parity/source-of-truth 등 그린.
- **한계:** 로컬 dev엔 `/api/godomall/*` 커머스 데이터 없음 → 중앙 채팅 통계/그래프·상품 대시보드 실수치는 **배포에서만** 눈검수(부서 채팅과 동일 엔진이라 배포서 동작 확인됨).

---

## 5. 다음 방향 (사장님과 확정 중)

**결정된 방향:** AI 에이전트의 "실제 업무"를 채우되, **추측 금지** — 각 팀장의 실제 업무를 알아야 함. 사장님(웹디자인 팀장)이 **유일하게 아는 도메인 = 디자인**. 그래서:

1. **[다음 작업] 디자인팀 신설** — 현재 없는 디자인팀 + 디자인 AI 배치, 사장님의 실제 디자인 업무를 여기서 하게. 이게 "팀+AI가 실제로 일하는" **레퍼런스**가 되어 다른 팀 설계의 견본이 됨.
   - 배관은 새 팀을 자동 수용(DeptTeamId에 'design' 추가 → 메시지·원장·오버사이트·역할 자동 연동).
   - **새로 만들 것:** ① 디자인팀 전용 워크스페이스(커머스 데이터 아님 — 디자인 요청·작업현황·에셋 등) ② 디자인 AI 실제 업무 정의(자동/승인).
   - **사장님이 디자인팀 요구사항 정리해 전달 예정** → 받으면 시스템 구현 가능성 체크 후 첫 슬라이스 설계.
2. **AI 직원 구성 본격 튜닝**(함께) — 디자인팀으로 패턴이 생기면 확장.
3. **백엔드(로그인/권한/실시간·데이터 격리)** — 실오픈(2026-12) 직전. 지금은 이르다(테스트몰·AI 가치 먼저 증명).

---

## 6. 위치 정보

- 브랜치/커밋: `main` HEAD = `0924da2`.
- 오늘 생성 문서(docs/): COMMERCE_JOIN_CHART_SECONDARY_DATALABEL_V0 · PRODUCT_DASHBOARD_FILTER_PRIMARY_PERIOD_KPI_SCOPE_V0 · PRODUCT_PERIOD_PRESET_PARITY_AND_CHAT_CHART_TEAM_ISOLATION_V0 · DEPT_WORKSPACE_COLUMN_WIDTH_REBALANCE_V0 · TEAM_MESSAGE_CENTER_V0 · ACTIVITY_LEDGER_V0 · STUDIO_AGENT_TASKS_APPROVAL_MODE_V0 · OFFICE_EXECUTIVE_BRIEFING_V0 · OFFICE_3ZONE_REWORK_V0 · SESSION_ROLE_SWITCHER_V0. (중간 원복된 OFFICE_HQ_DIRECTIVE_CHANNEL_V0는 삭제됨)
- 관련 메모리: `role-based-restructure-plan`, `team-message-center`, `agent-runtime-state`, `marketing-analytics-query-engine`, `push-after-each-task`, `no-mid-task-approval`.
- 데이터 출처: 부서 대시보드/채팅은 `fetchRevenue`(commerce_universe_v1) · 로컬 dev 실데이터 없음(배포서 확인).
