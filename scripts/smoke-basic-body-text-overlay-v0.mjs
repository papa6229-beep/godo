// 기본형 본문 라이브 텍스트 오버레이 **격리 실험** 집중검사 (2026-08-25)
//
// 무엇을 확인하는가
//   · 이 실험은 기존 기본형 출력(본문 원본 통이미지 보존)을 **바꾸지 않는다**. 진단 데이터만 만든다.
//   · 검사는 진단 경로의 순수 함수를 **실제로 호출**한다(문자열 존재 검사로 통과시키지 않는다 — 헌법 §10).
//   · 브라우저 Canvas 가 필요한 부분(픽셀 읽기)은 순수 판정 함수 + 합성 픽셀 fixture 로 검사한다.
//   · 결선(리더 프롬프트·변환 파이프라인·화면 미연결)만 소스 대조로 보조 확인한다.
//
// ⚠️ 유료 AI 호출 0회. Claude 응답은 고정 JSON stub 으로만 확인한다.
//
// 실행: node scripts/smoke-basic-body-text-overlay-v0.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
};

const repo = process.cwd();
const read = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const outDir = mkdtempSync(path.join(tmpdir(), 'godo-body-overlay-'));
const tscBin = path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = (relFile, dir) => execFileSync(
  process.execPath,
  [tscBin, path.join(repo, relFile),
    '--outDir', dir, '--module', 'esnext', '--target', 'ES2022',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--lib', 'ES2022,DOM'],
  { stdio: 'pipe', cwd: tmpdir() },  // 저장소 tsconfig.json 자동 로드 방지(TS5112)
);

console.log('[1/7] 컴파일 — 진단 모듈(순수)');
compile('src/components/detailBuilder/services/basicBodyTextOverlay.ts', outDir);
const mod = await import(pathToFileURL(path.join(outDir, 'basicBodyTextOverlay.js')).href);
const {
  validateBodyTextRegions,
  extractBodyTextRegions,
  projectRegionToSource,
  judgeWhiteRing,
  computeOverlaySignal,
  WHITE_RING_PX, WHITE_MIN_CHANNEL, WHITE_MIN_RATIO,
} = mod;

// ── [1] Task 1 : 글자 영역 계약과 순수 검증기 ────────────────────────────────
console.log('[2/7] 글자 영역 검증기');

ok('진단 모듈이 검증기를 내보낸다', typeof validateBodyTextRegions === 'function');

const region = (over = {}) => ({
  bandIndex: 0,
  rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
  text: '깨끗한 흰 배경 위 제목',
  role: 'heading',
  action: 'replace',
  reviewNote: '',
  ...over,
});

{
  const r = validateBodyTextRegions([region()], 3);
  ok('정상 영역 1건은 그대로 통과한다', r.valid.length === 1 && r.rejected.length === 0,
    JSON.stringify(r));
  ok('통과 영역에는 안정된 id 가 붙는다',
    typeof r.valid[0]?.id === 'string' && r.valid[0].id.length > 0);
  const again = validateBodyTextRegions([region()], 3);
  ok('같은 입력은 같은 id 를 준다(안정성)', again.valid[0]?.id === r.valid[0]?.id);
}

{
  const r = validateBodyTextRegions('not-an-array', 3);
  ok('배열이 아니면 빈 결과 + 사유 1건', r.valid.length === 0 && r.rejected.length === 1);
  ok('거부 사유는 한국어 문장이다', /[가-힣]/.test(r.rejected[0] || ''), r.rejected[0]);
}

{
  const r = validateBodyTextRegions(undefined, 3);
  ok('없어도(undefined) 예외를 던지지 않는다', r.valid.length === 0 && Array.isArray(r.rejected));
}

{
  const bad = [
    region({ rect: { x: -0.1, y: 0.1, width: 0.2, height: 0.2 } }),          // 범위 밖(음수)
    region({ rect: { x: 0.9, y: 0.1, width: 0.3, height: 0.2 } }),           // 오른쪽으로 넘침
    region({ rect: { x: 0.1, y: 0.1, width: 0, height: 0.2 } }),             // 0 크기
    region({ rect: { x: 0.1, y: 0.1, width: 0.2, height: -0.2 } }),          // 음수 크기
    region({ bandIndex: 7 }),                                                // 없는 밴드
    region({ bandIndex: -1 }),                                               // 음수 밴드
    region({ text: '   ' }),                                                 // 빈 텍스트
    region({ role: 'title' }),                                               // 없는 role
    region({ action: 'inpaint' }),                                           // 없는 action
    'x',                                                                      // 객체 아님
  ];
  const r = validateBodyTextRegions(bad, 3);
  ok('잘못된 영역 10건을 전부 거부한다', r.valid.length === 0 && r.rejected.length === 10,
    `valid=${r.valid.length} rejected=${r.rejected.length}`);
  ok('거부 사유마다 밴드 번호가 함께 남는다',
    r.rejected.filter((m) => /밴드/.test(m)).length >= 8, JSON.stringify(r.rejected));
  ok('임의 보정으로 잘못된 좌표를 살리지 않는다', r.valid.length === 0);
}

{
  const dup = [region(), region()];
  const r = validateBodyTextRegions(dup, 2);
  ok('완전히 같은 영역 중복은 1건만 남긴다', r.valid.length === 1 && r.rejected.length === 1,
    JSON.stringify(r.rejected));
}

{
  const heavy = [
    region({ rect: { x: 0.10, y: 0.10, width: 0.50, height: 0.20 } }),
    region({ rect: { x: 0.12, y: 0.11, width: 0.50, height: 0.20 } }),   // 거의 같은 자리
  ];
  const r = validateBodyTextRegions(heavy, 2);
  ok('심하게 겹치는 영역은 뒤엣것을 거부한다', r.valid.length === 1 && r.rejected.length === 1,
    JSON.stringify(r));
}

{
  const apart = [
    region({ rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 } }),
    region({ rect: { x: 0.1, y: 0.5, width: 0.3, height: 0.1 } }),
  ];
  const r = validateBodyTextRegions(apart, 2);
  ok('떨어져 있는 두 영역은 둘 다 통과한다', r.valid.length === 2 && r.rejected.length === 0);
}

