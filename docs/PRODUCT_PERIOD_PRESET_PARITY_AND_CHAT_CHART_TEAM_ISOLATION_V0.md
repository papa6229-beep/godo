# 상품팀 기간 프리셋 CS 통일 + 팀별 채팅 차트 독립 (V0)

> 2026-07-03 · 사장님 지시(자연어) 미세수정 2건. 완료보고서.

## 지시
1. 상품팀 KPI 위 조건을 **CS팀과 동일 프리셋**으로: 전체 / 오늘 / 최근7일 / 최근30일 / 이번달 / 직접선택.
2. **팀별 채팅창 독립** — 상품팀에서 채팅 그래프를 요청하면 CS·마케팅 등 다른 팀 채팅창에도
   같은 질문·답·그래프가 노출되던 버그 수정. 각 팀 채팅은 각 팀만.

## 수정 1 — 기간 프리셋 CS 통일 (`ProductTeamDashboard.tsx`)

기존 상품팀 기간은 "집계 단위"(전체/월별/주간별/일별/직접) 모델이라 CS와 어긋났음.
CS(`csDashboardTimeFilter.ts`)와 동일한 **기간 창** 프리셋으로 교체:

- 상태 `timeMode`(+`customGran`) → `periodPreset: 'all'|'today'|'7d'|'30d'|'month'|'custom'`.
- `effStart/effEnd`를 프리셋에서 계산. **상대기간(오늘·7·30일·이번달)은 데이터 최신 주문일(dataRange.max) 기준**
  — 합성/과거 데이터라 실제 '오늘'을 쓰면 빈 화면이 되므로(기존 상품팀 windowFilter와 동일 취지).
- **집계 단위(trendGran)는 프리셋에서 자동 도출**: 오늘/7·30일/이번달→일, 전체→월, 직접→기간 폭(>90일 월·>21일 주·그 외 일).
  → 사용자가 단위를 따로 안 골라도 됨(CS와 동일 UX).
- 날짜 계산은 **UTC 자정 기준**(`T00:00:00Z`)으로 통일 — 로컬 파싱 후 `toISOString()`이 +9 시간대에서 하루 밀리는 버그 예방. (`node`로 7일 창 = 2025-04-28~05-04 확인)
- KPI/추이/도넛/순위가 이 하나의 `periodPreset`을 공유(기존 공유 구조 유지). 필터 배지·"적용 범위" 표기도 프리셋 반영.

## 수정 2 — 팀별 채팅 차트 독립 (`DepartmentWorkspacePanel.tsx`)

원인: 채팅 **텍스트 로그**는 이미 팀별 분리(`chatLog[teamId]`, `departmentChatMemory`)였으나,
**엔진 결과 차트**(`engineChart`)가 **단일 state**라 팀을 바꿔도 채팅 열에 그대로 남았음.
차트에 제목·요약·그래프가 다 담겨 있어 "질문·답·그래프가 다른 팀에도 노출"처럼 보였음.

- `engineChart`(단일) → `engineChartByTeam: Record<TeamId, artifact|null>`.
- 엔진 결과: `setEngineChartByTeam(prev => ({ ...prev, [teamId]: art }))`.
- 렌더/초기화: 선택 팀 것만 — `engineChartByTeam[selectedTeamId]`.
- 마케팅은 원래대로 중앙 대시보드(`marketingChartArtifact`, team===marketing 렌더 게이트)라 이미 격리됨 — 무변경.

## 검증
- `tsc -b` / `lint` / `vite build`: 그린. API 함수 수 불변(≤12). 서비스/계산 로직 무변경.
- smoke: parity **20/0**, source-of-truth **23/0**, commerce-query-plan **30/0**,
  product-catalog-facts **14/0**, product-chat-grounding **13/0**.
  default-state-ux test 24(git status 기반 스코프 가드)는 커밋 후 트리 clean → 통과.

## 남은 확인 — 배포 눈검수
로컬 dev엔 실데이터 API 없음. 배포 후:
1. 상품팀 기간 프리셋(전체/오늘/최근7일/최근30일/이번달/직접)이 KPI·그래프에 반영되는지.
2. 상품팀에서 채팅 그래프 요청 후 CS·마케팅 채팅창에 안 넘어가는지(각 팀 독립).

## 위치
- 변경: `src/components/ProductTeamDashboard.tsx`, `src/components/DepartmentWorkspacePanel.tsx`.
