#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-postgres-adapter-v0.mjs
 * Marketing Behavior Persistent Backend Adapter v0 (Postgres) 검증.
 *  - env-gated Postgres adapter / dev_buffer fallback / no fake persistence / no raw leak.
 *  - 저장 금지: IP/userAgent/name/email/phone/address/orderNo/memberKey/raw계열/searchTerm.
 *  - 자동 DDL 기본 금지. 런타임: env 없음 dev_buffer / full env postgres getStats(미연결) / table sanitize.
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
console.log('=== Marketing Behavior Postgres Adapter v0 smoke ===');

const PG_REL = 'api/_shared/marketingBehaviorPostgresStore.ts';
const PG = has(PG_REL) ? read(PG_REL) : '';
const PS = read('api/_shared/marketingBehaviorPersistentStore.ts');
const EVENTS_ROUTE = read('api/marketing/behavior-events.ts');
const SUMMARY_SVC = read('api/_shared/marketingBehaviorSummaryService.ts');
const SUMMARY_ROUTE = read('api/marketing/behavior-summary.ts');
const ADAPTER_DOC = has('docs/MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md') ? read('docs/MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md') : '';
const SCHEMA_DOC = has('docs/MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md') ? read('docs/MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md') : '';
const PKG = JSON.parse(read('package.json'));
const NEW = PG + '\n' + PS + '\n' + EVENTS_ROUTE + '\n' + SUMMARY_SVC;
// PG에서 실제 저장 컬럼/매핑 영역(주석의 "저장 금지" 나열 제외) — INSERT_COLUMNS + mapEventToPostgresRow.
const PG_COLS = (PG.match(/const INSERT_COLUMNS[\s\S]*?\];/) || [''])[0] + (PG.match(/export function mapEventToPostgresRow[\s\S]*?\n\}/) || [''])[0];