{
  const other = [
    region({ bandIndex: 0, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } }),
    region({ bandIndex: 1, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } }),
  ];
  const r = validateBodyTextRegions(other, 2);
  ok('밴드가 다르면 같은 좌표라도 겹침이 아니다', r.valid.length === 2 && r.rejected.length === 0);
}

{
  const forward = [
    region({ bandIndex: 2, rect: { x: 0.1, y: 0.60, width: 0.3, height: 0.1 }, text: 'C' }),
    region({ bandIndex: 0, rect: { x: 0.5, y: 0.10, width: 0.3, height: 0.1 }, text: 'B' }),
    region({ bandIndex: 0, rect: { x: 0.1, y: 0.10, width: 0.3, height: 0.1 }, text: 'A' }),
  ];
  const a = validateBodyTextRegions(forward, 3);
  const b = validateBodyTextRegions([...forward].reverse(), 3);
  ok('결과 순서는 입력 순서와 무관하다(밴드 → y → x)',
    a.valid.map((v) => v.text).join('') === 'ABC' && b.valid.map((v) => v.text).join('') === 'ABC',
    `${a.valid.map((v) => v.text).join('')} / ${b.valid.map((v) => v.text).join('')}`);
  ok('id 도 입력 순서와 무관하게 같다',
    a.valid.map((v) => v.id).join('|') === b.valid.map((v) => v.id).join('|'));
}

{
  const r = validateBodyTextRegions([region({ action: 'keep_raster', reviewNote: '도해 라벨' })], 1);
  ok('keep_raster 도 유효한 action 이다', r.valid.length === 1 && r.valid[0].action === 'keep_raster');
  ok('reviewNote 는 그대로 보존된다', r.valid[0].reviewNote === '도해 라벨');
}

// ── [2] Task 2 : 기존 Claude 1콜에 진단 장부만 추가 ──────────────────────────
//   리더(basicVisionReader)는 aiProviderAdapter 체인을 끌고 와 Node 단독 import 가 되지 않는다
//   → **JSON 에서 장부를 꺼내는 순수 함수는 실제 호출로**, 결선(호출 수·프롬프트·필드)은 소스 대조로 확인한다.
console.log('[3/7] 기존 1콜 계약 잠금 + 장부 추출');

const READER = read('src/components/detailBuilder/services/basicVisionReader.ts');
const CONVERT = read('src/components/detailBuilder/services/godoBasicConvert.ts');

