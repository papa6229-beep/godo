# GODO AI OS — 마스터 보고서 (2026-07-14)

> 이 문서는 "결론"이 아니라 **다음 세션이 원본을 다시 보고 이어가게 하는 지도**다.
> - 작성: Claude Opus 4.8 (1M) · 확정지시자: 사장님(papa6229, 디자인 팀장)
> - 상위 맥락: `MASTER_REPORT_2026-07-13.md`(통이미지 크롭 결정론 전환·사각 금색프레임 미해결) → 오늘 **그 프레임 해결**.
> - 지시서(단일 진실 공급원): 사장님 "단순형2 통이미지 상세페이지 변환기 안정화 및 혼합 엑셀 대응 기반 구축".
> - **⚠️ 시작 규칙(어제 배운 것 유지)**: 이 문서의 "판단"을 사실로 믿지 말 것. **작업 시작 = 원본 이미지를 먼저 열어 확대·재관측.** 검증 가능한 것(픽셀·좌표)만 주장.

---

## PART 0. 오늘 한 줄
어제 못 푼 **버진루프 통이미지의 "각진 노랑 사각 프레임"을 실측·해결**(커밋 `9271805`). 원인=현재 GOLD 판정이 sat≤120·전폭이라 sat≈144 밝은노랑 프레임을 못 잡던 1D 한계. Python cv2로 실제 이미지 픽셀 검증 후 프로덕션 `bakedCropReader.ts`에 이식. 지시서의 나머지(신뢰도·디버그UI·혼합엑셀 배치)는 스코프 명시하여 스테이징.

---

## PART 1. 검증된 사실 (재확인 방법 포함 — 이것만 믿을 것)

### 1-1. 파이프라인 지도 (코드 조사로 확정 — 지시서 Phase 0/1)
- **엑셀 업로드→파싱**: `EditorFlow.importExcel`(components/EditorFlow.tsx:99) → `parseMainMallArrayBuffer`(services/mainMallExcelParser.ts:166). **엑셀 1개당 상품 1개**(rows[1]만 읽음).
- **상세HTML 파싱**: `parseDetailStructure`(:115) → `DetailBlock[] {image,text,option}`. 상품이미지=URL에 `/files/goodsm/` 포함, 그 외(banana_img/conf)=공용배너→`excludedImages` 자동제외.
- **유형 분기**: `EditorFlow.tsx:142`에서 `hasTypedText`(DetailBlock에 text 있으면 true)로 갈림.
  - **true = 단순형3(분리형) 빠른경로**: `rewriteFlowCaptions`(flowCaptionService.ts:145) — 텍스트만, 비전없음, 0.5~1s.
  - **false = 단순형2(통이미지) 경로**: `convertBakedByCrop`(bakedFlowConverter.ts:91) → `readCropParts`(bakedCropReader.ts) — 결정론 픽셀분할+Claude가 캡션띠만 읽음.
- **공용 중간타입**: 두 경로 모두 `FlowBlock {id,image,caption?,option?}`(types.ts:14)로 수렴 → `PreviewGodoFlow`가 렌더, export는 DOM→JPEG(`html-to-image`).
- **재확인법**: 위 파일/라인 열어보기. `git show 9271805`.
- **결론**: 지시서의 "Simple2CompositeExtractor" 자리는 **이미 `convertBakedByCrop`가 존재**. 새 병렬 변환기 불필요 → 기존 baked 경로를 고쳐 재사용(지시서 §6/§23 준수). **엔지니어링 판단: from-scratch v2 아님**(잘 작동하는 캡션읽기·밴드병합·치수보존을 깰 위험 + 유일 블로커는 프레임뿐).

