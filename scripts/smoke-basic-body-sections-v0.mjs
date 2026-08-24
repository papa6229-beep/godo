// 기본형 변환기 집중검사 — 본문 원본 보존 출력 + 밴드 장부 계약(보존 자산) + 3사례 회귀.
//
// ⚠️ 2026-08-24 2차 패치 이후의 역할 구분 — 어느 검사가 "실제 화면"을 말하는지 헷갈리지 말 것:
//   · [9-b] 본문 = 원본 파일 그대로(assembleBodyFromSourceImages) = **현재 제품이 실제로 쓰는 본문 경로**.
//   · [9] 밴드 단위 보존(assembleBodyPreserved) = 1차 패치의 경로. 지금은 **제품이 부르지 않는 보존 자산**.
//   · [2]~[5] 장부·섹션 조립 = 리디자인 단계 참고 자산으로 **보존만 하는 모듈**의 계약 검사다.
//     [9]·[2]~[5] 가 통과해도 본문 화면 출력이 그렇게 나온다는 뜻이 아니다(제품 경로는 [9-b]·[10] 이 정본).
//
// 검사 방식: src/components/detailBuilder/services/basicBodyAssembly.ts 와 mainMallExcelParser.ts 를
//   tsc 로 컴파일해 **실제 함수를 호출**한다. 문자열 존재 검사만으로 통과시키지 않는다(헌법 §10 · CLAUDE.md §5).
//   순수 함수로 옮길 수 없는 결선(렌더·파이프라인)만 소스 대조로 보조 확인한다.
//
// ⚠️ 유료 AI 호출 0회. Claude 응답은 stub 장부(고정 JSON)로만 확인한다.
// ⚠️ 밴드 fixture 는 실제 원본을 같은 여백분할 규칙(whiteThreshold 232 · whiteFrac 0.98 · minGapPx 40 ·
//    minSegPx 20)으로 재현해 얻은 밴드 순서다(2026-08-22 로컬 관측).
//      핑거위글 = 요약 5 + 홍보 GIF 1 + 본문 27 = 33밴드 (800×2693 / 800×450 / 800×12272)
//      글랜스   = 요약 4 + 홍보 GIF 1 + 본문 19 = 24밴드 (800×2546 / gif / 800×12497)
//      프리티   = 단일 이미지 21밴드 (650×14248, 구형 경로 banana_img/product_image)
//    픽셀을 다시 자르는 검사는 아니다(캔버스 없음 — 기본형 구조적 공백 B-2).
//
// 실행: node scripts/smoke-basic-body-sections-v0.mjs

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
const outDir = mkdtempSync(path.join(tmpdir(), 'godo-basic-body-'));
const tscBin = path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
const compile = (relFile, dir) => execFileSync(
  process.execPath,
  [tscBin, path.join(repo, relFile),
    '--outDir', dir, '--module', 'esnext', '--target', 'ES2022',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--lib', 'ES2022,DOM'],
  { stdio: 'pipe', cwd: tmpdir() },  // 저장소 tsconfig.json 자동 로드 방지(TS5112)
);

console.log('[1/10] 컴파일');
// constants.ts → types.ts → services/basicBodyAssembly.ts 가 한 프로그램으로 함께 컴파일된다.
compile('src/components/detailBuilder/constants.ts', outDir);
const mod = await import(pathToFileURL(path.join(outDir, 'services/basicBodyAssembly.js')).href);
const {
  selectBasicSlots, normalizeBandLedger, assembleBodyFromLedger, assembleBodyPreserved,
  assembleBodyFromSourceImages, buildBasicSummaryInfo,
  planBodyBoundary, applyBodyBoundary, BODY_BOUNDARY_FALLBACK_NOTE,
  hasDynamicBody, BODY_DUP_HAMMING, isSizeSection, isWeightLine, trailingMediaRunStart, bodyPointLabel,
} = mod;
const parserDir = mkdtempSync(path.join(tmpdir(), 'godo-parser-'));
compile('src/components/detailBuilder/services/mainMallExcelParser.ts', parserDir);
const PARSER = await import(pathToFileURL(path.join(parserDir, 'mainMallExcelParser.js')).href);

ok('조립 모듈이 장부 계약 진입점을 내보낸다',
  [normalizeBandLedger, assembleBodyFromLedger, selectBasicSlots, buildBasicSummaryInfo].every((f) => typeof f === 'function'));
ok('본문 진입점 2종을 내보낸다(파일 단위=제품 정본 · 밴드 단위=보존 자산)',
  typeof assembleBodyFromSourceImages === 'function' && typeof assembleBodyPreserved === 'function');
ok('본문 시작 경계 순수 함수 2종 + 고정 안내 문구를 내보낸다',
  typeof planBodyBoundary === 'function' && typeof applyBodyBoundary === 'function'
  && BODY_BOUNDARY_FALLBACK_NOTE === '본문 시작 경계를 적용하지 못해 원본 전체를 보존했습니다 — 손검수 필요.');
ok('렌더 규칙 판정 4종도 순수 함수로 내보낸다',
  [isSizeSection, isWeightLine, trailingMediaRunStart, bodyPointLabel].every((f) => typeof f === 'function') && BODY_DUP_HAMMING === 10);

// ── 공용 fixture 헬퍼 ────────────────────────────────────────────────────────
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
// 장부 한 줄
const e = (index, role, kind, asset, extra = {}) => ({ index, role, kind, asset, sectionStart: false, sectionTitle: '', text: '', reviewNote: '', ...extra });
const kindsOf = (sec) => sec.items.map((i) => i.kind).join(',');
const srcsOf = (sec) => sec.items.filter((i) => i.kind === 'media').map((i) => i.src).join(',');
const textsOf = (sec) => sec.items.filter((i) => i.kind === 'text').map((i) => i.text);
const allMedia = (secs) => secs.flatMap((s) => s.items.filter((i) => i.kind === 'media').map((i) => i.src));
const runLedger = (aiBands, bands, slotReq) => {
  const norm = normalizeBandLedger(aiBands, bands);
  const slots = selectBasicSlots({ ...slotReq, ledger: norm.ledger }, bands);
  const body = assembleBodyFromLedger(norm.ledger, bands, { reserved: slots.reserved });
  return { norm, slots, body, notes: [...norm.notes, ...slots.notes, ...body.notes] };
};

// ══════════════════════════════════════════════════════════════════════════
// [2] 핑거위글 — 실측 33밴드 (요약 5 + 홍보 GIF 1 + 본문 27)
// ══════════════════════════════════════════════════════════════════════════
console.log('[2/10] 핑거위글 무회귀');
const FW = [
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
for (let i = 0; i < FW.length; i++) {
  for (let j = i + 1; j < FW.length; j++) if (hamming(FW[i].metrics.dhash, FW[j].metrics.dhash) <= BODY_DUP_HAMMING) collisions += 1;
}
ok('fixture) 핑거위글 동일 컷 쌍은 (3,32) 하나뿐', collisions === 1);

const FW_LEDGER = [
  e(0, 'summary', 'text', 'other'), e(1, 'summary', 'media', 'other'), e(2, 'summary', 'text', 'other'),
  e(3, 'summary', 'media', 'package_box'), e(4, 'summary', 'text', 'other'),
  e(5, 'exclude', 'media', 'other'),
  e(6, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '제품특징' }),
  e(7, 'body', 'text', 'other', { text: '"핑거 위글 전립선 마사져"는 피부와 맞닿는 부분은 전부 부드러운 실리콘 소재로 사용해서\n약한 점막에 부담을 주지 않도록 하였습니다.' }),
  e(8, 'body', 'media', 'usage'),
  e(9, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '제품포인트' }),
  e(10, 'body', 'text', 'other', { text: '간단한 버튼으로 다양한 진동 패턴과 티클링패턴을 즐길 수 있고\n##리모컨으로도 조정이 가능##해 색다른 플레이도 가능합니다.' }),
  e(11, 'body', 'media', 'product_cut'),
  e(12, 'body', 'text', 'other', { text: '*본체의 전원을 켜 놓으면 무선 컨트롤러로 조작이 가능합니다.' }),
  e(13, 'body', 'media', 'product_cut'), e(14, 'body', 'media', 'product_cut'), e(15, 'body', 'media', 'product_cut'),
  e(16, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '제품 사이즈' }),
  e(17, 'body', 'text', 'other', { text: '무게 : 약 97g' }),
  e(18, 'body', 'composite', 'diagram'),
  e(19, 'body', 'text', 'other', { text: '*위 사이즈와 무게는 모두 수작업으로 측정되어 오차가 있을 수 있습니다.' }),
  e(20, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '제품 전원' }),
  e(21, 'body', 'text', 'other', { text: '전원 · 진동 버튼' }),
  e(22, 'body', 'composite', 'product_cut', { reviewNote: '설명·지시선이 제품과 결합 — 분리 불가로 복합 보존' }),
  e(23, 'body', 'text', 'other', { text: '충전' }),
  e(24, 'body', 'media', 'usage'),
  e(25, 'body', 'text', 'other', { text: 'USB연결형으로 건전지 걱정없이! 충전해서 사용 할 수 있습니다.' }),
  e(26, 'body', 'text', 'other', { text: '*리모컨은 CR2032 건전지 1개를 사용합니다.' }),
  e(27, 'tail', 'media', 'product_cut'), e(28, 'tail', 'media', 'product_cut'), e(29, 'tail', 'media', 'product_cut'),
  e(30, 'tail', 'media', 'product_cut'), e(31, 'tail', 'media', 'usage'), e(32, 'tail', 'media', 'package_box'),
];
const fw = runLedger(FW_LEDGER, FW, { mainIndex: 27, featureIndex: 13, packageIndex: 3, mainIsSoloProductCut: true });

ok('FW-1. 설명 섹션 4개', fw.body.sections.length === 4, `실제 ${fw.body.sections.length}`);
ok('FW-2. 섹션 제목 순서 보존', fw.body.sections.map((s) => s.title).join('|') === '제품특징|제품포인트|제품 사이즈|제품 전원');
ok('FW-3. 화면 번호는 배열 순서 고정', fw.body.sections.map((_, i) => bodyPointLabel(i)).join(',') === 'Point 01,Point 02,Point 03,Point 04');
ok('FW-4. 01 섹션 = 설명 → 이미지', kindsOf(fw.body.sections[0]) === 'text,media');
ok('FW-5. 02 섹션 = 설명 → 이미지 → 설명 → 이미지×3', kindsOf(fw.body.sections[1]) === 'text,media,text,media,media,media');
ok('FW-6. 03 사이즈 = 무게 → 도해 → 주석', kindsOf(fw.body.sections[2]) === 'text,media,text');
ok('FW-7. 04 섹션 항목 순서·개수 불변', kindsOf(fw.body.sections[3]) === 'text,media,text,media,text,text,media,media,media,media,media');
ok('FW-8. 04 미디어 원본 순서 유지', srcsOf(fw.body.sections[3]) === 'band://22,band://24,band://27,band://28,band://29,band://30,band://31');
ok('FW-9. 독립 설명 4문장이 text 로 남는다', ['전원 · 진동 버튼', '충전'].every((t) => textsOf(fw.body.sections[3]).includes(t))
  && textsOf(fw.body.sections[3]).some((t) => t.startsWith('USB연결형으로'))
  && textsOf(fw.body.sections[3]).some((t) => t.startsWith('*리모컨은 CR2032')));
