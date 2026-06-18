import type { DataSourceType } from './dataConnector';

export type CalendarMetricLevel = 'normal' | 'warning' | 'critical' | 'empty';

export interface DailyOperationSummary {
  date: string;
  orderCount: number;
  totalSales: number;
  inquiryCount: number;
  unansweredInquiryCount: number;
  reviewCount: number;
  negativeReviewCount: number;
  inventoryRiskCount: number;
  invoiceMissingCount: number;
  paymentPendingCount: number;
  deliveryDelayedCount: number;
  approvalPendingCount?: number;
  riskFlags: string[];
  issueHighlights: string[];
  aiActivityHighlights: string[];
  dataSourceType: DataSourceType;
  qualityScore: number;
}

export interface CalendarDayCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasData: boolean;
  level: CalendarMetricLevel;
  summary?: DailyOperationSummary;
}

export interface OperationHistoryItem {
  id: string;
  date: string;
  timestamp: string;
  sourceType: DataSourceType;
  reportTitle: string;
  autoCompletedCount: number;
  approvalPendingCount: number;
  issueHighlights: string[];
  createdFrom: 'start_operation' | 'imported_data' | 'demo';
}
