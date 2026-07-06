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
  ProviderChatErrorKind,
  AIChatResponse,
  AICloudProviderId
} from '../types/aiProvider';
import { defaultAIProviders, getDefaultCloudModel } from '../data/aiProviderRegistry';
import { getModels, getChatCompletion } from './lmsConnector';
import { getProviderKey, getProviderModel } from './aiKeyVault';

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
  //    요청의 temperature/maxTokens를 전달(다중섹션 문구가 중간에 잘리지 않도록).
  const chatRes = await getChatCompletion(request.messages, detected, endpoint, {
    temperature: request.temperature,
    maxTokens: request.maxTokens
  });
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

// cloud provider 실호출 — 서버 route(/api/ai/chat) 경유. key는 vault(또는 override)에서 읽어
// 요청 body로만 전달한다(브라우저에 노출/로그하지 않음).
const chatWithCloud = async (
  provider: AIProviderDefinition,
  request: ProviderChatRequest
): Promise<ProviderChatResult> => {
  const apiKey = request.apiKeyOverride || getProviderKey(provider.id) || '';
  if (!apiKey) {
    return fail(provider.id, 'missing_key', '연결 키를 먼저 붙여넣어 주세요.');
  }
  const modelId =
    request.modelIdOverride || getProviderModel(provider.id) || getDefaultCloudModel(provider.id);
  if (!modelId) {
    return fail(provider.id, 'bad_response', '사용할 모델을 먼저 선택해 주세요.');
  }

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: provider.id as AICloudProviderId,
        apiKey,
        modelId,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        purpose: request.purpose === 'connection_test' ? 'connection_test' : 'chat_playground'
      })
    });
    const data = (await res.json()) as AIChatResponse;
    if (data.ok) {
      return {
        ok: true,
        providerId: provider.id,
        modelId: data.modelId || modelId,
        content: data.content,
        latencyMs: data.latencyMs
      };
    }
    return {
      ok: false,
      providerId: provider.id,
      modelId: data.modelId || modelId,
      latencyMs: data.latencyMs,
      errorKind: (data.errorKind || 'unknown') as ProviderChatErrorKind,
      errorMessage: data.errorMessage
    };
  } catch {
    return fail(provider.id, 'network_error', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
};

/**
 * providerId 기반 chat 통로. local_lmstudio + cloud(openai/gemini/claude) 실호출, 나머지는 안전 fallback.
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
      return chatWithCloud(provider, request);

    case 'company_local_llm':
      return fail(
        provider.id,
        'not_configured',
        '아직 준비 중입니다. 회사 서버 연결은 다음 단계에서 지원됩니다.'
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
