# CS Inquiry Detail Panel Enrichment v0

> **작업명**: `CS Inquiry Detail Panel Enrichment v0`
> **브랜치**: `fix/cs-inquiry-detail-panel-enrichment-v0`
> **상위 컨텍스트**: `docs/CS_DASHBOARD_KPI_POPUP_UX_REVISION_V0.md`(KPI/팝업) · `docs/CS_INQUIRY_ASSOCIATED_ORDER_CONTEXT_PATCH_V0.md`.
> **성격**: CS 팝업 우측 상세 패널을 "분류 요약"에서 **실제 처리 가능한 관리자 상세화면**으로 확장.

---

## 1. 목적

리스트 항목 클릭 시 우측 상세가 문의/리뷰 원문 + 주문 정보 + 고객 정보 + 처리 상태/메모/이력 + AI 초안/응답 액션까지 보여주도록 확장. 운영자가 한 화면에서 "누가/어떤 주문/무슨 내용/AI 초안 맞는지/직접 답변/내부확인"을 판단.

---

## 2. 산출물 / 변경

### 신규
* `scripts/smoke-cs-inquiry-detail-panel-enrichment.mjs` — **19/19 통과**.
* `docs/CS_INQUIRY_DETAIL_PANEL_ENRICHMENT_V0.md`(본 문서).

### 수정
* `src/services/csTeamDashboardFacts.ts`
  * `buildCsDetailItem(item, {orders, contacts?, goodsNames?})` + 타입(`CsDashboardDetailItem`/`CsDashContact`/`CsDetailOrderItem`) — 단건 enriched detail(원문/주문/주문상품/고객).
  * KPI item 보강: 문의 `status`/`excerpt`, 리뷰 `orderNo`(고객 링크용). bulk facts 구조/불변식은 그대로.
* `src/components/CsTeamDashboard.tsx` — 팝업 우측 상세를 **6섹션**(문의/리뷰 내용 · 주문 정보 · 고객 정보 · 처리 상태/메모/이력 · AI 초안/응답 액션)으로 재구성. 처리 단계 select, 내부 메모, 처리 이력 placeholder, 직접 답변 작성(local).
* `src/components/CsTeamDashboard.css` — 상세 섹션 스타일.

> **미변경**: WRITE/발송/전화/알림 없음. product/marketing/manager 무변경.

---

## 3. 상세 패널 6섹션

1. **문의/리뷰 내용**: 제목·상품·유형·상태(또는 평점/감성)·접수/경과·처리분류 + **safe 원문(excerpt)**.
2. **주문 정보**: 주문번호·주문일·결제상태·주문/상품/배송 금액·클레임(완료여부 미확정) + **주문 상품 목록**(상품/수량/금액). 미연결 시 "연결된 주문이 없습니다. 주문번호 확인이 필요합니다."
3. **고객 정보**: 회원구분·회원ID·고객명·연락처·이메일·최근 주문수. **fake contact는 "가상 고객(synthetic/fake)" 배지** 표시.
4. **처리 상태/메모**: 처리 단계 select(미확인~처리 완료/보류) + 내부 메모(local) + 처리 이력 타임라인(접수→분류→초안 생성, placeholder).
5. **AI 초안/응답 액션**: AI 초안 보기 / 다시 만들기 / 직접 답변 작성(local textarea). "v0: 미리보기/메모만 — 실제 발송·등록·전화·알림 없음".

(좌측 리스트 + 우측 상세 구조는 유지.)

---

## 4. 고객정보 PII 정책 (핵심 — 경로 분리)

| 경로 | 고객 PII |
|---|---|
| **CS 상세 UI**(buildCsDetailItem + contacts 전달) | 표시 가능(처리 목적) — fake는 synthetic 배지 |
| bulk facts(KPI/breakdown/list) | **없음** |
| AI context(composer/runtime/chat) | **없음** |
| product/marketing/manager | **없음** |
| docs/smoke 기대출력 | real PII 없음, fake도 리터럴 박제 안 함(구조 검증) |

* 고객 링크: inquiry/review `orderNo` → order `memberKey` → fake contact(`csOnlyFakeContacts`). 고객 정보는 **`buildCsDetailItem`에 contacts가 주어졌을 때만** 채워짐 → contacts 미전달(=AI/분석 경로)이면 `detail.customer` 없음(smoke #10).
* bulk `CsKpiRevisionFacts`에는 customer 필드 자체가 없음 → smoke #9·#18로 PII/memberKey 부재 검증.

---

## 5. 상세 결과 (smoke 샘플)

```
order: { orderNo 2605291252000011 · 결제완료 · 62,500원(상품 60,000 · 배송 2,500) ·
         items:[에어 파워 드라이기 / 1개 / 60,000원] }
customer: isSynthetic=true · name 있음 · recentOrders=2   (CS 상세 UI 경로에서만)
contacts 미전달 시 → customer 없음
주문 미연결 문의 → order.items 비어있음 · customer 없음
```

---

## 6. 안전 검증 (smoke)

* CS 상세 UI 고객정보 표시(#7) · synthetic 표식(#8) · **AI/분석 경로 customer 차단(#10)** · bulk facts PII/memberKey 부재(#9·#18).
* 주문 금액/배송비/상품목록(#5·#6) · review 주문 연결(#14) · KPI 합계 불변식 유지(#17) · 기존 facts 무회귀(#19).
* 실제 WRITE/발송 없음(액션은 local state/미리보기만).

---

## 7. 한계 / 다음 작업 제안

* 처리 메모·이력·직접답변·처리단계는 **local state(미영속)**. 영속화/실제 등록은 Approval Queue + WRITE 단계.
* 원문은 safe excerpt만(real 본문 마스킹은 Board READ 시). 옵션명/송장번호는 Lite 미보유 → 미표시.
* **다음 작업 후보**:
  1. **CS Draft → Approval Queue HITL**: 상세의 "직접 답변/AI 초안" → 승인 → 등록(WRITE). 처리 단계·이력 영속화.
  2. **RevenueOrderLite paymentDate/cancelDate(+옵션/송장) 확장**: 주문 정보 정밀화.
  3. **Board READ v0**: 실제 문의/리뷰 원문·답글 상태·고객 회원정보(서버 마스킹) 연동.

---

## 8. 검증

* `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅(✓ built)
* 신규 smoke `smoke-cs-inquiry-detail-panel-enrichment.mjs` **19/19** ✅
* 관련 smoke: kpi-popup-revision 19 · dashboard-data-layout 20 · runtime-wiring 19 · composer-grounding 22 · associated-order 17 · dept-chat-wiring 16 · aux-routing 18 — 전부 ✅

> *문서 끝. (작성: 2026-06-27, 브랜치 `fix/cs-inquiry-detail-panel-enrichment-v0`, smoke 19/19)*
