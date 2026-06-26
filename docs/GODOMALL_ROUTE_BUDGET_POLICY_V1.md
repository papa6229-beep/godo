# GodoMall Route Budget Policy v1

> **작성일**: 2026-06-26 · **관련 코드**: `api/godomall/read.ts`(통합 READ 게이트웨이) + `api/_shared/godomallApiRegistry.ts`

## 1. 배경 — Vercel Hobby 함수 한도
- **Vercel Hobby 플랜은 한 배포당 Serverless Function 최대 12개**. 초과 시 배포가 실패한다(`No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`).
- 현재 12개(한도 도달):
  ```
  api/ai/chat.ts
  api/godomall/health.ts
  api/godomall/inquiries.ts
  api/godomall/inventory.ts
  api/godomall/orders.ts
  api/godomall/orders-admin.ts
  api/godomall/orders-revenue.ts
  api/godomall/products.ts
  api/godomall/read.ts         ← 통합 READ 게이트웨이
  api/godomall/reviews.ts
  api/godomall/sales.ts
  api/godomall/sync.ts
  ```

## 2. 핵심 원칙
1. **API route 파일을 무작정 늘리지 않는다.** 새 READ API는 **파일을 추가하지 말고** `api/godomall/read.ts` 게이트웨이에 `capability` 핸들러로 추가한다(파일 수 고정).
2. **고도몰 READ API는 통합 게이트웨이로 확장한다.** 호출 형태: `GET /api/godomall/read?capability=<id>&...`.
3. **WRITE API는 별도 Approval Runtime 전까지 route 생성 금지.** 게이트웨이도 WRITE/writeLocked capability는 403으로 거부한다.
4. **일회성 audit route는 필요할 때만 임시 생성하고 완료 후 즉시 제거**한다(예: `order-search-raw-audit.ts` — 실측 후 제거, 함수 슬롯 회수).

## 3. READ 게이트웨이 분기 정책 (`read.ts`)
| 상황 | 응답 |
|---|---|
| `capability` 누락 | 400 `MISSING_CAPABILITY` |
| Registry 미존재 capability | 400 `UNKNOWN_CAPABILITY` |
| WRITE / writeLocked capability | 403 `FORBIDDEN` |
| READ지만 핸들러 미구현 | 501 `NOT_IMPLEMENTED` |
| READ + 구현된 핸들러 | 200 (정규화 결과만, raw XML/키 미반환) |

- capability 검증은 `godomallApiRegistry`를 단일 진실로 사용.
- 현재 구현된 핸들러: `code_search`. (확장 placeholder: category_search/brand_search/board_inventory/board_list → 501)

## 4. 라이브 검증 (2026-06-26, Production)
```
/api/godomall/read?capability=code_search&codeType=claimCode      → 200 real (14건)
/api/godomall/read?capability=code_search&codeType=deliveryCompany → 200 real (7건)
/api/godomall/read?capability=category_search                      → 501 NOT_IMPLEMENTED
/api/godomall/read?capability=goods_stock                          → 403 FORBIDDEN
/api/godomall/read  (capability 누락)                              → 400
/api/godomall/codes (구 route)                                     → 404 (제거됨)
```

## 5. 함수 예산 운영 가이드
- 새 고도몰 READ 추가 절차: ① Registry capability 확인/추가 → ② `read.ts`의 `READ_HANDLERS`에 핸들러 추가 → ③ (필요 시) `api/_shared/godomall<도메인>.ts` mapper 추가 → ④ smoke 갱신. **route 파일은 추가하지 않음.**
- 함수 수가 다시 한도에 닿으면: ① 미사용 route 정리 ② 유사 route 통합(예: orders-admin/orders-revenue를 쿼리 분기로 합치는 안 검토) ③ Vercel Pro 업그레이드.
- WRITE 실행은 Approval Runtime(Phase 5~6) 도입 시 **별도 게이트웨이**(`write.ts` 등, 승인 게이트 포함)로 1개만 추가하는 방향.