### 1-2. 어제 미해결 "사각 금색프레임" — 실측·해결 (커밋 `9271805`, 현재 main HEAD)
- **실측**: 버진루프 프레임 = **1px 밝은 노랑, RGB≈(230,219,86)·sat≈144, 각진(직각) 사각테두리**가 각 블록을 감쌈(옅은 크림 아님). y=1150 한 줄만 노랑·위아래 순백 = 진짜 1px 헤어라인.
- **원인**: `rowKind='GOLD'` 조건 `gold>=0.5 & sat≤120`이라 sat=144 노랑은 GOLD 아닌 PHOTO로 분류 → 밴드로 안 잘림. `cropPhoto` 좌우 바운딩이 노랑(비-흰)을 전경 포함 → 세로 rail이 크롭에 남음.
- **수정**(bakedCropReader.ts): `isFrameYellow`(밝은노랑만: `r>190,g>170,b<160,|r-g|<45,(r-b)>85,(g-b)>65`) 추가 → ① 좌우 바운딩에서 배경취급(크롭이 제품으로 조여짐) ② `cropBox(deframe=true)`로 제품크롭 내 잔여 노랑→흰색. 마케팅 크롭은 deframe 미적용(브랜딩 보존).
- **색 분리 근거**: `g>170`→빨강 치수선(G낮음) 배제, `(g-b)>65`→살색·주황(g-b 작음) 배제. **frame∩skin=0**(실측).
- **재확인법**: `git show 9271805`. `tsc -b` EXIT 0.

### 1-3. 프레임 수정 실측 검증 (Python cv2, 실제 프로덕션 이미지 = `test/버진루프.jpg`=`1591767619_0.jpg` 650×3029)
- 버진루프 7블록 전부 **노랑 프레임 4변 제거**.
- **빨강 치수선 전부 보존**: 145mm·65mm·55mm·60mm(블록2), 95mm·15mm·16mm·10mm·11mm·20mm(블록6).
- **살색·손가락·패키지(RIDE JAPAN 박스) 무손상**(넓힌 판정식은 손가락을 흰점으로 파손 → 되돌려 엄격판정식 채택. 검증으로 잡음).
- **재확인법**: 스크래치 하니스 `scratchpad/s2_frame.py`(엄격판정식)로 몽타주 재생성 → 눈으로 대조. (스크래치는 세션 임시 → 필요시 재작성.)

### 1-4. 트리니티(Test A) 지상검증
- 트리니티 = `test/트리니티.jpg`=`1614833663_0.jpg` 650×9354. **버진루프식 노랑 사각프레임 없음**(전폭노랑 행 0개) → 프레임 수정 **no-op(안전)**.
- **2차/3차 경계 = y≈3050**: 위=일본어 마케팅(캐릭터아트+스펙표+三面回転+녹색 일본어), "**모에 구멍 트리니티**" 한글 헤딩부터 3차(정면사진·72mm·145mm 빨강치수 블록).
- 기존 `readCropParts`의 leadEmpty 병합(일본어=캡션 빈 밴드들을 하나의 marketing으로 통째 보존)이 이 경계를 처리하도록 설계됨. **단, 캡션 빈/찬 판정은 Claude 패스가 해야 최종 확정**(오프라인 미검증분).
- **재확인법**: `test/트리니티.jpg` y=2350~3300 구간 확대.

---

## PART 2. ⚠️ 미완/스테이징 (지시서 대비 — 숨기지 않고 남김, §24.7)
1. **브라우저 E2E 미실행**: 실제 앱에서 엑셀 업로드→Claude 캡션읽기→렌더까지는 **라이브 Claude 키 연결(aiKeyVault)+dev 서버**가 필요해 이 세션서 미실행. 픽셀 로직은 Python으로 실측검증했고 프로덕션 이식은 충실한 번역+tsc통과. **사장님 눈검수 필요**: 앱에서 버진루프 변환 후 결과에 노랑 프레임 사라졌는지.
2. **혼합 엑셀 배치(§16/Test D)**: 파서가 상품 1개/파일(rows[1])만 읽음. 사장님 파일도 아직 1상품/파일 → 실제 다행(多行) 혼합엑셀 테스트 불가. 라우팅(hasTypedText 분기)은 상품단위로 이미 존재. 다행 파싱+상품별 상태(pending/converted/needs_review/failed)는 실제 혼합파일 수령 후 착수.
3. **신뢰도 점수·자동승인 게이트(§19)·디버그 이미지 UI(§18)**: 미구현. 오프라인 디버그 하니스(Python)만 존재.
4. **2열 셀 분리(§11.2)**: 버진루프·트리니티 3차는 1열 위주(트리니티 2열 net은 2차 마케팅=통째보존). 2열 3차 샘플 없음 → 미착수.
5. **트리니티 3차 캡션 정확도**: Claude 패스 실측(브라우저) 후 확인.

