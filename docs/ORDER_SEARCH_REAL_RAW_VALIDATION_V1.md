# Order_Search Real Raw Validation v1

> **작성일**: 2026-06-26
> **브랜치**: `feature/order-search-real-raw-validation-v1`
> **선행**: `docs/ORDER_SEARCH_DATA_FOUNDATION_V1.md` (foundation, main 머지 완료 `a312e90`)
> **기준 스펙**: `docs/godomall_order_search_spec.md`

---

## ⚠️ 안전 고지

- 이 작업은 **실제 주문 쓰기(Write)가 아니다.** READ 검증 기반만 다룬다.
- **실제 주문번호/회원ID/이메일/전화/주소 원문을 이 문서에 기록하지 않는다.** 샘플 JSON 원문도 붙이지 않는다. 구조 요약 + 마스킹 형태만 기록한다.
- audit 도구는 **로컬 전용**이며 public route가 아니다. API 키는 환경변수로만 주입한다.

---

## 1. 실제 API 호출 가능 여부

**현재 환경에서 인증된 실 호출 불가.** 고도몰 API 키가 로컬에 없다.

| 항목 | 상태 |
|---|---|
| `GODOMALL_API_MODE` | unset (기본 `mock`) |
| `GODOMALL_PARTNER_KEY` | unset |
| `GODOMALL_USER_KEY` | unset |
| openhub 네트워크 도달 | 가능 (HTTPS 200) — 단 키 없이는 인증 에러만 반환 |

키는 보안 원칙상 Vercel 환경변수(서버 전용)에만 존재하므로 로컬/dev에서 실주문 raw를 받을 수 없다. 작업지시서 §8에 따라 **우회하지 않았다**(키 하드코딩·세션/쿠키·브라우저 직접 호출·public debug route 모두 미사용).

### 실 audit 시도 로그 (2026-06-26)
- `vercel env pull .env.local --environment=production` 시도 → **Vercel CLI 미인증**(`No existing credentials found`, `.vercel` 링크 없음). 모든 `vercel` 명령이 대화형 device-auth(브라우저 OAuth)를 요구하여 자동화 환경에서 완료 불가.
- 작업지시서 §3-2에 따라 **env pull 불가**로 판단하고 중단. **키 원문을 요청하지 않았다.**
- → 사용자가 직접 인증해야 한다: 세션 프롬프트에서 `! npx vercel login` 후 `! vercel env pull .env.local --environment=production` 실행(또는 `.env.local`에 키 직접 작성). 이후 `node scripts/audit-order-search-raw.mjs` 실행 시 본 문서 §3~§5 실측 컬럼을 채울 수 있다.

→ 실측은 보류하고, ① 공식 스펙 기반 shape 분석, ② mapper 호환 검증(픽스처), ③ 키 도착 시 즉시 실행 가능한 안전 audit 도구 + 합성 generator 보정으로 대체했다.

### 실 호출에 필요한 것 (사용자 제공)
```
GODOMALL_API_MODE     = real | sandbox
GODOMALL_PARTNER_KEY  = <제휴사 고유키>
GODOMALL_USER_KEY     = <API 승인 사용자 키>
(선택) GODOMALL_REAL_BASE_URL / GODOMALL_SANDBOX_BASE_URL
```
주입 후:
```
GODOMALL_API_MODE=sandbox GODOMALL_PARTNER_KEY=... GODOMALL_USER_KEY=... \
  node scripts/audit-order-search-raw.mjs
```
→ PII 마스킹된 구조 요약만 출력(주문번호/이름/전화/이메일/주소 원문 미출력).

---

## 2. 조회 조건 (audit 스크립트 기본값)

```
endpoint : {base}/order/Order_Search.php   (real: openhub, sandbox: sbopenhub)
method   : POST (x-www-form-urlencoded), partner_key/key 환경변수 주입
dateType : order
startDate: 오늘-90일
endDate  : 오늘
size     : 3
sort     : orderNo desc
```
주문 0건이면 스크립트가 "수기 주문 1건 생성 후 재시도 또는 기간 확대"를 안내한다.

