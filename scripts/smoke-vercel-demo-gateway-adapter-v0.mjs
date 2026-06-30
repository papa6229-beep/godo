#!/usr/bin/env node
/*
 * scripts/smoke-vercel-demo-gateway-adapter-v0.mjs
 * Vercel Demo Gateway Adapter v0 검증.
 *  - /api route entry <= 12, _shared 제외. 기능 삭제 없이 entry만 동적 라우트로 통합.
 *  - URL 보존(프론트 호출부 변경 없음), 고객흐름/고도몰 READ 보존, raw event 미노출, Vercel 데모 문서.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Vercel Demo Gateway Adapter v0 smoke ===');

// route entry 카운터(report와 동일 규칙: _shared 제외)
function listRouteEntries(dir = path.join(REPO, 'api'), rel = 'api') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = `${rel}/${name}`;
    if (statSync(full).isDirectory()) { if (name === '_shared') continue; out.push(...listRouteEntries(full, relPath)); }
    else if (name.endsWith('.ts') || name.endsWith('.js')) out.push(relPath);
  }
  return out;
}
const entries = listRouteEntries();
console.log('  route entries (after):');
entries.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
console.log(`  total: ${entries.length} (target <= 12)`);

const ACTION = has('api/marketing/[action].ts') ? read('api/marketing/[action].ts') : '';
const RESOURCE = has('api/godomall/[resource].ts') ? read('api/godomall/[resource].ts') : '';
const HOOK = read('src/hooks/useMarketingBehaviorSummary.ts');
const SEND = read('src/services/marketingBehaviorTrackerSendAdapter.ts');
const PLAN = read('src/services/marketingBehaviorCollectionPlan.ts');
const SECURE = read('src/services/secureProxyClient.ts');
const DEPT = read('src/services/departmentDataService.ts');
const DOC = has('docs/VERCEL_DEMO_GATEWAY_ADAPTER_V0.md') ? read('docs/VERCEL_DEMO_GATEWAY_ADAPTER_V0.md') : '';

// 1~2. count
ok('1. route entry 수 <= 12', entries.length <= 12);
ok('2. _shared는 route count에서 제외', !entries.some((e) => e.includes('/_shared/')));

// 3~6. 마케팅 통합
ok('3. api/marketing/[action].ts 존재', has('api/marketing/[action].ts'));
ok('4. behavior-events.ts route entry 없음', !has('api/marketing/behavior-events.ts'));
ok('5. behavior-summary.ts route entry 없음', !has('api/marketing/behavior-summary.ts'));
ok('6. marketing behavior GET/POST 분기 코드', /handleCollect/.test(ACTION) && /handleSummary/.test(ACTION) && /'POST'/.test(ACTION) && /'GET'/.test(ACTION) && /behavior-events/.test(ACTION) && /behavior-summary/.test(ACTION));

// 7~8. URL 보존(프론트/문서 변경 없이 그대로)
ok('7. useMarketingBehaviorSummary가 (보존된) summary URL 호출', HOOK.includes('/api/marketing/behavior-summary'));
ok('8. tracker send adapter/plan이 (보존된) events URL 기준', PLAN.includes('/api/marketing/behavior-events') && /MARKETING_BEHAVIOR_FUTURE_ENDPOINT/.test(SEND));

// 9~11. 고도몰 보존
ok('9. api/godomall/read.ts gateway 유지', has('api/godomall/read.ts'));
ok('10. products READ 경로 유지(정적 route + 호출부)', has('api/godomall/products.ts') && DEPT.includes('/api/godomall/products'));
const RES_URLS = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
ok('11. orders/inquiries/reviews/inventory/sales 호출부 보존 + gateway 처리',
  RES_URLS.every((r) => SECURE.includes(`/api/godomall/${r}`)) && RES_URLS.every((r) => RESOURCE.includes(`'${r}'`))
  && has('api/godomall/orders-admin.ts') && has('api/godomall/orders-revenue.ts'));

// 12~18. 보존/금지
ok('12. raw event GET API 없음(events action은 POST 수집)', /action === 'behavior-events'/.test(ACTION) && /POST only/.test(ACTION) && !RESOURCE.includes('events'));
ok('13. raw events response 없음', !/\bevents:\s*(result|Safe|Array|\[)/.test(ACTION));
ok('14. tracker 자동 전송 기본값 변경 없음', !/autoSend|defaultTransport/i.test(read('src/services/marketingBehaviorTrackerPrototype.ts')) && /options\?\.transport/.test(read('src/services/marketingBehaviorTrackerPrototype.ts')));
ok('15. 고도몰 WRITE 추가 없음(gateway GET only)', /method !== 'GET'/.test(RESOURCE) && !/writeOrder|goodsRegist|memberModify/i.test(ACTION + RESOURCE));
ok('16. GA4/GTM 연결 없음', !/google-analytics|googletagmanager|gtag\.js/i.test(ACTION + RESOURCE));
ok('17. 광고 API 연결 없음', !/ads?\.(google|facebook|meta|naver)\.com|google_ads/i.test(ACTION + RESOURCE));
ok('18. secret/env 하드코딩 없음', !/postgres(ql)?:\/\/[A-Za-z0-9]+:[^@\s]+@|GODOMALL_PARTNER_KEY\s*=\s*['"][^'"]/.test(ACTION + RESOURCE));

// 19~21. 문서(데모/장기독립)
ok('19. Vercel Pro 전제 문구 없음', !/Pro\s*(플랜|plan)\s*(업그레이드|필요|전제)/i.test(DOC));
ok('20. Vercel은 데모용 설명 존재', /데모|시연/.test(DOC) && /최종 운영 인프라가 아니/.test(DOC));
ok('21. future hosting independence 설명', /(Express|NestJS|Cloud Run|Railway|Render|Fly\.io)/.test(DOC) && /종속/.test(DOC));

// 22~24. 기존 docs/UI 보존(forbidden 영역만 git 검사 — 이번 변경은 api gateway/scripts/docs뿐)
ok('22. 기존 readiness docs 훼손 없음', has('docs/MARKETING_BEHAVIOR_GODO_INTEGRATION_READINESS_V0.md') && has('docs/MARKETING_BEHAVIOR_POSTGRES_ACTIVATION_GUIDE_V0.md'));
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
const uiForbidden = changed.filter((f) => /MarketingCustomerBehaviorModal|MarketingAnalysisDashboard|CustomerService|ProductTeam|상품관리|OperationLog|운영/.test(f) && !/\.md$/.test(f));
ok('23. CS/상품관리/운영일지 UI 변경 없음', uiForbidden.length === 0);
const synthChanged = changed.filter((f) => /syntheticCommerceUniverse/.test(f));
ok('24. synthetic commerce universe 생성 로직 변경 없음', synthChanged.length === 0);
if (uiForbidden.length > 0) console.log('     변경된 UI 파일:', uiForbidden.join(', '));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
