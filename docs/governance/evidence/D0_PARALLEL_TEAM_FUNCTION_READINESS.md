# D-0 · 팀 기능 준비도 조사와 첫 대표 업무 선정

작성일: 2026-07-30 · 브랜치: `codex/d0-parallel-team-readiness-plan` · **문서 전용(제품 코드·검사·manifest 0변경)**
근거 결정: `DECISIONS.md` **D-009**(새 고도몰 연결·상품 준비·팀 기능 개발의 병행 원칙)

---

## 0. 이 문서가 답하는 것 / 답하지 않는 것

**답한다**: 새 고도몰 키와 실제 판매상품이 아직 없어도 **지금 만들고 시험할 수 있는 팀 기능이 무엇인지**, 그리고 무엇이 키·상품·개인정보·외부 WRITE·사용자 결정에 막혀 있는지를 **현재 코드와 마운트 경로 기준으로** 구분한다.

**답하지 않는다**: 실제 상품 수량·선별 일정·상세페이지 변경 소요(사용자·상품팀 업무이며 추측하지 않는다) · 외부 서비스 재조사·새 기술 채택(이번 범위 밖) · 구현 착수(이 문서는 **다음 작업 입력**일 뿐이다).

**확인 범위**: `src/components`·`src/services`·`api/_shared` 의 마운트 경로와 생산자→소비자 연결을 직접 열어 확인했다. **완료보고·오래된 문서를 근거로 쓰지 않았다.** 저장소 전수 재감사는 아니다.

### 사용한 조사 명령(재현용)

```
grep -n "effectiveActiveTab === '" src/components/MainLayout.tsx
grep -n "ProductTeamDashboard\|CsTeamDashboard\|DesignTeamDashboard\|MarketingAnalysisDashboard" src/components/DepartmentWorkspacePanel.tsx
grep -n "^import" src/components/{ProductTeamDashboard,CsTeamDashboard,DesignTeamDashboard,MarketingAnalysisDashboard}.tsx
grep -rn "runScheduledAgentTask\|runManualAgentTask" --include=*.ts --include=*.tsx src api
grep -rn "AgentTaskPanel" --include=*.tsx src
grep -rn "writeStatus" src/services/csWorkCompletionState.ts
grep -n "connected:" src/services/marketingCustomerBehaviorEvents.ts
grep -n "case 'inquiries'\|case 'reviews'\|unavailable" api/_shared/godomallResource.ts
cat src/data/defaultAgentTasks.ts
```

---

## 1. 화면 진입 지도 (직접 확인한 마운트 경로)

| 진입 | 경로 |
|---|---|
| 총괄 오늘의 운영 | `MainLayout.tsx:431` `activeTab==='office'` → `OfficeView` (총괄 전용 탭, `MainLayout.tsx:276`) |
| 팀 화면 | `MainLayout.tsx:459` `activeTab==='department'` → `DepartmentWorkspacePanel` → 팀별 대시보드 |
| 상품팀 | `DepartmentWorkspacePanel.tsx:568` `<ProductTeamDashboard>` |
| CS팀 | `:593` `<CsTeamDashboard>` |
| 마케팅팀 | `:618` `<MarketingAnalysisDashboard>` |
| 디자인팀 | `:631` `<DesignTeamDashboard>` |
| 팀 AI 자동업무 | `:787` `<AgentTaskPanel>` (팀 화면 안) |
| 달력 | `MainLayout.tsx:565` `activeTab==='calendar'` → `CalendarPanel`(자체 `fetchRevenue`) |

**비HQ 사용자는 `department` 탭으로 강제 이동**한다(`MainLayout.tsx:209` 계열). 팀 id 정본은 `teamIdContract.ts:19` `'hq' | 'product' | 'cs' | 'marketing' | 'design'`.

---

## 2. 팀별 준비도 표

범례 — **A** 지금 실제 진입 가능 · **B** 시험 데이터로 개발·자동검사 가능 · **C** 새 키만 있으면 확인 가능 · **P** 실제 상품 등록 필요 · **I** 실제 고객정보 필요 · **W** 외부 WRITE·사용자 결정 필요

### 2-1. 상품팀 (`ProductTeamDashboard`)

