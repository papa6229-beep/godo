import type { OperationTask } from '../types/task';

export interface TaskTemplate {
  title: string;
  description: string;
  assignedAgentId: string;
  permission: OperationTask['permission'];
  routeType: OperationTask['routeType'];
  riskLevel: OperationTask['riskLevel'];
  relatedDataType: OperationTask['relatedDataType'];
  requiredSkills?: string[];
}

export const taskTemplates: TaskTemplate[] = [
  {
    title: '신규 주문 확인',
    description: '고도몰 API를 통한 당일 신규 주문 수집 및 결제 유효성 검증',
    assignedAgentId: 'order',
    permission: 'auto',
    routeType: 'local',
    riskLevel: 'low',
    relatedDataType: 'orders',
    requiredSkills: ['결제액 대조 검증', '비정상 주문 패턴 감지']
  },
  {
    title: '미답변 문의 분석',
    description: '미답변 고객 1:1 상담 데이터 자동 수집 및 유형별 텍스트 감정 진단',
    assignedAgentId: 'cs',
    permission: 'draft_only',
    routeType: 'local',
    riskLevel: 'medium',
    relatedDataType: 'inquiries',
    requiredSkills: ['고객 의도 및 감정 분석', '클레임 위험도 평가']
  },
  {
    title: '배송 지연 주문 체크',
    description: '운송장 매칭 상태 및 주요 택배사 배송 상태 트래킹을 통한 지연 건 추출',
    assignedAgentId: 'delivery',
    permission: 'auto',
    routeType: 'local',
    riskLevel: 'medium',
    relatedDataType: 'orders',
    requiredSkills: ['실시간 배송 상태 트래킹', '지연 예상 상품 경보 추출']
  },
  {
    title: '리뷰 답글 초안 생성',
    description: '신규 구매평 리뷰 텍스트 수집 및 톤앤매너 매칭 개인화 답변 초안 기획',
    assignedAgentId: 'review',
    permission: 'draft_only',
    routeType: 'local',
    riskLevel: 'medium',
    relatedDataType: 'reviews',
    requiredSkills: ['리뷰 텍스트 톤 분석', '감사/개선 답변 초안 자동 생성']
  },
  {
    title: '품절 위험 상품 확인',
    description: '상품별 재고 잔량 모니터링 및 일평균 소진 속도 분석 기반 품절 알림',
    assignedAgentId: 'stock',
    permission: 'auto',
    routeType: 'local',
    riskLevel: 'low',
    relatedDataType: 'inventory',
    requiredSkills: ['재고 수량 실시간 모니터링', '품절 소진 시점 예측 시뮬레이션']
  },
  {
    title: '오늘 매출 요약',
    description: '일일 결제 완료액, 취소액, 카테고리별 마진 및 ROAS 재무 효율 요약',
    assignedAgentId: 'finance',
    permission: 'auto',
    routeType: 'hybrid',
    riskLevel: 'medium',
    relatedDataType: 'sales',
    requiredSkills: ['매출/환불 데이터 정량 분석', '기여 마진 분석 모델링']
  },
  {
    title: '재구매 캠페인 제안',
    description: '우수 고객 및 이탈 위험 고객 대상 7일 한정 타겟 할인 쿠폰 발행 기획',
    assignedAgentId: 'marketing',
    permission: 'approval_required',
    routeType: 'hybrid',
    riskLevel: 'high',
    relatedDataType: 'sales',
    requiredSkills: ['고객 세그먼테이션', '할인율 시뮬레이션 및 마진 추정']
  }
];
