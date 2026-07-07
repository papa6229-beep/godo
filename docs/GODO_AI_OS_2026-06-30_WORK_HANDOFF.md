# GODO AI OS 작업 인수인계 문서
## 2026-06-30 작업 종료 컨텍스트

> 목적: 내일 새 채팅창에서 이 파일만 읽고 바로 이어갈 수 있도록, 오늘 확인한 문제, 완료한 작업, 현재 HEAD, 검증 결과, 남은 작업, 다음 작업 방향을 한 문서에 정리한다.  
> 작성 기준: 2026-06-30 대화 및 완료보고서 기준.  
> 프로젝트명: **GODO AI OS**  
> 현재 핵심 초점: **마케팅팀 대시보드/우측 채팅 분석 구조 고도화**

---

## 0. 오늘의 핵심 결론

오늘의 가장 중요한 전환점은 이것이다.

```txt
기존:
사용자 질문 → 정규식/Scope Engine이 대충 잡음 → 고정 템플릿/그래프 반환

오늘 이후:
사용자 질문 → Query Compiler → AnalysisPlan → Executor → Narrative/Chart
```

즉, 단순히 “7월 질문을 고침”, “3~5월 질문을 고침”이 아니라,  
마케팅 채팅이 사용자의 자연어 질문을 **분석 계획서(AnalysisPlan)** 로 바꾸는 구조가 생겼다.

다만 아직 최종 분석 AI 수준은 아니다.  
현재는 아래 단계 중 **1~2단계 입구**를 만든 상태다.

```txt
1단계: Query Compiler
질문을 metric / period / comparison / chart intent로 변환

2단계: Analysis Executor
데이터 안에서 통계 계산

3단계: Chart Grammar
분석 결과에 맞는 올바른 그래프 선택

4단계: Factor Explorer
가능한 요인들을 데이터 안에서 교차 검토

5단계: Evidence-based Narrative
근거 있는 원인 후보와 한계를 분리해 설명

6단계: Strategy Generator
강점/약점/마케팅 기획/캠페인 제안

7단계: Agent Runtime Wiring
MKT-06, FIN-09 등 에이전트별 전문성/권한/툴/RAG 연결
```

---

## 1. 사용자 방향성 정리

사용자 의도는 명확하다.

### 1-1. 현재 원하는 것

지금은 Agent Studio 전체를 완성하려는 단계가 아니다.  
먼저 현재 Claude API 기반으로 연결된 각 팀 에이전트들이 **기본 분석 품질**을 보여줘야 한다.

```txt
현재 우선순위:
Claude 기반 팀 채팅이
질문을 잘 이해하고
데이터 안에서 계산 가능한 통계를 정확히 내고
필요한 그래프를 만들고
없는 데이터는 없다고 말하는 것
```

### 1-2. 나중에 원하는 것

Studio/Agent 설정은 나중에 각 AI 직원을 업그레이드하는 커스텀 레이어로 쓴다.

```txt
Studio의 장기 역할:
- 에이전트별 systemPrompt
- 역할/권한
- skills
- tools
- knowledge docs
- RAG
- 실행 권한
- 부서 협업
```

### 1-3. 최종 목표

과거 사용자가 만들었던 Claude API 기반 마케팅 분석 사이트처럼, 질문 하나에 20초~1분 걸리더라도 제대로 분석하는 구조를 원한다.

최종 목표는 단순 통계 읊기가 아니다.

```txt
최종 분석 흐름:
질문 이해
→ 필요한 데이터 판단
→ 통계 계산
→ 그래프 생성
→ 상품/카테고리/쿠폰/재구매/회원/기간 등 요인 대입
→ 근거 기반 원인 후보 도출
→ 추측 불가 영역 분리
→ 약점/강점 정리
→ 마케팅 기획/캠페인 제안
```

중요한 원칙:

```txt
데이터가 부족하지 않는 한,
연결된 데이터 안에서 어떤 조회라도 통계를 낼 줄 알아야 한다.

하지만 광고비/방문자/전환율처럼 연결되지 않은 데이터는
fake로 만들지 않고 제한사항으로 안내해야 한다.
```

---

## 2. 오늘 시작 전/중간 핵심 구조 진단

### 2-1. Agent Studio와 실제 채팅 runtime 연결 진단

