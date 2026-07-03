# 상세페이지 생성기(detail-page-builder) 이식 분석 보고서

> 2026-07-03 · 분석 전용(구현·수정 없음). 대상 레포: `github.com/papa6229-beep/detail-page-builder`
> 목적: GODO AI OS 디자인팀 워크스페이스에 이식 가능한지 검토.

---

## 결론 요약
- **동일 스택**(React 19 · Vite · TS)이라 **이식 궁합 최상.** GODO도 React 19.2 / Vite / TS.
- **AI 문구생성이 이미 OpenAI 호환(OpenRouter chat/completions)** → GODO `aiProviderAdapter`로 **손쉽게 교체·재연결 가능**(Claude/OpenAI/Gemini 선택형). "토큰 소진" 문제 해결됨.
- 결과물은 **JPEG 이미지**(DOM→html-to-image 캡처). HTML export는 없음 → 출력 규격에 반영.
- **엑셀 임포트 없음**(전부 Editor 수동 입력) → 상품팀 엑셀 연동은 새로 붙일 지점.
- **권장: 자체 완결 이식(핵심 로직 이식, 옵션 C)**. 동일 스택이라 위험 낮음. 더 안전하게 가려면 iframe(A)부터.

---

## 1. 기술 스택
- **React 19.2 + Vite 6 + TypeScript 5.8** (GODO: React 19.2 / Vite 8 / TS 6 — 사실상 동일, 마이너 차만).
- 주요 라이브러리:
  - `html-to-image`(toJpeg) — **DOM을 이미지로 캡처**(핵심 export 엔진)
  - `jszip` + `file-saver`(saveAs) — zip 묶어 다운로드
  - `html2canvas` — (deps에 있음, 보조/대체 캡처)
  - `react-rnd` — 에디터에서 이미지 드래그·리사이즈(레이아웃)
  - `@google/genai` — **deps에 있으나 실제 import 없음(死 의존성)**. 실제 호출은 OpenRouter fetch.
- 이미지 처리: **Base64 dataURL**로 상태 보관(ProductData의 각 image 필드). `cropImage`는 canvas로 세로 긴 이미지 분할.
- 저장/export: 브라우저 다운로드(html-to-image→JPEG, 여러 장이면 JSZip→zip). **서버 저장 없음**(클라이언트 완결).
- 배포: Vite SPA(Google AI Studio 생성물). Vercel 호스팅 추정. API 키를 `import.meta.env.VITE_GEMINI_API_KEY`(빌드 시 번들 주입 = 클라이언트 노출).

## 2. 상세페이지 생성 흐름
- **입력**: `Editor.tsx` UI 수동 입력 — 상품명(KR/EN), 브랜드, 스펙(summaryInfo: 특징/타입/재질/치수/무게/전원/제조사), 테마컬러, 옵션, **이미지 업로드(Base64)**(메인/패키지/특징/Point1·2/사이즈/섬네일/워터마크), 섹션 토글, 드래그 레이아웃.
- **상품 스펙 출처**: 사용자가 Editor에 직접 타이핑. **엑셀/외부 데이터 임포트 없음.**
- **상품명/문구 생성**: `handleGenerateAI` → `services/geminiService.generateCopywriting(data)` → 업로드 이미지들(vision)+스펙을 AI에 보내 태그형 문구 생성(`[FEATURE]`,`[POINT1_1]`…) → regex 추출 → `aiFeatureDesc`/`aiPoint1Desc`… 채움. **상품명 자체는 AI 생성 아님(사용자 입력 필수, 없으면 경고)** — 문구(카피)만 생성.
- **템플릿 구조**: 고정 레이아웃 템플릿을 `Preview.tsx`(상세페이지)·`ThumbnailPreview.tsx`(섬네일)가 ProductData로 렌더. `design-system/`은 코드가 아니라 **MASTER.md 디자인 가이드 문서** 2종(bananabuilder_ui, bananamall_premium).
- **결과물 형태 / 출력**:
  - 상세페이지: `detailRef` DOM → `toJpeg`(800px, 품질1.0) → **단일 JPG**. 동영상 섹션 있으면 canvas로 분할 → **JSZip zip**.
  - 섬네일: `THUMBNAIL_PRESETS`별 `ThumbnailPreview` → 각각 `toJpeg` → **zip**(또는 개별 JPG).
  - **HTML/섹션데이터 export는 없음** — 최종 산출물은 이미지. 단, **ProductData(구조화 데이터)는 내부에 존재**하므로 원하면 JSON/섹션데이터로 뽑아낼 수 있음.

