// 고도몰5 Order_Search.php "raw 응답 shape" 타입 정의 (API Raw Types)
//
// 출처: docs/godomall_order_search_spec.md
// 성격:
//   - 이것은 "API 원형(raw) shape" 타입이다. 비즈니스 가공 모델이 아니다.
//   - 매출 분석용 가공 모델은 별도(godomallRevenue.ts의 RevenueOrder)이며 혼동 금지.
//   - 실제 XML 파서(fast-xml-parser)는 숫자/날짜를 "문자열"로 내려줄 수 있다.
//     → 본 타입은 스펙 Type 표기(STRING/INTEGER/FLOAT/DATETIME)를 1차 기준으로 두되,
//       수치 필드는 `number | string`을 허용하고, 숫자 변환은 매퍼/normalize 유틸에서 한다.
//   - 단일 객체 / 배열 / 빈값으로 올 수 있는 컬렉션 필드는 `T | T[]`로 표기한다(asArray로 정규화).
//   - PII 필드(orderName/orderCellPhone/orderAddress 등)는 타입에는 포함하되,
//     절대 로그/응답/외부 LLM에 원문 출력하지 않는다(서버 piiMaskGuard / 클라 privacyMask).
//
// ⚠️ 스펙에는 100+ 필드가 존재한다. 본 타입은 운영/매출에 의미 있는 핵심 필드를 명시하고,
//    나머지 미모델 필드는 `[key: string]: unknown` 인덱스 시그니처로 허용한다(forward-compat).

// 수치 필드: XML 파서가 문자열로 줄 수 있으므로 number|string 허용.
type Num = number | string;
// 날짜/일시 필드: 항상 문자열(빈값/'0000-00-00 00:00:00' 가능).
type DateStr = string;

// ── 응답 루트 ────────────────────────────────────────────────────────────────
export interface GodomallOrderSearchResponse {
  code: number; // 성공/실패 코드
  msg: string; // 성공 또는 실패사유
  lastOrder?: string; // size 지정 시에만: 다음 페이지 존재여부 또는 마지막 주문번호
  order_data: GodomallRawOrderData | GodomallRawOrderData[]; // 단건이면 object, 다건이면 array
}

// ── order_data (주문 헤더) ───────────────────────────────────────────────────
export interface GodomallRawOrderData {
  orderNo: Num; // 주문번호
  memNo?: Num; // 회원번호 (비회원=0/빈값)
  memId?: string; // 회원아이디
  memGroupNm?: string; // 회원그룹명
  orderTypeFl?: string; // 주문유형 (pc/mobile/write)
  orderStatus: string; // 주문상태 코드 (코드표)
  orderChannelFl?: string; // 주문채널 (shop/payco/naverpay)
  orderIp?: string; // 주문자IP (PII 인접)
  orderEmail?: string; // 이메일 (PII)
  orderGoodsNm?: string; // 주문상품명(요약)
  orderGoodsCnt?: Num; // 주문상품갯수
  settlePrice?: Num; // 총 주문금액
  totalGoodsPrice?: Num; // 총 상품 금액
  totalDeliveryCharge?: Num; // 총 배송비
  totalGoodsDcPrice?: Num; // 총 상품 할인 금액
  totalCouponGoodsDcPrice?: Num; // 총 상품쿠폰 할인 금액
  totalCouponOrderDcPrice?: Num; // 총 주문쿠폰 할인 금액
  totalMileage?: Num; // 총 적립 마일리지
  useMileage?: Num; // 주문시 사용 마일리지
  useDeposit?: Num; // 주문시 사용 예치금
  firstSaleFl?: string; // 첫구매 여부 (y)
  settleKind?: string; // 주문방법 (코드표)
  multiShippingFl?: string; // 복수배송지 사용여부 (y/n)
  paymentDt?: DateStr; // 입금일자
  mallSno?: Num; // 상점번호 (코드표)
  adminMemo?: string; // 관리자 메모
  // 중첩 컬렉션 (단일/배열/빈값 가능)
  orderInfoData?: GodomallRawOrderInfoData | GodomallRawOrderInfoData[];
  orderDeliveryData?: GodomallRawOrderDeliveryData | GodomallRawOrderDeliveryData[];
  orderGoodsData?: GodomallRawOrderGoodsData | GodomallRawOrderGoodsData[];
  addGoodsData?: GodomallRawAddGoodsData | GodomallRawAddGoodsData[];
  giftData?: GodomallRawGiftData | GodomallRawGiftData[];
  orderConsultData?: GodomallRawOrderConsultData | GodomallRawOrderConsultData[];
  [key: string]: unknown;
}

