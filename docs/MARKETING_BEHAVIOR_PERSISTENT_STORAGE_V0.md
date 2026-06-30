# Marketing Behavior Persistent Storage v0

> **한 줄**: collection endpoint를 **storage 인터페이스** 뒤로 정리해, 현재 dev in-memory buffer와 future DB/KV 저장소를 **갈아끼울 수 있게** 했다. 단, 이 환경엔 영속 저장소가 없으므로 **fake persistence를 만들지 않고** dev_buffer로 동작하며 `persistentReady: false`를 정직하게 표시한다.

- 타입: [`api/_shared/marketingBehaviorStorageTypes.ts`](../api/_shared/marketingBehaviorStorageTypes.ts)
- adapter 선택: [`api/_shared/marketingBehaviorPersistentStore.ts`](../api/_shared/marketingBehaviorPersistentStore.ts)
- dev buffer: [`api/_shared/marketingBehaviorEventStore.ts`](../api/_shared/marketingBehaviorEventStore.ts)
- endpoint: [`api/marketing/behavior-events.ts`](../api/marketing/behavior-events.ts)

## 1. 목적 — dev buffer의 한계

현재 endpoint는 행동 이벤트를 in-memory buffer에 저장한다. **serverless(Vercel)는 인스턴스가 재활용/소멸**되므로, 실제 고객 행동이 들어와도 서버 재시작/배포 후 기록이 사라질 수 있다. **기간별·채널별·상품별 누적 패턴 분석**을 하려면 영속 저장소가 필요하다.

## 2. 현재 저장 구조

```
POST /api/marketing/behavior-events
  → validator (PII reject / allowlist / sanitize)
  → getMarketingBehaviorStorage()            ← 환경에 맞는 adapter 선택
       ├─ dev_buffer adapter (env 없음, 현재)  → in-memory buffer (비영속)
       └─ pending adapter (env 감지·미구현)    → dev buffer 보존 + "구현 필요" 신호
  → appendEvents(sanitizedEvents, { shopId, schemaVersion })
  → response에 storage mode / persistentReady 포함
```

endpoint는 storage 구현을 모른다 — `appendEvents` / `getStats`만 호출하므로, 나중에 persistent adapter를 끼우면 endpoint 변경 없이 영속화된다.

## 3. storage mode

| mode | 의미 | persistentReady |
|---|---|---|
| **dev_buffer** | in-memory buffer(현재 기본). 비영속. | false |
| **persistent** | 실제 DB/KV에 저장됨. | true |
| **pending** | 영속 백엔드 env는 감지됐으나 adapter 미구현 → dev buffer로 임시 보존 + 신호. | false |

> **fake persistence 금지**: 저장소가 없는데 `persistent`라고 거짓 표시하거나 local JSON/file에 저장하지 않는다.

## 4. 저장되는 데이터

- **sanitized `MarketingBehaviorEvent`** (validator 통과 — 허용 필드만)
- `storedAt` (저장 시각)
- `schemaVersion`
- `shopId` (optional)

## 5. 저장하지 않는 데이터

- PII 금지 필드: `name` · `phone` · `email` · `address` · `customerName` · `contact` · `memberKey` · `orderNo` · `rawSessionId` · `rawUserId`
- **IP address 원문** 저장 안 함
- **userAgent 원문** 저장 안 함
- 세션/주문은 `sessionIdHash` / `orderIdHash`만

> storage layer는 PII를 **새로 추가하지 않는다**. validator가 1차 차단, storage는 sanitized event만 받는다고 가정.

## 6. 저장소별 권장

| 단계 | 권장 | 이유 |
|---|---|---|
| 초기 | **KV / Redis** (Vercel KV, Upstash) | list push/trim 간단, 빠른 수집 |
| 장기 | **Postgres / analytics table** | 기간별·채널별·상품별 **집계**에 적합 |

