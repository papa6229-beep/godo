// 고도몰5 Order_Search.php 공식 코드표 상수화 (Order Search Code Tables)
//
// 출처: docs/godomall_order_search_spec.md (고도몰 개발자센터 Order_Search.php 스펙 export)
// 원칙:
//   - 모든 코드값은 공식 스펙 기준. 임의 코드 추가 금지.
//   - 라벨(한글 설명)은 스펙 표기를 그대로 사용.
//   - `*_LABELS` = 코드→설명 맵(as const), `*_CODES` = 코드값 배열, `*Code` = 유니온 타입.
//   - 이 파일은 순수 상수/타입만 보유한다(부수효과 없음). 서버/프론트 어디서나 import 가능.

// ── 공통 라벨 조회 헬퍼 ──────────────────────────────────────────────────────
// 알 수 없는 코드는 코드값 자체를 반환(스펙 외 값도 안전하게 표시).
export const labelOf = (map: Readonly<Record<string, string>>, code: string | undefined | null): string => {
  const key = (code ?? '').trim();
  return (key && map[key]) || key;
};

// ── dateType (기간검색 타입) ─────────────────────────────────────────────────
export const DATE_TYPE_LABELS = {
  order: '주문일',
  modify: '수정일'
} as const;
export type GodomallDateTypeCode = keyof typeof DATE_TYPE_LABELS;
export const DATE_TYPE_CODES = Object.keys(DATE_TYPE_LABELS) as GodomallDateTypeCode[];

// ── orderStatus (주문상태 코드) ──────────────────────────────────────────────
export const ORDER_STATUS_LABELS = {
  o1: '입금대기',
  p1: '결제완료',
  g1: '상품준비중',
  g2: '구매발주',
  g3: '상품입고',
  g4: '상품출고',
  d1: '배송중',
  d2: '배송완료',
  s1: '구매확정',
  c1: '자동취소',
  c2: '품절취소',
  c3: '관리자취소',
  c4: '고객취소요청',
  f1: '결제시도',
  f2: '고객결제중단',
  f3: '결제실패',
  f4: 'PG 확인요망',
  b1: '반품접수',
  b2: '반송중',
  b3: '반품보류',
  b4: '반품회수완료',
  e1: '교환접수',
  e2: '반송중',
  e3: '재배송중',
  e4: '교환보류',
  e5: '교환완료',
  r1: '환불접수',
  r2: '환불보류',
  r3: '환불완료',
  z1: '추가입금대기',
  z2: '추가결제완료',
  z3: '추가배송중',
  z4: '추가배송완료',
  z5: '교환추가완료'
} as const;
export type GodomallOrderStatusCode = keyof typeof ORDER_STATUS_LABELS;
export const ORDER_STATUS_CODES = Object.keys(ORDER_STATUS_LABELS) as GodomallOrderStatusCode[];

// 상태군(prefix) 분류 — 코드 첫 글자 기준(스펙 코드 체계상 일관). 표시/필터 보조용.
export type OrderStatusGroup =
  | 'unpaid' // o
  | 'paid' // p
  | 'prepare' // g
  | 'delivery' // d
  | 'confirmed' // s
  | 'cancel' // c
  | 'fail' // f
  | 'return' // b
  | 'exchange' // e
  | 'refund' // r
  | 'additional' // z
  | 'unknown';

export const orderStatusGroupOf = (code: string | undefined | null): OrderStatusGroup => {
  const c = (code ?? '').trim().toLowerCase();
  switch (c[0]) {
    case 'o':
      return 'unpaid';
    case 'p':
      return 'paid';
    case 'g':
      return 'prepare';
    case 'd':
      return 'delivery';
    case 's':
      return 'confirmed';
    case 'c':
      return 'cancel';
    case 'f':
      return 'fail';
    case 'b':
      return 'return';
    case 'e':
      return 'exchange';
    case 'r':
      return 'refund';
    case 'z':
      return 'additional';
    default:
      return 'unknown';
  }
};

