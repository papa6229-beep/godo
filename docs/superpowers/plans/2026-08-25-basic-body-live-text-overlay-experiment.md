# Basic Body Live Text Overlay Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` while implementing each task and `superpowers:verification-before-completion` before reporting completion.

**Goal:** 기존 기본형 결과를 전혀 바꾸지 않는 격리 진단에서, 흰 배경 위 독립 그림 글자만 마스킹하고 HTML 글자로 재입력할 수 있는지 대표 4종으로 확인한다.

**Architecture:** 현재 정본인 `본문 통이미지 보존`은 그대로 둔다. 기존 Claude 1회 판독 응답에 글자 영역 장부만 추가하고, 순수 함수가 좌표와 흰 배경 여부를 검증한다. 결과는 개발용 접이식 진단 화면에서만 비교하며 `PreviewGodo`, HTML 저장, 이미지 저장에는 연결하지 않는다.

**Tech Stack:** TypeScript, React, 브라우저 Canvas, 기존 Claude 판독 1회, 기존 smoke 검사 체계.

**Spec:** `docs/superpowers/specs/2026-08-25-basic-body-live-text-overlay-design.md`

## Global Constraints

- 한 번의 종료조건만 다룬다: `마스킹 + HTML 재입력 가능성 확인`.
- 본문 자르기·섹션 조립·Point 생성은 금지한다.
- 새 OCR, 새 라이브러리, Python, 새 API, 추가 AI 호출, 자동 재시도는 금지한다.
- 메인·KEY FEATURE·패키지·요약정보·섬네일·단순형은 건드리지 않는다.
- 상품명·브랜드·색상·샘플 번호 하드코딩은 금지한다.
- 기존 결과 데이터에는 진단 결과를 저장하지 않는다. 진단 데이터는 별도 필드에만 둔다.
- 실제 유료 호출과 최종 육안 판정은 사용자가 한다.

---

### Task 1: 글자 영역 계약과 순수 검증기 만들기

**Files:**
- Create: `src/components/detailBuilder/services/basicBodyTextOverlay.ts`
- Create: `scripts/smoke-basic-body-text-overlay-v0.mjs`
- Modify: `scripts/regression-manifest.json`

- [ ] **1.1 실패하는 집중검사를 먼저 작성한다.**

다음 공개 계약을 검사에서 요구한다.

```ts
export interface BasicBodyTextRegion {
  bandIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  role: 'heading' | 'body' | 'label';
  action: 'replace' | 'keep_raster';
  reviewNote: string;
}

export interface ValidatedBodyTextRegion extends BasicBodyTextRegion {
  id: string;
}

export function validateBodyTextRegions(
  input: unknown,
  bandCount: number,
): { valid: ValidatedBodyTextRegion[]; rejected: string[] };
```

검사 항목: 0..1 범위, 양수 크기, 존재하는 bandIndex, 빈 text 거부, 중복·심한 겹침 거부, 입력 순서와 무관한 안정된 결과 순서.

- [ ] **1.2 최소 구현으로 집중검사를 통과시킨다.**

임의 보정하거나 잘못된 좌표를 살리지 않는다. 거부 사유는 사용자가 읽을 수 있는 짧은 한국어 문장으로 남긴다.

- [ ] **1.3 신규 smoke를 manifest에 등록하고 단독 실행한다.**

Expected: 신규 집중검사 전부 PASS.

---

### Task 2: 기존 Claude 1회 응답에 진단 장부만 추가하기

**Files:**
- Modify: `src/components/detailBuilder/services/basicVisionReader.ts`
- Modify: `scripts/smoke-basic-body-text-overlay-v0.mjs`

- [ ] **2.1 기존 호출 수와 기존 필드를 잠그는 실패 검사를 추가한다.**

검사 항목:

- `readBasicLayout` 호출부 수와 재시도 수 불변
- `bodyStartIndex`, 상단 슬롯, 요약정보, 기존 `bands` 계약 불변
- `bodyTextRegions`가 없거나 잘못돼도 기존 결과 생성은 계속됨

- [ ] **2.2 `BasicVisionResult.bodyTextRegions`를 선택 필드로 추가한다.**

기존 JSON 응답 안에서만 받는다. 프롬프트에 다음 두 판단만 추가한다.

1. 흰색에 가까운 빈 배경 위의 독립 제목·일반 설명 문장은 `replace`.
2. 제품·사람·도해·선·화살표와 닿거나 그림 의미의 일부인 라벨은 `keep_raster`.

AI가 섹션을 만들거나 이미지와 설명을 짝짓게 하지 않는다.

- [ ] **2.3 파싱 직후 Task 1 검증기를 통과시킨다.**

잘못된 영역은 진단 목록에서만 제외하고 기존 변환을 실패시키지 않는다.

---

### Task 3: 밴드 좌표를 원본 통이미지 좌표로 되돌리기

**Files:**
- Modify: `src/components/detailBuilder/services/basicBodyAssembly.ts`
- Modify: `src/components/detailBuilder/services/godoBasicConvert.ts`
- Modify: `src/components/detailBuilder/services/basicBodyTextOverlay.ts`
- Modify: `scripts/smoke-basic-body-text-overlay-v0.mjs`

- [ ] **3.1 좌표 투영 실패 검사를 추가한다.**

기존 `BasicBandOrigin`의 `sourceIndex`, `y`와 밴드 크기, 본문 시작 크롭을 이용해 다음을 확인한다.

