/*
 * scripts/fixtures/b-core-2-ab-fixture.mjs
 * B-core-2 — A/B 데이터 세계 parity 공통 fixture **원본**.
 *
 * 원칙(작업지시 §6):
 *   - A 투영과 B 투영을 **각각 손으로 쓰지 않는다.** 여기 있는 raw 원본 하나에서 파생한다.
 *     (두 벌을 손으로 쓰면 fixture 자체의 불일치를 parity 결함으로 오인한다.)
 *   - 원본 형태 = 고도몰 Open API raw 응답 형태다. A(`resolveResource`)와
 *     B(`resolveOrdersRevenue`)가 실제로 같은 이 지점에서 갈라지기 때문이다.
 *   - 개인정보 없음. 이름·연락처·주소는 명백한 시험 문자열이며 실제 인물과 무관하다.
 *   - 네트워크·Vercel·localStorage 에 의존하지 않는다(결정론).
 *
 * 이 파일은 `smoke-*.mjs` 가 아니므로 회귀 러너가 검사로 실행하지 않는다(의도).
 */

// ── 주문 원본 (Order_Search.php 실응답 형태) ────────────────────────────────
// 헤더: orderNo / orderDate / paymentDt / orderStatus / totalGoodsPrice /
//       totalDeliveryCharge / settlePrice / settleKind
// 중첩: orderInfoData(주문자·수령자) · orderGoodsData(주문상품 라인, object|array)
// 라인 날짜: invoiceDt · deliveryDt · deliveryCompleteDt · finishDt · cancelDt
//
// 각 케이스에 `__case` 표식을 달아 두었다. 매퍼는 모르는 키를 무시하므로 투영에 영향이 없고,
// 검사 출력에서 어느 사업 사건이 갈라졌는지 사람이 읽을 수 있다.
const line = (over = {}) => ({
  goodsNo: '1000000001',
  goodsCd: 'A-0001',
  goodsNm: '시험상품 A',
  goodsCnt: '1',
  goodsPrice: '10000',
  invoiceDt: '',
  deliveryDt: '',
  deliveryCompleteDt: '',
  finishDt: '',
  cancelDt: '',
  ...over
});

const info = (n) => ({
  orderName: `시험주문자${n}`,
  receiverName: `시험수령자${n}`,
  orderCellPhone: '010-0000-0000',
  receiverAddress: '시험시 시험구 시험로 1',
  receiverAddressSub: ''
});

