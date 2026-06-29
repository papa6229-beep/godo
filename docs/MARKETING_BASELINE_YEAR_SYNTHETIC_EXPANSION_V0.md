# Marketing Baseline Year Synthetic Expansion v0 (2026-06-29)

> **종류**: synthetic 데이터 확장 — UI 없음, 실제 고도몰 API 호출 추가 없음, 실제 WRITE 없음, 외부(GA/광고) 데이터 생성 없음.
> **한 줄**: synthetic Commerce Universe에 **쿠폰/이벤트 없는 baseline year(직전 12개월)** 를 추가해 promotion year(최근 12개월)와 **연/월/쿠폰 유무 비교**가 가능하도록 했다. `isFirstPurchase`는 2년치 기준 전역 재계산.
> **산출물**: `syntheticCommerceUniverse.ts`(baseline 생성) · `godomallRevenue.ts`(scenario 타입) · `godomallResource.ts`(live 활성화) 수정 + 본 문서 + `scripts/smoke-marketing-baseline-year-synthetic-expansion-v0.mjs`(29/29).

---

## 1. 작업 목적 / 왜 2년치인가

마케팅 분석의 핵심은 총합이 아니라 **비교**(월별/연별/쿠폰 유무/도입 전후)다. 기존 universe는 1년치라 "쿠폰 있는 해 vs 없는 해", "작년 같은 달 대비" 같은 질문에 답할 수 없었다. 이번 작업은 **쿠폰/이벤트가 없는 기준년도**를 한 해 추가해, 마케팅팀이 *이미 있는 주문 데이터 조합으로 계산 가능한 비교*와 *진짜 외부 데이터가 필요한 지표*를 구분하게 하는 기반을 만든다.

## 2. baseline year / promotion year 정의

* **promotion year**: 최근 12개월(`end` ~ `end-windowDays`). 쿠폰/할인/마일리지/회원그룹 enrichment 존재(기존 데이터).
* **baseline year**: 직전 12개월(`end-windowDays` ~ `end-2*windowDays`). **쿠폰/이벤트/프로모션 할인 없음**, 일반 주문/상품/고객/리뷰/문의/클레임 흐름은 존재.
* 옵션: `buildSyntheticCommerceUniverse(products, { includeBaselineYear: true })`. 기본값 false(직접 호출 단위테스트는 1년 유지). **`godomallResource`가 live 데이터(`commerce_universe_v1`)에 한해 true로 활성화** → 대시보드/채팅은 2년치를 본다.
* 실측(seed 42, endDate 2026-06-26): 총 1339주문(baseline 635 / promotion 704), span 719일.

## 3. baseline year 쿠폰/이벤트 비활성 정책

baseline 주문은 `allowCoupons=false`로 생성되어 다음이 보장된다(smoke 검증):
* `discountSummary.hasCoupon === false`
* `totalCouponDiscountAmount / totalCouponGoodsDiscountAmount / totalCouponOrderDiscountAmount / totalCouponDeliveryDiscountAmount === 0`
* `totalGoodsDiscountAmount / totalMemberDiscountAmount === 0`(이벤트성 상품·회원 할인도 baseline 미생성)
* 라인 `couponGoodsDiscountAmount / goodsDiscountAmount === 0`
* `discountAmount === 0`

> 쿠폰 할인 필드를 명시적 `'0'`으로 stamp해 `discountSummary`가 hasCoupon=false인 0 요약으로 생성되도록 했다(undefined가 아니라 명시적 0).

## 4. 마일리지/예치금 정책

마일리지/예치금은 쿠폰 이벤트가 아니라 **기본 결제/리워드 사용 흐름**이므로 baseline year에서도 **낮은 비율로 유지**(기존 확률 그대로, 쿠폰과 분리). `rewardUseAmount`로만 반영되며 `discountSummary`(쿠폰)와 혼동되지 않는다. 잔액 생성은 하지 않음.

## 5. 생성한 주문/리뷰/문의/클레임 범위

* **주문**: cohort별로 both(60%)/promotion_only(22%)/baseline_only(18%)로 분배 → 일부 고객은 양년, 일부는 한 해만. 각 시나리오 window 안의 날짜로 생성.
* **리뷰/문의/클레임**: 기존 generator와 동일 로직으로 주문 메타에서 파생(구매확정 일부 리뷰, 클레임/정상 일부 문의). baseline 주문 → baseline 범위 리뷰/문의(orderNo/goodsNo 연결 유지). 비율은 기존과 동일.
* **ID 충돌 없음**: `orderSeq` 전역 증가 → orderNo unique. memberKey=`syn_member_{memNo}` 고객당 고정. reviewId/inquiryId 전역 시퀀스.

