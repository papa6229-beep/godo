import type { Task } from '../types';

export const initialTasks: Task[] = [
  {
    id: 'task-1',
    title: '당일 신규 주문 실시간 확인 및 검수',
    agentId: 'order',
    status: 'pending',
    output: '대기 중...'
  },
  {
    id: 'task-2',
    title: '미답변 1:1 고객 문의 분석 및 답변 대기',
    agentId: 'cs',
    status: 'pending',
    output: '대기 중...'
  },
  {
    id: 'task-3',
    title: '3일 이상 송장 미등록/배송 지연 주문 필터링',
    agentId: 'delivery',
    status: 'pending',
    output: '대기 중...'
  },
  {
    id: 'task-4',
    title: '신규 상품 리뷰 감정 분석 및 답글 초안 작성',
    agentId: 'review',
    status: 'pending',
    output: '대기 중...'
  },
  {
    id: 'task-5',
    title: '옵션별 안전 재고 미달 품절 위험 상품 확인',
    agentId: 'stock',
    status: 'pending',
    output: '대기 중...'
  },
  {
    id: 'task-6',
    title: '금일 실시간 매출액 및 카테고리별 통계 집계',
    agentId: 'finance',
    status: 'pending',
    output: '대기 중...'
  }
];
