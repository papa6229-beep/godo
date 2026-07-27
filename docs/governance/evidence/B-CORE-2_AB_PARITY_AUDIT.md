# B-core-2 — A/B 데이터 세계 차이 실측 및 parity 기준선

작성일: 2026-07-27
브랜치: `codex/b-core-2-ab-parity` (`f345664` = local main 에서 분기)
성격: **조사 + 검사 추가.** 제품 코드 변경 0. 화면·API·환경변수·배포 변경 없음.
재현: `node scripts/audit-b-core-2-ab-parity.mjs` (현재 **exit 1 = RED**) / `node scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs` (**38 pass / 0 fail**)

---

## 0. 한 줄 판정

**parity 는 성립하지 않는다.** 같은 raw fixture 를 넣었을 때 비교한 20개 축 중 **10축이 일치, 10축이 불일치**다.
불일치는 사소한 반올림 차이가 아니라 **A 투영에 사업 사실을 담을 필드 자체가 없는 구조 문제**와 **같은 이름의 값을 두 생산자가 다르게 계산하는 문제**다.

일치한 10축은 전부 **출처 판정(provenance)** 과 **B 내부 일관성**이다. 즉 "실제·시험·미연결 구분"은 이미 하나의 계약으로 서 있고, **수치 의미가 서지 않았다.**

---

## 1. 시작·종료 Git 상태

| 항목 | 값 |
|---|---|
| 시작 branch / HEAD | `codex/b-core-2-ab-parity` / `f345664aba167f71fb6a652d8cf4245672e515c5` |
| local main | `f345664` (B1-0 통합 완료, §0 정리 커밋 포함) |
| origin/main | `5190f685ebfc0b7bb686817fa9d37216797171e1` (**미푸시** — local main 이 4커밋 앞섬) |
| merge-base(main, origin/main) | `5190f685` |
| 인증 브랜치 | `fix/auth-foundation-01-red` → `838e2c4` (**미변경**) |
| B1-0 통합 여부 | 완료 (`2f0e166` + 정정 `f345664` fast-forward) |

---

## 2. 구조 지도 — A 세계

### 2-1. A 생산자

| 파일:행 | 역할 |
|---|---|
| `src/App.tsx:239-246` | 초기값. `localStorage['godo.data.activeSnapshot']` 복원 → `migrateLegacyGhostOrders` → `withCanonicalInquiries`. 실패 시 `defaultOperationsData` |
| `src/App.tsx:248-256` | `setActiveOperationsData` — **모든 갱신이 통과하는 단일 setter**. 내부에서 `withCanonicalInquiries` 재적용(멱등) |
| `src/App.tsx:65-82` | `withCanonicalInquiries` — 문의 status canonical 화(`normalizeInquiryRecords`) + `migrateResourceProvenance` |
| `src/App.tsx:372` | localStorage 쓰기(`useEffect`, `activeOperationsData` 변경마다) |
| `src/components/ApiBridgePanel.tsx:198` | 리소스 1건 동기화 → `buildOperationsSnapshot(resourceType, rawItems, activeOperationsData)` |
| `src/components/ApiBridgePanel.tsx:199` | `updatedSnapshot.sourceType = result.sourceType` (스냅샷 전체 sourceType 을 마지막 리소스 값으로 덮어씀) |
| `src/components/ApiBridgePanel.tsx:201` | `resourceProvenance[resourceType] = statusRec` (리소스별 신분 보존) |
| `src/components/ApiBridgePanel.tsx:303-342` | Sync All — 리소스 루프, `currentSnapshot` 을 누적 갱신 |
| `src/components/DataPanel.tsx:256` | 파일 import 경로의 `buildOperationsSnapshot` |
| `src/components/DataPanel.tsx:328` | 시나리오 스냅샷 교체(default/cs/review/order/stock) |
| `src/utils/dataNormalizer.ts:483-512` | `buildOperationsSnapshot` — 도메인별 `normalizeOrder`/`normalizeInquiry`/`normalizeReview`/`normalizeInventoryItem`/`normalizeSalesSummary` |
| `src/data/defaultOperationsData.ts:3,239,245,391,519,645` | 기본 스냅샷 + 시나리오 5종 |
| `src/types/dataConnector.ts:104-116` | `OperationsDataSnapshot` 타입 정본 |
| `src/services/legacyOrderSnapshotMigration.ts:103-119` | 복원 경계 전용 유령 주문 청소 |

