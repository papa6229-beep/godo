# GODO AI OS — 마스터 보고서 (2026-07-16)

> 이 문서는 "결론"이 아니라 **다음 세션이 원본(코드·이미지)을 다시 보고 이어가게 하는 지도**다.
> - 작성: Claude Opus 4.8 (1M) · 확정지시자: 사장님(papa6229, 디자인 팀장)
> - 상위 맥락: `MASTER_REPORT_2026-07-14.md`(단순형 완료·동결, 기본형 착수 핸드오프) → 오늘 **기본형 Phase 2 완성·main 확정 + 통합 변환기 기획 합의**.
> - **⚠️ 시작 규칙(유지)**: 이 문서의 "판단"을 사실로 믿지 말 것. 작업 시작 = **원본 코드·이미지를 먼저 열어 재관측**. 검증 가능한 것(픽셀·좌표·코드)만 주장. 보고서는 포인터+결정사실+검증법+열린질문.

---

## PART 0. 오늘 한 줄
기본형 변환기를 핑거위글 기준으로 **Phase 2 완성**(P0 TEXT차단 위에 5커밋: 패키지 여백정규화·바나나몰GIF배제+Point dedup·교차dedup·엑셀선택 자동실행·HERO 선정+영역정규화) → **main 머지·푸시 확정**(HEAD `5d45cf1`). 이어 **단순형·기본형 통합 변환기 로드맵 합의**(첫 상품이미지 상단 요약정보 구조로 SIMPLE/BASIC 자동분배, 기존 태거 재사용, 테스트-매트릭스-먼저). 분류 신호는 실측 검증(핑거위글 vs 버진루프).

---

## PART 1. main 확정 상태 (기준점)
- **main HEAD = `5d45cf1`** (origin 푸시됨). Phase 2 아크(위→아래 최신순):
  ```
  5d45cf1  feat: HERO 깨끗한 제품컷 선정 + 영역 정규화
  edcd514  feat: 엑셀 선택 후 AI 자동 실행(1회) + 재시도 UX
  cd9f1de  fix:  Point 01↔02 교차 이미지 중복 금지
  ed997d7  feat: 바나나몰 홍보 GIF 배제 + Point 이미지 고유 폴백(dHash)
  88d7423  feat: 패키지 이미지 여백 정규화 + 기준선 계측(dev)
  151f335  fix:  (P0) 기본형 TEXT 밴드 이미지 슬롯 차단(3중 방어)
  d1a2be2  (이전) 단순형 완료·기본형 핸드오프
  ```
- 각 커밋 tsc/build EXIT 0. **단순형·렌더러(PreviewGodo/PreviewGodoFlow/ThumbnailPreview/EditorFlow/DetailPageBuilder) 무변경** — 기본형 작업은 전부 기본형 전용 서비스 파일에만.
- 재확인법: `git log --oneline 151f335~1..5d45cf1`, `git show <hash>`.

---

## PART 2. 기본형 변환기 현재 파이프라인 (코드 지도)
진입: `DesignTeamDashboard` → "고도몰 상세페이지 생성기 > 생성기 열기"(=godo 기본형) → `DetailPageBuilder(layoutMode='godo')` → `Editor.tsx`의 `BasicConvertPanel`.

**엑셀 선택 = 원클릭 자동**(`Editor.tsx:onExcel`, edcd514): 파싱(`parseMainMallArrayBuffer`) → `buildBasicStructure`(AI없는 구조배치, `extractProductImages`) → **자동으로** `convertBasicWithAI`(로컬 input 직접전달, Claude 1회) → `onChange`로 `PreviewGodo`+썸네일 반영. 기존 ②버튼 = "🤖 AI 다시 읽기" 재시도. useEffect 감시 아님(StrictMode 안전).

