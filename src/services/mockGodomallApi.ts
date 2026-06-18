import type { ApiResourceType } from '../types/apiBridge';

// 헬퍼: 비동기 지연 시뮬레이션
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock 주문 원본 데이터 (PII 포함하여 정규화 단계에서 마스킹 테스트 가능하도록 구성)
const mockOrders: Record<string, string>[] = [
  {
    orderNo: '202606180001',
    orderDate: '2026-06-18 09:12:00',
    customerName: '김철수',
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
    productName: '스킨 릴리프 토너 150ml',
    optionName: '단품',
    quantity: '2',
    paymentStatus: '결제완료',
    deliveryStatus: '배송대기',
    invoiceNo: '', // 송장 누락 상태
    amount: '36000'
  },
  {
    orderNo: '202606180003',
    orderDate: '2026-06-18 11:20:45',
    customerName: '박민준',
    productName: '인텐시브 세럼 30ml',
    optionName: '1+1 세트',
    quantity: '1',
    paymentStatus: '미입금', // 입금 대기 상태
    deliveryStatus: '배송대기',
    invoiceNo: '',
    amount: '59000'
  },
  {
    orderNo: '202606180004',
    orderDate: '2026-06-18 14:05:12',
    customerName: '최지우',
    productName: '리페어 크림 100ml',
    optionName: '단품',
    quantity: '10',
    paymentStatus: '결제완료',
    deliveryStatus: '배송준비',
    invoiceNo: '',
    amount: '550000' // 고액 주문 상태 (50만원 이상)
  },
  {
    orderNo: '202606150001',
    orderDate: '2026-06-15 08:30:00',
    customerName: '정다은',
    productName: '클렌징 폼 120ml',
    optionName: '단품',
    quantity: '1',
    paymentStatus: '결제완료',
    deliveryStatus: '배송중', // 배송 지연 상태 유도 (3일 초과)
    invoiceNo: '9876543210',
    amount: '15000'
  }
];

// Mock CS 문의 원본 데이터 (이메일 및 번호가 포함되어 마스킹 검증 가능)
const mockInquiries: Record<string, string>[] = [
  {
    inquiryDate: '2026-06-18 10:45:00',
    category: '배송',
    customerName: '한예슬',
    title: '배송이 언제 시작되나요?',
    content: '어제 주문했는데 아직 소식이 없네요. 010-1234-5678 로 빠른 답변 바랍니다.',
    status: '답변대기',
    priority: 'medium'
  },
  {
    inquiryDate: '2026-06-18 11:30:00',
    category: '교환/반품',
    customerName: '강동원',
    title: '상품 파손으로 교환 신청합니다',
    content: '택배 박스가 젖은 상태로 와서 크림이 터져 있습니다. refund@shop.com 으로 사진 보냈습니다. 긴급처리 부탁합니다.',
    status: '답변대기',
    priority: 'high' // 긴급 CS 문의
  },
  {
    inquiryDate: '2026-06-18 13:50:00',
    category: '상품',
    customerName: '송혜교',
    title: '크림 유통기한 문의드립니다.',
    content: '개봉 전 제조기한과 유통기한이 얼마나 되는지 자세히 가르쳐 주세요.',
    status: '답변완료',
    priority: 'low'
  }
];

// Mock 리뷰 원본 데이터
const mockReviews: Record<string, string>[] = [
  {
    reviewDate: '2026-06-18 13:10:00',
    productName: '네츄럴 수분 크림 50ml',
    rating: '1', // 부정 리뷰
    content: '배송이 3일이나 걸렸고, 화장품 바르자마자 피부가 뒤집어졌어요. 제 번호는 010-9999-8888 입니다. 환불 조치 바랍니다.'
  },
  {
    reviewDate: '2026-06-18 14:22:00',
    productName: '스킨 릴리프 토너 150ml',
    rating: '5',
    content: '끈적이지 않고 순해서 예민한 피부에 딱 맞아요. 추천합니다!'
  },
  {
    reviewDate: '2026-06-17 16:40:00',
    productName: '인텐시브 세럼 30ml',
    rating: '4',
    content: '촉촉하고 흡수력이 좋아서 저녁마다 바르기 좋습니다.'
  }
];