// 1~12. adapter
ok('1. postgres store 파일 존재', has(PG_REL));
ok('2. createPostgresMarketingBehaviorStorage 함수', /export function createPostgresMarketingBehaviorStorage\b/.test(PG));
ok('3. isPostgresMarketingBehaviorStorageConfigured 함수', /export function isPostgresMarketingBehaviorStorageConfigured\b/.test(PG));
ok('4. pg 의존성', !!(PKG.dependencies && PKG.dependencies.pg));
ok('5. GODO_BEHAVIOR_STORAGE_BACKEND env 사용', /GODO_BEHAVIOR_STORAGE_BACKEND/.test(PG));
ok('6. DATABASE_URL/POSTGRES_URL env 사용', /DATABASE_URL/.test(PG) && /POSTGRES_URL/.test(PG));
ok('7. GODO_BEHAVIOR_POSTGRES_TABLE 또는 기본 table', /GODO_BEHAVIOR_POSTGRES_TABLE/.test(PG) && /marketing_behavior_events/.test(PG));
ok('8. table name sanitize 정책', /\[A-Za-z0-9_\]\+/.test(PG));
ok('9. appendEvents 구현', /appendEvents\(/.test(PG) && /INSERT INTO/.test(PG));
ok('10. getRecentEventsForAggregation 구현', /getRecentEventsForAggregation\(/.test(PG) && /SELECT/.test(PG));
ok('11. getStats 구현', /getStats\(/.test(PG) && /persistentReady/.test(PG));
ok('12. ON CONFLICT DO NOTHING(중복 방지)', /ON CONFLICT[\s\S]*DO NOTHING/.test(PG));
ok('13. UNIQUE(shop_id, event_id) schema 문서', /UNIQUE\s*\(\s*shop_id\s*,\s*event_id\s*\)/.test(SCHEMA_DOC));

// 14~20. 저장 금지 필드(실제 컬럼/매핑 영역 기준)
ok('14. raw IP 저장 필드 없음', !/ip_address|ipAddress|\bip\b/i.test(PG_COLS));
ok('15. raw userAgent 저장 필드 없음', !/user_agent|userAgent/i.test(PG_COLS));
ok('16. name/email/phone/address 저장 필드 없음', !/\b(email|phone|address|customer_name|customerName)\b/i.test(PG_COLS) && !/'name'/.test(PG_COLS));
ok('17. orderNo 저장 필드 없음', !/order_no|orderNo/i.test(PG_COLS));
ok('18. memberKey 저장 필드 없음', !/member_key|memberKey/i.test(PG_COLS));
ok('19. rawSessionId/rawUserId 저장 필드 없음', !/raw_session|raw_user|rawSessionId|rawUserId/i.test(PG_COLS));
ok('20. searchTerm persistent 제외(보수)', !/search_term/.test(PG_COLS) && /searchTerm/.test(PG) && /(미저장|제외)/.test(PG));

// 21~23. 선택 로직/ fallback
ok('21. persistentStore가 postgres adapter 선택 가능', /createPostgresMarketingBehaviorStorage/.test(PS) && /isPostgresMarketingBehaviorStorageConfigured/.test(PS));
ok('22. env 없을 때 dev_buffer fallback 유지', /createDevBufferMarketingBehaviorStorage/.test(PS));
ok('23. env 없을 때 persistentReady false', /mode: 'dev_buffer'[\s\S]*persistentReady: false/.test(PS));

// 24~29. raw leak / route / file / DDL
ok('24. behavior-events response에 raw events 없음', !/\bevents:\s*(result|Safe|Array|\[)/.test(EVENTS_ROUTE));
const summaryResp = (SUMMARY_SVC.match(/export interface MarketingBehaviorSummaryApiResponse \{([\s\S]*?)\n\}/) || [, ''])[1];
ok('25. behavior-summary response에 raw events 없음', !/\bevents\b/.test(summaryResp));
ok('26. GET /api/marketing/behavior-events 미생성(POST 전용)', /method !== 'POST'/.test(EVENTS_ROUTE) && !/method === 'GET'/.test(EVENTS_ROUTE));
ok('27. raw event dump route 없음', !/getRecentMarketingBehaviorEventsForSummary/.test(EVENTS_ROUTE) && !/getRecentEventsForAggregation/.test(SUMMARY_ROUTE) && !ROUTEHasEventsArray(SUMMARY_ROUTE));
ok('28. local JSON/file persistence 없음', !/writeFileSync|readFileSync|node:fs|require\('fs'|fs\.promises/.test(NEW));
ok('29. 자동 DDL 기본 활성화 없음', !/CREATE TABLE/i.test(PG) && /(자동 DDL|DDL)/.test(ADAPTER_DOC) && /금지/.test(ADAPTER_DOC));

function ROUTEHasEventsArray(s) { return /res\.[^;]*\bevents\b\s*:/.test(s); }

// 30~35. docs
ok('30. adapter 문서 존재', has('docs/MARKETING_BEHAVIOR_POSTGRES_ADAPTER_V0.md'));
ok('31. schema 문서 존재', has('docs/MARKETING_BEHAVIOR_POSTGRES_SCHEMA_V0.md'));
ok('32. env 설정 설명', /GODO_BEHAVIOR_STORAGE_BACKEND/.test(ADAPTER_DOC) && /DATABASE_URL/.test(ADAPTER_DOC));
ok('33. raw PII 저장 금지 설명', /저장하지 않는/.test(ADAPTER_DOC) && /(IP|userAgent|orderNo|memberKey)/.test(ADAPTER_DOC));
ok('34. schema SQL 존재', /CREATE TABLE/i.test(SCHEMA_DOC) && /marketing_behavior_events/.test(SCHEMA_DOC));
ok('35. 자동 DDL 기본 금지 설명', /자동 DDL/.test(SCHEMA_DOC + ADAPTER_DOC) && /(금지|직접 적용)/.test(SCHEMA_DOC + ADAPTER_DOC));

// 36~40. 금지
ok('36. 고도몰 스킨 삽입 없음', !/godomall.*script|skin.*inject/i.test(NEW));
ok('37. tracker 자동 전송 기본 활성화 없음(이 task tracker 미변경)', !/autoSend|defaultTransport/i.test(NEW));
ok('38. GA4/GTM 연결 없음', !/google-analytics|googletagmanager|gtag\.js/i.test(NEW));
ok('39. 광고 API 연결 없음', !/ads?\.(google|facebook|meta|naver)\.com|google_ads/i.test(NEW));
ok('40. 고도몰 WRITE 없음', !/godomall|writeOrder|goodsRegist|memberModify/i.test(NEW));

// 41. CS/상품/운영 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const forbiddenArea = codeChanged.filter((f) => /[Cc]ustomerService|ProductTeam|상품관리|[Oo]perationLog|운영|godomall\//.test(f) && !/[Bb]ehavior/.test(f));
ok('41. CS/상품관리/운영/고도몰 route 무변경', forbiddenArea.length === 0);

// ── 런타임: env-gated 동작 ───────────────────────────────────────────────────
const ENV_KEYS = ['GODO_BEHAVIOR_STORAGE_BACKEND', 'DATABASE_URL', 'POSTGRES_URL', 'GODO_BEHAVIOR_POSTGRES_TABLE'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const clearEnv = () => ENV_KEYS.forEach((k) => { delete process.env[k]; });
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-pg-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'marketingBehaviorCollectionValidator.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorEventStore.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorStorageTypes.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorPostgresStore.ts'),
    path.join(REPO, 'api', '_shared', 'marketingBehaviorPersistentStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const PGM = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorPostgresStore.js')).href);
  const PSM = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorPersistentStore.js')).href);
  const ESM = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorEventStore.js')).href);

  const ev = { eventId: 'evt_1', sessionIdHash: 'proto_x', eventName: 'banner_click', occurredAt: '2026-06-29T01:00:00.000Z', source: 'blog' };

  // env 없음 → dev_buffer
  clearEnv(); PSM.resetMarketingBehaviorStorageForTest(); ESM.clearMarketingBehaviorEventStoreForTest();
  const st = PSM.getMarketingBehaviorStorage();
  const stats = await st.getStats();
  ok('42. env 없음 → getStats dev_buffer / persistentReady false', stats.mode === 'dev_buffer' && stats.persistentReady === false);
  const ap = await st.appendEvents([ev], { shopId: 'demo', schemaVersion: 0 });
  ok('43. env 없음 → appendEvents dev_buffer 성공', ap.ok === true && ap.mode === 'dev_buffer' && ap.accepted === 1);
  ok('47. env 없음 → isPostgresConfigured false (Pool 미생성 경로)', PGM.isPostgresMarketingBehaviorStorageConfigured() === false);

  // partial env (backend만, url 없음) → fallback(비 postgres)
  clearEnv(); process.env.GODO_BEHAVIOR_STORAGE_BACKEND = 'postgres';
  PSM.resetMarketingBehaviorStorageForTest();
  const st2 = PSM.getMarketingBehaviorStorage();
  const stats2 = await st2.getStats();
  ok('44. partial env → postgres 미활성 / persistentReady false', PGM.isPostgresMarketingBehaviorStorageConfigured() === false && stats2.persistentReady === false && stats2.mode !== 'persistent');

  // table sanitizer
  clearEnv(); process.env.GODO_BEHAVIOR_POSTGRES_TABLE = 'evil; DROP TABLE x';
  const bad = PGM.getPostgresMarketingBehaviorTableName();
  process.env.GODO_BEHAVIOR_POSTGRES_TABLE = 'my_events_2';
  const good = PGM.getPostgresMarketingBehaviorTableName();
  ok('45. table name sanitizer(위험→기본 / 정상→유지)', bad === 'marketing_behavior_events' && good === 'my_events_2');

  // full env → postgres 선택 + getStats(미연결, config 기반)
  clearEnv(); process.env.GODO_BEHAVIOR_STORAGE_BACKEND = 'postgres'; process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake';
  PSM.resetMarketingBehaviorStorageForTest();
  const st3 = PSM.getMarketingBehaviorStorage();
  const stats3 = await st3.getStats();
  ok('46. full env → postgres getStats(persistent/backend postgres/persistentReady true, 미연결)', stats3.mode === 'persistent' && stats3.backend === 'postgres' && stats3.persistentReady === true);
} catch (e) {
  ok('42~47. postgres 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  clearEnv();
  for (const k of ENV_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
