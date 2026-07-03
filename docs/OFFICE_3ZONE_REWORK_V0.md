# 오늘의 운영 3영역 개편 (좌 연동 · 중앙 지시+통계 · 우 크리티컬) V0

> 2026-07-03 · 사장님 상세 스펙 반영. 완료보고서(4개 커밋 묶음).

## 스펙 → 처리

### 좌측 — 부서 관제 보드 (구조 유지 + 활동 원장 연동) `c712ee3`
- 카드 4칩(진행/완료/전달/승인)을 레거시 lastRun → **활동 원장 teamSummary**로 연동.
  진행=오늘 자동업무 수, 완료=완료 수, 전달=팀 간 전달, 승인=승인 대기(주의). 상태/최근활동도 원장 기반. (manager→hq 매핑)
- **"부서 보기"→"부서 업무 확인"** 개명. 클릭 시 **DeptActivityModal**(원장 기반: 요약+오늘/전체+활동 목록, 읽기 전용)로 교체(레거시 DepartmentCommandPanel 대체). 칩 클릭도 이 모달로. 드릴다운(lastRun) 제거.

### 우측 — 팀별 "승인·확인 필요" 크리티컬만 `ed884b0`
- 전사 브리핑을 팀별 오늘 크리티컬만으로 재작성: ① 승인 대기/진행 자동업무(원장) ② 미처리 팀 간 요청. 팀별 그룹, 읽기 전용. 좌측(팀 상태)과 중복 제거.

### 중앙 — Quick Task Add 제거 + 팀 지시/파일 `cf4ba4f` + 통계/그래프 `(이 커밋)`
- **Quick Task Add 제거** → **"📣 팀에 지시" 바**(HqDirectiveComposer): 팀 선택 + 메시지 + **엑셀·이미지 파일 첨부** + 보내기. HQ→팀 inbox 발송 + 활동 원장(message_sent) 기록. 파일=팀 메시지 첨부(base64) 재사용.
  - `ChatConsole`에 `quickBarSlot` prop(있으면 Quick Task Add 대체, 타 탭 무영향).
- **통계/그래프 요청**(이번 커밋): 부서 채팅과 동일하게 `ChatConsole.handleSend`가 입력을 먼저 **`answerCommerceQuestion`(Commerce Query 엔진)**으로 시도 → 처리되면 답변 텍스트 + **`MarketingChartSpecPanel` 그래프**를 채팅에 표시, 아니면 기존 콘솔(controlChatService)로 폴백.
  - 데이터: `OfficeView`가 `fetchRevenue`로 커머스 데이터 로드해 `commerceData` prop 전달. 로컬 dev엔 API 없어 null → 폴백(콘솔 기본 응답).

## 검증
- `tsc -b`/`lint`/`vite build` 그린(4커밋 모두).
- Playwright: 좌측 카드 원장 반영·"부서 업무 확인" 모달 / 우측 크리티컬 / 중앙 "팀에 지시" 발송(HQ→product 메시지+원장) / **중앙 채팅 폴백 정상**(커머스 데이터 없는 로컬에서 콘솔 응답 유지, 크래시 없음) 확인.
- **통계/그래프는 배포(커머스 데이터)에서 눈검수** — 부서 채팅과 동일한 검증된 엔진(answerCommerceQuestion + MarketingChartSpecPanel) 그대로 호출.

## 최종 오늘의 운영
| 좌 | 중앙 | 우 |
|---|---|---|
| 부서 관제 보드(원장 연동) · "부서 업무 확인" 모달 | HQ 콘솔 채팅(통계/그래프) + 팀 지시·파일 바 | 팀별 승인·확인 필요(크리티컬) |
최고관리자 읽기·지시 중심. 팀 업무 실행은 부서 업무 관장.

## 다음
- 4단계 **역할 전환기**(총괄/팀장 가시성 스코프).

## 위치(이번 커밋)
- 변경: `components/ChatConsole.tsx`(commerce query+chart), `components/ChatConsole.css`, `components/OfficeView.tsx`(fetchRevenue→commerceData).
