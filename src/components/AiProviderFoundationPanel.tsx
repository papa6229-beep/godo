// AI Provider Foundation v0.1 — Provider 슬롯 상태 패널
//
// - local_lmstudio: 로컬 dev 환경에서만 실제 연결 테스트 (모델 목록 조회 + chat completion).
//   Production(배포 사이트)에서는 사용자 PC의 LM Studio(127.0.0.1)에 접근할 수 없으므로
//   버튼을 비활성화하고 안내만 표시한다(fetch 자체를 시도하지 않음).
// - 나머지(company_local_llm / openai_api / gemini_api / claude_api / gpt_subscription):
//   placeholder 상태만 표시. 연결 테스트/실호출/ API key 입력 UI 없음.
//
// 보안: API key 입력란 없음. localStorage 저장 없음. secret 미표시.

import React, { useState } from 'react';
import type { LogEntry } from '../types';
import type {
  AIProviderDefinition,
  AIProviderStatus,
  AIProviderTestResult
} from '../types/aiProvider';
import { defaultAIProviders } from '../data/aiProviderRegistry';
import { getModels, getChatCompletion } from '../services/lmsConnector';
import './AiProviderFoundationPanel.css';

interface AiProviderFoundationPanelProps {
  onAddLog: (text: string, type: LogEntry['type'], agentName?: string) => void;
}

const TEST_PROMPT = 'GODO AI OS 연결 테스트입니다. 한 문장으로 응답해 주세요.';

// 로컬 dev 환경 여부. dev 빌드이거나 localhost/127.0.0.1 호스트면 로컬로 본다.
// (Production 배포 사이트에서는 사용자 PC의 LM Studio에 접근 불가)
const isLocalDev: boolean =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

// 모델 id를 폭넓게 감지한다. 특정 모델명 하나만 하드코딩하지 않는다.
const MODEL_KEYWORDS = ['supergemma', 'super-gemma', 'gemma', 'uncensored', 'google/gemma'];

const detectModelId = (models: { id: string }[]): string | undefined => {
  if (models.length === 0) return undefined;
  const matched = models.find(m =>
    MODEL_KEYWORDS.some(k => m.id.toLowerCase().includes(k))
  );
  // 키워드 매칭이 없으면, 로드된 첫 모델을 테스트 대상으로 사용한다.
  return (matched || models[0]).id;
};

// 화면 표시용 상태 라벨 (개발자 enum을 사용자 친화 문구로)
const statusLabel: Record<AIProviderStatus, string> = {
  not_configured: '아직 연결 전',
  connected: '연결됨',
  disconnected: '연결 안 됨',
  no_model: '모델 없음',
  error: '오류',
  testing: '테스트 중'
};

// errorKind → 사용자 친화 한국어 안내. (내부 enum은 유지하되 화면 문구만 정리)
const errorKindMessage: Record<string, string> = {
  endpoint_not_found:
    'LM Studio API 경로를 찾지 못했습니다. endpoint가 http://127.0.0.1:1234 또는 http://127.0.0.1:1234/v1 형태인지 확인하세요.',
  server_off:
    'LM Studio 서버에 연결할 수 없습니다. LM Studio에서 Local Server가 켜져 있는지 확인하세요.',
  model_not_found:
    '사용 가능한 LM Studio 모델을 찾지 못했습니다. LM Studio에서 supergemma4-26b-uncensored-v2 모델을 로드했는지 확인하세요.',
  timeout:
    '응답 시간이 초과되었습니다. SuperGemma4 26B 모델은 첫 호출 시 로딩 시간이 길 수 있습니다. 모델 로딩이 끝난 뒤 다시 시도해 주세요.',
  bad_response:
    'LM Studio에서 예상과 다른 응답을 받았습니다. 서버는 연결되었지만 응답 형식 확인이 필요합니다.',
  unknown: '연결 중 알 수 없는 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
};

const NO_MODEL_MESSAGE =
  '사용 가능한 LM Studio 모델을 찾지 못했습니다. LM Studio에서 supergemma4-26b-uncensored-v2 모델을 로드했는지 확인하세요.';

