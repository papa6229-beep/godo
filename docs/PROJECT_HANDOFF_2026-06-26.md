# GODO AI OS — 통합 핸드오프 (2026-06-26)

> **목적**: 다음 세션에서 바로 이어서 작업할 수 있도록 오늘 한 작업·현재 상태·다음 할 일을 정리한 인수인계 문서.
> **상위/연관 문서**: `docs/PROJECT_HANDOFF_2026-06-25.md`(어제 = AI 두뇌 연결·팀장 채팅) · `docs/PROJECT_HANDOFF_2026-06-23.md`(프로젝트 철학·시스템 9탭·보안원칙 전체) · `docs/GODOMALL_API_IMPLEMENTATION_ROADMAP_V1.md`(고도몰 23 API 단계별 로드맵 + 오늘 완료 줄기 인덱스).
> **프로젝트 철학·시스템·보안원칙은 6/23 핸드오프(§1~3)를 그대로 따른다.** 어제(6/25)가 "AI 두뇌를 GODO 안에서 연결"한 날이었다면, **오늘(6/26)은 그 위에 "고도몰 공식 API 능력 레이어 + 일관된 가상 커머스 세계(Universe) + 공통 분석 엔진 + 부서 역할 라우팅 + 부서 채팅 실연결"이라는 데이터/분석/AI 파이프라인 전 줄기를 완성한 날이다.**

---

## 0. 한 줄 요약 (지금 어디까지 왔나)

**고도몰 Open API 23종을 READ 우선으로 정리(레지스트리/게이트웨이/카탈로그)하고, real과 똑같은 mapper 통로를 지나는 1년치 "가상 커머스 세계(Commerce Universe, 주문 826 / 고객 320 / 리뷰 167 / 문의 141)"를 기본 데이터로 승격했다. 그 위에 61-metric Analytics Query Engine → 부서 역할 라우팅(상품/CS=통계공급 → 마케팅=분석/제안 → 총괄=승인) → 4개 부서 채팅 실연결까지 한 줄로 이었다. CS 채팅은 개별 문의/리뷰 항목까지 답한다. 전부 READ-only·함수 12개 한도 유지·PII 격리(분석엔 가명 memberKey, fake PII는 CS에만).** **main HEAD `2981676`, origin 동기화 + Vercel Production 배포 완료.**

---

## 1. 어제(6/25) 종료 → 오늘(6/26) 시작 컨텍스트

* 어제 종료: main HEAD `7965df1`. AI 두뇌 연결(Claude/OpenAI/Gemini/LM Studio) + 운영/직원/부서 팀장 채팅 라우팅 + 상품팀 facts + 매출추이 필터 v0.8.
* 어제 남긴 한계: ① 상품팀 외 CS/마케팅/총괄 채팅은 페르소나만(전용 데이터 미연결) ② 고도몰 공식 API 23종 미정리 ③ 가상 데이터가 240건 규모의 단순 synthetic이라 분석 재료 빈약.
* 오늘은 이 3개를 한 번에 메우는 방향으로, **"공식 API 능력 정리 → 데이터 계약 통일 → 풍부한 가상 세계 → 분석 엔진 → 부서 라우팅 → 채팅 연결"** 순서로 줄기를 쌓았다.

---

## 2. 오늘 완성된 파이프라인 (★핵심 그림)

