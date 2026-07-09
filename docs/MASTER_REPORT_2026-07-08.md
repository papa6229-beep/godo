# GODO AI OS — 마스터 보고서 (2026-07-08)

> 이 문서 한 장으로 오늘 작업 전체·맥락·내일 이어갈 일을 파악하도록 작성한 자기완결 보고서.
> - 작성: Claude Opus 4.8 (1M) · 확정지시자: 사장님(papa6229, 디자인 팀장)
> - main HEAD = `1f9ec90` · 상위 맥락: `MASTER_REPORT_2026-07-03_FINAL.md`
> - 오늘 주제: **고도몰 전용 상세페이지 생성기 신설 + 4회 검수 반영.** 남은 건 "아주 약간의 수정"뿐(사장님 평가).

---

## PART 0. 오늘 시작 전 파악한 맥락 (읽고 온 것)

### 0-1. 프로젝트 큰 그림
GODO AI OS = 신규 쇼핑몰(고도몰5)을 "AI 직원들"이 운영·보조하는 사내 운영센터. 오픈 목표 2026-12, 현재 테스트몰+가치증명 단계. 성인용품 특성상 클라우드 LLM이 문구/이미지를 거부 → 팀별 로컬 무검열 LLM(Super Gemma 등) 구조가 핵심. (`MASTER_REPORT_2026-07-03_FINAL.md`)

### 0-2. 고도몰 상세페이지 대량 자동변환 (사업 핵심, 어제 7/7 PoC 성공)
- 메인몰(바나나몰) 상품 수백~1000개를 **차별화된 상세페이지로 고도몰에 대량 이관**. 수작업 불가 → AI 총동원.
- 파이프라인: 메인몰 상세=세로 긴 **통이미지** → 제품이미지 구간만 잘라냄 → **고도몰 전용 레이아웃에 재배치** → 이미지별 **AI 문구**(Qwen2.5-VL 영문묘사→Super Gemma 한글카피) → 메인기반 섬네일 → **HTML 출력**(SEO 유리).
- 소스=메인몰 상품정보 **엑셀 1행**(`docs/테스트(1).xlsx`, 68컬럼). 통이미지 URL은 `상세설명`(col20) HTML 안에. 7/7 산출물 `public/reborn.html`(base64 인라인). (`GODO_DETAIL_CONVERSION_PLAN_2026-07-07.md`, 메모리 `godomall-detail-conversion-plan`)
- **어제 변환은 앱 기능이 아니라 Claude 수동 PoC.** 인앱 파이프라인은 0에서 구축 대상.

### 0-3. 이 생성기의 역할 (사장님 확정)
고도몰 생성기 = **한 폼, 두 진입**: ①제로부터 신규 수동 제작 ②메인몰 상세 자동변환 결과의 **검수·수정·재생성·등록**. 즉 대량 자동변환의 **출력 그릇이자 편집 콘솔**.

### 0-4. 기술/제약 (불변)
- React19/Vite8/TS6 strict(enum 금지·`import type`). 상태=localStorage. Vercel Hobby 함수 ≤12.
- 생성기 벤더코드(`detailBuilder/`)는 `@ts-nocheck` + eslint globalIgnore. 수정 시 build·화면확인 필수.
- 디자인 AI=로컬 Super Gemma(키 `'design'`)+VLM Qwen2.5-VL 하이브리드. (메모리 `design-ai-gemma-connection`)
- **작업 하나 끝날 때마다 기록+main 머지+push**(사장님 실시간 눈검수). 중간 승인요청 없이 end-to-end. (메모리 `push-after-each-task`·`no-mid-task-approval`)

---

## PART 1. 오늘 만든 것 — 전체 로드맵 + 하위[1] 생성기

