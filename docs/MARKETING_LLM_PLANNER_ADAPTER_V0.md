# Marketing LLM Planner Adapter v0 (2026-06-29)

> **종류**: LLM 어댑터(plan 생성 전용) — 실제 WRITE 없음, 고도몰 API 호출 추가 없음, 신규 API route 없음, synthetic/외부 데이터 생성 없음, localStorage 변경 없음.
> **한 줄**: LLM은 **숫자가 아니라 "분석 계획(strict JSON plan)"만** 생성하고, validator가 capability map 기준으로 정화/거부하며, 기존 deterministic executor가 실제 숫자를 계산한다. parse/validation 실패 시 deterministic planner로 안전 fallback.
> **산출물**: `src/services/marketingLlmPlannerAdapter.ts`(신규) · `marketingIntelligencePlanner.ts`(공용 코어 `buildMarketingResponseFromPlan` export) · `marketingChatChartSpec.ts`(artifact source) · `departmentChatService.ts`(planner LLM 호출부) · `DepartmentWorkspacePanel.tsx`(runtime 연결) + 본 문서 + `scripts/smoke-marketing-llm-planner-adapter-v0.mjs`(31/31).

---

## 1. 작업 목적 / LLM vs deterministic 역할 분리

질문별 intent를 계속 추가하는 대신, **LLM이 자유 질문을 구조화(plan)** 하고 **코드가 계산**한다.

| LLM 역할 | 코드 역할 |
|---|---|
| 질문 해석 · 필요한 데이터 조각 판단 · 지표/기간/조건/비교축/세그먼트 계획 · 그래프 추천 · strict JSON plan 초안 | plan 검증 · 허용 metric/dimension/period/filter만 통과 · 실제 계산 · chartSpec 생성 · narrative/evidence 생성 |

## 2. 왜 LLM이 숫자를 만들면 안 되는가

LLM이 매출/주문수/객단가/전환율을 "생성"하면 환각·불일치 위험이 크다. 숫자는 반드시 `executeMarketingIntelligencePlan`(deterministic)이 계산해야 일관성·근거가 보장된다. 그래서 프롬프트에서 숫자 생성을 금지하고, validator가 숫자 결과 필드를 reject한다.

## 3. prompt 구성 (`buildMarketingLlmPlannerPrompt`)

* 역할 제한: "You are NOT allowed to calculate revenue/orderCount/AOV/conversion… 모든 숫자는 코드가 계산".
* capability map 기반 허용 enum: allowedGoals/Metrics/Dimensions/Segments/Filters/Comparisons/ChartTypes/TimeBuckets + unavailableMetrics(필요 데이터).
* 출력: JSON object 하나만(코드펜스/설명 금지) + 예시 schema + 현재 시각 + 질문.
* 금지: 숫자 결과 필드, PII, 인과 단정.

## 4. strict JSON plan schema / parse

`parseMarketingLlmPlannerJson` — 코드펜스/잡텍스트 제거 후 첫 `{...}` 추출 JSON.parse(실패 시 throw). plan draft: goal/requestedMetrics/periods/timeBucket/dimensions/segments/filters/comparison/chartRecommendation/requiredData/warnings.

## 5. validation 규칙 (`validateMarketingLlmPlanDraft`)

object 여부 · goal/dimension/comparison/chartType/timeBucket allowed enum · metric은 available∪unavailable만(unknown reject) · period ISO date 검증 · **숫자 결과 필드 reject**(revenueValue/totalRevenue/computedResult/numericAnswer/`*Value`/…) · **PII 키 reject** · **인과 단정어 reject**(때문에/덕분에/원인입니다). 실패 → `{ok:false, errors}`. 성공 → capability validate 거쳐 `executableMetrics/dataRequirements/proxyPlan` 채운 `MarketingIntelligencePlan`.

## 6. capability map 기반 허용/거부 + normalization

* unavailable metric(ROAS/방문전환/가입전환 등)은 reject가 아니라 `dataRequirements`로 분리(+가능하면 proxyPlan).
* 동의어 normalize: sales/amount→revenue · orders→orderCount · aov→averageOrderValue · couponRate→couponUsageRateWithinOrders · newMember→신규회원 · bar→groupedBar · lineChart→line 등. 알 수 없는 값은 억지로 만들지 않고 reject.