## 3. Gemini(실제 OpenRouter) API 연결
- **호출 위치**: `services/geminiService.ts` 한 곳(`generateCopywriting`). App의 "AI 생성" 버튼에서만 호출.
- **실제 엔드포인트**: `https://openrouter.ai/api/v1/chat/completions` (Gemini SDK 아님!). model=`google/gemini-2.0-flash-001`, **OpenAI 호환 chat/completions 포맷**(system/user messages, `image_url` 멀티모달).
- **키 관리**: `import.meta.env.VITE_GEMINI_API_KEY`(Vercel 환경변수 → 빌드 번들에 노출). 보안상 서버 라우트가 더 안전(=GODO 방식이 우월).
- **GODO adapter로 대체 가능?** → ✅ **매우 쉬움.** 이미 OpenAI 호환 포맷이라, `fetch(openrouter…)`를 GODO의 `aiProviderAdapter`/`getChatCompletion`(lmsConnector, `/chat/completions`) 호출로 **한 함수만 교체**하면 됨. GODO는 이미 provider 선택(aiBrainSettings)+키금고(aiKeyVault) 보유.
- **Claude/OpenAI/Gemini 선택형?** → ✅ 가능. messages 포맷 그대로 두고 model/provider만 GODO 설정에서 고르게. **주의: 문구생성은 vision(이미지 분석) 필수** → 선택 provider가 멀티모달 지원해야 함(Claude·GPT-4o·Gemini 다 지원). GODO에 연결된 Claude로 즉시 대체 가능.

## 4. GODO 연결 방식 평가

| 방식 | 장점 | 단점 | 난이도 | 위험도 |
|---|---|---|---|---|
| **A. iframe/embed** | 생성기 무수정·즉시 사용, 위험 0 | 데이터 자동 전달 불가(postMessage 배선 필요, 현재 미지원)→디자이너 재입력, 별도 배포 의존, 죽은 AI 토큰 그대로 | 낮음 | 낮음 |
| **B. 링크아웃** | 최소 노력 | 통합감 없음, 데이터 단절, 토큰 문제 그대로 | 매우 낮음 | 낮음 |
| **C. 핵심 로직 이식** | 동일 스택이라 깔끔, 워크플로/데이터(상품팀 엑셀→ProductData) 완전 통합, **AI를 GODO adapter로 재연결(토큰 해결)**, 자체 완결(기존 GODO 코드 무수정) | 새 deps 4종 추가, 초기 이식 작업(약 5파일), Vite/TS 마이너 차 점검 | 중 | 중(자체 완결이라 낮은 편) |
| **D. 전체 재작성** | 완벽한 GODO화 | 이미 작동하는 걸 다시 만듦=낭비, 리스크 큼 | 높음 | 높음 |

- **평가**: 동일 React 19 스택 + AI가 이미 OpenAI 호환 → **C(핵심 이식)의 실질 난이도가 낮음.** D는 불필요. A/B는 토큰 문제·데이터 단절이 남아 "반쪽".

## 5. 디자인팀 워크스페이스 입출력 규격 제안 (ProductData 매핑)

**입력(→ ProductData / 신규 매핑)**
| 요청 필드 | 매핑 | 비고 |
|---|---|---|
| 브랜드 | `brandName` / `summaryInfo.maker` | |
| 원상품명 | `productNameKr`(초기값) | 최종 상품명은 별도 후보 생성 |
| 상품 스펙 | `summaryInfo`(feature/type/material/size/weight/power/maker) | 엑셀 컬럼→이 구조로 파싱 필요(신규) |
| 가격/재고/옵션 | ProductData엔 없음 → **신규 필드**(price/stock/`options[]`는 이미 있음) | 등록용 요약에 포함 |
| 제품 이미지 | `mainImage`/`point*` 등(Base64) | 없으면 촬영/스크래핑 후 주입 |
| 참고 이미지 | 신규(참고용, 생성 프롬프트에 활용) | |
| 디자인 톤 | 신규(`themeColor`+톤 프리셋/템플릿 선택) | design-system 2종과 연결 |

