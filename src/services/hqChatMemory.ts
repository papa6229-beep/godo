// HQ 채팅 기록 영속화 v0
//
// ChatConsole이 탭마다 별도 인스턴스로 렌더되어 state가 초기화되는 문제를 막기 위해
// HQ 채팅 메시지를 localStorage에 공유 저장한다. 탭 이동/새로고침 후에도 최근 대화 유지.
// 너무 길어지지 않도록 최근 MAX_MESSAGES개만 보관한다.

import type { ControlChatMessage } from '../types/controlChat';

const STORAGE_KEY = 'godo_hq_chat_messages_v0';
const MAX_MESSAGES = 50;

export const buildWelcomeMessage = (): ControlChatMessage => ({
  id: 'welcome',
  role: 'system',
  content:
    'Godo AI Operating Center에 오신 것을 환영합니다. 원하시는 운영 지시를 입력하거나 아래 추천 명령 템플릿을 선택하십시오. 현재 기본 AI를 통해 운영 지시와 질문에 답변합니다.',
  createdAt: new Date().toLocaleTimeString('ko-KR', { hour12: false })
});

export function loadHqMessages(): ControlChatMessage[] {
  if (typeof window === 'undefined') return [buildWelcomeMessage()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [buildWelcomeMessage()];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as ControlChatMessage[];
    return [buildWelcomeMessage()];
  } catch {
    return [buildWelcomeMessage()];
  }
}

export function saveHqMessages(messages: ControlChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장 실패는 조용히 무시
  }
}

export function clearHqMessages(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}
