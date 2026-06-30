import type {
  MarketingBehaviorEvent,
  MarketingBehaviorEventName,
  MarketingTrafficSource
} from './marketingBehaviorTypes';
import type { MarketingBehaviorTransport } from './marketingBehaviorTrackerSendAdapter';
import {
  MARKETING_BEHAVIOR_SOURCE_RULES,
  MARKETING_BEHAVIOR_ALLOWED_FIELDS,
  MARKETING_BEHAVIOR_DATA_ATTRIBUTES
} from './marketingBehaviorCollectionPlan';

// ────────────────────────────────────────────────────────────────────────────
// Marketing Behavior Tracker — Prototype v0 (브라우저용 "payload 생성 검증" 유틸)
//
// 목적: 나중에 고도몰 쇼핑몰에 삽입할 행동 추적 스크립트의 prototype.
//   이번 단계는 "수집"이 아니라 "수집 payload 생성 검증"이다.
//   현재 페이지/유입/UTM/data-godo-track 클릭에서 MarketingBehaviorEvent payload를 만들어
//   debug buffer/console로만 확인한다. 실제 전송은 다음 Collection Endpoint v0에서.
//
// ★ 절대 안 함: 서버 전송(네트워크 호출)·외부 분석도구 호출·API route 호출·외부 스크립트 import·WRITE.
//   실데이터 fake 생성·PII 수집도 안 함. (전송/외부도구 부재는 smoke가 토큰 단위로 강제)
// ★ SSR/build 안전: window/document/location은 함수 내부에서만, typeof 가드로 접근.
//   유입/페이지 읽기 함수는 입력 주입(href/referrer/pathname)을 받아 Node에서도 테스트 가능.
// ★ 계약 단일 소스: source 정규화/data attribute/allowlist는 marketingBehaviorCollectionPlan 상수 사용.
// ────────────────────────────────────────────────────────────────────────────

const DEBUG_KEY = '__GODO_MARKETING_BEHAVIOR_DEBUG__';

declare global {
  interface Window {
    __GODO_MARKETING_BEHAVIOR_DEBUG__?: MarketingBehaviorEvent[];
  }
}

// 익명 토큰(개인정보 아님). crypto.randomUUID 우선, 없으면 안전 fallback.
const randomToken = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const hostOf = (url: string): string | undefined => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return undefined; }
};

// ── 5-1. 익명 세션 seed ──────────────────────────────────────────────────────
// raw user/session id·회원 id·연락처 금지. prototype은 'proto_' prefix 임시 익명값.
// (실제 live에서는 서버에서 sha256 등 hash 처리 필요 — 문서 참고.)
export const createMarketingBehaviorSessionSeed = (): string => `proto_${randomToken()}`;

// ── 5-2. 유입 경로 후보 ──────────────────────────────────────────────────────
export interface MarketingTrafficSignal {
  source: MarketingTrafficSource;
  medium?: string;
  campaign?: string;
  referrerHost?: string;
}

// source 정규화 — collection plan 규칙과 일관(단일 소스). 입력 주입 가능(테스트/SSR 안전).
export const readMarketingTrafficSource = (input?: { href?: string; referrer?: string }): MarketingTrafficSignal => {
  const href = input?.href ?? (typeof window !== 'undefined' ? window.location.href : '');
  const referrer = input?.referrer ?? (typeof document !== 'undefined' ? document.referrer : '');

  let utm = new URLSearchParams();
  try { utm = new URL(href || 'http://x/').searchParams; } catch { /* ignore */ }
  const medium = (utm.get('utm_medium') || undefined)?.toLowerCase();
  const utmSource = (utm.get('utm_source') || undefined)?.toLowerCase();
  const campaign = utm.get('utm_campaign') || undefined;
  const referrerHost = referrer ? hostOf(referrer) : undefined;

  const rule = (s: MarketingTrafficSource) => MARKETING_BEHAVIOR_SOURCE_RULES.find((r) => r.source === s);
  const adRule = rule('ad');
  const searchRule = rule('search');

  let source: MarketingTrafficSource;
  if ((medium && adRule?.match.utmMedium?.includes(medium)) || (utmSource && adRule?.match.utmSource?.includes(utmSource))) {
    source = 'ad';
  } else if (referrerHost) {
    const matched = MARKETING_BEHAVIOR_SOURCE_RULES.find((r) => r.match.referrerHosts?.some((h) => referrerHost.includes(h.replace(/\.$/, ''))));
    if (matched) source = matched.source;
    else if (medium && searchRule?.match.utmMedium?.includes(medium)) source = 'search';
    else source = 'referral';
  } else {
    source = 'direct';
  }

  return { source, medium, campaign, referrerHost };
};

