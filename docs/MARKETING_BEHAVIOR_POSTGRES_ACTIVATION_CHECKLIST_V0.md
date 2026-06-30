# Marketing Behavior Postgres Activation Checklist v0

> 실제 활성화 작업 시 **순서대로 체크**하는 짧은 목록. 상세 설명은 [MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) 참고.

## 1. DB 준비
- [ ] Postgres DB 생성 (Vercel Postgres / Neon / Supabase 등)
- [ ] `DATABASE_URL` 또는 `POSTGRES_URL` 확보 (secret — 문서에 적지 않기)
- [ ] DB 콘솔 접속 가능

## 2. Vercel env
- [ ] `GODO_BEHAVIOR_STORAGE_BACKEND=postgres`
- [ ] `DATABASE_URL` 또는 `POSTGRES_URL` 등록
- [ ] `GODO_BEHAVIOR_POSTGRES_TABLE` 확인(기본 `marketing_behavior_events`)
- [ ] `GODO_BEHAVIOR_ALLOWED_ORIGINS` 등록 (wildcard 금지)
- [ ] **Production env**에 들어갔는지 확인
- [ ] **재배포(redeploy)**

## 3. Schema
- [ ] [MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md) SQL 실행
- [ ] table 생성 확인
- [ ] `UNIQUE(shop_id, event_id)` constraint 확인
- [ ] indexes 확인

## 4. API 확인
- [ ] `GET /api/marketing/behavior-summary` 확인
- [ ] `storage.backend: "postgres"` 확인
- [ ] `persistentReady: true` 확인
- [ ] safe POST test event 전송 (eventId 유니크, PII 없음)
- [ ] summary `hasLiveData: true` 확인

## 5. UI 확인
- [ ] 고객 행동 분석 모달 열기
- [ ] "실제 수집 데이터" 배지 확인
- [ ] event/session count 확인
- [ ] raw event 노출 없음 확인(`sessionIdHash`/`orderIdHash`/`eventId` 미표시)

## 6. 정리
- [ ] `guide-test-` event cleanup 여부 판단(DB 콘솔에서 수동 DELETE)
- [ ] 다음 작업(Godo Skin Integration Guide v0)로 진행 여부 결정
