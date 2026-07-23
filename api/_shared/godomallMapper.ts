// 고도몰5 Open API 응답 -> GODO 내부 표준 중간 구조(Record<string,string>) 매퍼
//
// 설계 의도: 매퍼의 출력은 mockProxyData가 만드는 "중간 레코드 구조"와 동일하다.
// 그래야 기존 서버 PII 마스킹(maskRecordsList) + 프론트 정규화(buildOperationsSnapshot)
// 파이프라인을 한 줄도 바꾸지 않고 그대로 재사용할 수 있다.
//
// ⚠️ 주의: 아래 필드명 후보(FIELD CANDIDATES)는 고도몰5 공식 응답의 "추정값"이다.
// 첫 실제 응답(샌드박스/리얼)을 확인한 뒤 candidate 배열만 보정하면 된다.
// 임의 endpoint는 만들지 않으며, 매핑 후보만 점진 보정하는 것이 안전하다.

import { normalizeOrderData } from './godomallOrderNormalize.js';

type Raw = Record<string, unknown>;

// 여러 후보 키 중 처음 비어있지 않은 값을 문자열로 반환
const pick = (obj: Raw, candidates: string[], fallback = ''): string => {
  for (const key of candidates) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim().length > 0) {
      return String(v).trim();
    }
  }
  return fallback;
};

