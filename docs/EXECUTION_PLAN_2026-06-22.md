# GODO AI OS — 자율 협업 OS 전환 실행 계획서

> **작성일**: 2026-06-22
> **목적**: "회사 시뮬레이터"에서 "24/7 자율 협업 OS"로 전환하기 위한 8단계 실행 가이드
> **상위 문서**: `docs/MASTER_REPORT_2026-06-22.md`
> **원칙**: *더 똑똑한 AI가 아니라 망가지지 않는 AI 회사의 업무 규칙과 메일함을 먼저 만든다*

---

## 0. 전체 흐름 개요

```
Phase 0  Hybrid Agent Contract 정의         (설계 문서, 1~2일)
   ↓
Phase 1  Department Inbox + Retention       (코드 구현, 3~5일)
   ↓
Phase 2  Hybrid Agent Executor v1           (코드 + Gemma, 5~7일)
   ↓
Phase 3  Run History + Observability        (인프라, 2~3일)
   ↓
Phase 4  Safe Auto Run                       (조건부 자동화, 2~3일)
   ↓
Phase 5  Godomall READ Bridge               (API 키 발급 후)
   ↓
Phase 6  Memory / RAG 1차                   (점진 도입)
   ↓
Phase 7  External Tools                     (마케팅 외부 어댑터)
   ↓
Phase 8  Approval-based Write Action        (실제 운영 투입)
```

**원칙**: 각 Phase는 이전 Phase 산출물이 완료되어야 시작. 동시 작업 금지 (Contract 미정의 상태에서 Inbox 코딩 시 마이그레이션 지옥).

---

## Phase 0 — Hybrid Agent Contract 정의

> **성격**: 설계 문서 작업. **코드 수정 없음**.
> **목표**: 10개 에이전트가 *무엇을 계산(코드)하고, 무엇을 해석(LLM)하고, 무엇을 액션(Approval)으로 보낼지* 종이 위에서 먼저 확정.
> **산출물**: `docs/AGENT_CONTRACTS.md`

### Step 0.1 — 에이전트별 4단계 분해표 작성

각 에이전트마다 다음 4단계를 명세:

| 단계 | 설명 | 구현 |
|---|---|---|
| **compute** | 데이터 집계/필터링/정렬 | TypeScript 코드 |
| **interpret** | 패턴 해석, 원인 추론 | LLM (Gemma) |
| **draft** | 자연어 문안 생성 | LLM (Gemma) |
| **action** | 외부 시스템 변경 | Approval Queue → Secure Proxy |

예시 (`product_analyst`):

```yaml
agent: product_analyst
compute:
  inputs: [orders, inventory]
  outputs:
    - addressIssueCount: number
    - topSellingProducts: Array<{name, qty}>
    - salesVelocity: Record<productId, number>
implementation: code  # if/else 유지

interpret:
  inputs: [compute.outputs, last7days_history]
  outputs:
    - rootCauseHypothesis: string
    - anomalyExplanation: string
implementation: gemma
prompt_template: 'product_analyst_interpret.md'

draft:
  inputs: [interpret.outputs]
  outputs:
    - reportText: string  # 부서장 보고용
implementation: gemma
prompt_template: 'product_analyst_draft.md'

action:
  outputs: []  # 분석 에이전트는 외부 액션 없음
riskClass: auto_safe
```

### Step 0.2 — 10 에이전트 전체 contract 표

매니저 1 + 상품 3 + CS 3 + 마케팅 3 = 10개 contract.

특히 명확히 분리해야 할 핵심:

