# Marketing Behavior Aggregated Pattern Builder v0

> **한 줄**: 저장/수집된 raw 행동 이벤트(`MarketingBehaviorEvent[]`)를 운영자용 **누적 패턴**(유입/이동/클릭/이탈/요약)으로 계산하는 deterministic builder. 대시보드 live wiring·DB 연결·모달 연결은 **하지 않는다**(계산만).

- 코드: [`src/services/marketingBehaviorAggregatedPatterns.ts`](../src/services/marketingBehaviorAggregatedPatterns.ts)

## 1. 목적 / 왜 필요한가

raw event는 운영자가 직접 볼 정보가 아니다(세션·이벤트 단위). 대시보드는 **"어디서 들어와서 / 어디로 이동하고 / 무엇을 클릭하고 / 어디서 이탈하는지"** 패턴을 봐야 한다. 이 builder가 그 변환을 담당한다.

```
storage events → aggregateMarketingBehaviorPatterns() → MarketingBehaviorAggregatedPattern
                  → (향후) convertAggregatedPatternToInsights() → modal
```

## 2. 입력 / 출력

- **입력:** `MarketingBehaviorEvent[]` (sanitized 가정) + options(`range`, `mode`, `topLimit`, `now`)
- **출력:** `MarketingBehaviorAggregatedPattern` — 집계 결과(raw event/식별자 없음)

## 3. 계산 항목

| 항목 | 계산 |
|---|---|
| **acquisition** | 세션의 첫 `source`별 세션수 + 비중(블로그/검색/광고/SNS/직접/외부 링크/알 수 없음) |
| **paths.topPaths** | sessionIdHash로 묶고 occurredAt 정렬 → step label 시퀀스(연속중복 압축, 4~5단계 제한) → 동일 경로 세션수 TOP + `lastStepLabel` |
| **clicks** | `banner_click`→banners · `category_click`→categories · `product_view`→products(상품 관심/조회 TOP). clickPercent = **그룹 내** 분모 |
| **dropOffs** | 세션 마지막 meaningful 이벤트 기준 이탈 라벨 (아래 정책) |
| **summary** | 위 TOP들의 대표값 |

## 4. 기간 필터 (range)

- `range.startDate` 있으면 그 이상, `range.endDate` 있으면 그 이하(`occurredAt` 기준).
- 둘 다 없으면 전체.
- **잘못된 날짜 bound는 해당 bound만 무시**한다(전체를 empty로 만들지 않음 — 오타로 대시보드가 통째로 비는 것을 피하는, 더 안전한 방향). `rangeLabel`은 `range.label`(없으면 '전체').
- 이번 v0에서 UI date filter와 연결하지 않는다 — builder가 range를 받을 수 있게만 한다.

## 5. 이탈 계산 정책

- 세션의 **마지막 meaningful 이벤트** 기준으로 이탈 지점을 정한다.
  - `exit` 이벤트 있으면 그 `pageTitle`/`pagePath` 우선
  - 없으면 마지막 이벤트 타입 → "상품 상세 보기 후 이탈" / "카테고리 보기 후 이탈" / "배너 클릭 후 이탈" / "장바구니 후 이탈" / "결제 시작 후 이탈" / "검색 후 이탈" / "메인페이지에서 이탈"
- **`purchase`가 있는 세션은 구매 완료로 간주해 dropOff 리스트에서 제외**한다. `dropOffPercent`는 **전체 세션 기준** 분모(구매 세션 포함)로 계산한다.

## 6. PII 정책

- builder는 sanitized event를 받지만, **출력에는 `sessionIdHash`/`orderIdHash` 등 식별자를 절대 포함하지 않는다**(집계 후 사라짐). 출력은 label·count·percent뿐.
- 금지: `name`·`phone`·`email`·`address`·`customerName`·`contact`·`memberKey`·`orderNo`·`rawSessionId`·`rawUserId`·`sessionIdHash`·`orderIdHash`.
- **`searchTerm`은 민감할 수 있어 v0에서는 노출하지 않는다** — search top list를 만들지 않고, 경로의 검색 단계도 `'검색'`으로만 표시(검색어 미포함).

## 7. 기존 insights와 관계

- 현재 모달: `demoMarketingBehaviorData → buildMarketingBehaviorInsights() → modal` (그대로 유지).
- 향후: `storage events → aggregateMarketingBehaviorPatterns() → convertAggregatedPatternToInsights() → modal`.
- 이번 작업에 **`convertAggregatedPatternToInsights()` helper를 추가**했으나(shape만 맞춤), **모달에 연결하지 않는다**. smoke로 변환 shape만 검증.

## 8. Empty 상태

- 입력(필터 후) 이벤트가 없으면 empty pattern: `dataStatus.mode='empty'`(또는 options.mode), `eventCount/sessionCount=0`, `isEmpty=true`, 모든 리스트 `[]`, summary는 `'수집 대기'`.
- **demo는 이 builder가 만들지 않는다** — demo는 기존 demo path 유지. builder는 입력 events 기반으로만 계산.

## 9. 이번 작업에서 하지 않는 것

- ❌ dashboard live wiring 없음 · 고객 행동 모달 live 연결 없음
- ❌ DB/KV 연결 없음 · GET events 조회 API 없음
- ❌ 고도몰 스킨 삽입 없음 · GA4/GTM 없음 · 광고 API 없음 · 고도몰 WRITE 없음

## 10. 다음 단계

- **Live Behavior Dashboard Wiring v0** — storage events → aggregate → convert → 모달.
- **Persistent backend adapter** — dev_buffer → DB/KV(`persistent` 승격).
- **Godo Skin Integration Guide v0** — 고도몰 스킨에 tracker 삽입.