// Mock 재고 원본 데이터
const mockInventory: Record<string, string>[] = [
  {
    productName: '네츄럴 수분 크림 50ml',
    optionName: '단품',
    stock: '3',
    safetyStock: '10' // 안전 재고 미만
  },
  {
    productName: '스킨 릴리프 토너 150ml',
    optionName: '단품',
    stock: '0',
    safetyStock: '5' // 품절 상태
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

// Mock 일일 매출 원본 데이터
const mockSales: Record<string, string>[] = [
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

// Mock 상품 원본 데이터 (Products는 이번 MVP에서 Preview only로 동작하도록 구성)
const mockProducts: Record<string, string>[] = [
  {
    productName: '네츄럴 수분 크림 50ml',
    price: '29800',
    status: '판매중',
    category: '화장품/기초'
  },
  {
    productName: '스킨 릴리프 토너 150ml',
    price: '18000',
    status: '판매중',
    category: '화장품/기초'
  },
  {
    productName: '인텐시브 세럼 30ml',
    price: '59000',
    status: '판매중',
    category: '화장품/기초'
  },
  {
    productName: '리페어 크림 100ml',
    price: '55000',
    status: '판매중',
    category: '화장품/기초'
  }
];

// 비동기 가져오기 API 모음
export const fetchMockOrders = async (): Promise<Record<string, string>[]> => {
  await delay(300);
  return [...mockOrders];
};

export const fetchMockInquiries = async (): Promise<Record<string, string>[]> => {
  await delay(300);
  return [...mockInquiries];
};

export const fetchMockReviews = async (): Promise<Record<string, string>[]> => {
  await delay(300);
  return [...mockReviews];
};

export const fetchMockInventory = async (): Promise<Record<string, string>[]> => {
  await delay(300);
  return [...mockInventory];
};

export const fetchMockSales = async (): Promise<Record<string, string>[]> => {
  await delay(300);
  return [...mockSales];
};

export const fetchMockProducts = async (): Promise<Record<string, string>[]> => {
  await delay(200);
  return [...mockProducts];
};

// 동기화 시뮬레이션 결과 구조
export interface MockSyncResult {
  rawItems: Record<string, string>[];
  importedCount: number;
  maskedPiiCount: number;
  warningCount: number;
}

// 리소스 타입에 맞춰 비동기 동기화 작업을 수행하고, 가공 통계를 추출하는 래퍼 함수
export const runMockSync = async (resourceType: ApiResourceType): Promise<MockSyncResult> => {
  let rawItems: Record<string, string>[];
  
  switch (resourceType) {
    case 'orders':
      rawItems = await fetchMockOrders();
      break;
    case 'inquiries':
      rawItems = await fetchMockInquiries();
      break;
    case 'reviews':
      rawItems = await fetchMockReviews();
      break;
    case 'inventory':
      rawItems = await fetchMockInventory();
      break;
    case 'sales':
      rawItems = await fetchMockSales();
      break;
    case 'products':
      rawItems = await fetchMockProducts();
      break;
    default:
      rawItems = [];
  }

  // 간단한 통계 가계산 (정상적인 퀄리티 체크와 유사하게 동작하도록)
  const importedCount = rawItems.length;
  let maskedPiiCount = 0;
  let warningCount = 0;

  if (resourceType === 'orders') {
    maskedPiiCount = 5; // 김철수, 이영희, 박민준, 최지우, 정다은
    warningCount = 4; // 송장 누락 2건, 미입금 1건, 고액 주문 1건, 배송 지연 1건
  } else if (resourceType === 'inquiries') {
    maskedPiiCount = 5; // 한예슬, 강동원, 송혜교 이름 마스킹 + 연락처/이메일 마스킹 2건
    warningCount = 3; // 답변 대기 2건, 긴급 1건
  } else if (resourceType === 'reviews') {
    maskedPiiCount = 1; // 010-9999-8888 마스킹 1건
    warningCount = 2; // 평점 2점 이하 1건, 답변 필요 1건
  } else if (resourceType === 'inventory') {
    maskedPiiCount = 0;
    warningCount = 2; // 안전재고 미달 1건, 품절 1건
  } else if (resourceType === 'sales') {
    maskedPiiCount = 0;
    warningCount = 0;
  }

  return {
    rawItems,
    importedCount,
    maskedPiiCount,
    warningCount
  };
};
