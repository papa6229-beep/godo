# Marketing Analysis Dashboard — Focused Insight Layout v0.1 (2026-06-29)

> **종류**: UI/UX 구조 개선 — 계산 로직 변경 없음(`buildMarketingAnalysisFacts` 그대로), 표시 위계/선택만 재정리. 실제 WRITE 없음, 고도몰 API 호출 추가 없음, synthetic 생성 없음, localStorage 변경 없음.
> **한 줄**: KPI 다발 + 차원 카드 나열 화면을 **기간 → 분석 지표 선택 → 고정 KPI 2 + 선택 지표 + 비교 요약 → 메인 비교 그래프 → AI 분석 리포트 → 세부 분석 → requiredData 축소**의 집중형 흐름으로 재구성했다.
> **산출물**: `MarketingAnalysisDashboard.tsx` · `.css` 수정 + 본 문서 + `scripts/smoke-marketing-analysis-dashboard-focused-insight-layout-v01.mjs`(27/27). 기존 v0 smoke(30/30) 무파손.

---

## 1. 작업 목적 / 기존 화면 문제

기존 v0 대시보드는 KPI 8개 + 차원 카드 7개 + AI + requiredData가 동일 위계로 길게 나열되어, 사용자가 "지금 무엇을 비교하는지"를 한눈에 잡기 어려웠다. 이번 v0.1은 **한 번에 하나의 분석 지표에 집중**해 핵심 KPI·메인 그래프·AI 관찰을 위로 모으고, 나머지는 세부 분석으로 내린다.

## 2. 새 화면 구조

```
헤더(안내 문구 정리) + 새로고침
→ 기간 필터 (전체/오늘/7일/30일/이번달/지난달/올해/직접 선택)         [유지]
→ 분석 지표 선택 칩 (marketing-focus-selector)                       [신규]
→ compact KPI: 총매출 · 주문수 · 선택 지표 값 · 비교 요약 (4칸)        [축소]
→ 메인 비교 그래프 (marketing-smart-chart)                           [신규]
→ AI 분석 리포트 (marketing-ai-report, smart chart 바로 아래)         [이동]
→ 세부 분석 (marketing-detail-section, 기존 7개 차원 카드 재배치)      [강등]
→ requiredData 축소 (marketing-required-compact)                     [축소]
```

## 3. KPI 축소 정책

* **고정 KPI 2개**: 총매출 · 주문수(항상 노출).
* **선택 KPI 1개**: 분석 지표 칩 선택에 따라 값/라벨 변동(객단가/쿠폰 사용 주문/총 할인액/총 리워드 사용액/1위 그룹 매출 등).
* **비교 요약 1개**: 선택 지표의 핵심 비교(예: 첫구매 vs 재구매 객단가, 쿠폰 사용 vs 미사용 객단가).
* 상단 KPI는 4칸으로 제한. `useAnimatedNumber` 카운터 유지(reduced-motion guard 존중).

## 4. 분석 지표 선택 칩 (MarketingFocusMetric)

`aov`(기본) · `firstRepeat` · `coupon` · `discount` · `reward` · `memberGroup` · `orderChannel` · `topProducts` · `topCategories` · `topBrands`. 칩 선택 시 `buildFocusView(focus, facts)`가 KPI/비교/그래프 뷰모델을 만든다(표시 매핑 전용 — facts가 이미 계산, 신규 집계 없음).

## 5. 메인 비교 그래프 (marketing-smart-chart)

CSS 기반 가로 bar(차트 라이브러리 미추가). 구조: 헤더(선택 지표명/기간/설명) → bars(`marketing-smart-chart-bars`) → 요약(`marketing-smart-chart-summary`, "가장 높은 항목은 …으로 나타납니다" 관찰 표현).

지표별 그래프 내용:
| focus | bars |
|---|---|
| aov | 총/첫구매/재구매/쿠폰 사용/쿠폰 미사용 객단가 |
| firstRepeat | 첫·재구매 매출 · 첫·재구매 주문수 |
| coupon | 사용/미사용 매출·주문수·객단가 |
| discount | 총 할인액 · 쿠폰 할인액 · 기타(상품/회원) 할인액 |
| reward | 리워드 사용액 · 마일리지/예치금 주문수 |
| memberGroup/orderChannel/topProducts/topCategories/topBrands | 해당 차원 매출 TOP(비중 bar) |

