import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, extractList } from '../_shared/godomallXmlParser.js';
import { getGodomallApiCapability } from '../_shared/godomallApiRegistry.js';
import {
  CODE_SEARCH_ALLOWLIST,
  CODE_LIST_KEYS,
  isAllowedCodeType,
  normalizeCommonCodes,
  getMockCommonCodes
} from '../_shared/godomallCodes.js';
import {
  CATEGORY_LIST_KEYS,
  BRAND_LIST_KEYS,
  normalizeCategories,
  normalizeBrands,
  getMockCategories,
  getMockBrands
} from '../_shared/godomallCatalog.js';

// GET /api/godomall/read?capability=<id>&...  — 고도몰 READ API 통합 게이트웨이 v1.
//
// 배경: Vercel Hobby는 배포당 Serverless Function 12개 한도. READ API를 파일 단위로 늘리면
//   한도에 반복 도달 → 모든 READ는 이 단일 게이트웨이로 capability 분기한다(파일 수 고정).
//
// 정책:
//   - capability를 godomallApiRegistry에서 확인. 미존재 → 400.
//   - WRITE/writeLocked capability → 403 (READ 게이트웨이는 WRITE 미허용).
//   - READ지만 핸들러 미구현 → 501 NOT_IMPLEMENTED.
//   - 키는 서버 환경변수 전용. raw XML 전문/키 미반환.

type ReadHandler = (
  req: IncomingMessage,
  res: VercelResponse,
  url: URL,
  config: ReturnType<typeof getGodomallConfig>
) => Promise<void>;

