# Marketing Behavior Godo Installation Checklist v0

> 실제 운영몰에 연결할 때 **순서대로 체크**하는 문서. 상세 도면: [Integration Readiness](./MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md) · 전환: [Shop Switch Runbook](./MARKETING_BEHAVIOR_SHOP_SWITCH_RUNBOOK_V0.md) · 활성화: [Postgres Activation Guide](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md).

## 5-1. 운영몰 결정
- [ ] 현재 테스트몰을 운영몰로 전환할지 결정
- [ ] 새 고도몰 계정을 사용할지 결정
- [ ] 운영 도메인 확정
- [ ] shopId 표기 규칙 결정

## 5-2. Godomall API
- [ ] `GODOMALL_*` env 확인
- [ ] API health 확인 (`/api/godomall/health`)
- [ ] products READ 확인
- [ ] 주문/문의/리뷰 등 후속 READ 범위 확인

## 5-3. Postgres
- [ ] Postgres DB 생성
- [ ] env 등록 (`GODO_BEHAVIOR_STORAGE_BACKEND=postgres` + `DATABASE_URL`/`POSTGRES_URL`)
- [ ] schema SQL 실행 ([schema](./MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md))
- [ ] `persistentReady: true` 확인
- [ ] safe POST test event 확인

## 5-4. Origin
- [ ] `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 실제 도메인 등록
- [ ] **wildcard 사용 안 함**
- [ ] 테스트 도메인 / 운영 도메인 구분

## 5-5. Skin / tracker
- [ ] 스킨 백업
- [ ] 공통 스크립트 삽입 위치 확인(공통 레이아웃)
- [ ] tracker bootstrap 삽입
- [ ] transport endpoint 확인 (`/api/marketing/behavior-events`)
- [ ] 자동 전송 기본값/명시 활성화 여부 확인 (기본은 전송 없음 — transport 명시 시에만)

## 5-6. DOM tracking
- [ ] 메인 배너 `data-godo-track="banner"`
- [ ] 카테고리 `data-godo-track="category"`
- [ ] 상품 상세 `product_view` context
- [ ] 장바구니 `data-godo-track="cart"`
- [ ] 결제 시작 `data-godo-track="checkout"`
- [ ] 구매완료 `purchase` (orderIdHash/revenue only)
- [ ] **PII 없는지 확인** (name/email/phone/memberKey/orderNo 금지)

## 5-7. 검수
- [ ] `behavior-events` POST 200 / accepted 확인
- [ ] `behavior-summary` `hasLiveData: true`
- [ ] 모달 "실제 수집 데이터" 배지
- [ ] **raw event 노출 없음**
- [ ] `sessionIdHash`/`orderIdHash`/`eventId` 표시 없음
- [ ] demo fallback 정상

## 5-8. 운영 전 봉인
- [ ] 실제 광고 시작 전 final test
- [ ] test event cleanup 여부 판단(DB 콘솔 수동)
- [ ] rollback 방법 확인 ([Readiness 4-12](./MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md))
- [ ] 담당자 메모
