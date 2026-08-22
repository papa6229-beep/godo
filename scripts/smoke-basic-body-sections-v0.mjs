// 기본형 변환기 1차 패치 — 원본 섹션 순서 보존(동적 본문 섹션) 집중검사.
//
// 검사 대상(제품 코드): src/components/detailBuilder/services/basicBodyAssembly.ts 를 tsc 로 컴파일해
//   실제 함수를 호출한다. 문자열 존재 검사만으로 통과시키지 않는다(헌법 §10 · CLAUDE.md §5).
//   순수 함수로 옮길 수 없는 결선(렌더·파이프라인)만 소스 대조로 보조 확인한다.
//
// ⚠️ 유료 AI 호출 0회. Claude 응답은 stub(고정 JSON)으로만 확인한다.
// ⚠️ 밴드 fixture 는 실제 핑거위글 원본(요약 1667813618_0.jpg 800×2693 · 홍보 1667813619_1.gif 800×450 ·
//    본문 1667813619_2.jpg 800×12272)을 여백분할 규칙(whiteThreshold 232 · whiteFrac 0.98 ·
//    minGapPx 40 · minSegPx 20)으로 재현해 얻은 밴드 순서(5 + 1 + 27 = 33)를 그대로 옮긴 것이다
//    (2026-08-22 로컬 관측). 픽셀을 다시 자르는 검사는 아니다(캔버스 없음 — 기본형 구조적 공백 B-2).
//
// 실행: node scripts/smoke-basic-body-sections-v0.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const repo = process.cwd();
const outDir = mkdtempSync(path.join(tmpdir(), 'godo-basic-body-'));
const tscBin = path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = (relFile) => execFileSync(
  process.execPath,
  [tscBin, path.join(repo, relFile),
    '--outDir', outDir, '--module', 'esnext', '--target', 'ES2022',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--lib', 'ES2022,DOM'],
  { stdio: 'pipe', cwd: tmpdir() },  // 저장소 tsconfig.json 자동 로드 방지(TS5112)
);

console.log('[1/9] 컴파일');
// constants.ts → types.ts → services/basicBodyAssembly.ts 가 한 프로그램으로 함께 컴파일된다.
compile('src/components/detailBuilder/constants.ts');
const mod = await import(pathToFileURL(path.join(outDir, 'services/basicBodyAssembly.js')).href);
const {
  selectBasicSlots, assembleBasicBody, buildBasicSummaryInfo, hasDynamicBody, BODY_DUP_HAMMING,
  isSizeSection, isWeightLine, trailingMediaRunStart, bodyPointLabel,
} = mod;
ok('모듈이 다섯 진입점을 내보낸다',
  [selectBasicSlots, assembleBasicBody, buildBasicSummaryInfo, hasDynamicBody].every((f) => typeof f === 'function') && BODY_DUP_HAMMING === 10);
ok('렌더 규칙 판정 3종도 순수 함수로 내보낸다',
  [isSizeSection, isWeightLine, trailingMediaRunStart].every((f) => typeof f === 'function'));

// ── 핑거위글 밴드 fixture (실측 순서) ────────────────────────────────────────
//  0..4  = 요약정보 원본(1667813618_0.jpg) 5밴드
//  5     = 바나나몰 홍보 GIF(1667813619_1.gif)
//  6..32 = 본문 통이미지(1667813619_2.jpg) 27밴드
const dh = (seed) => {                       // 밴드마다 충분히 다른 64bit 해시(동일 seed = 동일 컷)
  let x = (seed * 2654435761) >>> 0;
  return Array.from({ length: 64 }, () => { x = (x * 1664525 + 1013904223) >>> 0; return ((x >>> 16) & 1) === 1; });
};
const band = (id, type, opts = {}) => ({
  src: opts.src || `band://${id}`,
  type,
  promo: !!opts.promo,
  isGif: !!opts.isGif,
  metrics: {
    color: opts.color ?? 0.02, smallCC: opts.smallCC ?? 3, largestCC: opts.largestCC ?? 0.30,
    fillRatio: opts.fillRatio ?? 0.40, height: opts.height ?? 500, dhash: dh(opts.dupOf ?? id),
  },
});
const BANDS = [
  band(0, 'TEXT', { smallCC: 30, largestCC: 0.01 }),                          // 상품명 한/영
  band(1, 'PHOTO', { color: 0.59, largestCC: 0.695, height: 1153 }),          // 분홍 배경 메인 + 요약정보 표
  band(2, 'TEXT', { smallCC: 60, largestCC: 0.02, color: 0.30 }),             // 3줄 카피
  band(3, 'PHOTO', { fillRatio: 0.72, largestCC: 0.35, height: 431 }),        // 패키지 박스
  band(4, 'TEXT', { smallCC: 20, largestCC: 0.01 }),                          // 상품명 + Package Design
  band(5, 'PHOTO', { promo: true, isGif: true, color: 0.45, height: 450, src: 'https://cdn/1667813619_1.gif' }),
  band(6, 'TEXT', { smallCC: 18, largestCC: 0.02 }),                          // 01 제품특징(제목)
  band(7, 'TEXT', { smallCC: 40, largestCC: 0.01 }),                          // 01 설명 문단
  band(8, 'PHOTO', { largestCC: 0.33, height: 611 }),                         // 손 + 제품
  band(9, 'TEXT', { smallCC: 18, largestCC: 0.02 }),                          // 02 제품포인트(제목)
  band(10, 'TEXT', { smallCC: 45, largestCC: 0.01 }),                         // 02 설명 문단
  band(11, 'PHOTO', { largestCC: 0.30, height: 559 }),                        // 제품 + 리모컨
  band(12, 'TEXT', { smallCC: 22, largestCC: 0.01, height: 50 }),             // *본체의 전원을…
  band(13, 'PHOTO', { largestCC: 0.31, height: 486 }),
  band(14, 'PHOTO', { largestCC: 0.29, height: 453 }),
  band(15, 'PHOTO', { largestCC: 0.28, height: 349 }),
  band(16, 'TEXT', { smallCC: 16, largestCC: 0.02 }),                         // 03 제품 사이즈(제목)
  band(17, 'TEXT', { smallCC: 12, largestCC: 0.03, height: 35 }),             // 무게 : 약 97g
  band(18, 'MIXED', { largestCC: 0.127, smallCC: 31, color: 0.12, height: 528 }), // 사이즈 도해
  band(19, 'TEXT', { smallCC: 14, largestCC: 0.01, height: 21 }),             // *위 사이즈와 무게는…
  band(20, 'TEXT', { smallCC: 16, largestCC: 0.02 }),                         // 04 제품 전원(제목)
  band(21, 'TEXT', { smallCC: 13, largestCC: 0.03, height: 43 }),             // 전원 · 진동 버튼(라벨)
  band(22, 'MIXED', { largestCC: 0.150, smallCC: 79, height: 658 }),          // 복합(설명 + 지시선 + 제품)
  band(23, 'TEXT', { smallCC: 12, largestCC: 0.03, height: 43 }),             // 충전(라벨)
  band(24, 'PHOTO', { largestCC: 0.27, height: 359 }),                        // 충전 사진
  band(25, 'TEXT', { smallCC: 15, largestCC: 0.01, height: 23 }),             // USB연결형으로…
  band(26, 'TEXT', { smallCC: 15, largestCC: 0.01, height: 23 }),             // *리모컨은 CR2032…
  band(27, 'PHOTO', { largestCC: 0.34, height: 1105 }),
  band(28, 'PHOTO', { largestCC: 0.32, height: 454 }),
  band(29, 'PHOTO', { largestCC: 0.30, height: 348 }),
  band(30, 'PHOTO', { largestCC: 0.29, height: 559 }),
  band(31, 'PHOTO', { largestCC: 0.26, height: 700 }),                        // 사용 데모
  band(32, 'PHOTO', { fillRatio: 0.70, largestCC: 0.36, height: 431, dupOf: 3 }), // 본문 패키지 컷(= 요약 패키지와 같은 컷)
];

// fixture 자체 점검 — 우연한 해시 충돌이 검사 결과를 만들지 않게 한다.
const hamming = (a, b) => a.reduce((n, v, i) => n + (v === b[i] ? 0 : 1), 0);
let collisions = 0;
for (let i = 0; i < BANDS.length; i++) {
  for (let j = i + 1; j < BANDS.length; j++) {
    if (hamming(BANDS[i].metrics.dhash, BANDS[j].metrics.dhash) <= BODY_DUP_HAMMING) collisions += 1;
  }
}
ok('fixture) 동일 컷 쌍은 (3,32) 하나뿐', collisions === 1);

// ── Claude 1콜 stub 응답(핑거위글) ─────────────────────────────────────────
const VISION = {
  productNameKr: '핑거 위글\n전립선 마사져',
  productNameEn: 'FINGER WIGGLE PROSTATE MASSAGER',
  summary: { feature: '전립선 및 애널 자극 바이브레이터', type: '바이브레이터·삽입·핑거링·자동', material: '실리콘 · ABS', weight: '97g', power: 'USB 충전식', maker: 'SECWELL(섹웰)' },
  keyFeatures: [
    { title: '10단 티클링', desc: '손가락 튕기듯 튕겨지는 헤드' },
    { title: '10가지 진동모드', desc: '원하는 강도로 조절' },
    { title: '부드러운 실리콘', desc: '약한 점막에 부담 없이' },
  ],
  mainIndex: 27, featureIndex: 13, packageIndex: 3,
  summarySourceIndexes: [0, 1, 2, 3, 4],
  sections: [
    { number: '01', title: '제품특징', items: [
      { kind: 'text', text: '"핑거 위글 전립선 마사져"는 피부와 맞닿는 부분은 전부 부드러운 실리콘 소재로 사용해서\n약한 점막에 부담을 주지 않도록 하였습니다.' },
      { kind: 'media', index: 8 },
    ] },
    { number: '02', title: '제품포인트', items: [
      { kind: 'text', text: '간단한 버튼으로 다양한 진동 패턴과 티클링패턴을 즐길 수 있고\n##리모컨으로도 조정이 가능##해 색다른 플레이도 가능합니다.' },
      { kind: 'media', index: 11 },
      { kind: 'text', text: '*본체의 전원을 켜 놓으면 무선 컨트롤러로 조작이 가능합니다.' },
      { kind: 'media', index: 13 },
      { kind: 'media', index: 14 },
      { kind: 'media', index: 15 },
    ] },
    { number: '03', title: '제품 사이즈', items: [
      { kind: 'text', text: '무게 : 약 97g' },
      { kind: 'media', index: 18, composite: true },
      { kind: 'text', text: '*위 사이즈와 무게는 모두 수작업으로 측정되어 오차가 있을 수 있습니다.' },
    ] },
    { number: '04', title: '제품 전원', items: [
      { kind: 'text', text: '전원 · 진동 버튼' },
      { kind: 'media', index: 22, composite: true, reviewNote: '설명·지시선이 제품과 결합 — 분리 불가로 복합 보존' },
      { kind: 'text', text: '충전' },
      { kind: 'media', index: 24 },
      { kind: 'text', text: 'USB연결형으로 건전지 걱정없이! 충전해서 사용 할 수 있습니다.' },
      { kind: 'text', text: '*리모컨은 CR2032 건전지 1개를 사용합니다.' },
      { kind: 'media', index: 27 },
      { kind: 'media', index: 28 },
      { kind: 'media', index: 29 },
      { kind: 'media', index: 30 },
      { kind: 'media', index: 31 },
      { kind: 'media', index: 32 },
    ] },
  ],
  notes: [],
};

console.log('[2/9] 상단 요약 슬롯 선정(메인 · Key Feature · 패키지)');
const slots = selectBasicSlots(VISION, BANDS);
// 8. 메인 이미지와 Key Feature 이미지가 서로 다르다.
ok('8) 메인 ≠ Key Feature 인덱스', slots.mainIndex >= 0 && slots.featureIndex >= 0 && slots.mainIndex !== slots.featureIndex);
ok('8) 메인 · Key Feature 는 서로 같은 컷이 아니다(dHash)',
  hamming(BANDS[slots.mainIndex].metrics.dhash, BANDS[slots.featureIndex].metrics.dhash) > BODY_DUP_HAMMING);
// 9. 분홍 배경 요약 이미지·이미지화된 설명 자료가 메인/Key Feature 에 들어가지 않는다.
ok('9) 분홍 배경 요약 합성밴드(1)는 메인/피처 아님', slots.mainIndex !== 1 && slots.featureIndex !== 1);
ok('9) 텍스트 밴드는 메인/피처 아님', BANDS[slots.mainIndex].type !== 'TEXT' && BANDS[slots.featureIndex].type !== 'TEXT');
ok('9) 홍보 GIF 밴드(5)는 메인/피처 아님', slots.mainIndex !== 5 && slots.featureIndex !== 5);
ok('9) 패키지형(fillRatio>0.62) 밴드는 메인/피처 아님', ![slots.mainIndex, slots.featureIndex].some((i) => BANDS[i].metrics.fillRatio > 0.62));
// 11. 패키지 영역이 활성화되고 원본(요약영역) 패키지 이미지가 들어간다.
ok('11) 패키지 = 요약영역 패키지 밴드(3)', slots.packageIndex === 3);
ok('11) 패키지 자산 src 가 있다(= isPackageImageEnabled 근거)', BANDS[slots.packageIndex].src === 'band://3');
ok('reserved = 요약 원본 + 패키지(본문 재사용 금지 대상)', [0, 1, 2, 3, 4].every((i) => slots.reserved.has(i)));
ok('reserved 는 본문 제품컷을 가두지 않는다', !slots.reserved.has(8) && !slots.reserved.has(27));

// 음성 변형: Claude 가 홍보 GIF/텍스트 밴드를 슬롯으로 지목해도 채택되지 않는다.
const badSlots = selectBasicSlots({ ...VISION, mainIndex: 5, featureIndex: 6, packageIndex: 5 }, BANDS);
ok('음성) 홍보 GIF 를 패키지로 지목 → 거부(빈 슬롯)', badSlots.packageIndex === -1);
ok('음성) 홍보 GIF 를 메인으로 지목 → 깨끗한 컷으로 재선정', badSlots.mainIndex >= 0 && badSlots.mainIndex !== 5);
ok('음성) TEXT 밴드를 피처로 지목 → TEXT 아님', badSlots.featureIndex !== 6 && BANDS[badSlots.featureIndex].type !== 'TEXT');
ok('음성) 거부·재선정 사유가 기록된다', badSlots.decisions.some((d) => /promo|text|재선정|reselected/i.test(`${d.result} ${d.reason}`)));

console.log('[3/9] 스펙 5개(치수 고정 · 전원 원문)');
const summary = buildBasicSummaryInfo(VISION.summary, { brandName: 'SECWELL' });
// 10. 치수는 '상세페이지 참조', 전원은 'USB 충전식'.
ok('10) 치수 = 상세페이지 참조(고정)', summary.size === '상세페이지 참조');
ok('10) 전원 = USB 충전식(원본 값)', summary.power === 'USB 충전식');
ok('10) 타입·재질·무게는 원본 값', summary.type === '바이브레이터·삽입·핑거링·자동' && summary.material === '실리콘 · ABS' && summary.weight === '97g');
ok('10) 제조사는 엑셀 브랜드 우선', summary.maker === 'SECWELL');
ok('음성) AI 가 치수를 채워도 무시하고 고정', buildBasicSummaryInfo({ ...VISION.summary, size: '길이 약 12.5cm' }, {}).size === '상세페이지 참조');
ok('음성) 없는 값을 지어내지 않는다', buildBasicSummaryInfo({}, {}).type === '' && buildBasicSummaryInfo({}, {}).power === '');

console.log('[4/9] 본문 섹션 개수 · 순서');
const body = assembleBasicBody(VISION.sections, BANDS, { reserved: slots.reserved });
// 1. 본문 섹션이 정확히 4개이며 순서가 01, 02, 03, 04.
ok('1) 본문 섹션 4개', body.sections.length === 4);
ok('1) 섹션 번호 순서 01·02·03·04', body.sections.map((s) => s.number).join(',') === '01,02,03,04');
ok('1) 섹션 제목 보존', body.sections.map((s) => s.title).join('|') === '제품특징|제품포인트|제품 사이즈|제품 전원');
ok('1) 섹션 id 는 서로 다르다', new Set(body.sections.map((s) => s.id)).size === 4);
// 12. Size 섹션이 원본 위치 한 번만 나오고 최하단에 중복 생성되지 않는다.
ok('12) 사이즈 섹션은 원본 위치(3번째)에 1회', body.sections.filter((s) => s.number === '03').length === 1 && body.sections[2].number === '03');
ok('12) 동적 본문이 있으면 고정 Point/SIZE 렌더를 쓰지 않는다', hasDynamicBody({ godoBodySections: body.sections }) === true);
ok('12) 동적 본문이 없으면 기존(고정) 렌더 유지', hasDynamicBody({}) === false && hasDynamicBody({ godoBodySections: [] }) === false);

console.log('[5/9] 항목 순서 · 종류');
const kinds = (n) => body.sections.find((s) => s.number === n).items.map((it) => it.kind).join(',');
// 2. 각 섹션의 items 순서가 원본과 같다.
ok('2) 01 섹션 = 설명 → 이미지', kinds('01') === 'text,media');
ok('2) 02 섹션 = 설명 → 이미지 → 설명 → 이미지×3', kinds('02') === 'text,media,text,media,media,media');
ok('2) 03 섹션 = 무게 → 도해 → 주석', kinds('03') === 'text,media,text');
ok('2) 04 섹션 = 라벨 → 복합 → 라벨 → 사진 → 설명×2 → 사진×5(패키지 중복 1건 제외)',
  kinds('04') === 'text,media,text,media,text,text,media,media,media,media,media');
ok('2) 01 섹션 이미지 src 가 원본 밴드 8', body.sections[0].items[1].src === 'band://8');
ok('2) 04 섹션 미디어 순서가 원본 위→아래', body.sections[3].items.filter((i) => i.kind === 'media').map((i) => i.src).join(',')
  === 'band://22,band://24,band://27,band://28,band://29,band://30,band://31');
// 3. 번호·제목·독립 설명만 텍스트 항목이다(제목은 섹션 필드 — 항목으로 중복되지 않는다).
ok('3) 섹션 제목이 텍스트 항목으로 중복되지 않는다',
  body.sections.every((s) => s.items.every((it) => it.kind !== 'text' || it.text.trim() !== s.title)));
ok('3) 모든 미디어 항목의 밴드는 TEXT 타입이 아니다',
  body.sections.every((s) => s.items.every((it) => it.kind !== 'media' || BANDS.find((b) => b.src === it.src).type !== 'TEXT')));
ok('3) 텍스트 항목은 원문 줄바꿈을 보존한다', body.sections[0].items[0].text.includes('\n'));
ok('3) 텍스트 항목은 ##강조## 표기를 보존한다', body.sections[1].items[0].text.includes('##리모컨으로도 조정이 가능##'));

console.log('[6/9] 복합 이미지 보존');
const s04 = body.sections[3];
const composite = s04.items.filter((it) => it.kind === 'media' && it.composite);
// 4·5. 이미지 내부 설명·수치·표식은 미디어와 함께 남고, 04 복합 이미지는 쪼개지지 않는다.
ok('5) 04 복합 이미지(22)가 1개 항목으로 보존', composite.length === 1 && composite[0].src === 'band://22');
ok('5) 04 복합 이미지에 손검수 사유가 남는다', typeof composite[0].reviewNote === 'string' && composite[0].reviewNote.length > 0);
ok('4) 사이즈 도해(MIXED)도 복합으로 표시', body.sections[2].items[1].composite === true);
ok('4) MIXED 밴드는 AI 표시가 없어도 복합으로 본다', (() => {
  const r = assembleBasicBody([{ number: '01', title: 'x', items: [{ kind: 'media', index: 22 }] }], BANDS, { reserved: new Set() });
  return r.sections[0].items[0].composite === true;
})());
ok('4) 어떤 미디어도 두 번 쓰이지 않는다', (() => {
  const all = body.sections.flatMap((s) => s.items.filter((i) => i.kind === 'media').map((i) => i.src));
  return new Set(all).size === all.length;
})());
ok('4) 같은 밴드를 두 번 지목하면 두 번째는 제외', (() => {
  const r = assembleBasicBody([{ number: '01', title: 'x', items: [{ kind: 'media', index: 8 }, { kind: 'media', index: 8 }] }], BANDS, { reserved: new Set() });
  return r.sections[0].items.length === 1;
})());

console.log('[7/9] 본문에서 빠져야 할 것 / 남아야 할 것');
const allMedia = body.sections.flatMap((s) => s.items.filter((i) => i.kind === 'media').map((i) => i.src));
// 6. 요약정보 원본과 파란 홍보 GIF 는 본문에 없다.
ok('6) 요약정보 원본 밴드(0~4)가 본문에 없다', !allMedia.some((src) => ['band://0', 'band://1', 'band://2', 'band://3', 'band://4'].includes(src)));
ok('6) 바나나몰 홍보 GIF 가 본문에 없다', !allMedia.includes('https://cdn/1667813619_1.gif'));
ok('6) 요약 패키지와 같은 컷(32)은 중복으로 제외', !allMedia.includes('band://32'));
ok('6) 제외 사유가 기록된다', body.decisions.some((d) => d.result === 'dropped' && /promo|reserved|duplicate/.test(d.reason)));
ok('6) 본문 제품컷은 그대로 남는다(임의 삭제 금지)', ['band://8', 'band://11', 'band://13', 'band://24', 'band://31'].every((s) => allMedia.includes(s)));

// 음성 변형: AI 가 요약·홍보·텍스트·범위밖 밴드를 본문에 넣어도 로컬에서 막힌다.
const dirty = assembleBasicBody(
  [{ number: '01', title: 'x', items: [{ kind: 'media', index: 5 }, { kind: 'media', index: 1 }, { kind: 'media', index: 6 }, { kind: 'media', index: 99 }, { kind: 'media', index: 8 }] }],
  BANDS, { reserved: slots.reserved },
);
ok('음성) 홍보·요약·TEXT·범위밖 4건 차단, 정상 1건만 통과', dirty.sections[0].items.length === 1 && dirty.sections[0].items[0].src === 'band://8');
ok('음성) 차단 4건이 전부 사유와 함께 기록', dirty.decisions.filter((d) => d.result === 'dropped').length === 4);

// 7. 본문 기능 GIF 는 유지된다(정지 이미지로 바꾸지 않는다).
const GIF_BANDS = BANDS.concat([band(33, 'PHOTO', { isGif: true, src: 'https://cdn/usage_demo.gif', height: 600 })]);
const gifBody = assembleBasicBody(
  [{ number: '01', title: '사용법', items: [{ kind: 'media', index: 33 }] }],
  GIF_BANDS, { reserved: new Set() },
);
ok('7) 본문 기능 GIF 가 미디어로 유지', gifBody.sections[0].items.length === 1);
ok('7) mediaType 이 gif 로 표시', gifBody.sections[0].items[0].mediaType === 'gif');
ok('7) GIF 원본 자산을 그대로 쓴다(JPG 변환 없음)', gifBody.sections[0].items[0].src === 'https://cdn/usage_demo.gif');
ok('7) 일반 밴드는 image 로 표시', body.sections[0].items[1].mediaType === 'image');

console.log('[8/9] 섹션이 비어도 개수 · 순서를 지킨다');
const emptySec = assembleBasicBody(
  [{ number: '01', title: 'a', items: [{ kind: 'media', index: 5 }] }, { number: '02', title: 'b', items: [{ kind: 'text', text: 'ok' }] }],
  BANDS, { reserved: new Set() },
);
ok('빈 섹션도 삭제하지 않는다', emptySec.sections.length === 2 && emptySec.sections[0].items.length === 0);
ok('빈 섹션은 검수 안내를 남긴다', emptySec.notes.some((n) => n.includes('01')));
ok('빈 텍스트 항목은 버린다', assembleBasicBody([{ number: '01', title: 'a', items: [{ kind: 'text', text: '   ' }] }], BANDS, { reserved: new Set() }).sections[0].items.length === 0);
ok('섹션이 0개면 빈 배열과 안내를 돌려준다', (() => { const r = assembleBasicBody([], BANDS, { reserved: new Set() }); return r.sections.length === 0 && r.notes.length > 0; })());
ok('번호 없는 섹션도 순서를 유지한다', (() => {
  const r = assembleBasicBody([{ title: '가', items: [] }, { title: '나', items: [] }], BANDS, { reserved: new Set() });
  return r.sections.length === 2 && r.sections[0].title === '가' && r.sections[1].title === '나';
})());

// ══════════════════════════════════════════════════════════════════════════
// [P2] 1차 결과 교정 Patch (2026-08-22) — ① 메인 컷 ② 사이즈 섹션 ③ 텍스트/복합 ④ 나열부 구분
// ══════════════════════════════════════════════════════════════════════════
console.log('[8-b] ① 메인 = 제품 단독 컷 · 손이 든 컷은 KEY FEATURE 로');
{
  // 8=손+제품(핑거위글 실제 01 섹션), 28=제품 단독. "어느 컷이 단독인가"는 판독(AI)이 정하고,
  //   로컬은 그 선택이 깨끗한 컷 자격을 지키는지 검증만 한다(새 이미지 분석기·사람 감지 없음).
  const s = selectBasicSlots({ ...VISION, mainIndex: 28, featureIndex: 8, mainIsSoloProductCut: true }, BANDS);
  ok('①-1. 제품 단독 컷이 메인', s.mainIndex === 28);
  ok('①-2. 손이 포함된 컷도 KEY FEATURE 로는 사용 가능', s.featureIndex === 8);
  ok('①-3. 메인 ≠ KEY FEATURE 유지', s.mainIndex !== s.featureIndex);
  ok('①-4. 단독 컷일 때는 손검수 안내가 없다', !s.notes.some((n) => n.includes('제품 외 요소')));
}
{
  // 단독 컷이 부족해 AI 가 mainIsSoloProductCut:false 로 알려온 경우 — 변환은 계속되고 note 만 남는다.
  const s = selectBasicSlots({ ...VISION, mainIsSoloProductCut: false }, BANDS);
  ok('①-5. 단독 컷 부족: 변환 계속(메인 비우지 않음)', s.mainIndex >= 0);
  ok('①-6. 손검수 note 를 남긴다', s.notes.includes('메인 이미지에 제품 외 요소 포함 — 손검수 필요.'));
  ok('①-7. 미회신(undefined)이면 note 를 만들지 않는다', !selectBasicSlots(VISION, BANDS).notes.some((n) => n.includes('제품 외 요소')));
}

console.log('[8-c] ② 사이즈 섹션 · ④ 나열부 구분 판정');
ok('②-1. 사이즈 섹션만 대상', isSizeSection({ title: '제품 사이즈' }) === true
  && isSizeSection({ title: 'SIZE' }) === true
  && isSizeSection({ title: '제품 전원' }) === false && isSizeSection({ title: '제품특징' }) === false);
ok('②-2. 무게 한 줄만 알약 대상', isWeightLine('무게 : 약 97g') === true && isWeightLine('무게 : 약 1,250g') === true);
ok('②-3. 무게가 섞인 주석 문장은 알약 대상 아님',
  isWeightLine('*위 사이즈와 무게는 모두 수작업으로 측정되어 오차가 있을 수 있습니다.') === false);
ok('②-4. 무게와 무관한 문장·빈 값은 대상 아님', isWeightLine('전원 · 진동 버튼') === false && isWeightLine('') === false && isWeightLine(undefined) === false);
ok('④-1. 마지막 섹션: 마지막 텍스트 뒤 미디어 2장 이상 → 그 시작 위치 1곳', trailingMediaRunStart(body.sections[3], true) === 6);
ok('④-2. 중간 섹션(02: 설명에 소속된 연속 이미지)은 구분 대상 아님', trailingMediaRunStart(body.sections[1], false) === -1);
ok('④-2b. 마지막 섹션 조건을 빼면 아예 판정하지 않는다(기본값 false)', trailingMediaRunStart(body.sections[3]) === -1);
ok('④-3. 마지막이 미디어 1장뿐이면 구분하지 않는다',
  trailingMediaRunStart({ items: [{ kind: 'text', text: 'a' }, { kind: 'media', src: 'x' }] }, true) === -1);
ok('④-4. 설명이 하나도 없으면 구분 기준이 없다',
  trailingMediaRunStart({ items: [{ kind: 'media', src: 'x' }, { kind: 'media', src: 'y' }] }, true) === -1);
ok('④-5. 03 사이즈 섹션은 텍스트로 끝나 구분 없음', trailingMediaRunStart(body.sections[2], true) === -1);

console.log('[8-d] ③ 독립 설명문은 text · 이미지 결합 설명은 복합 미디어');
{
  // 핑거위글 04 섹션에서 문제가 된 네 문장이 text 항목으로 남는지(순서·개수 불변)
  const s04items = body.sections[3].items;
  const texts = s04items.filter((i) => i.kind === 'text').map((i) => i.text);
  ok('③-1. "전원 · 진동 버튼" 이 text', texts.includes('전원 · 진동 버튼'));
  ok('③-2. "충전" 이 text', texts.includes('충전'));
  ok('③-3. USB 안내 문장이 text', texts.some((t) => t.startsWith('USB연결형으로')));
  ok('③-4. CR2032 주석이 text', texts.some((t) => t.startsWith('*리모컨은 CR2032')));
  ok('③-5. 지시선이 붙은 설명은 복합 이미지 1장 그대로', s04items.filter((i) => i.kind === 'media' && i.composite).length === 1);
  ok('③-6. 04 섹션 항목 순서·개수 불변(교정 전과 동일)',
    s04items.map((i) => i.kind).join(',') === 'text,media,text,media,text,text,media,media,media,media,media');
}

// ══════════════════════════════════════════════════════════════════════════
// [P3] 글랜스 2차 호환 Patch (2026-08-22) — A 상품명 정본 · B 고정 Point 번호 · C 글자 전용 밴드
// ══════════════════════════════════════════════════════════════════════════
console.log('[8-e] A. 상품명 정본(엑셀 파서) — 글랜스 (NTS) 코드 괄호');
{
  const parserOut = mkdtempSync(path.join(tmpdir(), 'godo-parser-'));
  execFileSync(process.execPath,
    [tscBin, path.join(repo, 'src/components/detailBuilder/services/mainMallExcelParser.ts'),
      '--outDir', parserOut, '--module', 'esnext', '--target', 'ES2022',
      '--moduleResolution', 'bundler', '--skipLibCheck', '--lib', 'ES2022,DOM'],
    { stdio: 'pipe', cwd: tmpdir() });
  const P = await import(pathToFileURL(path.join(parserOut, 'mainMallExcelParser.js')).href);
  const g = P.parseProductName('[10단 진동] 글랜스 페니스 트레이너(Glans Penis Trainer) - NVTOYS(WS-NV565) (NTS)');
  ok('A-1. 글랜스 한글 상품명', g.nameKr === '글랜스 페니스 트레이너', g && g.nameKr);
  ok('A-2. 글랜스 영문 상품명(= NTS 가 아니다)', g.nameEn === 'Glans Penis Trainer');
  ok('A-3. 글랜스 브랜드', g.brandInline === 'NVTOYS');
  ok('A-4. 대괄호 태그 보존', g.eyebrow === '10단 진동');
  const f = P.parseProductName('[10단 티클링+진동] 핑거 위글 전립선 마사져 (Finger Wiggle Prostate Massager) - SECWELL(SW1064-2) (SWL)(TJ)');
  ok('A-5. 핑거위글 결과 불변', f.nameKr === '핑거 위글 전립선 마사져' && f.nameEn === 'Finger Wiggle Prostate Massager' && f.brandInline === 'SECWELL');
  const t = P.parseProductName('[일본 직수입] 모에 구멍 트리니티 (萌あなトリニティ) - 라이드재팬 (OH-3036)(NPR)');
  ok('A-6. 기존 일본어 상품명 불변', t.nameKr === '모에 구멍 트리니티' && t.nameEn === '萌あなトリニティ');
  const r1 = P.parseProductName('롬프 프리 (ROMP Free) - 롬프');
  const r2 = P.parseProductName('무빙 볼 (Moving Ball)');
  ok('A-7. 코드가 아닌 실제 영문 괄호 상품명은 보존(ROMP Free · Moving Ball)',
    r1.nameEn === 'ROMP Free' && r2.nameEn === 'Moving Ball');
  ok('A-8. 광범위 정규식으로 바뀌지 않았다(알려진 벤더 목록 + 숫자 포함 코드만)',
    /NPR\|TJ\|SWL\|SNN\|LVH\|NTS/.test(readFileSync(path.join(repo, 'src/components/detailBuilder/services/mainMallExcelParser.ts'), 'utf8')));
}

console.log('[8-f] B. 본문 제목은 배열 순서 고정(Point 01·02·03…)');
ok('B-1. 번호가 없어도 배열 순서대로 Point 01~03', [0, 1, 2].map(bodyPointLabel).join(',') === 'Point 01,Point 02,Point 03');
ok('B-2. 두 자리 표기', bodyPointLabel(0) === 'Point 01' && bodyPointLabel(9) === 'Point 10');
ok('B-3. 원본 번호가 빈 섹션 3개도 순서·개수 그대로 조립된다', (() => {
  const r = assembleBasicBody(
    [{ title: '파트너를 위한 진동 자극', items: [{ kind: 'text', text: '설명' }] },
      { title: '', items: [{ kind: 'media', index: 8 }] },
      { title: '', items: [{ kind: 'media', index: 11 }] }],
    BANDS, { reserved: new Set() },
  );
  return r.sections.length === 3 && r.sections.every((s) => s.number === '')
    && r.sections[0].title === '파트너를 위한 진동 자극' && r.sections[1].title === '' && r.sections[2].title === '';
})());

console.log('[8-g] C. 제품이 없는 글자 전용 밴드 · 파란 복합 이미지');
{
  // 33 = 파란 제목 띠 + 설명만 있는 글자 전용 밴드(태거는 색·행점유로 MIXED 로 본다)
  // 34 = 제품 사진 + 설명 + 사이즈 도해가 한 파란 배경에 결합된 밴드
  const GB = BANDS.concat([
    band(33, 'MIXED', { color: 0.42, smallCC: 44, largestCC: 0.06, height: 260 }),
    band(34, 'MIXED', { color: 0.38, smallCC: 52, largestCC: 0.21, height: 900 }),
  ]);
  const r = assembleBasicBody([
    { number: '', title: '파트너를 위한 진동 자극', items: [
      { kind: 'text', text: '진동은 파트너에게도 그대로 전달됩니다.' },   // 글자 전용 밴드 → text 로 옮겨진 결과
      { kind: 'media', index: 34, composite: true, reviewNote: '제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요' },
    ] },
  ], GB, { reserved: new Set() });
  const items = r.sections[0].items;
  ok('C-1. 글자 전용 영역은 text 항목', items[0].kind === 'text' && items[0].text.includes('진동은 파트너'));
  ok('C-2. 제목 문구는 섹션 보조 제목에만(항목 텍스트로 중복 없음)',
    r.sections[0].title === '파트너를 위한 진동 자극' && !items.some((i) => i.kind === 'text' && i.text.trim() === '파트너를 위한 진동 자극'));
  ok('C-3. 파란 복합 이미지는 media·composite 로 보존', items[1].kind === 'media' && items[1].composite === true);
  ok('C-4. reviewNote 원문 보존(새 경고 UI 없이 기존 경로)', items[1].reviewNote === '제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요');
  ok('C-5. 항목 개수·순서 불변(분해하지 않는다)', items.length === 2 && items.map((i) => i.kind).join(',') === 'text,media');
  ok('C-6. MIXED 라벨을 로컬에서 강제 변환하지 않는다(판독 결과를 그대로 존중)', (() => {
    const m = assembleBasicBody([{ number: '', title: 'x', items: [{ kind: 'media', index: 33 }] }], GB, { reserved: new Set() });
    return m.sections[0].items.length === 1 && m.sections[0].items[0].composite === true;
  })());
}

console.log('[9/9] 결선 · 계약 대조(소스)');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');
const convertSrc = read('src/components/detailBuilder/services/godoBasicConvert.ts');
const readerSrc = read('src/components/detailBuilder/services/basicVisionReader.ts');
const previewSrc = read('src/components/detailBuilder/components/PreviewGodo.tsx');
const thumbSrc = read('src/components/detailBuilder/components/ThumbnailPreview.tsx');
const assemblySrc = read('src/components/detailBuilder/services/basicBodyAssembly.ts');

// 14. 외부 AI 호출은 최대 1회이고 섹션별 호출이 없다.
ok('14) 변환 1회당 readBasicLayout 호출부 1곳', (convertSrc.match(/await readBasicLayout\(/g) || []).length === 1);
ok('14) 변환기에 다른 AI·네트워크 호출 경로 없음', !/chatWithProvider|fetch\(/.test(convertSrc));
ok('14) 섹션 반복 안에서 AI 를 부르지 않는다', !/for\s*\([^)]*\)[\s\S]{0,200}readBasicLayout/.test(convertSrc));
ok('14) 조립 모듈은 네트워크·AI 를 쓰지 않는다', !/fetch\(|chatWithProvider|XMLHttpRequest/.test(assemblySrc));
ok('14) 조립 모듈은 DOM 을 쓰지 않는다(Node 검증 가능)', !/document\.|new Image\(|createElement/.test(assemblySrc));
ok('14) 리더에 자동 재시도 루프가 없다', !/while\s*\(|for\s*\([^)]*\)[\s\S]{0,120}chatWithProvider/.test(readerSrc));

// 결선: 동적 섹션이 화면까지 연결됐는가
ok('결선) PreviewGodo 가 동적 본문 섹션을 렌더한다', /godoBodySections/.test(previewSrc));
ok('결선) PreviewGodo 가 hasDynamicBody 로 고정 Point/SIZE 를 가른다', /hasDynamicBody/.test(previewSrc));
ok('결선) 변환기가 동적 섹션을 ProductData 에 싣는다', /godoBodySections/.test(convertSrc));
ok('결선) 변환기가 조립 모듈을 쓴다(중복 구현 없음)', /assembleBasicBody|selectBasicSlots|buildBasicSummaryInfo/.test(convertSrc));
ok('결선) 리더가 sections · summarySourceIndexes 를 요청한다', /sections/.test(readerSrc) && /summarySourceIndexes/.test(readerSrc));
// 1차 결과 교정 Patch 결선
ok('결선) 판독 지시에 "제품 단독 컷 우선 · 손/사람 배제 · 단독 컷 없으면 계속" 이 있다',
  /제품만 단독/.test(readerSrc) && /손·사람/.test(readerSrc) && /mainIsSoloProductCut/.test(readerSrc));
ok('결선) 판독 지시에 텍스트/복합 구분 기준(떼어도 읽히는가)이 있다', /떼어도/.test(readerSrc));
ok('결선) 변환기가 단독 컷 여부를 슬롯 선정에 넘긴다', /mainIsSoloProductCut/.test(convertSrc));
ok('결선) 새 이미지 분석기·사람 감지기를 만들지 않았다(임계값 상수 불변)',
  /MAX_COLOR: 0\.20/.test(assemblySrc) && /MAX_SMALL_CC: 10/.test(assemblySrc)
  && /MIN_LARGEST_CC: 0\.12/.test(assemblySrc) && /MAX_FILL_RATIO: 0\.62/.test(assemblySrc));
ok('결선) 렌더러가 사이즈 섹션·무게 알약·나열부 판정을 순수 함수로 받는다',
  /isSizeSection/.test(previewSrc) && /isWeightLine/.test(previewSrc) && /trailingMediaRunStart/.test(previewSrc));
ok('결선) 나열부에 새 제목·번호를 만들지 않는다', !/제품 이미지<\/h2>|>제품 이미지</.test(previewSrc));
ok('결선) 사이즈 섹션 미디어만 무테로 분기한다', /noBorder \? undefined : \{ border: IMG_BORDER \}/.test(previewSrc));
// 글랜스 2차 호환 Patch 결선
ok('결선) 본문 주 번호를 원본 sec.number 가 아니라 배열 순서로 렌더한다',
  /bodyPointLabel\(i\)/.test(previewSrc) && !/\{sec\.number\}<\/h2>/.test(previewSrc));
ok('결선) 원본 제목이 있을 때만 보조 제목을 렌더한다', /\(sec\.title \|\| ''\)\.trim\(\) && \(/.test(previewSrc));
ok('결선) 상품명 정본은 엑셀 값이 먼저다', /productNameKr: input\.productNameKr \|\| r\.productNameKr/.test(convertSrc)
  && /productNameEn: input\.productNameEn \|\| r\.productNameEn/.test(convertSrc));
ok('결선) 판독 지시에 "제품 없는 MIXED 는 text" 규칙이 있다',
  /제품 사진·사람·제품 도해·일러스트가 하나도 없고/.test(readerSrc) && /title 에만 넣고/.test(readerSrc));
ok('결선) 판독 지시에 파란 복합 이미지 reviewNote 예시가 있다',
  /제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요/.test(readerSrc));
ok('결선) 태거·분할기·단순형은 이번에 손대지 않았다(판정 상수 불변)',
  /TEXT_MAX_LARGEST_CC: 0\.08/.test(read('src/components/detailBuilder/services/basicBandTagger.ts'))
  && /minSegPx \?\? 48/.test(read('src/components/detailBuilder/services/flowImageSplitter.ts')));
ok('결선) AI 에게 픽셀 좌표를 묻지 않는다', !/"?(cropY|cropX|bbox|pixel)"?/.test(readerSrc));

// 13. 기존 자동 섬네일 기능의 입력·출력 계약이 변하지 않는다.
const consts = await import(pathToFileURL(path.join(outDir, 'constants.js')).href);
ok('13) 섬네일 프리셋 4종 유지', consts.THUMBNAIL_PRESETS.length === 4);
ok('13) 프리셋 규격 202/400/500/274x411 유지',
  consts.THUMBNAIL_PRESETS.map((p) => `${p.width}x${p.height}`).join(',') === '202x202,400x400,500x500,274x411');
ok('13) 274x411 만 패키지 숨김 유지', consts.THUMBNAIL_PRESETS.filter((p) => p.hidePackage).length === 1);
ok('13) 섬네일 이미지 입력 = thumbnailImage || mainImage 유지', /thumbnailImage\s*\|\|\s*data\.mainImage/.test(thumbSrc));
ok('13) 섬네일은 본문 섹션을 참조하지 않는다', !/godoBodySections/.test(thumbSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