```
[고도몰 Open API 23종]  ──정리──▶  godomallApiRegistry (capability/READ·WRITE/부서/PII/RateLimit)
   │                                  └ READ 통합 게이트웨이 api/godomall/read.ts?capability=<id> (함수 12개 한도 유지)
   │                                  └ Catalog: category_search / brand_search → godomallCatalog + godomallCatalogBinding(코드→한글 라벨)
   ▼
[데이터 계약 통일]  Commerce Data Contract v0
   RevenueOrder 가산 확장(memberKey·settleKind·orderChannel·claimSummary·isFirstPurchase·dataKind·syntheticSource)
   분석 계약(가명 memberKey, PII 없음)  vs  CS Contact 계약(fake PII, origin 표식)  분리
   ▼
[일관된 가상 세계]  Synthetic Commerce Universe v1  →  Activation v0(기본 source 승격)
   syntheticCommerceUniverse.ts: 1년치 고객 320 / 주문 826 / 리뷰 167 / 문의 141 / CS contact(fake PII)
   godoRaw-like 흐름(가상 raw → mapOrdersToRevenue → RevenueOrder) = real과 동일 mapper 통로
   ▼
[공급관]  /api/godomall/orders-revenue
   기본: orders/revenue (PII 없음)
   ?includeUniverseAux=true: safe customers/reviews/inquiries (PII 없음)
   &includeCsFakeContacts=true: CS 전용 fake contact (synthetic일 때만)
   ▼
[공통 분석 엔진]  analyticsQueryEngine.ts (61 metric registry + QuerySpec)
   runAnalyticsQuery(dataset, spec): 기간필터→groupBy→compareTo, supportLevel/requiredData/chartHint, PII 제외
   ▼
[부서 역할 라우팅]  departmentFactsRouting.ts
   buildDepartmentFactsBundleFromUniverse(...) →
     productTeam(매출/상품 통계) ─handoff─┐
     csTeam(문의/리뷰/클레임 + fakeContacts) ─handoff─┤
                                                       ├▶ marketingTeam(분석/제안 recommendationCandidates)
                                                       │      └▶ manager(executiveSummary + approvalQueueCandidates)
   ▼
[부서 채팅 실연결]  departmentChatFacts.ts + DepartmentWorkspacePanel
   buildDepartmentChatContext(team, bundle, csDetail) → 팀별 슬라이스만 + 역할 경계 지침 → chatWithTeam
   CS는 safe 개별 문의/리뷰 shortlist까지 답변
```

---

## 3. 오늘 작업 로그 (머지 순서, 6/25 `7965df1` 이후 14블록)

> 앞 7블록은 "고도몰 공식 API 능력 + 데이터 계약 + 가상 세계" 기반 다지기, 뒤 7블록은 "분석/라우팅/채팅" 줄기. 각 블록 = 브랜치 → 검증 3종 → `--no-ff` merge → push (+ 해당 시 Vercel 배포·라이브 curl).

**A. 고도몰 API 능력 · 데이터 계약 · 가상 세계 (기반)**
1. `128dda4` **GodoMall OpenAPI Full-Spec Registry v1** — PDF 전 페이지 독해 → `godomallApiRegistry.ts`(23 capability + READ/WRITE/부서/PII/RateLimit 분류) + 3종 문서. smoke 13/13.
2. `14e23e0` **Code_Search READ Bridge v0** — `godomallCodes.ts`(code_type 13종 동적 조회), 라이브 검증.
3. `5dd649f` **READ API Gateway v1** — `api/godomall/read.ts?capability=<id>` 통합 게이트웨이. **Vercel Hobby 함수 12개 한도 정책 확립**(새 READ는 route 파일이 아니라 게이트웨이 핸들러로). `GODOMALL_ROUTE_BUDGET_POLICY_V1.md`.
4. `9926c5f` **Catalog Taxonomy READ v0** — category_search + brand_search(`godomallCatalog.ts`), 라이브.
5. `c7e35d2` **Catalog Taxonomy Binding v0** — `godomallCatalogBinding.ts`(코드→한글 라벨, 매출 카테고리/브랜드 분해).
6. `b05360c` **Product Team Catalog Facts Wiring v0** — `fetchCatalog()` → 상품팀 채팅 카테고리 한글 라벨 실사용.
7. `1b0666f` **Commerce Data Contract v0** — `RevenueOrder` 가산 확장(memberKey·settleKind·orderChannel·claimSummary 등) + synthetic 기본경로 legacy→godoRaw 전환(real과 동일 mapper) + `commerceContactContract.ts`(fake PII 정책). 라이브: 기본 godoRaw 480건.
8. `1a5066c` **Synthetic Commerce Universe v1** — `syntheticCommerceUniverse.ts`: 1년치 고객/주문/리뷰/문의/CS contact 일관 생성(결정적 mulberry32) + `syntheticCommerceFacts.ts`. smoke 26/26.
9. `4766a49` **Synthetic Commerce Universe Activation v0** — orders-revenue 기본 synthetic source를 godoRaw→**commerce_universe_v1** 승격(`pickSyntheticSource`). 라이브: 기본 826 / godoRaw 480 / legacy 240.

**B. 차트 수정 · 채팅 grounding (UI/정확도)**
10. `eb860d9` **Product Dashboard Trend Chart Fix v0** — `productDashboardTrendBuckets.ts`(선택 기간 연속 버킷, 빈 구간 0, x축 라벨 정책 month≤18 전부) + KPI "가상 현재 재고"→"재고 위험 상품". smoke 10/10.
11. `ee2109f` **Product Team Chat Data Grounding Fix v0** — `monthly_range` intent + `parseRequestedMonthRange`(YYYY년 M월~M월, 최근 N개월) + availableMonthRange 기반 "데이터 없음" 판단(범위 질문이 단일 월로 축소되던 버그 해결). smoke 13/13.

