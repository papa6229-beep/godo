# 고도몰 상세페이지 리뉴얼·자동변환 프로그램 — 마스터 기획서 (V0)

> 작성 2026-07-08 · 작성자 Claude Opus 4.8(1M) · 확정지시자 사장님(papa6229, 디자인 팀장)
> 상위 맥락: `GODO_DETAIL_CONVERSION_PLAN_2026-07-07.md`, `MASTER_REPORT_2026-07-03_FINAL.md`
> 관련 메모리: `godomall-detail-conversion-plan`, `design-ai-gemma-connection`, `detail-builder-port-env-gotchas`, `godo-shop-open-timeline`
> 소스 스펙(정본): `test/고도몰 상세페이지 생성기 가이드.md`, `test/가이드.jpg`(설계도), `test/예제.jpg`(완성 상정본)

---

## 0. 이 프로그램이 무엇인가 (한 문장)

메인쇼핑몰(바나나몰)에 등록된 상품 수백~1000개를, **상품정보 엑셀 한 벌**을 입력으로 삼아
**AI가 상세페이지를 고도몰 전용 디자인으로 자동 리뉴얼**하고, 사람이 **검수·수정**한 뒤 **고도몰에 등록**하는 파이프라인.

- 왜: 고도몰(신규몰, 오픈 목표 2026-12)에 메인몰 상품을 차별화된 상세페이지로 대량 이관. 수작업 불가 → AI 총동원.
- 어제(2026-07-07) 수동 PoC(`public/reborn.html`)로 **가능성 확인 완료.** 이제 이를 **앱 안에서 도는 시스템**으로 구축.

## 1. 확정된 사실 (근거)

- **자동변환 소스 = 메인몰 상품정보 엑셀 1행.** (`docs/테스트(1).xlsx` 68컬럼)
  - 핵심 컬럼: `상품명`·`브랜드`·`판매가`·`옵션1/2/3`(`=01_클리어(바코드),…` 형식)·`목록이미지url`·`상품url`·**`상세설명`(상세페이지 전체 HTML — 통이미지 `<img>` URL 포함)**·`카테고리(대/중/소)`·`무게`+스펙속성 40여칸.
  - → 통이미지는 `상세설명` HTML에서 URL 추출 → 다운로드 → 섹션 분할.
- **어제 변환은 앱 기능이 아니라 수동 PoC.** 실제 인앱 파이프라인은 0에서 구축.
- **생성기는 이미 이식됨**(`src/components/detailBuilder/`, 벤더 @ts-nocheck). 단일 `data:ProductData` state, `Editor`(좌)+`Preview`(우)+`ThumbnailPreview`. AI 문구는 `geminiService`→`resolveAgentBrain('design')`→로컬 무검열 LLM(Super Gemma)+VLM(Qwen2.5-VL) 하이브리드.

## 2. 불변 원칙 (GODO)

1. 단일 진실원 · actor(human|agent) 모델 · 계산은 canonical 재사용.
2. **배관 먼저, 실 AI/등록은 마지막.** 3. Vercel Hobby 함수 ≤12(동적 라우트 게이트웨이로 붙임).
4. 성인 콘텐츠 → 로컬 무검열 LLM. 5. 벤더 생성기 파일은 @ts-nocheck → 수정 시 build·화면확인 필수.
6. 작업 하나 끝날 때마다 기록 남기고 main 머지 + push(사장님 실시간 눈검수). 7. 중간 승인요청 없이 end-to-end.

---

## 3. 작업 분해 — 5개 하위 프로젝트 (순서 1→5)

각 하위 프로젝트는 자기 spec→구현→DONE 기록 사이클을 가진다. 과부하 방지를 위해 내부를 다시 페이즈로 쪼갠다.

### [1] 고도몰 전용 생성기 (레이아웃 콘솔) — **지금 착수**
- 무엇: 가이드/예제대로 새 출력 레이아웃 + 핵심요약 3블록화 + 동영상 비활성 + 고도몰 브랜딩.
- 역할: **"제로 신규제작"과 "자동변환 결과 편집" 둘 다의 그릇이자 검수 콘솔.** 모든 하위 프로젝트의 착지점.
- 리스크: 낮음(스펙 확정). 상세 설계·페이즈는 §4.

### [2] 엑셀 업로드 → ProductData 프리필
- 무엇: 디자인팀 UI에서 메인몰 엑셀 업로드 → 파싱 → 생성기 좌측 입력부 로드.
- 포함: 상품명 클렌징(`C군`/`[완료]`/물류코드 제거, `[대분류]`·브랜드·영문 유지 규칙), 옵션 파싱, 카테고리·무게·스펙 매핑, 다건 리스트→선택→로드.
- 의존: [1]. 리스크: 중(컬럼 규격·클렌징 규칙).

### [3] 자동변환 엔진 (리뉴얼)
- 무엇: `상세설명` HTML→통이미지 URL 추출→다운로드→**섹션 분할**→VLM+Gemma 하이브리드 문구→ProductData 채움.
- 의존: [1][2]. 리스크: **높음**(이미지 분할 자동화 신뢰도, 외부이미지 다운로드 CORS→서버 경유, VLM 비용/시간). → 반자동(사람 분할 확인) 폴백 설계 필요.

### [4] 저장·내보내기 구조
- 무엇: 상세페이지 저장(이미지/HTML/ProductData JSON), 임시저장·불러오기(상품 단위), 검수 상태.
- 의존: [1](콘솔만 있으면 붙음, [3]과 병행 가능). 리스크: 중(산출물 포맷·저장소).

