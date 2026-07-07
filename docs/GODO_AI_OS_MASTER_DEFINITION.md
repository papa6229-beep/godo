# GODO AI OS — 완전 정의 보고서 (Master Definition)

> **작성일**: 2026-06-25  
> **버전**: v1.0 (모든 작업 문서 통합본)  
> **기반 문서**: PROJECT_STATE.md · MASTER_REPORT_2026-06-22.md · TAB_AUDIT_REPORT_2026-06-22.md · EXECUTION_PLAN_2026-06-22.md · godo_data_flow_analysis.md · ORDERS_STATUS_AND_REVENUE_DESIGN.md · PROJECT_HANDOFF_2026-06-23.md · PROJECT_HANDOFF_2026-06-24.md · PROJECT_HANDOFF_2026-06-25.md  
> **목적**: 이 문서 하나만으로 프로젝트의 철학·역사·아키텍처·데이터·AI 연결·탭 구성·다음 로드맵을 처음 보는 사람(AI 포함)이 완전히 파악할 수 있도록 한다.

---

## 0. 한 줄 정의

**GODO AI OS는 NHN 고도몰(GodoMall) 쇼핑몰 "바깥에 붙는" 외부 AI 운영 보조 OS다.**  
고도몰 기본 솔루션을 직접 수정하지 않고, Open API로 데이터를 읽어, **10명의 AI 직원이 4부서로 나뉘어 CS·주문·재고·매출·마케팅 업무를 담당**하고, **사람은 마지막 승인·결재만** 한다.

---

## 1. 프로젝트 정체성 & 핵심 철학

### 1-1. 정체성

```
고도몰 기본 솔루션 (그대로 사용)
   ↓ Open API (POST + XML, OpenHub 도메인)
GODO AI OS (외부 AI 운영 레이어) ← 이 프로젝트
   ↓ 분석·요약·초안·제안
운영자 (최종 승인)
   ↓ 승인된 경우만
고도몰 API (실제 실행)
```

### 1-2. 핵심 철학 4가지 (변경 불가)

1. **Human-in-the-loop** — 환불·쿠폰·가격·CS 답변 등 외부에 닿는 액션은 AI가 직접 실행 불가. 반드시 Approval Queue 경유 후 사람이 승인.
2. **Local-First Hybrid AI** — 반복 업무는 로컬 LM Studio(Gemma) 무료·로컬·PII 안전 우선. 고난도 전략만 클라우드(Claude/OpenAI/Gemini).
3. **API Key 프론트 영구 격리** — 고도몰 키/클라우드 AI 키 모두 Vercel 환경변수 + Secure Proxy/Server Route 서버 사이드 전용. localStorage/응답 JSON/로그 절대 노출 금지.
4. **PII 이중 마스킹** — 서버(`api/_shared/piiMaskGuard.ts`) + 클라이언트(`src/utils/privacyMask.ts`). 외부 LLM 전송 전 비식별 확인.

### 1-3. 24/7 자율 협업 회사 비전 (최종 목표)

```
00:00  매출 분석팀 → 어제 매출 집계 → 마케팅팀 inbox
06:00  CS팀 → 밤사이 문의 분석 → 답변 초안 → Approval Queue
09:00  운영자 출근 → 승인·거절 결재
12:00  마케팅팀 → 오전 매출으로 캠페인 후보 도출 → Approval Queue
```

---

## 2. 기술 스택

| 항목 | 내용 |
|---|---|
| 프론트엔드 | React 19 + TypeScript + Vite 8 |
| 배포 | Vercel (정적 + Serverless Functions) |
| 상태 관리 | 대부분 `localStorage` 영속화 |
| 로컬 LLM | LM Studio + `google/gemma-4-e4b` (`http://127.0.0.1:1234/v1`, dev 전용 Vite proxy) |
| 클라우드 AI | Claude/OpenAI/Gemini (서버 route `/api/ai/chat` 경유, 키 서버 요청 단위 사용·미저장) |
| 고도몰 API | OpenHub `POST + XML`, real: `https://openhub.godo.co.kr/godomall5`, sandbox: `http://sbopenhub.godo.co.kr/godomall5` |
| GitHub | https://github.com/papa6229-beep/godo |
| Production | https://godo-psi.vercel.app |
| 검증 3종 | `npm run lint` · `npx tsc --noEmit` · `npm run build` |

---

## 3. 전체 시스템 아키텍처

### 3-1. 레이어 다이어그램

