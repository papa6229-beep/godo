#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-data-contract-v0.mjs
 * Marketing Behavior Data Contract v0 검증.
 *  - 타입 계약(이벤트/인사이트/모드) + 데모 분리 + 빌더(buildMarketingBehaviorInsights) + 모달 연결
 *  - 모달이 수치를 직접 만들지 않고 insights 기반 렌더 / 데모는 isDemo로 명시
 *  - 실 수집 전: 실제 GA4/GTM/광고 API/수집 route 없음, PII 없음, CS/상품/운영 무변경
 *  - 추가: 빌더가 raw 이벤트를 실제로 집계함을 런타임으로 증명(live 경로) + demo/empty 분기.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Behavior Data Contract v0 smoke ===');

const TYPES = has('src/services/marketingBehaviorTypes.ts') ? read('src/services/marketingBehaviorTypes.ts') : '';
const DEMO = has('src/services/marketingBehaviorDemoData.ts') ? read('src/services/marketingBehaviorDemoData.ts') : '';
const INS = has('src/services/marketingBehaviorInsights.ts') ? read('src/services/marketingBehaviorInsights.ts') : '';
const MODAL = read('src/components/MarketingCustomerBehaviorModal.tsx');
const NEW_CODE = TYPES + '\n' + DEMO + '\n' + INS + '\n' + MODAL;

// 1~7. 타입/데모/빌더 존재
ok('1. marketingBehaviorTypes.ts 존재', has('src/services/marketingBehaviorTypes.ts'));
ok('2. MarketingBehaviorEvent 타입 존재', /export type MarketingBehaviorEvent\b/.test(TYPES));
ok('3. MarketingBehaviorInsights 타입 존재', /export type MarketingBehaviorInsights\b/.test(TYPES));
ok('4. marketingBehaviorDemoData.ts 존재', has('src/services/marketingBehaviorDemoData.ts'));
ok('5. demo data가 mode:demo + isDemo:true', /mode:\s*'demo'/.test(DEMO) && /isDemo:\s*true/.test(DEMO));
ok('6. marketingBehaviorInsights.ts 존재', has('src/services/marketingBehaviorInsights.ts'));
ok('7. buildMarketingBehaviorInsights 함수 존재', /export function buildMarketingBehaviorInsights\b/.test(INS));

// 8~14. 모달 연결 + 하드코딩 제거 + 렌더 경로
ok('8. 모달이 buildMarketingBehaviorInsights 사용', /buildMarketingBehaviorInsights\(/.test(MODAL));
ok('9. 모달이 수치/데이터 직접 하드코딩 안 함',
  !/DEMO_INFLOW|DEMO_PATHS|DEMO_CLICKS|DEMO_EXITS|DEMO_SUMMARY/.test(MODAL)
  && !/pct:\s*\d{2}/.test(MODAL)
  && !MODAL.includes('블로그') && !MODAL.includes('메인 배너 2번'));
ok('10. insights.acquisition.topSources 렌더 경로', /acquisition\b/.test(MODAL) && /topSources/.test(MODAL));
ok('11. insights.topPaths 렌더 경로', /topPaths/.test(MODAL));
ok('12. insights.topClicks 렌더 경로', /topClicks/.test(MODAL));
ok('13. insights.dropOffs 렌더 경로', /dropOffs/.test(MODAL));
ok('14. dataStatus.isDemo 기반 데모 배지', /dataStatus\.isDemo/.test(MODAL) && /DemoBadge/.test(MODAL));

// 15. PII 금지 문자열(신규 코드 4파일)
ok('15. 신규 코드에 PII 필드 문자열 없음',
  !/customerName|memberKey|rawSessionId|rawUserId|orderNo\b|\bphone\b|\bemail\b|\baddress\b|\bcontact\b/.test(NEW_CODE));

// 16. behavior route — 데이터 계약 단계엔 없었고, Endpoint v0에서 생성됨. 있으면 안전한 수집 엔드포인트여야.
const routeRel16 = 'api/marketing/behavior-events.ts';
ok('16. behavior route 없음 또는 안전한 수집 엔드포인트(POST·WRITE 아님)',
  !has(routeRel16) || (/'POST'/.test(read(routeRel16)) && !/godomall|writeOrder/i.test(read(routeRel16))));

// 17. WRITE 코드 없음(신규 코드)
ok('17. WRITE/네트워크 호출 없음', !/fetch\(|api\/order|writeOrder|method:\s*'(POST|PUT|DELETE)'/i.test(NEW_CODE));

// 18. GA4/GTM 실제 import/call 없음
ok('18. GA4/GTM 실제 연결(import/call) 없음', !/gtag\(|dataLayer|google-analytics|googletagmanager|@ga\/|import .*gtm/i.test(NEW_CODE));

// 19. CS/상품/운영 무변경(git) + 20. 문서
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const nonMarketing = codeChanged.filter((f) => !/Marketing|marketing|charts\//.test(f));
ok('19. src 변경 마케팅 한정(CS/Product/Operation·api 무변경)', nonMarketing.length === 0 && codeChanged.every((f) => !f.startsWith('api/')));
if (nonMarketing.length > 0) console.log('     변경된 비마케팅 파일:', nonMarketing.join(', '));
ok('20. docs/MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md 존재', has('docs/MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md'));

// ── 런타임: 빌더 실집계 증명(live) + demo/empty 분기 ──────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-behavior-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingBehaviorTypes.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorDemoData.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorInsights.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const B = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorInsights.js')).href);
  const D = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorDemoData.js')).href);

  // live 집계: raw 샘플 → 비어있지 않은 인사이트 + 퍼센트 계산
  const live = B.buildMarketingBehaviorInsights(D.demoMarketingBehaviorEvents, { mode: 'live', fallbackDemo: false });
  ok('21. 빌더 live 집계: 유입 채널 산출', live.acquisition.topSources.length > 0 && live.acquisition.topSources[0].sharePercent > 0);
  ok('22. 빌더 live 집계: 이동 경로 산출', live.topPaths.length > 0 && Array.isArray(live.topPaths[0].pathLabels) && live.topPaths[0].pathLabels.length >= 2);
  ok('23. 빌더 live 집계: 클릭 TOP(배너/카테고리/상품) 산출', live.topClicks.banners.length > 0 && live.topClicks.categories.length > 0 && live.topClicks.products.length > 0);
  ok('24. 빌더 live 집계: 이탈 지점 산출', live.dropOffs.length > 0 && live.dropOffs[0].dropOffPercent > 0);
  ok('25. live 인사이트 isDemo=false + eventCount>0', live.dataStatus.isDemo === false && live.dataStatus.eventCount > 0);

  // demo 분기: 승인된 정확값
  const demo = B.buildMarketingBehaviorInsights([], { mode: 'demo', fallbackDemo: true });
  ok('26. demo 분기: isDemo=true + 블로그 32% 정확값', demo.dataStatus.isDemo === true && demo.acquisition.topSources[0].label === '블로그' && demo.acquisition.topSources[0].sharePercent === 32);

  // empty/collecting 분기
  const empty = B.buildMarketingBehaviorInsights([], { fallbackDemo: false });
  ok('27. empty 분기: collecting + 빈 배열', empty.dataStatus.mode === 'collecting' && empty.dataStatus.isDemo === false && empty.acquisition.topSources.length === 0);
} catch (e) {
  ok('21~27. 빌더 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
