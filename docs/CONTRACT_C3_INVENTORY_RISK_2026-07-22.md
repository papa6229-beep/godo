# C-3 재고 위험 단계 계약 — RED 보고 (2026-07-22)

> 상태: **RED 제출 · GREEN 미착수.** 이 문서 + `scripts/smoke-c3-inventory-risk-contract-v0.mjs`만 이번 커밋에 포함(제품 계산 소스 변경 0).
> 브랜치: `fix/rc-1-c3-inventory-risk-contract` (기준선 main `cb29c90`). C-2 브랜치 재사용 안 함.
> main 미변경 · Production 재배포 없음.

## 1. 계약 (사장 승인)

| 조건 | 상태 |
|---|---|
| `stock <= 0` | **out_of_stock** (위험) |
| `0 < stock <= safetyStock` | **low_stock** (주의) |
| `stock > safetyStock` | **ok** |

- 상품별 `safetyStock` 우선. **누락/NaN/음수/잘못된 문자열 → 전역 기본값 5.**
- **위험 수량 합계 = out_of_stock + low_stock**, 단 상태별 수량도 분리 노출.
- 판매속도·재고 소진 예상일은 **이번 범위 제외**.

## 2. RED 결과 (`smoke-c3-inventory-risk-contract-v0.mjs`)

사장 지정 fixture(8종)를 **실행 가능한 순수 소비자 2개**(productTeamChatFacts·departmentDataSourceOfTruth)에 실제 모듈로 투입.

**[BASE] 7/0 — 계약 목표값 정합(불변)**: out_of_stock=1(P1) · low_stock=4(P2·P4·P5·P6) · ok=3(P3·P7·P8) · 위험합계=5 · safetyStock 누락/무효→5 · safetyStock=0→warning밴드 없음.

**[RED] 0 met / 5 unmet — 현재 소비자 vs 계약**:
| RED | 목표 | 현재 |
|---|---|---|
| R1 | chat 위험 수 = 5 | **4** (≤5 고정, safetyStock 무시) |
| R2 | snapshot riskyStockCount = 5 | **8** (≤20 고정) |
| R3 | 두 소비자 위험 수 일치 | **chat 4 ≠ snap 8** |
| R4 | chat이 safetyStock 기준 위험(P4·P5) 분류 | P4·P5 **미분류**(ok 처리) |
| R5 | snapshot 상태별(out_of_stock/low_stock) 분리 노출 | **필드 없음**(undefined) |

→ **같은 재고가 소비자마다 다른 위험 건수**(계약 5 · chat 4 · snapshot 8)로 나오는 결함을 값으로 고정.

## 3. 네 소비자 현재 vs 목표 비교표

| 소비자 | 위치 | 현재 임계값 | fixture 위험 판정 | 목표(계약) |
|---|---|---|---|---|
| productTeamChatFacts | `:409` | ≤0 danger / ≤5 warning / ok | 위험 **4** (P1·P2·P6·P8) | 위험 5, safetyStock 반영 |
| departmentDataSourceOfTruth | `:113` | ≤20 → riskyStockCount | 위험 **8** (전부) | 위험 5, 상태별 분리 |
| ProductTeamDashboard (React·문서화) | `:52`, `:589-590` | ≤20 danger / 21–40 warn; riskCount(≤20)/warnCount(21–40) | riskCount **8** | 공통 계약, safetyStock 반영 |
| CalendarPanel (React·문서화) | `:27`, `:93` | RISK_THRESHOLD=20 (≤20) | riskGoods **8** | 공통 계약 |

> React 소비자 2개는 node 단위실행 불가라 임계값을 소스에서 문서화. GREEN에서 4 소비자 모두 공통 계약 함수로 라우팅하고, 그때 순수 헬퍼로 분리해 회귀검증에 편입한다(이번 RED 범위는 실행 가능한 2개).

## 4. 데이터 연결 확인 (item 3)

- **조인키**: 4 소비자 모두 `revenue.stockImpact[].syntheticProjectedStock`을 **`productId`로 참조**(`StockImpactItem`은 `productId`·`goodsNo` 둘 다 보유). **같은 상품 = 같은 재고값** → 발산은 오직 임계값 차이.
- **`StockImpactItem`에 `safetyStock` 필드 없음**(`departmentDataService.ts:228-244`). 위험화면 경로(orders-revenue → stockImpact)에 safetyStock이 실려오지 않는다.
- **safetyStock 존재 위치(위험화면과 미연결)**: `api/_shared/godomallMapper.ts:56`(Goods_Search, 기본 `'5'`) · `api/_shared/godomallInventoryDerive.ts:16`(**`DEFAULT_SAFETY_STOCK=3`** — mapper의 5와 **불일치**) · `utils/dataNormalizer.ts`(기본 5) · `types/dataConnector.ts`·mock 데이터.
- **기존 상태 함수**: `godomallInventoryDerive.computeInventoryStatus(stock, stockEnabled, soldOut, safetyStock)` = soldOut→danger / stockEnabled&&stock≤0→danger / stockEnabled&&stock≤safety→warning / ok. 계약과 유사하나 **기본값 3**, `stockEnabled/soldOut` 게이팅, 라벨 `ok/warning/danger`. → 공통 계약으로 승격 시 기본값 5·라벨(out_of_stock/low_stock) 조정 필요.