### 2-2. A 소비자 — 무엇을 읽는가

| 파일:행 | orders | inquiries | reviews | inventory | sales | sourceType | resourceProvenance | qualityReport |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `src/components/DataPanel.tsx:69-112,563-1044` | ● | ● | ● | ● | ● | ● | ● | ● |
| `src/utils/dailySummaryBuilder.ts:42-168` | ● | ● | ● | ● | ● | ● | | ● |
| `src/components/ReportModal.tsx:40-78,173-179` | ● | ● | ● | ● | ● | ● | | ● |
| `src/services/controlChatService.ts:155-164,412-415` | ● | ● | ● | ● | | ● | | |
| `src/engine/reportComposer.ts:23-80` | ● | ● | ● | ● | | | | |
| `src/components/AiBriefing.tsx:22,30,34,38` | ● | ● | ● | ● | | | | |
| `src/engine/nativeAgentRuntime/agentExecutor.ts:28,32,41,70,155,197` | ● | ● | ● | ● | | | | |
| `src/engine/csDraftGenerator.ts:86` | | ● | | | | | | |
| `src/components/ChatConsole.tsx:408` | 전달만 (→ `controlChatService`) |
| `src/components/MainLayout.tsx:354,387,486,498,510` | 전달만 (5개 하위 화면) |
| `src/components/OfficeView.tsx:121` | 전달만 |
| `src/components/CalendarPanel.tsx:14` | **prop 만 받고 본문에서 한 번도 쓰지 않음** ↓ |

`CalendarPanel` 은 `activeOperationsData` 를 prop 으로 받지만 본문에서 참조가 0건이다(전체 파일 검색 결과 `:14` 타입 선언뿐).
같은 화면이 **오직 B 세계(`fetchRevenue`)만** 소비한다. 두 세계가 만나는 지점에서 A 가 조용히 버려지는 실례다.

---

## 3. 구조 지도 — B 세계

### 3-1. B 생산자

| 파일:행 | 역할 |
|---|---|
| `src/services/departmentDataService.ts:424-555` | `fetchRevenue(includeSynthetic, syntheticSource, options)` — `/api/godomall/orders-revenue` 직접 fetch. **캐시 없음** |
| `src/services/departmentDataService.ts:390-393` | `FetchRevenueOptions { includeUniverseAux, includeCsFakeContacts }` |
| `src/services/departmentDataService.ts:371-388` | `RevenueResult` |
| `src/services/departmentDataService.ts:260-303` | `RevenueOrderLite` (평탄 상태 필드 + lines + claim + 마케팅 가산 필드) |
| `src/services/departmentDataService.ts:401-422` | `parseSummary` — 서버 summary 를 숫자로 강제 |
| `src/services/departmentDataService.ts:396-399` | `tagFromModeLive` — 구버전 응답 호환 폴백. **`sourceType` 이 있으면 그것이 권위**(`:530`) |
| `api/godomall/orders-revenue.ts:36-52` | 라우트. `resolveOrdersRevenue` 결과를 그대로 전달 |
| `api/_shared/godomallResource.ts:386-508` | `resolveOrdersRevenue` — 실주문 + 합성주문 + `stockImpact` 조립 |
| `api/_shared/godomallResource.ts:400` | 실주문 경로 `mapOrdersToRevenue(rawOrders, index, 'real_godomall')` |
| `api/_shared/godomallResource.ts:490` | `stockImpact = canSynthesize ? computeSyntheticStockImpact(...) : []` — **합성일 때만 생성** |
| `api/_shared/godomallRevenue.ts:190-212` | `deriveOrderState` — `paid/unpaid/shipped/delivered/confirmed/canceled` |
| `api/_shared/godomallRevenue.ts:233-283` | `mapLine` — `lineRevenue = goodsPrice × quantity`, 상품 조인 |
| `api/_shared/godomallRevenue.ts:386-467` | `mapOrdersToRevenue` |
| `api/_shared/godomallRevenue.ts:469-508` | `summarizeRevenue` |

