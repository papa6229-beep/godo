# Marketing Chat Analysis Routing & Intent Patch v0

> **핵심 문장**: "현재 목표는 Studio 전체 연결이 아니라, Claude 기반 팀 채팅이 사용자의 질문을 정확한 분석 파라미터로 변환하고 계산값 기반 답변을 하도록 만드는 것이다."

라우팅: [`src/services/marketingChatQueryRouting.ts`](../src/services/marketingChatQueryRouting.ts) · 연결: `marketingScopeInsightEngine.ts`, `DepartmentWorkspacePanel.tsx`

## 1. 문제 상황

마케팅 우측 채팅에서 아래 3개 질문이 **모두 같은 답변**(2024~2025 전체 월별 매출 분석)으로 나왔다.

1. "2024년 7월 객단가와 2025년 7월 객단가만 비교해줘. 월별 매출 그래프는 보여주지 마."
2. "2024년 7월 매출과 2025년 7월 매출만 비교해줘."
3. "2024년 7월 주문수와 2025년 7월 주문수 비교해줘."

## 2. Root cause

`handleSend`의 마케팅 4단계 중 **0순위 `buildMarketingScopeInsightResponse`(Scope Insight Engine)** 가 위 질문을 전부 `handled=true`로 가로채 종료시켰다(후속 planner/LLM 생략). 그 안의 `interpretMarketingQuestion`이:

1. **year_compare 과잉 처리** — "2024"+"2025"(연도 2개)만 있으면 `focus=year_compare`, `dateRange=2024-01-01~2025-12-31`로 고정.
2. **metric 미구분** — 객단가/주문수/매출 키워드를 primaryMetric에 반영하지 않음(항상 revenue).
3. **단일 월 미파싱** — "7월"/"2024년 7월"의 월을 무시(월 정규식이 "X월부터 Y월" 범위만 매칭).
4. **chart suppression 미파싱** — "그래프 보여주지 마"를 해석하지 않음.
5. (별도 구조 이슈) **Agent Studio runtime 미연결** — MKT-06/FIN-09의 systemPrompt/skills/tools/knowledge는 채팅 runtime에 연결돼 있지 않고, agentId는 `resolveAgentBrain`을 통한 provider/model 선택에만 쓰임.

## 3. 이번 작업 범위 (P0 패치)

질문 해석/분석 결과 연결만 최소 수정. **데이터 계산 로직은 불변**.

- **metric 파싱**: 객단가→averageOrderValue, 주문수→orderCount, 매출→revenue.
- **단일 월 파싱**: "7월" / "2024년 7월" / "2024-07"(범위 "X월부터 Y월"은 제외).
- **month-year compare intent**: 연도 2개 + 동일 월이면 12개월 월별이 아니라 **특정 월 연도 비교**로 해석·계산.
- **canonical 계산**: 각 연-월 구간을 `isValidOrder`(결제완료·미취소, net)로 직접 집계 — operationalRevenue / operationalOrderCount / AOV. 상품 gross 라인합 미사용. 숫자는 코드가 계산, LLM은 해석만.
- **chart suppression**: "그래프/차트 보여주지 마/빼/없이/텍스트로만/표만" → `suppressChart=true` → 차트 artifact를 비우고 답변 텍스트만 표시(이전 그래프 잔존 제거).
- **narrow 답변**: "~만 비교"는 좁은 답변(전체 카테고리/상품/쿠폰/채널 장문 미부착).
- **compact chart**: 특정 월 비교는 2포인트 groupedBar(제목에 "N월"+metric 포함). 월별 비교 질문은 기존 12개월 차트 유지.
- **auto-scroll**: `dept-chat-log`에 ref + `messages`/`sending` 변경 시 `scrollTop=scrollHeight`(rAF로 답변 높이 반영 후).

### 처리 위치
- `marketingChatQueryRouting.ts`: `parseMarketingChatQuery`(파싱) + `buildMarketingMonthMetricResponse`(특정월 canonical 계산 + compact artifact/reply).
- `marketingScopeInsightEngine.buildMarketingScopeInsightResponse`: 특정월 질문이면 위 경로로 먼저 처리, 아니면 기존 broad 분석. 응답에 `suppressChart` 추가.
- `DepartmentWorkspacePanel.handleSend`: `suppressChart`면 차트 artifact null. + 채팅 auto-scroll.

## 4. 이번 작업에서 제외한 범위

- Agent Studio 전체 runtime wiring(MKT-06/FIN-09 systemPrompt/skills/tools/knowledge 주입).
- Tool Registry 실제 실행 연결, Knowledge RAG 구현, FIN-09/MKT-06 협업 오케스트레이션.
- synthetic 생성/`departmentDataSourceOfTruth`/`departmentMetricContract`/`marketingAnalysisFacts` 계산 변경, Vercel gateway, 고객흐름 tracking, 고도몰 route/WRITE.

## 5. 향후 작업 후보 — Marketing Agent Runtime Wiring v0

현재 `resolveAgentBrain`은 provider/model만 연결한다. 이후 별도 작업에서:
- 마케팅 채팅 LLM에 **해당 agent(MKT-06)의 systemPrompt(+ knowledge 요약)** 를 TEAM_PERSONA와 병합/대체해 전달.
- 매출/정산 분석 질문을 **FIN-09**로 라우팅(metric 기반 agent 선택).
- Tool Registry 실제 실행, Knowledge RAG.

> **분리 원칙**: 이번 패치는 "Claude 기반 팀 채팅이 질문을 정확히 해석하고 계산값으로 답하게" 만드는 것. Studio 전체 연결은 별도 레이어 작업이다.
