# Marketing Chat ChartSpec Runtime Connection v0 (2026-06-29)

> **종류**: 채팅 런타임 연결 — UI 대규모 변경 없음, 중앙 그래프 렌더 없음(다음 작업), 실제 WRITE 없음, 고도몰 API 호출 추가 없음, localStorage 신규 변경 없음.
> **한 줄**: 우측 마케팅 채팅에서 차트/비교/추이/교차분석 질문을 받으면, 기존 LLM 답변 경로 대신 `runMarketingChartRequest`(코드 주도)가 직접 정확한 분석 답변을 출력하고 **chartSpec artifact를 후속 중앙 그래프 렌더용으로 보관**한다.
> **산출물**: `marketingChatChartSpec.ts`(런타임 함수 추가) · `departmentDataService.ts`(syntheticYearLabel 플러밍) · `DepartmentWorkspacePanel.tsx`(마케팅 분기) + 본 문서 + `scripts/smoke-marketing-chat-chartspec-runtime-connection-v0.mjs`(32/32).

---

## 1. 작업 목적 / 기존 문제

지금까지 마케팅 분석 기반(2년치 universe · baseline/promotion · temporal crosstab · chartSpec bridge)은 갖춰졌지만, **우측 마케팅 채팅 런타임에 연결되지 않았다.** 그래서 "월별 쿠폰 사용/미사용 객단가 비교해줘" 같은 *계산 가능한* 질문도 일반 LLM 경로로 가면 "데이터가 없어서 어렵습니다"처럼 **틀린 답**을 할 위험이 있었다. 이번 작업은 그 질문들을 chartSpec bridge로 라우팅해 항상 정확히 계산해 답하게 한다.

## 2. 새 흐름

```
사용자 질문(우측 마케팅 채팅)
→ runMarketingChartRequest({ message, orders, products })
   → buildMarketingChatChartResponse (intent 감지 → crosstab → chartSpec → narrative)
   → intent !== 'unknown' → handled=true: 코드가 narrative 답변 생성(LLM 미경유) + chartSpec artifact
   → intent === 'unknown' → handled=false: 기존 marketingTeamChatFacts/LLM 경로로 fallback
→ 우측 채팅에 분석 답변 출력
→ chartSpec artifact를 비영속 state(marketingChartArtifact)에 보관 (중앙 그래프 렌더는 다음 작업)
```

## 3. chart intent vs 일반 marketing facts 분기 원칙

* **chart intent 감지**(쿠폰/회원그룹/채널/첫구매·재구매/리워드/카테고리/상품/연도·시나리오 비교·추이·객단가 등) → `runMarketingChartRequest` (코드 주도, 결정적).
* **unknown**(일반 전략/아이디어/요약 질의) → 기존 `buildMarketingChatContext` → `chatWithTeam`(LLM) 그대로.
* 모든 마케팅 채팅을 chartSpec으로 강제하지 않는다. `marketingTeamChatFacts`는 폐기하지 않고 fallback 경로로 유지.
* CS 답변 초안(`runCsDraftRequest`)과 동일한 "코드가 주도권을 갖는 1순위 분기" 패턴.

## 4. 지원하는 질문 유형 (런타임 검증)

monthly_coupon_aov(쿠폰 객단가) · yearly_revenue_compare(작년/올해) · scenario_revenue_compare(baseline/promotion) · member_group_revenue(회원그룹/VIP 비중) · monthly_first_repeat(첫구매/재구매) · monthly_order_channel(주문채널) · monthly_reward_aov(마일리지) · category_revenue_trend(카테고리) · top_product_trend(상품). 전부 `handled=true` + `chartSpec.available=true` + series 생성(smoke).

## 5. requiredData 질문 처리

ROAS · 방문자 전환율 · 상품조회 전환율 · 장바구니 이탈률 → `handled=true`(코드가 안내) + `chartSpec.available=false` + `requiredData`(adSpend/visitorSessions/productViewEvents/cartEvents). 응답은 "현재 계산하지 않습니다 + 필요 데이터 + 현재 연결된 주문·상품 데이터만으로는 산출하지 않습니다". **0/추정값 미생성**(smoke 26).