### 3-2. B 소비자 — 호출 인자와 사용 필드

| 호출자 | `includeSynthetic` | `syntheticSource` | `includeUniverseAux` | `includeCsFakeContacts` |
|---|:-:|:-:|:-:|:-:|
| `src/components/CalendarPanel.tsx:89` | `true` | (기본) `commerce_universe_v1` | **없음** | **없음** |
| `src/components/OfficeView.tsx:74` | `true` | `commerce_universe_v1` | **`true`** | **없음** |
| `src/components/DepartmentWorkspacePanel.tsx:277` | `true` | `commerce_universe_v1` | **`true`** | **`true`** |

| 호출자 | 실제로 읽는 반환 필드 | 실패 처리 | 어디로 전달되는가 |
|---|---|---|---|
| `CalendarPanel.tsx:102,108,110` | `stockImpact`(`syntheticProjectedStock`,`safetyStock`,`productId`) · `orders`(`orderDate`,`deliveryFee`,`totalAmount`,`sourceType`,`lines.lineRevenue`) | `.catch` 없음. `fetchRevenue` 가 내부에서 잡아 `unavailable`+0건 반환 → 화면은 `screenStateFromRevenue` 로 판정 | 운영일지 달력 셀·재고위험 배지 |
| `OfficeView.tsx:75` | `orders` · `universeAux.reviews` · `universeAux.inquiries` **(길이>0일 때만 상태에 반영)** | `.catch(() => {})` — **조용히 무시**. `orders.length===0` 이면 상태를 아예 세팅하지 않아 "0건"과 "실패"가 화면에서 같아진다 | HQ 중앙 채팅 통계·그래프 |
| `DepartmentWorkspacePanel.tsx:296,305,332,341,345,347,373,410,418,486,756` | `orders`·`summary`·`syntheticSource`·`realOrdersStatus`·`stockImpact`(하위 대시보드)·`universeAux` | `Promise.all` 에 `.catch` 없음(`fetchRevenue` 가 throw 하지 않음) | 부서 채팅 facts · 상품팀 대시보드 · CS bundle |

**세 호출자의 인자가 서로 다르므로 같은 화면 세션 안에서 세 개의 서로 다른 B 결과가 동시에 존재할 수 있다.** 공유 캐시·공유 스냅샷이 없다(`departmentDataService.ts` 전체에 캐시 코드 0건).

---

## 4. 차이 실측표

fixture: `scripts/fixtures/b-core-2-ab-fixture.mjs` (주문 raw 10건 · 상품 raw 6건, 개인정보 없음)
계산: 검사 안에서 공식을 복제하지 않고 **기존 계약**(`revenueMetricContract` / `inventoryRiskContract` / `dataSourceProvenanceContract`)을 호출.