// ── capability=code_search 핸들러 (구 api/godomall/codes.ts 로직 이전) ────────
const CODE_SEARCH_PATH = '/common/Code_Search.php';
const handleCodeSearch: ReadHandler = async (_req, res, url, config) => {
  const codeType = (url.searchParams.get('codeType') || '').trim();
  const scmNo = url.searchParams.get('scmNo') || undefined;

  if (!isAllowedCodeType(codeType)) {
    return sendErrorResponse(
      res,
      'INVALID_CODE_TYPE',
      `codeType must be one of: ${CODE_SEARCH_ALLOWLIST.join(', ')}`,
      400
    );
  }

  if (isLiveMode(config)) {
    try {
      const params: Record<string, string | number> = { code_type: codeType };
      if (scmNo && /^\d+$/.test(scmNo)) params.scmNo = scmNo;
      const apiRes = await postGodomall(CODE_SEARCH_PATH, params, config);
      if (apiRes.ok && apiRes.xml) {
        const parsed = parseGodomallXml(apiRes.xml);
        if (parsed.ok) {
          const codes = normalizeCommonCodes(extractList(parsed.root, CODE_LIST_KEYS), codeType);
          return sendOkResponse(res, {
            capability: 'code_search',
            mode: config.mode,
            codeType,
            total: codes.length,
            codes,
            source: 'real'
          });
        }
        return sendOkResponse(res, {
          capability: 'code_search',
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
    } catch {
      // mock fallback로 진행
    }
  }

  const mockCodes = getMockCommonCodes(codeType);
  return sendOkResponse(res, {
    capability: 'code_search',
    mode: 'mock_fallback',
    codeType,
    total: mockCodes.length,
    codes: mockCodes,
    source: 'mock'
  });
};

// ── capability=category_search 핸들러 (Category_Search.php) ──────────────────
const CATEGORY_SEARCH_PATH = '/goods/Category_Search.php';
const handleCategorySearch: ReadHandler = async (_req, res, url, config) => {
  const cateCd = (url.searchParams.get('cateCd') || '').trim();
  if (isLiveMode(config)) {
    try {
      const params: Record<string, string | number> = {};
      if (cateCd) params.cateCd = cateCd;
      const apiRes = await postGodomall(CATEGORY_SEARCH_PATH, params, config);
      if (apiRes.ok && apiRes.xml) {
        const parsed = parseGodomallXml(apiRes.xml);
        if (parsed.ok) {
          const items = normalizeCategories(extractList(parsed.root, CATEGORY_LIST_KEYS));
          return sendOkResponse(res, { capability: 'category_search', mode: config.mode, total: items.length, items, source: 'real' });
        }
        return sendOkResponse(res, {
          capability: 'category_search', mode: config.mode, total: 0, items: [], source: 'real',
          apiSuccess: false, apiCode: parsed.code, apiMsg: parsed.msg
        });
      }
    } catch {
      // mock fallback
    }
  }
  const mock = getMockCategories();
  return sendOkResponse(res, { capability: 'category_search', mode: 'mock_fallback', total: mock.length, items: mock, source: 'mock' });
};

// ── capability=brand_search 핸들러 (Brand_Search.php) ────────────────────────
const BRAND_SEARCH_PATH = '/goods/Brand_Search.php';
const handleBrandSearch: ReadHandler = async (_req, res, url, config) => {
  const cateCd = (url.searchParams.get('cateCd') || '').trim();
  if (isLiveMode(config)) {
    try {
      const params: Record<string, string | number> = {};
      if (cateCd) params.cateCd = cateCd;
      const apiRes = await postGodomall(BRAND_SEARCH_PATH, params, config);
      if (apiRes.ok && apiRes.xml) {
        const parsed = parseGodomallXml(apiRes.xml);
        if (parsed.ok) {
          const items = normalizeBrands(extractList(parsed.root, BRAND_LIST_KEYS));
          return sendOkResponse(res, { capability: 'brand_search', mode: config.mode, total: items.length, items, source: 'real' });
        }
        return sendOkResponse(res, {
          capability: 'brand_search', mode: config.mode, total: 0, items: [], source: 'real',
          apiSuccess: false, apiCode: parsed.code, apiMsg: parsed.msg
        });
      }
    } catch {
      // mock fallback
    }
  }
  const mock = getMockBrands();
  return sendOkResponse(res, { capability: 'brand_search', mode: 'mock_fallback', total: mock.length, items: mock, source: 'mock' });
};

// 구현된 READ 핸들러 레지스트리. (board_* 등은 미구현 → 501)
const READ_HANDLERS: Record<string, ReadHandler> = {
  code_search: handleCodeSearch,
  category_search: handleCategorySearch,
  brand_search: handleBrandSearch
};

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.', 405);
  }

  let url: URL;
  try {
    url = new URL(req.url || '', 'http://localhost');
  } catch {
    return sendErrorResponse(res, 'BAD_REQUEST', 'Invalid request URL.', 400);
  }

  const capability = (url.searchParams.get('capability') || '').trim();
  if (!capability) {
    return sendErrorResponse(res, 'MISSING_CAPABILITY', 'Query param "capability" is required.', 400);
  }

  const cap = getGodomallApiCapability(capability);
  if (!cap) {
    return sendErrorResponse(res, 'UNKNOWN_CAPABILITY', `Unknown capability: ${capability}`, 400);
  }

  // READ 게이트웨이는 WRITE/writeLocked를 허용하지 않는다.
  if (cap.accessMode !== 'read' || cap.writeLocked) {
    return sendErrorResponse(
      res,
      'FORBIDDEN',
      `Capability "${capability}" is not a READ endpoint (accessMode=${cap.accessMode}, writeLocked=${cap.writeLocked}). WRITE는 Approval Runtime 전까지 차단.`,
      403
    );
  }

  const readHandler = READ_HANDLERS[capability];
  if (!readHandler) {
    return sendErrorResponse(
      res,
      'NOT_IMPLEMENTED',
      `READ capability "${capability}" is registered but not yet implemented in the gateway.`,
      501
    );
  }

  try {
    await readHandler(req, res, url, getGodomallConfig());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendErrorResponse(res, 'READ_ERROR', `READ gateway error: ${msg}`, 500);
  }
}