**`convertBasicWithAI`(godoBasicConvert.ts) 순서**:
1. `splitImageByWhitespace`로 밴드 분할 + 밴드별 `promoFlags`(원본 URL이 바나나몰 홍보GIF인지) 병렬 추적.
2. `tagBasicBands`(basicBandTagger) → 밴드 타입 PHOTO/TEXT/MIXED/UNKNOWN + 지표 + dHash.
3. `readBasicLayout`(basicVisionReader, **Claude Opus `claude-opus-4-8` 1콜**) → 밴드에 타입/promo 라벨 붙여 전달, 슬롯 배정 JSON 반환.
4. **로컬 검증(Layer C)**: TEXT·promo 밴드는 모든 이미지 슬롯 차단. Point 이미지 dedup(dHash). HERO 클린 선정(`selectHeroIndex`).
5. **자산 정규화**: 패키지 여백 트림(`normalizePackageImage`) + HERO 영역 재구성(`normalizeHeroMainImage`).
6. 결과 → `data.mainImage/packageImage/...` (canonical field) → PreviewGodo·썸네일이 **자동 공유**(렌더러 무변경).

**밴드 타입 판정(basicBandTagger.ts, 실측 임계 — 핑거위글 21밴드 고정)**:
- 핵심 지표: `color`(유채색비율)·`largestCC`(최대 연결요소 면적)·`smallCC`(작은 글자형 CC 수)·`maxRowDark`·`fillRatio`(bbox 채움비=박스 판별)·`dhash`(9x8 difference hash).
- TEXT = largestCC<0.08 & smallCC≥12 & color<0.10 & white≥0.55 & maxRowDark<0.45 (여러줄 문단도 잡음; 기존 splitClassified의 h≤75 게이트는 못 잡던 것).
- 재확인법: dev 콘솔 `[기본형 태거]` 테이블. Python 재현은 PART 6.

**자산 정규화(basicAssetNormalize.ts)**:
- `normalizePackageImage`: 가장자리-연결 밝은 배경만 flood-fill 트림 → content bbox + 6% padding. 내부 흰색/글자/그림자 보존. (실측: 800×431→366×431, 여백 54%↓)
- `isBananamallPromoGif`: **복합조건** `.gif 확장자(원본 URL)` AND `가로형(W>H×1.2)` AND `4변 파란프레임(각 blueFrac≥0.50)`. ⚠️다운스케일이 얇은 프레임 희석 → `MAX_DIM 1000`(네이티브)+얇은엣지 필수. 실측 홍보GIF 4변 0.75~0.83 vs 제품/패키지 0.00. 모든 GIF 차단 아님(파란프레임만).
- `normalizeHeroMainImage`: 외곽 여백 트림 → 제품 bbox → **정사각(1:1) 우선** 캔버스에 제품 중앙·크게(제약변 86%). 세로형 제품(h/w>1.15)만 약세로 5:6~4:5. 가로 배너 금지. (실측: 800×349 납작밴드 → 1:1 1000×1000 중앙배치)

**HERO 선정(selectHeroIndex)**: 제외 = promo·TEXT·color>0.20(배너/합성/스펙)·smallCC>10(baked텍스트)·largestCC<0.12(제품작음)·**fillRatio>0.62(박스=패키지)**·package/sizeIndex와 dHash≤10(중복). 점수 = `largestCC·2 − color − smallCC·0.02 + 높이보정`. Claude main이 적격+feature와 다르면 존중, 아니면 최고점. feature와 dHash중복은 후순위(HERO≠FEATURE). feature 선정 로직은 무변경.

**Point dedup(godoBasicConvert)**: 같은 밴드 인덱스 재사용 금지 + **Point 01+02 전체에서 동일사진(dHash 해밍≤10) 1회만**(교차 중복도 금지). 폴백은 ±1~2에서 [차단X·미사용·어떤 Point와도 근접중복X·PHOTO/MIXED] 유일 후보만, 없으면 비움(캡션 유지).

---