---

## PART 3. 내일/다음 착수 순서
1. (사장님) 버진루프·트리니티를 실제 앱에서 변환 → 결과 눈검수(프레임·치수·캡션). 문제 지점 캡처.
2. 트리니티 2차/3차 경계가 leadEmpty로 정확히 잡히는지 브라우저 결과로 확인. 어긋나면 "첫 한글캡션 밴드=3차 시작" 신호를 명시적 경계로 승격.
3. 혼합 엑셀 실파일 수령 시: 파서 다행화 + 상품별 상태/오류코드 + 실패격리(한 상품 실패가 배치 안 멈춤).
4. (선택) 신뢰도 게이트·디버그 이미지 프로덕션 노출.

---

## PART 5. P0.2 마감 보정 (사장님 결과 눈검수 후 · 커밋 `b4df38c`)
사장님 확인: **3차 금색 프레임 프로덕션에서 완벽 삭제됨**(오전 수정 실제 결과로 검증). 이어 지시서 v2(분석기 미변경·후처리+렌더만) 반영:
- **1-1. 짧은 검정 라벨 제거(신규 공통)**: 크롭 좌우 바운딩을 "비-흰"→"**컬러(프레임제외)**"로. 제품 옆 흰 갭으로 분리된 검정 라벨("「버진 루프」정면 사진" 등, 저채도)은 자동 제외, 빨강치수(고채도)·제품 내부 검정부(벌브/그림자)는 유지. 무채색 제품 폴백. **재확인**: Python cv2 색-바운딩 크롭 = 정면 라벨 제거·삽입 벌브·145/95mm 치수 보존.
- **1-2. 캡션에 읽힌 라벨 흡수**: bakedCropReader 캡션 프롬프트에 "「제품명」XX 사진/이미지" 라벨 제거/축약 규칙(새 AI콜 X·단순형3 프롬프트 미변경).
- **1-3. 이미지 크기 통일**: `FlowBlock.marketing` 플래그 전파 → 진짜 2차만 풀폭, **캡션 없는 3차 제품컷도 sized**(이게 "너무 크다"의 핵심 원인이었음). 비율별 폭 = 치수도표 82%(r≥1.65)·일반 사진 66%·세로 60%·2열 100%, 가운데정렬. **재확인**: 정적 HTML 리플리카+Playwright 스크린샷 = 사진 5장 66% 통일·치수 82%·라벨 없음·airy 간격(`scratchpad/web`).
- **1-4. 간격**: 블록↔블록 ~70px 점 구분선·2차/3차 mb-10·img→캡션 14px.
- **1-5. 1차 상단문**: 문장(다./요.) 단위 줄맞춤(결정론) + ##강조## 렌더 지원. (⚠️ 자동 강조어 선정은 오분류 위험이라 미적용 — 렌더 지원만.)
- **동결 준수**: 경계검출·블록분할·3차 프레임제거 미변경. **2차 마케팅 금색테두리 보류 유지**(3차 성공 불흔들).
- **미검증분(사장님 E2E 눈검수 필요)**: 캡션 라벨 흡수(라이브 Claude 프롬프트 반영)·트리니티 동일 적용(코드는 제품무관·동일 경로)·단순형3 회귀(2열은 폭 100% 유지라 무영향 예상).