### 1-1. 프로그램 5분해 (마스터 기획, `GODO_DETAIL_RENEWAL_PROGRAM_V0.md`)
리뉴얼·자동변환은 한 기능이 아니라 5개 하위 시스템. 순서 1→5:
1. **고도몰 전용 생성기(레이아웃 콘솔)** — 오늘 완료(거의).
2. **엑셀 업로드 → ProductData 프리필** — 내일 착수.
3. **자동변환 엔진**(통이미지 분할+AI 문구) — 최고 리스크.
4. **저장·내보내기**(이미지/HTML/JSON, 임시저장).
5. **고도몰 등록**(write API/엑셀 일괄) — 최후.

### 1-2. 하위[1] 생성기 — 구축 방식
- **공유 코드 + `layoutMode('bananamall'|'godo')`**. 기존 메인몰 생성기 유지 + 고도몰 모드 추가. 대시보드 진입 2개. 고도몰 출력은 **신규 `PreviewGodo.tsx`로 격리**(기존 `Preview.tsx` 무손상=회귀0).
- 정본: `test/예제.jpg`(레이아웃 authority) + `test/가이드.jpg`(설명) + `test/고도몰 상세페이지 생성기 가이드.md`.

### 1-3. 초기 구축 4페이즈 (커밋 `bde61ae`→`7a573a7`)
- **1.1** 배관·공존: `keyFeatures` 모델 + `layoutMode` 스레드 + 대시보드 2진입.
- **1.2** Editor godo: 핵심요약 단일 → **메인특징 3블록**(직접입력+AI설명), 동영상 숨김, geminiService에 keyFeatures 참고/`[KEY#]` 생성.
- **1.3** `PreviewGodo` 본체: 제조사·메인+패키지오버레이·상품명/영문·스펙·KEY FEATURE·마퀴·OPTION·Point·SIZE·footer.
- **1.4** 브랜딩(`GODO_BRAND` 단일소스)·섬네일 정합. `docs/GODO_DETAIL_BUILDER_DONE_V0.md`.

### 1-4. 검수 4회 반영 (사장님 실시간, 커밋 `be26047`→`734c0fe`)
- **1차(12건)**: 이미지 비율자동·패키지 자유이동·KEY FEATURE 상시활성·스펙'특징'→부제·feature 단일AI설명 제거·가로라인·Point 이미지 일관·옵션 자유배치(Rnd)·좌측 Point 입력순서·자동스크롤 앵커·**간격 수동조절(godoSpacing)**.
- **2차(8건)**: 패키지 검정테두리·스펙 2행·feature 이미지 입력을 핵심특징 위로·설명 1줄·빈 Point 플레이스홀더·**feature 이미지 드래그**·간격 마우스 드래그·양방향 스크롤.
- **3차(8건)**: 상품명 스크롤·**패키지 테두리(preflight off로 border유틸 무효→인라인)**·스펙 열 고정폭(2/3 이내)·한글명 2줄(textarea)·feature 박스 투명·간격 GapBar(제목/블록)·Point 블록 그룹핑(설명↔이미지 밀착, 블록끼리 벌림)·섬네일 자동문구 비활성.
- **4차(6건)**: 상품명 스크롤 근본수정(**기본설정 섹션 onClick이 입력 onFocus를 덮어씀**)·패키지 박스+바 일체형 직각·숫자 간격패널 제거·**feature 드래그 커스텀 재구현**(react-rnd 오프셋 버그 회피)·모든 이미지 영역 직각 통일.

전 커밋 `tsc -b` 0 · `vite build` green · Playwright 실측 · 콘솔 0. 각 회차 `GODO_DETAIL_BUILDER_DONE_V0.md`에 로그.

---

## PART 2. 고도몰 생성기 현재 상태 (재개용 스펙)

### 2-1. 진입
디자인팀 워크스페이스 → "🛍️ 고도몰 상세페이지 생성기"(첫째) / "🖼️ 메인몰(기존) 생성기"(둘째). 전체화면 오버레이. 헤더에 모드 배지.