확인된 파일:

```txt
src/data/agents.ts
src/services/aiBrainSettings.ts
src/services/departmentChatService.ts
src/components/DepartmentWorkspacePanel.tsx
```

확인 결과:

```txt
Agent Studio 설정 저장:
- src/data/agents.ts 정적 seed
- App.tsx state
- localStorage 영속

LLM brain 설정:
- godo_ai_agent_brains_v0
- godo_ai_global_brain_v0

resolveAgentBrain:
- provider/model만 반환
- systemPrompt/skills/tools/knowledge는 반환하지 않음
```

즉, 현재 Agent Studio는 대부분 UI/설정 레이어다.

### 2-2. 마케팅팀 채팅에서 실제 사용되는 것

```txt
TEAM_AGENT.marketing = 'marketing'
→ MKT-06 id를 brain 선택용으로만 사용

실제 프롬프트:
→ agents.ts의 MKT-06 systemPrompt가 아니라
→ departmentChatService.ts의 하드코딩 TEAM_PERSONA / planner prompt 사용
```

### 2-3. 미사용 상태

아래는 아직 실제 마케팅 채팅 runtime에 연결되지 않았다.

```txt
MKT-06 systemPrompt
MKT-06 skills
MKT-06 tools
MKT-06 knowledge docs
FIN-09 매출 분석 AI routing
Tool Registry 실행
Knowledge RAG
```

### 2-4. 결론

현재 우측 마케팅 채팅은 “Agent Studio의 MKT-06/FIN-09 채팅”이 아니라,  
**department-level pipeline** 이다.

따라서 오늘의 올바른 작업 순서는 다음이었다.

```txt
1. 먼저 현재 department chat이 질문을 제대로 이해하고 계산하게 한다.
2. 이후 Agent Studio/FIN-09/MKT-06 연결로 확장한다.
```

---

## 3. 오늘 완료된 작업 1
# Marketing Chat Analysis Routing & Intent Patch v0

## 3-1. 작업 정보

```txt
작업명: Marketing Chat Analysis Routing & Intent Patch v0
브랜치: fix/marketing-chat-analysis-routing-intent-v0
커밋: 30b1ce1
main merge HEAD: e23d8a4
기준 main HEAD: 48d120f
```

> 참고: 작업지시서에는 기준 HEAD가 1a00471로 적혀 있었으나, 그 사이 “행동 KPI 포인트컬러+세부정리” 커밋이 반영되어 기준 HEAD는 48d120f였다. 정상 흐름.

## 3-2. 해결한 문제

기존에는 사용자가 아래처럼 질문해도:

```txt
2024년 7월 객단가와 2025년 7월 객단가 비교
2024년 7월 매출과 2025년 7월 매출 비교
2024년 7월 주문수와 2025년 7월 주문수 비교
```

모두 같은 답변이 나왔다.

원인:

```txt
0순위 Scope Insight Engine이
2024 + 2025 두 연도만 보면
metric/month를 무시하고

year_compare
monthly
revenue
2024~2025 전체 기간

으로 고정한 뒤 handled=true로 종료했다.
```

따라서 후속 planner/LLM/agent pipeline이 생략되었다.

## 3-3. 주요 변경

생성/수정 파일:

```txt
신규:
src/services/marketingChatQueryRouting.ts

수정:
src/services/marketingScopeInsightEngine.ts
src/components/DepartmentWorkspacePanel.tsx

신규:
docs/MARKETING_CHAT_ANALYSIS_ROUTING_INTENT_PATCH_V0.md
scripts/smoke-marketing-chat-analysis-routing-intent-v0.mjs
```

구현 내용:

```txt
metric parsing:
- 객단가 → averageOrderValue
- 주문수 → orderCount
- 매출 → revenue

month/year parsing:
- 7월
- 2024년 7월
- 2025년 7월

month-year comparison:
- 연도 2개 + 동일 월 → 특정월 연도 비교

chart suppression:
- 그래프 보여주지 마
- 그래프 빼
- 텍스트로만
- 표만

auto-scroll:
- dept-chat-log ref 추가
- messages/sending 변경 시 scrollTop = scrollHeight
```

## 3-4. 수동/스모크 검증

신규 smoke 결과:

