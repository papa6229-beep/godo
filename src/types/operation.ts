export interface OperationReport {
  summary: string;
  autoCompletedCount: number;
  approvalRequiredCount: number;
  warningSignals: string[];
  recommendedActions: string[];
}
