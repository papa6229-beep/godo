// 고도몰5 Open API 응답 -> GODO 내부 표준 중간 구조(Record<string,string>) 매퍼
//
// 설계 의도: 매퍼의 출력은 mockProxyData가 만드는 "중간 레코드 구조"와 동일하다.
// 그래야 기존 서버 PII 마스킹(maskRecordsList) + 프론트 정규화(buildOperationsSnapshot)
// 파이프라인을 한 줄도 바꾸지 않고 그대로 재사용할 수 있다.
//
// ⚠️ 주의: 아래 필드명 후보(FIELD CANDIDATES)는 고도몰5 공식 응답의 "추정값"이다.
// 첫 실제 응답(샌드박스/리얼)을 확인한 뒤 candidate 배열만 보정하면 된다.
// 임의 endpoint는 만들지 않으며, 매핑 후보만 점진 보정하는 것이 안전하다.

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

export const mapOrderList = (orders: Raw[]): OrderIntermediate[] => {
  return orders.map((o) => ({
    orderNo: pick(o, ['orderNo', 'orderId', 'orderCd', 'order_no']),
    orderDate: pick(o, ['orderDate', 'orderYmd', 'regDt', 'orderDt', 'order_date']),
    // PII (마스킹 전 원문) — 응답 직후 maskRecordsList에서 제거/마스킹됨
    customerName: pick(o, ['orderName', 'ordererName', 'memNm', 'memName', 'buyerName'], ''),
    customerPhone: pick(o, ['orderHp', 'orderCellPhone', 'ordererHp', 'hp', 'cellPhone'], ''),
    customerEmail: pick(o, ['orderEmail', 'ordererEmail', 'email'], ''),
    address: pick(o, ['orderAddress', 'orderAddr', 'receiverAddress', 'addr'], ''),
    productName: pick(o, ['goodsNm', 'goodsName', 'productName', 'goods_name']),
    optionName: pick(o, ['optionName', 'optionInfo', 'goodsOption'], '단품'),
    quantity: pick(o, ['goodsCnt', 'ea', 'quantity', 'orderCnt'], '1'),
    paymentStatus: pick(o, ['settleKindText', 'orderStatusText', 'orderStatus', 'paymentStatus', 'settleKind'], '결제완료'),
    deliveryStatus: pick(o, ['deliveryStatusText', 'deliveryStatus', 'delivStatus', 'orderStepText'], '배송대기'),
    invoiceNo: pick(o, ['invoiceNo', 'deliveryNo', 'invoice'], ''),
    amount: pick(o, ['settlePrice', 'totalPrice', 'goodsPrice', 'orderPrice', 'amount'], '0')
  }));
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

export const mapOrdersToAdmin = (orders: Raw[]): StandardOrderAdmin[] => {
  return orders.map((o) => {
    // 중첩: 주문자/수령자 정보 + 상품 상세 (Order_Search 실응답 구조)
    const info = asRecord(o['orderInfoData']) ?? {};
    const goods = firstRecordOf(o['orderGoodsData']) ?? {};

    const orderNo = pick(o, ['orderNo', 'orderId'], '');
    const orderDate = pick(o, ['orderDate', 'orderYmd', 'regDt', 'order_date'], '');
    const paymentDt = pick(o, ['paymentDt', 'paymentDate', 'settleDt'], '');
    const orderStatus = pick(o, ['orderStatus', 'orderStatusText', 'orderStep'], '') || pick(goods, ['orderStatus'], '');
    // 실응답(코드) 우선, 없으면 mock의 평문 상태 텍스트를 보조로 사용
    const payHint = orderStatus || pick(o, ['paymentStatus', 'settleStateText'], '');
    const delivHint = orderStatus || pick(o, ['deliveryStatus', 'deliveryStatusText'], '');

    const productAmount = toNumber(pick(o, ['totalGoodsPrice', 'orderGoodsPrice', 'goodsPrice'], '0'));
    const deliveryFee = toNumber(pick(o, ['totalDeliveryCharge', 'deliveryCharge', 'sumDeliveryCharge'], '0'));
    const settle = toNumber(pick(o, ['settlePrice', 'totalSettlePrice', 'totalPrice', 'orderPrice', 'amount'], '0'));

    // 상품 상세는 중첩 orderGoodsData.goodsNm 우선, 없으면 상위/평문 fallback
    const productName = pick(goods, ['goodsNm', 'goodsName']) || pick(o, ['orderGoodsNm', 'goodsNm', 'productName', 'goods_name'], '');
    const quantity = toInt(pick(goods, ['goodsCnt']) || pick(o, ['orderGoodsCnt', 'goodsCnt', 'quantity', 'ea'], '1'));

    // 주문자/수령자 (orderInfoData) — 관리자 화면 전용, 마스킹하지 않은 원본.
    // mock(평문 customerName 등)도 처리되도록 상위 o 도 fallback.
    const ordererName = pick(info, ['orderName', 'ordererName']) || pick(o, ['orderName', 'ordererName', 'customerName', 'buyerName'], '');
    const receiverName = pick(info, ['receiverName']) || pick(o, ['receiverName'], '');
    const phone =
      pick(info, ['orderCellPhone', 'orderPhone', 'orderHp']) ||
      pick(o, ['orderCellPhone', 'orderHp', 'customerPhone', 'phone', 'hp'], '');
    const addrMain = pick(info, ['receiverAddress', 'orderAddress']) || pick(o, ['receiverAddress', 'orderAddress', 'address', 'addr'], '');
    const addrSub = pick(info, ['receiverAddressSub', 'orderAddressSub'], '');
    const address = [addrMain, addrSub].filter((x) => x.length > 0).join(' ').trim();

    const paid = hasPaymentDate(paymentDt) || isPaidStatus(payHint);
    const { deliveryStatus, undelivered } = interpretDelivery(delivHint, paid);

    return {
      orderId: pick(o, ['orderId', 'orderNo'], orderNo),
      orderNo,
      orderDate,
      ordererName,
      receiverName,
      phone,
      address,
      productName,
      quantity,
      productAmount,
      deliveryFee,
      totalAmount: settle || productAmount + deliveryFee,
      paymentMethod: pick(o, ['settleKind', 'settleKindText', 'settleMethodText'], ''),
      paymentStatus: paid ? '결제완료' : '미결제',
      deliveryStatus,
      unpaid: !paid,
      undelivered
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