```
[고도몰 Open API] ← Vercel Secure Proxy (api/godomall/*) ← 서버만 직접 호출
      ↓
[Products READ] + [Orders READ] → godomallRevenue.ts (RevenueOrder 타입)
                                 syntheticRevenue.ts (가상 240건, 결정적 PRNG)
      ↓
[departmentDataService.ts] ← 프론트 데이터 게이트웨이
      ↓
[ProductTeamDashboard.tsx] — 보기(대시보드)
[DepartmentWorkspacePanel.tsx] — 우측 팀장 AI 채팅 ← 같은 데이터셋 공유
[CalendarPanel.tsx] — 운영일지 날짜별 집계

[AI 두뇌 연결]
aiKeyVault (localStorage 키 마스킹)
      ↓
aiProviderAdapter.chatWithProvider()  ← 공통 통로
  local_lmstudio → lmsConnector.ts (Vite proxy)
  cloud → /api/ai/chat (Vercel Serverless, 키 서버 요청 단위 사용)
      ↓
aiBrainSettings.resolveAgentBrain() → 기본 AI(Claude) / 직원별 고정 brain
      ↓
ChatConsole(HQ 운영 채팅) + DepartmentWorkspacePanel(팀장 채팅) + AgentPanel(직원별 brain 설정)
```

### 3-2. Vercel Serverless 라우트 맵 (`api/`)

| 라우트 | 역할 |
|---|---|
| `api/godomall/health.ts` | 고도몰 API 키 존재 boolean + 모드 상태 |
| `api/godomall/products.ts` | Products READ (Goods_Search.php) |
| `api/godomall/orders-admin.ts` | 표시용 주문 조회 (StandardOrderAdmin) |
| `api/godomall/orders-revenue.ts` | 매출분석용 주문 (RevenueOrder, ?includeSynthetic) |
| `api/godomall/orders.ts` / `inquiries.ts` / `reviews.ts` / `inventory.ts` / `sales.ts` | 기타 도메인 (현재 mock fallback) |
| `api/godomall/sync.ts` | 통합 동기화 |
| `api/ai/chat.ts` | POST — 클라우드 AI 대화 (OpenAI/Gemini/Claude, handleAiChat 재사용) |
| `api/_shared/aiProviderServer.ts` | handleAiChat 코어 — errorKind 분류, 키 미저장 |
| `api/_shared/godomallOpenApiClient.ts` | real/sandbox base 선택, 키 주입 |
| `api/_shared/godomallXmlParser.ts` | fast-xml-parser 기반, 태그명 비의존 리스트 추출 |
| `api/_shared/godomallMapper.ts` | mapGoodsToProducts / mapOrdersToRevenue |
| `api/_shared/godomallResource.ts` | 리소스 오케스트레이터 (real→sandbox→mock fallback) |
| `api/_shared/godomallRevenue.ts` | RevenueOrder 타입 + deriveOrderState + summarizeRevenue |
| `api/_shared/godomallInventoryDerive.ts` | Products REAL READ 기반 재고 파생 |
| `api/_shared/syntheticRevenue.ts` | 가상 매출 생성기 (결정적 PRNG, 240건 6개월) |
| `api/_shared/secretGuard.ts` | 환경변수 검증, 키 원문 미반환 |
| `api/_shared/piiMaskGuard.ts` | 서버 사이드 PII 마스킹 |
| `api/_shared/proxyResponse.ts` | 응답 규격, 에러 스택 노출 방지 |
| `api/_shared/mockProxyData.ts` | 샌드박스 fallback 가상 데이터 |

---

## 4. Navigation IA (v1, 현재 기준)

```
[운영 탭 — 상단 메인]
  🏢 오늘의 운영     (activeTab = 'office')
  🗂️ 부서 업무 관장  (activeTab = 'department')   ← ★ 3열 구조
  🤖 AI 직원         (activeTab = 'agents')
  📅 운영일지        (activeTab = 'calendar')

[관리자 설정 드롭다운 — 우상단]
  📡 데이터 가져오기  (data)
  🔌 쇼핑몰 연동     (api)
  📝 작업기록        (logs)
  🧠 업무 매뉴얼     (brain)
  ⚙️ AI 설정실       (studio)
  🚀 AI 두뇌 설정    (engine)  ← 내부: 🧩 AI Providers 탭 포함
```

---

## 5. 탭별 상세 명세 (10개 화면)

### 5-1. 🏢 오늘의 운영 (office)

**파일**: `OfficeView.tsx` (3열 그리드)

