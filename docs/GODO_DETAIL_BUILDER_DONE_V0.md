# 하위 프로젝트 [1] 고도몰 전용 상세페이지 생성기 — 완료 기록 (DONE V0)

> 완료 2026-07-08 · Claude Opus 4.8(1M) · 확정지시자 사장님(papa6229)
> 상위: `GODO_DETAIL_RENEWAL_PROGRAM_V0.md`(마스터 기획) · 정본 스펙: `test/예제.jpg`, `test/가이드.jpg`, `test/고도몰 상세페이지 생성기 가이드.md`

## 왜 (목적)
고도몰 대량 상세페이지 리뉴얼·자동변환의 **출력 그릇이자 검수 콘솔**을 먼저 구축. 이 생성기는
①제로부터 신규 상세페이지 수동 제작 ②메인몰 상세페이지 자동변환 결과의 확인·수정, **두 역할을 겸함.**

## 무엇을 (완성물 — 페이즈별)
- **[1.1] 배관·공존**: `ProductData.keyFeatures`(3블록) 모델 추가. `DetailPageBuilder`에 `layoutMode('bananamall'|'godo')` prop → Editor/Preview/Thumbnail 분기. 디자인팀 대시보드에 **생성기 2개 진입**(고도몰/메인몰) + 헤더 모드 배지. 기존 바나나몰 모드 **회귀 0.**
- **[1.2] Editor 고도몰 모드**: `AI 생성 참고용 핵심 요약` 단일칸 → **메인특징1/2/3(직접입력 필수) + 특징설명(AI 생성 가능) 3블록.** 동영상 삽입 업로더 **숨김**(필드·바나나몰 모드는 유지). `geminiService`: 메인특징 title을 **AI 핵심 참고**로 주입 + `[KEY#]` 항목별 설명 생성/추출 + KEY FEATURE 이미지 vision(`[KEYIMG]`).
- **[1.3] PreviewGodo 레이아웃 본체**: 신규 `PreviewGodo.tsx`(격리, 기존 `Preview.tsx` 무손상). 예제.jpg 충실 재현 —
  제조사(우상단 고정) · 메인이미지(700) + 패키지 오버레이(드래그, 하단 `package desing` 흑색바) · 상품명(블랙 Black)+영문명(1차) · 스펙 5열(라벨●/구분선/값, 채워진 것만) · KEY FEATURE(●+대형제목+featureTitle 부제+좌 이미지·우 3항목 회색패널) · 영문명 반복 마퀴밴드(2차) · OPTION CHECK(●+제목+옵션카드 자동 가로정렬+흑색 옵션명바) · Point01/02(●+제목+부제+설명+이미지 700) · SIZE(제목+오차문구●+이미지+WEIGHT필) · footer. 폰트 Pretendard(Black/Bold/Medium), 액센트=themeColor 점.
- **[1.4] 브랜딩·섬네일 정합**: 하드코딩 바나나몰 → **`GODO_BRAND` 단일 소스**(footer + 섬네일 오버레이 공용). 섬네일 4프리셋 모두 고도몰 브랜딩.

## 파일
- 수정: `detailBuilder/types.ts`·`constants.ts`(keyFeatures) · `DetailPageBuilder.tsx`(layoutMode 분기·PreviewGodo 마운트) · `components/Editor.tsx`(3블록·동영상 숨김) · `components/Preview.tsx`(props) · `components/ThumbnailPreview.tsx`(브랜딩) · `services/geminiService.ts`(keyFeatures AI) · `DesignTeamDashboard.tsx`(2진입)
- 신규: `components/PreviewGodo.tsx`

## 검증
- `tsc -b` 0 · `vite build` green(각 페이즈).
- Playwright(로컬 dev, 실제 상품사진 시드 = reborn.html base64): 생성기 2개 공존·고도몰 배지·3블록 Editor·동영상 숨김·전체 레이아웃(히어로/KEY FEATURE/마퀴/옵션/Point/SIZE) 예제 대조 일치·섬네일 고도몰 브랜딩·**콘솔 에러 0.**
- main push: 배관 `3a9c187` → Editor `00953a1` → PreviewGodo `c28f57a` → 브랜딩(본 커밋).

