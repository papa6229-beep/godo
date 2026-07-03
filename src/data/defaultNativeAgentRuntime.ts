import type { DepartmentDefinition, NativeAgentDefinition } from '../engine/nativeAgentRuntime/types';

export const defaultDepartments: DepartmentDefinition[] = [
  {
    id: 'manager',
    name: '본부 및 오케스트레이션',
    description: '전체 운영 흐름을 기획하고 부서별 업무 결과를 조정 및 승인하는 본부실',
    leadAgentId: 'manager_agent',
    memberAgentIds: ['manager_agent'],
    enabled: true
  },
  {
    id: 'product',
    name: '상품관리팀',
    description: '상품 메타데이터, 판매 분석 및 위험 재고 수준을 모니터링하는 부서',
    leadAgentId: 'product_lead',
    memberAgentIds: ['product_lead', 'product_analyst', 'inventory_monitor'],
    enabled: true
  },
  {
    id: 'cs',
    name: 'CS 운영팀',
    description: '고객 1:1 문의 응대 초안 작성, 리뷰 감성 분석 및 부정 이슈 조기 감지를 당당하는 부서',
    leadAgentId: 'cs_lead',
    memberAgentIds: ['cs_lead', 'inquiry_analyst', 'review_detector'],
    enabled: true
  },
  {
    id: 'marketing',
    name: '마케팅 기획팀',
    description: '쇼핑몰 트렌드 조사, 구매 이력 기반 고객 타겟팅 및 프로모션 기획을 담당하는 부서',
    leadAgentId: 'marketing_lead',
    memberAgentIds: ['marketing_lead', 'trend_researcher', 'campaign_planner'],
    enabled: true
  },
  {
    id: 'design',
    name: '디자인팀',
    description: '상품 상세페이지·섬네일 제작 및 상품등록 준비를 담당하는 웹디자인 부서',
    leadAgentId: 'design_lead',
    memberAgentIds: ['design_lead'],
    enabled: true
  }
];

