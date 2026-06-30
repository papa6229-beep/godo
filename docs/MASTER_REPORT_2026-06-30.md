# GODO AI OS — 마스터 보고서 (2026-06-30)

> 내일(2026-07-01) 이 문서만 읽고 바로 다음 작업을 이어갈 수 있도록 작성. 직전 마스터 보고서: 2026-06-29.

- **현재 main HEAD: `7917616`** (모든 작업 머지·푸시 완료)
- 브랜치: `main` / origin/main 동기화됨
- Vercel: 데모 배포 환경. **배포 실패(12함수 제한) 해결됨 → Ready 복구.** 단 실데이터 아님(테스트몰, 실오픈 2026년 12월 목표).
- 검증 상태: lint clean · `tsc -b` 0 · build 0 · route entry **9개(≤12)** · 전 마케팅 smoke green.

---

## 0. 오늘의 큰 그림

오늘은 두 갈래를 진행했다.
1. **데이터 신뢰성 P0**: Vercel 배포 복구 → 부서 간 대표 KPI 불일치 해결(단일 source of truth).
2. **마케팅 채팅 분석 능력**: 질문이 엉뚱한 기본 분석으로 떨어지던 문제 → 질문 해석/계산/차트를 근본 구조(Query Compiler)로 재정비.

오늘 머지된 작업 9건 + 진단 전용 2건. 모든 코드 작업은 "데이터 계산 로직/synthetic/gateway/고객흐름/고도몰 WRITE 불변" 원칙을 지켰다.

---

## 1. 완료 작업 (시간순, 커밋/머지 HEAD 포함)

### 1) Marketing Behavior Godo Integration Readiness v0 (docs)
- 커밋 `aaa358f` → merge **`a68a60c`**
- 내용: 고객흐름 배관을 **"Ready-to-Install"** 상태로 봉인. 운영몰 확정 시 env/origin/tracker 삽입/test event만으로 연결되도록 설치/전환/검수 매뉴얼 작성.
- 파일: `docs/MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md`, `..._INSTALLATION_CHECKLIST_V0.md`, `..._SHOP_SWITCH_RUNBOOK_V0.md` + 기존 docs 5종 링크 보강 + `scripts/smoke-marketing-behavior-godo-integration-readiness-v0.mjs`(48/0).

### 2) Vercel Demo Gateway Adapter v0 ★ 배포 복구
- 커밋 `91e512e` → merge **`6ccbaa2`**
- **원인(진단 후 확정)**: Vercel Hobby "배포당 Serverless Function 12개 제한" 초과(마케팅 함수 2개 추가로 **12→14**). 프론트는 빌드돼도 함수 배포에서 전체 실패 → 사이트 접속 불가.
- 해결: 기능 삭제 없이 **동적 라우트로 entry만 통합(14→9)**, URL 전부 유지.
  - `api/marketing/[action].ts` ← behavior-events(POST)+behavior-summary(GET) 통합
  - `api/godomall/[resource].ts` ← orders/inquiries/reviews/inventory/sales 통합(`resolveResource`)
  - 정적 유지: health/products/orders-admin/orders-revenue/sync/read
- 파일: 위 2개 신규, 7개 route 삭제, `scripts/report-vercel-api-function-count.mjs`, `scripts/smoke-vercel-demo-gateway-adapter-v0.mjs`(24/0), `docs/VERCEL_DEMO_GATEWAY_ADAPTER_V0.md`.
- **핵심 사실: Vercel은 "데모 배포 제약"일 뿐 — 장기 아키텍처를 종속시키지 않음. 새 기능은 service layer에 만들고 gateway adapter로 붙인다.**

### 3) Cross-Team Revenue Metric Parity Audit & Fix v0
- 커밋 `d3db89b` → merge **`0fed67a`**
- 원인: 상품팀(상품매출=gross 라인합/전체주문 99.7M/1315) vs 마케팅팀(총매출=net 유효주문 88.1M/1182)이 **다른 축**(주문 포함범위 + 매출 기준)으로 집계.
- 해결: `src/services/revenueMetricContract.ts`(gross/net/valid 정의 + `isValidOrder`) + 두 대시보드 기준 보조문구. **이때는 "라벨 분리"까지만** (다음 작업에서 부족 판명).
- smoke: `smoke-cross-team-revenue-metric-parity-v0.mjs`(19/0, 런타임 parity).

