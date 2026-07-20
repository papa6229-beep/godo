# GODO 단순형 변환기 — 작업 보고 (2026-07-20)

> 다음 세션이 원본(코드·이미지)을 다시 보고 이어가게 하는 **지도**. 결론을 사실로 믿지 말고 원본 재관측부터.
> 작성: Claude Opus 4.8 · 확정자: 사장님(papa6229, 디자인 팀장).

---

## 0. 한 줄
오늘 main에 **구형 이미지경로 복구 + OPTION_PRESERVE(다옵션 통짜보존)** 확정. 이후 **텐가류(격자 있는 baked 통이미지)** 처리 시도: AI/shadow 프리뷰 접근은 과복잡으로 **폐기**, **결정론 `bakedGridConvert`(색-무관 테두리제거+셀컷+마케팅보존)** 로 전환해 EditorFlow에 연결. **배선은 되나 텐가 결과 미흡**(테두리 못 지움·하단 깨짐) — 원인은 "격자 선택" 오판. **합의된 다음 방향 = 격자 고르기 빼고 "전체 테두리부터 다 제거".**

---

## 1. Git 상태
- **main HEAD = `674c14f`** (origin 동기). 오늘 확정분 포함:
  - `e076316` 단순형 상세이미지 수집 경로 일반화(구형 `banana_img/product_image` 복구)
  - `e5beda2`·`f985913`·`674c14f`(merge) OPTION_PRESERVE v0
- **진행 브랜치 `feature/baked-grid-generalize`**(origin 푸시됨, **미머지**): `26e8cd2` bakedGridConvert.
- **폐기**: `research/flow-structure-shadow-phase1`·`research/flow-structure-understanding-phase0` (로컬·원격 삭제 완료).

---

## 2. main에 확정된 것 (안정)
### 2-1. 구형 이미지경로 복구 (`e076316`)
`mainMallExcelParser.ts`의 `isProductImage`를 `files/goodsm`만 인정→다신호로 일반화(깨진 `.jpgx` 제외·공통장식 `conf`/`k` 제외·소유경로 goodsm/product_image/상품번호 인정·그외 후보유지). 시엑스 7개 상세 복구. **기존 8샘플 수집결과 불변**(결정론 하네스 검증).

### 2-2. OPTION_PRESERVE (`674c14f`)
다옵션 업체 완성페이지(엑셀 복수옵션 + `hasTypedText=false` + 이미지≈옵션)를 simple2로 찢지 않고 **옵션 단위 통짜 보존**. `optionPreserveConverter.ts`(판정+블록), PreviewGodoFlow 전용 분기. 시엑스=OPTION_PRESERVE, 기존8=EXISTING_FLOW. **[[converter-option-preserve-mode]]**

### 2-3. 회귀 하네스
`scripts/flowRouteSmoke.ts`(Node v24 타입스트리핑, 실파서+판정). `node scripts/flowRouteSmoke.ts` → 시엑스만 OPTION_PRESERVE, 기존 EXISTING_FLOW 불변.

---

## 3. 진행 중 (feature/baked-grid-generalize)
### `services/bakedGridConvert.ts` (신규·결정론·AI 없음)
- 색-무관 기하(축소본 1500px 분석→좌표 원복): 얇은 선→가로선→격자밴드→세로선→셀.
- 규칙: **맨 아래 격자 = 상세(셀 컷+색무관 deframe, 코어 5%↓ 위험시 원본유지) · 그 위 = 마케팅 통짜 보존.** 격자 없으면 `null`.
- `cropDeframe`: 가장자리 연결 비배경을 셀변 6% 이내에서만 흰색화(색 안 봄). 제품 코어 보존율 게이트.
### `EditorFlow.tsx` 연결(좁게)
baked·simple1 행에서 격자 있으면 bakedGridConvert, 없으면 기존 simple1 raw. override 'simple1'이면 skip. **기존 무접촉**: 트리니티·버진루프(simple2), 롬프·스타킹·타액(격자없는 simple1), 닛포리·옵션닛포리·간호(HTML=fast), 시엑스(OPTION_PRESERVE), bakedCropReader·classify·simple1/2/3 내부.

---

## 4. 시도했다 폐기한 것 (교훈)
**AI 의미 플래너 + 인앱 shadow 프리뷰(Phase 0/1)** — Claude가 영역 역할(마케팅/상세) 판정 → executor 재구성. 색무관 기하·프레임제거·executor 배선은 자체검사로 검증됐으나:
- 텐가 라이브에서 Claude가 **전부 KEEP**(보존 과편향) + **계획이 세로 절반만 커버**(입력 과압축) → 실패.
- **결정적 교훈(사장님)**: 색·상품별 케이스로 공식화 금지. 이미 완성한 단순형이 **큰 줄기**, 새 상품은 그 **조합·변형**일 뿐. "테두리면 색 불문 지운다"처럼 **의도로 일반화**. **[[converter-generalize-by-intent]]**
- → 과복잡 AI/프리뷰 배선 전부 삭제, 결정론으로 회귀(§3).

