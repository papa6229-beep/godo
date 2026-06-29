# Marketing Dashboard Dynamic Smart Chart Render v0 (2026-06-29)

> **종류**: UI 렌더링 연결 — 새 계산 엔진/데이터 생성 없음, 실제 WRITE 없음, 고도몰 API 호출 추가 없음, localStorage 변경 없음.
> **한 줄**: 우측 마케팅 채팅이 만든 **chartSpec artifact**를 중앙 마케팅 분석 대시보드의 smart chart 영역에 실제 렌더하고, 그래프 아래 AI 분석 리포트도 해당 narrative로 우선 표시한다.
> **산출물**: `MarketingAnalysisDashboard.tsx`(chartSpec 렌더) · `.css` · `DepartmentWorkspacePanel.tsx`(prop 연결) 수정 + 본 문서 + `scripts/smoke-marketing-dashboard-dynamic-smart-chart-render-v0.mjs`(30/30).

---

## 1. 작업 목적 / 기존 문제

직전 작업까지 마케팅 채팅 런타임은 `chartSpec artifact`를 만들어 `DepartmentWorkspacePanel`의 `marketingChartArtifact` state에 보관했지만, **중앙 대시보드는 이 artifact를 렌더하지 못했다.** 이번 작업은 "채팅 질문 → 중앙 그래프 반영" 흐름을 완성한다. 계산은 기존 엔진 결과(chartSpec)를 **표시만** 한다(새 계산 없음).

## 2. 새 흐름

```
우측 마케팅 채팅 질문 → runMarketingChartRequest → chartSpec artifact (state)
→ DepartmentWorkspacePanel이 marketingChartArtifact/onClear prop으로 MarketingAnalysisDashboard에 전달
→ artifact 있으면: 중앙 smart chart = chartSpec 그래프, AI 리포트 = narrative
→ artifact 없으면: 기존 focus chip 기반 smart chart + facts.insights 리포트 그대로
```

## 3. prop 연결

`MarketingAnalysisDashboard` Props에 optional 추가: `marketingChartArtifact?: MarketingChatChartArtifact | null`, `onClearMarketingChartArtifact?: () => void`. 패널 `renderMarketingData`에서 state/clear 핸들러를 전달. (`MarketingChatChartArtifact` 타입은 `marketingChatChartSpec.ts`에서 import.)

## 4. artifact 없을 때 fallback 정책 (기존 유지)

분석 지표 선택 칩(`marketing-focus-selector`) · compact KPI · focus 기반 smart chart · facts.insights AI 리포트 — 전부 그대로. focus chip 기능 삭제하지 않음.

## 5. artifact 있을 때

* smart chart 영역 → `MarketingChartSpecPanel`: "채팅 질문 기반 분석 결과" 배지 + `chartSpec.title`/`subtitle` + chartType별 그래프 + "기본 분석으로 돌아가기" 버튼(`onClearMarketingChartArtifact`).
* AI 리포트 → `MarketingNarrativeReport`: `narrative.title/summary/bullets/evidence/warnings/requiredData`.
* dev/smoke marker: `data-marketing-dynamic-chart-active/intent/type/available`.

## 6. 지원 chartType

| chartType | 렌더 |
|---|---|
| `groupedBar` | 버킷별 series 가로 막대(값 + 주문수 보조) |
| `line` | CSS/SVG polyline(series별 선) + 마지막 point 값 라벨 |
| `rankedBar` | series 합계 정렬 상위 8개 가로 막대 |
| `unsupported` | 잠금 패널 + requiredData(0/추정 미표시) |
| `stackedBar` → groupedBar / `donut` → rankedBar / `table` → compact table | graceful fallback |

외부 차트 라이브러리 미추가(CSS/SVG만). 버킷이 12개 초과면 최근 12개만 표시 + "최근 N개 구간만 표시" 문구.

## 7. unsupported 렌더

ROAS/방문/상품조회/장바구니 등 → `chartSpec.available=false` → 그래프 대신 "현재 계산하지 않습니다 / 외부 데이터 연결 필요" + requiredData 칩. **0/추정값 미표시.**

## 8. metric formatting

`chartSpec.unit` 기준: `krw`→원, `count`→건, `percent`→%, `mixed`→원화 기본. 기존 `won()` 재사용.

## 9. AI 분석 리포트 narrative 우선 표시

artifact 있을 때 facts.insights 대신 `narrative`(title/summary/bullets/evidence chips/warnings/requiredData) 표시. artifact 없을 때 기존 facts.insights 리포트 유지. **chartSpec JSON을 사용자에게 그대로 노출하지 않음** — narrative 필드만 사용자 친화적으로.

## 10. JSON 미노출 / PII / 인과관계

* `JSON.stringify(chartSpec/artifact)` 화면 노출 없음(smoke 19).
* name/phone/email/address/memberKey 직접 렌더 없음(집계 라벨·버킷 라벨·숫자만).
* 때문에/덕분에/원인입니다 부재. narrative caption "관찰값이며 인과관계를 단정하지 않습니다".

## 11. 빈 상태 / 접근성

series 비어 있음 → "표시할 데이터가 없습니다", available false → unsupported 패널, point 0 → 0 막대(추정 아님), 버킷 과다 → 최근 일부 + 문구. line SVG에 `role="img"`/`aria-label`.

## 12. 계산 로직 불변

`buildMarketingAnalysisFacts`/`buildMarketingTemporalCrosstab`/`buildMarketingChatChartResponse` 미변경. 대시보드는 chartSpec 결과만 표시(컴포넌트에 `buildMarketingTemporalCrosstab`/`runMarketingChartRequest` 신규 호출 없음, `.reduce` 직접 집계 없음 — smoke 검증).

## 13. 실제 WRITE/API/localStorage 없음

표시 컴포넌트 + CSS + prop 연결 + 문서 + smoke. route/네트워크/localStorage 신규 없음(artifact는 state), 고도몰 WRITE 없음.

## 14. 검증

* `npm run lint` ✅ · `npx tsc -b` ✅ · `npm run build` ✅
* `smoke-...-dynamic-smart-chart-render-v0` ✅ 30/30
* 회귀: chat-chartspec-runtime-connection 32/32 · chat-driven-chartspec-bridge 37/37 · temporal-crosstab 30/30 · baseline-year 29/29 · dashboard-focused-insight-layout-v01 27/27 · analysis-dashboard-v0 30/30 · facts-core 34/34 · team-chat-facts 32/32.

## 15. 다음 작업 후보

1. **artifact 히스토리** — 최근 차트 질문 N개 보관 + 재선택/핀.
2. **차트 인터랙션** — 버킷 클릭 → 세부 분석 드릴다운.
3. **stackedBar/donut 정교화**, 기간 자연어 파싱 intent.
4. **차트 내보내기/공유**(승인 큐 후보 연계).
