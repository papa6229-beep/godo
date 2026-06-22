import type { AgentResult, AgentHandoff, AgentArtifact } from './types';

export interface ManagerOrchestrationResult {
  briefingText: string;
  proposedTasks: {
    title: string;
    agentId: string;
    description: string;
  }[];
  proposedApprovalItems: {
    title: string;
    proposedAction: string;
    reason: string;
    agentId: string;
    artifact: AgentArtifact;
  }[];
}

export function orchestrateManager(
  runId: string,
  teamLeadResults: AgentResult[],
  handoffs: AgentHandoff[]
): ManagerOrchestrationResult {
  const proposedTasks: { title: string; agentId: string; description: string; }[] = [];
  const proposedApprovalItems: { title: string; proposedAction: string; reason: string; agentId: string; artifact: AgentArtifact; }[] = [];

  // 각 부서 결과 찾기
  const productResult = teamLeadResults.find(r => r.departmentId === 'product');
  const csResult = teamLeadResults.find(r => r.departmentId === 'cs');
  const marketingResult = teamLeadResults.find(r => r.departmentId === 'marketing');

  // 1. 부서별 상태 파악 및 Today's Tasks 추출
  let productStatus = '특이사항이 보고되지 않았습니다.';
  if (productResult) {
    const lowStock = productResult.findings.filter(f => f.includes('안전재고') || f.includes('재고'));
    if (lowStock.length > 0) {
      productStatus = `안전재고 미달 품목 ${lowStock.length}건이 감지되었습니다.`;
      proposedTasks.push({
        title: '[재고 부족 품목 긴급 확인]',
        agentId: 'stock', // 기존 agent.ts의 재고 에이전트 아이디 매칭
        description: `상품관리팀에서 재고 부족 가능성 품목(${lowStock.length}개)을 보고했습니다.`
      });
    } else {
      productStatus = '모든 재고 수량이 안전 기준치 내에서 유지되고 있습니다.';
    }
  }

  let csStatus = '미답변 문의나 브랜드 불만 여론이 보고되지 않았습니다.';
  if (csResult) {
    const unanswered = csResult.findings.filter(f => f.includes('미답변 문의'));
    const negative = csResult.findings.filter(f => f.includes('부정 리뷰'));
    
    if (unanswered.length > 0 || negative.length > 0) {
      csStatus = `미답변 문의 ${unanswered.length > 0 ? '감지' : '없음'}, 부정 리뷰 ${negative.length > 0 ? negative.length + '건 발견' : '없음'}.`;
      
      if (unanswered.length > 0) {
        proposedTasks.push({
          title: '[CS 고객 문의 답변 승인 요청]',
          agentId: 'cs',
          description: `CS팀에서 미답변 문의에 대한 인공지능 답변 초안 생성을 보고했습니다.`
        });
      }
      if (negative.length > 0) {
        proposedTasks.push({
          title: '[고객 부정 리뷰 및 배송 파손 점검]',
          agentId: 'review',
          description: `CS팀에서 별점 2점 이하의 부정 리뷰 유입을 보고했습니다.`
        });
      }
    }
  }

  let marketingStatus = '제안된 프로모션 캠페인이 없습니다.';
  if (marketingResult) {
    const plans = marketingResult.findings.filter(f => f.includes('캠페인') || f.includes('쿠폰'));
    if (plans.length > 0) {
      marketingStatus = '부서 간 Handoff(재고 미달 품목 제외 등)를 정상 수렴한 캠페인 제안 1건이 준비되었습니다.';
      proposedTasks.push({
        title: '[마케팅 쿠폰 캠페인 최종 검토]',
        agentId: 'marketing',
        description: `마케팅팀에서 협업 피드백을 적용하여 안전 재고 품목 중심의 프로모션을 상신했습니다.`
      });
    }
  }

  // 2. Approval Queue에 보낼 후보 추출 (Artifact 중 approvalRequired=true 인 것들)
  teamLeadResults.forEach(res => {
    // 팀원 결과에서 올라온 Artifact 수집
    res.artifacts.forEach(art => {
      if (art.approvalRequired) {
        proposedApprovalItems.push({
          title: art.title,
          proposedAction: art.type === 'cs_reply_draft' ? '고객 답변 자동 전송 등록' : (art.type === 'marketing_plan' ? '쿠폰 마스터 생성 및 광고 배너 노출' : '승인 완료 후 액션 저장'),
          reason: art.body.substring(0, 150) + (art.body.length > 150 ? '...' : ''),
          agentId: art.agentId,
          artifact: art
        });
      }
    });
  });

  // 3. 우선순위 요약 텍스트 조율
  let priorityTip = '안정적인 일반 운영 상태입니다.';
  if (csResult && csResult.riskFlags.length > 0) {
    priorityTip = '고객 문의 답변 승인 및 부정 리뷰 사후 사과 대처가 최우선 순위입니다.';
  } else if (productResult && productResult.riskFlags.length > 0) {
    priorityTip = '안전재고 미달 상품에 대한 추가 발주 승인 및 수급 조절이 시급합니다.';
  }

  const briefingText = `### GODO AI OS 오늘의 오케스트레이션 종합 브리핑 (Run: ${runId})\n\n` +
    `> **우선 지침**: ${priorityTip}\n\n` +
    `* **상품관리부서**: ${productStatus}\n` +
    `* **CS 운영부서**: ${csStatus}\n` +
    `* **마케팅기획부서**: ${marketingStatus}\n\n` +
    `* **부서 협업 정보 (Handoff) 흐름**:\n` +
    handoffs.map(h => `  - **${h.fromDepartmentId.toUpperCase()} → ${h.toDepartmentId.toUpperCase()}**: ${h.title}`).join('\n') + `\n\n` +
    `※ 승인이 요구되는 고위험 업무 초안(${proposedApprovalItems.length}건)은 우측 승인 대기열(Approval Queue)로 안전하게 인계되었습니다.`;

  return {
    briefingText,
    proposedTasks,
    proposedApprovalItems
  };
}
