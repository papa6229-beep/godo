import type { AgentResult, AgentArtifact, AgentResultStatus, DepartmentId } from './types';

export function aggregateTeamResults(
  runId: string,
  departmentId: DepartmentId,
  memberResults: AgentResult[],
  leadAgentId: string
): AgentResult {
  const currentTime = new Date().toISOString();
  
  const findings: string[] = [];
  const recommendations: string[] = [];
  const riskFlags: string[] = [];
  let approvalRequired = false;
  const artifacts: AgentArtifact[] = [];

  // 팀원들 결과 취합
  memberResults.forEach(res => {
    findings.push(...res.findings);
    recommendations.push(...res.recommendations);
    riskFlags.push(...res.riskFlags);
    if (res.approvalRequired) {
      approvalRequired = true;
    }
  });

  let summary = '';
  let briefingTitle = '';
  let briefingBody = '';

  if (departmentId === 'product') {
    summary = '상품 및 재고 관리 부서 종합 요약: 상품 데이터 검수 완료 및 안전재고 미달 품목 긴급 보고 접수.';
    briefingTitle = '상품 및 재고 종합 분석 보고서';
    briefingBody = `[상품관리팀 일일 총괄 보고]\n\n` +
      `1. 주요 분석 사항:\n` +
      findings.map(f => `- ${f}`).join('\n') + `\n\n` +
      `2. 부서 권고사항:\n` +
      recommendations.map(r => `- ${r}`).join('\n') + `\n\n` +
      `3. 특이 위험 요소: ${riskFlags.length > 0 ? riskFlags.join(', ') : '없음'}`;
  } 
  else if (departmentId === 'cs') {
    summary = 'CS 및 여론 분석 부서 종합 요약: 미답변 고객 문의 답변 초안 생성 완료 및 부정 평점 리뷰 대응안 수립.';
    briefingTitle = 'CS 및 리뷰 여론 리스크 보고서';
    briefingBody = `[CS 운영팀 일일 총괄 보고]\n\n` +
      `1. 주요 분석 사항:\n` +
      findings.map(f => `- ${f}`).join('\n') + `\n\n` +
      `2. 부서 권고사항:\n` +
      recommendations.map(r => `- ${r}`).join('\n') + `\n\n` +
      `3. 특이 위험 요소: ${riskFlags.length > 0 ? riskFlags.join(', ') : '없음'}`;
  } 
  else if (departmentId === 'marketing') {
    summary = '마케팅 전략 부서 종합 요약: 타 부서 협업 데이터를 융합한 재구매 타겟 웰컴백 쿠폰 및 프로모션 조건 설계 완료.';
    briefingTitle = '마케팅 프로모션 전략 제안서';
    briefingBody = `[마케팅 기획팀 일일 총괄 보고]\n\n` +
      `1. 주요 분석 사항:\n` +
      findings.map(f => `- ${f}`).join('\n') + `\n\n` +
      `2. 부서 권고사항:\n` +
      recommendations.map(r => `- ${r}`).join('\n') + `\n\n` +
      `3. 특이 위험 요소: ${riskFlags.length > 0 ? riskFlags.join(', ') : '없음'}`;
  }

  // Briefing 아티팩트 생성 및 추가
  artifacts.push({
    id: `art-lead-briefing-${departmentId}-${runId}`,
    runId,
    agentId: leadAgentId,
    departmentId,
    type: 'briefing',
    title: briefingTitle,
    body: briefingBody,
    approvalRequired: false,
    createdAt: currentTime
  });

  // RC-2(G3): 팀원 결과에 실패가 있으면 success 로 단정하지 않는다.
  //   전부 실패면 failed, 일부만 실패면 partial(성공 결과는 그대로 보존).
  const failedCount = memberResults.filter((r) => r.status === 'failed' || r.status === 'blocked').length;
  const aggregateStatus: AgentResultStatus =
    memberResults.length > 0 && failedCount === memberResults.length ? 'failed'
      : failedCount > 0 ? 'partial'
        : 'success';

  return {
    id: `res-lead-${departmentId}-${runId}`,
    runId,
    jobId: `job-lead-aggregate-${departmentId}-${runId}`,
    agentId: leadAgentId,
    departmentId,
    status: aggregateStatus,
    summary,
    findings,
    recommendations,
    handoffTargets: [],
    artifacts,
    riskFlags,
    approvalRequired,
    createdAt: currentTime
  };
}
