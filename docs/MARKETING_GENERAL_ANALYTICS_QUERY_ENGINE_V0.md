# Marketing General Analytics Query Engine v0 (Stage 1)

> 작성 2026-07-02 · 기준 HEAD `5723995` · 브랜치 `feature/marketing-general-analytics-query-engine-v0`
> 핵심 전환: **이해=LLM · 계산=코드 · 설명=LLM · 검증=코드.** regex로 NLU를 하던 구조를 끝내고, 질문 이해를 Claude에 위임(숫자는 코드가 계산).

## 문제
"2025년 중 가장 객단가가 높았던 달?" 같은 **time×metric×argmax** 질문이 bridge에서 구조화 안 되면 broad scope로 떨어져 **질문 포커스를 무시한 종합 리포트 덤프**를 반환. regex가 표현을 못 따라감("가장 많이"는 잡고 "가장 높은"은 못 잡음).

## 구조 (오픈북)
```
질문 → [이해: LLM] understandMarketingQuery → AnalyticsQuery(JSON)
        → [검증: 코드] validateAnalyticsQueryJson (enum·스키마·숫자결과 reject·unsupported)
        → 실패 시 [fallback] deterministic parseAnalyticsQuery
     → [계산: 코드] executeMarketingTimeMetric (canonical net · weighted AOV 재사용)
     → [설명] narrative + chart artifact
```
LLM은 "무엇을 계산할지"(질의 스펙)만 만든다. 숫자는 절대 만들지 않는다(검증기가 value/result/total 등 계산결과 키를 reject).

## Stage 1 범위: time × metric × {trend, argmax, argmin}
- metric: revenue / orderCount / averageOrderValue / quantity (net·weighted AOV)
- time: year / month / monthRange / quarter / halfYear / 월별 / "어느 달·몇 월·언제·최고·최저·제일 높은/낮은·피크·제일 쎈"
- op: trend(월별 추이) · argmax(최고 달) · argmin(최저 달)

## 신규 파일
- `src/services/marketingAnalyticsQueryCompilerLlm.ts` — LLM 질의 컴파일러(프롬프트+data catalog+few-shot) + `validateAnalyticsQueryJson`(검증) + `understandMarketingQuery`(LLM 우선, deterministic fallback).
- `src/services/marketingTimeMetricExecutor.ts` — time×metric 일반 실행기. 기존 `marketingAnalysisExecutor`(monthlyTrend, net) 재사용. argmax/argmin은 "주문 있는 달"에서 극값 선택. 월 bucketKey 2자리 패딩(1→12 정렬 보존).
- `docs/MARKETING_GENERAL_ANALYTICS_QUERY_ENGINE_V0.md`.

## 수정 파일
- `src/services/analyticsQueryTypes.ts` — aggregation에 `argmax`/`argmin` 추가.
- `src/services/analyticsQueryParser.ts` — deterministic fallback 일반화: 시간축 인식(월/달/몇월/어느달/월별/분기/추이), argmax/argmin("가장 …높/낮·최고·최저·피크·제일 쎈", 지표어가 사이에 껴도 인식), rank→시간이면 상품으로 강제하지 않음.
- `src/services/marketingAnalyticsQueryBridge.ts` — **async** + `understandMarketingQuery`(이해=LLM) + `callLlm` 파라미터. time×metric×{trend,argmax,argmin} 일반 라우팅(구조화 질문 broad 미유출). product rank / category share / unsupported 유지.
- `src/components/DepartmentWorkspacePanel.tsx` — `await runMarketingAnalyticsQueryBridge({..., callLlm: callMarketingPlannerLlm})`.

## 안전장치 (숫자는 코드)
- LLM 출력은 AnalyticsQuery enum만 허용, 계산결과 키(value/result/total/revenue/…) 포함 시 reject.
- unsupported catalog(방문자/광고비/노출/전환율/장바구니/ROAS) — 메시지 매칭 시 강제 unsupported(fake 없음).
- LLM 미연결(키 없음)/파싱 실패/검증 실패 → deterministic 파서 fallback. 키 없는 dev/smoke에서도 동작.

## 검증
- lint ✅ · tsc -b ✅ · build ✅ · route 9 (≤12)
- **신규/보강 smoke 47/0** (`smoke-marketing-analytics-query-bridge-v0.mjs`):
  - LLM compiler 검증: 숫자결과키 reject · enum reject · 정상 채택 · ROAS 강제 unsupported.
  - understand: deterministic fallback / LLM(mock) 채택 / LLM 숫자결과 reject 후 fallback.
  - time×metric: T1 객단가 최고 달=2월(종합덤프 아님) · T2 "제일 쎈"·T3 "AOV 피크" 변형→2월 · T4 매출 최고=1월 · T5 주문수 최저(활성월)=2월 · T6 객단가 최저=3월 · T7 월별 추이 12개월 + bucketKey 01→12 정렬.
  - broad 미유출: time×metric은 handled(널 아님), 세그먼트/단일월/비월별은 기존 경로(null).
  - 기존: product rank / category share(%) / unsupported / monthRange / suppress 유지.
- **회귀 green**: mkt-compiler 30 · scope 32 · chart-grammar 23 · facts-core 34 · dashboard 30 · chartspec-runtime 32 · chartspec-bridge 37 · chart-renderer-parity 24 · analytics-query-layer 40 · product catalog 14 / grounding 13 · dept-chat-wiring 16.
- **실제 렌더(Playwright computed-style)**: 단일연도 월별 groupedBar 막대 fillW 232/422/46, height 10, teal, **월 순서 1→2→3 정상**. (rankedBar/percent는 직전 라운드 검증.)

## 수동 검수 (실화면, Claude 키 연결)
1. 2025년 중 가장 객단가가 높았던 달은? → 최고 달 먼저 답변(덤프 아님) + 월별 차트.
2. 2025년 중 객단가 제일 쎈 달 언제? / AOV 피크였던 월? → 같은 결과(표현 변형 이해).
3. 2025년 중 매출 가장 높은 달 / 주문수 가장 낮은 달 → 해당 월.
4. 2025년 월별 객단가 추이 그래프 → 1~12월 순서 정상.
5. 2024·2025년 1~5월 월별 객단가 비교 → 1~5월만, weighted AOV.
6. ROAS 비교 → unsupported + 대체 분석 제안.

## 불변식
숫자는 코드 계산(LLM은 질의 구조화·설명만) · canonical KPI/AOV=revenue/orderCount 유지 · synthetic 불변 · Tool/RAG/Agent Studio/WRITE 미변경 · route 추가 없음 · 기존 정상 질문 회귀 없음.

## 다음 단계 (Stage 2+)
- segment(쿠폰/첫재구매/회원그룹/채널) × metric × {compare, rank, share}를 같은 이해→실행 경로로 일반화.
- broad-scope를 구조화 질문에서 완전 은퇴, 원인/전략/해석 질문 전용으로.
- 진짜 도넛(share) 렌더러(별도).
