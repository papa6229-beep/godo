import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getProxyMockInventory } from '../_shared/mockProxyData.js';
import { maskRecordsList } from '../_shared/piiMaskGuard.js';

// GET /api/godomall/inventory
export default function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  try {
    const rawInventory = getProxyMockInventory();
    const { maskedRecords, maskedCount } = maskRecordsList(rawInventory);

    sendOkResponse(res, {
      records: maskedRecords,
      maskedPiiCount: maskedCount,
      productionLocked: true
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROXY_FETCH_ERROR', `Failed to fetch inventory via proxy: ${errMsg}`, 500);
  }
}
