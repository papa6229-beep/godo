import type { SkillItem, ToolItem, PermissionMatrixItem } from '../types/studio';

export const defaultSkills: SkillItem[] = [
  {
    id: 'skill-cs-sentiment',
    name: '고객 의도 및 감정 분석',
    description: '고객 문의 글의 의도와 감정을 NLP로 분류하고 위기 상황 여부를 감지합니다.',
    category: 'CS',
    recommendedAgents: ['cs'],
    riskLevel: 'low'
  },
  {
    id: 'skill-claim-risk',
    name: '클레임 위험도 평가',
    description: '배송 지연, 취소 요청 등 클레임의 금전적 위험 및 평판 위험도를 실시간으로 추정합니다.',
    category: 'CS',
    recommendedAgents: ['cs', 'manager'],
    riskLevel: 'medium'
  },
  {
    id: 'skill-cs-draft',
    name: '답변 초안 작성',
    description: '브랜드 가이드라인에 부합하는 정중하고 정확한 답변 템플릿 초안을 구성합니다.',
    category: 'CS',
    recommendedAgents: ['cs'],
    riskLevel: 'low'
  },
  {
    id: 'skill-marketing-blog',
    name: '블로그 포스팅 작성',
    description: '검색 노출 최적화를 고려하여 브랜드 마케팅용 외부 블로그 글을 자동 기고합니다.',
    category: 'Marketing',
    recommendedAgents: ['marketing'],
    riskLevel: 'medium'
  },
  {
    id: 'skill-seo-title',
    name: '네이버 SEO 제목 생성',
    description: '네이버 쇼핑 포털에 최적화된 검색어 조합 상품명을 추천 및 매칭합니다.',
    category: 'Product',
    recommendedAgents: ['product'],
    riskLevel: 'low'
  },
  {
    id: 'skill-marketing-campaign',
    name: '재구매 캠페인 기획',
    description: '이탈 우려 및 특정 세그먼트 고객의 구매 활성화를 위한 리타게팅 이벤트를 설계합니다.',
    category: 'Marketing',
    recommendedAgents: ['marketing'],
    riskLevel: 'high'
  },
  {
    id: 'skill-finance-analysis',
    name: '카테고리별 매출 분석',
    description: '일별 판매 데이터, 환불 데이터, 마진 지표를 통계화하여 추세를 분석합니다.',
    category: 'Finance',
    recommendedAgents: ['finance'],
    riskLevel: 'low'
  },
  {
    id: 'skill-stock-monitor',
    name: '품절 위험 감지',
    description: '일평균 판매 속도와 리드 타임을 고려하여 3일 이내 품절될 SKU를 감지합니다.',
    category: 'Stock',
    recommendedAgents: ['stock'],
    riskLevel: 'low'
  },
  {
    id: 'skill-product-naming',
    name: '상품명 생성',
    description: '상품 카탈로그 메타데이터 분석 기반의 매력적인 프로모션용 상품 명칭을 생성합니다.',
    category: 'Product',
    recommendedAgents: ['product'],
    riskLevel: 'low'
  },
  {
    id: 'skill-product-desc',
    name: '상품 상세 설명 초안 작성',
    description: '제조사 제공 원본 설명 스펙을 쇼핑몰 표준 상세페이지 문구로 규격화합니다.',
    category: 'Product',
    recommendedAgents: ['product'],
    riskLevel: 'low'
  },
  {
    id: 'skill-review-sentiment',
    name: '리뷰 감정 분석',
    description: '구매평 리뷰 텍스트를 파싱하여 긍정/부정 스코어를 산출하고 키워드를 도출합니다.',
    category: 'Review',
    recommendedAgents: ['review', 'cs'],
    riskLevel: 'low'
  },
  {
    id: 'skill-review-reply',
    name: '리뷰 답글 초안 작성',
    description: '리뷰 평점 및 내용 톤에 맞춘 위트 있거나 진정성 있는 답글 초안을 기획합니다.',
    category: 'Review',
    recommendedAgents: ['review'],
    riskLevel: 'low'
  }
];