| 열 | 컴포넌트 | 내용 |
|---|---|---|
| 좌 | `TeamOperationsBoard.tsx` | AI 부서 관제 보드 — 부서 카드 4장(KPI 4종 클릭→드릴다운) + 최근 협업 + 검증 시나리오 |
| 중 | `ChatConsole.tsx` | HQ 운영 채팅 — Three.js 3D Brain + 실 AI 연결(기본 AI=Claude) + HQ 매니저 페르소나 + 탭이동 유지 |
| 우 | `TaskBoard.tsx` | Today's Tasks + Approval Queue (상태 4칩 클릭 → 모달) |

**START OPERATION 흐름**: `runNativeAgentOperation()` → 6 AgentJob 병렬 → teamLeadAggregator → handoffEngine → managerOrchestrator → UI 반영.

**중앙 ChatConsole AI 연결**: `controlChatService.ts` → `chatWithProvider(brain)` → 기본 AI(Claude). 기록: `hqChatMemory.ts`(`godo_hq_chat_messages_v0`, 최근 50건, 탭 이동/새로고침 유지).

**모달 스택**:
```
1000 DepartmentCommandPanel / AgentDetailModal / TaskResultModal / ApprovalDetailModal
1100 OperationBriefingModal
1150 TaskListModal / ApprovalListModal
1200 MetricDrilldownModal
1300 HandoffDetailModal
2000 ReportModal
```

---

### 5-2. 🗂️ 부서 업무 관장 (department) ← ★ 핵심 구조

**파일**: `DepartmentWorkspacePanel.tsx`  
**레이아웃**: 좌 | 중 | 우 **3열**

| 열 | 내용 |
|---|---|
| **좌** | 부서 선택 탭 (총괄팀 / 상품관리팀 / CS팀 / 마케팅팀) |
| **중** | 선택된 팀의 대시보드/데이터 뷰 — 상품관리팀: `ProductTeamDashboard.tsx` |
| **우** | 선택된 팀의 **팀장 AI 채팅** (우측 채팅이 중앙 대시보드와 동일 데이터셋 공유) |

> **이 구조가 핵심**: "보는 것(대시보드, 중열)"과 "제어하는 것(팀장 채팅, 우열)"이 **같은 데이터셋을 기반**으로 동작한다.  
> 채팅에서 "6월 상품 매출 알려줘"라고 물으면, 코드(`productTeamChatFacts.ts`)가 실제 데이터에서 값을 계산해 Claude에 넘기고, Claude는 그 facts 안에서만 답한다(숫자 추측 금지).

**팀별 채팅 서비스**: `departmentChatService.ts` → `TEAM_AGENT` 매핑 → `resolveAgentBrain()` → `chatWithProvider()`  
**팀별 채팅 기록**: `departmentChatMemory.ts`(`godo_department_chat_messages_v0`, 팀별 분리, 최근 50건)  
**팀별 페르소나**: 각 팀장 AI는 자기 역할에 맞는 시스템 프롬프트 보유. SAFETY 상수로 "실제 외부 실행 금지" 공통 가드.

---

### 5-3. 상품관리팀 대시보드 (ProductTeamDashboard.tsx)

**데이터 소스**: `departmentDataService.fetchRevenue(includeSynthetic=true)` → `orders-revenue?includeSynthetic=true`  
**실데이터**: 고도몰 Products REAL READ (13개)  
**가상 데이터**: `syntheticRevenue.ts` — 결정적 seed PRNG로 생성, 6개월치 240건 가상 주문, 실제 상품 13개 기반, `sourceType='synthetic_test'`

**대시보드 구성**:
- **KPI 4종**: 총주문·총상품매출·확정매출·카테고리수 (선택 기간 기준)
- **매출 추이 차트**: 모드 = 집계 단위 (전체/월별/주간별/일별/직접 날짜 범위), 공유 날짜 범위 → KPI/추이/도넛/순위 모두 동일 기간 기준
- **카테고리 도넛 차트**
- **상품 랭킹**: 상위 N개 상품 매출 순위
- **재고 현황**: `stockImpact` 기반 (가상 재고, 추적됨·주의·품절 분류)

**상품팀 채팅 facts 구조 (`productTeamChatFacts.ts`)**:
- 9개 질문 의도 감지: `data_limit / current_screen / monthly_revenue / monthly_trend / category_share / top_products / stock_risk / total_revenue / general`
- 코드가 숫자 집계 → `{intent, facts[], answerGuidance}` → Claude는 이 facts 안에서만 설명

**현재 데이터 한계 (추측 금지)**: 회원 유형/신규·비회원/연령/재구매율/고객 세그먼트/유입 경로/실제 결제·환불 세부