**C. 분석 엔진 · 부서 라우팅 · 채팅 연결 (오늘의 주 줄기)**
12. `bcdf387` **Analytics Query Engine v0** — `analyticsQueryEngine.ts`: **61-metric registry** + QuerySpec + `runAnalyticsQuery(dataset, spec)`(기간/groupBy/compareTo/supportLevel/chartHint, PII 제외). Tier1/2 실계산, Tier3 requires_external_data. `RevenueOrderLite`에 Contract 분석필드 가산. smoke 25/25.
13. `6049424` **Department Facts Routing v0 (역할 기반)** — `departmentFactsRouting.ts`: 상품/CS=통계공급 → 마케팅=분석/제안 → 총괄=승인. 팀별 metric pack(역할 경계 강제), 마케팅 제안(rule-based), approvalQueueCandidates. **분석 제안은 마케팅팀만, fake PII는 CS팀만.** smoke 12/12.
14. `9c534b7` **Commerce Universe Aux Data Routing v0** — orders-revenue 확장(`?includeUniverseAux`/`&includeCsFakeContacts`) + `commerceUniverseAux.ts`(safe 매핑) + `buildDepartmentFactsBundleFromUniverse`. 라이브: aux 320/167/141(PII 없음), csContacts 320(전부 fake). smoke 18/18.
15. `b7936d7` **Department Chat Wiring v0** — `departmentChatFacts.ts`(`buildDepartmentChatContext(team, bundle)`) + 패널이 번들 생성 → 상품/CS/마케팅/총괄 각자 슬라이스만 사용(역할 경계·PII 격리). smoke 16/16.
16. `2981676` **CS Chat Inquiry Detail Context Patch v0** — CS 채팅이 summary 숫자뿐 아니라 **safe 개별 문의/리뷰**(최근 미답변/긴급/최근 문의 + 저평점 리뷰 + CS 이슈 상품, 각 ≤5건·createdAt desc·PII 없음)로 답변. "조회 불가/관리자 확인" fallback 제거. smoke 15/15. **← 가장 최근.**

---

## 4. 오늘 추가/변경된 파일 맵

### 4-1. 서버 (`api/`)
* `api/_shared/godomallApiRegistry.ts` — 23 capability 레지스트리(READ/WRITE/부서/PII/RateLimit).
* `api/godomall/read.ts` (게이트웨이, 기존) + `godomallCodes.ts`/`godomallCatalog.ts`/`godomallCatalogBinding.ts` — Code/Category/Brand READ + 코드→라벨.
* `api/_shared/godomallOrderNormalize.ts`/`godomallOrderTypes.ts`/`godomallOrderCodes.ts`/`orderRawAudit.ts` — Order_Search 정규화·타입·코드·감사.
* `api/_shared/commerceContactContract.ts` — 분석 vs CS Contact 계약 + `SYNTHETIC_FAKE_PII_ORIGIN`.
* `api/_shared/syntheticGodomallOrders.ts` — godoRaw 시뮬레이터(가상 raw → mapper).
* `api/_shared/syntheticCommerceUniverse.ts` — 1년치 일관 세계 생성기(고객/주문/리뷰/문의/contact).
* `api/_shared/syntheticCommerceFacts.ts` — Universe facts(재구매율/객단가/결제·채널/클레임/리뷰/CS).
* `api/_shared/commerceUniverseAux.ts` (★오늘 후반) — universe → safe customers/reviews/inquiries + csOnlyFakeContacts(게이트).
* `api/_shared/godomallResource.ts` — `resolveOrdersRevenue` 옵션(includeUniverseAux/includeCsFakeContacts) + `pickSyntheticSource`(기본 commerce_universe_v1) + universeAux 반환.
* `api/godomall/orders-revenue.ts` — `?includeSynthetic&syntheticSource&includeUniverseAux&includeCsFakeContacts` 파싱.

