// ────────────────────────────────────────────────────────────────────────────
// GODO-ORDER-MAPPING-01 (D-2) — LEGACY 저장 스냅샷의 유령 주문 청소 (일회성·멱등)
//
// 배경: D-1까지의 수정은 서버 매퍼가 근거 없는 주문 행을 **앞으로** 만들지 않게 닫았다.
//   그러나 과거 Production 동기화가 이미 localStorage(godo.data.activeSnapshot)에 저장해 둔
//   유령 주문은 그대로 남는다. hydration의 withCanonicalInquiries는 문의·출처만 보정하고
//   snapshot.orders는 그대로 복원하기 때문이다 → 사용자가 Sync를 누르기 전 첫 화면에 남는다.
//
// 이 모듈이 하는 일은 딱 하나다:
//   "과거 코드가 만든 **정확한 유령 서명**만 제거하고, 출처 건수·품질 수치를 그에 맞게 정정한다."
//
// 유령 서명 = 과거 mapOrderList(4266547 이전)가 상류 근거 없이 채우던 기본값 조합:
//   주문번호·주문일자·상품명이 **모두 없음**(신원 없음)  ← 실제 주문과 구분되는 핵심
//   + optionName '단품'|'기본옵션' + quantity 1 + amount 0
//   + paymentStatus '결제완료' + deliveryStatus '배송대기' + invoiceNo 없음
// 하나라도 어긋나면 실제 주문으로 보고 절대 건드리지 않는다(fail-closed).
//
// 금지(계약):
//   - amount === 0 이라는 이유만으로 제거 (진짜 0원 주문은 실재한다 — 신원 필드로 구분)
//   - 시험 데이터·CSV·수기 자료 청소 (실제 API 응답 유래 스냅샷만 대상)
//   - '연결 안 됨'/'시험 데이터'로 강등 (실제 성공 응답이므로 '실제 데이터 0건'을 유지한다)
//   - 특정 주문번호·날짜·개인정보·현재 건수(1)의 하드코딩
// ────────────────────────────────────────────────────────────────────────────

import type { DataQualityReport, OperationsDataSnapshot, StandardOrder } from '../types/dataConnector';

/** 과거 코드가 옵션 근거 없이 채우던 기본값(서버 '단품' / 클라이언트 정규화 '기본옵션'). */
const LEGACY_DEFAULT_OPTION_NAMES = ['단품', '기본옵션'];
/** 과거 코드가 상태 근거 없이 단정하던 기본값. */
const LEGACY_DEFAULT_PAYMENT_STATUS = '결제완료';
const LEGACY_DEFAULT_DELIVERY_STATUS = '배송대기';

/**
 * 청소 대상 스냅샷인가. 실제 API 응답에서 유래한 저장 자료만 대상으로 한다.
 * (demo/mock/synthetic = 시험 데이터, csv/json/manual = 사용자 업로드 → 건드리지 않는다.)
 */
const isApiRealSnapshot = (sourceType: string | undefined): boolean =>
  sourceType === 'api_proxy_real' || sourceType === 'api_proxy_sandbox';

const isBlank = (v: unknown): boolean => String(v ?? '').trim() === '';

/**
 * 과거 코드가 만든 유령 주문인가. **의미로 판정한다**: 신원(주문번호·일자·상품명)이 전혀 없는데
 * 수량·금액·상태만 기본값으로 채워져 있는 행 = 상류 근거가 하나도 없었다는 뜻.
 */
export const isLegacyGhostOrder = (o: StandardOrder | undefined | null): boolean => {
  if (!o || typeof o !== 'object') return false;
  // ① 신원 필드가 하나라도 있으면 실제 주문이다 (0원 주문 보호의 핵심).
  if (!isBlank(o.orderNo) || !isBlank(o.orderDate) || !isBlank(o.productName)) return false;
  // ② 나머지가 과거 기본값 조합과 정확히 일치할 때만 유령으로 본다.
  return (
    LEGACY_DEFAULT_OPTION_NAMES.includes(String(o.optionName ?? '').trim()) &&
    Number(o.quantity) === 1 &&
    Number(o.amount) === 0 &&
    String(o.paymentStatus ?? '').trim() === LEGACY_DEFAULT_PAYMENT_STATUS &&
    String(o.deliveryStatus ?? '').trim() === LEGACY_DEFAULT_DELIVERY_STATUS &&
    isBlank(o.invoiceNo)
  );
};

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

