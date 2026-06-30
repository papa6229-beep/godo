#!/usr/bin/env node
/*
 * scripts/smoke-marketing-behavior-tracker-script-prototype-v0.mjs
 * Marketing Behavior Tracker Script Prototype v0 검증.
 *  - 브라우저용 payload 생성 유틸(전송 없음) + SSR 안전 + PII allowlist + 계약 단일 소스 사용
 *  - 실제 fetch/sendBeacon/XHR/gtag/dataLayer/route 없음. CS/상품/운영 무변경.
 *  - 런타임: Node에서 import(SSR 안전) + 유입 정규화/payload 생성/메타데이터/visit-landing 실제 동작 증명.
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
console.log('=== Marketing Behavior Tracker Script Prototype v0 smoke ===');

const TRACKER_REL = 'src/services/marketingBehaviorTrackerPrototype.ts';
const DOC_REL = 'docs/MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE_V0.md';
const PLANDOC_REL = 'docs/GODO_BEHAVIOR_TRACKER_COLLECTION_PLAN_V0.md';
const TRACKER = has(TRACKER_REL) ? read(TRACKER_REL) : '';
const PLAN = has('src/services/marketingBehaviorCollectionPlan.ts') ? read('src/services/marketingBehaviorCollectionPlan.ts') : '';
const DOC = has(DOC_REL) ? read(DOC_REL) : '';
const PLANDOC = has(PLANDOC_REL) ? read(PLANDOC_REL) : '';
const COMBINED = TRACKER + '\n' + PLAN; // data attribute 리터럴은 plan 상수(단일 소스)에 존재

// 1~7. 파일/함수 존재
ok('1. tracker prototype 파일 존재', has(TRACKER_REL));
ok('2. attachMarketingBehaviorTrackerPrototype 함수', /export const attachMarketingBehaviorTrackerPrototype\b/.test(TRACKER));
ok('3. createPrototypeVisitEvents 함수', /export const createPrototypeVisitEvents\b/.test(TRACKER));
ok('4. readMarketingTrafficSource 함수', /export const readMarketingTrafficSource\b/.test(TRACKER));
ok('5. readMarketingPageContext 함수', /export const readMarketingPageContext\b/.test(TRACKER));
ok('6. createMarketingBehaviorEvent 함수', /export const createMarketingBehaviorEvent\b/.test(TRACKER));
ok('7. readTrackableElementMetadata 함수', /export const readTrackableElementMetadata\b/.test(TRACKER));

// 8. top-level에서 window/document/location 직접 실행 없음(column 0)
ok('8. top-level window/document 직접 접근 없음', !/^(window|document|location)\./m.test(TRACKER));

// 9~14. 전송/외부도구 호출 없음
ok('9. fetch 호출 없음', !/fetch\s*\(/.test(TRACKER));
ok('10. navigator.sendBeacon 없음', !/sendBeacon/.test(TRACKER));
ok('11. XMLHttpRequest 없음', !/XMLHttpRequest/.test(TRACKER));
ok('12. gtag 호출 없음', !/gtag\s*\(/.test(TRACKER));
ok('13. dataLayer push 없음', !/dataLayer/.test(TRACKER));
ok('14. /api/marketing/behavior-events 호출 없음', !TRACKER.includes('/api/marketing/behavior-events'));

// 15. 실제 api route 미생성
ok('15. 실제 api route 파일 미생성', !has('api/marketing/behavior-events.ts') && !has('api/marketing/behavior-events') && !has('src/api/marketing/behavior-events.ts'));

// 16~19. data attribute 처리(tracker가 plan 상수 사용 + 리터럴은 단일 소스에)
ok('16. data-godo-track 처리(상수 사용 + 리터럴)', /MARKETING_BEHAVIOR_DATA_ATTRIBUTES/.test(TRACKER) && COMBINED.includes('data-godo-track'));
ok('17. data-godo-banner-id 처리', COMBINED.includes('data-godo-banner-id'));
ok('18. data-godo-category-id 처리', COMBINED.includes('data-godo-category-id'));
ok('19. data-godo-product-id 처리', COMBINED.includes('data-godo-product-id'));

// 20~23. debug buffer / cleanup / import / 계약 참조
ok('20. window.__GODO_MARKETING_BEHAVIOR_DEBUG__ 존재', TRACKER.includes('__GODO_MARKETING_BEHAVIOR_DEBUG__'));
ok('21. cleanup function 반환 구조', /removeEventListener/.test(TRACKER) && /return \(\) =>/.test(TRACKER));
ok('22. MarketingBehaviorEvent 타입 import', /import type \{[\s\S]*MarketingBehaviorEvent[\s\S]*\} from '\.\/marketingBehaviorTypes'/.test(TRACKER));
ok('23. collection plan 상수 참조(allowlist/source/data-attr)', /MARKETING_BEHAVIOR_(ALLOWED_FIELDS|SOURCE_RULES|DATA_ATTRIBUTES)/.test(TRACKER));

// 24. PII 필드를 payload 키로 사용하지 않음
ok('24. PII 필드를 payload 키로 사용 안 함', !/(^|[^A-Za-z])(name|phone|email|address|customerName|contact|memberKey|orderNo|rawSessionId|rawUserId)\s*:/.test(TRACKER));

// 25~28. 문서
ok('25. prototype 문서 존재', has(DOC_REL));
ok('26. 문서에 예시 HTML data-godo-track', DOC.includes('data-godo-track'));
ok('27. 문서에 fetch/API 전송 없음 명시', DOC.includes('fetch') && DOC.includes('전송') && DOC.includes('없'));
ok('28. 문서에 PII 금지 정책', /PII/.test(DOC) && /금지/.test(DOC));

// 29. collection plan 문서에 prototype 후속 단계 언급
ok('29. plan 문서에 prototype 후속 언급', /Prototype v0/.test(PLANDOC) && /MARKETING_BEHAVIOR_TRACKER_SCRIPT_PROTOTYPE/.test(PLANDOC));

// 30. CS/상품/운영·api 무변경(git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const codeChanged = changed.filter((f) => f.startsWith('src/') || f.startsWith('api/'));
const nonMarketing = codeChanged.filter((f) => !/Marketing|marketing|charts\//.test(f));
ok('30. src 변경 마케팅 한정(CS/Product/Operation·api 무변경)', nonMarketing.length === 0 && codeChanged.every((f) => !f.startsWith('api/')));
if (nonMarketing.length > 0) console.log('     변경된 비마케팅 파일:', nonMarketing.join(', '));

// ── 런타임: Node import(SSR 안전) + 실제 payload 생성 동작 증명 ────────────────
const ALLOWED = ['eventId', 'sessionIdHash', 'occurredAt', 'eventName', 'source', 'medium', 'campaign', 'referrerHost', 'pagePath', 'pageTitle', 'bannerId', 'bannerName', 'categoryId', 'categoryName', 'productId', 'productName', 'searchTerm', 'orderIdHash', 'revenue'];
const FORBIDDEN = ['name', 'phone', 'email', 'address', 'customerName', 'contact', 'memberKey', 'orderNo', 'rawSessionId', 'rawUserId'];
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-tracker-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingBehaviorTypes.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorCollectionPlan.ts'),
    path.join(REPO, 'src', 'services', 'marketingBehaviorTrackerPrototype.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--lib', 'ES2022,DOM'], { stdio: 'pipe' });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  // import 성공 = top-level에서 window/document 접근 없음(Node엔 둘 다 없음)
  const B = await import(pathToFileURL(path.join(tmp, 'marketingBehaviorTrackerPrototype.js')).href);
  ok('31. Node import 성공(SSR/top-level 안전)', typeof B.createMarketingBehaviorEvent === 'function');

  const ad = B.readMarketingTrafficSource({ href: 'https://shop.example/?utm_medium=cpc', referrer: '' });
  const blog = B.readMarketingTrafficSource({ href: 'https://shop.example/', referrer: 'https://blog.naver.com/post/1' });
  const direct = B.readMarketingTrafficSource({ href: 'https://shop.example/', referrer: '' });
  ok('32. 유입 정규화: cpc→ad / blog.naver→blog / referrer없음→direct', ad.source === 'ad' && blog.source === 'blog' && direct.source === 'direct');

  const ev = B.createMarketingBehaviorEvent({ eventName: 'banner_click', sessionIdHash: 'proto_x', context: { pagePath: '/' }, element: { bannerId: 'main-hero-02', bannerName: '여름 기획전 배너' } });
  const keys = Object.keys(ev);
  ok('33. payload 생성: 필수 필드 + allowlist만 + PII 없음',
    ev.eventName === 'banner_click' && typeof ev.eventId === 'string' && typeof ev.occurredAt === 'string'
    && ev.sessionIdHash === 'proto_x' && ev.bannerName === '여름 기획전 배너'
    && keys.every((k) => ALLOWED.includes(k)) && FORBIDDEN.every((f) => !keys.includes(f)));

  // 가짜 엘리먼트 stub(getAttribute) → 메타데이터 매핑
  const stub = (attrs) => ({ getAttribute: (n) => (n in attrs ? attrs[n] : null) });
  const meta = B.readTrackableElementMetadata(stub({ 'data-godo-track': 'banner', 'data-godo-banner-id': 'b1', 'data-godo-banner-name': '배너A' }));
  ok('34. data-godo-track 메타데이터: banner→banner_click + 필드', meta && meta.eventName === 'banner_click' && meta.fields.bannerName === '배너A');

  const visits = B.createPrototypeVisitEvents({ sessionIdHash: 'proto_y', href: 'https://shop.example/', referrer: 'https://instagram.com/x', pathname: '/' });
  ok('35. visit/landing payload 2건 + sns 정규화', Array.isArray(visits) && visits.length === 2 && visits[0].eventName === 'visit' && visits[1].eventName === 'landing' && visits[0].source === 'sns');

  const cleanup = B.attachMarketingBehaviorTrackerPrototype({ debug: false });
  ok('36. attach가 Node(document 없음)에서 안전 + cleanup 반환', typeof cleanup === 'function');
  cleanup();
} catch (e) {
  ok('31~36. tracker 런타임 검증', false);
  console.error('[smoke] tsc/runtime 실패:\n', e.stdout?.toString() || e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