| 에이전트 | compute (코드) | interpret/draft (LLM) | action |
|---|---|---|---|
| `manager_agent` | 부서 결과 집계, riskFlag 카운트 | 우선순위 추론, 종합 브리핑 문안 | 승인 분배 |
| `product_analyst` | SEO 매핑 체크, 판매량 정렬 | 이상 패턴 원인 추론 | - |
| `inventory_monitor` | 안전재고 미달 필터 | 발주 시급도 판단, 발주서 문안 | 발주 제안 (Approval) |
| `inquiry_analyst` | 미답변 문의 카운트, 분류 | 답변 초안 (이미 구현) | CS 답변 등록 (Approval) |
| `review_detector` | 별점 ≤2 필터 | 패키지 결함 추론, 사과문 | 사과 답변 (Approval) |
| `trend_researcher` | 구매 패턴 세그먼테이션 | 트렌드 해석, 세그먼트 의미 | - |
| `campaign_planner` | 세그먼트 매칭 | 캠페인 컨셉, 카피라이팅 | 쿠폰/이벤트 (Approval) |

### Step 0.3 — riskClass 매트릭스 확정

```
auto_safe          → 자동 실행 OK (분석/요약/내부 보고)
draft_only         → 초안만 작성, 실행 금지 (시뮬레이션)
approval_required  → 운영자 승인 후 외부 액션
manual_only        → AI 실행 절대 금지 (가격/환불 등)
```

각 에이전트의 action별 riskClass를 표로 박는다. 회색 영역 제거.

### Step 0.4 — 메시지 스키마 v0 초안

Phase 1 Inbox 설계의 기초. 아직 코드는 아니고 타입만:

```typescript
interface DepartmentMessage {
  id: string;
  fromAgent: string;
  fromDepartment: DepartmentId;
  toDepartment: DepartmentId;
  type: 'handoff' | 'request' | 'fyi';
  priority: 'normal' | 'urgent';
  payload: {
    title: string;
    body: string;
    referencedResultIds: string[];
    relatedSku?: string[];      // 상품 기반 메시지
    relatedInquiryIds?: string[]; // CS 기반
  };
  createdAt: string;
  expiresAt: string;   // retention 정책
  status: 'pending' | 'read' | 'processed' | 'archived' | 'expired';
  processedBy?: string;
  processedAt?: string;
}
```

### Phase 0 Definition of Done

- [ ] `docs/AGENT_CONTRACTS.md` 작성 완료
- [ ] 10 에이전트 모두 4단계(compute/interpret/draft/action) 분해됨
- [ ] riskClass 매트릭스 완성
- [ ] DepartmentMessage 스키마 v0 확정
- [ ] **코드 변경 0건** (이 단계는 순수 설계)

---

## Phase 1 — Department Inbox + Retention

> **목표**: 부서가 서로 남긴 메시지가 *다음 사이클*에서 읽혀 업무가 이어지는 구조
> **산출물**: `src/engine/inbox/` 모듈 + 부서별 inbox UI

### Step 1.1 — 데이터 모델 + Storage Layer

**파일**: `src/engine/inbox/types.ts`, `src/engine/inbox/storage.ts`

- Phase 0의 DepartmentMessage 스키마를 TypeScript로 구현
- 1차 저장소: **localStorage** (간단, 이미 패턴 있음)
  - 키: `godo.inbox.{departmentId}` → DepartmentMessage[]
- 추후 IndexedDB/SQLite 마이그레이션 고려해서 인터페이스 추상화

```typescript
interface InboxStorage {
  push(deptId: DepartmentId, message: DepartmentMessage): Promise<void>;
  list(deptId: DepartmentId, filter?: InboxFilter): Promise<DepartmentMessage[]>;
  markAs(messageId: string, status: MessageStatus): Promise<void>;
  archive(messageId: string): Promise<void>;
  purgeExpired(): Promise<number>; // expired 메시지 정리, 반환=정리된 개수
}
```

### Step 1.2 — Inbox Dispatcher (handoff → inbox)

**파일**: `src/engine/inbox/dispatcher.ts`

- 기존 `handoffEngine.ts`가 만든 `AgentHandoff[]`를 받아 → `DepartmentMessage`로 변환 → 수신 부서 inbox로 push
- 기존 흐름 유지하되 끝에 **저장 단계** 추가

