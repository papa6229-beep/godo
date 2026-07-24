import type { AgentHandoff, AgentResult, DepartmentId } from './types';

export interface HandoffProcessResult {
  handoffs: AgentHandoff[];
  activityLogs: string[];
  adjustedResults: AgentResult[];
}

/** RC-2(G4): handoff 가 어느 업무 흐름의 것인지 보존한다. 없으면 runId 기반으로 후퇴. */
export interface HandoffLifecycleRef {
  taskId?: string;
  correlationId?: string;
}

// 부서별 handoff 문구 규칙. 부서를 코드 곳곳에 흩뿌리지 않고 여기 한 곳에서 정의한다.
interface DeptHandoffRule {
  from: DepartmentId;
  to: DepartmentId;
  toAgentId: string;
  title: string;
  /** 결과 1건 → 전달 본문. 결과마다 각각 호출된다(첫 결과만 고르지 않는다). */
  message: (r: AgentResult) => string;
  log: (r: AgentResult) => string;
}

const listOr = (items: string[], fallback: string): string => (items.length > 0 ? items.join(', ') : fallback);

const PRODUCT_TO_MARKETING: DeptHandoffRule = {
  from: 'product', to: 'marketing', toAgentId: 'marketing_lead',
  title: '재고 상태 및 판매 인기 품목 데이터 Handoff',
  message: (r) => {
    const lowStock = r.findings.filter((f) => f.includes('안전재고') || f.includes('재고'));
    const topSelling = r.findings.filter((f) => f.includes('판매량 최고'));
    let msg = '상품 데이터 분석 결과 전달:\n';
    if (lowStock.length > 0) msg += `- [재고 부족 경보] ${lowStock.join(', ')} 상품은 마케팅 프로모션 대상에서 제외를 권고합니다.\n`;
    if (topSelling.length > 0) msg += `- [인기 품목 정보] ${topSelling.join(', ')} 상품은 활발한 재구매 캠페인 기획 대상으로 추천합니다.\n`;
    if (lowStock.length === 0 && topSelling.length === 0) msg += `- ${listOr(r.findings, '특이사항 없음')}\n`;
    return msg;
  },
  log: () => '상품관리팀이 마케팅팀에 재고 상태 및 판매 인기 품목 정보를 전달했습니다.'
};

const CS_TO_MARKETING: DeptHandoffRule = {
  from: 'cs', to: 'marketing', toAgentId: 'marketing_lead',
  title: '고객 클레임 및 부정 리뷰 여론 Handoff',
  message: (r) => {
    const negative = r.findings.filter((f) => f.includes('부정') || f.includes('별점'));
    let msg = 'CS 및 여론 수집 리스크 Handoff:\n';
    if (negative.length > 0) msg += `- [부정 여론] ${negative.join(', ')} 상품의 불만족 접수로 인해 홍보 활동 시 어조 주의 및 패키징 결함 해결 전 캠페인 보류를 요청합니다.\n`;
    else msg += `- ${listOr(r.findings, '특별한 브랜드 위험 여론 리스크는 없습니다.')}\n`;
    return msg;
  },
  log: () => 'CS팀이 마케팅팀에 고객 부정 리뷰 및 브랜드 이슈 리스크 정보를 전달했습니다.'
};

const toManager = (from: DepartmentId, title: string, message: string, log: string): DeptHandoffRule => ({
  from, to: 'manager', toAgentId: 'manager_agent', title, message: () => message, log: () => log
});

const MANAGER_RULES: DeptHandoffRule[] = [
  toManager('marketing', '캠페인 기획 및 협업 보정안 결재 상신',
    '협업 피드백을 수용하여 보정된 캠페인 제안 상세 기안을 매니저 보고 드립니다.',
    '마케팅팀이 총괄 매니저에게 캠페인 후보 및 협업 보정 결과를 결재 요청했습니다.'),
  toManager('product', '재고 부족 및 추가 긴급 발주 보고',
    '안전재고 기준을 미달한 품목의 긴급 발주 제안서 승인을 요청드립니다.',
    '상품관리팀이 총괄 매니저에게 재고 긴급 상황 및 발주서 결재를 보고했습니다.'),
  toManager('cs', '문의 답변 초안 및 부정리뷰 리스크 보고',
    '미답변 답변 초안 검수 및 부정적인 평가 조치 방안을 보고드립니다.',
    'CS팀이 총괄 매니저에게 CS 답변 초안 및 부정 리뷰 여론 대응 결재를 요청했습니다.')
];

