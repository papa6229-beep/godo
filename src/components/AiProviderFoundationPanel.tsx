// AI Provider Foundation v0 — Provider 슬롯 상태 패널
//
// - local_lmstudio: 실제 연결 테스트 (모델 목록 조회 + chat completion)
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

// 모델 id를 폭넓게 감지한다. 특정 모델명 하나만 하드코딩하지 않는다.
const MODEL_KEYWORDS = ['supergemma', 'super-gemma', 'gemma', 'google/gemma'];

const detectModelId = (models: { id: string }[]): string | undefined => {
  if (models.length === 0) return undefined;
  const matched = models.find(m =>
    MODEL_KEYWORDS.some(k => m.id.toLowerCase().includes(k))
  );
  // 키워드 매칭이 없으면, 로드된 첫 모델을 테스트 대상으로 사용한다.
  return (matched || models[0]).id;
};

const statusLabel: Record<AIProviderStatus, string> = {
  not_configured: '미설정',
  connected: '연결됨',
  disconnected: '연결 안 됨',
  no_model: '모델 없음',
  error: '오류',
  testing: '테스트 중'
};

const errorKindMessage: Record<string, string> = {
  endpoint_not_found:
    'LM Studio chat endpoint 경로 불일치(404). endpoint가 /v1 인지 확인하세요.',
  server_off:
    'LM Studio 서버에 연결할 수 없습니다. Local Server를 켰는지, endpoint가 127.0.0.1:1234/v1 인지 확인하세요.',
  model_not_found:
    '요청한 모델이 LM Studio에 로드되어 있지 않습니다. 모델을 로드한 뒤 다시 시도하세요.',
  timeout: '모델 응답 시간이 초과되었습니다(30초). 모델이 로드 중인지 확인하세요.',
  bad_response: '응답 형식이 올바르지 않습니다(chat.completion 아님).',
  unknown: '알 수 없는 오류가 발생했습니다.'
};

export const AiProviderFoundationPanel: React.FC<AiProviderFoundationPanelProps> = ({ onAddLog }) => {
  // registry는 읽기 전용 기준. 런타임 상태(연결 결과)만 별도로 보관한다.
  const providers: AIProviderDefinition[] = defaultAIProviders;
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AIProviderTestResult>>({});

  const setResult = (r: AIProviderTestResult) =>
    setResults(prev => ({ ...prev, [r.providerId]: r }));

  const handleTestLmStudio = async (provider: AIProviderDefinition) => {
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
      const message = errorKindMessage[kind] || modelsRes.error || '연결 실패';
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
      setResult({
        providerId: provider.id,
        status: 'no_model',
        message: 'LM Studio 서버는 응답하지만 로드된 모델이 없습니다. 모델을 로드하세요.'
      });
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
        message: 'LM Studio local model responded.'
      });
      onAddLog(
        `[AI Provider] ${provider.name} 연결 성공 · model:${detectedModel} · object:chat.completion · latency:${chatRes.latency ?? 0}ms`,
        'success',
        'AI Provider'
      );
    } else {
      const kind = chatRes.errorKind || (chatRes.success ? 'bad_response' : 'unknown');
      const message = errorKindMessage[kind] || chatRes.error || '연결 실패';
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
          현재는 <strong>LM Studio 로컬</strong>만 실제 연결 테스트가 가능하며, 클라우드 provider는 placeholder입니다.
          클라우드 API key는 브라우저에 저장하지 않고, 추후 서버 환경변수에서만 처리합니다.
        </p>
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
                  {p.isProductionSafe ? 'Production OK' : 'Production 비활성'}
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
                  <button
                    type="button"
                    className="aip-btn primary"
                    disabled={testingId !== null}
                    onClick={() => handleTestLmStudio(p)}
                  >
                    {testingId === p.id ? '⏳ 연결 테스트 중...' : '🔌 Test Connection'}
                  </button>
                </div>
              ) : (
                <div className="aip-placeholder-note">
                  {p.type === 'gpt_subscription_experimental'
                    ? '실험적 · Production 비활성 (정식 provider 아님)'
                    : p.type === 'company_local_llm'
                    ? '준비 예정 · 회사 서버 endpoint 확정 후 연결'
                    : '서버 API key 필요 · not configured (이번 단계 호출 안 함)'}
                </div>
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
                    <>
                      <div className="aip-result-line">
                        <strong>연결 실패</strong>
                        {result.errorKind ? ` [${result.errorKind}]` : ''}: {result.message}
                      </div>
                      {result.detectedModel && (
                        <div className="aip-result-line mono">감지된 모델: {result.detectedModel}</div>
                      )}
                    </>
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