---

### 5-4. 🤖 AI 직원 (agents)

**파일**: `AgentPanel.tsx`, `AgentDetailModal.tsx`, `agents.ts`

**레거시 9인 에이전트** (UI 표시 기준):

| id | 이름 | 역할 |
|---|---|---|
| manager | 총괄 매니저 AI | 전체 조율·승인·운영 콘솔 |
| cs | CS 상담 AI | 문의 분류·답변 초안 |
| order | 주문 확인 AI | 주문 상태·이상 감지 |
| delivery | 배송 추적 AI | 지연·송장 누락 |
| review | 리뷰 답글 AI | 감성 분석·답글 초안 |
| marketing | 마케팅 기획 AI | 캠페인·재구매 |
| product | 상품 관리 AI | 상품 오류·수정 초안 |
| stock | 재고 감시 AI | 안전재고 미달·발주 |
| finance | 매출 분석 AI | 매출 요약·추세 |

**직원별 AI 선택**: `AgentDetailModal` + `StudioPanel`의 Agent Editor에서 "전체 기본 AI 따라가기 / X로 고정" 선택 가능.  
**기본 AI**: Claude (`claude-sonnet-4-6`).  
**AgentPanel 카드**: "사용 AI: 기본 AI (Claude)" 등 현재 brain 표시.

---

### 5-5. 📅 운영일지 (calendar)

**파일**: `CalendarPanel.tsx`, `dailySummaryBuilder.ts`

- 탭 진입 시 `fetchRevenue(true)` 1회 호출 → 날짜별 집계
- **셀 배지**: ORD(주문수) / ₩(상품매출 k) / STK(재고위험 거래 수) + 위험거래일 warning dot
- **일일 요약** (우측): 상품매출/총주문금액/주문건수/배송비/판매수량/실제·가상 구분/재고위험
- **월간 KPI**: 데이터일수/월간총주문/월간총매출/재고위험 — 고객문의·부정리뷰는 0 placeholder (미연결)
- **이슈 타임라인**: 매출·재고 기반 감지 이슈(재고주의 당일판매 danger·카테고리 비중 50%+ warning·±30% 이상치 danger)

---

### 5-6. 📝 작업기록 (logs)

**파일**: `ActivityLog.tsx` — `LogEntry[]` (info/success/warning/error/agent)  
**한계**: 새로고침 시 사라짐(localStorage 미동기화). 롤링 캡 없음.

---

### 5-7. 🧠 업무 매뉴얼 (brain)

**파일**: `BrainPanel.tsx`, `brainKnowledge.ts`  
**정체**: RAG 유사 구조지만 실제 임베딩 검색 아님 — 클라이언트 텍스트 매칭 + Mock Update.  
**13개 지식 문서** (cs_policy / delivery_policy / refund_exchange_policy / product_expression_rules / inventory_snapshot / order_check_template / cs_auto_template / daily_operation_report / campaign_result_report / cs_decision_log / marketing_decision_log / review_reply_template / sales_report_template)  
**한계**: agentExecutor가 `contentPreview`를 실제 프롬프트에 주입 안 함 (Phase 6 RAG에서 해결 예정).

---

### 5-8. ⚙️ AI 설정실 (studio)

**파일**: `StudioPanel.tsx` — 6 sub-tab:  
Brain Editor / Agent Editor(AI 선택 포함) / Skill Registry(12개) / Tool Registry(10개) / Permission Matrix(19개) / Import-Export  
**한계**: Studio에서 편집한 systemPrompt/skills/tools/permissionMatrix가 Native Runtime `agentExecutor.ts` if/else에 반영 안 됨 (Phase 2에서 해결 예정).

---

### 5-9. 🚀 AI 두뇌 설정 (engine)

**파일**: `EnginePanel.tsx` — 7 sub-tab:  
Overview / Mode(5종) / Local / Cloud / Rules / Logs / Safety + **🧩 AI Providers** (★신규)

**🧩 AI Providers 탭** (`AiProviderFoundationPanel.tsx`):  
- 6개 provider 카드: OpenAI / Gemini / Claude / LM Studio Local (dev 전용) / 등
- 각 카드: 키 입력(password) → 연결 확인 버튼 → 성공 시 **자동 저장** + verified 상태 → 기본 AI 지정 가능 → 접이식 채팅 테스트
- 상태 3단계: 미연결 / 연결됨(키 있음, 미검증) / 활성(연결 확인 완료)
- 저장소: `aiKeyVault.ts` (`godo_ai_provider_keys_v0` / `_models_v0` / `_verified_v0`)

