# SEC-ORDERS-ADMIN-01 — 무인증 주문 PII 경로 단기 폐쇄 RED 진단

- 날짜: 2026-07-25 · 브랜치: `fix/sec-orders-admin-01` (기점 main `fa7e65f`)
- 성격: **RED 진단 전용. 제품 소스 변경 0.** 감사 전체는 `audit/foundation-optimization-remainder-01 @ c3fda4b`에 보존(무접촉).
- 근거: AUDIT-01 F-1(Critical) + AUDIT-01.1 C1(서버 인증 부재 근본 원인).
- 증거: CODE(실코드) · AUTO(실함수 실행) · DOC.

## 1. 확정 정책
- 서버 인증·권한 기반이 없으므로 원본 주문자 PII 를 반환하는 관리자 API 를 열어두지 않는다.
- sessionRole·임의 헤더·하드코딩 토큰·Vercel 배포 보호를 제품 인증으로 쓰지 않는다.
- orders-admin 실소비자 0이면 마스킹 중복 API 로 유지하지 않고 **fail-closed 비활성화**를 기본안으로.
- 장기 원본 PII 접근은 별도 `AUTH-FOUNDATION` 설계·승인 후 재개.
- 일반 `/api/godomall/orders` 마스킹 경로·매출 분석 경로는 변경하지 않는다.

## 2. RED 실제 값 (AUTO — 명시적 mock 모드, 실 API·실 PII 불요)
`smoke-sec-orders-admin-01-red-v0.mjs` — resolveOrdersAdmin/resolveResource 실함수 호출.
| 관찰 | 값 |
|---|---|
| resolveOrdersAdmin(mock) records | **5건** (sourceType api_mock_fallback) |
| 원본 이름 노출(customerName/receiverName, 마스킹 없음) | **5/5** |
| 원본 전화 노출(010-****-**** 아님·가운데 자릿수 그대로) | **5/5** |
| 원본 주소 노출(시·구 이하 상세) | **5/5** |
| 마스킹 마커(*Masked·****) | **0** |
| 대조 resolveResource('orders') 원문 전화/이름 | **0/5 · 0** (마스킹/삭제됨) |
| orders-admin 인증 게이트 | **없음**(GET only, auth 0) |
| resolveOrdersAdmin 인증 인자 | **arity 0**(구조적 무인증) |
| 오류 응답 err.message 노출 | **예**(`...: ${errMsg}`) |
| fetchAdminOrders 런타임 소비자 | **0** |

PII 판정은 특정 이름·번호가 아니라 **필드 구조·마스킹 의미**(이름 필드 원문·전화 정규식 가운데 자릿수 유지·주소 3토큰 이상·마스킹 마커 부재)로 검사.

## 3. 원본 PII 전달 경로 (CODE)
```
GET /api/godomall/orders-admin (api/godomall/orders-admin.ts:11, GET·무인증)
  → resolveOrdersAdmin() (godomallResource.ts:291, 인증 인자 없음)
      mock:  mapOrdersToAdmin(getProxyMockOrders())          (:296)
      live:  mapOrdersToAdmin(normalizeOrderData(...))        (:322)   ← maskRecordsList 미호출
  → mapOrdersToAdmin (godomallMapper.ts:359)
      buildAdminOrder (:315-355): ordererName/receiverName/phone/address = **원문**(주석 "원문")
  → records: StandardOrderAdmin[]{ customerName, receiverName, phone, address } 그대로 반환
  → catch: sendErrorResponse(..., `Failed ...: ${errMsg}`)  (orders-admin.ts:30 · resolve:332)
```
mock fixture(getProxyMockOrders, mockProxyData.ts): 익명 가짜 PII(김철수·010-1234-5678·서울시 강남구…) — 실 PII 아님이나 **구조가 원문 노출**을 증명.

## 4. 대조 증거 — /api/godomall/orders 는 마스킹 (CODE+AUTO)
`resolveResource('orders')` → `maskRecordsList(...)` (godomallResource.ts:169 mock · :186 live). `piiMaskGuard.maskRecordPii`: customerName 삭제→customerNameMasked(홍*동)·**customerPhone/Email 완전 삭제**·주소 시/구만. AUTO: orders 경로 원문 전화 0/5·원문 이름 0. → 동일 성격 자료를 orders 는 마스킹, orders-admin 은 원문(비대칭이 결함 근원).

