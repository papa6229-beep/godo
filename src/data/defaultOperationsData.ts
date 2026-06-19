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

export const scenarioDefaultData: OperationsDataSnapshot = {
  ...defaultOperationsData,
  id: 'snapshot-scenario-default',
  sourceType: 'demo'
};

export const scenarioCsFocusData: OperationsDataSnapshot = {
  id: 'snapshot-scenario-cs',
  sourceType: 'demo',
  importedAt: new Date().toISOString(),
  orders: [
    {
      id: 'order-cs-1',
      orderNo: 'GD-20260619-010',
      orderDate: '2026-06-19',
      customerNameMasked: '임*섭',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 32000,
      riskFlags: []
    },
    {
      id: 'order-cs-2',
      orderNo: 'GD-20260619-011',
      orderDate: '2026-06-19',
      customerNameMasked: '정*현',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      quantity: 2,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: 'CJ8765432109',
      amount: 49800,
      riskFlags: []
    }
  ],
  inquiries: [
    {
      id: 'inq-cs-1',
      inquiryDate: '2026-06-19',
      category: '배송',
      customerNameMasked: '송*주',
      title: '배송 지연 문의합니다.',
      content: '15일에 주문했는데 아직 배송 출발도 안 했어요. 어떻게 된 건가요? 빠르게 확인 부탁드려요.',
      status: '미답변',
      priority: 'medium',
      sentiment: 'negative',
      riskFlags: ['unanswered', 'delivery_delayed']
    },
    {
      id: 'inq-cs-2',
      inquiryDate: '2026-06-19',
      category: '교환/반품',
      customerNameMasked: '김*민',
      title: '유리 용기가 깨져서 배송되었어요. 교환 요청합니다.',
      content: '방금 택배를 받았는데, 박스를 뜯어보니 아로마 캔들 스페셜 에디션 용기 유리가 깨져서 조각이 사방에 흩어져 있네요. 너무 위험합니다. 새 상품으로 교환해 주세요. 연락바랍니다.',
      status: '미답변',
      priority: 'high',
      sentiment: 'negative',
      riskFlags: ['unanswered', 'complaint', 'urgent']
    },
    {
      id: 'inq-cs-3',
      inquiryDate: '2026-06-19',
      category: '교환/반품',
      customerNameMasked: '박*서',
      title: '오일 누액건으로 환불 신청 및 처리 방법 문의',
      content: '배송받았는데 마사지 오일 캡이 헐거워서 절반 이상 누액이 발생해 젖어 있습니다. 전체 환불 신청합니다. 계좌번호로 바로 입금해주시거나 승인 취소해 주세요.',
      status: '미답변',
      priority: 'high',
      sentiment: 'negative',
      riskFlags: ['unanswered', 'complaint', 'refund_request']
    },
    {
      id: 'inq-cs-4',
      inquiryDate: '2026-06-19',
      category: '상품문의',
      customerNameMasked: '최*환',
      title: '바디 스크럽 임산부가 써도 부작용 없나요?',
      content: '아내가 임신 중인데 천연 솔트라 자극이 덜할 것 같아 주문 고려 중입니다. 혹시 민감성 피부나 임산부가 쓰면 안 되는 성분이 함유되어 있는지 확인해 주세요.',
      status: '미답변',
      priority: 'low',
      sentiment: 'neutral',
      riskFlags: ['unanswered']
    },
    {
      id: 'inq-cs-5',
      inquiryDate: '2026-06-19',
      category: '배송',
      customerNameMasked: '강*훈',
      title: '주소 변경 건으로 급하게 연락 부탁드립니다.',
      content: '방금 결제 완료했는데 배송 주소를 구 주소로 잘못 입력했습니다. 신주소 [서울시 마포구 독막로 123, 401호]로 배송지를 변경하고 싶습니다. 제 연락처는 010-9876-5432입니다. 발송 전에 꼭 변경해주세요!',
      status: '미답변',
      priority: 'high',
      sentiment: 'neutral',
      riskFlags: ['unanswered', 'urgent']
    }
  ],
  reviews: [
    {
      id: 'rev-cs-1',
      reviewDate: '2026-06-19',
      productName: '천연 코코넛 보습 크림 (200ml)',
      rating: 5,
      content: '발림성도 좋고 자극적이지 않아서 민감성 피부에 최고입니다.',
      sentiment: 'positive',
      needsReply: false,
      riskFlags: []
    }
  ],
  inventory: [
    {
      id: 'inv-cs-1',
      productName: '아로마 캔들 스페셜 에디션',
      optionName: '시트러스향',
      stock: 12,
      safetyStock: 5,
      status: 'ok',
      riskFlags: []
    }
  ],
  sales: [
    {
      date: '2026-06-19',
      totalSales: 81800,
      orderCount: 3,
      conversionRate: 1.2,
      topProducts: ['마사지 오일'],
      memo: 'CS 집중 상담 응대일'
    }
  ],
  qualityReport: {
    totalRows: 10,
    validRows: 10,
    warningRows: 0,
    errorRows: 0,
    missingRequiredFields: [],
    duplicateRows: 0,
    privacyMaskedCount: 7,
    riskFlagCount: 8,
    qualityScore: 100,
    notes: [
      'CS 대응력 평가용 긴급 문의 및 환불 요청 집중 데이터셋입니다.',
      '전화번호/주소 등 민감한 개인정보 7건이 마스킹되었습니다.'
    ]
  }
};

