# 디자인팀 상세페이지 생성기 이식 완료 (1단계a)

작성: 2026-07-03 · 브랜치: `feature/detail-page-builder-port`

## 무엇을 했나
`papa6229-beep/detail-page-builder`(React19/Vite/TS · Tailwind CDN · html-to-image·jszip·file-saver·react-rnd)를
GODO 내부로 **격리 이식**하고, 죽은 OpenRouter(Gemini) 토큰 대신 **GODO AI 어댑터**에 재연결했다.
디자인팀 워크스페이스에서 **[생성기 열기 →]** 로 전체화면 실행된다.

## 배치 위치
- `src/components/detailBuilder/` — 이식된 생성기 일습(벤더 원본 최소 수정)
  - `types.ts` — `ProductData` 등. `enum ImageType` → **const object + union** 변환(GODO `erasableSyntaxOnly` 대응)
  - `constants.ts`, `components/{Editor,Preview,ThumbnailPreview}.tsx`, `DetailPageBuilder.tsx` — 벤더 원본 + `// @ts-nocheck`
  - `services/geminiService.ts` — **재작성**: OpenRouter 직접 호출 제거, `resolveAgentBrain('design') → chatWithProvider` 경유
- `src/components/DesignTeamDashboard.tsx` — 슬롯을 실제 버튼으로. `builderOpen` 상태 + 전체화면 오버레이(`z-index:10000`)에 `<DetailPageBuilder/>` 마운트
- `src/components/DesignTeamDashboard.css` — `.dtd-gen-open`, `.dtd-builder-overlay/-bar/-close/-body`
- `index.html` — 생성기 전용 **Tailwind Play CDN(preflight off)** + Fira/Pretendard 폰트. preflight를 꺼 GODO 기존 스타일은 불변
- `eslint.config.js` — `globalIgnores`에 `src/components/detailBuilder` 추가(벤더 코드 린트 제외)

## AI 문구 연결 방식 (핵심)
- **텍스트(스펙) 기반** 문구 생성. `data.summaryInfo`·상품명·브랜드를 프롬프트로 → `[FEATURE]`,`[POINT1_1]`… 태그 파싱 → `ProductData` 부분필드로 반환
- 디자인팀 AI가 **AI 직원 설정에서 연결되어 있지 않으면** 명확한 안내 에러
- 성인상품은 클라우드 LLM이 거부 → 설정에서 디자인팀 AI를 **로컬(언센서드, 예: Super Gemma)** 로 지정해 사용하는 구조를 그대로 활용
- 이미지 분석(vision)은 어댑터가 아직 텍스트 전용 → **1단계b(선택)** 로 분리. 지금은 스펙 문구만으로 동작

## 검증
- `tsc -b` 0 · `eslint` clean · `vite build` green(199 modules)
- Playwright: 부서 업무 관장 → 디자인팀 → 생성기 열기 → 전체화면 렌더(컬러테마·입력·워터마크·AI 문구 버튼·라이브 프리뷰 정상) → 닫기 동작 · **콘솔 에러 0**

## 알려진 후속(비차단)
- Tailwind는 지금 **Play CDN**(콘솔에 "production 비권장" 경고 1건). 내부 도구라 무해하나, 추후 build-time Tailwind(PostCSS)로 전환 가능
- 이미지 vision 문구, 엑셀 임포트, 자동 상품등록(godomall goods_insert)은 2·3단계에서
