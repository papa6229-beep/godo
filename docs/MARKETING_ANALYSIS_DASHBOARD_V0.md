# Marketing Analysis Dashboard v0 (2026-06-29)

> **종류**: UI(분석 화면) — `buildMarketingAnalysisFacts`(순수 helper)가 계산한 facts를 **표시만** 한다. 실제 WRITE 없음, 고도몰 API 호출 추가 없음, localStorage 변경 없음, 외부(GA/광고) 데이터 생성 없음.
> **한 줄**: 마케팅 분석팀 대시보드를 `DepartmentWorkspacePanel`의 마케팅팀 선택 시 렌더하도록 연결하고, KPI·분석 차원·AI 관찰 인사이트·requiredData(외부 연동 필요) 잠금 카드를 구성했다.
> **산출물**: `src/components/MarketingAnalysisDashboard.tsx` · `.css` · `docs/MARKETING_ANALYSIS_DASHBOARD_V0.md` · `scripts/smoke-marketing-analysis-dashboard-v0.mjs`(30/30) + 데이터 플러밍 최소 수정(`departmentDataService.ts`, `DepartmentWorkspacePanel.tsx`).

---

## 1. 작업 목적

`Marketing Analysis Facts Core v0`에서 만든 facts builder를 화면으로 연결한다. 상품팀이 "보는 것(대시보드)"과 "제어하는 것(채팅)"을 같은 데이터셋으로 묶은 것처럼, 마케팅도 먼저 **분석 대시보드(보는 것)**를 만든다. 대시보드는 새 계산을 만들지 않고 facts 결과만 표시한다(계산 권위는 facts builder).

## 2. 직전 facts core 결과 요약

`buildMarketingAnalysisFacts({ orders, products?, reviews?, inquiries?, period? })` → summary + 6차원(byMemberGroup/byOrderChannel/byCouponUsage/byRewardUsage/topProducts/topCategories/topBrands) + insights + requiredData + evidence + piiCheck. deterministic, PII 미포함, 가입전환/ROAS/방문전환은 미계산(requiredData).

## 3. 대시보드 연결 위치 / 데이터 흐름

* `DepartmentWorkspacePanel`의 중앙 컬럼: `team.id === 'marketing' ? renderMarketingData() : …`. 마케팅을 `dept-col-center-dashboard` 레이아웃 클래스에 포함.
* `renderMarketingData()`는 이미 로드된 `productData`(revenue + products)를 **재사용**(새 API 호출 없음) → `<MarketingAnalysisDashboard revenue products loading onRefresh />`.
* 컴포넌트가 `revenue.orders`(RevenueOrderLite)를 facts 입력 형태로 어댑트(state 중첩 + enrichment 필드) 후 `buildMarketingAnalysisFacts` 호출.

### 데이터 플러밍 최소 수정 (필수)
`fetchRevenue`가 만드는 프론트 `RevenueOrderLite`가 enrichment 필드를 누락하고 있어, 마케팅 지표가 비게 되는 문제가 있었다. 서버 route는 이미 각 `RevenueOrder`에 해당 필드를 반환하므로, **프론트 매퍼만** 다음을 추가로 통과시키도록 보강했다(전부 optional·PII 아님):
`isFirstPurchase · memberGroupName · memberGroupCode · discountSummary{hasCoupon,totalCouponDiscountAmount,totalDiscountAmount} · discountAmount · useMileageAmount · useDepositAmount · rewardUseAmount`.
→ 상품팀/CS팀이 쓰는 `RevenueResult`에 optional 필드만 추가 → 기존 화면 무회귀.

## 4. 사용한 facts builder

`buildMarketingAnalysisFacts` (대시보드 내부 신규 집계 없음 — smoke가 `.reduce(` 직접 집계 부재 검증).

## 5. 구현한 기간 필터

전체 · 오늘 · 최근 7일 · 최근 30일 · 이번 달 · 지난 달 · 올해 · 직접 선택(시작일/종료일/적용/초기화). preset 변경 또는 custom 적용 시 facts가 재계산되어 KPI/차원/insight가 함께 갱신된다.

## 6. 표시한 KPI

