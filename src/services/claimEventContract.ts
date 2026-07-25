// ────────────────────────────────────────────────────────────────────────────
// Claim Event Contract — 취소·반품·환불 단일 분류기 (Single Source of Truth) · D-1.2
//
// 배경(D-1.2 RED 진단): 고도몰 RAW 에는 취소(c*)·반품(b1~b4)·환불(r1~r3)·교환(e*) 상태와
//   claimData(handleMode·handleCompleteFl·handleDt·refundPrice)가 다 있으나, 파생/소비 계층이
//   이를 잃고 claimTypes 문자열을 각 화면·채팅에서 제각각 정규식으로 판정해 왔다:
//   취소가 반품 건수에 섞이고, 요청금액(claimAmount)이 완료 환불금액처럼 합산됐다.
//
// 이 모듈은 **원본 근거를 보존**한 뒤, 확정 업무 기준으로 사건을 단일 분류한다.
//   취소 = 발송 전 주문 중단(반품 건수에 미포함).
//   반품 = 발송 후 고객 반품 요청 "접수" 사건(접수 시점부터 1건). 환불 완료 아님.
//   환불 = 실제 돈이 반환된 금융 결과. 완료 근거가 있을 때만 완료금액으로 집계.
//   교환 = 별개 사건(환불 아님).
//
// ⚠️ 실제 고도몰 미연동(현재 전부 synthetic). handleCompleteFl/상태코드의 실측 의미는
//    GODO-CLAIM-STATS-PARITY-01 에서 확정한다. 본 모듈은 그 전까지의 보수적·명시적 계약이며,
//    RAW 에 없는 '검수 중'·'환불 거절' 등을 실측인 것처럼 만들지 않는다(내부 fixture 시험만).
// ────────────────────────────────────────────────────────────────────────────

/** 원본 사건 종류(단일 분류). refund_only = 반품 없이 환불만(부분 환불·결제취소 환불 등). */
export type ClaimEventKind = 'cancel' | 'return' | 'exchange' | 'refund_only' | 'unknown';
/** 반품 처리 단계 — RAW b1~b4 가 증명하는 것만. 그 외 unknown(임의 단계 창작 금지). */
export type ReturnStage = 'received' | 'in_transit' | 'on_hold' | 'collected' | 'unknown';
/** 환불 상태 — none(환불 없음)·pending(대기/미완료)·completed(완료)·unknown(미확인). */
export type RefundStatus = 'none' | 'pending' | 'completed' | 'unknown';

/** 정규화 전 보존된 원본 근거(godomallRevenue.deriveClaimSummary 가 채운다). */
export interface ClaimEvidence {
  hasClaim?: boolean;
  /** 호환 태그(과거 cancelDt 강제 cancel 포함 — 중복 가능). 덮어쓰지 않고 보존. */
  claimTypes?: string[];
  /** RAW claimData.handleMode 코드(c/r/b/e/z). */
  handleModes?: string[];
  /** RAW claimData.handleCompleteFl. 스펙 필드명 "처리완료여부" — 클레임 처리 완료일 뿐,
   *  금전 환불 완료 근거로 쓰지 않는다(D-1.2.1). 원본 보존용. */
  handleCompleteFl?: string;
  /** RAW claimData.handleDt "처리완료일자"(있을 때). 환불 완료 시각 근거 아님(원본 보존용). */
  handleDt?: string;
  /** RAW 라인 orderStatus 코드(c4/b4/r3/e5 …). r3=환불완료(명시 상태코드). */
  rawStatuses?: string[];
  /** 요청/예상 환불금액(=refundPrice/claimAmount 합). 실제 완료금액 아님. */
  requestedRefundAmount?: number;
  /** D-1.2.1: 금전 환불 완료 시각임이 **확인된** 별도 필드가 있을 때만 채운다(현재 RAW 미제공 →
   *  대개 undefined). handleDt(처리완료일자)를 여기에 넣지 않는다. 실측 확정=GODO-CLAIM-STATS-01. */
  refundCompletedAt?: string;
}

/** 주문 맥락 — 분류에 영향(결제 여부). canceled(cancelDt)는 기준선 전용이라 분류에 쓰지 않는다. */
export interface OrderContextForClaim {
  paid?: boolean;
  shipped?: boolean;
}

export interface ClaimEvent {
  eventKind: ClaimEventKind;
  returnStage: ReturnStage;
  refundStatus: RefundStatus;
  /** 요청/예상 환불금액(완료 아님). */
  requestedRefundAmount: number;
  /** 실제 환불 완료금액 — refundStatus==='completed' 일 때만 >0. 그 외 0(미집계). */
  completedRefundAmount: number;
  /** 완료 여부를 확정 근거로 아는가(unknown 이면 false — 0원으로 단정 금지). */
  refundCompletedKnown: boolean;
  refundedAt?: string;
  /** 쉬운 사용자 문구: 취소 / 반품 접수 / 환불 대기 / 환불 완료 / 교환 / 확인 필요. */
  userLabel: string;
}

const lc = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const firstChar = (s: unknown): string => lc(s).charAt(0);

// RAW 상태코드 그룹(godomallOrderCodes 규약과 동일 prefix): c=취소, b=반품, r=환불, e/z=교환.
const hasStatusGroup = (statuses: string[] | undefined, group: string): boolean =>
  (statuses ?? []).some((s) => firstChar(s) === group);
const REFUND_COMPLETE_CODE = 'r3'; // 환불완료(공식 스펙)