| 축 | A 세계 | B 세계 | 반드시 같아야 함 | 의도적으로 달라도 됨 | 분류 | 위험 |
|---|---|---|---|:-:|---|---|
| **데이터 획득** | 브라우저 상태 + localStorage(`godo.data.activeSnapshot`) | 화면 mount 마다 `/api/godomall/orders-revenue` fetch | — | ● | 의도된 범위 차이 | A 는 새로고침 후에도 옛 값이 남고, B 는 매번 최신 — 같은 화면에서 시점이 어긋난다 |
| **갱신 시점** | 사용자가 Sync/Import 를 누를 때만 | 화면 진입마다(3 호출자 각각) | — | ● | 의도된 범위 차이 | 위와 동일 |
| **캐시** | localStorage 영속 | **없음** | — | ● | 의도된 범위 차이 | 동일 세션 3중 fetch |
| **실패 처리** | mock 자동대체 차단 → `resourceProvenance=unavailable` | `unavailable`+0건 반환. `OfficeView` 는 `.catch` 로 무시 | ● | | **실제 결함**(OfficeView 만) | 실패와 "실제 0건"이 화면에서 구분되지 않음 |
| **출처 판정 4상태** | `classifyResource` | `classifyResource` | ● | | **보존(일치)** | — |
| **전체 주문 수** | 10 | 10 | ● | | **일치** | — |
| **유효 주문 식별(주문별)** | 전 주문 `false` | `[T,F,F,T,T,F,T,T,F,F]` | ● | | **구조 차이** | `StandardOrder` 에 `paid`/`canceled`/`totalAmount` 필드가 없어 계약 적용 자체가 불가 |
| **유효 주문 수** | **0** | **5** | ● | | **구조 차이** | 상동 |
| **취소 주문 판정** | 표현 불가(필드 없음) | 2건 | ● | | **구조 차이** | 취소가 A 에서 사라진다 |
| **결제완료 판정** | 9건 | 7건 | ● | | **실제 결함(계산)** | 같은 사실을 두 함수가 다르게 판정 ↓§4-1 |
| **상품 라인 매출** | **0** | **416,000** | ● | | **구조 차이** | `StandardOrder` 에 `lines` 없음 |
| **배송비 합계** | **0** | **5,500** | ● | | **구조 차이** | `StandardOrder` 에 `deliveryFee` 없음(`interpretOrderRecord` 는 계산해 놓고 `mapOrderList` 출력에서 탈락) |
| **운영매출(유효주문 결제금액)** | **0** | **210,500** | ● | | **구조 차이** | 상동 |
| **재고위험 건수** | **3** | **4** | ● | | **실제 결함 + 입력 부족** | ↓§4-2 |
| **기본 안전재고 상수** | **3** (`godomallInventoryDerive.ts:17`) | **5** (`inventoryRiskContract.ts:24`) | ● | | **실제 결함(계산)** | 같은 이름 상수의 두 값 |
| **문의·리뷰** | 스냅샷에 도메인으로 존재(현재 라이브 미연결) | `universeAux`(합성) | | ● | 의도된 범위 차이 | 소비자·출처 다름 |
| **`stockImpact`** | 없음 | 합성일 때만 생성(`godomallResource.ts:490`) | | ● | 의도된 범위 차이 | **실제 데이터에는 재고위험 입력이 아예 없다** |
| **`universeAux`** | 없음 | B 전용 | | ● | 의도된 범위 차이 | 소비자: `OfficeView`·`DepartmentWorkspacePanel` |
| **`qualityReport`** | A 전용 | 없음 | | ● | 의도된 범위 차이 | 소비자: `DataPanel`·`ReportModal`·`dailySummaryBuilder` |
| **import metadata** (`importedAt`, `ImportHistoryItem`) | A 전용 | 없음 | | ● | 의도된 범위 차이 | 적재 이력 표시 전용 |

### 4-1. 결제완료 판정이 갈리는 정확한 지점

| | A 경로 | B 경로 |
|---|---|---|
| 함수 | `api/_shared/godomallMapper.ts:328` (`interpretOrderRecord`) | `api/_shared/godomallRevenue.ts:199` (`deriveOrderState`) |
| 식 | `hasPaymentDate(paymentDt) **||** isPaidStatus(orderStatus)` | `isValidDate(paymentDt) **&&** orderStatus !== 'o1'` |
| 출력 | 문자열 `'결제완료'` / `'미결제'` / `''` | boolean `paid` / `unpaid` |

측정된 갈림 사건 2건(양방향):

| fixture 사건 | 원본 | A | B |
|---|---|---|---|
| `C9 경계 paymentDt+o1` | `paymentDt` 유효 + `orderStatus='o1'`(입금대기) | **결제완료** | **미결제** |
| `C10 경계 배송중+결제일시없음` | `paymentDt` 없음 + `orderStatus='d1'`(배송중) | **결제완료** | **미결제** |

A 는 `||` 라 상태코드만으로 결제를 인정하고, B 는 `&&` 라 결제일시가 없으면 인정하지 않는다.
**어느 쪽이 옳은지는 이번 범위에서 판단하지 않는다.** 고도몰 상태코드 의미 확정은 C단계(새 몰 READ 검증) 입력이다.

