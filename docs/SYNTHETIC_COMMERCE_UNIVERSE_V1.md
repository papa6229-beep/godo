# Synthetic Commerce Universe v1

> **작성일**: 2026-06-26 · **브랜치**: `feature/synthetic-commerce-universe-v1`
> **코드**: `api/_shared/syntheticCommerceUniverse.ts` + `syntheticCommerceFacts.ts` · **smoke**: `scripts/smoke-synthetic-commerce-universe.mjs`(26/26)

## 1. 작업 목적
실제 쇼핑몰처럼 움직이는 **1년치 가상 commerce 세계**를 생성한다 — 결제·재구매·취소·환불·반품·교환·리뷰·문의·CS 이슈를 하나의 일관된 세계로. 목적은 fake chart가 아니라, GODO AI OS가 이 전부를 **real 전환 시 재사용 가능한 contract/facts flow**로 해석 가능한지 검증하는 것.

- **데이터 생성 + facts helper + smoke 중심** (UI 변경 아님).

## 2. Commerce Data Contract v0와의 관계
- universe 주문은 **godoRaw 흐름**으로 만든다: 가상 Order_Search raw → `mapOrdersToRevenue` → `RevenueOrder`.
- 따라서 Contract v0의 가산 필드(memberKey·settleKind·orderChannel·claimSummary·isFirstPurchase·dataKind)가 **자동으로 채워진다**. universe는 그 위에 `syntheticSource='commerce_universe_v1'`를 stamp.
- real API와 **같은 통로**(normalize→mapper→RevenueOrder→facts).

## 3. 기존 syntheticRevenue와의 관계
- `syntheticRevenue.ts`(legacy)·`syntheticGodomallOrders.ts`(godoRaw) **삭제 안 함**. universe는 **별도 generator**로 추가(둘과 독립, 무영향).
- universe는 godoRaw와 같은 mapper를 쓰되, **고객 정체성·재구매·리뷰·문의·CS contact**를 추가로 엮는다(godoRaw는 주문 단위만).

## 4. 생성 도메인
| 도메인 | 타입 | 규모(기본) |
|---|---|---|
| 고객 프로필 | `SyntheticCustomerProfile` | 320명 (segment 6종) |
| 주문/매출 | `RevenueOrder`(Contract v0) | ~800건 (12개월) |
| CS contact (fake PII) | `SyntheticCsContact` | 고객당 1 |
| 리뷰 | `SyntheticReview` | 구매확정 주문 일부 (~170) |
| 문의/CS | `SyntheticInquiry` | 주문/클레임 기반 (~150) |

세그먼트: `new / returning / vip_candidate / dormant_risk / discount_sensitive / high_refund_risk` (행동 파라미터: 주문빈도·환불확률·리뷰확률·객단가 배수).

## 5. 연결 규칙
- **고객↔주문**: 주문 raw에 고객 memNo/memId → `mapOrdersToRevenue`가 `memberKey=syn_member_<memNo>` 파생. 같은 고객의 여러 주문 → 재구매.
- **주문↔리뷰**: 구매확정(s1/e5) 주문 일부. 재구매 고객 긍정↑, 환불 이력 부정↑. rating/sentiment/topic 연동.
- **주문↔문의**: 클레임 주문은 ~70%, 정상 ~12% 문의 발생. topic이 claim 종류(refund/exchange/payment)와 연동.
- **주문↔claim**: 세그먼트 refundProb로 클레임 발생 → raw claimData(handleMode/refundPrice) → `claimSummary` 축약(raw 미노출).
- **상품↔카테고리/브랜드**: 실 상품의 categoryCode/brandCode 사용. 라벨은 catalogLookup으로 해석(없으면 코드).
- **contact↔customer**: customerId/memberKey로 연결, fake PII는 contact에만.

## 6. fake PII 정책
- synthetic mode에서 fake PII 생성(CS 응대 훈련): `가상고객 NNN` / `010-0000-NNNN` / `synNNN@example.test` / `서울시 테스트구 샘플로 N` / `(가상)테스트은행` 등.
- 모든 contact에 `PiiOrigin{isSynthetic:true, isFakePii:true, piiType:'fake', sourceType:'synthetic', syntheticProfile:'commerce_universe_v1'}`(= `SYNTHETIC_FAKE_PII_ORIGIN`) 부착.
- **analytics(orders/facts)에는 fake PII가 일절 없다**(smoke 18로 검증: '가상고객'/'010-0000'/'@example.test'/'샘플로' 미등장).

## 7. Analytics Contract / CS Contact Contract 분리
- **Analytics**(상품/마케팅/총괄): `universe.orders`(RevenueOrder, 가명 memberKey만) + `buildSyntheticCommerceFacts` 결과. PII 없음.
- **CS Contact**(CS팀): `universe.contacts`(`SyntheticCsContact`, fake PII). `commerceContactContract.ts` 정책 준수.

## 8. 카테고리/브랜드 활용
- `buildSyntheticCommerceFacts(universe, products, catalogLookup)`가 `deriveRevenueCatalogBreakdown`으로 카테고리/브랜드 매출 분해. catalogLookup 있으면 `오나홀`/`스마트홈` 라벨, 없으면 코드(resolved=false).
- 리뷰 평점도 categoryCode/brandCode로 집계(`categoryReviewRating`/`brandReviewRating`).

## 9. 마케팅/팀 facts (`syntheticCommerceFacts.ts`)
총 고객·신규·재구매 고객·**재구매율**·**평균 객단가**·VIP후보/할인민감/환불위험 고객 수·결제수단/주문채널 분포·**취소/환불/반품/교환율**·카테고리/브랜드 매출·카테고리/브랜드 리뷰 평점·CS TOP 주제·미응답/상담필요 수·환불위험 상품·재구매 유망 상품.
- **숫자는 helper가 계산**(AI 생성 금지).

## 10. real API 전환 시 재사용
주문은 godoRaw 흐름이라 real Order_Search로 갈아끼워도 같은 `RevenueOrder`+facts를 쓴다. 리뷰/문의는 v1은 synthetic 도메인이며, 추후 `board_list` READ + board mapper로 같은 facts 형태에 real 데이터를 흘려보내면 동일 helper 재사용.

## 11. 제한사항
- **UI 미연결**(다음 단계). universe/facts는 generator·helper로만 존재(route/대시보드 미연결).
- 리뷰/문의는 synthetic 도메인(board_list real READ 전).
- claim 라벨(claimReasonLabel 등)은 Code_Search 연결 전 undefined.
- 카테고리/브랜드 라벨은 catalogLookup 제공 시에만 해석.

## 12. 다음 단계
1. **UI/Facts Routing**: universe/facts를 부서 채팅(CS/마케팅/총괄)에 연결(상품팀 패턴 재사용).
2. **Board List READ v0**: 리뷰/문의 real READ → synthetic 도메인을 real로 교체.
3. **Department Facts Routing v0** → **Agent Skills v1**: 각 팀 에이전트가 facts로 분석/제안/경고.