// ── orderInfoData (배송지/주문자 정보, PII 포함) ──────────────────────────────
export interface GodomallRawOrderInfoData {
  sno?: Num; // 배송지 정보 고유번호(복수배송지 시 존재)
  orderInfoCd?: Num; // 배송지 정보 순번
  orderName?: string; // 주문자 이름 (PII)
  orderEmail?: string; // 주문자 이메일 (PII)
  orderPhone?: string; // 주문자 전화번호 (PII)
  orderCellPhone?: string; // 주문자 핸드폰 번호 (PII)
  orderZipcode?: string; // 주문자 우편번호
  orderAddress?: string; // 주문자 주소 (PII)
  orderAddressSub?: string; // 주문자 나머지 주소 (PII)
  receiverName?: string; // 수취인 이름 (PII)
  receiverPhone?: string; // 수취인 전화번호 (PII)
  receiverCellPhone?: string; // 수취인 핸드폰 번호 (PII)
  receiverZipcode?: string; // 수취인 우편번호
  receiverAddress?: string; // 수취인 주소 (PII)
  receiverAddressSub?: string; // 수취인 나머지 주소 (PII)
  orderMemo?: string; // 주문시 남기는글
  smsFl?: string; // SMS 수신동의 여부
  [key: string]: unknown;
}

// ── orderDeliveryData (배송비 정보) ──────────────────────────────────────────
export interface GodomallRawOrderDeliveryData {
  scmNo?: Num; // 공급사 번호
  commission?: Num; // 배송비 수수료율
  deliveryCharge?: Num; // 총 배송비(지역별 포함)
  deliveryPolicyCharge?: Num; // 총 배송비(지역별 제외)
  deliveryAreaCharge?: Num; // 총 지역별 배송비
  deliveryFixFl?: string; // 배송정책 (코드표)
  deliveryCollectFl?: string; // 배송비 결제방법 (코드표 pre/later)
  orderInfoSno?: Num; // 배송지 정보 고유번호
  sno?: Num; // 일련번호
  statisticsOrderFl?: string; // 주문/매출 통계 처리 상태
  [key: string]: unknown;
}

// ── orderGoodsData (주문상품 정보) — 매출/재고 분석의 핵심 라인 ───────────────
export interface GodomallRawOrderGoodsData {
  sno?: Num; // 주문상품 고유번호
  orderNo?: Num; // 주문번호
  orderCd?: Num; // 주문순서
  orderGroupCd?: Num; // 수량 부분취소시 그룹번호
  orderStatus?: string; // 주문상태 코드 (라인 단위)
  invoiceCompanySno?: Num; // 택배사 번호
  invoiceCompany?: string; // 택배사명
  invoiceNo?: string; // 송장번호
  scmNo?: Num; // 공급사 번호
  goodsNo?: Num; // 상품번호
  goodsCd?: Num; // 상품코드
  goodsModelNo?: string; // 모델명
  goodsNm?: string; // 상품명
  goodsCnt?: Num; // 구매수량
  goodsPrice?: Num; // 상품가격
  fixedPrice?: Num; // 정가
  costPrice?: Num; // 매입가
  goodsDcPrice?: Num; // 쿠폰할인금액
  couponGoodsDcPrice?: Num; // 상품쿠폰 할인 금액
  optionSno?: Num; // 상품옵션 고유번호
  optionInfo?: string; // 옵션정보(json)
  optionTextInfo?: string; // 입력옵션정보(json)
  minusDepositFl?: string; // 사용 예치금 차감여부 (코드표)
  minusRestoreDepositFl?: string; // 사용 예치금 복원여부 (코드표)
  minusMileageFl?: string; // 사용 마일리지 차감 여부 (코드표)
  minusRestoreMileageFl?: string; // 사용 마일리지 복원여부 (코드표)
  plusMileageFl?: string; // 적립 마일리지 차감 여부 (코드표)
  plusRestoreMileageFl?: string; // 적립 마일리지 복원여부 (코드표)
  minusStockFl?: string; // 재고차감 여부 (코드표)
  minusRestoreStockFl?: string; // 재고복원 여부 (코드표)
  cateAllCd?: string; // 상품에 연결된 전체 카테고리 코드
  goodsType?: string; // 주문상품종류
  // 상태 판별용 날짜필드 (스펙 표기는 일부 부정확하나 키명은 그대로 사용)
  cancelDt?: DateStr; // (스펙 표기 '배송일자' 이나 실제 취소일자로 사용)
  paymentDt?: DateStr; // 입금일자
  invoiceDt?: DateStr; // 송장번호 등록일
  deliveryDt?: DateStr; // 배송일자
  deliveryCompleteDt?: DateStr; // 배송완료일자
  finishDt?: DateStr; // 구매확정일자
  claimData?: GodomallRawClaimData | GodomallRawClaimData[]; // 클레임 정보
  [key: string]: unknown;
}

