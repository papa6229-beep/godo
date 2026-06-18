import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { DailyOperationSummary } from '../types/calendar';

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 정규화하는 헬퍼 함수
 */
const getYYYYMMDD = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const yyyy = match[1];
    const mm = match[2].padStart(2, '0');
    const dd = match[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  // ISO date parsing
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch {
    // Ignore
  }
  return trimmed;
};

/**
 * activeOperationsData를 날짜별로 집계하여 DailyOperationSummary 맵을 생성합니다.
 */
export const buildDailyOperationSummaries = (
  activeOperationsData: OperationsDataSnapshot
): Map<string, DailyOperationSummary> => {
  const summariesMap = new Map<string, DailyOperationSummary>();

  // 1. 재고 데이터 날짜 결정 (가장 마지막 적재 시간 기준)
  const snapshotDate = activeOperationsData.importedAt 
    ? getYYYYMMDD(activeOperationsData.importedAt) 
    : getYYYYMMDD(new Date().toISOString());

  // 2. 전체 날짜 후보군을 추출하기 위한 Set
  const allDates = new Set<string>();

  // 날짜 수집
  activeOperationsData.orders.forEach(o => {
    const d = getYYYYMMDD(o.orderDate);
    if (d) allDates.add(d);
  });

  activeOperationsData.inquiries.forEach(i => {
    const d = getYYYYMMDD(i.inquiryDate);
    if (d) allDates.add(d);
  });

  activeOperationsData.reviews.forEach(r => {
    const d = getYYYYMMDD(r.reviewDate);
    if (d) allDates.add(d);
  });

  activeOperationsData.sales.forEach(s => {
    const d = getYYYYMMDD(s.date);
    if (d) allDates.add(d);
  });

  // 재고 날짜도 후보군에 추가
  allDates.add(snapshotDate);

  // 3. 각 날짜별로 집계 루프 실행
  allDates.forEach(targetDate => {
    // 날짜별 필터링 데이터
    const targetOrders = activeOperationsData.orders.filter(o => getYYYYMMDD(o.orderDate) === targetDate);
    const targetInquiries = activeOperationsData.inquiries.filter(i => getYYYYMMDD(i.inquiryDate) === targetDate);
    const targetReviews = activeOperationsData.reviews.filter(r => getYYYYMMDD(r.reviewDate) === targetDate);
    const targetSales = activeOperationsData.sales.filter(s => getYYYYMMDD(s.date) === targetDate);

    // 주문 메트릭 집계
    const orderCount = targetOrders.length;
    const invoiceMissingCount = targetOrders.filter(o => o.riskFlags.includes('invoice_missing')).length;
    const paymentPendingCount = targetOrders.filter(o => o.riskFlags.includes('payment_pending')).length;
    const deliveryDelayedCount = targetOrders.filter(o => o.riskFlags.includes('delivery_delayed')).length;

    // 매출 집계
    const totalSales = targetSales.reduce((sum, s) => sum + s.totalSales, 0);

    // 문의 집계
    const inquiryCount = targetInquiries.length;
    const unansweredInquiryCount = targetInquiries.filter(i => i.status !== '답변완료').length;

    // 리뷰 집계
    const reviewCount = targetReviews.length;
    const negativeReviewCount = targetReviews.filter(r => r.rating <= 2 || r.sentiment === 'negative').length;

    // 재고 집계 (재고는 날짜가 없으므로 스냅샷 기준 날짜에만 위험 수치 주입)
    const isSnapshotDay = (targetDate === snapshotDate);
    const inventoryRiskCount = isSnapshotDay 
      ? activeOperationsData.inventory.filter(i => i.status !== 'ok').length 
      : 0;

    // 리스크 플래그 취합
    const riskFlagsSet = new Set<string>();
    targetOrders.forEach(o => o.riskFlags.forEach(f => riskFlagsSet.add(f)));
    targetInquiries.forEach(i => i.riskFlags.forEach(f => riskFlagsSet.add(f)));
    targetReviews.forEach(r => r.riskFlags.forEach(f => riskFlagsSet.add(f)));
    if (isSnapshotDay) {
      activeOperationsData.inventory.forEach(iv => iv.riskFlags.forEach(f => riskFlagsSet.add(f)));
    }

    // 이슈 하이라이트 문장 생성
    const issueHighlights: string[] = [];
    if (invoiceMissingCount > 0) {
      issueHighlights.push(`송장 누락 주문 ${invoiceMissingCount}건 감지`);
    }
    if (unansweredInquiryCount > 0) {
      issueHighlights.push(`미답변 CS 문의 ${unansweredInquiryCount}건 누적`);
    }
    if (negativeReviewCount > 0) {
      issueHighlights.push(`부정 리뷰(2점 이하) ${negativeReviewCount}건 발생`);
    }
    if (inventoryRiskCount > 0) {
      issueHighlights.push(`품절 위험/안전재고 이하 상품 옵션 ${inventoryRiskCount}건 확인`);
    }
    if (paymentPendingCount > 0) {
      issueHighlights.push(`입금 대기 주문 ${paymentPendingCount}건 확인`);
    }
    if (deliveryDelayedCount > 0) {
      issueHighlights.push(`배송 지연 주문 ${deliveryDelayedCount}건 발생`);
    }

    // AI 운영 활동 요약
    const aiActivityHighlights: string[] = [];
    if (orderCount > 0) {
      aiActivityHighlights.push('주문 확인 AI가 주문 데이터를 검수했습니다.');
    }
    if (inquiryCount > 0) {
      aiActivityHighlights.push('CS 상담 AI가 미답변 문의를 분류했습니다.');
    }
    if (negativeReviewCount > 0 || reviewCount > 0) {
      aiActivityHighlights.push('리뷰 답글 AI가 리뷰 감정 분석 및 답글 초안을 작성했습니다.');
    }
    if (inventoryRiskCount > 0 || isSnapshotDay) {
      aiActivityHighlights.push('재고 감시 AI가 안전재고 이하 상품을 확인하고 경보를 송출했습니다.');
    }
    if (totalSales > 0) {
      aiActivityHighlights.push('매출 분석 AI가 일일 매출을 요약하고 광고 효율을 평가했습니다.');
    }

    summariesMap.set(targetDate, {
      date: targetDate,
      orderCount,
      totalSales,
      inquiryCount,
      unansweredInquiryCount,
      reviewCount,
      negativeReviewCount,
      inventoryRiskCount,
      invoiceMissingCount,
      paymentPendingCount,
      deliveryDelayedCount,
      riskFlags: Array.from(riskFlagsSet),
      issueHighlights,
      aiActivityHighlights,
      dataSourceType: activeOperationsData.sourceType,
      qualityScore: activeOperationsData.qualityReport?.qualityScore ?? 100
    });
  });

  return summariesMap;
};
