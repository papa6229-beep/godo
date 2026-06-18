import type { OperationTask } from '../types/task';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import { taskTemplates } from '../data/taskTemplates';

/**
 * 일일 정기 쇼핑몰 운영 작업을 초기화하여 생성합니다.
 */
export const createDailyOperationTasks = (activeOperationsData?: OperationsDataSnapshot): OperationTask[] => {
  return taskTemplates.map((template, idx) => {
    let inputCount: number | undefined;

    if (activeOperationsData) {
      if (template.relatedDataType === 'orders') {
        inputCount = activeOperationsData.orders.length;
      } else if (template.relatedDataType === 'inquiries') {
        inputCount = activeOperationsData.inquiries.length;
      } else if (template.relatedDataType === 'reviews') {
        inputCount = activeOperationsData.reviews.length;
      } else if (template.relatedDataType === 'inventory') {
        inputCount = activeOperationsData.inventory.length;
      } else if (template.relatedDataType === 'sales') {
        inputCount = activeOperationsData.sales.length;
      }
    }

    return {
      id: `opt-task-${idx + 1}-${Date.now()}`,
      title: template.title,
      description: template.description,
      assignedAgentId: template.assignedAgentId,
      status: 'pending',
      riskLevel: template.riskLevel,
      permission: template.permission,
      routeType: template.routeType,
      relatedDataType: template.relatedDataType,
      requiredSkills: template.requiredSkills || [],
      createdAt: new Date().toISOString(),
      inputCount,
      dataSourceType: activeOperationsData?.sourceType
    };
  });
};

/**
 * 사용자의 자연어 명령을 기반으로 분해(Decomposition)된 특수 작업을 기획합니다. (Stub 구조 열어둠)
 * @param prompt 사용자의 명령어 텍스트
 */
export const planCustomTasks = (prompt: string): OperationTask[] => {
  // 사용자의 입력에 따라 분기가 가능하도록 구조화
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('주문') || lowerPrompt.includes('결제')) {
    return [
      {
        id: `opt-custom-task-1-${Date.now()}`,
        title: '신규 주문 확인',
        description: `사용자 지시 [${prompt}] 관련: 신규 주문 긴급 데이터 검증`,
        assignedAgentId: 'order',
        status: 'pending',
        riskLevel: 'low',
        permission: 'auto',
        routeType: 'local',
        relatedDataType: 'orders',
        requiredSkills: ['결제액 대조 검증', '비정상 주문 패턴 감지'],
        createdAt: new Date().toISOString()
      }
    ];
  }
  
  if (lowerPrompt.includes('리뷰') || lowerPrompt.includes('답글')) {
    return [
      {
        id: `opt-custom-task-2-${Date.now()}`,
        title: '리뷰 답글 초안 생성',
        description: `사용자 지시 [${prompt}] 관련: 리뷰 분석 및 대응 답글 제작`,
        assignedAgentId: 'review',
        status: 'pending',
        riskLevel: 'medium',
        permission: 'draft_only',
        routeType: 'local',
        relatedDataType: 'reviews',
        requiredSkills: ['리뷰 텍스트 톤 분석', '감사/개선 답변 초안 자동 생성'],
        createdAt: new Date().toISOString()
      }
    ];
  }

  if (lowerPrompt.includes('재고') || lowerPrompt.includes('품절')) {
    return [
      {
        id: `opt-custom-task-3-${Date.now()}`,
        title: '품절 위험 상품 확인',
        description: `사용자 지시 [${prompt}] 관련: 실시간 안전 재고 검사 및 품절 위험 측정`,
        assignedAgentId: 'stock',
        status: 'pending',
        riskLevel: 'low',
        permission: 'auto',
        routeType: 'local',
        relatedDataType: 'inventory',
        requiredSkills: ['재고 수량 실시간 모니터링', '품절 소진 시점 예측 시뮬레이션'],
        createdAt: new Date().toISOString()
      }
    ];
  }

  // 기본 반환 (총괄 매니저가 매칭하는 형태)
  return [
    {
      id: `opt-custom-task-gen-${Date.now()}`,
      title: '사용자 명령 종합 조율',
      description: `사용자 직접 지시 사항 [${prompt}] 에 대한 에이전트 간 대응 조율`,
      assignedAgentId: 'manager',
      status: 'pending',
      riskLevel: 'medium',
      permission: 'draft_only',
      routeType: 'hybrid',
      requiredSkills: ['태스크 오케스트레이션'],
      createdAt: new Date().toISOString()
    }
  ];
};
