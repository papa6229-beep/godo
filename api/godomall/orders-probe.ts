import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { sendOkResponse, sendErrorResponse } from '../_shared/proxyResponse.js';
import { getGodomallConfig, isLiveMode, postGodomall } from '../_shared/godomallOpenApiClient.js';
import { parseGodomallXml, collectObjectArrays } from '../_shared/godomallXmlParser.js';

// ⚠️ 진단(임시) 라우트 — Order_Search.php 실응답의 "구조"만 확인하기 위함.
//   main merge 전에 제거하거나 dev-only로 제한해야 한다. (작업 지시서 §11)
//
// 안전 원칙:
//   - raw XML 미반환 / API key·partner_key·user_key 미반환
//   - 고객 개인정보 "값" 미반환 — 오직 필드 "이름(key)"과 개수만 반환
//   - ?confirm=structure 쿼리가 있을 때만 실호출 (오발동 방지)
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
      note: '구조 확인용 진단 라우트. ?confirm=structure 를 붙여야 실호출합니다. (필드 이름/개수만 반환, 값·XML·키 미노출)'
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

    // 가장 큰 객체 배열(=주문 리스트로 추정)의 "필드 이름"만 추출 (값은 절대 미반환)
    const sorted = arrays.slice().sort((a, b) => b.items.length - a.items.length);
    const top = sorted[0];
    const firstRecordKeys = top && top.items[0] ? Object.keys(top.items[0]) : [];

    sendOkResponse(res, {
      probe: 'orders',
      live: true,
      parseOk: parsed.ok,
      code: parsed.code,
      msg: parsed.msg,
      // 어떤 노드들이 배열로 잡혔는지 (경로 + 길이만)
      arrayNodes: arrays.map((a) => ({ path: a.path, leafKey: a.leafKey, length: a.items.length })),
      // 주문 리스트 추정 노드의 필드 이름 목록 (값 미포함 — 매핑 후보 확정용)
      listCandidatePath: top ? top.path : null,
      listCandidateCount: top ? top.items.length : 0,
      firstRecordKeys
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendErrorResponse(res, 'PROBE_ERROR', `Orders probe failed: ${errMsg}`, 500);
  }
}