### 4-2. 재고위험이 갈리는 정확한 지점

A 는 `dataNormalizer.ts:380-415` 의 `status`('ok'|'warning'|'danger') 를 쓰고, 소비자는 `i.status !== 'ok'` 로 판단한다
(`DataPanel.tsx:609` · `AiBriefing.tsx:35` · `reportComposer.ts:35,80` · `controlChatService.ts:158,415` · `dailySummaryBuilder.ts:101`).
B 는 `inventoryRiskContract.classifyStockRisk` 를 쓴다(`CalendarPanel.tsx:31,102` · `ProductTeamDashboard.tsx:56,582` · `departmentDataSourceOfTruth.ts:172` · `productTeamChatFacts.ts:431`).

**즉 `isValidOrder`·`classifyStockRisk` 계약의 소비자는 전부 B 세계다. A 세계 소비자는 0건이다.**

| fixture 상품 | 원본 | A 판정 | 계약 판정(재고만 투입) | 원인 |
|---|---|---|---|---|
| `P3 안전재고 경계(4)` | stock 4, 재고사용 y | **정상** | **부족(위험)** | 안전재고 기본값 **3 vs 5** — 같은 이름 상수의 두 값 (**실제 결함**) |
| `P5 품절표시` | stock 100, `soldOutFl=y` | **위험** | **정상** | 계약이 `soldOut` 신호를 모른다 (**입력 부족** — A 판정이 옳다) |
| `P6 무제한재고` | stock 0, `stockFl=n` | **정상** | **품절(위험)** | 계약이 `stockEnabled` 신호를 모른다 (**입력 부족** — A 판정이 옳다) |

추가로 임계 부등호도 세 곳이 갈라져 있다(이번 fixture 로는 P3 에서만 드러남):

| 구현 | 부족 판정식 |
|---|---|
| `inventoryRiskContract.ts:70` | `stock <= resolvedSafetyStock` |
| `godomallInventoryDerive.ts:34` | `stockEnabled && stock <= safetyStock` |
| `dataNormalizer.ts:410` (비파생 경로, CSV/JSON 업로드) | `stock **<** safetyStock` |
| `agentExecutor.ts:70` (계약 우회 3건 중 1건) | `item.stock <= item.safetyStock` |

### 4-3. NaN 재고 (이번 fixture 범위 밖 — 코드 관측)

`dataNormalizer.ts:373` `parseInt(norm.stock || '0')` 가 `NaN` 이면 `:376` 에서 error 로 기록하되 **행은 그대로 남고**, `:406-415` 어느 분기도 타지 않아 `status='ok'` 가 된다.
`buildOperationsSnapshot:507` 은 `rawItems.map` 이라 error 행을 버리지 않는다.
`inventoryRiskContract` 는 같은 입력을 `unknown` 으로 분류한다(계약 파일 머리말이 명시적으로 막으려던 케이스).
→ **미검증**: 실제 고도몰 응답에서 `totalStock` 이 비수치로 오는지는 확인하지 않았다.

---

## 5. fixture 설계