/**
 * 취소·반품·환불·교환 단일 분류. 순수 함수.
 *   eventKind 우선순위(과거 cancelDt 호환 cancel 태그 해소): return > refund_only > exchange > cancel.
 *   근거가 전혀 없거나 알 수 없으면 unknown(임의 집계 0).
 */
export function classifyClaimEvent(
  ev: ClaimEvidence | null | undefined,
  ctx: OrderContextForClaim = {}
): ClaimEvent {
  const modes = (ev?.handleModes ?? []).map(lc);
  const types = (ev?.claimTypes ?? []).map(lc);
  const statuses = ev?.rawStatuses ?? [];
  const requested = typeof ev?.requestedRefundAmount === 'number' && Number.isFinite(ev.requestedRefundAmount) && ev.requestedRefundAmount > 0
    ? ev.requestedRefundAmount : 0;

  const hasReturn = modes.includes('b') || hasStatusGroup(statuses, 'b') || types.includes('return');
  const hasRefund = modes.includes('r') || hasStatusGroup(statuses, 'r') || types.includes('refund');
  const hasExchange = modes.includes('e') || modes.includes('z') || hasStatusGroup(statuses, 'e') || types.includes('exchange');
  const hasCancel = modes.includes('c') || hasStatusGroup(statuses, 'c') || types.includes('cancel');

  // 우선순위로 단일 사건 확정 — 동일 사건을 취소·반품 양쪽에 중복 집계하지 않는다.
  let eventKind: ClaimEventKind;
  if (hasReturn) eventKind = 'return';
  else if (hasRefund) eventKind = 'refund_only';
  else if (hasExchange) eventKind = 'exchange';
  else if (hasCancel) eventKind = 'cancel';
  else eventKind = 'unknown'; // 근거 부족/충돌·미해석 → 임의로 가장 가까운 상태에 넣지 않는다

  // 반품 단계 — RAW b1~b4 가 증명하는 것만.
  let returnStage: ReturnStage = 'unknown';
  if (eventKind === 'return') {
    const b = statuses.map(lc).find((s) => s.charAt(0) === 'b');
    returnStage = b === 'b1' ? 'received' : b === 'b2' ? 'in_transit' : b === 'b3' ? 'on_hold' : b === 'b4' ? 'collected' : 'unknown';
  }

  // 환불 상태 — 완료 근거가 충분할 때만 completed. 모르면 0 단정 금지(unknown/pending).
  const paid = ctx.paid !== false; // 명시적으로 false 일 때만 미결제
  const completeFl = ev?.handleCompleteFl === undefined ? undefined : lc(ev.handleCompleteFl);
  const hasCompleteCode = (statuses).map(lc).includes(REFUND_COMPLETE_CODE);
  let refundStatus: RefundStatus;
  if (eventKind === 'unknown' || eventKind === 'exchange') {
    // 교환은 환불 사건이 아니다(차액은 별도·미모델). 미확인은 unknown.
    refundStatus = eventKind === 'exchange' ? 'none' : 'unknown';
  } else if (!paid) {
    refundStatus = 'none'; // 미결제 취소 등 → 환불 없음
  } else if (eventKind === 'return') {
    // 반품 접수/회수 완료(b4)는 "환불 완료"가 아니다. 명시적 환불완료(r3)만 완료로 인정.
    // 그 외는 환불 대기(완료 근거 미확정 — GODO-CLAIM-STATS-01 에서 실측 확정).
    refundStatus = hasCompleteCode ? 'completed' : 'pending';
  } else {
    // cancel · refund_only (결제됨): D-1.2.1 fail-closed —
    //   금전 환불 완료는 **명시 상태코드(r3)** 만 근거로 인정한다.
    //   handleCompleteFl='y' 는 "처리완료"일 뿐 금전 환불완료 근거가 아니므로 완료로 보지 않는다.
    //   handleCompleteFl='n'(환불접수) → 대기. 그 외(미확인·'y'만) → unknown(0원 단정 금지).
    if (hasCompleteCode) refundStatus = 'completed';
    else if (completeFl === 'n') refundStatus = 'pending';
    else refundStatus = 'unknown';
  }

  const completedRefundAmount = refundStatus === 'completed' ? requested : 0;
  const refundCompletedKnown = refundStatus === 'completed' || refundStatus === 'none';
  // D-1.2.1: refundedAt 은 "환불 완료 시각이 확인된 별도 필드"(refundCompletedAt)가 있을 때만.
  //   handleDt(처리완료일자)는 근거 아님 → 넣지 않는다. 시각 근거 없으면 완료여도 비워 둔다.
  const refundedAt = refundStatus === 'completed' && ev?.refundCompletedAt ? ev.refundCompletedAt : undefined;

  return {
    eventKind,
    returnStage,
    refundStatus,
    requestedRefundAmount: requested,
    completedRefundAmount,
    refundCompletedKnown,
    ...(refundedAt ? { refundedAt } : {}),
    userLabel: userLabelOfClaim(eventKind, refundStatus)
  };
}

/** 쉬운 사용자 문구(내부 코드 미노출). */
export function userLabelOfClaim(eventKind: ClaimEventKind, refundStatus: RefundStatus): string {
  if (eventKind === 'unknown') return '확인 필요';
  if (eventKind === 'exchange') return '교환';
  if (refundStatus === 'completed') return '환불 완료';
  if (eventKind === 'return') return '반품 접수';
  if (eventKind === 'cancel') return refundStatus === 'pending' ? '취소(환불 대기)' : '취소';
  if (refundStatus === 'pending') return '환불 대기';
  return '확인 필요';
}
