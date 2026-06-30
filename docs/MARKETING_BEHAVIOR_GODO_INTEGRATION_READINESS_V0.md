# Marketing Behavior Godo Integration Readiness v0

> **한 줄**: 고객흐름 내부 배관은 거의 완성됐다. 이 문서는 **나중에 운영몰이 확정됐을 때** env / origin / tracker 삽입 / test event 검증만으로 빠르게 연결하기 위한 **설치 도면**이다. 지금은 실제 수집을 시작한 게 아니라 **Ready-to-Install** 상태다.

- 활성화: [Postgres Activation Guide](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) · [설치 체크리스트](./MARKETING_BEHAVIOR_GODO_INSTALLATION_CHECKLIST_V0.md) · [쇼핑몰 전환 runbook](./MARKETING_BEHAVIOR_SHOP_SWITCH_RUNBOOK_V0.md)

## 4-1. 문서 목적

- 현재 쇼핑몰은 **테스트몰**이다.
- 이 테스트몰이 운영몰이 될 수도 있고, **새 고도몰 쇼핑몰로 갈아탈 수도** 있다.
- 실제 오픈은 당장이 아니라 **12월 목표**다.
- 현재는 **실제 고객/광고/주문/외부 유입 데이터가 없다.**
- 지금까지의 고객흐름 작업은 실제 수집을 시작한 것이 아니라, **실운영 전 사전 배관 공사**다.
- 이 문서는 운영몰 확정 시 **연결 절차를 빠르게 수행하기 위한 설치 도면**이다.

## 4-2. 현재 완성된 배관 요약

```
고객 행동 발생 → tracker event 생성 → optional transport 전송
  → POST /api/marketing/behavior-events → validator / PII reject → storage adapter
  → dev_buffer 또는 Postgres → aggregate pattern builder
  → GET /api/marketing/behavior-summary → MarketingCustomerBehaviorModal
```

| 단계 | 상태 | 설명 |
|---|---|---|
| tracker event 생성 | 완료 | visit/landing/click payload 생성 가능 |
| optional transport | 완료 | 명시 transport가 있을 때만 전송(기본 전송 없음) |
| 수집 endpoint | 완료 | `POST /api/marketing/behavior-events` |
| PII 차단 | 완료 | forbidden key/value reject |
| storage interface | 완료 | dev_buffer / Postgres adapter 구조 |
| Postgres adapter | 완료 | env 활성화 시 persistent backend |
| aggregate builder | 완료 | 유입/경로/클릭/이탈 deterministic 집계 |
| summary API | 완료 | raw event 없이 aggregated insights만 반환 |
| modal live fallback | 완료 | live data 있으면 "실제 수집 데이터", 없으면 demo |

## 4-3. 현재 아직 하지 않은 것

- 실제 **운영몰 확정 안 됨**
- 실제 상품 등록/결제 연동 안 됨
- 실제 고객 유입 없음 · 실제 광고 없음
- 실제 고도몰 스킨 tracker **삽입 안 함**
- 실제 Postgres env 활성화는 사용자가 추후 직접
- 실제 **live event 수집은 아직 시작 전**

## 4-4. Readiness 판단

> **"고객흐름 파악을 위한 핵심 내부 배관은 준비 완료 상태다. 다만 실제 고도몰에 붙이기 위한 운영 설치 단계는 아직 실행하지 않았다. 따라서 현재 상태는 Live가 아니라 Ready-to-Install 상태다."**

상태 요약:
- ✅ **Demo Ready** — 모달이 데모 예시로 동작
- ✅ **Collection Pipeline Ready** — 수집/검증/저장/집계/summary 배관 완성
- ✅ **Postgres Activation Ready** — env+schema만 넣으면 영속화
- ✅ **Godo Installation Ready** — 스킨 삽입 절차 문서화 완료
- ⏳ **Live Collection Not Started** — 실제 수집은 운영몰 확정 후 시작

## 4-5. 두 가지 운영몰 시나리오

### 시나리오 A: 현재 테스트몰을 운영몰로 전환
- 기존 `GODOMALL_*` API key 유지 가능
- 테스트 상품 → 실제 상품으로 교체/업로드 · 결제수단 연동
- 실제 도메인 확정 → `GODO_BEHAVIOR_ALLOWED_ORIGINS`에 등록
- Postgres env 활성화 · 고도몰 스킨에 tracker 삽입
- test event로 검수 → 실제 광고/유입 시작 전 final smoke

### 시나리오 B: 새 고도몰 계정/새 쇼핑몰로 전환
- 새 Godomall API key 발급 → Vercel env `GODOMALL_*` 값 교체
- 새 쇼핑몰 도메인 확인 → `GODO_BEHAVIOR_ALLOWED_ORIGINS` 교체/추가
- shopId(tracking shop identifier) 결정
- Postgres table은 유지 가능하되 **shop_id로 분리**
- 새 몰 스킨에 tracker 삽입 → health / products READ / behavior summary 확인
- old 테스트몰 origin 제거 여부 판단

## 4-6. 바뀌는 것 vs 안 바뀌는 것

| 바뀔 수 있는 것 | 안 바뀌는 것 |
|---|---|
| GODOMALL API key | behavior event contract |
| Godomall base URL | send adapter |
| 쇼핑몰 도메인 | collection endpoint |
| allowed origin | validator |
| shopId | storage interface |
| 상품 데이터 | Postgres adapter |
| 결제 설정 | aggregation builder |
| tracker 삽입 위치 | summary API |
| Postgres env 활성화 여부 | modal live/demo fallback · PII 정책 · raw event 미노출 원칙 |

