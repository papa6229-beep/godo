import type { AgentJob, DepartmentId, NativeAgentDefinition } from './types';

export function planJobs(
  runId: string,
  objective: string,
  agents: NativeAgentDefinition[]
): AgentJob[] {
  const jobs: AgentJob[] = [];
  const currentTime = new Date().toISOString();

  // "오늘 운영 점검" 또는 유사 목표 시 기본 시나리오 작업 생성
  const defaultTaskSpecs = [
    {
      agentId: 'product_analyst',
      departmentId: 'product' as DepartmentId,
      title: '상품 데이터 정밀 검수 및 판매 분석',
      objective: '현재 쇼핑몰 등록 상품 정보의 SEO 매핑 오류 및 어제 대비 판매 증가세 상품 점검',
      requiredSkills: ['SEO 키워드 분석', '판매 이상 패턴 감지'],
      riskLevel: 'auto_safe' as const
    },
    {
      agentId: 'inventory_monitor',
      departmentId: 'product' as DepartmentId,
      title: '안전 재고 하도 상품 감지 및 품절 시뮬레이션',
      objective: '옵션별 실재고 잔량 모니터링을 통한 품절 임박 상품 추출 및 추가 발주 필요 여부 파악',
      requiredSkills: ['재고 수량 실시간 모니터링', '소진 기한 예측'],
      riskLevel: 'draft_only' as const
    },
    {
      agentId: 'inquiry_analyst',
      departmentId: 'cs' as DepartmentId,
      title: '미답변 1:1 고객 문의 분석 및 답변 설계',
      objective: '접수된 미답변 문의들의 유형과 심각성을 분석하고 가이드라인 기반 답변 초안 생성',
      requiredSkills: ['고객 감정 분석', 'CS 답변 초안 생성'],
      riskLevel: 'approval_required' as const
    },
    {
      agentId: 'review_detector',
      departmentId: 'cs' as DepartmentId,
      title: '신규 리뷰 여론 모니터링 및 패키징 위험 진단',
      objective: '고객 별점 2점 이하 부정 리뷰 내역 추출 및 배송 중 파손 리스크 점검',
      requiredSkills: ['리뷰 톤 분석', '브랜드 리스크 수집'],
      riskLevel: 'auto_safe' as const
    },
    {
      agentId: 'trend_researcher',
      departmentId: 'marketing' as DepartmentId,
      title: '구매 이력 분석을 통한 고객 타겟 세그먼테이션',
      objective: '최근 3개월간 이력 기반 재구매 유도 고객군 분류 및 트렌드 매핑 (내부 데이터 기준)',
      requiredSkills: ['고객 구매 패턴 세그먼테이션', '내부 트렌드 분석'],
      riskLevel: 'auto_safe' as const
    },
    {
      agentId: 'campaign_planner',
      departmentId: 'marketing' as DepartmentId,
      title: '고객 이탈 방지용 캠페인 테마 및 할인 쿠폰 기획',
      objective: '타 부서 협업 전달 지표를 반영한 할인 10% 쿠폰 및 이벤트 카피라이팅 설계',
      requiredSkills: ['할인 쿠폰 발행 조건 설계', '메시지 카피라이팅'],
      riskLevel: 'approval_required' as const
    }
  ];

  for (const spec of defaultTaskSpecs) {
    const agent = agents.find(a => a.id === spec.agentId && a.enabled);
    if (!agent) continue;

    jobs.push({
      id: `job-${spec.agentId}-${runId}`,
      runId,
      departmentId: spec.departmentId,
      assignedAgentId: spec.agentId,
      title: spec.title,
      objective: spec.objective,
      inputSummary: `대상 목적: ${objective} / 연동 활성 데이터셋`,
      contextRefs: [],
      requiredSkills: spec.requiredSkills,
      riskLevel: spec.riskLevel,
      status: 'queued',
      createdAt: currentTime
    });
  }

  return jobs;
}