## PART 3. 핑거위글 눈검수 통과 항목 (검증됨)
사장님 E2E 눈검수 순차 통과: ① 패키지 박스 프레임 꽉 참 ② 바나나몰 파란GIF 0 ③ Point 01·02 내부·교차 중복 0 ④ 엑셀 선택만으로 자동변환·재선택 정상 ⑤ HERO=요약정보 합성밴드 아닌 깨끗한 제품컷 ⑥ HERO 정사각·제품 중앙 크게(납작배너 아님) ⑦ 썸네일 동일 자산 공유·제품 안 작아짐·패키지 정상 ⑧ KEY FEATURE·SIZE·설명·빨강강조 유지. **신규 AI 호출 0(기존 1콜 유지)**.

⚠️ **한계 명시**: 이건 **핑거위글형 1구조** 성공일 뿐 기본형 완성 아님. 핑거위글 조합 = 패키지있음·옵션없음·깨끗한제품컷있음·특징사진다수·SIZE별도·바나나몰GIF존재. 다른 조합 미검증.

---

## PART 4. 통합 변환기 로드맵 (사장님과 합의 — 다음 큰 방향)
최종 목표: **엑셀 1개 업로드 → 상품별 자동 분류 → 단순형/기본형 엔진 자동 처리 → 상세+섬네일 → 검수**. 사용자는 유형 안 고름.

### 4-1. SIMPLE/BASIC 자동 분류 (업무 기준 확정, 구현 미착수)
- **기준**: 엑셀 상세HTML의 이미지 URL 중 **장식(banana_img/conf, 비-goodsm) 제외한 첫 실제 상품이미지**의 **상단에 "메인이미지+요약정보(제품스펙 표)" 구조가 있으면 기본형, 없으면 단순형**. 하나만 있으면 검수 필요.
- **실측 검증(핑거위글 vs 버진루프, 2026-07-16)**: 첫 상품이미지 상단밴드 = 핑거위글 color **0.591**·largestCC **0.695**(요약정보 분홍 스펙표=거대 단일CC) vs 버진루프 color 0.334·largestCC **0.153**(흰배경 제품컷). → **color 단독으론 못 가름(둘 다 컬러). largestCC가 핵심**. color+largestCC 조합이 이 둘은 가름.
- **⚠️ n=2 유보**: 흰배경 요약정보표(기본형인데 color 낮음)·컬러 마케팅배너(단순형인데 color 높음) 같은 반례 가능 → **대표 샘플로 임계 확정**하고, 안 되면 "요약정보 표 구조(라벨:값 행) 감지" 또는 애매→검수필요. **두 샘플 임계값 하드코딩 금지.**
- **재사용**: 단순형 라우팅 `hasTypedText`/`classifyBakedPattern` + 기본형 태거(요약정보 합성밴드 = HERO가 이미 제외하는 그 밴드). 복잡한 AI 분류기 안 만듦.
- URL 추출 검증됨: 상세HTML regex `src="..."` → `/files/goodsm/` 포함 & `banana_img` 제외 → 첫 것. (핑거위글 3개·버진루프 1개 정상 추출)

### 4-2. 기본형 출력 전략 (핑거위글=A만 검증, B/C/D 미착수)
- **A. 개별 사진 재구성형**(현재 v4 구조: HERO/KEY FEATURE/OPTION/Point01·02/SIZE) — 깨끗한 제품컷 충분할 때.
- **B. 업체 통이미지 보존형** — 롬프식 통이미지. Point로 억지 분해 금지, 원본 흐름 보존(폭·간격만). **의견: 새 PreviewGodo 모드보다 단순형 `PreviewGodoFlow` 재사용 + 기본형 헤더 조합이 빠를 수 있음**(샘플 보고 결정).
- **C. 업체 GIF·미디어 보존형** — 바나나몰 GIF만 제외, 업체 기능GIF 보존, GIF→정지이미지 강제변환 금지.
- **D. 혼합형** — 자산 역할별로 A/B/C 혼용.

