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
// ⚠️ 필드명은 고도몰 Order_Search.php 응답의 추정 후보다. 첫 실응답 확인 후
// candidate 배열만 보정하면 된다. (Products v0가 거쳐온 방식과 동일)
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

// 결제상태 텍스트가 미결제/입금대기 계열인지
const isUnpaidStatus = (s: string): boolean =>
  /미결제|미입금|입금\s*대기|결제\s*대기|결제전|결제\s*전|입금전|unpaid|waiting/i.test(s);

// 배송상태가 "아직 배송되지 않음"인지 (배송중/완료/발송이 아니면 미배송으로 간주)
const isUndeliveredStatus = (s: string): boolean =>
  !/배송\s*중|배송\s*완료|배송완료|발송\s*완료|발송완료|배송됨|출고완료|deliver|shipp/i.test(s);

export const mapOrdersToAdmin = (orders: Raw[]): StandardOrderAdmin[] => {
  return orders.map((o) => {
    const orderNo = pick(o, ['orderNo', 'orderId', 'orderCd', 'order_no', 'sno']);
    const paymentStatus = pick(
      o,
      ['orderStatusText', 'orderStatus', 'settleKindText', 'paymentStatusText', 'paymentStatus', 'orderStep', 'settleStateText'],
      ''
    );
    const deliveryStatus = pick(
      o,
      ['deliveryStatusText', 'deliveryStatus', 'delivStatusText', 'delivStatus', 'orderStepText', 'orderDeliveryStatus'],
      ''
    );
    const productAmount = toNumber(
      pick(o, ['totalGoodsPrice', 'orderGoodsPrice', 'settleGoodsPrice', 'goodsPrice', 'productAmount'], '0')
    );
    const deliveryFee = toNumber(
      pick(o, ['deliveryCharge', 'delivCharge', 'sumDeliveryCharge', 'deliveryPrice', 'deliveryFee'], '0')
    );
    const totalAmount = toNumber(
      pick(o, ['settlePrice', 'totalSettlePrice', 'totalPrice', 'orderPrice', 'totalAmount', 'amount'], '0')
    );

    return {
      orderId: pick(o, ['orderId', 'orderNo', 'orderCd', 'sno'], orderNo),
      orderNo,
      orderDate: pick(o, ['orderDate', 'orderYmd', 'regDt', 'orderDt', 'order_date']),
      // 관리자 화면 전용 — 마스킹하지 않은 원본 고객정보
      ordererName: pick(o, ['orderName', 'ordererName', 'memNm', 'memName', 'buyerName', 'customerName'], ''),
      receiverName: pick(o, ['receiverName', 'receiverNm', 'deliveryName', 'takeName', 'receiptName', 'rcvName'], ''),
      phone: pick(o, ['receiverHp', 'receiverCellPhone', 'orderHp', 'orderCellPhone', 'ordererHp', 'customerPhone', 'hp', 'cellPhone'], ''),
      address: pick(o, ['receiverAddress', 'orderAddress', 'receiverAddr', 'orderAddr', 'address', 'addr'], ''),
      productName: pick(o, ['goodsNm', 'goodsName', 'productName', 'goods_name'], ''),
      quantity: toInt(pick(o, ['goodsCnt', 'ea', 'orderCnt', 'quantity'], '1')),
      productAmount,
      deliveryFee,
      totalAmount: totalAmount || productAmount + deliveryFee,
      paymentMethod: pick(o, ['settleKindText', 'settleKind', 'settleMethodText', 'paymentMethod', 'payment'], ''),
      paymentStatus: paymentStatus || '미결제',
      deliveryStatus: deliveryStatus || '배송 전',
      unpaid: isUnpaidStatus(paymentStatus || '미결제'),
      undelivered: isUndeliveredStatus(deliveryStatus)
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
