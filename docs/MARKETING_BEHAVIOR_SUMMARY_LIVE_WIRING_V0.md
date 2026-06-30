# Marketing Behavior Summary API & Live Modal Wiring v0

> 📎 실제 고도몰 설치/전환 도면: [Integration Readiness](./MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md).

> **한 줄**: 행동 사슬의 마지막 칸을 연결. 고객 행동 분석 모달이 **항상 demo만** 보던 구조에서, 실제 수집 이벤트가 있으면 **안전하게 집계된 live insights**를, 없으면 기존 **demo 예시 fallback**을 보여준다. **raw event는 절대 브라우저로 나가지 않는다** — 화면엔 집계 insights만.

## 1. 목적

raw event를 노출하지 않고, 서버에서 집계한 **aggregated summary만** 화면에 연결한다.

## 2. 전체 흐름

```
tracker → (opt-in) send adapter → POST /api/marketing/behavior-events
  → validator (PII reject/sanitize) → storage interface (dev_buffer/pending)
  → [GET /api/marketing/behavior-summary]
       → storage.getRecentEventsForAggregation()  (server-only, route 노출 X)
       → 서버 집계(aggregate) → insights(convert) 
       → safe response (insights만)
  → useMarketingBehaviorSummary() → MarketingCustomerBehaviorModal
       → live data 있으면 live, 없으면 demo fallback
```

## 3. Summary API — `GET /api/marketing/behavior-summary`

- **GET 전용** (POST 405, OPTIONS 최소). query: `startDate` / `endDate` / `rangeLabel` / `topLimit`(기본 5, 최대 10).
- **raw event 미노출**: `events` 배열 / `sessionIdHash` / `orderIdHash` / `eventId` 목록을 **절대 반환하지 않는다**. 응답은 집계 insights뿐.
- **demo를 반환하지 않는다** — 실제 이벤트가 없으면 `empty`/`collecting` 상태만. demo fallback은 client(modal)가 처리.

### response (live)
```json
{ "ok": true, "hasLiveData": true, "generatedAt": "...",
  "storage": { "mode": "dev_buffer", "persistentReady": false },
  "dataStatus": { "mode": "live", "eventCount": 24, "sessionCount": 7, "rangeLabel": "전체", "isEmpty": false },
  "insights": { "...": "MarketingBehaviorInsights shape" } }
```
### response (empty) — `hasLiveData:false`, `insights:null`, `dataStatus.mode:"empty"`
### response (pending) — `storage.mode:"pending"`, `hasLiveData:false`, `insights:null`, `dataStatus.mode:"collecting"`

> 집계는 `src/services/marketingBehaviorAggregatedPatterns.ts` builder를 **서버 사이드로 포팅**한 동형 로직(`marketingBehaviorSummaryService.ts`)이 수행한다(api↔src 프로젝트 경계 때문 — 아래 §6).

## 4. Modal 데이터 소스 상태

| 상태 | 표시 |
|---|---|
| **live** | "실제 수집 데이터" 배지 + "최근 수집된 고객 행동을 기준으로 계산했습니다. 수집 이벤트 N건 / 세션 M개" |
| **demo** (live data 없음) | 기존 데모 예시 유지 + "실제 수집된 고객 행동 데이터가 아직 없어 데모 예시를 보여줍니다." |
| **pending** (저장소 연결 준비 중) | 데모 예시 유지 + "저장소 연결 준비 중입니다. 실제 데이터가 연결되면 자동으로 행동 패턴을 표시합니다." |
| **error** | 데모 예시 유지 + "실제 행동 요약을 불러오지 못해 예시 화면을 보여줍니다." |

- 기존 v0.1 운영자 친화 UI/디자인은 유지하고 **데이터 소스 상태 배지/문구만** 추가했다.
- 모달에 raw event table / `sessionIdHash`·`orderIdHash`·`eventId` 표시 없음. 개발자 용어/GA4·GTM 전면 노출 없음.

## 5. demo fallback 유지

- `marketingBehaviorDemoData` + `buildMarketingBehaviorInsights`(데모 path)는 그대로 존재한다.
- summary가 empty/pending/error면 모달이 **demo를 fallback**으로 사용하고 반드시 "데모 예시"로 표시한다(실데이터 오해 방지).

## 6. 판단 — 서버 사이드 집계 포팅

`aggregateMarketingBehaviorPatterns`/`convertAggregatedPatternToInsights`는 `src/services`(tsconfig.app)에 있고 summary service는 `api/_shared`(tsconfig.node)에 있다. api→src **직접 import는 TS 프로젝트 레퍼런스 충돌(TS6307) 위험**이 커서, 집계 로직을 api 경계 안에 **동형 포팅**했다(validator가 allowlist를 자체 보유하는 것과 동일한 신뢰-경계 패턴). 출력 shape는 `MarketingBehaviorInsights`와 동일해 모달이 그대로 렌더한다.

## 7. 이번 작업에서 하지 않는 것

- ❌ raw event GET API 없음 (`GET /api/marketing/behavior-events` 미생성) · raw event dump 없음
- ❌ DB/KV adapter 구현 없음 · 고도몰 스킨 삽입 없음 · GA4/GTM 없음 · 광고 API 없음 · 고도몰 WRITE 없음
- ❌ tracker 자동 전송 기본 활성화 없음

## 7-1. Postgres 연결 시 (Postgres Adapter v0 이후)

`GODO_BEHAVIOR_STORAGE_BACKEND=postgres` + DB url이 설정되면 summary API는 **Postgres 이벤트 기반으로 live insights를 집계**한다(storage interface가 동일하므로 service 변경 없음). 그래도 **raw event는 public response에 노출하지 않으며**, 응답은 여전히 aggregated insights뿐이다. 활성화 절차: [MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) · adapter: [MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md).

## 8. 한계

- 현재 persistent backend가 없어 **dev_buffer는 serverless에서 비영속** — Vercel instance에 따라 데이터가 없을 수 있다.
- 따라서 초기 live wiring은 **구조 검증 목적**이며, 실제 누적 분석 안정화는 **persistent backend 연결 후**다.

## 9. 다음 단계

- **Persistent backend adapter** (dev_buffer → DB/KV, `persistent` 승격) — live 데이터 안정화.
- **Godo Skin Integration Guide v0** — 고도몰 스킨에 tracker 삽입(실 수집 시작).
- **Live behavior UI polish v0.1** / 실제 기간 필터 연결.