/**
 * 제거된 유령 행을 품질보고서에서도 함께 덜어낸다.
 * 유령은 신원 필드가 없으므로 정규화 당시 "필수값 누락 = 오류 행"으로 집계돼 있었다.
 * 따라서 총 행수·오류 행수를 함께 줄이고, 어떤 수치도 음수/총계 초과로 남지 않게 정합화한다.
 * (qualityScore·notes 같은 서술 항목은 추정으로 다시 쓰지 않는다 — 수치 정합만 맞춘다.)
 */
const reconcileQualityReport = (
  report: DataQualityReport | undefined,
  removedOrders: StandardOrder[]
): DataQualityReport | undefined => {
  if (!report || removedOrders.length === 0) return report;
  const removed = removedOrders.length;
  const removedRiskFlags = removedOrders.reduce((sum, o) => sum + (Array.isArray(o.riskFlags) ? o.riskFlags.length : 0), 0);

  const totalRows = Math.max(0, (report.totalRows ?? 0) - removed);
  const errorRows = clamp((report.errorRows ?? 0) - removed, 0, totalRows);
  const warningRows = clamp(report.warningRows ?? 0, 0, totalRows);
  const duplicateRows = clamp(report.duplicateRows ?? 0, 0, totalRows);
  const validRows = clamp(report.validRows ?? 0, 0, totalRows - errorRows);

  return {
    ...report,
    totalRows,
    validRows,
    warningRows,
    errorRows,
    duplicateRows,
    // 제거된 행에 대한 지적은 함께 덜어낸다(오류 행수와 개수를 맞춘다).
    missingRequiredFields: (report.missingRequiredFields ?? []).slice(0, errorRows),
    privacyMaskedCount: Math.max(0, (report.privacyMaskedCount ?? 0) - removed),
    riskFlagCount: Math.max(0, (report.riskFlagCount ?? 0) - removedRiskFlags)
  };
};

export interface LegacyGhostOrderMigrationResult {
  /** 청소된 스냅샷. 제거 대상이 없으면 입력을 그대로 돌려준다. */
  snapshot: OperationsDataSnapshot;
  /** 제거된 유령 주문 수(0이면 무변경). */
  removed: number;
}

/**
 * 저장된 구버전 스냅샷에서 과거 유령 주문만 제거한다. 순수 함수 — 입력을 변형하지 않는다.
 * 멱등: 이미 청소된 스냅샷을 다시 넣어도 removed=0 이고 결과가 동일하다.
 *
 * 출처(resourceProvenance.orders)는 **신분을 바꾸지 않고 건수만** 실제 남은 수로 정정한다.
 *   실제 성공 응답이므로 '실제 데이터'를 유지해야 한다 → 화면은 '연결 안 됨'이 아니라 '실제 데이터 0건'.
 */
export function migrateLegacyGhostOrders(
  snapshot: OperationsDataSnapshot | null | undefined
): LegacyGhostOrderMigrationResult {
  if (!snapshot || !Array.isArray(snapshot.orders) || snapshot.orders.length === 0) {
    return { snapshot: snapshot as OperationsDataSnapshot, removed: 0 };
  }
  if (!isApiRealSnapshot(snapshot.sourceType)) {
    return { snapshot, removed: 0 }; // 시험 데이터·CSV·수기 자료는 대상 아님
  }

  const kept = snapshot.orders.filter((o) => !isLegacyGhostOrder(o));
  const removedOrders = snapshot.orders.filter((o) => isLegacyGhostOrder(o));
  if (removedOrders.length === 0) return { snapshot, removed: 0 }; // 멱등: 무변경

  const next: OperationsDataSnapshot = { ...snapshot, orders: kept };

  const prevOrdersProvenance = snapshot.resourceProvenance?.orders;
  if (prevOrdersProvenance) {
    // 신분(provenance/userLabel/status)은 그대로, 건수만 실제 남은 수로 정정.
    next.resourceProvenance = {
      ...snapshot.resourceProvenance,
      orders: { ...prevOrdersProvenance, count: kept.length }
    };
  }

  const qualityReport = reconcileQualityReport(snapshot.qualityReport, removedOrders);
  if (qualityReport) next.qualityReport = qualityReport;

  return { snapshot: next, removed: removedOrders.length };
}