ok('FW-10. 지시선 결합 이미지는 복합 1장 + 손검수 사유',
  fw.body.sections[3].items.filter((i) => i.kind === 'media' && i.composite).length === 1
  && fw.body.sections[3].items.find((i) => i.composite)?.reviewNote?.includes('복합 보존'));
ok('FW-11. 사이즈 도해도 복합 표시', fw.body.sections[2].items[1].composite === true);
ok('FW-12. 메인 ≠ KEY FEATURE', fw.slots.mainIndex >= 0 && fw.slots.featureIndex >= 0 && fw.slots.mainIndex !== fw.slots.featureIndex);
ok('FW-13. 패키지 = 요약영역 패키지 박스(3)', fw.slots.packageIndex === 3);
ok('FW-14. 요약 원본·홍보 GIF 는 본문에 없다',
  !allMedia(fw.body.sections).some((s) => ['band://0', 'band://1', 'band://2', 'band://3', 'band://4', 'https://cdn/1667813619_1.gif'].includes(s)));
ok('FW-15. 요약 패키지와 같은 컷(32)은 본문에서 제외', !allMedia(fw.body.sections).includes('band://32'));
ok('FW-16. 같은 밴드가 두 번 쓰이지 않는다', new Set(allMedia(fw.body.sections)).size === allMedia(fw.body.sections).length);
ok('FW-17. 사이즈 섹션 판정 · 무게 알약 판정', isSizeSection(fw.body.sections[2]) === true && isWeightLine(fw.body.sections[2].items[0].text) === true);
ok('FW-18. 마지막 제품컷 나열부가 tail 로 한 번 구분', fw.body.sections[3].tailStart === 6);
ok('FW-19. 중간 섹션에는 tail 구분이 없다', fw.body.sections.slice(0, 3).every((s) => s.tailStart === undefined));
ok('FW-20. 본문 GIF 는 원본 자산 유지(정지 변환 없음)', (() => {
  const B = FW.concat([band(33, 'PHOTO', { isGif: true, src: 'https://cdn/usage_demo.gif' })]);
  const r = runLedger(FW_LEDGER.concat([e(33, 'body', 'media', 'usage', { sectionStart: true, sectionTitle: '사용법' })]), B, { mainIndex: 27, featureIndex: 13, packageIndex: 3 });
  const last = r.body.sections[r.body.sections.length - 1];
  return last.items[0].mediaType === 'gif' && last.items[0].src === 'https://cdn/usage_demo.gif';
})());

// ══════════════════════════════════════════════════════════════════════════
// [3] 글랜스 — 실측 24밴드 (요약 4 + 홍보 GIF 1 + 본문 19) · 원본 섹션 번호 없음
// ══════════════════════════════════════════════════════════════════════════
console.log('[3/10] 글랜스 무회귀');
const GL = [
  band(0, 'TEXT', { smallCC: 26, largestCC: 0.01, height: 112 }),             // 상품명
  band(1, 'PHOTO', { color: 0.44, largestCC: 0.62, height: 1236 }),           // 요약 배경 메인 + 요약표
  band(2, 'TEXT', { smallCC: 40, largestCC: 0.02, height: 183 }),             // 요약 카피
  band(3, 'PHOTO', { fillRatio: 0.71, largestCC: 0.34, height: 641 }),        // 패키지 박스
  band(4, 'PHOTO', { promo: true, isGif: true, color: 0.45, height: 450, src: 'https://cdn/glans_promo.gif' }),
  band(5, 'MIXED', { color: 0.42, smallCC: 44, largestCC: 0.06, height: 365 }), // 파란 제목 띠 + 설명(글자 전용)
  band(6, 'MIXED', { color: 0.38, smallCC: 52, largestCC: 0.21, height: 938 }), // 제품+설명+사이즈 결합(파란 배경)
  band(7, 'TEXT', { smallCC: 14, largestCC: 0.02, height: 45 }),
  band(8, 'PHOTO', { largestCC: 0.31, height: 187 }),
  band(9, 'PHOTO', { largestCC: 0.33, height: 558 }),
  band(10, 'TEXT', { smallCC: 18, largestCC: 0.01, height: 146 }),
  band(11, 'PHOTO', { largestCC: 0.35, height: 1778 }),
  band(12, 'PHOTO', { largestCC: 0.30, height: 1081 }),
  band(13, 'TEXT', { smallCC: 12, largestCC: 0.02, height: 46 }),
  band(14, 'PHOTO', { largestCC: 0.29, height: 186 }),
  band(15, 'PHOTO', { largestCC: 0.32, height: 944 }),
  band(16, 'TEXT', { smallCC: 15, largestCC: 0.01, height: 183 }),
  band(17, 'PHOTO', { largestCC: 0.28, height: 872 }),
  band(18, 'TEXT', { smallCC: 13, largestCC: 0.02, height: 46 }),
  band(19, 'PHOTO', { largestCC: 0.27, height: 147 }),
  band(20, 'PHOTO', { largestCC: 0.31, height: 778 }),
  band(21, 'PHOTO', { largestCC: 0.29, height: 336 }),
  band(22, 'PHOTO', { largestCC: 0.30, height: 621 }),
  band(23, 'PHOTO', { largestCC: 0.33, height: 859 }),
];
const GL_LEDGER = [
  e(0, 'summary', 'text', 'other'), e(1, 'summary', 'media', 'other'), e(2, 'summary', 'text', 'other'),
  e(3, 'summary', 'media', 'package_box'),
  e(4, 'body', 'media', 'other'),                      // 홍보 GIF 를 AI 가 body 로 잘못 적어도 로컬이 exclude 로 강제
  e(5, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '파트너를 위한 진동 자극', text: '진동은 파트너에게도 그대로 전달됩니다.' }),
  e(6, 'body', 'composite', 'product_cut', { reviewNote: '제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요' }),
  e(7, 'body', 'text', 'other', { text: '충전' }),
  e(8, 'body', 'media', 'usage'), e(9, 'body', 'media', 'product_cut'),
  e(10, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '', text: '사용 전 반드시 충전해 주세요.' }),
  e(11, 'body', 'media', 'product_cut'), e(12, 'body', 'media', 'product_cut'),
  e(13, 'body', 'text', 'other', { text: '사이즈' }),
  e(14, 'body', 'composite', 'diagram'), e(15, 'body', 'media', 'product_cut'),
  e(16, 'body', 'text', 'other', { text: '*측정 방법에 따라 오차가 있을 수 있습니다.' }),
  e(17, 'body', 'media', 'product_cut'), e(18, 'body', 'text', 'other', { text: '구성품' }),
  e(19, 'tail', 'media', 'product_cut'), e(20, 'tail', 'media', 'product_cut'), e(21, 'tail', 'media', 'product_cut'),
  e(22, 'tail', 'media', 'product_cut'), e(23, 'tail', 'media', 'product_cut'),
];
const gl = runLedger(GL_LEDGER, GL, { mainIndex: 23, featureIndex: 9, packageIndex: 3, mainIsSoloProductCut: true });
ok('GL-1. 원본 번호가 없어도 섹션이 순서대로 열린다', gl.body.sections.length === 2 && gl.body.sections[0].title === '파트너를 위한 진동 자극');
ok('GL-2. 제목 없는 섹션도 열리고 임의 제목을 만들지 않는다', gl.body.sections[1].title === '');
ok('GL-3. 화면 번호는 Point 01·02', gl.body.sections.map((_, i) => bodyPointLabel(i)).join(',') === 'Point 01,Point 02');
ok('GL-4. 글자 전용 파란 띠는 text 로 나온다(이미지 아님)',
  gl.body.sections[0].items[0].kind === 'text' && !allMedia(gl.body.sections).includes('band://5'));
ok('GL-5. 섹션 제목은 items 텍스트로 중복되지 않는다',
  !gl.body.sections.some((s) => textsOf(s).includes(s.title) && s.title));
ok('GL-6. 제품·설명·사이즈 결합 이미지는 composite 한 장 + reviewNote 보존', (() => {
  const it = gl.body.sections[0].items.find((i) => i.src === 'band://6');
  return !!it && it.composite === true && it.reviewNote === '제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요';
})());
ok('GL-7. 홍보 GIF 는 AI 가 body 로 적어도 본문에 없다', !allMedia(gl.body.sections).includes('band://4'));
ok('GL-8. 메인·KEY FEATURE 는 서로 다른 제품컷', gl.slots.mainIndex !== gl.slots.featureIndex && gl.slots.mainIndex >= 0 && gl.slots.featureIndex >= 0);
ok('GL-9. tail 나열부는 마지막 섹션에서 한 번만 구분',
  gl.body.sections[1].tailStart !== undefined && gl.body.sections[0].tailStart === undefined);

