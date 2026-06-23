import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getSecretGuardStatus } from '../_shared/secretGuard.js';

// GET /api/godomall/health
// 키 원문은 절대 반환하지 않고, 존재 여부(boolean)와 해석된 모드만 노출한다.
export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET requests are accepted.', 405);
  }

  const secrets = getSecretGuardStatus();

  const data = {
    status: 'ready',
    mode: secrets.mode,
    // 작업 지시서 9번 표기 규격 (top-level boolean)
    hasPartnerKey: secrets.hasPartnerKey,
    hasUserKey: secrets.hasUserKey,
    hasRealBaseUrl: secrets.hasRealBaseUrl,
    hasSandboxBaseUrl: secrets.hasSandboxBaseUrl,
    // 상세 보안 상태 (프론트 커넥터 UI 호환)
    secrets,
    resources: ['orders', 'inquiries', 'reviews', 'inventory', 'sales', 'products'],
    safetyRules: [
      'API keys are never sent to the browser.',
      'Write actions are disabled (READ-only bridge).',
      'PII is masked on the server before response.'
    ]
  };

  sendOkResponse(res, data);
}
