import type { AgentHandoff, AgentResult } from './types';

export interface HandoffProcessResult {
  handoffs: AgentHandoff[];
  activityLogs: string[];
  adjustedResults: AgentResult[];
}

export function processHandoffs(
  runId: string,
  results: AgentResult[]
): HandoffProcessResult {
  const handoffs: AgentHandoff[] = [];
  const activityLogs: string[] = [];
  const adjustedResults = [...results];
  const currentTime = new Date().toISOString();

  // 1. 부서별 결과 분류
  const productResult = results.find(r => r.departmentId === 'product');
  const csResult = results.find(r => r.departmentId === 'cs');
  const marketingResultIndex = results.findIndex(r => r.departmentId === 'marketing');

  // A. 상품관리팀 → 마케팅팀 Handoff
  if (productResult) {
    const lowStockItems = productResult.findings.filter(f => f.includes('안전재고') || f.includes('재고'));
    const topSelling = productResult.findings.filter(f => f.includes('판매량 최고'));

    let message = '상품 데이터 분석 결과 전달:\n';
    if (lowStockItems.length > 0) {
      message += `- [재고 부족 경보] ${lowStockItems.join(', ')} 상품은 마케팅 프로모션 대상에서 제외를 권고합니다.\n`;
    }
    if (topSelling.length > 0) {
      message += `- [인기 품목 정보] ${topSelling.join(', ')} 상품은 활발한 재구매 캠페인 기획 대상으로 추천합니다.\n`;
    }

    handoffs.push({
      id: `ho-prod-mkt-${runId}`,
      runId,
      fromDepartmentId: 'product',
      toDepartmentId: 'marketing',
      fromAgentId: productResult.agentId,
      toAgentId: 'marketing_lead',
      title: '재고 상태 및 판매 인기 품목 데이터 Handoff',
      message,
      referencedResultIds: [productResult.id],
      createdAt: currentTime
    });
    activityLogs.push('상품관리팀이 마케팅팀에 재고 상태 및 판매 인기 품목 정보를 전달했습니다.');
  }

  // B. CS팀 → 마케팅팀 Handoff
  if (csResult) {
    const negativeReviews = csResult.findings.filter(f => f.includes('부정') || f.includes('별점'));
    let message = 'CS 및 여론 수집 리스크 Handoff:\n';
    if (negativeReviews.length > 0) {
      message += `- [부정 여론] ${negativeReviews.join(', ')} 상품의 불만족 접수로 인해 홍보 활동 시 어조 주의 및 패키징 결함 해결 전 캠페인 보류를 요청합니다.\n`;
    } else {
      message += '- 특별한 브랜드 위험 여론 리스크는 없습니다.\n';
    }

    handoffs.push({
      id: `ho-cs-mkt-${runId}`,
      runId,
      fromDepartmentId: 'cs',
      toDepartmentId: 'marketing',
      fromAgentId: csResult.agentId,
      toAgentId: 'marketing_lead',
      title: '고객 컴레임 및 부정 리뷰 여론 Handoff',
      message,
      referencedResultIds: [csResult.id],
      createdAt: currentTime
    });
    activityLogs.push('CS팀이 마케팅팀에 고객 부정 리뷰 및 브랜드 이슈 리스크 정보를 전달했습니다.');
  }

  // C. 마케팅팀의 수신 정보에 따른 결과 보정 (Adjust)
  // 마케팅팀 결과물이 존재하고, 수신된 Handoff(재고 부족, 부정 리뷰) 정보가 있을 때 마케팅 캠페인을 자동 보정함
  if (marketingResultIndex !== -1 && (productResult || csResult)) {
    const marketingResult = { ...adjustedResults[marketingResultIndex] };
    const findings = [...marketingResult.findings];
    const recommendations = [...marketingResult.recommendations];
    const artifacts = [...marketingResult.artifacts];

    // Handoff 반영 문구 추가
    findings.push('[Handoff 피드백] 상품 및 CS 부서 협업 정보 반영: 재고 부족 품목 및 파손 클레임 유입 상품은 금주 푸시 캠페인 품목에서 자동 제외 처리.');
    recommendations.push('재고 미달 품목과 누액 파손 접수 상품을 제외한 잔여 재고 안전 품목 위주로 캠페인을 실행하도록 프로모션을 수정 승인해 주십시오.');

    // 마케팅 기획서(Artifact) 본문 보정
    const planIndex = artifacts.findIndex(art => art.type === 'marketing_plan');
    if (planIndex !== -1) {
      const originalPlan = artifacts[planIndex];
      artifacts[planIndex] = {
        ...originalPlan,
        body: originalPlan.body + `\n\n[부서 협업 보정 조치]:\n- 상품팀 Handoff에 의거, 안전재고 미달 품목은 쿠폰 적용 대상에서 한시 제외.\n- CS팀 Handoff에 의거, 누액 파손이 접수된 클레임 상품은 금주 캠페인 배너 광고에서 제외함.`
      };
    }

    marketingResult.findings = findings;
    marketingResult.recommendations = recommendations;
    marketingResult.artifacts = artifacts;
    adjustedResults[marketingResultIndex] = marketingResult;

    activityLogs.push('마케팅팀이 상품관리팀 및 CS팀에서 전달받은 Handoff 데이터를 분석하여 금주 프로모션 대상 품목을 최종 보정했습니다.');
  }

  // D. 마케팅팀 → 총괄 매니저 Handoff
  if (marketingResultIndex !== -1) {
    const marketingResult = adjustedResults[marketingResultIndex];
    handoffs.push({
      id: `ho-mkt-mgr-${runId}`,
      runId,
      fromDepartmentId: 'marketing',
      toDepartmentId: 'manager',
      fromAgentId: marketingResult.agentId,
      toAgentId: 'manager_agent',
      title: '캠페인 기획 및 협업 보정안 결재 상신',
      message: `협업 피드백을 수용하여 보정된 캠페인 제안 상세 기안을 매니저 보고 드립니다.`,
      referencedResultIds: [marketingResult.id],
      createdAt: currentTime
    });
    activityLogs.push('마케팅팀이 총괄 매니저에게 캠페인 후보 및 협업 보정 결과를 결재 요청했습니다.');
  }

  // E. 상품관리팀 → 총괄 매니저 Handoff
  if (productResult) {
    handoffs.push({
      id: `ho-prod-mgr-${runId}`,
      runId,
      fromDepartmentId: 'product',
      toDepartmentId: 'manager',
      fromAgentId: productResult.agentId,
      toAgentId: 'manager_agent',
      title: '재고 부족 및 추가 긴급 발주 보고',
      message: `안전재고 기준을 미달한 품목의 긴급 발주 제안서 승인을 요청드립니다.`,
      referencedResultIds: [productResult.id],
      createdAt: currentTime
    });
    activityLogs.push('상품관리팀이 총괄 매니저에게 재고 긴급 상황 및 발주서 결재를 보고했습니다.');
  }

  // F. CS팀 → 총괄 매니저 Handoff
  if (csResult) {
    handoffs.push({
      id: `ho-cs-mgr-${runId}`,
      runId,
      fromDepartmentId: 'cs',
      toDepartmentId: 'manager',
      fromAgentId: csResult.agentId,
      toAgentId: 'manager_agent',
      title: '문의 답변 초안 및 부정리뷰 리스크 보고',
      message: `미답변 답변 초안 검수 및 부정적인 평가 조치 방안을 보고드립니다.`,
      referencedResultIds: [csResult.id],
      createdAt: currentTime
    });
    activityLogs.push('CS팀이 총괄 매니저에게 CS 답변 초안 및 부정 리뷰 여론 대응 결재를 요청했습니다.');
  }

  return {
    handoffs,
    activityLogs,
    adjustedResults
  };
}