## 4-7. 실제 연결 순서 (권장)

1. 운영몰 결정
2. Godomall API key/env 확정
3. products READ health 확인
4. Postgres env 등록
5. schema SQL 실행
6. behavior summary API `persistentReady` 확인
7. allowed origin 등록
8. 고도몰 스킨에 tracker script 삽입
9. `data-godo-track` 속성 부여
10. safe test event 또는 실제 클릭 테스트
11. summary `hasLiveData: true` 확인
12. 모달 "실제 수집 데이터" 배지 확인
13. 광고/외부 유입 시작

## 4-8. 실제 고도몰 스킨 삽입 개념

> 이번 작업에서 **실제 코드를 삽입하지 않는다**. 어디에 넣어야 하는지 개념만 문서화한다.

- **공통 스크립트 삽입 영역 또는 스킨 공통 레이아웃**(head/footer/script 영역 후보)에 tracker bootstrap을 전체 페이지 공통으로 로드.
- 배너/카테고리/상품/장바구니/결제 시작/구매완료 페이지별로 이벤트 연결.
- 스킨 수정 전 **백업 필요**. 스킨별 DOM 구조가 다르므로 실제 적용 전 **눈검수 필요**.

> 주의: 확실하지 않은 고도몰 admin 메뉴명은 단정하지 않는다. "공통 스크립트 삽입 영역 또는 스킨 공통 레이아웃"처럼 표현한다.

## 4-9. data attribute 규칙

```html
<!-- 배너 -->  <a data-godo-track="banner" data-godo-banner-id="main-hero-01" data-godo-banner-name="메인 히어로 배너">
<!-- 카테고리 --><a data-godo-track="category" data-godo-category-id="new" data-godo-category-name="신상품">
<!-- 상품 -->  <a data-godo-track="product" data-godo-product-id="12345" data-godo-product-name="상품명">
<!-- 장바구니 --><button data-godo-track="cart">
<!-- 결제 시작 --><button data-godo-track="checkout">
```

주의(PII 금지):
- `name`/`email`/`phone`/`memberKey`/`orderNo` 같은 **PII 금지**.
- `productName`/`bannerName`/`categoryName`은 **공개 정보만**.
- `orderNo` 원문은 절대 data attribute에 넣지 않음.
- 구매완료 event가 필요하면 **`orderIdHash`만** 사용.

## 4-10. 페이지별 이벤트 기준

| 페이지/동작 | eventName | 연결 방식 |
|---|---|---|
| 첫 방문/랜딩 | `landing` | tracker bootstrap |
| 페이지 조회 | `visit` | tracker bootstrap |
| 메인 배너 클릭 | `banner_click` | `data-godo-track="banner"` |
| 카테고리 클릭 | `category_click` | `data-godo-track="category"` |
| 상품 상세 조회 | `product_view` | 상품 상세 페이지 context |
| 장바구니 클릭 | `add_to_cart` | `data-godo-track="cart"` |
| 결제 시작 | `checkout_start` | checkout button/page |
| 구매 완료 | `purchase` | `orderIdHash`/`revenue` only |
| 이탈 후보 | `exit` | session 마지막 이벤트 기반 집계 |

> `exit`은 브라우저 unload에 과도하게 의존하지 않는다. v0에서는 **집계 builder가 session 마지막 이벤트 기준으로 이탈 후보를 계산**한다.

## 4-11. 테스트 검수 순서

1. [Postgres Activation Guide](./MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md) 먼저 확인
2. `GET /api/marketing/behavior-summary` 확인
3. safe POST event
4. 실제 스킨 삽입 후 배너 클릭
5. summary `hasLiveData: true`
6. 모달 "실제 수집 데이터" 배지
7. **raw event 미노출** 확인
8. **`sessionIdHash`/`orderIdHash`/`eventId` 화면 미노출** 확인

## 4-12. Rollback / 비활성화 방법

- tracker script 제거 또는 비활성
- `GODO_BEHAVIOR_ALLOWED_ORIGINS`에서 해당 도메인 제거
- `GODO_BEHAVIOR_STORAGE_BACKEND`를 제거하면 **dev_buffer fallback**
- Postgres는 유지하되 새 이벤트 수집 중단 가능
- **raw event 삭제 API는 만들지 않음** — test data cleanup은 DB 콘솔에서 수동

## 4-13. 12월 오픈 전 체크포인트 (권장 준비 흐름)

> 날짜는 확정 일정이 아니라 권장 흐름이다.

- **7월**: 구조/문서/UX 정리
- **8~9월**: 상품팀/CS팀/마케팅팀 화면 고도화
- **10월**: 운영몰 후보 확정
- **11월**: 실제 DB/도메인/tracker 리허설
- **12월**: 오픈 전 final verification

## 다음 단계

- 운영몰 확정 시 [설치 체크리스트](./MARKETING_BEHAVIOR_GODO_INSTALLATION_CHECKLIST_V0.md) + [전환 runbook](./MARKETING_BEHAVIOR_SHOP_SWITCH_RUNBOOK_V0.md)대로 진행.
- 그 다음 **마케팅팀 대시보드 UX/UI 개선**으로 복귀.