// ══════════════════════════════════════════════════════════════════════════
// [4] 프리티 러브 브루스 — 실측 21밴드(단일 이미지) · 패키지 박스 없음 · Point 가 이미지에 박힘
// ══════════════════════════════════════════════════════════════════════════
console.log('[4/10] 프리티 러브 브루스');
const PR = [
  band(0, 'TEXT', { smallCC: 22, largestCC: 0.01, height: 90 }),               // 상품명 한/영
  band(1, 'MIXED', { color: 0.35, smallCC: 48, largestCC: 0.28, height: 1662 }), // 요약정보 표 + 보라 배경 제품컷
  band(2, 'MIXED', { color: 0.55, smallCC: 40, largestCC: 0.05, height: 147 }),  // 3줄 카피(컬러 글자)
  band(3, 'MIXED', { color: 0.22, smallCC: 36, largestCC: 0.24, height: 813 }),  // 제품컷 + 제품특징 라벨 + 설명
  band(4, 'MIXED', { color: 0.48, smallCC: 22, largestCC: 0.04, height: 46 }),   // "…의 포인트!" 제목 띠(글자 전용)
  band(5, 'MIXED', { color: 0.20, smallCC: 44, largestCC: 0.26, height: 790 }),  // 구성품(파우치·USB) + point 01
  band(6, 'MIXED', { color: 0.19, smallCC: 38, largestCC: 0.27, height: 595 }),  // 제품컷 + 02 point
  band(7, 'MIXED', { color: 0.30, smallCC: 30, largestCC: 0.25, height: 637 }),  // 해부 일러스트
  band(8, 'MIXED', { color: 0.18, smallCC: 42, largestCC: 0.29, height: 670 }),  // 제품컷 + 03 point + 지시선
  band(9, 'MIXED', { color: 0.17, smallCC: 34, largestCC: 0.28, height: 516 }),  // 손+제품 + 지시선
  band(10, 'MIXED', { color: 0.18, smallCC: 36, largestCC: 0.30, height: 612 }), // 제품컷 + 04 point
  band(11, 'MIXED', { color: 0.18, smallCC: 33, largestCC: 0.29, height: 505 }), // 제품컷 + 05 point
  band(12, 'MIXED', { color: 0.19, smallCC: 35, largestCC: 0.27, height: 546 }), // USB 충전 + 06 point
  band(13, 'MIXED', { color: 0.47, smallCC: 20, largestCC: 0.04, height: 46 }),  // "…의 사이즈" 제목 띠(글자 전용)
  band(14, 'MIXED', { color: 0.16, smallCC: 28, largestCC: 0.26, height: 809 }), // 치수 도해
  band(15, 'PHOTO', { color: 0.10, smallCC: 6, largestCC: 0.31, height: 685 }),  // 구성품(파우치·USB) 사진
  band(16, 'PHOTO', { largestCC: 0.30, height: 368 }),                           // 제품 단독컷
  band(17, 'PHOTO', { largestCC: 0.32, height: 668 }),
  band(18, 'PHOTO', { largestCC: 0.29, height: 516 }),
  band(19, 'PHOTO', { largestCC: 0.31, height: 496 }),
  band(20, 'PHOTO', { largestCC: 0.28, height: 347 }),
];
const PR_LEDGER = [
  e(0, 'summary', 'text', 'other'), e(1, 'summary', 'media', 'other'), e(2, 'summary', 'text', 'other'),
  e(3, 'body', 'composite', 'product_cut', { sectionStart: true, sectionTitle: '제품 특징', reviewNote: '제품·설명이 한 이미지에 결합됨 — 손검수 필요' }),
  e(4, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '프리티 러브 브루스의 포인트!' }),
  e(5, 'body', 'composite', 'components', { reviewNote: '구성품·설명이 한 이미지에 결합됨 — 손검수 필요' }),
  e(6, 'body', 'composite', 'product_cut'), e(7, 'body', 'composite', 'diagram'),
  e(8, 'body', 'composite', 'product_cut'), e(9, 'body', 'composite', 'usage'),
  e(10, 'body', 'composite', 'product_cut'), e(11, 'body', 'composite', 'product_cut'),
  e(12, 'body', 'composite', 'usage'),
  e(13, 'body', 'text', 'other', { sectionStart: true, sectionTitle: '프리티 러브 브루스의 사이즈' }),
  e(14, 'body', 'composite', 'diagram'),
  e(15, 'body', 'media', 'components'),
  e(16, 'tail', 'media', 'product_cut'), e(17, 'tail', 'media', 'product_cut'), e(18, 'tail', 'media', 'product_cut'),
  e(19, 'tail', 'media', 'product_cut'), e(20, 'tail', 'media', 'product_cut'),
];
const pr = runLedger(PR_LEDGER, PR, { mainIndex: 17, featureIndex: 19, packageIndex: -1, mainIsSoloProductCut: true });
ok('PR-1. 원본의 명시적 섹션 시작 3곳이 각각 열린다(합쳐지지 않음)', pr.body.sections.length === 3, `실제 ${pr.body.sections.length}`);
ok('PR-2. 섹션 제목이 원본 그대로', pr.body.sections.map((s) => s.title).join('|') === '제품 특징|프리티 러브 브루스의 포인트!|프리티 러브 브루스의 사이즈');
ok('PR-3. 화면 번호는 Point 01~03(원본 point 01~06 을 코드가 만들지 않는다)',
  pr.body.sections.map((_, i) => bodyPointLabel(i)).join(',') === 'Point 01,Point 02,Point 03');
ok('PR-4. 이미지에 박힌 Point 설명은 composite 로 보존(별도 text 중복 없음)',
  pr.body.sections[1].items.every((i) => i.kind === 'media') && pr.body.sections[1].items.every((i) => i.composite));
ok('PR-5. 사이즈 섹션이 포인트 섹션과 합쳐지지 않는다',
  isSizeSection(pr.body.sections[2]) === true
  && pr.body.sections[2].items[0].src === 'band://14'                       // 사이즈 도해가 새 섹션의 첫 자료
  && !srcsOf(pr.body.sections[1]).includes('band://14'), srcsOf(pr.body.sections[2]));
ok('PR-6. 패키지 박스가 없으면 패키지 슬롯은 비어 있다', pr.slots.packageIndex === -1);
ok('PR-7. 구성품 사진을 패키지로 쓰지 않는다', (() => {
  const bad = runLedger(PR_LEDGER, PR, { mainIndex: 17, featureIndex: 19, packageIndex: 15 });  // AI 가 구성품(15)을 패키지로 지목
  return bad.slots.packageIndex === -1 && bad.notes.some((n) => n.includes('구성품'));
})());
ok('PR-8. 마지막 단독 제품컷에서 서로 다른 메인·KEY FEATURE 선정',
  pr.slots.mainIndex !== pr.slots.featureIndex && [16, 17, 18, 19, 20].includes(pr.slots.mainIndex) && [16, 17, 18, 19, 20].includes(pr.slots.featureIndex));
ok('PR-9. 구성품·도해는 메인/피처 후보가 아니다', ![15, 14, 7].includes(pr.slots.mainIndex) && ![15, 14, 7].includes(pr.slots.featureIndex));
ok('PR-10. 각 밴드가 장부에 정확히 한 번', pr.norm.ledger.length === PR.length
  && new Set(pr.norm.ledger.map((x) => x.index)).size === PR.length);
ok('PR-11. 본문 미디어에 중복 없음 · 원본 순서 유지', (() => {
  const m = allMedia(pr.body.sections);
  const idx = m.map((s) => Number(s.replace('band://', '')));
  return new Set(idx).size === idx.length && idx.slice().sort((a, b) => a - b).join(',') === idx.join(',');
})());
ok('PR-12. 사이즈 뒤 제품컷 나열부가 tail 로 한 번 구분', pr.body.sections[2].tailStart === 2);
ok('PR-13. 요약 원본(0~2)은 본문에 없다', !allMedia(pr.body.sections).some((s) => ['band://0', 'band://1', 'band://2'].includes(s)));
ok('PR-14. 이미지 개수 불변(본문 미디어 = 장부의 body/tail 미디어 수)',
  allMedia(pr.body.sections).length === PR_LEDGER.filter((x) => (x.role === 'body' || x.role === 'tail') && x.kind !== 'text').length);

// ══════════════════════════════════════════════════════════════════════════
// [5] 장부 계약 자체 — 누락·중복·순서·홍보 GIF·글자 밴드 강제
// ══════════════════════════════════════════════════════════════════════════
console.log('[5/10] 밴드 장부 계약');
{
  const partial = normalizeBandLedger([e(2, 'body', 'media', 'product_cut'), e(0, 'body', 'text', 'other', { text: 'a' })], PR.slice(0, 4));
  ok('LD-1. 빠진 밴드를 인덱스와 함께 알린다', partial.notes.some((n) => n.includes('빠진 밴드') && n.includes('1') && n.includes('3')), partial.notes.join(' / '));
  ok('LD-2. 장부는 항상 원본 인덱스 오름차순', partial.ledger.map((x) => x.index).join(',') === '0,1,2,3');
  const dup = normalizeBandLedger([e(0, 'body', 'text', 'other', { text: '첫 기재' }), e(0, 'body', 'media', 'product_cut')], PR.slice(0, 1));
  ok('LD-3. 중복 기재는 첫 줄만 쓰고 인덱스를 알린다', dup.ledger.length === 1 && dup.ledger[0].text === '첫 기재' && dup.notes.some((n) => n.includes('두 번 기재')));
  const promo = normalizeBandLedger([e(5, 'body', 'media', 'product_cut')], FW);
  ok('LD-4. 로컬 홍보 GIF 판정이 AI 판단을 이긴다(exclude 강제)', promo.ledger[5].role === 'exclude');
  const textBand = normalizeBandLedger([e(6, 'body', 'media', 'product_cut')], FW);
  ok('LD-5. 글자만 있는 밴드를 이미지로 싣지 않는다(text 로 강제)', textBand.ledger[6].kind === 'text');
  ok('LD-6. 범위 밖 인덱스는 무시하고 기록', normalizeBandLedger([e(99, 'body', 'media', 'other')], PR.slice(0, 2)).notes.some((n) => n.includes('범위 밖')));
  const reorder = assembleBodyFromLedger(
    [e(2, 'body', 'media', 'product_cut'), e(1, 'body', 'text', 'other', { sectionStart: true, sectionTitle: 'x', text: 't' })],
    PR, {},
  );
  ok('LD-7. AI 가 순서를 뒤집어 보내도 원본 순서로 조립', reorder.sections[0].items.map((i) => i.kind).join(',') === 'text,media');
}

console.log('[6/10] 스펙·요약 계약');
const summary = buildBasicSummaryInfo({ type: '바이브레이터', material: '실리콘 · ABS', weight: '97g', power: 'USB 충전식', maker: 'X' }, { brandName: 'SECWELL' });
ok('SM-1. 치수는 상세페이지 참조 고정', summary.size === '상세페이지 참조');
ok('SM-2. 전원·무게·재질은 원본 값', summary.power === 'USB 충전식' && summary.weight === '97g' && summary.material === '실리콘 · ABS');
ok('SM-3. 제조사는 엑셀 브랜드 우선', summary.maker === 'SECWELL');
ok('SM-4. AI 가 치수를 채워도 무시', buildBasicSummaryInfo({ size: '길이 12.5cm' }, {}).size === '상세페이지 참조');
ok('SM-5. 동적 본문 유무 판정', hasDynamicBody({ godoBodySections: fw.body.sections }) === true && hasDynamicBody({}) === false);

