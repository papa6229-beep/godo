# GODO AI OS — 마스터 보고서 (2026-07-02)

> 목적: 오늘 한 작업·과정·현재 상태를 남겨, 내일 이 문서만 읽고 곧바로 이어서 작업.
> 작성: Claude Opus 4.8 (1M) · 확정 지시자: 사장님(papa6229)

---

## 0. 한 줄 요약

전 팀(상품·마케팅·CS·총괄) 채팅의 데이터 답변 로직을 **"질문별 답변기"에서 "원시연산 조립 계산기(Commerce Query Plan Engine)"로 재건축**했다. 사장님이 즉석에서 만든 실전 질문 4개가 모두 정상 동작함을 눈으로 확인했다. main `fa27775`에 머지·푸시 완료.

---

## 1. 오늘의 맥락 — 왜 또 갈아엎었나

### 1-1. 어제(전 세션)까지의 상태
- 어제 이미 "단일 Commerce Data Query Engine"으로 한 번 재건축(main `c95f1ac`). 이해=LLM(AnalyticsQuery), 계산=코드, dimension × metric × operation 방식.
- 사장님이 상품팀 채팅에서 눈검수: 스샷 1~4(상품 순위 / 월별 매출 / 쿠폰 객단가 비교 / 문의많은상품×매출)는 **정확하고 그래프도 잘** 나왔다. 하지만 **그래프 우측이 조금 잘림**.

### 1-2. 결정적 문제 발견 (스샷 5·6)
- 사장님이 **임의로** 만든 기초 질문에서 오답:
  - **5번** "2024·2025 **월별** 객단가 비교" → 각 연도 월별이 아니라 **전체기간 객단가를 연도별 2막대**로.
  - **6번** "2024·2025 **월별** 매출 비교" → 예전엔 1~12월 연도별 색 grouped였는데, 지금은 **24개월을 한 줄·같은 색으로 쭉 나열**(상대 비교 아님).
- 사장님 지적: "너는 미리 수동검수 질문 몇 개 정해놓고 거기에 맞춤 패치만 하는 눈속임을 하고 있던 게 아니냐. 5·6번은 1~4번보다 훨씬 쉬운 기초 질문인데 왜 놓치냐."

### 1-3. 원인 (정직하게)
- 눈속임 의도는 아니었으나 **결과는 의심이 정당함**. 진짜 원인:
  1. 엔진에 **seriesBy(연도/세그먼트로 series를 나눠 나란히 비교)** 원시연산이 없었다. time+trend=단일 series 24나열, time+compare=연도 총계 2막대 → "월×연도 grouped" 모양이 아예 없었다.
  2. smoke를 **단일연도/extremes/순위만** 좁게 테스트해 이 기본 케이스가 조용히 깨진 채 green이 떴다.

### 1-4. 사장님의 핵심 교정 (오늘 확정된 철학)
- **"케이스 구현을 하지 마라."** 사용자 질문은 무한하다. 질문별 코드/regex/if는 끝없이 놓친다.
- **유한한 원시연산의 조립으로 무한한 질문을 표현하라.** 새 질문은 코드가 아니라 QueryPlan만 달라져야 한다.
- 이해는 LLM(무엇을 어떻게 조립할지=QueryPlan), 계산은 코드, 숫자는 LLM이 절대 안 만든다.

---

## 2. 오늘 만든 것 — Commerce Query Plan Engine

### 2-1. 구조 (3단)
```
자연어 질문
  │  ① 이해 = LLM
  ▼
QueryPlan  (원시연산 조립 지시서, 숫자 없음)
  │  ② 검증 = 코드 (Data Catalog 정합성 / 숫자결과 reject / 축-소스 호환 / unsupported)
  ▼
Executor   (원시연산 일반 실행 — 숫자는 전부 코드가 계산)
  ▼
reply(텍스트) + artifact(차트)
```

### 2-2. 원시연산 (primitives)
`read · filter · groupBy(임의 축) · seriesBy(임의 축) · aggregate · compute · sort · rank · compare · share · trend · extremes · join · chartShape`

