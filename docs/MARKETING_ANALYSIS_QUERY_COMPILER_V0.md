# Marketing Analysis Query Compiler v0

> **핵심 문장**: "마케팅 채팅은 사용자 질문을 곧바로 고정 템플릿에 매핑하지 않고, 먼저 AnalysisPlan으로 컴파일한 뒤 실행한다."

컴파일러: [`marketingAnalysisQueryCompiler.ts`](../src/services/marketingAnalysisQueryCompiler.ts) · 실행: [`marketingAnalysisExecutor.ts`](../src/services/marketingAnalysisExecutor.ts) · 서술: [`marketingAnalysisNarrative.ts`](../src/services/marketingAnalysisNarrative.ts)

## 1. 왜 단건 패치가 반복 문제였나

이전(Routing & Intent Patch v0)은 "단일 월 연도 비교"만 regex로 처리했다. 조금만 변형하면 다시 깨졌다:
- "2024년 3~5월 주문수 vs 2025년 3~5월" → **5월 단일로 오인**(범위 합산 못 함).
- "1분기 / 상반기 / 지난달" → 미처리 → broad로 샘.
- 매번 if문을 늘리면 분기/반기/세그먼트/상대기간에서 같은 문제가 무한 반복.

→ 질문을 **공통 중간 산출물(AnalysisPlan)** 로 컴파일하는 단계가 없던 것이 근본 원인.

## 2. 구조: 질문 → AnalysisPlan → Result → Narrative

```
질문 → compileMarketingAnalysisQuery → AnalysisPlan
     → executeMarketingAnalysisPlan(plan, orders) → MarketingAnalysisResult(숫자 계산)
     → buildMarketingAnalysisNarrative(result) → 답변 텍스트
     → artifact(chartSpec) → 대시보드 차트
```

- **컴파일러**: 무엇을 계산할지 결정(intent/metric/period/comparison/aggregation/chart/confidence/unsupported).
- **실행기**: canonical 운영 지표(net 유효 주문 `isValidOrder`)로 **숫자를 계산**. LLM은 숫자를 만들지 않는다.
- **서술기**: deterministic 답변(LLM 미연결에도 동작). 좁은 질문은 좁게.

## 3. AnalysisPlan 구조

`intent`(compare/summarize/rank/trend/explain/unsupported) · `metric`(revenue/orderCount/averageOrderValue/quantity) · `period`(singleMonth/monthRange/year/quarter/halfYear/relative) · `comparison`(yearOverYear/monthlyTrend/segmentCompare) · `aggregation`(sum/ratio/trend) · `chart`(requested/suppressed/type) · `answerScope`(narrow/broad) · `confidence` · `unsupportedReason`.

## 4. 핵심 해석 규칙

- **월 범위는 합산**: "3~5월 주문수"는 3·4·5월 합계(5월 단일 아님). "3~5월", "3월~5월", "3월부터 5월까지" 모두 인식.
- **객단가는 weighted**: 기간 전체 매출 ÷ 기간 전체 주문수(월별 객단가의 단순 평균 아님).
- **canonical 매출**: gross 상품 라인합 금지, net 유효 주문(결제완료·미취소) 기준.
- **모르는 질문은 broad year_compare로 강제하지 않음**: unsupported → 지원 범위 안내 + 차트 제거.

## 5. Executor — 계산

`executeMarketingAnalysisPlan(plan, orders, nowMs)` → `MarketingAnalysisResult{ rows, diff, chartSpec, ... }`. 기간을 구체 연-월 구간으로 resolve 후 net 집계. department source of truth의 net 기준과 일관(`revenueMetricContract.isValidOrder` 재사용).

## 6. Narrative — 답변

`MarketingAnalysisResult` 기반 deterministic 답변. narrow 질문은 broad 카테고리/상품/쿠폰/채널 관찰을 붙이지 않는다. caveat은 짧게(외부 데이터 없어 원인 단정 제한).

## 7. Claude 사용 원칙

- 코드가 AnalysisPlan/Result를 만든다. **Claude는 숫자를 만들지 않는다**.
- Claude 연결 시 result를 받아 해석/제안 문장을 개선할 수 있으나, 미연결에도 deterministic narrative로 기본 분석은 동작한다(현재 구현은 deterministic).

## 8. 지원하는 질문 범위

- 단일 월 / 월 범위 / 분기 / 상반기·하반기 / 단일 연도 / 상대기간(올해·작년·이번달·지난달)
- 연도 비교(동일 기간) / 월별(12개월) 연도 비교
- 세그먼트 비교(쿠폰 사용·미사용 / 첫구매·재구매 / 회원그룹 / 주문채널)
- metric: 매출 / 주문수 / 객단가 / 판매수량
- **unsupported**: ROAS·방문·전환·장바구니 등 외부 데이터 필요 → 명확히 안내(fake 생성 금지)

## 9. 기존 구조와의 관계

- `marketingScopeInsightEngine.buildMarketingScopeInsightResponse`가 앞단에서 컴파일러(`buildMarketingAnalysisResponse`)를 호출. 저신뢰 broad 질문만 기존 broad scope 분석으로 위임(기존 동작 보존).
- 이전 `marketingChatQueryRouting`은 그대로 둠(독립 동작). 컴파일러가 그 기능을 일반화해 대체.

## 10. 향후 Agent Runtime Wiring과의 관계

이번 작업은 **Studio full wiring이 아니다**. MKT-06/FIN-09 systemPrompt/skills/tools/knowledge 연결, Tool 실행, Knowledge RAG는 다음 작업(Marketing Agent Runtime Wiring v0). 단, AnalysisPlan/Result는 그때 LLM 해석 레이어가 붙을 수 있는 구조로 만들어졌다.
