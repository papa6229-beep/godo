# GODO AI OS — 전체 시스템 아키텍처 종합 보고서

> **작성일**: 2026-07-02
> **작성 기준**: main HEAD `94db11c` (직전 작업 완료 상태). 코드베이스 직접 정밀 분석(컴포넌트 66 / 서비스 52 / api 40+ / 스크립트 76) + 기존 문서 통합.
> **목적**: 이 문서 하나로 GODO AI OS의 **정체성·아키텍처·10개 탭·가상데이터 배경·파이프라인·AI 엔진·API 연동·디자인·현재상태·구조적 갭**을 완전히 파악한다.
> **성격**: 코드 근거 기반(파일:라인 인용). 이전 마스터 보고서/핸드오프가 "작업 로그"라면, 이 문서는 "시스템 스냅샷".

---

## 0. 한 줄 정의

**GODO AI OS는 NHN 고도몰(GodoMall) 쇼핑몰 "바깥에 붙는" 외부 AI 운영 보조 OS다.**
고도몰 솔루션을 직접 수정하지 않고 Open API로 데이터를 **읽기만** 하며, AI 직원들이 4개 부서(총괄·상품관리·CS·마케팅)로 나뉘어 CS·주문·재고·매출·마케팅 업무를 분석/초안하고, **사람은 마지막 승인만** 한다(Human-in-the-loop).

현재는 **테스트몰 단계**로, 실제 거래 데이터가 없어 **결정적(seed 기반) 합성 커머스 유니버스**로 구동한다. 실제 오픈 목표는 **2026년 12월**.

---

## 1. 핵심 철학 (변경 불가 4원칙)

1. **Human-in-the-loop** — 환불·쿠폰·가격·CS답변 발송 등 외부에 닿는 액션은 AI 직접 실행 불가. 반드시 Approval Queue 경유 후 사람 승인.
2. **Local-First Hybrid AI** — 반복 업무는 로컬 LM Studio(Gemma) 우선(무료·PII 안전), 고난도 전략만 클라우드(Claude/OpenAI/Gemini).
3. **API Key 프론트 영구 격리** — 고도몰 키/클라우드 AI 키 모두 서버 사이드 전용. localStorage/응답 JSON/로그 절대 노출 금지.
4. **PII 이중 마스킹** — 서버(`api/_shared/piiMaskGuard.ts`) + 클라이언트(`src/utils/privacyMask.ts`).

추가 관철 원칙(코드로 확인됨):
- **숫자는 코드가 계산, LLM은 해석만.** 매출/주문수/객단가/전환율 등 수치를 LLM이 생성하지 못하도록 어댑터 레벨에서 차단(`marketingLlmPlannerAdapter.ts`, "숫자 결과 필드 금지" 검증).
- **없는 데이터는 없다고 말한다.** ROAS·방문자·전환율·장바구니는 fake로 만들지 않고 "지원 범위 밖"으로 안내.
- **고도몰 WRITE 전면 금지.** 전 라우트 GET only, 18개+ WRITE API는 registry에서 `write_locked`.

---

## 2. 기술 스택

| 항목 | 내용 |
|---|---|
| 프론트엔드 | React 19.2 + TypeScript ~6.0 + Vite 8 |
| 의존성 | `react`, `react-dom`, `fast-xml-parser`(고도몰 XML), `pg`(행동 이벤트 Postgres) — **차트 라이브러리 없음(SVG 직접 렌더)** |
| 배포 | Vercel (정적 + Serverless Functions, Hobby 12함수 제한) |
| 상태 관리 | React useState + **localStorage 영속화**(외부 상태 라이브러리 없음) |
| 로컬 LLM | LM Studio + `google/gemma` (`127.0.0.1:1234/v1`, dev 전용 Vite proxy) |
| 클라우드 AI | Claude(기본)/OpenAI/Gemini — 서버 route `/api/ai/chat` 경유, 키 요청 단위 사용·미저장 |
| 고도몰 API | OpenHub `POST + XML`, real `openhub.godo.co.kr/godomall5`, sandbox `sbopenhub.godo.co.kr/godomall5` |
| 검증 3종 | `npm run lint` · `npx tsc -b` · `npm run build` |
| TS 프로젝트 분리 | `tsconfig.app.json`(src, 브라우저) vs `tsconfig.node.json`(api, 서버) — **교차 import 금지**(일부 allowlist는 양쪽에 중복 정의) |

---

## 3. 전체 시스템 아키텍처

```
[고도몰 Open API]  (POST+XML, OpenHub)
      │  서버만 직접 호출 (키 주입)
      ▼
[Vercel Secure Proxy]  api/godomall/*  ── GET only, PII 마스킹, 시크릿 가드
      │   real → sandbox → mock 폴백 (godomallResource.resolveResource)
      ▼
[Products READ 실데이터] + [Orders READ] ──► godomallRevenue (RevenueOrder)
      │                                          ▲
      │   실데이터 없을 때(테스트몰)              │ 조인/상태파생
      ▼                                          │
[합성 커머스 유니버스]  syntheticCommerceUniverse.ts (결정적 PRNG)
   · 2024 baseline(무프로모션) + 2025 promotion(쿠폰/이벤트)
   · 320 고객 / 6 세그먼트 / 주문·리뷰·문의·쿠폰·리워드
      │
      ▼
[단일 진실 소스]  revenueMetricContract → departmentDataSourceOfTruth
   · 대표 운영 KPI = net 유효주문 기준 (전 부서 동일 값)
      │
      ├──► [부서 대시보드]  ProductTeam / CsTeam / MarketingAnalysis
      ├──► [부서 팀장 AI 채팅]  departmentChatService (같은 데이터셋 공유)
      └──► [운영일지 캘린더]  날짜별 집계

[AI 두뇌 배선]
   aiKeyVault(키/모델/verified 단일 저장소, localStorage)
      ▼
   aiProviderAdapter.chatWithProvider()  ← 공통 통로
      ├─ local_lmstudio → lmsConnector (Vite proxy, dev)
      └─ cloud → /api/ai/chat (서버, handleAiChat) → Claude/OpenAI/Gemini
      ▼
   aiBrainSettings.resolveAgentBrain()  → provider/model만 반환 (★systemPrompt/skills 미전달)

[Native Agent Runtime]  START OPERATION 시
   planJobs(6) → executeAgentJob(병렬) → teamLeadAggregator → handoffEngine → managerOrchestrator
      ▼
   proposedTasks / proposedApprovalItems / managerBriefing → App state 반영
```