export const defaultNativeAgents: NativeAgentDefinition[] = [
  // 1. 총괄 매니저
  {
    id: 'manager_agent',
    name: '총괄 매니저 AI (HQ-01)',
    departmentId: 'manager',
    role: 'manager',
    title: 'HQ 총괄 디렉터',
    description: '전 부서의 운영 상태를 조율하고 일일 브리핑을 완성하며 수동 승인 이력을 통제합니다.',
    skills: ['태스크 오케스트레이션', '종합 운영 분석 및 리포팅', '예외 상황 감지 및 인간 에스컬레이션'],
    modelPreference: 'local_gemma',
    enabled: true
  },

  // 2. 상품관리팀
  {
    id: 'product_lead',
    name: '상품관리 팀장 AI (PDT-L)',
    departmentId: 'product',
    role: 'team_lead',
    title: '상품 기획 팀장',
    description: '팀원들의 분석 리포트와 재고 지표를 취합하여 총괄 보고서를 작성하고 타 부서로 협업 정보를 송신합니다.',
    skills: ['부서 내 태스크 관리', '상품 카탈로그 요약 및 리포팅', 'Handoff 정보 조율'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'product_analyst',
    name: '상품 데이터 분석 AI (PDT-A)',
    departmentId: 'product',
    role: 'team_member',
    title: '데이터 카탈로그 분석원',
    description: '상품 정보 오기입, SEO 매핑 누락 및 상품별 판매 성과 패턴을 정량 검증합니다.',
    skills: ['SEO 키워드 분석', '상품 규격화', '판매 이상 패턴 감지'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'inventory_monitor',
    name: '재고/판매상태 감시 AI (PDT-M)',
    departmentId: 'product',
    role: 'team_member',
    title: '실재고 관제 모니터링원',
    description: '옵션별 안전 재고 한도 도달 여부를 실시간으로 모니터링하여 긴급 발주 제안 및 품절 예상일을 시뮬레이션합니다.',
    skills: ['재고 수량 실시간 모니터링', '소진 기한 예측', '발주서 자동 포맷팅'],
    modelPreference: 'local_gemma',
    enabled: true
  },

  // 3. CS팀
  {
    id: 'cs_lead',
    name: 'CS 팀장 AI (CS-L)',
    departmentId: 'cs',
    role: 'team_lead',
    title: '고객 관계 관리 팀장',
    description: '미답변 CS 요약과 리뷰 감성 추이를 집합하여 종합 보고서를 승인 올립니다.',
    skills: ['CS 워크플로우 통제', '에스컬레이션 의사결정', 'CS 지표 종합 분석'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'inquiry_analyst',
    name: '문의 분석 AI (CS-IA)',
    departmentId: 'cs',
    role: 'team_member',
    title: '1:1 문의 전담 상담원',
    description: '미답변 문의의 유입 경로, 고객 감정, 카테고리를 분류하고 1차 정책 지침을 참조한 답변 초안을 설계합니다.',
    skills: ['고객 감정 분석', 'CS 답변 초안 생성', 'FAQ 매핑'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'review_detector',
    name: '리뷰/이슈 감지 AI (CS-RD)',
    departmentId: 'cs',
    role: 'team_member',
    title: '여론 및 브랜드 리스크 수집원',
    description: '고객 포토/텍스트 리뷰를 전수 조사하여 평점 2점 이하의 악성 민원이나 포장 훼손 등의 리스크를 조기 발견합니다.',
    skills: ['리뷰 톤 분석', '브랜드 리스크 수집', '사과문 초안 작성'],
    modelPreference: 'local_gemma',
    enabled: true
  },

  // 4. 마케팅팀
  {
    id: 'marketing_lead',
    name: '마케팅 팀장 AI (MKT-L)',
    departmentId: 'marketing',
    role: 'team_lead',
    title: '마케팅 전략 팀장',
    description: 'CS/상품 부서에서 Handoff된 재고/이슈 정보를 결합하여 프로모션 세그먼트를 확정하고 매니저에게 제출합니다.',
    skills: ['마케팅 믹스 전략 수립', '타 부서 협업 데이터 융합', '캠페인 ROI 기획'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'trend_researcher',
    name: '시장/트렌드 리서치 AI (MKT-R)',
    departmentId: 'marketing',
    role: 'team_member',
    title: '쇼핑몰 트렌드 조사원',
    description: '내부 구매 이력 세그먼트를 추출하고 시장 분석(웹 검색 미연동으로 내부 데이터 기준)을 모방해 기획 소스를 발굴합니다.',
    skills: ['고객 구매 패턴 세그먼테이션', '내부 트렌드 분석', '경쟁 제품 카탈로그 분석'],
    modelPreference: 'local_gemma',
    enabled: true
  },
  {
    id: 'campaign_planner',
    name: '콘텐츠/캠페인 기획 AI (MKT-C)',
    departmentId: 'marketing',
    role: 'team_member',
    title: '카피라이팅 및 이벤트 디자이너',
    description: '타겟 쿠폰 발행 조건 설계, 푸시 메시지 카피라이팅 및 시즌별 이벤트 제안 상세 기획서를 도출합니다.',
    skills: ['할인 쿠폰 발행 조건 설계', '메시지 카피라이팅', '프로모션 테마 디자인'],
    modelPreference: 'local_gemma',
    enabled: true
  },

  // 5. 디자인팀
  {
    id: 'design_lead',
    name: '디자인 팀장 AI (DSN-L)',
    departmentId: 'design',
    role: 'team_lead',
    title: '웹디자인 팀장',
    description: '상품 자료를 받아 상세페이지·섬네일을 제작하고 상품명·문구를 도출하며 등록 준비 데이터를 완성합니다.',
    skills: ['상세페이지 제작', '섬네일 디자인', '상품 문구/카피 생성', '상품등록 준비'],
    modelPreference: 'cloud_optional',
    enabled: true
  }
];
