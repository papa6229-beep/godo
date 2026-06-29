# Marketing Scope Insight Engine v0 (2026-06-29)

> **종류**: 분석 엔진(신규). 실제 고도몰 WRITE/API 호출 없음, synthetic 재수정 없음, localStorage 구조 변경 없음, LLM 숫자 생성 없음.
> **한 줄**: 마케팅 질문을 **"분석 범위(scope)"** 로 해석하고, 그 범위 안에서 사용 가능한 모든 비PII 데이터를 스캔해 **insight pack**(기간/카테고리/상품/고객/쿠폰/채널/문의·리뷰/관계/이상치)을 자동 생성한다. "총합은 얼마입니다" 통계 조회에서 벗어나는 기반 엔진.
> **산출물**: `src/services/marketingScopeInsightEngine.ts`(신규) · `DepartmentWorkspacePanel.tsx`(scope-first 연결) · `MarketingAnalysisDashboard.tsx/.css`(렌더 안정화) · `marketingChatChartSpec.ts`(artifact source) + 본 문서 + `scripts/smoke-marketing-scope-insight-engine-v0.mjs`(32/32).

---

## 1. 작업 목적 / 기존 문제
기존 분석은 "전체 총합은 44,303,726원" 수준 = 상품관리팀 통계 카드와 다를 바 없음. 마케팅팀은 질문을 **분석 범위**(기간·상품·카테고리·브랜드·고객군·쿠폰·채널·첫재구매·리뷰/문의/클레임 신호)로 해석하고, 그 범위의 데이터를 스캔해 비교·관계·이상치·흐름을 설명해야 한다. 특정 질문 하드코딩이 아니라 **질문→범위→insight pack** 기반 엔진을 추가한다.

## 2. 새 원칙: 질문을 분석 범위로 해석
`interpretMarketingQuestion(message)` → `{ scope, question }`. 질문에 **명시된 조건만 필터로 제한**하고, 명시되지 않은 축은 **보조 분석**으로 함께 본다. 예: "2024년 월별 매출"은 기간만 제한하고 카테고리/상품/고객/쿠폰/채널은 보조 분석.

### scope 구조 (`MarketingAnalysisScope`)
`dateRange{start,end,label}` · `productScope{goodsNos/productNames/categoryNames/brandNames}` · `customerScope{memberGroups, firstRepeat}` · `promotionScope{couponUsage, rewardUsage}` · `channelScope{orderChannels}` · `csScope{includeInquiries/Reviews/Claims}`.
- 기간: "2024년 1~12월" → dateRange. 연도 2개 → year_compare.
- "쿠폰 사용 고객" → couponUsage='used'. **단 "쿠폰 사용률"(metric)은 filter로 잡지 않음**(부정 lookahead — 이게 Q4의 0%/100% 버그 원인이었음).
- "VIP 재구매" → memberGroups=['VIP'], firstRepeat='repeat'. "문의/리뷰" → csScope.

## 3. insightPack 구조 (`MarketingInsightPack`)
`summary`(매출/주문/객단가/기간) · `timeTrend`(버킷별 points + 전구간 delta/rate + 최고/최저/최대상승/최대하락 + trendDirection + 변동성) · `categoryBreakdown`(매출/비중/객단가/쿠폰사용률) · `productBreakdown`(매출/비중/수량/객단가/문의수/리뷰수/평점) · `customerBreakdown`(firstRepeat + memberGroup) · `promotionBreakdown`(couponUsage + rewardUsage) · `channelBreakdown` · `csSignals`(inquiryHeavyProducts + lowRatingProducts) · `relationships`(Pearson 계수+방향) · `anomalies`(집중도/급감). 질문 유형과 무관하게 **가능한 범위까지 채움**(없는 섹션은 생략).

집계는 전부 deterministic:
- 카테고리/상품 = **주문 라인(goodsNo)** 기반 + products 인덱스로 category/brand 매핑.
- 문의/리뷰 = goodsNo + 기간(createdAt) 내 merge(집계값만).
- 관계 = 상품별 문의수 vs 매출 / 카테고리별 쿠폰사용률 vs 매출비중 Pearson.

