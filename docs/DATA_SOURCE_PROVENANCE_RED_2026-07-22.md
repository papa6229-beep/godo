# 데이터 출처 신분증 — RED 재현 + 영향 소비자 전수조사 (2026-07-22)

> 브랜치 `fix/data-source-provenance` (부모 `a38b96c` = 데이터 출처 기준선). C-4 `347b4ad` 무변경.
> 이 단계는 **RED 재현 + 전수조사까지**. 제품 계산·화면 코드 미수정. GREEN·병합·배포 없음.
>
> 계약 후보: 내부 4상태 `actual / simulation / fixture / unavailable`,
> 사용자 표시 3종 `실제 데이터 / 시험 데이터 / 연결 안 됨` (내부 기술문구 미노출).

---

## 1. 현재 화면/모듈별 실제 판정값 (코드 확인)

| 모듈 | 판정 기준(현재) | 사용자에게 보이는 것 | 실제 신분(올바른 값) | 판정 |
|---|---|---|---|---|
| ApiBridge 화면 대부분 `isLive` | **mode(real/sandbox)+키 존재만** | "REAL (Live)", "REAL READ" | 리소스별로 다름(문의는 fixture) | ❌ 오판 |
| ApiBridge "마지막 동기화 결과" 박스 | `sourceType`(정확) | "REAL (Live)/FALLBACK (Mock)" | 정확 | ⚠️ 기술문구 노출 |
| DataPanel 데이터소스 배지 | `sourceType` 원문 대문자화 | "API_MOCK_FALLBACK" 등 | — | ⚠️ 기술문구 노출 |
| 상품팀 대시보드/채팅 | 실/가상 per-order 태그 | "🧪 실제 N + 가상 N · REAL+SYNTHETIC" | mixed | ✅ 양호(단 기술문구) |
| 마케팅 분석 대시보드 | **출처 무참조** | 운영매출 88,116,982원 (배지 없음) | simulation(가상 파생) | ❌ 오판 |
| HQ/총괄 채팅 `controlChatService` | **sourceType 미확인** | "현재 운영 데이터: 주문 N·문의 N·재고위험 N" | demo/mock fixture | ❌ 오판 |
| CS팀 facts | 입력=가상 2년치, 산출물 무라벨 | 미처리/미답변 수치 | simulation/fixture | ❌ 무표시 |
| 결합 엔진 `departmentDataSourceOfTruth` | `sourceMode='mixed'`, `includesSynthetic` | (내부 태그만, UI 미표면화) | mixed→simulation | ✅ 엔진 정직 / ❌ UI 미표시 |
| MainLayout 헤더 배지 | 하드코딩 | "LOCAL APP MODE" 고정 | — | ⚠️ 무의미 |

---

## 2. 잘못 표시되는 재현 사례 (파일:라인 + 근거)

### 사례 A — `isLive`가 mode+키만 보고 전 화면 REAL (최광범위 오판)
`src/components/ApiBridgePanel.tsx:454-459`
```ts
const isLive = !!proxyHealth &&
  (proxyHealth.mode === 'sandbox' || proxyHealth.mode === 'real') &&
  proxyHealth.hasPartnerKey && proxyHealth.hasUserKey;
```
→ `sourceType` 미참조. 문의/리뷰는 `mode:real`이지만 `sourceType=api_mock_fallback`인데도
이 `isLive`가 리소스 카드(769/837/883행), 요약(486-492), 보안 배너(551-563)를 전부 "REAL (Live)"로 칠함.
**규칙 A·J 위반.**

### 사례 B — 실제0건과 연결실패 미구분
`api/_shared/godomallResource.ts:144-163` (원천): 성공 빈배열=`api_proxy_real,live:true,count0`,
실패=`api_mock_fallback,live:false,errorMessage`. 그러나 클라이언트에 이 둘을
**"실제 0건 vs 연결 안 됨"으로 분기하는 통합 판정기가 없음**. `secureProxyClient`는 실패 시
자동으로 mock으로 대체(`:107-144`). **규칙 B·C 위반.**

### 사례 C — 마케팅 88M을 시험 배지 없이 표시
`src/components/MarketingAnalysisDashboard.tsx:749, 819-821` — `buildDepartmentSourceOfTruthSnapshot`으로
`sourceMode='mixed'`를 알 수 있는데도 `snap.operationalRevenue`(가상 파생 88,116,982원)를
KpiCard에 **synthetic/시험/가상 배지 없이** 표시. 파일 전체 `sourceMode|includesSynthetic|시험|가상|synthetic` 참조 **0건**(grep 확인). 부제도 "고도몰 데이터 기반 분석"으로 실데이터 인상. **규칙 D·G 위반.**