## 7. 기간 파싱 보강

LLM이 startDate/endDate(ISO)를 주면 사용, label만 있으면 deterministic parser fallback이 처리. "쿠폰기간"처럼 실제 캠페인 metadata가 없으면 promotion scenario / couponUsage filter로 해석하되 **실제 캠페인 기간이라 단정하지 않음**.

## 8. fallback 정책

1. **deterministic planner 먼저** 실행(항상). 2. deterministic이 구조를 잘 잡았거나(`isWeakDeterministicPlan`=false) requiredData를 이미 정확히 식별했으면 그대로 사용. 3. deterministic이 빈약(goal summary + 구조 없음 + dataRequirements 없음)하고 LLM 주입 시 LLM planner 시도. 4. LLM parse/validation/호출 실패 → deterministic fallback. → 모든 단계 안전(offline·키 없음에도 동작).

## 9. 기존 Intelligence Planner와 통합 / runtime 연결

* `buildMarketingResponseFromPlan`(planner 공용 코어)을 deterministic/LLM 둘 다 사용 → narrative/evidence/artifact 단일 소스.
* `buildMarketingIntelligenceResponseWithLlm`(adapter, async, `callPlannerLlm` 주입) = runtime 진입점. `plannerSource: 'deterministic' | 'llm_planner'` 표시.
* `DepartmentWorkspacePanel` 마케팅 분기: 0순위 `buildMarketingIntelligenceResponseWithLlm`(callPlannerLlm=`callMarketingPlannerLlm`) → 1순위 fixed-intent(runMarketingChartRequest) → 2순위 LLM chat. `callMarketingPlannerLlm`은 기존 `chatWithProvider` 재사용(브레인 미연결 시 throw → deterministic fallback). **신규 route/네트워크 없음.**

## 10. artifact source 정책

LLM 경로 artifact `source: 'marketingLlmPlannerAdapter'`. artifact에는 normalized plan(집계/계획만)·chartSpec·narrative·evidence·requiredData. **raw order row / customer / memberKey / PII / LLM raw output 전체 미포함**(LLM raw는 smoke/debug 내부에서만, 사용자 화면 미노출).

## 11. narrative 생성 방식

LLM이 narrative를 직접 쓰지 않는다. narrative는 항상 deterministic `buildMarketingIntelligenceNarrative`(buildIntelNarrative) 경로 → 인과 단정 방지·PII 방지·requiredData 표현 통일·계산 evidence 일치.

## 12. PII / 인과관계 단정 금지

prompt 금지 + validator reject + 결과 `piiCheck.containsPii === false` + 응답/artifact에 name/phone/email/address/memberKey/syn_member_ 부재. 때문에/덕분에/원인입니다 부재(draft·결과 검증).

## 13. 실제 WRITE 없음

adapter 순수 함수 + 공용 코어 export + planner LLM 호출부(기존 connector 재사용) + 패널 분기 + 문서 + smoke. route/네트워크 신규 없음, localStorage 변경 없음, 고도몰 WRITE 없음. 기존 계산 엔진(crosstab/facts) 미변경.

## 14. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-llm-planner-adapter-v0` ✅ **31/31** (fake LLM 주입, 네트워크 없음)
* 회귀: intelligence-planner 32 · dynamic-smart-chart-render 30 · chat-chartspec-runtime-connection 32 · chat-driven-chartspec-bridge 37 · temporal-crosstab 30 · baseline-year 29 · dashboard-focused-insight-layout-v01 27 · analysis-dashboard-v0 30 · facts-core 34 · team-chat-facts 32.

## 15. 다음 작업 후보

1. **LLM planner 실측 튜닝** — 실제 브레인 연결 시 프롬프트/normalize 보강(여전히 숫자는 deterministic).
2. **relationship/scatter 계획** — 관계 분석 plan을 LLM이 더 풍부하게 구조화.
3. **Member READ Contract** — 가입일 연결 → 정확 전환율(proxy 졸업).
4. **plan 캐시/히스토리** — 최근 분석 계획 재사용.