```
[현재] handoff 생성 → 화면 표시 → 끝
[Phase 1] handoff 생성 → 화면 표시 → inbox 저장 → 다음 사이클에서 읽힘
```

### Step 1.3 — Inbox Consumer (다음 사이클에서 읽기)

**파일**: `src/engine/inbox/consumer.ts`

- `nativeAgentRuntime.ts`의 시작 부분에 추가:
  ```
  1. (NEW) 각 부서 inbox에서 unread 메시지 가져옴
  2. jobPlanner가 메시지 + objective 함께 보고 작업 생성
  3. ...기존 흐름
  ```
- 마케팅 팀장이 어제 상품팀에서 받은 "재고부족" 메시지를 오늘 처리하면 → `markAs('processed')`

### Step 1.4 — Retention 정책

**파일**: `src/engine/inbox/retention.ts`

룰:
- `processed` 후 **14일** 경과 → 자동 archive
- `pending` + **7일** 경과 → 매니저 inbox로 escalate + 원본 expire
- 부서별 inbox max size **50건** — 초과 시 가장 오래된 processed 항목부터 archive
- 매 사이클 시작 시 `purgeExpired()` 자동 실행

### Step 1.5 — Inbox UI

**파일**: `src/components/DepartmentInboxPanel.tsx`

- 기존 `DepartmentCommandPanel`(부서 작업실 모달)에 **"받은 메시지함" 탭** 추가
- 카드별 표시: from / 제목 / 본문 / status / 처리 시각
- 운영자가 수동으로 "이 메시지 무시" / "강제 처리 완료" 가능

### Step 1.6 — TeamOperationsBoard에 inbox 카운트

좌측 부서 카드에 **"새 메시지 N건"** 배지 추가.

### Phase 1 Definition of Done

- [ ] handoff가 inbox에 자동 저장됨
- [ ] 다음 사이클에서 inbox 메시지가 jobPlanner 입력에 포함됨
- [ ] retention 4가지 룰 모두 동작 (verified by unit test or manual log)
- [ ] DepartmentCommandPanel에 받은 메시지함 탭 표시
- [ ] 좌측 부서 카드에 새 메시지 카운트 배지
- [ ] **lint·typecheck·build 통과**

---

## Phase 2 — Hybrid Agent Executor v1

> **목표**: 코드(compute) + Gemma(interpret/draft) 역할 분리 구현
> **산출물**: `src/engine/nativeAgentRuntime/agentExecutor.ts` 리팩토링 + 프롬프트 템플릿 7개

### Step 2.1 — 프롬프트 템플릿 파일 분리

**디렉토리**: `src/engine/prompts/`

```
prompts/
├── manager_briefing.md
├── product_analyst_interpret.md
├── inventory_monitor_draft.md
├── inquiry_analyst.md   (기존 csDraftGenerator에서 추출)
├── review_detector_apology.md
├── campaign_planner.md
└── trend_researcher_interpret.md
```

각 템플릿:
- `{{compute_outputs}}` 자리 치환자
- `{{department_context}}`, `{{recent_inbox}}` 자리 치환자
- 출력 포맷 지정 (JSON 또는 마크다운 섹션)

### Step 2.2 — Hybrid Executor 구조

**파일**: `src/engine/nativeAgentRuntime/agentExecutor.ts`

```typescript
async function executeAgentJob(job, snapshot, providers, inboxMessages) {
  // 1. COMPUTE: 코드로 데이터 처리 (현재 if/else 유지)
  const computeOutputs = computeForAgent(job.assignedAgentId, snapshot);

  // 2. INTERPRET + DRAFT: Gemma 호출 (필요한 에이전트만)
  const contract = AGENT_CONTRACTS[job.assignedAgentId];
  let interpretation = null;
  let draftText = null;

  if (contract.useLLM) {
    const prompt = renderTemplate(contract.promptTemplate, {
      compute: computeOutputs,
      inbox: inboxMessages,
      objective: job.objective
    });
    const response = await callGemma(prompt, providers);
    ({ interpretation, draftText } = parseLLMResponse(response, contract.outputFormat));
  }

  // 3. ARTIFACT 생성 + Approval 분기
  // 기존 로직 유지
}
```