// ── 5-3. 페이지 컨텍스트 ──────────────────────────────────────────────────────
// pathname 중심(query string 원문/개인정보성 파라미터 저장 금지). 입력 주입 가능.
export const readMarketingPageContext = (input?: { pathname?: string; title?: string }): { pagePath: string; pageTitle?: string } => {
  const pagePath = input?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const pageTitle = input?.title ?? (typeof document !== 'undefined' ? document.title : undefined);
  return { pagePath, pageTitle };
};

// ── 5-5. data-godo-track 요소 메타데이터 ──────────────────────────────────────
const ATTR = MARKETING_BEHAVIOR_DATA_ATTRIBUTES;
// 최소 엘리먼트 인터페이스(브라우저 HTMLElement도, 테스트 stub도 수용).
export interface TrackableElementLike {
  getAttribute(attr: string): string | null;
}
export interface TrackableElementMetadata {
  trackType: string;
  eventName: MarketingBehaviorEventName;
  fields: Partial<Pick<MarketingBehaviorEvent, 'bannerId' | 'bannerName' | 'categoryId' | 'categoryName' | 'productId' | 'productName' | 'searchTerm'>>;
}

// data-godo-track 값 → 기존 10종 이벤트명 매핑(새 이벤트명 추가하지 않음).
const TRACK_TO_EVENT: Record<string, MarketingBehaviorEventName> = {
  banner: 'banner_click',
  category: 'category_click',
  product: 'product_view', // product_click은 union에 없음 → product_view로 매핑
  cart: 'add_to_cart',
  checkout: 'checkout_start',
  search: 'search'
};

export const readTrackableElementMetadata = (el: TrackableElementLike | null | undefined): TrackableElementMetadata | null => {
  if (!el) return null;
  const trackType = el.getAttribute(ATTR.trackAttr);
  if (!trackType) return null;
  const eventName = TRACK_TO_EVENT[trackType];
  if (!eventName) return null;

  const fields: TrackableElementMetadata['fields'] = {};
  if (trackType === 'banner') {
    fields.bannerId = el.getAttribute(ATTR.banner.idAttr) || undefined;
    fields.bannerName = el.getAttribute(ATTR.banner.nameAttr) || undefined;
  } else if (trackType === 'category') {
    fields.categoryId = el.getAttribute(ATTR.category.idAttr) || undefined;
    fields.categoryName = el.getAttribute(ATTR.category.nameAttr) || undefined;
  } else if (trackType === 'product' || trackType === 'cart') {
    fields.productId = el.getAttribute(ATTR.product.idAttr) || undefined;
    fields.productName = el.getAttribute(ATTR.product.nameAttr) || undefined;
  } else if (trackType === 'search') {
    fields.searchTerm = el.getAttribute('data-godo-search-term') || undefined;
  }
  return { trackType, eventName, fields };
};

// ── 5-4. MarketingBehaviorEvent payload 생성 ─────────────────────────────────
export interface CreateMarketingBehaviorEventInput {
  eventName: MarketingBehaviorEventName;
  sessionIdHash: string;
  context?: { pagePath?: string; pageTitle?: string };
  traffic?: MarketingTrafficSignal;
  element?: TrackableElementMetadata['fields'];
  revenue?: number;
  orderIdHash?: string;
  occurredAt?: string;
}

const ALLOWED = new Set<string>(MARKETING_BEHAVIOR_ALLOWED_FIELDS as readonly string[]);

// allowlist 외 키 제거(PII 방어막). undefined 값도 제거.
const sanitizeToAllowlist = (raw: Record<string, unknown>): MarketingBehaviorEvent => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (!ALLOWED.has(k)) continue;
    if (raw[k] === undefined) continue;
    out[k] = raw[k];
  }
  return out as unknown as MarketingBehaviorEvent;
};