---

## PART 6. 단순형3 2차 분리 + 썸네일 (커밋 `10a08f2`)
사장님 확인: 단순형2 트리니티·버진루프 **성공**. 이어 단순형3(닛포리·옵션닛포리) 테스트 이슈 수정(수정된 A안·비전 0콜).
- **2차 분리(회귀수정)**: P0.2의 marketing 플래그가 단순형3 캡션없는 2차를 sized/2열로 밀어넣던 회귀. **정규식 파서 결과에서 "첫 캡션 블록보다 앞의 선두 무캡션 이미지"만 `FlowBlock.preserved=true`**(뒤에 캡션 2개+ 이어질 때만). 렌더러가 3차 그리드/축소 배제·원본비율·중앙. **재확인**: opt닛포리 `_0` Playwright = 원본 590px 중앙(얇은 좌측조각 아님).
- **썸네일 상태누수**: `EditorFlow.importExcel`이 성공시에만 mainImage 세팅 → **import 시작 시 `mainImage:''` 리셋**. 후순위 옵션닛포리에 직전 썸네일 잔류 차단.
- **다중옵션 없음**: 기존 `autoPickThumbnail`(opt>=2→'') 유지(신규 없음).
- **썸네일 선정**: 후보=3차만(2차 제외), **캡션 의미 점수**(패키지 가점·사용/단면/치수 제외·동점시 선두). 유사도는 baked(캡션없음)에서만. **재확인**: 닛포리 실측 시뮬 → `1695191131_1.jpg`(_1 패키지) 선정.
- **미검증(사장님 E2E)**: 앱 실제 변환(닛포리 원격이미지+Claude 필요). 픽셀/로직은 오프라인 확인.

---

## PART 7. 단순형 최종 완료 상태 (정리 · 기본형 착수 전 기준선)
사장님 "통과" 확정. 오늘 커밋 아크(main HEAD `1060969`):
`9271805`(노랑 사각프레임 제거) → `b4df38c`(P0.2 라벨/크기/간격/1차줄맞춤) → `10a08f2`(단순형3 2차분리·썸네일 상태격리·캡션점수선정) → `7e32ebf`(POINT 구분·캡션 가운데정렬) → `e42e06d`(헤더강조·줄맞춤강화) → `86889e8`(단순형1 분류기·raw pass-through) → `56486d0`(줄맞춤 구조보존 A안·상태누수 전수제거·단순형1 썸네일 회귀복원) → `1060969`(2열 캡션 text-wrap:balance).

### 파이프라인 라우팅(현재 · 동결)
- 진입: `EditorFlow.importExcel` → `parseMainMallArrayBuffer`(상품1개/파일, `/files/goodsm/`만 상품). `hasTypedText`(캡션 유무)로 1차 분기.
- **hasTypedText=true → 단순형3**: `rewriteFlowCaptions`(텍스트 배치, 비전0). 선두 무캡션=2차 `preserved`. 2열/1열 `detectColumns`.
- **hasTypedText=false → `classifyBakedPattern`**(로컬픽셀, PHOTO밴드≥5 & TEXT비율<0.25):
  - **simple2**: `convertBakedByCrop`→`readCropParts`(결정론 분할·노랑프레임 제거·좌우 라벨 컬러바운딩 제외·빨강치수 보존).
  - **simple1**: raw pass-through(원본 이미지 `preserved`, 분할·읽기·OCR 없음). 극단긴(h/w>8) 썸네일 unavailable.
  - override 백도어: `localStorage.godoConverterOverride`='simple1'|'simple2'.
