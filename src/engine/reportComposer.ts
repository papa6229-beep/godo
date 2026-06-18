import type { OperationTask } from '../types/task';
import type { OperationReport } from '../types/operation';
import type { OperationsDataSnapshot } from '../types/dataConnector';

/**
 * 완료된 일일 운영 작업들을 분석하여 종합 운영 리포트(OperationReport)를 작성합니다.
 * @param tasks 분석할 일일 작업들
 * @param activeOperationsData 활성 쇼핑몰 운영 데이터
 */
export const composeOperationReport = (
  tasks: OperationTask[],
  activeOperationsData?: OperationsDataSnapshot
): OperationReport => {
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const approvalTasks = tasks.filter(t => t.status === 'needs_approval');

  // 완료된 데이터 중에서 특징적인 위험 신호를 취합합니다.
  const warningSignals: string[] = [];
  const recommendedActions: string[] = [];

  if (activeOperationsData) {
    const invoiceMissing = activeOperationsData.orders.filter(o => o.riskFlags.includes('invoice_missing')).length;
    if (invoiceMissing > 0) {
      warningSignals.push(`배송 송장이 미등록된 대기 주문 건 ${invoiceMissing}건이 존재합니다.`);
      recommendedActions.push('물류센터 API 재점검 및 미등록 수동 송장 매칭 확인 필요');
    }

    const unanswered = activeOperationsData.inquiries.filter(i => i.status !== '답변완료').length;
    if (unanswered > 0) {
      warningSignals.push(`답변이 대기 중인 고객 CS 문의가 ${unanswered}건 존재합니다.`);
      recommendedActions.push('상담 에이전트 자동 템플릿 검토 후 미답변 CS 문의 빠른 순차 피드백 필요');
    }

    const stockDanger = activeOperationsData.inventory.filter(i => i.status !== 'ok').length;
    if (stockDanger > 0) {
      warningSignals.push(`재고 위험 수준(품절 또는 안전재고 이하)인 상품이 ${stockDanger}옵션 감지되었습니다.`);
      recommendedActions.push('안전재고 미달 품목에 대한 제조처 공급 긴급 발주 승인 및 등록 필요');
    }

    const negativeReviews = activeOperationsData.reviews.filter(r => r.rating <= 2).length;
    if (negativeReviews > 0) {
      warningSignals.push(`저평점(2점 이하) 부정 리뷰가 ${negativeReviews}건 감지되었습니다.`);
      recommendedActions.push('부정 구매평 작성 고객에게 특별 보상 안내 및 개선 답글 발송 제안');
    }
  } else {
    // Fallback Mock 데이터 분석
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
  }

  // 추천 액션 기본 채우기
  if (recommendedActions.length === 0) {
    recommendedActions.push('일일 자동 정산 및 재고 변동 내역 고도몰 어드민 대조 수행');
  }
  recommendedActions.push('마케팅 AI가 제안한 재구매 타겟 7일 한정 할인 쿠폰 캠페인 허가 검토');

  // 핵심 요약 문구 빌드
  let summary: string;
  if (activeOperationsData) {
    const totalOrders = activeOperationsData.orders.length;
    const totalInqs = activeOperationsData.inquiries.length;
    const totalReviews = activeOperationsData.reviews.length;
    const totalInv = activeOperationsData.inventory.length;

    const invoiceMissing = activeOperationsData.orders.filter(o => o.riskFlags.includes('invoice_missing')).length;
    const unanswered = activeOperationsData.inquiries.filter(i => i.status !== '답변완료').length;
    const stockDanger = activeOperationsData.inventory.filter(i => i.status !== 'ok').length;

    summary = `금일 운영 데이터 스냅샷 기준으로 총 ${totalOrders}건의 주문, ${totalInqs}건의 문의, ${totalReviews}건의 리뷰, ${totalInv}개의 재고 항목을 분석했습니다. ` +
      `그중 ${completedTasks.length}건의 업무를 자동 처리 완료하였고, 승인 대기 ${approvalTasks.length}건을 분류했습니다. ` +
      `송장 누락 ${invoiceMissing}건, 미답변 문의 ${unanswered}건, 품절 위험 상품 ${stockDanger}건이 발견되어 후속 조치가 권장됩니다.`;
  } else {
    summary = `금일 쇼핑몰 자동 운영 파이프라인에서 총 ${tasks.length}개의 업무를 수행했습니다. ` +
      `그중 ${completedTasks.length}건이 무결성 검증을 통과하여 자동으로 처리 완료되었으며, ` +
      `정책상 고위험 업무 또는 의사결정이 요구되는 ${approvalTasks.length}건에 대해 승인 대기 상태로 설정했습니다. ` +
      `전체 재고 수준 및 미등록 송장 등 위험 요소가 ${warningSignals.length}건 발견되어 운영자 조치가 추천됩니다.`;
  }

  return {
    summary,
    autoCompletedCount: completedTasks.length,
    approvalRequiredCount: approvalTasks.length,
    warningSignals,
    recommendedActions
  };
};
