# 현재 상태 (사실 기준선)

정본 위치: `D:\godo\docs\governance\CURRENT_STATE.md`
최종 갱신: 2026-07-27 (B-core-2a 재고위험 판정 단일화)

**규칙**: 이 문서는 **관측된 사실만** 적는다. 계획·의도·추정은 `MASTER_PLAN.md`에 쓴다.
주장에는 확인 범위를 함께 쓴다(헌법 §10). 확인하지 않은 것은 "미확인"으로 남긴다.

---

## 1. Git·배포

| 항목 | 값 | 확인 방법 |
|---|---|---|
| local main | `5d8051e362c8849dd69fa63ab9502108046a08be` (B-core-2 까지 fast-forward 통합) | `git rev-parse main` |
| origin/main = Production Source 기준 | `5190f685ebfc0b7bb686817fa9d37216797171e1` (**local main보다 5커밋 뒤**, 미푸시) | `git rev-parse origin/main` |
| 인증 기능 브랜치 | `fix/auth-foundation-01-red` → `838e2c447f5f7f813845330746e377f156628bde` · **main 미병합** | `git rev-parse` / `git branch --merged main` |
| 현재 작업 브랜치 | `codex/b-core-2a-inventory-risk-boundary` (`5d8051e`에서 분기, **main 미통합**) | `git rev-parse --abbrev-ref HEAD` |
| 실행 환경 | **Vercel이 유일한 실행 환경** — 개발·검증·Production 모두 담당. 최종 배포 형태는 H단계 미결 | Vercel 대시보드 관측 |

## 2. 검사·빌드 (B-core-2a 브랜치 기준)

| 항목 | 값 | 확인 방법 |
|---|---|---|
| smoke 파일 수 | **122개** (B-core-2 parity 기준선 + B-core-2a 재고 단일화. 인증 브랜치에 3개 추가분 있음) | `ls scripts/smoke-*.mjs \| wc -l` |
| manifest include | **122** / exclude **0** | `node scripts/run-regression.mjs --discover` |
| lint | **0 errors** (`scripts/flowRouteSmoke.ts:49` 수정 후) | `npx eslint .` |
| build | 통과 (`tsc -b` + `typecheck:api` + `vite build`) | `npm run build` |
| `npm test` 실제 소요 | **약 130초** (smoke 113.5s + build + lint), exit 0 | `npm test` 실행 |

B-core-2a 커밋 후 재검증: smoke **122/122**·build·`typecheck:api`·lint 통과, exit 0. 원격 push·Production 배포는 하지 않았다.

주의: 과거 과제의 스모크 8건이 `git status --porcelain`으로 **미커밋 작업 트리**를 검사한다. 제품 파일을 고친 뒤 커밋 전에 `npm test`를 돌리면 그 8건이 실패한다(결함 아님, 커밋 후 통과).

## 3. 고도몰 연결

- 기존 시험몰: 사용자는 **계정 만료**로 알고 있으나, **2026-07-27 07:24~07:25 GMT 관측 시점에 Open API는 정상 응답했다**(아래). 계정 만료와 API 차단 시점이 다를 수 있음 → **사용자 확인 필요**
- 새 판매몰 계정 생성 완료, **개발자 등록·API 키 발급 대기 중**
- 키는 채팅으로 전달받지 않는다. **Preview 환경변수 등록 → 검증 → Production 등록** 순서
- 서버 기본 모드: `GODOMALL_API_MODE` 미설정 시 **`mock`** (`api/_shared/secretGuard.ts:25`). **현재 Production은 `real`**, partner/user 키 present (`/api/godomall/health` 관측 — 값 미확인)

### 상품 13건의 출처 — **확정 (B1-0, 2026-07-27)**

**출처 = 현재 Production에 설정된 real 모드 고도몰 Open API의 실제 응답. 프로젝트 기록상 기존 시험몰 자료로 판단한다. `sourceType: api_proxy_real`은 애플리케이션 실행 경로와 일치한다.**

- 확인 대상: **Production** `godo-psi.vercel.app` / Source `5190f68` / branch `main`
  (최초 13건 관측은 Preview `838e2c4`였고, 두 배포의 조사 대상 코드 경로는 동일)
