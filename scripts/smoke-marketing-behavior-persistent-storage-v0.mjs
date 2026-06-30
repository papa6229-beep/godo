#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-persistent-storage-v0.mjs
 * Marketing Behavior Persistent Storage v0 검증.
 *  - storage 인터페이스(dev_buffer/persistent/pending) + endpoint 연결 + dev buffer fallback 유지.
 *  - fake persistence/local file 없음, PII/IP/userAgent 저장 없음, dashboard wiring·GET 조회 없음.
 *  - 런타임: getStats/appendEvents 동작, env 감지 시 pending(손실 없음), 관련 smoke 무회귀.
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
console.log('=== Marketing Behavior Persistent Storage v0 smoke ===');

const STYPES_REL = 'api/_shared/marketingBehaviorStorageTypes.ts';
const PSTORE_REL = 'api/_shared/marketingBehaviorPersistentStore.ts';
const STYPES = has(STYPES_REL) ? read(STYPES_REL) : '';
const PSTORE = has(PSTORE_REL) ? read(PSTORE_REL) : '';
const ESTORE = read('api/_shared/marketingBehaviorEventStore.ts');
const ROUTE = read('api/marketing/behavior-events.ts');
const DOC_REL = 'docs/MARKETING_BEHAVIOR_PERSISTENT_STORAGE_V0.md';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const STORAGE_CODE = STYPES + '\n' + PSTORE;

// 1~11. 타입/adapter/mode
ok('1. storageTypes 파일 존재', has(STYPES_REL));
ok('2. MarketingBehaviorStorage 타입', /export interface MarketingBehaviorStorage\b/.test(STYPES));
ok('3. MarketingBehaviorStorageMode 타입', /export type MarketingBehaviorStorageMode\b/.test(STYPES));
ok('4. MarketingBehaviorStoredEvent 타입', /export type MarketingBehaviorStoredEvent\b/.test(STYPES));
ok('5. persistentStore 파일 존재', has(PSTORE_REL));
ok('6. getMarketingBehaviorStorage 함수', /export function getMarketingBehaviorStorage\b/.test(PSTORE));
ok('7. appendEvents interface', /appendEvents/.test(STYPES) && /appendEvents/.test(PSTORE));
ok('8. getStats interface', /getStats/.test(STYPES) && /getStats/.test(PSTORE));
ok('9. dev_buffer mode', /'dev_buffer'/.test(STORAGE_CODE));
ok('10. persistent mode', /'persistent'/.test(STORAGE_CODE));
ok('11. pending mode', /'pending'/.test(STORAGE_CODE));