{
  const calls = (CONVERT.match(/readBasicLayout\(/g) || []).length;
  ok('변환 파이프라인의 readBasicLayout 호출은 1곳 그대로다', calls === 1, `${calls}곳`);
  const chat = (READER.match(/chatWithProvider\(/g) || []).length;
  ok('리더의 AI 호출 지점은 2곳(기본형·단순형) 그대로다', chat === 2, `${chat}곳`);
  ok('자동 재시도 루프를 만들지 않았다',
    !/retry|재시도\s*루프|for\s*\(\s*let\s+attempt/i.test(CONVERT.replace(/AI 다시 읽기|수동 재시도/g, '')));
  ok('기본형 리더의 maxTokens 는 4000 그대로다', /maxTokens:\s*4000/.test(READER));
}

{
  const fields = ['bodyStartIndex', 'mainIndex', 'featureIndex', 'packageIndex',
    'mainIsSoloProductCut', 'keyFeatures', 'bands', 'productNameKr', 'summary'];
  ok('기존 BasicVisionResult 필드 9종이 그대로 남아 있다',
    fields.every((f) => new RegExp(`${f}[?]?:`).test(READER)),
    fields.filter((f) => !new RegExp(`${f}[?]?:`).test(READER)).join(','));
  ok('bodyTextRegions 는 **선택** 필드로 추가됐다', /bodyTextRegions\?:/.test(READER));
  ok('본문 시작 경계 프롬프트 규칙은 그대로다', /\[본문 시작 경계 — bodyStartIndex\]/.test(READER));
  ok('상단 슬롯 프롬프트 규칙은 그대로다', /\[상단 요약 슬롯\]/.test(READER));
  ok('밴드 장부 프롬프트 규칙은 그대로다', /\[본문 bands — 밴드 장부\]/.test(READER));
}

{
  const block = (READER.match(/\[본문 글자 영역 — bodyTextRegions\][\s\S]*?\n\s*'',/) || [''])[0];
  ok('프롬프트에 본문 글자 영역 판단 블록이 딱 하나 추가됐다',
    (READER.match(/\[본문 글자 영역 — bodyTextRegions\]/g) || []).length === 1);
  ok('그 블록이 흰 배경 독립 문장 = replace 를 지시한다',
    /흰[^\n]*replace|replace[^\n]*흰/.test(block) || (/흰/.test(block) && /"replace"/.test(block)), block.slice(0, 200));
  ok('그 블록이 그림에 닿는 라벨 = keep_raster 를 지시한다',
    /keep_raster/.test(block), block.slice(0, 200));
  ok('AI 에게 섹션 조립·이미지 짝맞춤을 시키지 않는다(명시 금지 문구)',
    /섹션[^\n]*만들지|짝짓|짝맞춤/.test(READER));
  ok('리더가 장부 추출 순수 함수를 재사용한다(파싱 중복 금지)',
    /extractBodyTextRegions/.test(READER));
}

{
  ok('진단 모듈이 장부 추출기를 내보낸다', typeof extractBodyTextRegions === 'function');
  const base = {
    productNameKr: '가', productNameEn: 'A', summary: {}, keyFeatures: [],
    bodyStartIndex: 6, mainIndex: 0, featureIndex: 1, packageIndex: -1,
    mainIsSoloProductCut: true, bands: [], notes: [],
  };
  ok('bodyTextRegions 가 없으면 undefined 다(기존 결과 생성은 계속된다)',
    extractBodyTextRegions(base) === undefined);
  ok('bodyTextRegions 가 목록이 아니면 undefined 다',
    extractBodyTextRegions({ ...base, bodyTextRegions: 'x' }) === undefined
    && extractBodyTextRegions({ ...base, bodyTextRegions: 3 }) === undefined);
  ok('응답 자체가 아니어도 예외를 던지지 않는다',
    extractBodyTextRegions(null) === undefined && extractBodyTextRegions('x') === undefined);

  const raw = [region(), { bandIndex: 'x' }, region({ bandIndex: 1, text: '두번째' })];
  const got = extractBodyTextRegions({ ...base, bodyTextRegions: raw });
  ok('목록이면 원소를 버리지 않고 그대로 넘긴다(판정은 검증기 한 곳)', got?.length === 3, String(got?.length));
  const v = validateBodyTextRegions(got, 2);
  ok('추출 → 검증 연결에서 잘못된 원소만 거부된다', v.valid.length === 2 && v.rejected.length === 1,
    JSON.stringify(v.rejected));
}

// ── [3] Task 3 : 밴드 0..1 좌표 → 원본 통이미지 픽셀 좌표 ────────────────────
console.log('[4/7] 좌표 투영');

const ASM = await import(pathToFileURL(path.join(outDir, 'basicBodyAssembly.js')).href);
const { assembleBodyFromSourceImages, planBodyBoundary, applyBodyBoundary } = ASM;

const origin = (over = {}) => ({
  sourceIndex: 1, y: 200, width: 800, height: 400, isGif: false, promo: false, ...over,
});

ok('진단 모듈이 좌표 투영 함수를 내보낸다', typeof projectRegionToSource === 'function');

{
  const v = validateBodyTextRegions([region({ rect: { x: 0.1, y: 0.25, width: 0.5, height: 0.2 } })], 1);
  const p = projectRegionToSource(v.valid[0], origin(), 0);
  ok('밴드 0..1 좌표가 원본 픽셀로 정확히 바뀐다',
    p && p.sourceIndex === 1 && p.x === 80 && p.width === 400 && p.y === 300 && p.height === 80,
    JSON.stringify(p));
  ok('반올림은 네 변 좌표에서만 한 번 일어난다(폭 = 오른쪽 - 왼쪽)',
    p && p.width === Math.round(0.6 * 800) - Math.round(0.1 * 800));
}

{
  const v = validateBodyTextRegions([region({ rect: { x: 0.1, y: 0.25, width: 0.5, height: 0.2 } })], 1);
  const a = projectRegionToSource(v.valid[0], origin(), 150);
  ok('본문 시작 크롭이 있으면 y 를 한 번만 뺀다', a && a.y === 150 && a.height === 80, JSON.stringify(a));
  const b = projectRegionToSource(v.valid[0], origin(), 0);
  ok('크롭 0 이면 y 보정이 없다', b && b.y === 300);
  ok('같은 입력을 다시 넣어도 같은 값이다(두 번 보정되지 않는다)',
    JSON.stringify(projectRegionToSource(v.valid[0], origin(), 150)) === JSON.stringify(a));
}

{
  const v = validateBodyTextRegions([region({ rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } })], 1);
  ok('크롭 위쪽(본문 밖) 영역은 거부한다', projectRegionToSource(v.valid[0], origin(), 400) === null);
  ok('밴드 크기 정보가 없으면 거부한다(추측하지 않는다)',
    projectRegionToSource(v.valid[0], origin({ width: 0, height: 0 }), 0) === null);
  ok('출처 파일 번호가 없으면 거부한다',
    projectRegionToSource(v.valid[0], origin({ sourceIndex: -1 }), 0) === null);
  ok('출처 y 가 없으면 거부한다', projectRegionToSource(v.valid[0], origin({ y: -1 }), 0) === null);
  ok('출처 자체가 없으면 거부한다', projectRegionToSource(v.valid[0], undefined, 0) === null);
}

{
  const tiny = validateBodyTextRegions(
    [region({ rect: { x: 0.1, y: 0.1, width: 0.0006, height: 0.2 } })], 1);
  ok('반올림 뒤 1px 미만이 되는 영역은 거부한다',
    projectRegionToSource(tiny.valid[0], origin({ width: 800 }), 0) === null);
}

{
  ok('밴드 출처 장부에 width·height 가 추가됐다',
    /width:\s*number/.test(read('src/components/detailBuilder/services/basicBodyAssembly.ts').split('BasicBandOrigin')[1] || ''));
  const CONV = CONVERT;
  ok('변환 파이프라인이 분할 조각의 실제 크기를 출처 장부에 적는다',
    /origins\.push\(\{[^}]*width:/.test(CONV), 'origins.push 에 width 없음');
}

{
  // 본문 출력은 이 실험으로 조금도 바뀌지 않는다 — 픽셀 크기·개수·순서 불변.
  const sources = [
    { src: 'f0', isGif: false, promo: false },
    { src: 'f1', isGif: true, promo: false },
    { src: 'f2', isGif: false, promo: true },
    { src: 'f3', isGif: false, promo: false },
  ];
  const body = assembleBodyFromSourceImages(sources);
  const items = body.sections[0].items;
  ok('본문 항목 개수·순서는 그대로다(홍보 GIF 1건만 제외)',
    items.length === 3 && items.map((i) => i.src).join(',') === 'f0,f1,f3', JSON.stringify(items.map((i) => i.src)));
  ok('본문 조립기는 글자 영역을 인자로 받지 않는다(연결 0건)',
    assembleBodyFromSourceImages.length === 1, `arity=${assembleBodyFromSourceImages.length}`);

  // 확장된 출처 장부로도 기존 경계 계산이 그대로 동작한다(무회귀).
  const origins = [
    { sourceIndex: 0, y: 0, width: 800, height: 300, isGif: false, promo: false },
    { sourceIndex: 0, y: 300, width: 800, height: 500, isGif: false, promo: false },
    { sourceIndex: 1, y: 0, width: 800, height: 700, isGif: false, promo: false },
  ];
  const plan = planBodyBoundary(1, origins, 2);
  ok('출처 장부 확장 뒤에도 본문 시작 경계 계산은 같다',
    plan.applied === true && plan.sourceIndex === 0 && plan.cropY === 300, JSON.stringify(plan));
  const bounded = applyBodyBoundary(sources.slice(0, 2), plan);
  ok('경계 적용 결과(파일 순서·크롭 1회)도 그대로다',
    bounded.sources.length === 2 && bounded.sources[0].cropFromY === 300 && bounded.sources[1].cropFromY === 0);
}

// ── [4] Task 4 : 흰 배경 안전 게이트 + 진단 신호 ─────────────────────────────
console.log('[5/7] 흰 배경 안전 게이트 · 신호');

const { planOverlayRegions, finalizeOverlayExperiment } = mod;

// 합성 픽셀 fixture — 사각형(inner) 주변 ring 을 원하는 색으로 채운 표본을 만든다.
const sample = (fillRing) => {
  const width = 40, height = 20;
  const inner = { x: 5, y: 5, width: 30, height: 10 };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const insideInner = x >= inner.x && x < inner.x + inner.width && y >= inner.y && y < inner.y + inner.height;
      const [r, g, b] = insideInner ? [10, 10, 10] : fillRing(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width, height, data, inner };
};

ok('진단 모듈이 흰 배경 판정기를 내보낸다', typeof judgeWhiteRing === 'function');
ok('흰 배경 기준 상수 3종이 설계서 값 그대로다',
  WHITE_RING_PX === 3 && WHITE_MIN_CHANNEL === 245 && WHITE_MIN_RATIO === 0.98,
  `${WHITE_RING_PX}/${WHITE_MIN_CHANNEL}/${WHITE_MIN_RATIO}`);

{
  const white = judgeWhiteRing(sample(() => [255, 255, 255]));
  ok('순백 배경은 안전하다', white.safe === true && white.ratio === 1 && white.sampled > 0, JSON.stringify(white));

  const nearWhite = judgeWhiteRing(sample(() => [247, 249, 246]));
  ok('거의 흰색(각 채널 245 이상)도 안전하다', nearWhite.safe === true, JSON.stringify(nearWhite));

  const justBelow = judgeWhiteRing(sample(() => [244, 255, 255]));
  ok('한 채널이라도 245 미만이면 안전하지 않다', justBelow.safe === false, JSON.stringify(justBelow));

  const color = judgeWhiteRing(sample(() => [230, 120, 90]));
  ok('색 배경은 원본 보존', color.safe === false, JSON.stringify(color));

  const gradient = judgeWhiteRing(sample((x) => { const v = 200 + Math.round((x / 40) * 55); return [v, v, v]; }));
  ok('그라데이션 배경은 원본 보존', gradient.safe === false, JSON.stringify(gradient));

  const photo = judgeWhiteRing(sample((x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * 7 + y * 53) % 256]));
  ok('사진형 픽셀 배경은 원본 보존', photo.safe === false, JSON.stringify(photo));

  // 98% 경계: ring 픽셀의 3%만 회색이면 거부, 1%만 회색이면 허용.
  const ringCount = judgeWhiteRing(sample(() => [255, 255, 255])).sampled;
  const dirty = (n) => { let left = n; return () => (left-- > 0 ? [100, 100, 100] : [255, 255, 255]); };
  ok('흰 비율 98% 미만이면 거부한다',
    judgeWhiteRing(sample(dirty(Math.ceil(ringCount * 0.03)))).safe === false);
  ok('흰 비율 98% 이상이면 허용한다',
    judgeWhiteRing(sample(dirty(Math.floor(ringCount * 0.01)))).safe === true);
}

{
  const noRing = { width: 10, height: 10, data: new Uint8ClampedArray(400), inner: { x: 0, y: 0, width: 10, height: 10 } };
  const v = judgeWhiteRing(noRing);
  ok('둘레를 잴 수 없으면(테두리 0px) 안전하지 않다', v.safe === false && v.sampled === 0, JSON.stringify(v));
  ok('표본이 없어도 예외를 던지지 않는다', judgeWhiteRing(undefined).safe === false);
}

// ── 계획 → 최종 신호 ─────────────────────────────────────────────────────────
ok('진단 모듈이 계획·마감 함수를 내보낸다',
  typeof planOverlayRegions === 'function' && typeof finalizeOverlayExperiment === 'function'
  && typeof computeOverlaySignal === 'function');

const planInput = (regions) => ({
  regions,
  bandCount: 4,
  origins: [
    { sourceIndex: 0, y: 0, width: 800, height: 400, isGif: false, promo: false },
    { sourceIndex: 1, y: 0, width: 800, height: 500, isGif: false, promo: false },
    { sourceIndex: 1, y: 500, width: 800, height: 500, isGif: false, promo: false },
    { sourceIndex: 2, y: 0, width: 0, height: 0, isGif: true, promo: false },   // 크기 미상(GIF)
  ],
  cropY: (si) => (si === 1 ? 120 : 0),
  bodySourceIndexOf: (si) => (si === 0 ? -1 : si - 1),   // 파일 0 은 본문 밖(원본 메인섹션)
});

{
  const p = planOverlayRegions(planInput([
    region({ bandIndex: 1, rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.1 }, text: '본문 제목' }),
    region({ bandIndex: 2, rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 }, text: '도해 라벨', action: 'keep_raster' }),
    region({ bandIndex: 0, rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 }, text: '메인섹션 글자' }),
    region({ bandIndex: 3, rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 }, text: 'GIF 위 글자' }),
  ]));
  ok('검출 건수는 유효 영역 수와 같다', p.detected === 4, String(p.detected));
  ok('replace 후보만 픽셀 확인 대기(pending)로 남는다',
    p.candidates.length === 1 && p.candidates[0].region.text === '본문 제목', JSON.stringify(p.candidates.map((c) => c.region.text)));
  const outcome = (t) => p.decisions.find((d) => d.text === t)?.outcome;
  ok('keep_raster 는 픽셀을 보지 않고 바로 원본 보존이다', outcome('도해 라벨') === 'kept_raster');
  ok('본문에 실리지 않은 파일(원본 메인섹션)의 글자는 거부된다', outcome('메인섹션 글자') === 'rejected');
  ok('크기를 모르는 밴드(GIF)의 글자도 거부된다', outcome('GIF 위 글자') === 'rejected');
  ok('거부 사유는 한국어로 남는다',
    p.decisions.filter((d) => d.outcome === 'rejected').every((d) => /[가-힣]/.test(d.reason)),
    JSON.stringify(p.decisions.map((d) => d.reason)));
  ok('본문 시작 크롭이 계획 단계에서 한 번 반영된다',
    p.candidates[0].projected.y === Math.round(0.4 * 500) - 120, JSON.stringify(p.candidates[0].projected));
  ok('본문에 실린 파일 순번이 함께 기록된다', p.candidates[0].bodySourceIndex === 0);
}