### Postgres 컬럼 후보 (테이블은 v0에서 자동 생성하지 않음 — 스키마만 제시)
```sql
CREATE TABLE marketing_behavior_events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  stored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT,
  page_path       TEXT,
  banner_id       TEXT,  banner_name   TEXT,
  category_id     TEXT,  category_name TEXT,
  product_id      TEXT,  product_name  TEXT,
  search_term     TEXT,
  order_id_hash   TEXT,
  revenue         NUMERIC,
  shop_id         TEXT,
  schema_version  INTEGER NOT NULL DEFAULT 0
);
-- ★ order_no 원문 / member_key / raw user id 컬럼 없음(저장 금지)
```

### KV/Redis 정책 (구현 시)
- key prefix: `godo:marketing:behavior:events:{shopId}`
- list push + max length trim, JSON.stringify된 sanitized event
- TTL 적용 여부는 운영 정책으로 결정(장기 분석엔 Postgres가 더 적합)

## 7. 현재 프로젝트에서 구현된 상태

- **사용 가능한 persistent storage: 없음** — package.json에 DB/KV 의존성 없음, env에 저장소 키 없음.
- **실제 persistent adapter 구현: 안 함** (fake 금지 원칙).
- 현재 mode = **`dev_buffer`**, `persistentReady: false`.
- **필요 환경변수(택1)**: `KV_REST_API_URL`+`KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` / `POSTGRES_URL`(또는 `DATABASE_URL`/`NEON_DATABASE_URL`) / `SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`.
  - 이 중 하나가 설정되면 adapter는 현재 **`pending`** 으로 전환되어(이벤트는 dev buffer로 손실 없이 보존) "adapter 구현 필요"를 신호한다. 실제 영속화는 해당 백엔드 adapter 구현 후 `persistent`가 된다.

## 7-1. Live wiring과 dev_buffer 한계 (Summary Live Wiring v0 이후)

`GET /api/marketing/behavior-summary`가 storage의 최근 safe events를 서버에서 집계해 모달에 insights를 공급한다(raw event 미노출). 단 **현재는 dev_buffer 기반이라 serverless에서 비영속** — instance에 따라 데이터가 없을 수 있다. 따라서 **persistent backend 연결 전까지 live wiring은 구조 검증용**이고, 장기 누적 패턴은 persistent 승격 후 안정화된다. 문서: [MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md](./MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md).

## 8. 이번 작업에서 하지 않는 것

- ❌ dashboard live wiring 없음 · 고객 행동 모달 live 연결 없음
- ❌ GET events 조회 API 없음 (buffer/저장 내용 노출 없음)
- ❌ DB dashboard 없음
- ❌ GA4/GTM 없음 · 광고 API 없음 · 고도몰 WRITE 없음
- ❌ local JSON/file persistence 없음

## 8-1. Postgres adapter (Postgres Adapter v0 이후)

**Postgres persistent backend adapter**가 추가되었다 — env-gated(`GODO_BEHAVIOR_STORAGE_BACKEND=postgres` + `DATABASE_URL`/`POSTGRES_URL`)로, 설정되면 dev_buffer가 아니라 실제 DB에 저장한다. env가 없으면 **dev_buffer fallback 유지**, 불완전하면 **pending**(거짓 persistent 표시 없음). `pg`는 lazy import(연결 시점만), 자동 DDL 없음. 문서: [adapter](./MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md) · [schema](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md) · **활성화 절차/체크리스트**: [Activation Guide](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) · [Checklist](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_CHECKLIST_V0.md).

## 9. 다음 단계

- **Persistent storage 환경변수 연결** — 위 env 설정 + 해당 backend adapter 구현(`persistent`로 승격). **Postgres adapter는 구현됨** — env+table만 준비하면 됨.
- **Aggregated Pattern Builder v0** ✅ — 저장된 이벤트 → 기간/채널/상품 누적 집계. 문서: [MARKETING_BEHAVIOR_AGGREGATED_PATTERN_BUILDER_V0.md](./MARKETING_BEHAVIOR_AGGREGATED_PATTERN_BUILDER_V0.md). **storage events를 바로 UI에 연결하지 않고 이 builder를 거친다**(raw → 패턴 → insights → 모달).
- **Live Behavior Dashboard Wiring v0** — 집계 → `buildMarketingBehaviorInsights(liveEvents, { mode: 'live' })` → 모달.
- **Godo Skin Integration Guide v0** — 고도몰 스킨에 tracker 삽입.
