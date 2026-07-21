// 상세페이지 변환기 이미지 서버 fetch — Vercel 함수(api/detail/[action].ts)와
// vite dev 미들웨어(vite.config detailImageDevPlugin)가 공유하는 순수 로직.
// CDN 통이미지를 서버가 받아 base64/원본바이트로 → 브라우저 캔버스 CORS taint 회피(추출·export용).
//
// [SEC-03] 이 라우트는 인증 없이 프로덕션에 공개되어 있다(기준선 감사 2026-07-21).
// 오픈 프록시/SSRF 남용을 막기 위한 다층 방어:
//   1) 호스트 allowlist(정확 일치) — endsWith/와일드카드 금지
//   2) 리다이렉트 수동 처리 — 매 홉마다 전 검사 재실행 + 홉 수 제한
//   3) DNS 조회 결과 IP 검사 — 사설/loopback/link-local/CGNAT/IPv4-mapped/IPv6 예약 차단
//   4) MIME allowlist(래스터만) — SVG 차단(스크립트 내장 가능)
//   5) Content-Length 사전검사 + 스트리밍 중 바이트 상한(전량 수신 후 검사 금지)
//   6) 인스턴스 로컬 캐시 + rate limit
// ⚠️ 한계(정직하게 기록): (3)은 조회 시점과 연결 시점 사이의 DNS 재바인딩을 완전히 막지 못한다.
//    실질 방어는 (1)의 정확 호스트 allowlist다 — 공격자가 allowlist된 호스트의 DNS를 통제해야만 성립한다.
//    완전한 차단은 "해석된 IP로 직접 연결 + Host 헤더 고정"이 필요하며 이는 장기 보완 항목이다.
//    인증(관리자 세션)도 장기 보완 항목으로 남긴다.

import { lookup } from 'node:dns/promises';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — 세로 통이미지 상한
const FETCH_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 3;

// 실측(2026-07-21): test/*.xlsx 14개에서 추출한 이미지 URL 101건이 전부 이 호스트다.
// www.bananamall.co.kr 은 상품 페이지 링크(이미지 아님)이므로 제외한다.
const DEFAULT_ALLOWED_HOSTS = ['cdn-banana.bizhost.kr'];

// 운영 중 다른 몰 CDN이 필요하면 환경변수로 확장한다(쉼표 구분, 정확 호스트만).
export const parseAllowedHosts = (raw?: string): Set<string> => {
  const extra = (raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && !s.includes('*') && !s.startsWith('.'));
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...extra]);
};

// 래스터 이미지만 허용. SVG는 스크립트를 품을 수 있어 명시적으로 제외한다.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif']);