export const scenarioReviewFocusData: OperationsDataSnapshot = {
  id: 'snapshot-scenario-reviews',
  sourceType: 'demo',
  importedAt: new Date().toISOString(),
  orders: [
    {
      id: 'order-rev-1',
      orderNo: 'GD-20260619-020',
      orderDate: '2026-06-19',
      customerNameMasked: '정*서',
      productName: '아로마 캔들 스페셜 에디션',
      optionName: '시트러스향',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송완료',
      invoiceNo: 'CJ1234511223',
      amount: 25000,
      riskFlags: []
    },
    {
      id: 'order-rev-2',
      orderNo: 'GD-20260619-021',
      orderDate: '2026-06-19',
      customerNameMasked: '한*현',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송완료',
      invoiceNo: 'CJ1234511224',
      amount: 24900,
      riskFlags: []
    }
  ],
  inquiries: [
    {
      id: 'inq-rev-1',
      inquiryDate: '2026-06-19',
      category: '상품문의',
      customerNameMasked: '김*현',
      title: '캔들 연소 시간 문의',
      content: '아로마 캔들 스페셜 에디션 하나 사면 하루에 2시간씩 켰을 때 며칠 정도 쓸 수 있나요?',
      status: '미답변',
      priority: 'low',
      sentiment: 'neutral',
      riskFlags: ['unanswered']
    }
  ],
  reviews: [
    {
      id: 'rev-rf-1',
      reviewDate: '2026-06-19',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      rating: 1,
      content: '아로마 향이 강해서 머리가 아프고, 피부에 발랐을 때 붉은 반점이 생겼습니다. 포장이 찌그러져 도착한 것까지는 참았는데 가려움증 심하게 유발해서 못 쓰겠네요. 환불 바랍니다.',
      sentiment: 'negative',
      needsReply: true,
      riskFlags: ['low_rating', 'negative_review', 'needs_reply', 'trouble_complaint']
    },
    {
      id: 'rev-rf-2',
      reviewDate: '2026-06-19',
      productName: '아로마 캔들 스페셜 에디션',
      rating: 2,
      content: '캔들 박스가 깨져서 왁스가 찌그러져서 왔어요. 다치진 않았는데 완충 포장을 너무 성의 없게 신문지로만 대충 뭉쳐서 보내다니 황당합니다. 포장 상태 개선이 심각하게 필요해 보여요.',
      sentiment: 'negative',
      needsReply: true,
      riskFlags: ['low_rating', 'negative_review', 'needs_reply', 'package_complaint']
    },
    {
      id: 'rev-rf-3',
      reviewDate: '2026-06-19',
      productName: '천연 코코넛 보습 크림 (200ml)',
      rating: 5,
      content: '천연이라 냄새도 코코넛 본연의 달콤한 향이 나고 겨울에도 당김 없이 너무 든든합니다. 용량 대비 가성비도 아주 훌륭해서 부모님 선물용으로 재구매합니다!',
      sentiment: 'positive',
      needsReply: false,
      riskFlags: []
    },
    {
      id: 'rev-rf-4',
      reviewDate: '2026-06-19',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      rating: 3,
      content: '제품 세정력이나 피부결 보완은 훌륭한데 뚜껑이 좀 빡빡하게 잠겨 있어서 샤워할 때 젖은 손으로 열기 많이 힘드네요. 이것만 고쳐지면 좋겠습니다.',
      sentiment: 'neutral',
      needsReply: true,
      riskFlags: ['needs_reply']
    }
  ],
  inventory: [
    {
      id: 'inv-rf-1',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      stock: 10,
      safetyStock: 5,
      status: 'ok',
      riskFlags: []
    }
  ],
  sales: [
    {
      date: '2026-06-19',
      totalSales: 49900,
      orderCount: 2,
      conversionRate: 0.8,
      topProducts: ['마사지 오일'],
      memo: '악성 및 미흡 불만 리뷰 대량 발생 및 모니터링 데이'
    }
  ],
  qualityReport: {
    totalRows: 12,
    validRows: 12,
    warningRows: 0,
    errorRows: 0,
    missingRequiredFields: [],
    duplicateRows: 0,
    privacyMaskedCount: 3,
    riskFlagCount: 5,
    qualityScore: 100,
    notes: [
      '피부 문제 및 포장 파손 등 민감 리뷰 응대 집중 셋입니다.',
      '부정/별점 2점 이하 리뷰 2건에 대한 즉각 대처가 요망됩니다.'
    ]
  }
};

