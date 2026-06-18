import type { OperationTask } from '../types/task';
import type { MockGodoData } from '../data/mockGodoData';
import type { OperationsDataSnapshot } from '../types/dataConnector';

/**
 * 작업을 모의 실행(Mock Execution)하여 데이터 상태를 가독성 있는 텍스트 결과로 도출합니다.
 * @param task 실행할 작업 객체
 * @param mockData 참조할 고도몰 더미 데이터
 * @param activeOperationsData 활성 쇼핑몰 운영 데이터
 */
export const executeTask = async (
  task: OperationTask,
  mockData: MockGodoData,
  activeOperationsData?: OperationsDataSnapshot
): Promise<OperationTask> => {
  // 인위적 딜레이를 주거나, 호출한 측에서 순차 실행 주기를 조절하므로
  // 여기서는 순수 결과값 분석 텍스트와 로그 데이터만 채웁니다.
  let resultSummary: string;
  const taskLogs: string[] = [];

  const timeString = new Date().toTimeString().split(' ')[0];
  taskLogs.push(`[${timeString}] [${task.title}] 프로세스 적재 완료.`);
  if (task.requiredSkills && task.requiredSkills.length > 0) {
    taskLogs.push(`[${timeString}] 스킬 로드 완료: [${task.requiredSkills.join(', ')}]`);
  }

  switch (task.assignedAgentId) {
    case 'order': {
      if (activeOperationsData) {
        const totalOrders = activeOperationsData.orders.length;
        const paymentPending = activeOperationsData.orders.filter(o => o.riskFlags.includes('payment_pending')).length;
        const invoiceMissing = activeOperationsData.orders.filter(o => o.riskFlags.includes('invoice_missing')).length;
        const deliveryDelayed = activeOperationsData.orders.filter(o => o.riskFlags.includes('delivery_delayed')).length;
        const highValue = activeOperationsData.orders.filter(o => o.riskFlags.includes('high_value_order')).length;
        resultSummary = `주문 데이터 ${totalOrders}건을 분석했습니다. 송장 누락 ${invoiceMissing}건, 입금 대기 ${paymentPending}건, 배송 지연 위험 ${deliveryDelayed}건, 고액 주문 ${highValue}건을 감지했습니다.`;
      } else {
        const totalOrders = mockData.orders.length;
        const confirmPending = mockData.orders.filter(o => o.status === 'confirm_pending').length;
        resultSummary = `신규 주문 ${totalOrders}건, 입금 확인 필요 ${confirmPending}건을 확인했습니다.`;
      }
      taskLogs.push(`[${timeString}] 고도몰 주문 API 응답 대조 완료.`);
      taskLogs.push(`[${timeString}] 무결성 검사 결과: 비정상 주문 패턴 감지되지 않음.`);
      break;
    }
    case 'cs': {
      if (activeOperationsData) {
        const totalInqs = activeOperationsData.inquiries.length;
        const unanswered = activeOperationsData.inquiries.filter(i => i.status !== '답변완료').length;
        const refundExchange = activeOperationsData.inquiries.filter(i => i.category.includes('환불') || i.category.includes('교환') || i.category.includes('반품')).length;
        const complaint = activeOperationsData.inquiries.filter(i => i.riskFlags.includes('complaint')).length;
        const urgent = activeOperationsData.inquiries.filter(i => i.riskFlags.includes('urgent')).length;
        resultSummary = `문의 데이터 ${totalInqs}건을 분석했습니다. 미답변 ${unanswered}건, 환불/교환 문의 ${refundExchange}건, 긴급 문의 ${urgent}건, 불만 접수 ${complaint}건을 감지했습니다.`;
      } else {
        const totalInqs = mockData.inquiries.length;
        const delivery = mockData.inquiries.filter(i => i.category === 'delivery').length;
        const exchange = mockData.inquiries.filter(i => i.category === 'exchange').length;
        const product = mockData.inquiries.filter(i => i.category === 'product').length;
        resultSummary = `미답변 문의 ${totalInqs}건을 분석했습니다. 배송 ${delivery}건, 교환 ${exchange}건, 상품 ${product}건입니다.`;
      }
      taskLogs.push(`[${timeString}] 미답변 문의 데이터 자연어 처리(NLP) 분류 적용.`);
      taskLogs.push(`[${timeString}] 고객 톤앤매너 감정 스펙트럼 스캔 완료.`);
      break;
    }
    case 'delivery': {
      if (activeOperationsData) {
        const deliveryDelayed = activeOperationsData.orders.filter(o => o.riskFlags.includes('delivery_delayed')).length;
        const invoiceMissing = activeOperationsData.orders.filter(o => o.riskFlags.includes('invoice_missing')).length;
        const delayedOrPreparing = activeOperationsData.orders.filter(o => 
          o.deliveryStatus.includes('지연') || o.deliveryStatus.includes('대기') || o.deliveryStatus.includes('준비')
        ).length;
        resultSummary = `배송 지연 위험 주문 ${deliveryDelayed}건, 송장 미등록 주문 ${invoiceMissing}건, 배송 대기/지연 중인 주문 ${delayedOrPreparing}건을 확인했습니다.`;
      } else {
        const invoicePending = mockData.orders.filter(o => o.status === 'invoice_pending').length;
        resultSummary = `송장 미등록 주문 ${invoicePending}건을 발견했습니다.`;
      }
      taskLogs.push(`[${timeString}] CJ대한통운/한진택배 연동 모듈 배송 이상 트래킹.`);
      taskLogs.push(`[${timeString}] 배송 지연 위험 경보 수집.`);
      break;
    }
    case 'review': {
      if (activeOperationsData) {
        const totalReviews = activeOperationsData.reviews.length;
        const negative = activeOperationsData.reviews.filter(r => r.sentiment === 'negative' || r.riskFlags.includes('negative_review')).length;
        const lowRating = activeOperationsData.reviews.filter(r => r.rating <= 2 || r.riskFlags.includes('low_rating')).length;
        const needsReply = activeOperationsData.reviews.filter(r => r.needsReply || r.riskFlags.includes('needs_reply')).length;
        resultSummary = `리뷰 ${totalReviews}건을 분석했습니다. 부정 리뷰 ${negative}건, 낮은 평점 리뷰 ${lowRating}건, 답글 필요 리뷰 ${needsReply}건을 감지했습니다.`;
      } else {
        const totalReviews = mockData.reviews.length;
        const negative = mockData.reviews.filter(r => r.sentiment === 'negative').length;
        resultSummary = `리뷰 답글 초안 ${totalReviews}개를 생성했습니다. 불만 리뷰 ${negative}건은 승인 검토가 필요합니다.`;
      }
      taskLogs.push(`[${timeString}] 신규 구매평 감성 스코어 임계값 분석 완료.`);
      taskLogs.push(`[${timeString}] 부정 피드백 대응 답변 가이드라인 적용.`);
      break;
    }
    case 'stock': {
      if (activeOperationsData) {
        const totalItems = activeOperationsData.inventory.length;
        const outOfStock = activeOperationsData.inventory.filter(i => i.status === 'danger' || i.riskFlags.includes('out_of_stock')).length;
        const belowSafety = activeOperationsData.inventory.filter(i => i.status === 'warning' || i.riskFlags.includes('below_safety_stock') || i.riskFlags.includes('low_stock')).length;
        resultSummary = `재고 항목 ${totalItems}개를 분석했습니다. 품절 ${outOfStock}건, 안전재고 이하 ${belowSafety}건을 감지했습니다.`;
      } else {
        const dangerStock = mockData.inventory.filter(i => i.status === 'danger').length;
        const warningStock = mockData.inventory.filter(i => i.status === 'warning').length;
        resultSummary = `품절 위험 상품 ${dangerStock}건, 안전재고 이하 옵션 ${warningStock}건을 발견했습니다.`;
      }
      taskLogs.push(`[${timeString}] 전체 상품 SKU 재고 변동 이력 분석.`);
      taskLogs.push(`[${timeString}] 안전재고 수준 미달 옵션 공급망 알림 트리거.`);
      break;
    }
    case 'finance': {
      if (activeOperationsData && activeOperationsData.sales.length > 0) {
        const latestSales = activeOperationsData.sales[0];
        const totalSales = latestSales.totalSales;
        const orderCount = latestSales.orderCount;
        const conversionRate = latestSales.conversionRate;
        const topProducts = latestSales.topProducts.join(', ');
        resultSummary = `매출 데이터 기준 총 매출 ${totalSales.toLocaleString()}원, 주문 ${orderCount}건, 전환율 ${conversionRate}%를 요약했습니다. 인기 상품은 [${topProducts}]입니다. (전일 대비: 비교 데이터 없음)`;
      } else {
        const sales = mockData.sales;
        resultSummary = `오늘 매출은 전일 대비 ${sales.growthRate} 상승했습니다. 인기 카테고리는 ${sales.popularCategory}입니다.`;
      }
      taskLogs.push(`[${timeString}] 금일 누적 매출 통계 데이터 피드 취합.`);
      taskLogs.push(`[${timeString}] 일평균 광고비 대비 매출 효율(ROAS) 교차 산정.`);
      break;
    }
    case 'marketing': {
      if (activeOperationsData) {
        const topProduct = activeOperationsData.sales[0]?.topProducts[0] || '인기 상품';
        resultSummary = `주문/리뷰/매출 데이터를 기반으로 [${topProduct}] 구매 고객 대상 7일 한정 타겟 할인 쿠폰 발행 캠페인 후보를 제안합니다. 승인 필요.`;
      } else {
        resultSummary = `재구매 고객 대상 7일 한정 쿠폰 캠페인을 제안합니다. 승인 필요.`;
      }
      taskLogs.push(`[${timeString}] 고객 세그먼트별 리타게팅 마케팅 기획서 초안 빌드.`);
      taskLogs.push(`[${timeString}] 신규 쿠폰 템플릿 검증 완료 (고도몰 발행 API 샌드박스).`);
      break;
    }
    default:
      resultSummary = `작업 "${task.title}"이 성공적으로 완료되었습니다.`;
      taskLogs.push(`[${timeString}] 기본 모의 처리가 완료되었습니다.`);
      break;
  }

  // 승인이 필요한 작업의 경우 status를 needs_approval로 변경
  const nextStatus = task.permission === 'approval_required' ? 'needs_approval' : 'completed';
  taskLogs.push(`[${timeString}] 작업 상태 변경: ${nextStatus.toUpperCase()}`);

  return {
    ...task,
    status: nextStatus,
    resultSummary,
    logs: taskLogs,
    completedAt: new Date().toISOString()
  };
};