### Step 2.3 — Gemma 호출 우선순위

순서대로 연결 (각 에이전트마다 검증 후 다음):

1. **manager_agent** — 종합 브리핑 (가장 임팩트 큼)
2. **campaign_planner** — 캠페인 카피
3. **review_detector** — 사과문 초안
4. **product_analyst** — 이상 패턴 해석
5. **inventory_monitor** — 발주 시급도
6. **trend_researcher** — 트렌드 해석
7. **inquiry_analyst** — 이미 구현됨, 표준 포맷에 맞춰 리팩토링만

### Step 2.4 — Fallback 정책

LM Studio 연결 실패 시:
- 1차: 3회 재시도 (각 1초 간격)
- 2차: 다른 프로바이더로 라우팅 (Cloud — 단 PII 마스킹 확인)
- 3차: 코드 기반 기본 텍스트로 fallback ("자동 분석 보고") + Activity Log에 `fallback_used: true`

### Phase 2 Definition of Done

- [ ] 7개 프롬프트 템플릿 작성
- [ ] 6개 에이전트가 실제 Gemma 호출로 동작 (CS 답변 + 신규 5개)
- [ ] LLM 실패 시 fallback 정상 작동
- [ ] Activity Log에 모델 ID, 호출 latency, fallback 여부 기록
- [ ] **lint·typecheck·build 통과**

---

## Phase 3 — Run History + Observability

> **목표**: 자율 운영 진입 전 "무엇이 잘못됐는지 추적 가능한" 인프라
> **산출물**: Run history 영속화 + 에이전트별 error log + 헬스체크

### Step 3.1 — Run History 영속화

**파일**: `src/engine/observability/runHistory.ts`

- 현재 `lastNativeAgentRun`는 마지막 1건만. → **최근 100건 누적**
- localStorage key: `godo.runHistory` (배열, FIFO 최대 100)
- 각 run에 runId, startedAt, completedAt, status, errorCount, agentLatencies 저장

### Step 3.2 — runId 기반 Dedup

- 같은 runId 두 번 실행 시 두 번째는 skip + 경고 로그
- Phase 4 Auto Run에서 필수 (중복 실행 방지)

### Step 3.3 — 에이전트별 Error Log

**파일**: `src/engine/observability/errorLog.ts`

```typescript
interface AgentErrorEntry {
  runId: string;
  agentId: string;
  jobId: string;
  errorType: 'llm_failure' | 'timeout' | 'data_missing' | 'fallback_used';
  message: string;
  occurredAt: string;
  retryCount: number;
}
```

- key: `godo.errorLog` (최근 200건)
- AgentPanel 또는 EnginePanel에 표시

### Step 3.4 — Activity Log 영속화

현재 Activity Log는 휘발성. → localStorage에 1000건 rolling.

### Step 3.5 — Health Check

**파일**: `src/engine/observability/healthCheck.ts`

매 사이클 시작 전 점검:
- LM Studio 연결 OK?
- `activeOperationsData` 로드됨?
- 모든 부서 enabled 상태?
- 최근 5 run 중 실패율 > 50%면 자동 실행 차단 + 경고

### Phase 3 Definition of Done

- [ ] Run history 최근 100건 영속화
- [ ] runId dedup 동작
- [ ] error log 200건 rolling
- [ ] Activity Log 1000건 영속화
- [ ] Health check가 자동 실행 차단 가능

---

## Phase 4 — Safe Auto Run