- **groupBy** = 1차로 묶는 축. **seriesBy** = 나란히 비교할 series 축(오늘 추가한 핵심). **join** = 교차 지표(문의수 × 매출 등, secondaryMetric).
- 새 질문 = 이 블록들의 조합. 예:
  - "2024·2025 월별 매출 비교" = `groupBy:month + seriesBy:year + metric:revenue + trend` → 세로 grouped(연도별 색).
  - "월별 객단가 비교" = 위에서 `metric`만 `averageOrderValue`로.
  - "쿠폰 사용/미사용 객단가 비교" = `groupBy:couponUsed + metric:averageOrderValue + compare`.
  - "문의 많은 상품 중 매출 높은" = `metric:inquiryCount + secondaryMetric:revenue + groupBy:product + rank`(join).

### 2-3. Data Catalog (허용 범위 — 이 밖은 unsupported)
- **허용 축**: year, month, product, category, couponUsed, memberGroup, channel, customerType(신규/재구매), reviewRating, inquiryProduct
- **허용 지표**: revenue(net), orderCount, quantity, averageOrderValue, share, inquiryCount, reviewCount, averageRating
- **불가(외부 데이터 필요)**: ROAS, 광고비, 방문자, 노출, 클릭, 전환율, 장바구니 → "없다"고 정직하게 안내(허구·전체합 금지).
- 축이 지표 소스에서 추출 불가하면(예: 매출 × 평점) unsupported로 처리.

### 2-4. 차트 라우팅
- 다중 series(seriesBy) → `chartType:'groupedBar'` → route `groupedVertical` → **CommerceGroupedBarChart**(세로 grouped, 연도별 색).
- 단일 시간축 추이 → `'line'` → **CommerceComboChart**(막대+추세선).
- extremes/rank/share/compare(단일 series) → **RankedBarChart**(항목당 1 series).
- 다연도를 연도 series로 나누지 않을 때는 월을 `YYYY-MM`으로 구분(12월이 두 해에 합쳐지지 않게), 나눌 때는 `MM`으로 정렬.

### 2-5. 우측 잘림 수정
- 원인: `.marketing-smart-chart` 카드에 `box-sizing`이 없어 `width:100% + padding 18px`가 **좁은 채팅 열을 우측으로 넘쳐** `overflow:hidden`에 잘림(모든 차트 타입에 동일하게 나타난 이유). 넓은 마케팅 중앙 패널은 여유가 있어 안 보였음.
- 조치: `.marketing-smart-chart { box-sizing: border-box }` + `.dept-chat-chart` 규칙(box-sizing/min-width:0) 추가.

---

## 3. 파일 (이번 커밋에서 변경/추가)

| 파일 | 역할 |
|---|---|
| `src/services/commerceQueryPlan.ts` | **신규**. QueryPlan 타입 + Data Catalog(허용 축·지표·연산, 미연결 지표 목록). |
| `src/services/commerceDataQueryEngine.ts` | **전면 재작성**. Executor: `resolveRange`/`tabulate`/`axisKey`/`metricValue`/원시연산 shaping/차트 spec. 진입점 `answerCommerceQuestion`(전 팀 공용), `executeCommerceQueryPlan`. |
| `src/services/marketingAnalyticsQueryCompilerLlm.ts` | `buildQueryPlanPrompt`(LLM→QueryPlan), `validateQueryPlan`(카탈로그 검증), `analyticsQueryToPlan`(deterministic 어댑터), `understandCommerceQuery`(QueryPlan 반환). |
| `src/components/DepartmentWorkspacePanel.tsx` | 엔진에 reviews/inquiries도 전달(join용). |
| `src/components/DepartmentWorkspacePanel.css` | `.dept-chat-chart` 규칙. |
| `src/components/MarketingAnalysisDashboard.css` | `.marketing-smart-chart` box-sizing. |
| `scripts/smoke-commerce-query-plan-engine-v0.mjs` | **신규 검증**. |
| `scripts/smoke-commerce-data-query-engine-v0.mjs` | 삭제(구 엔진용). |

- 렌더 계층(`marketingChartRoute.ts`, `CommerceGroupedBarChart.tsx`, `CommerceComboChart.tsx`, `RankedBarChart`)은 이미 존재하던 것 재사용(수정 없음).

---

## 4. 검증 결과