## 확정된 설계 결정 (일임받아 확정)
1. **공존 = 공유코드 + layoutMode**(풀 클론 대신 모드 분기·PreviewGodo 격리). 2. 핵심요약 → KEY FEATURE 3항목 통합(히어로 3줄·단일 특징설명 제거). 3. 옵션 = **자동 가로정렬**(godo). 4. 패키지=메인 위 드래그 / 제조사=고정. 5. 동영상 비활성. 6. 영문명 2곳. 7. 상품명=블랙, 액센트=themeColor.

## 알려진 후속·플레이스홀더 (비차단)
- ⚠️ **`GODO_BRAND` 플레이스홀더**(footerName 'GODO MALL' / thumb '고도몰'·'godomall.co.kr'·'SINCE 2026'·'프리미엄 셀렉트 스토어'): 사장님 확정 시 `PreviewGodo.tsx` 한 곳 교체.
- Point 하위블록(2·3)은 개별 소제목 없이 설명+이미지로 렌더(예제의 2번째 소제목형은 데이터 필드 없음 → 필요 시 후속).
- 저장/내보내기(HTML·ProductData JSON)는 하위 프로젝트 [4]에서. 현재 이미지(JPG/zip) export는 기존 그대로 동작.

## 1차 검수 반영 (2026-07-08, 사장님 12건)
1. 자동 스크롤: KEY FEATURE·스펙 **상시 렌더**로 앵커 항상 존재 → 필수 입력창 focus 시 미리보기 자동 이동(빈 섹션에 앵커 없던 게 원인).
2. 메인 이미지 **정사각 고정 해제** → 가로 700·세로 비율대로, 상품명이 비율 따라 붙음.
3. 패키지 이미지 **히어로 전체 bounds** → 메인이미지 밖으로도 드래그.
4. AI참조 핵심특징 3블록 + **feature 이미지 슬롯 상시 활성**(미리보기·좌측 Editor 모두).
5. 스펙 **'특징' → KEY FEATURE 부제 자동** 표시.
6. feature **단일 AI설명 제거**(미리보기·좌측). 핵심특징 3블록이 대체.
7. 가로 라인 렌더(border→background div): 스펙 컬럼선·마퀴 상하선·**Point01/02 사이 구분선**.
8. Point 이미지 **라운드 일관**(01=02).
9. 스펙 **긴 값 컬럼 내 줄바꿈**으로 줄맞춤 유지.
10. 좌측 Point 입력순서 = 미리보기와 동일(**설명 → 이미지**).
11. **레이아웃 간격 수동 조절**(`godoSpacing`: 섹션/제목/요소 3노브, ± 스테퍼) → 임시저장으로 고정.
12. 옵션 **자유 배치(Rnd 드래그·리사이즈) 복원**.
- 검증: tsc0/build green/Playwright(실사진 시드 전 섹션 대조·간격 실측·실클릭 스크롤·콘솔0). main push: 11건 `6aa49b9` + 간격기능(본 커밋).
- 잔여(사장님 확인 후): GODO_BRAND 실값, Point 하위블록 개별 소제목(선택).

