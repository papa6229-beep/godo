// CS Contact Contract — 고객응대용 데이터 계약 (타입 초안, Commerce Data Contract v0)
//
// 목적: 분석용(Analytics) 계약(RevenueOrder 가산 필드)과 분리된 "CS 응대용" 계약을 정의한다.
//   - Analytics(상품팀/마케팅/총괄): memberKey·매출·결제수단·claimSummary 등 가명/집계만. PII 없음.
//   - CS Contact(CS팀/고객응대 시뮬레이션): 이름/연락처/주소/문의본문 등 contact 정보.
//
// ⚠️ 이 파일은 **타입/정책 초안만** 정의한다(v0). 실제 fake PII 생성은 다음 단계
//    Synthetic Commerce Universe v1에서 구현한다.
//
// PII 정책 (핵심):
//   - synthetic mode: fake PII를 생성 가능(CS 응대 훈련용). 단 반드시 fake 표시.
//   - real mode: 실제 PII를 facts/log/docs/smoke에 박제 금지. CS팀이 응대에 필요한 경우만 제한적 사용.
//   - real PII와 fake PII를 구분 없이 섞지 않는다. fake를 real처럼 표시하지 않는다.

// 모든 contact 레코드가 반드시 달고 다니는 출처/위조 표식.
export type PiiOrigin = {
  isSynthetic: boolean; // synthetic universe 산출물인가
  isFakePii: boolean; // PII가 가짜(생성)인가
  piiType: 'fake' | 'real';
  sourceType: 'real' | 'synthetic' | 'mock';
  syntheticProfile?: 'commerce_universe_v1'; // 생성 프로파일(있을 때)
};

// CS 응대용 고객/주문 contact 레코드 (synthetic mode에서만 PII 값이 채워짐)
export type CsContactRecord = {
  // 분석 계약과 조인하는 가명 키 (PII 아님)
  memberKey?: string;
  orderNo?: string;
  // ── contact PII (synthetic=fake 값, real=제한적 접근) ──
  customerName?: string;
  receiverName?: string;
  phone?: string;
  email?: string;
  address?: string;
  deliveryMemo?: string;
  refundBank?: string;
  refundAccount?: string;
  // ── CS 본문 (문의/불만/리뷰) ──
  inquiryText?: string;
  complaintText?: string;
  // ── 출처/위조 표식 (필수) ──
  origin: PiiOrigin;
};

// synthetic 생성기가 달아야 하는 표준 표식 (v1 생성 시 사용 예정).
export const SYNTHETIC_FAKE_PII_ORIGIN: PiiOrigin = {
  isSynthetic: true,
  isFakePii: true,
  piiType: 'fake',
  sourceType: 'synthetic',
  syntheticProfile: 'commerce_universe_v1'
};

// 분석 계약으로 넘길 때 contact PII를 제거하고 가명/집계만 남기는 화이트리스트.
// (Analytics Contract로 전달 시 이 키만 통과시킨다 — v1에서 enforcer로 사용 예정)
export const ANALYTICS_ALLOWED_CONTACT_KEYS = ['memberKey', 'orderNo'] as const;

// CS Contact에서만 허용되는 PII 키(분석 계약엔 절대 싣지 않는다).
export const CS_ONLY_PII_KEYS = [
  'customerName',
  'receiverName',
  'phone',
  'email',
  'address',
  'deliveryMemo',
  'refundBank',
  'refundAccount',
  'inquiryText',
  'complaintText'
] as const;
