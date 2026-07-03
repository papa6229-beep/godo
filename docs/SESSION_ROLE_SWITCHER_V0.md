# 역할 전환기 (세션 뷰어 스코프) V0 — 배관 4단계

> 2026-07-03 · 역할 기반 재편 배관 4단계. 완료보고서.

## 목표
"지금 누구로 보는가"에 따라 화면을 스코프. **총괄 관리자 = 전체(오늘의 운영·부서 전체·설정), 팀장 = 본인 팀 보드만.**
1단계는 localStorage 데모 전환. **진짜 로그인/권한 격리는 2단계(백엔드).**

## 구현
- `services/sessionRole.ts`: `ViewerRole = 'hq'|'product'|'cs'|'marketing'`, VIEWER_ROLES(라벨),
  load/save/subscribe(같은 탭은 CustomEvent, 타 탭은 storage 이벤트), isHqRole/roleMeta.
- `MainLayout`: 헤더 중앙에 **역할 전환기 드롭다운**(👤). 역할에 따라 상단 탭 게이팅 —
  총괄=전체 탭, 팀장=**부서 업무 관장만**(오늘의 운영·AI 직원·운영일지·관리자 설정 숨김).
  팀장인데 다른 탭이면 부서 업무 관장으로 강제 이동.
- `DepartmentWorkspacePanel`: 역할 구독. 팀장이면 좌측 팀 목록을 **본인 팀 하나로 제한 + 자동 선택**,
  헤더 "부서 선택"→"내 팀". 역할 변경(구독 콜백)에서 선택 팀 동기화.

## 검증
- `tsc -b`/`lint`/`vite build` 그린.
- **Playwright E2E**: 총괄→상품관리팀장 전환 시 상단 탭이 "부서 업무 관장" 하나로 축소·자동 이동,
  좌측 "내 팀"에 상품관리팀만 표시·자동 선택. 총괄로 되돌리면 전체 탭 복원 확인.

## 다음 (배관 후 실사용 준비)
5. **2단계 백엔드** — 실제 로그인/권한/실시간·데이터 격리(팀 소통·원장·역할 모두 서버로).
   그때 이 역할 전환기는 로그인 세션으로 대체(데모 스위처 제거 또는 관리자 임퍼소네이트용으로 유지).
- (후속) 총괄이 팀 보드도 읽기 원하면 별도 권한, 팀장의 타 팀 메시지 발신 정책 등 세부 권한 정의.

## 위치
- 신규: `services/sessionRole.ts`.
- 변경: `components/MainLayout.tsx`, `components/MainLayout.css`, `components/DepartmentWorkspacePanel.tsx`.