## 2차 검수 반영 (2026-07-08, 사장님 8건)
1. 패키지 = 흰 박스 + **검정 테두리**(예제 스타일).
2. 스펙 **2행 배치**: 1행 타입/재질/치수, 2행 무게/전원(좌측) → 패키지에 안 가림.
3. 좌측 Editor: feature 이미지 삽입을 **핵심특징 입력 위로** 이관(상세포인트 Feature 섹션 godo 숨김).
4. 핵심특징 **설명 1줄**(Editor 단일행 + AI 1줄 생성/줄바꿈 제거 + 미리보기 truncate).
5. **feature 이미지 마우스 크기·위치**(KEY FEATURE 좌측 Rnd 드래그/리사이즈 · `featureImageLayout`). *중첩 컨테이너 controlled-position 오프셋 버그 → default+remount key로 회피.*
6. Point 활성 빈상태 정리: `__ENABLED__` 제거 + 엑박 대신 **'이미지 영역' 플레이스홀더**, 좌측 타이틀 placeholder='제품의 N번째 특징을 입력해주세요'.
7. **간격 마우스 드래그**: 각 섹션 상단 `⇕ 간격` 핸들 세로 드래그로 `godoSpacing.section` 조절(hover 노출·export 숨김). 수치 패널도 병존(정밀 조절).
8. **양방향 스크롤 동기화**: 좌측 입력 focus→미리보기 이동(빈 섹션 앵커 유지) + **미리보기 섹션 클릭→좌측 입력부 이동**(editor-* 앵커).
- 검증: tsc0/build green/Playwright(패키지테두리·스펙2행·feature이미지 Rnd 위치 실측·역방향 스크롤 실측·빈포인트·콘솔0). main push: 6건 `3d6f0aa` + 드래그3건(본 커밋).

## 3차 검수 반영 (2026-07-08, 사장님 8건 · test/1~9.png)
1. 상품명/영문/브랜드 입력 시 미리보기가 **상품명 위치(preview-name)로 스크롤**(godo는 name이 메인이미지 아래라 preview-top이 안 보였음).
2. 패키지 **검정 테두리** 실제 표시 — 원인: **Tailwind preflight off라 `border-2`가 border-style 없어 무효** → 인라인 `border:2px solid`.
3. 스펙 각 열 **고정폭(≈145px)** → 첫줄 3열이 상세폭 2/3 이내(패키지에 안 가림), 5개 균등폭.
4. 한글 상품명 **textarea(Enter 2줄)** + 미리보기 `whitespace-pre-line`.
5. feature 이미지 박스 **투명**(회색 제거, 이미지 비율대로). *2차의 드래그 이미지는 react-rnd 중첩 컨테이너 오프셋 버그(이미지 10000px 튐)가 default/bounds 회피로도 재발 → 투명 정적 배치로 확정(3차 사장님 우선안).*
6~9. **간격을 실제 위치에서 마우스 드래그**(GapBar): 제목↔내용(heading)·블록 사이(element). Point 블록 재구성 — 설명↔자기 이미지는 밀착(12px 고정), 이미지↔다음 블록 설명은 element로 벌려 **블록 구분**. 기본값 heading 40→24·element→32. 수치 패널도 병존.
10. 섬네일 **자동 문구 삽입 비활성**(godo, 패키지 오버레이는 유지).
- 검증: tsc0/build green/Playwright(패키지테두리·스펙2/3폭·2줄상품명·feature 투명·Point 블록그룹핑·섬네일 문구제거·콘솔0).

## 4차 검수 반영 (2026-07-08, 사장님 6건)
1. 상품명/영문→미리보기 `preview-name`, 브랜드→`preview-maker` 스크롤. **근본원인=기본설정 섹션 onClick(→preview-top)이 입력창 onFocus를 덮어써 되올라감** → godo는 섹션 onClick 제거.
2. 패키지 박스와 하단 'package desing' 바 **동일 너비·일체형·직각**(라운드 제거, -mt/mx 제거).
3. 좌측 **숫자 간격 패널(📐) 제거** — 간격은 미리보기 마우스 드래그(GapBar)로만.
4. feature 이미지 **크기·위치 마우스 조절 복구** — react-rnd 대신 **커스텀 absolute 드래그/리사이즈**(left/top 직접 → transform 오프셋 버그 원천 차단, 위치 실측 정상).
5. (질의응답) HTML 등록 시 모바일: 현 레이아웃은 **고정 800px**. 한국 쇼핑몰 관행대로 모바일은 뷰포트 폭에 맞춰 **비율 축소(same-look)** — 반응형 리플로우 아님. 상세 export/HTML은 [4]에서 확정.
6. **모든 이미지 영역 직각 통일**(라운드 제거): 메인/feature/point/size/옵션/패키지. (핵심특징 텍스트 패널은 이미지 아님 → 유지)
- 검증: tsc0/build green/Playwright(패키지 일체형·직각·feature 위치292/50 실측·상품명 focus→preview-name 스크롤 실측·패널제거·콘솔0).