## 6. chartSpec artifact 구조

```ts
MarketingChatChartArtifact = {
  type: 'marketing_chart_spec';
  source: 'marketingChatChartSpec';
  intent: string;
  request: MarketingCrossTabRequest | null;
  chartSpec: MarketingChartSpec;
  narrative: { title, summary, bullets, evidence, warnings, requiredData? };
  createdAt: string;
}
```

* 패널은 이 artifact를 **비영속 `useState`(`marketingChartArtifact`)** 에 보관 → localStorage 영속 메시지 shape(`{role,text}`)는 불변(신규 저장 없음).
* dev/smoke marker: 우측 컬럼에 hidden `div.marketing-chart-artifact`(`data-marketing-chart-intent/available/type`) — JSON/PII 미노출.
* 다음 작업에서 `DepartmentWorkspacePanel`의 중앙 smart chart가 이 artifact를 읽어 렌더한다.

## 7. 채팅 응답 narrative 구성

* 계산 가능: `narrative.summary`("현재 주문 데이터 기준으로 계산 가능합니다." + 계산 방식) + "핵심 관찰:" bullets(series 요약 + crosstab 관찰) + "이 결과는 관찰값이며 인과관계를 단정하지 않습니다."
* unsupported: 미계산 안내 + 필요 데이터.

## 8. 금지 답변 방지

계산 가능 질문에서 "월별 주문 데이터가 없어서/쿠폰 사용 여부 데이터가 없어서/주문금액 데이터가 없어서 어렵습니다" 부재(smoke 14·22). 이 문구들은 현재 synthetic 데이터 기준 틀린 답.

## 9. 데이터 플러밍 (최소)

scenario/year intent가 런타임에서 작동하려면 프론트 `RevenueOrderLite`가 `syntheticYearLabel`을 가져야 한다. 서버는 이미 반환하므로 `departmentDataService.fetchRevenue` 매퍼에 `syntheticScenario`/`syntheticYearLabel`(optional, PII 아님)만 통과 추가. 상품팀/CS 화면 무회귀(optional 가산).

## 10. PII / 인과관계 가드

응답 본문·artifact JSON에 name/phone/email/address/receiverName/memberKey/syn_member_ 부재(smoke 30). 때문에/덕분에/원인입니다 부재(smoke 31). 집계 라벨·버킷 라벨·숫자만.

## 11. 중앙 그래프 렌더링은 다음 작업

이번 v0는 **우측 채팅 답변 + artifact 준비**까지만. 중앙 대시보드 smart chart에 chartSpec을 실제 렌더하는 것은 다음 작업(artifact는 이미 state로 준비됨).

## 12. 실제 WRITE 없음

런타임 순수 함수 + 매퍼 optional 필드 + 패널 분기 + 문서 + smoke. route/네트워크 신규 호출 없음(기존 revenue 재사용), localStorage 신규 저장 없음, 고도몰 WRITE 없음, Math.random 미사용.

## 13. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-chat-chartspec-runtime-connection-v0` ✅ 32/32
* 회귀: `chat-driven-chartspec-bridge` 37/37 · `temporal-crosstab` 30/30 · `baseline-year` 29/29 · `dashboard-focused-insight-layout-v01` 27/27 · `facts-core` 34/34 · `team-chat-facts` 32/32 · `department-facts-routing` 12/12 · `analysis-dashboard-v0` 30/30.

## 14. 다음 작업 후보

1. **중앙 smart chart 렌더** — `marketingChartArtifact`를 대시보드 메인 그래프(groupedBar/line/rankedBar)로 렌더.
2. **artifact 히스토리** — 최근 차트 질문 N개 보관 + 재선택.
3. **기간 파싱 intent** — "최근 6개월" 등 기간 한정.
4. **GA4/CTR/SNS 전용 requiredData intent**.