export const defaultTools: ToolItem[] = [
  {
    id: 'tool-order-read',
    name: '고도몰 주문 조회',
    description: '고도몰 신규 주문 및 결제 완료 건을 실시간 수집 및 대조합니다.',
    category: 'Order',
    permission: 'auto',
    riskLevel: 'low',
    availableAgentIds: ['order', 'manager', 'finance'],
    isEnabled: true
  },
  {
    id: 'tool-product-read',
    name: '고도몰 상품 조회',
    description: '상품 카탈로그 상세 메타데이터 및 옵션 사양을 스캔합니다.',
    category: 'Product',
    permission: 'auto',
    riskLevel: 'low',
    availableAgentIds: ['product', 'stock'],
    isEnabled: true
  },
  {
    id: 'tool-board-read',
    name: '게시판 문의 조회',
    description: '고도몰 1:1 상담 게시판의 신규 미답변 게시글 목록을 로드합니다.',
    category: 'CS',
    permission: 'auto',
    riskLevel: 'low',
    availableAgentIds: ['cs'],
    isEnabled: true
  },
  {
    id: 'tool-reply-draft-write',
    name: '답변 초안 저장',
    description: '작성된 CS 답변 임시 초안을 데이터베이스에 임시 보관 처리합니다.',
    category: 'CS',
    permission: 'draft_only',
    riskLevel: 'medium',
    availableAgentIds: ['cs'],
    isEnabled: true
  },
  {
    id: 'tool-review-draft-write',
    name: '리뷰 답글 초안 저장',
    description: '리뷰 답변 및 적립금 지급 초안 데이터를 등록 대기 상태로 적재합니다.',
    category: 'Review',
    permission: 'draft_only',
    riskLevel: 'medium',
    availableAgentIds: ['review'],
    isEnabled: true
  },
  {
    id: 'tool-coupon-create',
    name: '쿠폰 생성 요청',
    description: '고도몰 쿠폰 마스터 테이블에 할인 이벤트 쿠폰 자동 생성 발행을 샌드박스로 요청합니다.',
    category: 'Marketing',
    permission: 'approval_required',
    riskLevel: 'high',
    availableAgentIds: ['marketing'],
    isEnabled: true
  },
  {
    id: 'tool-banner-update',
    name: '배너 교체 요청',
    description: '메인 배너 이미지 및 텍스트 카피를 지정 서버로 동적 교체 커밋을 요청합니다.',
    category: 'Marketing',
    permission: 'approval_required',
    riskLevel: 'high',
    availableAgentIds: ['marketing'],
    isEnabled: true
  },
  {
    id: 'tool-product-update',
    name: '상품 수정 요청',
    description: '검색 노출 SEO 가이드에 따라 고도몰 DB의 상품 상세 사양 및 태그를 변경 요청합니다.',
    category: 'Product',
    permission: 'approval_required',
    riskLevel: 'high',
    availableAgentIds: ['product'],
    isEnabled: true
  },
  {
    id: 'tool-sales-report',
    name: '매출 리포트 생성',
    description: '결제 금액 대조 및 PG사 수수료 분석을 완료하여 매출 요약 문서를 생성합니다.',
    category: 'Finance',
    permission: 'auto',
    riskLevel: 'low',
    availableAgentIds: ['finance', 'manager'],
    isEnabled: true
  },
  {
    id: 'tool-stock-alert',
    name: '재고 위험 알림 생성',
    description: '품절 경보 대상을 추출하여 공급망 관리자 채널에 긴급 발주 권고를 전달합니다.',
    category: 'Stock',
    permission: 'auto',
    riskLevel: 'low',
    availableAgentIds: ['stock', 'manager'],
    isEnabled: true
  }
];

