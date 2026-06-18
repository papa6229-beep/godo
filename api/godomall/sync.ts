import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse';
import {
  getProxyMockOrders,
  getProxyMockInquiries,
  getProxyMockReviews,
  getProxyMockInventory,
  getProxyMockSales
} from '../_shared/mockProxyData';
import { maskRecordsList } from '../_shared/piiMaskGuard';

// Vercel Request Body 호환 확장 인터페이스
interface ExtendedRequest extends IncomingMessage {
  body?: {
    resourceType?: string;
    mode?: string;
  };
}

// POST /api/godomall/sync
export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only POST is accepted.', 405);
  }

  // Vercel Functions는 req.body에 파싱된 객체를 주입함
  const body = req.body || {};
  const resourceType = body.resourceType || 'all';
  const mode = body.mode || 'mock';

  if (mode !== 'mock') {
    return sendErrorResponse(res, 'BLOCKED_MODE', 'Production and Sandbox connection is locked. Only mock mode is allowed in this MVP.', 400);
  }

  try {
    if (resourceType === 'all') {
      const rawOrders = getProxyMockOrders();
      const rawInquiries = getProxyMockInquiries();
      const rawReviews = getProxyMockReviews();
      const rawInventory = getProxyMockInventory();
      const rawSales = getProxyMockSales();

      const { maskedRecords: orders, maskedCount: mcOrders } = maskRecordsList(rawOrders);
      const { maskedRecords: inquiries, maskedCount: mcInquiries } = maskRecordsList(rawInquiries);
      const { maskedRecords: reviews, maskedCount: mcReviews } = maskRecordsList(rawReviews);
      const { maskedRecords: inventory, maskedCount: mcInventory } = maskRecordsList(rawInventory);
      const { maskedRecords: sales, maskedCount: mcSales } = maskRecordsList(rawSales);

      const importedCount = orders.length + inquiries.length + reviews.length + inventory.length + sales.length;
      const maskedPiiCount = mcOrders + mcInquiries + mcReviews + mcInventory + mcSales;
      const warningCount = 11; // 가상 경고 건수 (Orders 4 + Inquiries 3 + Reviews 2 + Inventory 2)

      return sendOkResponse(res, {
        resourceType: 'all',
        records: { orders, inquiries, reviews, inventory, sales },
        importedCount,
        maskedPiiCount,
        warningCount,
        sourceType: 'api_proxy_mock'
      });
    }

    let rawRecords: Record<string, unknown>[] = [];
    let warningCount = 0;

    switch (resourceType) {
      case 'orders':
        rawRecords = getProxyMockOrders();
        warningCount = 4;
        break;
      case 'inquiries':
        rawRecords = getProxyMockInquiries();
        warningCount = 3;
        break;
      case 'reviews':
        rawRecords = getProxyMockReviews();
        warningCount = 2;
        break;
      case 'inventory':
        rawRecords = getProxyMockInventory();
        warningCount = 2;
        break;
      case 'sales':
        rawRecords = getProxyMockSales();
        warningCount = 0;
        break;
      default:
        return sendErrorResponse(res, 'INVALID_RESOURCE', `Resource type [${resourceType}] is not supported.`, 400);
    }

    const { maskedRecords, maskedCount } = maskRecordsList(rawRecords);

    sendOkResponse(res, {
      resourceType,
      records: maskedRecords,
      importedCount: maskedRecords.length,
      maskedPiiCount: maskedCount,
      warningCount,
      sourceType: 'api_proxy_mock'
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'SYNC_ERROR', `Internal Proxy Sync Error: ${errMsg}`, 500);
  }
}
