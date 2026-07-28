#!/usr/bin/env node
/*
 * scripts/smoke-b-use-4-auth-integration-v0.mjs
 * B-use-4 — 인증 브랜치 선별 통합 최종검사 (인증 브랜치의 A/A.1 검사를 현재 구조로 통합·교체)
 *
 * 채택 기능 4가지만 다룬다.
 *   1) 이름·팀·직책·아이디·비밀번호로 가입 신청
 *   2) 가입자는 member + pending
 *   3) 같은 팀장 또는 HQ 승인, 팀장 승격은 HQ 만
 *   4) 승인된 사용자가 로그인해 보호 API·대시보드 이용
 *
 * B-use-4 에서 추가로 잠그는 두 경계
 *   [F] 회사 서버(Vercel 밖)에서도 fail-closed — VERCEL_ENV 하나에 의존하지 않는다
 *   [R] 로그인 신원 → 업무 행위자 연결 + member/team_lead/hq 권한 구분
 *
 * 검사 방식: 문자열 대조가 아니라 **컴파일된 실제 모듈을 실행**한다.
 *   실제 Clerk 가입·브라우저 로그인·실세션·Preview 는 이 검사의 범위가 아니다(Preview 인수검사에서 실증).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const require_ = createRequire(pathToFileURL(path.join(REPO, 'package.json')).href);
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'buse4-'));

// 계약 모듈이 저장 경계를 통과할 수 있도록 localStorage shim.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let pass = 0, fail = 0;
const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); c ? pass++ : fail++; };
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
const codeLines = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

console.log('=== B-use-4 인증 통합 smoke ===');

// ── 0. SDK 실설치 ────────────────────────────────────────────────────────────
console.log('\n[0] SDK 실설치·정적 import');
ok('0-1. @clerk/react·@clerk/backend 실해석(require.resolve)', (() => {
  try { require_.resolve('@clerk/react'); require_.resolve('@clerk/backend'); return true; } catch { return false; }
})());
ok('0-2. package.json·lockfile 에 @clerk 존재', /@clerk\/react/.test(src('package.json')) && /@clerk\//.test(src('package-lock.json')));
ok('0-3. 어댑터가 정적 import(비리터럴 지정자 트릭 없음)',
  /import \{ createClerkClient \} from '@clerk\/backend'/.test(src('api/_shared/clerkAuthAdapter.ts'))
  && !/\[['"]@clerk['"]/.test(src('api/_shared/clerkAuthAdapter.ts')));

// ── 컴파일 ───────────────────────────────────────────────────────────────────
let AC, AA, AD, CFG, AUTHROUTE, ordersRevenue, ordersAdmin, marketing, health, ADAPTER;
let AG, AF, ACTOR, LC, LA, LSTORE;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'api', '_shared', 'accountContract.ts'),
    path.join(REPO, 'api', '_shared', 'authConfigContract.ts'),
    path.join(REPO, 'api', '_shared', 'authActor.ts'),
    path.join(REPO, 'api', '_shared', 'accountDirectory.ts'),
    path.join(REPO, 'api', '_shared', 'clerkAuthAdapter.ts'),
    path.join(REPO, 'api', 'auth', '[action].ts'),
    path.join(REPO, 'api', 'godomall', 'orders-revenue.ts'),
    path.join(REPO, 'api', 'godomall', 'orders-admin.ts'),
    path.join(REPO, 'api', 'godomall', 'health.ts'),
    path.join(REPO, 'api', 'marketing', '[action].ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'authGate.ts'),
    path.join(REPO, 'src', 'services', 'authorizedFetch.ts'),
    path.join(REPO, 'src', 'services', 'authAccountActor.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleContract.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', path.join(tmp, 'cli'),
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck', '--jsx', 'react-jsx', '--types', 'node'],
    { stdio: 'pipe' });
  for (const sub of ['_shared', 'auth', 'godomall', 'marketing',
    path.join('cli', 'services'), path.join('cli', 'data'), path.join('cli', 'types'), path.join('cli', 'utils'), path.join('cli', 'engine')]) {
    const dir = path.join(tmp, sub); let files = [];
    try { files = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of files) {
      if (!e.isFile() || !e.name.endsWith('.js')) continue;
      const p = path.join(dir, e.name);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  // cli 하위 전 디렉터리 재귀 보정(engine/data 등 중첩 경로).
  const fixAll = (d) => {
    let entries = []; try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) fixAll(p);
      else if (e.name.endsWith('.js')) writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  };
  fixAll(path.join(tmp, 'cli'));
  const imp = (sub, f) => import(pathToFileURL(path.join(tmp, sub, f)).href);
  AC = await imp('_shared', 'accountContract.js');
  CFG = await imp('_shared', 'authConfigContract.js');
  AA = await imp('_shared', 'authActor.js');
  AD = await imp('_shared', 'accountDirectory.js');
  ADAPTER = await imp('_shared', 'clerkAuthAdapter.js'); // 실제 @clerk/backend 해석·실행
  AUTHROUTE = await imp('auth', '[action].js');
  ordersRevenue = (await imp('godomall', 'orders-revenue.js')).default;
  ordersAdmin = (await imp('godomall', 'orders-admin.js')).default;
  health = (await imp('godomall', 'health.js')).default;
  marketing = (await imp('marketing', '[action].js')).default;
  AG = await imp(path.join('cli', 'services'), 'authGate.js');
  AF = await imp(path.join('cli', 'services'), 'authorizedFetch.js');
  ACTOR = await imp(path.join('cli', 'services'), 'authAccountActor.js');
  LC = await imp(path.join('cli', 'services'), 'taskLifecycleContract.js');
  LA = await imp(path.join('cli', 'services'), 'taskLifecycleAppAdapter.js');
  LSTORE = await imp(path.join('cli', 'services'), 'taskLifecycleStore.js');
} catch (e) {
  console.error('[smoke] 컴파일/import 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true }); process.exit(1);
}
ok('0-4. 컴파일된 Clerk 어댑터 실 import 성공(=@clerk/backend 실행)', !!ADAPTER.createClerkAuthDeps && !!ADAPTER.createClerkDirectory);

// ── 공용 헬퍼 ────────────────────────────────────────────────────────────────
const makeRes = () => { const o = { _s: 200, _b: null }; return { status(c) { o._s = c; return this; }, json(b) { o._b = b; }, end() { return this; }, setHeader() {}, _get: () => ({ status: o._s, body: o._b }) }; };
const NOW = '2026-07-28T00:00:00.000Z';
const acct = (userId, role, team, status) => ({ userId, name: `${userId}-이름`, team, position: '직책', role, status, history: [{ at: NOW, event: 'created', name: `${userId}-이름`, team, position: '직책', role }] });
const stubSession = { verify: async (req) => (req.__uid ? { userId: req.__uid } : null) };
const ENVK = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'AUTH_AUTHORIZED_PARTIES',
  'AUTH_ENFORCE', 'AUTH_DEV_OPEN', 'NODE_ENV', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL',
  'GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY'];
const savedEnv = Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
const setEnv = (o) => { for (const k of ENVK) delete process.env[k]; Object.assign(process.env, { GODOMALL_API_MODE: 'mock', GODOMALL_PARTNER_KEY: 'stub', GODOMALL_USER_KEY: 'stub' }, o); };
const restoreEnv = () => { for (const k of ENVK) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } };
// 크래시는 검사를 중단시키지 않고 **관측 가능한 실패**가 되어야 한다(status='crash').
const callRoute = async (handler, req) => {
  const res = makeRes();
  try { await handler(req, res); } catch (e) { return { status: 'crash', body: null, err: String(e && (e.message || e)).slice(0, 100) }; }
  return res._get();
};
const OR_REQ = () => ({ method: 'GET', headers: {}, url: '/api/godomall/orders-revenue' });

// ══════════════════════════════════════════════════════════════════════════
// [F] 회사 서버에서도 fail-closed — 보호환경 판정
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[F] 보호환경 판정 (Vercel 밖에서도 닫힌다)');
const verdict = (i) => CFG.resolveProtectedEnv({ vercelEnv: undefined, nodeEnv: undefined, authEnforce: undefined, authDevOpen: undefined, ...i });
ok('F-1. Vercel production → 보호환경', verdict({ vercelEnv: 'production' }).protectedEnv === true, verdict({ vercelEnv: 'production' }).reason);
ok('F-2. Vercel preview → 보호환경', verdict({ vercelEnv: 'preview' }).protectedEnv === true);
ok('F-3. 회사 서버형 NODE_ENV=production → 보호환경', verdict({ nodeEnv: 'production' }).protectedEnv === true, verdict({ nodeEnv: 'production' }).reason);
ok('F-4. AUTH_ENFORCE=true → 어떤 환경이든 보호환경', verdict({ nodeEnv: 'development', authEnforce: 'true' }).protectedEnv === true, verdict({ nodeEnv: 'development', authEnforce: 'true' }).reason);
ok('F-5. 환경 불명(신호 0) → 보호환경(fail-closed)', verdict({}).protectedEnv === true, verdict({}).reason);
ok('F-6. 명시적 NODE_ENV=development → 보호환경 아님', verdict({ nodeEnv: 'development' }).protectedEnv === false, verdict({ nodeEnv: 'development' }).reason);
ok('F-7. 명시적 AUTH_DEV_OPEN=true → 보호환경 아님', verdict({ authDevOpen: 'true' }).protectedEnv === false);
ok('F-8. NODE_ENV=test 는 개발 신호가 아니다(닫힌다)', verdict({ nodeEnv: 'test' }).protectedEnv === true, verdict({ nodeEnv: 'test' }).reason);
ok('F-9. AUTH_ENFORCE 가 개발 신호를 이긴다', verdict({ nodeEnv: 'development', authDevOpen: 'true', authEnforce: '1' }).protectedEnv === true);

// 허용 출처: 회사 서버는 AUTH_AUTHORIZED_PARTIES 하나로 완결돼야 한다.
const parties = (i) => CFG.buildAuthorizedParties({ raw: undefined, productionUrl: undefined, deploymentUrl: undefined, branchUrl: undefined, ...i });
ok('F-10. AUTH_AUTHORIZED_PARTIES 단독으로 허용 출처 구성(회사 서버)',
  JSON.stringify(parties({ raw: 'https://ops.example.co.kr' })) === JSON.stringify(['https://ops.example.co.kr']));
ok('F-11. 스킴 없는 호스트도 https 로 정규화', parties({ raw: 'ops.example.co.kr' })[0] === 'https://ops.example.co.kr');
ok('F-12. Vercel 도메인은 추가 입력일 뿐(둘 다 있으면 합집합)',
  parties({ raw: 'https://ops.example.co.kr', productionUrl: 'godo-psi.vercel.app' }).length === 2);
ok('F-13. Vercel 변수가 전부 없어도 허용 출처가 만들어진다(유일 경로 아님)',
  parties({ raw: 'https://ops.example.co.kr' }).length === 1);

// 실제 보호 라우트로 재현
console.log('\n[F-라우트] 실 handler 로 재현한 fail-closed 매트릭스');
setEnv({ NODE_ENV: 'development' });
ok('F-20. 명시적 로컬 개발 + 키 없음 → 200(기존 개발 화면 허용)', (await callRoute(ordersRevenue, OR_REQ())).status === 200);
setEnv({ VERCEL_ENV: 'production' });
ok('F-21. Vercel Production + 키 없음 → 503', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ VERCEL_ENV: 'preview', CLERK_SECRET_KEY: 'sk_test_matrix' });
ok('F-22. Vercel Preview + 부분설정(secret 만) → 503(크래시 아님)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ NODE_ENV: 'production' });
ok('F-23. 회사 서버형 production + 키 없음 → 503', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ NODE_ENV: 'production', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_matrix' });
ok('F-24. 회사 서버형 production + 부분설정(publishable 만) → 503', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({});
ok('F-25. 환경 불명 + 키 없음 → 503(fail-closed)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);
setEnv({ NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_x', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' });
ok('F-26. 두 키 + 보호환경 + 허용출처 0 → 503(azp 생략 금지)', (await callRoute(ordersRevenue, OR_REQ())).status === 503);

const pk = 'pk_test_' + Buffer.from('example.clerk.accounts.dev$').toString('base64');
setEnv({ NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_matrix', VITE_CLERK_PUBLISHABLE_KEY: pk, AUTH_AUTHORIZED_PARTIES: 'https://ops.example.co.kr' });
const cfgFull = AA.resolveServerAuthConfig(process.env);
ok('F-27. 회사 서버 완전설정(Vercel 변수 0) → complete', cfgFull.state === 'complete', `state=${cfgFull.state} reason=${cfgFull.envReason} parties=${cfgFull.authorizedParties.join(',')}`);
ok('F-28. 판정 근거가 node_production 으로 기록됨', cfgFull.envReason === 'node_production');
const f29 = await callRoute(ordersRevenue, OR_REQ());
ok('F-29. 완전설정 + 무세션 → 401(실 어댑터 경로, 크래시 아님)', f29.status === 401, `status=${f29.status}${f29.err ? ' err=' + f29.err : ''}`);
// 세션 검증·계정 조회가 throw 하면(잘못된 키 형식·SDK 오류·디렉터리 장애)
//   500 으로 터지거나 조용히 통과하면 안 된다. 안전한 쪽(503)으로 닫혀야 한다.
//   ※ 라우트 env 매트릭스로는 재현할 수 없다 — 기본 Clerk deps 가 모듈 수준에서 캐시되기 때문에
//     앞선 정상 호출이 클라이언트를 이미 만들어 둔다. 그래서 새 catch 를 **직접** 겨냥한다.
{
  const dirOkAcct = AD.createInMemoryDirectory([acct('a1', 'member', 'product', 'active')]);
  const throwSession = { verify: async () => { throw new Error('boom: 잘못된 키 형식'); } };
  const gThrow = AA.protectedHandler(async (_r, res) => res.status(200).json({ ok: true, ran: true }),
    { session: throwSession, directory: dirOkAcct });
  const broken = await callRoute(gThrow, { method: 'GET', headers: {}, url: '/x', __uid: 'a1' });
  ok('F-30. 세션 검증이 throw → 크래시(500)·통과 아님, 503 으로 닫힘',
    broken.status === 503, `status=${broken.status}${broken.err ? ' err=' + broken.err : ''}`);
  ok('F-31. throw 시 inner 핸들러가 실행되지 않는다(조용한 통과 금지)', broken.body?.ran !== true);
  const dirThrow = { getAccount: async () => { throw new Error('디렉터리 장애'); } };
  const gDirThrow = AA.protectedHandler(async (_r, res) => res.status(200).json({ ok: true, ran: true }),
    { session: stubSession, directory: dirThrow });
  const dirBroken = await callRoute(gDirThrow, { method: 'GET', headers: {}, url: '/x', __uid: 'a1' });
  ok('F-32. 계정 조회가 throw 해도 503(디렉터리 장애 시 통과 금지)',
    dirBroken.status === 503 && dirBroken.body?.ran !== true, `status=${dirBroken.status}`);
}
setEnv({});

// ══════════════════════════════════════════════════════════════════════════
// [A] 가입·승인 규칙 (채택 기능 1~3)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[A] 가입 → member/pending → 같은 팀장·HQ 승인 → 팀장 승격은 HQ만');
const inner = async (_req, res) => res.status(200).json({ ok: true, ran: true });
{
  const d = AD.createInMemoryDirectory([acct('a1', 'member', 'product', 'active'), acct('p1', 'member', 'product', 'pending'), acct('s1', 'member', 'product', 'suspended')]);
  const g = AA.protectedHandler(inner, { session: stubSession, directory: d });
  const call = async (uid, body) => { const res = makeRes(); const req = { method: 'GET', headers: {}, url: '/x', body }; if (uid) req.__uid = uid; await g(req, res); return res._get(); };
  ok('A-1. 무세션 → 401', (await call(null)).status === 401);
  ok('A-2. pending → 403 · suspended → 403 · 계정없음 → 403',
    (await call('p1')).status === 403 && (await call('s1')).status === 403 && (await call('ghost')).status === 403);
  ok('A-3. active → 보호 API 진입(inner 실행)', (await call('a1')).body?.ran === true);
  ok('A-4. body 의 role/actor 위조 무력(pending 이 hq 주장해도 403)',
    (await call('p1', { role: 'hq', actorUserId: 'a1', status: 'active' })).status === 403);
}
const hq = acct('hq1', 'hq', 'hq', 'active');
const leadP = acct('leadP', 'team_lead', 'product', 'active');
const leadC = acct('leadC', 'team_lead', 'cs', 'active');
const pendP = acct('pendP', 'member', 'product', 'pending');
const pendC = acct('pendC', 'member', 'cs', 'pending');
{
  const dir = AD.createInMemoryDirectory([hq, leadP, leadC, pendP, pendC]);
  const listP = (await AD.listApprovableFor(dir, leadP)).map((a) => a.userId).sort();
  const listHq = (await AD.listApprovableFor(dir, hq)).map((a) => a.userId).sort();
  ok('A-5. 팀장 승인 목록 = 자기 팀 신청만', JSON.stringify(listP) === JSON.stringify(['pendP']), `leadP=[${listP}]`);
  ok('A-6. HQ 승인 목록 = 전체', listHq.includes('pendP') && listHq.includes('pendC'), `hq=[${listHq}]`);
  ok('A-7. 팀장이 team_lead 로 승인 → FORBIDDEN(승격은 HQ만)',
    (await AD.approveApplication(dir, 'leadP', 'pendP', NOW, 'team_lead')).errorCode === 'FORBIDDEN');
  const asLead = await AD.approveApplication(dir, 'hq1', 'pendP', NOW, 'team_lead');
  ok('A-8. HQ 가 team_lead 로 승인 → active·role=team_lead(실 상태전이)',
    asLead.ok && asLead.account.status === 'active' && asLead.account.role === 'team_lead');
  ok('A-9. 타 팀장 승인 → FORBIDDEN', (await AD.approveApplication(dir, 'leadP', 'pendC', NOW, 'member')).errorCode === 'FORBIDDEN');
}
{
  const dir = AD.createInMemoryDirectory([hq, leadP, leadC, acct('memP2', 'member', 'product', 'active'), acct('memC2', 'member', 'cs', 'active')]);
  const call = async (method, uid, action, body) => { const res = makeRes(); const req = { method, headers: {}, url: `/api/auth/${action}`, body: body || {} }; if (uid) req.__uid = uid; await AUTHROUTE.runAuthAction(req, res, { session: stubSession, directory: dir }); return res._get(); };
  const su = await call('POST', 'newU', 'signup-metadata', { name: '신입', team: 'product', position: '사원', role: 'hq', approveAsRole: 'team_lead' });
  ok('A-10. 가입 body 의 role 위조 무시 → 항상 member·pending',
    su.status === 200 && su.body?.account?.role === 'member' && su.body?.account?.status === 'pending');
  ok('A-11. 가입 입력 검증: 팀 없음/이름 없음 → 400',
    (await call('POST', 'bad1', 'signup-metadata', { name: '', team: 'product', position: '사원' })).status === 400
    && (await call('POST', 'bad2', 'signup-metadata', { name: '이름', team: 'nope', position: '사원' })).status === 400);
  const before = JSON.stringify(await dir.getAccount('newU'));
  const del = await call('DELETE', 'leadP', 'approve', { targetUserId: 'newU' });
  const get2 = await call('GET', 'leadP', 'suspend', { targetUserId: 'memP2' });
  const put3 = await call('PUT', 'leadP', 'reset-password', { targetUserId: 'memP2', tempPassword: 'Xx'.repeat(8) });
  ok('A-12. 잘못된 메서드 → 405', del.status === 405 && get2.status === 405 && put3.status === 405);
  ok('A-13. 405 후 레코드 불변', before === JSON.stringify(await dir.getAccount('newU')) && dir._passwords.size === 0);
  ok('A-14. 같은 팀장 member 승인 → 200 active',
    (await call('POST', 'leadP', 'approve', { targetUserId: 'newU', approveAsRole: 'member' })).status === 200
    && (await dir.getAccount('newU')).status === 'active');

  // 미채택 기능: 세션 검증 이전 503 + 상태 변경 0
  const TEMP = 'Temp-Pw-3x!aQ9';
  const snapP2 = JSON.stringify(await dir.getAccount('memP2'));
  const rpLead = await call('POST', 'leadP', 'reset-password', { targetUserId: 'memP2', tempPassword: TEMP });
  const rpHq = await call('POST', 'hq1', 'reset-password', { targetUserId: 'memC2', tempPassword: TEMP });
  const spLead = await call('POST', 'leadP', 'suspend', { targetUserId: 'memP2' });
  const anonRp = await call('POST', null, 'reset-password', { targetUserId: 'memP2', tempPassword: TEMP });
  const anonSp = await call('POST', null, 'suspend', { targetUserId: 'memP2' });
  ok('A-15. reset-password·suspend → 권한 있어도 503 FEATURE_NOT_AVAILABLE',
    rpLead.status === 503 && rpHq.status === 503 && spLead.status === 503
    && rpLead.body?.errorCode === 'FEATURE_NOT_AVAILABLE' && spLead.body?.errorCode === 'FEATURE_NOT_AVAILABLE');
  ok('A-16. 차단은 세션 검증 이전 — 무인증 호출도 503(401 아님) = 계정 조회 0',
    anonRp.status === 503 && anonSp.status === 503);
  ok('A-17. 미채택 액션 호출 후 상태 변경 0(비번·잠금·스냅샷)',
    dir._passwords.size === 0 && dir._forcedChange.size === 0 && dir._locked.size === 0
    && JSON.stringify(await dir.getAccount('memP2')) === snapP2);
  const allAccounts = JSON.stringify(await dir.listAccounts());
  const allResponses = JSON.stringify([su, del, get2, put3, rpLead, rpHq, spLead, anonRp, anonSp].map((r) => r.body));
  ok('A-18. 전 계정·전 응답 직렬화에 비밀번호 0(계정 수 > 0 확인 포함)',
    (await dir.listAccounts()).length >= 5 && !allAccounts.includes(TEMP) && !allResponses.includes(TEMP));
  const pa = await call('GET', 'leadC', 'pending-approvals', {});
  const managedIds = (pa.body?.managed ?? []).map((a) => a.userId);
  ok('A-19. 팀장 managed 스코프 = 자기 팀만', pa.status === 200 && managedIds.includes('memC2') && !managedIds.includes('memP2'), `leadC=[${managedIds}]`);
}
// HQ 부트스트랩
{
  const savedBoot = process.env.AUTH_BOOTSTRAP_HQ_USER_ID;
  const signup = async (d, uid, body) => { const res = makeRes(); await AUTHROUTE.runAuthAction({ method: 'POST', headers: {}, url: '/api/auth/signup-metadata', body, __uid: uid }, res, { session: stubSession, directory: d }); return res._get(); };
  const BODY = { name: '사장', team: 'product', position: '대표' };
  const dirOk = AD.createInMemoryDirectory([]);
  process.env.AUTH_BOOTSTRAP_HQ_USER_ID = 'user_boss';
  const boot = await signup(dirOk, 'user_boss', BODY);
  ok('A-20. 계정 없을 때만 env 지정 사용자 1회 HQ 부트스트랩',
    boot.status === 200 && boot.body?.bootstrapped === true && (await dirOk.getAccount('user_boss')).role === 'hq');
  const dirNo = AD.createInMemoryDirectory([]);
  delete process.env.AUTH_BOOTSTRAP_HQ_USER_ID;
  await signup(dirNo, 'user_boss', BODY);
  process.env.AUTH_BOOTSTRAP_HQ_USER_ID = 'user_boss';
  const again = await signup(dirNo, 'user_boss', BODY);
  ok('A-21. 앱 가입이 먼저면 env 를 넣어도 승격 안 됨',
    again.body?.note === 'already-registered' && (await dirNo.getAccount('user_boss')).role === 'member');
  if (savedBoot === undefined) delete process.env.AUTH_BOOTSTRAP_HQ_USER_ID; else process.env.AUTH_BOOTSTRAP_HQ_USER_ID = savedBoot;
}

// ══════════════════════════════════════════════════════════════════════════
// [R] 로그인 신원 → 업무 행위자 · 역할 권한 구분
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[R] 로그인 계정 → ActorRef · member/team_lead/hq 권한');
const view = (userId, role, team, name) => ({ userId, name: name ?? `${userId}-이름`, team, position: '직책', role, status: 'active' });
const aLeadP = ACTOR.actorFromServerAccount(view('u_leadP', 'team_lead', 'product', '상품팀장'));
const aMemP = ACTOR.actorFromServerAccount(view('u_memP', 'member', 'product', '상품팀원'));
const aLeadC = ACTOR.actorFromServerAccount(view('u_leadC', 'team_lead', 'cs', 'CS팀장'));
const aHq = ACTOR.actorFromServerAccount(view('u_hq', 'hq', 'hq', '총괄'));

ok('R-1. userId·이름·팀·역할이 서버 계정 뷰에서만 온다',
  aLeadP.userId === 'u_leadP' && aLeadP.label === '상품팀장' && aLeadP.teamId === 'product' && aLeadP.accountRole === 'team_lead');
ok('R-2. identitySource = session_login (데모 역할과 구분)', aLeadP.identitySource === 'session_login');
ok('R-3. 데모 역할 행위자는 demo_role 로 남는다', LA.actorForRole('product').identitySource === 'demo_role' && LA.actorForRole('product').accountRole === undefined);
ok('R-4. 팀 식별자는 정본 어휘로 해석(marketing 은 marketing 그대로 — 승격 금지)',
  ACTOR.actorFromServerAccount(view('u_m', 'team_lead', 'marketing')).teamId === 'marketing');
ok('R-5. 알 수 없는 팀은 추측하지 않는다(hq 로 뭉개지 않음)',
  ACTOR.actorFromServerAccount(view('u_x', 'team_lead', 'nope')).teamId === ACTOR.UNRESOLVED_TEAM);
ok('R-6. 이름이 비면 userId 로 대체(빈 라벨 금지)', ACTOR.actorFromServerAccount(view('u_n', 'member', 'cs', '  ')).label === 'u_n');

// 권한 헬퍼
ok('R-7. hasLeadAuthority: member=false · team_lead/hq=true · 미지정=true(기존 유지)',
  LC.hasLeadAuthority(aMemP) === false && LC.hasLeadAuthority(aLeadP) === true && LC.hasLeadAuthority(aHq) === true
  && LC.hasLeadAuthority(LA.actorForRole('product')) === true);
ok('R-8. hasHqAuthority: hq 계정만 true · 팀만 hq 인 계정은 false',
  LC.hasHqAuthority(aHq) === true && LC.hasHqAuthority(aLeadP) === false
  && LC.hasHqAuthority({ ...aMemP, teamId: 'hq' }) === false
  && LC.hasHqAuthority(LA.actorForRole('hq')) === true);

// 실제 lifecycle 흐름으로 권한 재현
const ids = (() => { let s = 0; return { newId: () => `t-${++s}`, nowIso: () => `2026-07-28T09:00:0${s % 10}.000Z` }; })();
{
  const t = LA.createDirectiveTask({ title: '재고 위험 정리', targetTeamId: 'product', instructedBy: aHq }, ids);
  const tid = t.ref.taskId;
  ok('R-10. member 는 수행자 배정 불가(같은 팀이어도)',
    LA.assignExecutor(tid, { kind: 'human', executorId: 'u_memP', actor: aMemP }, ids).ok === false);
  ok('R-11. 타 팀 팀장도 배정 불가',
    LA.assignExecutor(tid, { kind: 'human', executorId: 'u_leadC', actor: aLeadC }, ids).ok === false);
  const r = LA.assignExecutor(tid, { kind: 'human', executorId: 'u_memP', actor: aLeadP }, ids);
  ok('R-12. 담당 팀장은 배정 가능', r.ok === true, r.reason ?? '');
  ok('R-13. actor 와 executor 분리 유지(지정한 팀장이 수행자로 덮어써지지 않음)',
    r.task?.executorId === 'u_memP' && r.task?.executorKind === 'human' && t.createdBy.userId === 'u_hq');
  LA.submitResult(tid, { resultSummary: '위험 4건 정리', actor: aMemP }, ids);
  ok('R-14. member 는 팀장 확인 단계를 통과하지 못함',
    LA.applyDecision(tid, { kind: 'approve', actor: aMemP }, ids).ok === false);
  ok('R-15. 담당 팀장 확인 성공', LA.applyDecision(tid, { kind: 'approve', actor: aLeadP }, ids).ok === true);
  ok('R-16. HQ 단계는 팀장이 통과 못함', LA.applyDecision(tid, { kind: 'approve', actor: aLeadP }, ids).ok === false);
  const statusOf = () => LSTORE.loadLifecycleTasks().find((x) => x.ref.taskId === tid)?.status;
  ok('R-17. HQ 계정만 최종 확인 → completed',
    LA.applyDecision(tid, { kind: 'approve', actor: aHq }, ids).ok === true && statusOf() === 'completed', statusOf());
}
{
  const t2 = LA.createDirectiveTask({ title: '중단 판단', targetTeamId: 'product', instructedBy: aHq }, ids);
  const t2id = t2.ref.taskId;
  LA.assignExecutor(t2id, { kind: 'human', executorId: 'u_memP', actor: aLeadP }, ids);
  ok('R-18. member 는 업무 중단 불가', LA.applyDecision(t2id, { kind: 'stop', actor: aMemP, reason: 'x' }, ids).ok === false);
  ok('R-19. 담당 팀장은 중단 가능', LA.applyDecision(t2id, { kind: 'stop', actor: aLeadP, reason: '재검토' }, ids).ok === true);
}
{
  // 지정된 임시 책임자 규칙은 기존 계약대로 유지된다.
  const t3 = LA.createDirectiveTask({ title: '임시 책임자 위임', targetTeamId: 'cs', instructedBy: aHq }, ids);
  const stored = LSTORE.loadLifecycleTasks().find((x) => x.ref.taskId === t3.ref.taskId);
  LSTORE.saveLifecycleTask({ ...stored, actingLeadUserId: 'u_memP' });
  ok('R-20. 지정된 임시 책임자는 member 여도 배정 가능(기존 계약 유지)',
    LA.assignExecutor(t3.ref.taskId, { kind: 'human', executorId: 'u_memP', actor: aMemP }, ids).ok === true);
}
ok('R-21. member 는 팀 내부 업무 등록 불가',
  LA.createTeamInternalTask({ title: '팀 업무', teamId: 'product', actor: aMemP }, ids).ok === false);
ok('R-22. 팀장은 팀 내부 업무 등록 가능',
  LA.createTeamInternalTask({ title: '팀 업무', teamId: 'product', actor: aLeadP }, ids).ok === true);

// 역할 전환기로 권한 상승 불가 — App 의 sessionActor 규칙(소스 계약)
const appSrc = codeLines('src/App.tsx');
ok('R-30. actorForView 가 인증 구성 시 서버 계정만 신원 근거로 쓴다',
  /isAuthConfigured\(\) && account\) return actorFromServerAccount\(account\)/.test(appSrc));
// import 문은 소비가 아니다 — **호출부만** 센다.
//   열람 범위(visibleTasksFor·taskFlowsFor·pendingForActor)와 권한(sessionActor)이 **같은 출처**를
//   써야 역할 전환기로 보이는 범위를 넓힐 수 없다. actorForRole 직접 호출은 fallback 1곳뿐이어야 한다.
{
  const body = appSrc.split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n');
  const nRole = (body.match(/actorForRole\(/g) || []).length;
  const nView = (body.match(/actorForView\(/g) || []).length;
  ok('R-31. actorForRole 직접 호출은 미구성 fallback 1곳뿐', nRole === 1, `${nRole}곳`);
  ok('R-31a. 열람 범위·권한이 모두 actorForView 를 통과(정의 1 + 소비 ≥5)', nView >= 6, `${nView}곳`);
  ok('R-31b. 열람 범위 3함수가 역할 전환기 행위자를 직접 쓰지 않는다',
    !/visibleTasksFor\(actorForRole\(/.test(body) && !/taskFlowsFor\(actorForRole\(/.test(body) && !/pendingForActor\(actorForRole\(/.test(body));
}
ok('R-31c. sessionActor(권한)와 열람 범위가 같은 출처(actorForView)를 쓴다',
  /const sessionActor = \(\) => actorForView\(viewerRole\)/.test(appSrc));
ok('R-32. 계정 관리 진입로는 서버 역할로만 판정(역할 전환기 아님)',
  /serverAccount\?\.role === 'hq' \|\| serverAccount\?\.role === 'team_lead'/.test(appSrc));
// 실행으로도 확인: 역할 전환기 값이 무엇이든 서버 계정 actor 의 권한은 변하지 않는다.
ok('R-33. 서버 계정 actor 는 화면 역할과 무관(같은 계정 → 항상 같은 권한)',
  LC.hasLeadAuthority(ACTOR.actorFromServerAccount(view('u_memP', 'member', 'product'))) === false
  && LC.hasHqAuthority(ACTOR.actorFromServerAccount(view('u_memP', 'member', 'hq'))) === false);

// ══════════════════════════════════════════════════════════════════════════
// [T] 팀 어휘 정본 일치 — 인증 계층이 별도 TeamId 정본을 만들지 않는다
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[T] 팀 어휘: teamIdContract 정본과 일치');
{
  const canonSrc = src('src/services/teamIdContract.ts');
  const acctSrc = src('api/_shared/accountContract.ts');
  // 주석은 정책 설명이라 값 생성이 아니다 — 코드 라인만 본다.
  const acctCode = codeLines('api/_shared/accountContract.ts');
  const listOf = (s, name) => {
    const m = s.match(new RegExp(name + '\\s*:\\s*readonly[^=]*=\\s*\\[([^\\]]*)\\]'));
    return m ? m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
  };
  const dept = listOf(canonSrc, 'DEPT_TEAM_IDS');
  const acctTeams = listOf(acctSrc, 'ACCOUNT_TEAMS');
  ok('T-1. 두 목록을 실제로 파싱했다(파서 유효)', Array.isArray(dept) && dept.length > 0 && Array.isArray(acctTeams) && acctTeams.length > 0,
    `정본=[${dept}] 인증=[${acctTeams}]`);
  ok('T-2. 인증 계층 팀 ∪ {hq} = 정본 DEPT_TEAM_IDS (어긋나면 실패)',
    JSON.stringify([...acctTeams, 'hq'].sort()) === JSON.stringify([...(dept ?? [])].sort()),
    `인증∪hq=[${[...acctTeams, 'hq'].sort()}] 정본=[${[...(dept ?? [])].sort()}]`);
  ok('T-3. 인증 계층 코드가 마케팅 두 팀 값을 만들지 않는다(저장값 승격 금지)',
    !/marketing_internal|marketing_external/.test(acctCode));
  ok('T-4. 인증 계층에 TeamId 라는 이름의 별도 정본 유니온이 없다',
    !/export type TeamId\b/.test(acctSrc));
  ok('T-5. 클라 변환기도 마케팅 저장값을 승격하지 않는다',
    !/marketing_internal|marketing_external/.test(codeLines('src/services/authAccountActor.ts')));
}

// ══════════════════════════════════════════════════════════════════════════
// [C] 클라이언트 실배선
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[C] 클라이언트 배선: Provider·브리지·authorizedFetch·게이트');
ok('C-1. main.tsx: ClerkProvider 실 import + JSX 마운트',
  /import \{ ClerkProvider \} from '@clerk\/react'/.test(codeLines('src/main.tsx')) && /<ClerkProvider publishableKey=/.test(codeLines('src/main.tsx')));
ok('C-2. 브리지: useAuth + registerAuthSource + /api/auth/me 실호출',
  /useAuth\(\)/.test(codeLines('src/components/auth/ClerkAuthBridge.tsx'))
  && /registerAuthSource\(/.test(codeLines('src/components/auth/ClerkAuthBridge.tsx'))
  && /authorizedFetch\('\/api\/auth\/me'\)/.test(codeLines('src/components/auth/ClerkAuthBridge.tsx')));
{
  const realFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), auth: new Headers(init && init.headers).get('Authorization') }; return { ok: true, status: 200, json: async () => ({}) }; };
  AF.registerSessionTokenGetter(async () => 'test-session-jwt');
  await AF.authorizedFetch('/api/godomall/orders-revenue');
  const withToken = seen;
  AF.registerSessionTokenGetter(null);
  await AF.authorizedFetch('/api/godomall/orders-revenue');
  const withoutToken = seen;
  globalThis.fetch = realFetch;
  ok('C-3. 토큰 게터 등록 → Authorization: Bearer 실전달(실행 관측)', withToken.auth === 'Bearer test-session-jwt');
  ok('C-4. 게터 미등록 → 헤더 없이 기존 동작(미구성 무회귀)', withoutToken.auth === null);
}
{
  const want = [['src/services/secureProxyClient.ts', 6], ['src/services/departmentDataService.ts', 4],
    ['src/services/aiProviderAdapter.ts', 1], ['src/hooks/useMarketingBehaviorSummary.ts', 1]];
  const got = want.map(([f, n]) => [(codeLines(f).match(/authorizedFetch\(/g) || []).length, n, f]);
  ok('C-5. 보호 API 소비자 12지점 authorizedFetch 재배선', got.every(([g2, w]) => g2 >= w),
    got.map(([g2, w, f]) => `${path.basename(f)}:${g2}/${w}`).join(' '));
  ok('C-6. health(공개)는 재배선 제외', /await fetch\('\/api\/godomall\/health'\)/.test(src('src/services/secureProxyClient.ts')));
}
{
  const screen = codeLines('src/components/AuthGateScreen.tsx');
  ok('C-7. 로그인 화면: 아이디·비번 입력 + signIn.password + finalize',
    /id="login-username"/.test(screen) && /id="login-password"/.test(screen) && /signIn\.password\(\{ identifier/.test(screen) && /signIn\.finalize\(\)/.test(screen));
  ok('C-8. 가입 화면: 정확히 5입력(이름·팀·직책·아이디·비번)',
    (screen.match(/id="su-(name|team|position|username|password)"/g) || []).length === 5 && /signUp\.password\(\{ username/.test(screen));
  ok('C-9. 이메일·전화 입력 없음', !/type="email"|emailAddress|전화번호|phoneNumber/.test(screen));
  ok('C-10. pending/suspended 화면에 로그아웃·상태 재확인 배선',
    (screen.match(/signOut\(\)/g) || []).length >= 2 && (screen.match(/refreshAuthStatus\(\)/g) || []).length >= 3);
  const panel = codeLines('src/components/auth/AccountAdminPanel.tsx');
  ok('C-11. 관리패널: 승인만 배선(member 기본 · team_lead 은 isHq 조건)',
    /authorizedFetch\('\/api\/auth\/approve'/.test(panel) && /approve\(a\.userId, 'member'/.test(panel)
    && /approve\(a\.userId, 'team_lead'/.test(panel) && /isHq &&/.test(panel));
  ok('C-12. 관리패널에 정지·임시비번 UI 0', !/임시 비번|tempPassword|resetTarget|'suspend'|>정지</.test(panel));
  ok('C-13. 클라 소스에 비번 localStorage/콘솔 기록 0',
    !['src/components/AuthGateScreen.tsx', 'src/components/auth/AccountAdminPanel.tsx', 'src/components/auth/ClerkAuthBridge.tsx', 'src/services/authorizedFetch.ts']
      .some((f) => /localStorage\.[a-z]+\([^)]*[Pp]assword|console\.[a-z]+\([^)]*[Pp]assword/.test(src(f))));
}
{
  const walk = (d) => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : [])));
  const srcCode = walk(path.join(REPO, 'src')).map((f) => codeLines(path.relative(REPO, f).replace(/\\/g, '/')));
  const hits = (needle) => srcCode.filter((c) => c.includes(needle)).length;
  const nReset = hits('/api/auth/reset-password'), nSusp = hits('/api/auth/suspend'), nAppr = hits('/api/auth/approve');
  ok('C-14. src 전체에 reset-password·suspend 호출 0 (같은 스캔이 approve 는 발견 = 스캐너 유효)',
    nReset === 0 && nSusp === 0 && nAppr >= 1, `파일 ${srcCode.length} · reset=${nReset} suspend=${nSusp} approve=${nAppr}`);
}
// 게이트 판정
console.log('\n[G] 게이트 판정 + 미로그인 시 회사 데이터 로드 차단');
const gate = (i) => AG.computeAuthGate(i);
ok('G-1. 미구성→open · 로딩→loading · 미로그인→login · 대기→pending · 정지→suspended · active→app',
  gate({ configured: false, loaded: true, signedIn: false }) === 'open' && gate({ configured: true, loaded: false, signedIn: false }) === 'loading'
  && gate({ configured: true, loaded: true, signedIn: false }) === 'login' && gate({ configured: true, loaded: true, signedIn: true, status: 'pending' }) === 'pending'
  && gate({ configured: true, loaded: true, signedIn: true, status: 'suspended' }) === 'suspended' && gate({ configured: true, loaded: true, signedIn: true, status: 'active' }) === 'app');
ok('G-2. 미로그인/대기/정지 → 회사 데이터 로드 금지',
  !AG.shouldLoadCompanyData('login') && !AG.shouldLoadCompanyData('pending') && !AG.shouldLoadCompanyData('suspended')
  && AG.shouldLoadCompanyData('app') && AG.shouldLoadCompanyData('open'));
ok('G-3. App: 게이트 조기 반환이 대시보드 트리 마운트보다 앞',
  /authGateMode !== 'open' && authGateMode !== 'app'/.test(appSrc) && appSrc.indexOf("authGateMode !== 'open'") < appSrc.indexOf('<OpeningScreen'));

// ══════════════════════════════════════════════════════════════════════════
// [P] 공개·보호 경로 매트릭스 무회귀
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[P] 공개·보호 경로 매트릭스');
setEnv({ NODE_ENV: 'production' }); // 보호환경 fail-closed 상태에서도 공개 경로는 열려 있어야 한다
ok('P-1. health 공개 유지(회사 서버 fail-closed 중에도 200)',
  (await callRoute(health, { method: 'GET', headers: {}, url: '/api/godomall/health' })).status === 200);
{
  const be = await callRoute(marketing, { method: 'OPTIONS', headers: { origin: 'https://x' }, url: '/api/marketing/behavior-events' });
  ok('P-2. behavior-events 공개 유지(방문자 수집)', be.status !== 401 && be.status !== 403 && be.status !== 503, `status=${be.status}`);
}
ok('P-3. behavior-summary 는 보호(미설정 → 503)',
  (await callRoute(marketing, { method: 'GET', headers: {}, url: '/api/marketing/behavior-summary' })).status === 503);
{
  const oa = await callRoute(ordersAdmin, { method: 'GET', headers: {} });
  ok('P-4. orders-admin 403 ADMIN_ACCESS_DISABLED 유지', oa.status === 403 && oa.body?.errorCode === 'ADMIN_ACCESS_DISABLED');
}
ok('P-5. 보호 라우트 6종이 protectedHandler 로 감싸져 있다',
  ['api/ai/chat.ts', 'api/godomall/[resource].ts', 'api/godomall/orders-revenue.ts', 'api/godomall/products.ts', 'api/godomall/read.ts', 'api/godomall/sync.ts']
    .every((f) => /export default protectedHandler\(handler\)/.test(src(f))));
ok('P-6. detail 은 이번 범위 미보호(기존 rate-limit·SSRF 유지)',
  !/protectedHandler/.test(src('api/detail/[action].ts')) && /consumeRateLimit|rate/i.test(src('api/detail/[action].ts')));
setEnv({}); restoreEnv();

// ══════════════════════════════════════════════════════════════════════════
// [B] B-use-3 보존 · manifest 등록
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[B] 기존 B-core·B-use 보존');
{
  const app = src('src/App.tsx');
  ok('B-1. B-use-3 네 업무 경로 핸들러 보존',
    /handleSendDirective/.test(app) && /handleCreateTeamTask/.test(app) && /handleCollaborationRequest/.test(app) && /handleHqReview/.test(app));
  ok('B-2. 결과 상세 진입(TaskDetailModal) 보존', /TaskDetailModal/.test(src('src/components/TeamTaskPanel.tsx')));
  ok('B-3. 리소스별 출처 판정 보존', /migrateResourceProvenance|classifyResource/.test(app));
  ok('B-4. 팀 내부 업무 추가 입력 보존', /ttask-new/.test(src('src/components/TeamTaskPanel.tsx')));
  const mf = JSON.parse(src('scripts/regression-manifest.json'));
  ok('B-5. 이 검사가 manifest include 에 등록됨', mf.include.includes('smoke-b-use-4-auth-integration-v0.mjs'));
  ok('B-6. B-use-3 집중검사가 manifest 에 그대로 있다', mf.include.includes('smoke-b-use-3-hq-directive-flow-v0.mjs'));
  ok('B-7. manifest exclude 0 유지', (mf.exclude ?? []).length === 0, `${(mf.exclude ?? []).length}건`);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
