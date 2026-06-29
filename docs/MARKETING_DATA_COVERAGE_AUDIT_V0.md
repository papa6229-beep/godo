# Marketing Data Coverage Audit & Synthetic Customer Enrichment Plan v0 (2026-06-29)

> **종류**: 감사(Audit) — UI/WRITE 없음, 실제 고도몰 API 호출 추가 없음, 추측 데이터 생성 없음.
> **한 줄**: 마케팅팀 대시보드 구현 전에, 현재 synthetic Commerce Universe + 고도몰 Open API 스펙으로
> **"지금 계산 가능 / 보강하면 가능 / 외부 데이터 없이는 계산 금지"** 마케팅 지표를 코드 기준으로 분류했다.
> **산출물**: `src/services/marketingDataCoverageAudit.ts` · 본 문서 · `scripts/smoke-marketing-data-coverage-audit-v0.mjs`(30/30 통과).

---

## 1. 작업 목적

CS팀이 GODO AI OS 안에서 가장 완성된 부서가 된 다음, 다음 큰 줄기는 마케팅팀 대시보드다.
마케팅 분석은 **고객 세그먼트 × 주문/매출 × CS 이슈**를 엮는데, 그러려면 먼저 *지금 데이터로 무엇을 말할 수 있는지* 정직하게 알아야 한다.

이 작업은 화면을 만들지 않는다. 대신:

1. 현재 synthetic 고객/주문 데이터에 어떤 필드가 실제로 있는지 감사한다.
2. 주문만으로 지금 계산 가능한 마케팅 지표를 가린다.
3. 고도몰 스펙 보강이 필요한 지표 / 외부 데이터(GA·광고) 없이는 계산하면 안 되는 지표를 분리한다.
4. PII(이름/전화/이메일/주소)가 마케팅 분석 facts로 새지 않도록 분리 정책을 코드로 못박는다.

이렇게 하면 마케팅 대시보드 v0가 **없는 숫자를 지어내지 않고**, requiredData를 안내하며, 보강 시 그대로 켜지는 구조로 출발할 수 있다.

---

## 2. 현재 synthetic 고객 데이터 감사 결과

감사 대상 코드:
* `api/_shared/syntheticCommerceUniverse.ts` — `SyntheticCustomerProfile` / `SyntheticCsContact` 생성.
* `api/_shared/godomallRevenue.ts` — `RevenueOrder` / `RevenueOrderLine` + 분석용 가산 필드.
* `src/services/csCustomerManagementFacts.ts` — 고객 프로필 허브(표시 필드 + 미연동 placeholder).
* `docs/godomall_order_search_spec.md` — Order_Search 응답 필드 스펙.

### 2-1. SyntheticCustomerProfile (분석 계약, PII 없음) — **있는 것**

| 필드 | 상태 | 비고 |
|---|---|---|
| `customerId` / `memberKey` / `memNo` / `memId` | present | 분석은 가명 `memberKey`만 사용 |
| `segment` | present | new/returning/vip_candidate/dormant_risk/discount_sensitive/high_refund_risk (행동 세그먼트, 고도몰 회원그룹 아님) |
| `firstOrderDate` / `lastOrderDate` | present | **첫 "주문"일** — 가입일 아님 |
| `orderCount` / `repurchaseCount` / `refundCount` / `reviewCount` | present | 주문 파생 집계 |
| `totalPaidAmount` / `averageOrderValue` | present | 주문 파생 집계 |

### 2-2. 회원 속성 — **없는 것(미생성·미연동)**

CS 고객관리 화면(`csCustomerManagementFacts.ts`의 `basic` 블록)은 아래 필드를 선언하지만, 실제로 채우는 값은
`memberType`(상수 "회원") · `memberId` + (PII 경로일 때만) `name/phone/email/address` 뿐이다. 나머지는 전부 **미연동 placeholder**다 — 화면의 `미연동` 표시와 정확히 일치한다.

| 필드(화면 표기) | 상태 | 보강 경로 |
|---|---|---|
| 생년월일 `birthDate` / 성별 `gender` | missing | 회원(Member) API · syntheticEnrichmentNeeded |
| **가입일 `joinedAt`** | **missing** | **★ 회원 API joinDt — 부재 시 가입→구매 전환 금지** |
| 회원등급/회원그룹 `memberGroup` | missing | **Order_Search `memGroupNm` 존재 → 보강 가능** |
| 회원구분 `memberType` | missing | 현재 상수 표시(데이터 아님) |
| 가입경로 `joinPath` | missing | 회원 API · 유입 메타 |
| 메일수신 `emailOptIn` / SMS수신 `smsOptIn` | missing | 회원 API 수신동의 |
| 적립금/포인트/예치금 **잔액** | missing | 회원 API 잔액 (주문 *사용액*은 별도, 아래) |
| 로그인횟수 `loginCount` / 최근접속 `lastLoginAt` | not_in_spec | Order_Search 범위 밖 · 접속/회원 통계 API |

