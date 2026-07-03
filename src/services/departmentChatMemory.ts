// 부서 업무 관장 — 팀별 채팅 기록 영속화 v0
//
// 팀(hq/product/cs/marketing)별로 분리해 localStorage에 저장한다.
// HQ 채팅(hqChatMemory)과는 별도 저장소를 사용한다.
// 탭 이동/새로고침 후에도 각 팀 대화가 유지되며, 팀 간 대화가 섞이지 않는다.

export type DeptTeamId = 'hq' | 'product' | 'cs' | 'marketing' | 'design';

export interface DeptChatMessage {
  role: 'user' | 'system';
  text: string;
}

export type DeptChatLog = Record<DeptTeamId, DeptChatMessage[]>;

const STORAGE_KEY = 'godo_department_chat_messages_v0';
const MAX_PER_TEAM = 50;

const emptyLog = (): DeptChatLog => ({ hq: [], product: [], cs: [], marketing: [], design: [] });

export function loadDeptChatLog(): DeptChatLog {
  const base = emptyLog();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DeptChatLog>;
    if (parsed && typeof parsed === 'object') {
      (Object.keys(base) as DeptTeamId[]).forEach((k) => {
        if (Array.isArray(parsed[k])) base[k] = parsed[k] as DeptChatMessage[];
      });
    }
    return base;
  } catch {
    return base;
  }
}

export function saveDeptChatLog(log: DeptChatLog): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = emptyLog();
    (Object.keys(trimmed) as DeptTeamId[]).forEach((k) => {
      trimmed[k] = (log[k] || []).slice(-MAX_PER_TEAM);
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장 실패는 조용히 무시
  }
}
