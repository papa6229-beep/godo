#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-collection-endpoint-v0.mjs
 * Marketing Behavior Collection Endpoint v0 검증.
 *  - POST /api/marketing/behavior-events: validate/PII reject/allowlist/batch limit/dev buffer.
 *  - DB·대시보드 wiring·고도몰 WRITE·GA4/GTM·광고 API 없음. GET buffer 노출 없음. CS/상품/운영 무변경.
 *  - 런타임: validator/store를 실제 호출해 위험 payload 차단·정상 수용을 증명.
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
console.log('=== Marketing Behavior Collection Endpoint v0 smoke ===');

const ROUTE_REL = 'api/marketing/behavior-events.ts';
const VAL_REL = 'api/_shared/marketingBehaviorCollectionValidator.ts';
const STORE_REL = 'api/_shared/marketingBehaviorEventStore.ts';
const DOC_REL = 'docs/MARKETING_BEHAVIOR_COLLECTION_ENDPOINT_V0.md';
const ROUTE = has(ROUTE_REL) ? read(ROUTE_REL) : '';
const VAL = has(VAL_REL) ? read(VAL_REL) : '';
const STORE = has(STORE_REL) ? read(STORE_REL) : '';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const NEW = ROUTE + '\n' + VAL + '\n' + STORE;

// 1~3. route
ok('1. route 파일 존재', has(ROUTE_REL));
ok('2. POST handler 존재', /export default (?:async )?function handler/.test(ROUTE) && /'POST'/.test(ROUTE));
ok('3. GET 허용 안 됨(405) + GET buffer dump 없음', /405/.test(ROUTE) && !/req\.method === 'GET'/.test(ROUTE));

// 4~8. validator allowlist/limit/forbidden
ok('4. validateMarketingBehaviorCollectionRequest 함수', /export function validateMarketingBehaviorCollectionRequest\b/.test(VAL));
const EVENTS = ['visit', 'landing', 'banner_click', 'category_click', 'product_view', 'search', 'add_to_cart', 'checkout_start', 'purchase', 'exit'];
ok('5. eventName allowlist 10종', EVENTS.every((e) => new RegExp(`'${e}'`).test(VAL)));
ok('6. source allowlist', ['blog', 'search', 'ad', 'sns', 'direct', 'referral', 'unknown'].every((s) => new RegExp(`'${s}'`).test(VAL)));
ok('7. batch size limit 50', /BEHAVIOR_MAX_EVENTS_PER_BATCH\s*=\s*50/.test(VAL));
ok('8. forbidden field list 적용', /BEHAVIOR_FORBIDDEN_FIELDS/.test(VAL) && /findForbiddenKey/.test(VAL));

// 9~18. forbidden fields
['name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId']
  .forEach((f, i) => ok(`${i + 9}. ${f} forbidden`, new RegExp(`'${f}'`).test(VAL)));