### 2-2. 파일 지도 (`src/components/detailBuilder/`)
| 파일 | 역할(godo 관련) |
|---|---|
| `types.ts` | `ProductData`에 `keyFeatures[]{title,desc}`·`godoSpacing{section,element,heading}`·`featureImageLayout{x,y,w,h}` 추가 |
| `constants.ts` | `INITIAL`에 위 필드 기본값(godoSpacing=56/32/24) |
| `DetailPageBuilder.tsx` | `layoutMode` prop·godo면 `<PreviewGodo/>`·핸들러(feature layout·spacing) |
| `components/Editor.tsx` | godo 분기: 핵심특징 3블록(설명 1줄)+feature이미지 상단·동영상숨김·Point 순서(설명→이미지)·한글명 textarea·입력별 스크롤 앵커(preview-name/maker/spec/feature/option/point/size)·숫자 간격패널 제거 |
| `components/Preview.tsx` | 바나나몰(무손상) |
| `components/PreviewGodo.tsx` | **고도몰 레이아웃 본체**(아래 2-3) |
| `components/ThumbnailPreview.tsx` | `layoutMode`별 브랜딩·godo는 자동문구 비활성(패키지 유지) |
| `services/geminiService.ts` | keyFeatures.title 참고 + `[KEY#]` 1줄 생성·featureImage vision |

### 2-3. PreviewGodo 레이아웃(위→아래) · 인터랙션
- **제조사**(우상단, `preview-maker`) → **메인이미지 700**(비율 자동) + **패키지 오버레이**(드래그, 흰박스+검정테두리+검정 'package desing' 바 일체형·직각) → **상품명(2줄 가능, `preview-name`)+영문명** → **스펙 2행**(1행 타입/재질/치수, 2행 무게/전원, 각 열 고정폭 145) → **KEY FEATURE**(●+대형제목+부제=스펙'특징'+**feature 이미지(투명·커스텀 드래그/리사이즈)**+우 3항목) → **영문 마퀴 밴드** → **OPTION CHECK**(Rnd 자유배치) → **Point 01/02**(제목→설명→이미지, 블록끼리 벌림) → **SIZE**(이미지+WEIGHT) → **footer**(GODO_BRAND).
- **간격 조절**: 미리보기 hover 시 파란 드래그바(`GapBar`: 제목↔내용/블록사이) + 섹션 상단 pill(`SectionGap`). export엔 안 보임. **임시저장으로 고정**, 불러오기로 복원.
- **양방향 스크롤**: 좌측 입력 focus→미리보기 해당 위치 / 미리보기 섹션 클릭→좌측 입력부.
- 폰트 Pretendard(Black/Bold/Medium), 액센트=themeColor 점(●), 상품명·제목=블랙. 모든 이미지 영역 직각.
- 유지기능: 섹션 활성/비활성·메인기반 섬네일·워터마크·무게→SIZE 자동·임시저장/불러오기·이미지 export.

### 2-4. 남은 마무리 (내일, "아주 약간")
- feature 이미지 **드래그/리사이즈 실사용 미세검증**(사장님 마우스 확인).
- ⚠️ **`GODO_BRAND` 플레이스홀더**(`PreviewGodo.tsx`: footerName 'GODO MALL'/thumb '고도몰'·'godomall.co.kr'·'SINCE 2026'·'프리미엄 셀렉트 스토어') → 사장님 실제 브랜드 문구 확정 시 한 곳 교체.
- 미세 간격/정렬 등 사장님 잔여 지적 반영 후 하위[1] 클로즈.

---

## PART 3. 오늘 확인·해결한 기술 사실 (재개 시 주의)

