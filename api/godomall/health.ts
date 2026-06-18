import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getSecretGuardStatus } from '../_shared/secretGuard.js';

// GET /api/godomall/health
export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET requests are accepted.', 405);
  }

  const secretsStatus = getSecretGuardStatus();

  const data = {
    status: 'ready',
    secrets: secretsStatus,
    resources: ['orders', 'inquiries', 'reviews', 'inventory', 'sales', 'products'],
    safetyRules: [
      'API keys are never sent to the browser.',
      'Write actions are disabled.',
      'PII is masked before response.'
    ]
  };

  sendOkResponse(res, data);
}
