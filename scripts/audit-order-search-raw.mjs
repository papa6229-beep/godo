#!/usr/bin/env node
/*
 * scripts/audit-order-search-raw.mjs — 로컬 전용 Order_Search raw 구조 감사 도구
 *
 * 목적:
 *   실제 고도몰 Order_Search.php raw 응답의 "shape"를 PII 없이 확인하기 위한 로컬 전용 스크립트.
 *   합성 raw(syntheticGodomallOrders.ts)와 비교하여 날짜필드 위치/배열·단일/숫자·문자 표현 등을
 *   실측 보정할 때 사용한다.
 *
 * 보안 (절대 준수):
 *   - public route 아님. 로컬에서만 실행한다(서버/브라우저에 노출 금지).
 *   - API 키는 환경변수에서만 읽는다. 하드코딩/로그 출력 금지.
 *   - raw PII 원문을 console에 출력하지 않는다(이름/전화/이메일/주소/IP/계좌는 마스킹).
 *   - 전체 raw JSON을 덤프하지 않는다. 구조 요약 + 마스킹 샘플만 출력한다.
 *
 * 사용:
 *   GODOMALL_API_MODE=real \
 *   GODOMALL_PARTNER_KEY=xxx GODOMALL_USER_KEY=yyy \
 *   node scripts/audit-order-search-raw.mjs
 *
 * 참고: 정식 in-app 감사 로직은 api/_shared/orderRawAudit.ts(구조)와 piiMaskGuard.ts(마스킹)에 있다.
 *       본 스크립트는 Node 런타임에서 즉시 실행 가능하도록 동등 로직을 self-contained로 둔다.
 */

import { XMLParser } from 'fast-xml-parser';

// ── 환경 설정 ────────────────────────────────────────────────────────────────
const mode = (process.env.GODOMALL_API_MODE || 'mock').trim().toLowerCase();
const partnerKey = (process.env.GODOMALL_PARTNER_KEY || '').trim();
const userKey = (process.env.GODOMALL_USER_KEY || '').trim();
const realBase = (process.env.GODOMALL_REAL_BASE_URL || 'https://openhub.godo.co.kr/godomall5').trim();
const sandboxBase = (process.env.GODOMALL_SANDBOX_BASE_URL || 'http://sbopenhub.godo.co.kr/godomall5').trim();
const activeBase = mode === 'sandbox' ? sandboxBase : realBase;

const configured = (mode === 'real' || mode === 'sandbox') && partnerKey.length > 0 && userKey.length > 0;

// ── CLI 옵션 (조회 0건 시 기간/건수 조정용) ──────────────────────────────────
//   --days=N | --size=N | --startDate=YYYY-MM-DD | --endDate=YYYY-MM-DD
// startDate/endDate가 주어지면 그 범위를, 아니면 days(기본 90)로 역산한다.
const argOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const optDays = Number.parseInt(argOf('days') || '', 10);
const optSize = Number.parseInt(argOf('size') || '', 10);
const opt = {
  days: Number.isFinite(optDays) && optDays > 0 ? optDays : 90,
  size: Number.isFinite(optSize) && optSize > 0 ? optSize : 3,
  startDate: argOf('startDate'),
  endDate: argOf('endDate')
};

if (!configured) {
  console.log('[audit] 실제 Order_Search 호출 불가 — 환경변수 미설정.');
  console.log('[audit] 필요한 환경변수:');
  console.log('  GODOMALL_API_MODE      = real | sandbox   (현재: ' + (mode || '(unset)') + ')');
  console.log('  GODOMALL_PARTNER_KEY   = <제휴사 고유키>   (현재: ' + (partnerKey ? 'set' : 'unset') + ')');
  console.log('  GODOMALL_USER_KEY      = <API 사용자 키>   (현재: ' + (userKey ? 'set' : 'unset') + ')');
  console.log('  (선택) GODOMALL_REAL_BASE_URL / GODOMALL_SANDBOX_BASE_URL');
  console.log('[audit] 키를 코드에 하드코딩하지 마세요. 위 환경변수로만 주입하세요.');
  process.exit(0);
}

// ── 날짜/숫자 판정 ───────────────────────────────────────────────────────────
const isValidDate = (v) => {
  const s = v == null ? '' : String(v).trim();
  if (!s) return false;
  if (/^0000[-/.]?0?0/.test(s)) return false;
  return /[1-9]/.test(s);
};
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const kindOf = (v) => (v == null ? 'missing' : Array.isArray(v) ? 'array' : isObj(v) ? 'single' : 'missing');
const firstOf = (v) => (Array.isArray(v) ? v.find(isObj) : isObj(v) ? v : undefined);
const numType = (v) => (v == null || v === '' ? 'absent' : typeof v === 'number' ? 'number' : 'string');

// ── PII 마스킹 (piiMaskGuard.ts 규칙 동등) ───────────────────────────────────
const maskName = (n) => {
  const t = String(n || '').trim();
  if (!t) return '';
  if (t.length <= 2) return t[0] + '*';
  return t[0] + '*'.repeat(t.length - 2) + t[t.length - 1];
};
const maskPhone = (t) =>
  String(t || '').replace(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g, (_, a, __, c) => `${a}-****-${c}`);
const maskEmail = (t) =>
  String(t || '').replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_, a, b) =>
    (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '*'.repeat(a.length - 2)) + '@' + b
  );
const maskAddress = (a) => {
  const parts = String(a || '').trim().split(/\s+/);
  return parts.length > 2 ? parts.slice(0, 2).join(' ') + ' ****' : '****';
};