| 기능 | 상태 | 생산자 → 소비자 → 화면 | 근거 |
|---|---|---|---|
| 매출·주문 통계 | **A / B** | `fetchRevenue` → `buildDepartmentSourceOfTruthSnapshot` → `ProductTeamDashboard` | `ProductTeamDashboard.tsx:22`·`:679` |
| 출처 구분(실제/시험/실제 0건/연결 안 됨) | **A** | `screenStateFromRevenue`·`resolveRealOrdersDisplay`·`realOrdersPhrase` | `:9`·`:679`·`:698` |
| 재고위험 판정 | **A / B** | `inventoryRiskContract.classifyStockRisk`·`summarizeStockRisk` | `:21` |
| 매출 metric 라벨 정본 | **A** | `revenueMetricContract`·`departmentMetricContract` | `:19`·`:20` |
| 상품 카탈로그(카테고리·브랜드 라벨) | **C** | `godomallResource` → `mapGoodsToProducts` → 카탈로그 바인딩 | `godomallMapper.ts:81` · `godomallResource.ts:100,377` |
| **실제 판매상품 기준 재고·매출** | **P** | 위 경로 그대로, 입력만 실제 상품 | 새 몰 등록 전에는 대조 대상 없음 |
| 상품등록 자동화(WRITE) | **W** | — | 오픈 이후 순차 적용 8항목 중 ②(`MASTER_PLAN §1`) |

**핵심**: 상품팀은 **계산·판정·출처 구분이 이미 계약으로 서 있고**, 입력만 시험 데이터에서 실제 데이터로 바뀌면 되는 구조다.

### 2-2. CS팀 (`CsTeamDashboard`)

| 기능 | 상태 | 생산자 → 소비자 → 화면 | 근거 |
|---|---|---|---|
| 문의 상태 분류 | **A / B** | `inquiryStatusContract` | `CsTeamDashboard.tsx:3` |
| AI 답변 초안 | **A / B** | `composeCsDraftFromOrders` | `:7` |
| 검수 대기실·완료 기록 | **A / B** | `csWorkCompletionState` → `csWorkflowRepository` | `:39` |
| 고객 프로필 허브·통계 | **A / B** | `buildCsCustomerProfileHub`·`buildCsDashboardStatistics` | `:20`·`:21` |
| 출처 구분 | **A** | `dataSourceProvenanceContract`·`screenStateFromRevenue` | `:5`·`:6` |
| **문의·리뷰 실제 데이터** | **C / P** | `godomallResource` 의 `inquiries`·`reviews` 는 **현재 mock 분기만**(`:132`·`:134`), real 경로는 `unavailable` | `godomallResource.ts:128-141` |
| **고객 답글 실제 발송** | **W** | `writeStatus` 는 **항상 `'not_connected'`** | `csWorkCompletionState.ts:4,85` · 화면 `CsTeamDashboard.tsx:603` "WRITE 미연결" |
| 실제 고객 개인정보 | **I** | CS 완료 기록에 이름·전화·이메일 그릇이 있고 현재 값은 합성 | `CURRENT_STATE §4` |

### 2-3. 디자인팀 (`DesignTeamDashboard`, 139줄 + `detailBuilder`)

| 기능 | 상태 | 생산자 → 소비자 → 화면 | 근거 |
|---|---|---|---|
| 제작 요청 큐(팀 메시지) | **A / B** | `teamMessageRepository.inboxFor` → 큐 | `DesignTeamDashboard.tsx:3` |
| 고도몰 상세페이지 생성기 | **A** | `DetailPageBuilder` 모달 | `:5`·`:67-74` |
| 단순형 변환기 | **A** | 같은 빌더의 다른 진입 | `:77-82` |
| AI 두뇌 선택 | **A** | `aiBrainSettings` | `:6` |
| **실제 상품 상세페이지 변환** | **P** | 생성기는 준비됐고 **입력이 실제 상품**이어야 한다 | 상품팀 선별 업무 — **시스템이 대신 완료하지 않는다** |
| 최종 저장·고도몰 등록 | **W** | — | `MASTER_PLAN §11` H단계 연기 영역 |

### 2-4. 마케팅팀 (`MarketingAnalysisDashboard`)

| 기능 | 상태 | 생산자 → 소비자 → 화면 | 근거 |
|---|---|---|---|
| 분석 대시보드·차트 | **A / B** | `buildDepartmentSourceOfTruthSnapshot` → 차트 컴포넌트 | `MarketingAnalysisDashboard.tsx:10`·`:4-6` |
| 질문형 분석(Query Plan) | **A / B** | `analyticsQueryEngine`·`marketingChatChartSpec` | `:26` |
| 출처 라벨 | **A** | `dataSourceProvenanceContract` | `:11` |
| **고객 행동수집** | **P / W** | `CUSTOMER_BEHAVIOR_EVENTS` **8종 전부 `connected: false`** | `marketingCustomerBehaviorEvents.ts:20-27` |
| 외부 광고 통합 | **W** | — | 오픈 이후 순차 적용 8항목 중 ⑥ |

