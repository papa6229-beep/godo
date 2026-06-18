import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse';
import { getProxyMockReviews } from '../_shared/mockProxyData';
import { maskRecordsList } from '../_shared/piiMaskGuard';

// GET /api/godomall/reviews
export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const rawReviews = getProxyMockReviews();
    const { maskedRecords, maskedCount } = maskRecordsList(rawReviews);

    sendOkResponse(res, {
      records: maskedRecords,
      maskedPiiCount: maskedCount,
      productionLocked: true
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch reviews via proxy: ${errMsg}`, 500);
  }
}