### [5] 고도몰 등록
- 무엇: ①고도몰5 `goods_insert` WRITE(현재 write_locked·승인게이트) ②엑셀 일괄 업로드.
- 의존: [3][4]. 리스크: 중. **실 WRITE는 후순위**(오픈 전 일괄 vs 오픈 후 개별 정책 확정 후).

**순서 근거**: 콘솔(1)이 있어야 파싱(2)·변환(3) 결과를 눈으로 검증. 가장 리스크 큰 변환(3)은 그릇·진입로가 선 뒤 붙인다. 저장(4)은 병행 가능, 등록(5)은 마지막.

---

## 4. 하위 프로젝트 [1] 상세 설계 — 고도몰 전용 생성기

### 4-1. 방식 결정 (일임받아 확정)
| 논점 | 결정 | 근거 |
|---|---|---|
| 생성기 공존 | **공유 코드 + `layoutMode` prop.** 기존 바나나몰 모드 유지 + 고도몰 모드 추가. 진입 버튼 2개. | 풀 클론(7파일 복제)은 드리프트·이중유지. 모드 분기가 최소유지·둘 다 보존. |
| 고도몰 출력 레이아웃 | **신규 `PreviewGodo.tsx` 파일로 격리.** 기존 `Preview.tsx` 무손상. | 회귀 0. 벤더 파일 직접 분기보다 안전. |
| 핵심요약 | **단일 `aiSummary` → 3블록(메인특징 title 필수 + 특징설명 AI).** godo 모드 KEY FEATURE 우측 3항목으로 렌더. 기존 히어로 3줄·단일 특징설명은 godo에서 제거. | 예제 정본. 가이드 §3. |
| 옵션 배치 | **자동 균등 가로정렬 + 옵션명 캡션**(godo). 자유 드래그는 바나나몰 모드 유지. | 예제 정본·대량변환 일관성. |
| 오버레이 | 패키지=메인이미지 위 **드래그**(기본 우하단) / 제조사=**고정 우상단**. | 가이드 §설명(패키지 위치조절 명시). |
| 동영상 | godo 모드에서 **숨김(필드·바나나몰 모드는 유지).** | 가이드 §2. |
| 영문상품명 | **2곳**: 상품명 하단(1차) + KEY FEATURE↔OPTION 사이 반복 마퀴 밴드(2차). | 가이드 §57·예제. |
| 폰트 | 전부 **Pretendard** (Black/Bold/Medium). 액센트 = 그린닷(예제). | 가이드 §54. |
| 브랜딩 | footer·섬네일 오버레이 바나나몰 → **`GODO_BRAND` 단일 상수**(플레이스홀더, 사장님 확정 시 1곳 교체). | 하드코딩 제거. |

### 4-2. 데이터 모델 변경
- `types.ts` `ProductData`에 `keyFeatures?: { title: string; desc: string }[]`(3개) 추가. `INITIAL_PRODUCT_DATA`에 빈 3블록.
- 기존 필드 전부 보존(회귀 0). `aiSummary`/`aiFeatureDesc`는 바나나몰 모드가 계속 사용.

### 4-3. 파일 지도
| 파일 | 변경 |
|---|---|
| `detailBuilder/types.ts`·`constants.ts` | `keyFeatures` 필드·초기값 추가 |
| `detailBuilder/DetailPageBuilder.tsx` | `layoutMode?: 'bananamall'\|'godo'` prop 수신 → Editor/Preview 분기, godo면 `<PreviewGodo/>` |
| `detailBuilder/components/Editor.tsx` | godo 모드: 핵심요약 3블록 UI + 동영상 숨김(prop 분기) |
| `detailBuilder/components/PreviewGodo.tsx` | **신규** — 예제 레이아웃 본체 |
| `detailBuilder/components/ThumbnailPreview.tsx` | 브랜딩 상수화(godo 값) |
| `detailBuilder/services/geminiService.ts` | keyFeatures[].title 참고 주입 + 특징설명 생성 |
| `DesignTeamDashboard.tsx` | 두 번째 진입("고도몰 상세페이지 생성기") + 모드 state |

### 4-4. 페이즈 (각 페이즈 = tsc0/build green/Playwright 눈검수 → 커밋·머지·push·기록)
- **1.1 배관**: `keyFeatures` 모델 + `layoutMode` 배관 + 대시보드 2번째 진입. (레이아웃 변화 없음, 공존 확인)
- **1.2 Editor godo 모드**: 핵심요약 3블록 + 동영상 숨김 + geminiService 3특징 연결.
- **1.3 PreviewGodo 레이아웃**(본체): 예제 대조 렌더.
- **1.4 브랜딩·섬네일 정합·마감**: `GODO_BRAND`, 섬네일 godo, 최종 검수 + DONE 기록.

### 4-5. 완료 기준(Acceptance)
- 디자인팀 대시보드에 생성기 2개(메인몰/고도몰) 진입. 바나나몰 모드 회귀 0.
- 고도몰 모드 출력이 예제.jpg 구조와 일치(섹션 순서·오버레이·마퀴·3특징·자동옵션·SIZE·footer).
- 핵심특징 3블록 입력→AI 특징설명 생성→KEY FEATURE 렌더. 무게→SIZE 자동. 섬네일 godo 브랜딩.
- `tsc -b` 0 · `vite build` green.

---

## 5. 기록 원칙
각 하위 프로젝트·주요 페이즈 완료 시 `docs/`에 **무엇을·왜·완성물·검증**을 남긴다(본 프로그램서 + 하위 DONE 문서). 마스터 보고서에 반영.
