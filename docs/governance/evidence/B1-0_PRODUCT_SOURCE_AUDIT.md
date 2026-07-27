# B1-0 — Preview/Production 상품 13건 출처 감사

작성일: 2026-07-27
브랜치: `codex/b1-0-product-source-audit` (`ae35e2b`에서 분기)
성격: **읽기 전용 조사.** 제품 코드·검사 로직·환경변수 변경 없음

---

## 0. 판정

### 13건의 출처 = **현재 Production에 설정된 real 모드 고도몰 Open API의 실제 응답**

`sourceType: api_proxy_real`은 애플리케이션 실행 경로와 일치한다. 시뮬레이션·fixture·mock이 주입된 것이 아니다.

새 판매몰 키가 아직 발급·등록되지 않았고, 시뮬레이션 카탈로그가 이 응답을 “시험몰 만료 직전”에 캡처했다고 기록하므로 **프로젝트 기록상 기존 시험몰 자료로 판단한다.** 다만 환경변수 값을 열람하지 않았고 관리자 계정 상태도 확인하지 않았으므로 계정 신원·만료 상태를 직접 증명한 것은 아니다.

### 다만 전제 하나가 사실과 다르다 — **시험몰은 아직 응답한다**

`CURRENT_STATE.md §3`은 "기존 시험몰은 만료됨(사용자 확인)"으로 기록돼 있으나, **2026-07-27 07:24~07:25 GMT 시점에 시험몰 Open API가 정상 응답했다.** 계정 만료와 Open API 접근 차단이 아직 분리되어 있거나, 만료가 아직 반영되지 않았다.

---

## 1. 배포 대상 고정

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 관측 대상 | **Production** `https://godo-psi.vercel.app` | 직접 HTTP GET |
| Production Source | `5190f68` · branch `main` · 배포 2일 전 | Vercel Deployments 목록 |
| 현재 local main | `ae35e2b` (A2 3커밋 앞섬, **미푸시**) | `git rev-parse main` |
| origin/main | `5190f685` | `git rev-parse origin/main` |
| 소스 동일성 | **Production은 local main과 다른 소스**(A2 3커밋이 아직 원격에 없음). 단 `api/godomall/products.ts`·`api/_shared/godomallResource.ts`는 A2에서 변경되지 않았으므로 **이 조사 대상 코드 경로는 동일** | `git diff 5190f685 ae35e2b -- api/` |

2026-07-27 최초 13건 관측은 Preview `838e2c4`(`fix/auth-foundation-01-red`)에서 있었다. 이번 재현은 Production `5190f68`에서 했고 **같은 결과**가 나왔다.

---

## 2. 코드 생산 경로 (producer → transformer → endpoint)

```
GET /api/godomall/products
  └ api/godomall/products.ts:8  handler
      └ resolveResource('products')                    api/_shared/godomallResource.ts:161
          ├ getGodomallConfig()                        godomallOpenApiClient.ts:29
          │    mode ← resolveGodomallMode()            secretGuard.ts:24  (GODOMALL_API_MODE, 기본 'mock')
          │
          ├ [분기 1] config.mode === 'mock'            godomallResource.ts:165
          │    → getMockRecords('products') = getProxyMockInventory()
          │    → source: 'api_mock_fallback', live: false
          │
          ├ [분기 2] !isLiveMode(config)                godomallResource.ts:177
          │    (mode!=='mock' 인데 partnerKey/userKey/baseUrl 미비)
          │    → source: 'unavailable', records: []
          │
          ├ [분기 3] fetchLiveRecords 성공              godomallResource.ts:180-190
          │    POST {activeBaseUrl}/goods/Goods_Search.php  {page:1,size:100}
          │    → parseGodomallXml → extractList(GOODS_LIST_KEYS) → mapGoodsToProducts
          │    → source: mode==='real' ? 'api_proxy_real' : 'api_proxy_sandbox', live: true
          │
          └ [분기 4] fetchLiveRecords throw             godomallResource.ts:191
               → source: 'unavailable', records: []
```

### 핵심 사실 3가지

1. **`api_proxy_real`을 할당하는 위치는 분기 3 단 한 곳**이다(`godomallResource.ts:187`). 조건은 **외부 HTTP 호출이 성공하고 XML 파싱이 ok이며 리스트 추출까지 끝난 뒤**다.
2. **실패 시 mock으로 떨어지는 경로가 없다.** 분기 4는 `unavailable` + `records: []`다. 파일 주석(`:49-51`)이 이를 명시한다 — *"`api_mock_fallback`은 이제 사용자가 명시적으로 시험(mock) 모드를 선택한 경우에만 쓴다"*.
3. **시뮬레이션 카탈로그는 이 경로에 진입할 수 없다.** `loadSimCatalogV1`은 `godomallResource.ts`에서 **단 1곳(`:465`)**에서만 쓰이며, 그것은 Sync All의 합성 주문 생성 경로다. `resolveResource`는 이를 참조하지 않는다.