### 4) Department Data Source of Truth Audit & Fix v0 ★ 대표 KPI 통일
- 커밋 `e721dbe` → merge **`892de20`**
- 원인: 라벨 분리만으론 "같은 급 대표 KPI가 부서마다 다른 숫자"라 신뢰 회복 불가.
- 해결(2층 구조):
  - `src/services/departmentDataSourceOfTruth.ts` — `buildDepartmentSourceOfTruthSnapshot(revenue)`: 모든 부서가 같은 universe로 호출하는 순수 함수. **operationalRevenue/OrderCount/AOV = net 유효 주문 기준(canonical)**.
  - `src/services/departmentMetricContract.ts` — Operational* 공통 KPI + productLineRevenue(부서전용) 라벨.
  - **ProductTeamDashboard 상단을 운영매출/운영 주문수(canonical)로 교체** → 마케팅과 **같은 값**. 상품 라인 매출(gross)은 "상품관리 전용 분석" 행으로 분리.
  - MarketingAnalysisDashboard 총매출/주문수 → 운영매출/운영 주문수(값 동일). CsTeamDashboard 기준 보조문구.
- smoke: `smoke-department-data-source-of-truth-v0.mjs`(23/0, 런타임 single-source).
- **핵심 원칙: "부서별 분석 관점은 다를 수 있지만, 같은 급 대표 KPI는 하나의 source of truth에서 나와야 한다."**

### 5) Marketing Dashboard Default State UX Optimization v0
- 커밋 `07f723e` → merge **`1a00471`**
- 내용: 마케팅 기본 화면을 짧게. KPI 카드 보강(아이콘/보조문구/포인트라인), 비교 그래프·AI 리포트를 **요청 후 확장**(hasRequestedComparison), 세부 분석 카드 기본 노출 제한 + **전체보기 모달**(`MarketingDetailModal`).
- smoke: `smoke-marketing-dashboard-default-state-ux-v0.mjs`(25/0).

### 6) (소) 행동 KPI 포인트컬러 + 세부 분석 정리
- 커밋 `5bcd198` → merge **`48d120f`**
- 4번째 KPI(고객 행동 분석) 포인트컬러 추가 + 세부분석 브랜드 TOP 제거·상품 TOP 위로(2행3열 정렬).

### 7) Marketing Chat Analysis Routing & Intent Patch v0
- 커밋 `30b1ce1` → merge **`e23d8a4`**
- 원인: 0순위 Scope Insight Engine이 "2024+2025"만 보면 metric/month 무시하고 전체 월별 매출로 고정 → 세 질문(객단가/매출/주문수)이 같은 답.
- 해결: `src/services/marketingChatQueryRouting.ts`(parse + 특정월 canonical 계산) + scope 엔진 앞단 연결 + suppressChart(그래프 억제) + `dept-chat-log` auto-scroll.
- smoke: `smoke-marketing-chat-analysis-routing-intent-v0.mjs`(26/0).

### 8) Marketing Analysis Query Compiler v0 ★ 분석 구조 일반화
- 커밋 `c6d6a00` → merge **`9d739ae`**
- 원인: 단건 regex 땜질이라 "3~5월"이 **5월 단일로 오인**, 분기/반기/상대기간 미처리.
- 해결: **질문 → AnalysisPlan → Executor → Narrative** 컴파일 구조.
  - `src/services/marketingAnalysisQueryCompiler.ts` — `compileMarketingAnalysisQuery`: metric/기간(단일월·월범위·분기·반기·연도·상대)/comparison(yearOverYear·monthlyTrend·segmentCompare)/chart/unsupported 파싱. **월범위 합산, "월별"은 구간합보다 우선.**
  - `src/services/marketingAnalysisExecutor.ts` — `executeMarketingAnalysisPlan`: canonical net(`isValidOrder`)로 계산(**객단가 weighted = 기간합 매출÷주문수**) + chartSpec + `buildMarketingAnalysisResponse` 오케스트레이터.
  - `src/services/marketingAnalysisNarrative.ts` — deterministic 답변(LLM 미연결에도 동작).
