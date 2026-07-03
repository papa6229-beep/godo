# 부서 업무 관장 3열 폭 재조정 (V0)

> 2026-07-03 · 사장님 지시(자연어) 미세수정. 레이아웃 CSS만.

## 지시
좌측 "팀 선택" 컬럼이 텍스트 대비 좌우 폭을 과하게 씀 → 최대한 좁히고, 그 공간을
우측 채팅창에 줘서 채팅창을 넓게. 모든 팀 대시보드 공통.

## 수정 (`DepartmentWorkspacePanel.css` — CSS만)
`.dept-workspace` 그리드: `22% 56% 22%` → **`210px minmax(0, 1.9fr) minmax(0, 1fr)`**.
- 좌측: 콘텐츠에 맞춘 고정 210px(팀 카드/설명 텍스트가 깔끔히 들어가는 최소 폭).
- 우측 채팅: 기존 22%(~418px) → 약 1fr(~570px+)로 확대.
- 중앙: 남는 폭.
- `.dept-workspace` 그리드는 전 팀 공통 wrapper라 상품·CS·마케팅·총괄 모두 동일 적용.
- 좁은 화면 breakpoint(1열 스택)는 기존 유지.

## 검증
- `vite build` 그린. Playwright로 로컬 dev 부서 업무 관장 화면 확인 —
  좌측 좁아지고 채팅창 넓어진 것 육안 확인(중앙은 로컬 dev라 데이터 없음 표시 = 정상).
- 로직/서비스/데이터 무변경(CSS 한 줄).

## 위치
- 변경: `src/components/DepartmentWorkspacePanel.css`.
