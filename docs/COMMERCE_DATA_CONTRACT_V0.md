# Commerce Data Contract v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/commerce-data-contract-v0`
> **코드**: `godomallRevenue.ts`(가산 필드) · `godomallResource.ts`(기본 경로) · `commerceContactContract.ts`(CS 계약 초안) · **smoke**: `scripts/smoke-commerce-data-contract.mjs`(21/21)

## 1. 작업 배경
Synthetic Commerce Universe v1을 만들기 전에, **real/synthetic이 같은 mapper/facts 통로를 타고**, 분석에 필요한 필드(결제수단·취소/환불·재구매·고객식별)를 잃지 않는 **공통 데이터 계약**을 먼저 확정한다.

## 2. 왜 Universe 전에 필요한가
- 기존 `RevenueOrder`는 **상품매출 투영**이라 memNo/settleKind/claimData를 **mapper에서 버린다** → 재구매·객단가·결제수단·취소/환불 facts를 만들 수 없었다.
- 또 synthetic 기본 경로가 `legacy`(mapper 우회)라 "real과 같은 통로" 원칙이 절반만 성립했다.
- → 이 v0에서 계약을 넓히고 통로를 통일한다(데이터 대량 생성은 v1).

## 3. 기존 RevenueOrder의 한계 (해소 대상)
memberKey·결제수단·주문채널·클레임(취소/반품/교환/환불)·첫구매 여부가 없음 → 분석 facts 불가.

## 4. RevenueOrder optional 확장 정책 (가산·하위호환)
기존 필드명/필드 **변경·삭제 없음**. 아래를 **optional**로만 추가:

| 필드 | 의미 | 출처 |
|---|---|---|
| `memberKey?` | 가명 분석키 | memNo/memId 가명화 |
| `isFirstPurchase?` | 첫구매 | firstSaleFl |
| `settleKind?` / `paymentMethodCode?` | 결제수단 코드 | settleKind |
| `paymentMethodLabel?` | 결제수단 한글 | Code_Search 연결 전 undefined |
| `orderChannel?` / `orderChannelLabel?` | 주문채널 | orderChannelFl |
| `claimSummary?` | 클레임 **축약** | 라인 claimData + cancelDt |
| `dataKind?` | real/synthetic/mock | sourceType 파생 |
| `syntheticSource?` | legacy/godoRaw/commerce_universe_v1 | resolver가 stamp |

`RevenueClaimSummary` = `{ hasClaim, claimTypes: ('cancel'|'refund'|'return'|'exchange')[], claimAmount?, claim{Reason,Payment,Bank}{Code,Label}? }`.
- **raw claimData 전체는 노출하지 않는다**(축약만). 코드→라벨은 Code_Search 연결 시 채움(현재 undefined).

## 5. godoRaw 기본 경로 전환
- `resolveOrdersRevenue`의 synthetic 기본 source를 **`legacy` → `godoRaw`**로 전환(`pickSyntheticSource`: 미지정/godoRaw → godoRaw, legacy 명시만 legacy).
- godoRaw = `syntheticGodomallOrders`(raw 생성) → **`mapOrdersToRevenue` 통과**(real과 동일 통로) → memberKey/settleKind/claimSummary 등 자동 파생.
- **⚠️ 수치 변경 가능성(의도된 변경)**: 기본이 godoRaw(480건)로 바뀌며 대시보드/채팅 수치가 legacy(240건) 대비 달라질 수 있다. 이는 real API 전환 재사용성을 위한 의도된 변경이다.
- **라이브 검증(2026-06-26)**: `orders-revenue?includeSynthetic=true`(기본) → 480건·memberKey 350·claimSummary 64·`syntheticSource:godoRaw`. `&syntheticSource=legacy` → 240건·memberKey 0·`legacy`.

## 6. legacy synthetic 유지 정책
- `syntheticRevenue.ts`(legacy)·`syntheticGodomallOrders.ts`(godoRaw) **둘 다 삭제 안 함**.
- legacy는 `?syntheticSource=legacy` 명시 옵션으로 유지(후퇴용).

## 7. Analytics Contract (상품/마케팅/총괄)
- 포함: memberKey·orderNo·orderDate·revenue·결제수단·주문채널·category/brand·claimSummary·dataKind.
- **비포함(절대)**: 고객명·전화·이메일·주소·배송메모 등 PII. 고객 식별은 **memberKey(가명)** 만.

## 8. CS Contact Contract (CS팀) — 타입 초안만 (v0)
- `api/_shared/commerceContactContract.ts`: `CsContactRecord`(customerName/phone/email/address/inquiryText 등) + `PiiOrigin`(isSynthetic/isFakePii/piiType/sourceType) + `SYNTHETIC_FAKE_PII_ORIGIN`.
- **실제 fake PII 생성은 v0에서 안 함** — Synthetic Commerce Universe v1에서 구현.
- `ANALYTICS_ALLOWED_CONTACT_KEYS`(memberKey/orderNo만 분석계약 통과) / `CS_ONLY_PII_KEYS`(CS 전용) 화이트리스트 정의.

## 9. fake PII 정책
- **synthetic mode**: fake PII 생성 가능(CS 응대 훈련). 모든 fake에 `isSynthetic/isFakePii/piiType:'fake'/sourceType:'synthetic'` 표식 필수.
- **real mode**: 실제 PII를 facts/log/docs/smoke에 박제 금지. CS팀 응대에 필요한 경우만 제한적.
- fake/real 혼합 금지, fake를 real처럼 표시 금지.

## 10. real PII 보호 정책
- memNo/memId 원문을 RevenueOrder에 싣지 않음 → **가명화**(real=`real_member_<해시>`, synthetic=`syn_member_<id>`).
- 이름/전화/이메일/주소는 RevenueOrder(분석)에 **절대 미포함**(mapper가 orderInfoData를 읽지 않음).

## 11. real/synthetic 공통 mapper 원칙
```
Real Order_Search raw  ┐
                       ├─→ normalizeOrderData → mapOrdersToRevenue → RevenueOrder(+분석필드) → facts → agents
Synthetic godoRaw raw  ┘
(legacy synthetic: mapper 우회 — 후퇴용 옵션으로만)
```
→ 진짜 쇼핑몰 API로 갈아끼워도 동일 통로·동일 계약 → 테스트 기능 재사용.

## 12. 다음 단계(Synthetic Commerce Universe v1)와의 관계
- v0는 **계약·통로**를 확정했다. v1은 이 계약 위에 **1년치 주문/고객/재구매/취소·환불/리뷰/문의/fake PII**를 일관된 가상 세계로 생성한다.
- v1 생성기는 godoRaw raw를 만들고(이미 통로 통일), CS Contact는 `commerceContactContract` 타입으로 fake PII를 채운다.

## 13. 남은 이슈
- Code_Search 라벨 연결: paymentMethodLabel·claimReasonLabel·claimBankLabel은 현재 undefined → claimBank/claimPayment/deliveryCompany 코드 라벨 fetch 연결(다음).
- claimData edge: 부분취소/다중 클레임 라인의 정밀 금액 분해.
- fake PII 실제 생성: v1.
- CS/리뷰 board contract: board_list READ + board mapper(주문과 별개 통로).
