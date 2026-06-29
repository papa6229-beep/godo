# GODO AI OS — 마스터 보고서 (2026-06-29)

> **목적**: 오늘 하루 작업 전체를 한 문서로 정리한 마스터 보고서(다음 세션 인수인계 겸용).
> **오늘의 한 줄**: **마케팅팀을 "통계 조회"에서 "질문을 분석 범위로 해석해 비교·관계·이상치·흐름을 그래프와 근거로 설명하는 분석팀"으로 끌어올리는 마케팅 분석 OS 한 줄기를 19개 블록 + 2개 진단으로 완성했다.** 전부 READ-only·실제 WRITE 없음·PII 경로 분리·deterministic 계산(LLM 숫자 생성 금지)·인과 단정 금지·smoke 단위검증.
> **상위/연관 문서**: `docs/MASTER_REPORT_2026-06-27.md`(CS 운영 OS) · 오늘 각 블록 `docs/MARKETING_*_V0(.1)/P0.md`.

---

## 0. 시작/종료 기준

* **시작**: main HEAD `a1cabfa`(06-27 CS 마스터 직후). 마케팅은 facts/대시보드 일부만 있던 단계.
* **종료**: main HEAD **`7d6f6e0`**, origin/main 동기화 완료. 오늘 **19개 feature/fix 브랜치**를 `--no-ff` merge + **2개 진단 보고**(코드 변경 없음). 전 블록 `npm run lint` · `npx tsc -b` · `npm run build` 통과 + 각 블록 신규 smoke 통과 + 관련 smoke 무회귀(현재 마케팅 smoke 17종 상시 green).

---

## 1. 오늘 완성한 마케팅 분석 파이프라인 (★핵심 그림)

```
[질문 (자연어)]
   │  ⓪ Scope Insight Engine: 질문 → 분석 범위(scope: 기간/상품/카테고리/고객/쿠폰/채널/문의·리뷰)
   ▼
[분석 범위]  → 명시 조건만 필터, 나머지는 "보조 분석축"
   │  insightPack 자동 생성(summary·timeTrend·category·product·customer·promotion·channel·csSignals·relationships·anomalies)
   ▼
[planner fallback]  Scope 미처리 시 → Intelligence Planner(deterministic) → LLM Planner Adapter(계획만, 숫자 X) → fixed-intent → LLM chat
   │  (Contract Repair P0: period 필터 적용 + metric 이름표 정상 + product/category 차원 유지)
   ▼
[chartSpec]  Temporal Cross-Tab 엔진 + chartSpec adapter
   ▼
[중앙 그래프]  Renderer Parity P0: 단일 월별 = 막대+꺾은선 combo / 연도비교 = 세로 grouped bar
   │  Width Fit v0.1: 측정폭 viewBox로 카드 폭 꽉 채움 + absolute tooltip clamp
   ▼
[AI 분석 리포트]  insightPack 기반 narrative(총합만 X — 흐름/차이/최대격차/관계/주의)
   ▼
[분석 메모리]  비PII 분석 요청 누적(localStorage 1 key) → 유사 질문 힌트
```

* **데이터 기반**: Synthetic Commerce Universe(2년) — **Calendar Rebase로 2024(baseline·쿠폰0) / 2025(promotion·쿠폰>0) 고정 달력**.

---

## 2. 오늘 작업 로그 (머지 순서, 19블록 + 2진단)

> 각 블록 = 브랜치 → 검증 3종(lint/tsc/build) → 신규 smoke → `--no-ff` merge → push. 전부 실제 WRITE/고도몰 API/synthetic 임의생성 없음.

**A. 데이터 토대 (1~7)**
1. `6c20a2e` **Marketing Data Coverage Audit v0** — 마케팅이 쓸 수 있는 데이터/불가 지표(외부) 감사.
2. `eb00928` **Synthetic Commerce Enrichment v0** — 쿠폰/할인/마일리지/회원그룹/첫재구매 enrichment(스펙 기반, deterministic).
3. `0c8f80f` **Analysis Facts Core v0** — `buildMarketingAnalysisFacts`(매출/객단가/쿠폰/회원/채널 집계, PII self-check).
4. `a656931` **Analysis Dashboard v0** — 마케팅 분석 화면(facts 카드/도넛/순위).
5. `0615ea7` **Team Chat Facts v0** — 마케팅 채팅이 facts 기반으로 답변.
6. `eda3028` **Focused Insight Layout v0.1** — 분석 화면 인사이트 중심 레이아웃.
7. `dd445a4` **Baseline Year Synthetic Expansion v0** — baseline(쿠폰0)/promotion(쿠폰 유지) 2년 구조.