const NAME_KEYS = new Set(['orderName', 'receiverName', 'depositor', 'ehRefundName', 'ehSettleName', 'visitName']);
const PHONE_KEYS = new Set(['orderPhone', 'orderCellPhone', 'receiverPhone', 'receiverCellPhone', 'visitPhone', 'receiverSafeNumber']);
const EMAIL_KEYS = new Set(['orderEmail']);
const ADDRESS_KEYS = new Set(['orderAddress', 'orderAddressSub', 'receiverAddress', 'receiverAddressSub', 'visitAddress']);
const REDACT_KEYS = new Set(['orderIp', 'customIdNumber', 'accountNumber', 'bankName', 'ehRefundBankName', 'ehRefundBankAccountNumber', 'ehSettleBankAccountInfo']);

// 주문번호 부분 마스킹 (앞4 + 가운데 * + 뒤4). 회원ID는 통째로 가린다.
const maskOrderNo = (v) => {
  const s = String(v ?? '');
  if (s.length <= 8) return s.replace(/.(?=.)/g, '*');
  return s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4);
};
const ORDERNO_KEYS = new Set(['orderNo']);
const ID_REDACT_KEYS = new Set(['memId']);

const maskPii = (value) => {
  if (Array.isArray(value)) return value.map(maskPii);
  if (isObj(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (NAME_KEYS.has(k)) out[k] = maskName(v);
      else if (PHONE_KEYS.has(k)) out[k] = maskPhone(v);
      else if (EMAIL_KEYS.has(k)) out[k] = maskEmail(v);
      else if (ADDRESS_KEYS.has(k)) out[k] = maskAddress(v);
      else if (REDACT_KEYS.has(k)) out[k] = '[MASKED]';
      else if (ORDERNO_KEYS.has(k)) out[k] = maskOrderNo(v);
      else if (ID_REDACT_KEYS.has(k)) out[k] = v ? '[MASKED_ID]' : v;
      else out[k] = maskPii(v);
    }
    return out;
  }
  return value;
};

// ── order_data 추출 (태그 위치 방어적) ───────────────────────────────────────
const pickOrderData = (node, depth = 0) => {
  if (depth > 8 || !isObj(node)) return undefined;
  if ('order_data' in node) return node['order_data'];
  for (const v of Object.values(node)) {
    const found = pickOrderData(v, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
};

// ── 실행 ─────────────────────────────────────────────────────────────────────
const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startStr = opt.startDate || fmt(new Date(Date.now() - opt.days * 24 * 60 * 60 * 1000));
const endStr = opt.endDate || fmt(new Date());

const url = activeBase.replace(/\/+$/, '') + '/order/Order_Search.php';
const form = new URLSearchParams();
form.set('partner_key', partnerKey);
form.set('key', userKey);
form.set('dateType', 'order');
form.set('startDate', startStr);
form.set('endDate', endStr);
form.set('size', String(opt.size));
form.set('sort', 'orderNo desc');

console.log(`[audit] mode=${mode} base=${activeBase} (키는 출력하지 않음)`);
console.log(`[audit] 조회: dateType=order ${startStr}~${endStr} size=${opt.size} sort='orderNo desc'`);

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/xml, text/xml, */*'
    },
    body: form.toString(),
    signal: controller.signal
  });
  clearTimeout(timer);

  if (!res.ok) {
    console.log(`[audit] HTTP ${res.status} — 본문에 키가 echo될 수 있어 상태코드만 출력합니다.`);
    process.exit(1);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseTagValue: false, // 실 서버 동등: 모든 값 문자열 유지
    parseAttributeValue: false
  });
  const root = parser.parse(xml);

  const orderData = pickOrderData(root);
  const orderArr = Array.isArray(orderData) ? orderData : isObj(orderData) ? [orderData] : [];
  console.log('\n=== RAW SHAPE (PII 미포함) ===');
  console.log('order_data kind:', kindOf(orderData), '| order count:', orderArr.length);

  const sample = firstOf(orderData);
  if (!sample) {
    console.log('[audit] 조회된 주문이 없습니다(기간 내 0건). 수기 주문 1건 생성 후 재시도하거나 기간을 넓히세요.');
    process.exit(0);
  }

  const line = firstOf(sample.orderGoodsData);
  console.log('orderGoodsData kind:', kindOf(sample.orderGoodsData));
  console.log('orderInfoData kind:', kindOf(sample.orderInfoData));
  console.log('orderDeliveryData kind:', kindOf(sample.orderDeliveryData));
  console.log('claimData(header) kind:', kindOf(sample.claimData), '| claimData(line) kind:', kindOf(line && line.claimData));

  console.log('\n=== 날짜필드 위치 (header / line / both / absent) ===');
  for (const f of ['paymentDt', 'invoiceDt', 'deliveryDt', 'deliveryCompleteDt', 'finishDt', 'cancelDt']) {
    const onH = isValidDate(sample[f]);
    const onL = !!line && isValidDate(line[f]);
    console.log(`  ${f}: ${onH && onL ? 'both' : onH ? 'header' : onL ? 'line' : 'absent'}`);
  }

  console.log('\n=== 수치필드 표현형 (number / string / absent) ===');
  for (const f of ['settlePrice', 'totalGoodsPrice', 'totalDeliveryCharge', 'orderGoodsCnt']) {
    console.log(`  header.${f}: ${numType(sample[f])}`);
  }
  for (const f of ['goodsNo', 'goodsCnt', 'goodsPrice']) {
    console.log(`  line.${f}: ${numType(line && line[f])}`);
  }

  console.log('\n=== 마스킹된 샘플 (PII 마스킹 적용, 1건) ===');
  console.log(JSON.stringify(maskPii(sample), null, 2));
} catch (err) {
  const name = err && err.name === 'AbortError' ? 'timeout(30s)' : 'request failed';
  console.log(`[audit] 호출 실패: ${name}`);
  process.exit(1);
}
