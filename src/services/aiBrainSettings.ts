// Agent Brain Routing Foundation v0
//
// "어떤 AI 직원이 어떤 AI(두뇌)를 쓸지"를 저장/조회한다.
//  - 전체 기본 AI(global brain): 모든 직원의 기본값. 초기값 Claude.
//  - 직원별 brain: useGlobalDefault=true면 기본 AI를 따라가고, 아니면 개별 brain 사용.
//  - 업무별 override(taskOverrides): 타입/저장 구조만 준비(이번 UI 미노출).
//
// 실제 호출은 chatWithProvider 통로를 재사용한다. (키 미저장/미노출 원칙 동일)

import type {
  BrainProviderId,
  BrainSelection,
  AgentBrainConfig,
  ProviderChatMessage,
  ProviderChatResult
} from '../types/aiProvider';
import { getDefaultCloudModel } from '../data/aiProviderRegistry';
import { hasProviderKey } from './aiKeyVault';
import { chatWithProvider } from './aiProviderAdapter';

const GLOBAL_STORAGE = 'godo_ai_global_brain_v0';
const AGENTS_STORAGE = 'godo_ai_agent_brains_v0';

// 임시 기본값: Claude (사용자가 직원별 최종 모델을 정하기 전 단계)
export const DEFAULT_GLOBAL_BRAIN: BrainSelection = {
  providerId: 'claude_api',
  modelId: 'claude-sonnet-4-6',
  label: 'Claude'
};

export const providerLabel = (providerId: BrainProviderId): string => {
  switch (providerId) {
    case 'claude_api': return 'Claude';
    case 'openai_api': return 'OpenAI';
    case 'gemini_api': return 'Gemini';
    case 'local_lmstudio': return 'LM Studio Local';
    case 'company_local_llm': return '회사 서버 LLM';
    default: return String(providerId);
  }
};

// provider별 기본 모델 (cloud는 registry 추천 첫 모델, local은 자동 감지라 빈 문자열)
export const brainDefaultModel = (providerId: BrainProviderId): string => {
  if (providerId === 'claude_api') return 'claude-sonnet-4-6';
  if (providerId === 'openai_api' || providerId === 'gemini_api') return getDefaultCloudModel(providerId);
  return '';
};

export const makeBrainSelection = (providerId: BrainProviderId, modelId?: string): BrainSelection => ({
  providerId,
  modelId: modelId || brainDefaultModel(providerId),
  label: providerLabel(providerId)
});

// 해당 두뇌가 지금 쓸 수 있는 상태인지(키 연결 여부 등)
export const isBrainConnected = (providerId: BrainProviderId): boolean => {
  if (providerId === 'claude_api' || providerId === 'openai_api' || providerId === 'gemini_api') {
    return hasProviderKey(providerId);
  }
  if (providerId === 'local_lmstudio') {
    // dev에서만 실제 사용 가능(서버 가용성은 호출 시 판단)
    return import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
  }
  return false; // company_local_llm 등 준비 중
};

const readJson = <T,>(storageKey: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (storageKey: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // 저장 실패는 조용히 무시
  }
};

// ===== 전체 기본 AI =====
export function getGlobalBrainSelection(): BrainSelection {
  const saved = readJson<BrainSelection>(GLOBAL_STORAGE);
  if (saved && saved.providerId) return saved;
  return DEFAULT_GLOBAL_BRAIN;
}

export function setGlobalBrainSelection(sel: BrainSelection): void {
  writeJson(GLOBAL_STORAGE, sel);
}

// ===== 직원별 brain =====
type AgentBrainMap = Record<string, AgentBrainConfig>;

export function getAgentBrainConfig(agentId: string): AgentBrainConfig {
  const map = readJson<AgentBrainMap>(AGENTS_STORAGE) || {};
  return map[agentId] || { agentId, useGlobalDefault: true };
}

export function setAgentBrainConfig(config: AgentBrainConfig): void {
  const map = readJson<AgentBrainMap>(AGENTS_STORAGE) || {};
  map[config.agentId] = config;
  writeJson(AGENTS_STORAGE, map);
}

// 편의: 직원의 AI 선택을 'global' 또는 특정 provider로 설정
export function setAgentBrainChoice(agentId: string, choice: 'global' | BrainProviderId): void {
  if (choice === 'global') {
    setAgentBrainConfig({ agentId, useGlobalDefault: true });
  } else {
    setAgentBrainConfig({ agentId, useGlobalDefault: false, brain: makeBrainSelection(choice) });
  }
}

// 직원이 현재 어떤 선택인지('global' | providerId)
export function getAgentBrainChoice(agentId: string): 'global' | BrainProviderId {
  const cfg = getAgentBrainConfig(agentId);
  if (cfg.useGlobalDefault || !cfg.brain) return 'global';
  return cfg.brain.providerId;
}

// 실제 사용할 brain 해석
export function resolveAgentBrain(agentId: string): BrainSelection {
  const cfg = getAgentBrainConfig(agentId);
  if (!cfg.useGlobalDefault && cfg.brain) return cfg.brain;
  return getGlobalBrainSelection();
}

// 직원 이름으로 chat (다음 단계 Agent Runtime 연결용 helper)
export async function chatAsAgent(
  agentId: string,
  messages: ProviderChatMessage[],
  options?: { temperature?: number; maxTokens?: number; purpose?: 'agent_run' | 'connection_test' | 'chat_playground' }
): Promise<ProviderChatResult> {
  const brain = resolveAgentBrain(agentId);
  return chatWithProvider({
    providerId: brain.providerId,
    modelIdOverride: brain.modelId || undefined,
    messages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    purpose: options?.purpose ?? 'agent_run'
  });
}