1. **Tailwind preflight OFF** → `border-2` 등 테두리 유틸이 **border-style 없어 무효**. 테두리 필요 시 **인라인 `border:'2px solid …'`**. (가로라인도 border 대신 배경 div=`Hairline`)
2. **react-rnd 중첩 relative 컨테이너에서 controlled/default position이 `translateY≈섹션 페이지오프셋`(≈1만px)으로 튐.** bounds/default 우회 불가 → **드래그가 필요한 요소는 커스텀 absolute(left/top) 드래그로 구현**(feature 이미지가 그 사례). 패키지/옵션 Rnd는 hero/섹션 직속이라 정상.
3. **좌↔우 스크롤 동기화**: 섹션 래퍼의 onClick이 내부 입력 onFocus를 덮어쓰지 않게 주의(godo 기본설정 섹션 onClick 제거로 해결). 조건부 섹션은 비활성 시에도 **앵커 div** 유지해야 스크롤 성립.
4. **엑박/센티넬**: `enableSlot`이 값에 `'__ENABLED__'` 주입 → 미리보기는 이를 '빈 활성'으로 처리(엑박 대신 플레이스홀더).
5. Playwright: **프로그래매틱 focus/click/mousedown은 React 위임 이벤트를 못 깨움**(오탐). 실제 인터랙션/실측으로 검증할 것. 빌더는 <1024px에서 flex-col(에디터 위·미리보기 아래)로 스택.
6. 검증 시드: `public/reborn.html`의 base64 5장(1=세로페어 2=손컷 3·4=눕힘 5=치수)을 임시로 `public/_reborn_imgs.json`에 뽑아 `builder_temp_save`로 주입→불러오기(작업 후 삭제). `public/mockup/*.jpg`는 검정/백지 플레이스홀더라 부적합.

---

## PART 4. 내일 이어갈 작업

### 4-1. 최우선: 하위[1] 잔여 마무리
사장님 마우스 검수(feature 드래그) + 잔여 미세수정 + `GODO_BRAND` 실값 → 하위[1] 클로즈.

### 4-2. 그 다음: 하위[2] 엑셀 업로드 → ProductData 프리필
- 디자인팀 UI에서 **메인몰 상품정보 엑셀 업로드** → 파싱 → 고도몰 생성기 좌측 입력부 자동 로드.
- 소스 규격(확정): `docs/테스트(1).xlsx` 68컬럼. 핵심=상품명/브랜드/판매가/옵션1~3(`=01_클리어(바코드),…`)/목록이미지url/**상세설명(HTML·통이미지 URL 포함)**/카테고리(대·중·소)/무게+스펙속성.
- 포함: **상품명 클렌징**(`C군`·`[완료]`·물류코드 제거, `[대분류]`·브랜드·영문 유지)·옵션 파싱·카테고리/무게/스펙 매핑·다건 리스트→선택→로드.
- 파서=SheetJS 등(신규 dep 검토). Vercel 라우트 예산(≤12) 유의 — 파싱은 클라이언트에서 가능하면 클라이언트로.
- 검증: 상품 1건 로드 → 좌측 입력부·우측 미리보기 정상 → 이후 배치.

### 4-3. 이후 [3]자동변환(통이미지 분할+VLM/Gemma)→[4]저장·내보내기(HTML 뷰포트·모바일 축소 확정)→[5]고도몰 등록(write_locked·승인게이트).

---

## PART 5. 위치·참조
- **HEAD** `1f9ec90`(main). 오늘 커밋 22개(기획→[1.1~1.4]→1~4차 검수), 모두 push 완료.
- **문서**: `GODO_DETAIL_RENEWAL_PROGRAM_V0.md`(5분해 기획) · `GODO_DETAIL_BUILDER_DONE_V0.md`(하위[1]+4회 검수 로그) · 본 보고서.
- **정본 스펙**: `test/예제.jpg`·`test/가이드.jpg`·`test/고도몰 상세페이지 생성기 가이드.md` · 검수 스샷 `test/1~9.png`.
- **PoC 산출물**: `public/reborn.html`(7/7 변환 샘플).
- **관련 메모리**: `godomall-detail-conversion-plan`·`design-ai-gemma-connection`·`detail-builder-port-env-gotchas`·`godo-shop-open-timeline`·`push-after-each-task`·`no-mid-task-approval`.

---
*오늘 완료: 고도몰 전용 상세페이지 생성기 신설(공유코드+layoutMode, PreviewGodo 격리) + 사장님 검수 4회(34개 항목) 반영. 남은 건 잔여 미세수정·브랜드 실값. 내일: 하위[1] 클로즈 → 하위[2] 엑셀 업로드 착수.*

---
---

