# Marketing Behavior Postgres Schema v0

> **한 줄**: Postgres persistent backend가 사용하는 테이블 스키마. **자동 DDL은 실행하지 않는다** — 사용자가 DB 콘솔/마이그레이션으로 직접 적용한다. PII/IP/userAgent/원문 식별자 컬럼은 없다.

- adapter: [`api/_shared/marketingBehaviorPostgresStore.ts`](../api/_shared/marketingBehaviorPostgresStore.ts)
- adapter 문서: [MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md)

## 1. 적용 방법

이 v0는 **자동 DDL을 실행하지 않는다(기본 금지)**. 아래 SQL을 DB 콘솔(psql, Vercel Postgres, Neon, Supabase SQL editor 등)에서 **활성화 시 1회 직접 실행**하거나 별도 마이그레이션 도구로 적용한다. 전체 활성화 절차는 [Activation Guide](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) 참고. `search_term`(검색어)은 **v0에서 의도적으로 미저장**(보수적) — 아래 스키마에 컬럼 없음.

```sql
CREATE TABLE IF NOT EXISTS marketing_behavior_events (
  id BIGSERIAL PRIMARY KEY,
  shop_id TEXT NOT NULL DEFAULT 'default',
  event_id TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  event_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  occurred_at TIMESTAMPTZ NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  page_path TEXT,
  page_title TEXT,
  referrer_host TEXT,
  campaign TEXT,
  medium TEXT,

  banner_id TEXT,
  banner_name TEXT,
  category_id TEXT,
  category_name TEXT,
  product_id TEXT,
  product_name TEXT,

  order_id_hash TEXT,
  revenue NUMERIC(12, 2),

  schema_version INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT marketing_behavior_events_unique_event UNIQUE (shop_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_behavior_events_occurred_at
  ON marketing_behavior_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_behavior_events_session
  ON marketing_behavior_events (shop_id, session_id_hash, occurred_at);

CREATE INDEX IF NOT EXISTS idx_marketing_behavior_events_source
  ON marketing_behavior_events (shop_id, source, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_behavior_events_event_name
  ON marketing_behavior_events (shop_id, event_name, occurred_at DESC);
```

> 테이블 이름을 바꾸려면 `GODO_BEHAVIOR_POSTGRES_TABLE` 환경변수와 위 DDL의 이름을 함께 맞춘다. adapter는 테이블 이름을 안전 identifier(`[A-Za-z0-9_]+`)로만 허용하며, 위반 시 기본값 `marketing_behavior_events`를 사용한다.

## 2. 컬럼 설명

| 컬럼 | 의미 |
|---|---|
| `shop_id` | 공개 shop 키/별칭(개인정보 아님), 멀티샵 대비 |
| `event_id` | 익명 이벤트 식별자 |
| `session_id_hash` | 세션 **해시**(원문 세션 식별자 아님) |
| `event_name` | visit/landing/banner_click/.../purchase/exit |
| `source` | 유입 채널(blog/search/ad/sns/direct/referral/unknown) |
| `occurred_at` / `stored_at` | 발생 시각 / 저장 시각 |
| `page_path`·`page_title`·`referrer_host`·`campaign`·`medium` | 페이지/유입 맥락 |
| `banner_*`·`category_*`·`product_*` | 쇼핑몰 공개정보(배너/카테고리/상품) |
| `order_id_hash` | 주문 **해시**(주문번호 원문 아님) |
| `revenue` | 구매 금액(집계용) |
| `schema_version` | 계약 버전 |

## 3. ★ 저장하지 않는 데이터 (컬럼 없음)

- **IP address 원문** · **userAgent 원문** — 컬럼 없음
- `name` / `email` / `phone` / `address` — 컬럼 없음
- `orderNo`(원문) — 없음(해시 `order_id_hash`만)
- `memberKey` / `rawSessionId` / `rawUserId` — 없음
- **`search_term`(검색어) — v0 schema에서 의도적으로 제외**. 자유 입력 검색어에 민감정보가 섞일 수 있어 보수적으로 저장하지 않는다. 필요 시 후속 작업에서 sanitized search term policy를 별도 설계한다.

## 4. 중복 방지

`UNIQUE (shop_id, event_id)` + adapter의 `INSERT ... ON CONFLICT (shop_id, event_id) DO NOTHING` 으로 재전송/중복 이벤트를 안전하게 무시한다.
