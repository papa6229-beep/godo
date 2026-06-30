# Marketing Behavior Shop Switch Runbook v0

> 테스트몰을 그대로 쓸지, 새 쇼핑몰로 갈아탈지 **아직 모르는 상태**를 대비한 전환 runbook. 도면: [Integration Readiness](./MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md) · 설치: [Installation Checklist](./MARKETING_BEHAVIOR_GODO_INSTALLATION_CHECKLIST_V0.md).

## 6-1. 이 문서가 필요한 이유
- 현재 쇼핑몰은 **테스트몰**이다.
- 운영몰 후보가 **아직 확정되지 않았다**.
- 어떤 몰을 선택하든 **교체 지점을 명확히** 하기 위함이다.

## 6-2. 시나리오 A — 테스트몰을 운영몰로 전환
- [ ] 현재 `GODOMALL_*` env 유지 여부
- [ ] 테스트 상품 제거 / 실상품 등록
- [ ] 결제수단 연동
- [ ] 운영 도메인 확정
- [ ] `GODO_BEHAVIOR_ALLOWED_ORIGINS` 업데이트
- [ ] Postgres `shop_id` 결정
- [ ] test behavior events cleanup 여부
- [ ] dashboard demo/live 표시 확인

## 6-3. 시나리오 B — 새 쇼핑몰로 전환
- [ ] 새 고도몰 API key 발급
- [ ] Vercel `GODOMALL_*` env 교체
- [ ] 새 쇼핑몰 base URL / 도메인 등록
- [ ] products READ health 확인
- [ ] `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 새 도메인 추가
- [ ] 기존 테스트몰 origin 제거 여부 결정
- [ ] `shopId` 변경
- [ ] Postgres table 재사용 여부 결정 (shop_id로 분리 가능)
- [ ] 새 스킨에 tracker 삽입

## 6-4. 교체 후 확인할 것
- [ ] `/api/godomall/health`
- [ ] products READ count
- [ ] `/api/marketing/behavior-summary`
- [ ] safe POST event
- [ ] `MarketingCustomerBehaviorModal`
- [ ] raw event 미노출

## 6-5. 절대 하지 말 것
- API key를 **코드에 하드코딩 금지**
- secret을 **문서에 남기기 금지**
- **wildcard origin 금지**
- **raw event GET API 생성 금지**
- 고객 **PII를 tracking attribute에 넣기 금지**