총매출 · 주문수 · 객단가 · 첫구매 매출 · 재구매 매출 · 쿠폰 사용 주문 · 총 할인액 · 리워드 사용액 (`useAnimatedNumber` 카운터 재사용, reduced-motion guard 존중, tabular-nums).

## 7. 구현한 분석 블록

회원그룹별 매출 · 주문채널별 매출 · 쿠폰 사용/미사용 비교 · 마일리지/예치금 사용 비교 · 상품 매출 TOP · 카테고리 매출 TOP · 브랜드 매출 TOP. 각 행: 라벨 · 매출 · 주문수 · 객단가 · 비중 + bar. 브랜드 메타 부족 시 "브랜드 미연동 (상품 메타데이터 부족)"으로 graceful 표시(외부필요 분류 아님).

## 8. insight panel 구현 내용

`facts.insights`를 카드로 렌더: severity 배지(관찰/긍정/주의) · title · summary · recommendedNextAction · evidenceIds → `facts.evidence`에서 라벨/값 조회해 "근거"로 표시. **인과 단정 금지**(facts builder가 "높게 나타났습니다" 관찰 표현만 생성, smoke가 때문에/덕분에 부재 검증).

## 9. requiredData panel 구현 내용

`facts.requiredData`를 잠금 카드로 렌더: headline = unlocks(가입→구매 전환율/방문→주문 전환율/상품조회→구매/장바구니 이탈률/ROAS/광고 CTR/GA4/SNS) · "필요 데이터: {label} — {reason}" · "외부 연동 필요" 태그. **0/추정값 절대 미표시.**

## 10. 계산하지 않은 지표

가입→구매 전환율 · 방문→주문 전환율 · 상품조회→구매 전환율 · 장바구니 이탈률 · ROAS · 광고 CTR · GA4 행동 · SNS 성과. summary/차원에 필드 자체 없음 → requiredData 안내만.

## 11. PII 표시 금지 확인

* 대시보드는 집계/그룹/차원 라벨(`memberGroupName`, 채널/카테고리/상품명, 금액)만 렌더. 고객명/전화/이메일/주소/수신자 미표시.
* `memberKey`도 화면에 렌더하지 않음(어댑터에서도 제거 — facts builder가 미사용).
* `facts.piiCheck.containsPii === false` + smoke가 컴포넌트 소스에 PII 필드 접근 부재 검증.

## 12. 인과관계 단정 금지 원칙

"쿠폰 때문에 매출이 올랐다"(X) → "쿠폰 사용 주문의 객단가가 높게 나타났다"(O). insight는 관찰/집중/확인 필요 표현만.

## 13. 실제 WRITE 없음

신규 컴포넌트(표시 전용) + 데이터 매퍼 optional 필드 + 문서 + smoke. route/네트워크 신규 호출 없음(기존 revenue 재사용), localStorage 변경 없음, 고도몰 WRITE 없음.

## 14. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-marketing-analysis-dashboard-v0` ✅ 30/30
* `smoke-marketing-analysis-facts-core-v0` ✅ 34/34 · `smoke-marketing-synthetic-commerce-enrichment-v0` ✅ 32/32 · `smoke-marketing-data-coverage-audit-v0` ✅ 30/30 · `smoke-synthetic-commerce-universe` ✅ 26/26 (회귀 없음).

## 15. 다음 작업 후보

1. **marketingTeamChatFacts v0** — 우측 팀장 채팅을 이 facts에 연결(상품팀 패턴: 코드가 숫자, AI는 설명). 대시보드와 채팅이 동일 facts 공유.
2. **카탈로그 라벨 연동** — category/brand 코드 → 이름(`fetchCatalog` lookup) 주입해 차원 라벨 가독성 향상(현재 코드/미연동).
3. **마케팅 기획·실행팀 분리** — 분석팀(현재) + 기획/실행팀(캠페인 후보 → 승인 큐) placeholder 확장.
4. **승인 큐 연계** — insight의 recommendedNextAction을 캠페인 후보로 승인 큐(HITL)에 제출(WRITE는 승인 후).
5. **Member READ Contract v0** — 가입일/성별 → requiredData(가입 코호트/연령) 해제.

---

*문서 끝. (작성 2026-06-29, 브랜치 `feature/marketing-analysis-dashboard-v0`, dashboard smoke 30/30, 회귀 없음)*
