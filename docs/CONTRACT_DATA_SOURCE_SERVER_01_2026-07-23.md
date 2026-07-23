# DATA-SOURCE-SERVER-01 — 서버 경계 출처 계약 (RED 진단)

- 기준선: `main` `a6a781f3d1d3407dc5f33b4f00bcc695334a73d0` (Production Source 동일)
- 브랜치: `fix/data-source-server-01-red`
- 상태: **RED 진단 전용.** 제품 소스 변경 0. GREEN 미승인.
- 검사: `scripts/smoke-data-source-server-01-red-v0.mjs` (네트워크 비의존 — `globalThis.fetch` 스텁 + `process.env` 제어)

## 1. 한 줄 요약

서버는 **실제 요청이 실패·미구현·키 부재일 때 조용히 mock 레코드를 만들어 반환한다.**
클라이언트 GREEN3(`resolveFetchOutcome`)가 일부 경로에서 이를 차단하지만,
**관리자 주문·매출 경로는 그 차단을 통과하지 않으며**, 매출 경로의 mock 주문은
`sourceType: 'real_godomall'` / `dataKind: 'real'` 로 **실제라고 표시된 채** 계산에 들어간다.

## 2. 경로 × 시나리오 전수표 (실측값)

`resolveResource` / `resolveOrdersAdmin` / `resolveOrdersRevenue` 실행 결과. count 는 반환 레코드 수.

| 경로 | 시나리오 | HTTP | count | source/sourceType | mode | live | errorMessage | 클라이언트 해석 | 통계·화면 주입 |
|---|---|---|---|---|---|---|---|---|---|
| `resolveResource(orders)` | real 성공+레코드 | 200 | 1 | `api_proxy_real` | real | true | — | 실제 데이터 | 주입(정상) |
| `resolveResource(orders)` | real 성공+**빈배열** | 200 | **0** | `api_proxy_real` | real | true | — | **실제 데이터 0건** | 정상 |
| `resolveResource(orders)` | real 실패(네트워크) | 200 | **5(mock)** | `api_mock_fallback` | real | false | 있음 | GREEN3가 **차단**(연결 안 됨) | ApiBridge 경로는 차단됨 |
| `resolveResource(orders)` | real 실패(HTTP500) | 200 | **5(mock)** | `api_mock_fallback` | real | false | 있음 | 동일 차단 | 동일 |
| `resolveResource(orders)` | **real 키 부재** | 200 | **5(mock)** | `api_mock_fallback` | real | false | **없음** | 차단되나 **사유 미상** | 사유 표시 불가 |
| `resolveResource(inquiries)` | real 미구현 | 200 | **3(mock)** | `api_mock_fallback` | real | false | 있음 | 차단(연결 안 됨) | — |
| `resolveResource(reviews)` | real 미구현 | 200 | **3(mock)** | `api_mock_fallback` | real | false | 있음 | 차단 | — |
| `resolveResource(orders)` | sandbox 실패 | 200 | **5(mock)** | `api_mock_fallback` | sandbox | false | 있음 | 차단 | — |
| `resolveResource(orders)` | **명시적 mock** | 200 | 5 | `api_mock_fallback` | mock | false | — | 시험 데이터(허용) | 정상 |
| `resolveResource(inventory)` | real 키 부재 | 200 | **4(mock)** | `api_mock_fallback` | real | false | 없음 | 차단 | — |
| `resolveResource(products)` | real 실패 | 200 | **4(mock)** | `api_mock_fallback` | real | false | 있음 | 차단 | — |
| `resolveOrdersAdmin` | real 성공+레코드 | 200 | 1 | `api_proxy_real` | real | true | — | `source:'real'` | 관리자 화면 |
| `resolveOrdersAdmin` | real 성공+빈배열 | 200 | 0 | `api_proxy_real` | real | true | — | real 0건 | 정상 |
| `resolveOrdersAdmin` | **real 실패** | 200 | **5(mock)** | `api_mock_fallback` | real | false | 있음 | **`toSourceTag`→`'mock'`(시험 데이터)** | **관리자 주문 화면에 mock 5건 주입** |
| `resolveOrdersAdmin` | real 키 부재 | 200 | **5(mock)** | `api_mock_fallback` | real | false | 없음 | `'mock'` | 동일 |
| `resolveOrdersRevenue(synthetic=false)` | real 성공+레코드 | 200 | 1 | `api_proxy_real` | real | true | — | `tagFromModeLive`→real | 매출 계산 |
| `resolveOrdersRevenue(synthetic=false)` | real 성공+빈배열 | 200 | 0 | `api_proxy_real` | real | true | — | real 0건 | 정상 |
| `resolveOrdersRevenue(synthetic=false)` | **real 실패** | 200 | **5(mock)** | 응답에 **sourceType 없음** | real | false | 있음 | `tagFromModeLive`→`'mock'` | **매출 계산에 mock 주입** |
| `resolveOrdersRevenue(synthetic=false)` | real 키 부재 | 200 | **5(mock)** | 〃 | real | false | 없음 | `'mock'` | 동일 |
| `resolveOrdersRevenue(synthetic=true)` | real 성공 | 200 | 1311 | `api_proxy_real` | real | true | — | real | 실1 + 시뮬 1310 |
| `resolveOrdersRevenue(synthetic=true)` | **real 실패** | 200 | **5(mock)** | 〃 | real | false | 있음 | `'mock'` | **시뮬레이션 0건 붕괴 + mock만 남음** |

