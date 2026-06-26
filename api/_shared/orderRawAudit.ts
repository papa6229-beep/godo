// Order_Search raw 응답 "구조 감사(audit)" + Order_Search 전용 PII 마스킹
//
// 목적:
//   실제/합성 Order_Search.php raw 응답의 "shape"를 PII 없이 안전하게 비교/기록한다.
//   - auditOrderSearchRawShape(): 값(PII)을 일절 담지 않고 타입/위치/카운트만 보고.
//   - maskOrderSearchPii(): 부득이 raw를 로그/요약해야 할 때 PII 키를 마스킹한 사본 반환.
//
// 보안:
//   - 본 모듈은 raw 원문 PII를 절대 반환/로그하지 않는다(audit 보고서는 값 미포함).
//   - 마스킹은 기존 piiMaskGuard 원시 함수(maskName/maskPhone/maskEmail/maskAddress) 재사용.

import { maskName, maskPhone, maskEmail, maskAddress } from './piiMaskGuard.js';

// 컬렉션 필드의 형태
export type CollectionKind = 'single' | 'array' | 'missing';
// 날짜필드 위치
export type DateFieldLocation = 'header' | 'line' | 'both' | 'absent';
// 수치필드 표현형
export type NumericFieldType = 'number' | 'string' | 'absent';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const kindOf = (v: unknown): CollectionKind => {
  if (v === undefined || v === null) return 'missing';
  if (Array.isArray(v)) return 'array';
  if (isObj(v)) return 'single';
  return 'missing';
};

const firstOf = (v: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(v)) return v.find(isObj) as Record<string, unknown> | undefined;
  return isObj(v) ? v : undefined;
};

const numTypeOf = (v: unknown): NumericFieldType => {
  if (v === undefined || v === null || v === '') return 'absent';
  if (typeof v === 'number') return 'number';
  return 'string';
};

// 상태 구동 날짜필드 — 헤더 vs 라인 위치 확인 대상
const DATE_FIELDS = ['paymentDt', 'invoiceDt', 'deliveryDt', 'deliveryCompleteDt', 'finishDt', 'cancelDt'] as const;
// 표현형 확인할 수치필드(헤더/라인 혼합)
const NUMERIC_HEADER_FIELDS = ['settlePrice', 'totalGoodsPrice', 'totalDeliveryCharge', 'orderGoodsCnt', 'memNo'] as const;
const NUMERIC_LINE_FIELDS = ['goodsNo', 'goodsCnt', 'goodsPrice'] as const;

export interface RawShapeReport {
  hasCode: boolean;
  hasMsg: boolean;
  hasLastOrder: boolean;
  orderDataKind: CollectionKind;
  orderCount: number;
  sample?: {
    orderGoodsDataKind: CollectionKind;
    orderInfoDataKind: CollectionKind;
    orderDeliveryDataKind: CollectionKind;
    claimDataOnHeaderKind: CollectionKind; // 헤더 레벨 claimData
    claimDataOnLineKind: CollectionKind; // 첫 라인 레벨 claimData
    lineCount: number;
    dateFieldLocations: Record<string, DateFieldLocation>;
    numericHeaderTypes: Record<string, NumericFieldType>;
    numericLineTypes: Record<string, NumericFieldType>;
  };
}

// raw 응답(또는 파싱 root)에서 order_data를 안전 추출
const pickOrderData = (resp: unknown): unknown => {
  if (!isObj(resp)) return undefined;
  if ('order_data' in resp) return resp['order_data'];
  // 파싱 root가 한 단계 감싸진 경우 방어적 탐색(예: body.return.order_data)
  for (const v of Object.values(resp)) {
    if (isObj(v) && 'order_data' in v) return (v as Record<string, unknown>)['order_data'];
  }
  return undefined;
};

