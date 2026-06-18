// Secure Proxy에 공급할 가상의 원본 API 적재 데이터 (개인정보 원본 포함)

const mockOrders = [
  {
    orderNo: '202606180001',
    orderDate: '2026-06-18 09:12:00',
    customerName: '김철수',
    customerPhone: '010-1234-5678',
    customerEmail: 'chulsoo@gmail.com',
    address: '서울시 강남구 테헤란로 123',
    productName: '네츄럴 수분 크림 50ml',
    optionName: '단품',
    quantity: '1',
    paymentStatus: '결제완료',
    deliveryStatus: '배송중',
    invoiceNo: '1234567890',
    amount: '29800'
  },
  {
    orderNo: '202606180002',
    orderDate: '2026-06-18 10:15:30',
    customerName: '이영희',
    customerPhone: '010-8765-4321',
    customerEmail: 'younghee@naver.com',
    address: '경기도 성남시 분당구 판교역로 45-6',
    productName: '스킨 릴리프 토너 150ml',
    optionName: '단품',
    quantity: '2',
    paymentStatus: '결제완료',
    deliveryStatus: '배송대기',
    invoiceNo: '',
    amount: '36000'
  },
  {
    orderNo: '202606180003',
    orderDate: '2026-06-18 11:20:45',
    customerName: '박민준',
    customerPhone: '010-3333-2222',
    customerEmail: 'minjun@kakao.com',
    address: '인천시 부평구 부평대로 88',
    productName: '인텐시브 세럼 30ml',
    optionName: '1+1 세트',
    quantity: '1',
    paymentStatus: '미입금',
    deliveryStatus: '배송대기',
    invoiceNo: '',
    amount: '59000'
  },
  {
    orderNo: '202606180004',
    orderDate: '2026-06-18 14:05:12',
    customerName: '최지우',
    customerPhone: '010-9999-7777',
    customerEmail: 'jiwoo@daum.net',
    address: '부산시 해운대구 마린시티로 1',
    productName: '리페어 크림 100ml',
    optionName: '단품',
    quantity: '10',
    paymentStatus: '결제완료',
    deliveryStatus: '배송준비',
    invoiceNo: '',
    amount: '550000'
  },
  {
    orderNo: '202606150001',
    orderDate: '2026-06-15 08:30:00',
    customerName: '정다은',
    customerPhone: '010-4444-5555',
    customerEmail: 'daeun@google.com',
    address: '대구시 수성구 달구벌대로 99',
    productName: '클렌징 폼 120ml',
    optionName: '단품',
    quantity: '1',
    paymentStatus: '결제완료',
    deliveryStatus: '배송중',
    invoiceNo: '9876543210',
    amount: '15000'
  }
];

const mockInquiries = [
  {
    inquiryDate: '2026-06-18 10:45:00',
    category: '배송',
    customerName: '한예슬',
    title: '배송이 언제 시작되나요?',
    content: '어제 주문했는데 아직 소식이 없네요. 제 폰번호는 010-1234-5678 입니다. 빠른 답변 바랍니다.',
    status: '답변대기',
    priority: 'medium'
  },
  {
    inquiryDate: '2026-06-18 11:30:00',
    category: '교환/반품',
    customerName: '강동원',
    title: '상품 파손으로 교환 신청합니다',
    content: '택배 박스가 다 찢어져 있고 내용물이 완전히 터졌어요. master@godo.com 으로 메일 보냈습니다. 긴급 조치 요망.',
    status: '답변대기',
    priority: 'high'
  },
  {
    inquiryDate: '2026-06-18 13:50:00',
    category: '상품',
    customerName: '송혜교',
    title: '크림 유통기한 문의드립니다.',
    content: '개봉 전 제조기한과 유통기한이 얼마나 되는지 알고 싶습니다. (hye@example.com)',
    status: '답변완료',
    priority: 'low'
  }
];

const mockReviews = [
  {
    reviewDate: '2026-06-18 13:10:00',
    productName: '네츄럴 수분 크림 50ml',
    rating: '1',
    content: '배송이 3일이나 밀려서 왔고 화장품 바르자마자 얼굴 붉어짐. 환불해 주시고 010-9999-8888 연락 주세요.'
  },
  {
    reviewDate: '2026-06-18 14:22:00',
    productName: '스킨 릴리프 토너 150ml',
    rating: '5',
    content: '끈적임이 전혀 없고 가볍고 엄청 순하네요. 매일 닦토로 잘 사용하고 있습니다!'
  },
  {
    reviewDate: '2026-06-17 16:40:00',
    productName: '인텐시브 세럼 30ml',
    rating: '4',
    content: '진짜 건조한 피부인데 이거 바르고 촉촉해졌어요. 가성비 좋은 세럼 추천.'
  }
];

const mockInventory = [
  {
    productName: '네츄럴 수분 크림 50ml',
    optionName: '단품',
    stock: '3',
    safetyStock: '10'
  },
  {
    productName: '스킨 릴리프 토너 150ml',
    optionName: '단품',
    stock: '0',
    safetyStock: '5'
  },
  {
    productName: '인텐시브 세럼 30ml',
    optionName: '1+1 세트',
    stock: '25',
    safetyStock: '8'
  },
  {
    productName: '리페어 크림 100ml',
    optionName: '단품',
    stock: '50',
    safetyStock: '15'
  }
];

const mockSales = [
  {
    date: '2026-06-18',
    totalSales: '674800',
    orderCount: '4',
    conversionRate: '3.5',
    topProducts: '리페어 크림 100ml, 인텐시브 세럼 30ml'
  },
  {
    date: '2026-06-17',
    totalSales: '350000',
    orderCount: '2',
    conversionRate: '2.1',
    topProducts: '스킨 릴리프 토너 150ml'
  },
  {
    date: '2026-06-16',
    totalSales: '420000',
    orderCount: '3',
    conversionRate: '2.8',
    topProducts: '네츄럴 수분 크림 50ml'
  }
];

export const getProxyMockOrders = () => JSON.parse(JSON.stringify(mockOrders));
export const getProxyMockInquiries = () => JSON.parse(JSON.stringify(mockInquiries));
export const getProxyMockReviews = () => JSON.parse(JSON.stringify(mockReviews));
export const getProxyMockInventory = () => JSON.parse(JSON.stringify(mockInventory));
export const getProxyMockSales = () => JSON.parse(JSON.stringify(mockSales));

export const getProxyMockAll = () => ({
  orders: getProxyMockOrders(),
  inquiries: getProxyMockInquiries(),
  reviews: getProxyMockReviews(),
  inventory: getProxyMockInventory(),
  sales: getProxyMockSales()
});
