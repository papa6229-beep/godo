// CS Customer Management Profile Hub v0 — 고객 단위 회원상세+이력 허브(순수 함수).
//
// 데이터: orders(memberKey) 기준 집계, inquiries/reviews는 orderNo→memberKey로 연결,
//   contacts(fake PII)는 CS UI 경로일 때만 basic 채움, completed(세션 완료 이력)는 문의/리뷰에 병합.
//
// 원칙: PII(name/phone/email/address)는 contacts가 주어진 CS UI 경로에서만. AI/타부서/docs/smoke 금지.
//   실제 WRITE 없음 — writeTargets는 구조만 준비(member_update/member_memo/blacklist_flag).

import type { GroundingOrder } from './csInquiryOrderGrounding';
import type { CsRiskLevel } from './csDraftComposer';
import { csTopicKo, type CsDashInquiry, type CsDashReview, type CsDashContact } from './csTeamDashboardFacts';
import type { CsCompletedWorkItem } from './csWorkCompletionState';

export interface CsProfileOrder {
  orderNo: string;
  orderDate?: string;
  amount?: number;
  goodsAmount?: number;
  deliveryCharge?: number;
  paymentState?: string;
  deliveryState?: string;
  productNames: string[];
  itemCount?: number;
  hasClaim?: boolean;
  claimTypes?: string[];
  items?: Array<{ productName?: string; optionName?: string; quantity?: number; amount?: number }>;
}
export interface CsProfileInquiry {
  inquiryId: string;
  title?: string;
  type?: string;
  productName?: string;
  orderNo?: string;
  createdAt?: string;
  status?: string;
  result?: string;
  bodyText?: string;
  answerText?: string;
  assignee?: string;
  completedAt?: string;
  completionMethod?: string;
  isRepeat?: boolean;
  writeStatus?: string;
}
export interface CsProfileReview {
  reviewId: string;
  productName?: string;
  rating?: number;
  sentiment?: string;
  bodyText?: string;
  replyText?: string;
  replyStatus?: string;
  assignee?: string;
  createdAt?: string;
  completedAt?: string;
}
export interface CsProfileClaim {
  claimId: string;
  type?: string;
  orderNo?: string;
  productName?: string;
  createdAt?: string;
  status?: string;
  result?: string;
  assignee?: string;
  isRepeat?: boolean;
}
export interface CsWriteTargetMember {
  platform: 'godomall';
  targetType: 'member_update' | 'member_memo' | 'blacklist_flag';
  memberId: string;
}
export interface CsCustomerProfileHubItem {
  customerId: string;
  memberKey: string;
  isSynthetic?: boolean;
  basic: {
    memberType?: string; memberId?: string; name?: string; nickname?: string; phone?: string; mobile?: string;
    email?: string; address?: string; birthDate?: string; gender?: string; memberGrade?: string; joinDate?: string;
    joinPath?: string; lastLoginAt?: string; loginCount?: number; smsOptIn?: boolean; emailOptIn?: boolean;
    accessAllowed?: boolean; deliveryMethod?: string; rewardAmount?: number; pointAmount?: number;
  };
  summary: {
    orderCount: number; totalOrderAmount: number; recentYearOrderAmount?: number; inquiryCount: number;
    reviewCount: number; claimCount: number; refundCancelCount: number; riskLevel: CsRiskLevel; lastActivityAt?: string;
  };
  tags: string[];
  orders: CsProfileOrder[];
  inquiries: CsProfileInquiry[];
  reviews: CsProfileReview[];
  claims: CsProfileClaim[];
  management: { isCaution?: boolean; isBlacklistCandidate?: boolean; memo?: string; writeStatus: 'local_only'; writeTargets: { memberUpdate: CsWriteTargetMember; memberMemo: CsWriteTargetMember; blacklistFlag: CsWriteTargetMember } };
}

const isLowReview = (r: CsDashReview): boolean => (typeof r.rating === 'number' && r.rating <= 2) || /negative|부정/i.test(r.sentiment || '');
const isAnswered = (s?: string): boolean => /^answered$/i.test((s || '').trim()) || /답변\s*완료|처리\s*완료|resolved|closed|done/i.test(s || '');
const prod = (goodsNo: string | undefined, names?: Record<string, string>): string => (goodsNo && names?.[goodsNo]) || goodsNo || '상품미상';
const ageDays = (d: string | undefined, nowMs: number): number => { const t = Date.parse((d || '').replace(' ', 'T')); return Number.isNaN(t) ? Infinity : Math.max(0, (nowMs - t) / 86400000); };
const CLAIM_KO: Record<string, string> = { refund: '환불', cancel: '취소', return: '반품', exchange: '교환' };