**출력(생성기 산출 + 요약)**
| 출력 | 생성기 제공 | 비고 |
|---|---|---|
| 최종 상품명 후보 | ❌(현재 미생성) → **AI 카피와 함께 후보 생성 추가** | 쉬움(같은 AI 호출 확장) |
| 상세페이지 문구 | ✅ `aiFeatureDesc`/`aiPoint1Desc`… | GODO adapter로 재연결 |
| 상세페이지 HTML/섹션데이터 | ❌ HTML 없음, ✅ **ProductData(섹션데이터)** + JPG | 필요 시 ProductData JSON export 추가 |
| 섬네일 이미지 | ✅ JPG(zip) | |
| 상품등록용 요약 데이터 | ❌ → **신규**(상품명·가격·재고·옵션·이미지경로 요약) | 실제 고도몰 WRITE는 별도 |
| 검수 체크리스트 | ❌ → **신규**(문구/이미지/스펙 누락 체크) | 쉬움 |

## 6. 가장 안전한 첫 슬라이스 (권장)

**슬라이스 0 — 디자인팀 스캐폴드(생성기와 무관, 배관 재사용):** DeptTeamId에 `design` 추가 → 팀 메시지·활동 원장·오버사이트·역할 자동 연동 + 디자인 작업 보드(요청 큐). *(이건 이미 논의된 다음 단계)*

**슬라이스 1(생성기, 가장 안전) — "격리 이식 + AI 재연결":**
- 생성기(App/Editor/Preview/ThumbnailPreview/types/constants/geminiService)를 **GODO 안 독립 라우트/패널**(디자인 워크스페이스 내 "상세페이지 생성기")로 **그대로 이식**. **기존 GODO 코드는 건드리지 않음**(신규 파일만, 자체 완결).
- **딱 한 곳만 수정**: `geminiService`의 OpenRouter fetch → **GODO `aiProviderAdapter` 호출**로 교체(토큰 부활 + provider 선택형). 나머지는 무수정.
- deps 4종(html-to-image, jszip, file-saver, react-rnd) 추가.
- 데이터 연동(상품팀 엑셀→ProductData 프리필)은 **슬라이스 2**로 분리(먼저 도구가 GODO 안에서 도는 것부터).

> 이 방식이 안전한 이유: **동일 스택**이라 포팅 마찰 최소, **자체 완결**이라 기존 화면/로직 영향 0, **AI 한 함수만** 교체해 즉시 작동. iframe(A)보다 통합·토큰 문제까지 해결되고, 재작성(D)보다 훨씬 저렴.
> 더 보수적으로 가려면 슬라이스 1을 **iframe 임베드(A)**로 먼저 해 위험 0으로 도구만 띄우고, 이후 격리 이식으로 승격해도 됨.

## 추가 확인 사항 / 리스크 메모
- **API 키 노출**: 생성기는 클라이언트 번들에 키 노출. GODO로 옮기면 **서버 라우트/키금고**로 개선 권장(보안↑).
- **결과물이 이미지(JPG)**: "상세페이지 HTML"을 원하면 별도 작업 필요(현재 구조는 이미지 산출). 단 ProductData는 구조화돼 있어 데이터 export는 용이.
- **엑셀 임포트 신규**: 상품팀 엑셀→ProductData 파서 필요(SheetJS 등). 컬럼 규격 합의 필요.
- **상품 이미지 필수**: 문구생성이 vision 기반 → 이미지 없으면 카피 품질 저하. 기존상품 대량 리디자인 시 "이미지 확보(촬영/스크래핑)"가 선행.
- **고도몰 실제 상품등록(WRITE)**: 현재 GODO는 READ만. "직접 등록"은 WRITE 연동(별도·후순위). 슬라이스 단계에선 "등록 준비 완료 데이터"까지.
- **Vite 6→8 / TS 5.8→6**: 마이너 차. 이식 시 빌드 점검(대부분 무문제 예상).

---
*본 문서는 분석 전용이며 GODO/생성기 코드를 수정하지 않았다.*