```txt
smoke-marketing-chat-analysis-routing-intent-v0.mjs
26/0 PASS
```

대표 런타임 값:

```txt
Q1 AOV:
2024년 7월 54,500원
2025년 7월 72,500원

Q2 revenue:
2024년 7월 545,000원
2025년 7월 435,000원

Q3 orderCount:
2024년 7월 10건
2025년 7월 6건
```

관련 smoke:

```txt
scope-insight 32/0
planner 32/0
llm-adapter 31/0
chartspec-bridge 37/0
runtime-conn 32/0
dashboard 30/0
facts-core 34/0
gateway 24/0
```

검증 명령:

```txt
npm run lint ✅
npx tsc -b ✅
npm run build ✅
route count 9 유지 ✅
```

## 3-5. 불변식

변경하지 않음:

```txt
synthetic 생성
department source/contract
marketingAnalysisFacts 계산
Vercel gateway
customer behavior tracking
GodoMall WRITE
Agent Studio full wiring
Tool execution
RAG
raw event 노출
```

---

## 4. 오늘 완료된 작업 2
# Marketing Analysis Query Compiler v0

## 4-1. 작업 정보

```txt
작업명: Marketing Analysis Query Compiler v0
브랜치: feature/marketing-analysis-query-compiler-v0
커밋: c6d6a00
main merge HEAD: 9d739ae
기준 HEAD: e23d8a4
```

## 4-2. 작업 배경

Routing & Intent Patch 이후 7월 단일 비교는 해결되었지만, 사용자가 질문을 조금만 바꾸면 다시 무너졌다.

대표 실패:

```txt
2024년 3~5월 주문수와 2025년 3~5월 주문수 비교해줘
```

기존 결과:

```txt
2024년 5월 vs 2025년 5월 주문수 비교
```

정상 해석:

```txt
2024년 3~5월 주문수 합계
vs
2025년 3~5월 주문수 합계
```

즉, 문제는 “3~5월 파싱 하나”가 아니라  
**질문을 분석 계획으로 바꾸는 공통 구조가 없는 것**이었다.

## 4-3. 추가된 구조

새 핵심 구조:

```txt
사용자 질문
→ compileMarketingAnalysisQuery
→ MarketingAnalysisPlan
→ executeMarketingAnalysisPlan
→ MarketingAnalysisResult
→ deterministic narrative / chartSpec
```

생성/수정 파일:

```txt
src/services/marketingAnalysisQueryCompiler.ts
src/services/marketingAnalysisExecutor.ts
src/services/marketingAnalysisNarrative.ts

docs/MARKETING_ANALYSIS_QUERY_COMPILER_V0.md
scripts/smoke-marketing-analysis-query-compiler-v0.mjs
```

## 4-4. AnalysisPlan 개념

공통 분석 계획에는 다음 정보가 들어간다.

```txt
intent
metric
period
comparison
aggregation
dimension
chart
answerScope
confidence
unsupportedReason
originalQuestion
```

이를 통해 더 이상 질문 하나마다 Scope Engine에 if문을 계속 추가하는 방식이 아니라,  
모든 마케팅 분석 질문을 Plan으로 변환하는 구조로 이동했다.

## 4-5. 지원하는 해석

### Metric

```txt
매출 → revenue
주문수 → orderCount
객단가/AOV → averageOrderValue
판매량/수량 → quantity
재구매율 → repeatPurchaseRate
쿠폰 사용/미사용 → coupon segment
첫구매/재구매 → firstRepeat segment
```

### Period

```txt
7월
2024년 7월
2025년 07월
2024-07
3~5월
3월~5월
3월부터 5월까지
2024년 3~5월
1분기
2분기
상반기
하반기
올해
작년
이번달
지난달
```

### Comparison

```txt
2024년 7월 vs 2025년 7월
2024년 3~5월 vs 2025년 3~5월
2024년과 2025년 월별 매출 비교
2024년과 2025년 월별 주문수 비교
2024년과 2025년 월별 객단가 비교
쿠폰 사용 vs 미사용
첫구매 vs 재구매
```

## 4-6. 중요한 계산 원칙

### 월 범위 주문수/매출

```txt
3~5월 질문은 5월 단일이 아니라 3월+4월+5월 합산
```