# GODO AI OS — 마스터 보고서 이어서 (2026-07-09)

> 7/8에 이어 작성. 오늘 주제: **생성기 최종검수 클로즈 → 전체 안정성 점검·정리 → 단순형 변환기 신설 → [2] 엑셀 자동 프리필 착수(변환 자동화 실증)** + 저녁 설계논의.
> main HEAD = `bea80e1` · 오늘 커밋 12개, 모두 push 완료.

## PART A. 오늘 한 일 (시간순, 커밋 12개)

### A-1. 생성기 최종 수정 5건 (`640ca9a`) — test/1~5.png
①옵션외 모든 이미지영역 얇은 회색테두리(IMG_BORDER)+옵션 object-cover 여백제거 ②메인특징3·Point 서브블록 개별앵커 ③영문 마퀴밴드 SIZE 위에도(MarqueeBand) ④간격 위치별 독립(godoSpacing→godoGaps 오버라이드) ⑤main 없는 서브설명에 테마색 액센트바 콜아웃.

### A-2. 좌→우 스크롤 싱크 근본수정 (`f774470`)
증상: 개별앵커 넣어도 여전히 안 맞음(Point 1-2 활성 후 1-1 클릭시 1-2로 밀림). **원인=입력 onFocus 직후 상위 래퍼 onClick(스펙섹션·editor-feature·editor-point1/2)이 click 버블로 섹션 전체 앵커로 덮어씀.** godo에서 그 상위 onClick 제거(isGodo?undefined). 실클릭 검증(dist0).

### A-3. 0단계 워터마크 마무리 (`40021dc`)
①feature 워터마크 위치이동 버그(부모 커스텀드래그가 워터마크 mousedown 가로챔 → `[data-wm]`에서 시작시 startFeatureDrag 즉시 return) ②패키지 무의미 워터마크 버튼 제거(godo만·bananamall 유지). 실드래그 검증.

### A-4. 전체 안정성 점검(4영역 병렬) + 안전 정리
- **점검 결론**: 앱 전반 양호(tsc0·eslint0·시크릿위생 좋음·서비스계층 방어적). 부채 집중.
- ✅ **死코드 628줄 삭제** (`c41373c`): engine/task*·data/tasks·taskTemplates(호출처0, nativeAgentRuntime로 대체).
- ✅ `.playwright-mcp/` gitignore (`d75a42b`, add -A 실수 정리).
- ✅ **생성기 드래그 리스너 누수 방어 + export 더블클릭 가드** (`4da8d1b`): 공통 beginDrag(창 blur 종료·언마운트 cleanup)·isLoading 재진입가드.
- ✅ **ChatConsole Three.js 재시도 setTimeout 누수 차단** (`3f4710f`).
- ✅ **App localStorage 29개 setItem→safeSetItem** (`1948baf`): 쿼터 throw로 흰화면 방지(작업중 만든 재귀버그 잡음).

### A-5. 마케팅 AI 애널리스트 업그레이드 조사 (보류·기록만)
마케팅 AI가 통계읽기에 그치는 원인=코드에 "관찰만·결론금지" 가드레일+기대치 부재. 처방=4레이어(기대치·진단·추천·예측)+RFM/AOV/쿠폰lift 플레이북+페르소나. **2024쿠폰0 vs 2025쿠폰 시나리오가 내장 A/B**. 디자인팀 끝난 뒤로 보류. 메모리 `marketing-ai-analyst-upgrade`.

### A-6. 단순형 변환기(구조 B) 신설 (`54cb546`, `155b28a`)
메인몰 5타입 → 출력구조 2개 수렴: **A.섹션형(기존 고도몰 생성기)=타입1** / **B.단순 플로우형(신규)=타입2~5**. layoutMode `godoFlow` + 신규 `PreviewGodoFlow`/`EditorFlow`(격리) → **기존 PreviewGodo/Editor 무손상(회귀0)**. 원본충실 스택(메인이미지영역 없음, 섬네일 소스 분리, 패키지 오버레이 슬롯, 옵션 재사용). 대시보드 진입버튼 3개.

