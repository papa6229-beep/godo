// SEC-03 상세페이지 이미지 프록시 SSRF/남용 가드 스모크.
//
// 실제 동작 검사: api/_shared/detailImageFetch.ts 를 tsc로 컴파일해 실제 함수를 실행한다.
// 소스 문자열 검사·git diff 가드는 쓰지 않는다.
//
// ⚠️ 프로덕션/실제 내부 주소를 공격적으로 검사하지 않는다.
//    리다이렉트·용량초과·MIME·IP 우회는 전부 로컬 가짜 HTTP 서버와 순수 함수로 재현한다.
//
// 실행: node scripts/smoke-detail-image-fetch-guard-v0.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const outDir = mkdtempSync(path.join(tmpdir(), 'godo-sec03-'));
const repo = process.cwd();

console.log('[1/4] 컴파일');
const tscBin = path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(
  process.execPath,
  [tscBin, path.join(repo, 'api', '_shared', 'detailImageFetch.ts'),
    '--outDir', outDir, '--module', 'esnext', '--target', 'ES2022',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--typeRoots', path.join(repo, 'node_modules', '@types'), '--types', 'node'],
  { stdio: 'pipe', cwd: tmpdir() } // 저장소 tsconfig.json 자동 로드 방지(TS5112)
);

const mod = await import(pathToFileURL(path.join(outDir, 'detailImageFetch.js')).href);
const { fetchImageBytes, isBlockedAddress, parseAllowedHosts, consumeRateLimit } = mod;

// ── 1. IP 정책 순수 함수 ────────────────────────────────────────────────────
console.log('[2/4] IP 정책');
const blocked = [
  '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0', '224.0.0.1', '255.255.255.255',
  '198.18.0.1', '203.0.113.5',
  '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::',
  '::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '2001:db8::1',
];
for (const ip of blocked) ok(`차단: ${ip}`, isBlockedAddress(ip) === true);

const allowedIps = ['8.8.8.8', '1.1.1.1', '203.1.113.5', '2606:4700:4700::1111', '2001:4860:4860::8888'];
for (const ip of allowedIps) ok(`통과: ${ip}`, isBlockedAddress(ip) === false);

// ── 2. allowlist / 표기 우회 ────────────────────────────────────────────────
console.log('[3/4] allowlist · 표기 우회');
const prodHosts = parseAllowedHosts(undefined);
ok('기본 allowlist에 실제 CDN 포함', prodHosts.has('cdn-banana.bizhost.kr'));
ok('기본 allowlist 크기 1(과도한 확장 없음)', prodHosts.size === 1);
ok('와일드카드 항목은 무시', !parseAllowedHosts('*.evil.com').has('*.evil.com'));
ok('점 시작 항목은 무시', !parseAllowedHosts('.evil.com').has('.evil.com'));
ok('환경변수 확장은 정확 호스트만', parseAllowedHosts('cdn2.example.kr').has('cdn2.example.kr'));

const neverResolve = async () => { throw new Error('resolve should not be called'); };
const denyCases = [
  ['비허용 도메인', 'https://evil.example.com/a.jpg'],
  ['서브도메인 유사(endsWith 우회 시도)', 'https://cdn-banana.bizhost.kr.evil.com/a.jpg'],
  ['접두 유사', 'https://evilcdn-banana.bizhost.kr/a.jpg'],
  ['10진수 IP 표기', 'http://2130706433/a.jpg'],
  ['16진수 IP 표기', 'http://0x7f000001/a.jpg'],
  ['IPv4 리터럴 루프백', 'http://127.0.0.1/a.jpg'],
  ['IPv6 사설 리터럴', 'http://[fc00::1]/a.jpg'],
  ['메타데이터 IP', 'http://169.254.169.254/latest/meta-data/'],
  ['DNS 재바인딩 이름', 'http://127.0.0.1.nip.io/a.jpg'],
  ['file 스킴', 'file:///etc/passwd'],
  ['비표준 포트', 'https://cdn-banana.bizhost.kr:8080/a.jpg'],
];
for (const [label, url] of denyCases) {
  const r = await fetchImageBytes(url, { resolveHost: neverResolve, useCache: false });
  ok(`거부: ${label}`, 'error' in r && r.status === 400);
}

// DNS가 사설 IP를 반환하면 차단(재바인딩 완화 — 완전 차단은 아님)
const rPrivateDns = await fetchImageBytes('https://cdn-banana.bizhost.kr/a.jpg', {
  resolveHost: async () => ['10.0.0.9'], useCache: false,
});
ok('거부: allowlist 호스트가 사설 IP로 해석', 'error' in rPrivateDns && rPrivateDns.status === 400);

// ── 3. 로컬 가짜 서버: 리다이렉트 / MIME / 용량 ─────────────────────────────
console.log('[4/4] 로컬 가짜 서버');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;
  if (p === '/ok.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(JPEG); return; }
  if (p === '/evil.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg/>'); return; }
  if (p === '/text') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html/>'); return; }
  if (p === '/redir-external') { res.writeHead(302, { Location: 'http://evil.example.com/a.jpg' }); res.end(); return; }
  if (p === '/redir-meta') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/' }); res.end(); return; }
  if (p === '/redir-rel') { res.writeHead(302, { Location: '/ok.jpg' }); res.end(); return; }
  if (p.startsWith('/loop')) {
    const n = Number(u.searchParams.get('n') || '0');
    res.writeHead(302, { Location: `/loop?n=${n + 1}` }); res.end(); return;
  }
  if (p === '/redir-noloc') { res.writeHead(302); res.end(); return; }
  if (p === '/big-declared') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': String(50 * 1024 * 1024) });
    res.end(Buffer.alloc(1024)); return;
  }
  if (p === '/big-stream') {
    // Content-Length 없이(chunked) 상한 초과 스트리밍
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    let sent = 0;
    const chunk = Buffer.alloc(64 * 1024, 1);
    const push = () => {
      while (sent < 3 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) { res.once('drain', push); return; } }
      res.end();
    };
    push();
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