// ── addGoodsData (추가상품 정보) ─────────────────────────────────────────────
export interface GodomallRawAddGoodsData {
  sno?: Num; // 주문상품 고유번호
  addGoodsNo?: Num; // 추가상품 번호
  orderNo?: Num; // 주문번호
  parentGoodsNo?: Num; // 부모상품의 상품코드
  orderStatus?: string; // 주문상태 코드
  goodsCd?: Num; // 상품코드
  goodsNm?: string; // 상품명
  goodsCnt?: Num; // 구매수량
  goodsPrice?: Num; // 상품가격
  addGoodsPrice?: Num; // 추가상품금액
  claimData?: GodomallRawClaimData | GodomallRawClaimData[];
  [key: string]: unknown;
}

// ── giftData (사은품 정보) ───────────────────────────────────────────────────
export interface GodomallRawGiftData {
  sno?: Num; // 주문-사은품 매칭 고유번호
  presentTitle?: string; // 사은품지급조건명
  giftNo?: Num; // 사은품번호
  giftCd?: string; // 사은품코드
  giftNm?: string; // 사은품명
  giftCnt?: Num; // 사은품 지급수량
  [key: string]: unknown;
}

// ── claimData (클레임 정보: 취소/반품/교환/환불) ──────────────────────────────
export interface GodomallRawClaimData {
  beforeStatus?: string; // 이전 주문상태 (코드표)
  handleMode?: string; // 클레임 모드 (코드표 r/b/e/z/c)
  handleCompleteFl?: string; // 처리완료여부 (코드표 y/n)
  handleReason?: string; // 클레임 사유
  handleDetailReason?: string; // 클레임 상세사유
  handleDt?: DateStr; // 처리완료일자
  refundPrice?: Num; // 결제 환불금액
  refundUseDeposit?: Num; // 예치금 환불금액
  refundUseMileage?: Num; // 적립금 환원금액
  refundDeliveryCharge?: Num; // 배송비 환불금액
  refundCharge?: Num; // 환불수수료
  handleGroupCd?: Num; // 클레임일회처리당 그룹
  regDt?: DateStr; // 등록일
  // 스펙상 키명이 'exchageInfoData'(원문 오탈자) 임에 유의. 실제 응답 키를 그대로 둔다.
  exchageInfoData?: GodomallRawExchangeInfoData | GodomallRawExchangeInfoData[];
  [key: string]: unknown;
}

// ── exchageInfoData (다른 상품교환 차액정보) — 스펙 키명 오탈자 유지 ──────────
export interface GodomallRawExchangeInfoData {
  ehDifferencePrice?: Num; // 총 차액
  ehCancelDeliveryPrice?: Num; // 취소된 배송비
  ehAddDeliveryPrice?: Num; // 추가된 배송비
  ehRefundMethod?: string; // 환불수단
  ehRefundName?: string; // 환불예금주 (PII 인접)
  ehRefundBankName?: string; // 환불은행명
  ehRefundBankAccountNumber?: string; // 환불계좌번호 (PII 인접)
  ehSettleName?: string; // 추가결제입금자명 (PII 인접)
  ehSettleBankAccountInfo?: string; // 추가결제은행정보
  ehEnuri?: Num; // 에누리
  [key: string]: unknown;
}

// ── orderConsultData (요청사항/상담메모) ─────────────────────────────────────
export interface GodomallRawOrderConsultData {
  sno?: Num; // 요청사항/상담메모 고유번호
  orderNo?: Num; // 주문번호
  requestMemo?: string; // 요청사항
  consultMemo?: string; // 상담메모
  regDt?: DateStr; // 등록일
  modDt?: DateStr; // 수정일
  [key: string]: unknown;
}