### 3-1. Vercel 라우트 인벤토리 (현재 9 entry ≤ 12)

동적 라우트로 통합해 함수 개수 제약(12개)을 해결:

| 라우트 | 역할 | 통합 여부 |
|---|---|---|
| `api/godomall/[resource].ts` | orders/inquiries/reviews/inventory/sales 5종 통합 | ★동적(`resolveResource`) |
| `api/godomall/health.ts` | 키 존재 boolean + 모드 상태 | 정적 |
| `api/godomall/read.ts` | 통합 READ 게이트웨이 | 정적 |
| `api/godomall/orders-admin.ts` | 표시용 주문(StandardOrderAdmin) | 정적 |
| `api/godomall/orders-revenue.ts` | 매출분석용(RevenueOrder, `?includeSynthetic`) | 정적 |
| `api/godomall/products.ts` | Products READ(Goods_Search) | 정적 |
| `api/godomall/sync.ts` | 통합 동기화 | 정적 |
| `api/marketing/[action].ts` | behavior-events(POST) + behavior-summary(GET) 통합 | ★동적(`actionOf`) |
| `api/ai/chat.ts` | 클라우드 AI 대화 프록시 | 정적 |

`api/_shared/*`(40개+)는 `_` prefix라 라우트 미배포, import 전용.
**핵심**: Vercel은 "데모 배포 제약"일 뿐 — 새 기능은 service layer에 만들고 gateway adapter로 붙인다.

---

## 4. 내비게이션 & 10개 탭 상세

**진입**: `OpeningScreen`(부팅 애니메이션) → `MainLayout`. 상단 헤더 = 로고 + `LOCAL APP MODE` 배지 + 테마 토글 + `▶ START OPERATION` + 탭.

**탭 구성** (`MainLayout.tsx:24-56, 255-322`): 운영 탭 4개(상시 노출) + 관리자 설정 드롭다운 6개.

| # | 탭 | activeTab | 컴포넌트 | 핵심 기능 |
|---|---|---|---|---|
| 1 | 🏢 오늘의 운영 | `office` | `OfficeView` | 3열: 좌 `TeamOperationsBoard`(부서 관제·시나리오·KPI 드릴다운) / 중 `ChatConsole`(HQ 채팅+3D 파티클) / 우 `TaskBoard`(Tasks+Approval). **START OPERATION** = Native Agent Runtime 시뮬레이션 |
| 2 | 🗂️ 부서 업무 관장 | `department` | `DepartmentWorkspacePanel` | ★핵심 3열: 좌 부서선택(총괄/상품/CS/마케팅) / 중 팀 대시보드 / 우 팀장 AI 채팅. **보는 것(중)과 제어하는 것(우)이 같은 데이터셋 공유** |
| 3 | 🤖 AI 직원 | `agents` | `AgentPanel` | 에이전트 로스터(상태/brain/스킬 표시), 상세 모달 |
| 4 | 📅 운영일지 | `calendar` | `CalendarPanel` | 날짜별 매출/주문/재고위험 배지, 일일요약, 월간 KPI, 이슈 타임라인 |
| 5 | 📡 데이터 가져오기 | `data` | `DataPanel` | CSV 업로드/정규화/미리보기/품질검사/PII마스킹/이력 (7 sub-tab) |
| 6 | 🔌 쇼핑몰 연동 | `api` | `ApiBridgePanel` | 고도몰 프록시 커넥터, health 체크, sync 로그, 모드 선택 (6 sub-tab) |
| 7 | 📝 작업기록 | `logs` | `ActivityLog` | 실시간 로그(info/success/warning/error/agent). *새로고침 시 소멸(미영속)* |
| 8 | 🧠 업무 매뉴얼 | `brain` | `BrainPanel` | 13개 지식 문서(RAG 유사, 실제 임베딩 아님·텍스트 매칭) |
| 9 | ⚙️ AI 설정실 | `studio` | `StudioPanel` | Brain/Agent/Skill(12)/Tool(10)/Permission(19)/Import-Export 편집 |
| 10 | 🚀 AI 두뇌 설정 | `engine` | `EnginePanel` | Provider 연결, 라우팅규칙(12), 안전규칙(6), 모드(5), 사용로그 + 🧩 AI Providers |

**좌측 `ChatConsole`**: office/department 탭을 제외한 모든 탭에서 좌측 사이드바로 상시 노출(HQ 운영 채팅).

---

## 5. 데이터 계층 — 가상 커머스 유니버스

### 5-1. 배경 (왜 존재하는가)