export const createMarketingBehaviorEvent = (input: CreateMarketingBehaviorEventInput): MarketingBehaviorEvent => {
  const raw: Record<string, unknown> = {
    eventId: `evt_${randomToken()}`,
    sessionIdHash: input.sessionIdHash,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    eventName: input.eventName,
    source: input.traffic?.source,
    medium: input.traffic?.medium,
    campaign: input.traffic?.campaign,
    referrerHost: input.traffic?.referrerHost,
    pagePath: input.context?.pagePath,
    pageTitle: input.context?.pageTitle,
    bannerId: input.element?.bannerId,
    bannerName: input.element?.bannerName,
    categoryId: input.element?.categoryId,
    categoryName: input.element?.categoryName,
    productId: input.element?.productId,
    productName: input.element?.productName,
    searchTerm: input.element?.searchTerm,
    orderIdHash: input.orderIdHash,
    revenue: input.revenue
  };
  return sanitizeToAllowlist(raw);
};

// ── 5-7. 진입 시 visit / landing payload ─────────────────────────────────────
export const createPrototypeVisitEvents = (
  input?: { sessionIdHash?: string; href?: string; referrer?: string; pathname?: string; title?: string }
): MarketingBehaviorEvent[] => {
  const sessionIdHash = input?.sessionIdHash ?? createMarketingBehaviorSessionSeed();
  const traffic = readMarketingTrafficSource({ href: input?.href, referrer: input?.referrer });
  const context = readMarketingPageContext({ pathname: input?.pathname, title: input?.title });
  return [
    createMarketingBehaviorEvent({ eventName: 'visit', sessionIdHash, traffic, context }),
    createMarketingBehaviorEvent({ eventName: 'landing', sessionIdHash, context })
  ];
};

// ── debug buffer ─────────────────────────────────────────────────────────────
export const getMarketingBehaviorDebugBuffer = (): MarketingBehaviorEvent[] => {
  if (typeof window === 'undefined') return [];
  if (!window[DEBUG_KEY]) window[DEBUG_KEY] = [];
  return window[DEBUG_KEY] as MarketingBehaviorEvent[];
};

const pushDebug = (event: MarketingBehaviorEvent, debug?: boolean): void => {
  if (typeof window !== 'undefined') getMarketingBehaviorDebugBuffer().push(event);
  if (debug && typeof console !== 'undefined') console.info('[GODO behavior:proto]', event.eventName, event);
};

// ── 5-6. 클릭 리스너 장착(side effect는 호출 시에만) ──────────────────────────
export interface TrackerPrototypeOptions {
  debug?: boolean;
  sessionIdHash?: string;
  // 선택적 전송 어댑터. 없으면 debug buffer만(기존 동작) — 자동 전송 없음.
  transport?: MarketingBehaviorTransport;
}

// document에 click listener를 붙여 data-godo-track 클릭 시 payload 생성. cleanup 반환.
// 앱에 자동 장착하지 않는다 — 호출자가 명시적으로 호출/해제.
// transport가 주어진 경우에만 endpoint로 전송(전송 실패는 click handler를 깨지 않음).
export const attachMarketingBehaviorTrackerPrototype = (options?: TrackerPrototypeOptions): (() => void) => {
  if (typeof document === 'undefined') return () => { /* no-op (SSR/non-browser) */ };

  const sessionIdHash = options?.sessionIdHash ?? createMarketingBehaviorSessionSeed();

  const handler = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const el = target.closest(`[${ATTR.trackAttr}]`);
    const meta = readTrackableElementMetadata(el);
    if (!meta) return;
    const traffic = readMarketingTrafficSource();
    const context = readMarketingPageContext();
    const event = createMarketingBehaviorEvent({ eventName: meta.eventName, sessionIdHash, traffic, context, element: meta.fields });
    pushDebug(event, options?.debug);
    // opt-in 전송: transport가 있을 때만. 실패해도 throw 전파 없음(UI 보호).
    if (options?.transport) {
      void options.transport.send([event]).catch(() => { /* swallow — UI 보호 */ });
    }
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
};