---

## 5. 현재 텐가 상태 (⚠️ 미완·핵심)
- 결과물 `test/tenten.jpg`(=`테스트_텐가.xlsx` 변환, EditorFlow 실경로). 원본 1장 `banana_img/product_image/man/2439903_detail_20180720.jpg`(650×3486), hasTypedText=false, 옵션6.
- **문제**: ①하단 제품 셀의 **주황 테두리 안 지워짐** ②하단 깨짐 ③상단 마케팅만 보존됨.
- **원인(진단)**: bakedGridConvert의 "맨 아래 격자 선택" 휴리스틱이 텐가 다중격자(egg 라인업 여러 개 + 하단 제품격자)에서 **엉뚱한 격자(egg 라인업, '4셀 5열')를 골라** deframe을 거기 적용 → **실제 테두리 있는 하단 셀은 통짜로 통과**(테두리 잔존). 
- **핵심**: 테두리 제거 코드 자체는 됨(합성 자체검사·Phase0 주황 제거 검증). **"적용 위치"를 틀린 배선 실수.** 2열/1열은 문제 아님(사장님 확인).

---

## 6. 합의된 다음 방향 (사장님)
격자 고르기로 복잡하게 하지 말고:
1. **이미지 전체에서 테두리(색 불문) 다 제거** 먼저. ("테두리란 테두리 다 지워")
2. 그다음 마케팅(위)/상세(아래) 분리.
3. 2열 안 되면 트리니티처럼 1열로도 OK.
→ bakedGridConvert에서 "맨 아래 격자만 deframe" 빼고, **전체 프레임 라인 제거**로 단순화 검토.

---

## 7. 불변 원칙 (사장님 확정)
- 색·상품명·파일명·좌표 하드코딩 금지. 상품별 패치·새 flowMode·fixture 판정입력 금지.
- **기존 단순형(simple1/2/3·OPTION_PRESERVE)·기본형 동결** — 결과 안 깨지게. bakedCropReader·classify 내부 무수정.
- **의도로 일반화**(케이스 안 늘림). 되묻기 전 의도 추론. 크게 보고 쉽게.
- 신규 AI 호출 최소·비전 필수 아님(HTML로 되면 초고속 경로).

---

## 8. 검증된 것 / 미검증
- **검증(제가)**: tsc/build EXIT0 · 라우팅 스모크 PASS · bakedGridConvert가 실경로에서 텐가 크래시 없이 동작(Playwright, 키불필요) · 색무관 deframe·셀컷 로직(합성 자체검사 PASS: 2열 컷·주황 제거·제품손상0).
- **미검증(=다음 과제)**: 텐가 실물 **품질**(테두리 실제 제거·영역 정확도) — 격자 선택 오판으로 실패. 기존 대표샘플 시각 회귀(트리니티·버진루프 등)는 **눈검수 필요**(제가 헤드리스로 픽셀 확인 불가).

---

## 9. 위치·재확인법
- 코드: `services/bakedGridConvert.ts`(신규)·`components/EditorFlow.tsx`(가드 분기)·`services/mainMallExcelParser.ts`·`services/optionPreserveConverter.ts`·`components/PreviewGodoFlow.tsx`(렌더·수정금지 공용)·`services/bakedCropReader.ts`(simple2·동결).
- 원본이미지(CDN 재다운): 텐가 `cdn-banana.bizhost.kr/banana_img/product_image/man/2439903_detail_20180720.jpg`. 트리니티 `files/goodsm/2399106/1614833663_0.jpg`(1열 스택). 버진루프 `2397308/1591767619_0.jpg`(1열).
- 입력엑셀: `test/`(gitignore) — 테스트_텐가·트리니티·버진루프·닛포리·옵션닛포리·간호·롬프·스타킹·타액·시엑스.xlsx.
- 결과물: `test/tenten.jpg`(텐가 현재 결과·미흡), `test/시엑스_1.jpg`(OPTION_PRESERVE 결과).
- 테스트법(사장님): 디자인팀 → 단순형 변환기 → xlsx 업로드(플래그 없음, 실경로). 프리뷰 = `feature/baked-grid-generalize` 브랜치 배포.
- 메모리: [[converter-generalize-by-intent]] · [[converter-option-preserve-mode]] · [[converter-philosophy-testcase-not-deliverable]] · [[grounding-over-inherited-context]] · [[converter-baked-flow-split-rules]].

---
*2026-07-20 요약: main=구형경로복구+OPTION_PRESERVE 확정. baked 격자 재구성 시도(feature/baked-grid-generalize·미머지) — AI/shadow 폐기하고 결정론 bakedGridConvert로 전환·배선 완료했으나 텐가 격자선택 오판으로 테두리 못 지우고 하단 깨짐(tenten.jpg). 다음=격자선택 빼고 전체 테두리 제거 먼저. 원칙=의도로 일반화·기존 동결·케이스 안 늘림.*