### 객단가

월 범위 객단가는 월별 객단가의 단순 평균이 아니다.

```txt
기간 전체 운영매출 합계 ÷ 기간 전체 운영주문수 합계
```

즉 weighted AOV다.

### 매출 기준

```txt
canonical net valid-order metric 사용
gross product line revenue 사용 금지
```

### unsupported

연결되지 않은 데이터가 필요한 질문은 fake를 만들지 않는다.

예:

```txt
ROAS
방문자 수
전환율
장바구니
광고비
```

이런 질문은 unsupported로 안내한다.

## 4-7. 수동 검수 결과

보고된 deterministic 런타임 검증:

```txt
1. 2024년 3~5월 주문수 vs 2025년 3~5월 주문수
   → 합산
   → 2024 = 8건, 2025 = 3건

2. 2024년 3~5월 객단가 vs 2025년 3~5월 객단가
   → weighted
   → 2024 = 87,500원, 2025 = 120,000원

3. 2024년과 2025년 월별 객단가 비교
   → monthlyTrend
   → 12개월
   → metric honoring

4. 그래프 없이 3~5월 매출 비교
   → suppress
   → 합산 텍스트

5. 쿠폰 사용/미사용 객단가
   → segmentCompare

6. ROAS
   → unsupported
   → chart 없음
   → fake 금지
```

## 4-8. 검증

```txt
npm run lint ✅
npx tsc -b ✅
npm run build ✅
route count ≤ 12 ✅

신규 smoke:
smoke-marketing-analysis-query-compiler-v0.mjs
30/0 PASS
```

관련 smoke:

```txt
scope-insight 32/0
parity 24/0
planner 32/0
chartspec-bridge 37/0
dashboard 30/0
routing-intent 26/0
facts-core green
```

## 4-9. 불변식

변경 없음:

```txt
synthetic 생성
department source/contract
marketingAnalysisFacts 계산
gross line revenue 사용
Vercel gateway
customer tracking
GodoMall WRITE
Agent Studio full wiring
Tool execution
RAG
raw event 노출
```

---

## 5. 오늘 확인된 새 문제
# Chart Grammar / Compact Renderer 문제

Query Compiler 이후 질문 이해와 계산은 많이 좋아졌다.  
하지만 이제 새 병목은 **그래프 선택/렌더링 문법**이다.

## 5-1. 확인된 문제 1: compactBars hover 카드/깜빡임

사용자가 테스트한 질문:

```txt
2024년 1월부터 7월까지의 주문수와 2025년 같은 기간의 주문수를 그래프와 같이 비교해줘
```

결과:

```txt
2024년 1~7월 주문수: 364건
2025년 1~7월 주문수: 408건
차이: 44건 (+12.1%)
```

질문 이해/계산은 정상.

하지만 그래프에 마우스를 올리면:

```txt
- 주문수 아래
- 막대 사이
- 별 필요 없는 hover 카드/tooltip이 뜸
- 깜빡임 발생
```

판단:

```txt
compact 비교 차트에는 hover 카드가 필요 없다.
이미 막대 옆에 값이 표시된다.
tooltip은 오히려 방해 요소다.
```

## 5-2. 확인된 문제 2: 쿠폰 사용/미사용 객단가 차트 선택 문제

사용자 질문:

```txt
쿠폰 사용 고객과 미사용 고객의 객단가를 비교해줘.
```

분석 결과:

```txt
쿠폰 미사용 객단가: 75,752원 (주문 1,003건)
쿠폰 사용 객단가: 67,808원 (주문 179건)
차이: 7,944원 (-10.5%)
```

질문 이해/계산은 정상.

하지만 그래프 표현이 부적절했다.

판단:

```txt
객단가는 part-to-whole이 아니다.
따라서 도넛/파이 차트는 부적절하다.
쿠폰 사용/미사용 객단가 비교는 막대 2개가 정답이다.
```

## 5-3. 현재 단계 판단

```txt
이전 병목:
질문 이해/계산

현재 병목:
Chart Grammar
```

즉, 다음 작업은 **Marketing Chart Grammar & Compact Renderer Fix v0** 이다.

---

## 6. 현재 지시된 다음 작업
# Marketing Chart Grammar & Compact Renderer Fix v0

