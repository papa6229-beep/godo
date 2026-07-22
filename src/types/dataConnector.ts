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
  status: 'ok' | 'warning' | 'danger';
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