**따라서 코드상 "mock/시뮬레이션 자료가 `api_proxy_real` 라벨을 달 수 있는 경로"는 존재하지 않는다.**
(단, 코드는 "가능한 경로"만 증명한다. 실제 출처는 §3·§4로 확정한다.)

---

## 3. 실제 관측 (읽기 전용)

관측 시각 **2026-07-27 07:24~07:25 GMT**, 대상 Production `godo-psi.vercel.app`.
모든 요청에 캐시 무효화 쿼리(`_cb`)와 `cache: 'no-store'`를 사용했다.

### 3-1. 캐시가 아님을 확인

```
GET /api/godomall/products?_cb=<random>
  x-vercel-cache : MISS
  age            : 0
  cache-control  : public, max-age=0, must-revalidate
  x-vercel-id    : icn1::iad1::hp58v-1785137084499-9e5b5fd7019d
  소요           : 1832 ms
```

**`MISS` + `age:0`**은 CDN 캐시 응답이 아니라 함수가 새로 실행됐음을 뜻한다. **1.8초 소요는 외부 왕복과 양립하는 보조 정황**이지만, 시간만으로 외부 호출을 단독 증명하지 않는다. 외부 호출 성공 판정은 §2의 코드 분기와 실제 `api_proxy_real` 응답을 함께 근거로 한다.

### 3-2. 라벨이 상태를 구분하는지 — 음성 대조

| 엔드포인트 | sourceType | 건수 | 소요 | 해석 |
|---|---|---|---|---|
| `/products` | **api_proxy_real** | **13** | 1888 ms | 실제 호출 성공 |
| `/inventory` | **api_proxy_real** | **13** | 3016 ms | products에서 파생(실제 호출) |
| `/orders` | **api_proxy_real** | **0** | 638 ms | **실제 호출 성공 + 진짜 0건** |
| `/inquiries` | **unavailable** | 0 | 220 ms | 미구현 — 외부 호출 없음 |
| `/reviews` | **unavailable** | 0 | 227 ms | 미구현 — 외부 호출 없음 |

**소요 시간이 그 자체로 증거다.** `unavailable`은 외부 호출 없이 즉시 반환(~220 ms)이고, `api_proxy_real`은 600~3000 ms의 왕복을 동반한다.

**`api_proxy_real`은 모든 응답에 붙는 무차별 라벨이 아니다.** 같은 코드가 같은 시점에 세 가지 상태(**실제 13건 / 실제 0건 / 연결 안 됨**)를 구분해 반환한다. 이는 헌법 §3이 요구하는 구분이 실제로 지켜지고 있음을 뜻한다.

### 3-3. 설정 상태 (이름·boolean만, 값 미출력)

`GET /api/godomall/health`
```
mode              : real
hasPartnerKey     : true
hasUserKey        : true
hasRealBaseUrl    : true
hasSandboxBaseUrl : true
productionLocked  : true
message           : "Live READ mode (real). Write actions remain disabled."
```
`GODOMALL_API_MODE = real` + 키 2종 존재 → `isLiveMode` 통과 → 분기 3 진입 조건 충족.
**환경변수 값은 확인하지 않았고 기록하지 않았다. 변경도 하지 않았다.**

---

## 4. 데이터 지문 비교

### 관측된 13건 (Production, 비민감 필드만)

```
productId: 1000000012, 1000000011, 1000000010, 1000000009, 1000000008,
           1000000007, 1000000006, 1000000005, 1000000004, 1000000003,
           1000000002, 1000000001, 1000000000
productName(앞 4): 테스트상품 · 스마트 에어 공기청정기 · 스마트 에코 음식물처리기 · 스마트 무선 청소기
```

### 후보별 대조

| 후보 | 건수 | 지문 일치 | 판정 |
|---|---|---|---|
| **시뮬레이션 카탈로그 v1** | 13 | **완전 일치** (`1000000012 테스트상품`, `1000000011 스마트 에어 공기청정기`, `1000000010 스마트 에코 음식물처리기` …) | **일치하지만 원인이 아니라 결과** ↓ |
| **mock fixture** (`mockProxyData.ts` `mockInventory`) | **4** | 불일치(`네츄럴 수분 크림 50ml` 등, productId 체계 다름) | **아님** |
| **새 판매몰** | — | API 키 미발급, 연결된 적 없음 | **아님** |
| **기존 시험몰** | 13 | 상동. 새 판매몰 키 미등록 + 캡처 매니페스트의 “시험몰 만료 직전” 기록 | **프로젝트 기록상 이것으로 판단** |

### 지문 일치의 방향 — 결정적 증거

`api/_shared/simCatalog/simCatalogV1.data.ts` 매니페스트가 자기 출처를 명시한다.