export const RAW_ORDERS = [
  // 1) 결제 완료 일반 주문
  {
    __case: 'C1 결제완료 일반',
    orderNo: 'T-0001', orderDate: '2026-07-01 10:00:00',
    paymentDt: '2026-07-01 10:05:00', orderStatus: 'p1',
    totalGoodsPrice: '10000', totalDeliveryCharge: '0', settlePrice: '10000', settleKind: 'card',
    orderInfoData: info(1),
    orderGoodsData: line({ orderStatus: 'p1' })
  },
  // 2) 입금 대기 주문 (결제일시 없음)
  {
    __case: 'C2 입금대기',
    orderNo: 'T-0002', orderDate: '2026-07-02 10:00:00',
    paymentDt: '', orderStatus: 'o1',
    totalGoodsPrice: '20000', totalDeliveryCharge: '0', settlePrice: '20000', settleKind: 'vbank',
    orderInfoData: info(2),
    orderGoodsData: line({ goodsNo: '1000000002', goodsCd: 'A-0002', goodsNm: '시험상품 B', goodsPrice: '20000', orderStatus: 'o1' })
  },
  // 3) 발송 전 취소 (결제됐다가 취소, 송장 없음)
  {
    __case: 'C3 발송전 취소',
    orderNo: 'T-0003', orderDate: '2026-07-03 10:00:00',
    paymentDt: '2026-07-03 10:05:00', orderStatus: 'c1',
    totalGoodsPrice: '30000', totalDeliveryCharge: '0', settlePrice: '30000', settleKind: 'card',
    orderInfoData: info(3),
    orderGoodsData: line({ goodsNo: '1000000003', goodsCd: 'A-0003', goodsNm: '시험상품 C', goodsPrice: '30000', cancelDt: '2026-07-03 11:00:00', orderStatus: 'c1' })
  },
  // 4) 배송 완료 주문
  {
    __case: 'C4 배송완료',
    orderNo: 'T-0004', orderDate: '2026-07-04 10:00:00',
    paymentDt: '2026-07-04 10:05:00', orderStatus: 'd2',
    totalGoodsPrice: '40000', totalDeliveryCharge: '0', settlePrice: '40000', settleKind: 'card',
    orderInfoData: info(4),
    orderGoodsData: line({
      goodsNo: '1000000004', goodsCd: 'A-0004', goodsNm: '시험상품 D', goodsPrice: '40000',
      invoiceDt: '2026-07-05 09:00:00', deliveryDt: '2026-07-05 09:00:00',
      deliveryCompleteDt: '2026-07-06 15:00:00', orderStatus: 'd2'
    })
  },
  // 5) 반품 요청 주문 (발송 후, 처리 미완료)
  {
    __case: 'C5 반품요청(미완료)',
    orderNo: 'T-0005', orderDate: '2026-07-05 10:00:00',
    paymentDt: '2026-07-05 10:05:00', orderStatus: 'r1',
    totalGoodsPrice: '50000', totalDeliveryCharge: '0', settlePrice: '50000', settleKind: 'card',
    handleMode: 'return', handleCompleteFl: 'n', requestedRefundAmount: '50000',
    orderInfoData: info(5),
    orderGoodsData: line({
      goodsNo: '1000000005', goodsCd: 'A-0005', goodsNm: '시험상품 E', goodsPrice: '50000',
      invoiceDt: '2026-07-06 09:00:00', deliveryDt: '2026-07-06 09:00:00',
      deliveryCompleteDt: '2026-07-07 15:00:00', orderStatus: 'r1'
    })
  },
  // 6) 반품 후 환불 완료 주문
  {
    __case: 'C6 반품→환불완료',
    orderNo: 'T-0006', orderDate: '2026-07-06 10:00:00',
    paymentDt: '2026-07-06 10:05:00', orderStatus: 'r2',
    totalGoodsPrice: '60000', totalDeliveryCharge: '0', settlePrice: '60000', settleKind: 'card',
    handleMode: 'return', handleCompleteFl: 'y', handleDt: '2026-07-10 12:00:00', requestedRefundAmount: '60000',
    orderInfoData: info(6),
    orderGoodsData: line({
      goodsNo: '1000000006', goodsCd: 'A-0006', goodsNm: '시험상품 F', goodsPrice: '60000',
      invoiceDt: '2026-07-07 09:00:00', deliveryCompleteDt: '2026-07-08 15:00:00',
      cancelDt: '2026-07-10 12:00:00', orderStatus: 'r2'
    })
  },
  // 7) 배송비가 있는 주문
  {
    __case: 'C7 배송비 있음',
    orderNo: 'T-0007', orderDate: '2026-07-07 10:00:00',
    paymentDt: '2026-07-07 10:05:00', orderStatus: 'p1',
    totalGoodsPrice: '70000', totalDeliveryCharge: '3000', settlePrice: '73000', settleKind: 'card',
    orderInfoData: info(7),
    orderGoodsData: line({ goodsNo: '1000000007', goodsCd: 'A-0007', goodsNm: '시험상품 G', goodsPrice: '70000', orderStatus: 'p1' })
  },
  // 8) 상품 라인이 여러 개인 주문
  {
    __case: 'C8 다중 라인',
    orderNo: 'T-0008', orderDate: '2026-07-08 10:00:00',
    paymentDt: '2026-07-08 10:05:00', orderStatus: 'p1',
    totalGoodsPrice: '35000', totalDeliveryCharge: '2500', settlePrice: '37500', settleKind: 'card',
    orderInfoData: info(8),
    orderGoodsData: [
      line({ goodsNo: '1000000001', goodsCd: 'A-0001', goodsNm: '시험상품 A', goodsCnt: '2', goodsPrice: '10000', orderStatus: 'p1' }),
      line({ goodsNo: '1000000003', goodsCd: 'A-0003', goodsNm: '시험상품 C', goodsCnt: '1', goodsPrice: '15000', orderStatus: 'p1' })
    ]
  },
  // 9) 경계: 결제일시가 있는데 주문상태가 입금대기(o1)
  //    — A(`interpretOrderRecord`)와 B(`deriveOrderState`)의 paid 판정이 갈리는 지점.
  {
    __case: 'C9 경계 paymentDt+o1',
    orderNo: 'T-0009', orderDate: '2026-07-09 10:00:00',
    paymentDt: '2026-07-09 10:05:00', orderStatus: 'o1',
    totalGoodsPrice: '90000', totalDeliveryCharge: '0', settlePrice: '90000', settleKind: 'vbank',
    orderInfoData: info(9),
    orderGoodsData: line({ goodsNo: '1000000008', goodsCd: 'A-0008', goodsNm: '시험상품 H', goodsPrice: '90000', orderStatus: 'o1' })
  },
  // 10) 경계: 결제일시가 없는데 주문상태가 배송중(d1)
  //     — 같은 이유로 paid 판정이 반대 방향으로 갈리는 지점.
  {
    __case: 'C10 경계 배송중+결제일시없음',
    orderNo: 'T-0010', orderDate: '2026-07-10 10:00:00',
    paymentDt: '', orderStatus: 'd1',
    totalGoodsPrice: '11000', totalDeliveryCharge: '0', settlePrice: '11000', settleKind: 'card',
    orderInfoData: info(10),
    orderGoodsData: line({
      goodsNo: '1000000009', goodsCd: 'A-0009', goodsNm: '시험상품 I', goodsPrice: '11000',
      invoiceDt: '2026-07-11 09:00:00', orderStatus: 'd1'
    })
  }
];