**B. 교차분석 → 채팅→차트 브리지 (8~11)**
8. `60c69af` **Temporal Cross-Tab Analysis v0** — `timeBucket × dimension × metric` 엔진.
9. `81dfa88` **Chat-Driven ChartSpec Bridge v0** — 질문 → intent → CrossTabRequest → chartSpec.
10. `c096ff9` **Chat ChartSpec Runtime Connection v0** — 채팅 분기에서 코드가 직접 차트 답변(LLM 우회).
11. `cf125fd` **Dashboard Dynamic Smart Chart Render v0** — 중앙에 chartSpec 그래프 렌더.

**C. 계획 엔진 (12~14)**
12. `28c843e` **Intelligence Planner v0** — 질문 → 분석계획(plan) → capability 검증 → 실행 → chartSpec + narrative + 관계분석.
13. `006618e` **LLM Planner Adapter v0** — LLM은 **계획 JSON만**(숫자 생성 금지), validator 정화, deterministic 실행, 실패 시 fallback.
14. `6fe1c8b` **Insight UX + Analysis Memory v0** — 시리즈 색/tooltip/groupedBar 우선/proxy chart + 비교 인사이트 narrative + 비PII 분석 메모리.

**D. 데이터 정렬 + 진단·수리 (15~17)**
15. `3e5ef6d` **Synthetic Calendar Rebase v0** — rolling(7월 시작) → **고정 달력 2024-01-01~2025-12-31**(baseline 2024 / promotion 2025).
   * **[진단] Pipeline Diagnosis v0** — Q1~Q4 파이프라인 추적. root cause 4개 발견(period 필터 누락 / metric revenue 둔갑 / product·category 소멸 / smoke 약함).
16. `e765d10` **Analysis Contract Repair P0** — ① 단일 기간 질문 period 필터 적용(2024 질문=2024만) ② `metricFromAcc` revenue 둔갑 제거 + inquiry/review metric 실집계(goods 라인 기반) ③ product/category 차원 감지·우선 보강. "문의수=58,716,475건" 버그 종료.
17. `f34256a` **Scope Insight Engine v0** — 질문 → **분석 범위(scope)** → **insight pack** 자동 생성(다축 보조 분석 + 관계/이상치) + 10섹션 narrative. planner보다 우선, 실패 시 fallback.

**E. 차트 렌더러 진단·수리 (18~19)**
   * **[진단] Renderer Parity Diagnosis v0** — 상품팀 `TrendChart`(정상 SVG combo) vs 마케팅 원시 렌더러(왜곡 viewBox line-only + 수평 div 막대 + in-flow tooltip) 차이 규명. "채팅 기반"이 아니라 렌더러 미달이 원인.
18. `6e3acd7` **Chart Renderer Parity P0** — 공통 SVG 차트 추출(`src/components/charts/`): **CommerceComboChart**(막대+꺾은선) · **CommerceGroupedBarChart**(세로 grouped) · **CommerceChartTooltip**(absolute·pointer-events:none) · `resolveMarketingChartRoute`(순수 라우팅). Q1=combo, Q2=세로 grouped.
19. `7d6f6e0` **Chart Width Fit Patch v0.1** — 고정 viewBox(560)+`meet`로 가운데 몰리던 문제를 **ResizeObserver 측정폭 viewBox**로 해결 → 카드 폭 꽉 채움 + tooltip 양끝 clamp.

---

## 3. 핵심 기술 결정 / 불변식

* **LLM ≠ 숫자**: 모든 집계는 deterministic 코드(Math.random 미사용). LLM은 "분석 계획 JSON"만(adapter validator가 숫자 결과 필드·PII·인과어 reject). 실패 시 항상 deterministic fallback.
* **PII 분리**: 분석 경로는 memberKey/aggregate만. raw order/review/inquiry row·이름·전화·이메일·주소·orderNo 미노출. 전 응답 `piiCheck.containsPii === false`. fake PII(contacts)는 CS 경로 전용.
* **인과 단정 금지**: "때문에/덕분에/원인입니다" 부재. 상관계수는 "관계 강도 참고값, 원인 증명 아님" 명시. 2024 baseline은 쿠폰 효과 해석 금지 경고.
* **외부 데이터**: 방문/광고/ROAS/GA4/전환율은 requiredData로만 안내(추정/0 금지). 단, proxy 분석은 능동 제공.
* **relative year 정책**: synthetic 최신연도 기준(올해=2025/작년=2024). 실데이터 전환 시 data max-date 기준.
* **차트 계약 보존**: 기존 switch 마커(`case 'line'`/`polyline`/`case 'groupedBar'` 등) 유지 + route 함수로 combo/groupedVertical만 신규 컴포넌트로 분기 → dynamic-render smoke 무회귀.