> 이 작업은 지시서까지 작성됨. 완료보고서는 아직 받지 않음.  
> 사용자는 “오늘은 여기까지 하자”고 했으므로, 내일 완료보고서를 받거나 이 작업부터 이어가면 된다.

## 6-1. 작업명

```txt
Marketing Chart Grammar & Compact Renderer Fix v0
```

## 6-2. 예상 브랜치

```txt
fix/marketing-chart-grammar-compact-renderer-v0
```

## 6-3. 현재 기준 HEAD

```txt
9d739ae
```

## 6-4. 작업 목적

```txt
Query Compiler와 Executor는 유지.
AnalysisPlan/Result를 보고 적절한 chart type을 선택하는 Chart Grammar를 만든다.
compact comparison chart의 hover/tooltip/여백 UX를 수정한다.
```

## 6-5. 반드시 지킬 것

```txt
Query Compiler 대규모 변경 금지
Executor 계산 기준 변경 금지
synthetic data 변경 금지
department source/contract 변경 금지
Vercel gateway 변경 금지
GodoMall WRITE 금지
Tool Registry/RAG/Agent Studio wiring 금지
```

## 6-6. 차트 선택 규칙

### compactBars 사용

```txt
비교 대상 2~4개 이하
metric = revenue / orderCount / averageOrderValue / quantity

예:
- 2024년 1~7월 vs 2025년 1~7월 주문수
- 2024년 3~5월 vs 2025년 3~5월 객단가
- 쿠폰 사용/미사용 객단가
- 첫구매/재구매 객단가
```

### groupedBars 또는 line 사용

```txt
월별 비교
1~12월 흐름
주차별/일별 추세
time dimension이 있고 x축 순서가 의미 있는 경우
```

### rankedBars 사용

```txt
TOP 상품
TOP 카테고리
TOP 회원그룹
5개 이상 ranking
```

### donut/pie 사용

오직 “비중/share/구성비”일 때만 허용.

허용:

```txt
카테고리별 매출 비중
회원그룹별 주문 비중
채널별 매출 비중
쿠폰 사용/미사용 주문 비중
```

금지:

```txt
객단가 비교
매출 금액 비교
주문수 비교
2개 기간 비교
연도 비교
```

핵심 문장:

```txt
AOV/객단가는 절대 도넛으로 표현하지 않는다.
AOV는 part-to-whole이 아니다.
```

## 6-7. compactBars 렌더링 수정 목표

```txt
rows <= 4이면 compact layout
height 작게
상단 padding 축소
bar 영역 중앙 배치
tooltip/hover card 비활성화 또는 simplified
마우스 오버 시 깜빡임 제거
```

성공 기준:

```txt
막대 사이에 별도 카드가 뜨지 않는다.
마우스 오버해도 깜빡이지 않는다.
2개 막대 비교 차트의 위쪽 빈 여백이 줄어든다.
```

## 6-8. 수동 검수 질문

작업 후 확인할 질문:

```txt
1. 2024년 1월부터 7월까지의 주문수와 2025년 같은 기간의 주문수를 그래프와 같이 비교해줘.

2. 쿠폰 사용 고객과 미사용 고객의 객단가를 비교해줘.

3. 2024년과 2025년 월별 객단가 비교해줘.

4. 카테고리별 매출 비중 보여줘.

5. 그래프 없이 쿠폰 사용 고객과 미사용 고객의 객단가만 비교해줘.

6. ROAS 비교해줘.
```

기대:

```txt
1번:
compactBars
hover card 없음
깜빡임 없음
큰 상단 여백 없음

2번:
compactBars 또는 horizontal bars 2개
도넛/파이 아님

3번:
12개월 월별 chart
compactBars 아님

4번:
비중 질문이므로 donut/pie 허용

5번:
chart 없음

6번:
unsupported
chart 없음
fake 광고비 없음
```

---

## 7. 오늘 전체 HEAD 흐름

오늘 확인된 주요 HEAD/commit 흐름:

```txt
48d120f
- Marketing Chat Analysis Routing & Intent Patch v0 작업 전 기준
- 1a00471 이후 행동 KPI 포인트컬러+세부정리 반영 상태

30b1ce1
- fix/marketing-chat-analysis-routing-intent-v0 commit

e23d8a4
- Marketing Chat Analysis Routing & Intent Patch v0 main merge HEAD

c6d6a00
- feature/marketing-analysis-query-compiler-v0 commit

9d739ae
- Marketing Analysis Query Compiler v0 main merge HEAD
- 현재 문서 작성 기준 최신 main HEAD
```

---

## 8. 현재 완료 상태 요약

### 완료됨

```txt
마케팅 채팅 단일월 metric 비교
마케팅 채팅 월범위/분기/반기/상대기간 Query Compiler
AnalysisPlan 구조
Analysis Executor 구조
Weighted AOV 계산
Unsupported 처리
Chart suppression
Narrow narrative
Auto-scroll
Compact chart 일부 레이아웃 축소
관련 docs/smoke
```

### 부분 완료/검수 필요

```txt
Chart Grammar
compactBars hover/tooltip
쿠폰 사용/미사용 객단가 그래프
도넛/파이 사용 기준
```

### 아직 미진행

```txt
Marketing Agent Runtime Wiring v0
MKT-06 systemPrompt 주입
FIN-09 매출/정산 질문 라우팅
Agent Studio knowledge 요약 주입
Tool Registry 실제 실행
Knowledge RAG
Factor Explorer
원인 후보 자동 탐색
강점/약점/기획 제안
고급 Claude 분석 루프
```

---

## 9. 내일 바로 이어갈 순서

내일 새 창에서 할 일:

### 1단계: 이 파일 읽기

새 채팅창에서 이 MD 파일을 먼저 읽힌다.

### 2단계: Chart Grammar 완료보고서 확인

Claude Code에서 `Marketing Chart Grammar & Compact Renderer Fix v0` 완료보고서가 왔으면 붙여넣는다.

확인할 것:

```txt
브랜치
커밋
main merge HEAD
수정 파일
Chart Grammar selector
compactBars tooltip disabled 여부
coupon AOV compare chart type
donut/pie rule
smoke 결과
불변식
```

### 3단계: 수동 검수

아래 질문을 실제 UI에서 테스트한다.

```txt
2024년 1월부터 7월까지의 주문수와 2025년 같은 기간의 주문수를 그래프와 같이 비교해줘.

쿠폰 사용 고객과 미사용 고객의 객단가를 비교해줘.

2024년과 2025년 월별 객단가 비교해줘.

카테고리별 매출 비중 보여줘.

그래프 없이 쿠폰 사용 고객과 미사용 고객의 객단가만 비교해줘.

ROAS 비교해줘.
```

### 4단계: Chart Grammar 검수 통과 시 다음 큰 작업

다음 큰 작업 후보:

```txt
Marketing Agent Runtime Wiring v0
```

범위는 작게 시작한다.

```txt
1. MKT-06 systemPrompt를 마케팅 기획/캠페인 질문에 주입
2. FIN-09를 매출/정산/통계 질문에 라우팅
3. skills/tools/knowledge는 우선 context summary 수준으로만 주입
4. 실제 Tool 실행/RAG는 아직 보류
```

---

## 10. 다음 큰 작업 후보
# Marketing Agent Runtime Wiring v0

아직 작업지시서 작성 전.  
Chart Grammar 검수 후 진행 권장.

## 10-1. 목적

현재는 Agent Studio 설정이 실제 chat runtime에 거의 연결되어 있지 않다.  
다음 단계에서는 Claude 기반 기본 분석 구조 위에 에이전트 개성을 얹는다.

## 10-2. 범위

처음부터 Tool 실행/RAG까지 가지 않는다.

1차 범위:

```txt
MKT-06:
- systemPrompt 주입
- role 주입
- skills 요약 주입
- marketing campaign/planning 질문 라우팅

FIN-09:
- 매출/주문/객단가/정산/통계 질문 라우팅
- sales analysis prompt 주입

공통:
- Query Compiler/AnalysisResult를 LLM context로 전달
- Claude는 숫자 생성 금지
- Claude는 해석/제안 담당
```

## 10-3. 제외

```txt
Tool Registry 실제 실행
Coupon Controller 실제 실행
GodoMall WRITE
Knowledge RAG
멀티에이전트 협업 오케스트레이션
```

---