{
  const bad = planOverlayRegions(planInput('nope'));
  ok('장부가 목록이 아니면 검출 0 · 사유 1건', bad.detected === 0 && bad.rejected.length === 1);
  const none = planOverlayRegions(planInput(undefined));
  ok('장부가 없으면 조용히 검출 0건이다', none.detected === 0 && none.rejected.length === 0);
}

{
  const images = [{ bodySourceIndex: 0, sourceIndex: 1, src: 'body-0', width: 800, height: 880 }];
  const p = planOverlayRegions(planInput([
    region({ bandIndex: 1, rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.1 }, text: '본문 제목' }),
  ]));
  const id = p.candidates[0].region.id;

  const green = finalizeOverlayExperiment(p, { [id]: { safe: true, ratio: 1, sampled: 120, reason: '흰 배경' } }, images);
  ok('허용 교체 1건 · 보존·거부 0건 → GREEN', green.signal === 'green', JSON.stringify(green.signal));
  ok('GREEN 결과에 교체 문구가 남는다',
    green.decisions.filter((d) => d.outcome === 'replaced').map((d) => d.text).join('') === '본문 제목');

  const red = finalizeOverlayExperiment(p, { [id]: { safe: false, ratio: 0.4, sampled: 120, reason: '색 배경' } }, images);
  ok('검출은 있는데 허용 교체 0건 → RED', red.signal === 'red', JSON.stringify(red.signal));
  ok('허용되지 않은 영역은 원본 보존으로 남는다',
    red.decisions.find((d) => d.text === '본문 제목')?.outcome === 'kept_raster');

  const noVerdict = finalizeOverlayExperiment(p, {}, images);
  ok('픽셀을 못 읽으면(판정 없음) 원본 보존이다',
    noVerdict.decisions.find((d) => d.text === '본문 제목')?.outcome === 'kept_raster' && noVerdict.signal === 'red');
}

