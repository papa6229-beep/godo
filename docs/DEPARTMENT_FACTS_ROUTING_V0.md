# Department Facts Routing v0

> **작성일**: 2026-06-26 · **브랜치**: `feature/department-facts-routing-v0`
> **코드**: `src/services/departmentFactsRouting.ts` (Analytics Query Engine 위) · **smoke**: `scripts/smoke-department-facts-routing.mjs`(12/12)

## 1. 역할 구조 (패치 기준)
"통계 생산 → 이슈 정리 → 마케팅 분석 → 총괄 승인"

| 팀 | 역할 | 산출 |
|---|---|---|
| **상품팀(product)** | 매출/상품 통계 **공급자** (분석·기획 안 함) | `salesStatisticsPacket` + `handoffToMarketing` |
| **CS팀(cs)** | 고객 이슈(문의/리뷰/클레임) 통계 **공급자** | `customerIssuePacket` + `handoffToMarketing` + `fakeContacts`(CS 전용) |
| **마케팅팀(marketing)** | 상품·CS 자료 + 직접 facts로 **분석·기획·제안** | `received*` + `directMarketingFacts` + `recommendationCandidates` |
| **총괄(manager)** | 보고+제안 → **승인/우선순위** | `executiveSummary` + `teamReports` + `approvalQueueCandidates` |

- **숫자는 Analytics Query Engine이 계산**(AI 생성 금지). **분석 제안은 마케팅팀만** 생성.

## 2. 핸드오프 흐름
```
Product Team Facts ─(handoffToMarketing)─┐
                                          ├─▶ Marketing Team (분석/제안) ─(recommendationCandidates)─▶ Manager (approvalQueueCandidates)
CS Team Facts ─────(handoffToMarketing)──┘
```

## 3. 팀별 metric pack (역할 경계)
- **상품팀**(sales/product/category/brand만): revenue·orderCount·unitCount·averageOrderValue·salesGrowthRate(/month), productRevenue·productUnitCount(/product), categoryRevenue(/category), brandRevenue(/brand), revenueShare(/category). **review/inquiry/campaign/customerSegment 제외.**
- **CS팀**(문의/리뷰/클레임): inquiryCount·inquiryTopicBreakdown·unansweredInquiryCount·urgentInquiryCount, reviewAverageRating·reviewSentimentShare·reviewTopicBreakdown, claimRate·refundRate, csIssueTopProducts·refundRiskProducts·reviewRiskProducts. **campaign/마케팅 제안 제외.**
- **마케팅팀**(직접 facts): customerCount·returningCustomerCount·repurchaseRate·purchaseFrequency, customerSegmentRevenue(/segment), paymentMethodRevenue(/payment), orderChannelRevenue(/channel), periodComparison. + 상품/CS handoff.
- **총괄**(요약): revenue(/month)·repurchaseRate·claimRate·inquiryTopicBreakdown.

## 4. 마케팅 제안(recommendationCandidates) — rule-based, 결정적
- 환불 위험 상품 광고 축소 검토(CS refundRiskProducts 기반)
- 리뷰 좋은데 매출 낮은 상품 캠페인 후보(CS reviewRiskProducts ∩ 상품팀 productRevenue 하위)
- 재구매 유망 상품군 리텐션 캠페인(repurchaseRate 기반)
- ROAS/캠페인 효율 분석은 **추가 데이터 필요**(adSpend·campaignCalendar·trafficEvents) — `requiredData` 반환
- 각 후보 → 총괄 `approvalQueueCandidates`(`requiresApproval:true`)로 전달.

## 5. PII 경계
- **fake PII(이름/전화/주소)는 CS팀 `fakeContacts`에만**. 상품팀/마케팅팀/총괄 packet에는 없음(smoke 10 검증: 가상고객/010-0000/샘플로 미등장).
- 분석은 가명 memberKey·segment만.

## 6. 답변 톤(채팅 연결 시)
- 상품팀: 통계 중심, "이 자료는 마케팅팀 분석에 전달할 수 있습니다."
- CS팀: 이슈 정리 중심, "이 CS 이슈는 마케팅팀에 전달할 수 있습니다."
- 마케팅팀: 분석+기획+제안(숫자는 엔진 결과 근거, 없는 데이터는 필요 데이터 안내).
- 총괄: 팀 보고 요약 + 다음 액션/승인.

## 7. 채팅 연결 메모
- 본 v0는 **라우팅 엔진 + 번들 빌더 + smoke**가 deliverable. `buildDepartmentFactsBundle(dataset, opts)` / `buildTeamFactsPackets(team, dataset)`.
- 실제 부서 채팅(`departmentChatService`/`DepartmentWorkspacePanel`) 연결은 데이터셋 주입(orders + Universe customers/reviews/inquiries 라우팅)을 정리한 뒤 다음 단계에서 wiring. (프론트는 현재 orders만 보유 → 마케팅/CS의 customers/reviews/inquiries는 Universe를 프론트로 라우팅하거나 서버 facts로 공급 필요.)

## 8. 검증
smoke 10항목(역할 경계·핸드오프·제안 단독·승인 전달·PII 경계) + 외부데이터 안내 + 결정성 = 12/12.

## 9. 다음 단계
- ✅ **Commerce Universe Aux Data Routing v0 완료** — `buildDepartmentFactsBundleFromUniverse(input)`로 aux(customers/reviews/inquiries + CS 전용 contacts)를 주입해 번들 생성(`docs/COMMERCE_UNIVERSE_AUX_DATA_ROUTING_V0.md`).
- ✅ **Department Chat Wiring v0 완료** — `departmentChatFacts.buildDepartmentChatContext(team, bundle)`로 각 팀 채팅이 자기 슬라이스만 사용(`docs/DEPARTMENT_CHAT_WIRING_V0.md`).
- Analytics Result Modal(chartHint 기반).
- Approval Queue 실연결(마케팅 제안 → 사람 승인 → 실행).
