// 세션 역할(뷰어) — "지금 누구로 보는가". 1단계: localStorage 데모 전환.
//  총괄(hq)=오늘의 운영 등 전체 · 팀장(product/cs/marketing)=본인 팀 보드만.
//  ※ 진짜 로그인/권한 격리는 2단계(백엔드). 지금은 데모용 역할 전환.

export type ViewerRole = 'hq' | 'product' | 'cs' | 'marketing';

export const VIEWER_ROLES: { id: ViewerRole; label: string; emoji: string; short: string }[] = [
  { id: 'hq', label: '총괄 관리자', emoji: '🏛️', short: '총괄' },
  { id: 'product', label: '상품관리팀장', emoji: '🏷️', short: '상품' },
  { id: 'cs', label: 'CS팀장', emoji: '💬', short: 'CS' },
  { id: 'marketing', label: '마케팅팀장', emoji: '📊', short: '마케팅' }
];

const STORAGE_KEY = 'godo_viewer_role_v0';

export const isHqRole = (r: ViewerRole): boolean => r === 'hq';
export const roleMeta = (r: ViewerRole) => VIEWER_ROLES.find((x) => x.id === r) ?? VIEWER_ROLES[0];

export function loadRole(): ViewerRole {
  if (typeof window === 'undefined') return 'hq';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return VIEWER_ROLES.some((x) => x.id === raw) ? (raw as ViewerRole) : 'hq';
  } catch {
    return 'hq';
  }
}

export function saveRole(role: ViewerRole): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
    // 같은 탭 내 구독자에게도 즉시 알림(storage 이벤트는 타 탭만 발화).
    window.dispatchEvent(new CustomEvent('godo-role-change'));
  } catch { /* noop */ }
}

export function subscribeRole(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  const onLocal = () => cb();
  window.addEventListener('storage', onStorage);
  window.addEventListener('godo-role-change', onLocal);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('godo-role-change', onLocal); };
}