> **목표**: 운영자가 켜면 안전한 주기로 자동 실행, 위험 작업은 절대 자동 안 함
> **산출물**: Auto Run 토글 UI + 스케줄러 + 안전 가드

### Step 4.1 — Auto Run 토글 + 설정

**파일**: `src/components/AutoRunPanel.tsx`

- 헤더 또는 EnginePanel에 토글
- 옵션:
  - 실행 주기 (15분 / 30분 / 1시간 / 4시간)
  - 활성 부서 선택
  - 활성 시간대 (예: 평일 09:00-18:00만)
- 기본값: **OFF**, 30분, 모든 부서, 24시간

### Step 4.2 — 스케줄러

**파일**: `src/engine/autoRun/scheduler.ts`

- `setInterval` 기반 단순 구현 (탭이 열려 있을 때만)
- 다음 단계로 Service Worker 또는 백엔드 cron 검토

### Step 4.3 — 안전 가드 (반드시 통과해야 실행)

```typescript
async function canAutoRun(): Promise<boolean> {
  if (!autoRunEnabled) return false;
  if (lastRunWithin(5 * 60 * 1000)) return false; // 5분 내 중복 방지
  if (!await healthCheck()) return false;
  if (currentTime() outsideActiveHours) return false;
  return true;
}
```

### Step 4.4 — 위험 작업 자동 실행 절대 금지

- `riskClass === 'approval_required' || 'manual_only'`인 결과는 **무조건 Approval Queue로만**
- Auto Run cycle에서도 동일
- 코드 레벨에서 강제 (런타임 assertion)

### Step 4.5 — Auto Run 로그

- Activity Log에 "[AutoRun] 사이클 시작/종료" 명시
- 운영자 수동 실행과 구분

### Phase 4 Definition of Done

- [ ] Auto Run 토글 UI 동작
- [ ] 기본 OFF
- [ ] 스케줄러 정확한 주기로 발화
- [ ] 5분 내 중복 실행 자동 차단
- [ ] Health check 실패 시 자동 실행 skip
- [ ] approval_required 작업이 자동 실행되는 일 없음 (assertion)
- [ ] Auto Run cycle도 Run History/Error Log에 기록

---

## Phase 5 — Godomall READ Bridge

> **목표**: 고도몰 Open API 키 발급 후 실제 데이터 흡입
> **산출물**: `api/godomall/` 실제 호출 라우터 + XML 파서 + StandardModel 변환

### Step 5.1 — 환경변수 정리

```
GODOMALL_PARTNER_KEY     (Vercel 환경변수)
GODOMALL_USER_KEY        (Vercel 환경변수)
GODOMALL_BASE_URL        (sandbox or real)
GODOMALL_API_MODE        ('sandbox' | 'real')
```

### Step 5.2 — XML 파서 도입

- `fast-xml-parser` 의존성 추가
- Vercel Serverless 호환성 확인

### Step 5.3 — 어댑터 구현 순서

1. API Key 유효성 체크 엔드포인트
2. **상품조회** PoC (테스트몰 12개 상품)
3. **주문조회**
4. 게시판 리스트 + 게시물 리스트 (상품문의/리뷰)
5. 공통코드 조회

### Step 5.4 — Standard 모델 변환

`StandardProduct`, `StandardOrder`, `StandardInquiry`, `StandardReview` 정의 후 어댑터에서 변환.

### Step 5.5 — PII 마스킹 (서버 사이드)

기존 `piiMaskGuard.ts` 활용 — 모든 응답이 프론트 도달 전 마스킹.

### Phase 5 Definition of Done

- [ ] /api/godomall/products가 실제 12개 상품 반환
- [ ] PII 마스킹된 응답만 프론트에 전달
- [ ] Data Connector에 "API Source" 옵션 추가
- [ ] Mock과 동일한 StandardModel 인터페이스

---

## Phase 6 — Memory / RAG 1차

