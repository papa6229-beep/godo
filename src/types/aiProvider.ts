// AI Provider Foundation v0 — 타입 정의
//
// 목적: GODO를 특정 모델 하나(LM Studio Gemma)에 묶지 않고, 향후
//   - local_lmstudio (실제 연결 테스트)
//   - company_local_llm (회사 서버 LLM)
//   - openai_api / gemini_api / claude_api (클라우드 API)
//   - gpt_subscription_experimental (실험적 placeholder)
// 를 갈아 끼울 수 있는 provider 구조의 "기초 타입"을 정의한다.
//
// 보안 원칙(매우 중요):
//   - 이 타입에는 apiKey / secret / token 등 비밀값 필드를 두지 않는다.
//   - 클라우드 provider의 실제 API key는 추후 서버(api/ai/*) 환경변수에서만 처리한다.
//   - 브라우저(localStorage 포함)에는 어떤 secret도 저장하지 않는다.

export type AIProviderType =
  | 'local_lmstudio'
  | 'company_local_llm'
  | 'openai_api'
  | 'gemini_api'
  | 'claude_api'
  | 'gpt_subscription_experimental';

export type AIProviderStatus =
  | 'not_configured' // 아직 연결/설정 전 (cloud placeholder 기본값)
  | 'connected'      // 실제 응답 확인됨 (local_lmstudio 전용)
  | 'disconnected'   // 설정은 됐으나 현재 연결 안 됨 / 서버 off
  | 'no_model'       // 서버는 응답하나 로드된 모델이 없음
  | 'error'          // 연결 시도 중 오류
  | 'testing';       // 테스트 진행 중

export type AIProviderRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'experimental';

export type AIProviderDefinition = {
  id: string;
  name: string;
  type: AIProviderType;
  description: string;
  defaultEndpoint?: string;     // 로컬 provider만 의미. 클라우드는 서버에서 처리.
  status: AIProviderStatus;
  isEnabled: boolean;
  isProductionSafe: boolean;
  riskLevel: AIProviderRiskLevel;
  notes?: string;
  // 환경변수 "이름"만 문서 수준으로 표기한다. 값은 절대 담지 않는다.
  serverEnvKeyName?: string;
};

// local provider 연결 테스트 결과(런타임 상태). registry 정의와 분리해 둔다.
export type AIProviderTestResult = {
  providerId: string;
  status: AIProviderStatus;
  detectedModel?: string;
  responseExcerpt?: string;
  latencyMs?: number;
  errorKind?: string;
  message: string;
};

// --- Provider Chat Bridge v0 ---
// 에이전트 실행부가 provider를 통해 LLM에 chat을 요청하기 위한 공통 통로 타입.
// (API key/secret 필드는 두지 않는다. cloud는 아직 실호출하지 않는다.)

export type ProviderChatRole = 'system' | 'user' | 'assistant';

export type ProviderChatMessage = {
  role: ProviderChatRole;
  content: string;
};

export type ProviderChatRequest = {
  providerId: string;
  messages: ProviderChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  purpose?: 'agent_run' | 'connection_test' | 'cs_draft' | 'hq_brief' | 'analysis' | 'chat_playground';
  // 연결 확인 등에서 아직 저장 전 키/모델을 직접 넘기고 싶을 때(override). 미지정 시 vault에서 읽음.
  apiKeyOverride?: string;
  modelIdOverride?: string;
};

export type ProviderChatErrorKind =
  | 'not_configured'
  | 'server_off'
  | 'endpoint_not_found'
  | 'no_model'
  | 'model_not_found'
  | 'timeout'
  | 'bad_response'
  | 'provider_disabled'
  // cloud(서버 route) 경유 시 추가되는 종류
  | 'missing_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'provider_error'
  | 'network_error'
  | 'unknown';

// --- /api/ai/chat 서버 route 공통 타입 (cloud provider 전용) ---
export type AICloudProviderId = 'openai_api' | 'gemini_api' | 'claude_api';

export type AIChatRequest = {
  providerId: AICloudProviderId;
  apiKey: string;
  modelId: string;
  messages: ProviderChatMessage[];
  temperature?: number;
  maxTokens?: number;
  purpose?: 'connection_test' | 'chat_playground' | 'agent_run';
};

export type AIChatErrorKind =
  | 'missing_key'
  | 'invalid_key'
  | 'model_not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'timeout'
  | 'bad_response'
  | 'provider_error'
  | 'unknown';

export type AIChatResponse = {
  ok: boolean;
  providerId: string;
  modelId?: string;
  content?: string;
  latencyMs?: number;
  errorKind?: AIChatErrorKind;
  errorMessage?: string;
};

export type ProviderChatResult = {
  ok: boolean;
  providerId: string;
  modelId?: string;
  content?: string;
  latencyMs?: number;
  errorKind?: ProviderChatErrorKind;
  errorMessage?: string;
};