// ── orderChannel (주문채널) ──────────────────────────────────────────────────
export const ORDER_CHANNEL_LABELS = {
  shop: '쇼핑몰 주문',
  payco: '페이코 주문',
  naverpay: '네이버페이 주문'
} as const;
export type GodomallOrderChannelCode = keyof typeof ORDER_CHANNEL_LABELS;
export const ORDER_CHANNEL_CODES = Object.keys(ORDER_CHANNEL_LABELS) as GodomallOrderChannelCode[];

// ── searchType (검색어 검색 타입) ────────────────────────────────────────────
export const SEARCH_TYPE_LABELS = {
  orderPhone: '주문자 전화번호',
  receiverPhone: '수령자 전화번호',
  orderCellPhone: '주문자 휴대폰번호',
  receiverCellPhone: '수령자 휴대폰번호'
} as const;
export type GodomallSearchTypeCode = keyof typeof SEARCH_TYPE_LABELS;
export const SEARCH_TYPE_CODES = Object.keys(SEARCH_TYPE_LABELS) as GodomallSearchTypeCode[];

// ── sort (주문정렬) ──────────────────────────────────────────────────────────
export const SORT_LABELS = {
  'orderNo desc': '주문번호 내림차순',
  'orderNo asc': '주문번호 오름차순'
} as const;
export type GodomallSortCode = keyof typeof SORT_LABELS;
export const SORT_CODES = Object.keys(SORT_LABELS) as GodomallSortCode[];

// ── mallSno (상점번호) ───────────────────────────────────────────────────────
export const MALL_SNO_LABELS = {
  '1': '기준몰(국내몰)',
  '2': '영문몰',
  '3': '중문몰',
  '4': '일문몰'
} as const;
export type GodomallMallSnoCode = keyof typeof MALL_SNO_LABELS;
export const MALL_SNO_CODES = Object.keys(MALL_SNO_LABELS) as GodomallMallSnoCode[];

// ── orderTypeFl (주문유형) ───────────────────────────────────────────────────
export const ORDER_TYPE_LABELS = {
  pc: 'PC',
  mobile: '모바일',
  write: '수기'
} as const;
export type GodomallOrderTypeCode = keyof typeof ORDER_TYPE_LABELS;
export const ORDER_TYPE_CODES = Object.keys(ORDER_TYPE_LABELS) as GodomallOrderTypeCode[];

// ── firstSaleFl (첫구매 여부) ────────────────────────────────────────────────
// 스펙상 'y'(첫구매)만 정의됨. 미첫구매는 빈값/미존재.
export const FIRST_SALE_LABELS = {
  y: '첫구매'
} as const;
export type GodomallFirstSaleCode = keyof typeof FIRST_SALE_LABELS;
export const FIRST_SALE_CODES = Object.keys(FIRST_SALE_LABELS) as GodomallFirstSaleCode[];

// ── settleKind (주문방법) ────────────────────────────────────────────────────
export const SETTLE_KIND_LABELS = {
  eb: '에스크로 계좌이체',
  ec: '에스크로 신용카드',
  ev: '에스크로 가상계좌',
  fb: '간편결제 계좌이체',
  fc: '간편결제 신용카드',
  fh: '간편결제 휴대폰',
  fp: '간편결제 포인트',
  fv: '간편결제 가상계좌',
  fa: '간편결제 무통장입금',
  gb: '무통장 입금',
  pb: '계좌이체',
  pc: '신용카드',
  ph: '휴대폰',
  pv: '가상계좌',
  pk: '간편결제 카카오페이',
  pl: '간편결제 후불결제',
  pn: '간편결제 네이버페이',
  gd: '예치금',
  gm: '마일리지',
  gz: '전액할인',
  gr: '기타'
} as const;
export type GodomallSettleKindCode = keyof typeof SETTLE_KIND_LABELS;
export const SETTLE_KIND_CODES = Object.keys(SETTLE_KIND_LABELS) as GodomallSettleKindCode[];