export function buildCsCustomerProfileHub(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  contacts?: CsDashContact[];
  completed?: CsCompletedWorkItem[];
  goodsNames?: Record<string, string>;
  nowMs?: number;
  limit?: number;
}): { count: number; byTag: { repeatInquiry: number; repeatClaim: number; lowReviewRepeat: number; highValue: number; watch: number; blacklist: number }; items: CsCustomerProfileHubItem[] } {
  const orders = params.orders || [];
  const names = params.goodsNames;
  const nowMs = params.nowMs ?? Date.now();
  const HIGH_VALUE = 100000;

  const mkByOrder = new Map<string, string>();
  for (const o of orders) if (o.orderNo && o.memberKey) mkByOrder.set(o.orderNo, o.memberKey);
  const contactByKey = new Map<string, CsDashContact>();
  for (const c of params.contacts || []) contactByKey.set(c.memberKey, c);

  // completed: originalId 기준 lookup
  const completedById = new Map<string, CsCompletedWorkItem>();
  for (const c of params.completed || []) completedById.set(c.originalId, c);

  type Agg = { memberKey: string; orders: GroundingOrder[]; inquiries: CsDashInquiry[]; reviews: CsDashReview[] };
  const map = new Map<string, Agg>();
  const get = (mk: string): Agg => { let a = map.get(mk); if (!a) { a = { memberKey: mk, orders: [], inquiries: [], reviews: [] }; map.set(mk, a); } return a; };
  for (const o of orders) if (o.memberKey) get(o.memberKey).orders.push(o);
  for (const q of params.inquiries || []) { const mk = q.orderNo ? mkByOrder.get(q.orderNo) : undefined; if (mk) get(mk).inquiries.push(q); }
  for (const r of params.reviews || []) { const mk = r.orderNo ? mkByOrder.get(r.orderNo) : undefined; if (mk) get(mk).reviews.push(r); }

  const items: CsCustomerProfileHubItem[] = [...map.values()].map((a) => {
    const paid = a.orders.filter((o) => o.paid);
    const totalOrderAmount = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const recentYearOrderAmount = paid.filter((o) => ageDays(o.orderDate, nowMs) <= 365).reduce((s, o) => s + (o.totalAmount || 0), 0);
    const claimOrders = a.orders.filter((o) => o.claim?.hasClaim || o.canceled);
    const claimCount = claimOrders.length;
    const refundCancelCount = a.orders.filter((o) => (o.claim?.claimTypes || []).some((t) => /refund|cancel|return/.test(t)) || o.canceled).length;
    const lowReviewCount = a.reviews.filter(isLowReview).length;

    const tags: string[] = [];
    if (a.inquiries.length >= 2) tags.push('반복문의');
    if (refundCancelCount >= 2) tags.push('반복 환불·취소');
    if (lowReviewCount >= 2) tags.push('저평점 반복');
    if (totalOrderAmount >= HIGH_VALUE) tags.push('고액 고객');
    const riskLevel: CsRiskLevel = claimCount >= 2 || refundCancelCount >= 2 ? 'high' : claimCount >= 1 || a.inquiries.length >= 2 ? 'medium' : 'low';
    if (riskLevel !== 'low') tags.push('주의 고객');
    if (riskLevel === 'high' && refundCancelCount >= 2) tags.push('블랙리스트 후보');

    const c = contactByKey.get(a.memberKey);
    const hasPii = !!(params.contacts && c);
    const lastActivityAt = [...a.orders.map((o) => o.orderDate || ''), ...a.inquiries.map((q) => q.createdAt || ''), ...a.reviews.map((r) => r.createdAt || '')].sort().pop() || undefined;

    const ordersOut: CsProfileOrder[] = [...a.orders].sort((x, y) => (y.orderDate || '').localeCompare(x.orderDate || '')).map((o) => ({
      orderNo: o.orderNo, orderDate: o.orderDate, amount: o.totalAmount, goodsAmount: o.productRevenueByLines, deliveryCharge: o.deliveryFee,
      paymentState: o.paid ? '결제완료' : '미결제/미완료', deliveryState: o.canceled ? '취소' : o.confirmed ? '구매확정' : '배송정보 미연동',
      productNames: (o.lines || []).map((l) => l.goodsName || prod(l.goodsNo, names)).filter(Boolean) as string[], itemCount: (o.lines || []).length,
      hasClaim: !!o.claim?.hasClaim, ...(o.claim?.claimTypes?.length ? { claimTypes: o.claim.claimTypes } : {}),
      items: (o.lines || []).map((l) => ({ productName: l.goodsName || prod(l.goodsNo, names), quantity: l.quantity, amount: l.lineRevenue }))
    }));

    const inqRepeat = a.inquiries.length >= 2;
    const inquiriesOut: CsProfileInquiry[] = [...a.inquiries].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')).map((q) => {
      const done = q.inquiryId ? completedById.get(q.inquiryId) : undefined;
      return {
        inquiryId: q.inquiryId || '', title: q.title || `${csTopicKo(q.topic)} 문의`, type: csTopicKo(q.topic), productName: prod(q.goodsNo, names),
        ...(q.orderNo ? { orderNo: q.orderNo } : {}), createdAt: q.createdAt, status: done ? '처리 완료' : (isAnswered(q.status) ? '답변완료' : (q.status || '미답변')),
        result: done ? '처리 완료' : (isAnswered(q.status) ? '답변 완료' : undefined), bodyText: q.excerpt,
        ...(done ? { answerText: done.answerText, assignee: done.assignee, completedAt: done.completedAt, completionMethod: done.completionMethod, writeStatus: done.writeStatus } : {}),
        isRepeat: inqRepeat
      };
    });

    const reviewsOut: CsProfileReview[] = [...a.reviews].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')).map((r) => {
      const done = r.reviewId ? completedById.get(r.reviewId) : undefined;
      return {
        reviewId: r.reviewId || '', productName: prod(r.goodsNo, names), rating: r.rating, sentiment: r.sentiment, bodyText: r.excerpt,
        ...(done ? { replyText: done.answerText, replyStatus: '처리 완료', assignee: done.assignee, completedAt: done.completedAt } : { replyStatus: '답글 미연동' }),
        createdAt: r.createdAt
      };
    });

    const claimsOut: CsProfileClaim[] = claimOrders.map((o) => {
      const types = (o.claim?.claimTypes || []).map((t) => CLAIM_KO[t] || t);
      if (o.canceled && !types.includes('취소')) types.push('취소');
      return {
        claimId: `${o.orderNo}-${types[0] || 'claim'}`, type: types.join(', ') || '클레임', orderNo: o.orderNo,
        productName: (o.lines || []).map((l) => l.goodsName || prod(l.goodsNo, names))[0], createdAt: o.orderDate,
        status: '완료 여부 미확정', isRepeat: refundCancelCount >= 2
      };
    });

    const item: CsCustomerProfileHubItem = {
      customerId: c?.customerId || a.memberKey,
      memberKey: a.memberKey,
      basic: {
        memberType: '회원', memberId: c?.customerId || a.memberKey,
        ...(hasPii ? { name: c?.customerName, phone: c?.phone, mobile: c?.phone, email: c?.email, address: c?.address } : {})
        // nickname/birthDate/gender/memberGrade/joinDate/joinPath/lastLogin/loginCount/sms/mail/access/delivery/reward/point → 미연동(UI placeholder)
      },
      summary: { orderCount: a.orders.length, totalOrderAmount, recentYearOrderAmount, inquiryCount: a.inquiries.length, reviewCount: a.reviews.length, claimCount, refundCancelCount, riskLevel, ...(lastActivityAt ? { lastActivityAt } : {}) },
      tags,
      orders: ordersOut,
      inquiries: inquiriesOut,
      reviews: reviewsOut,
      claims: claimsOut,
      management: {
        isCaution: riskLevel !== 'low', isBlacklistCandidate: tags.includes('블랙리스트 후보'), writeStatus: 'local_only',
        writeTargets: {
          memberUpdate: { platform: 'godomall', targetType: 'member_update', memberId: c?.customerId || a.memberKey },
          memberMemo: { platform: 'godomall', targetType: 'member_memo', memberId: c?.customerId || a.memberKey },
          blacklistFlag: { platform: 'godomall', targetType: 'blacklist_flag', memberId: c?.customerId || a.memberKey }
        }
      }
    };
    if (hasPii) item.isSynthetic = c?.origin?.isFakePii === true || c?.origin?.piiType === 'fake' || true;
    return item;
  });

  const rank = (r: CsRiskLevel): number => (r === 'high' ? 0 : r === 'medium' ? 1 : 2);
  items.sort((x, y) => rank(x.summary.riskLevel) - rank(y.summary.riskLevel) || (y.summary.lastActivityAt || '').localeCompare(x.summary.lastActivityAt || ''));

  const byTag = {
    repeatInquiry: items.filter((i) => i.tags.includes('반복문의')).length,
    repeatClaim: items.filter((i) => i.tags.includes('반복 환불·취소')).length,
    lowReviewRepeat: items.filter((i) => i.tags.includes('저평점 반복')).length,
    highValue: items.filter((i) => i.tags.includes('고액 고객')).length,
    watch: items.filter((i) => i.tags.includes('주의 고객')).length,
    blacklist: items.filter((i) => i.tags.includes('블랙리스트 후보')).length
  };
  return { count: items.length, byTag, items: items.slice(0, params.limit ?? 100) };
}

// 검색 필터(고객명/ID/연락처/이메일/주문번호/상품명)
export function searchCustomerProfiles(items: CsCustomerProfileHubItem[], q: string): CsCustomerProfileHubItem[] {
  const s = (q || '').trim().toLowerCase();
  if (!s) return items;
  return items.filter((it) =>
    [it.basic.name, it.basic.memberId, it.customerId, it.basic.phone, it.basic.email].some((v) => (v || '').toLowerCase().includes(s)) ||
    it.orders.some((o) => o.orderNo.toLowerCase().includes(s) || (o.productNames || []).some((p) => p.toLowerCase().includes(s)))
  );
}
