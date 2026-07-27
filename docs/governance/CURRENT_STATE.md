# 현재 상태 (사실 기준선)

정본 위치: `D:\godo\docs\governance\CURRENT_STATE.md`
최종 갱신: 2026-07-27 (A2 착수 시점)

**규칙**: 이 문서는 **관측된 사실만** 적는다. 계획·의도·추정은 `MASTER_PLAN.md`에 쓴다.
주장에는 확인 범위를 함께 쓴다(헌법 §10). 확인하지 않은 것은 "미확인"으로 남긴다.

---

## 1. Git·배포

| 항목 | 값 | 확인 방법 |
|---|---|---|
| main = origin/main = Production | `5190f685ebfc0b7bb686817fa9d37216797171e1` | `git rev-parse main origin/main` |
| 인증 기능 브랜치 | `fix/auth-foundation-01-red` → `838e2c447f5f7f813845330746e377f156628bde` · **main 미병합** | `git rev-parse` / `git branch --merged main` |
| A2 작업 브랜치 | `codex/a2-governance-wiring` (`5190f685`에서 분기) | `git rev-parse --abbrev-ref HEAD` |
| 실행 환경 | **Vercel이 유일한 실행 환경** — 개발·검증·Production 모두 담당. 최종 배포 형태는 H단계 미결 | Vercel 대시보드 관측 |

## 2. 검사·빌드 (A2 브랜치 기준)

| 항목 | 값 | 확인 방법 |
|---|---|---|
| smoke 파일 수 | **120개** (main 기준. 인증 브랜치에 3개 추가분 있음) | `ls scripts/smoke-*.mjs \| wc -l` |
| manifest include | **120** / exclude **0** | `node scripts/run-regression.mjs --discover` |
| lint | **0 errors** (`scripts/flowRouteSmoke.ts:49` 수정 후) | `npx eslint .` |
| build | 통과 (`tsc -b` + `typecheck:api` + `vite build`) | `npm run build` |
| `npm test` 실제 소요 | **130초** (smoke 111.5s + build + lint), exit 0 | `npm test` 1회 실행 |

## 3. 고도몰 연결

- 기존 **시험몰은 만료**됨 (사용자 확인)
- 새 판매몰 계정 생성 완료, **개발자 등록·API 키 발급 대기 중**
- 키는 채팅으로 전달받지 않는다. **Preview 환경변수 등록 → 검증 → Production 등록** 순서
- 서버 기본 모드: `GODOMALL_API_MODE` 미설정 시 **`mock`** (`api/_shared/secretGuard.ts:25`)
- **미확인**: 2026-07-27 Preview에서 `/api/godomall/products`가 `sourceType: api_proxy_real`로 **13건**을 반환. 시뮬레이션 카탈로그도 13개이므로 **실제 출처 미확정** → B1-0에서 확인

## 4. 데이터·저장

- 업무 기록은 **브라우저 localStorage 중심**
- `taskLifecycleStore.ts:16` `MAX_TASKS = 500` · `:52` `slice(-500)` · `:54` 저장 실패를 조용히 무시
- `activityLedger.ts:10` `MAX_EVENTS = 500` · `:37` `slice(-500)`
- → **501번째부터 오래된 이력이 경고 없이 사라짐** (헌법 §5 위반 상태, B5에서 해소)
- 데이터 세계가 둘: `activeOperationsData`(적재 스냅샷, 소비자 12파일 + `src/engine` 2파일) / `fetchRevenue`(라이브 읽기, 호출자 3곳, **공유 캐시 없음·인자 상이**)

## 5. 실행 방식

- **사실상 수동 실행 기반**. `runScheduledAgentTask`(`src/services/agentTaskRunner.ts:169`)는 정의만 있고 **제품 코드 내 호출자 0건**
- 살아 있는 진입점: `runManualAgentTask` ← `src/components/AgentTaskPanel.tsx:38`
- AI 실행은 `kind:'agent'`로, 사람의 승인·반려·중단은 `kind:'human'`으로 활동 원장에 분리 기록됨(`agentTaskRunner.ts:53,63,70,74,117,126`). 다만 사람 라벨이 `'운영자'` 하드코딩 → B3에서 실제 계정 연결

## 6. 화면·기능 — "있는데 실무에서 안 되는" 것

헌법 §6("화면에서 실제로 진입할 수 없는 기능은 완료로 인정하지 않는다") 적용 대상.

| 기능 | 코드 | 실무 | 해소 단계 |
|---|---|---|---|
| 업무 카드 → 결과 상세 | 모달·핸들러 존재 | **진입 경로 없음** (`OfficeView.tsx:34-35` props 미사용, `<TaskBoard` 렌더 0건) | B6 |
| CS 답변 발송 | 초안·검수 대기실 동작 | `writeStatus:'not_connected'` — **고객에게 나가지 않음** | G |
| 예약 실행 | 함수 존재 | **호출자 0건** | E |
| 마케팅 1팀/2팀 분리 | 없음 (`marketing` 단일) | 리터럴 `'marketing'` **95곳/41파일** | B3 |

## 7. 팀별 기능 — 존재 상태

**존재하며 동작**: 상품(매출·주문·재고 통계, 재고위험, 카탈로그, 팀 채팅) · CS(문의·리뷰 분류, AI 초안, 검수 대기실, 고객 프로필·통계) · 디자인(상세페이지 생성기, 고도몰 변환기 6,790줄, 팀 화면) · 마케팅(분석 대시보드, 질문형 분석, 행동수집 기반) · HQ(오늘의 운영, 팀 지시, 승인 대기, 활동 원장) · 공통(업무 생명주기, 팀 메시지, AI 설정실·두뇌 설정, 데이터 가져오기, 고도몰 연동 화면 — 총 10개 메뉴)

**존재하지만 실무 미완주**: 문의·리뷰 실제 API 미연결 · 고객 답글·상품등록 WRITE 잠김 · 자동발주 · 상담 챗봇 · 광고 운영

## 8. 계산 계약

정본으로 살아 있음: `revenueMetricContract`(`isValidOrder` 5파일 import) · `inventoryRiskContract`(`classifyStockRisk` 4파일) · `claimEventContract`(4파일) · `inquiryStatusContract` · `dataSourceProvenanceContract`

**제품 경로 우회 3건 남음**(B2에서 해소): `src/utils/dataNormalizer.ts` · `src/engine/nativeAgentRuntime/agentExecutor.ts:70` · `src/services/csCustomerManagementFacts.ts:144-146`

## 9. 미확인 항목

- Preview `products` 13건의 실제 출처 (§3)
- 실제 운영 데이터량 (B4의 DB 사이징 입력 — 상한 가정으로 대체 예정)
- 기존 localStorage에 쌓인 시험 자료의 양과 보존 가치 (B5에서 JSON 백업 후 확인)
- 새 세션에서 시작 잠금(첫 줄 인용)이 실제로 작동하는지 — **다음 세션 첫 응답으로만 검증 가능**
