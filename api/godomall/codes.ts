import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, extractList } from '../_shared/godomallXmlParser.js';
import {
  CODE_SEARCH_ALLOWLIST,
  CODE_LIST_KEYS,
  isAllowedCodeType,
  normalizeCommonCodes,
  getMockCommonCodes
} from '../_shared/godomallCodes.js';

// GET /api/godomall/codes?codeType=<type>[&scmNo=N] — 고도몰 공통코드조회(Code_Search) READ v0.
//
// 서버에서만 키 사용. 정규화된 code list만 반환(raw XML/키 미반환). 공통코드 = PII none.
// 허용 code_type(§7.2): scm/imagePath/memberGroup/delivery/deliveryInfo/asInfo/refundInfo/
//   exchangeInfo/claimCode/claimPayment/claimBank/deliveryCompany/iconInfo.
const CODE_SEARCH_PATH = '/common/Code_Search.php';

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.', 405);
  }

  let codeType = '';
  let scmNo: string | undefined;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    codeType = (url.searchParams.get('codeType') || '').trim();
    scmNo = url.searchParams.get('scmNo') || undefined;
  } catch {
    // 무시 → 아래 검증에서 처리
  }

  // allowlist 밖/누락 → safe 400
  if (!isAllowedCodeType(codeType)) {
    return sendErrorResponse(
      res,
      'INVALID_CODE_TYPE',
      `codeType must be one of: ${CODE_SEARCH_ALLOWLIST.join(', ')}`,
      400
    );
  }

  const config = getGodomallConfig();

  // 라이브 호출
  if (isLiveMode(config)) {
    try {
      const params: Record<string, string | number> = { code_type: codeType };
      if (scmNo && /^\d+$/.test(scmNo)) params.scmNo = scmNo;
      const apiRes = await postGodomall(CODE_SEARCH_PATH, params, config);
      if (apiRes.ok && apiRes.xml) {
        const parsed = parseGodomallXml(apiRes.xml);
        if (parsed.ok) {
          const rawItems = extractList(parsed.root, CODE_LIST_KEYS);
          const codes = normalizeCommonCodes(rawItems, codeType);
          return sendOkResponse(res, {
            mode: config.mode,
            codeType,
            total: codes.length,
            codes,
            source: 'real'
          });
        }
        // 비성공 코드: mock으로 위장하지 않고 진단 반환
        return sendOkResponse(res, {
          mode: config.mode,
          codeType,
          total: 0,
          codes: [],
          source: 'real',
          apiSuccess: false,
          apiCode: parsed.code,
          apiMsg: parsed.msg
        });
      }
      // 호출 실패 → mock fallback로 진행
    } catch {
      // mock fallback로 진행
    }
  }

  // mock fallback (라이브 미설정/실패) — 반드시 source:'mock'으로 표시
  const mockCodes = getMockCommonCodes(codeType);
  return sendOkResponse(res, {
    mode: 'mock_fallback',
    codeType,
    total: mockCodes.length,
    codes: mockCodes,
    source: 'mock'
  });
}