- `api_proxy_real`은 `godomallResource.ts:187` 한 곳에서만 할당되며 **외부 호출 성공 후**에만 붙는다. 실패 시 mock으로 떨어지는 경로가 **없다**(실패 = `unavailable` + 0건)
- 시뮬레이션 카탈로그는 이 경로에 진입하지 않는다 — `loadSimCatalogV1`은 `resolveResource`가 아니라 Sync All 합성 경로(`:465`)에서만 사용
- **지문 일치의 방향**: `simCatalogV1.data.ts` 매니페스트가 `capturedFrom: '/api/godomall/products (Production, sourceType api_proxy_real)'`라고 스스로 기록한다. 카탈로그가 **이 응답에서 떠 온 사본**이므로 13건이 같은 것이 당연하다(주입이 아님)
- mock fixture는 **4건**이고 productId 체계가 다르다 → 후보 탈락
- CDN 캐시 아님: `x-vercel-cache: MISS` · `age: 0`. 왕복 **1832 ms**는 외부 호출과 양립하는 보조 정황이며, 외부 호출 성공 판정은 코드 분기와 `api_proxy_real` 응답을 함께 근거로 한다
- 라벨이 상태를 구분함(같은 시점 관측): products/inventory **api_proxy_real 13건** · orders **api_proxy_real 0건**(실제 0) · inquiries/reviews **unavailable 0건**(미연결). 소요도 각각 600~3000 ms vs ~220 ms로 갈린다

증거·재현 명령: `docs/governance/evidence/B1-0_PRODUCT_SOURCE_AUDIT.md`

**미확인**: Vercel 함수 런타임 로그 원문 · 시험몰 계정의 실제 만료 상태 · 최초 Preview 관측 시점의 응답 원본(미보존)

## 4. 데이터·저장

- 업무 기록은 **브라우저 localStorage 중심**
- `taskLifecycleStore.ts:16` `MAX_TASKS = 500` · `:52` `slice(-500)` · `:54` 저장 실패를 조용히 무시
- `activityLedger.ts:10` `MAX_EVENTS = 500` · `:37` `slice(-500)`
- → **501번째부터 오래된 이력이 경고 없이 사라짐** (헌법 §5 위반 상태, B5에서 해소)
- 데이터 세계가 둘: `activeOperationsData`(적재 스냅샷, 소비자 12파일 + `src/engine` 2파일) / `fetchRevenue`(라이브 읽기, 호출자 3곳, **공유 캐시 없음·인자 상이**)

### 재고위험 판정 — **단일화 완료 (B-core-2a, 2026-07-27)**

**판정 정본은 `src/services/inventoryRiskContract.ts` 하나다.** 같은 상품의 재고위험 여부가 A 화면과 B 화면에서 갈리지 않는다.

- 추가: `classifyStockRiskWithSaleState(input)` — 우선순위 ① `soldOut===true` → `out_of_stock` ② `stockEnabled===false` → `ok`(무제한) ③ 그 외(신호 없음 포함) → 기존 `classifyStockRisk`
  → 신호 없는 CSV/JSON 업로드는 ③으로 떨어져 **기존 계약과 동일**
- `StockRiskBasis`(`sold_out_flag`/`unlimited_stock`/`stock_number`)로 판정 근거 보존
- 제거: `godomallInventoryDerive.DEFAULT_SAFETY_STOCK = 3` · `computeInventoryStatus`
  → Goods_Search 응답에 상품별 안전재고 필드가 없는데 `'3'`을 실으면 계약의 `resolveSafetyStock`이 이를 **유효한 상품별 값**으로 받아 정본 기본값 5가 적용될 여지를 없앤다. 근거 없으면 빈 문자열로 보존
  → `computeInventoryStatus`의 `status` 출력은 **소비자 0건**(전수 검색)인 dead output이면서 판정 규칙만 한 벌 더 존재했다
  → api 번들이 브라우저 계층을 import 하지 않도록, **계약을 끌어오는 대신 판정을 걷어냈다**(api→src import 선례 0건 유지)