## 11. 중요한 설계 원칙

### 11-1. 숫자는 코드가 계산한다

```txt
LLM이 매출/주문수/객단가를 직접 계산하거나 만들어내면 안 된다.
```

### 11-2. LLM은 해석한다

```txt
LLM 역할:
- 계산 결과 요약
- 변화 해석
- 가능한 원인 후보 정리
- 데이터 한계 표시
- 다음 확인 항목 제안
- 마케팅 기획 제안
```

### 11-3. 없는 데이터는 없다고 말한다

```txt
광고비
방문자
전환율
장바구니
ROAS
GA4/GTM/ad platform data

연결되지 않은 값은 fake 금지.
```

### 11-4. 구조가 좋아지면 모델 차이는 줄어든다

정리된 결론:

```txt
계산·조회·통계·그래프 생성:
구조가 90% 이상 결정

해석·원인 후보 탐색·전략 제안:
LLM 모델 차이가 여전히 큼
```

즉:

```txt
Claude든 Gemma든 Gemini든
Query Compiler + Executor + Chart Grammar가 튼튼하면 기본 분석 품질은 유지된다.

하지만 고급 원인 분석/전략 제안은 좋은 모델일수록 차이가 난다.
```

---

## 12. 앞으로의 장기 분석 구조

최종 목표는 아래 구조다.

```txt
사용자 질문
→ Query Compiler
→ AnalysisPlan
→ Data Availability Check
→ Executor
→ Chart Grammar
→ Factor Explorer
→ Evidence Pack
→ LLM Narrative
→ Strategy Proposal
→ Approval/Action Draft
```

### Factor Explorer 예시

```txt
주문수 증가 + 객단가 하락
→ 상품 mix 변화 확인
→ 쿠폰 사용 비중 확인
→ 재구매/첫구매 비중 확인
→ 회원그룹 변화 확인
→ 카테고리별 매출 변화 확인
→ 기간별 이벤트/프로모션 존재 확인
→ 광고비/방문자는 미연결이면 제한사항으로 표시
```

### Evidence Pack

```txt
확인된 사실
가능한 원인 후보
반박 근거
추가 데이터 필요 항목
추정 불가 항목
```

### Strategy Proposal

```txt
강점
약점
캠페인 후보
쿠폰 조건
상품 추천
타겟 세그먼트
실행 전 확인사항
```

---

## 13. 오늘의 전체 판단

오늘은 힘든 구조 작업이 많았다.  
특히 중요한 변화는 다음이다.

```txt
마케팅 채팅이
단순 고정 템플릿에서
분석 계획 기반 구조로 넘어가기 시작했다.
```

아직 분석 텍스트 품질은 초보적이다.  
지금은 “통계를 읊는 수준”에 가깝다.

하지만 오늘 생긴 `AnalysisPlan / Executor / Narrative` 구조는 이후 고급 분석으로 가기 위한 기반이다.

내일은 먼저 Chart Grammar를 정리하고,  
그다음 MKT-06/FIN-09 runtime wiring으로 넘어가는 것이 가장 안전하다.

---

## 14. 내일 새 창 첫 메시지 추천

새 채팅에서 이렇게 시작하면 된다.

```txt
이 MD 파일을 읽고 GODO AI OS 작업을 이어가자.
현재 main HEAD는 9d739ae 기준이고,
오늘 마지막으로 Marketing Analysis Query Compiler v0까지 완료했다.
다음은 Marketing Chart Grammar & Compact Renderer Fix v0 완료보고서 검토 또는 수동 검수부터 이어가면 된다.
```

---

## 15. 빠른 요약

```txt
현재 최신 main HEAD:
9d739ae

오늘 완료:
1. Marketing Chat Analysis Routing & Intent Patch v0
2. Marketing Analysis Query Compiler v0

오늘 확인된 남은 문제:
Chart Grammar / compactBars tooltip / coupon AOV chart

다음 작업:
Marketing Chart Grammar & Compact Renderer Fix v0

그 다음:
Marketing Agent Runtime Wiring v0

절대 건드리지 말 것:
synthetic data
department source/contract
Vercel gateway
customer tracking
GodoMall WRITE
Tool execution
RAG
Agent Studio full wiring
fake ROAS/광고비/방문자
```
