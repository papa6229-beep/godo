# Spec-Based Marketing Synthetic Enrichment v0 (2026-06-29)

> **종류**: synthetic 데이터 보강(spec-backed) — UI 없음, 실제 고도몰 API 호출 추가 없음, 실제 WRITE 없음, 외부(GA/광고) 데이터 생성 없음.
> **한 줄**: 직전 coverage audit의 `available_if_enriched` 항목 중 **고도몰 Order_Search 스펙에 근거가 있는 것**(회원그룹·쿠폰/할인·마일리지/예치금)만 synthetic universe에 deterministic하게 보강해 마케팅 지표를 `available_now`로 끌어올렸다.
> **산출물**: `api/_shared/syntheticCommerceUniverse.ts` · `api/_shared/godomallRevenue.ts`(타입/매퍼) · `src/services/marketingDataCoverageAudit.ts` · 본 문서 · `scripts/smoke-marketing-synthetic-commerce-enrichment-v0.mjs`(32/32 통과).

---

## 1. 작업 목적

마케팅팀 대시보드 v0의 핵심 재료(회원그룹별 매출, 쿠폰 사용/미사용 세그먼트, 리워드 사용 성향)를 **없는 숫자를 지어내지 않고** 공급하기 위해, 고도몰 주문 스펙에 실제 필드 근거가 있는 데이터만 synthetic 세계에 보강한다. 보강 후에도 데이터 계약은 real API와 동일 구조를 유지해, 추후 real 연결 시 mapper만 동일하게 작동한다.

## 2. 직전 coverage audit 결과 요약 (Marketing Data Coverage Audit v0)

```
available_now (12):       첫구매·재구매(주문수/매출/객단가), 첫→재구매 기간,
                          고객별 주문횟수/누적매출/첫·최근구매일, 주문채널별 매출
available_if_enriched (5): 회원그룹별 매출/객단가/주문수, 쿠폰 사용/미사용 세그먼트  ← 이번 보강 대상
do_not_compute (1):       가입→구매 전환율 (가입일 부재)
requires_external_data (6): 상품조회→구매, 장바구니 이탈, 방문→주문, ROAS, CTR, GA4
```

## 3. 이번 v0에서 보강한 필드

### 3-1. 회원그룹 (memberGroup)
* **customer profile**: `SyntheticCustomerProfile.memberGroupNm` / `memberGroupCode`.
* **주문(raw → mapper)**: raw `memGroupNm`/`memGroupNo` → `RevenueOrder.memberGroupName`/`memberGroupCode`.
* 그룹: `신규회원(G_NEW) · 재구매회원(G_REPEAT) · VIP(G_VIP) · 휴면위험(G_DORMANT) · 일반회원(G_NORMAL)`.

### 3-2. 쿠폰/할인 결과 (Order_Search 스펙 근거)
* **주문 헤더(raw → mapper `RevenueDiscountSummary`)**: `totalGoodsDcPrice` / `totalMemberDcPrice` / `totalCouponGoodsDcPrice` / `totalCouponOrderDcPrice` / `totalCouponDeliveryDcPrice` → `discountSummary`(상품/회원/쿠폰별 + 합계 + `hasCoupon`).
* **라인(`RevenueOrderLine`)**: `goodsDiscountAmount` / `couponGoodsDiscountAmount` / `couponOrderDiscountShareAmount`(라인 안분, 정보용).
* **금액 관계**: `RevenueOrder.grossAmount`(=상품매출+배송비) − `discountAmount` − `rewardUseAmount` === `totalAmount`(실제 결제액). smoke로 invariant 검증.

### 3-3. 마일리지/예치금 사용 (Order_Search 스펙 근거)
* **주문(raw → mapper)**: raw `useMileage`/`useDeposit` → `RevenueOrder.useMileageAmount`/`useDepositAmount`, 합계 `rewardUseAmount`.

> 모든 가산 필드는 **optional·하위호환**. real 주문(raw에 해당 키 없음)은 그대로 통과 → mapper가 enrichment 필드를 `undefined`로 둠. 기존 CS/상품팀/운영일지/대시보드 동작 무변경.

## 4. 생성 정책 (deterministic, Math.random 미사용)

| 항목 | 정책 |
|---|---|
| **회원그룹** | `segment → group` 고정 매핑. segment가 고객당 불변이므로 **같은 memberKey는 항상 같은 그룹**(주문별로 흔들리지 않음). 모든 주문에 부착. |
| **쿠폰/할인** | 일부 주문만. 쿠폰 확률 base 18% + 첫구매 +17% + discount_sensitive +22% + VIP +10%. 쿠폰상품할인 5~15%, 주문쿠폰 2~7%(40%), 무료배송쿠폰(30%), 등급할인 3~8%(VIP/재구매 35%), 상품프로모션 3~7%(10%). **상품측 할인 합 ≤ 상품액 60%**(초과 시 비례 축소). |
| **마일리지/예치금** | 일부 주문만. base 12% + VIP +25% + 재구매 +10%. 마일리지 ≤ 남은 결제액×0.5, 예치금 ≤ 잔여×0.5 → **리워드 합 < 남은 결제액**(settle≥0 guard). |
| **settlePrice** | `max(0, 상품매출 + 배송비 − 할인합 − 리워드합)`. 음수 불가. |

실측 분포(seed 42, 822주문): 할인 449 · 쿠폰 281 · 마일리지 198 · 예치금 59. 그룹 분포 VIP 292 / 재구매 336 / 신규 105 / 일반 46 / 휴면 43.