> **목표**: 승인/거절/성과 이력을 다음 판단에 자동 반영
> **산출물**: 운영 기억 저장소 + 프롬프트 자동 주입

### Step 6.1 — 운영 기억 스키마

```typescript
interface OperationMemory {
  id: string;
  type: 'approval_decision' | 'rejected_draft' | 'campaign_outcome' | 'cs_pattern';
  agentId: string;
  contextSummary: string;
  decision: 'approved' | 'rejected' | 'modified';
  reasonByOperator?: string;
  occurredAt: string;
  outcomeMetrics?: Record<string, number>;
}
```

### Step 6.2 — 저장소

- 1차: localStorage `godo.memory` (최근 500건)
- 2차 (확장): IndexedDB + 임베딩 인덱스 (Phase 6 후반)

### Step 6.3 — 자동 주입

각 에이전트 프롬프트에 "유사 과거 사례" 자동 추가:
- 텍스트 키워드 매칭 (1차)
- 임베딩 코사인 유사도 (2차, nomic-embed)

### Step 6.4 — 운영자 피드백 채널

Approval에서 "거절" 시 거절 사유 입력 → memory 저장 → 다음 초안 생성 시 회피.

### Phase 6 Definition of Done

- [ ] 모든 승인/거절이 memory에 자동 저장
- [ ] 다음 에이전트 실행 시 관련 memory가 프롬프트에 주입됨
- [ ] 거절 사유 1줄 입력 UI

---

## Phase 7 — External Tools

> **목표**: 마케팅팀이 외부 정보로 진짜 트렌드 분석
> **산출물**: 외부 검색 어댑터 + SNS/블로그 초안 (포스팅은 후속)

- Naver Open API / Google Custom Search
- 블로그 RSS 수집기
- Cloud LLM (Gemini Pro / Claude) Secure Proxy 어댑터 (PII 마스킹 후만 전송)

(상세 단계는 Phase 7 진입 시점에 보강)

---

## Phase 8 — Approval-based Write Action

> **목표**: 운영자 승인 → 실제 고도몰 API write 실행
> **산출물**: Approval action dispatcher + Audit log

### 단계 순서 (안전 우선)

1. 게시물 답변 등록 (CS) — 가장 안전
2. 주문 상태 변경 — 중간
3. 재고 수정 — 중간
4. 상품 정보 수정 — 위험
5. 가격 변경 — 최고 위험
6. 쿠폰 발행 — 최고 위험

각 단계마다 별도 검증 + 감사 로그 + rollback 가능성 확인.

---

## 의존성 그래프

```
Phase 0 ──┬──> Phase 1 ──> Phase 2 ──> Phase 3 ──> Phase 4
          │                                          │
          │                                          ↓
          └──────────────────────────────────> Phase 6 (RAG)
                                                     │
                                  ↓                  │
                              Phase 5 (READ Bridge)  │
                                  │                  │
                                  └──> Phase 7 ──────┴──> Phase 8
                                       (External Tools)   (WRITE)
```

핵심 종속:
- **Phase 0 → 1 → 2**: 엄격한 순차 (Contract → Inbox → Executor)
- **Phase 3**: Phase 4 시작 전에 반드시
- **Phase 5**: 외부 의존 (API 키 발급)이라 다른 Phase와 병행 가능
- **Phase 8**: 모든 Phase 완료 후

---

## 검증 명령 (모든 Phase 공통)

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Phase 통과 기준:
- 위 3개 모두 통과
- 해당 Phase의 Definition of Done 모두 체크
- 다음 Phase 시작 전 commit (논리 단위로 history 깔끔하게)

---

## 작업 우선순위 — 지금 당장 할 일

✅ **Phase 0, Step 0.1 ~ 0.4**: `docs/AGENT_CONTRACTS.md` 작성

이게 끝나면 Phase 1 (Inbox 코딩) 시작 가능. 그전에는 코드 한 줄도 안 건드림.

---

*문서 끝.*