### Sync All (`/api/godomall/sync`, resourceType=all) — 혼재 표기

실측: orders/inventory/sales 는 실제 성공, inquiries/reviews 는 미구현 mock.

```
sources = { orders:api_proxy_real, inquiries:api_mock_fallback, reviews:api_mock_fallback,
            inventory:api_proxy_real, sales:api_proxy_real }
전역 sourceType = api_proxy_real      ← 혼재를 감춘다 (anyLive 하나면 real)
importedCount   = 9                   ← mock 6건(문의3·리뷰3)이 합산됨
HTTP            = 200
```

### `read.ts` (category / brand / code) — 별도 계통

`isLiveMode` 아니거나 호출 실패 시 mock 반환. 다만 **표기는 정직하다**:
`mode:'mock_fallback'`, `source:'mock'`, 레코드 라벨 자체가 `(mock) 테스트 카테고리` 등.
`departmentDataService`는 `source==='real'`이 아니면 mock/unavailable 로 태깅한다.
→ 값 오염 위험은 낮으나 **"real 실패 시 자동 주입"이라는 동일 결함 패턴**은 공유한다.

## 3. 확인된 결함 (심각도 순)

1. **매출 경로의 mock 주문이 `real_godomall`/`dataKind:'real'` 로 표시된다**
   `godomallResource.ts:316` — `mapOrdersToRevenue(normalizeOrderData(getProxyMockOrders()), …, 'real_godomall')`.
   `includeSynthetic=false` 로 실제만 요청해도 유입되며, 주문 레코드 내부 표시가 실제와 구별되지 않는다.
   시뮬레이션(`synthetic_test`)은 잘 구별되어 있는데 **mock fallback 만 구별 표시가 없다.**
2. **`/api/godomall/orders-revenue` 응답에 `sourceType` 자체가 없다** (`mode`/`live`만).
   클라이언트는 `tagFromModeLive` 로 추정할 수밖에 없다.
3. **관리자 주문·매출 경로는 클라이언트 GREEN3 차단을 통과하지 않는다.**
   `departmentDataService.toSourceTag`는 실패한 실제 요청을 `'mock'`(시험 데이터)으로 태깅하며 레코드를 그대로 사용한다. 계약상 이 경우는 **'연결 안 됨' + 0건**이어야 한다.
4. **키 부재는 사유조차 남지 않는다.** `isLiveMode`가 false면 try 블록에 진입하지 않아 `errorMessage`가 `undefined`. 실패와 "설정 안 됨"이 서버 응답에서 구별 불가.
5. **Sync All 전역 `sourceType`이 혼재를 감춘다.** 하나라도 live면 `api_proxy_real`. `importedCount`에 mock 건수 합산.
6. **real 실패 + `includeSynthetic=true` 이면 시뮬레이션이 0건으로 붕괴하고 mock 5건만 남는다.**
   시뮬레이션이 실 Products 조인에 의존하기 때문. 화면에는 "실제처럼 표시된 mock 5건"만 남는 가장 오해하기 쉬운 상태.

## 4. 계약 목표 초안 (제안 — 아직 구현하지 않음)