{
  const images = [
    { bodySourceIndex: 0, sourceIndex: 1, src: 'body-0', width: 800, height: 880 },
    { bodySourceIndex: 1, sourceIndex: 2, src: 'body-1', width: 800, height: 500 },
  ];
  const p = planOverlayRegions(planInput([
    region({ bandIndex: 1, rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.1 }, text: '교체될 제목' }),
    region({ bandIndex: 2, rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 }, text: '도해 라벨', action: 'keep_raster' }),
  ]));
  const id = p.candidates[0].region.id;
  const y = finalizeOverlayExperiment(p, { [id]: { safe: true, ratio: 1, sampled: 120, reason: '흰 배경' } }, images);
  ok('교체와 보존이 함께 있으면 YELLOW', y.signal === 'yellow', JSON.stringify(y.signal));
  ok('신호에 상품명·임의 가중치를 쓰지 않는다(같은 수치면 같은 신호)',
    finalizeOverlayExperiment(p, { [id]: { safe: true, ratio: 1, sampled: 120, reason: '흰 배경' } }, images).signal === y.signal);
  ok('본문 이미지 목록은 순서 그대로 실린다',
    y.images.map((i) => i.src).join(',') === 'body-0,body-1');
}

{
  ok('검출 0건이면 신호가 없다(null)', computeOverlaySignal([], 0) === null);
  ok('검출 0건이어도 거부가 있으면 RED', computeOverlaySignal([], 2) === 'red');
}