**AI 두뇌 라우팅**:
```typescript
// 기본 AI (전역)
DEFAULT_GLOBAL_BRAIN = { providerId: 'claude_api', modelId: 'claude-sonnet-4-6' }

// 직원별 brain 해석
resolveAgentBrain(agentId)
  → agentBrains[agentId] 있으면 그것, 없으면 global brain

// 실제 호출
chatWithProvider({ providerId, modelIdOverride, purpose, messages })
  → local_lmstudio: lmsConnector.getChatCompletion() (Vite proxy)
  → cloud: fetch('/api/ai/chat', { apiKey: aiKeyVault.getProviderKey(), ... })
           → handleAiChat() (서버) → Claude/OpenAI/Gemini
```

**클라우드 모델 목록**:
- Gemini: gemini-2.5-flash / gemini-2.5-pro / gemini-2.5-flash-lite / gemini-2.5-flash-latest
- Claude: claude-sonnet-4-6 / claude-opus-4-8 / claude-haiku-4-5-20251001
- OpenAI: gpt-4.1-mini / gpt-4o-mini

---

### 5-10. 📡 데이터 가져오기 (data)

**파일**: `DataPanel.tsx` — 7 sub-tab:  
Overview / Upload Center / Data Preview / Mapping Rules / Quality Check / Privacy Masking / Import History  
**표준 도메인**: orders / inquiries / reviews / inventory / sales  
**PII 마스킹**: 이름·전화·이메일·주소 정규식 마스킹 (`privacyMask.ts`)

---

### 5-11. 🔌 쇼핑몰 연동 (api)

**파일**: `ApiBridgePanel.tsx` — 6 sub-tab:  
Overview / Connector / Sync / Permissions / History / Safety  
- 마운트 시 `/api/godomall/health` 자동 fetch → `isLive` 파생, 모드/출처 표시
- Products: real READ 활성 (`Source: REAL (Live)`)
- Orders 등: 아직 mock fallback

---

## 6. 데이터 파이프라인 전체 흐름

```
[고도몰 Open API]
  Goods_Search.php → godomallMapper.mapGoodsToProducts → StandardProduct[] (13개)
  Order_Search.php → godomallRevenue.mapOrdersToRevenue → RevenueOrder[]
                              ↑ Products 조인(goodsNo→productId, 카테고리 파생)
                              ↑ deriveOrderState(날짜필드 우선: paid/shipped/delivered/confirmed/canceled)
                              ↑ normalizeLines(orderGoodsData → 항상 array)

[syntheticRevenue.ts] → 가상 RevenueOrder[] (240건, 6개월, 결정적 PRNG, sourceType='synthetic_test')
  → stockImpact[] (가상 재고: 모든 상품 tracked, projectedStock=initialStock−sold+restored)

[api/godomall/orders-revenue] → { mode, live, count, orders[], summary, stockImpact }
  ?includeSynthetic=true → 실 + 가상 병합

[departmentDataService.fetchRevenue()] → 프론트에서 소비
  ↓
ProductTeamDashboard (보기 = 중열)
DepartmentWorkspacePanel 우측 채팅 (제어 = 우열)  ← 동일 데이터셋 공유
CalendarPanel (날짜별 집계)
```

### 6-1. 매출 계산 기준 (v0 확정)

- **확정매출(메인)**: `finishDt` 있음 → 취소/반품 구조적 제외
- **잠정매출(보조)**: `paid && !canceled`
- **상품매출**: 라인 `goodsPrice × goodsCnt`, 헤더 `totalGoodsPrice` 대조
- **배송비 별도**: `totalDeliveryCharge` 상품매출에 절대 미포함
- **실/가상 구분**: `sourceType='real_godomall' | 'synthetic_test'`, 집계 시 필터 가능

### 6-2. 주문 상태 판별 규칙 (날짜필드 우선)

```
paid       = paymentDt 유효(빈값/0000 아님)
shipped    = invoiceDt 또는 deliveryDt 유효
delivered  = deliveryCompleteDt 유효
confirmed  = finishDt 유효  ← 확정매출 기준
canceled   = cancelDt 유효
unpaid     = !paid (o1 코드로도 보조 확인)
```

---

## 7. AI 연결 아키텍처 전체

### 7-1. 연결 상태 단일 저장소

`aiKeyVault.ts` — 모든 AI 연결 상태의 단일 진실(Single Source of Truth).  
모든 컴포넌트(카드 배지 / 채팅 헤더 / brain 라우팅)가 여기서 읽음.