- **위임 규칙(중요)**: 컴파일러는 broad가 못 하는 것만 처리. **revenue 월별/연도 비교 + 저신뢰 broad는 기존 broad scope에 위임**(기존 smoke 전부 보존). 주문수/객단가 월별, 월범위/분기/반기, 세그먼트, 단일기간, unsupported만 컴파일러가 처리.
- smoke: `smoke-marketing-analysis-query-compiler-v0.mjs`(30/0, corpus 15문항).

### 9) Marketing Chart Grammar & Compact Renderer Fix v0
- 커밋 `0ccfb7f` → merge **`7917616`** (현재 HEAD)
- 원인: compact 차트 hover 카드 깜빡임 / 쿠폰 객단가가 부적절 차트(세그먼트를 rankedBar로 둬 **1막대 오인**, 도넛 우려).
- 해결: `src/services/marketingChartGrammar.ts` — `selectMarketingChartType`: **도넛/파이는 구성비(share)만, AOV/주문수/매출 비교는 절대 donut 아님**. 2~4개=compact groupedBar, 5+=rankedBar. **세그먼트 rankedBar→groupedBar 교정**(N buckets=N bars → 쿠폰 미사용/사용 2막대). compact(막대≤4)에서 **hover tooltip 카드 미렌더**(깜빡임 방지) + 여백 축소.
- smoke: `smoke-marketing-chart-grammar-compact-renderer-v0.mjs`(23/0).

---

## 2. 진단 전용(코드 변경 없음)

### A) Vercel 배포 실패 진단
- 결론: 컴파일 에러가 아니라 **함수 개수 12개 제한**. (작업 2에서 해결)

### B) Agent Studio ↔ 마케팅 채팅 runtime 연결 진단 — **중요 구조 사실**
- **Agent Studio(MKT-06 마케팅기획 / FIN-09 매출분석)의 systemPrompt/skills/tools/knowledge는 현재 채팅 runtime에 연결되지 않음.**
- agent 정의는 `src/data/agents.ts` 정적 seed(+localStorage). 채팅이 agent에서 가져오는 건 **`resolveAgentBrain`의 provider/model(어떤 LLM)뿐.**
- 실제 답변은 하드코딩 `TEAM_PERSONA`(`departmentChatService.ts`) + deterministic 엔진(scope/compiler) + 계산 facts.
- **FIN-09는 어떤 팀 채팅에도 라우팅 안 됨**(TEAM_AGENT: hq→manager, product, cs, marketing만). Tool 실행·Knowledge RAG 모두 미구현(표시/설정 레이어).
- 구조적 단절 지점: `MainLayout.tsx`가 `DepartmentWorkspacePanel`을 **prop 없이 렌더** → 패널이 agents 설정에 접근 불가.

---

## 3. 현재 시스템 상태 (내일 기준점)

### 데이터/KPI
- **canonical 운영 KPI = net 유효 주문(결제완료·미취소)**. 상품/마케팅/CS 모두 `buildDepartmentSourceOfTruthSnapshot` 기준. 상품 gross 라인매출은 "전용 분석"으로 분리.
- 데이터는 **synthetic commerce universe**(테스트몰). 실데이터/광고/외부유입 없음.

### 마케팅 채팅 파이프라인 (handleSend, `DepartmentWorkspacePanel.tsx` ~246–308)
```
0순위 buildMarketingScopeInsightResponse(scope 엔진)
        └─ 앞단: buildMarketingAnalysisResponse(Query Compiler→Executor→Narrative→Chart Grammar)
              · 특정월/월범위/분기/반기/세그먼트/주문수·객단가 월별/단일기간/unsupported → 컴파일러 처리(handled)
              · revenue 월별·연도 비교 + 저신뢰 broad → null 반환 → 기존 broad scope 분석
1순위 buildMarketingIntelligenceResponseWithLlm (planner, brain 연결 시 Claude 호출)
1b    runMarketingChartRequest (고정 intent chartSpec bridge)
2순위 buildMarketingChatContext + chatWithTeam (TEAM_PERSONA + facts, Claude)
```
- 차트: `selectMarketingChartType`(grammar)로 결정. compact(≤4)는 tooltip 카드 없음.
- 숫자는 전부 코드 계산. Claude는 (연결 시) 해석/요약만.

