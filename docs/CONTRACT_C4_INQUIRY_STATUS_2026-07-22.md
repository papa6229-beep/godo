# C-4 문의 상태 정규화 계약 — RED 보고 (2026-07-22)

> 상태: **RED 제출 · GREEN 미착수.** 이 문서 + `scripts/smoke-c4-inquiry-status-contract-v0.mjs`만(제품 계산 소스 변경 0).
> 브랜치 `fix/rc-1-c4-inquiry-status-normalization` (기준선 main `673c695`). main·Production 미변경.
> 범위: RC-1 마지막 계약. 입력 경계에서 상태를 1회 정규화하고, 내부는 공통 상태·판정 함수만 사용.

## 1. Canonical 상태 계약
`unanswered` · `in_progress` · `on_hold` · `needs_human` · `answered` · `unknown`

## 2. 의미 계약
- **미답변 = unanswered만** · **관리자확인필요 = needs_human만** · **답변완료 = answered만**
- **미처리(unresolved) = unanswered + in_progress + on_hold + needs_human + unknown**
- **unknown**: 해석 못한 원시 상태. answered/ok로 처리 금지, unanswered로 뭉개기 금지. **별도 수량 + 원시값 근거 보존**. 미처리·attention에는 포함.
- attention = 미처리(unknown 포함).

## 3. 입력 경계 정규화 (알려진 별칭만, 추측 매핑 금지)
| 원시(별칭) | canonical |
|---|---|
| unanswered / pending / open / 미답변 | unanswered |
| in_progress / processing / 처리중 | in_progress |
| hold / on_hold / 보류 | on_hold |
| needs_human | needs_human |
| answered / resolved / closed / done / 답변완료 / 처리완료 | answered |
| 그 외 · 빈 값 · undefined · 새 값 | unknown |

- 대소문자·앞뒤 공백만 정리(예 `"  Unanswered  "` → unanswered). 의미 추측 과잉 매핑 금지.
- **실 고도몰 원시값 미확인** → 위 표는 '합성/mock에서 확인된 별칭 + 계약 어휘'이며 **'확정 고도몰 매핑'이라 부르지 않는다**(문의는 현재 합성 전용, godomall 문의 어댑터 없음).
- 판정 근거 보존: `canonicalStatus` · `rawStatus` · `normalizationReason(known_alias|empty|unrecognized)`.

## 4. RED 결과 (`smoke-c4-inquiry-status-contract-v0.mjs`)
fixture 19종(모든 원시 상태 + 대소문자/공백 변형 + ''·undefined·미지값)을 실제 소비자 2개에 투입.

**[BASE] 5/0**: 미답변5·in_progress2·on_hold2·needs_human1·answered6·unknown3 · 미처리13(unknown 포함) · needs_human≠미답변 · unknown≠answered · 공백/대소문자 정리.

**[RED] 0/6**:
| RED | 목표 | 현재 |
|---|---|---|
| R1~R3 | inquiryStatusContract(normalize/summarize/판정·근거보존·unknown분리) | 모듈 없음 |
| R4 | analytics `unansweredInquiryCount` = 미답변 **5** | **1** (`=== 'unanswered'` literal 과소집계) |
| R5 | CS 대시보드 `unansweredCount` = 미답변 **5** | **6** (정규식이 needs_human 과대포함) |
| R6 | analytics 미답변 = CS 미답변 (일치) | **1 ≠ 6** |

→ 과소집계·발산을 값으로 고정(계약 5 · analytics 1 · CS 6).

## 5. 소비자 전수 (census, 현재 코드) — 같은 8종셋 "미답변/미처리" = 1 vs 5 vs 7 vs 8
| 스킴 | 예 | 소비자(file:line) |
|---|---|---|
| `=== 'unanswered'` (literal, 미답변=1) | analytics | `analyticsQueryEngine.ts:599` · `api/_shared/syntheticCommerceFacts.ts:118` |
| 5-alt 정규식 `unanswered\|pending\|open\|미답변\|needs_human` (미답변=5, needs_human 오포함) | CS 대시보드/채팅 | `csTeamDashboardFacts.ts:83` · `departmentChatFacts.ts:83` · `csDraftRuntime.ts:91` |
| `!isAnswered`(answered외 전부, 미처리=7) | 미처리 | `csTeamDashboardFacts.ts:320`(:378) · `csDashboardStatistics.ts:34` · `departmentDataSourceOfTruth.ts:82`(:133) · `csCustomerManagementFacts.ts:96` |
| `!== '답변완료'`(한국어 literal, =8) | 운영 채팅 | `controlChatService.ts:154`(:407) |
| `=== '미답변'`(한국어 literal) | draft | `csDraftGenerator.ts:86` |
| hold/보류, statusKo 라벨 | 표시 | `csTeamDashboardFacts.ts:848` · `csDashboardStatistics.ts:35` · `departmentChatFacts.ts:85` · `CsTeamDashboard.tsx:59,876`(React) |

