#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-summary-live-wiring-v0.mjs
 * Marketing Behavior Summary API & Live Modal Wiring v0 검증.
 *  - GET /api/marketing/behavior-summary: 집계 insights만(raw event 미노출). demo fallback은 client.
 *  - modal live/demo/pending/error 상태 + demo data 유지. raw GET/식별자 노출 없음.
 *  - 런타임: dev buffer append → summary hasLiveData true / 빈 상태 false / 출력 식별자 부재.
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
console.log('=== Marketing Behavior Summary & Live Wiring v0 smoke ===');

const ROUTE_REL = 'api/marketing/behavior-summary.ts';
const SERVICE_REL = 'api/_shared/marketingBehaviorSummaryService.ts';
const HOOK_REL = 'src/hooks/useMarketingBehaviorSummary.ts';
const DOC_REL = 'docs/MARKETING_BEHAVIOR_SUMMARY_LIVE_WIRING_V0.md';
const ROUTE = has(ROUTE_REL) ? read(ROUTE_REL) : '';
const SERVICE = has(SERVICE_REL) ? read(SERVICE_REL) : '';
const STORE = read('api/_shared/marketingBehaviorEventStore.ts');
const POST_ROUTE = read('api/marketing/behavior-events.ts');
const HOOK = has(HOOK_REL) ? read(HOOK_REL) : '';
const MODAL = read('src/components/MarketingCustomerBehaviorModal.tsx');
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const NEW = SERVICE + '\n' + ROUTE + '\n' + HOOK;