### 사례 D — HQ 채팅이 demo/mock fixture를 실운영으로 집계
`src/services/controlChatService.ts:155-161` — `activeOperationsData`(= demo 시드 또는
mock fallback 유입분)의 주문/문의/리뷰/재고를 `sourceType` 확인 없이 "참고용 현재 운영 데이터"로 조립.
`defaultOperationsData`는 `sourceType:'demo'`인데 그대로 실운영처럼 노출. **규칙 D·F·G 위반.**

### 사례 E — 내부 기술문구 UI 노출
- `DataPanel.tsx:83` `activeOperationsData.sourceType.toUpperCase()` → "API_MOCK_FALLBACK" 노출
- `App.tsx:619-620` 리포트 제목 `…(${sourceType.toUpperCase()})` → "…(API_MOCK_FALLBACK)"
- ApiBridge 결과 박스 default 분기 `sourceType.toUpperCase()` 노출
**규칙 I 위반.**

### 사례 F — 허위 단언(출처·부작용)
`src/App.tsx:578-581` `route:'LOCAL'`, `fallbackUsed:false`, `piiRemoved:true` 하드코딩(실상태 무관).
`App.tsx:735` "외부 API 샌드박스로 커밋 완료" 허위 로그(실제 외부 커밋 없음). **규칙 H·J 인접(정직성).**

---

## 3. 소비자 전수 목록 (출처 태그 처리별)

### 정본/원천 (판정 근거)
- `api/_shared/godomallResource.ts:45,132-165` — `ResourceSource` 3종 + resolveResource. **mode:real + api_mock_fallback 조합 발생 확정**.
- `src/services/secureProxyClient.ts:96,103-104` — sourceType으로 판정(정확). 단 `:107-144` 실패 시 자동 mock 대체, `:147-210` 개별 fetch는 출처 태그 없이 raw 반환.

### 출처를 올바르게 다루는 소비자 (✅)
- `src/components/ProductTeamDashboard.tsx:687-689,475,531,717` — REAL+SYNTHETIC 배지·필터
- `src/services/productTeamChatFacts.ts:210-214,436` — dataSourceLabel 분기
- `src/services/departmentChatFacts.ts:47,242` — bundle source·fake contact 라벨
- `src/services/departmentDataSourceOfTruth.ts:139-146,158,161-162` — sourceMode='mixed'·includesSynthetic (엔진 레벨 정직)
- `src/services/departmentDataService.ts:433,487,499-509` — per-order sourceType, 실패=unavailable 빈폴백(mock 대체 안 함)

### 출처를 무시/오판하는 소비자 (❌ 수정 대상)
- `src/components/ApiBridgePanel.tsx:454-459`(isLive) + 486-492,551-563,711,766-778,834-846,880-883
- `src/services/controlChatService.ts:147-161,406-414` — HQ 채팅 무구분 집계
- `src/components/MarketingAnalysisDashboard.tsx:749,766,819-821` — 시험 배지 없음
- `src/services/csTeamDashboardFacts.ts:218-260` — 산출 facts 무라벨
- `src/components/DataPanel.tsx:83,1099` — 기술문구 노출
- `src/App.tsx:168-173`(demo 자동 시드),578-581·619-620·735(하드코딩/허위)

### fixture 원본·유입 경로
- `src/services/mockGodomallApi.ts:7-121` — 주문5·문의3·리뷰3 fixture (내부적으로 `api/_shared/mockProxyData.ts` 동형)
- `src/data/defaultOperationsData.ts:3-5` — sourceType:'demo', 앱 기본 시드
- `src/components/ApiBridgePanel.tsx:156-206` — sync(폴백 포함) → activeOperationsData 적재

---

## 4. 수정 예상 파일 (GREEN 단계 — 이번엔 미수정)

**신규 공통 계약 (단일 판정 지점)**
- `src/services/dataSourceProvenanceContract.ts` (신규) — `classifyResource`/`classifyScreen`/`userLabelOf`.
  내부 4상태 + 사용자 3표시. sourceType+count+errorMessage로 판정. 순수 함수(계산값 미변경).

**소비자 이관(판정을 계약으로)**
- ApiBridgePanel.tsx (isLive→리소스별 classifyResource), controlChatService.ts(집계 전 출처 게이트),
  MarketingAnalysisDashboard.tsx(시험 배지), csTeamDashboardFacts.ts(산출 라벨), DataPanel.tsx(userLabelOf),
  App.tsx(demo 시드 표시·하드코딩 정정), MainLayout.tsx(전역 상태 배지).
- 타입: `src/types/apiBridge.ts`/`proxy.ts`에 sourceType/live 정합.

**범위 밖(별도 후속)**: secureProxyClient 자동 mock 대체 정책 자체 변경(대체 대신 unavailable 표시)은
동작 변경이 크므로 별도. 이번 계약은 "**표시·집계 신분 판정**"에 한정.