### 4-2. 프론트 서비스 (`src/services/`)
* `analyticsQueryEngine.ts` (★) — 61-metric registry + QuerySpec + `runAnalyticsQuery`(순수, 데이터셋 주입형, PII 제외).
* `departmentFactsRouting.ts` (★) — `buildDepartmentFactsBundle` / `buildDepartmentFactsBundleFromUniverse` / `buildTeamFactsPackets`(역할 경계 metric pack + 마케팅 제안 + 승인 후보).
* `departmentChatFacts.ts` (★) — `buildDepartmentChatContext(team, bundle, csDetail)`(팀 슬라이스→역할 경계 context+지침, CS safe inquiry/review shortlist) + `toChatTeam`.
* `productDashboardTrendBuckets.ts` — 매출추이 연속 버킷 + 라벨 정책(순수 helper).
* `departmentDataService.ts` (변경) — `fetchRevenue(.., options)` + `RevenueResult.universeAux` + Safe* 미러 타입 + `RevenueOrderLite` Contract 분석필드.
* `productTeamChatFacts.ts` (변경) — `monthly_range` intent + 범위 파싱.

### 4-3. 프론트 컴포넌트 (`src/components/`)
* `DepartmentWorkspacePanel.tsx` (변경) — 어느 팀이든 첫 선택 시 공용 데이터 1회 로드(aux+csFakeContacts), `useMemo`로 DepartmentFactsBundle 생성, 팀별 슬라이스 채팅 연결, CS는 `csDetail`(safe inquiry/review + goodsNo→상품명) 전달.
* `ProductTeamDashboard.tsx` (변경) — 매출추이 버킷 helper 사용 + KPI 재고 위험 카드.

### 4-4. 스모크 (총 17개, 전부 통과)
`smoke-godomall-api-registry`(13) · `smoke-godomall-code-search` · `smoke-godomall-catalog`/`-binding` · `smoke-product-team-catalog-facts` · `smoke-order-search-empty-guard` · `smoke-godomall-read-gateway` · `smoke-commerce-data-contract` · `smoke-synthetic-commerce-universe`(26) · `smoke-synthetic-commerce-universe-activation`(10) · `smoke-product-dashboard-trend-buckets`(10) · `smoke-product-team-chat-grounding`(13) · `smoke-analytics-query-engine`(25) · `smoke-department-facts-routing`(12) · `smoke-commerce-universe-aux-data-routing`(18) · `smoke-department-chat-wiring`(16) · `smoke-cs-chat-inquiry-detail-context`(15).

---

## 5. 현재 상태 / 데이터 기준과 한계 (★중요)

* **기본 데이터 = Commerce Universe v1**: 고객 320 / 주문 826 / 리뷰 167 / 문의 141 / CS contact 320(fake PII). 대시보드·전 부서 채팅이 이 데이터셋 기준. (`?syntheticSource=godoRaw`=480, `=legacy`=240 명시 옵션 유지.)
* **부서 채팅 동작 범위(오늘부터)**: 상품팀=매출/상품/카테고리/브랜드 통계, CS팀=문의/리뷰/클레임 + 개별 항목 + 가상 contact(표식), 마케팅팀=상품·CS handoff + 고객/세그먼트/채널 + 제안 후보, 총괄=요약 + 승인 후보. **모두 facts(엔진 계산) 기반, 숫자 추측 금지.**
* **PII 격리(검증됨)**: 분석/orders-revenue 기본/productTeam·marketingTeam·manager에는 PII 없음(가명 memberKey만). fake PII는 `?includeCsFakeContacts=true` + csTeam.fakeContacts에만, origin(isFakePii/piiType=fake/syntheticProfile) 표식 유지. CS 개별 문의/리뷰 목록에도 연락처 미포함.
* **함수 한도**: Vercel Hobby 12개 유지(새 route 없이 게이트웨이/옵션 확장으로 흡수).
* **아직 requires_external_data**: ROAS/전환율/캠페인 비교/쿠폰/신규가입·방문 전환 — adSpend·campaignCalendar·trafficEvents·signupEvents 필요. 엔진이 "계산 불가 + 필요 데이터" 반환.
* **아직 synthetic_only**: 리뷰/문의/고객 세그먼트 지표는 Universe로만 가능. real 전환 시 `Board_List.php`(리뷰/문의) + 회원 READ 필요.
* **dev 한계(어제와 동일)**: 로컬 `npm run dev`(순수 vite)는 `/api/godomall/*` 미서빙 → 실수치 눈검수는 **배포(Vercel) 환경**. 분석/라우팅/채팅 facts 로직은 smoke로 단위 검증(LLM 호출 없이 context/계산 검증).

---

## 6. Git / 브랜치 상태 (2026-06-26 종료 시점)

