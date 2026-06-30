# Marketing Behavior Postgres Activation Guide v0

> **한 줄**: 코드는 이미 Postgres 저장을 지원한다. 하지만 **env와 table이 없으면 dev_buffer(비영속)** 로 동작한다. 이 문서는 사용자가 **Vercel 환경변수 + DB schema**를 설정해 영속 저장을 **안전하게 켜는 절차**를 안내한다. (실제 활성화는 사용자가 직접 — 이 문서는 가이드다.)

- adapter: [MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md)
- schema: [MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md)
- 체크리스트: [MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_CHECKLIST_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_CHECKLIST_V0.md)

## 4-1. 문서 목적

- 현재 코드는 **Postgres 저장을 지원**한다.
- 하지만 **env와 table이 없으면 dev_buffer**로 동작한다(serverless에서 비영속).
- 영속 저장을 켜려면 사용자가 **Vercel env**와 **DB schema**를 설정해야 한다.
- 이 문서는 그 **활성화 절차**를 안내한다.

## 4-2. 현재 구조 요약

```
tracker
  → POST /api/marketing/behavior-events   (수집·검증·저장)
  → validator
  → Postgres adapter                       (env 설정 시) / dev_buffer (미설정 시)
  → GET /api/marketing/behavior-summary    (집계 insights만 — raw event 미노출)
  → MarketingCustomerBehaviorModal         (live summary / demo fallback)
```

## 4-3. 활성화 전 준비물

- Vercel 프로젝트 접근 권한
- **Postgres DB** (예: Vercel Postgres, Neon, Supabase Postgres 등)
- **`DATABASE_URL` 또는 `POSTGRES_URL`** (connection string)
- DB 콘솔 또는 SQL 실행 권한
- `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 등록할 **실제 수집 도메인** 계획

> ⚠️ 실제 secret 값(connection string 등)은 이 문서나 git에 적지 않는다. Vercel 환경변수에만 등록한다.

## 4-4. Vercel 환경변수 설정

**필수 env** (둘 중 하나의 URL):
```
GODO_BEHAVIOR_STORAGE_BACKEND=postgres
DATABASE_URL=<Postgres connection string>
# 또는
GODO_BEHAVIOR_STORAGE_BACKEND=postgres
POSTGRES_URL=<Postgres connection string>
```

**선택 env**:
```
GODO_BEHAVIOR_POSTGRES_TABLE=marketing_behavior_events
GODO_BEHAVIOR_POSTGRES_SSL=true
GODO_BEHAVIOR_ALLOWED_ORIGINS=https://실제고도몰도메인.example.com,https://godo-psi.vercel.app
```

주의:
- **wildcard origin(`*`) 금지** — 정확한 도메인만 쉼표로 나열.
- **secret 값 문서화 금지.**
- **Preview / Production 환경변수 적용 범위를 구분**해서 등록한다(보통 Production에 등록해야 운영에서 동작).
- **env 변경 후에는 반드시 재배포(redeploy)** 해야 적용된다.

## 4-5. DB table 생성 절차

- [MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md)의 **SQL을 DB 콘솔에서 1회 실행**한다.
- **자동 DDL은 코드에서 하지 않는다**(앱이 table을 만들지 않음).
- table 생성 후 **index와 unique constraint(`UNIQUE(shop_id, event_id)`)** 까지 적용됐는지 확인한다.

반드시 지킬 저장 금지 원칙(스키마에 컬럼 자체가 없음):
- raw IP 저장 금지 · raw userAgent 저장 금지
- `name`/`email`/`phone`/`address` 저장 금지
- `orderNo`(원문)/`memberKey`/`rawSessionId`/`rawUserId` 저장 금지
- **raw searchTerm persistent 저장 금지**(v0 schema에 `search_term` 컬럼 없음)

## 4-6. 재배포 절차

1. Vercel env 등록(4-4)
2. DB schema SQL 실행(4-5)
3. Vercel **redeploy**
4. summary API 확인(4-7)
5. safe test event POST(4-8)
6. summary API에서 **live data 전환** 확인(4-9)

> ⚠️ Claude Code/Antigravity는 Vercel 확인을 하지 않는다. **사용자가 직접** 확인한다.

## 4-7. 성공 확인 기준 (GET summary)

```
GET https://godo-psi.vercel.app/api/marketing/behavior-summary
```
성공 기준 예시:
```json
{
  "ok": true,
  "storage": { "mode": "persistent", "backend": "postgres", "persistentReady": true }
}
```

> 현재 구현의 `getStats`는 **config readiness 중심**이다. 즉 `persistentReady: true`는 **"adapter가 Postgres로 선택됨"**(env가 올바름)을 의미한다. **table 생성/insert 성공까지** 확인하려면 아래 **safe test event POST(4-8)** 까지 진행해야 한다.

## 4-8. safe test event POST 예시

```bash
curl -X POST "https://godo-psi.vercel.app/api/marketing/behavior-events" \
  -H "Content-Type: application/json" \
  -H "Origin: https://godo-psi.vercel.app" \
  -d '{
    "events": [
      {
        "eventId": "guide-test-CHANGE-ME-001",
        "sessionIdHash": "guide_session_hash_001",
        "eventName": "landing",
        "occurredAt": "2026-06-30T10:20:00.000Z",
        "source": "direct",
        "pagePath": "/",
        "pageTitle": "테스트 메인"
      },
      {
        "eventId": "guide-test-CHANGE-ME-002",
        "sessionIdHash": "guide_session_hash_001",
        "eventName": "banner_click",
        "occurredAt": "2026-06-30T10:21:00.000Z",
        "source": "direct",
        "pagePath": "/",
        "bannerId": "guide-banner-01",
        "bannerName": "가이드 테스트 배너"
      }
    ],
    "client": { "schemaVersion": 0, "shopId": "activation-guide" }
  }'