---

## 4. 신규/주요 산출물 (코드)

* 서비스: `marketingScopeInsightEngine.ts`(scope→insightPack) · `marketingIntelligencePlanner.ts`(plan→실행, contract repair 포함) · `marketingLlmPlannerAdapter.ts`(LLM 계획 어댑터) · `marketingAnalysisMemory.ts`(비PII 메모리) · `marketingTemporalCrosstab.ts` · `marketingChatChartSpec.ts` · `marketingAnalysisFacts.ts`.
* 차트(공통): `src/components/charts/` — `CommerceComboChart.tsx` · `CommerceGroupedBarChart.tsx` · `CommerceChartTooltip.tsx` · `marketingChartRoute.ts` · `commerceChartUtils.ts` · `useChartWidth.ts` · `commerceCharts.css`.
* 화면: `MarketingAnalysisDashboard.tsx/.css`(combo/grouped 라우팅·tooltip·proxy 배지·메모리 마커) · `DepartmentWorkspacePanel.tsx`(scope→planner→fixed→LLM 4단 fallback).
* 데이터: `api/_shared/syntheticCommerceUniverse.ts`(Calendar Rebase, `SYNTHETIC_CALENDAR`).

---

## 5. 검증

* 전 블록 `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅.
* **마케팅 smoke 17종 상시 green**(누계 ~560 checks): chart-width-fit 20 · chart-renderer-parity 24 · scope-insight 32 · contract-p0 21 · calendar-rebase 31 · insight-ux 42 · llm-planner 31 · intelligence-planner 32 · dynamic-render 30 · runtime-connection 32 · bridge 37 · temporal-crosstab 30 · baseline-year 29 · focused-layout 27 · dashboard-v0 30 · facts-core 34 · team-chat 32.
* 진단 2건은 코드 변경 없이 보고만(진단 스크립트 미커밋).

---

## 6. 대표 질문 현재 동작 (계약)

| 질문 | 결과 |
|---|---|
| 2024년 1~12월 월별 매출 | combo(막대+꺾은선), 12개월 2024만, 흐름/최고·최저/카테고리·상품·고객·쿠폰·채널 다축 narrative |
| 2024년과 2025년 월별 비교 | 세로 grouped bar 12개월, 우세 월/최대 격차, 보조 분석 |
| 카테고리별 쿠폰 사용률과 매출 비중 관계 | category 차원 유지, 두 metric(0%/100% 버그 제거) |
| 문의가 많은 상품의 매출 | product 차원, inquiryCount=실제 문의수(매출 둔갑 없음) + 관계 방향 |
| ROAS / 방문자 전환율 | required_data(외부 데이터 안내, fake 0 금지) |
| 신규 가입회원 구매전환율 | partial_with_proxy(정확지표 미계산 + proxy 차트 표시) |

---

## 7. 남은 이슈 / 다음 작업 후보 (P1~)

1. **dualMetricBar / scatter 실렌더** — 카테고리 쿠폰사용률 vs 매출비중, 상품 문의수 vs 매출을 두 metric 동시 시각화(현재 rankedBar로 강등, secondaryValue는 notes). adapter가 secondaryValue 보존.
2. **관계형 chartSpec 1급 지원** — scope insightPack의 relationships를 차트 축으로 직접 연결.
3. **차트 마감** — 모바일 long-press tooltip, 막대 진입 애니메이션, 상품팀 `TrendChart`도 공통 컴포넌트로 전환(선택, 회귀 주의).
4. **LLM planner 실측 튜닝** — 실브레인 연결 시 scope 보조 해석/표현 보강(숫자는 계속 deterministic).
5. **Member READ Contract** — 가입일 연결 → 정확 전환율(proxy 졸업), 실데이터 max-date 기반 기간 anchor.
6. **분석 메모리 활용 고도화** — 유사 plan 힌트를 recommend/LLM prompt에 주입(capability 우선 유지), 메모리 관리 UI.

---

## 8. 운영 메모

* synthetic 데이터는 2024-2025 고정 달력 → 대시보드 "최근 7/30일/오늘" 프리셋은 실제 현재일(2026) 기준이라 빈 결과. '전체'/명시 연도/커스텀은 정상. (상대 기간 UI는 후속.)
* 차트 좌우 여백이 남아 보이면 차트가 아니라 상위 카드 컨테이너 padding 확인.
* 번들 chunk-size 경고는 기능과 무관(별건).