## 6. firstPurchase 재계산 정책

2년치 주문을 합친 뒤 **memberKey별 "가장 이른 결제완료·미취소 주문" 1건만 `isFirstPurchase=true`**, 나머지 false로 전역 재계산(map 후 일괄). baseline 추가로 promotion의 첫구매/재구매 분포가 달라질 수 있어 2년 합산 기준이 자연스럽다. smoke는 exact count가 아니라 **consistency**(고객당 1건, 그게 가장 이른 결제 주문) 검증.

## 7. syntheticScenario metadata

주문에 비-PII 테스트 metadata 추가:
* `syntheticScenario: 'baseline_no_promotion' | 'promotion_year'`
* `syntheticYearLabel: 'baseline' | 'promotion'`

> **`syntheticScenario`/`syntheticYearLabel`는 GODO AI OS 테스트/분석 편의용 metadata이며, 고도몰 원본 Order_Search API 필드가 아니다.** 실제 스펙 필드로 위장하지 않는다(별도 optional 필드, 문서 명시).

## 8. 마케팅 분석에서 새로 가능해진 비교

`buildMarketingAnalysisFacts`가 2년치에서 정상 작동(custom period로 연도 분리 검증):
* baseline custom period: `couponOrderCount === 0`, `totalCouponDiscountAmount === 0`
* promotion custom period: `couponOrderCount > 0`, `totalCouponDiscountAmount > 0`

가능해진 비교(주문 데이터 조합):
월별 매출/주문수/객단가 · 월별 쿠폰 사용/미사용 주문수·객단가 · 연도별 매출/객단가 · 연도별 회원그룹/주문채널 매출 · 연도별 첫구매/재구매 매출 · 작년 대비 VIP/카테고리 매출 비중 변화.

## 9. 여전히 계산 금지인 외부 데이터 지표

가입→구매 전환율 · 방문→주문 전환율 · 상품조회→구매 전환율 · 장바구니 이탈률 · ROAS · 광고 CTR · GA4 행동 · SNS 성과 — 계속 `requiredData`로만 안내(이번 확장은 외부 데이터를 만들지 않음). 방문자/상품조회/장바구니 이벤트, 광고/GA/SNS 데이터 미생성.

## 10. PII 분리 정책

* baseline 확장은 contact(fake PII) 경로를 기존 원칙대로 유지(고객당 1 contact, `isFakePii=true`). 마케팅 facts/분석 주문/리뷰/문의에 PII 미반입(smoke가 가상고객/010-0000/@example.test 등 부재 확인).
* 식별은 가명 `memberKey`만. `marketingAnalysisFacts.piiCheck.containsPii === false`.

## 11. 실제 WRITE 없음

generator/mapper/resolver(synthetic 생성) + 문서 + smoke만 변경. route 신규 없음, 네트워크/localStorage/고도몰 WRITE 없음. Math.random 미사용(deterministic seed). 단일년(옵션 off) 출력은 기존과 동일(universe smoke 822주문·320고객 불변 확인).

## 12. 이번 v0에서 하지 않은 것

채팅으로 중앙 그래프 변경 · chartSpec engine · 월×쿠폰 교차 그래프 UI · 외부 광고/GA/SNS 생성 · 방문/상품조회/장바구니 이벤트 · Member READ 계약 · 가입일/성별/연령/수신동의 생성 — 다음 작업.

## 13. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-baseline-year-synthetic-expansion-v0` ✅ 29/29
* 회귀: `dashboard-focused-insight-layout-v01` 27/27 · `dashboard-v0` 30/30 · `facts-core` 34/34 · `enrichment` 32/32 · `coverage-audit` 30/30 · `synthetic-commerce-universe` 26/26(822/320 불변) · `team-chat-facts` 32/32 · `department-facts-routing` 12/12 · `commerce-data-contract` 21/21 · `universe-activation` 10/10.

## 14. 다음 작업 후보

1. **월별/연별 비교 facts** — `buildMarketingAnalysisFacts`에 월별 버킷 + YoY(작년 같은 달) 비교 추가.
2. **대시보드 연/월 비교 그래프** — baseline vs promotion, 쿠폰 도입 전후 비교 시각화.
3. **마케팅 채팅 연/월 비교 intent** — "올해와 작년 월별 매출 비교" 등 grounding.
4. **Member READ Contract v0** — 가입일/성별 → 가입 코호트(requiredData 해제).