// ── IP 정책 ──────────────────────────────────────────────────────────────────
const blockedIpv4 = (ip: string): boolean => {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const n = parts.map((p) => Number(p));
  if (n.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return true;
  const [a, b] = n;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 사설
  if (a === 127) return true;                     // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true;        // link-local(클라우드 메타데이터 169.254.169.254 포함)
  if (a === 172 && b >= 16 && b <= 31) return true; // 사설
  if (a === 192 && b === 0) return true;          // 192.0.0.0/24, 192.0.2.0/24(TEST-NET-1)
  if (a === 192 && b === 168) return true;        // 사설
  if (a === 198 && (b === 18 || b === 19)) return true; // 벤치마킹
  if (a === 198 && b === 51) return true;         // TEST-NET-2
  if (a === 203 && b === 0) return true;          // TEST-NET-3
  if (a >= 224) return true;                      // 멀티캐스트/예약/브로드캐스트
  return false;
};

// IPv6 문자열을 8개 그룹(16비트)으로 확장. 실패하면 null.
const expandIpv6 = (raw: string): number[] | null => {
  const s = raw.split('%')[0].toLowerCase();
  if (!s.includes(':')) return null;
  let head = s;
  let embeddedV4: number[] | null = null;
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = tail.split('.').map((p) => Number(p));
    if (v4.length !== 4 || v4.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return null;
    embeddedV4 = v4;
    head = s.slice(0, lastColon + 1) + '0:0';
  }
  const dbl = head.split('::');
  if (dbl.length > 2) return null;
  const toGroups = (part: string): number[] =>
    part.length === 0 ? [] : part.split(':').map((g) => (g === '' ? NaN : parseInt(g, 16)));
  const left = toGroups(dbl[0]);
  const right = dbl.length === 2 ? toGroups(dbl[1]) : [];
  if ([...left, ...right].some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  let groups: number[];
  if (dbl.length === 2) {
    const fill = 8 - (left.length + right.length);
    if (fill < 0) return null;
    groups = [...left, ...new Array(fill).fill(0), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return null;
  if (embeddedV4) {
    groups[6] = (embeddedV4[0] << 8) | embeddedV4[1];
    groups[7] = (embeddedV4[2] << 8) | embeddedV4[3];
  }
  return groups;
};

const blockedIpv6 = (ip: string): boolean => {
  const g = expandIpv6(ip);
  if (!g) return true; // 파싱 실패는 차단(fail-closed)
  const isZero = g.every((x) => x === 0);
  if (isZero) return true;                                   // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true;              // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true;              // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true;              // ff00::/8 멀티캐스트
  if (first === 0x2001 && g[1] === 0x0db8) return true;      // 문서용 2001:db8::/32
  if (first === 0x0064 && g[1] === 0xff9b) return true;      // NAT64 64:ff9b::/96
  // IPv4-mapped(::ffff:a.b.c.d) / IPv4-compatible(::a.b.c.d) → 내장 v4를 그대로 검사
  const v4mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const v4compat = g.slice(0, 6).every((x) => x === 0);
  if (v4mapped || v4compat) {
    const a = (g[6] >> 8) & 0xff, b = g[6] & 0xff, c = (g[7] >> 8) & 0xff, d = g[7] & 0xff;
    return blockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
};

export const isBlockedAddress = (ip: string): boolean =>
  ip.includes(':') ? blockedIpv6(ip) : blockedIpv4(ip);

// 호스트 문자열이 곧바로 IP 리터럴인 경우(10진수 IP 등 표기 우회 포함) 차단 판단.
const literalIpBlocked = (host: string): boolean | null => {
  const h = host.replace(/^\[|\]$/g, '');
  if (/^\d+$/.test(h)) return true;                       // 10진수 IP 표기(2130706433 등) — 항상 차단
  if (/^0[xX][0-9a-fA-F]+$/.test(h)) return true;         // 16진수 표기
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return blockedIpv4(h);
  if (h.includes(':')) return blockedIpv6(h);
  return null; // IP 리터럴이 아님 → DNS 조회 필요
};

// ── 캐시 / rate limit (인스턴스 로컬) ───────────────────────────────────────
// ⚠️ 서버리스라 인스턴스마다 별도다. 전역 보장이 아니라 "반복 호출 비용 완화"용이며,
//    전역 제한은 서버 스토어 도입 시 보완한다.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
type CacheEntry = { buffer: Buffer; contentType: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;

const cacheGet = (key: string, nowMs: number): CacheEntry | null => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= nowMs) { cache.delete(key); cacheBytes -= hit.buffer.byteLength; return null; }
  return hit;
};

const cachePut = (key: string, entry: CacheEntry): void => {
  if (entry.buffer.byteLength > CACHE_MAX_BYTES) return;
  cache.set(key, entry);
  cacheBytes += entry.buffer.byteLength;
  for (const [k, v] of cache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    cache.delete(k);
    cacheBytes -= v.buffer.byteLength;
  }
};

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 120; // 분당 요청 수(인스턴스 기준). 상품 1건 변환이 통이미지 수십 장을 부르므로 여유를 둔다.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const consumeRateLimit = (clientKey: string, nowMs: number = Date.now()): boolean => {
  const key = clientKey || 'unknown';
  const cur = rateBuckets.get(key);
  if (!cur || cur.resetAt <= nowMs) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + RATE_WINDOW_MS });
    if (rateBuckets.size > 1000) {
      for (const [k, v] of rateBuckets) { if (v.resetAt <= nowMs) rateBuckets.delete(k); }
    }
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count += 1;
  return true;
};

// ── 대상 검증 ────────────────────────────────────────────────────────────────
export type ImageBytesResult =
  | { buffer: Buffer; contentType: string; fromCache?: boolean }
  | { error: string; status: number };

export interface FetchImageOptions {
  allowedHosts?: Iterable<string>;
  /** 허용 포트. 기본은 표준 포트(80/443)만. 로컬 가짜 서버 검증 등에서만 확장한다. */
  allowedPorts?: Iterable<string | number>;
  /**
   * 사설/loopback 대역 허용. **기본 false(fail-closed)** 이며 로컬 가짜 서버 검증 전용이다.
   * 서버 라우트(api/detail/[action].ts)와 dev 미들웨어는 이 값을 절대 넘기지 않으므로
   * 요청 입력으로는 도달할 수 없다.
   */
  allowPrivateAddressesForTests?: boolean;
  /** 테스트 주입용 DNS 해석기. 기본은 node:dns/promises lookup(all). */
  resolveHost?: (hostname: string) => Promise<string[]>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  useCache?: boolean;
  nowMs?: number;
}

const defaultResolve = async (hostname: string): Promise<string[]> => {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => r.address);
};

type TargetCheck = { ok: true } | { ok: false; error: string; status: number };

