import type { ServerResponse } from 'http';

// Vercel Serverless Function 응답 호환 인터페이스
export interface VercelResponse extends ServerResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
}

// 고유 요청 ID 생성
const generateRequestId = (): string => {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// 성공 응답 전송 헬퍼
export const sendOkResponse = (res: VercelResponse, data: unknown) => {
  const baseBody = {
    ok: true,
    timestamp: new Date().toISOString(),
    source: 'secure_proxy',
    mode: 'mock',
    requestId: generateRequestId()
  };

  const body = typeof data === 'object' && data !== null
    ? (Array.isArray(data) ? { ...baseBody, records: data } : { ...baseBody, ...data })
    : { ...baseBody, value: data };

  res.status(200).json(body);
};

// 에러 응답 전송 헬퍼 (민감 정보 노출 완전 배제)
export const sendErrorResponse = (res: VercelResponse, code: string, message: string, status = 400) => {
  const body = {
    ok: false,
    timestamp: new Date().toISOString(),
    source: 'secure_proxy',
    mode: 'mock',
    requestId: generateRequestId(),
    errorCode: code,
    errorMessage: message
  };

  res.status(status).json(body);
};

// 보안 강화 안전 정보 응답 헬퍼
export const sendSafetyResponse = (res: VercelResponse, message: string, data: unknown) => {
  const baseBody = {
    ok: true,
    timestamp: new Date().toISOString(),
    source: 'secure_proxy',
    mode: 'mock',
    requestId: generateRequestId(),
    safetyNote: message
  };

  const body = typeof data === 'object' && data !== null
    ? (Array.isArray(data) ? { ...baseBody, records: data } : { ...baseBody, ...data })
    : { ...baseBody, value: data };

  res.status(200).json(body);
};
