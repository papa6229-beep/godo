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