- `dataNormalizer.normalizeInventoryItem`: 자체 2갈래 분기(임계 `<=` vs `<`) 제거 → 계약 호출
- `agentExecutor.ts`: `item.stock <= item.safetyStock` 직접 비교 제거(**계약 우회 3건 중 1건 해소**)
- `StandardInventoryItem.status`에 **`'unknown'` 추가** — 해석 불가 재고를 정상으로 숨기지 않는다
  → `AiBriefing.tsx:35`(`warning||danger` 판정)와 `DataPanel.tsx:899`(초록 `success` 배지)에서 unknown이 조용히 정상으로 보이던 것 보정

**재고 임계 직접 비교 전수 재검색**(`src/` + `api/`, 계약 파일 제외, 정규식 `stock\s*[<>]=?\s*(\w+\.)*(safetyStock|0)`): **0건**

**행동이 바뀐 지점**(의도된 교정)
| 대상 | 이전 | 이후 | 이유 |
|---|---|---|---|
| 고도몰 파생 재고의 안전재고 | 3 (조작된 값) | 정본 5 (전역 기본값) | 근거 없는 값을 만들어내지 않는다 |
| CSV/JSON 업로드 경계값 | `stock < safetyStock` | `stock <= safetyStock` | 계약 기준. `stock === safetyStock`이 이제 위험 |
| 경고 문구(비파생 경로) | "…보다 적습니다" | "…이하입니다" | 계약이 `<=`이므로 이전 문구가 부정확했다 |
| 비수치·누락 재고 | `status='ok'` (숨김) | `status='unknown'` | 헌법 §10 — 확인 못한 것을 정상으로 단정하지 않는다 |

검사: `scripts/smoke-b-core-2a-inventory-risk-single-source-v0.mjs` **43/43** · `audit-b-core-2-ab-parity.mjs` **[재고] RED 없음**

### A/B 데이터 세계 차이 — **실측 (B-core-2, 2026-07-27)**

동일 raw fixture(주문 10건·상품 6건)를 A·B로 투영해 **기존 공통 계약으로** 계산한 결과, 비교 20축 중 **10축 일치 / 10축 불일치**.

**일치한 축**: 전체 주문 수 · B 내부 일관성(중첩 `state` ↔ 평탄 `Lite`) · 출처 판정 6종(실제/실제 0건/시험(시험모드)/시험(실제요청=fail-closed)/합성/연결 안 됨)
→ **실제·시험·미연결 구분은 이미 하나의 계약으로 서 있다.**

**불일치한 축** (분류: 구조=A에 필드 없음 · 계산=같은 이름 다른 식 · 입력=계약은 옳으나 입력 부족)

> **갱신 (B-core-2a, 2026-07-27)**: 아래 불일치 중 **재고 관련 축은 해소**됐다(위 절 참조). 남은 RED는 **주문 7축**이며 출처 8축은 계속 일치한다.
> 현재 audit 결과: **전체 14/21 축 일치 · [재고] RED 없음 · [주문] RED 7축 · [출처] RED 없음**.
> 아래 표는 B-core-2 시점의 최초 실측 기록이다. **과거에도 일치했던 것처럼 고치지 않는다.**

| 축 | A | B | 분류 |
|---|---|---|---|
| 유효 주문 수 | 0 | 5 | 구조 (`StandardOrder`에 `paid`/`canceled`/`totalAmount` 없음) |
| 취소 주문 건수 | 표현 불가 | 2 | 구조 |
| 상품 라인 매출 | 0 | 416,000 | 구조 (`lines` 없음) |
| 배송비 합계 | 0 | 5,500 | 구조 (`deliveryFee`가 `mapOrderList` 출력에서 탈락) |
| 운영매출 | 0 | 210,500 | 구조 |
| 결제완료 건수 | 9 | 7 | **계산** — `godomallMapper.ts:328` `hasPaymentDate \|\| isPaidStatus` vs `godomallRevenue.ts:199` `isValidDate && orderStatus!=='o1'` |
| ~~기본 안전재고 상수~~ | ~~**3**~~ | ~~**5**~~ | **B-core-2a 해소** |
| ~~재고위험 건수~~ | ~~3~~ | ~~4~~ | **B-core-2a 해소** |