export const scenarioOrderIssueData: OperationsDataSnapshot = {
  id: 'snapshot-scenario-orders',
  sourceType: 'demo',
  importedAt: new Date().toISOString(),
  orders: [
    {
      id: 'order-oi-1',
      orderNo: 'GD-20260619-030',
      orderDate: '2026-06-19',
      customerNameMasked: '한*지',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      optionName: '로즈마리향',
      quantity: 1,
      paymentStatus: '입금대기',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 19800,
      riskFlags: ['payment_pending']
    },
    {
      id: 'order-oi-2',
      orderNo: 'GD-20260619-031',
      orderDate: '2026-06-19',
      customerNameMasked: '유*민',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: '',
      amount: 32000,
      riskFlags: ['invoice_missing']
    },
    {
      id: 'order-oi-3',
      orderNo: 'GD-20260610-008',
      orderDate: '2026-06-10',
      customerNameMasked: '최*철',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '유칼립투스향',
      quantity: 2,
      paymentStatus: '결제완료',
      deliveryStatus: '배송중',
      invoiceNo: 'HJ8877665544',
      amount: 49800,
      riskFlags: ['delivery_delayed']
    },
    {
      id: 'order-oi-4',
      orderNo: 'GD-20260619-033',
      orderDate: '2026-06-19',
      customerNameMasked: '김*태',
      productName: '시그니처 바디 핏 기프트 세트',
      optionName: '종합 세트',
      quantity: 10,
      paymentStatus: '결제완료',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 1050000,
      riskFlags: ['high_value_order']
    }
  ],
  inquiries: [
    {
      id: 'inq-oi-1',
      inquiryDate: '2026-06-19',
      category: '배송',
      customerNameMasked: '홍*석',
      title: '송장번호를 알려주세요.',
      content: '어제 주문했고 발송 완료 떴는데 왜 송장번호가 비어 있나요? 배송 조회가 안 됩니다.',
      status: '미답변',
      priority: 'medium',
      sentiment: 'neutral',
      riskFlags: ['unanswered']
    }
  ],
  reviews: [
    {
      id: 'rev-oi-1',
      reviewDate: '2026-06-19',
      productName: '천연 코코넛 보습 크림 (200ml)',
      rating: 4,
      content: '배송은 좀 느린 편인데 물건 질은 무난하고 쓸만해요.',
      sentiment: 'neutral',
      needsReply: false,
      riskFlags: []
    }
  ],
  inventory: [
    {
      id: 'inv-oi-1',
      productName: '시그니처 바디 핏 기프트 세트',
      optionName: '종합 세트',
      stock: 8,
      safetyStock: 3,
      status: 'ok',
      riskFlags: []
    }
  ],
  sales: [
    {
      date: '2026-06-19',
      totalSales: 1151600,
      orderCount: 4,
      conversionRate: 4.1,
      topProducts: ['바디 핏 기프트 세트'],
      memo: '고액 기업 답례품 대량 주문 수령'
    }
  ],
  qualityReport: {
    totalRows: 11,
    validRows: 11,
    warningRows: 0,
    errorRows: 0,
    missingRequiredFields: [],
    duplicateRows: 0,
    privacyMaskedCount: 6,
    riskFlagCount: 5,
    qualityScore: 100,
    notes: [
      '주문 지연 및 누락 송장, 입금 대기, 100만원 이상 고액 결제 등 복합 문제 주문 집중 셋입니다.',
      '발송 전 오배송 또는 송장 누락 예방 확인이 필수적입니다.'
    ]
  }
};