- 공용: 타입 `FlowBlock{image,caption?,option?,marketing?,preserved?}` → 렌더 `PreviewGodoFlow` → export DOM→JPEG. 헤더 강조 `rewriteHeaderText`(상품당 1콜).
- 렌더 규칙: 이미지 비율별 폭(치수82/일반66/세로60/2열100)·중앙. 구분=옵션상품 OPTION헤더/무옵션 POINT넘버. 캡션 가운데+`text-wrap:balance`. 줄맞춤 `breakByFlow`(불릿통째·치수nbsp원자·스펙행·문장단위, 기계분절 없음).

### 검증 상태
- 7샘플(롬프·스타킹·타액·버진루프·트리니티·닛포리·옵션닛포리)+간호 이미지부 사장님 통과. 텍스트 줄맞춤·상태누수·썸네일 회귀 수정 완료(로직·픽셀·Playwright 검증; 앱 실제 연속변환은 사장님 E2E).
- **동결(건드리지 말 것)**: classifyBakedPattern·임계값·simple1 raw·simple2 분할·simple3·이미지 크기/순서/경계.

### 열린 항목(나중)
- 롬프류 썸네일 crop-fallback(유사 긴 마케팅 통이미지 10+ 샘플 확보 후 임계값 검증).
- 혼합 다행 엑셀 배치(현재 1상품/파일; 파서 다행화+상품별 상태/실패격리).
- **기본형**(다음 주제): 메모리상 "단순형과 데이터접근 동일·출력 레이아웃만 다름·헤딩 감지 자동변환". 착수 전 사장님 "기본형 고려사항" 정리 수령 예정.

---

## PART 8. 다음 세션 = 기본형 작업 (핸드오프 · git 검증됨)
사장님 확정: **단순형 완성**. 다음은 **기본형 변환기**를 단순형처럼 "원본 다양성 대응 + 신규 고도몰 레이아웃"으로 완성 → 최종 단순형과 통합. **⚠️ 시작 규칙: 아래를 사실로 믿지 말고 원본(코드·이미지) 재관측부터.**

### 8-1. 기본형은 단순형과 완전 분리(안전)
- **수동 버튼 선택**(자동 아님): `DesignTeamDashboard.tsx`에 3버튼 → **'godo'=기본형**(PreviewGodo+Editor+godoBasicConvert, 기본값) / **'godoFlow'=단순형**(PreviewGodoFlow+EditorFlow+flowCaptionService) / bananamall. `DetailPageBuilder`가 layoutMode로 렌더러 분기.
- **렌더러 별개 컴포넌트** → 기본형 작업이 단순형에 영향 0. git 검증: 내 07-13/14 단순형 수정이 만진 공유파일(`basicVisionReader`·`flowImageSplitter`·`types`)은 전부 **단순형 전용 심볼에만 additive**, 기본형 호출함수(`readBasicLayout`·`splitImageByWhitespace`·`extractProductImages`·ProductData 기본형필드) 무변경. `PreviewGodo.tsx`는 07-11 커밋 `2827d52` 이후 무변경.

### 8-2. ⚠️ 전제 교정 (중요)
- **`test/godo_pinger_v4_full.jpeg`는 앱 출력이 아니라 Python POC**(손타이핑+수동 밴드슬라이스, `test/_gen_poc*.py`·`_pinger_bands/`). 07-11 앱 변환기는 통째 revert(백업 브랜치 `backup/inapp-pipeline-20260711`). **현 앱 변환기 = 07-13 재작성본**(`godoBasicConvert.ts`+`readBasicLayout`). → "07-11로 되돌릴 것" 없음. 렌더러(레이아웃)는 이미 v4 목표; **변환기만 미완성**.
- blanket revert 금지(단순형 의존 `splitClassified`/`readBakedFlow`/`flowBlocks` 삭제됨).