- **`isValidOrder`·`classifyStockRisk` 계약의 소비자는 전부 B 세계다. A 세계 소비자는 0건.**
  → 위 `A: 0`은 "지금 화면에 0원이 나온다"가 아니라 "A 투영은 공통 계약에 넣을 수 없다"는 뜻
- ~~**지금 화면에서 실제로 다른 값**: **재고위험 건수**~~ → **B-core-2a 에서 해소.** 아래는 당시 관측 기록이다. A(`DataPanel:609`·`AiBriefing:35`·`reportComposer:35,80`·`controlChatService:158,415`·`dailySummaryBuilder:101`)와 B(`CalendarPanel:102`·`ProductTeamDashboard:582`·`departmentDataSourceOfTruth:172`·`productTeamChatFacts:431`)가 다른 기준을 쓴다
- ~~재고 임계 구현이 **네 곳**으로 갈라져 있음~~ → **B-core-2a 에서 계약 한 곳으로 통합**(직접 비교 전수 0건)
- 실제 데이터 경로에는 `stockImpact`가 **아예 생성되지 않는다**(`godomallResource.ts:490` 합성 전용)
- `CalendarPanel.tsx:14`는 `activeOperationsData`를 prop으로 받지만 **본문 참조 0건** — 그 화면은 B만 소비
- `OfficeView.tsx:75`는 `.catch(() => {})`로 실패를 무시하고 `orders.length>0`일 때만 상태를 세팅 → **실패와 "실제 0건"이 화면에서 구분되지 않음**

증거·재현 명령·전체 차이표: `docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md`
검사: `scripts/audit-b-core-2-ab-parity.mjs`(RED 재현, **exit 1** — 주문 축만 남음, 정식 manifest 밖) / `scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs`(특성화 기준선, **37 pass**, manifest 등록)

### B-core 독립 구현 묶음 — **구현 완료, Codex 검증 대기 (2026-07-27)**

브랜치 `codex/b-core-independent-foundation` (`ca95a5e` 에서 분기). **Claude 는 완료·무회귀 판정을 하지 않았다.**

| 경계 | 변경 | 보존 근거 |
|---|---|---|
| 주문 공통 입구 | `OrderIntermediate`·`StandardOrder` 에 중첩 `orderFacts` 추가(취소·라인·배송비·금액·결제근거). 취소·발송·배송완료·구매확정은 `deriveOrderState` **재사용** | 기존 평탄 필드 전부 유지. `orderFacts` 는 optional — 상류가 줄 때만 존재 |
| 저장 경계 | `src/services/repositories/` 6 facade 신설. 화면의 저장소 직접 결합 **15지점 → 0건** | 저장키 6개·저장 형식·함수 동작 불변. facade 는 재수출만 함 |
| actor/executor | `assignExecutor` 가 행위자를 수행자로 자동 덮어쓰던 것 교정. `ActorRef.identitySource` 로 로그인 미연결 명시 | 두 필드 모두 optional. 구버전 저장분 `undefined` 를 단정하지 않음 |
| TeamId 정본 | `teamIdContract.ts` 신설. 3곳 중복 정의 통합. 마케팅 두 팀의 저장 의미·scope 비교 규칙 고정 | **소비자 저장 값 0건 변경** |

**결제완료 정본은 고르지 않았다.** `paymentEvidence` 가 **두 규칙의 결과**와 `conflicted` 를 모두 보존한다.
`revenueRulePaid` = `deriveOrderState` 규칙(`isValidDate(paymentDt) && orderStatus !== 'o1'`) · `mapperRulePaid` = `interpretOrderRecord` 규칙(`hasPaymentDate || isPaidStatus`).
**두 값 모두 우리 코드의 추정 규칙이며 고도몰 공식 정답이 아니다.**
최상위 평탄 `paid`/`canceled` 를 두지 않은 이유: `isValidOrder` 폴백 순서상 `canceled` 만 정의되면 **전 주문이 무효**로 판정되어 "미확정"이 "전부 무효"라는 오답이 된다.

audit `[주문]` RED **7축 → 4축**(사실 유실 해소). 남은 4축은 전부 결제 정본 미확정에서 파생된다 — C단계 선행.