{
  const SRC = read('src/components/detailBuilder/services/basicBodyTextOverlay.ts');
  ok('생성형 인페인팅·배경색 추정을 쓰지 않는다',
    !/inpaint|배경색 추정|추정한 배경/i.test(SRC));
  ok('Canvas 어댑터는 판정 함수와 분리돼 있다(순수 판정 + 어댑터 1곳)',
    /export const sampleRegionRing/.test(SRC) && /typeof document === 'undefined'/.test(SRC));
  ok('순수 판정 함수는 document 를 만지지 않는다',
    !/document/.test(SRC.split('export const judgeWhiteRing')[1]?.split('export const')[0] || 'document'));
}

// ── [5] Task 5 : 기존 출력과 분리된 접이식 진단 미리보기 ─────────────────────
console.log('[6/7] 기존 출력 미연결 잠금 · 진단 UI');

const gitShow = (rel) => {
  try { return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return null; }
};
const unchanged = (rel) => {
  const head = gitShow(rel);
  return head !== null && head.replace(/\r\n/g, '\n') === read(rel).replace(/\r\n/g, '\n');
};

{
  // 이번 커밋 이전(HEAD) 과 **바이트 동일**해야 하는 파일들 — 출력·저장 경로.
  ok('PreviewGodo.tsx 를 건드리지 않았다', unchanged('src/components/detailBuilder/components/PreviewGodo.tsx'));
  ok('저장·다운로드 경로(DetailPageBuilder.tsx)를 건드리지 않았다',
    unchanged('src/components/detailBuilder/DetailPageBuilder.tsx'));
  ok('단순형 출력(PreviewGodoFlow.tsx)을 건드리지 않았다',
    unchanged('src/components/detailBuilder/components/PreviewGodoFlow.tsx'));
  ok('섬네일(ThumbnailPreview.tsx)을 건드리지 않았다',
    unchanged('src/components/detailBuilder/components/ThumbnailPreview.tsx'));
  ok('본문 렌더 계약(types.ts)을 건드리지 않았다', unchanged('src/components/detailBuilder/types.ts'));
}

{
  const TYPES = read('src/components/detailBuilder/types.ts');
  ok('ProductData 에 진단 필드를 넣지 않았다',
    !/overlayExperiment|bodyTextRegions|BasicBodyOverlay/.test(TYPES));
  const PREVIEW = read('src/components/detailBuilder/components/PreviewGodo.tsx');
  ok('본문 렌더러가 진단 데이터를 전혀 모른다',
    !/overlayExperiment|bodyTextRegions|BasicBodyOverlay|판독 오버레이/.test(PREVIEW));
}

{
  ok('변환 결과 계약에 진단 필드가 **선택**으로 붙었다', /overlayExperiment\?:/.test(CONVERT));
  // ProductData 로 들어가는 객체(data)에는 진단 필드가 없어야 한다.
  const dataBlocks = CONVERT.match(/const data: Partial<ProductData> = \{[\s\S]*?\n  \};/g) || [];
  ok('ProductData 조립 블록 2곳을 찾았다', dataBlocks.length === 2, `${dataBlocks.length}곳`);
  ok('그 두 블록 어디에도 진단 필드가 없다',
    dataBlocks.every((b) => !/overlayExperiment|bodyTextRegions|Overlay/.test(b)));
  ok('진단은 결과 최상위(BasicConvertResult)에서만 반환된다',
    /return \{ data, notes, bandCount: bands\.length,[^}]*overlayExperiment/.test(CONVERT),
    'convertBasicWithAI 반환문에 overlayExperiment 없음');
  ok('진단 실패가 변환을 실패시키지 않는다(try 로 감쌌다)',
    /try \{[\s\S]{0,2000}planOverlayRegions[\s\S]{0,3000}\} catch/.test(CONVERT));
}