export const scenarioStockSalesData: OperationsDataSnapshot = {
  id: 'snapshot-scenario-stock',
  sourceType: 'demo',
  importedAt: new Date().toISOString(),
  orders: [
    {
      id: 'order-ss-1',
      orderNo: 'GD-20260619-040',
      orderDate: '2026-06-19',
      customerNameMasked: '정*수',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      quantity: 1,
      paymentStatus: '결제완료',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 24900,
      riskFlags: []
    },
    {
      id: 'order-ss-2',
      orderNo: 'GD-20260619-041',
      orderDate: '2026-06-19',
      customerNameMasked: '김*아',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      quantity: 5,
      paymentStatus: '결제완료',
      deliveryStatus: '배송대기',
      invoiceNo: '',
      amount: 160000,
      riskFlags: []
    }
  ],
  inquiries: [
    {
      id: 'inq-ss-1',
      inquiryDate: '2026-06-19',
      category: '상품문의',
      customerNameMasked: '백*경',
      title: '재고 언제 입고되나요?',
      content: '마사지 오일 유칼립투스향 사려는데 품절로 뜨네요. 다음 입고 예정일이 혹시 어떻게 되나요?',
      status: '미답변',
      priority: 'medium',
      sentiment: 'neutral',
      riskFlags: ['unanswered']
    }
  ],
  reviews: [
    {
      id: 'rev-ss-1',
      reviewDate: '2026-06-19',
      productName: '천연 코코넛 보습 크림 (200ml)',
      rating: 1,
      content: '코코넛 크림 매출 베스트라고 해서 큰 기대하고 샀는데 바르고 자니까 다음 날 볼 전체가 빨갛게 다 뒤집어졌습니다. 피부가 얇은 편이 아닌데 화끈거리고 따가워요. 대기업 브랜드보다 성분 배합이 안 맞는 듯합니다.',
      sentiment: 'negative',
      needsReply: true,
      riskFlags: ['low_rating', 'negative_review', 'needs_reply']
    },
    {
      id: 'rev-ss-2',
      reviewDate: '2026-06-19',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      rating: 5,
      content: '마사지 오일은 진짜 향도 촉촉함도 제 인생 템입니다. 벌써 네 병째 비우는 것 같네요.',
      sentiment: 'positive',
      needsReply: false,
      riskFlags: []
    }
  ],
  inventory: [
    {
      id: 'inv-ss-1',
      productName: '센서티브 힐링 마사지 오일 (100ml)',
      optionName: '라벤더향',
      stock: 1,
      safetyStock: 5,
      status: 'warning',
      riskFlags: ['low_stock', 'below_safety_stock']
    },
    {
      id: 'inv-ss-2',
      productName: '천연 코코넛 보습 크림 (200ml)',
      optionName: '기본옵션',
      stock: 3,
      safetyStock: 8,
      status: 'warning',
      riskFlags: ['low_stock', 'below_safety_stock', 'sudden_sales_increase']
    },
    {
      id: 'inv-ss-3',
      productName: '바디 스크럽 솔트 솔루션 (250g)',
      optionName: '로즈마리향',
      stock: 0,
      safetyStock: 10,
      status: 'danger',
      riskFlags: ['out_of_stock']
    },
    {
      id: 'inv-ss-4',
      productName: '아로마 캔들 스페셜 에디션',
      optionName: '시트러스향',
      stock: 50,
      safetyStock: 5,
      status: 'ok',
      riskFlags: []
    }
  ],
  sales: [
    {
      date: '2026-06-19',
      totalSales: 2450000,
      orderCount: 45,
      conversionRate: 5.2,
      topProducts: ['코코넛 크림', '마사지 오일'],
      memo: '일일 최고 매출 경신 (크림 급격한 발주 폭증)'
    },
    {
      date: '2026-06-18',
      totalSales: 894000,
      orderCount: 22,
      conversionRate: 3.4,
      topProducts: ['마사지 오일'],
      memo: '평균치 수준의 평이한 흐름'
    }
  ],
  qualityReport: {
    totalRows: 13,
    validRows: 13,
    warningRows: 0,
    errorRows: 0,
    missingRequiredFields: [],
    duplicateRows: 0,
    privacyMaskedCount: 5,
    riskFlagCount: 6,
    qualityScore: 100,
    notes: [
      '안전 재고 수준 하회(품절 임박) 및 최고 매출 돌파 상황을 가정한 데이터셋입니다.',
      '전체 매출은 245만원으로 높으나, 크림의 피부 트러블 1점 민감 리뷰로 브랜드 이미지 손상 경고가 포함되어 있습니다.'
    ]
  }
};