**Claude 가 수행한 최소 확인만**: `tsc -b` 0 · `typecheck:api` 0 · `eslint`(변경 영역) 0 · 인접 기존 스모크 8건 PASS · 작업 트리 clean · 비밀값 0.
**수행하지 않음**: 전체 `npm test` · 전체 회귀 · Vercel/Preview/Production · 눈검증. → Codex 검증 범위.

### B-use-1 대표 경로 연결 — **1경로 구현 완료, Codex 검증 대기 (2026-07-27)**

브랜치 `codex/b-use-1-representative-data-path` (`5dcb703` 에서 분기).

선택 경로: **오늘의 운영(OfficeView) → 총괄 콘솔(ChatConsole) 운영 요약 = `controlChatService`**
근거: 마운트된 A 세계 운영 요약 경로가 이곳뿐이다. `AiBriefing`·`ReportModal` 은 렌더 호출자 0건, `CalendarPanel` 은 `activeOperationsData` 를 받고 본문에서 쓰지 않으며, `ProductTeamDashboard` 는 B 세계만 본다.

| 이전 | 이후 |
|---|---|
| `buildSystemPrompt` 와 LEVEL 1 응답이 **같은 수치를 각자 계산** | `buildHqOperationsSummary` **한 곳**에서 생성 |
| `orders.length` 만 — 취소·배송비·라인매출 표현 없음 | `orderFacts` 소비: 취소·배송비·상품 라인 매출 |
| 결제 상태를 한 규칙 결과로 단정 | `conflicted` 건수를 **결제 미확정**으로 보고, 한쪽을 정답으로 표시하지 않음 |
| 재고 `status !== 'ok'` (unknown 을 위험에 합침) | `danger/warning`(위험)과 `unknown`(확인 필요)을 분리 |
| "오늘 주문 N건" · "송장 없는 주문이 일부 있으니" (근거 없는 단정) | "적재된 주문 N건" · 송장 누락은 `riskFlags` 근거가 있을 때만 |
| 실제 0건과 연결 실패가 같은 문장 | `isActualZero` 로 분리, `연결 안 됨` 이면 수치를 만들지 않음 |
| 주문 배열 하나로 **전역 출처 판정** → 문의·재고에 그대로 사용 | `resourceProvenance` 를 정본으로 **리소스별 판정**. 주문 질문은 주문 신분, 문의 질문은 문의 신분. 구자료는 `migrateResourceProvenance` 가 fail-closed 로 판정 |

fixture 실측(주문 10·상품 6): 취소 2 · 배송비 5,500 · 상품 라인 매출 416,000 · 결제 미확정 2 · 재고 위험 4
→ **B 세계 audit 값과 일치**. 구자료(`orderFacts` 없음)는 취소·매출·배송비를 아예 말하지 않는다(거짓 0 금지).

리소스별 출처 조합 확인: 주문 actual 10 / 문의 unavailable → 문의는 '연결 안 됨'만 · 주문 actual 0 / 문의 actual 0 → 둘 다 '실제 0건(연결 실패 아님)' · 주문 fixture / 재고 actual → 각각 [시험 데이터] / [실제 데이터] · 구자료(리소스별 기록 없음)는 전역 `api_proxy_real` 만으로 actual 을 허용하지 않고 전부 '연결 안 됨'.

**Claude 최소 확인만**: `tsc -b` 0 · `typecheck:api` 0 · lint 0 · 인접 기존 스모크 10건 PASS · 4개 데이터 상태 동작 확인 · 트리 clean · 비밀값 0.
**수행하지 않음**: 전체 `npm test` · Vercel/Preview/Production · 화면 눈검증. → Codex 검증 범위.

## 5. 실행 방식

- **사실상 수동 실행 기반**. `runScheduledAgentTask`(`src/services/agentTaskRunner.ts:169`)는 정의만 있고 **제품 코드 내 호출자 0건**
- 살아 있는 진입점: `runManualAgentTask` ← `src/components/AgentTaskPanel.tsx:38`
- AI 실행은 `kind:'agent'`로, 사람의 승인·반려·중단은 `kind:'human'`으로 활동 원장에 분리 기록됨(`agentTaskRunner.ts:53,63,70,74,117,126`). 다만 사람 라벨이 `'운영자'` 하드코딩 → B3에서 실제 계정 연결