**생산자/어댑터**: 합성 `syntheticCommerceUniverse.ts:595`(unanswered/answered/needs_human) · mock `mockGodoData.ts`(unanswered) · `defaultOperationsData.ts`(미답변/답변완료 한국어) · **CSV·godomall 문의 어댑터 없음**(문의 합성 전용). → 영어 vs 한국어 **두 어휘 분리**가 근본.

## 6. 입력 경계 · 소비자 흐름
```
합성/mock 생산자 ─┐
(defaultOps 한국어)─┼→ [입력 경계: normalizeInquiryStatus → canonical + rawStatus + reason]
(향후 CSV/godomall)─┘        │
                    → 공통 판정(isUnanswered/isUnresolved/isNeedsHuman/isAnswered/summarizeInquiryStatus)
                    → analytics · CS 대시보드 · CS 채팅 · 운영 채팅 · 스냅샷 (원시 비교 복붙 제거)
```

## 7. 공통 계약 API 제안 (신규 `src/services/inquiryStatusContract.ts`)
```ts
export type InquiryStatus = 'unanswered'|'in_progress'|'on_hold'|'needs_human'|'answered'|'unknown';
export interface InquiryStatusResult { canonicalStatus: InquiryStatus; rawStatus: string; normalizationReason: 'known_alias'|'empty'|'unrecognized'; }
export function normalizeInquiryStatus(raw: unknown): InquiryStatusResult;   // 알려진 별칭만, 공백/대소문자 정리
export function isUnanswered(raw): boolean;   // canonical==='unanswered'
export function isNeedsHuman(raw): boolean;   // ==='needs_human'
export function isAnswered(raw): boolean;     // ==='answered'
export function isUnresolved(raw): boolean;   // canonical ∈ {unanswered,in_progress,on_hold,needs_human,unknown} (=!answered)
export function summarizeInquiryStatus(raws: unknown[]):
  { unanswered; inProgress; onHold; needsHuman; answered; unknown; unresolved; attention; total;
    unknownSamples: {rawStatus:string}[] };   // unknown 원시값 근거 보존
```

## 8. 수정 예상 파일 (GREEN)
- 신규 `src/services/inquiryStatusContract.ts`
- 소비자 이관(원시 비교 제거): `analyticsQueryEngine.ts`(:599) · `csTeamDashboardFacts.ts`(:83,:320,:848) · `csDashboardStatistics.ts` · `departmentDataSourceOfTruth.ts`(:82,:133) · `departmentChatFacts.ts`(:83,:85) · `csCustomerManagementFacts.ts`(:96) · `csDraftRuntime.ts`(:91) · `controlChatService.ts`(:154,:407) · `csDraftGenerator.ts`(:86) · `api/_shared/syntheticCommerceFacts.ts`(:118) · React 라벨(`CsTeamDashboard.tsx`)
- (경계) 생산자는 canonical 어휘로 정규화하거나 소비자 경계에서 normalize.

## 9. 완료 조건
- 위 RED 6항목 MET(analytics·CS·스냅샷 미답변/미처리 동일, unknown 분리·근거 보존).
- 소비자 원시 문자열 비교 복붙 제거 → 공통 계약 사용.
- 기존 C-1/C-2/C-3/C-5~C-10 회귀 없음 · 전체 스모크·parity·tsc·build·신규 lint 0.

## 10. 범위 제한 (이번 C-4)
- 불리언 7변종(paid/canceled) 광역 리팩터 **안 함**(현재 경로 잠재).
- 주문·매출·재고 계약 재수정 **금지**.
- 실 고도몰 상태값 추측 확정 **금지**('확정 매핑'이라 부르지 않음).
- CommerceSnapshot 전체 재설계는 C-4 완료로 과장하지 않고 **별도 후속**.

## 11. RED 제출 상태
제품 계산 소스 변경 **0**(test + 문서) · analytics 과소집계 값 재현(1 vs 5) · BASE/RED 분리 · main·Production 미변경.

---

# GREEN 전 보완 (2026-07-22)

## 12. 소비자 18개 의미 대조표 — 라벨마다 기대값이 다르다(전부 5로 통일 금지)