// ── deliveryFixFl (배송정책) ─────────────────────────────────────────────────
export const DELIVERY_FIX_LABELS = {
  fixed: '고정',
  free: '무료',
  price: '가격별',
  weight: '무게별',
  count: '수량별'
} as const;
export type GodomallDeliveryFixCode = keyof typeof DELIVERY_FIX_LABELS;
export const DELIVERY_FIX_CODES = Object.keys(DELIVERY_FIX_LABELS) as GodomallDeliveryFixCode[];

// ── deliveryCollectFl (배송비 결제방법) ──────────────────────────────────────
export const DELIVERY_COLLECT_LABELS = {
  pre: '선불',
  later: '착불'
} as const;
export type GodomallDeliveryCollectCode = keyof typeof DELIVERY_COLLECT_LABELS;
export const DELIVERY_COLLECT_CODES = Object.keys(DELIVERY_COLLECT_LABELS) as GodomallDeliveryCollectCode[];

// ── 예치금/마일리지/재고 차감·복원 플래그 (y/n 계열) ─────────────────────────
// 스펙상 각 플래그는 동일한 의미 체계를 가진다:
//   차감류(minusDepositFl/minusMileageFl/plusMileageFl/minusStockFl): n=미차감, y=차감
//   복원류(minusRestore*Fl): n=미복원, y=복원
// 코드값은 모두 'y'/'n'으로 동일하므로 의미별 라벨맵을 분리 제공한다.
export const DEDUCT_FLAG_LABELS = {
  n: '미차감',
  y: '차감'
} as const;
export const RESTORE_FLAG_LABELS = {
  n: '미복원',
  y: '복원'
} as const;
export type GodomallYnFlagCode = 'y' | 'n';
export const YN_FLAG_CODES: GodomallYnFlagCode[] = ['y', 'n'];

// 의미별 별칭(가독성용) — 모두 위 두 맵을 참조한다.
export const MINUS_DEPOSIT_FL_LABELS = DEDUCT_FLAG_LABELS;
export const MINUS_RESTORE_DEPOSIT_FL_LABELS = RESTORE_FLAG_LABELS;
export const MINUS_MILEAGE_FL_LABELS = DEDUCT_FLAG_LABELS;
export const MINUS_RESTORE_MILEAGE_FL_LABELS = RESTORE_FLAG_LABELS;
export const PLUS_MILEAGE_FL_LABELS = DEDUCT_FLAG_LABELS;
export const PLUS_RESTORE_MILEAGE_FL_LABELS = RESTORE_FLAG_LABELS;
export const MINUS_STOCK_FL_LABELS = DEDUCT_FLAG_LABELS;
export const MINUS_RESTORE_STOCK_FL_LABELS = RESTORE_FLAG_LABELS;

// ── claimData > handleMode (클레임 모드) ─────────────────────────────────────
export const CLAIM_HANDLE_MODE_LABELS = {
  r: '환불접수',
  b: '반품접수',
  e: '교환접수',
  z: '교환추가',
  c: '취소'
} as const;
export type GodomallClaimHandleModeCode = keyof typeof CLAIM_HANDLE_MODE_LABELS;
export const CLAIM_HANDLE_MODE_CODES = Object.keys(CLAIM_HANDLE_MODE_LABELS) as GodomallClaimHandleModeCode[];

// ── claimData > handleCompleteFl (처리완료여부) ──────────────────────────────
// 스펙 표기: y=환불완료, n=환불접수 (클레임 처리 완료 여부)
export const HANDLE_COMPLETE_LABELS = {
  y: '환불완료',
  n: '환불접수'
} as const;
export type GodomallHandleCompleteCode = keyof typeof HANDLE_COMPLETE_LABELS;
export const HANDLE_COMPLETE_CODES = Object.keys(HANDLE_COMPLETE_LABELS) as GodomallHandleCompleteCode[];