## 4. primary chart 자동 선택
`buildPrimaryChart` — 단일 기간 월별 → **line**, 연도 비교(month+years≥2) → **groupedBar(12개월·연도 series)**, 카테고리/상품 순위 → **rankedBar**, 관계형(category 쿠폰률 vs 매출비중 / product 문의수 vs 매출) → **dualMetricBar**(secondaryValue 포함), 그 외 → table. `adaptScopeInsightChartToMarketingChartSpec`로 기존 `MarketingChartSpec`(source `temporal_crosstab`)에 매핑(dualMetricBar/scatter→rankedBar, bar→groupedBar, unsupported→table) → 기존 대시보드 렌더 재사용.

## 5. narrative는 insightPack 기반 (10 섹션)
`buildMarketingScopeInsightNarrative` — 핵심 결론 / 범위 요약 / 주 그래프 해석 / 매출 흐름·연도 비교 / 카테고리·상품 / 고객·회원그룹 / 쿠폰·채널 / 문의·리뷰 신호 / 추가 확인 포인트 / 인과 단정 주의. 데이터 없는 섹션은 생략. **총합만 말하고 끝내지 않음**(섹션 ≥3 강제). 연도 비교는 timeTrend보다 우선해 "우세 월 수·최대 격차"를 설명.

## 6. 기존 planner와 연결 (fallback 유지)
패널 마케팅 분기: **0순위 `buildMarketingScopeInsightResponse`** → 1순위 `buildMarketingIntelligenceResponseWithLlm`(기존 planner+LLM) → 2순위 fixed-intent → 3순위 LLM chat. 기존 planner **삭제하지 않음**. scope 엔진이 handled면 artifact+narrative 반환, 아니면 fallback.

## 7. 대표 질문 검증 (smoke 32/32)
| Q | 결과 |
|---|---|
| Q1 2024 월별 매출 | timeTrend 12개월(2024만), 다축 insightPack, narrative 최고/최저/상승/하락 + 카테고리·상품·고객·쿠폰·채널 관찰 |
| Q2 2025 월별 매출 | 12개월(2025만), 총합만 아님 |
| Q3 2024/2025 비교 | groupedBar 2024·2025 series 12개월, 우세 월/최대 격차 |
| Q4 카테고리 쿠폰사용률 vs 매출비중 | category 차원 유지, couponUsageRate+revenueShare 둘 다, **0%/100% 단순 split 금지**, dualMetric secondaryValue |
| Q5 문의 많은 상품 매출 | product 차원 유지, inquiryCount+revenue 둘 다, **inquiryCount가 매출로 둔갑 안 함**(최대 46건), 관계 방향 언급 |

## 8. 차트 렌더 안정화
- line marker 반경 1.7 → **1.05**(화면 튐 완화).
- tooltip 영역에 **min-height + 빈 placeholder** → hover 시 레이아웃 점프/깜빡임 방지.
- 미지원 chartType은 adapter에서 table/rankedBar로 fallback. chartSpec JSON 원문 미노출.

## 9. PII / 인과 단정 금지 / 외부 데이터
- `assertScopeInsightNoPii`: name/phone/email/address/memberKey/orderNo/syn_member_ 검사 → 모든 응답 `containsPii=false`. raw order/review/inquiry row 미노출(집계값만).
- "때문에/덕분에/원인입니다" 부재. 2024 baseline 기간은 쿠폰 효과 해석 금지 경고 포함.
- 외부(방문/광고/ROAS/GA4) 데이터는 requiredData로만 안내(추정/0 금지).

## 10. 실제 WRITE 없음
엔진 순수 함수 + 패널 분기 + 대시보드 렌더 미세조정. route/네트워크/localStorage 구조 변경 없음, 고도몰 WRITE/API 없음, Math.random 없음, synthetic/메모리 미변경.

## 11. 남은 후속 작업
- **P1:** scatter 실제 시각화(현재 rankedBar로 adapt), dualMetricBar 전용 렌더(두 막대 나란히), groupedBar 세로 막대화/combo.
- **P2:** scope에 productScope.goodsNos 등 명시 상품/브랜드 필터 파싱, customerScope×promotion 교차, anomalies 고도화(스파이크/아웃라이어 통계), 메모리 힌트로 보조축 우선순위 학습.
- LLM planner를 scope 보조 해석에 연결(숫자는 계속 deterministic).
