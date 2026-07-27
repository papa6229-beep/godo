import type { InquiryStatus, NormalizationReason } from '../services/inquiryStatusContract';
import type { ResourceStatusRecord } from '../services/dataSourceProvenanceContract';

export type DataDomain = 'orders' | 'inquiries' | 'reviews' | 'inventory' | 'sales';

export type DataSourceType =
  | 'demo'
  | 'csv'
  | 'json'
  | 'manual'
  | 'api_mock'
  | 'api_proxy_mock'
  // Godomall5 Open API READ Bridge
  | 'api_proxy_real'
  | 'api_proxy_sandbox'
  | 'api_mock_fallback';

export type DataImportStatus = 'idle' | 'parsing' | 'success' | 'warning' | 'error';

// ── B-core: 주문 원본 사실 보존 ──────────────────────────────────────────────
// 평탄 필드(quantity/amount/paymentStatus/deliveryStatus)만으로는 원본에 있던 사실이 유실된다.
// 취소 여부·상품 라인·배송비·금액 분리를 `orderFacts` 로 함께 보존한다.
//
// ⚠️ 최상위에 평탄 `paid`/`canceled`/`totalAmount` 를 두지 않는다.
//    `revenueMetricContract.isValidOrder` 는 state → 평탄 paid/canceled → totalAmount 순으로 폴백한다.
//    `canceled` 만 정의되고 `paid` 가 없으면 **전 주문이 무효**로 판정된다.
//    결제 정본이 확정되기 전(C단계)에 그 상태를 만들면 "미확정"이 "전부 무효"라는 오답으로 바뀐다.
//    → 사실은 중첩으로 보존하고, 결제 판정은 아래 두 근거를 모두 남긴다.
export interface StandardOrderLine {
  goodsNo: string;
  goodsCd: string;
  goodsName: string;
  quantity: number;
  lineRevenue: number;
}

/**
 * 결제 완료 판정의 두 근거. **어느 쪽도 정본이 아니다.**
 * 고도몰 `orderStatus` 코드의 공식 의미 확정(C단계) 전까지 한쪽을 조용히 정본으로 삼지 않는다.
 * `conflicted === true` 인 주문은 결제 여부가 **미확정**이며, 소비자는 이를 표시해야 한다.
 */
export interface StandardPaymentEvidence {
  paymentDateValid: boolean;
  statusHintPaid: boolean;
  orderStatusRaw: string;
  conflicted: boolean;
}

export interface StandardOrderFacts {
  productAmount: number;
  deliveryFee: number;
  totalAmount: number;
  hasAmountBasis: boolean;
  lines: StandardOrderLine[];
  canceled: boolean;
  shipped: boolean;
  delivered: boolean;
  confirmed: boolean;
  paymentEvidence: StandardPaymentEvidence;
}

export interface StandardOrder {
  id: string;
  orderNo: string;
  orderDate: string; // YYYY-MM-DD
  customerNameMasked: string;
  productName: string;
  optionName: string;
  quantity: number;
  paymentStatus: string;
  deliveryStatus: string;
  invoiceNo: string;
  amount: number;
  riskFlags: string[];
  /**
   * GODO-ORDER-MAPPING-01(D-1): 값의 "존재 근거" 표식.
   * 상류에 수량/금액 필드 자체가 없었으면 false → 화면은 '미확인'으로 표시한다.
   * 값이 0/1인지와 근거가 없는지를 **값으로 추측하지 않기 위한** 필드다.
   * (optional — 기존 자료·mock은 undefined = 근거 있음으로 취급, 하위호환)
   */
  quantityKnown?: boolean;
  amountKnown?: boolean;
  /**
   * 원본 주문 사실(취소·라인·배송비·금액·결제 근거).
   * 상류가 실어 보낸 경우에만 존재한다 — CSV/JSON 업로드나 구버전 저장분에는 없다(undefined).
   * **없다는 것과 false 는 다르다.** 소비자는 undefined 를 "사실 없음"으로 단정하지 않는다.
   */
  orderFacts?: StandardOrderFacts;
}

export interface StandardInquiry {
  id: string;
  inquiryDate: string; // YYYY-MM-DD
  category: string;
  customerNameMasked: string;
  title: string;
  content: string;
  status: string;
  priority: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  riskFlags: string[];
  // C-4: 입력 경계(App activeOperationsData 조립/복원)에서 1회 부여. 소비자는 canonicalStatus/predicate 사용.
  //   status(원시)는 표시·하위호환 위해 보존, canonical 판정은 canonicalStatus/is* 로만.
  canonicalStatus?: InquiryStatus;
  rawStatus?: string;
  normalizationReason?: NormalizationReason;
}

export interface StandardReview {
  id: string;
  reviewDate: string; // YYYY-MM-DD
  productName: string;
  rating: number;
  content: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  needsReply: boolean;
  riskFlags: string[];
}

export interface StandardInventoryItem {
  id: string;
  productName: string;
  optionName: string;
  stock: number;
  safetyStock: number;
  /**
   * B-core-2a: `inventoryRiskContract` 판정을 그대로 반영한다.
   *   danger  = out_of_stock (재고 소진 또는 판매상태 품절)
   *   warning = low_stock (안전재고 이하)
   *   ok      = 정상 (무제한 재고 포함)
   *   unknown = 재고를 해석할 수 없음 — **정상으로 숨기지 않는다**(관리자 확인 대상)
   */
  status: 'ok' | 'warning' | 'danger' | 'unknown';
  riskFlags: string[];
}

export interface StandardSalesSummary {
  date: string; // YYYY-MM-DD
  totalSales: number;
  orderCount: number;
  conversionRate: number;
  topProducts: string[];
  memo?: string;
}

export interface DataQualityReport {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  missingRequiredFields: string[];
  duplicateRows: number;
  privacyMaskedCount: number;
  riskFlagCount: number;
  qualityScore: number; // 0 to 100
  notes: string[];
}

export interface OperationsDataSnapshot {
  id: string;
  sourceType: DataSourceType;
  importedAt: string; // ISO string
  orders: StandardOrder[];
  inquiries: StandardInquiry[];
  reviews: StandardReview[];
  inventory: StandardInventoryItem[];
  sales: StandardSalesSummary[];
  qualityReport?: DataQualityReport;
  // C-출처: 리소스별 신분·상태(실제 데이터/시험 데이터/연결 안 됨). 배열 길이로 재판정하지 않고 이 레코드로 표시.
  resourceProvenance?: Record<string, ResourceStatusRecord>;
}

export interface ImportHistoryItem {
  id: string;
  timestamp: string; // ISO string or format
  fileName: string;
  domain: DataDomain | 'all';
  sourceType: DataSourceType;
  rowCount: number;
  status: DataImportStatus;
  qualityScore: number;
}