| 항목 | 내용 |
|---|---|
| 공통 원본 | `scripts/fixtures/b-core-2-ab-fixture.mjs` — **고도몰 Open API raw 응답 형태**(`Order_Search` / `Goods_Search`). A·B 가 실제로 갈라지는 지점이 여기이기 때문 |
| A 투영 | `mapOrderList(raw)` + `deriveInventoryFromProducts(mapGoodsToProducts(raw))` → `buildOperationsSnapshot` (= `resolveResource` → `ApiBridgePanel` 실경로) |
| B 투영 | `buildProductIndex(mapGoodsToProducts(raw))` + `mapOrdersToRevenue(raw, index, sourceTag)` → `RevenueOrder` → `fetchRevenue` 와 동일한 평탄화 → `RevenueOrderLite` (= `resolveOrdersRevenue` 실경로) |
| 두 벌 손작성 | **하지 않음.** 원본 1벌에서 파생하므로 fixture 자체의 불일치를 결함으로 오인하지 않는다 |
| 포함 주문 사례 | C1 결제완료 · C2 입금대기 · C3 발송전취소 · C4 배송완료 · C5 반품요청(미완료) · C6 반품→환불완료 · C7 배송비 있음 · C8 다중라인 · C9 경계(paymentDt+o1) · C10 경계(배송중+결제일시없음) |
| 실제/합성 구분 | 같은 원본을 `real_godomall` / `synthetic_test` 두 출처 태그로 투영해 확인(레코드 내용이 아니라 출처 태그가 구분자이므로) |
| 포함 재고 사례 | P1 정상 · P2 안전재고 경계(3) · P3 안전재고 경계(4) · P4 재고0 · P5 품절표시 · P6 무제한재고 |
| provenance 사례 | 실제(건수 있음) · 실제 0건 · 시험(시험모드) · 시험(실제요청=fail-closed) · 합성 · 연결 안 됨 |
| 개인정보 | 없음. 이름·연락처·주소는 `시험주문자N` 류 고정 문자열이며 A 투영에서 마스킹 경계를 통과한다(`시****1`) |
| 계약 호출 경로 | `revenueMetricContract.{isValidOrder,countValidOrders,countAllOrders,computeGrossProductRevenue,computeOperationalRevenue}` · `inventoryRiskContract.{classifyStockRisk,DEFAULT_SAFETY_STOCK}` · `dataSourceProvenanceContract.classifyResource` |

---

## 6. 검사 구성 — 왜 두 개인가

작업지시 §8 "경우 B"(parity 미성립)에 해당하므로 **RED 를 정식 게이트에 넣지 않고 별도로 보존**한다.

| 파일 | 성격 | manifest | 현재 결과 |
|---|---|---|---|
| `scripts/audit-b-core-2-ab-parity.mjs` | **RED 재현.** 20축 비교, 불일치가 남아 있으면 비정상 종료 | **미등록**(파일명이 `smoke-*` 가 아니라 러너가 수집하지도 않음) | **exit 1** · 10/20 축 일치 |
| `scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs` | **특성화 기준선.** 일치 축은 일치를 요구하고, 불일치 축은 **실측값을 고정** | **등록**(include 121) | **38 pass / 0 fail** |

특성화 검사는 불일치를 "의도된 차이"로 덮지 않는다. 각 축에 `[구조]`/`[계산]`/`[입력]` 사유를 붙이고 실제 값을 고정하므로,
어느 쪽 생산 경로가 바뀌면 **이 검사가 깨져서** 다음 작업자가 기준선을 의식적으로 갱신하게 된다.

검사가 공허하지 않음을 확인했다: 기준선 하나(`2-8` 운영매출 `210500`)를 `210501` 로 바꾸자 `37 pass / 1 fail`, exit 1 로 즉시 실패했고 원복 후 다시 38/38 이 됐다.

RED 재현 실행 결과(요약):
```
=== 10/20 축 일치 · 불일치 10축 ===
  - 유효 주문 식별(주문별)      A:[전부 false]        B:[T,F,F,T,T,F,T,T,F,F]
  - 유효 주문 수                A:0                   B:5
  - 취소 주문 판정(주문별)      A:[전부 false]        B:[F,F,T,F,F,T,F,F,F,F]
  - 결제완료 판정(주문별)       A:9건                 B:7건
  - 상품 라인 매출(gross)       A:0                   B:416000
  - 배송비 합계                 A:0                   B:5500
  - 운영매출                    A:0                   B:210500
  - 재고위험(상품별)            A:[F,T,F,T,T,F]       B:[F,T,T,T,F,T]
  - 재고위험 건수               A:3                   B:4
  - 기본 안전재고 상수          A:3                   B:5
```

---

## 7. 사용자 영향

### 7-1. 지금 화면에서 실제로 숫자가 다를 수 있는 곳

**재고위험 건수** — 두 세계가 모두 화면에 나오고 실제로 다르다.