## 5차 검수 반영 (2026-07-09, 사장님 최종 수정안 5건 · test/1~5.png)
1. **모든 이미지 영역 얇은 회색 테두리(1px #e5e7eb) + 꽉 채움**(패키지·투명 feature 제외). 메인/Point/Size 이미지에 테두리 추가, **옵션 이미지 `object-contain p-3`→`object-cover`**로 흰 여백 제거(1.png), Size는 `p-6` 제거로 이미지가 카드에 꽉 참. 공용 상수 `IMG_BORDER`.
2. **스크롤 싱크 위치 정확화(2.png)**: 메인특징 3블록·Point 서브블록마다 **개별 앵커** 부여 → 좌측 입력(메인특징 1/2/3, Point 1-1/1-2/1-3)이 각자 위치로 스크롤. **원인=한 섹션(preview-point1)에 모든 블록이 묶여 `scrollIntoView(center)`가 섹션 중앙(≈1-2)으로 고정**. Preview에 `preview-feature-{0..2}`·`preview-point{1,2}-{슬롯}`(슬롯=이미지키 끝자리) 앵커, Editor targetId/onFocus를 슬롯 앵커로 교체.
3. **영문명 마퀴 밴드 SIZE 위에도 추가(3.png, 섹션 구분용)**. `MarqueeBand` 컴포넌트로 추출 → KEY FEATURE 아래 + SIZE 위 2곳 렌더.
4. **간격 위치별 독립 조절(4·5.png)**. 기존 `godoSpacing`(종류별 스칼라 3개) → **`godoGaps: Record<위치id, px>` 오버라이드** 도입. GapBar/SectionGap마다 고유 id(`preview-point1-head`·`-el-{슬롯}`·`-sec` 등), 드래그는 `onGapChange(id,값)`으로 해당 위치만 저장(없으면 종류별 기본값 폴백). **한 곳 드래그가 같은 종류 다른 위치에 영향 없음** — 실측: point1 head=6·el=130 조절 시 point2 head=24·el=32 불변, feature섹션=100 시 point1섹션=56 불변.
5. **서브 블록(1-2/2-2 이상) 허전함 해소(5.png)**. main 제목이 없는 서브 설명(첫 블록 이후)에 **테마색 액센트 바 콜아웃**(좌측 세로 바 + 설명) 부여 → 날것 타이핑 느낌 제거·디자인 의도 부여. 첫 블록은 위 Point 제목/부제가 있어 평문 유지.
- 파일: `PreviewGodo.tsx`(IMG_BORDER·MarqueeBand·gapVal/makeGapDrag/GapBar id·서브블록 액센트·앵커), `Editor.tsx`(feature/point 입력 슬롯 앵커), `types.ts`(godoGaps), `DetailPageBuilder.tsx`(handleGodoGapChange·onGapChange).
- 검증: tsc0/build green/Playwright(시드 로드 후 앵커 9개 존재·마퀴 2밴드·옵션 object-cover 꽉참·서브블록 액센트바·간격 독립 실측·콘솔0).
- 잔여(사장님 확인 후): feature 투명 이미지 테두리 제외 처리 확인, GODO_BRAND 실값 → 하위[1] 클로즈.

## 다음
하위 프로젝트 **[2] 엑셀 업로드 → ProductData 프리필** 착수(메인몰 엑셀 → 생성기 좌측 입력부 로드).
