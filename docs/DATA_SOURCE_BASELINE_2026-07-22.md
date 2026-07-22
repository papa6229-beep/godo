# 데이터 출처 기준선 (Data Source Baseline) — 2026-07-22

> 목적: 시험용 고도몰 API가 만료되기 전, **무엇이 실제 API 자료이고 무엇이 시험용 가상자료인지**를
> 프로젝트의 확정 기준선으로 고정한다. 이후 실제/시험/연결실패를 시스템이 절대 혼동하지 않도록 하는
> 바닥 규칙의 출발점이다.
>
> 표본 원본(민감정보 제거): `docs/contracts/godomall-api-samples/test-store-2026-07-22/`
> 판별 코드 경로: `api/_shared/godomallResource.ts` `resolveResource`

---

## 1. 확정된 진실 (2026-07-22 시험몰 실측 기준)

### 실제 API로 확인된 자료 (`sourceType: api_proxy_real`, live 호출 성공)
| 항목 | 실측 | 상류 endpoint |
|---|---|---|
| 상품 목록 | **13건** | Goods_Search.php |
| 수기 주문 | **1건** | Order_Search.php |
| 상품 현재 재고 필드 | **13건 상품에서 읽힘** | Goods_Search.php(재고 필드) |
| 유효 판매 집계 | **0건** | Order_Search.php → deriveSalesFromOrders |

- **상품 필드**(실제 확인, adapter 매핑 확정): productId←`goodsNo`, productCode←`goodsCd`,
  productName←`goodsNm`, price←`goodsPrice`, fixedPrice, stock←`totalStock`,
  stockEnabled←`stockFl`, soldOut←`soldOutFl`, displayPc/Mobile←`goodsDisplayFl`/`goodsDisplayMobileFl`,
  sellPc/Mobile←`goodsSellFl`/`goodsSellMobileFl`, categoryCode←`cateCd`, allCategoryCode←`allCateCd`,
  brandCode←`brandCd`, registeredAt←`regDt`, modifiedAt←`modDt`, makerName←`makerNm`,
  originName←`originNm`, optionName.
- **카테고리 코드**: 상품 12/13건에 채워짐(전용 엔드포인트는 없음, 상품 필드로 제공).

### 미확인 · 미연동
| 항목 | 상태 |
|---|---|
| 문의(inquiries) | **라이브 미연동** (`api_mock_fallback`) — Board_List.php 매핑 전까지 mock |
| 리뷰(reviews) | **라이브 미연동** (`api_mock_fallback`) — 동일 |
| 썸네일 | 현재 adapter가 이미지 필드를 매핑하지 않음 → 응답에 없음. 실 필드명·URL 형태 **미확인** |
| 카테고리명 | 코드→라벨 조인(Category_Search 실응답) **미검증** |
| 옵션 상품 구조 | 현재 옵션 상품 0 → 구조 **미검증** |
| 대량 페이지네이션 | total/page/size 실필드 **미검증**(현재 13건 소량) |

---

## 2. 시험용 가상자료 (실제 고도몰 자료 아님)

- **문의 3건 · 리뷰 3건**: **MOCK fixture**다. 실제 고도몰 자료가 아니다.
  (`api_mock_fallback`, `live:false`, errorMessage="Live fetch ... requires Board_List.php mapping".
  이전에 "실제 문의 3건"이라 보고했던 주장은 **철회**한다.)
- **문의 상태 어휘 `답변대기`도 MOCK 출처**다. `api/_shared/mockProxyData.ts` `mockInquiries`가 쓰는 값이며,
  `getProxyMockInquiries()`를 통해 fallback으로 반환된다. **실제 고도몰 문의 상태 어휘는 아직 관측된 바 없다.**
  (C-4에서 `답변대기 → unanswered` 별칭을 "실제 Production 관측 확정값"이라 표기한 것은 **오류** →
  "MOCK/spec 기반 호환 표본"으로 정정 대상. §아래 5장 정정목록.)
- **2년치 주문·매출·고객·쿠폰·환불·리뷰·문의·재고 변화**: **전부 시험용 가상자료(시뮬레이션)**다.
- 현재 화면의 **운영매출 88,116,982원**과 **재고위험 4건**도 이 **가상 운영자료에서 파생된 값**이다.

---

## 3. 표현 정정 (혼선 방지)

1. **inventory API 표본 = 시험몰 상품의 실제 '현재 재고 필드'**를 읽은 것(Goods_Search 파생).
   대시보드의 **2년치 재고위험 그래프와는 다른 자료** — 후자는 **가상 매출에서 파생된 시험자료**다.
2. **판매상태는 `soldOutFl` 단독이 아니다.** 정확히 보려면 **품절(soldOut/`soldOutFl`) +
   판매여부(sellPc·sellMobile/`goodsSellFl`) + 전시·노출여부(displayPc·displayMobile/`goodsDisplayFl`)**를
   함께 봐야 한다.
