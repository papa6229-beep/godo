# CS Chat Inquiry Detail Context Patch v0

> **작성일**: 2026-06-26 · **브랜치**: `fix/cs-chat-inquiry-detail-context-v0`
> **코드**: `src/services/departmentChatFacts.ts` + `DepartmentWorkspacePanel.tsx` · **smoke**: `scripts/smoke-cs-chat-inquiry-detail-context.mjs`(15/15)

## 1. 문제 상황
CS팀 채팅이 "가장 최근에 온 미답변 문의 알려줘"에 대해 전체/미답변/긴급 **요약 숫자**는 읽었지만, 개별 문의는 "현재 CS 데이터가 실시간 연결되어 있지 않아 직접 조회할 수 없습니다. 고도몰 CS 관리자에서 확인해 주세요"라고 부적절하게 답했다.

## 2. 원인
CS context가 `bundle.csTeam.customerIssuePacket`(summary packet)만 담았고, **개별 문의/리뷰 detail(createdAt/title/excerpt 등)이 context에 없었다**. 그 detail은 이미 `revenue.universeAux.inquiries/reviews`(safe 141건/167건)로 공급되고 있었으나 채팅 context에 연결되지 않았다.

## 3. safe inquiry detail context 정책
`buildDepartmentChatContext('cs', bundle, csDetail)` — 3번째 인자 `csDetail`(universeAux 기반)로 safe shortlist를 추가한다. 모든 항목은 **safe fields만**(연락처/이름/주소/계좌/배송메모 없음). CS fake contact 원본은 이 목록에 **절대 섞지 않는다**(응대 시뮬레이션 기능 전용).

## 4. shortlist 구조 (각 최대 5건, createdAt 내림차순)
- **최근 미답변 문의**: status ∈ unanswered/pending/open/미답변/needs_human
- **긴급 문의**: urgency ∈ high/urgent/긴급
- **최근 문의**: 전체 최신순
- **저평점/부정 리뷰**: rating ≤ 2 또는 sentiment negative
- **CS 이슈 상품**: `csIssueTopProducts` packet 재사용(상품명 해석)
- 항목 필드: `inquiryId/createdAt/status/urgency/topic/goodsNo/productName/title/excerpt` (review: `rating/sentiment/topic/goodsNo/productName/excerpt`). productName은 orders의 goodsNo→goodsName 맵으로 해석.

## 5. PII guard
- shortlist/CS context: 고객명/전화/이메일/주소/계좌/배송메모 **없음**(smoke 5·10).
- product/marketing/manager context: inquiry detail/PII 없음(smoke 13).
- CS fake contact는 csTeam.fakeContacts에만(건수+표식), 이 patch의 목록엔 미포함.

## 6. answerGuidance 수정
- "가장 최근 미답변 문의/최근 문의/긴급 문의/미답변 목록" 질문 → 위 목록 기준으로 개별 항목 답변.
- safe 목록이 있으면 "조회할 수 없다"·"고도몰 CS 관리자에서 직접 확인" 1차 답변 **금지**.
- 보조로만 "이 목록은 Commerce Universe synthetic safe data 기준 — 실제 고도몰 실시간 CS 원장은 별도 확인 필요" 허용.

## 7. 정상 답변 예시
"가장 최근에 온 미답변 문의" → `1. [높음 · refund] 모자 — 접수 2026-06-25 14:20 · 상태 미답변 · 제목 환불 처리 문의 · 요약 결제 취소 후 환불 진행 상태 확인` … (고객 개인정보 미표시).

## 8. fallback 정책
- safe 목록이 비었을 때만: "조건에 맞는 문의를 찾지 못했습니다" + 요약 수치. (CS 미연결/조회불가/관리자 확인 문구 금지.)

## 9. 다음 단계 — CS Workspace Response Simulation v0
- csTeam.fakeContacts(가상 PII)로 응대 초안 생성(가상 표시). 개별 문의 detail + 가상 contact를 묶어 답변 시뮬레이션.