## 5. 왜 memberGroup / coupon / mileage / deposit만 보강했나

이 4가지는 **고도몰 Order_Search 응답 스펙에 실제 필드가 존재**한다(`docs/godomall_order_search_spec.md`: `memGroupNm`, `totalCoupon*DcPrice`, `useMileage`, `useDeposit`). 즉 real 연결 시 동일 의미의 값이 그대로 들어오므로, synthetic은 "미래 real 데이터의 모양"을 미리 채우는 spec-backed 보강이다. 추측이 아니라 계약 채움이다.

## 6. 왜 가입일/성별/생년월일/수신동의/로그인횟수는 제외했나

* **가입일/성별/생년월일/수신동의/로그인횟수/최근접속**은 **주문(Order) 도메인이 아니라 회원(Member)/접속 통계 도메인**이다. Order_Search 응답으로는 확보되지 않는다.
* 이들을 synthetic으로 만들면 *주문 스펙에 없는 값을 지어내는* 것이 되어 원칙(추측 생성 금지) 위반. → 별도 **Member READ Contract** 단계(향후)에서 다룬다.
* 특히 **가입일**이 없으므로 "가입→구매 전환율"은 이번에도 `do_not_compute`로 유지(첫구매 분석으로 대체).

## 7. spec-backed synthetic enrichment vs external-required data

| 구분 | 예 | 처리 |
|---|---|---|
| **spec-backed (이번 보강)** | 회원그룹·쿠폰/할인·마일리지/예치금 | Order_Search 스펙 근거 → synthetic 생성 OK, real 연결 시 그대로 |
| **member-domain (보류)** | 가입일·성별·수신동의·로그인 | Member API 필요 → 이번 v0 생성 금지 |
| **external-required (금지)** | 방문자·상품조회·장바구니·광고비·ROAS·GA4·SNS | 고도몰 밖 → 절대 생성 금지, requiredData 안내만 |

## 8. 새로 available_now가 된 마케팅 지표

`auditMarketingMetricAvailability`가 enrichment 플래그(hasMemberGroup/hasCouponDiscountFields/hasMileageDepositFields)로 `available_now` 처리:

* 회원그룹별 매출 / 객단가 / 주문수
* 쿠폰 사용 주문수 / 매출 / 객단가, 쿠폰 미사용 객단가, 쿠폰 할인 총액
* 마일리지 사용 주문수, 예치금 사용 주문수

coverage audit에서도 `memberGroup` / `couponDiscount` / `mileageDepositUse` 항목이 `missing → present`로 이동(보강 데이터 투입 시 자동 승격).

## 9. 여전히 계산 금지 / 외부 데이터 필요한 지표 (불변)

* `do_not_compute`: 가입→구매 전환율.
* `requires_external_data`: 상품조회→구매 전환율, 장바구니 이탈률, 방문→주문 전환율, ROAS, 광고 CTR, GA4 행동(+SNS 성과).

## 10. PII 분리 정책

* **분석 주문(`RevenueOrder`)·customer profile**에는 contact PII(name/phone/email/address)가 **없다**(smoke 검증). 식별은 가명 `memberKey`.
* `memberGroupName/Code`는 PII가 아닌 집계용 그룹 라벨 → 마케팅 facts 허용.
* profile의 원문 식별자 `memId/memNo`는 `MARKETING_FACTS_FORBIDDEN_PII_KEYS`에 포함 → `marketingFactsContainPii`가 탐지(= facts로 넘기기 전 strip 대상). 마케팅 facts는 `memberKey`만 사용.
* fake PII는 여전히 CS contact 경로(`SyntheticCsContact`) 전용. 보강은 이 경로를 건드리지 않음.

## 11. 실제 WRITE 없음 확인

순수 생성/매핑 로직 + 타입 + 문서 + smoke만 변경. 컴포넌트/route/네트워크/`fetch`·WRITE 경로 없음. 고도몰 API 호출 추가 없음. settlePrice는 synthetic 내부 계산값(고도몰 재고/주문 미변경).

## 12. 검증 결과

* `npm run lint` ✅ · `npx tsc -b` ✅(exit 0) · `npm run build` ✅(exit 0)
* `node scripts/smoke-marketing-synthetic-commerce-enrichment-v0.mjs` ✅ **32/32**
* 회귀 무파손: `smoke-synthetic-commerce-universe` 26/26 · `smoke-marketing-data-coverage-audit-v0` 30/30.

## 13. 다음 작업 후보

1. **marketingTeamChatFacts v0** — available_now 지표(회원그룹/쿠폰/리워드 포함) facts builder, `marketingFactsContainPii` self-check 통과.
2. **마케팅팀 대시보드 v0** — 회원그룹별 매출·쿠폰 세그먼트·리워드 성향 카드 + requiredData 안내(가입/방문/광고는 "외부 연동 필요").
3. **Member READ Contract v0(설계)** — 가입일/성별/등급/수신동의 회원 도메인 READ → 가입 코호트·연령 세그먼트 해금(do_not_compute 해제 조건).
4. **synthetic facts 확장** — `buildSyntheticCommerceFacts`에 회원그룹/쿠폰/리워드 분포 추가(상품팀 패턴 재사용).

---

*문서 끝. (작성 2026-06-29, 브랜치 `feature/marketing-synthetic-commerce-enrichment-v0`, smoke 32/32, 회귀 무파손)*