| 세계 | 화면 | 판정 |
|---|---|---|
| A | 데이터 가져오기 "재고 부족"(`DataPanel.tsx:609`) · AI 브리핑(`AiBriefing.tsx:35`) · 보고서(`reportComposer.ts:35,80`) · HQ 채팅(`controlChatService.ts:158,415`) · 일별 요약(`dailySummaryBuilder.ts:101`) | `status !== 'ok'` (안전재고 **3**, `soldOut`·무제한 반영) |
| B | 운영일지(`CalendarPanel.tsx:102`) · 상품팀 대시보드(`ProductTeamDashboard.tsx:582`) · 부서 정본 스냅샷(`departmentDataSourceOfTruth.ts:172`) · 상품팀 채팅 facts(`productTeamChatFacts.ts:431`) | `classifyStockRisk` (안전재고 **5**, `soldOut`·무제한 미반영) |

같은 상품에 대해 한 화면은 "정상", 다른 화면은 "재고 부족"이 나올 수 있다. fixture 6건 기준 **3 vs 4**.
또 **실제 데이터에는 `stockImpact` 가 아예 생성되지 않으므로**(`godomallResource.ts:490` 합성 전용) B 쪽 재고위험은 현재 합성 자료에서만 나온다.

### 7-2. 매출·주문 숫자는 지금 화면에서 충돌하지 않는다 — 이유

`isValidOrder`·`computeOperationalRevenue` 등 매출 계약의 소비자는 **전부 B 세계**다
(`analyticsQueryEngine` · `commerceDataQueryEngine` · `departmentDataSourceOfTruth` · `marketingAnalysisExecutor` · `marketingAnalysisFacts` · `marketingChatQueryRouting`).
A 세계는 이 계약을 한 번도 호출하지 않고 `orders.length` 와 `riskFlags` 만 센다.

따라서 위 표의 `A: 0` 은 **"지금 화면에 0원이 표시된다"는 뜻이 아니다.** "A 투영을 회사 공통 계약에 넣으면 계산 자체가 불가능하다"는 뜻이다.
이 구분을 흐리면 없는 결함을 만든 것이 된다. **오픈 최소구성 6번(실제·시험·미연결 구분)과 2번(공통 통계 화면)이 하나의 입구를 쓰려면 반드시 해소해야 하는 선행 조건**이다.

### 7-3. 보고서·채팅·AI 영향

- 보고서(`reportComposer`)·HQ 채팅(`controlChatService`)·일별 요약(`dailySummaryBuilder`)·AI 브리핑은 **A 만** 본다 → 재고위험·문의 미답변 수가 B 기반 화면과 다를 수 있다.
- 부서 채팅 facts·상품팀 대시보드·마케팅 분석은 **B 만** 본다.
- `agentExecutor.ts:70` 은 계약을 우회해 **네 번째** 재고 임계식을 쓴다(기존에 기록된 우회 3건 중 1건).

### 7-4. 이번에 고치지 않은 이유

작업지시 §2·§9 가 canonical snapshot provider 신설·소비자 이관·production abstraction 추가를 이번 범위에서 금지한다.
갈림 지점(§4-1 결제 판정, §4-2 안전재고 상수)을 지금 한쪽으로 맞추면 **어느 쪽이 옳은지 판단하지 않은 채** 화면 숫자가 조용히 바뀐다.
결제 판정의 정답은 고도몰 상태코드 의미 확정(**C단계**)에 달려 있다.

---

## 8. 다음 canonical snapshot provider 의 최소 구현 경계

이 조사로 확정된 provider 종료조건 — `node scripts/audit-b-core-2-ab-parity.mjs` 가 **exit 0** 이 되는 것.

**해야 하는 것(최소)**

1. **주문 사실을 담는 공통 형태를 하나 정한다.** 최소 필드: `orderNo` · `orderDate` · `paid` · `canceled` · `shipped`/`delivered` · `deliveryFee` · `totalAmount` · `lines[{goodsNo, quantity, lineRevenue}]` · `sourceType`.
   현재 `RevenueOrderLite` 가 이 조건을 이미 만족한다 → **새 형태를 발명하지 말고 이것을 공통 입구의 출력으로 삼는 안**을 1순위로 검토한다.