{
  const DIAG = read('src/components/detailBuilder/components/BasicBodyOverlayDiagnostic.tsx');
  ok('진단 컴포넌트가 존재한다', DIAG.length > 0);
  ok('기본은 접힘이다(details 에 open 없음)',
    /<details/.test(DIAG) && !/<details[^>]*\sopen/.test(DIAG));
  ok('세 고정 스타일(heading·body·label)만 쓴다',
    /heading:/.test(DIAG) && /body:/.test(DIAG) && /label:/.test(DIAG));
  ok('원본 통이미지를 그대로 보여 준다', /img[\s\S]{0,200}src=\{(img|image)\.src\}/.test(DIAG));
  const DIAG_CSS = read('src/components/detailBuilder/components/BasicBodyOverlayDiagnostic.css');
  ok('흰 사각 마스크를 그린다',
    /obd-mask/.test(DIAG) && /\.obd-mask[\s\S]{0,200}background:\s*#ffffff/.test(DIAG_CSS));
  ok('진단 스타일은 전용 접두사만 쓴다(기존 출력 스타일과 충돌 없음)',
    (DIAG_CSS.match(/^\s*\.[a-z-]+/gm) || []).every((sel) => sel.trim().startsWith('.obd-')),
    (DIAG_CSS.match(/^\s*\.[a-z-]+/gm) || []).filter((x) => !x.trim().startsWith('.obd-')).join(','));
  ok('교체·보존 목록과 사유를 함께 보여 준다',
    /교체/.test(DIAG) && /보존/.test(DIAG) && /reason/.test(DIAG));
  ok('신호 세 가지를 그대로 표시한다',
    /green/.test(DIAG) && /yellow/.test(DIAG) && /red/.test(DIAG));
  ok('진단 컴포넌트는 저장·다운로드를 전혀 부르지 않는다',
    !/toJpeg|download|detailRef|ensureExportReady|href=/.test(DIAG));
  ok('진단 컴포넌트는 ProductData 를 바꾸지 않는다(onChange 호출·전달 0건)',
    !/onChange\s*[=(]/.test(DIAG));
  ok('진단 컴포넌트는 실험 결과만 prop 으로 받는다(data·setData 없음)',
    !/data\s*:/.test(DIAG.split('const BasicBodyOverlayDiagnostic')[1] || ''));

  const EDITOR = read('src/components/detailBuilder/components/Editor.tsx');
  ok('Editor 가 진단 컴포넌트를 마운트한다',
    /import BasicBodyOverlayDiagnostic/.test(EDITOR) && /<BasicBodyOverlayDiagnostic/.test(EDITOR));
  ok('진단 데이터가 없으면 아무 것도 바뀌지 않는다(조건부 렌더)',
    /\{overlay && <BasicBodyOverlayDiagnostic|overlay \? <BasicBodyOverlayDiagnostic/.test(EDITOR));
  ok('진단 결과를 ProductData 에 합치지 않는다',
    !/\.\.\.res\.overlayExperiment|overlayExperiment: /.test(EDITOR.replace(/setOverlay\(res\.overlayExperiment[^)]*\)/g, '')));
}


// ── [6] Task 6.2 : 대표 4종 **fixture** 결과표 ───────────────────────────────
//
// ⚠️ 이것은 fixture 결과다. 실제 원본 이미지로 유료 Claude 판독을 돌린 결과가 아니다.
//    각 시나리오는 대표 4종의 **구조적 성격**(원본 레이아웃과 배경 성질)만 재현한다.
//    실제 상품 판정은 사용자가 Preview 에서 유료 1콜을 돌려 눈으로 확인해야 한다.
console.log('[7/7] 대표 4종 fixture 결과표');

// 배경 성질별 합성 픽셀 → 흰 배경 게이트를 **실제로 통과시켜** 판정을 얻는다(임의 true/false 금지).
const bg = {
  white: () => [255, 255, 255],
  color: () => [236, 128, 96],
  gradient: (x) => { const v = 200 + Math.round((x / 40) * 55); return [v, v, v]; },
  photo: (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * 7 + y * 53) % 256],
};
const verdictFor = (kind) => judgeWhiteRing(sample(bg[kind]));

// 시나리오 = { 이름, 원본 파일 수, 본문에 실리는 파일, 밴드 출처, AI 장부, 배경 성질 }
const SCENARIOS = [
  {
    name: '평범형(샘플 1 성격)',
    shape: '흰 배경 위에 제목·설명이 따로 놓인 단순 구성',
    sources: [{ src: 'a0', isGif: false, promo: false }, { src: 'a1', isGif: false, promo: false }],
    firstBodySource: 1, cropY: 0,
    origins: [
      { sourceIndex: 0, y: 0, width: 800, height: 600, isGif: false, promo: false },
      { sourceIndex: 1, y: 0, width: 800, height: 500, isGif: false, promo: false },
      { sourceIndex: 1, y: 500, width: 800, height: 500, isGif: false, promo: false },
    ],
    regions: [
      { bandIndex: 1, rect: { x: 0.08, y: 0.10, width: 0.84, height: 0.08 }, text: '부드러운 실리콘 소재', role: 'heading', action: 'replace', reviewNote: '' },
      { bandIndex: 1, rect: { x: 0.08, y: 0.30, width: 0.84, height: 0.12 }, text: '피부에 닿는 느낌이 부드럽습니다.', role: 'body', action: 'replace', reviewNote: '' },
      { bandIndex: 2, rect: { x: 0.08, y: 0.20, width: 0.84, height: 0.08 }, text: '간편한 사용법', role: 'heading', action: 'replace', reviewNote: '' },
    ],
    background: { 0: 'white', 1: 'white', 2: 'white' },
    expect: 'green',
  },
  {
    name: '비대칭형(샘플 2 성격)',
    shape: '이미지 수와 설명 수가 다름 — 짝맞춤을 하지 않으므로 개수 불일치가 문제되지 않는다',
    sources: [{ src: 'b0', isGif: false, promo: false }, { src: 'b1', isGif: false, promo: false }],
    firstBodySource: 0, cropY: 240,
    origins: [
      { sourceIndex: 0, y: 300, width: 800, height: 400, isGif: false, promo: false },
      { sourceIndex: 1, y: 0, width: 800, height: 900, isGif: false, promo: false },
      { sourceIndex: 1, y: 900, width: 800, height: 300, isGif: false, promo: false },
    ],
    regions: [
      { bandIndex: 0, rect: { x: 0.10, y: 0.10, width: 0.80, height: 0.10 }, text: '제품 특징', role: 'heading', action: 'replace', reviewNote: '' },
      { bandIndex: 1, rect: { x: 0.10, y: 0.05, width: 0.80, height: 0.06 }, text: '길이 12cm', role: 'label', action: 'keep_raster', reviewNote: '치수선에 붙은 숫자라 원본을 지킨다' },
      { bandIndex: 2, rect: { x: 0.10, y: 0.30, width: 0.80, height: 0.10 }, text: '구성품 안내', role: 'body', action: 'replace', reviewNote: '' },
    ],
    background: { 0: 'white', 2: 'white' },
    expect: 'yellow',
  },
  {
    name: '복합형(프리티 성격)',
    shape: '단일 원본 파일 · 사진 위 글자와 흰 배경 글자가 섞임',
    sources: [{ src: 'c0', isGif: false, promo: false }],
    firstBodySource: 0, cropY: 1200,
    origins: [
      { sourceIndex: 0, y: 1200, width: 650, height: 800, isGif: false, promo: false },
      { sourceIndex: 0, y: 2000, width: 650, height: 800, isGif: false, promo: false },
      { sourceIndex: 0, y: 2800, width: 650, height: 800, isGif: false, promo: false },
    ],
    regions: [
      { bandIndex: 0, rect: { x: 0.10, y: 0.10, width: 0.80, height: 0.08 }, text: '세척이 쉬운 구조', role: 'heading', action: 'replace', reviewNote: '' },
      { bandIndex: 1, rect: { x: 0.10, y: 0.40, width: 0.80, height: 0.10 }, text: '사진 위에 얹힌 카피', role: 'body', action: 'replace', reviewNote: '' },
      { bandIndex: 2, rect: { x: 0.15, y: 0.55, width: 0.60, height: 0.08 }, text: '부위 표시', role: 'label', action: 'keep_raster', reviewNote: '제품 부위를 직접 가리키는 표식' },
    ],
    background: { 0: 'white', 1: 'photo' },
    expect: 'yellow',
  },
  {
    name: '예외형(샘플 6 성격)',
    shape: '글자와 그래픽이 페이지 전체에 강하게 통합된 디자인',
    sources: [{ src: 'd0', isGif: false, promo: false }],
    firstBodySource: 0, cropY: 0,
    origins: [
      { sourceIndex: 0, y: 0, width: 800, height: 1000, isGif: false, promo: false },
      { sourceIndex: 0, y: 1000, width: 800, height: 1000, isGif: false, promo: false },
    ],
    regions: [
      { bandIndex: 0, rect: { x: 0.05, y: 0.10, width: 0.90, height: 0.20 }, text: '색 띠 위 대형 카피', role: 'heading', action: 'replace', reviewNote: '' },
      { bandIndex: 1, rect: { x: 0.05, y: 0.10, width: 0.90, height: 0.15 }, text: '도해 안 설명', role: 'label', action: 'keep_raster', reviewNote: '도해 내부 라벨' },
    ],
    background: { 0: 'color' },
    expect: 'red',
  },
];

const rows = [];
for (const sc of SCENARIOS) {
  const bodyIndexBySource = new Map();
  const images = [];
  sc.sources.forEach((f, i) => {
    const sourceIndex = sc.firstBodySource + i;
    if (sourceIndex >= sc.sources.length || f.promo) return;
    bodyIndexBySource.set(sourceIndex, images.length);
    images.push({ bodySourceIndex: images.length, sourceIndex, src: f.src, width: 800, height: 4000 });
  });

  const plan = planOverlayRegions({
    regions: sc.regions,
    bandCount: sc.origins.length,
    origins: sc.origins,
    cropY: (si) => (si === sc.firstBodySource ? sc.cropY : 0),
    bodySourceIndexOf: (si) => (bodyIndexBySource.has(si) ? bodyIndexBySource.get(si) : -1),
  });

  const verdicts = {};
  plan.candidates.forEach((c, i) => {
    const kind = sc.background[plan.decisions.findIndex((d) => d.id === c.region.id)]
      ?? sc.background[i] ?? 'white';
    verdicts[c.region.id] = verdictFor(kind);
  });
  const exp = finalizeOverlayExperiment(plan, verdicts, images);

  // 본문 출력은 어떤 시나리오에서도 그대로여야 한다.
  const body = assembleBodyFromSourceImages(sc.sources.slice(sc.firstBodySource));
  const bodyItems = body.sections[0].items.map((it) => it.src).join(',');

  rows.push({
    시나리오: sc.name,
    본문원본보존: bodyItems === sc.sources.slice(sc.firstBodySource).map((f) => f.src).join(',') ? 'O' : 'X',
    허용마스크: exp.decisions.filter((d) => d.outcome === 'replaced').length,
    HTML문구: exp.decisions.filter((d) => d.outcome === 'replaced').length,
    보존영역: exp.decisions.filter((d) => d.outcome === 'kept_raster').length,
    제외: exp.decisions.filter((d) => d.outcome === 'rejected').length + exp.rejected.length,
    신호: exp.signal.toUpperCase(),
  });

  ok(`fixture · ${sc.name} → ${sc.expect.toUpperCase()}`, exp.signal === sc.expect,
    `실제 ${exp.signal} / ${JSON.stringify(exp.decisions.map((d) => [d.text, d.outcome]))}`);
  ok(`fixture · ${sc.name} 본문 원본 순서·개수 불변`,
    bodyItems === sc.sources.slice(sc.firstBodySource).map((f) => f.src).join(','), bodyItems);
  ok(`fixture · ${sc.name} 모든 결정에 사유가 있다`,
    exp.decisions.every((d) => typeof d.reason === 'string' && d.reason.length > 0));
}

console.log('\n대표 4종 **fixture** 결과 (실제 유료 판독 아님):');
console.table(rows);

// ── 결과 ─────────────────────────────────────────────────────────────────────
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
