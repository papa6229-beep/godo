import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, collectObjectArrays, extractList } from '../_shared/godomallXmlParser.js';
import { ADMIN_ORDER_LIST_KEYS } from '../_shared/godomallResource.js';

// ⚠️ 진단(임시) 라우트 — Order_Search.php 실응답의 "구조"만 확인하기 위함.
//   main merge 전에 제거하거나 dev-only로 제한해야 한다. (작업 지시서 §11)
//
// 안전 원칙:
//   - raw XML 미반환 / API key·partner_key·user_key 미반환
//   - 고객 개인정보 "값" 미반환 — 오직 필드 "이름(key)"·타입·개수만 반환
//   - ?confirm=structure 쿼리가 있을 때만 실호출 (오발동 방지)

// 레코드의 각 필드를 값 노출 없이 (이름/타입/중첩 키)로만 기술
const describeRecord = (rec: Record<string, unknown>) =>
  Object.entries(rec).map(([key, v]) => {
    if (Array.isArray(v)) {
      const firstObj = v.find((x) => x && typeof x === 'object' && !Array.isArray(x)) as
        | Record<string, unknown>
        | undefined;
      return { key, type: `array(${v.length})`, childKeys: firstObj ? Object.keys(firstObj) : [] };
    }
    if (v && typeof v === 'object') {
      return { key, type: 'object', childKeys: Object.keys(v as Record<string, unknown>) };
    }
    return { key, type: typeof v };
  });

export default async function handler(req: IncomingMessage, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendErrorResponse(res, 'METHOD_NOT_ALLOWED', 'HTTP Method not allowed. Only GET is accepted.', 405);
  }

  let confirm = false;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    confirm = url.searchParams.get('confirm') === 'structure';
  } catch {
    // URL 파싱 실패 시 confirm=false 유지
  }

  if (!confirm) {
    return sendOkResponse(res, {
      probe: 'orders',
      note: '구조 확인용 진단 라우트. ?confirm=structure 를 붙여야 실호출합니다. (필드 이름/타입/개수만 반환, 값·XML·키 미노출)'
    });
  }

  try {
    const config = getGodomallConfig();
    if (!isLiveMode(config)) {
      return sendOkResponse(res, { probe: 'orders', live: false, note: 'live 모드가 아니므로 실호출하지 않았습니다.' });
    }

    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const apiRes = await postGodomall(
      '/order/Order_Search.php',
      { dateType: 'order', startDate: fmt(start), endDate: fmt(end), page: 1, size: 50 },
      config
    );
    if (!apiRes.ok || !apiRes.xml) {
      return sendOkResponse(res, { probe: 'orders', live: true, ok: false, error: apiRes.error || 'call failed' });
    }

    const parsed = parseGodomallXml(apiRes.xml);
    const arrays = collectObjectArrays(parsed.root);

    // orders-admin이 실제로 매핑 대상으로 잡는 레코드(extractList 결과)를 그대로 기술
    const list = extractList(parsed.root, ADMIN_ORDER_LIST_KEYS);
    const firstRecord = list[0] as Record<string, unknown> | undefined;

    sendOkResponse(res, {
      probe: 'orders',
      live: true,
      parseOk: parsed.ok,
      code: parsed.code,
      msg: parsed.msg,
      // 응답 최상위 봉투 키 (구조 파악용)
      rootKeys: Object.keys(parsed.root),
      // 배열로 접힌 노드들 (경로 + leafKey + 길이)
      arrayNodes: arrays.map((a) => ({ path: a.path, leafKey: a.leafKey, length: a.items.length })),
      // orders-admin이 매핑하는 레코드의 구조 (필드 이름/타입/중첩 키만, 값 미포함)
      mappedRecordCount: list.length,
      mappedRecordFields: firstRecord ? describeRecord(firstRecord) : []
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROBE_ERROR', `Orders probe failed: ${errMsg}`, 500);
  }
}