// 숫자/정수/불리언 정규화 (고도몰 플래그는 'y'/'n' 문자열)
const toNumber = (v: string): number => {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toInt = (v: string): number => {
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const toBool = (v: string): boolean => {
  const s = String(v).trim().toLowerCase();
  return s === 'y' || s === '1' || s === 'true';
};

// ---- 상품(Goods_Search) ----
// 출력: 상품/재고 파생용 중간 구조
export interface ProductIntermediate extends Record<string, string> {
  productName: string;
  optionName: string;
  price: string;
  status: string;
  stock: string;
  safetyStock: string;
}

export const mapGoodsList = (goods: Raw[]): ProductIntermediate[] => {
  return goods.map((g) => {
    const productName = pick(g, ['goodsNm', 'goodsName', 'goods_name', 'productName', 'goodsNmPc', 'scmNm']);
    const optionName = pick(g, ['optionName', 'optionNm', 'goodsOption', 'sno'], '단품');
    const price = pick(g, ['fixedPrice', 'goodsPrice', 'price', 'salePrice', 'goodsDiscountPrice'], '0');
    const status = pick(g, ['goodsDisplayFl', 'soldOutFl', 'sellFl', 'goodsState', 'status'], '판매중');
    const stock = pick(g, ['stockCnt', 'totalStock', 'stock', 'goodsCnt', 'invQty'], '0');
    const safetyStock = pick(g, ['safetyStock', 'minStock', 'soldOutLimit'], '5');
    return { productName, optionName, price, status, stock, safetyStock };
  });
};

// 상품 응답 -> 재고(inventory) 중간 구조 파생
export interface InventoryIntermediate extends Record<string, string> {
  productName: string;
  optionName: string;
  stock: string;
  safetyStock: string;
}

export const mapGoodsToInventory = (goods: Raw[]): InventoryIntermediate[] => {
  return mapGoodsList(goods).map((p) => ({
    productName: p.productName,
    optionName: p.optionName,
    stock: p.stock,
    safetyStock: p.safetyStock
  }));
};

// ---- 확정 Products 매퍼 (Goods_Search.php 실응답 기준) ----
// 필드명은 고도몰5 Goods_Search.php 실제 응답에서 확인된 값으로 고정한다.
// (type 별칭 사용 → Record<string,unknown> 할당 호환)
export type StandardProduct = {
  productId: string;       // goodsNo
  productCode: string;     // goodsCd
  productName: string;     // goodsNm
  price: number;           // goodsPrice
  fixedPrice: number;      // fixedPrice
  stock: number;           // totalStock
  stockEnabled: boolean;   // stockFl
  soldOut: boolean;        // soldOutFl
  displayPc: boolean;      // goodsDisplayFl
  displayMobile: boolean;  // goodsDisplayMobileFl
  sellPc: boolean;         // goodsSellFl
  sellMobile: boolean;     // goodsSellMobileFl
  categoryCode: string;    // cateCd
  allCategoryCode: string; // allCateCd
  brandCode: string;       // brandCd (브랜드조회 Brand_Search 라벨 조인용)
  registeredAt: string;    // regDt
  modifiedAt: string;      // modDt
  makerName: string;       // makerNm
  originName: string;      // originNm
  optionName: string;      // optionName
};

export const mapGoodsToProducts = (goods: Raw[]): StandardProduct[] => {
  return goods.map((g) => ({
    productId: pick(g, ['goodsNo']),
    productCode: pick(g, ['goodsCd']),
    productName: pick(g, ['goodsNm']),
    price: toNumber(pick(g, ['goodsPrice'], '0')),
    fixedPrice: toNumber(pick(g, ['fixedPrice'], '0')),
    stock: toInt(pick(g, ['totalStock'], '0')),
    stockEnabled: toBool(pick(g, ['stockFl'], '')),
    soldOut: toBool(pick(g, ['soldOutFl'], '')),
    displayPc: toBool(pick(g, ['goodsDisplayFl'], '')),
    displayMobile: toBool(pick(g, ['goodsDisplayMobileFl'], '')),
    sellPc: toBool(pick(g, ['goodsSellFl'], '')),
    sellMobile: toBool(pick(g, ['goodsSellMobileFl'], '')),
    categoryCode: pick(g, ['cateCd']),
    allCategoryCode: pick(g, ['allCateCd']),
    brandCode: pick(g, ['brandCd']),
    registeredAt: pick(g, ['regDt']),
    modifiedAt: pick(g, ['modDt']),
    makerName: pick(g, ['makerNm']),
    originName: pick(g, ['originNm']),
    optionName: pick(g, ['optionName'])
  }));
};

// ---- 주문(Order_Search) ----
// 출력: mockProxyData 주문 구조와 동일 (PII 원문 포함 -> 이후 maskRecordsList가 마스킹)
export interface OrderIntermediate extends Record<string, string> {
  orderNo: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  productName: string;
  optionName: string;
  quantity: string;
  paymentStatus: string;
  deliveryStatus: string;
  invoiceNo: string;
  amount: string;
}

// GODO-ORDER-MAPPING-01 (GREEN):
//   - 별도 평면 별칭표를 복붙하지 않고, 검증된 중첩 해석(interpretOrderRecord)을 재사용한다.
//   - **상류 근거가 없으면 값을 만들어내지 않는다**: 결제완료·배송대기·단품·수량1·금액0을
//     기본값으로 단정하지 않고 빈 문자열(미확인)로 보존한다.
//   - PII(customerName/Phone/Email/address)는 기존과 동일하게 원문을 담고,
//     응답 직전 maskRecordsList가 삭제/마스킹한다(마스킹 경계 불변 — 신규 노출 없음).
//   - 호출 측(resolveResource)은 매핑 **전에** normalizeOrderData로 유효 주문만 남긴다
//     → 유효 주문이 아니면 애초에 행 자체가 만들어지지 않는다.
export const mapOrderList = (orders: Raw[]): OrderIntermediate[] => {
  // 유효 주문이 아닌 것(빈 응답·메타 래퍼·{})은 **행 자체를 만들지 않는다**.
  // 호출부(resolveResource)도 같은 가드를 적용하지만, 매퍼 단독 호출에서도
  // 유령 행이 생기지 않도록 여기서도 닫는다(멱등 필터).
  return normalizeOrderData(orders).map((o) => {
    const v = interpretOrderRecord(o);
    return {
      orderNo: v.orderNo,
      orderDate: v.orderDate,
      // PII (마스킹 전 원문) — 응답 직후 maskRecordsList에서 제거/마스킹됨
      customerName: v.ordererName,
      customerPhone: v.phone,
      customerEmail: v.email,
      address: v.address,
      productName: v.productName,
      optionName: v.optionName,                                     // 근거 없으면 '' (단품 단정 금지)
      quantity: v.quantityRaw,                                      // 근거 없으면 '' (1 단정 금지)
      paymentStatus: v.hasStatusBasis ? (v.paid ? '결제완료' : '미결제') : '',
      deliveryStatus: v.hasDeliveryBasis ? v.deliveryStatus : '',
      invoiceNo: v.invoiceNo,
      // 상류에 금액 근거가 있으면 그대로(0원도 보존), 근거 자체가 없으면 '' (0 단정 금지)
      amount: v.hasAmountBasis ? String(v.totalAmount) : ''
    };
  });
};

// ---- 주문 관리자 화면용 매퍼 (Orders READ v0) ----
// 용도: 부서 업무 관장 > 상품관리팀 대시보드 등 "관리자 내부 운영 화면" 전용.
//   - 마스킹하지 않은 원본 고객정보를 포함한다 (관리자가 주문 처리에 필요).
//   - 외부 AI 전송/공개 화면/로그용이 아니다. (그쪽은 기존 mapOrderList + maskRecordsList 사용)
//   - type 별칭 → 서버 Record<string,unknown> 파이프라인 할당 호환.
//
// 실응답 구조(확인됨): data.return.order_data (단건이면 object) 안에
//   상위: orderNo, orderDate, totalGoodsPrice, totalDeliveryCharge, settlePrice,
//         settleKind, paymentDt, orderStatus, orderGoodsNm/Cnt(요약)
//   중첩 orderInfoData: orderName, receiverName, orderCellPhone, receiverAddress(+Sub)
//   중첩 orderGoodsData(object|array): goodsNm, goodsCnt, goodsPrice, goodsNo, goodsCd
// mock(평문 customerName/productName/amount 등)도 fallback 후보로 함께 처리한다.
export type StandardOrderAdmin = {
  orderId: string;
  orderNo: string;
  orderDate: string;
  ordererName: string;
  receiverName: string;
  phone: string;
  address: string;
  productName: string;
  quantity: number;
  productAmount: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryStatus: string;
  unpaid: boolean;       // 미결제/입금대기 계열이면 true
  undelivered: boolean;  // 배송 전(미배송)이면 true
};

// 중첩 객체 안전 접근 (orderInfoData / orderGoodsData)
const asRecord = (v: unknown): Raw | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : undefined;

// orderGoodsData는 단일 object 또는 (상품 여러 개면) array 로 올 수 있다 → 첫 객체 반환
const firstRecordOf = (v: unknown): Raw | undefined => {
  if (Array.isArray(v)) return v.find((x) => asRecord(x)) as Raw | undefined;
  return asRecord(v);
};

// 결제 여부 판단: 결제일시(paymentDt)가 유효하면 결제됨
const hasPaymentDate = (s: string): boolean => {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^0000[-/.]?0?0/.test(t)) return false; // 0000-00-00 류
  return /[1-9]/.test(t); // 실제 날짜면 0이 아닌 숫자 포함
};

// orderStatus(코드/텍스트) 보조 판단 — 결제 이후 단계인지
const isPaidStatus = (s: string): boolean => {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return false;
  if (/미결제|미입금|입금\s*대기|결제\s*대기|입금전|결제전/.test(t)) return false;
  if (/결제완료|입금완료|배송|구매확정|deliver|paid/.test(t)) return true;
  if (/^o\d/.test(t)) return false;        // o1: 입금대기(미결제)
  return /^[pdgsf]\d/.test(t);             // p/d/g/s/f 단계: 결제 이후
};

// 배송상태 해석 (orderStatus 코드/텍스트 + 결제여부)
const interpretDelivery = (s: string, paid: boolean): { deliveryStatus: string; undelivered: boolean } => {
  const t = String(s || '').trim().toLowerCase();
  if (/배송\s*완료|배송완료|구매확정/.test(t) || /^d2|^f\d|^g\d/.test(t)) {
    return { deliveryStatus: '배송완료', undelivered: false };
  }
  if (/배송\s*중|발송/.test(t) || /^d1/.test(t)) {
    return { deliveryStatus: '배송중', undelivered: false };
  }
  return { deliveryStatus: paid ? '배송 준비' : '배송 전', undelivered: true };
};

// ---- 주문 단건 공통 해석 (Order_Search 실응답 중첩 구조) ----
// GODO-ORDER-MAPPING-01: 관리자 매퍼(mapOrdersToAdmin)와 표시/AI용 매퍼(mapOrderList)가
// **같은 해석**을 쓰도록 공용화한다. 별칭표·상태 판정을 두 곳에 복붙하지 않는다.
// `has*Basis` 는 "상류에 그 값의 근거가 있었는가"이며, 근거 없는 값을 만들어내지 않기 위한 표식이다.
export interface OrderRecordView {
  orderId: string;
  orderNo: string;
  orderDate: string;
  productName: string;
  optionName: string;
  quantityRaw: string;
  quantity: number;
  invoiceNo: string;
  productAmount: number;
  deliveryFee: number;
  totalAmount: number;
  hasAmountBasis: boolean;
  hasStatusBasis: boolean;
  hasDeliveryBasis: boolean;
  paid: boolean;
  deliveryStatus: string;
  undelivered: boolean;
  paymentMethod: string;
  // PII 원문 — 관리자 경로만 그대로 사용. 표시/AI 경로는 maskRecordsList를 반드시 통과한다.
  ordererName: string;
  receiverName: string;
  phone: string;
  email: string;
  address: string;
}

export const interpretOrderRecord = (o: Raw): OrderRecordView => {
  // 중첩: 주문자/수령자 정보 + 상품 상세 (Order_Search 실응답 구조)
  const info = asRecord(o['orderInfoData']) ?? {};
  const goods = firstRecordOf(o['orderGoodsData']) ?? {};

  const orderNo = pick(o, ['orderNo', 'orderId', 'orderCd', 'order_no'], '');
  const orderDate = pick(o, ['orderDate', 'orderYmd', 'regDt', 'orderDt', 'order_date'], '');
  const paymentDt = pick(o, ['paymentDt', 'paymentDate', 'settleDt'], '');
  const orderStatus = pick(o, ['orderStatus', 'orderStatusText', 'orderStep'], '') || pick(goods, ['orderStatus'], '');
  // 실응답(코드) 우선, 없으면 mock의 평문 상태 텍스트를 보조로 사용
  const payTextHint = pick(o, ['paymentStatus', 'settleStateText'], '');
  const delivTextHint = pick(o, ['deliveryStatus', 'deliveryStatusText'], '');
  const payHint = orderStatus || payTextHint;
  const delivHint = orderStatus || delivTextHint;

  const productAmountRaw = pick(o, ['totalGoodsPrice', 'orderGoodsPrice', 'goodsPrice'], '');
  const deliveryFeeRaw = pick(o, ['totalDeliveryCharge', 'deliveryCharge', 'sumDeliveryCharge'], '');
  const settleRaw = pick(o, ['settlePrice', 'totalSettlePrice', 'totalPrice', 'orderPrice', 'amount'], '');
  const productAmount = toNumber(productAmountRaw || '0');
  const deliveryFee = toNumber(deliveryFeeRaw || '0');
  const settle = toNumber(settleRaw || '0');

  // 상품 상세는 중첩 orderGoodsData.goodsNm 우선, 없으면 상위/평문 fallback
  const productName = pick(goods, ['goodsNm', 'goodsName']) || pick(o, ['orderGoodsNm', 'goodsNm', 'productName', 'goods_name'], '');
  const optionName =
    pick(goods, ['optionName', 'optionInfo', 'goodsOptionName', 'goodsOption']) ||
    pick(o, ['optionName', 'optionInfo', 'goodsOption'], '');
  const quantityRaw = pick(goods, ['goodsCnt']) || pick(o, ['orderGoodsCnt', 'goodsCnt', 'quantity', 'ea'], '');

  // 주문자/수령자 (orderInfoData) — 원문. mock(평문 customerName 등)도 처리되도록 상위 o 도 fallback.
  const ordererName = pick(info, ['orderName', 'ordererName']) || pick(o, ['orderName', 'ordererName', 'customerName', 'memNm', 'memName', 'buyerName'], '');
  const receiverName = pick(info, ['receiverName']) || pick(o, ['receiverName'], '');
  const phone =
    pick(info, ['orderCellPhone', 'orderPhone', 'orderHp']) ||
    pick(o, ['orderCellPhone', 'orderHp', 'ordererHp', 'customerPhone', 'phone', 'hp', 'cellPhone'], '');
  const email = pick(info, ['orderEmail', 'ordererEmail']) || pick(o, ['orderEmail', 'ordererEmail', 'customerEmail', 'email'], '');
  const addrMain = pick(info, ['receiverAddress', 'orderAddress']) || pick(o, ['receiverAddress', 'orderAddress', 'orderAddr', 'address', 'addr'], '');
  const addrSub = pick(info, ['receiverAddressSub', 'orderAddressSub'], '');
  const address = [addrMain, addrSub].filter((x) => x.length > 0).join(' ').trim();

  const paid = hasPaymentDate(paymentDt) || isPaidStatus(payHint);
  const { deliveryStatus, undelivered } = interpretDelivery(delivHint, paid);

  return {
    orderId: pick(o, ['orderId', 'orderNo'], orderNo),
    orderNo,
    orderDate,
    productName,
    optionName,
    quantityRaw,
    quantity: toInt(quantityRaw || '1'),
    invoiceNo: pick(o, ['invoiceNo', 'deliveryNo', 'invoice'], ''),
    productAmount,
    deliveryFee,
    totalAmount: settle || productAmount + deliveryFee,
    hasAmountBasis: settleRaw !== '' || productAmountRaw !== '' || deliveryFeeRaw !== '',
    hasStatusBasis: orderStatus !== '' || paymentDt !== '' || payTextHint !== '',
    hasDeliveryBasis: orderStatus !== '' || delivTextHint !== '',
    paid,
    deliveryStatus,
    undelivered,
    paymentMethod: pick(o, ['settleKind', 'settleKindText', 'settleMethodText'], ''),
    ordererName,
    receiverName,
    phone,
    email,
    address
  };
};

export const mapOrdersToAdmin = (orders: Raw[]): StandardOrderAdmin[] => {
  return orders.map((o) => {
    const v = interpretOrderRecord(o);
    return {
      orderId: v.orderId,
      orderNo: v.orderNo,
      orderDate: v.orderDate,
      ordererName: v.ordererName,
      receiverName: v.receiverName,
      phone: v.phone,
      address: v.address,
      productName: v.productName,
      quantity: v.quantity,
      productAmount: v.productAmount,
      deliveryFee: v.deliveryFee,
      totalAmount: v.totalAmount,
      paymentMethod: v.paymentMethod,
      paymentStatus: v.paid ? '결제완료' : '미결제',
      deliveryStatus: v.deliveryStatus,
      unpaid: !v.paid,
      undelivered: v.undelivered
    };
  });
};

// ---- 매출(sales) 파생 ----
// 공식 매출 endpoint를 임의로 만들지 않고, 주문 결과를 일자별로 집계한다.
export interface SalesIntermediate extends Record<string, string> {
  date: string;
  totalSales: string;
  orderCount: string;
  conversionRate: string;
  topProducts: string;
}

export const deriveSalesFromOrders = (orders: OrderIntermediate[]): SalesIntermediate[] => {
  const byDate = new Map<string, { total: number; count: number; products: Map<string, number> }>();

  for (const o of orders) {
    const date = (o.orderDate || '').split(' ')[0].replace(/[./]/g, '-').slice(0, 10);
    if (!date) continue;
    const amount = parseFloat((o.amount || '0').replace(/[^0-9.]/g, '')) || 0;
    const qty = parseInt(o.quantity || '1', 10) || 1;

    const entry = byDate.get(date) || { total: 0, count: 0, products: new Map<string, number>() };
    entry.total += amount;
    entry.count += 1;
    if (o.productName) {
      entry.products.set(o.productName, (entry.products.get(o.productName) || 0) + qty);
    }
    byDate.set(date, entry);
  }

  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, e]) => {
      const topProducts = Array.from(e.products.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name)
        .join(', ');
      return {
        date,
        totalSales: String(Math.round(e.total)),
        orderCount: String(e.count),
        conversionRate: '0',
        topProducts
      };
    });
};
