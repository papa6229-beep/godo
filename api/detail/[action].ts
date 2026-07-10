// 상세페이지 생성기(detailBuilder) 서버 게이트웨이 — 동적 라우트 1칸으로 통합.
// 현재 액션: image-base64(엑셀 CDN URL 이미지를 서버가 base64로 변환 → export 캔버스 CORS taint 회피).
// 향후 [3] 이미지 파이프라인(분할 등) 서버 작업도 이 게이트웨이에 액션으로 추가한다.
// Vercel Hobby 함수 예산(≤12) 절약: 새 기능은 개별 라우트 대신 여기 액션으로 붙일 것.

import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';

interface ExtendedRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: Record<string, unknown>;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — 통이미지 세로 길이 고려한 상한
const FETCH_TIMEOUT_MS = 12000;

// SSRF 방어: 사설/루프백/링크로컬 대상 차단. (오픈 프록시로 악용 금지 — 데모라도 최소 가드)
const isBlockedHost = (host: string): boolean => {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  // IPv4 리터럴 사설/링크로컬/루프백 대역
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;   // 링크로컬(클라우드 메타데이터 169.254.169.254 포함)
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
};

// URL 이미지를 서버에서 받아 data URL(base64)로 변환한다.
const imageToBase64 = async (rawUrl: string): Promise<{ dataUrl: string } | { error: string }> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: '잘못된 URL 형식입니다.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'http/https만 허용됩니다.' };
  if (isBlockedHost(url.hostname)) return { error: '허용되지 않은 호스트입니다.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'godo-detail-builder/1.0', Accept: 'image/*' },
    });
    if (!resp.ok) return { error: `원본 이미지 응답 오류(${resp.status})` };
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return { error: `이미지가 아닙니다(${contentType || 'unknown'})` };
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength === 0) return { error: '빈 이미지입니다.' };
    if (buf.byteLength > MAX_BYTES) return { error: '이미지가 너무 큽니다(15MB 초과).' };
    return { dataUrl: `data:${contentType};base64,${buf.toString('base64')}` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { error: aborted ? '원본 이미지 요청 시간 초과' : '원본 이미지를 가져오지 못했습니다.' };
  } finally {
    clearTimeout(timer);
  }
};

export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  const action = String((req.query?.action as string) || '');

  switch (action) {
    case 'image-base64': {
      if (req.method !== 'POST') {
        return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.', 405);
      }
      const body = (req.body || {}) as { url?: string };
      const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!rawUrl) return sendErrorResponse(res, 'BAD_REQUEST', 'url이 필요합니다.', 400);

      const result = await imageToBase64(rawUrl);
      if ('error' in result) {
        return sendErrorResponse(res, 'IMAGE_FETCH_FAILED', result.error, 422);
      }
      return sendOkResponse(res, { dataUrl: result.dataUrl });
    }
    default:
      return sendErrorResponse(res, 'UNKNOWN_ACTION', `알 수 없는 detail 액션: ${action}`, 404);
  }
}
