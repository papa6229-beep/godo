# Department Chat Answer Engine Rebuild v0

> 작성 2026-07-02 · 브랜치 `feature/department-chat-answer-engine-rebuild-v0`
> 성격: 채팅 "답변 만드는 로직"을 **단일 Commerce Data Query Engine**으로 재건축. 대시보드·데이터·KPI·synthetic은 보존.

## 왜
채팅 데이터 질문이 5~6개 엔진(scopeInsight/compiler/bridge/facts/planner) 사다리를 타다가, 미스 나면 **broad 종합덤프**로 떨어져 질문 초점을 무시한 리포트나 "데이터 없다"는 거짓말을 뱉었다. 데이터는 다 있는데(주문·상품·고객), 오픈북에서 못 읽어오는 꼴. → 케이스 패치를 멈추고 **읽고·필터·묶고·계산, 없으면 없다** 하는 엔진 하나로 재건축.

## 구조 (이해=LLM · 계산=코드 · 설명=narrative · 검증=코드)
```
질문 → understandCommerceQuery(LLM→AnalyticsQuery, 실패/키없음 시 deterministic; 열린질문/신호없음 → null)
     → executeCommerceDataQuery: 기간·조건 필터 → 차원별 묶기 → 지표 집계 → 모양 → reply + chart
```
전 팀 채팅(product/marketing/cs/hq)이 `answerCommerceQuestion` **하나**를 공유. 데이터 질문은 여기서 끝(broad 덤프로 안 샘). 열린 질문(왜/전략)만 기존 분석 경로.

## 엔진 능력 (v0)
- dimension: time(월) · product · category · coupon · firstRepeat · memberGroup · channel · none
- metric: revenue(net) · orderCount · averageOrderValue · quantity (숫자는 코드 계산, LLM 금지)
- operation: summarize · trend · argmax · argmin · **extremes(최고+최저 2개)** · rank · share · compare(연도)
- filters: 기간 + coupon/firstRepeat/memberGroup/channel/category/goods (2~3 조건 엮기)
- 차트: time→세로(combo line+bar) · extremes→2막대 · rank/share/product/category→막대(항목당1) · 억제 시 없음
- 다연도 통틀어 최고/최저(월 라벨에 연도 표기), 월범위(1~5월) 보존, "없으면 없다"

## 신규 파일
- `src/services/commerceDataQueryEngine.ts` — 단일 엔진(executeCommerceDataQuery + answerCommerceQuestion).
- `src/services/marketingAnalyticsQueryCompilerLlm.ts` — understandCommerceQuery(LLM 이해+검증+deterministic fallback; extremes/filters/notData) 추가.
- `scripts/smoke-commerce-data-query-engine-v0.mjs` — 18/0.

## 수정
- `analyticsQueryTypes.ts` — aggregation `extremes` + `AnalyticsFilters`.
- `analyticsQueryParser.ts` — extremes(최고+최저 동시) 감지, 시간축/argmax 일반화.
- `DepartmentWorkspacePanel.tsx` — **전 팀 엔진-우선**(CS 초안만 먼저). 마케팅 bridge 블록 제거. 엔진 차트: 마케팅=중앙, 그 외=채팅 열(`MarketingChartSpecPanel` export 재사용).

## 삭제(엔진으로 대체)
- `marketingAnalyticsQueryBridge.ts`, `marketingTimeMetricExecutor.ts`, `analyticsQueryToMarketingPlan.ts`, `smoke-marketing-analytics-query-bridge-v0.mjs`.

## 보존(안 건드림)
대시보드 UI·KPI·그래프 컴포넌트·synthetic·데이터 로딩·revenueMetricContract/productSalesAggregation primitive·CS 초안/승인 흐름·productTeamChatFacts(열린 질문 fallback).

## 검증
- lint ✅ · tsc -b ✅ · build ✅ · route 9(≤12)
- **engine smoke 18/0**: extremes(2024·2025 통틀어 최고 2024-12/최저 2025-12, 2막대, 덤프없음) · argmax/argmin 단일연도 · trend(세로 12점) · **없으면 "데이터 없습니다"(거짓말/전체합 아님)** · ROAS unsupported · 열린질문(왜/전략) null · product rank · category share(표시명·% ) · filter(VIP) · 다연도 1~5월 보존.
- 회귀 green: analytics-layer 38 · mkt-dashboard 30 · source-of-truth 23 · dept-chat-wiring 16 · product catalog 14/grounding 13 · scope 32 · compiler 30 · chart-grammar 23 · renderer-parity 24 · parity 19.

## 불변식
숫자=코드 계산 · synthetic/canonical KPI 불변 · 없는 데이터 fake 금지 · broad 덤프 없음(데이터 질문) · WRITE/Tool/RAG/Agent Studio 미변경 · route 추가 없음.

## 수동 검수(실화면, Claude 키 연결)
1. "2024·2025 통틀어 매출 최고/최저 달 비교" → 딱 2개 달 + 차이 + 2막대(덤프 없음).
2. 상품팀 "2024년 월별 매출" / "가장 높은 달" → 거짓말("데이터 없다") 없이 정확.
3. "2025년 월별 매출 추이" → 세로 12개월.
4. "쿠폰 쓴 VIP의 3월 매출"(키 연결 시 LLM이 filters) → 조건 반영.
5. "왜 3월 떨어졌어?" → 엔진 미처리 → 기존 분석 경로.

## 참고
- 렌더러는 직전 라운드 Playwright로 검증된 rankedBar/combo/groupedBar 컴포넌트 재사용(dev는 API 데이터 미로딩이라 실앱 자동캡처 불가 — 계산·구조는 smoke로 검증).
- 다음: 실화면 검수 → CS/총괄 세부 질문 유형 확장, product 팀 중앙 차트 패널(선택).