### 4-3. 로드맵 순서 (합의)
1. ✅ 현재 기본형 main 머지(기준점) — **완료(`5d45cf1`)**.
2. **기본형 대표 샘플 선정**(사장님이 준비 중). 조합: 패키지없음/옵션적음/옵션많음/업체통이미지/GIF다수/혼합/섬네일애매/흰배경스펙표/세로or컬러제품/SIZE내장/누끼없음.
3. **현 코드 그대로 전량 변환 → 실패 지도 작성**(즉석 패치 금지, 상품별 성공/실패 기록).
4. **반복되는 시스템 문제만 공통 규칙으로** 수정(상품명 예외 금지).
5. 기본형 하위 전략(A/B/C/D·패키지·옵션·SIZE·HERO·섬네일) 완성.
6. **저장 구조(IndexedDB/Blob URL)** — 배치 전 필수(현재 base64 dataURL을 메모리에 쌓음 = 수십개+ 크래시 위험. 메모리상 localStorage 용량이 최대 블로커). 완료 상품 언로드.
7. 엑셀 업로드 통로 통합 + SIMPLE/BASIC 자동 분배 + 순차 처리.
8. 섬네일 상태(AUTO_READY/NEEDS_MANUAL/USER_REJECTED/MANUAL_DONE) + 디자인팀 대시보드 **정사각 섬네일 그리드 검수판**(한줄 6~7개, 휠 스크롤, 상태배지, 재작업/수동업로드).
9. 혼합 배치 검증: 10→30→50→100→전체(~1000). 상품간 데이터누수·실패격리·재개·성능.

### 4-4. 확정된 운영 원칙 (내 판단 아닌 사장님 합의)
- 상품명별 예외 패치 금지 — 판단은 **원본 구조** 기반.
- 기본형을 하나의 출력방식(Point 분해)으로 강제 금지.
- 단순형·기본형 엔진 **내부 분리 유지**(하나의 거대함수 금지). 통합 대상 = 업로드/분류/큐/상태/검수.
- 상세≠섬네일 성공 분리(섬네일 없다고 상세 실패 처리 금지).
- 섬네일 "빠른 성공 아니면 빠른 포기"(후보 여러개·AI 재호출·통이미지 억지분석 금지).
- 측정 후 최적화(성능은 나중, 정확·다양성·안정화 먼저).
- **단순형 완성·동결 — 기본형 때문에 단순형 변환코드 수정 금지.**

---

## PART 5. 다른 컴퓨터 시연 (확인됨)
- **프로덕션**: `https://godo-psi.vercel.app` 라이브(HTTP 200, /api 정상). main 푸시로 자동 재배포됨(대시보드에서 배포 커밋 `5d45cf1` 확인 권장).
- **시연 절차**: 링크 열기 → 앱 "관리자 설정 → AI 연결"에 **Claude API 키**(claude_api 슬롯) 붙여넣기 → 디자인팀 > 기본형 생성기 열기 → 엑셀 선택.
- **로컬 시연도 가능**: `git clone → npm install → npm run dev`(localhost:5173). `/api/ai/chat`·`/api/detail/image-proxy`가 `vite.config`의 dev 미들웨어로 로컬에서도 작동(Vercel 불필요).
- **⚠️ 걸림돌 3**: ① 인터넷 필수(CDN 이미지+Anthropic) ② **테스트 엑셀은 `test/`가 gitignore라 clone에 없음 — 파일 지참** ③ Claude 키에 **Opus 4.8(`claude-opus-4-8`) 접근권한** 필요(없으면 basicVisionReader `CONVERTER_MODEL` 교체).
- 변환기 경로는 **서버 env 변수 불필요**(Claude 키는 요청본문, 이미지프록시는 키없는 CDN).

---