---

## 5. 계산값 변경 여부
**없음.** 계약은 순수 판정·라벨링만 하며 매출·주문·재고 계산식을 바꾸지 않는다(규칙 H).
RED 스모크 H가 판정 순수성(입력 리소스 불변)을 잠근다.

---

## 6. RED 검사 결과 (`scripts/smoke-data-source-provenance-v0.mjs`, 커밋 f3a6d98)
```
[BASE] 3 pass / 0 fail   (B1 mode:real+api_mock_fallback 함정 실재 · B2 실제0건 vs 오류 원시구분 가능 · B3 계약 부재)
[RED ] 0 met / 2 unmet   (R1 계약 모듈 없음 · H 판정 순수성 — 계약 신설 시 A~J 활성)
exit 1 = RED
```
계약(`dataSourceProvenanceContract.ts`) 신설 후 A~J(계약 존재·A·B·C·F·I·D/E·G·C화면·H) 전부 MET 예정.

---

## 7. RED fixture 최소 조합 대응 (7종)
| # | 조합 | 기대 신분 | 스모크 |
|---|---|---|---|
| 1 | 실제상품13 + 가상운영 | 시험(simulation) | D/E |
| 2 | 실제상품13 + 실제주문0 | 실제, 주문0건(actual) | B/E |
| 3 | mode:real + 문의 api_mock_fallback 3 | 시험표본(fixture), 실문의 집계금지 | A/F |
| 4 | 실제 API 실패 | 연결 안 됨(unavailable) | C |
| 5 | 실제 성공 빈배열 | 실제 0건(actual) | B |
| 6 | 모든 운영 리소스 실제 | 실제(actual) | E |
| 7 | fixture 주문5·문의3 일반화면 유입 | fixture(자동유입 금지) | F |

---

## 8. 범위 밖 항목
- C-4 코드 수정·병합, main 병합, Production 배포, UI 전면개편 — **안 함**.
- secureProxyClient 자동 mock 대체 **정책 자체** 변경(대체→unavailable) — 별도 후속.
- 마스킹/PII 로직, 매출·재고 계산식 — 불변.

## 9. 브랜치·HEAD·트리
- 브랜치 `fix/data-source-provenance`, HEAD `f3a6d98`(부모 `a38b96c` 포함), 트리 clean.
- C-4 `fix/rc-1-c4-inquiry-status-normalization` `347b4ad` 무변경.

---

## 10. 후속 대장 (GREEN 1~3 이후)

### DATA-SOURCE-SERVER-01 (필수 후속)
서버 `api/_shared/godomallResource.ts` `resolveResource`는 실제 요청(real 모드)에서 라이브 호출이
실패/미구현이면 여전히 **태그가 붙은 mock fallback**(`source:'api_mock_fallback'` + mock 레코드)을 생성해 반환한다.
- 현재 앱 클라이언트는 GREEN 3(`resolveFetchOutcome`/`syncProxyResource`)에서 real 모드일 때 이 mock을
  운영 통계에 주입하지 않고 "연결 안 됨"으로 처리하므로 **이번 Preview 차단요소는 아니다.**
- 그러나 **향후 다른 클라이언트/프로그램이 이 서버를 직접 소비**하면 mock을 실제로 오인할 수 있다.
  실제 판매몰 전환 전에 **서버 단계에서도 실제 요청과 시험자료 생성을 분리**해야 한다
  (real 모드 실패 시 mock을 만들지 않고 명시적 실패/빈 응답 + 사유만 반환).
- 범위: 서버 API 계약 변경이므로 별도 작업으로 분리. 이번 provenance 계약(표시·집계 신분)과 독립.

### GAP-PROVENANCE-UI-01 (Preview 육안 검증에서 발견 — 잔여 기술문구 노출)
GREEN 2에서 이관하지 않은 두 지점이 여전히 내부 기술문구를 사용자에게 노출한다:
1. **상품관리팀 대시보드**(`ProductTeamDashboard.tsx`): 우상단 배지 "실제 N건 + 가상 N건 포함
   **REAL + SYNTHETIC**" — 사장 지정 금지 문구 `REAL+SYNTHETIC` 노출. → 사용자 표기 '시험 데이터'로 보완 필요.
2. **API Bridge 마지막 동기화 결과 박스**(`ApiBridgePanel.tsx` `getSourceDisplay`): "REAL (Live)" /
   "FALLBACK (Mock)" — 기술 라벨. 기술 콘솔 맥락이나, 사용자 3표기(실제/연결 안 됨)로 정합 필요.
   (단, 건수 판정은 정상: inquiries 동기화 시 **0건**으로 mock 미주입 — GREEN 3 동작 검증됨.)
→ GREEN 2 범위의 마무리 보완 대상(수정 대기 — Preview 보고 후 지시 대기).