// 실제 데이터 / 합성 데이터 구분은 **주문 레코드의 내용이 아니라 출처 태그**로 이뤄진다.
//   B: mapOrdersToRevenue(raw, index, sourceType) 의 3번째 인자
//   A: 스냅샷의 sourceType / resourceProvenance
// 따라서 "실제 주문(9)"과 "합성 주문(10)"은 같은 원본을 두 출처로 투영해 확인한다.
export const REAL_SOURCE_TAG = 'real_godomall';
export const SYNTHETIC_SOURCE_TAG = 'synthetic_test';

// ── 상품/재고 원본 (Goods_Search.php 실응답 형태) ──────────────────────────
// totalStock=재고 · stockFl=재고사용(무제한 여부) · soldOutFl=품절표시
export const RAW_GOODS = [
  { __case: 'P1 정상재고',        goodsNo: '2000000001', goodsCd: 'B-0001', goodsNm: '재고상품 정상',   goodsPrice: '10000', totalStock: '50', stockFl: 'y', soldOutFl: 'n' },
  { __case: 'P2 안전재고 경계(3)', goodsNo: '2000000002', goodsCd: 'B-0002', goodsNm: '재고상품 경계3',  goodsPrice: '10000', totalStock: '3',  stockFl: 'y', soldOutFl: 'n' },
  { __case: 'P3 안전재고 경계(4)', goodsNo: '2000000003', goodsCd: 'B-0003', goodsNm: '재고상품 경계4',  goodsPrice: '10000', totalStock: '4',  stockFl: 'y', soldOutFl: 'n' },
  { __case: 'P4 품절(재고0)',      goodsNo: '2000000004', goodsCd: 'B-0004', goodsNm: '재고상품 소진',   goodsPrice: '10000', totalStock: '0',  stockFl: 'y', soldOutFl: 'n' },
  { __case: 'P5 품절표시',         goodsNo: '2000000005', goodsCd: 'B-0005', goodsNm: '재고상품 품절표시', goodsPrice: '10000', totalStock: '100', stockFl: 'y', soldOutFl: 'y' },
  { __case: 'P6 무제한재고',       goodsNo: '2000000006', goodsCd: 'B-0006', goodsNm: '재고상품 무제한', goodsPrice: '10000', totalStock: '0',  stockFl: 'n', soldOutFl: 'n' }
];

// ── 문의 / 리뷰 / provenance 원본 ───────────────────────────────────────────
// 문의·리뷰는 현재 라이브 미지원(Board_List.php 미매핑)이므로 "실제 0건"과
// "연결 안 됨"이 서로 다른 사실임을 확인하기 위한 provenance 입력만 둔다.
// `requested` 는 "사용자가 무엇을 요청했는가"다. 실제 요청(또는 미지정)인데 mock 이 돌아오면
// 계약이 fail-closed 로 '연결 안 됨'을 낸다 — 이건 결함이 아니라 의도된 동작이므로
// 시험 모드 케이스는 requested:'test' 를 명시해 두 경우를 모두 확인한다.
export const PROVENANCE_CASES = [
  { label: '실제 데이터(건수 있음)',   expected: 'actual',      input: { sourceType: 'api_proxy_real', records: [{ a: 1 }], requested: 'real' } },
  { label: '실제 데이터 0건',          expected: 'actual',      input: { sourceType: 'api_proxy_real', records: [], requested: 'real' } },
  { label: '시험 데이터(시험 모드)',    expected: 'fixture',     input: { sourceType: 'api_mock_fallback', records: [{ a: 1 }], requested: 'test' } },
  { label: '시험 데이터(실제 요청)',    expected: 'unavailable', input: { sourceType: 'api_mock_fallback', records: [{ a: 1 }], requested: 'real' } },
  { label: '합성 데이터',              expected: 'simulation',  input: { sourceType: 'synthetic_test', records: [{ a: 1 }] } },
  { label: '연결 안 됨',               expected: 'unavailable', input: { sourceType: 'unavailable', records: [] } }
];