// 기본 포트 정책(80/443)에서는 로컬 서버 포트가 거부되어야 한다.
const rPort = await fetchImageBytes(`${base}/ok.jpg`, {
  allowedHosts: ['127.0.0.1'], resolveHost: neverResolve, useCache: false,
});
ok('기본 포트 정책은 비표준 포트를 거부', 'error' in rPort && rPort.status === 400);

// 나머지 흐름은 포트를 명시 허용해 실제로 검증한다.
const o = {
  allowedHosts: ['127.0.0.1'],
  allowedPorts: [port],
  resolveHost: neverResolve,
  useCache: false,
  maxRedirects: 2,
  maxBytes: 1024 * 1024,
  timeoutMs: 8000,
};

const rOk = await fetchImageBytes(`${base}/ok.jpg`, o);
ok('정상 JPEG 통과', !('error' in rOk) && rOk.contentType === 'image/jpeg' && rOk.buffer.length === JPEG.length);

const rSvg = await fetchImageBytes(`${base}/evil.svg`, o);
ok('SVG 거부', 'error' in rSvg && rSvg.status === 422);

const rText = await fetchImageBytes(`${base}/text`, o);
ok('비이미지 MIME 거부', 'error' in rText && rText.status === 422);

const rRedirExt = await fetchImageBytes(`${base}/redir-external`, o);
ok('리다이렉트 → 비허용 호스트 거부', 'error' in rRedirExt && rRedirExt.status === 400);

const rRedirMeta = await fetchImageBytes(`${base}/redir-meta`, o);
ok('리다이렉트 → 메타데이터 IP 거부', 'error' in rRedirMeta && rRedirMeta.status === 400);

const rRedirRel = await fetchImageBytes(`${base}/redir-rel`, o);
ok('상대 Location 정상 처리', !('error' in rRedirRel) && rRedirRel.contentType === 'image/jpeg');

const rLoop = await fetchImageBytes(`${base}/loop?n=0`, o);
ok('리다이렉트 홉 수 초과 거부', 'error' in rLoop && rLoop.status === 422);

const rNoLoc = await fetchImageBytes(`${base}/redir-noloc`, o);
ok('Location 없는 리다이렉트 거부', 'error' in rNoLoc && rNoLoc.status === 422);

const rBigDeclared = await fetchImageBytes(`${base}/big-declared`, o);
ok('Content-Length 사전검사로 거부', 'error' in rBigDeclared && rBigDeclared.status === 422);

const rBigStream = await fetchImageBytes(`${base}/big-stream`, o);
ok('Content-Length 없이도 스트리밍 중 상한 거부', 'error' in rBigStream && rBigStream.status === 422);

// 캐시: 같은 URL 2회 호출 시 두 번째는 캐시 히트
const c1 = await fetchImageBytes(`${base}/ok.jpg`, { ...o, useCache: true, nowMs: 1000 });
const c2 = await fetchImageBytes(`${base}/ok.jpg`, { ...o, useCache: true, nowMs: 2000 });
ok('캐시 미스 → 히트', !('error' in c1) && !c1.fromCache && !('error' in c2) && c2.fromCache === true);
const c3 = await fetchImageBytes(`${base}/ok.jpg`, { ...o, useCache: true, nowMs: 1000 + 6 * 60 * 1000 });
ok('캐시 TTL 만료 후 재요청', !('error' in c3) && !c3.fromCache);

server.close();
rmSync(outDir, { recursive: true, force: true });

// ── 4. rate limit ───────────────────────────────────────────────────────────
const t0 = 1_000_000;
let allowedCount = 0;
for (let i = 0; i < 130; i += 1) if (consumeRateLimit('1.2.3.4', t0)) allowedCount += 1;
ok('rate limit: 분당 120건까지 허용', allowedCount === 120);
ok('rate limit: 다른 IP는 독립', consumeRateLimit('5.6.7.8', t0) === true);
ok('rate limit: 창이 지나면 회복', consumeRateLimit('1.2.3.4', t0 + 61_000) === true);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
