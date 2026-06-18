import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse';
import { getProxyMockInquiries } from '../_shared/mockProxyData';
import { maskRecordsList } from '../_shared/piiMaskGuard';

// GET /api/godomall/inquiries
export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const rawInquiries = getProxyMockInquiries();
    const { maskedRecords, maskedCount } = maskRecordsList(rawInquiries);

    sendOkResponse(res, {
      records: maskedRecords,
      maskedPiiCount: maskedCount,
      productionLocked: true
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch inquiries via proxy: ${errMsg}`, 500);
  }
}
