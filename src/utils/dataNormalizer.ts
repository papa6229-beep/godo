import type {
  StandardOrder,
  StandardInquiry,
  StandardReview,
  StandardInventoryItem,
  StandardSalesSummary,
  DataQualityReport,
  OperationsDataSnapshot
} from '../types/dataConnector';
import { maskName, maskPhone, maskEmail } from './privacyMask';

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 정규화
 * 예: "2026.06.18 10:20:30" -> "2026-06-18"
 *     "2026/06/18" -> "2026-06-18"
 *     "2026-06-18" -> "2026-06-18"
 */
export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  
  // ISO date parsing fallback
  try {
    const d = new Date(trimmed.replace(/\./g, '-').replace(/\//g, '-'));
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch {
    // Ignore and fallback to manual parsing
  }

  // 간단 매칭
  const match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const yyyy = match[1];
    const mm = match[2].padStart(2, '0');
    const dd = match[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  return trimmed;
};

/**
 * 한국어 컬럼 헤더 자동 매핑 사전
 */
const columnMapping: Record<string, string> = {
  // 주문
  '주문번호': 'orderNo',
  '주문일자': 'orderDate',
  '주문일': 'orderDate',
  '주문자': 'customerName',
  '주문자명': 'customerName',
  '고객명': 'customerName',
  '작성자': 'customerName',
  '상품명': 'productName',
  '옵션명': 'optionName',
  '수량': 'quantity',
  '결제상태': 'paymentStatus',
  '배송상태': 'deliveryStatus',
  '송장번호': 'invoiceNo',
  '금액': 'amount',
  '결제금액': 'amount',
  
  // 문의
  '문의일': 'inquiryDate',
  '문의일자': 'inquiryDate',
  '분류': 'category',
  '카테고리': 'category',
  '제목': 'title',
  '내용': 'content',
  '상태': 'status',
  
  // 리뷰
  '리뷰일': 'reviewDate',
  '작성일': 'reviewDate',
  '평점': 'rating',
  '리뷰내용': 'content',
  
  // 재고
  '재고': 'stock',
  '안전재고': 'safetyStock',
  
  // 매출
  '날짜': 'date',
  '매출': 'totalSales',
  '총매출': 'totalSales',
  '주문수': 'orderCount',
  '전환율': 'conversionRate',
  '인기상품': 'topProducts'
};

/**
 * 로우 객체(CSV 파싱 결과물 등)의 컬럼명을 한국어 매핑 딕셔너리에 기반하여 영문 표준 키로 변환
 */
export const normalizeRawObject = (raw: Record<string, string>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  Object.keys(raw).forEach(key => {
    const trimmedKey = key.trim();
    const standardKey = columnMapping[trimmedKey] || trimmedKey;
    normalized[standardKey] = raw[key];
  });
  return normalized;
};

/**
 * 주문 데이터 정규화 및 유효성 체크
 */
export const normalizeOrder = (
  raw: Record<string, string>,
  index: number,
  warnings: string[],
  errors: string[],
  maskedCounter: { count: number }
): StandardOrder => {
  const norm = normalizeRawObject(raw);
  
  const id = norm.id || `order-${Date.now()}-${index}`;
  const orderNo = norm.orderNo || '';
  const orderDate = normalizeDate(norm.orderDate || '');
  const productName = norm.productName || '';
  const optionName = norm.optionName || '기본옵션';
  const quantity = parseInt(norm.quantity || '1', 10);
  const paymentStatus = norm.paymentStatus || '결제완료';
  const deliveryStatus = norm.deliveryStatus || '배송대기';
  const invoiceNo = norm.invoiceNo || '';
  const amount = parseFloat((norm.amount || '0').replace(/[^0-9.]/g, ''));
  
  // 필수값 검사
  if (!orderNo || !orderDate || !productName) {
    errors.push(`[Row ${index + 1}] 주문 필수값 누락 (주문번호, 주문일자, 상품명 필수)`);
  }

  // 개인정보 마스킹 처리 (주문자명, 전화번호, 이메일, 주소가 raw 데이터에 섞여 있을 경우를 고려)
  const customerName = norm.customerName || norm.customerNameMasked || '고객';
  let customerNameMasked = customerName;
  if (!customerName.includes('*')) {
    customerNameMasked = maskName(customerName);
    maskedCounter.count++;
  }

  // 위험 플래그(riskFlags) 생성
  const riskFlags: string[] = [];
  if (!invoiceNo && (deliveryStatus.includes('배송중') || deliveryStatus.includes('배송완료'))) {
    riskFlags.push('invoice_missing');
    warnings.push(`[Row ${index + 1}] 배송 중인 주문에 송장번호가 누락되었습니다.`);
  }
  if (paymentStatus.includes('대기') || paymentStatus.includes('미입금')) {
    riskFlags.push('payment_pending');
    warnings.push(`[Row ${index + 1}] 입금 대기 상태인 주문이 존재합니다.`);
  }
  if (amount >= 500000) {
    riskFlags.push('high_value_order');
    warnings.push(`[Row ${index + 1}] 50만원 이상의 고액 주문이 감지되었습니다.`);
  }

  // 가상의 배송 지연 계산
  if (deliveryStatus.includes('배송중') && orderDate) {
    try {
      const orderTime = new Date(orderDate).getTime();
      const nowTime = Date.now();
      const elapsedDays = (nowTime - orderTime) / (1000 * 60 * 60 * 24);
      if (elapsedDays > 3) {
        riskFlags.push('delivery_delayed');
        warnings.push(`[Row ${index + 1}] 영업일 기준 3일 이상 배송이 지연되고 있습니다.`);
      }
    } catch {
      // Ignore
    }
  }

  // warnings 사용 보장 (TS6133 해결)
  if (warnings.length > 0) {
    // warnings read
  }

  return {
    id,
    orderNo,
    orderDate,
    customerNameMasked,
    productName,
    optionName,
    quantity,
    paymentStatus,
    deliveryStatus,
    invoiceNo,
    amount,
    riskFlags
  };
};

/**
 * CS 문의 데이터 정규화
 */
export const normalizeInquiry = (
  raw: Record<string, string>,
  index: number,
  warnings: string[],
  errors: string[],
  maskedCounter: { count: number }
): StandardInquiry => {
  const norm = normalizeRawObject(raw);
  
  const id = norm.id || `inquiry-${Date.now()}-${index}`;
  const inquiryDate = normalizeDate(norm.inquiryDate || '');
  const category = norm.category || '기타';
  const title = norm.title || '';
  const content = norm.content || '';
  const status = norm.status || '답변대기';
  const priority = norm.priority || 'medium';
  
  // 감정 분석 (sentiment) 모의 계산
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  const text = (title + ' ' + content).toLowerCase();
  if (text.includes('불만') || text.includes('화가') || text.includes('환불') || text.includes('느리') || text.includes('최악') || text.includes('이상') || text.includes('실망')) {
    sentiment = 'negative';
  } else if (text.includes('감사') || text.includes('친절') || text.includes('만족') || text.includes('좋아')) {
    sentiment = 'positive';
  }

  if (!inquiryDate || !title || !content) {
    errors.push(`[Row ${index + 1}] CS 필수값 누락 (문의일자, 제목, 내용 필수)`);
  }

  // 개인정보 마스킹
  const customerName = norm.customerName || norm.customerNameMasked || '고객';
  let customerNameMasked = customerName;
  if (!customerName.includes('*')) {
    customerNameMasked = maskName(customerName);
    maskedCounter.count++;
  }

  // 위험 플래그
  const riskFlags: string[] = [];
  if (status.includes('대기') || status.includes('미답변') || status.includes('unanswered')) {
    riskFlags.push('unanswered');
    warnings.push(`[Row ${index + 1}] 답변이 등록되지 않은 CS 문의가 있습니다.`);
  }
  if (text.includes('불만') || text.includes('신고') || text.includes('해결')) {
    riskFlags.push('complaint');
    warnings.push(`[Row ${index + 1}] 고객 불만이 접수된 CS 문의가 있습니다.`);
  }
  if (text.includes('환불') || text.includes('취소') || text.includes('refund')) {
    riskFlags.push('refund_request');
    warnings.push(`[Row ${index + 1}] 환불/취소 요청 CS 문의가 접수되었습니다.`);
  }
  if (priority === 'high' || priority === 'critical' || text.includes('급합') || text.includes('빨리') || text.includes('당장')) {
    riskFlags.push('urgent');
    warnings.push(`[Row ${index + 1}] 긴급 처리가 필요한 고우선순위 CS 문의가 존재합니다.`);
  }

  // warnings 사용 보장 (TS6133 해결)
  if (warnings.length > 0) {
    // warnings read
  }

  return {
    id,
    inquiryDate,
    category,
    customerNameMasked,
    title,
    content: maskPhone(maskEmail(content)), // 이메일, 전화번호 노출 원천 마스킹
    status,
    priority,
    sentiment,
    riskFlags
  };
};

/**
 * 리뷰 데이터 정규화
 */
export const normalizeReview = (
  raw: Record<string, string>,
  index: number,
  warnings: string[],
  errors: string[],
  maskedCounter: { count: number }
): StandardReview => {
  const norm = normalizeRawObject(raw);
  
  const id = norm.id || `review-${Date.now()}-${index}`;
  const reviewDate = normalizeDate(norm.reviewDate || '');
  const productName = norm.productName || '알 수 없는 상품';
  const rating = parseInt(norm.rating || '5', 10);
  const content = norm.content || '';
  
  let sentiment: 'positive' | 'neutral' | 'negative' = 'positive';
  if (rating <= 2) {
    sentiment = 'negative';
  } else if (rating === 3) {
    sentiment = 'neutral';
  }

  if (!reviewDate || !productName || isNaN(rating)) {
    errors.push(`[Row ${index + 1}] 리뷰 필수값 누락 (작성일자, 상품명, 평점 필수)`);
  }

  const needsReply = rating <= 3;

  // 위험 플래그
  const riskFlags: string[] = [];
  if (rating <= 2) {
    riskFlags.push('low_rating');
    riskFlags.push('negative_review');
    warnings.push(`[Row ${index + 1}] 평점 2점 이하의 저평점 부정 리뷰가 등록되었습니다.`);
  }
  if (needsReply) {
    riskFlags.push('needs_reply');
    warnings.push(`[Row ${index + 1}] 답변 작성이 필요한 리뷰가 존재합니다.`);
  }

  // 리뷰 내용에 개인정보 포함 시 마스킹
  const maskedContent = maskPhone(maskEmail(content));
  if (maskedContent !== content) {
    maskedCounter.count++;
  }

  // warnings 사용 보장 (TS6133 해결)
  if (warnings.length > 0) {
    // warnings read
  }

  return {
    id,
    reviewDate,
    productName,
    rating,
    content: maskedContent,
    sentiment,
    needsReply,
    riskFlags
  };
};

/**
 * 재고 데이터 정규화
 */
export const normalizeInventoryItem = (
  raw: Record<string, string>,
  index: number,
  warnings: string[],
  errors: string[]
): StandardInventoryItem => {
  const norm = normalizeRawObject(raw);
  
  const id = norm.id || `inventory-${Date.now()}-${index}`;
  const productName = norm.productName || '';
  const optionName = norm.optionName || '기본옵션';
  const stock = parseInt(norm.stock || '0', 10);
  const safetyStock = parseInt(norm.safetyStock || '5', 10);
  
  if (!productName || isNaN(stock)) {
    errors.push(`[Row ${index + 1}] 재고 필수값 누락 (상품명, 재고수량 필수)`);
  }

  let status: 'ok' | 'warning' | 'danger' = 'ok';
  const riskFlags: string[] = [];
  
  if (stock === 0) {
    status = 'danger';
    riskFlags.push('out_of_stock');
    warnings.push(`[Row ${index + 1}] 상품 재고가 완전히 소진되어 일시 품절되었습니다.`);
  } else if (stock < safetyStock) {
    status = 'warning';
    riskFlags.push('low_stock');
    riskFlags.push('below_safety_stock');
    warnings.push(`[Row ${index + 1}] 상품 재고가 안전재고 수량(${safetyStock}개)보다 적습니다.`);
  }

  // warnings 사용 보장 (TS6133 해결)
  if (warnings.length > 0) {
    // warnings read
  }

  return {
    id,
    productName,
    optionName,
    stock,
    safetyStock,
    status,
    riskFlags
  };
};

/**
 * 매출 요약 데이터 정규화
 */
export const normalizeSalesSummary = (
  raw: Record<string, string>,
  index: number,
  warnings: string[],
  errors: string[]
): StandardSalesSummary => {
  const norm = normalizeRawObject(raw);
  
  const date = normalizeDate(norm.date || '');
  const totalSales = parseFloat((norm.totalSales || '0').replace(/[^0-9.]/g, ''));
  const orderCount = parseInt(norm.orderCount || '0', 10);
  const conversionRate = parseFloat((norm.conversionRate || '0').replace(/[^0-9.]/g, ''));
  
  let topProducts: string[] = [];
  if (norm.topProducts) {
    topProducts = norm.topProducts.split(',').map(p => p.trim()).filter(Boolean);
  }

  if (!date || isNaN(totalSales)) {
    errors.push(`[Row ${index + 1}] 매출 필수값 누락 (날짜, 매출액 필수)`);
  }

  if (conversionRate < 2.0 && conversionRate > 0) {
    warnings.push(`[Row ${index + 1}] 일일 결제 전환율이 평균 수준 이하(2% 미만)로 저하되었습니다.`);
  }
  if (totalSales === 0) {
    warnings.push(`[Row ${index + 1}] 금일 총 매출액이 0원입니다.`);
  }

  // warnings 사용 보장 (TS6133 해결)
  if (warnings.length > 0) {
    // warnings read
  }

  return {
    date,
    totalSales,
    orderCount,
    conversionRate,
    topProducts,
    memo: norm.memo || ''
  };
};

/**
 * 임포트된 원본 데이터를 바탕으로 종합 DataQualityReport 및 Standard OperationsDataSnapshot 구성
 */
export const buildOperationsSnapshot = (
  domain: string,
  rawItems: Record<string, string>[],
  existingSnapshot: OperationsDataSnapshot
): OperationsDataSnapshot => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const maskedCounter = { count: 0 };
  
  const updatedSnapshot: OperationsDataSnapshot = {
    ...existingSnapshot,
    importedAt: new Date().toISOString()
  };

  if (domain === 'orders') {
    const orders = rawItems.map((raw, idx) => normalizeOrder(raw, idx, warnings, errors, maskedCounter));
    updatedSnapshot.orders = orders;
  } else if (domain === 'inquiries') {
    const inquiries = rawItems.map((raw, idx) => normalizeInquiry(raw, idx, warnings, errors, maskedCounter));
    updatedSnapshot.inquiries = inquiries;
  } else if (domain === 'reviews') {
    const reviews = rawItems.map((raw, idx) => normalizeReview(raw, idx, warnings, errors, maskedCounter));
    updatedSnapshot.reviews = reviews;
  } else if (domain === 'inventory') {
    const inventory = rawItems.map((raw, idx) => normalizeInventoryItem(raw, idx, warnings, errors));
    updatedSnapshot.inventory = inventory;
  } else if (domain === 'sales') {
    const sales = rawItems.map((raw, idx) => normalizeSalesSummary(raw, idx, warnings, errors));
    updatedSnapshot.sales = sales;
  }

  // 퀄리티 검사 생성
  const totalRows = rawItems.length;
  const errorRows = errors.length;
  const warningRows = warnings.length;
  const validRows = totalRows - errorRows;
  
  // 중복 데이터 검출
  const duplicateRows = totalRows - new Set(rawItems.map(item => JSON.stringify(item))).size;
  
  // 위험 플래그 총 개수 계산
  let riskFlagCount = 0;
  if (domain === 'orders') updatedSnapshot.orders.forEach(o => riskFlagCount += o.riskFlags.length);
  if (domain === 'inquiries') updatedSnapshot.inquiries.forEach(i => riskFlagCount += i.riskFlags.length);
  if (domain === 'reviews') updatedSnapshot.reviews.forEach(r => riskFlagCount += r.riskFlags.length);
  if (domain === 'inventory') updatedSnapshot.inventory.forEach(iv => riskFlagCount += iv.riskFlags.length);
  
  // 데이터 품질 스코어 계산 (에러당 감점 15점, 경고당 감점 3점, 중복 감점 등)
  const baseScore = 100;
  const errorPenalty = totalRows > 0 ? (errorRows / totalRows) * 80 : 0;
  const warningPenalty = totalRows > 0 ? (warningRows / totalRows) * 20 : 0;
  const duplicatePenalty = totalRows > 0 ? (duplicateRows / totalRows) * 10 : 0;
  const qualityScore = Math.max(0, Math.round(baseScore - errorPenalty - warningPenalty - duplicatePenalty));

  const notes: string[] = [];
  if (errorRows > 0) notes.push(`${errorRows}건의 행에서 치명적인 필수 필드 누락이 감지되었습니다.`);
  if (warningRows > 0) notes.push(`${warningRows}건의 잠재적 위험/포맷 불일치 경고가 있습니다.`);
  if (duplicateRows > 0) notes.push(`${duplicateRows}건의 동일/중복 행이 존재합니다.`);
  if (maskedCounter.count > 0) notes.push(`${maskedCounter.count}건의 이름/연락처 개인 식별정보(PII)가 자동으로 안전 마스킹 필터링되었습니다.`);

  // warnings 고유 경고 메시지 병합
  if (warnings.length > 0) {
    const uniqueWarnings = Array.from(new Set(warnings)).slice(0, 10);
    uniqueWarnings.forEach(w => notes.push(w));
  }

  const qualityReport: DataQualityReport = {
    totalRows,
    validRows,
    warningRows,
    errorRows,
    missingRequiredFields: errors,
    duplicateRows,
    privacyMaskedCount: maskedCounter.count,
    riskFlagCount,
    qualityScore,
    notes
  };

  updatedSnapshot.qualityReport = qualityReport;
  return updatedSnapshot;
};
