import type { OperationsDataSnapshot } from '../types/dataConnector';

export const defaultOperationsData: OperationsDataSnapshot = {
  id: 'snapshot-demo-default',
  sourceType: 'demo',
  importedAt: new Date().toISOString(),
  orders: [
    {
      id: 'order-101',
      orderNo: 'GD-20260618-001',
      orderDate: '2026-06-18',
      customerNameMasked: '홍*동',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      quantity: 2,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: 'CJ1234567890',
      amount: 49800,
      riskFlags: []
    },
    {
      id: 'order-102',
      orderNo: 'GD-20260618-002',
      orderDate: '2026-06-18',
      customerNameMasked: '김*영',
      productName: '아로마 캔들 스페셜 에디션',
      optionName: '시트러스향',
      quantity: 1,
      paymentStatus: '입금대기',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 25000,
      riskFlags: ['payment_pending']
    },
    {
      id: 'order-103',
      orderNo: 'GD-20260617-048',
      orderDate: '2026-06-17',
      customerNameMasked: '이*우',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      optionName: '로즈마리향',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: '',
      amount: 19800,
      riskFlags: ['invoice_missing']
    },
    {
      id: 'order-104',
      orderNo: 'GD-20260613-012',
      orderDate: '2026-06-13',
      customerNameMasked: '박*호',
      productName: '시그니처 바디 핏 기프트 세트',
      optionName: '종합 세트',
      quantity: 5,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: 'HJ9876543210',
      amount: 525000,
      riskFlags: ['high_value_order', 'delivery_delayed']
    },
    {
      id: 'order-105',
      orderNo: 'GD-20260618-005',
      orderDate: '2026-06-18',
      customerNameMasked: '최*민',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 32000,
      riskFlags: []
    }
  ],
  inquiries: [
    {
      id: 'inq-201',
      inquiryDate: '2026-06-18',
      category: '배송',
      customerNameMasked: '홍*동',
      title: '주문한 마사지 오일 언제 도착하나요?',
      content: '어제 오후에 주문했는데 오늘 받을 수 있는지 궁금합니다. 운송장 등록이 안 되어 있네요.',
      status: '미답변',
      priority: 'medium',
      sentiment: 'neutral',
      riskFlags: ['unanswered']
    },
    {
      id: 'inq-202',
      inquiryDate: '2026-06-18',
      category: '교환/반품',
      customerNameMasked: '강*민',
      title: '바디 워시 용기가 파손되어 누액이 생겼어요. 환불해주세요!',
      content: '택배 박스를 뜯어보니 제품 뚜껑이 파손되어 오일이 전부 샜습니다. 환불 및 환수 처리 요청합니다. 연락처는 ***-****-**** 입니다.',
      status: '미답변',
      priority: 'high',
      sentiment: 'negative',
      riskFlags: ['unanswered', 'complaint', 'refund_request', 'urgent']
    },
    {
      id: 'inq-203',
      inquiryDate: '2026-06-17',
      category: '상품문의',
      customerNameMasked: '정*은',
      title: '보습 크림 성분 문의',
      content: '코코넛 크림에 인공 향료가 첨가되었나요? 임산부가 사용할 예정이라 성분이 예민해서 여쭤봅니다.',
      status: '답변완료',
      priority: 'low',
      sentiment: 'positive',
      riskFlags: []
    }
  ],
  reviews: [
    {
      id: 'rev-301',
      reviewDate: '2026-06-18',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      rating: 5,
      content: '향이 아주 은은하고 보습력이 뛰어납니다. 퇴근 후 매일 아로마 마사지하는데 피로가 싹 가시네요.',
      sentiment: 'positive',
      needsReply: false,
      riskFlags: []
    },
    {
      id: 'rev-302',
      reviewDate: '2026-06-17',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      rating: 2,
      content: '배송 박스가 심하게 찌그러져서 오고 내용물이 살짝 흘러서 기분이 나쁩니다. 스크럽 자체는 쓸만하지만 포장이 엉망이네요.',
      sentiment: 'negative',
      needsReply: true,
      riskFlags: ['low_rating', 'negative_review', 'needs_reply']
    },
    {
      id: 'rev-303',
      reviewDate: '2026-06-16',
      productName: '아로마 캔들 스페셜 에디션',
      rating: 4,
      content: '디자인도 예쁘고 방안에 켜두면 탈취 효과도 좋아 만족스럽습니다.',
      sentiment: 'positive',
      needsReply: false,
      riskFlags: []
    }
  ],
  inventory: [
    {
      id: 'inv-401',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      stock: 2,
      safetyStock: 5,
      status: 'warning',
      riskFlags: ['low_stock', 'below_safety_stock']
    },
    {
      id: 'inv-402',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '유칼립투스향',
      stock: 0,
      safetyStock: 5,
      status: 'danger',
      riskFlags: ['out_of_stock']
    },
    {
      id: 'inv-403',
      productName: '아로마 캔들 스페셜 에디션',
      optionName: '시트러스향',
      stock: 15,
      safetyStock: 5,
      status: 'ok',
      riskFlags: []
    },
    {
      id: 'inv-404',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      optionName: '로즈마리향',
      stock: 3,
      safetyStock: 10,
      status: 'warning',
      riskFlags: ['low_stock', 'below_safety_stock']
    },
    {
      id: 'inv-405',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      stock: 24,
      safetyStock: 8,
      status: 'ok',
      riskFlags: []
    }
  ],
  sales: [
    {
      date: '2026-06-18',
      totalSales: 894000,
      orderCount: 22,
      conversionRate: 3.4,
      topProducts: ['마사지 오일', '코코넛 크림'],
      memo: '목요일 평일 프로모션 적용 및 매출 활성화'
    },
    {
      date: '2026-06-17',
      totalSales: 780000,
      orderCount: 18,
      conversionRate: 2.8,
      topProducts: ['마사지 오일', '아로마 캔들'],
      memo: '주간 평균 ROAS 280% 유지 중'
    },
    {
      date: '2026-06-16',
      totalSales: 610000,
      orderCount: 15,
      conversionRate: 2.4,
      topProducts: ['바디 스크럽', '마사지 오일'],
      memo: '비오는 날 매출 소폭 하락 경향'
    }
  ],
  qualityReport: {
    totalRows: 16,
    validRows: 16,
    warningRows: 0,
    errorRows: 0,
    missingRequiredFields: [],
    duplicateRows: 0,
    privacyMaskedCount: 10,
    riskFlagCount: 9,
    qualityScore: 100,
    notes: [
      '모든 표준 데이터 필드가 정상적으로 매핑되었습니다.',
      '10건의 이름/연락처 개인 식별정보(PII)가 자동으로 안전 마스킹 필터링되었습니다.'
    ]
  }
};