## 5. safetyStock=0 (item 2 — 확인 후 권장)

- 기존 `computeInventoryStatus`는 `safetyStock=0`을 **유효**로 취급(≤0만 danger, warning 밴드 없음).
- 합성/mock 데이터에는 `safetyStock=0` 사례 없음. `godomallMapper`는 필드 없으면 `'5'`(0을 명시적으로 만들지 않음).
- **권장**: `safetyStock=0`은 **유효 설정**(주의 밴드 없음)으로 취급하고, **누락/무효만 전역 5**로 대체. 단 실 고도몰에서 `0`이 '미설정'을 뜻하는지 실데이터 확인은 후속(현재 원천 없음). ← 사장 확정 필요 항목.

## 6. 조인 실패·상품 메타 누락 시 정책(제안)

- 재고값(`syntheticProjectedStock`)은 `stockImpact`에 항상 존재 → 조인 실패해도 stock은 확보.
- `safetyStock` 조인 실패/누락/무효 → **전역 기본값 5** 적용(계약).
- productId/goodsNo 불일치로 상품 메타를 못 찾아도 재고 판정은 가능(safetyStock=5로).

## 7. 공통 계약 함수 제안 위치·API

신규 `src/services/inventoryRiskContract.ts` (revenueMetricContract·firstPurchaseContract 패턴, 부서 공통):
```ts
export type StockRiskStatus = 'out_of_stock' | 'low_stock' | 'ok';
export const DEFAULT_SAFETY_STOCK = 5;
export function resolveSafetyStock(raw: unknown): number;              // 누락/NaN/음수/무효 → 5, 0 유효
export function classifyStockRisk(stock: number, safetyStock?: unknown): StockRiskStatus;
export function summarizeStockRisk(items: { stock: number; safetyStock?: unknown }[]):
  { outOfStock: number; lowStock: number; ok: number; risky: number };  // risky = out+low
```
4 소비자가 이 함수만 호출(소비자별 임계값 복붙 제거). 기존 `godomallInventoryDerive`의 기본값 3→5 정합은 함께 검토.

## 8. 수정 예상 파일 (GREEN)

- 신규 `src/services/inventoryRiskContract.ts`
- `src/services/departmentDataService.ts` — `StockImpactItem`에 `safetyStock` + 조인(products/goodsNo)
- `src/services/productTeamChatFacts.ts` (`:409`) · `src/services/departmentDataSourceOfTruth.ts` (`:113` + 상태별 분리)
- `src/components/ProductTeamDashboard.tsx` (`:52`,`:589-590`) · `src/components/CalendarPanel.tsx` (`:27`,`:93`)
- (검토) `api/_shared/godomallInventoryDerive.ts` 기본값 3→5 정합

## 9. 범위 밖

- 판매속도·재고 소진 예상일(잔여일) 계산 — 명시 제외.
- 실 고도몰 `safetyStock` 필드 신규 API 연결 — 원천 확인 후속.
- 서버 경로(`godomallInventoryDerive`/`godomallMapper`) 전면 통합 — 이번은 위험화면 4 소비자 통일 중심.
- C-4·RC-2 — 넘어가지 않음.

## 10. RED 제출 상태

- 제품 계산 소스 변경 **0**(test + 문서만).
- 기존 기준선 통과와 의도된 C-3 실패 **분리**([BASE]/[RED]).
- main 미변경 · Production 재배포 없음.

## 11. GREEN 완료 상태 (2026-07-22)