// 구조 감사 — PII 값은 절대 포함하지 않는다(타입/위치/카운트만).
export function auditOrderSearchRawShape(resp: unknown): RawShapeReport {
  const root = isObj(resp) ? resp : {};
  const orderData = pickOrderData(resp);
  const orderDataKind = kindOf(orderData);
  const orderArray = Array.isArray(orderData) ? orderData : isObj(orderData) ? [orderData] : [];

  const report: RawShapeReport = {
    hasCode: 'code' in root,
    hasMsg: 'msg' in root,
    hasLastOrder: 'lastOrder' in root,
    orderDataKind,
    orderCount: orderArray.length
  };

  const sample = firstOf(orderData);
  if (!sample) return report;

  const line = firstOf(sample['orderGoodsData']);
  const dateFieldLocations: Record<string, DateFieldLocation> = {};
  for (const f of DATE_FIELDS) {
    const onHeader = sample[f] !== undefined && sample[f] !== '';
    const onLine = !!line && line[f] !== undefined && line[f] !== '';
    dateFieldLocations[f] = onHeader && onLine ? 'both' : onHeader ? 'header' : onLine ? 'line' : 'absent';
  }

  const numericHeaderTypes: Record<string, NumericFieldType> = {};
  for (const f of NUMERIC_HEADER_FIELDS) numericHeaderTypes[f] = numTypeOf(sample[f]);
  const numericLineTypes: Record<string, NumericFieldType> = {};
  for (const f of NUMERIC_LINE_FIELDS) numericLineTypes[f] = numTypeOf(line ? line[f] : undefined);

  report.sample = {
    orderGoodsDataKind: kindOf(sample['orderGoodsData']),
    orderInfoDataKind: kindOf(sample['orderInfoData']),
    orderDeliveryDataKind: kindOf(sample['orderDeliveryData']),
    claimDataOnHeaderKind: kindOf(sample['claimData']),
    claimDataOnLineKind: kindOf(line ? line['claimData'] : undefined),
    lineCount: Array.isArray(sample['orderGoodsData']) ? (sample['orderGoodsData'] as unknown[]).length : line ? 1 : 0,
    dateFieldLocations,
    numericHeaderTypes,
    numericLineTypes
  };
  return report;
}

// ── Order_Search 전용 PII 마스킹 ─────────────────────────────────────────────
// 키 의미별 마스킹 함수 매핑. 미지정 민감 키는 통째로 [MASKED].
const NAME_KEYS = new Set(['orderName', 'receiverName', 'ehRefundName', 'ehSettleName', 'depositor', 'visitName']);
const PHONE_KEYS = new Set(['orderPhone', 'orderCellPhone', 'receiverPhone', 'receiverCellPhone', 'visitPhone', 'receiverSafeNumber']);
const EMAIL_KEYS = new Set(['orderEmail']);
const ADDRESS_KEYS = new Set(['orderAddress', 'orderAddressSub', 'receiverAddress', 'receiverAddressSub', 'visitAddress']);
// 통째로 가리는 고민감 키(부분 노출도 회피)
const REDACT_KEYS = new Set(['orderIp', 'customIdNumber', 'ehRefundBankAccountNumber', 'ehRefundBankName', 'accountNumber', 'bankName', 'ehSettleBankAccountInfo']);

const maskValueByKey = (key: string, value: unknown): unknown => {
  if (typeof value !== 'string' || value.length === 0) {
    return REDACT_KEYS.has(key) ? '[MASKED]' : value;
  }
  if (NAME_KEYS.has(key)) return maskName(value);
  if (PHONE_KEYS.has(key)) return maskPhone(value);
  if (EMAIL_KEYS.has(key)) return maskEmail(value);
  if (ADDRESS_KEYS.has(key)) return maskAddress(value);
  if (REDACT_KEYS.has(key)) return '[MASKED]';
  return value;
};

// raw 응답(또는 임의 중첩 구조)의 PII 키를 깊이 우선으로 마스킹한 "사본"을 반환.
// 원본은 변경하지 않으며, 마스킹 대상이 아닌 값은 그대로 둔다.
export function maskOrderSearchPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskOrderSearchPii);
  if (isObj(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (NAME_KEYS.has(k) || PHONE_KEYS.has(k) || EMAIL_KEYS.has(k) || ADDRESS_KEYS.has(k) || REDACT_KEYS.has(k)) {
        out[k] = maskValueByKey(k, v);
      } else {
        out[k] = maskOrderSearchPii(v);
      }
    }
    return out;
  }
  return value;
}