- real/sandbox **성공 빈배열 = 실제 데이터 0건** (이미 충족: C6)
- real/sandbox **실패·미구현·키 부재 = 연결 안 됨, records 0**
- real 요청 실패 시 **mock 자동 주입 금지**
- mock/fixture 는 **사용자가 명시적으로 test/mock 을 선택한 경우에만** (이미 충족: C7)
- 2년치 운영 시뮬레이션은 자동 fallback 이 아니라 **명시적 simulation 으로 별도 유지** (이미 충족: C11)
- 상품·주문·문의·리뷰·재고·매출에 **동일한 출처 원칙** 적용
- **PII 마스킹 경계 불변**
- 계산값·기존 시험 시나리오 자체는 이번 RED 에서 변경하지 않음

## 5. GREEN 전 결정이 필요한 항목

| # | 항목 | 선택지 | **권장** | 영향 소비자 |
|---|---|---|---|---|
| 1 | 단일 실제 리소스 실패의 HTTP | (a) 503 (b) **200 + structured unavailable** | **(b)** | `secureProxyClient`·`ApiBridgePanel`·`departmentDataService` 모두 `res.ok` 분기 후 body 를 읽는다. 503 은 기존 catch 로 떨어져 오류 토스트가 되고, "연결 안 됨 0건"이라는 **정상적 상태**를 오류로 만든다. body 에 `sourceType:'unavailable'`+`records:[]`+`errorMessage` 를 실으면 기존 파서가 그대로 동작 |
| 2 | Sync All 부분 실패의 전역 표기 | (a) 전역 유지 (b) **전역 `mixed`/`partial` + 리소스별 sources 권위** (c) 전체 실패 취급 | **(b)** | `ApiBridgePanel`(전역 배지), `App.withCanonicalInquiries`(리소스별 provenance). 이미 리소스별 `sources` 를 반환하므로 클라이언트 `summarizeScreenStatus` 와 정합. 전역은 표시용으로 강등 |
| 3 | `ResourceSource` 에 `unavailable` 추가 | (a) 추가 (b) 기존 3종 유지 | **(a) 추가** | `dataSourceProvenanceContract.classifyResource` 는 이미 `st === 'unavailable'` 을 처리한다(95·184행). 클라이언트는 **이미 준비돼 있고** 서버만 못 보내는 상태. 타입은 `api/_shared/godomallResource.ts` 내부 + 3개 라우트 |
| 4 | admin/revenue 를 이번 슬라이스에 포함 | (a) **함께** (b) 분리 | **(a) 함께** | 결함 1·2·3이 전부 이 두 경로에 있다. 분리하면 "가장 위험한 경로"가 열린 채 남는다. 다만 revenue 는 `summary` 계산이 붙어 있어 **0건 요약의 의미**를 함께 정의해야 함(0원 vs 미확인) |
| 5 | category/brand mock fallback 동시 처리 | (a) 함께 (b) **별도 후속** | **(b) 별도** | 표기가 이미 정직(`source:'mock'`, 라벨에 `(mock)`)하고 계산·통계 오염이 없다. 범위를 키우면 핵심 슬라이스 검증이 흐려진다. `DATA-SOURCE-SERVER-02` 로 등재 권장 |
| 6 | 클라이언트 GREEN3 와 중복돼도 서버 방어 유지 | (a) **유지** (b) 서버만 (c) 클라만 | **(a) 유지** | 클라 차단은 `ApiBridgePanel` 경로에만 있고 admin/revenue·AI facts 경로는 우회한다. 서버가 애초에 mock 을 만들지 않으면 모든 소비자가 자동으로 안전해진다. 클라 차단은 이중 방어로 남긴다 |

### 추가 판단 필요 (조사 중 발견)

- **결함 6(시뮬레이션 붕괴)**: real 실패 시 `includeSynthetic=true` 의 2년치 시뮬레이션이 0건이 된다. mock 주입을 막으면 이 경우 **매출 대시보드가 완전히 빈 화면**이 된다. 시뮬레이션이 실 Products 없이도 독립적으로 서야 하는지는 **별도 결정 사항**이며, 이번 슬라이스에서 임의로 바꾸지 않았다.
- **의도적 fallback 여부**: `read.ts`의 category/brand/code mock 은 "구조 데모용 최소 샘플"이라고 주석에 명시돼 있고 라벨도 `(mock)` 이다. 제거가 아니라 **명시적 선택 시에만 제공**으로 바꾸는 것이 맞는지 확인 필요.