### 핵심 서비스 파일 지도(마케팅 분석)
- `marketingAnalysisQueryCompiler.ts` — 질문→AnalysisPlan
- `marketingAnalysisExecutor.ts` — Plan→계산(net)+chartSpec+오케스트레이터
- `marketingAnalysisNarrative.ts` — 결과→답변
- `marketingChartGrammar.ts` — chart type 선택 + metric label/unit
- `marketingScopeInsightEngine.ts` — 0순위 진입(컴파일러 호출 + broad fallback)
- `marketingChatQueryRouting.ts` — (이전 단계, 독립 보존)
- `revenueMetricContract.ts` / `departmentDataSourceOfTruth.ts` / `departmentMetricContract.ts` — canonical 기준

---

## 4. 사장님 수동 검수 체크리스트 (Claude 키 연결 + 실화면)

데이터 신뢰성:
- [ ] 상품관리팀 상단이 운영매출/운영 주문수(마케팅과 동일 값), 상품 라인 매출은 아래 전용 행에 분리됐는지
- [ ] 마케팅 상단 운영매출/운영 주문수/운영 객단가 표기

마케팅 채팅(질문→그래프):
- [ ] 2024년 3~5월 주문수 vs 2025년 3~5월 → **합산 비교(5월 단일 아님)**, compact 막대
- [ ] 2024년 3~5월 객단가 vs 2025년 → **weighted(기간합 매출÷주문수)**
- [ ] 2024·2025 월별 객단가 → 12개월 비교(매출 그래프 아님)
- [ ] 쿠폰 사용/미사용 객단가 → **2막대(도넛 아님)**, hover 깜빡임 없음
- [ ] 그래프 없이 ... → 텍스트만 / ROAS → unsupported 안내(fake 없음)
- [ ] 답변 완료 후 채팅창 자동 최하단 스크롤

배포:
- [ ] Vercel 최신 배포 Ready / 사이트 접속

---

## 5. 다음 작업 후보 (우선순위)

### ★ Marketing Agent Runtime Wiring v0 (가장 유력)
진단 B에서 확인된 **Agent Studio ↔ 채팅 단절** 해소:
1. `DepartmentWorkspacePanel`이 agents 설정에 접근(현재 prop 없이 렌더 → 배선 필요).
2. 마케팅 채팅 LLM에 **MKT-06 systemPrompt(+knowledge 요약)** 를 `TEAM_PERSONA` 대신/병합 전달.
3. 매출·정산 분석 질문을 **FIN-09**로 라우팅(metric/주제 기반 agent 선택).
4. (큰 작업, 분리) Tool Registry 실제 실행, Knowledge RAG.
- 전제: 숫자는 계속 코드(Executor)가 계산, Claude는 해석/제안만. AnalysisPlan/Result는 LLM 해석 레이어가 붙는 구조로 이미 설계됨.

### 기타 후보
- 마케팅 채팅 추가 질문 유형(주차/일별 추세, periodToPeriod 상대월 비교) 확장.
- CS팀/총괄팀(hq) 대시보드 고도화(snapshot 재사용, 현재 hq는 placeholder).
- 12월 오픈 전 흐름: 7월 구조/문서/UX → 8~9월 팀 화면 고도화 → 10월 운영몰 확정 → 11월 리허설 → 12월 final.

---

## 6. 반드시 지킬 불변식 (모든 작업 공통)

- synthetic 생성 로직 / `departmentDataSourceOfTruth` / `departmentMetricContract` / `marketingAnalysisFacts` **계산 변경 금지**.
- canonical 운영 KPI = net 유효 주문 기준 유지. gross 라인매출을 대표값으로 쓰지 않기.
- Vercel route entry **≤12** 유지(새 기능은 service layer + gateway adapter). 고객흐름 tracking pipeline 불변.
- 고도몰 WRITE 추가 금지, raw event(sessionIdHash/orderIdHash/eventId) 노출 금지, PII 금지.
- 차트: 도넛/파이는 share 전용. 독립 값 비교는 막대. 숫자는 코드 계산, LLM은 해석만.
- 작업 흐름: 구현 → lint/tsc/build/smoke → 커밋 → main merge(--no-ff) → 재검증 → push → 완료보고.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Vercel Ready·웹 시각검수는 사장님이 직접.