2. **결제 판정을 한 곳으로 모은다.** `interpretOrderRecord.paid` 와 `deriveOrderState.paid` 중 하나를 정본으로 두고 다른 쪽이 그것을 호출한다. **정본 선택은 C단계 상태코드 확정 이후**로 미룰 수 있고, 그때까지는 두 값이 다르다는 사실을 이 검사가 붙잡아 둔다.
3. **안전재고 기본 상수를 하나로 만든다.** `godomallInventoryDerive.DEFAULT_SAFETY_STOCK(3)` 을 `inventoryRiskContract.DEFAULT_SAFETY_STOCK(5)` 참조로 바꾼다(값 선택은 사용자 정책).
4. **재고 계약의 입력을 보강한다.** `classifyStockRisk` 에 `soldOut`·`stockEnabled` 를 전달할 수 있게 한다. **계약의 판정 규칙을 바꾸는 것이 아니라 입력을 싣는 것**이다(§4-2 에서 A 판정이 옳은 두 건).
5. **실제 데이터 경로에도 재고위험 입력을 만든다.** 현재 `stockImpact` 는 합성 전용이다(`godomallResource.ts:490`).
6. **`departmentDataSourceOfTruth` 는 조합 역할을 유지하고 입력만 canonical 로 바꾼다.** 자체 fetch/cache 를 넣지 않는다(마스터 계획 §5-1 B-core-2).

**하지 않아야 하는 것**

- A 소비자 14개 파일을 한꺼번에 이관하지 않는다 → Local migration(상시 트랙).
- `OperationsDataSnapshot` 타입을 삭제하지 않는다. `qualityReport`·`importedAt`·`resourceProvenance` 는 A 전용 소비자가 실제로 쓴다(§4 "의도적으로 달라도 됨").
- 문의·리뷰 라이브 연결을 여기서 하지 않는다(현재 `unavailable`, 게시판 endpoint 미매핑).

---

## 9. 확인하지 않은 것 (미확인)

1. **실제 고도몰 응답에서 이 fixture 의 경계 사건이 실제로 발생하는지** — C9(`paymentDt` + `o1`) · C10(배송중 + 결제일시 없음) · NaN 재고는 **코드상 가능한 경로**로 만든 것이며, 실제 시험몰 주문에서 관측한 것이 아니다. Production 주문은 현재 **실제 0건**(B1-0 관측)이라 대조 불가.
2. **`orderStatus` 코드의 공식 의미** — `o1`=입금대기 외에는 코드에 적힌 추정(`p/d/g/s/f` 단계)에 의존했다. 공식 문서 대조 안 함.
3. **A 세계 소비자 14개 파일이 화면에서 실제로 어떤 숫자를 보여주는지** — 코드 경로만 추적했고 브라우저 눈검증은 하지 않았다(작업지시 §2·§11: Preview·Production·눈검증 제외).
4. **합성 데이터(`commerce_universe_v1`) 경로의 parity** — fixture 는 raw 실주문 형태만 사용했다. 합성 생성기(`syntheticCommerceUniverse`)는 이번 비교에 넣지 않았다.
5. **`claimEventContract` parity** — 반품·환불 사건(C5·C6)을 fixture 에 넣었으나, A 투영에 claim 표현이 전혀 없어 **비교 축을 세울 수 없었다**. 취소 판정(§4) 로만 대리 확인했다. claim 은 provider 이후 별도 축으로 다뤄야 한다.
6. **localStorage 500건 절단이 이 차이에 미치는 영향** — B5 범위.

---

## 10. 재현 명령

```bash
git checkout codex/b-core-2-ab-parity

# RED 재현 (현재 exit 1 이 정상)
node scripts/audit-b-core-2-ab-parity.mjs ; echo "EXIT=$?"

# 기준선 특성화 검사 (현재 38 pass / 0 fail)
node scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs ; echo "EXIT=$?"

# 전체 게이트
npm test
```

두 스크립트 모두 네트워크·Vercel·localStorage 에 접근하지 않는다. `tsc` 로 제품 모듈을 임시 디렉터리에 컴파일해 실행하며, 종료 시 임시 디렉터리를 지운다.
