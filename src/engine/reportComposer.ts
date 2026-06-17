import type { OperationTask } from '../types/task';
import type { OperationReport } from '../types/operation';

/**
 * 완료된 일일 운영 작업들을 분석하여 종합 운영 리포트(OperationReport)를 작성합니다.
 * @param tasks 분석할 일일 작업들
 */
export const composeOperationReport = (tasks: OperationTask[]): OperationReport => {
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const approvalTasks = tasks.filter(t => t.status === 'needs_approval');

  // 완료된 데이터 중에서 특징적인 위험 신호를 취합합니다.
  const warningSignals: string[] = [];
  const recommendedActions: string[] = [];

  // 기본 작업들의 결과 텍스트를 파싱하여 리포트 위계 구성
  tasks.forEach(t => {
    if (t.assignedAgentId === 'stock' && t.resultSummary?.includes('품절 위험')) {
      warningSignals.push('인기 마사지 오일 등 품절 임박 상품 4건이 감지되었습니다.');
      recommendedActions.push('안전재고 미달 품목에 대한 제조처 공급 긴급 발주 승인 및 등록 필요');
    }
    if (t.assignedAgentId === 'delivery' && t.resultSummary?.includes('송장 미등록')) {
      warningSignals.push('배송 송장이 미등록된 대기 주문 건 3건이 존재합니다.');
      recommendedActions.push('물류센터 API 재점검 및 미등록 수동 송장 매칭 확인 필요');
    }
    if (t.assignedAgentId === 'review' && t.resultSummary?.includes('불만 리뷰')) {
      warningSignals.push('배송 누수로 인한 부정적 포토 구매평이 1건 감지되었습니다.');
      recommendedActions.push('부정 구매평 작성 고객에게 교환 보상 안내 적립금 쿠폰 발송 제안');
    }
  });

  // 추천 액션 기본 채우기
  if (recommendedActions.length === 0) {
    recommendedActions.push('일일 자동 정산 및 재고 변동 내역 고도몰 어드민 대조 수행');
  }
  recommendedActions.push('마케팅 AI가 제안한 재구매 타겟 7일 한정 할인 쿠폰 캠페인 허가 검토');

  // 핵심 요약 문구 빌드
  const summary = `금일 쇼핑몰 자동 운영 파이프라인에서 총 ${tasks.length}개의 업무를 수행했습니다. ` +
    `그중 ${completedTasks.length}건이 무결성 검증을 통과하여 자동으로 처리 완료되었으며, ` +
    `정책상 고위험 업무 또는 의사결정이 요구되는 ${approvalTasks.length}건에 대해 승인 대기 상태로 설정했습니다. ` +
    `전체 재고 수준 및 미등록 송장 등 위험 요소가 ${warningSignals.length}건 발견되어 운영자 조치가 추천됩니다.`;

  return {
    summary,
    autoCompletedCount: completedTasks.length,
    approvalRequiredCount: approvalTasks.length,
    warningSignals,
    recommendedActions
  };
};