### 8-3. 현재 기본형 실제 문제 (재확인: `test/설명용/새 폴더/detail_page_핑거 위글_전립선 마사져.jpg`)
- 골격 정상(메인/요약정보/KEY FEATURE/Point01·02/SIZE), AI 설명 **좌측정렬 깔끔**(PreviewGodo `renderPoint` p maxWidth420·text-center 아님, `PreviewGodo.tsx:260-274`).
- **핵심 버그 = 캡션 중복**: Point 설명이 [좌측 AI버전] + [바로 아래 **가운데정렬 박스 중복본**](문구 미묘히 다름=원문 vs 리라이트) 두 번. 이게 사장님이 본 "단순형 섞임". **중복 박스 출처는 코드로 확정 필요**(godoBasicConvert가 원문/텍스트-이미지를 desc와 별도 슬롯에 또 넣는 것으로 추정).

### 8-4. 기본형 개요 핵심 (`test/설명용/기본형 개요.xlsx`)
- 하위 2종: 통이미지형/분리형. **단순형과 차이 = 메인이미지 + 제품스펙(요약정보) 존재**. 최상단 직접입력텍스트만 단순형과 동일, 그 아래론 직접입력텍스트 없음.
- 기본 요소: 메인이미지/제품스펙/특징설명 이미지+텍스트(배치 다양·텍스트없이 롬프식 통이미지만인 경우도)/사이즈이미지. 패키지·옵션 있을 수 있음. **GIF 중 가로형·파란테두리(바나나몰 표기) 제외**. **섬네일=메인(2단컬러 누끼) 부적절→특징 누끼컷 권장**.

### 8-5. 다음 스텝(제안 순서)
1. `godoBasicConvert.ts`·`readBasicLayout`(basicVisionReader)·`PreviewGodo.tsx` 정독 → **가운데 박스 중복 출처 확정**.
2. current↔v4 delta 표 작성(중복/텍스트품질/소제목/구조).
3. 우선순위: 중복 제거 → 텍스트 라이트리라이트(단순형 방식 기본형 전용 재사용) → 원본 다양성(통/분리·GIF·패키지·옵션·섬네일 누끼) 대응. Playwright 반복검증, 단순형 무영향.
- v4 구조·A기본값 기록 = `docs/MASTER_REPORT_2026-07-11.md`(godoSpacing section56/element52/heading10, Point maxW420, SIZE weight pill 등).

---

## PART 4. 위치·참조
- **코드(현 main `9271805`)**: `services/bakedCropReader.ts`(isFrameYellow·deframe) · `bakedFlowConverter.ts`(convertBakedByCrop) · `flowCaptionService.ts`(rewriteFlowCaptions=단순형3) · `mainMallExcelParser.ts`(파싱·hasTypedText) · `components/EditorFlow.tsx:142`(분기) · `PreviewGodoFlow.tsx`(렌더).
- **실제 통이미지**: 버진루프 `test/버진루프.jpg`(=1591767619_0, 650×3029) · 트리니티 `test/트리니티.jpg`(=1614833663_0, 650×9354) · 옵션닛포리(단순형3) `1661580288_*`(590×4090, 개별컷).
- **입력 엑셀**: `test/설명용/새 폴더/`(단순형1_*·단순형2_버진루프/트리니티·단순형3_닛포리/옵션닛포리·복합형1_핑거위글).
- **메모리**: `converter-layout-detection-from-excel`(프레임 해결 반영) · `grounding-over-inherited-context`(넓힌 판정식이 손가락 파손→검증으로 잡은 게 오늘의 실증) · `converter-baked-flow-split-rules`.

---

*2026-07-14 완료: 파이프라인 지도 확정(simple2=baked/simple3=rewrite, 공용 FlowBlock) → 어제 미해결 노랑 사각프레임 실측(RGB230,219,86 sat144)·원인규명(GOLD 1D 한계)·수정(isFrameYellow+deframe)·Python 실측검증(7블록 프레임제거·빨강치수보존·살색무손상)·이식(tsc통과)·커밋푸시(9271805). 트리니티=프레임없어 no-op·경계 y≈3050. 미완=브라우저 E2E·혼합엑셀 배치·신뢰도/디버그UI(스테이징 명시). 시작규칙: 원본 확대 재관측.*