### 2-3. 회원 프로필 PII — **fake, contacts 전용**

`name / phone / email / address`는 분석 계약(`SyntheticCustomerProfile`)에 **없고**, `SyntheticCsContact`(fake PII)에만 있다.
→ 상태 `present_but_fake`, piiLevel `contact`. **마케팅 분석 입력에 의도적으로 미포함.**

### 2-4. 감사 분포(코드 실행 결과)

```
coverage status: present 7 · present_but_fake 4 · present_but_unlinked 1 ·
                 missing 11 · derived_possible 2 · not_in_spec 2 · external_required 4   (총 31 항목)
```

---

## 3. CS UI 표시 고객 필드 ↔ 실제 데이터 연결 상태

| 화면 필드 | 데이터 연결 | 출처 |
|---|---|---|
| 성명 · 핸드폰/전화번호 · 이메일 · 주소 | ✅ 표시(fake) | `SyntheticCsContact` (CS UI 경로 전용) |
| 아이디(memberId) · 회원구분 | △ 부분(상수/가명) | profile/hub |
| 닉네임 · 회원등급 · 성별 · 생년월일 · 가입일 · 가입경로 · 로그인횟수 · 최근접속 · 메일수신 · SMS수신 · 접속허용 · 배송방법 · 적립금 · 포인트 | ❌ 미연동 | placeholder (`csCustomerManagementFacts.ts` L199 주석과 일치) |
| 주문내역 · 문의/리뷰 · 클레임 · 누적매출 · 리스크 | ✅ 주문/문의/리뷰 파생 | orders + completed 병합 |

> **PII 원칙(유지)**: 위 PII 표시는 **CS 관리자 UI 경로(contacts 전달)에서만** 허용. 마케팅 facts/docs/smoke/LLM context에는 금지.

---

## 4. 고도몰 Open API 스펙에서 확인 가능한 마케팅 분석 재료

`docs/godomall_order_search_spec.md` 기준, Order_Search 응답이 이미 제공하는(=real 연결 시 즉시 확보) 축:

| 축 | 스펙 필드(예) | 현재 synthetic |
|---|---|---|
| 회원그룹 | `memGroupNm` | 미생성(보강 대상) |
| 쿠폰/할인 적용 결과 | `totalCouponGoodsDcPrice` · `totalCouponOrderDcPrice` · `totalMemberDcPrice` · `goodsDcPrice` | 미생성(보강 대상) |
| 마일리지/예치금 사용 | `useMileage` · `useDeposit` · `totalMileage` · `memberMileage` | 미생성(보강 대상) |
| 결제수단 | `settleKind` | ✅ 보유 |
| 주문채널 | `orderChannelFl` | ✅ 보유 |
| 첫구매 | `firstSaleFl` → `isFirstPurchase` | ✅ 보유 |
| 클레임/취소/환불/교환 | `claimData.handleMode` → `claimSummary.claimTypes` | ✅ 보유 |
| 상품/카테고리/브랜드 | Products READ 조인 | ✅ 보유 |

**현재 스펙만으로 확인 불가 / 외부 확장 필요** (추측 생성 금지):
회원가입일 전체 조회 · 방문자 수 · 유입수 · 상품 조회수 · 장바구니 이탈 · 페이지 이동 흐름 · 외부 광고비 · 광고 클릭/노출 · ROAS · GA4 행동 · SNS/블로그/유튜브/틱톡 성과.

---

## 5. 주문 기반으로 지금 계산 가능한 지표 (available_now)

`auditMarketingMetricAvailability`가 `hasOrders + hasMemberId`만으로 `available_now`로 분류하는 지표 (총 12개):

| 지표 | 공식 |
|---|---|
| 첫구매 주문수 / 매출 / 객단가 | `firstSaleFl` 또는 `memberKey+min(orderDate)` 기준 |
| 재구매 주문수 / 매출 / 객단가 | 회원별 2번째 이후 주문 |
| 첫구매→재구매 소요기간 | `avg(2번째 orderDate − 1번째 orderDate)` |
| 고객별 주문횟수 / 누적매출 | `count/Σ by memberKey` (paid) |
| 고객별 첫·최근 구매일 | `min/max(orderDate)` |
| 주문채널별 매출 | `groupBy(orderChannel) Σ totalAmount` |

> 주의: 가입일이 없으므로 "가입 → 구매 전환율"은 계산하지 않고 **"첫구매 고객 분석"으로 분리**한다.