### 2-5. HQ / 공통

| 기능 | 상태 | 근거 |
|---|---|---|
| 오늘의 운영·관제 채팅 | **A / B** | B-use 종료 판정(`MASTER_PLAN §2`) |
| 지시→수행→결과→승인→기록 | **A** | B-use-5 Preview 인수검사 실제 브라우저 통과 |
| 인증·권한·계정 전환 | **A** | 실제 Clerk 로그인 흐름 확인 |
| 활동 원장·팀 메시지 | **A / B** | localStorage 중심 |
| 팀 AI 자동업무(수동 실행) | **A / B** | `AgentTaskPanel`(`DepartmentWorkspacePanel.tsx:787`) → `runManualAgentTask`(`agentTaskRunner.ts:145`) |
| **예약 실행** | **미연결** | `runScheduledAgentTask`(`:169`) **제품 호출자 0건** → E단계 |
| 서버 공용 업무기록 | **W(사용자 결정)** | DB 미결정 · 어댑터 미구현 |

---

## 3. 의존성 요약 — 무엇이 무엇을 막는가

| 막는 것 | 막히는 것 | 막히지 **않는** 것 |
|---|---|---|
| **새 고도몰 키 없음** | 실제 연결 상태·인증·공식 응답 구조 실측 · 문의·리뷰 real 경로 | 계산 계약·출처 구분·화면·업무 흐름·AI 업무 실행 |
| **실제 판매상품 미등록** | 실제 상품 기준 재고·매출 대조 · 상세페이지 실변환 · 행동수집 실데이터 | 위 계약과 화면을 시험 데이터로 만들고 검사하는 일 |
| **실제 고객정보 없음** | CS 실제 PII 처리 | CS 분류·초안·검수 대기실 로직 |
| **DB 미결정** | 서버 공용 업무기록 | localStorage 기반 기록으로 흐름 완주·검증 |
| **외부 WRITE 미승인** | 답글 발송·상품등록·광고 집행 | 승인형 초안까지의 전 구간 |

**결론**: 키·상품이 막는 것은 **실증(실제 데이터 확인)** 이고, **구현과 시험자료 기반 검증은 지금 계속할 수 있다.**

---

## 4. 다음 대표 업무 후보 — **추천 1개**

> ### 상품팀 · **재고위험 일일 점검 → 팀장 승인 → HQ 보고** 1건 완주
>
> 대상 스펙은 이미 저장소에 있다: `src/data/defaultAgentTasks.ts` 의 **`task-product-daily`**
> (`teamId: 'product'` · `focus: 'inventory'` · `reportTo: 'hq'` · `approvalMode: 'approval'` · `schedule.daily 09:00`).

### 추천 조건 대조

| 조건 | 충족 근거(저장소) |
|---|---|
| 1. 시험 데이터로 개발·검증 가능 | 실행 경로가 이미 있다 — `AgentTaskPanel`(`DepartmentWorkspacePanel.tsx:787`) → `runManualAgentTask`(`agentTaskRunner.ts:145`) → `formatTaskReport`(`:21`, `focus==='inventory'` 분기 `:30`) → 팀 메시지 + 활동 원장 |
| 2. 실제 상품 등록되면 같은 경로로 재시험 | 보고 수치가 `DepartmentSourceOfTruthSnapshot.productUniverse.riskyStockCount` 에서 나온다(`agentTaskRunner.ts:30`). 이 스냅샷의 **입력만** 시험 → 실제로 바뀌고 화면·계약은 그대로다 |
| 3. 개인정보·외부 WRITE·DB 선택 불요 | 결과는 팀 메시지·활동 원장에 남고 고객·외부로 나가지 않는다. 저장은 기존 localStorage 경계 |
| 4. 사용자 가치 분명 | 품절·재고 부족을 사람이 매일 눈으로 훑지 않고 **정본 판정(`inventoryRiskContract`)으로 한 번에** 받는다 |
| 5. 기존 자산 재사용 | 신규 화면 0 — `AgentTaskPanel`·`agentTaskRunner`·`inventoryRiskContract`·`departmentDataSourceOfTruth`·lifecycle 승인·팀 메시지·활동 원장을 그대로 쓴다 |

### 지금 상태에서 실제로 남은 간극(추정 아닌 관측)

- `runScheduledAgentTask`(`agentTaskRunner.ts:169`)는 **제품 호출자 0건** — 예약 실행은 E단계다. **이번 후보는 수동 실행 기준**으로 잡는다.
- 활동 원장의 사람 라벨이 `'운영자'` 하드코딩(`agentTaskRunner.ts:74`·`:117`)이라 **로그인 신원과 연결되지 않는다** — 이 업무를 완주로 부르려면 여기가 `identity.actor` 기준이어야 한다.
- 보고 수신은 `spec.reportTo: 'hq'` 로 팀 메시지에 도착한다. **HQ 승인 흐름(lifecycle)과의 연결**이 이 업무의 실제 종료조건이다.