// ══════════════════════════════════════════════════════════════════════════
// [7] 상품명 파서 — 3사례 + 기존 보존
// ══════════════════════════════════════════════════════════════════════════
console.log('[7/10] 상품명 파서(구조 분리)');
const P = (raw) => PARSER.parseProductName(raw);
{
  const fwName = P('[10단 티클링+진동] 핑거 위글 전립선 마사져 (Finger Wiggle Prostate Massager) - SECWELL(SW1064-2) (SWL)(TJ)');
  ok('NM-1. 핑거위글 유지', fwName.nameKr === '핑거 위글 전립선 마사져' && fwName.nameEn === 'Finger Wiggle Prostate Massager' && fwName.brandInline === 'SECWELL');
  const glName = P('[10단 진동] 글랜스 페니스 트레이너(Glans Penis Trainer) - NVTOYS(WS-NV565) (NTS)');
  ok('NM-2. 글랜스 유지', glName.nameKr === '글랜스 페니스 트레이너' && glName.nameEn === 'Glans Penis Trainer' && glName.brandInline === 'NVTOYS');
  const prName = P('[3단 티클링+12단 진동] 프리티 러브 브루스(Pretty Love Bruse) - 전립선 자극기/바일러(BI-040031) (BIR)');
  ok('NM-3. 프리티 한글명', prName.nameKr === '프리티 러브 브루스', prName.nameKr);
  ok('NM-4. 프리티 영문명', prName.nameEn === 'Pretty Love Bruse', prName.nameEn);
  ok('NM-5. 프리티 브랜드 조각', prName.brandInline === '전립선 자극기/바일러', prName.brandInline);
  ok('NM-6. 프리티 대괄호 태그', prName.eyebrow === '3단 티클링+12단 진동');
  const tri = P('[일본 직수입] 모에 구멍 트리니티 (萌あなトリニティ) - 라이드재팬 (OH-3036)(NPR)');
  ok('NM-7. 일본어 괄호명 보존', tri.nameKr === '모에 구멍 트리니티' && tri.nameEn === '萌あなトリニティ');
  ok('NM-8. 실제 영문 괄호명 보존(ROMP Free · Moving Ball)',
    P('롬프 프리 (ROMP Free) - 롬프').nameEn === 'ROMP Free' && P('무빙 볼 (Moving Ball)').nameEn === 'Moving Ball');
  ok('NM-9. 괄호가 하나뿐인 영문명은 코드로 보지 않는다(단독 대문자도 보존)',
    P('롬프 프리 (ROMP)').nameEn === 'ROMP', P('롬프 프리 (ROMP)').nameEn);
  ok('NM-10. 상품별 약자 목록을 늘리는 방식이 아니다(구조 규칙)',
    P('테스트 상품 (Test Name) - 브랜드(AB-1) (ZZZ)').nameEn === 'Test Name');
}

// ══════════════════════════════════════════════════════════════════════════
// [9] 본문 원본 보존 출력 — 제품이 실제로 쓰는 본문 경로 (2026-08-24 패치)
//   종료조건: 요약정보 하단 본문은 원본 순서·원본 자료 그대로. 바나나몰 홍보 GIF만 제외.
// ══════════════════════════════════════════════════════════════════════════
console.log('[9/10] 본문 원본 보존 출력');
{
  const srcsInOrder = (bands) => bands.filter((b) => !b.promo).map((b) => b.src);
  const bodyItems = (res) => res.sections.flatMap((sec) => sec.items);

  // BP-1~4. 3사례: 본문 자료 수·순서가 원본 입력(밴드 배열)과 일치한다.
  for (const [name, bands, promoCount] of [['핑거위글', FW, 1], ['글랜스', GL, 1], ['프리티', PR, 0]]) {
    const res = assembleBodyPreserved(bands);
    const items = bodyItems(res);
    ok(`BP-1(${name}) 본문 자료 수 = 밴드 ${bands.length} − 홍보 GIF ${promoCount}`,
      items.length === bands.length - promoCount, `실제 ${items.length}`);
    ok(`BP-2(${name}) 본문 순서가 원본 입력 순서와 같다`,
      items.map((i) => i.src).join('|') === srcsInOrder(bands).join('|'));
    ok(`BP-3(${name}) 빈 섹션·빈 Point 없음 · 섹션 1개 · 제목/번호 생성 0건`,
      res.sections.length === 1 && res.sections[0].preserved === true
      && res.sections[0].title === '' && res.sections[0].number === ''
      && res.sections[0].tailStart === undefined && res.sections[0].items.length > 0);
    ok(`BP-4(${name}) 텍스트 재입력 0건 — 모든 항목이 원본 이미지`,
      items.every((i) => i.kind === 'media' && !i.reviewNote && i.composite === false));
  }

  // BP-5. 홍보 GIF만 제외되고 일반 본문 GIF 는 원본 자산 그대로 남는다.
  {
    const withGif = FW.concat([band(33, 'PHOTO', { isGif: true, src: 'https://cdn/usage_demo.gif' })]);
    const items = bodyItems(assembleBodyPreserved(withGif));
    const gifs = items.filter((i) => i.mediaType === 'gif');
    ok('BP-5. 일반 본문 GIF 는 원본 URL·gif 로 남고 홍보 GIF 만 빠진다',
      gifs.length === 1 && gifs[0].src === 'https://cdn/usage_demo.gif'
      && !items.some((i) => i.src === 'https://cdn/1667813619_1.gif'),
      `gif ${gifs.length}건`);
  }

  // BP-6. 상단 슬롯(메인·KEY FEATURE·패키지)으로 뽑힌 밴드도 본문에서 사라지지 않는다.
  {
    const norm = normalizeBandLedger(FW_LEDGER, FW);
    const slots = selectBasicSlots({ mainIndex: 27, featureIndex: 13, packageIndex: 3, ledger: norm.ledger }, FW);
    const items = bodyItems(assembleBodyPreserved(FW));
    const srcs = items.map((i) => i.src);
    const picked = [slots.mainIndex, slots.featureIndex, slots.packageIndex].filter((x) => x >= 0);
    ok('BP-6. 상단 슬롯 선정 밴드도 본문에 그대로 있다(reserved 무영향)',
      picked.length === 3 && picked.every((x) => srcs.includes(FW[x].src)) && slots.reserved.size > 0,
      `slots ${picked.join(',')} · reserved ${[...slots.reserved].join(',')}`);
    ok('BP-6b. 요약 원본으로 표시된 밴드(0~4)도 본문에 남는다',
      [0, 1, 2, 3, 4].every((x) => srcs.includes(FW[x].src)));
    ok('BP-6c. 요약 패키지와 같은 컷(32)도 중복 판정으로 지우지 않는다', srcs.includes(FW[32].src));
  }

  // BP-7. AI 장부의 role·kind·sectionStart 가 어떤 값이어도 본문 출력이 같다.
  {
    const baseline = JSON.stringify(assembleBodyPreserved(FW).sections);
    const variants = {
      '전부 exclude': FW.map((_, i) => e(i, 'exclude', 'text', 'other')),
      '전부 summary': FW.map((_, i) => e(i, 'summary', 'media', 'package_box')),
      '전부 sectionStart': FW.map((_, i) => e(i, 'body', 'composite', 'diagram', { sectionStart: true, sectionTitle: `S${i}`, text: `t${i}` })),
      '장부 비어 있음': [],
      '뒤집힌 순서': FW.map((_, i) => e(FW.length - 1 - i, 'tail', 'media', 'usage')),
    };
    let same = 0;
    for (const [label, ledgerIn] of Object.entries(variants)) {
      const norm = normalizeBandLedger(ledgerIn, FW);
      const slots = selectBasicSlots({ mainIndex: 27, featureIndex: 13, packageIndex: 3, ledger: norm.ledger }, FW);
      // 제품 경로와 같은 호출: 본문은 장부·슬롯을 인자로 받지 않는다.
      const got = JSON.stringify(assembleBodyPreserved(FW).sections);
      if (got === baseline && slots) same += 1;
      else ok(`BP-7(${label}) 본문 불변`, false, '장부 변형이 본문을 바꿨다');
    }
    ok('BP-7. 장부 role·kind·sectionStart 5가지 변형에도 본문 출력 동일', same === Object.keys(variants).length);
    ok('BP-7b. 보존 함수는 장부·슬롯을 인자로 받지 않는다(구조적 차단)', assembleBodyPreserved.length === 1);
  }

  // BP-8. 전부 홍보 GIF면 빈 섹션을 만들지 않는다(빈 Point 방지).
  {
    const onlyPromo = [band(0, 'PHOTO', { promo: true, isGif: true, src: 'https://cdn/p.gif' })];
    const res = assembleBodyPreserved(onlyPromo);
    ok('BP-8. 남은 자료가 없으면 섹션 0개 + 손검수 안내', res.sections.length === 0 && res.notes.some((n) => n.includes('손검수')));
  }

  // BP-9~10. 사용자 안내 · 렌더 진입 판정.
  ok('BP-9. 홍보 GIF 제외 건수를 notes 로 알린다',
    assembleBodyPreserved(FW).notes.some((n) => n.includes('홍보 GIF') && n.includes('1건')));
  ok('BP-10. 동적 본문 판정이 보존 섹션에서도 참', hasDynamicBody({ godoBodySections: assembleBodyPreserved(PR).sections }) === true);
}