```typescript
// 저장 키
godo_ai_provider_keys_v0   // 키 (마스킹 표시, 서버 요청에만 사용)
godo_ai_global_brain_v0    // 전역 기본 AI 선택
godo_ai_agent_brains_v0    // 직원별 brain 선택
godo_hq_chat_messages_v0   // HQ 채팅 기록
godo_department_chat_messages_v0  // 부서 팀별 채팅 기록
```

### 7-2. 클라우드 AI 호출 흐름 (보안)

```
브라우저
  chatWithProvider({ providerId: 'claude_api', messages })
    → chatWithCloud()
      → fetch('/api/ai/chat', { body: { provider, model, messages, apiKey: vault.getProviderKey() } })
        → [서버] handleAiChat()
          → 실제 Claude/OpenAI/Gemini fetch
          → apiKey는 요청 1회만 사용, 저장·로그·응답 노출 없음
          → errorKind: invalid_key / model_not_found / rate_limited / server_error / unknown
          → normalize(text: content)
        ← { ok, content, errorKind }
      ← { ok, content, errorKind }
```

---

## 8. 에이전트 시스템

### 8-1. 레거시 9에이전트 (UI 표시용, agents.ts)

`manager / cs / order / delivery / review / marketing / product / stock / finance`  
각 에이전트: Role · Stats · System Prompt · Knowledge · Skills · Tools · Permissions · Memory

### 8-2. Native Runtime 10에이전트 (실행용, defaultNativeAgentRuntime.ts)

`manager_agent / product_lead / product_analyst / inventory_monitor / cs_lead / inquiry_analyst / review_detector / marketing_lead / trend_researcher / campaign_planner`

**알려진 매핑 충돌** (미해결):
- `campaign_planner` = 레거시 매핑 없음
- `finance / trend_researcher` → 같은 native ID로 중복 매핑

### 8-3. 부서 업무 관장 팀장 채팅 agent ID

```typescript
const TEAM_AGENT = {
  hq: 'manager', product: 'product', cs: 'cs', marketing: 'marketing'
};
```

---

## 9. 현재 상태 요약 (2026-06-25 기준, main HEAD `7965df1`)

### 완료된 것

| 영역 | 상태 |
|---|---|
| 고도몰 Products READ v0 | ✅ real mode, Production 검증 완료 |
| 고도몰 Orders READ (표시용/매출용) | ✅ real mode, RevenueOrder 스키마 |
| 가상 매출 데이터 (6개월) | ✅ 결정적 PRNG, 240건, Products 기반 |
| 상품관리팀 대시보드 | ✅ KPI/추이/도넛/랭킹/재고, 공유 기간 필터 |
| 운영일지 매출 바인딩 | ✅ 날짜별 집계, KPI, 이슈 타임라인 |
| Navigation IA v1 | ✅ 운영 탭 + 관리자 설정 드롭다운 |
| AI 두뇌 연결 (Claude/OpenAI/Gemini/LM Studio) | ✅ aiKeyVault + /api/ai/chat route |
| HQ 운영 채팅 실AI 연결 | ✅ 기본 AI(Claude), HQ 페르소나, 탭 유지 |
| 부서 팀장 채팅 활성화 | ✅ 4부서 팀장 AI, 팀별 기록 분리 |
| 상품팀 채팅 facts 기반 응답 | ✅ productTeamChatFacts, 코드가 숫자 계산 |
| 매출 추이 필터 정리 | ✅ 모드=집계단위, 공유 날짜 범위 |
| 직원별 brain 선택 | ✅ AgentDetailModal/StudioPanel |

### 미완성 / 플레이스홀더

| 영역 | 상태 |
|---|---|
| Orders/Inquiries/Reviews 라이브 연결 | ⏳ mock fallback |
| CS팀/마케팅팀 facts builder | ⏳ 페르소나만 있음, 전용 데이터 미연결 |
| agentExecutor → chatAsAgent 실연결 | ⏳ 현재 if/else 규칙 기반 |
| Studio 편집값 → Runtime 반영 | ⏳ Phase 2 예정 |
| ActivityLog 영속화 | ⏳ 현재 새로고침 시 사라짐 |
| RAG 실주입 (Brain contentPreview) | ⏳ Phase 6 예정 |
| Approval → 고도몰 Write Action | ⏳ Phase 8 예정 |
| Auto Run (트리거) | ⏳ Phase 4 예정 |
| Department Inbox 메시지 큐 | ⏳ Phase 1 예정 |