### 왜 다른 후보가 아닌가

| 후보 | 지금 추천하지 않는 이유 |
|---|---|
| CS 문의·리뷰 데스크(`task-cs-daily`) | 문의·리뷰 real 경로가 **mock 분기만**(`godomallResource.ts:132,134`)이고 답글은 `writeStatus:'not_connected'` — 실증 간극이 두 겹 |
| 마케팅 매출 요약(`task-marketing-daily`) | `approvalMode: 'auto'` 라 **승인 흐름 완주를 보여 주지 못한다**. 행동수집도 8종 전부 미연결 |
| 디자인 상세페이지 변환 | 입력이 **실제 상품**이어야 한다(P). 상품팀 선별 업무와 직결 |

**이 추천은 다음 작업 입력일 뿐이며 이번 턴에 구현하지 않았다.**

### 갱신 (2026-07-30) — 이 추천은 구현됐다 · **최종 형태가 바뀌었다**

로컬 구현 완료 · Codex 독립검증 대기. 다만 위에 적은 제목 `… → 팀장 승인 → HQ 보고` 중 **`HQ 보고` 는 채택되지 않았다.**
사용자 결정 **D-010**(HQ 자동 보고 경계)에 따라 **팀 내부 완주**로 만들었다 — 팀장이 `확인 완료` 하거나 **이유 한 문장으로 반려**하면 팀 안에서 마감되고, **HQ 메시지·HQ 승인대기를 자동 생성하지 않는다.** HQ 는 기존 `오늘의 운영 → 팀 카드 → 부서 업무 확인` 에서 기록을 **열람**한다.

위에 적은 **관측된 남은 간극 3건**의 현재 상태:

| 간극 | 현재 |
|---|---|
| 활동 원장 사람 라벨 `'운영자'` 하드코딩 | **해소** — 실제 로그인 행위자(`label`+`userId`) 기록 |
| 보고와 HQ 승인 흐름의 연결 | **연결하지 않는 것이 정답이었다**(D-010). 팀 내부 마감 + HQ 열람 |
| `runScheduledAgentTask` 제품 호출자 0건 | **그대로**(예약 실행은 E 단계, 이번 범위 밖) |

자세한 구현 사실·검사 수치는 `CURRENT_STATE.md` 의 `D-0 첫 대표 업무` 절.

**2026-07-30 최종 확정**: Codex 전체 게이트 통과(`d26019a` · `npm test` exit 0 · smoke 125/125 · 139.2초). 확정 범위는 **시험자료 기반 미리 구현·자동검증 완료**까지이며, **실제 상품·실데이터 재시험은 미완료**다.

### 갱신 2 (2026-07-30) — CS팀 대표 업무도 같은 방식으로 구현

위 **2-2 CS팀 표**의 판정을 그대로 유지하되, 한 가지를 분명히 한다.

> **`문의·리뷰 real 경로가 mock 분기만`(C/P) 이라는 사실은 실제 데이터 최종 실증을 막을 뿐, 기존 시험자료 기반 구현을 막지 않는다**(D-009).

그래서 위 §4 에서 "실증 간극 두 겹"을 이유로 후순위로 뒀던 `task-cs-daily` 를 **시험자료 기반 미리 구현** 범위에서 완주시켰다(2026-07-30, Codex 독립검증 대기).

| 항목 | 결과 |
|---|---|
| 변경 | `task-cs-daily.reportTo: 'hq' → 'cs'` **한 줄**(`approvalMode: 'draft'` 유지) |
| 재사용 | `AgentTaskPanel`·`agentTaskRunner`·`agentTaskRunState`·`activityLedger`·`csUniverse`·`identity.actor` — **새 실행기·저장소·승인 체계 0건, 팀 이름 조건문 0건** |
| 검사 | 기존 smoke 확장 **69/69** · 신규 파일 0 · manifest 125/0 |
| 여전히 막혀 있는 것 | **CS 실제 고객 답글 발송**(`writeStatus` 항상 `'not_connected'`, 손대지 않음) · **문의·리뷰 real API**(`godomallResource.ts:132,134` mock 분기만) · 실제 고객 PII |

**이 둘(상품·CS) 모두 시험자료 기반 미리 구현이며 실제 완주가 아니다.** 고도몰 키는 발급 대기 중이다.

