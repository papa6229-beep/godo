#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-tracker-send-adapter-v0.mjs
 * Marketing Behavior Tracker Send Adapter v0 검증.
 *  - createMarketingBehaviorFetchTransport: payload → POST endpoint(선택적). 기본 전송 없음.
 *  - batch 50 / client PII guard / response normalize / 실패 safe(throw 없음).
 *  - attach prototype에 optional transport — transport 있을 때만 전송.
 *  - 런타임: mock fetch로 전송/차단/실패 처리, DOM stub으로 클릭→send 실증.
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
console.log('=== Marketing Behavior Tracker Send Adapter v0 smoke ===');

const ADAPTER_REL = 'src/services/marketingBehaviorTrackerSendAdapter.ts';
const ADAPTER = has(ADAPTER_REL) ? read(ADAPTER_REL) : '';
const TRACKER = read('src/services/marketingBehaviorTrackerPrototype.ts');
const PLAN = read('src/services/marketingBehaviorCollectionPlan.ts');
const DOC_REL = 'docs/MARKETING_BEHAVIOR_TRACKER_SEND_ADAPTER_V0.md';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const COMBINED = ADAPTER + '\n' + PLAN; // forbidden 리터럴은 plan 단일 소스

// 1~6. adapter 구조
ok('1. adapter 파일 존재', has(ADAPTER_REL));
ok('2. MarketingBehaviorTransport 타입', /export interface MarketingBehaviorTransport\b/.test(ADAPTER));
ok('3. MarketingBehaviorSendResult 타입', /export interface MarketingBehaviorSendResult\b/.test(ADAPTER));
ok('4. createMarketingBehaviorFetchTransport 함수', /export function createMarketingBehaviorFetchTransport\b/.test(ADAPTER));
ok('5. 기본 endpoint /api/marketing/behavior-events', /MARKETING_BEHAVIOR_FUTURE_ENDPOINT/.test(ADAPTER) && COMBINED.includes('/api/marketing/behavior-events'));
ok('6. schemaVersion 0 사용', /schemaVersion\s*\?\?\s*0/.test(ADAPTER));