## 5. 소비자 전수표 (src/·api/·scripts/ 전수)
| 참조 | 위치 | 종류 |
|---|---|---|
| `fetchAdminOrders` 정의 | `src/services/departmentDataService.ts:164` (fetch `/api/godomall/orders-admin`) | 정의 |
| `fetchAdminOrders` **호출부** | (전수 0건) | **런타임 소비자 0** |
| `AdminOrdersResult` 소비 | (0건) | — |
| 라우트 핸들러 | `api/godomall/orders-admin.ts` | 정의 |
| `resolveOrdersAdmin`/`mapOrdersToAdmin`/`StandardOrderAdmin` | `godomallResource.ts`·`godomallMapper.ts` | 정의 |
| 라우트 등록 메타 | `godomallApiRegistry.ts:319`·`[resource].ts:15` | 등록(정적 route) |
| 검사 | `smoke-data-source-server-01-red`(B10/B11/C8)·`smoke-godo-order-mapping-01`·`smoke-vercel-demo-gateway-adapter` | 검사(직접 호출/존재확인) |
| 문서 | orders-admin.ts 주석·orders-revenue.ts:9 | 문서 |

→ **정의·등록·검사·문서는 있으나 실제 런타임 소비자(화면/계산/동기화)는 0.**

## 6. 비활성화 시 영향 범위
- 화면: orders-admin 을 렌더/호출하는 컴포넌트 없음 → **영향 0**.
- 계산: 매출·재고·문의·클레임은 `orders-revenue`(resolveOrdersRevenue)·`[resource]`·synthetic universe 경로 → orders-admin 미사용 → **영향 0**.
- 동기화: DataPanel 동기화는 `[resource]`/products/read 경로 → **영향 0**.
- 기준값(1315/1182/88,116,982/98,363,022/재고13/위험4)·provenance 계약: 무관 → **무회귀**.
- 결론: fail-closed 비활성화(또는 마스킹)는 제품 동작에 영향 없음. `fetchAdminOrders` 정의는 남겨도 호출부 0이라 무해(향후 AUTH-FOUNDATION 후 재배선).

## 7. 취약성 vs 현재 노출 구분 (Section 7)
- **경로 취약성**: 존재·확정(CODE+AUTO) — 무인증 GET 이 원문 PII 반환 구조.
- **현재 실 노출**: Production 실제 주문 **0건**(orders sourceType api_proxy_real·records 0) → 지금 유출되는 실 PII 는 없음. mock 모드에서만 가짜 PII 노출.
- 두 사실은 별개: 실주문이 유입되는 순간(실 API 연동) 무인증 원문 PII 유출로 즉시 전환되므로 **연동 전 선제 폐쇄** 필요.

## 8. 예상 GREEN 종료조건
- 무인증 요청으로 원본 PII 를 **한 필드도** 받을 수 없음(이름·전화·주소·이메일).
- 기본안: orders-admin 이 안전한 오류 코드(예: 404/410/501)로 **fail-closed**(records 미반환), 하부 err.message 원문 미노출.
- 일반 주문 마스킹·매출·상품·재고·출처 계약 **무회귀**(기준값 6종 불변).
- **mock fixture PII 도 미공개**.
- 미래 개발자가 인증 없이 쉽게 재개 못 하도록 **자동검사로 고정**(RED→GREEN 전환).
- 가짜 인증·임시 관리자 토큰 추가 **금지**.

## 9. 최소 GREEN 예상 파일
- 제품: **`api/godomall/orders-admin.ts`**(핸들러 fail-closed) 그리고/또는 **`api/_shared/godomallResource.ts`**(`resolveOrdersAdmin` 비활성 또는 마스킹 적용). 2파일 이내, AUTH 기반·새 구조 없이 단기 폐쇄.
- 검사: **`smoke-sec-orders-admin-01-red-v0.mjs`** → GREEN 전환(무인증 원본 PII 0·fail-closed 확인). `smoke-data-source-server-01`·`smoke-godo-order-mapping-01`(resolveOrdersAdmin 직접 호출) 무회귀 확인 — 이들이 admin 레코드 형태를 단언하면 GREEN 시 갱신 필요 여부 사전 점검.
- 대안 판단: 마스킹 유지 vs 완전 비활성 — 소비자 0이므로 **비활성(fail-closed) 기본안**, 마스킹은 차선.

## 10. 테스트 계획
1. RED(현재): `smoke-sec-orders-admin-01-red-v0.mjs` — FACT 11(결함 재현)·RED 3(종료조건 미충족)·exit 1.
2. GREEN 시: 동일 스모크에서 R1~R3 MET 전환(무인증 원본 PII 0·records 0·mock PII 0), FACT 는 "폐쇄 후 동작"으로 갱신(err.message 미노출 포함).
3. 무회귀: 전체 smoke 119(+신규)·orders 마스킹 경로·orders-revenue 기준값 6종·tsc·build·lint.
4. 음성 변형(임시 worktree): fail-closed 를 되돌려 원문 PII 재노출 시 검사가 실패하는지 확인(재개 방지 고정).

## 11. 상태
제품 소스 0·기존 검사 0 변경. RED 검사 + 본 문서만 신규. push·Preview·병합·Production·GREEN·AUTH·RC-3 미수행.
