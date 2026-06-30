#!/usr/bin/env node
/*
 * scripts/smoke-godo-behavior-tracker-collection-plan-v0.mjs
 * GODO Behavior Tracker Script & Collection Endpoint Plan v0 검증.
 *  - 설계 문서 + 계약 상수(코드) + PII/금지 정책 + future endpoint(미생성) 확인.
 *  - 실제 route/스크립트/GA4/GTM/WRITE 없음, CS/상품/운영 무변경.
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
console.log('=== GODO Behavior Tracker & Collection Plan v0 smoke ===');

const DOC_REL = 'docs/GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md';
const PLAN_REL = 'src/services/marketingBehaviorCollectionPlan.ts';
const CONTRACT_REL = 'docs/MARKETING_BEHAVIOR_DATA_CONTRACT_V0.md';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const PLAN = has(PLAN_REL) ? read(PLAN_REL) : '';
const CONTRACT = has(CONTRACT_REL) ? read(CONTRACT_REL) : '';

// 1~2. 문서 + 전체 흐름
ok('1. 설계 문서 존재', has(DOC_REL));
ok('2. 문서에 전체 흐름(쇼핑몰→tracker→endpoint→Event→builder)',
  ['고도몰', 'Tracker', '/api/marketing/behavior-events', 'MarketingBehaviorEvent', 'buildMarketingBehaviorInsights'].every((t) => DOC.includes(t)));

// 3~12. 이벤트 10종 설명
const EVENTS = ['visit', 'landing', 'banner_click', 'category_click', 'product_view', 'search', 'add_to_cart', 'checkout_start', 'purchase', 'exit'];
EVENTS.forEach((e, i) => ok(`${i + 3}. 문서에 ${e} 이벤트`, DOC.includes(e)));

// 13~17. 추적/유입/세션/구매/PII 정책
ok('13. data attribute 권장 방식(data-godo-track)', DOC.includes('data-godo-track'));
ok('14. UTM/referrer 수집 설명', /utm_source/.test(DOC) && /referrer/i.test(DOC));
ok('15. sessionIdHash 정책', DOC.includes('sessionIdHash'));
ok('16. orderIdHash 정책', DOC.includes('orderIdHash'));
ok('17. PII 금지 정책', /PII/.test(DOC) && /금지/.test(DOC));

// 18~19. future endpoint(미생성) + 실제 route 미생성
ok('18. /api/marketing/behavior-events가 future(미생성)로만 언급', DOC.includes('/api/marketing/behavior-events') && /(미생성|향후|future)/i.test(DOC));
// route는 plan 단계엔 "미생성"이었고 Endpoint v0에서 생성됨. 있으면 안전한 수집 엔드포인트여야(POST·godomall WRITE 아님).
const routeRel19 = 'api/marketing/behavior-events.ts';
ok('19. behavior route 없음 또는 안전한 수집 엔드포인트(POST·WRITE 아님)',
  !has(routeRel19) || (/'POST'/.test(read(routeRel19)) && !/godomall|writeOrder/i.test(read(routeRel19))));

// 20~24. 계약 상수 파일
ok('20. marketingBehaviorCollectionPlan.ts 존재', has(PLAN_REL));
ok('21. MARKETING_BEHAVIOR_TRACKED_EVENTS 존재', /export const MARKETING_BEHAVIOR_TRACKED_EVENTS\b/.test(PLAN));
ok('22. MARKETING_BEHAVIOR_SOURCE_RULES 존재', /export const MARKETING_BEHAVIOR_SOURCE_RULES\b/.test(PLAN));
ok('23. MARKETING_BEHAVIOR_FORBIDDEN_FIELDS 존재', /export const MARKETING_BEHAVIOR_FORBIDDEN_FIELDS\b/.test(PLAN));
ok('24. MARKETING_BEHAVIOR_FUTURE_ENDPOINT 존재', /export const MARKETING_BEHAVIOR_FUTURE_ENDPOINT\b/.test(PLAN));

// 25. 금지 필드 10종 포함
const FORBIDDEN = ['name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId'];
ok('25. 금지 필드 목록에 10종 포함', FORBIDDEN.every((f) => new RegExp(`'${f}'`).test(PLAN)));

// 26~28. 구현 금지(코드)
ok('26. fetch 호출 없음(계약 파일)', !/fetch\s*\(/.test(PLAN));
ok('27. GA4/GTM 실제 import 없음', !/gtag\s*\(|dataLayer|google-analytics|googletagmanager|import[^\n]*(gtag|gtm|ga4)/i.test(PLAN));
ok('28. WRITE/네트워크 메서드 없음', !/api\/order|writeOrder|method:\s*'(POST|PUT|DELETE)'|axios|XMLHttpRequest/i.test(PLAN));

// 29. CS/상품/운영·api 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const nonMarketing = codeChanged.filter((f) => !/Marketing|marketing|charts\//.test(f));
ok('29. src 변경 마케팅 한정(CS/Product/Operation·api 무변경)', nonMarketing.length === 0 && codeChanged.every((f) => !f.startsWith('api/')));
if (nonMarketing.length > 0) console.log('     변경된 비마케팅 파일:', nonMarketing.join(', '));

// 30. 데이터 계약 문서에 후속 계획 언급
ok('30. 데이터 계약 문서에 후속(tracker collection plan) 언급', /GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0|다음 단계 — 수집 설계/.test(CONTRACT));

// ── 런타임: 계약 상수가 실제 export인지 + 정합성 ──────────────────────────────
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-plan-'));
try {
  // plan.ts는 marketingBehaviorTypes에서 import type만(런타임 의존 없음) → 단독 emit 가능.
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingBehaviorCollectionPlan.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  const P = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorCollectionPlan.js')).href);
  ok('31. 추적 이벤트 상수 10종', Array.isArray(P.MARKETING_BEHAVIOR_TRACKED_EVENTS) && P.MARKETING_BEHAVIOR_TRACKED_EVENTS.length === 10 && P.MARKETING_BEHAVIOR_TRACKED_EVENTS.every((e) => e.piiSafe === true));
  ok('32. 금지 필드 상수 10종 일치', Array.isArray(P.MARKETING_BEHAVIOR_FORBIDDEN_FIELDS) && FORBIDDEN.every((f) => P.MARKETING_BEHAVIOR_FORBIDDEN_FIELDS.includes(f)));
  ok('33. future endpoint 값 정확', P.MARKETING_BEHAVIOR_FUTURE_ENDPOINT === '/api/marketing/behavior-events');
} catch (e) {
  ok('31~33. 계약 상수 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