## 6. 이번 단계 범위

제품 소스 변경 **0파일**. 신규 파일 2개(RED 검사 1 + 이 문서 1). main·Production·기존 브랜치 무변경. push·Preview 없음.

---

# GREEN 구현 결과 (2026-07-23)

확정 결정에 따라 구현했다. 제품 소스 5파일 변경.

## 확정 계약 (구현됨)

| 상황 | records | source/sourceType | live | summary | errorMessage |
|---|---|---|---|---|---|
| real/sandbox 성공 + 레코드 | 실제 | `api_proxy_real`/`_sandbox` | true | 유효 | — |
| real/sandbox **성공 빈배열** | `[]` (0건) | `api_proxy_real`/`_sandbox` | **true** | **유효한 0값** | — |
| real/sandbox 실패·미구현·**키 부재** | `[]` (0건) | **`unavailable`** | false | **null** | 안전한 사유 |
| **명시적 mock 모드** | fixture | `api_mock_fallback` | false | 유효 | — |

- HTTP 는 모든 경우 **200 + structured unavailable** (503 아님).
- 키 부재 사유: `Godomall live mode is not configured (mode/keys missing).`
- 사유 문구에 키·URL 파라미터·raw XML·PII 를 담지 않는다(검사 B7로 잠금).

## Sync All

`syncStatus` 신설: `success` / `partial` / `unavailable` / `fixture`.
부분 실패면 전역 `sourceType='unavailable'` + `syncStatus='partial'`, **성공 리소스는 `sources` 로 보존**.
`importedCount` 는 허용된 레코드만 합산(unavailable 리소스는 0건). `resourceErrors` 로 리소스별 사유 보존.
집계는 `summarizeSyncAll()` 공용 함수로 올려 라우트에 복사본을 두지 않는다(검사가 실제 코드를 검증).

## 매출 경로

- 실제 주문 조회와 상품 카탈로그 조회를 **독립 수행**(한 try 블록 분리).
- 실제 주문 실패 → mock 을 실제 자리에 넣지 않고 0건 + `realOrdersStatus='unavailable'` + 사유 보존.
- **주문 실패 + 상품 성공 + `includeSynthetic=true` → 2년치 시뮬레이션은 그대로 생성**(`syntheticStatus='success'`).
  실제 주문 연결 실패 안내는 `realOrdersErrorMessage` 로 별도 보존.
- 상품 조회까지 실패 → `syntheticStatus='unavailable'`. **작은 mock 상품으로 조용히 대체하지 않는다.**
  → 후속 **`SIMULATION-CATALOG-BASELINE-01`** 로 기록(이번에 새 baseline 미구현).
- `RevenueDataSource` 에 `fixture_mock` 추가 → 명시적 시험 fixture 는 `dataKind:'mock'`.
  **실제·시뮬레이션·fixture 3자가 서로 구별된다.**
- `/orders-revenue` 응답에 `sourceType`·`realOrdersStatus`·`syntheticStatus`·각 사유 추가.

## 클라이언트 (이중 방어 유지)

- `departmentDataService.toSourceTag`: `api_mock_fallback` 만 `'mock'`, 그 외 미상은 **`'unavailable'`(fail-closed)**.
  실패한 실제 요청이 '시험 데이터'로 둔갑하지 않는다 → 화면은 '연결 안 됨'.
- `fetchRevenue`: 서버 `sourceType` 이 있으면 그것이 권위, 없으면 구버전 호환으로 `mode/live` 추정.
- 클라이언트 GREEN3(`resolveFetchOutcome`) 자동대체 차단은 **제거하지 않았다**(서버·클라 양쪽 방어).

## 범위 밖 (기록만)

- **`DATA-SOURCE-SERVER-02`** — `read.ts` category/brand/code mock fallback. 표기는 이미 정직(`source:'mock'`, 라벨 `(mock)`)이라 이번에 수정하지 않음.
- **`SIMULATION-CATALOG-BASELINE-01`** — 상품 카탈로그 없이도 시뮬레이션이 서려면 baseline 이 필요. 이번에 임의 생성하지 않음.
- C4-SERVER-01 · DATA-QUALITY-DOMAIN-01 · RC-2 미착수.
