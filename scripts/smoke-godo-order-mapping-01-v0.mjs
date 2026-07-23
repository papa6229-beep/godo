#!/usr/bin/env node
/*
 * scripts/smoke-godo-order-mapping-01-v0.mjs
 * GODO-ORDER-MAPPING-01 — Order_Search → /api/godomall/orders 표시 결함 RED 재현.
 *
 * 배경(실측 2026-07-23, Production):
 *   GET /api/godomall/orders        → HTTP 200 · sourceType api_proxy_real · records 1건
 *                                     (orderNo/orderDate/productName 전부 빈 문자열, amount '0',
 *                                      optionName '단품', quantity '1', paymentStatus '결제완료',
 *                                      deliveryStatus '배송대기' = 전부 mapOrderList의 pick() 기본값)
 *   GET /api/godomall/orders-admin  → HTTP 200 · sourceType api_proxy_real · live true · records 0건
 *   GET /api/godomall/orders-revenue?includeSynthetic=false
 *                                   → HTTP 200 · live true · 실주문 0건 · errorMessage 없음
 *
 *   즉 같은 상류 응답을 admin/revenue 경로는 "0건"으로 읽고, orders 경로만 "1건"을 만든다.
 *
 * 원인(코드 확인):
 *   resolveResource('orders') → fetchLiveRecords 는
 *     (1) ORDER_LIST_KEYS 에 실제 리스트 키 'order_data' 가 없고,
 *     (2) 0건 응답 phantom 가드 normalizeOrderData 를 통과하지 않으며,
 *     (3) mapOrderList 가 중첩(orderGoodsData/orderInfoData)을 읽지 않는다.
 *   → extractList 가 래퍼 객체를 "주문 1건"으로 오인하고, mapOrderList 가 모든 필드를
 *     기본값으로 채워 "0원짜리 결제완료 주문"을 만들어 낸다.
 *   2026-06-26 `00bfd51`(Empty Response Guard v1)이 admin/revenue 경로에만 가드를 넣고
 *   이 경로는 누락했다.
 *
 * fixture 는 문서화된 실제 응답 "구조"만 재현한 익명 자료다(실제 주문번호·이름·연락처·주소·
 * 금액 원문 미포함). 실데이터가 아니며 실데이터라고 부르지 않는다.
 *
 * 실행: node scripts/smoke-godo-order-mapping-01-v0.mjs   (RED 단계에서는 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
// emit 대상이 fast-xml-parser 를 import 하므로 저장소 node_modules 해석이 가능한 위치에 emit 한다.
// (os.tmpdir()에 두면 ERR_MODULE_NOT_FOUND) — .cache 하위라 gitignore 영향 없음.
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'godo-order-map-'));
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const emit = (file) =>
  execFileSync(
    process.execPath,
    [tscBin, path.join(REPO, file), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
     '--outDir', tmp, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022',
     '--skipLibCheck', '--types', 'node'],
    { stdio: 'pipe' }
  );

try {
  emit('api/_shared/godomallXmlParser.ts');
  emit('api/_shared/godomallMapper.ts');
  emit('api/_shared/godomallOrderNormalize.ts');
  emit('api/_shared/piiMaskGuard.ts');
  emit('api/_shared/godomallResource.ts'); // ORDER_LIST_KEYS / ADMIN_ORDER_LIST_KEYS 실제 상수
} catch (e) {
  console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

// D-1 보정: 하류(클라이언트 정규화·표시)가 미확인 수량/금액을 다시 만들어내지 않는지 검증.
try {
  execFileSync(
    process.execPath,
    [tscBin, path.join(REPO, 'src', 'utils', 'dataNormalizer.ts'), '--ignoreConfig',
     '--rootDir', path.join(REPO, 'src'), '--outDir', path.join(tmp, 'client'),
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe' }
  );
  // 확장자 없는 상대 import 를 Node ESM 이 해석할 수 있게 보정(다른 스모크와 동일 방식)
  const clientDir = path.join(tmp, 'client', 'utils');
  for (const f of readdirSync(clientDir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(clientDir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
} catch (e) {
  console.error('[smoke] client tsc emit failed:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const load = async (name) => import(pathToFileURL(path.join(tmp, name)).href);
const { extractList } = await load('godomallXmlParser.js');
const { mapOrderList, mapOrdersToAdmin } = await load('godomallMapper.js');
const { normalizeOrderData } = await load('godomallOrderNormalize.js');
const { maskRecordPii } = await load('piiMaskGuard.js');
const { ORDER_LIST_KEYS, ADMIN_ORDER_LIST_KEYS } = await load('godomallResource.js');
const clientNorm = await load(path.join('client', 'utils', 'dataNormalizer.js'));

// ── 익명 fixture (문서화된 실 응답 "구조"만 재현) ───────────────────────────
// docs/ORDER_SEARCH_REAL_RAW_VALIDATION_V1.md §3 실측 구조:
//   envelope code/msg · order_data 단일 객체 · orderGoodsData 단일 객체 · 수치 전부 문자열 ·
//   invoiceDt/deliveryDt 등은 라인 전용 · paymentDt 는 헤더+라인
const ANON = {
  orderNo: 'ANON-ORDER-0001',
  orderDate: '2026-07-01 10:20:30',
  goodsNm: '(익명 상품명)',
  goodsNo: '1000',
  goodsPrice: '10000',
  deliveryCharge: '2500',
  settlePrice: '12500'
};

// 주문 1건 응답 (미결제 o1 — 실측 표본과 같은 상태)
const rootWithOrder = {
  data: {
    return: {
      code: '000',
      msg: 'success',
      order_data: {
        orderNo: ANON.orderNo,
        orderDate: ANON.orderDate,
        orderStatus: 'o1',
        paymentDt: '',
        totalGoodsPrice: ANON.goodsPrice,
        totalDeliveryCharge: ANON.deliveryCharge,
        settlePrice: ANON.settlePrice,
        orderGoodsCnt: '1',
        orderInfoData: { orderName: '(익명)', receiverName: '(익명)', orderCellPhone: '', receiverAddress: '' },
        orderGoodsData: {
          goodsNo: ANON.goodsNo,
          goodsCd: 'ANON-CD',
          goodsNm: ANON.goodsNm,
          goodsCnt: '1',
          goodsPrice: ANON.goodsPrice,
          orderStatus: 'o1'
        }
      }
    }
  }
};

// 주문 0건 응답 (조회기간 내 주문 없음 — 오늘 Production 실측과 동일 상황)
const rootEmpty = { data: { return: { code: '000', msg: 'success' } } };

// 상류 금액이 실제로 0인 주문 (0원을 결함으로 단정하지 않기 위한 대조군)
const rootZeroAmount = {
  data: {
    return: {
      code: '000', msg: 'success',
      order_data: {
        orderNo: 'ANON-ORDER-0002',
        orderDate: '2026-07-02 09:00:00',
        orderStatus: 'o1',
        totalGoodsPrice: '0', totalDeliveryCharge: '0', settlePrice: '0',
        orderGoodsData: { goodsNo: '1001', goodsNm: '(익명 무료 상품)', goodsCnt: '1', goodsPrice: '0' }
      }
    }
  }
};

// D-1 ①: 유효 주문이지만 수량·금액 필드가 **하나도 없는** 응답
//   (주문번호는 있으므로 유효 주문 — 행은 만들되 수량 1·금액 0을 지어내면 안 된다)
const rootNoQtyAmount = {
  data: {
    return: {
      code: '000', msg: 'success',
      order_data: {
        orderNo: 'ANON-ORDER-0003',
        orderDate: '2026-07-03 11:00:00',
        orderStatus: 'o1',
        orderGoodsData: { goodsNo: '1002', goodsNm: '(익명 상품명)' }
      }
    }
  }
};

// D-1 ②: settlePrice 가 **명시적으로 '0'** 이고 상품금액·배송비는 0보다 큰 응답
//   (truthy/falsy 로 판단하면 0이 12,500으로 뒤바뀐다 — 필드 존재 근거로 판단해야 한다)
const rootExplicitZeroSettle = {
  data: {
    return: {
      code: '000', msg: 'success',
      order_data: {
        orderNo: 'ANON-ORDER-0004',
        orderDate: '2026-07-04 12:00:00',
        orderStatus: 'o1',
        settlePrice: '0',
        totalGoodsPrice: '10000',
        totalDeliveryCharge: '2500',
        orderGoodsData: { goodsNo: '1003', goodsNm: '(익명 상품명)', goodsCnt: '1', goodsPrice: '10000' }
      }
    }
  }
};

// 현재 orders 리소스 경로(= /api/godomall/orders, sync)와 admin 경로를 각각 재현
const viaOrdersResource = (root) => mapOrderList(extractList(root, ORDER_LIST_KEYS));
const viaAdmin = (root) => mapOrdersToAdmin(normalizeOrderData(extractList(root, ADMIN_ORDER_LIST_KEYS)));

// ── 검사 하네스 ─────────────────────────────────────────────────────────────
let basePass = 0, baseFail = 0, met = 0, unmet = 0;
const base = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [BASE] ${name}${detail ? `  — ${detail}` : ''}`);
  ok ? basePass++ : baseFail++;
};
const red = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'MET ' : 'UNMET'} [RED ] ${name}${detail ? `  — ${detail}` : ''}`);
  ok ? met++ : unmet++;
};
const isDate = (s) => /^\d{4}[-/.]\d{2}[-/.]\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(String(s || '').trim());

console.log('=== GODO-ORDER-MAPPING-01 — 주문 표시 필드 소실 (RED) ===');

// ── BASE: 현재도 옳게 동작하는 것(회귀 방지 · 판정 근거) ────────────────────
const adminOne = viaAdmin(rootWithOrder);
const adminEmpty = viaAdmin(rootEmpty);
base('B1. admin/revenue 경로: 주문 1건 fixture → 1건', adminOne.length === 1, `got ${adminOne.length}`);
base('B2. admin/revenue 경로: 0건 fixture → 0건 (phantom 가드 동작)', adminEmpty.length === 0, `got ${adminEmpty.length}`);
base('B3. normalizeOrderData: 메타 전용 래퍼 → 0건',
  normalizeOrderData({ code: '000', msg: 'success' }).length === 0);
base('B4. admin 경로는 상류 값을 보존 (주문번호·일자·상품명·금액)',
  adminOne[0]?.orderNo === ANON.orderNo && isDate(adminOne[0]?.orderDate) &&
  adminOne[0]?.productName === ANON.goodsNm && adminOne[0]?.totalAmount === Number(ANON.settlePrice),
  `orderNo=${adminOne[0]?.orderNo ? '있음' : '없음'} · date=${isDate(adminOne[0]?.orderDate)} · name=${adminOne[0]?.productName ? '있음' : '없음'} · amount=${adminOne[0]?.totalAmount}`);
base('B5. admin 경로: 미결제(o1) 상태 의미 보존 (결제완료로 위장 안 함)',
  adminOne[0]?.paymentStatus === '미결제' && adminOne[0]?.unpaid === true,
  `paymentStatus=${adminOne[0]?.paymentStatus}`);

// PII 마스킹이 비즈니스 필드를 지우는지 (마스킹 범위 결함 여부 판정)
const counter = { count: 0 };
const maskedBiz = maskRecordPii(
  { orderNo: ANON.orderNo, orderDate: ANON.orderDate, productName: ANON.goodsNm, amount: ANON.settlePrice,
    customerName: '(익명)', customerPhone: '', customerEmail: '', address: '' },
  counter
);
base('B6. PII 마스킹은 비즈니스 필드(주문번호·일자·상품명·금액)를 제거하지 않음',
  maskedBiz.orderNo === ANON.orderNo && maskedBiz.orderDate === ANON.orderDate &&
  maskedBiz.productName === ANON.goodsNm && maskedBiz.amount === ANON.settlePrice,
  '→ 마스킹은 이 결함의 원인이 아니다');
base('B7. 마스킹 카운트는 PII 키 존재 기준(빈 값도 계수) — 실 PII 존재 근거 아님',
  counter.count === 4, `maskedCount=${counter.count}`);

// 상류가 진짜 0원이면 0원 표시가 정상 (0원을 결함으로 단정하지 않는다)
const adminZero = viaAdmin(rootZeroAmount);
base('B8. 상류 금액이 실제 0이면 하류 0 유지 (0원 자체를 결함으로 보지 않음)',
  adminZero.length === 1 && adminZero[0].totalAmount === 0, `got ${adminZero[0]?.totalAmount}`);

// ── RED: 현재 결함 (GREEN 목표) ─────────────────────────────────────────────
red('R1. orders 리소스 리스트 키에 실제 리스트 키 order_data 포함',
  ORDER_LIST_KEYS.includes('order_data'),
  `ORDER_LIST_KEYS=[${ORDER_LIST_KEYS.join(',')}] · ADMIN=[order_data 포함]`);

const ordersEmpty = viaOrdersResource(rootEmpty);
red('R2. 0건 응답 → orders 리소스도 0건 (유령 주문 미생성)',
  ordersEmpty.length === 0, `got ${ordersEmpty.length}건`);
red('R3. 0건 응답에서 기본값 주문(단품·수량1·결제완료·배송대기·0원)을 만들지 않음',
  !(ordersEmpty.length === 1 && ordersEmpty[0].optionName === '단품' &&
    ordersEmpty[0].quantity === '1' && ordersEmpty[0].paymentStatus === '결제완료' &&
    ordersEmpty[0].deliveryStatus === '배송대기' && ordersEmpty[0].amount === '0'),
  ordersEmpty.length ? `phantom=${JSON.stringify(ordersEmpty[0])}` : '없음');

const ordersOne = viaOrdersResource(rootWithOrder);
red('R4. 상류에 주문번호가 있으면 orders 표시도 비어 있지 않음',
  ordersOne.length === 1 && String(ordersOne[0].orderNo || '').length > 0,
  `orderNo ${ordersOne[0]?.orderNo ? '있음' : '빈 문자열'}`);
red('R5. 상류에 주문일자가 있으면 날짜 형식으로 표시',
  isDate(ordersOne[0]?.orderDate), `orderDate ${ordersOne[0]?.orderDate ? '있음' : '빈 문자열'}`);
red('R6. 상류에 상품명이 있으면 상품명 표시 (중첩 orderGoodsData 포함)',
  ordersOne[0]?.productName === ANON.goodsNm, `productName ${ordersOne[0]?.productName ? '있음' : '빈 문자열'}`);
red('R7. 상류 결제금액이 있으면 같은 계약의 금액 표시 (settlePrice 기준)',
  ordersOne[0]?.amount === ANON.settlePrice, `amount=${ordersOne[0]?.amount}`);
red('R8. 미결제(o1) 주문을 결제완료로 표시하지 않음 (상태 의미 보존)',
  ordersOne[0]?.paymentStatus !== '결제완료', `paymentStatus=${ordersOne[0]?.paymentStatus}`);
red('R9. orders 경로와 admin 경로의 주문 건수 일치 (0건 fixture)',
  ordersEmpty.length === adminEmpty.length, `orders=${ordersEmpty.length} vs admin=${adminEmpty.length}`);
red('R10. orders 경로와 admin 경로의 주문 건수 일치 (1건 fixture)',
  ordersOne.length === adminOne.length, `orders=${ordersOne.length} vs admin=${adminOne.length}`);

const ordersZero = viaOrdersResource(rootZeroAmount);
red('R11. 상류 금액이 실제 0인 주문은 0원 유지하되 주문번호·상품명은 표시',
  ordersZero.length === 1 && ordersZero[0].amount === '0' &&
  String(ordersZero[0].orderNo || '').length > 0 && String(ordersZero[0].productName || '').length > 0,
  `amount=${ordersZero[0]?.amount} · orderNo=${ordersZero[0]?.orderNo ? '있음' : '빈 문자열'}`);

// ── D-1 보정 검사 (미확인 수량·금액 하류 재생성 + 명시된 settlePrice=0 보존) ──
console.log('');
const normalizeOne = (raw) => {
  const w = [], e = [], c = { count: 0 };
  return clientNorm.normalizeOrder(raw, 0, w, e, c);
};
const qtyText = (o) => clientNorm.displayOrderQuantity(o);
const amtText = (o) => clientNorm.displayOrderAmount(o);

// D1. 서버: 수량·금액 근거가 없으면 '' 보존
const srvNoQty = viaOrdersResource(rootNoQtyAmount);
red('D1. 서버: 수량·금액 근거 없으면 빈 값(미확인)으로 보존',
  srvNoQty.length === 1 && srvNoQty[0].quantity === '' && srvNoQty[0].amount === '',
  `quantity=${JSON.stringify(srvNoQty[0]?.quantity)} · amount=${JSON.stringify(srvNoQty[0]?.amount)}`);

// D2. 하류 정규화·표시: 1개·0원으로 재생성하지 않고 '미확인'
const cliNoQty = srvNoQty.length === 1 ? normalizeOne(srvNoQty[0]) : null;
red('D2. 하류: 근거 없는 수량 → 화면 "미확인" (1개 재생성 금지)',
  !!cliNoQty && qtyText(cliNoQty) === '미확인', `표시=${cliNoQty ? qtyText(cliNoQty) : 'n/a'}`);
red('D3. 하류: 근거 없는 금액 → 화면 "미확인" (0원 재생성 금지)',
  !!cliNoQty && amtText(cliNoQty) === '미확인', `표시=${cliNoQty ? amtText(cliNoQty) : 'n/a'}`);

// D4. 상류에 실제 수량 1 / 실제 금액 0이 있으면 그 값을 그대로 표시
const cliZero = normalizeOne(viaOrdersResource(rootZeroAmount)[0]);
red('D4. 상류 수량 1이 실재하면 화면 1 (미확인 아님)', qtyText(cliZero) === '1', `표시=${qtyText(cliZero)}`);
red('D5. 상류 금액이 실제 0이면 화면 0원 (미확인 아님)', amtText(cliZero) === '0원', `표시=${amtText(cliZero)}`);
red('D6. 알려진 0원과 미확인 금액이 화면에서 구별됨',
  !!cliNoQty && amtText(cliZero) !== amtText(cliNoQty),
  `0원="${amtText(cliZero)}" vs 미확인="${cliNoQty ? amtText(cliNoQty) : 'n/a'}"`);

// D7~D9. 명시된 settlePrice='0' 보존 (상품금액·배송비가 0보다 커도 0 유지)
const srvZeroSettle = viaOrdersResource(rootExplicitZeroSettle);
red('D7. 서버: 명시된 settlePrice=0 은 상품금액+배송비로 대체되지 않음',
  srvZeroSettle[0]?.amount === '0', `amount=${srvZeroSettle[0]?.amount}`);
const cliZeroSettle = srvZeroSettle.length === 1 ? normalizeOne(srvZeroSettle[0]) : null;
red('D8. 하류: 명시된 0원이 화면에서도 0원',
  !!cliZeroSettle && amtText(cliZeroSettle) === '0원', `표시=${cliZeroSettle ? amtText(cliZeroSettle) : 'n/a'}`);
const admZeroSettle = viaAdmin(rootExplicitZeroSettle);
red('D9. admin 경로도 명시된 settlePrice=0 보존 (필드 존재 근거로 판단)',
  admZeroSettle[0]?.totalAmount === 0, `totalAmount=${admZeroSettle[0]?.totalAmount}`);

// D10. settlePrice 필드가 아예 없으면 상품금액+배송비 fallback 유지(회귀 방지)
const admFallback = viaAdmin({
  data: { return: { code: '000', msg: 'success', order_data: {
    orderNo: 'ANON-ORDER-0005', orderDate: '2026-07-05 09:00:00', orderStatus: 'o1',
    totalGoodsPrice: '10000', totalDeliveryCharge: '2500',
    orderGoodsData: { goodsNo: '1004', goodsNm: '(익명 상품명)', goodsCnt: '1' } } } }
});
red('D10. settlePrice 필드 자체가 없으면 상품금액+배송비 fallback 유지',
  admFallback[0]?.totalAmount === 12500, `totalAmount=${admFallback[0]?.totalAmount}`);

rmSync(tmp, { recursive: true, force: true });

console.log('\n--- 요약 ---');
console.log(`[BASE] ${basePass} pass / ${baseFail} fail   (기준선 — fail>0이면 회귀)`);
console.log(`[RED ] ${met} met / ${unmet} unmet  (계약 목표 — GREEN 전이므로 unmet>0 정상)`);
if (baseFail === 0 && unmet === 0) {
  console.log('\n✓ 전부 충족 — GREEN 도달');
  process.exit(0);
}
console.log('\n✗ RED 상태 — GREEN 미착수 (제품 소스 변경 0)');
process.exit(1);