## PART 6. 위치·참조·재확인법
- **코드(현 main `5d45cf1`)**:
  - `services/godoBasicConvert.ts`(convertBasicWithAI·buildBasicStructure·selectHeroIndex·Point dedup·검증)
  - `services/basicBandTagger.ts`(tagBasicBands·classifyBand·dhashHamming·fillRatio)
  - `services/basicAssetNormalize.ts`(normalizePackageImage·isBananamallPromoGif·normalizeHeroMainImage)
  - `services/basicVisionReader.ts`(readBasicLayout=Claude 1콜, 프롬프트 규칙6·7·모델 `claude-opus-4-8`)
  - `components/Editor.tsx`(BasicConvertPanel·onExcel 자동실행)
  - `services/flowImageSplitter.ts`(splitImageByWhitespace·extractProductImages·splitClassified — **공용·수정금지**)
  - `services/exportImagePrep.ts`(toProxyUrl=`/api/detail/image-proxy`)
- **원본 이미지(CDN, 재다운로드 가능)**: 핑거위글 첫이미지 `cdn-banana.bizhost.kr/files/goodsm/2479700/1667813618_0.jpg`(800×2693, 요약정보 합성) · `1667813619_1.gif`(800×450, 바나나몰 파란GIF) · `1667813619_2.jpg`(800×12272, 상세). 버진루프 `.../2397308/1591767619_0.jpg`(650×3029, 단순형2).
- **입력 엑셀**: `test/설명용/`(gitignore — 핑거위글.xlsx=기본형, 버진루프.xlsx=단순형, 기본형 개요.xlsx, 기본형의 구조 및 원본과 고도몰의 매칭관련.xlsx). ⚠️ 스크래치패드 진단산출물(cb_*.jpg 등)은 세션 임시 → 소멸. CDN에서 재다운 + Python 재현(splitImageByWhitespace 재현 + band_metrics)으로 재관측.
- **판정 임계값 근거**: 전부 핑거위글 실측(21밴드) 고정. 다른 샘플로 일반화 검증이 다음 과제(PART 4-3).
- **메모리**: `converter-layout-detection-from-excel` · `converter-baked-flow-split-rules` · `grounding-over-inherited-context` · `stability-audit-2026-07-09`(localStorage 블로커) · `godomall-detail-conversion-plan` · `converter-philosophy-testcase-not-deliverable`.

---

## PART 7. 다음 세션 즉시 착수
1. (사장님) 기본형 대표 샘플 엑셀 준비(PART 4-3 step2 조합).
2. **현 코드 그대로 샘플 전량 변환 → 상품별 성공/실패 실패지도** 작성(코드 수정 없이 관측부터 — 이게 규칙).
3. 반복 시스템 문제만 공통 규칙으로. SIMPLE/BASIC 분류 규칙(첫 상품이미지 상단 요약정보 구조)을 여러 샘플로 실측 확정(color+largestCC 조합, 반례 확인).
4. ⚠️ 시작 규칙: 원본(코드·CDN 이미지) 재관측부터. 핑거위글 성공을 기본형 완성으로 착각 금지.

---

*2026-07-16 완료: 기본형 Phase 2 5커밋(패키지정규화·GIF배제+Point dedup·교차dedup·자동실행·HERO선정+정규화) main 확정(`5d45cf1`, 단순형·렌더러 0변경, 신규AI 0). 통합 변환기 로드맵 합의(첫 상품이미지 상단 요약정보 구조로 SIMPLE/BASIC 분배·기존태거 재사용·테스트매트릭스먼저·엔진내부분리·섬네일 빠른포기·저장 IndexedDB·상품명예외금지). 분류신호 실측(핑거위글 color0.591/largestCC0.695 vs 버진루프 0.334/0.153, color단독 불충분·largestCC핵심·n=2유보). 시연=godo-psi.vercel.app + Claude키(Opus4.8) + 엑셀지참(test/ gitignore). 다음=기본형 샘플 실패지도.*