판정 함수별 19종 fixture 기대값: **isUnanswered=5 · isInProgress=2 · isOnHold=2 · isNeedsHuman=1 · isAnswered=6 · isUnknown=3 · isUnresolved=13**. attention = 미처리(=isUnresolved, **최소 needs_human+unknown 포함**).

| # | 파일:함수 | 화면/AI · 라벨 | 현재 판정식 | 의도된 의미 | 공통 함수 | 기대값 | 사용자 숫자 변화 |
|---|---|---|---|---|---|---|---|
| C1 | analyticsQueryEngine:599 `unansweredInquiryCount` | 마케팅 분석 채팅 · **미답변** | `===unanswered` | 미답변 | isUnanswered | **5** | 1→5 (증가) |
| C2 | csTeamDashboardFacts:83 `isUnanswered`→kpis.unansweredCount | CS 대시보드 · **미답변** | 5-alt 정규식 | 미답변 | isUnanswered | **5** | 6→5 (needs_human 제외) |
| C3 | csTeamDashboardFacts:320/378 unresolved | CS 대시보드 · **미처리** | `!isAnswered` | 미처리 | isUnresolved | **13** | 13→13 (+unknown 분리) |
| C4 | csTeamDashboardFacts:848 hold | CS 대시보드 · **보류** | `/hold\|보류/` | on_hold | isOnHold | **2** | ± |
| C5 | csDashboardStatistics:34/80 `isAnswered` | CS 통계 · **답변완료** | isAnswered 정규식 | answered | isAnswered | **6** | ± |
| C6 | csDashboardStatistics:35/84 `isHold` | CS 통계 · **보류** | `/hold\|보류/` | on_hold | isOnHold | **2** | ± |
| C7 | csDashboardStatistics workflowSummary.unresolved | CS 통계 · **미처리** | 워크플로 unresolved | 미처리 | isUnresolved | **13** | ± (+unknown) |
| C8 | csCustomerManagementFacts:96/167 `isAnswered` | 고객관리 · **답변완료/미답변 라벨** | isAnswered + fallback | 상태 라벨 | normalize→라벨 | 라벨 | 라벨 정확화 |
| C9 | departmentDataSourceOfTruth:133 unresolved | 총괄 스냅샷·에이전트 보고 · **미처리 문의** | `!isAnswered` | 미처리 | isUnresolved | **13** | 13→13 (+unknown 분리) |
| C10 | departmentChatFacts:83 `isUnansweredStatus` | 부서 채팅 · **미답변** | 5-alt 정규식 | 미답변 | isUnanswered | **5** | 6→5 |
| C11 | departmentChatFacts:85 `statusKo` | 부서 채팅 라벨 · 미답변/담당자확인/답변완료 | 정규식 라벨 | canonical 라벨 | normalize→라벨 | 라벨 | needs_human 분리 |
| **C12** | **controlChatService:154 pendingInquiriesCount** | **운영 채팅 컨텍스트 · 라벨 "미답변 문의"** | `!== '답변완료'`(=미처리) | **⚠️ 라벨-식 불일치**: 라벨은 미답변인데 식은 미처리 | **사장 확정 필요** | 미답변→5 / 미처리→13 | 큰 변화 |
| **C13** | **controlChatService:407 pendingInquiries** | **운영 채팅 답변 · "미답변"** | `!== '답변완료'` | ⚠️ 동일 라벨-식 불일치 | 사장 확정 필요 | 5 또는 13 | 큰 변화 |
| C14 | csDraftRuntime:91/110 `isUnanswered` | CS 초안 대상 선택(내부) | 5-alt 정규식(needs_human 포함) | ⚠️ 초안 대상=미답변만? needs_human 포함? | **정책 확정 필요** | 5 또는 6 | 대상 변화 |
| C15 | csDraftGenerator:86 `==='미답변'` | CS 초안 생성(내부) | 한국어 literal | 미답변 | isUnanswered | 5 | 한국어 데이터 기준 |
| C16 | syntheticCommerceFacts:118/119 | 서버 facts · **미답변/관리자확인** | `===unanswered`/`===needs_human` | 미답변 / needs_human 별도(이미 분리) | isUnanswered / isNeedsHuman | **5 / 1** | 미답변 1→5 |
| C17 | CsTeamDashboard.tsx:59 statusKo (React) | CS 화면 라벨 | 정규식 라벨 | canonical 라벨 | normalize→라벨 | 라벨 | needs_human 분리 |
| C18 | CsTeamDashboard.tsx:876 hold (React) | CS 화면 · **보류** | `/hold\|보류/` | on_hold | isOnHold | **2** | ± |