// 12~16. endpoint 연결 / dev buffer 유지 / GET 노출 없음
ok('12. endpoint가 getMarketingBehaviorStorage 사용', /getMarketingBehaviorStorage\(/.test(ROUTE));
ok('13. endpoint response에 storage/persistentReady', /storage/.test(ROUTE) && /persistentReady/.test(ROUTE));
ok('14. dev buffer fallback 유지(append 사용)', /appendMarketingBehaviorEvents/.test(PSTORE) && /getMarketingBehaviorEventStoreStats/.test(PSTORE));
ok('15. dev buffer max 1000 FIFO 유지', /MAX_BUFFER_SIZE\s*=\s*1000/.test(ESTORE) && /slice\(/.test(ESTORE));
ok('16. GET buffer dump route 없음', !ROUTE.includes('getMarketingBehaviorEventStoreStats') && !/req\.method === 'GET'/.test(ROUTE));

// 17~26. PII forbidden — 저장 안 함(문서 명시 + 저장 타입에 미존재)
['name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId']
  .forEach((f, i) => ok(`${i + 17}. ${f} 저장 금지(문서 명시)`, DOC.includes(f)));

// 27~29. IP/userAgent/local file 저장 없음(코드)
ok('27. IP address 저장 필드 없음', !/ipAddress|ip_address|\bipAddr\b/i.test(STORAGE_CODE));
ok('28. raw userAgent 저장 필드 없음', !/userAgent|user_agent/i.test(STORAGE_CODE));
ok('29. local JSON/file persistence 없음', !/writeFileSync|readFileSync|node:fs|require\('fs'|fs\.promises|localStorage/.test(STORAGE_CODE));

// 30~31. git 무변경
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const dashboardWiring = codeChanged.filter((f) => /MarketingAnalysisDashboard|MarketingCustomerBehaviorModal/.test(f));
ok('30. 대시보드 live wiring 파일 무변경', dashboardWiring.length === 0);
const forbiddenArea = codeChanged.filter((f) => /[Cc]ustomerService|ProductTeam|상품관리|[Oo]perationLog|운영|godomall\//.test(f) && !/[Bb]ehavior/.test(f));
ok('31. CS/상품관리/운영/고도몰 route 무변경', forbiddenArea.length === 0);

// 32~37. docs
ok('32. persistent storage 문서 존재', has(DOC_REL));
ok('33. dev buffer 비영속성 명시', /비영속/.test(DOC) && /(소실|영속)/.test(DOC));
ok('34. persistentReady 설명', /persistentReady/.test(DOC));
ok('35. 저장하지 않는 데이터 명시', /저장하지 않는/.test(DOC));
ok('36. dashboard live wiring 없음 명시', /(대시보드 live|dashboard live)/.test(DOC) && /없/.test(DOC));
ok('37. GET events 조회 API 없음 명시', /GET events/.test(DOC) && /없/.test(DOC));

// ── 런타임: storage 동작 + pending 전환 ──────────────────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-pstore-'));
const savedKvUrl = process.env.KV_REST_API_URL;
const savedKvTok = process.env.KV_REST_API_TOKEN;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'marketingBehaviorCollectionValidator.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorEventStore.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorStorageTypes.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorPersistentStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const P = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorPersistentStore.js')).href);

  const validEvent = { eventId: 'evt_1', sessionIdHash: 'proto_x', eventName: 'banner_click', occurredAt: '2026-06-30T01:00:00.000Z', bannerName: '여름 기획전 배너' };

  // env 없음 → dev_buffer
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  P.resetMarketingBehaviorStorageForTest();
  const st = P.getMarketingBehaviorStorage();
  const stats = await st.getStats();
  ok('38. getStats(): mode 반환 + persistentReady false(env 없음)', stats.mode === 'dev_buffer' && stats.persistentReady === false);
  const ap = await st.appendEvents([validEvent], { shopId: 'demo', schemaVersion: 0 });
  ok('39. appendEvents(valid) → ok true / dev_buffer / accepted 1', ap.ok === true && ap.mode === 'dev_buffer' && ap.accepted === 1);
  ok('40. 저장소 env 없음 → persistentReady false (fake persistence 아님)', (await st.getStats()).persistentReady === false);

  // env 감지(키 존재) → pending(손실 없이 보존 + 신호)
  process.env.KV_REST_API_URL = 'https://example-kv'; process.env.KV_REST_API_TOKEN = 'tok';
  P.resetMarketingBehaviorStorageForTest();
  const st2 = P.getMarketingBehaviorStorage();
  const stats2 = await st2.getStats();
  const ap2 = await st2.appendEvents([validEvent]);
  ok('41. env 감지 → pending + persistentReady false + 이벤트 손실 없음', stats2.mode === 'pending' && stats2.persistentReady === false && ap2.ok === true && ap2.accepted === 1 && !!stats2.note);
} catch (e) {
  ok('38~41. storage 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = savedKvUrl;
  if (savedKvTok === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = savedKvTok;
  rmSync(tmp, { recursive: true, force: true });
}

// 42~43. 관련 smoke 무회귀
const relatedOk = (script) => { try { execFileSync(process.execPath, [`scripts/${script}`], { cwd: REPO, stdio: 'pipe' }); return true; } catch { return false; } };
ok('42. collection endpoint smoke 통과', relatedOk('smoke-marketing-behavior-collection-endpoint-v0.mjs'));
ok('43. send adapter smoke 통과', relatedOk('smoke-marketing-behavior-tracker-send-adapter-v0.mjs'));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
