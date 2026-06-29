# Marketing Analysis Facts Core v0 (2026-06-29)

> **종류**: 분석 facts service — UI 없음, 채팅 연결 없음, 실제 고도몰 API 호출 없음, 실제 WRITE 없음, localStorage 변경 없음.
> **한 줄**: Spec-Based Synthetic Enrichment v0로 보강된 주문 데이터(회원그룹·쿠폰/할인·마일리지/예치금)를 이용해, **마케팅팀 공통 분석 facts를 코드가 계산**하는 순수 함수 빌더를 만들었다(AI는 이 facts 안에서만 설명).
> **산출물**: `src/services/marketingAnalysisFacts.ts` · 본 문서 · `scripts/smoke-marketing-analysis-facts-core-v0.mjs`(34/34 통과).

---

## 1. 작업 목적

상품팀 채팅이 `productTeamChatFacts`로 "숫자는 코드가 계산, AI는 설명"을 구현한 것처럼, 마케팅팀도 동일 패턴이 필요하다. 이 작업은 그 **데이터 계층(facts builder)**을 먼저 만든다. UI/채팅은 다음 단계.

핵심: 보강된 합법(spec-backed) 데이터로 **계산 가능한 것만 계산**하고, 외부 데이터가 필요한 지표는 숫자를 지어내지 않고 `requiredData`로만 남긴다. 인과관계는 단정하지 않고 관찰값만 제시한다.

## 2. 직전 synthetic enrichment 결과 요약 (입력 데이터)

`RevenueOrder`가 보유한 마케팅 필드:
* 회원그룹: `memberGroupName` / `memberGroupCode`
* 쿠폰/할인: `discountSummary`(totalGoods/Member/Coupon{Goods,Order,Delivery}DiscountAmount + totalCouponDiscountAmount + totalDiscountAmount + hasCoupon), `discountAmount`
* 마일리지/예치금: `useMileageAmount` / `useDepositAmount` / `rewardUseAmount`
* 기존: `isFirstPurchase`, `orderChannel`, `settleKind`, `memberKey`, `lines[].lineRevenue/categoryCode/goodsNo`

## 3. `buildMarketingAnalysisFacts` 역할

입력 `{ orders, products?, reviews?, inquiries?, period?, nowMs?, generatedAt? }` → `MarketingAnalysisFacts`.

* **기간 필터**: `period.preset`(all/today/last7d/last30d/thisMonth/lastMonth/thisYear/custom) 또는 custom start/end. `filterMarketingOrdersByPeriod`가 `orderDate` 기준 필터.
* **매출 집계 대상**: 결제완료 & 미취소 주문(`state.paid && !state.canceled`)만. 미결제/취소는 매출 미포함.
* **출력**: summary + 6개 차원(byMemberGroup/byOrderChannel/byCouponUsage/byRewardUsage/topProducts/topCategories/topBrands) + insights + requiredData + evidence + piiCheck.
* **deterministic**: 동일 입력 → 동일 결과(Math.random 미사용). 시간 의존은 preset 계산에 한정되며 `nowMs` 주입 가능(테스트 결정성).

보조 export: `filterMarketingOrdersByPeriod`, `calculateAverageOrderValue`, `buildMarketingRequiredDataNotices`, `assertMarketingFactsNoPii`.

## 4. 계산 가능한 지표 목록

| 그룹 | 지표 |
|---|---|
| 기본 매출 | 총매출 · 주문수 · 객단가 |
| 첫/재구매 | 첫구매 주문수/매출/객단가 · 재구매 주문수/매출/객단가 (`isFirstPurchase`) |
| 회원그룹 | 그룹별 매출/주문수/객단가/매출비중 (`memberGroupName`) |
| 주문채널 | 채널별 매출/주문수/객단가 (`orderChannel`, 자사몰/네이버페이/페이코 라벨) |
| 쿠폰/할인 | 쿠폰 사용 주문수/매출/객단가 · 미사용 객단가 · 총 할인액 · 쿠폰 할인 총액 · 사용/미사용 비교 |
| 마일리지/예치금 | 마일리지 사용 주문수 · 예치금 사용 주문수 · 총 리워드 사용액 · 리워드 사용/미사용 차원 |
| 상품/카테고리/브랜드 | 상품별/카테고리별/브랜드별 매출 TOP (orderLines + products 메타) |

> 브랜드/카테고리 라벨이 코드 수준(이름 미연동)이면 `external_required`가 아니라 **evidence(`ev_brand_meta`)에 "상품 메타데이터 부족/brandCode only"**로 남긴다. category/brand 축은 고도몰 상품 스펙에 존재하므로 외부 데이터로 분류하지 않는다.

