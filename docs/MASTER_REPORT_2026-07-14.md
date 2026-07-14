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

## PART 4. 위치·참조
- **코드(현 main `9271805`)**: `services/bakedCropReader.ts`(isFrameYellow·deframe) · `bakedFlowConverter.ts`(convertBakedByCrop) · `flowCaptionService.ts`(rewriteFlowCaptions=단순형3) · `mainMallExcelParser.ts`(파싱·hasTypedText) · `components/EditorFlow.tsx:142`(분기) · `PreviewGodoFlow.tsx`(렌더).
- **실제 통이미지**: 버진루프 `test/버진루프.jpg`(=1591767619_0, 650×3029) · 트리니티 `test/트리니티.jpg`(=1614833663_0, 650×9354) · 옵션닛포리(단순형3) `1661580288_*`(590×4090, 개별컷).
- **입력 엑셀**: `test/설명용/새 폴더/`(단순형1_*·단순형2_버진루프/트리니티·단순형3_닛포리/옵션닛포리·복합형1_핑거위글).
- **메모리**: `converter-layout-detection-from-excel`(프레임 해결 반영) · `grounding-over-inherited-context`(넓힌 판정식이 손가락 파손→검증으로 잡은 게 오늘의 실증) · `converter-baked-flow-split-rules`.

---

*2026-07-14 완료: 파이프라인 지도 확정(simple2=baked/simple3=rewrite, 공용 FlowBlock) → 어제 미해결 노랑 사각프레임 실측(RGB230,219,86 sat144)·원인규명(GOLD 1D 한계)·수정(isFrameYellow+deframe)·Python 실측검증(7블록 프레임제거·빨강치수보존·살색무손상)·이식(tsc통과)·커밋푸시(9271805). 트리니티=프레임없어 no-op·경계 y≈3050. 미완=브라우저 E2E·혼합엑셀 배치·신뢰도/디버그UI(스테이징 명시). 시작규칙: 원본 확대 재관측.*
