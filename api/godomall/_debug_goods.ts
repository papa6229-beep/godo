import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, summarizeStructure, extractList } from '../_shared/godomallXmlParser.js';
import { mapGoodsList } from '../_shared/godomallMapper.js';
import { GOODS_LIST_KEYS } from '../_shared/godomallResource.js';

// GET /api/godomall/_debug_goods  (임시 진단용 — 구조/카운트만, 값 원문/인증키 미노출)
// Goods_Search 응답의 리스트 경로 · rawItemCount · 필드명 · mappedProductCount만 안전 노출.
// 진단 완료 후 제거 예정.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.', 405);
  }

  const config = getGodomallConfig();
  if (!isLiveMode(config)) {
    return sendOkResponse(res, { live: false, mode: config.mode, note: 'Not in live mode; no live call made.' });
  }

  try {
    const call = await postGodomall('/goods/Goods_Search.php', { page: 1, size: 100 }, config);
    if (!call.ok || !call.xml) {
      return sendOkResponse(res, { live: true, mode: config.mode, callOk: false, error: call.error });
    }

    const parsed = parseGodomallXml(call.xml);
    const summary = summarizeStructure(parsed.root, GOODS_LIST_KEYS, { code: parsed.code, msg: parsed.msg });
    const list = extractList(parsed.root, GOODS_LIST_KEYS);
    const mapped = mapGoodsList(list);

    return sendOkResponse(res, {
      live: true,
      mode: config.mode,
      callOk: true,
      xmlByteLength: call.xml.length,
      ...summary,
      mappedProductCount: mapped.length,
      sampleMappedProduct: mapped.length > 0 ? mapped[0] : null
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendErrorResponse(res, 'DEBUG_ERROR', msg, 500);
  }
}