## 5. 계산하지 않는 지표 (requiredData로 유지)

| 지표 | 필요 데이터(requiredData) |
|---|---|
| 가입→구매 전환율 | `memberSignupDate` (가입일 부재 → 첫구매 분석으로 대체) |
| 방문→주문 전환율 | `visitorSessions` |
| 상품조회→구매 전환율 | `productViewEvents` |
| 장바구니 이탈률 | `cartEvents` |
| ROAS | `adSpend`(+ 캠페인 attribution) |
| 광고 CTR | `adClicks` + `adImpressions` |
| GA4 행동 | `ga4` |
| SNS 성과 | `snsMetrics` |

이 지표들은 summary/차원에 **필드 자체가 없다**(추측 생성 금지). `buildMarketingRequiredDataNotices()`가 reason + unlocks와 함께 안내만 한다.

## 6. requiredData 정책

* 외부(고도몰 밖) 데이터가 있어야만 가능한 지표는 계산하지 않고 notice로만 노출.
* `memberSignupDate`는 회원 도메인(Member API) 필요 — Order 스펙 밖이라 이번에도 보류.
* 각 notice는 `{ key, label, reason, unlocks[] }` 구조로, 추후 데이터 연결 시 무엇이 해금되는지 명시.

## 7. PII self-check 정책

* 금지 키: `name/customerName/phone/mobile/email/address/receiverName/receiverPhone/receiverAddress/deliveryMemo/refundAccount`.
* 허용 식별자: `memberKey/customerId/segment/memberGroupName/memberGroupCode` (가명/집계 라벨).
* `assertMarketingFactsNoPii(obj)`가 결과(중첩 포함)를 스캔해 금지 키를 탐지. 빌더는 출력 직전 self-check → `piiCheck { containsPii, checkedKeys }`로 결과 동봉.
* smoke: `piiCheck.containsPii === false` + 결과/입력 주문 직접 스캔 모두 PII 없음 확인.

## 8. insights 생성 규칙 (deterministic, LLM 미사용)

규칙 기반으로 6개 후보 생성(≥5):
1. 매출 기여 1위 회원그룹
2. 쿠폰 사용 vs 미사용 객단가 **관찰**(인과 아님)
3. 재구매 매출 비중(≥50% positive)
4. 주문채널 매출 집중(≥70% warning)
5. 리워드(마일리지/예치금) 사용 관찰
6. 카테고리 매출 쏠림(≥50% warning)

각 insight는 `evidenceIds`로 evidence를 참조하고, 필요 시 `recommendedNextAction`(캠페인 후보 검토 등)을 단다.

## 9. 인과관계 단정 금지 원칙

* 금지: "쿠폰 때문에 매출이 올랐다", "VIP 덕분에" 같은 인과 단정.
* 허용: "쿠폰 사용 주문의 객단가가 높게 나타났다", "VIP 그룹이 매출의 44.7%로 가장 큰 비중" 같은 **관찰 표현**.
* smoke가 `때문에/덕분에/because of` 패턴 부재를 검증.

## 10. 실제 WRITE 없음

순수 함수 1개 파일 추가 + 문서 + smoke만. 컴포넌트/route/네트워크/`fetch`/localStorage 없음. 고도몰 API 호출 없음. 기존 파일 미수정(완전 additive).

## 11. 다음 작업 후보

1. **marketingTeamChatFacts v0** — 이 facts builder를 의도 감지(intent) + 채팅 응답에 연결(상품팀 패턴: 코드가 숫자, AI는 설명).
2. **마케팅팀 대시보드 v0** — summary/차원/insights/requiredData 카드 UI. 외부 필요 지표는 "외부 연동 필요" 표시.
3. **`buildSyntheticCommerceFacts` 확장** — 회원그룹/쿠폰/리워드 분포를 분석 facts에도 추가.
4. **Member READ Contract v0(설계)** — 가입일/성별/등급 회원 도메인 → 가입 코호트·연령 세그먼트(requiredData 해제).

## 12. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅(exit 0) · `npm run build` ✅(exit 0)
* `node scripts/smoke-marketing-analysis-facts-core-v0.mjs` ✅ **34/34**
* 회귀 무파손: `smoke-marketing-synthetic-commerce-enrichment-v0` 32/32 · `smoke-marketing-data-coverage-audit-v0` 30/30. (이번 작업은 기존 파일 미수정·신규 파일만 추가 → CS/상품팀/운영일지 무영향)

---

*문서 끝. (작성 2026-06-29, 브랜치 `feature/marketing-analysis-facts-core-v0`, smoke 34/34)*
