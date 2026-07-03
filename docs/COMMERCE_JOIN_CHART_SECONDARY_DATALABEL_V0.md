# Commerce Join Chart — 보조 데이터라벨 (V0)

> 2026-07-03 · 마스터 보고서 2026-07-02 "내일 할 일 #1(확정·소)" 실행.

## 문제
"문의 많은 상품 중 매출 높은 상품"(join: metric=inquiryCount, secondaryMetric=revenue) 질문의
차트는 **매출 막대**만 나오고, 1차 지표인 **문의건수는 채팅 텍스트에만** 있었다.
막대만 봐서는 "이게 왜 뽑힌 상품인지(문의가 많아서)"가 그래프에서 안 보였다.

## 처리 (케이스 아님 — join 원시연산의 렌더 보강)
join일 때 각 막대에 1차 지표(문의수)를 보조 데이터라벨로 얹는다. 값은 이미
`computeSecondaryByProduct`/`ranked`가 계산해 둔 것을 렌더에만 노출.

- `marketingChatChartSpec.ts`: series point 타입에 `secondaryLabel?: string` 추가(일반 필드).
- `commerceDataQueryEngine.ts`:
  - `Row`에 `secondaryLabel?: string`.
  - `rankedBarSpec`가 point에 `r.secondaryLabel`을 실어 보냄.
  - join `chartRows` 생성 시 `secondaryLabel = "${1차지표 라벨} ${fmtMetric(1차값)}"`(예: `문의수 3건`).
    막대 value는 그대로 보조 지표(매출).
- `MarketingAnalysisDashboard.tsx` `RankedBarChart`: point의 `secondaryLabel`이 있으면
  값 옆에 `· {secondaryLabel}` 표시(없으면 기존 `· 주문 N건` 유지).

join이 아닌 순위/추이/비중 차트는 point에 `secondaryLabel`이 없어 기존 그대로.

## 검증
- `smoke-commerce-query-plan-engine-v0`: **30/0** (기존 29 + join 데이터라벨 부착 1건 추가).
  - 각 막대 point에 `secondaryLabel` 존재 + `/문의/` 포함, 가습기=`문의수 1건` 확인.
- `tsc -b` / `lint` / `vite build`: 그린. API 함수 수 불변(≤12).
- 회귀: `smoke-marketing-chart-renderer-parity-p0` 24/0, `smoke-marketing-chart-grammar-compact-renderer-v0` 23/0.
  `smoke-marketing-dashboard-dynamic-smart-chart-render-v0`은 29/1 — 잔여 실패 6번(artifact 없을 때 fallback)은
  2026-07-02 보고서에 기록된 **baseline 기존 실패**로 이번 변경과 무관.

## 다음(마스터 보고서 잔여)
- #2 사장님 임의 질문 추가 검수(어긋나면 케이스 아니라 빠진 축/지표 보강).
- #3 CS/총괄 팀 질문 유형 점검(같은 엔진).
- #4 진짜 도넛(share) 전용 렌더러.