// placeholder provider별 안내 문구
const placeholderNote = (p: AIProviderDefinition): string => {
  switch (p.type) {
    case 'gpt_subscription_experimental':
      return '실험 후보 · GODO runtime 정식 provider 아님 · 기본 비활성화';
    case 'company_local_llm':
      return '준비 중 · 회사 서버 endpoint 확정 후 연결';
    default:
      return '서버 API key 연결 필요 · 이번 단계에서는 호출하지 않습니다';
  }
};

export const AiProviderFoundationPanel: React.FC<AiProviderFoundationPanelProps> = ({ onAddLog }) => {
  // registry는 읽기 전용 기준. 런타임 상태(연결 결과)만 별도로 보관한다.
  const providers: AIProviderDefinition[] = defaultAIProviders;
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AIProviderTestResult>>({});

  const setResult = (r: AIProviderTestResult) =>
    setResults(prev => ({ ...prev, [r.providerId]: r }));

  const handleTestLmStudio = async (provider: AIProviderDefinition) => {
    // Production 등 비-로컬 환경에서는 fetch 시도 자체를 막는다(버튼도 비활성화 상태).
    if (!isLocalDev) return;

    const endpoint = provider.defaultEndpoint;
    setTestingId(provider.id);
    setResult({ providerId: provider.id, status: 'testing', message: '연결 테스트 중...' });
    onAddLog(
      `[AI Provider] ${provider.name} 연결 테스트 시작 (endpoint: ${endpoint})`,
      'info',
      'AI Provider'
    );

    // 1) 모델 목록 조회
    const modelsRes = await getModels(endpoint);
    if (!modelsRes.success) {
      const kind = modelsRes.errorKind || 'unknown';
      const message = errorKindMessage[kind] || errorKindMessage.unknown;
      setTestingId(null);
      setResult({ providerId: provider.id, status: 'disconnected', errorKind: kind, message });
      onAddLog(
        `[AI Provider] ${provider.name} 모델 목록 조회 실패 [${kind}] · status:${modelsRes.debug.status ?? 'N/A'} · finalUrl:${modelsRes.debug.finalUrl}`,
        'error',
        'AI Provider'
      );
      return;
    }

    const models = modelsRes.data || [];
    const detectedModel = detectModelId(models);
    if (!detectedModel) {
      setTestingId(null);
      setResult({ providerId: provider.id, status: 'no_model', message: NO_MODEL_MESSAGE });
      onAddLog(`[AI Provider] ${provider.name}: 로드된 모델 없음(no_model)`, 'warning', 'AI Provider');
      return;
    }

    // 2) chat completion 실제 테스트
    const chatRes = await getChatCompletion(
      [{ role: 'user', content: TEST_PROMPT }],
      detectedModel,
      endpoint
    );
    setTestingId(null);

    const isChatCompletion = chatRes.debug.objectType === 'chat.completion';
    const ok = chatRes.success && isChatCompletion && !!chatRes.content;

    if (ok) {
      const excerpt = (chatRes.content || '').trim().slice(0, 160);
      setResult({
        providerId: provider.id,
        status: 'connected',
        detectedModel,
        responseExcerpt: excerpt,
        latencyMs: chatRes.latency,
        message: 'LM Studio 로컬 모델이 정상 응답했습니다.'
      });
      onAddLog(
        `[AI Provider] ${provider.name} 연결 성공 · model:${detectedModel} · object:chat.completion · latency:${chatRes.latency ?? 0}ms`,
        'success',
        'AI Provider'
      );
    } else {
      const kind = chatRes.errorKind || (chatRes.success ? 'bad_response' : 'unknown');
      const message =
        kind === 'model_not_found' ? NO_MODEL_MESSAGE : errorKindMessage[kind] || errorKindMessage.unknown;
      setResult({
        providerId: provider.id,
        status: kind === 'model_not_found' ? 'no_model' : 'error',
        detectedModel,
        errorKind: kind,
        message
      });
      onAddLog(
        `[AI Provider] ${provider.name} chat completion 실패 [${kind}] · status:${chatRes.debug.status ?? 'N/A'} · object:${chatRes.debug.objectType ?? 'n/a'}`,
        'error',
        'AI Provider'
      );
    }
  };

  const effectiveStatus = (p: AIProviderDefinition): AIProviderStatus =>
    results[p.id]?.status ?? p.status;

  return (
    <div className="aip-pane">
      <div className="aip-intro">
        <h3 className="aip-section-title">🧩 AI Provider Foundation</h3>
        <p className="aip-section-desc">
          GODO를 특정 모델 하나에 묶지 않고 여러 AI 두뇌(로컬/클라우드)를 갈아 끼우기 위한 provider 슬롯입니다.
          현재는 <strong>LM Studio 로컬</strong>만 실제 연결 테스트가 가능하며, 클라우드 provider는 준비 중입니다.
          클라우드 API key는 브라우저에 저장하지 않고, 추후 서버 보안 연결(서버 환경변수)에서만 처리합니다.
        </p>
        {!isLocalDev && (
          <p className="aip-env-banner">
            ⚠️ 지금은 운영(배포) 환경입니다. 로컬 LM Studio 연결 테스트는 개발 환경에서만 가능합니다.
            태준님 PC에서 <code>npm run dev</code>로 실행한 뒤 <code>http://localhost:5173</code>에서 테스트하세요.
          </p>
        )}
      </div>

      <div className="aip-grid">
        {providers.map(p => {
          const status = effectiveStatus(p);
          const result = results[p.id];
          const isLocal = p.type === 'local_lmstudio';
          return (
            <div key={p.id} className={`aip-card ${isLocal ? 'is-local' : 'is-placeholder'}`}>
              <div className="aip-card-head">
                <span className="aip-card-name">{p.name}</span>
                <span className={`aip-status-badge status-${status}`}>
                  {statusLabel[status]}
                </span>
              </div>

              <p className="aip-card-desc">{p.description}</p>

              <div className="aip-meta-row">
                <span className={`aip-risk risk-${p.riskLevel}`}>RISK: {p.riskLevel.toUpperCase()}</span>
                <span className="aip-prod">
                  {p.isProductionSafe ? '운영 환경 사용 가능' : '운영 환경에서는 사용 안 함'}
                </span>
                {p.defaultEndpoint && (
                  <span className="aip-endpoint mono">{p.defaultEndpoint}</span>
                )}
                {p.serverEnvKeyName && (
                  <span className="aip-envkey mono">서버 ENV: {p.serverEnvKeyName}</span>
                )}
              </div>

              {p.notes && <p className="aip-notes">ℹ️ {p.notes}</p>}

              {isLocal ? (
                <div className="aip-actions">
                  {isLocalDev && (
                    <p className="aip-coldstart-note">
                      SuperGemma4 26B 모델은 첫 호출 시 모델 로딩 때문에 1분 이상 걸릴 수 있습니다.
                      처음 실패하더라도 LM Studio에서 모델이 로드된 뒤 다시 시도해 주세요.
                    </p>
                  )}
                  <button
                    type="button"
                    className="aip-btn primary"
                    disabled={!isLocalDev || testingId !== null}
                    title={isLocalDev ? undefined : '운영 환경에서는 로컬 LM Studio 테스트를 사용할 수 없습니다.'}
                    onClick={() => handleTestLmStudio(p)}
                  >
                    {!isLocalDev
                      ? '운영 환경에서는 테스트 불가 (Local dev 전용)'
                      : testingId === p.id
                      ? '⏳ 연결 테스트 중...'
                      : '🔌 Test Connection'}
                  </button>
                </div>
              ) : (
                <div className="aip-placeholder-note">{placeholderNote(p)}</div>
              )}

              {result && isLocal && (
                <div className={`aip-result result-${result.status}`}>
                  {result.status === 'connected' ? (
                    <>
                      <div className="aip-result-line">
                        <strong>연결 성공</strong>: {result.message}
                      </div>
                      {result.detectedModel && (
                        <div className="aip-result-line mono">모델: {result.detectedModel}</div>
                      )}
                      {typeof result.latencyMs === 'number' && (
                        <div className="aip-result-line">지연시간: {result.latencyMs}ms</div>
                      )}
                      {result.responseExcerpt && (
                        <div className="aip-result-line excerpt">응답: {result.responseExcerpt}</div>
                      )}
                    </>
                  ) : result.status === 'testing' ? (
                    <div className="aip-result-line">테스트 진행 중...</div>
                  ) : (
                    <div className="aip-result-line">
                      <strong>연결 실패</strong>: {result.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