// ══════════════════════════════════════════════════════════════════════════
// [9-b] 본문 = 원본 상세이미지 "파일" 그대로 — 제품이 실제로 쓰는 본문 경로 (2026-08-24 2차)
//   종료조건: detailImageUrls 의 파일을 자르지 않고 원래 순서 그대로. 홍보 GIF 파일만 제외.
// ══════════════════════════════════════════════════════════════════════════
console.log('[9-b/10] 본문 = 원본 파일 그대로');
{
  const f = (src, opts = {}) => ({ src, isGif: !!opts.isGif, promo: !!opts.promo });
  const itemsOf = (res) => res.sections.flatMap((sec) => sec.items);

  // SRC-1. 프리티 = 긴 원본 한 장 → 본문에 그 한 장이 딱 한 번, 자르지 않고 그대로.
  {
    const only = 'https://cdn/banana_img/product_image/man/2421655_detail_20170719.jpg';
    const res = assembleBodyFromSourceImages([f(only)]);
    const items = itemsOf(res);
    ok('SRC-1. 원본 1장 → 본문 항목 정확히 1개, 같은 파일 그대로',
      items.length === 1 && items[0].src === only && items[0].mediaType === 'image',
      `실제 ${items.length}개`);
    ok('SRC-1b. 섹션 1개 · 제목/번호/tail 생성 0건 · preserved',
      res.sections.length === 1 && res.sections[0].preserved === true
      && res.sections[0].title === '' && res.sections[0].number === ''
      && res.sections[0].tailStart === undefined);
    ok('SRC-1c. 밴드로 쪼개지지 않는다(21밴드가 아니라 1장)', items.length !== 21);
  }

  // SRC-2. 핑거위글·글랜스 = 파일 3장(가운데가 홍보 GIF) → 파일 단위 순서 유지 + 홍보만 제외.
  for (const [name, urls] of [
    ['핑거위글', ['https://cdn/files/goodsm/2479700/1667813618_0.jpg', 'https://cdn/files/goodsm/2479700/1667813619_1.gif', 'https://cdn/files/goodsm/2479700/1667813619_2.jpg']],
    ['글랜스', ['https://cdn/files/goodsm/2489604/1734688804_0.jpg', 'https://cdn/files/goodsm/2489604/1734688805_1.gif', 'https://cdn/files/goodsm/2489604/1734688804_2.jpg']],
  ]) {
    const res = assembleBodyFromSourceImages([f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2])]);
    const items = itemsOf(res);
    ok(`SRC-2(${name}) 홍보 GIF 1장만 빠지고 파일 2장이 원래 순서로 남는다`,
      items.length === 2 && items[0].src === urls[0] && items[1].src === urls[2],
      items.map((i) => i.src).join(' , '));
    ok(`SRC-2b(${name}) 파일 단위다 — 조각·텍스트 항목 0건`,
      items.every((i) => i.kind === 'media' && i.composite === false && !i.reviewNote));
  }

  // SRC-3. 일반 GIF 는 남고 홍보 GIF 만 빠진다.
  {
    const res = assembleBodyFromSourceImages([
      f('https://cdn/a.jpg'),
      f('https://cdn/promo.gif', { isGif: true, promo: true }),
      f('https://cdn/usage_demo.gif', { isGif: true }),
      f('https://cdn/b.jpg'),
    ]);
    const items = itemsOf(res);
    ok('SRC-3. 일반 GIF 는 gif 로 유지 · 홍보 GIF 만 제외 · 순서 유지',
      items.length === 3
      && items.map((i) => i.src).join(',') === 'https://cdn/a.jpg,https://cdn/usage_demo.gif,https://cdn/b.jpg'
      && items[1].mediaType === 'gif',
      items.map((i) => `${i.src}(${i.mediaType})`).join(' , '));
  }

  // SRC-4. 순서는 입력 배열 순서 그대로(정렬·재배치 없음).
  {
    const urls = Array.from({ length: 7 }, (_, i) => `https://cdn/${9 - i}.jpg`);   // 일부러 역순 이름
    const items = itemsOf(assembleBodyFromSourceImages(urls.map((u) => f(u))));
    ok('SRC-4. 파일명·크기와 무관하게 입력 순서 그대로', items.map((i) => i.src).join(',') === urls.join(','));
  }

  // SRC-5. 전부 홍보 GIF면 빈 섹션을 만들지 않는다.
  {
    const res = assembleBodyFromSourceImages([f('https://cdn/p.gif', { isGif: true, promo: true })]);
    ok('SRC-5. 남은 파일이 없으면 섹션 0개 + 손검수 안내',
      res.sections.length === 0 && res.notes.some((n) => n.includes('손검수')));
  }

  // SRC-6. 밴드 지표·장부·AI 판단을 인자로 받지 않는다(구조적 차단).
  ok('SRC-6. 파일 목록 하나만 받는다', assembleBodyFromSourceImages.length === 1);
  ok('SRC-7. 동적 본문 판정이 파일 단위 섹션에서도 참',
    hasDynamicBody({ godoBodySections: assembleBodyFromSourceImages([f('https://cdn/x.jpg')]).sections }) === true);
}