---

## 6. 고객 데이터 보강이 필요한 지표 (available_if_enriched)

고도몰 스펙엔 있으나 현재 synthetic이 미생성 → 보강 시 켜지는 지표 (총 5개):

| 지표 | 필요 보강 필드 |
|---|---|
| 회원그룹별 매출 / 객단가 / 주문수 | `memGroupNm` |
| 쿠폰 사용 / 미사용 고객군 | `totalCoupon*DcPrice` 등 |

**syntheticEnrichmentNeeded** 권고: `syntheticCommerceUniverse.ts`의 rawOrder에 `memGroupNm`, `useMileage/useDeposit`,
쿠폰 할인 필드를 결정적으로 추가하고, `godomallRevenue.ts` mapper가 `memberGroup`/`couponSummary`/`mileageUse`를 파생하도록 가산 필드를 확장한다(하위호환 optional). 가입일(`joinDate`)은 회원 도메인이므로 별도 Member READ 단계에서 다룬다.

---

## 7. 외부 데이터 없이는 계산하면 안 되는 지표 (requires_external_data / do_not_compute)

| 지표 | 분류 | 사유 |
|---|---|---|
| 가입→구매 전환율 | **do_not_compute** | 가입일 부재 — 첫구매 분석으로 대체 |
| 상품조회→구매 전환율 | requires_external_data | 행동 이벤트(GA4) 필요 |
| 장바구니 이탈률 | requires_external_data | 행동 로그 필요 |
| 방문→주문 전환율 | requires_external_data | 방문자/유입 로그 필요 |
| 광고 ROAS / CTR | requires_external_data | 광고 매체 API 필요 |
| GA4 행동/유입 분석 | requires_external_data | GA4 필요 |

```
metric availability: available_now 12 · available_if_enriched 5 ·
                    requires_external_data 6 · do_not_compute 1   (총 24 지표)
```

> **추측 생성 금지**: 위 항목은 마케팅 대시보드에서 숫자를 만들어내지 않고 `requiredData` 안내만 표시한다.

---

## 8. PII / identity / contact 분리 원칙 (코드로 강제)

`marketingDataCoverageAudit.ts`에 정책을 상수/가드로 박았다:

* `MARKETING_FACTS_ALLOWED_IDENTITY_KEYS = ['memberKey','customerId','segment']` — 마케팅 facts 허용 식별자(가명/집계만).
* `MARKETING_FACTS_FORBIDDEN_PII_KEYS` — `name/customerName/receiverName/nickname/phone/mobile/email/address/deliveryMemo/refundBank/refundAccount` + 원문 식별자 `memId/memNo`.
* `marketingFactsContainPii(obj)` — 마케팅 facts builder가 출력 직전 self-check로 호출 → 금지 키가 섞이면 키 목록 반환(중첩 탐지).

분리 요약:
* **CS 관리자 UI / 고객관리**: 고객 PII 표시 가능(contacts 경로).
* **마케팅 분석 facts / docs / smoke / LLM context**: `memberKey`(가명) + 집계만. 이름/전화/이메일/주소 직접 노출 금지.
* 지역 세그먼트가 필요하면 주소가 아닌 **시/군/구 비식별 파생**으로만.

---

## 9. 실제 WRITE 없음 확인

* 본 작업은 순수 함수 감사 + 문서 + smoke만 추가. 컴포넌트/route/네트워크 호출 없음.
* `fetch`/`axios`/`.post`/WRITE 경로 없음. 고도몰 API 호출 추가 없음. localStorage 변경 없음.

---

## 10. 다음 작업 제안

1. **Synthetic Customer Enrichment v0** — `syntheticCommerceUniverse.ts`에 `memGroupNm` · 쿠폰/할인 · `useMileage/useDeposit`를 결정적으로 추가하고 mapper 파생 필드 확장. → §6 지표 available_now화.
2. **Member READ Contract v0(설계)** — 가입일/성별/생년월일/수신동의/등급을 위한 회원 도메인 READ 계약 정의(가입 코호트·연령 세그먼트 해금). 가입→구매 전환의 do_not_compute 해제 조건.
3. **marketingTeamChatFacts v0** — 본 감사의 `available_now` 12지표를 facts builder로 구현(상품팀 패턴 재사용, `marketingFactsContainPii` self-check 통과).
4. **마케팅팀 대시보드 v0** — 첫구매/재구매/채널/리스크 세그먼트 + requiredData 안내 카드(없는 광고/GA 데이터는 빈칸이 아니라 "외부 연동 필요" 표시).

---

*문서 끝. (작성 2026-06-29, 브랜치 `audit/marketing-data-coverage-synthetic-customer-v0`, smoke 30/30 통과)*