/**
 * 부서 간 Handoff 조율.
 *
 * RC-2(G4): 과거에는 `results.find(r => r.departmentId === 'product')` 로 **부서당 첫 결과만**
 *   골라 재고·리뷰 등 나머지 결과가 통째로 누락됐다(RED R4). 이제 해당 부서의 **모든 결과**를
 *   각각 handoff 하고, 각 handoff 는 고유 id 와 lifecycle 참조(taskId/correlationId/runId)를
 *   보존해 원 결과(resultId)로 역추적할 수 있다.
 */
export function processHandoffs(
  runId: string,
  results: AgentResult[],
  lifecycle: HandoffLifecycleRef = {}
): HandoffProcessResult {
  const handoffs: AgentHandoff[] = [];
  const activityLogs: string[] = [];
  const adjustedResults = [...results];
  const currentTime = new Date().toISOString();

  const taskId = lifecycle.taskId ?? `task-${runId}`;
  const correlationId = lifecycle.correlationId ?? taskId;

  const byDept = (dept: DepartmentId): AgentResult[] => results.filter((r) => r.departmentId === dept);
  const hasProduct = byDept('product').length > 0;
  const hasCs = byDept('cs').length > 0;

  // 결과 1건 → handoff 1건. id 는 결과 id 를 포함해 항상 고유하다.
  const pushRule = (rule: DeptHandoffRule, r: AgentResult): void => {
    handoffs.push({
      id: `ho-${rule.from}-${rule.to}-${r.id}`,
      runId,
      taskId,
      correlationId,
      fromDepartmentId: rule.from,
      toDepartmentId: rule.to,
      fromAgentId: r.agentId,
      toAgentId: rule.toAgentId,
      title: rule.title,
      message: rule.message(r),
      referencedResultIds: [r.id],
      createdAt: currentTime
    });
    activityLogs.push(rule.log(r));
  };

  // A·B. 부서 → 마케팅 (해당 부서의 **모든** 결과를 각각 전달)
  for (const r of byDept('product')) pushRule(PRODUCT_TO_MARKETING, r);
  for (const r of byDept('cs')) pushRule(CS_TO_MARKETING, r);

  // C. 마케팅 결과 보정 — 수신 handoff 가 있을 때 마케팅 결과 전부에 반영
  if ((hasProduct || hasCs) && byDept('marketing').length > 0) {
    for (let i = 0; i < adjustedResults.length; i++) {
      if (adjustedResults[i].departmentId !== 'marketing') continue;
      const m = { ...adjustedResults[i] };
      m.findings = [...m.findings, '[Handoff 피드백] 상품 및 CS 부서 협업 정보 반영: 재고 부족 품목 및 파손 클레임 유입 상품은 금주 푸시 캠페인 품목에서 자동 제외 처리.'];
      m.recommendations = [...m.recommendations, '재고 미달 품목과 누액 파손 접수 상품을 제외한 잔여 재고 안전 품목 위주로 캠페인을 실행하도록 프로모션을 수정 승인해 주십시오.'];
      const artifacts = [...m.artifacts];
      const planIndex = artifacts.findIndex((art) => art.type === 'marketing_plan');
      if (planIndex !== -1) {
        artifacts[planIndex] = {
          ...artifacts[planIndex],
          body: artifacts[planIndex].body + '\n\n[부서 협업 보정 조치]:\n- 상품팀 Handoff에 의거, 안전재고 미달 품목은 쿠폰 적용 대상에서 한시 제외.\n- CS팀 Handoff에 의거, 누액 파손이 접수된 클레임 상품은 금주 캠페인 배너 광고에서 제외함.'
        };
      }
      m.artifacts = artifacts;
      adjustedResults[i] = m;
    }
    activityLogs.push('마케팅팀이 상품관리팀 및 CS팀에서 전달받은 Handoff 데이터를 분석하여 금주 프로모션 대상 품목을 최종 보정했습니다.');
  }

  // D·E·F. 각 부서 → 총괄 매니저 (역시 부서의 모든 결과를 각각 상신)
  for (const rule of MANAGER_RULES) {
    const source = rule.from === 'marketing' ? adjustedResults.filter((r) => r.departmentId === 'marketing') : byDept(rule.from);
    for (const r of source) pushRule(rule, r);
  }

  return { handoffs, activityLogs, adjustedResults };
}