// ══════════════════════════════════════════════════════════════════════════
// [9-c] 본문 시작 경계 + 메인·KEY FEATURE 새 계약 (2026-08-24 3차)
//   AI 가 정하는 값은 셋뿐: bodyStartIndex · mainIndex · featureIndex.
//   코드가 하는 일: 원본 파일 목록을 경계에서 한 번만 자르고, 슬롯은 기계 확인만 한다.
//   ⚠️ 유료 AI 호출 0회 — AI 응답은 아래 stub 숫자로만 들어간다.
// ══════════════════════════════════════════════════════════════════════════
console.log('[9-c] 본문 시작 경계 · 상단 슬롯 기계 확인');
{
  const f = (src, opts = {}) => ({ src, isGif: !!opts.isGif, promo: !!opts.promo });
  const org = (sourceIndex, y, opts = {}) => ({ sourceIndex, y, isGif: !!opts.isGif, promo: !!opts.promo });
  const itemsOf = (res) => res.sections.flatMap((sec) => sec.items);
  // 제품 경로와 같은 순서: plan → apply → (경계 파일만 한 번 자르기) → 파일 단위 본문 조립.
  //   실제 픽셀 자르기는 DOM(canvas)이라 여기서는 "잘린 파일"을 src 치환으로 대신한다(계약 검사).
  const runBody = (bodyStartIndex, origins, sources) => {
    const plan = planBodyBoundary(bodyStartIndex, origins, sources.length);
    const bounded = applyBodyBoundary(sources, plan);
    const cutAt = bounded.sources.findIndex((x) => x.cropFromY > 0);
    const bodySources = cutAt >= 0
      ? bounded.sources.map((x, i) => (i === cutAt ? { ...x, src: `${x.src}#cut@${x.cropFromY}` } : x))
      : bounded.sources;
    const body = assembleBodyFromSourceImages(bodySources);
    return { plan, bounded, body, items: itemsOf(body), notes: [...plan.notes, ...bounded.notes, ...body.notes] };
  };

  // ── BD-1. 한 장짜리 긴 원본(프리티형): 같은 파일 중간을 가리키면 그 y 에서 한 번만 자른다. ──
  {
    const only = 'https://cdn/banana_img/product_image/man/2421655_detail_20170719.jpg';
    const origins = Array.from({ length: 21 }, (_, i) => org(0, i * 600));
    const r = runBody(3, origins, [f(only)]);
    ok('BD-1. 한 장 원본 → 경계 적용 · 파일 0 · y 1800',
      r.plan.applied === true && r.plan.sourceIndex === 0 && r.plan.cropY === 1800,
      JSON.stringify({ a: r.plan.applied, s: r.plan.sourceIndex, y: r.plan.cropY }));
    ok('BD-1b. 결과 본문 항목은 정확히 1장(밴드 21장으로 쪼개지지 않는다)',
      r.items.length === 1 && r.items[0].src === `${only}#cut@1800`, `실제 ${r.items.length}개`);
    ok('BD-1c. 자르는 지점은 한 곳뿐(cropFromY>0 인 파일이 1개)',
      r.bounded.sources.filter((x) => x.cropFromY > 0).length === 1);
    ok('BD-1d. y=0 을 가리키면 자르지 않는다(원본 파일 그대로)',
      runBody(0, origins, [f(only)]).items[0].src === only);
  }

  // ── BD-2. 여러 파일(핑거위글형): 메인 파일 → 홍보 GIF → 본문 파일. ──
  {
    const urls = ['https://cdn/goodsm/1667813618_0.jpg', 'https://cdn/goodsm/1667813619_1.gif', 'https://cdn/goodsm/1667813619_2.jpg'];
    const sources = [f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2])];
    // 밴드: 파일0 에서 5장(요약) · 파일1 홍보 GIF 1장 · 파일2 에서 27장(본문)
    const origins = [
      ...Array.from({ length: 5 }, (_, i) => org(0, i * 400)),
      org(1, 0, { isGif: true, promo: true }),
      ...Array.from({ length: 27 }, (_, i) => org(2, i * 450)),
    ];
    const r = runBody(6, origins, sources);   // 6 = 파일2 의 첫 밴드(y=0)
    ok('BD-2. 앞 메인 파일과 홍보 GIF 가 빠지고 본문 파일만 남는다',
      r.items.length === 1 && r.items[0].src === urls[2], r.items.map((i) => i.src).join(' , '));
    ok('BD-2b. 본문 파일은 통째로 유지된다(자르지 않음)', r.plan.cropY === 0 && r.plan.sourceIndex === 2);
    ok('BD-2c. 제외 사실을 사용자에게 알린다', r.notes.some((n) => n.includes('원본 메인섹션') && n.includes('2장')));

    // 본문 파일이 2장이면 둘 다 원래 순서 그대로 남는다.
    const four = [f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2]), f('https://cdn/goodsm/1667813619_3.jpg')];
    const origins4 = [...origins, ...Array.from({ length: 4 }, (_, i) => org(3, i * 500))];
    const r4 = runBody(6, origins4, four);
    ok('BD-2d. 본문 파일 2장은 자르지 않고 원래 순서로',
      r4.items.length === 2 && r4.items[0].src === urls[2] && r4.items[1].src === 'https://cdn/goodsm/1667813619_3.jpg');

    // 경계가 본문 파일 중간이면 그 파일 하나만 잘리고, 뒤 파일은 그대로.
    const r5 = runBody(8, origins4, four);   // 파일2 의 3번째 밴드 → y=900
    ok('BD-2e. 경계 파일만 한 번 잘리고 뒤 파일은 원본 그대로',
      r5.items.length === 2 && r5.items[0].src === `${urls[2]}#cut@900`
      && r5.items[1].src === 'https://cdn/goodsm/1667813619_3.jpg', r5.items.map((i) => i.src).join(' , '));
    ok('BD-2e-1. 자를 파일로 표시된 것은 경계 파일 하나뿐(뒤 파일은 cropFromY 0)',
      r5.bounded.sources.filter((x) => x.cropFromY > 0).length === 1
      && r5.bounded.sources[0].cropFromY === 900
      && r5.bounded.sources.slice(1).every((x) => x.cropFromY === 0),
      r5.bounded.sources.map((x) => x.cropFromY).join(','));

    // 일반 본문 GIF 는 살아남고 홍보 GIF 만 빠진다.
    const withGif = [f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2]), f('https://cdn/usage_demo.gif', { isGif: true })];
    const originsG = [...origins, org(3, 0, { isGif: true })];
    const rg = runBody(6, originsG, withGif);
    ok('BD-2f. 일반 본문 GIF 는 gif 원본으로 유지 · 홍보 GIF 만 제외',
      rg.items.length === 2 && rg.items[1].src === 'https://cdn/usage_demo.gif' && rg.items[1].mediaType === 'gif'
      && !rg.items.some((i) => i.src === urls[1]));
    ok('BD-2g. 경계가 GIF 파일 중간이어도 GIF 는 자르지 않는다', (() => {
      const originsMid = originsG.slice(0, -1).concat([org(3, 120, { isGif: true })]);
      const rr = runBody(originsMid.length - 1, originsMid, withGif);
      return rr.plan.applied === true && rr.plan.cropY === 0
        && rr.items.length === 1 && rr.items[0].src === 'https://cdn/usage_demo.gif';
    })());
  }

  // ── BD-3. 경계 실패: 본문을 지우지 않고 원본 전체 보존 + 고정 안내 문구. ──
  {
    const urls = ['https://cdn/a.jpg', 'https://cdn/promo.gif', 'https://cdn/b.jpg'];
    const sources = [f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2])];
    const origins = [org(0, 0), org(1, 0, { isGif: true, promo: true }), org(2, 0)];
    for (const [label, bad] of [['범위 밖(99)', 99], ['음수(-1)', -1], ['정수 아님', 1.5], ['NaN', Number.NaN]]) {
      const r = runBody(bad, origins, sources);
      ok(`BD-3(${label}) 경계 미적용 · 원본 전량 보존 · 손검수 note`,
        r.plan.applied === false && r.plan.sourceIndex === -1 && r.plan.cropY === 0
        && r.items.length === 2 && r.items[0].src === urls[0] && r.items[1].src === urls[2]
        && r.notes.includes(BODY_BOUNDARY_FALLBACK_NOTE),
        `items ${r.items.length}`);
    }
    ok('BD-3b. 출처 파일 번호가 원본 개수를 넘으면 실패로 보존', (() => {
      const r = runBody(0, [org(9, 0)], sources);
      return r.plan.applied === false && r.items.length === 2 && r.notes.includes(BODY_BOUNDARY_FALLBACK_NOTE);
    })());
    ok('BD-3c. 실패 안내는 지시서 문장 그대로 정확히 1줄',
      runBody(99, origins, sources).notes.filter((n) => n === BODY_BOUNDARY_FALLBACK_NOTE).length === 1);
  }

  // ── BD-4. 메인·KEY FEATURE: AI 가 고른 인덱스를 픽셀 임계값이 다시 탈락시키지 않는다. ──
  {
    // FW[1] color 0.59(> MAX_COLOR 0.20) · FW[3] fillRatio 0.72(> MAX_FILL_RATIO 0.62)
    //   → 예전 cleanEligible 은 둘 다 탈락시키고 다른 밴드로 재선정했다. 새 계약에서는 그대로 쓴다.
    const norm = normalizeBandLedger(FW_LEDGER, FW);
    const s1 = selectBasicSlots({ mainIndex: 1, featureIndex: 3, packageIndex: 3, ledger: norm.ledger }, FW);
    ok('BD-4. 색·채움비 임계값을 넘는 AI 픽도 그대로 배치된다',
      s1.mainIndex === 1 && s1.featureIndex === 3, `main ${s1.mainIndex} / feature ${s1.featureIndex}`);
    ok('BD-4b. 결정 기록이 "AI 선택 그대로"임을 남긴다',
      s1.decisions.filter((d) => (d.role === 'main' || d.role === 'feature'))
        .every((d) => d.result === 'accepted' && d.reason.includes('AI 선택 그대로')));
    // 자산 종류(product_cut)로도 되탈락시키지 않는다 — FW[3] 은 장부상 package_box 다.
    ok('BD-4c. 자산 종류(asset)로 메인·KEY FEATURE 를 되탈락시키지 않는다',
      norm.ledger[3].asset === 'package_box' && s1.featureIndex === 3);
    // 밴드 타입(TEXT) 같은 픽셀 태그로도 되탈락시키지 않는다.
    const s2 = selectBasicSlots({ mainIndex: 6, featureIndex: 27, packageIndex: 3, ledger: norm.ledger }, FW);
    ok('BD-4d. 픽셀 태그(TEXT)로도 되탈락시키지 않는다', FW[6].type === 'TEXT' && s2.mainIndex === 6);
    // 후보 재점수·재선정 경로가 남아 있지 않다.
    ok('BD-4e. 재선정 결과값이 나오지 않는다(reselected 0건)',
      !s1.decisions.some((d) => String(d.result).includes('reselected'))
      && !s2.decisions.some((d) => String(d.result).includes('reselected')));
  }

  // ── BD-5. 잘못된 인덱스 · 같은 이미지 중복. ──
  {
    const norm = normalizeBandLedger(FW_LEDGER, FW);
    const outOfRange = selectBasicSlots({ mainIndex: 999, featureIndex: 13, packageIndex: 3, ledger: norm.ledger }, FW);
    ok('BD-5. 범위 밖 메인은 그 슬롯만 빈칸 · KEY FEATURE·패키지는 그대로',
      outOfRange.mainIndex === -1 && outOfRange.featureIndex === 13 && outOfRange.packageIndex === 3
      && outOfRange.notes.some((n) => n.includes('범위 밖')));
    const dup = selectBasicSlots({ mainIndex: 13, featureIndex: 13, packageIndex: 3, ledger: norm.ledger }, FW);
    ok('BD-5b. 같은 인덱스면 KEY FEATURE 만 비운다',
      dup.mainIndex === 13 && dup.featureIndex === -1 && dup.packageIndex === 3
      && dup.notes.some((n) => n.includes('메인과 같은 이미지')));
    const promoPick = selectBasicSlots({ mainIndex: 5, featureIndex: 13, packageIndex: 3, ledger: norm.ledger }, FW);
    ok('BD-5c. 홍보 GIF 지목은 빈칸(유일하게 남은 이미지 차단)',
      FW[5].promo === true && promoPick.mainIndex === -1 && promoPick.featureIndex === 13);
    const noAsset = selectBasicSlots({ mainIndex: 0, featureIndex: 13, packageIndex: 3 },
      FW.map((b, i) => (i === 0 ? { ...b, src: '' } : b)));
    ok('BD-5d. 자산이 없으면 그 슬롯만 빈칸', noAsset.mainIndex === -1 && noAsset.featureIndex === 13);
    // 본문은 슬롯 결과와 무관하다(구조적 차단 — 인자를 받지 않는다).
    const bodyA = assembleBodyFromSourceImages([f('https://cdn/x.jpg'), f('https://cdn/y.jpg')]);
    ok('BD-5e. 슬롯이 무엇이든 본문 출력은 같다(본문은 슬롯을 인자로 받지 않는다)',
      assembleBodyFromSourceImages.length === 1 && bodyA.sections[0].items.length === 2);
  }

  // ── BD-6. 패키지 무회귀: 실제 패키지 박스는 유지 · 구성품뿐이면 비활성. ──
  {
    const fwNorm = normalizeBandLedger(FW_LEDGER, FW);
    const fwSlots = selectBasicSlots({ mainIndex: 27, featureIndex: 13, packageIndex: 3, ledger: fwNorm.ledger }, FW);
    ok('BD-6. 실제 패키지 박스 fixture 는 그대로 선정(핑거위글 3)', fwSlots.packageIndex === 3);
    const glNorm = normalizeBandLedger(GL_LEDGER, GL);
    ok('BD-6b. 글랜스 패키지도 그대로(3)',
      selectBasicSlots({ mainIndex: 23, featureIndex: 9, packageIndex: 3, ledger: glNorm.ledger }, GL).packageIndex === 3);
    const prNorm = normalizeBandLedger(PR_LEDGER, PR);
    const prSlots = selectBasicSlots({ mainIndex: 17, featureIndex: 19, packageIndex: 15, ledger: prNorm.ledger }, PR);
    ok('BD-6c. 구성품만 있는 fixture 는 패키지 비활성(프리티)',
      prSlots.packageIndex === -1 && prSlots.notes.some((n) => n.includes('구성품')));
    ok('BD-6d. 패키지 비활성이어도 메인·KEY FEATURE 는 정상 배치',
      prSlots.mainIndex === 17 && prSlots.featureIndex === 19);
  }

  // ── BD-7. 본문 무가공 계약: 경계 이후 파일의 순서·개수·GIF 원본이 그대로. ──
  {
    const urls = ['https://cdn/m.jpg', 'https://cdn/p.gif', 'https://cdn/b1.jpg', 'https://cdn/b2.gif', 'https://cdn/b3.jpg'];
    const sources = [f(urls[0]), f(urls[1], { isGif: true, promo: true }), f(urls[2]), f(urls[3], { isGif: true }), f(urls[4])];
    const origins = [org(0, 0), org(1, 0, { isGif: true, promo: true }), org(2, 0), org(3, 0, { isGif: true }), org(4, 0)];
    const r = runBody(2, origins, sources);
    ok('BD-7. 경계 이후 파일 순서·개수 그대로',
      r.items.map((i) => i.src).join(',') === [urls[2], urls[3], urls[4]].join(','), r.items.map((i) => i.src).join(','));
    ok('BD-7b. GIF 는 원본 주소·gif 타입 그대로', r.items[1].src === urls[3] && r.items[1].mediaType === 'gif');
    ok('BD-7c. 밴드 재조립 0건 — 항목 수는 파일 수와 같다(밴드 수와 무관)',
      r.items.length === 3 && origins.length === 5);
    ok('BD-7d. 제목·번호·구분선·텍스트 생성 0건',
      r.body.sections.length === 1 && r.body.sections[0].preserved === true
      && r.body.sections[0].title === '' && r.body.sections[0].number === ''
      && r.body.sections[0].tailStart === undefined
      && r.items.every((i) => i.kind === 'media' && i.composite === false && !i.reviewNote));
    ok('BD-7e. 경계 함수는 픽셀·밴드 지표를 받지 않는다(구조적 차단)',
      planBodyBoundary.length === 3 && applyBodyBoundary.length === 2);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// [9-d] 본문 시작점 = 3줄 요약 직후 (2026-08-24 Patch · 프리티 러브 브루스)
//   확정된 원인: 옛 지시의 "패키지·옵션까지 메인섹션" 표현이 너무 넓어서,
//     메인섹션 뒤의 `제품특징` 블록과 Point 01 구성품 이미지까지 메인으로 간주됐다
//     → 본문 크롭 시작점이 너무 아래로 내려가 본문 첫 두 덩어리가 잘렸다.
//   새 기준: 메인섹션 = 메인이미지 + 요약정보 + 3줄 요약 (+ 3줄 요약에 바로 붙은 실제 패키지 박스).
//     `제품특징`·`Point`·구성품 소개가 시작되면 그 지점부터 본문이다.
//   ⚠️ 유료 AI 호출 0회 — AI 응답은 stub 숫자로만 들어간다.
// ══════════════════════════════════════════════════════════════════════════
console.log('[9-d] 본문 시작점 = 3줄 요약 직후 · 제품특징/Point 01 보존');
{
  const f = (src, opts = {}) => ({ src, isGif: !!opts.isGif, promo: !!opts.promo });
  const org = (sourceIndex, y, opts = {}) => ({ sourceIndex, y, isGif: !!opts.isGif, promo: !!opts.promo });

  // 프리티형: 원본이 **한 장의 긴 이미지**이고 아래 순서로 이어진다.
  const PRETTY_SRC = 'https://cdn/banana_img/product_image/woman/pretty_love_bruce_detail.jpg';
  const LAYOUT = [
    { name: '메인 이미지', y: 0 },
    { name: '요약정보', y: 900 },
    { name: '3줄 요약', y: 1600 },
    { name: '제품특징', y: 2000 },            // ← 본문 시작점(새 기준)
    { name: 'Point 01 구성품 사진', y: 2600 },
    { name: 'Point 02', y: 3400 },
  ];
  const IDX = Object.fromEntries(LAYOUT.map((b, i) => [b.name, i]));
  const origins = LAYOUT.map((b) => org(0, b.y));
  const sources = [f(PRETTY_SRC)];

  const runBody = (bodyStartIndex) => {
    const plan = planBodyBoundary(bodyStartIndex, origins, sources.length);
    const bounded = applyBodyBoundary(sources, plan);
    const cutAt = bounded.sources.findIndex((x) => x.cropFromY > 0);
    const bodySources = cutAt >= 0
      ? bounded.sources.map((x, i) => (i === cutAt ? { ...x, src: `${x.src}#cut@${x.cropFromY}` } : x))
      : bounded.sources;
    const body = assembleBodyFromSourceImages(bodySources);
    return { plan, body, items: body.sections.flatMap((s) => s.items) };
  };
  /** 크롭 결과(= y>=cropY 구간)에 그 밴드가 남아 있는가. */
  const survives = (plan, name) => plan.applied && LAYOUT[IDX[name]].y >= plan.cropY;

  // ── 본문 시작점은 `제품특징` 이다. ──
  const BODY_START = IDX['제품특징'];
  const r = runBody(BODY_START);
  ok('BD-8. 본문 시작점 = `제품특징`(3줄 요약 직후) · 원본 파일 0 · y 2000',
    r.plan.applied === true && r.plan.sourceIndex === 0 && r.plan.cropY === LAYOUT[BODY_START].y,
    JSON.stringify({ applied: r.plan.applied, s: r.plan.sourceIndex, y: r.plan.cropY }));
  ok('BD-8b. `제품특징`이 크롭 결과에 남는다', survives(r.plan, '제품특징'));
  ok('BD-8c. Point 01 구성품 사진이 크롭 결과에 남는다', survives(r.plan, 'Point 01 구성품 사진'));
  ok('BD-8d. Point 02 도 남는다(본문 뒷부분 유실 없음)', survives(r.plan, 'Point 02'));
  ok('BD-8e. 메인섹션 3종(메인이미지·요약정보·3줄 요약)은 본문에서 빠진다',
    ['메인 이미지', '요약정보', '3줄 요약'].every((n) => !survives(r.plan, n)));
  ok('BD-8f. 한 장 원본이므로 본문 항목은 1장(밴드 6장으로 재조립되지 않는다)',
    r.items.length === 1 && r.items[0].src === `${PRETTY_SRC}#cut@2000`, `실제 ${r.items.length}개`);

  // ── 음성 변형: 옛 넓은 기준(패키지·옵션까지 메인섹션)이 내던 답을 넣으면 실제로 잘린다. ──
  //    이 대조가 실패하면 위 검사는 "무엇이든 통과하는 검사"라는 뜻이다.
  const wrong = runBody(IDX['Point 02']);
  ok('BD-8g. [음성 대조] 옛 넓은 기준의 답(Point 02)이면 제품특징·Point 01 이 실제로 잘린다',
    wrong.plan.applied === true && wrong.plan.cropY === 3400
    && !survives(wrong.plan, '제품특징') && !survives(wrong.plan, 'Point 01 구성품 사진'),
    JSON.stringify({ y: wrong.plan.cropY }));
  ok('BD-8h. [음성 대조] 구성품 사진을 패키지로 오인한 답(Point 01)도 제품특징을 잘라먹는다',
    !survives(runBody(IDX['Point 01 구성품 사진']).plan, '제품특징'));

  // ── 3줄 요약 바로 아래에 실제 패키지 박스가 붙은 원본은 그 패키지까지 메인섹션이다. ──
  {
    const WITH_BOX = [
      { name: '메인 이미지', y: 0 }, { name: '요약정보', y: 800 }, { name: '3줄 요약', y: 1500 },
      { name: '패키지 박스', y: 1900 }, { name: '제품특징', y: 2300 }, { name: 'Point 01', y: 2900 },
    ];
    const oIdx = Object.fromEntries(WITH_BOX.map((b, i) => [b.name, i]));
    const o = WITH_BOX.map((b) => org(0, b.y));
    const plan = planBodyBoundary(oIdx['제품특징'], o, 1);
    ok('BD-8i. 3줄 요약에 붙은 실제 패키지 박스는 메인섹션 · 본문은 그 다음 `제품특징`부터',
      plan.applied === true && plan.cropY === 2300
      && WITH_BOX[oIdx['패키지 박스']].y < plan.cropY
      && WITH_BOX[oIdx['Point 01']].y >= plan.cropY);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// [10] 결선 · 계약 대조(소스)
// ══════════════════════════════════════════════════════════════════════════
console.log('[10/10] 결선 · 계약 대조');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');
const convertSrc = read('src/components/detailBuilder/services/godoBasicConvert.ts');
const readerSrc = read('src/components/detailBuilder/services/basicVisionReader.ts');
const previewSrc = read('src/components/detailBuilder/components/PreviewGodo.tsx');
const thumbSrc = read('src/components/detailBuilder/components/ThumbnailPreview.tsx');
const assemblySrc = read('src/components/detailBuilder/services/basicBodyAssembly.ts');
const parserSrc = read('src/components/detailBuilder/services/mainMallExcelParser.ts');

ok('WR-1. 변환 1회당 Claude 호출부 1곳', (convertSrc.match(/await readBasicLayout\(/g) || []).length === 1);
ok('WR-2. 변환기에 다른 AI·네트워크 호출 경로 없음', !/chatWithProvider|fetch\(/.test(convertSrc));
ok('WR-3. 반복문 안에서 AI 를 부르지 않는다', !/for\s*\([^)]*\)[\s\S]{0,200}readBasicLayout/.test(convertSrc));
ok('WR-4. 자동 재시도 루프 없음', !/while\s*\(|for\s*\([^)]*\)[\s\S]{0,120}chatWithProvider/.test(readerSrc));
ok('WR-5. 조립 모듈은 네트워크·AI·DOM 을 쓰지 않는다',
  !/fetch\(|chatWithProvider|XMLHttpRequest/.test(assemblySrc) && !/document\.|new Image\(|createElement/.test(assemblySrc));
ok('WR-6. 단계별 시간 계측이 그대로다',
  ['whitespace_split_ms', 'band_tagging_ms', 'claude_request_ms', 'response_validation_ms', 'package_normalization_ms', 'package_layout_ms', 'total_conversion_ms']
    .every((k) => convertSrc.includes(k)));
ok('WR-7. 이미지 해상도·토큰 예산 불변(760px · maxTokens 4000)', /maxPx = 760/.test(readerSrc) && /maxTokens: 4000/.test(readerSrc));
ok('WR-8. 리더가 밴드 장부를 요청한다(자유 섹션 조립 계약 제거)',
  /밴드 장부/.test(readerSrc) && /"bands"/.test(readerSrc) && !/AiBodySection/.test(readerSrc));
ok('WR-9. 변환기 본문은 원본 "파일" 경로만 쓴다(밴드·태거·장부는 본문에서 끊겼다)',
  (convertSrc.match(/assembleBodyFromSourceImages\(/g) || []).length === 2            // ①구조 · ②AI 둘 다
  && /assembleBodyFromSourceImages\(sources\)/.test(convertSrc)                       // ①구조 = 원본 전량
  && /assembleBodyFromSourceImages\(bodySources\)/.test(convertSrc)                   // ②AI = 경계 적용 결과
  && !/assembleBodyFromLedger\s*\(/.test(convertSrc)            // 장부 섹션 조립 호출 0건
  && !/assembleBodyPreserved\s*\(/.test(convertSrc)             // 밴드 단위 보존 호출 0건
  && !/assembleBody\w*\(bandRefs\)/.test(convertSrc)            // 본문이 밴드에서 오지 않는다
  && (convertSrc.match(/const bodyOut = /g) || []).length === 2);  // bodyOut 은 파일 경로에서만 만들어진다
// ── 본문 시작 경계 (2026-08-24 3차) ──
ok('WR-9d. 본문 경계는 순수 계획 → 적용 → 한 번 자르기 순서로만 배선된다',
  /const plan = planBodyBoundary\(r\.bodyStartIndex, origins, sources\.length\)/.test(convertSrc)
  && /const bounded = applyBodyBoundary\(sources, plan\)/.test(convertSrc)
  && /const cropSourceFromY = \(src: string, y: number\)/.test(convertSrc)          // 자르기 함수 정의 1곳
  && (convertSrc.match(/await cropSourceFromY\(/g) || []).length === 1);            // 호출 1곳뿐
ok('WR-9e. 자르기는 경계 파일 하나뿐이고 실패하면 원본 전량으로 되돌린다',
  /const cutAt = bounded\.sources\.findIndex\(\(s\) => s\.cropFromY > 0\)/.test(convertSrc)
  && /bodySources = sources; notes\.push\(BODY_BOUNDARY_FALLBACK_NOTE\)/.test(convertSrc));
ok('WR-9f. 밴드 출처(파일·y)는 분할기 반환값을 그대로 쓴다(좌표 추측 규칙 0건)',
  /origins\.push\(\{ sourceIndex, y: s\.y, isGif: srcIsGif, promo \}\)/.test(convertSrc)
  && !/estimate|guess|추정 y|approxY/.test(convertSrc));
ok('WR-9g. 조립 모듈의 경계 계획은 순수하다(DOM·네트워크 0건)',
  /export const planBodyBoundary/.test(assemblySrc) && /export const applyBodyBoundary/.test(assemblySrc));
ok('WR-9h. 리더가 bodyStartIndex 를 함께 요청·해석한다(추가 호출 없이 같은 1콜)',
  /bodyStartIndex/.test(readerSrc) && /"bodyStartIndex"/.test(readerSrc)
  && /bodyStartIndex: num\(obj\.bodyStartIndex\)/.test(readerSrc)
  && (readerSrc.match(/await chatWithProvider\(/g) || []).length === 2);   // readBasicLayout · readBakedFlow 각 1콜
// ── 본문 시작점 지시 교정 (2026-08-24 Patch) ──
//   프리티 러브 브루스에서 본문 첫 두 덩어리가 잘린 원인은 "패키지·옵션까지 메인섹션"이라는
//   넓은 표현이었다. 지시문에서 그 표현이 사라지고 좁은 기준이 들어갔는지 소스로 확인한다.
ok('WR-9i. 메인섹션 정의가 좁다(메인이미지 + 요약정보 + 3줄 요약에서 끝난다)',
  /메인섹션"은 \*\*메인 이미지 \+ 요약정보 \+ 원본의 3줄 요약\*\*으로 끝난다/.test(readerSrc)
  && /그 이상 넓히지 말 것/.test(readerSrc));
ok('WR-9j. 실제 패키지 박스는 3줄 요약에 바로 붙었을 때만 메인섹션에 포함한다',
  /3줄 요약 \*\*바로 위 또는 바로 아래\*\*에 붙어 있을 때만/.test(readerSrc)
  && /파우치·케이블·구성품을 함께 찍은 사진·제품 특징 사진은 \*\*패키지가 아니다\*\*/.test(readerSrc));
ok('WR-9k. 제품특징·Point·구성품 소개가 시작되면 본문으로 넘긴다',
  /`제품특징`·`제품 포인트`·`Point`·번호·기능 설명·사용 설명·구성품 소개가 시작되면/.test(readerSrc)
  && /여백이 없거나 이미지와 글자가 겹쳐 보여도 \*\*본문으로 넘긴다\.\*\*/.test(readerSrc));
ok('WR-9l. 옛 넓은 표현("옵션까지 메인섹션")이 지시문에서 사라졌다',
  !/\(옵션 영역이 있으면\) 옵션까지/.test(readerSrc)
  && !/옵션 영역은 메인섹션에 붙어 있으면/.test(readerSrc)
  && /"옵션"이라는 넓은 표현으로 본문 시작을 \*\*뒤로 미루지 말 것\.\*\*/.test(readerSrc));
ok('WR-9m. 본문 시작점 지시만 고쳤다 — 경계 처리·본문 조립 코드는 무변경',
  /const plan = planBodyBoundary\(r\.bodyStartIndex, origins, sources\.length\)/.test(convertSrc)
  && /const bounded = applyBodyBoundary\(sources, plan\)/.test(convertSrc)
  && (convertSrc.match(/await cropSourceFromY\(/g) || []).length === 1
  && /export const applyBodyBoundary/.test(assemblySrc));
ok('WR-9b. 장부·상단 슬롯 검증은 그대로 남아 있다(요약·슬롯 전용)',
  /normalizeBandLedger\(/.test(convertSrc) && /selectBasicSlots\(/.test(convertSrc));
ok('WR-9c. 장부 섹션 조립 코드는 삭제하지 않고 보존한다',
  /export const assembleBodyFromLedger/.test(assemblySrc) && /export const normalizeBandLedger/.test(assemblySrc));
ok('WR-10. 상품명 정본은 엑셀 값이 먼저', /productNameKr: input\.productNameKr \|\| r\.productNameKr/.test(convertSrc));
ok('WR-11. 렌더러가 배열 순서 Point 번호·사이즈 규칙·tail 구분을 순수 함수로 받는다',
  /bodyPointLabel\(i\)/.test(previewSrc) && /isSizeSection/.test(previewSrc) && /sec\.tailStart/.test(previewSrc));
ok('WR-12. 나열부에 새 제목·번호를 만들지 않는다', !/>제품 이미지</.test(previewSrc));
ok('WR-13. 태거·분할기 상수 불변',
  /TEXT_MAX_LARGEST_CC: 0\.08/.test(read('src/components/detailBuilder/services/basicBandTagger.ts'))
  && /minSegPx \?\? 48/.test(read('src/components/detailBuilder/services/flowImageSplitter.ts')));
ok('WR-14. 상단 슬롯 픽셀 임계값 불변',
  /MAX_COLOR: 0\.20/.test(assemblySrc) && /MAX_SMALL_CC: 10/.test(assemblySrc)
  && /MIN_LARGEST_CC: 0\.12/.test(assemblySrc) && /MAX_FILL_RATIO: 0\.62/.test(assemblySrc));
ok('WR-15. 파서는 상품별 약자 목록이 아니라 구조 규칙을 쓴다', !/NPR\|TJ\|SWL\|SNN\|LVH\|NTS/.test(parserSrc));
ok('WR-18. 렌더러는 보존 본문에 Point 제목·섹션 제목·구분선을 만들지 않는다',
  /const preserved = sec\.preserved === true/.test(previewSrc)
  && /\{!preserved && <h2 /.test(previewSrc)
  && /\{i > 0 && !preserved && \(/.test(previewSrc)
  && /const runStart = preserved[\s\S]{0,20}\? -1/.test(previewSrc));
// ── 선택 진단 3줄 (2026-08-24) — 원인 확인용. 판정에 되먹이지 않는다. ──
ok('WR-20. 선택 진단 3줄이 notes 로 남는다(DEV 게이트 밖 → Preview 화면에서 보인다)', (() => {
  const diagPush = convertSrc.match(/notes\.push\(`\[진단\]/g) || [];
  if (diagPush.length !== 3) return false;
  const devBlocks = convertSrc.match(/if \(DEV\) \{[\s\S]*?\n  \}/g) || [];
  return !devBlocks.some((b) => b.includes('[진단]'))            // DEV 블록 안이 아니다
    && /AI 지목 main=\$\{r\.mainIndex\}/.test(convertSrc)         // ① AI 지목 ↔ 최종
    && /bodyStart=\$\{r\.bodyStartIndex\}/.test(convertSrc)      // ①-b 본문 시작 경계도 같은 줄에
    && /slots\.decisions\.filter/.test(convertSrc)                // ② 슬롯 결정·거절 사유
    && /밴드별 기계 확인/.test(convertSrc);                        // ③ 범위·홍보 GIF·자산 존재
})());
ok('WR-21. 진단은 선택값을 다시 계산하거나 덮어쓰지 않는다',
  (convertSrc.match(/mainIndexV\s*=[^=]/g) || []).length === 1
  && (convertSrc.match(/featureIndexV\s*=[^=]/g) || []).length === 1
  && (convertSrc.match(/packageIndexV\s*=[^=]/g) || []).length === 1
  && !/slots\.(mainIndex|featureIndex|packageIndex)\s*=[^=]/.test(convertSrc));
// ── 메인·KEY FEATURE 자동선정 OFF (2026-08-24 2차, 전 상품 공통) ──
ok('WR-23. 자동 메인·KEY FEATURE 선정이 전 상품 공통으로 켜져 있다',
  /const AUTO_HERO_SLOTS: boolean = true;/.test(convertSrc)
  && /AUTO_HERO_SLOTS \? at\(mainIndexV\) : null/.test(convertSrc)
  && /AUTO_HERO_SLOTS \? at\(featureIndexV\) : null/.test(convertSrc)
  && !/AUTO_HERO_SLOTS[\s\S]{0,200}productName|상품별|if \(input\./.test(convertSrc.split('const AUTO_HERO_SLOTS')[0]));
ok('WR-23b. 조립 모듈이 메인·KEY FEATURE 를 기계 확인 3종 + 중복만으로 판정한다',
  /const validateHero =/.test(assemblySrc)
  && /out_of_range/.test(assemblySrc) && /bananamall_promo_gif/.test(assemblySrc)
  && /asset_missing/.test(assemblySrc) && /same_as_main/.test(assemblySrc));
ok('WR-24. ①구조 경로(AI 0콜)는 메인·KEY FEATURE 를 비운다',
  /메인·KEY FEATURE 는 AI 읽기 단계에서 정한다[\s\S]{0,120}mainImage: null,\s*\n\s*featureImage: null,/.test(convertSrc));
ok('WR-25. 선정 진입점·HERO 정규화·패키지 자동배치 코드는 지우지 않았다',
  /selectBasicSlots\(/.test(convertSrc) && /normalizeHeroMainImage\(/.test(convertSrc)
  && /computePackageLayout\(/.test(convertSrc)
  && /export const selectBasicSlots/.test(assemblySrc)
  && /MAX_COLOR: 0\.20/.test(assemblySrc));
ok('WR-26. 패키지 선정·여백 정규화·활성 플래그는 무변경',
  /normalizePackageImage\(packageImage\)/.test(convertSrc)
  && /isPackageImageEnabled: !!packageImage/.test(convertSrc)
  && /packageImage = at\(packageIndexV\)/.test(convertSrc));
ok('WR-27. 본문에 분할·태거를 쓰지 않는다(요약·판정용으로만 남는다)',
  /splitImageByWhitespace\(/.test(convertSrc) && /tagBasicBands\(/.test(convertSrc)   // 판정용으로는 유지
  && !/godoBodySections: [^\n]*band/i.test(convertSrc)
  && /godoBodySections: bodyOut\.sections/.test(convertSrc));
ok('WR-22. 변환기가 픽셀 임계값으로 AI 선택을 다시 거르지 않는다(이중 판단 금지)',
  !/CLEAN_CUT_THRESHOLDS/.test(convertSrc)
  && !/MAX_COLOR|MAX_SMALL_CC|MIN_LARGEST_CC|MAX_FILL_RATIO/.test(convertSrc)
  && !/cleanEligible|cleanScore|selectClean|reselected/.test(convertSrc)
  && !/const cleanEligible|const cleanScore|const selectClean/.test(assemblySrc));
ok('WR-19. 보존 본문 이미지는 무테로 이어 붙인다(없던 구분선 생성 금지)',
  /const noBorder = preserved \|\| \(sizeSection && item\.kind === 'media'\)/.test(previewSrc)
  && /\{preserved \? null : k === runStart/.test(previewSrc));
const consts = await import(pathToFileURL(path.join(outDir, 'constants.js')).href);
ok('WR-16. 섬네일 프리셋 4종·규격 불변',
  consts.THUMBNAIL_PRESETS.length === 4
  && consts.THUMBNAIL_PRESETS.map((p) => `${p.width}x${p.height}`).join(',') === '202x202,400x400,500x500,274x411');
ok('WR-17. 섬네일 입력 계약 불변(thumbnailImage || mainImage) · 본문 미참조',
  /thumbnailImage\s*\|\|\s*data\.mainImage/.test(thumbSrc) && !/godoBodySections/.test(thumbSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
