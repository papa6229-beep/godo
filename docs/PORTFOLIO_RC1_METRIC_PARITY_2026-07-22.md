# 포트폴리오 보존 — RC-1 지표 정합성 1차 (C-1, C-5~C-10)

> 보존일: 2026-07-22 · 상태: **종료(사장 승인)** · 이 문서는 사례 보존용이며 작업 지시서가 아니다.

## 한 줄 요약

"AI로 화면을 만들었다"가 아니라 — **숨은 데이터 오류를 감사하고, 계약(contract)과 회귀검증(regression harness)을 도입해 실제 Production까지 안정적으로 반영**한 사례.

## 무엇이 문제였나 (겉으로 안 보이는 결함)

마케팅 대시보드 '카테고리 매출 TOP'이 정상처럼 보였지만, 카테고리 정보가 없는 주문은 내부 통일 키 `uncategorized`가 **사용자 화면에 그대로 노출**되고 있었다. 숫자 계산이 아니라 **표시 계약 위반**이었고, 화면상으로는 성공처럼 보였다.

근본 원인은 두 층에 걸쳐 있었다:
- 어댑터 `departmentDataService.ts`가 카테고리 정보 부재 시 `categoryCode`·`categoryLabel`을 **둘 다** `'uncategorized'`로 정규화.
- 소비자 `marketingAnalysisFacts.ts`가 "label이 비었을 때만" 변환 → 어댑터가 채운 `'uncategorized'`/`'unknown_product'` 라벨이 그대로 통과.

## 어떻게 고쳤나 (방법론)

1. **감사 → 계약 초안**: `CONTRACT_DRAFT_RC1_METRICS.md`에 지표 계약을 명문화(C-1 카테고리 출처/표기 등).
2. **실패를 먼저 재현(RED)**: 실제 어댑터 형태(`code=label='uncategorized'`, `label='unknown_product'`)를 입력으로 실제 모듈 반환값 `topCategories.{key,label}`을 검증하는 회귀 스모크 작성 → 의도한 실패 확인.
3. **최소 수정(GREEN)**: 표시 규칙을 **key 우선**으로 확정. 내부 key는 `uncategorized` 유지, 화면 label만 `미분류`.
   ```ts
   const catLabel = catCode === 'uncategorized' ? '미분류' : (str(l.categoryLabel) || catCode);
   ```
   상품 메타 재조인·타 코드 한글화 없음(범위 = 내부 key의 사용자 노출 차단뿐).
4. **회귀 방지 상설화**: 전용 스모크를 `scripts/`에 추가(전체 스모크 스위트에 자동 합류).

## 배포 무결성 (검증한 코드 = 배포된 코드)

| 항목 | 값 |
|---|---|
| 병합 커밋 | `951881a` — "RC-1 지표 정합성 1차 — C-1, C-5~C-10" (`--no-ff`, 31커밋 통합) |
| main | 로컬·`origin/main` 동일 `951881a` |
| Production URL | https://godo-psi.vercel.app |
| 배포 상태 | Ready (Production) |
| 배포 번들 | `index-SmBqx97-.js` — 로컬 검증 빌드 해시와 일치 |

## 통합검사 (main 병합 후)

- 지표 정합성 하네스 **163 pass / 0 fail / 0 skip**
- 전체 스모크 **82 pass / 0 fail**
- `flowRouteSmoke` PASS · `tsc -b` 0 · `npm run build` 0
- 신규 lint 0 · 작업 트리 clean

## Production 실검증

- 첫 화면·부서 이동 정상
- 마케팅 대시보드 로딩 정상 — 매출 **88,116,982원** / 주문 **1,182건** / 객단가 **74,549원** (Preview·직전일과 일치)
- **카테고리 매출 TOP = `미분류`** (001·003·006·미분류; 내부 키 `uncategorized` 미노출)
- 브라우저 콘솔 오류 **0건** · 신규 4xx/5xx **0건** (네트워크 16건 전부 200)

증빙 화면: `docs/portfolio/rc1-metric-parity-production-category-top-2026-07-22.jpg`

## 범위 한정 (정직한 경계)

이 검증은 **이번 패치의 배포 무결성 + 주요 마케팅 화면 회귀 없음**을 확인한 것이지, Production 전체 기능의 완전성을 증명한 것이 아니다. RC-2 이후 **실제 업무·승인·실행까지 연결하는 완주 검증**은 아직 남아 있다.

## 이어지는 일

RC-1 잔여 계약 **C-2(매출 명명) · C-3(재고 위험 단계) · C-4(어댑터 정규화)** 는 별도. 소스 수정 전에 계약 대조 보고서를 먼저 제출·승인받는다. RC-2로는 넘어가지 않는다.