구현 4조각(공통 계약 재사용, 소비자별 임계값 복붙 제거):
- **A** `src/services/inventoryRiskContract.ts` 신설(`classifyStockRisk`·`resolveSafetyStock`·`summarizeStockRisk`, `DEFAULT_SAFETY_STOCK=5` 단일 상수, level=out_of_stock/low_stock/ok/**unknown**, 근거 level·stock·resolvedSafetyStock·safetyStockSource) + **상품별 safetyStock 데이터 경계 1회 연결**(`computeSyntheticStockImpact`가 이미 계산하던 상품별 safetyStock을 방출 → `StockImpactItem.safetyStock`, 누락 undefined 보존).
- **B** `productTeamChatFacts`·`departmentDataSourceOfTruth` 이관(공통 계약 사용, snapshot에 out_of_stock/low_stock/unknown/attention 분리, chat이 unknown을 '확인 필요'로 분리).
- **C** `ProductTeamDashboard`·`CalendarPanel` 이관(하드코딩 ≤20/≤40/RISK_THRESHOLD 제거, `summarizeStockRisk` 호출).
- **D** 서버 `godomallInventoryDerive` 판정 — 아래 §12.

**검증**: C-3 [BASE]8/0 · [RED]10/10(MET) · safetyStock 파이프라인 5/0 · 소비자별 임계값 복붙 없음.

## 12. 조각 D — 서버 `computeInventoryStatus` 판단 (item 3)

**확인 결과: 동일 함수 아님 → 임의 변경하지 않고 차이·근거를 기록.**
- `api/_shared/godomallInventoryDerive.computeInventoryStatus`는 **별도 데이터 경로**(Products/Goods_Search 재고 스냅샷 → `deriveInventoryFromProducts` → 운영 인벤토리 스냅샷)로, **C-3 위험화면 4 소비자(`stockImpact`/`syntheticProjectedStock`)와 다른 파이프라인**이다.
- 코어(안전재고 기반: `stock<=safety→warning`)는 같은 계열이나, **추가 게이팅**(`soldOut→danger`, `stockEnabled===false`면 무제한 재고로 품절 아님)이 있어 순수 stock/safety 계약과 **동일하지 않다**.
- 기본값 불일치: 서버 `DEFAULT_SAFETY_STOCK=3` vs 공통 계약 `5` vs `godomallMapper` `'5'`.
- **조치**: 서버 함수는 api/_shared(서버) 경계라 client `inventoryRiskContract`를 import할 수 없고, 숫자 5를 복사하면 "한 곳 관리" 원칙 위반이라 **임의 변경하지 않는다**. C-3 위험화면 4 소비자는 공통 계약(기본 5)로 통일 완료. 서버 Products-인벤토리 경로의 기본값 3·게이팅 정합은 **별도 후속**(경계 간 공통 상수 공유 설계 필요, 이번 범위 밖)으로 기록.

## 13. 합성 재고 분포 비퇴화 (별도 데이터 품질 작업)

- **문제(RED)**: `computeSyntheticStockImpact`가 `initialStock = max(0,netSold) + safety`로 만들어 **projectedStock == safetyStock**(40/40) → 계약 적용 시 **전 상품 low_stock(100%)**. 계약·조인은 정상, **합성 생성식이 퇴화**.
- **조치(생성기만 수정, C-3 판정 임계값·safetyStock 연결·C-2 데이터 불변)**: productId 기반 **결정적 시나리오**(Math.random 미사용)로 목표 재고 분산.
  - 시나리오 선택 해시 salt `c3-stock-scenario:` (안전재고 생성 해시와 **분리**), 밴드 값 salt `c3-low-band:`/`c3-ok-band:`.
  - 목표 분포 out_of_stock ~10% / low_stock ~25% / ok ~65% (실측 40종: **out 5 / low 9 / ok 26**).
  - 상태별 projectedStock: out=0 / low=1..safety / ok=safety+1..safety+40. `initialStock = 목표 + netSold` → `initialStock − netSoldQuantity = projectedStock` 유지, 0 이상 정수.
- **성격(명시)**: 이 재고 분포는 **실제 재고 위험을 예측하거나 실제 쇼핑몰의 정상 비율을 주장하는 모델이 아니라, UI·업무 흐름·위험 분류 검증을 위한 결정적 합성 시나리오**다(문서·`api/_shared/syntheticRevenue.ts` 주석에 명시). 실 고도몰 재고 연결 시 대체.
- **분포 (동일 데이터 40종)**: PRE-FIX 계약 out0/low40/ok0(riskyStockCount 40) → POST-FIX out5/low9/ok26(riskyStockCount 14). projectedStock == safetyStock: 40→0. projectedStock `min0/max114/median57`, safetyStock `min20/max78/median55.5`.

## 14. 열린 확인 (후속)
- `safetyStock=0`이 실 고도몰에서 '미설정'을 뜻하는지 실데이터 확인(현재 원천 없음 → 유효 설정으로 취급).
- **C3-SERVER-01**: 서버 `godomallInventoryDerive` 기본값 3·게이팅(별도 경로) — 이번 계약 미포함, 실 고도몰 연결 전 의미 재대조. 현재 공통 계약과 같다고 주장하지 않음.