### 조회 옵션 (0건 시 기간/건수 조정 — public route 없이 CLI 인자만)
```
node scripts/audit-order-search-raw.mjs --days=365 --size=3
node scripts/audit-order-search-raw.mjs --startDate=2026-06-01 --endDate=2026-06-26 --size=3
```
`startDate`/`endDate`가 주어지면 그 범위를, 아니면 `--days`(기본 90)로 역산. 어떤 옵션에서도 API 키·raw JSON·PII 원문은 출력하지 않는다. 출력 샘플의 `orderNo`는 부분 마스킹(`2506********1234`), `memId`는 `[MASKED_ID]`.

---

## 3. 실제 raw shape 요약 (공식 스펙 기준 — 실측 대기)

`docs/godomall_order_search_spec.md`에서 확정 가능한 사실:

| 항목 | 스펙 기준 |
|---|---|
| 응답 envelope | `code` / `msg` / (`size` 지정 시) `lastOrder` / `order_data` |
| `order_data` | 단건이면 단일 객체, 다건이면 배열 (XML 반복 태그 → 파서가 배열로 접음) |
| `orderGoodsData` | 단일 상품이면 객체, 복수면 배열 |
| `orderInfoData` / `orderDeliveryData` | 객체(복수배송지 시 배열 가능) |
| `claimData` | `orderGoodsData`(라인) 내부에 위치(취소/반품/교환/환불 시). 빈값/객체 가능 |
| **날짜필드 위치** | `paymentDt`는 `order_data`(헤더). **`invoiceDt`/`deliveryDt`/`deliveryCompleteDt`/`finishDt`/`cancelDt`는 `orderGoodsData`(라인)** |
| 수치필드 표현형 | XML 파서가 `parseTagValue:false`(godomallXmlParser) → **모든 값 문자열** |
| PII 필드 | `orderName`/`orderEmail`/`orderPhone`/`orderCellPhone`/`orderAddress`/`receiver*`/`orderIp`/`customIdNumber`/환불계좌 등 포함 |

> **중대 발견**: 기존 `mapOrdersToRevenue`→`deriveOrderState`는 상태 날짜필드를 **헤더에서만** 읽었다. 그러나 스펙상 invoice/delivery/finish/cancel은 **라인**에 있다. 즉 실데이터에서 paid/unpaid 외 상태(배송/확정/취소)가 **과소탐지**될 수 있었다. → §6에서 라인 폴백으로 보정.

---

## 4. synthetic raw와의 차이 (보정 전 → 후)

| 항목 | 보정 전 | 보정 후 |
|---|---|---|
| 수치필드 표현형 | number | **string**(`numericAsString` 기본 true, 실 XML 파싱 동등) |
| `order_data` 1건 | 1요소 배열 | **단일 객체**(실 응답 동등) |
| 날짜필드 위치 | 헤더+라인 양쪽(mapper 호환) | 유지(헤더+라인). mapper가 라인도 읽도록 보정되어 양쪽 모두 안전 |
| `orderGoodsData` 단/복수 | 단일=객체/복수=배열 | 유지(이미 실 동등) |
| `claimData` | 라인 내부 객체 | 유지(스펙 동등) |

남은 차이(실측으로 확인 필요): 부분취소 시 라인별 `orderStatus` 상이, `addField`/`multiShippingFl=y` 복수배송지, `claimData` 배열 다중 클레임, `giftData`/`addGoodsData` 실데이터.

---

## 5. mapper 호환 여부 (픽스처 검증)

키 없이 실측은 불가하나, **스펙이 기술한 raw 형태**를 픽스처로 만들어 기존 매퍼 호환을 검증했다(`tsc` emit 후 Node 실행).

