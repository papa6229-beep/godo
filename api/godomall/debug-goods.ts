import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, summarizeStructure, extractList } from '../_shared/godomallXmlParser.js';
import { mapGoodsList } from '../_shared/godomallMapper.js';
import { GOODS_LIST_KEYS } from '../_shared/godomallResource.js';

// GET /api/godomall/debug-goods  (임시 진단용 — 구조/카운트/필드명만, raw XML·인증키·값원문 미노출)
// 진단 완료 후 제거 예정. 언더스코어(_) 파일명은 Vercel이 라우트로 배포하지 않으므로 사용하지 않는다.
export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.', 405);
  }

  const config = getGodomallConfig();
  if (!isLiveMode(config)) {
    return sendOkResponse(res, { mode: config.mode, source: 'api_mock_fallback', note: 'Not in live mode; no live call made.' });
  }

  try {
    const call = await postGodomall('/goods/Goods_Search.php', { page: 1, size: 100 }, config);
    if (!call.ok || !call.xml) {
      return sendOkResponse(res, { mode: config.mode, source: 'api_mock_fallback', callOk: false, error: call.error });
    }

    const parsed = parseGodomallXml(call.xml);
    const summary = summarizeStructure(parsed.root, GOODS_LIST_KEYS, { code: parsed.code, msg: parsed.msg });
    const list = extractList(parsed.root, GOODS_LIST_KEYS);
    const mapped = mapGoodsList(list);
    const source = config.mode === 'real' ? 'api_proxy_real' : 'api_proxy_sandbox';

    // 요청된 필드만 반환 (raw XML / 인증키 / 값 원문 미노출)
    return sendOkResponse(res, {
      mode: config.mode,
      source,
      detectedListPath: summary.detectedListPath,
      rawItemCount: summary.rawItemCount,
      responseTotalCount: summary.responseTotalCount,
      mappedProductCount: mapped.length,
      sampleItemKeys: summary.sampleItemKeys,
      sampleMappedProduct: mapped.length > 0 ? mapped[0] : null
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendErrorResponse(res, 'DEBUG_ERROR', msg, 500);
  }
}
