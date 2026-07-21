// 상세페이지 생성기(detailBuilder) 서버 게이트웨이 — 동적 라우트 1칸으로 통합.
// 현재 액션: image-base64(엑셀 CDN URL 이미지를 서버가 base64로 변환 → export 캔버스 CORS taint 회피).
// 향후 [3] 이미지 파이프라인(분할 등) 서버 작업도 이 게이트웨이에 액션으로 추가한다.
// Vercel Hobby 함수 예산(≤12) 절약: 새 기능은 개별 라우트 대신 여기 액션으로 붙일 것.

import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { fetchImageBytes, consumeRateLimit } from '../_shared/detailImageFetch.js';

interface ExtendedRequest extends IncomingMessage {
  body?: Record<string, unknown>;
}

// 동적 라우트 마지막 경로 세그먼트(action) — 기존 api/marketing/[action].ts와 동일 방식.
// (raw IncomingMessage 핸들러에선 req.query가 신뢰되지 않을 수 있어 URL 경로에서 직접 파싱)
const actionOf = (req: ExtendedRequest): string => {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return '';
  }
};

// req.url 쿼리스트링에서 파라미터 하나를 안전하게 뽑는다.
const queryParam = (req: ExtendedRequest, key: string): string => {
  try {
    return new URL(req.url ?? '/', 'http://localhost').searchParams.get(key) ?? '';
  } catch {
    return '';
  }
};

// [SEC-03] 무인증 공개 라우트라 남용 비용을 줄이기 위한 최소 제한.
// 인스턴스 로컬이므로 전역 보장은 아니다(서버 스토어 도입 시 보완).
const clientKeyOf = (req: ExtendedRequest): string => {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = (raw || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
};

export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  const action = actionOf(req);

  if (action === 'image-base64' || action === 'image-proxy') {
    if (!consumeRateLimit(clientKeyOf(req))) {
      return sendErrorResponse(res, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }
  }

  switch (action) {
    // export(html-to-image)용: CDN URL → base64 data URL. 작은 이미지에 적합.
    case 'image-base64': {
      if (req.method !== 'POST') {
        return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.', 405);
      }
      const body = (req.body || {}) as { url?: string };
      const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!rawUrl) return sendErrorResponse(res, 'BAD_REQUEST', 'url이 필요합니다.', 400);

      const result = await fetchImageBytes(rawUrl);
      if ('error' in result) {
        return sendErrorResponse(res, 'IMAGE_FETCH_FAILED', result.error, result.status);
      }
      const dataUrl = `data:${result.contentType};base64,${result.buffer.toString('base64')}`;
      return sendOkResponse(res, { dataUrl });
    }
    // 자동분할용: CDN 이미지를 원본 바이트 그대로 스트리밍(same-origin) → 캔버스 taint 없이 픽셀 읽기 가능.
    //   base64 JSON(약 +37% 팽창)로 인한 응답 크기 한계를 피한다. GET ?url=...
    case 'image-proxy': {
      if (req.method !== 'GET') {
        return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'GET 요청만 허용됩니다.', 405);
      }
      const rawUrl = queryParam(req, 'url').trim();
      if (!rawUrl) return sendErrorResponse(res, 'BAD_REQUEST', 'url 쿼리가 필요합니다.', 400);

      const result = await fetchImageBytes(rawUrl);
      if ('error' in result) {
        return sendErrorResponse(res, 'IMAGE_FETCH_FAILED', result.error, result.status);
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.end(result.buffer);
      return;
    }
    default:
      return sendErrorResponse(res, 'UNKNOWN_ACTION', `알 수 없는 detail 액션: ${action}`, 404);
  }
}
