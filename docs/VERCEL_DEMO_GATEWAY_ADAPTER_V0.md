# Vercel Demo Gateway Adapter v0

> **한 줄**: Vercel Hobby의 "배포당 Serverless Function 12개" 제한 때문에 배포가 실패했다. 이를 **기능 삭제 없이** 풀기 위해, `/api` route **entry 파일 수만** 얇은 gateway adapter로 줄였다(14 → 9). 도메인 로직은 `api/_shared` service layer에 그대로 보존하며, **URL도 전부 유지**된다.

## 1. Vercel은 현재 최종 운영 인프라가 아니다

- **Vercel은 현재 데모/시연/브라우저 확인용 임시 배포 환경**이다. 최종 운영 인프라로 확정한 것이 아니다.
- 따라서 **Vercel Hobby의 12개 함수 제한에 GODO AI OS의 장기 아키텍처를 종속시키지 않는다.**
- 이번 수정은 "Vercel에 맞춰 프로젝트를 축소"가 아니라 **"Vercel 데모 배포용 얇은 gateway adapter"** 를 만든 것이다.

> **"Vercel Hobby limit은 현재 데모 배포 환경의 제약일 뿐이며, GODO AI OS의 장기 아키텍처를 이 제약에 종속시키지 않는다."**

## 2. 무엇이 문제였나

```
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

- Vercel은 `api/**/*.ts`(단 `api/_shared` 제외)를 각각 **하나의 serverless function**으로 센다.
- 마케팅 고객행동 작업에서 `behavior-events`, `behavior-summary` 2개 함수를 추가하며 **12 → 14**로 초과 → 빌드/배포 실패(프론트는 빌드돼도 함수 배포 단계에서 전체 실패 → 사이트 접속 불가).

## 3. 해결 — entry adapter 통합 (기능 통합 아님)

route entry는 줄이되 **내부 처리 로직은 보존**한다. Vercel **동적 라우트**를 써서 **URL을 그대로 유지**했다(프론트 호출부·문서 URL 변경 0).

| 통합 | 동적 라우트 (1 함수) | 흡수된 기존 entry | 보존된 로직 위치 |
|---|---|---|---|
| 마케팅 행동 | `api/marketing/[action].ts` | `behavior-events.ts`(POST) + `behavior-summary.ts`(GET) | validator / storage / summaryService (`api/_shared`) |
| 고도몰 READ | `api/godomall/[resource].ts` | `orders`/`inquiries`/`reviews`/`inventory`/`sales`.ts | `resolveResource` (`api/_shared/godomallResource`) |

- **URL 유지**: `POST /api/marketing/behavior-events`, `GET /api/marketing/behavior-summary`, `GET /api/godomall/{orders|inquiries|reviews|inventory|sales}` 모두 그대로 동작(동적 라우트가 마지막 경로 세그먼트로 분기).
- **정적 우선**: `health`/`products`/`orders-admin`/`orders-revenue`/`sync`/`read`는 정적 route로 유지(Vercel은 정적 route를 동적보다 우선 매칭).
- **응답 shape 동일**: 기존 UI가 읽는 데이터 모양을 바꾸지 않았다.

route 수: **14 → 9** (12 이하, 3슬롯 여유). `scripts/report-vercel-api-function-count.mjs`로 확인.

## 4. 책임 분리 (route adapter vs service layer)

- **domain/service layer** (`api/_shared`, `src/services`): 기능별로 자유롭게 확장한다. 함수 수 제한과 무관.
- **route adapter layer** (`api/**` entry): 배포 환경별로 **얇게** 구성한다. Vercel 데모에서는 동적 라우트로 entry 수를 줄인다.
- 새 기능 추가 시 **`/api` 파일을 무작정 늘리지 않는다** — 먼저 service layer에 만들고, 외부 진입은 gateway adapter(동적 라우트/`?resource=`/method 분기)를 통해 붙인다.

## 5. 미래 hosting 교체 가능성

- 도메인 로직이 service/shared layer에 분리돼 있으므로, **실제 런칭 시점에는 다른 hosting/runtime을 선택**할 수 있다 — Express / NestJS / Fastify / Cloud Run / Railway / Render / Fly.io 등.
- 그 환경에서는 함수 수 제한이 없으므로 route를 풍부하게 구성할 수도 있다(별도 production adapter). 이번 Vercel adapter는 **데모 배포용**일 뿐이다.

## 6. 이번 작업에서 하지 않은 것

- ❌ 기능 삭제 없음 (고객흐름 collect/summary, 고도몰 READ 모두 보존)
- ❌ response shape 임의 변경 없음 · UI 대규모 수정/UX polish 없음
- ❌ raw event GET API/response 없음 · tracker 자동 전송 기본값 변경 없음
- ❌ Vercel Pro 전제 없음 · Vercel 장기 종속 없음 · env/secret/DB/SQL/고도몰 WRITE 변경 없음