// 19~22. sanitize / response / store
ok('19. unknown field drop 정책', /ALLOWED_FIELDS\.has\(/.test(VAL) && /drop/i.test(VAL));
ok('20. accepted/rejected response shape', /accepted/.test(ROUTE) && /rejected/.test(ROUTE));
ok('21. dev buffer store 존재', has(STORE_REL) && /appendMarketingBehaviorEvents/.test(STORE));
ok('22. dev buffer max size 제한', /MAX_BUFFER_SIZE\s*=\s*\d+/.test(STORE));

// 23. GET buffer dump route 없음
// buffer 조회/통계 함수를 route가 import·호출하지 않음(GET dump 경로 부재). 주석의 'buffer' 단어는 무시.
ok('23. GET buffer dump 노출 없음', !ROUTE.includes('getMarketingBehaviorEventStoreStats') && !ROUTE.includes('clearMarketingBehaviorEventStoreForTest'));

// 24~28. 금지(전송/외부도구/광고/고도몰WRITE)
ok('24. fetch/sendBeacon/XMLHttpRequest 신규 수집코드 없음', !/fetch\s*\(|sendBeacon|XMLHttpRequest/.test(NEW));
ok('25. GA4/GTM import 없음', !/google-analytics|googletagmanager|@google\/|gtag\.js/i.test(NEW));
ok('26. dataLayer/gtag 호출 없음', !/dataLayer|gtag\s*\(/.test(NEW));
ok('27. 광고 API 연결 없음', !/ads?\.(google|facebook|meta|naver|tiktok)\.com|google_ads|metaAds/i.test(NEW));
ok('28. 고도몰 WRITE 코드 없음', !/godomall|writeOrder|api\/godomall|goodsRegist|memberModify/i.test(NEW));

// 29. CS/상품/운영 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const forbiddenArea = codeChanged.filter((f) => /[Cc]s|[Cc]ustomerService|ProductTeam|상품관리|[Oo]peration|운영|godomall\//.test(f) && !/Marketing|marketing|behavior/i.test(f));
ok('29. CS/상품관리/운영/고도몰 route 무변경', forbiddenArea.length === 0);
if (forbiddenArea.length > 0) console.log('     변경된 금지영역 파일:', forbiddenArea.join(', '));

// 30~35. 문서
ok('30. endpoint 문서 존재', has(DOC_REL));
ok('31. 문서에 DB 저장 없음 명시', /DB 저장/.test(DOC) && /없/.test(DOC));
ok('32. 문서에 live dashboard wiring 없음 명시', /대시보드 live/.test(DOC) && /없/.test(DOC));
ok('33. 문서에 dev buffer 비영속성 명시', /영속/.test(DOC) && /(보장 없|없음)/.test(DOC));
ok('34. 문서에 allowed origin 정책', /GODO_BEHAVIOR_ALLOWED_ORIGINS/.test(DOC) && /와일드카드/.test(DOC));
ok('35. 문서에 PII reject 정책', /PII/.test(DOC) && /(reject|금지|forbidden)/i.test(DOC));

// ── 런타임: validator/store 실제 동작 ─────────────────────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-endpoint-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'marketingBehaviorCollectionValidator.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorEventStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const V = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorCollectionValidator.js')).href);
  const S = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorEventStore.js')).href);

  const validEvent = { eventId: 'evt_1', sessionIdHash: 'proto_abc', eventName: 'banner_click', occurredAt: '2026-06-30T01:00:00.000Z', source: 'blog', pagePath: '/', bannerId: 'b2', bannerName: '여름 기획전 배너' };

  const okRes = V.validateMarketingBehaviorCollectionRequest({ events: [validEvent], client: { schemaVersion: 0, shopId: 'demo' } });
  ok('36. valid event → accepted 1 / rejected 0 / ok', okRes.ok === true && okRes.acceptedEvents.length === 1 && okRes.rejected.length === 0);

  const badName = V.validateMarketingBehaviorCollectionRequest({ events: [{ ...validEvent, eventName: 'super_click' }] });
  ok('37. invalid eventName → rejected', badName.ok === false && badName.rejected[0]?.reason === 'Invalid eventName');

  const piiKey = V.validateMarketingBehaviorCollectionRequest({ events: [{ ...validEvent, email: 'a@b.com' }] });
  ok('38. forbidden field(email) → rejected', piiKey.rejected.length === 1 && /Forbidden field/.test(piiKey.rejected[0].reason));

  const piiValue = V.validateMarketingBehaviorCollectionRequest({ events: [{ ...validEvent, pageTitle: '문의 a@b.com' }] });
  ok('39. email-like value → rejected', piiValue.rejected.length === 1 && /Email-like/.test(piiValue.rejected[0].reason));

  const unknownField = V.validateMarketingBehaviorCollectionRequest({ events: [{ ...validEvent, randomHarmless: 'x' }] });
  ok('40. unknown harmless field → drop(저장 안 됨)', unknownField.acceptedEvents.length === 1 && !('randomHarmless' in unknownField.acceptedEvents[0]));

  const tooMany = V.validateMarketingBehaviorCollectionRequest({ events: Array.from({ length: 51 }, () => ({ ...validEvent })) });
  ok('41. batch 51개 → reject(too many)', tooMany.ok === false && tooMany.errors.some((e) => /Too many/.test(e)));

  // store
  S.clearMarketingBehaviorEventStoreForTest();
  const n = S.appendMarketingBehaviorEvents(okRes.acceptedEvents);
  const stats = S.getMarketingBehaviorEventStoreStats();
  ok('42. store append + stats(비영속·max)', n === 1 && stats.count === 1 && stats.persistent === false && stats.max === 1000);
  S.clearMarketingBehaviorEventStoreForTest();
  ok('43. store clear(test helper)', S.getMarketingBehaviorEventStoreStats().count === 0);

  // origin
  ok('44. origin: localhost 허용 / 미지 https reject / 헤더없음 허용',
    V.isBehaviorOriginAllowed('http://localhost:5173') === true
    && V.isBehaviorOriginAllowed('https://evil.example.com') === false
    && V.isBehaviorOriginAllowed(undefined) === true);
} catch (e) {
  ok('36~44. validator/store 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