### A-7. [2] 엑셀 자동 프리필 착수 — **변환 자동화 실증** (`bea80e1`)
`services/mainMallExcelParser.ts`(SheetJS 0.20.3 CDN·0취약점·dynamic import 별도청크). 엑셀 업로드→상품명클렌징·브랜드·상단문구(상세설명 태그제거+최장공통접두 dedup)·통이미지·섬네일 자동채움. **실엑셀(타액로션·버진루프) end-to-end 성공** — 실제 CDN 제품이미지가 URL로 스택 렌더, 공통배너 자동제외.

## PART B. 오늘 검증된 핵심 사실 (실측)

### B-1. 안정성 점검 결론 (미착수분 = 우선순위순)
1. **[2] 설계 때** 생성기 저장소 localStorage→**IndexedDB**(변환 이미지 대량 저장 전제).
2. **real 오픈(2026-12) 전** 엔드포인트 인증 + orders-admin PII 게이트(현재 mock이라 안전).
3. 스키마 버저닝·DataPanel 직접write 방어(App 완료)·god컴포넌트 7개 분할·marketing 서비스 23개 통합. 메모리 `stability-audit-2026-07-09`.

### B-2. 변환 파이프라인 검증 사실
- 엑셀 68컬럼 중 **구조화 스펙칸(27~67)은 샘플 전부 비어있음** → 스펙은 상세설명 이미지 안에만. 닛포리는 옵션·상세설명·이미지URL도 비어있음(내용이 통이미지에만).
- **이미지 필터 규칙(검증됨)**: `files/goodsm/{상품번호}/`=진짜 제품 통이미지 · `banana_img/conf/img/`=공통배너(제외) · `files/goods/{상품번호}/`=섬네일(목록이미지, **바나나몰 로고 박힘**). 깨진URL(.jpgx.jpg) 방어.
- **CDN(cdn-banana): 핫링크 차단 없음 + CORS 헤더 없음** → `<img src=URL>` 표시 OK, canvas 픽셀읽기 막힘. ⇒ 표시는 클라 URL만으로 서버無, **export/워터마크(픽셀)만 서버 fetch base64**.
- 단순형은 대개 통이미지 1장=전체상세 결합. 트리니티=상단 마케팅합성컷+개별제품컷(캡션포함) 세로배열, 여백띠로 섹션 뚜렷.

## PART C. 저녁 설계 논의 — 변환기 보완 방향 (내일 반영, 사장님과 합의)

### C-1. export 안 되는 이유 = CORS taint
현재 통이미지가 CDN URL(크로스오리진·CORS헤더없음) → canvas 오염 → 저장 SecurityError. **기존 생성기·변환기 수동업로드는 base64(동일오리진)라 저장 됨.** 해결=엑셀 URL 이미지를 **서버가 base64로** 바꿔넣으면 기존과 100% 동일. (새 생성 용도는 지금도 저장 됨)

### C-2. 상품명 파싱 (4조각 분해)
`[일본 직수입] 모에 구멍 트리니티 (萌あなトリニティ) - 라이드재팬 (OH-3036)(NPR)` →
- `[...]` 대괄호 → eyebrow(작게, 브랜드와 동일 크기) · 한글=**큰 제목** · `(일본어/영문)`=영문상품명(한글명 아래 작게 좌측정렬) · `- 브랜드`=영문명 옆 작게 · 끝의 `(코드)(약자)`=상품번호+벤더약자 **버림**.
- 상품명·영문명·브랜드·eyebrow **각각 입력창**으로 개별 수정.

### C-3. 이미지+SEO 텍스트 (핵심)
- 통이미지1장(트리니티)=**코드가 여백행 감지로 자동분할**(VLM 불필요)→각 조각 Qwen VL 묘사→Gemma 한글문구. 개별이미지+텍스트(닛포리 20+)=그대로 수집.
- **"원본과 순서 다르게"=프로젝트 존재이유** → LLM이 20장 다 재현 말고 **핵심 6~10섹션으로 큐레이션+제품서사 순서로 재배치**. 차별화+입력창폭발 동시해결.
- **입력 UI**: 고정슬롯 수십개 X → **이미지+캡션 가변 블록 리스트**(flowImages→`블록[]{이미지,문구}` 확장). SEO 텍스트가 각 이미지 아래 실제 타이핑.