3. **주문 1건과 유효 판매 집계 0건은 동시에 가능**하다. 수기 주문 1건이 유효매출 조건(결제·확정 등)에
   들지 않았을 수 있기 때문이다. sales 0건은 **"주문 0건"이 아니라 "Order_Search에서 파생된 유효 판매 집계 0건"**이다.
4. **썸네일·카테고리명·대량 페이지네이션·옵션 구조는 아직 실제 API 검증이 끝나지 않았다.**

---

## 4. 데이터 출처 바닥 규칙 (앞으로 지켜야 할 것)

1. **실제 자료가 0건이면 0건으로 표시**한다. 가상자료로 채워 넣지 않는다.
2. **API 실패 시 "연결 오류"로 표시**한다. **가상자료로 자동 대체 금지.**
   (현재 inquiries/reviews의 mock fallback은 이 규칙 위반 소지 → 후속 잠금 대상.)
3. **실제 자료와 가상자료를 같은 통계에 혼합 금지.** 출처(source/live)를 반드시 구분해 집계한다.
4. **`sourceType`이 진짜 판별자**다. `mode:real`은 proxy 모드 표기일 뿐이며 실응답을 뜻하지 않는다.

---

## 5. 실제 vs mock 판별 코드 경로 (근거)

`api/_shared/godomallResource.ts` `resolveResource`:
- `isLiveMode(config)` → `fetchLiveRecords` **성공** → `source: api_proxy_real`(mode real일 때), `live: true`.
- **inquiries/reviews**: `fetchLiveRecords`가 `"Live fetch for [x] is not configured yet (requires
  Board_List.php mapping)"` 예외를 던짐 → catch → **mock fallback** (`source: api_mock_fallback`,
  `live: false`, `errorMessage` 설정).
- products/orders/inventory/sales → Goods_Search / Order_Search 실호출 → `api_proxy_real`.

---

## 5-b. C-4 정정 대상 목록 (✅ C-4 재개 병합 `fdaeee3`에서 코드 정정 완료)

`fix/rc-1-c4-inquiry-status-normalization` 브랜치에서 `답변대기`를 "실제 고도몰 관측값"이라 표기했던 지점.
실제로는 **MOCK(`api/_shared/mockProxyData.ts`) 출처 + `api_mock_fallback` 경로**이므로
**"MOCK/spec 기반 호환 표본"**으로 정정 완료.

| # | 위치 | 현재(오류) 표현 | 정정 | 상태 |
|---|---|---|---|---|
| 1 | `src/services/inquiryStatusContract.ts` (주석) | "실제 Production 고도몰… 관측된 확정 원시값 / 실데이터 대조" | "MOCK/spec 호환 표본 상태값. 실제 Board_List 미관측" | ✅ 정정 |
| 2 | `scripts/smoke-c4-...v0.mjs:179` (주석) | "실제 Production 고도몰 관측 형태 재현" | "MOCK/spec 호환 표본 형태 재현" | ✅ 정정 |
| 3 | `scripts/smoke-c4-...v0.mjs:188` (로그) | "실데이터 재현" | "MOCK/spec 표본 재현" | ✅ 정정 |
| 4 | `scripts/smoke-c4-...v0.mjs:189` (B12 라벨) | "실제 고도몰 형태" | "MOCK/spec 표본 형태" | ✅ 정정 |
| 5 | 커밋 `347b4ad` 메시지 | "실제 고도몰 관측값 '답변대기'" | 히스토리 재작성 금지 — 본 문서·후속 커밋으로 정정 | ✅ 문서 정정 |
| 6 | (대화 보고) D-7·Preview 전 분포 | "실측 답변대기 / real proxy mode:real" | 철회. 판별자는 `sourceType`(mode:real은 proxy 표기) | ✅ 철회 |

> 별칭 매핑 `답변대기 → unanswered` **자체는 유지**(mock/spec 어휘로 타당). **근거만 "실측"→"MOCK/spec 호환"으로 정정**.
> 미관측 고도몰 어휘는 추가하지 않으며, 실제 상태 어휘는 Board_List.php 연동 후 별도 확정한다(C4-SERVER-01 후속).

## 6. 새 판매용 고도몰 키 발급 후 재검증 항목

1. 썸네일 실제 필드명·값(URL 형태) → adapter 이미지 매핑 추가
2. inquiries/reviews 라이브(Board_List.php) 매핑 → **여기서 `답변대기` 등 실제 상태 어휘 최종 확정**
   (RC-1 C-4 문의 상태 계약과 연결)
3. 옵션 상품 등장 시 optionName/중첩 구조
4. 대량 상품 시 페이지네이션 실필드(total/page/size)
5. categoryCode ↔ 카테고리명 조인(Category_Search) 실응답