// 1~9. summary API
ok('1. summary route 파일 존재', has(ROUTE_REL));
ok('2. GET handler 존재', /export default async function handler/.test(ROUTE) && /'GET'/.test(ROUTE));
ok('3. POST 405 처리', /405/.test(ROUTE) && /method !== 'GET'/.test(ROUTE));
ok('4. GET /api/marketing/behavior-events 미생성(POST 전용 유지)', /method !== 'POST'/.test(POST_ROUTE) && !/method === 'GET'/.test(POST_ROUTE));
const respIface = (SERVICE.match(/export interface MarketingBehaviorSummaryApiResponse \{([\s\S]*?)\n\}/) || [, ''])[1];
ok('5. summary 응답 타입에 raw events 배열 없음', /MarketingBehaviorSummaryApiResponse/.test(SERVICE) && respIface.length > 0 && !/\bevents\b/.test(respIface));
ok('6. response hasLiveData', /hasLiveData/.test(SERVICE));
ok('7. response insights | null 정책', /insights:\s*SummaryInsights\s*\|\s*null/.test(SERVICE));
ok('8. response storage.mode', /storage:\s*\{\s*mode/.test(SERVICE));
ok('9. response persistentReady', /persistentReady/.test(SERVICE));

// 10~14. summary service + internal helper
ok('10. summaryService 파일 존재', has(SERVICE_REL));
ok('11. aggregate(equivalent) 사용', /aggregateSafeEvents/.test(SERVICE) && /topSources/.test(SERVICE) && /topPaths/.test(SERVICE) && /dropOffs/.test(SERVICE));
ok('12. convert(equivalent) — SummaryInsights 생성', /SummaryInsights/.test(SERVICE) && /summaryCards/.test(SERVICE));
ok('13. internal recent events helper 존재', /getRecentMarketingBehaviorEventsForSummary/.test(STORE) && /getRecentEventsForAggregation/.test(SERVICE));
ok('14. internal helper route 노출 없음', !ROUTE.includes('getRecentMarketingBehaviorEventsForSummary') && !POST_ROUTE.includes('getRecentMarketingBehaviorEventsForSummary'));

// 15~16. PII (런타임에서 재확인)
ok('15. raw event id 필드 직접 응답 안 함(service)', !/eventId:\s*events|return.*sessionIdHash/.test(SERVICE));
ok('16. response/insights 타입에 PII 필드 없음', !/customerName|memberKey|rawSessionId|rawUserId|orderNo\b|\bphone\b|\bemail\b/.test(SERVICE));

// 17~20. hook
ok('17. hook 파일 존재', has(HOOK_REL));
ok('18. hook이 /api/marketing/behavior-summary 호출', HOOK.includes('/api/marketing/behavior-summary'));
ok('19. hook이 /api/marketing/behavior-events 호출 안 함', !HOOK.includes('/api/marketing/behavior-events'));
ok('20. hook AbortController cleanup', /AbortController/.test(HOOK) && /\.abort\(\)/.test(HOOK));

// 21~28. modal
ok('21. 모달이 hook 사용', /useMarketingBehaviorSummary/.test(MODAL));
ok('22. live 배지/실제 수집 데이터 문구', /실제 수집 데이터/.test(MODAL));
ok('23. demo fallback 문구', /데모 예시/.test(MODAL));
ok('24. error fallback 문구', /불러오지 못/.test(MODAL));
ok('25. pending/collecting 안내', /저장소 연결 준비/.test(MODAL));
ok('26. demo data 제거되지 않음', /demoMarketingBehaviorEvents/.test(MODAL) && /buildMarketingBehaviorInsights/.test(MODAL));
ok('27. sessionIdHash/orderIdHash/eventId 표시 없음', !/sessionIdHash|orderIdHash|eventId/.test(MODAL));
ok('28. raw event table UI 없음', !/raw.?event|이벤트 목록|event table/i.test(MODAL));

// 29~35. 금지(전송/외부도구/WRITE)
ok('29. GET buffer dump route 없음', !/getMarketingBehaviorEventStoreStats|buffer.*dump/i.test(ROUTE) && !ROUTE.includes('events:'));
ok('30. DB/KV adapter 구현 없음', !/@vercel\/kv|createClient|new Pool|redis\.|pg\.connect/i.test(NEW));
ok('31. 고도몰 스킨 삽입 코드 없음', !/godomall.*script|skin.*inject/i.test(NEW));
ok('32. GA4/GTM 연결 없음', !/google-analytics|googletagmanager|gtag\.js/i.test(NEW));
ok('33. dataLayer/gtag 호출 없음', !/dataLayer|gtag\s*\(/.test(NEW));
ok('34. 광고 API 연결 없음', !/ads?\.(google|facebook|meta|naver)\.com|google_ads/i.test(NEW));
ok('35. 고도몰 WRITE 코드 없음', !/godomall|writeOrder|goodsRegist|memberModify/i.test(NEW));

// 36. CS/상품/운영 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const forbiddenArea = codeChanged.filter((f) => /[Cc]ustomerService|ProductTeam|상품관리|[Oo]perationLog|운영|godomall\//.test(f) && !/[Bb]ehavior/.test(f));
ok('36. CS/상품관리/운영/고도몰 route 무변경', forbiddenArea.length === 0);

// 37~40. docs
ok('37. summary 문서 존재', has(DOC_REL));
ok('38. raw event 미노출 명시', /raw event/.test(DOC) && /(미노출|반환하지 않)/.test(DOC));
ok('39. dev_buffer 비영속 한계 명시', /비영속/.test(DOC) && /(한계|serverless|구조 검증)/.test(DOC));
ok('40. demo fallback 정책 명시', /demo fallback/i.test(DOC) || (/데모/.test(DOC) && /fallback/i.test(DOC)));

// ── 런타임: summary service 동작 + 출력 식별자 부재 ──────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-summary-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'marketingBehaviorCollectionValidator.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorEventStore.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorStorageTypes.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorPersistentStore.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorSummaryService.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const SV = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorSummaryService.js')).href);
  const ES = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorEventStore.js')).href);
  const PS = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorPersistentStore.js')).href);

  PS.resetMarketingBehaviorStorageForTest();
  ES.clearMarketingBehaviorEventStoreForTest();

  // 빈 상태
  const empty = await SV.buildMarketingBehaviorSummaryResponse();
  ok('42. 이벤트 없음 → hasLiveData false / insights null', empty.hasLiveData === false && empty.insights === null && empty.dataStatus.isEmpty === true);

  // 샘플 append → live
  const ev = (sid, hh, name, extra) => ({ eventId: `e_${sid}_${hh}`, sessionIdHash: `s_${sid}`, occurredAt: `2026-06-29T${String(hh).padStart(2, '0')}:00:00.000Z`, eventName: name, ...extra });
  ES.appendMarketingBehaviorEvents([
    ev('A', 9, 'visit', { source: 'blog' }), ev('A', 10, 'banner_click', { bannerName: '여름 기획전 배너' }), ev('A', 11, 'product_view', { productName: '스위트 00 젤' }),
    ev('B', 9, 'visit', { source: 'search' }), ev('B', 10, 'category_click', { categoryName: '신상품' }), ev('B', 11, 'exit', { pageTitle: '메인페이지' })
  ]);
  const live = await SV.buildMarketingBehaviorSummaryResponse();
  ok('41. append 후 → hasLiveData true / insights 존재 / eventCount>0', live.hasLiveData === true && live.insights != null && live.dataStatus.eventCount > 0 && live.dataStatus.sessionCount === 2);
  ok('43. live insights.acquisition.topSources 계산', Array.isArray(live.insights.acquisition.topSources) && live.insights.acquisition.topSources.length >= 2);
  ok('44. live insights.topPaths 계산', Array.isArray(live.insights.topPaths) && live.insights.topPaths.length >= 1);

  const blob = JSON.stringify(live);
  ok('45. 응답 stringify에 sessionIdHash/orderIdHash/eventId 없음', !blob.includes('sessionIdHash') && !blob.includes('orderIdHash') && !blob.includes('eventId') && !blob.includes('s_A') && !blob.includes('"events"'));

  ES.clearMarketingBehaviorEventStoreForTest();
  PS.resetMarketingBehaviorStorageForTest();
} catch (e) {
  ok('41~45. summary 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
