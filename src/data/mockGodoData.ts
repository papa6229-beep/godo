export interface MockOrder {
  id: string;
  status: 'confirm_pending' | 'invoice_pending' | 'shipping' | 'completed' | 'high_value';
  amount: number;
}

export interface MockInquiry {
  id: string;
  category: 'delivery' | 'exchange' | 'product';
  status: 'unanswered' | 'answered';
}

export interface MockReview {
  id: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  content: string;
}

export interface MockInventoryItem {
  id: string;
  productName: string;
  stock: number;
  safetyStock: number;
  status: 'danger' | 'warning' | 'normal';
}

export interface MockSales {
  todayRevenue: number;
  growthRate: string;
  popularCategory: string;
  conversionRate: number;
}

export interface MockGodoData {
  orders: MockOrder[];
  inquiries: MockInquiry[];
  reviews: MockReview[];
  inventory: MockInventoryItem[];
  sales: MockSales;
}

export const mockGodoData: MockGodoData = {
  orders: [
    { id: 'ORD-2026-001', status: 'shipping', amount: 45000 },
    { id: 'ORD-2026-002', status: 'shipping', amount: 32000 },
    { id: 'ORD-2026-003', status: 'invoice_pending', amount: 89000 },
    { id: 'ORD-2026-004', status: 'invoice_pending', amount: 12000 },
    { id: 'ORD-2026-005', status: 'confirm_pending', amount: 55000 },
    { id: 'ORD-2026-006', status: 'confirm_pending', amount: 28000 },
    { id: 'ORD-2026-007', status: 'invoice_pending', amount: 43000 },
    { id: 'ORD-2026-008', status: 'shipping', amount: 64000 },
    { id: 'ORD-2026-009', status: 'shipping', amount: 37000 },
    { id: 'ORD-2026-010', status: 'shipping', amount: 15000 },
    { id: 'ORD-2026-011', status: 'shipping', amount: 92000 },
    { id: 'ORD-2026-012', status: 'high_value', amount: 1250000 } // 고액 주문 1건
  ],
  inquiries: [
    { id: 'INQ-101', category: 'delivery', status: 'unanswered' },
    { id: 'INQ-102', category: 'delivery', status: 'unanswered' },
    { id: 'INQ-103', category: 'delivery', status: 'unanswered' },
    { id: 'INQ-104', category: 'delivery', status: 'unanswered' },
    { id: 'INQ-105', category: 'exchange', status: 'unanswered' },
    { id: 'INQ-106', category: 'exchange', status: 'unanswered' },
    { id: 'INQ-107', category: 'product', status: 'unanswered' }
  ],
  reviews: [
    { id: 'REV-001', sentiment: 'positive', content: '배송이 아주 빠르고 포장 상태가 매우 좋습니다. 만족합니다!' },
    { id: 'REV-002', sentiment: 'positive', content: '향이 정말 고급스럽고 자극이 전혀 없어요. 재구매하겠습니다.' },
    { id: 'REV-003', sentiment: 'positive', content: '기대한 만큼 퀄리티가 훌륭하네요. 끈적이지 않고 스며듭니다.' },
    { id: 'REV-004', sentiment: 'neutral', content: '크기는 적당한데 발림성은 평범한 수준입니다.' },
    { id: 'REV-005', sentiment: 'negative', content: '마개가 헐거워서 용액이 일부 누수되어 왔습니다. 교환요청합니다.' }
  ],
  inventory: [
    // 품절 위험 4건 (stock = 0 or 1 or 2)
    { id: 'STK-001', productName: '센서티브 힐링 마사지 오일 (100ml)', stock: 2, safetyStock: 5, status: 'danger' },
    { id: 'STK-002', productName: '유기농 시어버터 핸드크림 (50ml)', stock: 1, safetyStock: 10, status: 'danger' },
    { id: 'STK-003', productName: '리바이탈 카밍 페이셜 토너 (150ml)', stock: 0, safetyStock: 8, status: 'danger' },
    { id: 'STK-004', productName: '소프트 코튼 아로마 디퓨저 (200ml)', stock: 2, safetyStock: 5, status: 'danger' },
    // 안전재고 이하 옵션 6건 (안전재고보다 재고가 적으나 완전 품절 위험은 아닌 수준 포함 총 6건)
    { id: 'STK-005', productName: '너리싱 바디워시 라벤더향', stock: 4, safetyStock: 10, status: 'warning' },
    { id: 'STK-006', productName: '하이드레이팅 페이스 세럼', stock: 6, safetyStock: 15, status: 'warning' },
    { id: 'STK-007', productName: '내추럴 대나무 칫솔 (4개입)', stock: 5, safetyStock: 12, status: 'warning' },
    { id: 'STK-008', productName: '마일드 필링 페이셜 스크럽', stock: 7, safetyStock: 15, status: 'warning' },
    { id: 'STK-009', productName: '카모마일 허벌 배스 솔트 (300g)', stock: 3, safetyStock: 8, status: 'warning' },
    { id: 'STK-010', productName: '모이스처 립밤 코코넛 버터', stock: 4, safetyStock: 10, status: 'warning' }
  ],
  sales: {
    todayRevenue: 1420000,
    growthRate: '+8.4%',
    popularCategory: '뷰티/헬스 아로마 코스메틱',
    conversionRate: 4.8
  }
};