| 검증 | 결과 |
|---|---|
| 합성 raw(문자열 수치) → `mapOrdersToRevenue` | ✅ 통과, `revenueMismatch=0`(헤더합=라인합) |
| 날짜 라인 전용 raw → `deriveOrderState` | ✅ paid/shipped/delivered/confirmed 정확 파생(라인 폴백) |
| 헤더 전용 raw(legacy) → `deriveOrderState` | ✅ 기존과 동일(폴백 미발동) |
| 상품번호 매칭(goodsNo→productId) | ✅ 매칭 + 카테고리 조인 |
| 배송비 분리 | ✅ `totalDeliveryCharge`가 상품매출에 미포함 |
| PII | ✅ `RevenueOrder`에 고객 PII 미포함(매출 모델 자체가 PII 없음) |

상태 분포(합성 200건): confirmed 103 / canceled 19 / unpaid 3 — `deriveOrderState` 일관.

---

## 6. 수정/보정 내용

### 수정 파일
| 파일 | 변경 |
|---|---|
| `api/_shared/godomallRevenue.ts` | `deriveOrderState`에 **라인 폴백** 추가 — 헤더에 날짜필드가 없으면 첫 `orderGoodsData` 라인에서 보강. 순수 가산(헤더 우선), 하위호환. 실데이터 상태 정확도 향상. |
| `api/_shared/syntheticGodomallOrders.ts` | `numericAsString`(기본 true) — 실 XML 파싱 충실도로 수치필드 문자열화. `order_data` 1건이면 단일 객체. |

### 신규 파일
| 파일 | 역할 |
|---|---|
| `api/_shared/orderRawAudit.ts` | PII-안전 구조 감사(`auditOrderSearchRawShape`, 값 미포함) + Order_Search 전용 PII 마스킹(`maskOrderSearchPii`, piiMaskGuard 원시함수 재사용) |
| `scripts/audit-order-search-raw.mjs` | **로컬 전용** 실 raw 감사 도구. 환경변수 키로 POST → 파싱 → PII 마스킹된 구조 요약만 출력. public route 아님, raw PII/전체 JSON 미출력. 키 미설정 시 안내 후 종료. |

### PII 마스킹 규칙
이름→`홍*동`, 전화→`010-****-5678`, 이메일→`ch****@x.com`, 주소→`시 구 ****`, IP/통관번호/환불계좌→`[MASKED]`. 적용 키: orderName/receiverName/orderEmail/orderPhone/orderCellPhone/receiverPhone/receiverCellPhone/orderAddress(+Sub)/receiverAddress(+Sub)/orderIp/customIdNumber/receiverSafeNumber/depositor/accountNumber/bankName/ehRefund*.

---

## 7. 아직 실측 불가한 항목

키 도착 후 `scripts/audit-order-search-raw.mjs`로 확인 필요:
1. `order_data` 단건 시 실제로 단일 객체인지(파서 동작 실측).
2. invoice/delivery/finish/cancel 날짜필드가 **정말 라인 전용인지**, 헤더에도 일부 존재하는지.
3. `claimData`가 객체인지 배열인지(다중 클레임 시).
4. 부분취소 주문에서 라인별 `orderStatus`가 헤더와 어떻게 다른지.
5. 수치필드가 전부 문자열인지(파서 가정 실측 확인).
6. `addField`/`multiShippingFl=y`/`giftData`/`addGoodsData` 실구조.

---

## 8. 다음 단계 제안

1. **실 키로 audit 1회 실행** → §7 항목 잠그고 본 문서 §3/§4 "실측" 컬럼 채우기.
2. 실측 결과 라인 전용 날짜필드 확정 시, `mapOrdersToRevenue`의 라인 폴백이 충분한지(부분취소 라인 granularity) 재검토.
3. foundation의 `syntheticSource=godoRaw` 경로를 실 raw와 1:1 비교(같은 mapper 통과) → 합성/실 동등성 확정.
4. 할인/쿠폰/마일리지 필드를 `RevenueOrder` 순매출로 확장(클레임 `refundPrice` 포함).
5. 안정화 후에만 대시보드 토글(legacy ↔ godoRaw) 노출 검토.