- 같은 밴드의 0..1 좌표가 원본 파일 픽셀 좌표로 정확히 변환됨
- 본문 시작 크롭이 있는 첫 파일은 y가 한 번만 보정됨
- 여러 원본 파일 순서가 바뀌지 않음
- 본문 이미지의 픽셀 크기·개수·순서는 변하지 않음

- [ ] **3.2 진단에 필요한 최소 크기 정보만 출처 장부에 추가한다.**

`BasicBandOrigin`에 밴드 `width`, `height`만 추가한다. `assembleBodyFromSourceImages`의 결과와 기존 저장 경로는 바꾸지 않는다.

- [ ] **3.3 순수 좌표 투영 함수를 구현한다.**

```ts
export function projectRegionToSource(
  region: ValidatedBodyTextRegion,
  origin: BasicBandOrigin,
  bodyCropY: number,
): { sourceIndex: number; x: number; y: number; width: number; height: number };
```

반올림 규칙을 함수 한 곳에 고정하고, 원본 범위를 벗어나면 거부한다.

---

### Task 4: 흰 배경 안전 게이트와 진단 신호 만들기

**Files:**
- Modify: `src/components/detailBuilder/services/basicBodyTextOverlay.ts`
- Modify: `scripts/smoke-basic-body-text-overlay-v0.mjs`

- [ ] **4.1 합성 픽셀 fixture로 실패 검사를 작성한다.**

안전 배경은 사각형 바깥 3px 고리의 픽셀 중 98% 이상이 RGB 각 245 이상일 때뿐이다.

검사 항목:

- 흰 배경 + `replace` → 마스크 허용
- 색 배경, 그라데이션, 사진형 픽셀 → 원본 보존
- `keep_raster` → 배경이 흰색이어도 원본 보존
- 겹침·범위 오류 → 원본 보존

- [ ] **4.2 브라우저 Canvas 의존부와 순수 판정을 분리한다.**

픽셀 배열을 받는 순수 판정 함수와 실제 Canvas 픽셀을 읽는 어댑터를 분리한다. 흰색 외 배경색을 추정하거나 생성형으로 메우지 않는다.

- [ ] **4.3 점수표 없이 신호를 계산한다.**

```ts
export type BodyOverlaySignal = 'green' | 'yellow' | 'red';
```

- GREEN: 허용된 교체 1개 이상, 보존·거부 0개
- YELLOW: 허용 교체와 보존·거부가 함께 있음
- RED: 검출 영역은 있으나 허용 교체 0개

샘플명이나 임의 가중치를 쓰지 않는다.

---

### Task 5: 기존 출력과 분리된 접이식 진단 미리보기 만들기

**Files:**
- Create: `src/components/detailBuilder/components/BasicBodyOverlayDiagnostic.tsx`
- Create: `src/components/detailBuilder/components/BasicBodyOverlayDiagnostic.css`
- Modify: `src/components/detailBuilder/Editor.tsx`
- Modify: `src/components/detailBuilder/services/godoBasicConvert.ts`
- Modify: `scripts/smoke-basic-body-text-overlay-v0.mjs`

- [ ] **5.1 기존 출력 미연결을 잠그는 검사를 먼저 추가한다.**

검사 항목:

- `PreviewGodo.tsx` 변경 없음
- HTML 저장·이미지 저장 입력에 진단 필드가 들어가지 않음
- 진단 결과가 없어도 기존 UI와 변환 결과 불변

- [ ] **5.2 진단 데이터를 결과의 별도 선택 필드에만 담는다.**

예: `overlayExperiment?: BasicBodyOverlayExperiment`. 기존 `ProductData`에는 넣지 않는다.

- [ ] **5.3 기본 접힘 상태의 진단 UI를 추가한다.**

펼쳤을 때만 다음을 표시한다.

- 원본 통이미지
- 흰 사각 마스크 + 세 고정 스타일(`heading`, `body`, `label`) HTML 오버레이
- 교체된 문구·보존된 문구 목록
- GREEN/YELLOW/RED와 각각의 구체적 사유

진단 UI는 결과 다운로드와 무관해야 한다.

---

### Task 6: 전체 검증 및 Preview 전달

**Files:**
- Verify only; 문서 갱신은 현재 단계 종료조건을 실제로 충족한 경우에만 수행

- [ ] **6.1 필수 검사를 순서대로 실행한다.**

1. `node scripts/smoke-basic-body-text-overlay-v0.mjs`
2. `npm run build`
3. `npm test`
4. 변경 파일 lint
5. `git diff --check`

- [ ] **6.2 대표 4종 자동 fixture 결과를 보고한다.**

평범형 1, 비대칭형 2, 프리티, 예외형 6 각각에 대해 원본 보존 여부, 허용 마스크 수, HTML 문구 수, 보존 영역 수, 신호와 사유를 표로 적는다. 실제 원본 유료 판독을 하지 않았다면 `fixture 결과`라고 명시한다.

- [ ] **6.3 일반 커밋 1개와 Preview까지만 만든다.**

main 병합·Production·환경변수 변경은 하지 않는다. 완료보고에는 사용자가 Preview에서 볼 한 가지를 정확히 적는다: `원본과 진단 미리보기를 나란히 보고 마스크 자국과 HTML 위치를 확인`.

## 완료보고 순서

1. 실제로 확인된 것
2. 사용자가 Preview에서 볼 수 있는 것
3. 이번에 기존 출력에 연결하지 않은 것
4. 본선 적용 여부를 판단하기 위해 사용자가 확인할 한 가지
5. 대표 4종 fixture 표와 검사 결과

유료 호출·실제 화면 손검수를 하지 않았다면 반드시 미검증으로 표시한다.