```

주의:
- **`eventId`는 매번 유니크하게 변경**한다(`UNIQUE(shop_id, event_id)`로 중복은 무시됨).
- `name`/`email`/`phone`/`address`/`orderNo`/`memberKey` 같은 **PII 필드를 넣지 않는다**.
- **Origin이 allowlist에 없으면 403이 정상**일 수 있다(4-4의 `GODO_BEHAVIOR_ALLOWED_ORIGINS`).
- 실제 test event는 DB에 남을 수 있으므로, 필요하면 DB 콘솔에서 삭제한다.

**선택 cleanup SQL** (사용자가 DB 콘솔에서 **직접 수동 실행** — 앱에 삭제 API 없음):
```sql
DELETE FROM marketing_behavior_events
WHERE shop_id = 'activation-guide'
  AND event_id LIKE 'guide-test-%';
```

## 4-9. safe test 후 summary 확인

```
GET https://godo-psi.vercel.app/api/marketing/behavior-summary
```
성공 기대:
- `hasLiveData: true`
- `storage.backend: "postgres"` · `persistentReady: true`
- `dataStatus.eventCount >= 2` · `dataStatus.sessionCount >= 1`
- `insights`가 null이 아님
- **response에 raw events 배열이 없음**
- **response에 `sessionIdHash`/`orderIdHash`/`eventId`가 없음**

## 4-10. 고객 행동 모달 확인 기준 (사용자 직접 눈검수)

- 고객 행동 분석 모달을 연다.
- live data가 있으면 **"실제 수집 데이터" 배지**가 보인다.
- **이벤트/세션 수**가 표시된다.
- **raw event table은 없어야** 한다.
- **`sessionIdHash`/`orderIdHash`/`eventId`는 보이면 안 된다**.
- live data가 없으면 **demo fallback**이 보여야 한다.

> ⚠️ Claude Code는 웹 눈검수를 하지 않는다. **사용자가 직접** 확인한다.

## 4-11. 실패 케이스와 대응

| # | 증상 | 가능 원인 |
|---|---|---|
| **A** | `storage.backend`가 `dev_buffer`로 나옴 | `GODO_BEHAVIOR_STORAGE_BACKEND`가 postgres 아님 / `DATABASE_URL`·`POSTGRES_URL` 누락 / Production 아닌 Preview env에만 등록 / **재배포 안 됨** |
| **B** | `persistentReady: false` | env 불완전 / storage backend 값 오타 / connection string 누락 |
| **C** | POST가 **403** | Origin allowlist 누락 / `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 테스트 도메인 없음 / **wildcard 사용 불가** |
| **D** | POST가 **400** | eventName/source allowlist 불일치 / 필수 필드 누락 / **PII key·value 감지** / batch 50개 초과 / 문자열 길이 초과 |
| **E** | POST가 **500 또는 저장 실패** | **table 미생성** / schema 불일치 / DB 권한 부족 / SSL 설정 문제 / `DATABASE_URL` 잘못됨 |
| **F** | summary가 `hasLiveData: false` | 아직 test event 없음 / 이벤트가 다른 환경에 저장됨 / range filter가 이벤트 제외 / dev_buffer 환경에서 serverless instance가 달라짐 |

> 참고: POST가 **E(저장 실패)** 여도 adapter는 **dev_buffer로 손실 없이 보존**하고 mode를 정직하게 `dev_buffer`로 표시한다(persistent 성공처럼 표시하지 않음). 이 경우 table 생성 여부(4-5)를 다시 확인한다.

## 4-12. 보안 체크리스트

- [ ] raw event GET API 없음
- [ ] `GET /api/marketing/behavior-events`는 **405 유지**
- [ ] summary API는 **aggregated insights만** 반환
- [ ] response에 **events 배열 없음**
- [ ] response에 **`sessionIdHash`/`orderIdHash`/`eventId` 없음**
- [ ] PII 필드 저장/표시 없음
- [ ] **wildcard origin 사용 안 함**
- [ ] DB connection string 문서/로그 노출 없음
- [ ] **자동 DDL 기본 비활성**
- [ ] test event cleanup은 **DB 콘솔에서 수동**

## 다음 단계

- 이 가이드대로 활성화 → **Godo Skin Integration Guide v0**(실 수집 시작) / **Period Filter Wiring v0** / **Live behavior UI polish v0.1**.