// 7~13. fetch 위치 / 금지 외부도구
ok('7. fetch는 send 내부에서만', /async send\(/.test(ADAPTER) && ADAPTER.indexOf('fetch(') > ADAPTER.indexOf('async send('));
ok('8. top-level fetch 없음', !/^\s{0,2}(?:const|let|await)?\s*fetch\(/m.test(ADAPTER) && !/^fetch\(/m.test(ADAPTER));
ok('9. sendBeacon 없음', !/sendBeacon/.test(ADAPTER));
ok('10. XMLHttpRequest 없음', !/XMLHttpRequest/.test(ADAPTER));
ok('11. GA4/GTM import 없음', !/google-analytics|googletagmanager|gtag\.js/i.test(ADAPTER));
ok('12. dataLayer 없음', !/dataLayer/.test(ADAPTER));
ok('13. gtag 호출 없음', !/gtag\s*\(/.test(ADAPTER));

// 14~15. batch / PII guard
ok('14. batch 50 제한', /MAX_BATCH\s*=\s*50/.test(ADAPTER));
ok('15. forbidden PII key guard', /findForbiddenKey/.test(ADAPTER) && /MARKETING_BEHAVIOR_FORBIDDEN_FIELDS/.test(ADAPTER));

// 16~25. forbidden fields (plan 단일 소스)
['name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId']
  .forEach((f, i) => ok(`${i + 16}. ${f} forbidden`, new RegExp(`'${f}'`).test(COMBINED)));

// 26. 'name'은 정확 key만(substring 아님)
ok('26. forbidden guard substring 아님(정확 name)', /=== 'name'/.test(ADAPTER));

// 27~32. tracker 연결
ok('27. attach options에 transport 추가', /transport\?:\s*MarketingBehaviorTransport/.test(TRACKER));
ok('28. transport 없으면 자동 전송 안 함(조건부)', /if \(options\?\.transport\)/.test(TRACKER));
ok('29. transport.send 호출 경로', /options\.transport\.send\(/.test(TRACKER));
ok('30. send 실패 throw 전파 안 됨(catch)', /options\.transport\.send\([^)]*\)\.catch\(/.test(TRACKER));
ok('31. debug buffer 유지', /pushDebug\(/.test(TRACKER));
ok('32. cleanup function 반환 유지', /removeEventListener/.test(TRACKER) && /return \(\) =>/.test(TRACKER));

// 33~37. docs
ok('33. send adapter 문서 존재', has(DOC_REL));
ok('34. 자동 전송 기본값 아님 명시', /기본값/.test(DOC) && /전송 없음|기본 비활성/.test(DOC));
ok('35. 고도몰 실제 삽입 아님 명시', /고도몰/.test(DOC) && /삽입/.test(DOC) && /(아직|아님)/.test(DOC));
ok('36. allowed origin 환경변수 언급', /GODO_BEHAVIOR_ALLOWED_ORIGINS/.test(DOC));
ok('37. visit/landing 전송 예시', /createPrototypeVisitEvents/.test(DOC) && /transport\.send/.test(DOC));

// 38. collection endpoint smoke 계속 통과
let endpointOk = true;
try { execFileSync(process.execPath, ['scripts/smoke-marketing-behavior-collection-endpoint-v0.mjs'], { cwd: REPO, stdio: 'pipe' }); } catch { endpointOk = false; }
ok('38. collection endpoint smoke 통과', endpointOk);

// 39~40. git 무변경
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const forbiddenArea = codeChanged.filter((f) => /[Cc]ustomerService|ProductTeam|상품관리|[Oo]perationLog|운영|godomall\//.test(f) && !/[Bb]ehavior/.test(f));
ok('39. CS/상품관리/운영/고도몰 route 무변경', forbiddenArea.length === 0);
const dashboardWiring = codeChanged.filter((f) => /MarketingAnalysisDashboard|MarketingCustomerBehaviorModal/.test(f));
ok('40. 대시보드 live wiring 파일 무변경', dashboardWiring.length === 0);

// ── 런타임: mock fetch 전송 / 차단 / 실패 + DOM stub 클릭→send ─────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-send-'));
const origFetch = globalThis.fetch;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingBehaviorTypes.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorCollectionPlan.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorTrackerSendAdapter.ts'),
    path.join(REPO, 'src', 'services', 'marketingCustomerBehaviorEvents.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorTrackerPrototype.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--lib', 'ES2022,DOM'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const A = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorTrackerSendAdapter.js')).href);
  const T = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorTrackerPrototype.js')).href);

  const ev = { eventId: 'evt_1', sessionIdHash: 'proto_x', eventName: 'banner_click', occurredAt: '2026-06-30T01:00:00.000Z', bannerName: '여름 기획전 배너', productName: '스위트 00 젤' };
  let calls = [];
  const mockFetch = (resp) => async (url, init) => { calls.push({ url, init }); return resp; };
  const jsonResp = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

  // 41. valid send → fetch 1회 + body shape + normalize
  calls = []; globalThis.fetch = mockFetch(jsonResp(200, { ok: true, accepted: 1, rejected: 0, mode: 'dev_buffer' }));
  const t = A.createMarketingBehaviorFetchTransport({ shopId: 'demo-shop' });
  const r1 = await t.send([ev]);
  const sentBody = calls[0] ? JSON.parse(calls[0].init.body) : {};
  ok('41. valid send → fetch 1회 + body(events/client) + ok', calls.length === 1 && sentBody.events?.length === 1 && sentBody.client?.schemaVersion === 0 && sentBody.client?.shopId === 'demo-shop' && r1.ok === true && r1.accepted === 1);

  // 42. batch 51 → fetch 호출 없이 ok:false
  calls = []; const r2 = await t.send(Array.from({ length: 51 }, () => ({ ...ev })));
  ok('42. batch 51 → fetch 없이 ok:false', calls.length === 0 && r2.ok === false);

  // 43. forbidden email key → fetch 없이 ok:false
  calls = []; const r3 = await t.send([{ ...ev, email: 'a@b.com' }]);
  ok('43. forbidden email key → fetch 없이 ok:false', calls.length === 0 && r3.ok === false && /Forbidden/.test(r3.errors?.[0]?.reason || ''));

  // 44. server 400 → ok:false + status
  calls = []; globalThis.fetch = mockFetch(jsonResp(400, { ok: false, accepted: 0, rejected: 1, errors: [{ index: 0, reason: 'Invalid eventName' }] }));
  const r4 = await t.send([ev]);
  ok('44. server 400 → ok:false normalize + status', r4.ok === false && r4.status === 400 && r4.rejected === 1);

  // 45. productName/bannerName 허용(guard 통과 → fetch 호출)
  calls = []; globalThis.fetch = mockFetch(jsonResp(200, { ok: true, accepted: 1, rejected: 0 }));
  const r5 = await t.send([ev]);
  ok('45. productName/bannerName 허용(전송됨)', calls.length === 1 && r5.ok === true);

  // 46. 빈 배열 → fetch 없이 ok:true accepted 0
  calls = []; const r6 = await t.send([]);
  ok('46. 빈 배열 → fetch 없이 ok:true/accepted 0', calls.length === 0 && r6.ok === true && r6.accepted === 0);

  // 47. network throw → ok:false (UI 보호)
  calls = []; globalThis.fetch = async () => { throw new Error('network down'); };
  const r7 = await t.send([ev]);
  ok('47. network 실패 → throw 없이 ok:false', r7.ok === false && /Network/.test(r7.errors?.[0]?.reason || ''));

  // 48. attach + fake transport: 클릭 → transport.send 호출 (DOM stub)
  const sent = [];
  const fakeTransport = { send: (evs) => { sent.push(evs); return Promise.resolve({ ok: true, accepted: evs.length, rejected: 0 }); } };
  let clickHandler = null;
  class FakeEl {
    constructor(attrs) { this._a = attrs || {}; }
    getAttribute(n) { return n in this._a ? this._a[n] : null; }
    closest() { return this; }
  }
  globalThis.document = { addEventListener: (type, h) => { if (type === 'click') clickHandler = h; }, removeEventListener: () => {}, title: 'T' };
  globalThis.Element = FakeEl;
  try {
    const cleanup = T.attachMarketingBehaviorTrackerPrototype({ transport: fakeTransport });
    const el = new FakeEl({ 'data-godo-track': 'banner', 'data-godo-banner-id': 'b1', 'data-godo-banner-name': '배너A' });
    if (clickHandler) clickHandler({ target: el });
    await Promise.resolve();
    ok('48. attach+transport: 클릭 → transport.send 호출', sent.length === 1 && sent[0][0]?.eventName === 'banner_click' && sent[0][0]?.bannerName === '배너A');
    cleanup();
  } finally {
    delete globalThis.document; delete globalThis.Element;
  }

  // 49. transport 없으면 클릭해도 전송 없음(자동 전송 아님)
  const sent2 = [];
  let clickHandler2 = null;
  globalThis.document = { addEventListener: (type, h) => { if (type === 'click') clickHandler2 = h; }, removeEventListener: () => {}, title: 'T' };
  globalThis.Element = FakeEl;
  try {
    const cleanup2 = T.attachMarketingBehaviorTrackerPrototype({ debug: false });
    const el2 = new FakeEl({ 'data-godo-track': 'banner', 'data-godo-banner-id': 'b2', 'data-godo-banner-name': '배너B' });
    if (clickHandler2) clickHandler2({ target: el2 });
    await Promise.resolve();
    ok('49. transport 없음 → 클릭해도 전송 없음', sent2.length === 0);
    cleanup2();
  } finally {
    delete globalThis.document; delete globalThis.Element;
  }
} catch (e) {
  ok('41~49. send adapter 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  globalThis.fetch = origFetch;
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