```
recordCount : 13
capturedFrom: '/api/godomall/products (Production, sourceType api_proxy_real)'
헤더 주석   : "확보: /api/godomall/products (Production, sourceType api_proxy_real) — 시험몰 만료 직전."
경계(불변)  : "실제 products/inventory 응답·실재고에 절대 주입하지 않는다."
```

**즉 인과 방향은 `시험몰 실제 응답 → 시뮬레이션 카탈로그`이지, 그 반대가 아니다.**
시뮬레이션 카탈로그는 시험몰이 만료되기 전 **이 엔드포인트에서 떠 온 사본**이므로 13건이 일치하는 것이 당연하다. "개수가 같다"가 아니라 **"카탈로그가 이 응답의 복사본"**이라는 것이 지문 일치의 설명이다.

코드 대조로도 뒷받침된다: `loadSimCatalogV1`은 `resolveResource`에서 호출되지 않는다(§2-3).

---

## 5. `sourceType` 정확성 판정

| 후보 | 판정 | 근거 |
|---|---|---|
| 실제 외부 고도몰 API 성공 | ✅ **이것** | 분기 3만이 이 라벨을 붙임 · 실제 응답이 `api_proxy_real` · `x-vercel-cache: MISS` · 같은 시점 `unavailable`과 구분됨 |
| 외부 호출 실패 후 fallback | ✗ | 실패 경로는 `unavailable`+0건. mock fallback 경로 없음 |
| 환경변수 미설정으로 mock | ✗ | `mode: real`, 키 2종 present |
| fixture·시뮬레이션 | ✗ | mock은 4건이고 이름 체계가 다름. simCatalog는 `resolveResource`에서 미참조 |
| 이전 배포·캐시 반환 | ✗ | `x-vercel-cache: MISS`, `age: 0`, 캐시 무효화 쿼리 사용 |

**`api_proxy_real` 라벨은 실제 생산 경로와 일치한다. 이번 작업에서 수정할 결함이 없다.**

---

## 6. 확인하지 못한 범위 (미확인)

1. **Vercel 함수 런타임 로그의 upstream 호출 원문** — 확인하지 않음. HTTP 응답 헤더·소요 시간·상태 구분으로 대체 증명했다.
2. **시험몰 계정의 실제 만료 상태** — 고도몰 관리자에서 확인하지 않았다. 관측된 것은 "Open API가 응답한다"는 사실뿐이며, 계정 만료와 API 차단 시점이 다를 수 있다.
3. **2026-07-27 최초 관측(Preview `838e2c4`) 시점의 응답 원본** — 그 시점 응답을 보존하지 않았다. 이번 재현은 **Production `5190f68`**에서 했다. 두 배포의 조사 대상 코드 경로는 동일하다.
4. **13건 중 나머지 9건의 상품명** — 앞 4건만 지문으로 대조했다. productId 13개는 전량 대조했다.
5. **시험몰과 새 판매몰이 같은 계정 체계인지** — 새 몰 키가 없어 비교 불가.

---

## 7. 결론을 바꿀 수 있는 남은 증거

- 고도몰 관리자에서 **시험몰 계정이 실제로 만료됐음이 확인**되고, 그럼에도 Open API가 응답한다면 → "만료된 몰이 API만 살아 있다"로 보강 필요
- Vercel 함수 로그에 **upstream 호출 기록이 없음**이 확인되면 → 이 판정을 재검토해야 함(현재 소요 시간과 캐시 헤더는 호출이 있었음을 지지)
- 새 판매몰 키가 등록된 뒤 같은 엔드포인트가 **다른 13건 또는 다른 건수**를 반환하면 → 현재 13건이 시험몰 것이었음이 추가 확인됨

---

## 8. 재현 명령

```bash
# 코드 경로
sed -n '160,195p' api/_shared/godomallResource.ts        # resolveResource 4분기
grep -n "loadSimCatalogV1" api/_shared/godomallResource.ts  # → :11 import, :465 사용(1곳)
grep -n "capturedFrom\|recordCount" api/_shared/simCatalog/simCatalogV1.data.ts
```

```js
// 실제 관측 (브라우저에서 godo-psi.vercel.app 열고 콘솔)
const r = await fetch('/api/godomall/products?_cb=' + Math.random(), { cache: 'no-store' });
const d = await r.json();
console.log(r.headers.get('x-vercel-cache'), d.sourceType, d.mode, d.records.length);
// 기대: MISS api_proxy_real real 13
```

---

## 9. 다음 한 작업

`CURRENT_STATE.md §3`의 "시험몰 만료" 서술을 관측 사실과 맞추고, **B-core-2 본작업(A/B 데이터 세계 차이 실측 → canonical snapshot provider)**으로 넘어간다.

시험몰 계정 만료 여부는 사용자 확인 사항으로 남긴다 — 만료됐는데 API가 열려 있는 것인지, 아직 만료되지 않은 것인지에 따라 **C단계(새 몰 검증) 착수 시점**이 달라진다.
