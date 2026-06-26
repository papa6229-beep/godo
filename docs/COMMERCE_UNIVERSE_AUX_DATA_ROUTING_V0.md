# Commerce Universe Auxiliary Data Routing v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/commerce-universe-aux-data-routing-v0`
> **코드**: `api/_shared/commerceUniverseAux.ts` + orders-revenue 확장 · **smoke**: `scripts/smoke-commerce-universe-aux-data-routing.mjs`(18/18) + 라이브 검증

## 1. 작업 목적
Commerce Universe의 customers/reviews/inquiries/fakeContacts를 **안전하게 공급**해 Department Facts Routing이 실제 부서 facts bundle을 만들 수 있게 한다. (채팅 완성/팝업 아님 — **데이터 공급관 연결**.)

## 2. 왜 orders 외 데이터가 필요한가
프론트는 orders/revenue만 보유 → CS팀(문의/리뷰/클레임)·마케팅팀(고객/세그먼트)이 쓸 재료 부족. 대시보드 orders와 **같은 seed/소스(commerce_universe_v1)**의 aux를 같은 응답으로 공급해 정합성을 유지한다.

## 3. includeUniverseAux 정책 (새 route 없음 — 기존 orders-revenue 확장)
| 호출 | 반환 |
|---|---|
| `?includeSynthetic=true` | 기존과 동일(orders/summary/stockImpact). **universeAux 없음, PII 없음** |
| `&includeUniverseAux=true` | `universeAux.{customers,reviews,inquiries,meta}` 추가 (**commerce_universe_v1일 때만**) |
| `&includeCsFakeContacts=true` | `universeAux.csOnlyFakeContacts` 추가 (**synthetic universe일 때만**) |
- 라이브 검증: 기본 826/aux 없음, aux 호출 customers 320·reviews 167·inquiries 141(PII 없음), csFakeContacts 320(전부 fake 표식), godoRaw+aux → aux 없음(게이트).

## 4. includeCsFakeContacts 정책
- `commerce_universe_v1`(synthetic)일 때만, 명시 요청 시에만 `csOnlyFakeContacts` 반환. real mode/다른 source → 미반환.
- 프론트 공유 product 로드(`DepartmentWorkspacePanel`)는 `includeUniverseAux=true`만 요청 — **CS fake PII는 공유 로드에 싣지 않음**(CS 연결 시 별도).

## 5. safe customer/review/inquiry 구조 (PII 제외)
- **SafeSyntheticCustomer**: memberKey·segment·first/lastOrderDate·orderCount·totalRevenue·totalPaidAmount·averageOrderValue·claimCount·reviewCount·inquiryCount. (이름/전화/주소/이메일/계좌 **없음**)
- **SafeSyntheticReview**: reviewId·orderNo·goodsNo·productId·category/brandCode·rating·sentiment·topic·createdAt·excerpt(PII-free 템플릿).
- **SafeSyntheticInquiry**: inquiryId·orderNo·goodsNo·productId·category/brandCode·topic·status·urgency·createdAt·title·excerpt(전화/이메일/계좌 패턴 sanitize).
- analyticsQueryEngine 입력과 구조 호환(customerCount/repurchaseRate/customerSegmentRevenue/review*/inquiry* 계산 가능).

## 6. CS fake contact 격리
- `csOnlyFakeContacts`(= universe.contacts)에만 fake PII. 모든 contact `origin{isSynthetic,isFakePii:true,piiType:'fake',syntheticProfile:'commerce_universe_v1'}` 유지.
- orders/summary/safe customers/reviews/inquiries/productTeam/marketingTeam/manager bundle에는 **절대 미포함**.

## 7. Department Facts Routing과의 관계
- `buildDepartmentFactsBundleFromUniverse({orders, customers, reviews, inquiries, contactsForCsOnly, catalog, source})` 추가 → aux를 dataset으로 매핑해 번들 생성.
- productTeam=매출/상품 통계, csTeam=문의/리뷰/클레임 + fakeContacts, marketingTeam=handoff+직접 facts(세그먼트/고객), manager=요약+승인. (역할 경계 유지.)

## 8. PII guard 정책
- 기본 응답 / safe aux / productTeam·marketingTeam·manager bundle: PII 금지 문자열(customerName/phone/address/email/refundAccount/deliveryMemo/010-/@example/샘플/가상고객) 미등장(smoke + 라이브 검증).
- csOnlyFakeContacts / csTeam.fakeContacts: fake PII 허용, origin 표식 필수.

## 9. 변경 파일
- `api/_shared/commerceUniverseAux.ts`(신규: safe 매핑) · `api/_shared/godomallResource.ts`(resolveOrdersRevenue 옵션+universeAux) · `api/godomall/orders-revenue.ts`(쿼리 파싱) · `src/services/departmentDataService.ts`(fetchRevenue options + RevenueResult.universeAux + 미러 타입) · `src/services/departmentFactsRouting.ts`(buildDepartmentFactsBundleFromUniverse) · `src/components/DepartmentWorkspacePanel.tsx`(aux 요청).
- 새 route 없음(함수 12개 유지), WRITE 없음, 기본 source 무변경.

## 10. 다음 단계 — Department Chat Wiring v0
- `DepartmentWorkspacePanel`이 보관한 universeAux를 `buildDepartmentFactsBundleFromUniverse`로 넘겨 CS/마케팅/총괄 채팅 facts에 실연결(역할별 톤 + 모듈 해상도 정리).
- CS 워크스페이스에서만 `includeCsFakeContacts` 요청 → 응대 시뮬레이션.
