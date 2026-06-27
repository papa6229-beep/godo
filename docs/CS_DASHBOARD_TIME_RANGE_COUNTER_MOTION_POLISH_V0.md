# CS Dashboard Time Range & Counter Motion Polish v0

> **작업명**: `CS Dashboard Time Range & Counter Motion Polish v0`
> **브랜치**: `fix/cs-dashboard-time-range-counter-motion-v0`
> **상위 컨텍스트**: `docs/CS_DASHBOARD_INTERACTIVE_STATISTICS_V0.md`.
> **범위**: 직접 선택(custom) 기간 활성화 + 숫자 카운터/막대 transition. 실제 WRITE 없음.

---

## 1. 목적

직접 선택 기간을 실제 동작시키고, 기간 변경 시 KPI·통계 숫자를 부드러운 카운터로, 막대를 width transition으로 전환. "숫자는 정확하게, 변화는 부드럽게, 애니메이션은 과하지 않게."

---

## 2. 산출물 / 변경

### 신규
* `src/hooks/useAnimatedNumber.ts` — ease-out RAF 카운터 hook. reduced-motion guard, decimals/disabled, RAF/타이머 cleanup, setState는 콜백에서만(eslint `set-state-in-effect` 준수).
* `scripts/smoke-cs-dashboard-time-range-counter-motion-polish.mjs` — **24/24 통과**.
* `docs/CS_DASHBOARD_TIME_RANGE_COUNTER_MOTION_POLISH_V0.md`(본 문서).

### 수정
* `src/services/csDashboardTimeFilter.ts` — `CsTimeRange`에 `custom` 추가 + `CsCustomRange`/`isValidCustomRange`. `inCsTimeRange`/`filterCsInputsByTime`에 custom(start~end, day 비교) 지원, 무효 custom은 '전체'로 안전 폴백.
* `src/components/CsTeamDashboard.tsx` — 직접 선택 UI(date input start/end + 적용/초기화 + 검증), `customRange`/`customDraft`/`showCustom`/`customError` state, `filtered`에 custom 전달. KPI/통계 숫자에 `useAnimatedNumber`/`<AnimatedNumber>`(tabular-nums).
* `src/components/CsTeamDashboard.css` — 막대 width transition, `.cs-num` tabular-nums, date input/custom row 스타일.

> **미변경**: 통계 클릭 intent·팝업·처리완료/승인/반려·persistence·타 부서. 새 통계/직원통계/경과시간 없음.

---

## 3. 직접 선택 기간

* pill "직접 선택" 토글 → 시작일/종료일 date input + 적용/초기화. 적용 시 검증(둘 다 필수 + 종료≥시작) 후 `period='custom'` + `customRange` 설정, pill active + "조회 기간 · 2026-06-01 ~ …" 라벨.
* 종료일<시작일 → "종료일은 시작일보다 빠를 수 없습니다." (자동 swap 안 함). 무효 custom은 필터에서 '전체' 폴백.
* KPI 4 + 5 통계 전부 custom range 반영(`filtered` 단일 입력). 날짜 없는 항목은 기간 필터 제외(기존 정책 유지).

---

## 4. 카운터/transition

* `useAnimatedNumber(value, {durationMs=450, decimals, disabled})` → 표시값만 ease-out 보간(데이터 불변). `prefers-reduced-motion`이면 즉시 표시. unmount RAF/타이머 cleanup.
* 적용: KPI 값, 문의 유형 count/percent, 업무 흐름 수, AI 성과 수/승인율, 고객 리스크 수.
* 막대 `.cs-stat-bar-fill { transition: width 420ms ease, opacity 240ms }`. 숫자 `.cs-num { font-variant-numeric: tabular-nums }`로 레이아웃 흔들림 방지.
* 과한 효과(흔들림/바운스/글로우) 없음.

---

## 5. 안전 검증 (smoke)

custom 유효성/포함·제외/무효 폴백 · custom→통계 6블록 반영(#6~#11) · hook 존재/반환/reduced-motion/cleanup(#12~#15) · custom state/date UI/적용(#2~#4) · KPI·통계 animated(#16·#17) · 막대 transition(#18) · tabular-nums(#19) · 클릭 intent 유지(#20) · WRITE 없음(#21).

---

## 6. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke **24/24** ✅
* 관련 smoke: interactive 27 · statistics-prototype 17 · persistence 20 · approval-queue 20 · customer-hub 22 · work-completion 19 — 전부 ✅

---

## 7. 다음 작업 제안

* CS Dashboard Interactive UX Polish v0.1 · 마케팅팀 대시보드 v0 · Approval Queue UX polish · Godomall Board READ/WRITE Bridge.

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-dashboard-time-range-counter-motion-v0`, smoke 24/24)*
