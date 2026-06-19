import type { OperationTask, RouteType } from '../types/task';
import type { EngineMode, EngineRoutingRule, EngineSafetyRule } from '../types/engine';

/**
 * 전역 EngineMode와 라우팅 규칙, 안전수칙(Safety Rules)에 맞춰 작업의 RouteType 및 권한 단계를 유기적으로 라우팅합니다.
 */
export const routeTask = (
  task: OperationTask,
  mode: EngineMode,
  routingRules: EngineRoutingRule[],
  safetyRules: EngineSafetyRule[]
): OperationTask => {
  let computedRoute: RouteType;
  let reason: string;

  // 1. 전역 모드: manual_control일 경우, 중요 업무는 강제 인간 개입(human)
  if (mode === 'manual_control') {
    if (task.riskLevel === 'high' || task.riskLevel === 'critical' || task.permission === 'approval_required' || task.permission === 'manual_only') {
      return {
        ...task,
        routeType: 'human',
        permission: task.permission === 'auto' ? 'approval_required' : task.permission,
        status: 'assigned'
      };
    }
  }

  // 2. Safety Rules 적용 (최우선 순위 필터)
  const isSafetyRuleEnabled = (id: string) => {
    return safetyRules.find(r => r.id === id)?.isEnabled ?? false;
  };

  // 2-1) 가격 수정 강제 수동
  if (task.id.includes('price') || task.title.includes('가격') || task.title.includes('price')) {
    if (isSafetyRuleEnabled('safety_4')) {
      return { ...task, routeType: 'human', permission: 'manual_only', status: 'assigned' };
    }
  }

  // 2-2) 환불 실행 강제 수동
  if (task.title.includes('환불') || task.title.includes('refund')) {
    if (isSafetyRuleEnabled('safety_2')) {
      return { ...task, routeType: 'human', permission: 'manual_only', status: 'assigned' };
    }
  }

  // 2-3) 쿠폰 생성 검토 승인 강제
  if (task.title.includes('쿠폰') || task.title.includes('coupon')) {
    if (isSafetyRuleEnabled('safety_3')) {
      return { ...task, routeType: 'human', permission: 'approval_required', status: 'assigned' };
    }
  }

  // 2-4) 개인정보 전송 차단 (Cloud 라우팅 차단 -> Local 또는 Human으로 리다이렉트)
  const isSensitive = task.title.includes('고객') || task.title.includes('inquiry') || task.title.includes('CS') || task.title.includes('주문');
  const cloudBlockActive = isSafetyRuleEnabled('safety_1');

  // 3. Routing Rules 매칭 검색
  // taskType 매칭 또는 agentId 기반 매칭
  let matchedRule = routingRules.find(r => r.enabled && (r.taskType === task.assignedAgentId || task.title.includes(r.name) || (task.id && task.id.includes(r.taskType))));
  
  // 직접 매칭이 없다면 적당한 룰 추정 매칭
  if (!matchedRule) {
    if (task.assignedAgentId === 'order') {
      matchedRule = routingRules.find(r => r.taskType === 'order_check');
    } else if (task.assignedAgentId === 'cs') {
      matchedRule = routingRules.find(r => r.taskType === 'cs_reply_draft');
      if (!matchedRule) {
        matchedRule = routingRules.find(r => r.taskType === 'inquiry_classify');
      }
    } else if (task.assignedAgentId === 'marketing') {
      matchedRule = routingRules.find(r => r.taskType === 'campaign_strategy');
    } else if (task.assignedAgentId === 'finance') {
      matchedRule = routingRules.find(r => r.taskType === 'sales_summary');
    } else if (task.assignedAgentId === 'review') {
      matchedRule = routingRules.find(r => r.taskType === 'review_reply_draft');
    } else if (task.assignedAgentId === 'stock') {
      matchedRule = routingRules.find(r => r.taskType === 'inventory_check');
    }
  }

  if (matchedRule && matchedRule.enabled) {
    computedRoute = matchedRule.preferredRoute as RouteType;
    reason = `Routing Rule: [${matchedRule.name}] 규칙 적용`;

    // 만약 클라우드 전송 차단 룰이 켜져 있고 클라우드로 가려 한다면, local로 우회
    if (cloudBlockActive && isSensitive && (computedRoute === 'cloud' || computedRoute === 'hybrid')) {
      computedRoute = 'local';
      reason = `Routing Rule 우회: 개인정보 보호를 위한 Cloud 전송 차단`;
    }
  } else {
    // 매칭 룰이 없을 시 기본 분기
    if (task.permission === 'approval_required' || task.permission === 'manual_only' || task.riskLevel === 'high' || task.riskLevel === 'critical') {
      computedRoute = 'human';
      reason = 'Default Rule: 고위험/승인대상 작업 휴먼 라우팅';
    } else if (task.assignedAgentId === 'marketing' || task.assignedAgentId === 'finance') {
      computedRoute = 'hybrid';
      reason = 'Default Rule: 분석/마케팅 작업 하이브리드 자동 라우팅';
    } else {
      computedRoute = 'local';
      reason = 'Default Rule: 단순 분석/상태 체크 로컬 라우팅';
    }
  }

  // 전역 모드 덮어쓰기 조정
  if (mode === 'local_first' && computedRoute === 'cloud') {
    computedRoute = 'local';
    reason = `Engine Mode (Local First): 로컬 우회 라우팅`;
  } else if (mode === 'cloud_first' && computedRoute === 'local' && !isSensitive) {
    computedRoute = 'cloud';
    reason = `Engine Mode (Cloud First): 클라우드 우선 라우팅`;
  } else if (mode === 'demo') {
    // 데모 모드에서는 룰대로 라우팅하되 Connected/Mock 상태를 보장
    reason = `Engine Mode (Demo): 디폴트 데모 룰 라우팅`;
  }

  // 최종 리턴 및 task에 라우팅 사유 및 타입 기록
  return {
    ...task,
    routeType: computedRoute,
    status: 'assigned',
    description: task.description + ` (배정 방식: ${computedRoute.toUpperCase()} - 사유: ${reason})`
  };
};