`syntheticCommerceUniverse.ts:1-12`에 명시: 실제 오픈(2026-12)까지 **실 거래 데이터가 없으므로**, 분석 대시보드·지표 계약·부서별 KPI를 검증할 "1년치 시뮬레이션 거래 세계"가 필요. 핵심 설계 의도는 **실 전환 시 같은 data contract/facts flow를 그대로 재사용**하는 것 — 데이터 소스와 메타데이터(`sourceType`, `syntheticProfile`)만 `synthetic`→`real_godomall`로 바뀌면 나머지 파이프라인(지표 계약·컨버터·KPI 수식)은 불변.

### 5-2. 생성 방식 (결정적)

- **엔진**: mulberry32 seed PRNG (`Math.random` 미사용 → 재현 가능). 기본 seed `20260626`.
- **달력**(`SYNTHETIC_CALENDAR`): 고정 2024-01-01 ~ 2025-12-31 (롤링 아님).
  - **2024 = baseline year**: 쿠폰/이벤트 없음, 모든 할인 필드 명시적 0.
  - **2025 = promotion year**: 쿠폰/마일리지/예치금/이벤트 활성.
- **고객**: 기본 320명, 6개 세그먼트 가중 분포:
  - `new`(30%, 1주문, 환불5%, AOV 1.0x), `returning`(28%, 2~4주문, AOV 1.1x), `vip_candidate`(12%, 4~8주문, **AOV 1.5x**), `dormant_risk`(12%, AOV 0.9x), `discount_sensitive`(10%, AOV 0.8x, 쿠폰+22%), `high_refund_risk`(8%, **환불35%**).
  - 코호트: both(60%, 양년 주문) / promotion_only(22%) / baseline_only(18%).
- **주문 상태 분포**(날짜필드로 상태 파생): confirmed 55%(`s1`, finishDt 있음=확정매출) / delivered 16% / shipping 12% / preparing 7% / paid 6% / unpaid 4%(`0000-00-00`).
- **클레임**: cancel 40% / refund 30% / return 20% / exchange 10%.
- **주문 라인**: 70% 단일, 30% 복수(2~3). 가격 = 실상품 price 또는 seed 기반 1000~9999.
- **쿠폰(2025만)**: base 18% + 첫구매 +17% + discount_sensitive +22% + vip +10%. 할인 합 > 상품액 60% 시 비례 축소 가드.
- **결제수단/채널**: 카드 40%/계좌이체 18%/네이버페이 16%/카카오페이 12% · 자사몰 78%/네이버페이 14%/페이코 8%.
- **리뷰**: 확정주문의 80%, 세그먼트별 긍/부정 skew. **문의**: 클레임건 70% / 일반건 12%.

### 5-3. 데이터 형태 (주요 필드)