**구분 원칙(명시)**: '미답변'에 isUnresolved 금지 · '미처리'에 isUnanswered만 금지 · '관리자 확인 필요'에 unanswered 혼합 금지 · 완료율 분모/분자는 전체 합계(=19) 보존.
**사장 확정 필요(라벨-의미 불일치)**: C12/C13(운영 채팅 "미답변"인데 식은 미처리) — 라벨을 '미답변'(isUnanswered=5)으로 볼지 '미처리'(isUnresolved=13)로 볼지. C14(초안 대상에 needs_human 포함 여부).

## 13. 대표 소비자 RED 보완 (스킴별 실행)
| 스킴 | 실제 소비자 | 라벨 | GREEN 기대값 | 현재 | 실행 |
|---|---|---|---|---|---|
| `===unanswered` literal | analyticsQueryEngine `unansweredInquiryCount` | 미답변 | **5** | 1 | ✅ (R4) |
| 5-alt 정규식 | csTeamDashboardFacts `unansweredCount` | 미답변 | **5** | 6 | ✅ (R5) |
| `!isAnswered` | departmentDataSourceOfTruth `unresolvedInquiries` | 미처리 | **13** | 13(값일치·unknown 미분리) | ✅ (B7 값 + R7 unknown 분리) |
| `!== '답변완료'` 한국어 | controlChatService `pendingInquiriesCount` | 미답변(라벨) | C12 확정 후(5 또는 13) | 모듈 상태(activeOperationsData 한국어)에 결합 → node 단위실행 불가 | 문서화(의미표 C12) — GREEN에서 정규화 이관 |

→ **모든 소비자를 5로 맞추지 않는다**: 미답변=5, 미처리=13으로 라벨 의미대로 차등.

## 14. 입력 경계 지도 (문의 record 유입 경로)
| 경로 | 현재 raw | canonical 전환 지점 | rawStatus 보존 | 과거 저장 호환 |
|---|---|---|---|---|
| 합성 universe(server) `syntheticCommerceUniverse:595` | `unanswered/answered/needs_human`(영어) | universeAux 투영 또는 소비자 경계 hydration에서 normalize | record.rawStatus | 생성(N/A) |
| mock `mockGodoData` | `unanswered`(영어) | 로드(hydration) 시 normalize | rawStatus | 로드 시 |
| `defaultOperationsData` | `미답변/답변완료`(한국어) | 로드 시 normalize | rawStatus | 로드 시 |
| 세션/localStorage 저장 데이터 | 과거 저장 raw(영/한 혼재 가능) | **hydration 시점 normalize**(idempotent라 이미 canonical이어도 안전) | rawStatus | ✅ hydration에서 |
| 향후 godomall API | **미확인**(추측 금지) | 어댑터에서 normalize | rawStatus | 어댑터 |
| 향후 CSV/엑셀 | 미확인 | 임포트 어댑터에서 normalize | rawStatus | 어댑터 |
| 직접 생성 문의(예 csApprovalQueueBridge) | canonical 직접 | 생성 시 canonical 사용 | — | — |

**정규화 위치**: 여러 소비자에서 반복하지 않는다. **공통 inquiry record를 만드는 경계**(universeAux 투영 / ops data 로드 / 어댑터)에서 1회 canonical+rawStatus 부여. 저장 데이터가 소비자로 직접 유입되는 경로는 **hydration 시점**에 정규화. 소비자는 공통 판정 함수(내부 normalize, idempotent)만 사용 → 경계와 소비자 어느 쪽이든 중복 정규화 안전.

## 15. 공통 계약 추가 조건 (idempotent 등)
- `normalizeInquiryStatus`는 **idempotent**: 이미 canonical인 값을 다시 넣어도 같은 canonical(스모크 B6로 잠금).
- `rawStatus`·`normalizationReason` 유실 금지. 빈 값·미지값 → unknown. unknown을 answered로 처리 금지. unknown은 unresolved 합계에 포함.
- 미지 원시값 샘플(`unknownSamples`)은 **개인정보가 섞이지 않는 범위**에서 진단 가능하게 보존(문의 상태 문자열만, 본문/이름/연락처 제외).

## 16. 완료 범위 명칭 (제한)
이번 완료 명칭은 **'C-4 문의 상태 입력 정규화'** 로 제한한다. CommerceSnapshot 전체 정규화 완료가 아니다.
후속(별도): 불리언 광역 정규화 · 실 고도몰 문의 상태 매핑 확정 · CommerceSnapshot 전체 재설계.