* **main HEAD**: `2981676` (origin/main 동기화 + Vercel Production 배포 완료).
* **Repo**: https://github.com/papa6229-beep/godo · **Prod**: https://godo-psi.vercel.app (unprotected alias, 라이브 curl 검증용).
* **오늘 머지된 feature 브랜치**(머지 후 정리 가능): 위 §3의 14블록 각 브랜치(`feature/analytics-query-engine-v0`, `feature/department-facts-routing-v0`, `feature/commerce-universe-aux-data-routing-v0`, `feature/department-chat-wiring-v0`, `fix/cs-chat-inquiry-detail-context-v0`, `fix/product-dashboard-trend-chart-v0`, `fix/product-team-chat-data-grounding-v0`, 등).
* **미커밋 산출물**(커밋 금지): `.playwright-mcp/`, 눈검수 스크린샷 `*.png`, `docs/GODO_AI_OS_MASTER_DEFINITION.md`·`docs/PROJECT_HANDOFF_2026-06-24.md`(untracked), docs PDF류(gitignored).
* **검증 상태**: `npm run lint` / `npx tsc --noEmit` / `npm run build` 통과, **smoke 17/17 통과**.

---

## 7. 내일 바로 시작할 수 있는 작업 후보

1. **태준님 Production 실검수(채팅 4팀)** — Claude 키로 ① 상품팀(월별 매출/카테고리/브랜드/순위/객단가) ② CS팀("가장 최근 미답변 문의" 개별 항목/긴급/저평점 리뷰/CS 이슈 상품) ③ 마케팅팀(상품+CS 연결 제안 / ROAS는 adSpend 필요 안내) ④ 총괄(전체 요약 / 승인 후보) 눈검수. (대시보드 추이 필터도 함께.)
2. **CS Workspace Response Simulation v0** — csTeam.fakeContacts(가상 PII)로 개별 문의에 대한 **응대 초안** 생성(반드시 "synthetic/fake 가상 고객" 표시). CS 개별 문의 detail + 가상 contact 결합.
3. **Analytics Result Modal v0** — `chartHint`(bar/line/donut/scorecard) 기반 그래프 팝업(엔진 결과 시각화). 그동안 미룬 UI.
4. **Board READ v0 (real CS 데이터)** — `Board_List.php`(bdId=goodsqa/goodsreview) 게이트웨이 핸들러 추가 → Universe synthetic → real 문의/리뷰 전환. PII는 서버 마스킹 경유.
5. **Approval Queue 실연결** — 마케팅 recommendationCandidates → 사람 승인 → 실행(Human-in-the-loop). WRITE는 여전히 기본 OFF.
6. **자연어 → QuerySpec 파서 확장** — 현재는 intent 매핑/직접 호출. 채팅 질문을 엔진 QuerySpec으로 일반 변환.

---

## 8. 작업 규칙 / 검증 (매 작업 공통)

* **검증 3종 필수**(커밋 전): `npm run lint` · `npx tsc --noEmit` · `npm run build`. 가능하면 관련 smoke까지.
* **브랜치 전략**: main 직접 작업 금지 → 작업별 브랜치 → 검증 통과 → `--no-ff` merge → push. 커밋 말미 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
* **함수 한도**: Vercel Hobby 12개 고정. 새 고도몰 READ는 route 파일이 아니라 **게이트웨이(`read.ts?capability=`) 핸들러 또는 기존 route 옵션 확장**으로. WRITE route는 Approval Runtime 전까지 금지.
* **PII 원칙**: 분석(orders-revenue/productTeam/marketingTeam/manager)엔 PII 없음(가명 memberKey만). fake PII는 CS 채널(`includeCsFakeContacts`/csTeam.fakeContacts)에만 + origin 표식. real PII는 facts/log/docs/smoke에 박제 금지.
* **숫자 = 코드(facts/엔진) 계산**: AI는 facts 안에서만 설명, 추측 금지. "고도몰 관리자에서 확인" 류 fallback 금지(데이터 있으면 답, 없으면 없다고).
* **smoke emit 패턴**: 프론트(src/) = `--module esnext --moduleResolution bundler`; 다중 파일 import는 emit 후 상대 import에 `.js` 보정. api/_shared = nodenext. 항상 `--ignoreConfig`.
* **라이브 검증**: Vercel env가 Sensitive(pull 불가) → 배포 후 prod alias(`godo-psi.vercel.app`)에 curl로 실응답 확인.
* **신규 세션 컨텍스트 복원**: 이 문서 + 6/25·6/23 핸드오프 + `GODOMALL_API_IMPLEMENTATION_ROADMAP_V1.md` + 각 줄기 `docs/*_V0.md`.

---

*문서 끝. (작성: 2026-06-26, main HEAD `2981676`, smoke 17/17, Vercel 배포 완료)*