### dev vs Vercel 차이점

- `/api/godomall/*`: Vercel Serverless에서만 동작(dev에서 미서빙 → 상품/매출 수치 비어 있음)
- `/api/ai/chat`: vite 미들웨어 플러그인(`aiChatDevPlugin`)으로 dev에서도 동작
- LM Studio: dev 전용(Vite proxy `/lmstudio/v1 → 127.0.0.1:1234/v1`)

---

## 10. localStorage 키 인벤토리 (전체)

```
// UI
godo.ui.theme

// 운영 런타임
godo.nativeAgentRuntime.lastRun
godo.nativeAgentRuntime.activeScenario
godo.nativeAgentRuntime.uploadedFiles
godo.nativeAgentRuntime.manualCommands

// AI 두뇌
godo_ai_provider_keys_v0      // 클라우드 키 (마스킹 저장)
godo_ai_global_brain_v0       // 전역 기본 AI
godo_ai_agent_brains_v0       // 직원별 brain 선택
godo_hq_chat_messages_v0      // HQ 채팅 기록 (최근 50)
godo_department_chat_messages_v0  // 부서 팀별 채팅 기록 (팀별 분리, 각 최근 50)

// 스튜디오
godo.brainKnowledge, godo.agents, godo.skills, godo.tools, godo.permissionMatrix
godo.studio.lastSavedAt

// 엔진
godo.engine.mode, godo.engine.providers
godo.engine.routingRules, godo.engine.safetyRules
godo.engine.lastSavedAt

// 데이터 커넥터
godo.data.activeSnapshot
godo.data.importHistory
godo.data.lastSavedAt

// 운영일지
godo.calendar.lastSelectedDate
godo.calendar.lastViewedMonth
godo.calendar.operationHistory

// API 브릿지
godo.apiBridge.mode, godo.apiBridge.providers
godo.apiBridge.syncJobs, godo.apiBridge.logs
godo.apiBridge.lastSyncAt
```

---

## 11. 알려진 구조적 갭 (Phase 0~3 과제)

1. **정책 데이터 → 런타임 단절**: Studio/Engine/Brain에서 편집한 systemPrompt·routingRules·contentPreview가 `agentExecutor.ts`의 if/else에 반영 안 됨.
2. **에이전트 시스템 이중화**: 레거시 9명(`agents.ts`) vs Native 10명(`defaultNativeAgentRuntime.ts`), App.tsx에서 수동 ID 매핑, `campaign_planner` 누락·`finance↔trend_researcher` 중복.
3. **"RAG"는 시뮬레이션**: usageCount+1 / 로그 라인만 찍힘, 실제 프롬프트 주입 없음.
4. **ActivityLog 휘발성**: 새로고침 시 전체 소멸, 야간 실패 원인 추적 불가.
5. **자율 트리거 없음**: START 버튼 없이는 동작 없음, cron/webhook 미구현.
6. **handoff가 1사이클로 끝남**: 부서 간 메시지가 다음 날로 이어지지 않음(Inbox 메시지 큐 미구현).

---

## 12. 8단계 로드맵 (EXECUTION_PLAN 기준)

```
Phase 0  Hybrid Agent Contract 정의 (설계 문서, AGENT_CONTRACTS.md)
Phase 1  Department Inbox + Retention (부서 메시지 큐, localStorage)
Phase 2  Hybrid Agent Executor v1 (코드=compute + Gemma=interpret/draft)
Phase 3  Run History + Observability (휘발성 로그 해결)
Phase 4  Safe Auto Run (cron 스케줄러 + 안전 가드)
Phase 5  Godomall READ Bridge [✅ Products완료, Orders부분완료 / Inquiries·Reviews·Inventory 파생 잔여]
Phase 6  Memory / RAG 1차 (승인/거절 이력 → 다음 판단 반영)
Phase 7  External Tools (마케팅팀 외부 검색 어댑터)
Phase 8  Approval-based Write Action (CS답변/주문상태/재고수정 등 순서대로)
```

---

## 13. 다음 작업 후보 (즉시 시작 가능)

