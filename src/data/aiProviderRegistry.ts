// AI Provider Foundation v0 — 기본 Provider Registry
//
// local_lmstudio 만 실제 연결 테스트 대상이고, 나머지는 placeholder(not_configured)다.
// 클라우드 provider는 이번 작업에서 실제 호출하지 않는다(서버 route 미구현).
// 어떤 항목에도 secret/apiKey 값을 담지 않는다. (serverEnvKeyName은 "이름"일 뿐 값이 아님)

import type { AIProviderDefinition } from '../types/aiProvider';

// LM Studio 로컬 기본 endpoint (OpenAI 호환 base). lmsConnector.resolveLmsBase와 일치.
export const LMSTUDIO_DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1';

// cloud provider별 모델 후보 (UI 드롭다운 + 기본값). '직접 입력'은 UI에서 별도 처리.
// 최신/현행 모델 우선. 구형 모델은 추천에서 제거(필요 시 '직접 입력'으로 사용).
export const CLOUD_MODEL_OPTIONS: Record<string, string[]> = {
  openai_api: ['gpt-4.1-mini', 'gpt-4o-mini'],
  gemini_api: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-flash-latest'],
  claude_api: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5']
};

export const getDefaultCloudModel = (providerId: string): string =>
  CLOUD_MODEL_OPTIONS[providerId]?.[0] || '';

export const defaultAIProviders: AIProviderDefinition[] = [
  {
    id: 'local_lmstudio',
    name: 'LM Studio Local',
    type: 'local_lmstudio',
    description:
      '로컬 PC에서 구동되는 LM Studio(OpenAI 호환 서버). 일상/반복 작업과 민감 데이터 내부 분석용. 실제 연결 테스트 대상.',
    defaultEndpoint: LMSTUDIO_DEFAULT_ENDPOINT,
    status: 'disconnected',
    isEnabled: true,
    isProductionSafe: false, // 로컬 dev 한정(배포된 HTTPS 사이트는 로컬 HTTP에 접근 불가)
    riskLevel: 'low',
    notes:
      'dev(npm run dev)에서만 연결 테스트 가능. endpoint는 127.0.0.1:1234/v1 (Windows localhost→IPv6 미스 회피).'
  },
  {
    id: 'company_local_llm',
    name: 'Company Local LLM Server',
    type: 'company_local_llm',
    description:
      '회사 내부 서버에 배치할 로컬 LLM(예: 사내 GPU 서버). 추후 사내망 endpoint로 연결 예정.',
    defaultEndpoint: undefined,
    status: 'not_configured',
    isEnabled: false,
    isProductionSafe: false,
    riskLevel: 'low',
    notes: '이번 작업에서는 placeholder. 회사 서버 endpoint 확정 시 연결 구조 확장.'
  },
  {
    id: 'openai_api',
    name: 'OpenAI API',
    type: 'openai_api',
    description: 'OpenAI GPT 계열 클라우드 API. 고급 분석/전략용. 실제 호출은 서버 route에서만 처리 예정.',
    status: 'not_configured',
    isEnabled: false,
    isProductionSafe: true,
    riskLevel: 'medium',
    notes: 'API key는 브라우저에 저장하지 않음. 서버 환경변수에서만 사용 예정.',
    serverEnvKeyName: 'OPENAI_API_KEY'
  },
  {
    id: 'gemini_api',
    name: 'Gemini API',
    type: 'gemini_api',
    description: 'Google Gemini 클라우드 API. 저지연 초안/요약용. 실제 호출은 서버 route에서만 처리 예정.',
    status: 'not_configured',
    isEnabled: false,
    isProductionSafe: true,
    riskLevel: 'medium',
    notes: 'API key는 브라우저에 저장하지 않음. 서버 환경변수에서만 사용 예정.',
    serverEnvKeyName: 'GEMINI_API_KEY'
  },
  {
    id: 'claude_api',
    name: 'Claude API',
    type: 'claude_api',
    description: 'Anthropic Claude 클라우드 API. 고급 추론/카피라이팅용. 실제 호출은 서버 route에서만 처리 예정.',
    status: 'not_configured',
    isEnabled: false,
    isProductionSafe: true,
    riskLevel: 'medium',
    notes: 'API key는 브라우저에 저장하지 않음. 서버 환경변수에서만 사용 예정.',
    serverEnvKeyName: 'ANTHROPIC_API_KEY'
  },
  {
    id: 'gpt_subscription_experimental',
    name: 'ChatGPT Subscription Login',
    type: 'gpt_subscription_experimental',
    description:
      'ChatGPT 구독 로그인 기반 개발 보조(Codex/Hermes류) 가능성 검토용. GODO runtime 정식 provider 아님.',
    status: 'not_configured',
    isEnabled: false,
    isProductionSafe: false,
    riskLevel: 'experimental',
    notes: '실험적 placeholder. 기본 비활성화. 구독 로그인 세션 저장/우회 연결은 구현하지 않음.'
  }
];
