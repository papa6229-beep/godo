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

## 다음
하위 프로젝트 **[2] 엑셀 업로드 → ProductData 프리필** 착수(메인몰 엑셀 → 생성기 좌측 입력부 로드).
