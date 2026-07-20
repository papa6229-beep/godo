// 결정론 라우팅 스모크 — 실제 파서 + decideOptionPreserve를 test/*.xlsx에 돌려 라우팅 회귀를 자동 검증.
//   실행: node scripts/flowRouteSmoke.ts   (Node v24 타입스트리핑, 별도 빌드 불필요)
//   목적(커밋1 완료기준): 시엑스만 OPTION_PRESERVE, 기존 대표 단순형은 전부 EXISTING_FLOW로 불변.
//   ⚠️ test/*.xlsx는 gitignore(개발 로컬 자료)라 CI에는 없다 — 로컬 개발 스모크 도구.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const parserUrl = pathToFileURL(`${repoRoot}src/components/detailBuilder/services/mainMallExcelParser.ts`).href;
const verdictUrl = pathToFileURL(`${repoRoot}src/components/detailBuilder/services/optionPreserveConverter.ts`).href;
const { parseMainMallArrayBuffer } = await import(parserUrl);
const { decideOptionPreserve } = await import(verdictUrl);

// 기대 라우팅(대표 샘플). 나머지 파일은 정보 출력만.
const EXPECT: Record<string, string> = {
  '시엑스.xlsx': 'OPTION_PRESERVE',
  '버진루프.xlsx': 'EXISTING_FLOW',
  '트리니티.xlsx': 'EXISTING_FLOW',
  '닛포리.xlsx': 'EXISTING_FLOW',
  '옵션닛포리.xlsx': 'EXISTING_FLOW',
  '롬프.xlsx': 'EXISTING_FLOW',
  '타액로션.xlsx': 'EXISTING_FLOW',
  '스타킹.xlsx': 'EXISTING_FLOW',
  '간호.xlsx': 'EXISTING_FLOW',
};

const testDir = `${repoRoot}test`;
const files = readdirSync(testDir).filter((f) => f.toLowerCase().endsWith('.xlsx')).sort();

let fail = 0;
console.log('file'.padEnd(28), 'verdict'.padEnd(16), 'opt img optImg tail  reason');
for (const f of files) {
  try {
    const buf = readFileSync(`${testDir}/${f}`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const p = await parseMainMallArrayBuffer(ab as ArrayBuffer);
    if (!p) { console.log(f.padEnd(28), 'PARSE_NULL'); continue; }
    const d = decideOptionPreserve(p);
    const exp = EXPECT[f];
    const mark = exp ? (d.verdict === exp ? '[OK]  ' : `[FAIL exp ${exp}] `) : '      ';
    if (exp && d.verdict !== exp) fail++;
    console.log(
      f.padEnd(28),
      (mark + d.verdict).padEnd(16),
      String(d.optionCount).padStart(3), String(d.imageCount).padStart(3),
      String(d.optionImageCount).padStart(5), String(d.tailCombineCount).padStart(4),
      ' ' + d.reason,
    );
  } catch (e: any) {
    console.log(f.padEnd(28), 'ERROR', String(e?.message || e));
    if (EXPECT[f]) fail++;
  }
}
console.log('\n' + (fail === 0 ? 'PASS — 라우팅 회귀 없음 (시엑스만 OPTION_PRESERVE, 기존 EXISTING_FLOW 불변)' : `FAIL — ${fail}건 불일치`));
process.exit(fail === 0 ? 0 : 1);
