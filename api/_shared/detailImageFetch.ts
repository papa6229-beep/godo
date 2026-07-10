// 상세페이지 변환기 이미지 서버 fetch — Vercel 함수(api/detail/[action].ts)와
// vite dev 미들웨어(vite.config detailImageDevPlugin)가 공유하는 순수 로직.
// CDN 통이미지를 서버가 받아 base64/원본바이트로 → 브라우저 캔버스 CORS taint 회피(추출·export용).

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — 세로 통이미지 상한
const FETCH_TIMEOUT_MS = 12000;

// SSRF 방어: 사설/루프백/링크로컬 대상 차단(오픈 프록시 악용 방지 — 데모라도 최소 가드).
export const isBlockedHost = (host: string): boolean => {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // 링크로컬(클라우드 메타데이터 169.254.169.254 포함)
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
};

export type ImageBytesResult =
  | { buffer: Buffer; contentType: string }
  | { error: string; status: number };

// URL 이미지를 원본 바이트로 반환(가드·타임아웃·크기/타입 검증 포함).
export const fetchImageBytes = async (rawUrl: string): Promise<ImageBytesResult> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: '잘못된 URL 형식입니다.', status: 400 };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'http/https만 허용됩니다.', status: 400 };
  if (isBlockedHost(url.hostname)) return { error: '허용되지 않은 호스트입니다.', status: 400 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'godo-detail-builder/1.0', Accept: 'image/*' },
    });
    if (!resp.ok) return { error: `원본 이미지 응답 오류(${resp.status})`, status: 422 };
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return { error: `이미지가 아닙니다(${contentType || 'unknown'})`, status: 422 };
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength === 0) return { error: '빈 이미지입니다.', status: 422 };
    if (buffer.byteLength > MAX_BYTES) return { error: '이미지가 너무 큽니다(15MB 초과).', status: 422 };
    return { buffer, contentType };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { error: aborted ? '원본 이미지 요청 시간 초과' : '원본 이미지를 가져오지 못했습니다.', status: 502 };
  } finally {
    clearTimeout(timer);
  }
};
