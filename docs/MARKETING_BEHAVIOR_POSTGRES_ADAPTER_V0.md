# Marketing Behavior Postgres Adapter v0

> **한 줄**: dev_buffer(비영속)에서 **Postgres persistent backend**로 승격할 수 있는 env-gated adapter. 환경변수가 준비되면 실제 DB에 저장하고, 없으면 **dev_buffer fallback** 유지. fake persistence/ local file 저장은 만들지 않는다.

- 코드: [`api/_shared/marketingBehaviorPostgresStore.ts`](../api/_shared/marketingBehaviorPostgresStore.ts)
- 스키마: [MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md)
- 선택 로직: [`api/_shared/marketingBehaviorPersistentStore.ts`](../api/_shared/marketingBehaviorPersistentStore.ts)

## 1. 목적

고객 행동은 기간별/채널별/상품별/세션별 **누적 분석**(funnel·cohort·path·conversion)이 중요하다. dev_buffer는 serverless에서 비영속이라 누적 분석이 불가능하다. 이 adapter는 **Postgres**(분석 query에 적합)로 영속화하는 길을 연다.

## 2. env 설정

| env | 의미 |
|---|---|
| `GODO_BEHAVIOR_STORAGE_BACKEND=postgres` | Postgres backend 선택 스위치 |
| `DATABASE_URL` 또는 `POSTGRES_URL` | 연결 문자열(secret — Vercel 환경변수에만) |
| `GODO_BEHAVIOR_POSTGRES_TABLE` *(선택)* | 테이블 이름(기본 `marketing_behavior_events`, 안전 identifier만) |
| `GODO_BEHAVIOR_POSTGRES_SSL=true` *(선택)* | SSL 사용 |
| `GODO_BEHAVIOR_POSTGRES_MAX_EVENTS` *(선택)* | 보관 상한 표기(기본 10000) |

> 실제 값은 **절대 git/문서/로그/응답에 넣지 않는다.** 응답에는 backend 이름(`postgres`)·테이블 이름 정도만 노출한다.

## 3. 활성화 조건 (env-gated)

- `GODO_BEHAVIOR_STORAGE_BACKEND=postgres` **그리고** `DATABASE_URL`/`POSTGRES_URL` 존재 → **postgres adapter** (`mode: persistent`, `backend: postgres`, `persistentReady: true`).
- url만 있고 backend 스위치가 없으면 → **pending**(감지되었으나 비활성, dev buffer로 손실 없이 보존).
- 아무 env도 없으면 → **dev_buffer**(현 상태, `persistentReady: false`).
- ★ **fake persistence 없음**: 설정이 불완전하면 절대 `persistent`로 거짓 표시하지 않는다.

## 4. 동작

- **lazy 연결**: `pg` Pool은 **실제 query 시점에만** 동적 import로 생성(top-level 연결 강제 없음, serverless friendly). env 없으면 Pool을 만들지 않는다.
- **appendEvents**: `INSERT ... ON CONFLICT (shop_id, event_id) DO NOTHING`. DB 실패 시 **dev_buffer로 손실 없이 보존**하고 `mode: dev_buffer`로 정직하게 표시(persistent 성공처럼 표시하지 않음).
- **getRecentEventsForAggregation**: `SELECT ... ORDER BY occurred_at DESC LIMIT 1000` → sanitized event로 매핑. 읽기 실패 시 빈 배열(summary는 안전하게 empty). **raw event를 public response로 반환하지 않는다** — summary service가 집계해 insights만 노출.
- **getStats**: DB 미연결 — **config 기반 readiness만** 보고(과한 `COUNT(*)` query 회피). `eventCount`는 생략(undefined).

## 5. 저장 데이터

- sanitized behavior event + `stored_at` + `schema_version` + `shop_id`.

## 6. 저장하지 않는 데이터

- raw IP · raw userAgent · `name`/`email`/`phone`/`address` · `orderNo`(원문) · `memberKey` · `rawSessionId`/`rawUserId`.
- **raw searchTerm — v0 제외**(자유 입력 민감정보 혼입 가능, 보수적). 스키마에 `search_term` 컬럼 없음.

## 7. schema 적용 방법

- [MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md)의 SQL을 **사용자가 DB 콘솔/마이그레이션으로 직접 적용**한다.
- ★ **자동 DDL 기본 금지** — adapter는 테이블을 생성하지 않는다(권한/안전성 이유).

## 8. 현재 한계

- DB env가 없으면 `persistentReady: false`(dev_buffer).
- table 미생성 상태에서 append/read는 실패할 수 있고, 그 경우 append는 dev_buffer fallback, read는 빈 배열로 안전 처리된다(secret 미노출).
- 집계는 최근 N개(기본 1000) 기준 — 대규모 기간 집계 최적화는 후속.

## 9. 다음 단계

- **Vercel Postgres env 등록 + table 생성** → live 누적 수집 시작.
- **Godo Skin Integration Guide v0** / **Period Filter Wiring v0** / **Live behavior UI polish v0.1** / 집계 성능 최적화.