export const defaultPermissionMatrix: PermissionMatrixItem[] = [
  {
    id: 'perm-order-read',
    taskName: 'order_read',
    description: '주문 내역 자동 조회',
    currentPermission: 'auto',
    riskLevel: 'low',
    relatedAgentIds: ['order', 'manager', 'finance']
  },
  {
    id: 'perm-inquiry-classify',
    taskName: 'inquiry_classify',
    description: '문의 자동 유형 분류',
    currentPermission: 'auto',
    riskLevel: 'low',
    relatedAgentIds: ['cs']
  },
  {
    id: 'perm-review-analyze',
    taskName: 'review_analyze',
    description: '리뷰 텍스트 톤 분석',
    currentPermission: 'auto',
    riskLevel: 'low',
    relatedAgentIds: ['review', 'cs']
  },
  {
    id: 'perm-inventory-check',
    taskName: 'inventory_check',
    description: '재고 잔량 수시 감시',
    currentPermission: 'auto',
    riskLevel: 'low',
    relatedAgentIds: ['stock']
  },
  {
    id: 'perm-sales-summary',
    taskName: 'sales_summary',
    description: '매출 및 정산 내역 집계',
    currentPermission: 'auto',
    riskLevel: 'low',
    relatedAgentIds: ['finance', 'manager']
  },
  {
    id: 'perm-cs-reply-draft',
    taskName: 'cs_reply_draft',
    description: '고객 문의 답변 초안 작성',
    currentPermission: 'draft_only',
    riskLevel: 'medium',
    relatedAgentIds: ['cs']
  },
  {
    id: 'perm-review-reply-draft',
    taskName: 'review_reply_draft',
    description: '리뷰 답글 초안 기획',
    currentPermission: 'draft_only',
    riskLevel: 'medium',
    relatedAgentIds: ['review']
  },
  {
    id: 'perm-product-description-draft',
    taskName: 'product_description_draft',
    description: '상품 상세 SEO 키워드 추천',
    currentPermission: 'draft_only',
    riskLevel: 'medium',
    relatedAgentIds: ['product']
  },
  {
    id: 'perm-marketing-copy-draft',
    taskName: 'marketing_copy_draft',
    description: '소셜 광고 카피라이팅 기획',
    currentPermission: 'draft_only',
    riskLevel: 'medium',
    relatedAgentIds: ['marketing']
  },
  {
    id: 'perm-blog-post-draft',
    taskName: 'blog_post_draft',
    description: '홍보용 블로그 원고 작성',
    currentPermission: 'draft_only',
    riskLevel: 'medium',
    relatedAgentIds: ['marketing']
  },
  {
    id: 'perm-board-reply-post',
    taskName: 'board_reply_post',
    description: '문의 답변 게시판 최종 업로드',
    currentPermission: 'approval_required',
    riskLevel: 'high',
    relatedAgentIds: ['cs']
  },
  {
    id: 'perm-coupon-create',
    taskName: 'coupon_create',
    description: '캠페인 할인 쿠폰 마스터 생성',
    currentPermission: 'approval_required',
    riskLevel: 'high',
    relatedAgentIds: ['marketing']
  },
  {
    id: 'perm-product-update',
    taskName: 'product_update',
    description: '상품 규격 정보 및 가격 수정 적용',
    currentPermission: 'approval_required',
    riskLevel: 'high',
    relatedAgentIds: ['product']
  },
  {
    id: 'perm-campaign-publish',
    taskName: 'campaign_publish',
    description: '웹사이트 팝업 배너 프로모션 게시',
    currentPermission: 'approval_required',
    riskLevel: 'high',
    relatedAgentIds: ['marketing']
  },
  {
    id: 'perm-refund-execute',
    taskName: 'refund_execute',
    description: '취소 건 실계좌 현금 환불 승인',
    currentPermission: 'manual_only',
    riskLevel: 'critical',
    relatedAgentIds: ['finance', 'order']
  },
  {
    id: 'perm-price-change',
    taskName: 'price_change',
    description: '상품 기본 판매 단가 변경 승인',
    currentPermission: 'manual_only',
    riskLevel: 'critical',
    relatedAgentIds: ['product', 'manager']
  },
  {
    id: 'perm-bulk-sms-send',
    taskName: 'bulk_sms_send',
    description: '회원 전체 대상 마케팅 단체문자 발송',
    currentPermission: 'manual_only',
    riskLevel: 'critical',
    relatedAgentIds: ['marketing', 'manager']
  },
  {
    id: 'perm-customer-delete',
    taskName: 'customer_delete',
    description: '회원 탈퇴 및 개인정보 수동 파기 처리',
    currentPermission: 'manual_only',
    riskLevel: 'critical',
    relatedAgentIds: ['manager', 'cs']
  },
  {
    id: 'perm-settlement-modify',
    taskName: 'settlement_modify',
    description: 'PG 정산 차액 예외 수동 수선 처리',
    currentPermission: 'manual_only',
    riskLevel: 'critical',
    relatedAgentIds: ['finance']
  }
];