1. **태준님 실키/Production 실검수** — Claude 키로 ① HQ 채팅(모델질문/일상/운영현황) ② 부서 팀장 채팅(상품/CS/마케팅) ③ 상품팀 facts(6월 매출만/전체/카테고리/순위/재고) ④ 대시보드 추이 필터(월별→월축, 일별 6/22~6/28, KPI·도넛 기준 일치) 눈 확인.
2. **AI 직원별 역할·권한·업무 세팅** — agentExecutor가 `chatAsAgent`를 쓰도록 실연결.
3. **CS/Reviews READ v0 + csTeamChatFacts** — `Board_List.php` 매핑 후 CS팀 facts builder (상품팀 패턴 재사용).
4. **marketingTeamChatFacts** — 상품/매출 성과 기반 캠페인 후보.
5. **HQ Run Now / 상품팀 6개월 분석 리포트 / 상품팀→마케팅팀 handoff** — Agent Runtime v2.

---

## 14. 개발 규칙 (매 작업 공통, 변경 불가)

```bash
# 커밋 전 필수 3종
npm run lint
npx tsc --noEmit
npm run build
```

- **브랜치 전략**: main 직접 작업 금지 → 작업별 브랜치(feat/fix/chore) → 검증 통과 → `--no-ff` merge → push
- **커밋 말미**: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Vercel ESM 규칙**: `api/**` 내 상대경로 import는 반드시 `.js` 확장자 포함
- **Vercel 라우트 규칙**: `_`로 시작하는 파일은 라우트로 배포 안 됨(`_shared/`는 import 전용)
- **고도몰 금지**: 임의 endpoint 생성, Write API, mockProxyData 삭제, 키를 프론트/로그/응답에 노출
- **AI 금지**: 클라우드 키를 브라우저 코드/로그/응답에 원문 노출, 브라우저에서 직접 클라우드 AI 호출
- **가상 데이터 금지**: 고도몰 실주문/실재고에 쓰기(GODO 내부 전용)
- **상품팀 채팅 규칙**: 숫자는 코드(facts)가 계산, "고도몰 관리자 확인" 문구 금지, 없는 데이터는 없다고 안내

---

## 15. 새 AI 세션 시작용 1페이지 브리핑

```markdown
[GODO AI OS 컨텍스트 브리핑 — 2026-06-25]

GODO AI OS는 NHN 고도몰 쇼핑몰 "바깥에 붙는" 외부 AI 운영 보조 OS다.
고도몰 기본 솔루션 위에, 10명의 AI 직원(4부서)이 CS·주문·재고·매출·마케팅을 담당하고,
사람은 최종 승인만 한다(Human-in-the-loop).

스택: React 19 + TypeScript + Vite 8, Vercel(정적+서버리스), localStorage 상태 영속화.
기본 AI: Claude (claude-sonnet-4-6), 클라우드 키는 서버 route(/api/ai/chat) 경유·미저장.
고도몰 API: POST + XML, partner_key+user_key는 Vercel 환경변수에만.

현재 연결된 실데이터:
- Products REAL READ: 고도몰 13개 상품 (goodsNo/price/stock/status/category 등)
- Orders REAL READ: RevenueOrder 스키마 (날짜필드 기반 상태 파생)
- 가상 주문 6개월치: syntheticRevenue.ts (결정적 PRNG, 240건, Products 기반)

핵심 화면 — 부서 업무 관장 탭 (3열 구조):
  좌: 부서 선택 (총괄/상품관리/CS/마케팅)
  중: 팀 대시보드 (상품관리팀 = ProductTeamDashboard, 실+가상 데이터)
  우: 팀장 AI 채팅 (departmentChatService, 팀별 페르소나+기록 분리)
  ★ 중열과 우열은 동일 데이터셋 공유: 채팅으로 숫자를 물으면 코드가 계산(facts), AI는 설명만.

주요 서비스 파일:
  aiKeyVault.ts       — AI 연결 키/모델/verified 단일 저장소
  aiProviderAdapter.ts — chatWithProvider() 공통 통로
  aiBrainSettings.ts  — global brain + 직원별 brain + resolveAgentBrain
  departmentChatService.ts — 팀별 팀장 AI 채팅
  productTeamChatFacts.ts  — 상품팀 의도 감지 + 숫자 계산
  hqChatMemory.ts / departmentChatMemory.ts — 기록 영속화

보안 원칙 (절대 불변):
  - 고도몰/AI 키: Vercel 환경변수 + 서버만. 프론트/localStorage/로그/응답 금지.
  - PII: 서버 piiMaskGuard + 클라이언트 privacyMask 이중 마스킹.
  - 외부 실행: Human-in-the-loop (Approval Queue → 사람 승인 → Secure Proxy).
  - 가상 데이터: 고도몰에 절대 쓰지 않음 (GODO 내부 전용).
```

---

*문서 끝. (작성: 2026-06-25, 모든 docs/ MD 파일 통합)*