**2026-07-30 CS 확정**: Codex 전체 게이트 통과(`6a23d02a` · `npm test` exit 0 · smoke 125/125 · 131.2초). 확정 범위는 **시험자료 기반 미리 구현·자동검증 완료**까지이며, **실제 문의·리뷰 API 와 고객 답글 WRITE 는 미연결** 그대로다.

### 갱신 3 (2026-07-30) — 마케팅팀 대표 업무도 같은 방식으로 구현

위 **2-4 마케팅팀 표**의 판정을 그대로 유지하되, 한 가지를 분명히 한다.

> **`고객 행동수집 8종 전부 connected:false`(P/W) 라는 사실은 실제 마케팅 실증을 막을 뿐, 기존 매출 시험자료 요약 구현은 막지 않는다**(D-009).

그래서 위 §4 에서 "`approvalMode:'auto'` 라 승인 흐름 완주를 못 보여 준다"는 이유로 후순위였던 `task-marketing-daily` 를, **승인 모드를 `approval` 로 맞춰** 팀 내부 마감으로 완주시켰다(2026-07-30, Codex 독립검증 대기).

| 항목 | 결과 |
|---|---|
| 변경 | `reportTo: 'hq' → 'marketing'` · `approvalMode: 'auto' → 'approval'` |
| 판정 근거 | 승인된 `standing` 이 없어 `auto` 로는 수동 실행이 즉시 완료되지 않는다(`standingDirectiveContract.ts:63-71`). **승인받은 적 없는 standing 을 만들지 않고 공통 안전 경계도 바꾸지 않는다**(Codex A안) |
| 재사용 | 상품·CS 와 같은 일반 경계 `reportTo === teamId` — **마케팅 전용 조건문 0건 · 새 매출 정의 0건** |
| 검사 | 기존 smoke 확장 **86/86** · 신규 파일 0 · manifest 125/0 |
| `매일 09:30` | **업무 설정값(표시)** 이며 **실제 자동 스케줄러는 미연결**. 지금은 팀장이 직접 실행·확인하고, standing 이 없으므로 스케줄 자동 실행은 계속 차단된다 |
| 여전히 막혀 있는 것 | **고객 행동수집 8종 미연결** · 광고 플랫폼 연결 · 캠페인 성과 계산 · 외부 광고 WRITE |

**세 팀(상품·CS·마케팅) 모두 시험자료 기반 미리 구현이며 실제 완주가 아니다.** 고도몰 키는 발급 대기 중이다.

### 갱신 4 (2026-07-30) — 세 팀 묶음 최종 확정 · 다음은 디자인팀

**Codex 최종 전체 게이트 통과 (기준 HEAD `63412ae`)**: 저장 경계 집중검사 **25/25** · 업무 실행 무회귀 **86/86** · `npm.cmd test` **exit 0** · 전체 smoke **125/125 · 114.3초** · manifest **125/0** · `tsc -b`·API 타입검사·Vite build·전체 lint·`git diff --check main..HEAD` 통과 · 트리 clean.

기본 스펙 변경만으로는 **이미 앱을 쓴 브라우저에 옛 정책이 남는다**는 저장 경계 문제까지 닫았다 — 옛 정책 1회 이관 · 새 브라우저 첫 수정 보존 · 손상 저장값 복구 뒤 첫 수정 보존 · 저장 실패 시 marker 미생성과 복구 후 재시도. 사용자 추가 업무·삭제한 기본 업무·정책 외 필드·업무 결과/원장/승인 이력/메시지는 **전부 무변경**이다.

**이것은 시험자료 기반 미리 구현·자동검증 완료다. 실제 고도몰 데이터 실증도, E·F 실제 업무 완주도 아니다.**

**다음(§2-3 디자인팀 표 참조)**: 디자인팀 첫 대표 업무는 **사용자 의도 확인 뒤** 확정한다. 현재 추천 후보는 `시험상품 상세페이지 초안 생성 → 디자인팀장 수정·확인 → 팀 내부 저장` 이며, 위 표에서 **W** 로 표시한 **고도몰 등록·외부 WRITE 는 포함하지 않는다.**

---

## 5. 이 문서가 바꾸지 않는 것

- 실제 개인정보 저장 · 외부 WRITE · Production 변경의 **기존 승인 경계**는 그대로다.
- 가상 데이터는 계속 **`시험 데이터`** 로 표시하며 실제 데이터처럼 가장하지 않는다(`dataSourceProvenanceContract` 정본).
- D→E→F 의 **내부 순서**는 유지한다. 바뀐 것은 "키·상품을 기다리는 동안 전부 멈춘다"는 잘못된 대기 의미뿐이다.