### C-4. 섬네일 = 자동 + 이슈 리스트 (사장님 확정)
- 현재 목록이미지(바나나몰 로고 박힘) 사용 → 잘못. **통이미지 안의 깨끗한 제품/패키지 컷(test4) 추출**→고도몰 재브랜딩.
- **기본 자동픽**(VLM 최적컷), 애매한 것(닛포리류 다옵션·저화질·흩어짐)만 **이슈 리스트에 자동 플래그** → 그것만 수동. **배치로 돌리고 문제아만 리스트업.**

### C-5. 문구 톤 (사장님 확정)
**팩트(옵션명·기능·사이즈·재질)는 원본에서 그대로 살림. 표현/톤만 호기심 자극+이미지 합치되게 재작성.** 정보 왜곡 금지, 카피만 새로.

### C-6. 배치 아키텍처 (이슈 리스트 = 뼈대)
`엑셀 여러개 → 배치 자동변환 → [완료목록] {✅자동통과=슥 보고 승인 / ⚠️이슈리스트=쪽집게 수동→승인} → 승인분만 고도몰 등록`. 이슈 플래그 기준(옵션N개�/제품이미지0장/섬네일저화질/텍스트부족)은 실데이터로 튜닝.

## PART D. 내일 이어갈 작업
1. **export 복구**: 서버 이미지 fetch→base64 (엑셀 URL 이미지 대상). 새생성은 이미 됨.
2. **상품명 파서 개선**(C-2) + 변환기 헤더 렌더 재구성(eyebrow/한글/영문/브랜드) + 개별 입력창.
3. **[3] 이미지 파이프라인**: 통이미지 여백감지 자동분할 → Qwen VL 섹션묘사 → Gemma 문구(팩트유지·표현만) → **이미지+캡션 블록** 재배치. 섬네일 자동추출 + 이슈 리스트.
4. **배치 오케스트레이션** + 이슈 리스트 UI. (저장 IndexedDB는 [2]/배치 붙일 때)

## PART E. 위치·참조
- **HEAD** `bea80e1`(main). 오늘 커밋 12개 push 완료.
- **신규 코드**: `detailBuilder/components/PreviewGodoFlow.tsx`·`EditorFlow.tsx`·`services/mainMallExcelParser.ts`. 변경(추가분기): `DetailPageBuilder.tsx`·`DesignTeamDashboard.tsx`·`types.ts`(flowHeaderText·flowImages·godoGaps).
- **설계문서**: `docs/superpowers/specs/2026-07-09-godo-flow-converter-design.md`.
- **메모리**: `godomall-detail-conversion-plan`(2026-07-09 진행+검증사실 추가) · `godo-watermark-conversion-strategy` · `stability-audit-2026-07-09` · `marketing-ai-analyst-upgrade` · `design-ai-gemma-connection` · `detail-builder-port-env-gotchas`.
- **정본 샘플**(gitignore된 test/, 로컬 유지): 핑거위글(타입1) · 스타킹/타액로션(타입2) · 버진루프/트리니티(타입3) · 롬프(타입4) · 닛포리(타입5) 각 xlsx+통이미지. test1(트리니티 변환결과)·test2(상품명이슈)·test3/4(섬네일 로고 유무).

---
*2026-07-09 완료: 생성기 최종검수 클로즈 + 전체 안정성 점검·정리(死코드 삭제·누수 방어) + 단순형 변환기 신설 + **[2] 엑셀 자동변환 실증(엑셀→상세페이지 조립 실제 동작)**. 방향 확정: 자동 대부분 + 이슈리스트 소수 수동. 내일: export 서버 base64 + [3] 이미지 분할·재배치·SEO문구·섬네일 자동+이슈리스트.*