## 6. 화면·기능 — "있는데 실무에서 안 되는" 것

헌법 §6("화면에서 실제로 진입할 수 없는 기능은 완료로 인정하지 않는다") 적용 대상.

| 기능 | 코드 | 실무 | 해소 단계 |
|---|---|---|---|
| 업무 카드 → 결과 상세 | 모달·핸들러 존재 | **진입 경로 없음** (`OfficeView.tsx:34-35` props 미사용, `<TaskBoard` 렌더 0건) | B-use-3 |
| CS 답변 발송 | 초안·검수 대기실 동작 | `writeStatus:'not_connected'` — **고객에게 나가지 않음** | G |
| 예약 실행 | 함수 존재 | **호출자 0건** | E |
| 마케팅 1팀/2팀 분리 | 없음 (`marketing` 단일) | 리터럴 `'marketing'` **95곳/41파일** | 저장 의미 = B-core-5 / 소비자 이관 = Local migration |

## 7. 팀별 기능 — 존재 상태

**존재하며 동작**: 상품(매출·주문·재고 통계, 재고위험, 카탈로그, 팀 채팅) · CS(문의·리뷰 분류, AI 초안, 검수 대기실, 고객 프로필·통계) · 디자인(상세페이지 생성기, 고도몰 변환기 6,790줄, 팀 화면) · 마케팅(분석 대시보드, 질문형 분석, 행동수집 기반) · HQ(오늘의 운영, 팀 지시, 승인 대기, 활동 원장) · 공통(업무 생명주기, 팀 메시지, AI 설정실·두뇌 설정, 데이터 가져오기, 고도몰 연동 화면 — 총 10개 메뉴)

**존재하지만 실무 미완주**: 문의·리뷰 실제 API 미연결 · 고객 답글·상품등록 WRITE 잠김 · 자동발주 · 상담 챗봇 · 광고 운영

## 8. 계산 계약

정본으로 살아 있음: `revenueMetricContract`(`isValidOrder` 5파일 import) · `inventoryRiskContract`(`classifyStockRisk` 4파일) · `claimEventContract`(4파일) · `inquiryStatusContract` · `dataSourceProvenanceContract`

**제품 경로 우회 3건 남음**(Local migration, B-core 완료 직후): `src/utils/dataNormalizer.ts` · `src/engine/nativeAgentRuntime/agentExecutor.ts:70` · `src/services/csCustomerManagementFacts.ts:144-146`

## 9. 미확인 항목

- ~~Preview `products` 13건의 실제 출처~~ → **B1-0에서 확정**(§3): 현재 설정된 real 모드 고도몰 Open API의 실제 응답. 새 판매몰 키 미등록과 캡처 매니페스트를 근거로 기존 시험몰 자료로 판단
- **시험몰 계정이 실제로 만료됐는지** — Open API는 응답 중. 고도몰 관리자 확인 필요(사용자)
- **고도몰 `orderStatus` 코드의 공식 의미** — `o1`=입금대기만 실측 확정. 나머지(`p/d/g/s/f` 단계)는 코드 내 추정. **결제완료 판정을 어느 쪽으로 통일할지가 여기에 달려 있다**(B-core-2 §4-1) → C단계 입력
- **A/B 경계 사건이 실제 주문에서 발생하는지** — B-core-2 fixture의 C9·C10·NaN 재고는 코드상 가능한 경로로 만든 것이며 실제 시험몰 주문에서 관측하지 않았다(Production 주문 실제 0건이라 대조 불가)
- **`claimEventContract` A/B parity** — A 투영에 claim 표현이 전혀 없어 비교 축 자체를 세우지 못했다. provider 이후 별도 축
- 실제 운영 데이터량 (B4의 DB 사이징 입력 — 상한 가정으로 대체 예정)
- 기존 localStorage에 쌓인 시험 자료의 양과 보존 가치 (B5에서 JSON 백업 후 확인)
- 새 세션에서 시작 잠금(첫 줄 인용)이 실제로 작동하는지 — **다음 세션 첫 응답으로만 검증 가능**