const checkTarget = async (
  url: URL,
  allowed: Set<string>,
  allowedPorts: Set<string>,
  resolve: (h: string) => Promise<string[]>,
  allowPrivate: boolean
): Promise<TargetCheck> => {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'http/https만 허용됩니다.', status: 400 };
  }
  // 비표준 포트 금지(내부 서비스 포트 스캔 차단)
  if (url.port !== '' && !allowedPorts.has(url.port)) {
    return { ok: false, error: '허용되지 않은 포트입니다.', status: 400 };
  }
  const host = url.hostname.toLowerCase();
  // allowlist는 정확 일치만 — endsWith/와일드카드 금지. 10진수 IP·재바인딩 도메인 등
  // 표기 우회는 전부 여기서 먼저 걸린다(공격자는 allowlist를 변경할 수 없다).
  if (!allowed.has(host)) {
    return { ok: false, error: '허용되지 않은 이미지 호스트입니다.', status: 400 };
  }
  // 호스트가 IP 리터럴이면 DNS 조회 대상이 아니다. 단 fail-closed 원칙에 따라
  // 사설·loopback·link-local·메타데이터 등 차단 대역은 **allowlist에 들어 있어도 거부**한다
  // (운영자가 실수로 내부 IP를 allowlist에 넣어도 뚫리지 않게 한다).
  const literal = literalIpBlocked(host);
  if (literal === true && !allowPrivate) {
    return { ok: false, error: '허용되지 않은 주소입니다.', status: 400 };
  }
  if (literal !== null) return { ok: true };
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return { ok: false, error: '호스트를 확인하지 못했습니다.', status: 400 };
  }
  if (addresses.length === 0) return { ok: false, error: '호스트를 확인하지 못했습니다.', status: 400 };
  if (addresses.some((ip) => isBlockedAddress(ip))) {
    return { ok: false, error: '허용되지 않은 주소로 해석되었습니다.', status: 400 };
  }
  return { ok: true };
};

// ── 본체 ─────────────────────────────────────────────────────────────────────
export const fetchImageBytes = async (rawUrl: string, opts: FetchImageOptions = {}): Promise<ImageBytesResult> => {
  const allowed = opts.allowedHosts
    ? new Set([...opts.allowedHosts].map((h) => h.toLowerCase()))
    : parseAllowedHosts(process.env.DETAIL_IMAGE_ALLOWED_HOSTS);
  const allowedPorts = new Set(
    [...(opts.allowedPorts ?? ['80', '443'])].map((p) => String(p))
  );
  const allowPrivate = opts.allowPrivateAddressesForTests === true;
  const resolve = opts.resolveHost ?? defaultResolve;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const useCache = opts.useCache !== false;
  const nowMs = opts.nowMs ?? Date.now();

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { error: '잘못된 URL 형식입니다.', status: 400 };
  }

  const cacheKey = current.toString(); // 최초 요청 URL 기준(리다이렉트 후 주소가 아니라)
  if (useCache) {
    const hit = cacheGet(cacheKey, nowMs);
    if (hit) return { buffer: hit.buffer, contentType: hit.contentType, fromCache: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let hops = 0;
    // 리다이렉트를 수동으로 따라가며 매 홉마다 전 검사를 다시 수행한다.
    for (;;) {
      const check = await checkTarget(current, allowed, allowedPorts, resolve, allowPrivate);
      if (!check.ok) return { error: check.error, status: check.status };

      const resp = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'godo-detail-builder/1.0', Accept: 'image/*' },
      });

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        try { await resp.body?.cancel(); } catch { /* 무시 */ }
        if (!location) return { error: '리다이렉트 대상이 없습니다.', status: 422 };
        if (hops >= maxRedirects) return { error: '리다이렉트가 너무 많습니다.', status: 422 };
        hops += 1;
        let next: URL;
        try {
          next = new URL(location, current); // 상대 Location도 현재 URL 기준으로 해석
        } catch {
          return { error: '리다이렉트 주소가 올바르지 않습니다.', status: 422 };
        }
        current = next;
        continue;
      }

      if (!resp.ok) return { error: `원본 이미지 응답 오류(${resp.status})`, status: 422 };

      const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_MIME.has(contentType)) {
        return { error: `허용되지 않은 이미지 형식입니다(${contentType || 'unknown'})`, status: 422 };
      }

      // Content-Length 사전검사 — 받기 전에 거른다.
      const declared = Number(resp.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        try { await resp.body?.cancel(); } catch { /* 무시 */ }
        return { error: '이미지가 너무 큽니다(15MB 초과).', status: 422 };
      }

      if (!resp.body) return { error: '빈 이미지입니다.', status: 422 };

      // 스트리밍 중 상한 검사 — 전량 수신 후 검사하지 않는다.
      const reader = resp.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* 무시 */ }
          return { error: '이미지가 너무 큽니다(15MB 초과).', status: 422 };
        }
        chunks.push(Buffer.from(value));
      }
      if (total === 0) return { error: '빈 이미지입니다.', status: 422 };

      const buffer = Buffer.concat(chunks, total);
      if (useCache) cachePut(cacheKey, { buffer, contentType, expiresAt: nowMs + CACHE_TTL_MS });
      return { buffer, contentType };
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { error: aborted ? '원본 이미지 요청 시간 초과' : '원본 이미지를 가져오지 못했습니다.', status: 502 };
  } finally {
    clearTimeout(timer);
  }
};
