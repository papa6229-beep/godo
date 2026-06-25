// AI Provider Adapter v0 — provider.chat() 통로
//
// 에이전트 실행부(혹은 테스트 UI)가 providerId만 알면 LLM chat을 요청할 수 있도록
// provider별 호출을 한 곳으로 감싼다.
//   - local_lmstudio  : lmsConnector(getModels + getChatCompletion) 재사용 (실호출)
//   - openai/gemini/claude/company_local_llm : not_configured 안전 반환 (실호출 안 함)
//   - gpt_subscription_experimental          : provider_disabled 안전 반환
//
// 보안: API key/secret 미사용·미저장. cloud는 브라우저에서 직접 호출하지 않는다.

import type {
  AIProviderDefinition,
  ProviderChatRequest,
  ProviderChatResult,
  ProviderChatErrorKind
} from '../types/aiProvider';
import { defaultAIProviders } from '../data/aiProviderRegistry';
import { getModels, getChatCompletion } from './lmsConnector';

// 모델 id를 폭넓게 감지한다(특정 모델명 하드코딩 금지). AiProviderFoundationPanel과 동일 규칙.
const MODEL_KEYWORDS = ['supergemma', 'super-gemma', 'gemma', 'uncensored', 'google/gemma'];

const detectModelId = (models: { id: string }[]): string | undefined => {
  if (models.length === 0) return undefined;
  const matched = models.find(m => MODEL_KEYWORDS.some(k => m.id.toLowerCase().includes(k)));
  return (matched || models[0]).id;
};

const findProvider = (providerId: string): AIProviderDefinition | undefined =>
  defaultAIProviders.find(p => p.id === providerId);

const fail = (
  providerId: string,
  errorKind: ProviderChatErrorKind,
  errorMessage: string
): ProviderChatResult => ({ ok: false, providerId, errorKind, errorMessage });

// local_lmstudio 실호출 (lmsConnector 재사용)
const chatWithLmStudio = async (
  provider: AIProviderDefinition,
  request: ProviderChatRequest
): Promise<ProviderChatResult> => {
  const endpoint = provider.defaultEndpoint;

  // 1) 모델 목록 조회 → 감지
  const modelsRes = await getModels(endpoint);
  if (!modelsRes.success) {
    const kind = (modelsRes.errorKind || 'unknown') as ProviderChatErrorKind;
    return fail(provider.id, kind, modelsRes.error || 'LM Studio 모델 목록 조회 실패');
  }
  const detected = detectModelId(modelsRes.data || []);
  if (!detected) {
    return fail(provider.id, 'no_model', 'LM Studio에 로드된 모델이 없습니다.');
  }

  // 2) chat completion 실호출 (lmsConnector 내부 90s timeout 적용)
  const chatRes = await getChatCompletion(request.messages, detected, endpoint);
  const isChatCompletion = chatRes.debug.objectType === 'chat.completion';
  const ok = chatRes.success && isChatCompletion && !!chatRes.content;

  if (ok) {
    return {
      ok: true,
      providerId: provider.id,
      modelId: detected,
      content: chatRes.content,
      latencyMs: chatRes.latency
    };
  }

  const kind = (chatRes.errorKind || (chatRes.success ? 'bad_response' : 'unknown')) as ProviderChatErrorKind;
  return {
    ok: false,
    providerId: provider.id,
    modelId: detected,
    latencyMs: chatRes.latency,
    errorKind: kind,
    errorMessage: chatRes.error || 'LM Studio chat completion 실패'
  };
};

/**
 * providerId 기반 chat 통로. local_lmstudio만 실호출, 나머지는 안전 fallback.
 */
export async function chatWithProvider(
  request: ProviderChatRequest
): Promise<ProviderChatResult> {
  const provider = findProvider(request.providerId);
  if (!provider) {
    return fail(request.providerId, 'not_configured', '알 수 없는 provider 입니다.');
  }
  if (!provider.isEnabled && provider.type !== 'local_lmstudio') {
    // local_lmstudio는 dev에서 테스트 가능하도록 isEnabled와 무관하게 시도한다.
    // 그 외 비활성 provider는 호출하지 않는다.
    if (provider.type === 'gpt_subscription_experimental') {
      return fail(
        provider.id,
        'provider_disabled',
        'ChatGPT 구독 로그인은 GODO runtime 정식 provider가 아닙니다.'
      );
    }
  }

  switch (provider.type) {
    case 'local_lmstudio':
      return chatWithLmStudio(provider, request);

    case 'openai_api':
    case 'gemini_api':
    case 'claude_api':
    case 'company_local_llm':
      return fail(
        provider.id,
        'not_configured',
        '서버 API key 연결이 필요합니다. 이번 단계에서는 호출하지 않습니다.'
      );

    case 'gpt_subscription_experimental':
      return fail(
        provider.id,
        'provider_disabled',
        'ChatGPT 구독 로그인은 GODO runtime 정식 provider가 아닙니다.'
      );

    default:
      return fail(provider.id, 'unknown', '지원하지 않는 provider 타입입니다.');
  }
}
