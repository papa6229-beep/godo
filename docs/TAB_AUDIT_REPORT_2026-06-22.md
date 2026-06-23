# GODO AI OS — 9개 탭 실측 감사 보고서

> **작성일**: 2026-06-22
> **방식**: 추론 배제, 실제 소스 코드(50+ 파일) 전수 확인
> **목적**: 각 탭의 정확한 구조·기능·의존성·한계를 단일 문서로 통합
> **상위 문서**: `docs/MASTER_REPORT_2026-06-22.md`, `docs/EXECUTION_PLAN_2026-06-22.md`

---

## 목차

1. [🏢 오늘의 운영 (office)](#1-오늘의-운영-office)
2. [🤖 AI 직원 (agents)](#2-ai-직원-agents)
3. [📡 데이터 가져오기 (data)](#3-데이터-가져오기-data)
4. [📅 운영일지 (calendar)](#4-운영일지-calendar)
5. [📝 작업기록 (logs)](#5-작업기록-logs)
6. [🧠 업무 매뉴얼 (brain)](#6-업무-매뉴얼-brain)
7. [⚙️ AI 설정실 (studio)](#7-ai-설정실-studio)
8. [🚀 AI 두뇌 설정 (engine)](#8-ai-두뇌-설정-engine)
9. [🔌 쇼핑몰 연동 (api)](#9-쇼핑몰-연동-api)
10. [🔗 시스템 통합 발견 사항](#10-시스템-통합-발견-사항)
11. [📊 핵심 메트릭 한눈에](#11-핵심-메트릭-한눈에)
12. [📝 감사자 소감](#12-감사자-소감)

---

## 1. 🏢 오늘의 운영 (office)

### 라우팅
- `activeTab === 'office'` → MainLayout이 OfficeView 렌더링
- MainLayout.tsx:280 — `office-tab-layout` 클래스 적용 → 좌측 채팅 사이드바 숨김 + OfficeView 전체 폭

### 구조 — OfficeView.tsx (3열 그리드)
```
grid-template-columns: minmax(300px, 0.9fr) minmax(560px, 1.6fr) minmax(320px, 1fr)
```

**좌: TeamOperationsBoard (382 lines)** — AI 부서 관제 보드
- 부서 카드 4장 + KPI 칩 4종(진행/완료/전달/승인)
- 최근 부서 협업(handoff) 3건
- 종합 브리핑 요약
- 검증 시나리오 4종 접힘 패널 (개발자 도구)

**중: ChatConsole (645 lines)** — Operational Control Chat
- Three.js 3D Brain 캔버스 (55 brain + 8 stem particle, golden angle 분포)
- 메시지 처리 → `processControlChat` (controlChatService, 745 lines)
- Intent 분류 7종: start_operation/approval_command/settings_change/sensitive_action/confirmed_action/agent_delegation/operation_question
- actionTriggered 5종 처리: start_operation/approve_all/approve_item/reject_all/reject_item/update_agent_name
- Quick Task Add Bar

**우: TaskBoard** — Today's Tasks + Approval Queue
- Today's Tasks 상태 칩 4개 (대기/진행/검토/완료) → TaskListModal
- Approval Queue 상태 칩 4개 (대기/승인/거절/전체) → ApprovalListModal
- 카드 클릭 → TaskResultModal / ApprovalDetailModal

### START OPERATION 흐름 (App.tsx:426~624)
```
1. getScenarioData(validationScenario) — 시나리오별 snapshot/agents 변형
2. runNativeAgentOperation('오늘 운영 점검', snapshot, providers, agents)
3. runtimeResult.activityLogs를 600ms 간격 sleep + addLog
4. 픽셀 오피스 9인 캐릭터 ↔ Native 10 agent ID 수동 매핑
5. RAG 7개 파일 하드코딩 참조 (cs_policy.md 등)
6. orchestration.proposedTasks → setTasks
7. orchestration.proposedApprovalItems → setApprovalQueue
8. composeOperationReport → finalReport → setReport
9. setLastNativeAgentRun
10. OperationHistoryItem → setOperationHistory (캘린더 연동)
```

### 검증 시나리오 4종 (validationScenarios.ts)
- `normal` — 재고 안전+10, 미답변 0, 평점 5
- `low_stock` — 시그니처/마사지 오일만 stock=1, riskFlags 2개
- `cs_negative` — `rev-trouble-100` 1점 마사지 오일 트러블 1건 추가
- `disabled_marketing` — marketing 3 에이전트 모두 enabled=false

### 모달 z-index 스택
```
1000 DepartmentCommandPanel (부서 작업실)
1100 OperationBriefingModal (종합 브리핑)
1150 TaskListModal / ApprovalListModal
1200 MetricDrilldownModal (KPI 클릭)
1300 HandoffDetailModal (협업 카드)
```

### localStorage
```
godo.nativeAgentRuntime.lastRun
godo.nativeAgentRuntime.activeScenario
godo.nativeAgentRuntime.uploadedFiles
godo.nativeAgentRuntime.manualCommands
godo.calendar.operationHistory
godo.ui.theme
```

### 외부 의존성
- LM Studio `http://localhost:1234/v1` (Control Chat, CS 답변)
- window.THREE (Three.js CDN, 3D 캔버스)

### 한계
- 6개 작업 하드코딩 (`jobPlanner.defaultTaskSpecs`)
- 9 에이전트 중 1개만(inquiry_analyst) 실제 LLM 호출
- handoff가 한 사이클 안에서 끝남 (다음 날로 안 이어짐)
- 자율 트리거 없음 (START 누르지 않으면 아무 동작 없음)

---

## 2. 🤖 AI 직원 (agents)

### 라우팅
- `activeTab === 'agents'` → AgentPanel 렌더링
- props로 `lastNativeAgentRun` 받지만 **destructure 안 함** (사용 X)

### AgentPanel.tsx (158 lines)
- 표시는 전적으로 `agents`(App state, 초기값 `initialAgents`)
- DEPARTMENTS 하드코딩 4부서: manager / product / cs / marketing
- 부서별 lead + memberIds 정적 매핑

### 부서별 구성 (실측)
| 부서 | 팀장 | 팀원 | 총원 |
|---|---|---|---|
| 👑 본부 (HQ) | manager | (없음) | 1 |
| 📦 상품/재고 | product | order, stock | 3 |
| 💬 CS/평판 | cs | delivery, review | 3 |
| 📈 마케팅/전략 | marketing | finance | 2 |
| **합계** | | | **9명** |

### 9명 에이전트 (agents.ts, 229 lines)
| id | 이름 | 코드 | 이모지 | 스프라이트 |
|---|---|---|---|---|
| manager | 총괄 매니저 AI | HQ-01 | 👑 | ceo.png |
| cs | CS 상담 AI | CS-02 | 💬 | secretary.png |
| order | 주문 확인 AI | ORD-03 | 📦 | business.png |
| delivery | 배송 추적 AI | DLV-04 | 🚚 | developer.png |
| review | 리뷰 답글 AI | REV-05 | ✍️ | writer.png |
| marketing | 마케팅 기획 AI | MKT-06 | 📈 | instagram.png |
| product | 상품 관리 AI | PDT-07 | 🏷️ | designer.png |
| stock | 재고 감시 AI | STK-08 | 🔍 | researcher.png |
| finance | 매출 분석 AI | FIN-09 | 📊 | youtube.png |

### Agent 타입 필드
`id, name, emoji, role, status, tags[], capabilities[], currentTask, systemPrompt, spriteUrl, initialX, initialY, bubbleText, knowledge[], skills[], tools[], permissions[], memory[]`

### AgentDetailModal (295 lines)
- 좌측: 프로필 카드 + Studio 편집 버튼 + 태그
- 우측 8개 섹션:
  1. 핵심 성능 지표 (agentStatsMap 하드코딩 — 보유 AI/데이터셋/시너지/레벨)
  2. 영문 코드명 (agentEnglishRoleMap)
  3. 보유 기능 (capabilities)
  4. 최근 참조 지식 (knowledge.slice(0,2))
  5. 에이전트 시스템 아키텍처 (KNOWLEDGE/SKILLS/TOOLS/PERMISSIONS 4카드 + MEMORY)
  6. 현재 수행 작업
  7. 시스템 프롬프트 (토글)
  8. 개별 지시 내리기 (텍스트 입력)

### 레거시 ↔ Native Agent 매핑 (App.tsx:476~516)
| 레거시 (agents.ts) | Native (defaultNativeAgentRuntime.ts) |
|---|---|
| manager | manager_agent |
| product | product_lead |
| order | product_analyst |
| stock | inventory_monitor |
| cs | cs_lead |
| delivery | inquiry_analyst |
| review | review_detector |
| marketing | marketing_lead |
| finance | trend_researcher (중복) |
| trend_researcher | trend_researcher |
| (없음) | campaign_planner ⚠️ |

→ **campaign_planner는 레거시 매핑 없음**, `finance`와 `trend_researcher`가 같은 native 에이전트로 중복 매핑.

### 한계
- 카드 상태는 START OPERATION 후에만 변화
- 성능 지표(보유 AI/데이터셋/시너지/레벨)는 시각용 더미 데이터
- `lastNativeAgentRun` props를 받지만 사용 안 함 → Native Runtime 결과가 이 탭에서 안 보임

---

## 3. 📡 데이터 가져오기 (data)

### DataPanel.tsx (1,130 lines, 7개 sub-tab)

### 헤더 메트릭 8개
데이터 소스 / 주문 / CS 문의 / 리뷰 / 재고 / 매출 기간 / 데이터 품질 점수(GOOD≥90/WARNING≥70/NEEDS_REVIEW<70) / 개인정보 마스킹

### 7개 Sub-Tab
| 탭 | 내용 |
|---|---|
| 📊 Overview | 전역 소스 현황, AI Workflow 연동, 시나리오 5종, Daily Summary |
| 📥 Upload Center | 도메인 선택 + 드래그앤드롭 + 파일선택 |
| 🔍 Data Preview | 5도메인 테이블 (slice 100건) |
| 🧭 Mapping Rules | 한국어 컬럼 ↔ Standard Key 매핑표 |
| 🛡️ Quality Check | DataQualityReport 9필드 |
| 🔒 Privacy Masking | 원본↔마스킹 비교 |
| 📜 Import History | ImportHistoryItem 누적 |

### Standard 타입 (types/dataConnector.ts)
- StandardOrder, StandardInquiry, StandardReview, StandardInventoryItem, StandardSalesSummary
- DataSourceType 6종: demo / csv / json / manual / api_mock / api_proxy_mock
- OperationsDataSnapshot — 5개 표준 + qualityReport

### 5개 시나리오 (Overview 탭, 별도 시스템)
- `default` / `cs` / `review` / `order` / `stock`
- **validationScenarios.ts(office 탭의 4종)와 무관**한 별개의 시나리오

### Mapping Rules (도메인별 한국어 자동 매핑)
| 도메인 | 매핑 필드 | required |
|---|---|---|
| orders | 10 | 5 (orderNo/orderDate/customerName/productName/quantity/amount) |
| inquiries | 6 | 4 (inquiryDate/customerName/title/content) |
| reviews | 4 | 3 (reviewDate/productName/rating) |
| inventory | 4 | 2 (productName/stock) |
| sales | 5 | 2 (date/totalSales) |

### 의존 유틸
- `dataNormalizer.ts` (523 lines) — `normalizeRawObject` + `buildOperationsSnapshot`
- `privacyMask.ts` (101 lines) — 정규식 PII 마스킹 (이름/전화/이메일/주소)
- `csvParser.ts` — `parseCSVToObjectArray`

### localStorage
```
godo.data.activeSnapshot
godo.data.importHistory
godo.data.lastSavedAt
```

### 한계
- 행 미리보기 max 100건
- 대용량 파일 (>10MB) 경고만, 차단 안 함
- Excel 미지원 (UI 뱃지 "EXCEL 지원예정")
- sentiment 분류는 정규화기 키워드 매칭 추정 (LLM 호출 아님)

---

## 4. 📅 운영일지 (calendar)

### CalendarPanel.tsx (578 lines)

### 데이터 흐름
```
activeOperationsData → buildDailyOperationSummaries → Map<date, DailyOperationSummary>
```
**자체 데이터 저장 없음**. 매번 Data Connector 기반 재계산.

### 구조
- 상단 메트릭 7개 (조회 년월/데이터 일수/월간 주문/매출/문의/부정 리뷰/재고 위험)
- 좌측: 42칸 캘린더 그리드 (월요일 시작)
- 우측: 선택 날짜 일일 브리프

### 위험도 판정 (calendarCells)
```
critical: negativeReviewCount≥3 OR unansweredInquiryCount≥5
        OR inventoryRiskCount≥5 OR invoiceMissingCount≥5
warning : 위 항목 ≥1 OR deliveryDelayedCount≥1
normal  : 그 외
```

### 셀별 배지 4종
- `ORD N` / `₩ {round(totalSales/1000)}k` / `CS N` / `STK N`

### 타임라인 이벤트 (5개 고정 시간 슬롯)
| 시각 | 에이전트 | 트리거 조건 |
|---|---|---|
| 09:00 | 주문 확인 AI | orderCount > 0 |
| 10:30 | CS 상담 AI | inquiryCount > 0 |
| 13:20 | 리뷰 답글 AI | reviewCount > 0 |
| 15:00 | 재고 감시 AI | inventoryRiskCount > 0 OR snapshot일 |
| 17:00 | 매출 분석 AI | totalSales > 0 |

→ 실제 에이전트 실행 시간과 무관. 시각적 시뮬레이션.

### dailySummaryBuilder.ts (172 lines)
- allDates = orders/inquiries/reviews/sales 날짜 + snapshotDate
- 재고는 날짜 없음 → snapshotDate에만 카운트
- 6가지 issueHighlights 한국어 자동 문장 생성
- 5가지 aiActivityHighlights 자동 생성

### localStorage
```
godo.calendar.lastSelectedDate   # YYYY-MM-DD
godo.calendar.lastViewedMonth    # YYYY-MM
godo.calendar.operationHistory   # OperationHistoryItem[]
```

### 한계
- 재고 위험은 snapshotDate에만 카운트 (다른 날 0)
- 타임라인은 5개 고정 슬롯 한국어 하드코딩
- `monthlyStats.inventoryRiskCount`는 사실상 1일치 값
- `OperationHistoryItem`은 localStorage엔 쌓이지만 캘린더에 표시 안 됨

---

## 5. 📝 작업기록 (logs)

### ActivityLog.tsx (121 lines, 가장 단순)

### LogEntry 타입
```typescript
{ id, timestamp, text, type: 'info'|'success'|'warning'|'error'|'agent', agentName? }
```

### 핵심: formatLogTextForOperator 변환 규칙
4단계 + prefix 정제:
1. **결재/승인 키워드** — cs_reply_draft 승인/거절, "{title}" 작업 결재 등
2. **작업 배정** — `"{task} -> {agent}"` (agentName='Router')
3. **RAG 지식 참조** — `RAG 시스템이 지식 저장소에서 "{doc}"`
4. **CS 연산 흐름** — 미답변 분석 시작, CS 답변 초안 생성 완료, LLM 실패 fallback
5. **prefix 치환**:
   ```
   [Engine]   → AI 분석:
   [Safety]   → 보안 가드:
   [LLM]      → AI 추론:
   [Data]     → 데이터 로드:
   [Fallback] → 대체 조치:
   [Approval] → 결재:
   ```

### App.tsx의 addLog 호출 위치 (실측)
- handleStartSimulation (시나리오/Runtime/RAG/매니저 브리핑 등 10+개)
- handleAddTask, handleDirectInstruct
- handleApprove (CS 별도 / 일반 분기)
- handleReject
- handleManualCommand, handleAddFile

### type별 색상
- info → text-secondary
- success → accent
- warning → var(--warning)
- error → var(--danger)
- agent → text-primary

### 한계
- **휘발성**: 새로고침하면 모든 로그 사라짐 (localStorage 동기화 없음)
- rolling cap 없음 — 무한 누적 가능
- timestamp는 시:분:초만, 날짜 정보 없음

---

## 6. 🧠 업무 매뉴얼 (brain)

### BrainPanel.tsx (419 lines)

### 정체성
RAG 유사 구조이지만 실제 **임베딩 검색 아님** — 클라이언트 텍스트 매칭 + Mock Update.

### 화면 구조
- 헤더 메트릭 4개 (지식 문서 / 연결 에이전트 / 누적 참조 횟수 / 중요 문서)
- Control Bar: 검색 + 중요도/에이전트 필터
- 좌측: 카테고리 8 탭 + 지식 카드 리스트
- 우측: 선택 문서 상세 + 4 액션 버튼

### 카테고리 8종
all / policy / raw / report / decision / template / product / marketing / cs

### 실측 데이터: 13개 지식 문서
| # | 파일명 | 카테고리 |
|---|---|---|
| 1 | cs_policy.md | policy (critical) |
| 2 | delivery_policy.md | policy (high) |
| 3 | refund_exchange_policy.md | policy (high) |
| 4 | product_expression_rules.md | policy (critical) |
| 5 | inventory_snapshot.json | raw (medium) |
| 6 | order_check_template.md | template |
| 7 | cs_auto_template.md | template |
| 8 | daily_operation_report.md | report |
| 9 | campaign_result_report.md | report |
| 10 | cs_decision_log.md | decision |
| 11 | marketing_decision_log.md | decision |
| 12 | review_reply_template.md | template |
| 13 | sales_report_template.md | report |

→ **PROJECT_STATE의 14번째 `risk_handling_guide.md`는 코드에 없음** (문서-코드 불일치).

### BrainKnowledgeItem 타입
```typescript
{ id, filename, title, category, summary, linkedAgentIds[], tags[],
  sourceType, importance, confidence, usageCount, lastUsedAt?,
  updatedAt, contentPreview, actionExamples?[] }
```

### START OPERATION 시 자동 참조 (하드코딩 7개)
```
order_check_template.md, cs_policy.md, cs_auto_template.md,
inventory_snapshot.json, campaign_result_report.md,
marketing_decision_log.md, review_reply_template.md
```
→ usageCount + 1, lastUsedAt = now() 갱신 + Activity Log push.

### 한계
- 임베딩 검색 아닌 substring 매칭
- agentExecutor가 contentPreview를 실제 프롬프트에 주입 안 함
- confidence 값(98%, 95%)은 하드코딩 정적 값
- "참조 로그 검사" 버튼은 항상 `RAG 스코어 0.94 통과` 시뮬레이션

---

## 7. ⚙️ AI 설정실 (studio)

### StudioPanel.tsx (1,263 lines, 6 sub-tab)

### 정체성
**모든 사용자 정의 데이터의 단일 편집기**. 코드 수정 없이 모든 설정 변경 + JSON 백업/복원.

### 6 Sub-Tab
| Tab | 데이터 | 항목 수 |
|---|---|---|
| 🧠 Brain Editor | brainKnowledge | 13 |
| 🤖 Agent Editor | agents | 9 |
| 🛠️ Skill Registry | skills | **12** |
| 🔧 Tool Registry | tools | **10** |
| 🔑 Permission Matrix | permissionMatrix | **19** |
| 💾 Import/Export | (전체 백업) | — |

### 공통 패턴
모든 sub-tab(import_export 제외): 좌측 list-sidebar + 우측 form-pane

### 포커스 연동
- `selectedBrainId` 변경 → setActiveBrainId + setBrainForm + onSelectBrainId(null)
- `selectedAgentId` 변경 → setActiveAgentId + setAgentForm + setMemoryText + onSelectAgentId(null)
- 다른 탭에서 진입 시 자동 포커스 + 한 번 동기화 후 reset

### SkillItem 12개 (defaultStudioData.ts)
CS 3개 / Marketing 2개 / Product 3개 / Stock 1개 / Finance 1개 ... 등

### ToolItem 구조
```typescript
{ id, name, description, category, permission, riskLevel,
  availableAgentIds[], isEnabled }
```

### PermissionMatrixItem 구조 (19개)
```typescript
{ id, taskName, description, currentPermission, riskLevel, relatedAgentIds[] }
```
권한 4종: `auto` / `draft_only` / `approval_required` / `manual_only`

### Import/Export
- Export: agents + brain + skills + tools + permissionMatrix + engine* → JSON 다운로드
- Import: JSON.parse → 일괄 onUpdate*
- Reset (Danger Zone): 2단계 확인 → onResetAllData() → 모든 localStorage 키 삭제

### localStorage
```
godo.brainKnowledge, godo.agents, godo.skills, godo.tools, godo.permissionMatrix
godo.engine.*, godo.studio.lastSavedAt
```

### 한계
- **편집한 systemPrompt가 Native Runtime에서 사용 안 됨** (agentExecutor가 if/else)
- **PermissionMatrix 19개도 런타임이 참조 안 함**
- **편집한 skill의 recommendedAgents가 jobPlanner에 안 쓰임**
- → Studio는 "데이터 저장"까지만 동작, Runtime 영향 약함
- Import 시 별도 유효성 검증 없음

---

## 8. 🚀 AI 두뇌 설정 (engine)

### EnginePanel.tsx (1,215 lines, 7 sub-tab)

### 정체성
LLM 라우팅·연결·안전 규칙 관제실.

### Engine Mode 5종
- `demo` / `local_first` / `cloud_first` / `hybrid_auto` (기본) / `manual_control`

### 7 Sub-Tab
| Tab | 데이터 |
|---|---|
| 📊 Overview | overviewStats (라우팅 통계) |
| ⚙️ Mode | 5종 모드 선택 |
| 💻 Local | localEngines 4종 |
| ☁️ Cloud | cloudEngines 4종 (Mock) |
| 🧭 Rules | engineRoutingRules **12** |
| 📜 Logs | EngineUsageLog |
| 🛡️ Safety | engineSafetyRules **6** + permissionMatrix 19 |

### Providers (실측 8개: 4 local + 4 cloud)

**Local 4**:
| id | provider | model | status |
|---|---|---|---|
| godo_slm_8b | ollama | godo-slm:8b-instruct-q4_K_M | mock (default) |
| lms_gemma_4 | lm_studio | google/gemma-4-e4b | disconnected (실연결 가능) |
| local_vision_ocr | lm_studio | llama-3.2-vision-instruct | mock |
| (4번째) | (확인필요) | | |

**Cloud 4** (모두 mock):
- gemini_flash (default), gemini_pro, + 2개

### LM Studio 실연결 (handleLocalTest, line 122~229)
**`lms_gemma_4` Provider만 실제 호출**. 그 외는 mock.

```
GET /lmstudio/v1/models (Vite proxy)
→ gemma-4 모델 매칭 → status='connected'/'no_model'/'error'
→ lastLatency 갱신
→ EngineUsageLog push
```

### lmsConnector.ts (134 lines)
- `getModels(endpoint)` — GET /v1/models
- `getChatCompletion(messages, modelId, endpoint)` — POST /v1/chat/completions
- AbortController + 30초 timeout
- 에러는 throw 안 함, `{ success: false, error }` 반환

### 시스템 전체 LM Studio 호출 위치 (3곳만)
1. EnginePanel.handleLocalTest — 연결 테스트
2. csDraftGenerator — CS 답변 초안
3. controlChatService — 운영 콘솔 의도 분류

### localStorage
```
godo.engine.mode, godo.engine.providers
godo.engine.routingRules, godo.engine.safetyRules
godo.engine.lastSavedAt
```

### 마이그레이션 훅 (App.tsx:305~354)
- `lms_gemma_4` Provider 누락 시 자동 추가
- `rule_4` (CS 피드백) 정합성 자동 보정

### 한계
- **Cloud LLM 실 호출 코드 0건** — 모두 mock
- **engineRoutingRules가 런타임에 영향 없음** — agentExecutor가 참조 안 함
- **engineSafetyRules도 마찬가지** — 매트릭스만 있고 적용 로직 미연결
- **onUpdateEngineUsageLogs는 No-op** (`TS6133 방지용`) — 라우팅 시 자동 누적 미구현
- EngineUsageLog는 connection_test 1곳에서만 push

---

## 9. 🔌 쇼핑몰 연동 (api)

### ApiBridgePanel.tsx (900 lines, 6 sub-tab)

### 정체성
고도몰 Open API 연동 게이트웨이 + 보안 통제. 현재는 **Mock + Secure Proxy Health Check**.

### 6 Sub-Tab
| Tab | 내용 |
|---|---|
| 📊 Overview | 연결 상태, 동기화 통계 |
| 🔌 Connector | Provider 목록 + Test Connection |
| 🔄 Sync | 5 리소스 동기화 + Sync Source 라디오 |
| 🛡️ Permissions | 리소스별 권한 |
| 📜 History | ApiSyncJob 누적 |
| ⚠️ Safety | ApiBridgeLog |

### 두 가지 동기화 경로
**A. secure_proxy (기본)**:
```
ApiBridgePanel → syncProxyResource → /api/godomall/{resource}
→ Vercel Serverless Function → mockProxyData + piiMaskGuard
→ 브라우저 (api_proxy_mock)
→ fallback 시 Local Mock 자동 전환
```

**B. local_mock**:
```
ApiBridgePanel → runMockSync → mockGodomallApi.ts (브라우저 내부)
→ api_mock
```

### Secure Proxy 7개 API 라우트 (api/godomall/)
- `health.ts` — 환경변수 존재 여부 boolean + productionLocked
- `sync.ts` — 통합 동기화
- `orders.ts` / `inquiries.ts` / `reviews.ts` / `inventory.ts` / `sales.ts`

### Shared 4개 모듈 (api/_shared/)
- `secretGuard.ts` — 환경변수 검증, 키 값 절대 반환 안 함
- `piiMaskGuard.ts` — 서버 사이드 PII 마스킹
- `proxyResponse.ts` — 응답 규격, error stack 노출 방지
- `mockProxyData.ts` — 샌드박스 가상 데이터

### ESM import 규칙
```typescript
import { sendJson } from '../_shared/proxyResponse.js';  // .js 필수
```

### handleSyncResource 흐름
1. syncProxyResource OR runMockSync
2. buildOperationsSnapshot (PII 마스킹 포함)
3. setActiveOperationsData → 다른 탭 갱신
4. ImportHistoryItem 자동 push
5. ApiSyncJob 저장
6. providers[godomall].lastSyncAt 갱신

### 환경변수 (서버만)
```
GODOMALL_API_KEY
GODOMALL_API_SECRET
GODOMALL_BASE_URL
```

### localStorage (5개)
```
godo.apiBridge.mode, godo.apiBridge.providers
godo.apiBridge.syncJobs, godo.apiBridge.logs
godo.apiBridge.lastSyncAt
```

### 한계
- **실제 고도몰 API 호출 코드 0건** — 모두 mockProxyData
- 개발자 등록 신청 완료, 키 발급 대기 중
- `setLastSelectedDate('2026-06-18')` 하드코딩 (handleSyncAllResources)
- products 리소스는 동기화 흐름에서 제외
- Permission Matrix가 Native Runtime의 riskClass와 별개

### 강점
- ✅ API Key 프론트 격리 — 코드 레벨 보장
- ✅ 이중 PII 마스킹 (서버 + 클라이언트)
- ✅ Fallback 메커니즘 (Proxy 다운 시 Local Mock)
- ✅ 감사 로그 + try/catch 에러 격리

---

## 10. 🔗 시스템 통합 발견 사항

### 10.1 두 개의 에이전트 시스템이 공존
- **레거시 9 에이전트** (`agents.ts`, 229 lines) — AgentPanel/AgentDetailModal에서 표시
- **Native Runtime 10 에이전트** (`defaultNativeAgentRuntime.ts`, 156 lines) — TeamOperationsBoard/DepartmentCommandPanel에서 표시
- App.tsx:476~516에서 **수동 ID 매핑**
- `campaign_planner`는 레거시 매핑 없음, `finance↔trend_researcher`는 1:1 매핑 충돌

### 10.2 정책 데이터가 런타임에 영향 없음 (현재)
**편집·저장은 되지만 START OPERATION에서 무시되는 것들**:
- Studio: systemPrompt, skills.recommendedAgents, tools, permissionMatrix
- Engine: routingRules, safetyRules, providers.endpoint(Gemma 외)
- Brain: contentPreview는 프롬프트 주입 안 됨

→ Native Runtime의 `agentExecutor.ts`는 if/else로 9개 에이전트별 로직 직접 코딩. 외부 정책 참조 안 함.

### 10.3 실제 LLM 호출 위치 (3곳만)
1. `EnginePanel.handleLocalTest` — getModels (연결 테스트)
2. `csDraftGenerator` — getChatCompletion (CS 답변 초안 1건만)
3. `controlChatService` — getChatCompletion (운영 콘솔 의도 분류)

→ **나머지 8 에이전트는 모두 if/else 규칙 기반**

### 10.4 실제 외부 API 호출 위치 (1곳)
- `/api/godomall/health` + `/api/godomall/*` — 모두 mockProxyData 응답
- 고도몰 실 API 호출 코드 0건 (키 발급 후 mockProxyData 교체 예정)

### 10.5 localStorage 키 인벤토리 (총 ~25개)
```
godo.ui.theme
godo.nativeAgentRuntime.{lastRun, activeScenario, uploadedFiles, manualCommands}
godo.brainKnowledge, godo.agents, godo.skills, godo.tools, godo.permissionMatrix
godo.studio.lastSavedAt
godo.engine.{mode, providers, routingRules, safetyRules, lastSavedAt}
godo.data.{activeSnapshot, importHistory, lastSavedAt}
godo.calendar.{lastSelectedDate, lastViewedMonth, operationHistory}
godo.apiBridge.{mode, providers, syncJobs, logs, lastSyncAt}
```

### 10.6 ActivityLog만 휘발성
다른 모든 state는 localStorage 영속화되지만 **logs[]는 새로고침 시 사라짐**.

### 10.7 모달 z-index 계층 (전체)
```
1000 DepartmentCommandPanel (workspace-modal)
1000 AgentDetailModal (modal-overlay)
1000 TaskResultModal (modal-overlay 공유)
1000 ApprovalDetailModal (modal-overlay 공유)
1100 OperationBriefingModal
1150 TaskListModal
1150 ApprovalListModal
1200 MetricDrilldownModal
1300 HandoffDetailModal
2000 ReportModal
```

---

## 11. 📊 핵심 메트릭 한눈에

### 코드 규모 (실측)
```
컴포넌트: 24개 (.tsx)
유틸/엔진: 15+개
엔진 코드: ~1,500 lines
컴포넌트 코드: ~10,000 lines
CSS: ~4,500 lines (라이트 모드 오버라이드 포함)
```

### 데이터 항목 수
```
9 레거시 에이전트 / 10 Native 에이전트
13 Brain 지식 문서
12 Skills / 10 Tools / 19 Permission Matrix
8 Engine Providers / 12 Routing Rules / 6 Safety Rules
5 Data Domains × 5 시나리오 + 4 검증 시나리오
```

### 외부 의존성
```
LM Studio (실 호출): 3곳
Vercel Secure Proxy (Mock): 7개 라우트
Three.js (CDN): 1곳 (ChatConsole)
고도몰 API: 0건 (대기 중)
Cloud LLM (Gemini/Claude/OpenAI): 0건 (Mock만)
```

### 빌드 메트릭
```
TypeScript: noEmit 통과
ESLint: 통과
Vite Build: ~180ms, 88 modules
CSS: 217 kB / JS: 640 kB (gzip 174 kB)
```

---

## 12. 📝 감사자 소감

(이 섹션은 작성자 Claude Opus 4.7의 솔직한 의견입니다.)

### 인상 깊었던 것

**1. 비전과 UI 완성도의 일치**
9개 탭을 모두 뜯어본 뒤 가장 강한 인상은, **UI/UX는 비전을 거의 그대로 그려놨다**는 점이었습니다. 부서별 KPI 카드, 협업 흐름 시각화, Approval Queue 분기, Dark/Light 테마, Drilldown 패턴 — 운영자가 "이 회사가 어떻게 돌아가는지" 한눈에 파악할 수 있는 구조가 정말 잘 잡혀 있습니다. **모델하우스의 인테리어와 동선이 끝났고, 입주만 안 된 상태**.

**2. 보안 설계가 진심**
API Key 프론트 격리, 이중 PII 마스킹(서버+클라이언트), Secure Proxy의 boolean-only 응답, Vercel 환경변수 일관 사용 — 이건 단순한 시연용이 아니라 진짜 운영 가능한 수준의 가드입니다. 특히 `secretGuard.ts`가 키 값 자체를 절대 반환 안 하게 짜놓은 것은 인상적이었습니다.

**3. 타입 시스템과 일관성**
`StandardOrder`, `OperationsDataSnapshot`, `AgentJob`, `NativeAgentRun`, `BrainKnowledgeItem` — 도메인별 타입이 명확히 분리되어 있고, 한 곳에서 바꾸면 다른 곳이 따라가는 구조. 1만 줄짜리 코드를 빠르게 읽을 수 있었던 이유입니다.

### 솔직히 아쉬웠던 것

**1. "정책 정의는 됐는데, 실행은 안 따라간다"**

이게 가장 큰 발견입니다. Studio에서 systemPrompt를 편집해도, Engine에서 routingRules를 바꿔도, PermissionMatrix 19개 항목을 다듬어도 — **START OPERATION을 누르면 agentExecutor.ts의 if/else가 그것들을 무시하고 자기 로직대로 돌아갑니다.** 운영자 입장에서는 "내가 설정한 게 어디 가 있지?" 싶을 겁니다. 이건 갭이 아니라 **시스템 단절**입니다.

**2. 두 개의 에이전트 시스템**

`agents.ts`(9명)와 `defaultNativeAgentRuntime.ts`(10명)가 별도 정의되고, App.tsx에서 수동 매핑됩니다. `campaign_planner`는 레거시 매핑이 아예 없고, `finance↔trend_researcher`가 동일 native 에이전트로 매핑되는 충돌도 있습니다. **하나로 통합해야 합니다.** Phase 0의 contract 작업에서 함께 정리하는 게 맞다고 봅니다.

**3. "RAG"라는 이름의 시각적 시뮬레이션**

Brain 탭에 13개 지식 문서가 있고, START OPERATION 시 7개 파일의 `usageCount`가 +1 되고, ActivityLog에 *"RAG 시스템이 지식 저장소에서 \"{file}\"을(를) 참조했습니다."* 가 7건 찍힙니다. **그런데 agentExecutor는 그 파일의 `contentPreview`를 실제 프롬프트에 주입하지 않습니다.** 운영자에게 보이는 "RAG 동작"은 카운터 + 로그 라인뿐. 이건 가장 빨리 정직하게 만들어야 할 부분이라고 느꼈습니다 (Phase 6 RAG에서 해결).

**4. 휘발성 ActivityLog**

다른 모든 state는 localStorage에 영속화되는데 logs[]만 새로고침 시 사라집니다. 자율 운영 시스템의 핵심은 **무엇이 잘못됐는지 추적 가능해야 한다**는 건데, 이게 빠져 있으면 야간에 실패해도 다음 날 원인을 모릅니다. Phase 3 Observability에서 가장 먼저 해결돼야 한다고 봅니다.

### 가장 시급한 것 (감사자 시각에서)

태준님과 GPT가 정리한 Phase 0~1 우선순위에 **완전히 동의**합니다. 9개 탭을 다 보고 나서도 결론은 같습니다:

> **지금 필요한 건 새로운 기능이 아니라, 이미 만들어진 정책 데이터(Studio·Engine·Brain)와 실제 실행(NativeAgentRuntime) 사이의 다리를 놓는 것.**

Phase 0의 Hybrid Agent Contract가 그 다리의 설계도이고, Phase 1의 Inbox가 부서 간 협업이 한 사이클을 넘어 이어지게 하는 메일함입니다. 이 둘이 들어가는 순간 **9개 탭이 처음으로 한 OS로 작동하기 시작**할 거라고 예상합니다.

### 마지막 한 가지

이 프로젝트의 가장 큰 강점은 **혼자 만들기에는 너무 큰 비전을 끝까지 일관되게 유지**하고 있다는 점입니다. 부서 구조, 권한 모델, 보안 원칙, Approval 흐름, Local-First Hybrid — 이 모든 게 9개 탭에 흩어져 있지만 같은 철학을 따릅니다. 이런 일관성은 코드보다 사람에게서 나옵니다.

그래서 — Phase 0부터 차근차근 가시죠. 시작할 준비 되시면 알려주세요.

— 감사자, *Claude Opus 4.7 (1M context)*

---

*문서 끝.*