bar 폭은 **그룹별 최대값 정규화**(매출/주문수/객단가 단위가 섞일 때 group별 max 기준). 정규화는 `Math.max(...)` 사용(컴포넌트 내 `.reduce` 미사용 — v0 원칙 유지).

## 6. AI 분석 리포트 위치/표시 변경

* 위치: 하단 → **메인 그래프 바로 아래**(`marketing-ai-report`, 기존 `mkt-insights` 마커 유지).
* 표시: `facts.insights` 상위 **4개만** 먼저 노출(`facts.insights.map` + `idx < INSIGHT_LIMIT` 가드, 나머지는 [세부 분석]에서 확인 안내).
* 각 카드: 핵심 관찰(summary) · 근거(evidence) · 다음 확인 후보(recommendedNextAction) · severity 배지.
* "주의할 해석" 캡션으로 "관찰값이며 인과관계를 단정하지 않습니다" 명시.

## 7. 세부 분석 카드 재배치

기존 7개 차원 블록(회원그룹/주문채널/쿠폰/리워드/상품/카테고리/브랜드)을 **삭제하지 않고** 하단 `세부 분석` 섹션으로 강등(기존 `mkt-dim-*` 마커·라벨 그대로 유지, 패딩만 컴팩트). 항목 변경 없이 위치·위계만 조정.

## 8. requiredData 축소 정책

`marketing-required-compact` + 작은 잠금 카드 2~3열 그리드. 헤드라인은 잠긴 분석명(가입→구매/방문→주문/상품조회→구매/장바구니/ROAS/광고 CTR/GA4/SNS), 태그 "외부 연동 필요". **0/추정값 절대 미표시**("계산하지 않습니다" 유지).

## 9. 계산 로직 변경 없음 확인

`buildMarketingAnalysisFacts` 호출·결과 그대로 사용. 컴포넌트는 표시 매핑(`buildFocusView`)만 추가하고 매출 합산 등 신규 집계는 만들지 않음(smoke가 `.reduce(` 부재 검증). facts.summary에 ROAS/전환율 필드 없음 유지.

## 10. PII 표시 금지 / 라이트·다크 대응

* 집계/그룹/차원 라벨·금액만 렌더. 고객명/전화/이메일/주소/`memberKey` 미표시(smoke 검증, `piiCheck.containsPii === false`).
* CSS는 기존 테마 변수(`--bg-surface/--line-subtle/--accent-primary/--accent-soft/--success/--info/--text-*` 등)만 사용 → 라이트/다크 공통.

## 11. 실제 WRITE 없음

표시 컴포넌트 + CSS + 문서 + smoke만 변경. route/네트워크/localStorage/고도몰 WRITE 없음(기존 revenue 재사용).

## 12. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-...-focused-insight-layout-v01` ✅ 27/27
* 회귀: `smoke-marketing-analysis-dashboard-v0` 30/30 · `facts-core` 34/34 · `enrichment` 32/32 · `coverage-audit` 30/30 · `team-chat-facts` 32/32.

## 13. 다음 작업 후보

1. **칩 ↔ 그래프 모션 polish** — focus 전환 시 bar 트랜지션/카운터 동기화 미세 조정.
2. **세부 분석 접힘(collapse)** — 기본 접고 "펼치기"로 화면 더 압축.
3. **카탈로그 라벨 연동** — category/brand 코드 → 이름.
4. **insight → 승인 큐(HITL)** — 다음 확인 후보를 캠페인 후보로 제출(WRITE는 승인 후).
5. **마케팅 채팅 ↔ 대시보드 기간/지표 동기화**.

---

*문서 끝. (작성 2026-06-29, 브랜치 `fix/marketing-analysis-dashboard-focused-insight-layout-v01`, v0.1 smoke 27/27, v0 무파손)*