**RevenueOrder**(분석용, PII 없음): `orderId`(SYN-YYYYMM-####), `orderDate`, `orderStatus`(s1/d2/c4/r3…), `memberKey`(가명 syn_member_XXXXXX), `memberGroupName/Code`, `isFirstPurchase`, `totalAmount`(순액), `productRevenue`(라인합), `deliveryFee`, `discountAmount`, `discountSummary{hasCoupon, totalCouponDiscountAmount, totalDiscountAmount}`, `useMileageAmount`, `useDepositAmount`, `state{paid,canceled,shipped,delivered,confirmed}`(날짜필드 파생), `lines[]{goodsNo,goodsName,quantity,goodsPrice,lineRevenue,categoryCode,categoryLabel}`, `syntheticSource`, `dataKind`, `syntheticScenario`, `syntheticYearLabel`, `claimSummary`.

**부속 데이터**(`buildUniverseAux`, `?includeUniverseAux=true`): `SafeSyntheticCustomer`(segment/orderCount/totalRevenue/claimCount), `SafeSyntheticReview`(rating/sentiment/topic), `SafeSyntheticInquiry`(status/urgency/topic). **CS 전용 fake PII**(`csOnlyFakeContacts`, `?includeCsFakeContacts=true`)는 명시적으로 `origin.isFakePii=true`, 분석 계층에는 절대 유입 안 됨.

### 5-4. 데이터 한계 (없는 것 — fake 금지)

`marketingAnalysisFacts.ts:310-321`이 "필요 데이터 부재" 공지로 명시:
- 회원 가입일(→첫구매 분석으로 대체) · 방문자/세션 · 상품 조회 이벤트 · 장바구니 이벤트 · GA4 · 광고비/클릭/노출(→ROAS/CPA 불가) · SNS 성과.
- 따라서 **방문→주문 전환율, 장바구니 이탈률, ROAS**는 구조적으로 계산 불가 → "지원 범위 밖"으로 안내.

---

## 6. KPI/지표 계약 — 단일 진실 소스

`revenueMetricContract.ts`가 모든 수치의 **단일 정의처**(부서별 drift 방지):

| 지표 | 정의 | 용도 |
|---|---|---|
| `isValidOrder(o)` | `(state.paid && !state.canceled)` 또는 `totalAmount>0` | 유효(counted) 주문 판별 |
| `grossProductRevenue` | 전체주문(취소/미결 포함) 라인합 `Σ lineRevenue` (배송비 제외) | **상품관리팀 전용** 상품 흐름 분석 |
| `netOrderRevenue` | `Σ (isValidOrder) totalAmount` | ★**canonical 운영매출**(전 부서 공통) |
| `orderCountAll` | 전체 주문 수 | 참고 |
| `orderCountValid` | `Σ isValidOrder` 건수 | ★운영 주문수 (AOV 분모) |
| `averageOrderValue` | `netOrderRevenue ÷ orderCountValid` (반올림) | ★운영 객단가 |

**단일 진실 소스 아키텍처** (`departmentDataSourceOfTruth.ts`):
`buildDepartmentSourceOfTruthSnapshot(revenue)` — 모든 부서 대시보드가 호출하는 **단 하나의 함수**. `operationalRevenue/OrderCount/AOV`(canonical) + 보조 유니버스(orderUniverse/revenueUniverse/productUniverse/customerUniverse/csUniverse) + `sourceMode`('real'|'synthetic'|'mixed'|'unavailable') 반환.

`departmentMetricContract.ts`가 라벨 계약: 운영매출/운영주문수/운영객단가는 **전 부서 동일 값**, 상품 라인매출(gross)은 상품관리 전용, 마케팅 net = 운영 대표값과 동일.
> **원칙**: "부서별 분석 관점은 다를 수 있지만, 같은 급 대표 KPI는 하나의 source of truth에서 나와야 한다."

**분석 가능 차원**(`marketingAnalysisFacts.ts`): 쿠폰 사용/미사용, 첫구매/재구매, 회원그룹(G_NEW/G_REPEAT/G_VIP/G_DORMANT/G_NORMAL), 주문채널(자사몰/네이버페이/페이코), 리워드 사용/미사용, 반복고객(orderCount>1).

---

## 7. 마케팅 채팅 분석 파이프라인

**질문 → 답변/차트**의 결정적 컴파일 구조. 진입점 `DepartmentWorkspacePanel.tsx:handleSend`(~236-343)의 우선순위 사다리:

```
0순위  buildMarketingScopeInsightResponse (scope 엔진)
         └ 앞단: Query Compiler → Executor → Narrative → Chart Grammar
              · 특정월/월범위/분기/반기/세그먼트/주문수·객단가 월별/단일기간/unsupported → 컴파일러 처리(handled)
              · revenue 월별·연도비교 + 저신뢰 broad → null → 기존 broad scope로 위임
1순위  buildMarketingIntelligenceResponseWithLlm (planner, brain 연결 시 Claude가 "계획"만)
1b     runMarketingChartRequest (고정 intent chartSpec bridge)
2순위  buildMarketingChatContext + chatWithTeam (TEAM_PERSONA + facts, Claude 해석)
```

### 7-1. Query Compiler (`marketingAnalysisQueryCompiler.ts`)

`compileMarketingAnalysisQuery(question) → MarketingAnalysisPlan`. 정규식+상태머신으로 파싱:
- **Metric**: 객단가/AOV→`averageOrderValue`, 주문수/건수→`orderCount`, 판매량→`quantity`, 기본→`revenue`.
- **Period**: 단일월(`7월`,`2024-07`), 월범위(`3~5월`,`3월부터 5월까지`), 분기(`1분기`), 반기(`상반기`), 연도, 상대(`올해/작년/이번달/지난달`). **"월별"은 구간합보다 우선**.
- **Comparison**: `yearOverYear`(2연도+동일기간) / `monthlyTrend`(월별 추이) / `segmentCompare`(쿠폰/첫재구매/회원그룹/채널).
- **Unsupported**: ROAS·방문전환·상품조회전환·장바구니이탈 → `intent='unsupported'` + 사유(빈 rows, fake 없음).
- Plan shape: `{intent, metric, period?, comparison?, aggregation, dimension?, chart{requested,suppressed,type?}, answerScope, confidence, unsupportedReason?}`.

### 7-2. Executor (`marketingAnalysisExecutor.ts`)

`executeMarketingAnalysisPlan(plan, orders, now)` — `isValidOrder`로 필터 후 canonical net 계산.
- **월범위 주문수/매출 = 구간 합산**(3~5월 = 3+4+5), 5월 단일 아님.
- **객단가 = weighted** = `기간 전체 매출 합 ÷ 기간 전체 주문수 합` (월별 AOV 단순평균 아님).
- `buildChartSpec`: series/points/unit('count'|'krw')/축라벨. 첫vs마지막 행 diff(absolute/percent/direction).
- **위임 규칙**(189-191): `confidence='low'` 또는 (comparison·period 둘 다 없음) → `null` 반환 → 호출부가 broad scope로 위임(기존 smoke 보존).

### 7-3. Chart Grammar (`marketingChartGrammar.ts`)

`selectMarketingChartType`:
```
suppressed || unsupported          → 'unsupported'
requestedTable                     → 'table'
isShare && metric≠AOV              → 'donut'      (도넛/파이는 구성비 전용)
comparisonType='monthlyTrend'      → 'groupedBar' (12개월)
rowCount ≥ 5                       → 'rankedBar'
else (2~4개)                       → 'groupedBar' (compact)
```
- **AOV/객단가·매출·주문수 비교는 절대 donut 아님.** 세그먼트(쿠폰 등)는 N buckets=N bars(rankedBar→groupedBar 교정으로 미사용/사용 2막대).
- **compact(막대 ≤4)에서 hover tooltip 카드 미렌더**(깜빡임 방지) + 여백 축소.

### 7-4. LLM 배선 (해석 전용)

`marketingLlmPlannerAdapter.ts`: LLM은 **AnalysisPlan 구조(JSON)만** 반환. 프롬프트 절대규칙 "매출/주문수/객단가/전환율 등 모든 숫자는 결정적 코드가 계산", `revenueValue/totalRevenue/computedResult` 등 숫자 결과 필드 금지, 인과 단정("때문에/덕분에") 금지, PII 키 금지. 검증 실패/파싱 실패/미연결 시 **deterministic 결과로 폴백**. → Claude 없이도 전 파이프라인 동작, 숫자는 100% 코드 계산.

---

## 8. CS 파이프라인 & 부서 facts 라우팅

### 8-1. CS 문의 처리 흐름

1. **Order Grounding** (`csInquiryOrderGrounding.ts`): 문의를 주문에 매칭(`buildAssociatedOrderFacts`) → 결제상태/금액/클레임/중복결제 후보(`findDuplicatePaymentCandidates`). **증거 정책**(`evaluateResponseEvidencePolicy`): 허용/금지 주장 규정("환불 처리되었습니다"는 claimCompletionStatus 없으면 금지 — v0에선 항상 없음).
2. **Draft 작성** (`csDraftComposer.ts`, 순수함수·LLM 없음): topic별 규칙 초안(`pickDraft`) + 안전검증(`validateCsDraftAgainstEvidencePolicy`). PII/내부필드/완료단정/중복부정 정규식 위반 시 SAFE_FALLBACK. 출력: 고객 초안 1건 + riskLevel + requiresHumanCheck + missingData.
3. **Runtime 의도 감지** (`csDraftRuntime.ts`): "답변 초안" 요청 감지 → 대상 선택(미답변>긴급>최근, 랭크/토픽 힌트) → `runCsDraftRequest`.
4. **Approval 브릿지** (`csApprovalQueueBridge.ts`): `buildCsApprovalItem` → 승인/거절 상태 관리. `writeStatus='not_connected'`(v0 실제 WRITE 없음).
5. **완료 상태** (`csWorkCompletionState.ts` + `csLocalStatePersistence.ts`): localStorage 영속, dedup(sourceType:originalId).

### 8-2. CS 대시보드 KPI (`csTeamDashboardFacts.ts`)

- 우선순위 점수: (미답변+긴급)=0 > 미답변=1 > 긴급=2 > 기타=3 (상위 12).
- 상품 위험도: high(긴급≥2 or 총이슈≥6) / medium(총≥3 or 긴급≥1) / low.
- 고객 위험도: high(클레임≥2 or 환불취소≥2) / medium / low.
- AI 처리가능 판별: 결제(매칭됨&중복없음만) / 환불·취소·반품·교환(불가) / 배송·상품·일반(가능).
- 관리자 워크플로 4-KPI: unresolved(단계별) / resolved / aiAuto(리뷰·배송만) / customers.

### 8-3. 부서 facts 라우팅 (`departmentFactsRouting.ts`)

`buildDepartmentFactsBundle(dataset)` — 역할 범위 packet 생성:
- **상품팀**: `sales_statistics_provider` — 매출/주문/객단가/카테고리·브랜드·상품 매출(facts만, 분석 금지).
- **CS팀**: `customer_issue_provider` — 문의/리뷰/클레임/환불위험 상품 (PII 없음, fake contacts는 별도 필드).
- **마케팅팀**: `analysis_and_planning` — 상품/CS 핸드오프 수신 + 직접 마케팅 facts + **규칙 기반 추천 후보**(환불위험 상품 광고컷/저판매 고평점 캠페인/재구매 리텐션).
- **총괄(HQ)**: `approval_and_priority` — executive summary + 승인 큐 후보.

**부서 채팅 컨텍스트**(`departmentChatFacts.ts`): 팀별 facts를 텍스트로 포맷 + answerGuidance. **채팅 기록**(`departmentChatMemory.ts`): `godo_department_chat_messages_v0`, 팀별 분리 최근 50건.

**상품팀 채팅 facts**(`productTeamChatFacts.ts`): 9개 의도(data_limit/current_screen/monthly_revenue/monthly_trend/category_share/top_products/stock_risk/total_revenue/general). **추세 버킷**(`productDashboardTrendBuckets.ts`): 연속 시간축(월/주/일) skeleton으로 빈 구간도 0 채움(날짜 creep 방지).

---

## 9. AI 엔진 / 에이전트 런타임 / Agent Studio

### 9-1. Native Agent Runtime (START OPERATION)

`runNativeAgentOperation`(engine/nativeAgentRuntime) 6단계:
1. `planJobs` — 6 AgentJob 생성(product_analyst, inventory_monitor, inquiry_analyst, review_detector, trend_researcher, campaign_planner).
2. `executeAgentJob` — **병렬 실행**(Promise.all), AgentResult(findings/recommendations/artifacts/riskFlags/approvalRequired).
3. `teamLeadAggregator` — product_lead/cs_lead/marketing_lead 부서별 브리핑 집계.
4. `handoffEngine` — 6개 핸드오프 체인(상품→마케팅, CS→마케팅, 마케팅 보정, →매니저).
5. `managerOrchestrator` — proposedTasks + proposedApprovalItems + briefingText(markdown) 생성.
6. App.tsx가 UI 반영(픽셀 오피스 상태·Tasks·Approval Queue·ReportModal·운영일지 축적).

검증 시나리오(`validationScenarios`): normal / low_stock / cs_negative / disabled_marketing.

### 9-2. 에이전트 이중 시스템 (★구조적 갭)

| | 레거시 Studio (`agents.ts`) | Native Runtime (`defaultNativeAgentRuntime.ts`) | 채팅 (`departmentChatService.ts`) |
|---|---|---|---|
| 규모 | 9명(manager/cs/order/delivery/review/marketing/product/stock/**finance**) | 10명/4부서(manager_agent, *_lead, *_analyst 등) | 4팀(hq/product/cs/marketing) |
| systemPrompt/skills/tools/knowledge | ✅ 정의됨 | modelPreference만 | 하드코딩 `TEAM_PERSONA` |
| brain 연결 | ✗ | modelPreference enum | ✅ `resolveAgentBrain` |

**핵심 단절**:
- 채팅 runtime이 agent에서 가져오는 건 `resolveAgentBrain`의 **provider/model(어떤 LLM)뿐**. Studio의 systemPrompt/skills/tools/knowledge는 채팅에 전혀 주입 안 됨.
- 실제 답변 = 하드코딩 `TEAM_PERSONA` + deterministic 엔진(scope/compiler) + 계산 facts.
- **FIN-09(finance)는 완전 고아** — agents.ts에만 정의, Native Runtime·TEAM_AGENT 모두에 없음 → 어떤 채팅에도 라우팅 안 됨.
- 구조적 진입점: `MainLayout.tsx`가 `DepartmentWorkspacePanel`을 **prop 없이 렌더**(line 380) → 패널이 agents 설정 접근 불가.

### 9-3. AI 두뇌 배선

- `aiKeyVault.ts` — 키/모델/verified 단일 저장소. localStorage `godo_ai_provider_keys_v0`/`_models_v0`/`_verified_v0`, 마스킹(앞3+뒤4).
- `aiBrainSettings.ts` — `DEFAULT_GLOBAL_BRAIN = {claude_api, claude-sonnet-4-6}`. `resolveAgentBrain(agentId)` = agent 지정 or 전역.
- `aiProviderAdapter.chatWithProvider` — local_lmstudio(Vite proxy) / cloud(`/api/ai/chat`, 키 서버 요청 body로만). company_local_llm·gpt_subscription_experimental은 미구성/비활성.

### 9-4. 라우팅/안전/권한

- **엔진 모드**: demo/local_first/cloud_first/hybrid_auto(기본)/manual_control.
- **라우팅 규칙 12개**: 고객데이터→local+승인, 주문확인→auto, 캠페인전략→cloud+승인, **쿠폰생성→human+승인, 가격변경→human+manual_only**.
- **안전 규칙 6개**(전부 활성): 고객데이터 클라우드 차단, 환불 manual_only, 쿠폰 승인필요, 가격 manual_only, 대량SMS manual_only, API키 localStorage 금지.
- **권한 매트릭스**: AUTO(조회/분류) / DRAFT_ONLY(초안) / APPROVAL_REQUIRED(게시/쿠폰/상품수정/캠페인) / MANUAL_ONLY(환불/가격/대량SMS/고객삭제).

---

## 10. GodoMall API 연동 / 보안

### 10-1. OpenAPI 클라이언트 (`godomallOpenApiClient.ts`)

- 모드: `GODOMALL_API_MODE`(real/sandbox/mock, 기본 mock). `isLiveMode` = 모드≠mock ∧ partnerKey ∧ userKey ∧ baseUrl.
- POST `x-www-form-urlencoded` + XML 응답. `partner_key`/`key` 자동주입(로그 안 함). 타임아웃 30s.
- 엔드포인트: `Order_Search.php`(주문), `Goods_Search.php`(상품). **기본 30일 범위**(Order_Search 제약). Board_List.php(CS/리뷰)는 미구현→mock.
- XML 파싱(`godomallXmlParser.ts`): fast-xml-parser, 성공코드 집합, 헤더 depth6 탐색, 태그명 비의존 리스트 추출.
- 폴백: `resolveResource` = live 시도 → 실패 시 mock(`api_proxy_real`/`_sandbox`/`_mock_fallback` 표기).

### 10-2. 보안 계층

- **PII 마스킹**(`piiMaskGuard.ts`): 이름 홍*동, 전화 010-****-5678, 이메일 ch****@…, 주소 시/구까지. `maskRecordPii` 후 원본필드 삭제 + `maskedPiiCount` 카운트.
- **시크릿 가드**(`secretGuard.ts`): 키 존재 boolean만 반환(값 절대 미노출), `productionLocked`(mode=real), 메시지 "Write actions remain disabled".
- **AI 프록시**(`aiProviderServer.ts`): OpenAI/Gemini/Claude 서버 호출, 키 요청 1회만·미저장·로그 없음. 에러 분류(invalid_key/model_not_found/rate_limited/timeout/provider_error). 항상 200 반환(상태코드로 키 문제 누출 방지).
- **WRITE 불변식**: 전 라우트 GET only, registry 18개+ WRITE API `write_locked`+`requiresApproval`. behavior-events POST는 고도몰 write가 아니라 자체 이벤트 수집.

---

## 11. 고객 행동 추적 파이프라인 (Ready-to-Install)

**상태**: 배관 완성, 운영몰 미확정이라 아직 실데이터 없음(설치만 하면 연결).

```
브라우저 tracker → send adapter(검증) → POST /api/marketing/behavior-events
   → [action].ts(CORS origin allowlist) → collection validator → 저장소
   → GET /api/marketing/behavior-summary → summary service → insights만(raw 미노출)
```

- **이벤트 10종**(allowlist): visit/landing/banner_click/category_click/product_view/search/add_to_cart/checkout_start/purchase/exit.
- **저장소 3단계**(`marketingBehaviorPersistentStore.ts`): Postgres(env 설정 시) → pending(감지되나 미구현) → **dev_buffer(기본, 비영속, 1000건 FIFO)**.
- **Postgres 스키마**: shop_id/event_id/session_id_hash/event_name/source/occurred_at/page_*/campaign/medium/banner_*/category_*/product_*/order_id_hash/revenue. searchTerm/IP/UA/PII 제외.
- **프라이버시 모델**: `sessionIdHash`(raw 세션ID 절대 저장 안 함, 30분 idle→새 세션, sha256 후보), `orderIdHash`(raw orderNo 저장 안 함, hash/aggregate 조인). eventId만 식별자.
- **검증기**(`marketingBehaviorCollectionValidator.ts`): 금지키 재귀탐색(depth6, name/phone/email/address/memberKey/orderNo/rawSessionId 등) + 이메일/전화 패턴 값 검사 → **위반 시 reject(마스킹 아님)**. 필드 길이초과도 reject. 배치 최대 50건.
- **소스 분류**(allowlist): blog/search/ad/sns/direct/referral/unknown. 트래킹 속성: `data-godo-track`.
- env: `GODO_BEHAVIOR_STORAGE_BACKEND`, `DATABASE_URL`/`POSTGRES_URL`, `GODO_BEHAVIOR_POSTGRES_TABLE`, `GODO_BEHAVIOR_ALLOWED_ORIGINS`(와일드카드 금지).

---

## 12. 디자인 시스템 & UI/UX

### 12-1. 비주얼 언어

**"운영 관제센터(command center)" 미학** — 딥 네이비 배경 + 네온 시안/틸 강조 + 픽셀아트 캐릭터.

- **테마**(`useTheme.ts`, `godo.ui.theme`, 기본 dark): `document.documentElement.dataset.theme` 토글, `prefers-reduced-motion` 존중.
- **다크 토큰**: `--bg-app:#06090c`, `--bg-panel:rgba(12,19,25,.82)`, `--text-primary:#eaf2f5`, `--accent-primary:#31d6c4`(네온 틸), `--danger:#ff4d6d`, `--warning:#fbbf24`, `--info:#5ac8fa`.
- **라이트 토큰**: 그린 강조(#00a878) + 밝은 중립 배경.
- **타이포**: Inter(UI) + JetBrains Mono(코드/배지). 로고 800/1px letter-spacing. 숫자 `tabular-nums`(레이아웃 안정).
- **바디 그라디언트**: 상단 틸 radial glow → 하단 블랙. 스크롤바 6px 커스텀. 카드 hover lift + glow.
- **헤더**: 65px 고정, `LOCAL APP MODE` blink 배지.

### 12-2. 픽셀 오피스

`PixelOfficeView` + `PixelAgentSprite`: 2048×1012 오피스 맵 + 48×96 스프라이트시트(6프레임, 방향 4행). 상태별 애니메이션(idle/working=green halo/thinking=yellow halo), 말풍선, 9개 waypoint(ceo-room/cs-zone/marketing-zone…), cubic-bezier 이동. 경계 클램프(X 8~92, Y 32~85).

### 12-3. 차트 라이브러리 (SVG 직접, D3/Chart.js 없음)

`components/charts/`: `CommerceComboChart`(막대+Catmull-Rom 스무스 라인), `CommerceGroupedBarChart`(2~4 series 그룹막대), `CommerceChartTooltip`(pointer-events:none, 6~94% clamp). 유틸(`commerceChartUtils.ts`): `won`/`wonShort`(만/억)/`countFmt`/`niceCeil`/`labelStep`/`smoothPath`. `useChartWidth`(반응형 viewBox).

### 12-4. UX 패턴

- **애니메이션 숫자**(`useAnimatedNumber.ts`): 450ms ease-out cubic, reduced-motion 시 즉시.
- **모달 스택**(z-index 1000~2000): DepartmentCommandPanel/AgentDetail/TaskResult/ApprovalDetail → OperationBriefing → Task/ApprovalList → MetricDrilldown → HandoffDetail → ReportModal. 마케팅: MarketingDetail/MetricDrilldown/CustomerBehavior 체이닝.
- **기본상태 최적화**: 마케팅 대시보드 비교그래프·AI리포트는 요청 후 확장(hasRequestedComparison), 세부분석은 전체보기 모달.
- **드릴다운**: KPI 클릭 → 모달 → 승인/편집 → 닫기.

---

## 13. 현재 상태 요약 (2026-07-02)

### 완료
- 고도몰 Products/Orders REAL READ(real mode), RevenueOrder 스키마, 날짜필드 상태파생.
- 합성 커머스 유니버스 v1(2024 baseline + 2025 promotion, 결정적 PRNG, 쿠폰/세그먼트/리뷰/문의).
- 단일 진실 소스 KPI(전 부서 canonical net 유효주문 통일).
- 마케팅 채팅 분석(Query Compiler → Executor → Narrative → Chart Grammar) 완성.
- CS 파이프라인(grounding → composer → approval bridge → completion), 4-KPI 관리자 워크플로.
- 부서 3열 워크스페이스(대시보드 + 팀장 채팅 동일 데이터셋 공유).
- Native Agent Runtime(6단계 협업 시뮬레이션).
- AI 두뇌 연결(Claude 기본, 서버 프록시, 키 격리), 행동추적 Ready-to-Install.
- Vercel 배포 복구(route 9 ≤ 12), 데모 게이트웨이 어댑터.

### 미완 / 플레이스홀더
- **Agent Studio ↔ 채팅 runtime 단절**(systemPrompt/skills/tools/knowledge 미주입) — 다음 유력 작업.
- **FIN-09 고아**(어떤 채팅에도 라우팅 안 됨).
- Orders/Inquiries/Reviews 라이브(Board_List.php) 미구현 → mock.
- RAG 실주입 없음(usageCount+1 로그만), ActivityLog 비영속, 자율 트리거(cron) 없음, 고도몰 WRITE(Approval→실행) 미연동.
- HQ(총괄) 대시보드 placeholder(snapshot 재사용 여지).
- 행동추적 실데이터 0(운영몰 미확정).

### 실데이터 vs 합성
- 실: 고도몰 상품 13개(Products READ). 나머지 지표는 **synthetic commerce universe**(테스트몰). 광고/방문자/외부유입 없음.

---

## 14. 알려진 구조적 갭 & 로드맵

**구조적 갭**: ①정책데이터(Studio/Engine/Brain 편집값)→런타임 단절 ②에이전트 이중화(9 vs 10 vs 4팀, finance 고아) ③RAG는 시뮬레이션 ④로그 휘발성 ⑤자율 트리거 없음 ⑥핸드오프 1사이클(Inbox 큐 없음).

**다음 작업(우선순위)**:
1. ★ **Marketing Agent Runtime Wiring v0** — `DepartmentWorkspacePanel`에 agents 배선 / MKT-06 systemPrompt를 TEAM_PERSONA에 병합 / FIN-09를 매출·정산 질문에 라우팅 / AnalysisResult를 LLM context로 (Tool 실행·RAG는 보류). 전제: 숫자는 계속 코드 계산.
2. 마케팅 질문 유형 확장(주차/일별 추세, 상대월 비교).
3. CS/총괄 대시보드 고도화(snapshot 재사용).
4. 12월 오픈 로드맵: 7월 구조/문서/UX → 8~9월 팀 화면 → 10월 운영몰 확정 → 11월 리허설 → 12월 final.

**장기 분석 구조 목표**: 질문 → Query Compiler → AnalysisPlan → Data Availability Check → Executor → Chart Grammar → **Factor Explorer**(요인 교차검토) → **Evidence Pack**(사실/원인후보/반박/추가필요/추정불가) → LLM Narrative → **Strategy Proposal**(강점/약점/캠페인/쿠폰조건/타겟) → Approval.

---

## 15. 반드시 지킬 불변식 (개발 규칙)

- synthetic 생성 / `departmentDataSourceOfTruth` / `departmentMetricContract` / `marketingAnalysisFacts` **계산 변경 금지**.
- canonical 운영 KPI = net 유효주문 유지. gross 라인매출을 대표값으로 쓰지 않기.
- Vercel route entry **≤12**(새 기능은 service layer + gateway adapter). 고객흐름 tracking pipeline 불변.
- 고도몰 WRITE 금지, raw event(sessionIdHash/orderIdHash/eventId) 노출 금지, PII 금지.
- 차트: 도넛/파이는 share 전용, 독립 값 비교는 막대. 숫자는 코드 계산, LLM은 해석만.
- 없는 데이터(ROAS/방문자/전환/장바구니)는 fake 금지 → "지원 범위 밖" 안내.
- 키 격리: 고도몰/AI 키 Vercel 환경변수 + 서버만. 프론트/localStorage/로그/응답 금지.
- api/** 상대 import는 `.js` 확장자 포함(Vercel ESM). `_` prefix 파일은 라우트 미배포.
- 작업 흐름: 구현 → lint/tsc/build/smoke → 커밋 → main merge(--no-ff) → 재검증 → push → 보고.
- 커밋 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## 16. 핵심 파일 지도

**데이터/KPI**: `api/_shared/syntheticCommerceUniverse.ts`(생성) · `syntheticCommerceFacts.ts` · `commerceUniverseAux.ts` · `src/services/revenueMetricContract.ts`(수식) · `departmentDataSourceOfTruth.ts`(단일소스) · `departmentMetricContract.ts`(라벨) · `marketingAnalysisFacts.ts`(차원/한계공지).

**마케팅 분석**: `marketingAnalysisQueryCompiler.ts` → `marketingAnalysisExecutor.ts` → `marketingAnalysisNarrative.ts` → `marketingChartGrammar.ts` · `marketingScopeInsightEngine.ts`(0순위) · `marketingLlmPlannerAdapter.ts`(LLM 계획 전용) · `marketingChatQueryRouting.ts`(이전 단계, 보존).

**CS**: `csInquiryOrderGrounding.ts` → `csDraftComposer.ts` → `csDraftRuntime.ts` → `csApprovalQueueBridge.ts` · `csTeamDashboardFacts.ts` · `csWorkCompletionState.ts` · `csLocalStatePersistence.ts`.

**부서 공통**: `departmentFactsRouting.ts` · `departmentChatFacts.ts` · `departmentChatService.ts`(TEAM_PERSONA) · `departmentChatMemory.ts` · `departmentDataService.ts`(fetchRevenue) · `productTeamChatFacts.ts`.

**AI 엔진**: `engine/nativeAgentRuntime/*`(planJobs→executeAgentJob→teamLeadAggregator→handoffEngine→managerOrchestrator) · `aiKeyVault.ts` · `aiProviderAdapter.ts` · `aiBrainSettings.ts` · `data/agents.ts`(레거시 9) · `data/defaultNativeAgentRuntime.ts`(10) · `data/defaultEngineData.ts`(규칙12/안전6) · `data/permissionMatrix.ts`.

**API/보안**: `api/godomall/[resource].ts` · `api/marketing/[action].ts` · `api/ai/chat.ts` · `api/_shared/godomallOpenApiClient.ts` · `godomallResource.ts` · `godomallXmlParser.ts` · `piiMaskGuard.ts` · `secretGuard.ts` · `aiProviderServer.ts`.

**행동추적**: `api/_shared/marketingBehaviorPersistentStore.ts` · `marketingBehaviorPostgresStore.ts` · `marketingBehaviorCollectionValidator.ts` · `marketingBehaviorSummaryService.ts` · `src/services/marketingBehaviorTrackerPrototype.ts` · `marketingBehaviorCollectionPlan.ts`.

**UI 백본**: `App.tsx`(상태 오케스트레이터) · `MainLayout.tsx`(10탭 라우팅) · `OfficeView.tsx`+`PixelOfficeView.tsx` · `DepartmentWorkspacePanel.tsx`(3열) · `ProductTeamDashboard.tsx` / `CsTeamDashboard.tsx` / `MarketingAnalysisDashboard.tsx` · `components/charts/*` · `index.css`(디자인 토큰).

---

*문서 끝. 작성 2026-07-02 · 코드베이스 6영역 병렬 정밀 분석 + 백본 직접 판독 종합.*