- **smoke-commerce-query-plan-engine-v0: 29/0.** 특정 질문 맞히기가 아니라 **원시연산 조립**을 검증:
  - LLM(fake)→QueryPlan→실행, seriesBy로 다연도 월별 grouped(2 series × 12개월),
  - Validator 차단(숫자결과 value / 없는 metric / notData / ROAS / 매출×평점 부적합 축),
  - groupBy/seriesBy **임의 축**(channel·couponUsed·customerType·channel×couponUsed),
  - chartShape 정합(다중series→groupedBar, 단일시간→line, extremes→2항목),
  - join(문의 있는 상품만·문의상위 풀을 매출순·문의데이터 없으면 "없다"),
  - deterministic 어댑터도 다연도 월별→grouped,
  - 없는 기간→"없습니다", 열린 질문→null.
- **lint / tsc -b / vite build**: 그린. API 함수 수 변화 없음(≤12 유지).
- **전체 smoke 회귀**: 커밋 후 클린 트리에서 통과. 잔여 실패 1건 `smoke-marketing-dashboard-dynamic-smart-chart-render-v0`("artifact 없을 때 fallback")은 **baseline에서도 동일하게 실패하던 기존 실패로 이번 변경과 무관**.
- **사장님 실화면 눈검수(마케팅/상품 채팅, Claude 키 연결)**: 아래 4개 질문 **모두 정상**.
  1. 2024·2025년 1~7월 월별 객단가 그래프 ✅ (기간 필터+grouped)
  2. 2024·2025년 월별 매출 비교 그래프 ✅ (연도별 색 grouped)
  3. 쿠폰 사용/미사용 객단가 비교 ✅ (전체기간·비중 표시)
  4. 문의 많은 상품 중 매출 높은 상품 ✅ (문의 상위→매출순, 그래프 생성)

---

## 5. 내일 할 일 (우선순위)

1. **[확정·소]** 4번 join 그래프에 **문의건수 데이터라벨 표시**. 현재 매출 막대만 나오고 문의건수는 채팅 텍스트에만 있음. → 차트 series에 secondary(문의수)를 tooltip/보조 라벨로 노출(RankedBarChart 또는 combo 보조축). 값은 이미 `computeSecondaryByProduct`로 계산됨 → 렌더에만 얹으면 됨.
2. **[검수]** 사장님이 임의 질문을 더 던져 확인. 어긋나면 **케이스가 아니라 "빠진 원시연산/축/지표"를 채우는 방식**으로만 대응(철학 유지). Data Catalog에 축/지표 추가 → validator/executor가 자동 처리.
3. **[여력 시]** CS/총괄 팀 세부 질문 유형 점검(같은 엔진 공유하므로 원시연산으로 커버되는지 확인).
4. **[여력 시]** 진짜 도넛(share) 전용 렌더러(현재 share는 rankedBar로 표시).

---

## 6. 절대 원칙 (내일의 나에게)

- **케이스 구현 금지.** 새 질문에 regex/if/질문별 분기 추가하면 실패. 새 질문은 **QueryPlan만** 달라져야 하고 Executor는 그대로.
- **숫자는 코드만.** LLM은 QueryPlan(무엇을 조립할지)만. validator가 숫자 결과 키를 reject.
- **없으면 없다.** broad 종합덤프·거짓말 금지. Data Catalog 밖은 unsupported로 정직하게.
- **검증도 케이스 아님.** 내가 고른 질문이 아니라 원시연산 조립(임의 축 groupBy/seriesBy/join/차단/정합)을 테스트.
- 데이터는 실/가상 동일 스펙(주문·상품·고객·문의·리뷰). 지금 가상이어도 나중에 고도몰 API로 바뀌어도 엔진은 그대로.

---

## 7. 위치 정보

- 브랜치/커밋: `main` HEAD = `fa27775` (feature/commerce-query-plan-engine-v0 머지, 2-parent).
- 데이터 출처: `DepartmentWorkspacePanel` → `productData.revenue`(orders) + `universeAux`(reviews/inquiries). 로컬 dev엔 `/api/godomall/*` 실데이터 없음 → 엔진 검증은 crafted-dataset smoke로.
- 관련 이전 보고서: `docs/MASTER_REPORT_2026-06-30.md`, `docs/MASTER_REPORT_2026-06-29.md`.
