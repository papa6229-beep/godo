// AI Provider Foundation + 카드 인라인 연결 v0.1
//
// 각 AI 카드 안에서 바로 연결한다:
//  - OpenAI / Gemini / Claude: 카드 안에 연결 키 입력 + 모델 선택 + 연결 확인/저장/삭제 +
//    접이식 "채팅 테스트". (별도 하단 섹션 없음)
//  - LM Studio Local: 로컬 dev에서만 연결 테스트 + 접이식 채팅 테스트.
//  - company_local_llm / gpt_subscription: 준비 중/실험 placeholder.
//
// 보안(조용한 안전장치): 키 입력 password, 저장 키 마스킹, console.log 금지,
//  응답/에러에 키 미포함. cloud 호출은 서버 route가 요청 단위로만 키 사용(미저장).

import React, { useState } from 'react';
import type { LogEntry } from '../types';
import type {
  AIProviderDefinition,
  AIProviderStatus,
  AIProviderTestResult,
  ProviderChatResult
} from '../types/aiProvider';
import { defaultAIProviders, CLOUD_MODEL_OPTIONS, getDefaultCloudModel } from '../data/aiProviderRegistry';
import { getModels, getChatCompletion } from '../services/lmsConnector';
import { chatWithProvider } from '../services/aiProviderAdapter';
import {
  saveProviderKey,
  getProviderKey,
  deleteProviderKey,
  hasProviderKey,
  maskProviderKey,
  saveProviderModel,
  getProviderModel
} from '../services/aiKeyVault';
import './AiProviderFoundationPanel.css';

interface AiProviderFoundationPanelProps {
  onAddLog: (text: string, type: LogEntry['type'], agentName?: string) => void;
}

const LMS_TEST_PROMPT = 'GODO AI OS 연결 테스트입니다. 한 문장으로 응답해 주세요.';
const CONNECT_TEST_PROMPT = 'GODO AI OS 연결 확인입니다. 한 문장으로 응답해 주세요.';
const DEFAULT_QUESTION = 'GODO AI OS 연결 테스트입니다. 한 문장으로 응답해 주세요.';
const CUSTOM_MODEL = '__custom__';

const isLocalDev: boolean =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

const MODEL_KEYWORDS = ['supergemma', 'super-gemma', 'gemma', 'uncensored', 'google/gemma'];
const detectModelId = (models: { id: string }[]): string | undefined => {
  if (models.length === 0) return undefined;
  const matched = models.find(m => MODEL_KEYWORDS.some(k => m.id.toLowerCase().includes(k)));
  return (matched || models[0]).id;
};

const statusLabel: Record<AIProviderStatus, string> = {
  not_configured: '아직 연결 전',
  connected: '연결됨',
  disconnected: '연결 안 됨',
  no_model: '모델 없음',
  error: '오류',
  testing: '테스트 중'
};

const NO_MODEL_MESSAGE =
  '사용 가능한 LM Studio 모델을 찾지 못했습니다. LM Studio에서 supergemma4-26b-uncensored-v2 모델을 로드했는지 확인하세요.';

const errorKindMessage: Record<string, string> = {
  endpoint_not_found:
    'LM Studio API 경로를 찾지 못했습니다. endpoint가 http://127.0.0.1:1234 또는 http://127.0.0.1:1234/v1 형태인지 확인하세요.',
  server_off: 'LM Studio 서버에 연결할 수 없습니다. LM Studio에서 Local Server가 켜져 있는지 확인하세요.',
  model_not_found: NO_MODEL_MESSAGE,
  timeout:
    '응답 시간이 초과되었습니다. SuperGemma4 26B 모델은 첫 호출 시 로딩 시간이 길 수 있습니다. 모델 로딩이 끝난 뒤 다시 시도해 주세요.',
  bad_response: 'LM Studio에서 예상과 다른 응답을 받았습니다. 서버는 연결되었지만 응답 형식 확인이 필요합니다.',
  unknown: '연결 중 알 수 없는 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
};

const chatErrorMessage: Record<string, string> = {
  not_configured: '아직 연결되지 않았습니다. 연결 키를 붙여넣고 저장해 주세요.',
  provider_disabled: 'GODO에서 사용하는 정식 AI가 아니어서 호출하지 않습니다.',
  server_off: 'LM Studio 서버에 연결할 수 없습니다. Local Server가 켜져 있는지 확인하세요.',
  endpoint_not_found: '연결 경로를 찾지 못했습니다. 설정을 다시 확인해 주세요.',
  no_model: NO_MODEL_MESSAGE,
  missing_key: '연결 키를 먼저 붙여넣어 주세요.',
  invalid_key: '연결 키가 올바르지 않습니다.',
  model_not_found: '사용할 모델 이름이 맞지 않습니다. 다른 모델을 선택해 보세요.',
  rate_limited: '요청 한도 또는 결제 설정을 확인해 주세요.',
  quota_exceeded: '요청 한도 또는 결제 설정을 확인해 주세요.',
  timeout: '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  bad_response: 'AI 회사에서 예상과 다른 응답을 보냈습니다.',
  provider_error: '연결에 실패했습니다. 키와 모델을 다시 확인해 주세요.',
  network_error: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unknown: '연결에 실패했습니다. 키와 모델을 다시 확인해 주세요.'
};

// cloud provider 카드에서 쓰는 짧은 설명
const cloudTagline: Record<string, string> = {
  openai_api: '고급 분석·전략용 AI',
  gemini_api: '빠른 초안·요약용 AI',
  claude_api: '기획·카피라이팅용 AI'
};

const placeholderNote = (p: AIProviderDefinition): string => {
  switch (p.type) {
    case 'gpt_subscription_experimental':
      return '실험 후보 · GODO 정식 AI 아님 · 기본 비활성화';
    case 'company_local_llm':
      return '준비 중 · 회사 서버 연결 후 사용';
    default:
      return '준비 중';
  }
};

const isCloud = (p: AIProviderDefinition): boolean =>
  p.type === 'openai_api' || p.type === 'gemini_api' || p.type === 'claude_api';

type ConnectFeedback = { status: 'idle' | 'testing' | 'connected' | 'error' | 'info'; message: string };

export const AiProviderFoundationPanel: React.FC<AiProviderFoundationPanelProps> = ({ onAddLog }) => {
  const providers: AIProviderDefinition[] = defaultAIProviders;

  // LM Studio 실연결 테스트
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AIProviderTestResult>>({});
  const setResult = (r: AIProviderTestResult) => setResults(prev => ({ ...prev, [r.providerId]: r }));

  // cloud 카드 연결 입력
  const [keyInput, setKeyInput] = useState<Record<string, string>>({});
  const [modelChoice, setModelChoice] = useState<Record<string, string>>({});
  const [customModel, setCustomModel] = useState<Record<string, string>>({});
  const [connectFeedback, setConnectFeedback] = useState<Record<string, ConnectFeedback>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [vaultVersion, setVaultVersion] = useState(0);
  const bumpVault = () => setVaultVersion(v => v + 1);

  // 카드별 채팅 테스트 (접이식)
  const [chatOpen, setChatOpen] = useState<Record<string, boolean>>({});
  const [cardQuestion, setCardQuestion] = useState<Record<string, string>>({});
  const [cardChatRunning, setCardChatRunning] = useState<string | null>(null);
  const [cardChatResult, setCardChatResult] = useState<Record<string, ProviderChatResult>>({});

  const resolveModel = (providerId: string): string => {
    const choice = modelChoice[providerId] ?? (getProviderModel(providerId) || getDefaultCloudModel(providerId));
    if (choice === CUSTOM_MODEL) return (customModel[providerId] || '').trim();
    return choice;
  };

  // ===== LM Studio 실연결 테스트 =====
  const handleTestLmStudio = async (provider: AIProviderDefinition) => {
    if (!isLocalDev) return;
    const endpoint = provider.defaultEndpoint;
    setTestingId(provider.id);
    setResult({ providerId: provider.id, status: 'testing', message: '연결 테스트 중...' });
    onAddLog(`[AI Provider] ${provider.name} 연결 테스트 시작 (endpoint: ${endpoint})`, 'info', 'AI Provider');

    const modelsRes = await getModels(endpoint);
    if (!modelsRes.success) {
      const kind = modelsRes.errorKind || 'unknown';
      setTestingId(null);
      setResult({ providerId: provider.id, status: 'disconnected', errorKind: kind, message: errorKindMessage[kind] || errorKindMessage.unknown });
      onAddLog(`[AI Provider] ${provider.name} 모델 목록 조회 실패 [${kind}]`, 'error', 'AI Provider');
      return;
    }
    const detected = detectModelId(modelsRes.data || []);
    if (!detected) {
      setTestingId(null);
      setResult({ providerId: provider.id, status: 'no_model', message: NO_MODEL_MESSAGE });
      return;
    }
    const chatRes = await getChatCompletion([{ role: 'user', content: LMS_TEST_PROMPT }], detected, endpoint);
    setTestingId(null);
    const ok = chatRes.success && chatRes.debug.objectType === 'chat.completion' && !!chatRes.content;
    if (ok) {
      setResult({
        providerId: provider.id,
        status: 'connected',
        detectedModel: detected,
        responseExcerpt: (chatRes.content || '').trim().slice(0, 160),
        latencyMs: chatRes.latency,
        message: 'LM Studio 로컬 모델이 정상 응답했습니다.'
      });
      onAddLog(`[AI Provider] ${provider.name} 연결 성공 · model:${detected} · ${chatRes.latency ?? 0}ms`, 'success', 'AI Provider');
    } else {
      const kind = chatRes.errorKind || (chatRes.success ? 'bad_response' : 'unknown');
      setResult({
        providerId: provider.id,
        status: kind === 'model_not_found' ? 'no_model' : 'error',
        detectedModel: detected,
        errorKind: kind,
        message: errorKindMessage[kind] || errorKindMessage.unknown
      });
      onAddLog(`[AI Provider] ${provider.name} chat 실패 [${kind}]`, 'error', 'AI Provider');
    }
  };

  // ===== cloud 카드 연결 =====
  const handleSaveKey = (providerId: string, label: string) => {
    const key = (keyInput[providerId] || '').trim();
    if (!key) {
      setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'info', message: '연결 키를 먼저 붙여넣어 주세요.' } }));
      return;
    }
    saveProviderKey(providerId, key);
    const model = resolveModel(providerId);
    if (model) saveProviderModel(providerId, model);
    setKeyInput(prev => ({ ...prev, [providerId]: '' }));
    bumpVault();
    setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'info', message: '저장되었습니다. 이 브라우저에서 다시 사용할 수 있습니다.' } }));
    onAddLog(`[AI Provider] ${label} 연결 키 저장됨 (브라우저 보관, 키 미노출)`, 'success', 'AI Provider');
  };

  const handleDeleteKey = (providerId: string, label: string) => {
    deleteProviderKey(providerId);
    bumpVault();
    setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'info', message: '연결 키를 삭제했습니다.' } }));
    onAddLog(`[AI Provider] ${label} 연결 키 삭제됨`, 'warning', 'AI Provider');
  };

  const handleConnectCheck = async (providerId: string, label: string) => {
    const typed = (keyInput[providerId] || '').trim();
    const keyToUse = typed || getProviderKey(providerId) || '';
    if (!keyToUse) {
      setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'info', message: '연결 키를 먼저 붙여넣어 주세요.' } }));
      return;
    }
    const model = resolveModel(providerId) || getDefaultCloudModel(providerId);
    setConnectingId(providerId);
    setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'testing', message: '연결을 확인하고 있습니다...' } }));
    onAddLog(`[AI Provider] ${label} 연결 확인 시작 (model: ${model})`, 'info', 'AI Provider');

    const result = await chatWithProvider({
      providerId,
      purpose: 'connection_test',
      apiKeyOverride: keyToUse,
      modelIdOverride: model,
      messages: [{ role: 'user', content: CONNECT_TEST_PROMPT }]
    });
    setConnectingId(null);
    if (result.ok) {
      setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'connected', message: '연결되었습니다. 이 AI를 사용할 수 있습니다.' } }));
      onAddLog(`[AI Provider] ${label} 연결 확인 성공 · model:${result.modelId} · ${result.latencyMs ?? 0}ms`, 'success', 'AI Provider');
    } else {
      const kind = result.errorKind || 'unknown';
      setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'error', message: chatErrorMessage[kind] || chatErrorMessage.unknown } }));
      onAddLog(`[AI Provider] ${label} 연결 확인 실패 [${kind}]`, 'error', 'AI Provider');
    }
  };

  // ===== 카드별 채팅 테스트 =====
  const handleCardChat = async (provider: AIProviderDefinition) => {
    const providerId = provider.id;
    const local = provider.type === 'local_lmstudio';
    if (local && !isLocalDev) return;
    const q = (cardQuestion[providerId] ?? DEFAULT_QUESTION).trim();
    if (!q) return;

    setCardChatRunning(providerId);
    setCardChatResult(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    const modelOverride = local ? undefined : (resolveModel(providerId) || getDefaultCloudModel(providerId));
    onAddLog(`[AI Provider] 채팅 테스트 · AI:${provider.name}${modelOverride ? ` · model:${modelOverride}` : ''}`, 'info', 'AI Provider');

    const result = await chatWithProvider({
      providerId,
      purpose: 'chat_playground',
      modelIdOverride: modelOverride,
      messages: [{ role: 'user', content: q }]
    });
    setCardChatRunning(null);
    setCardChatResult(prev => ({ ...prev, [providerId]: result }));
    onAddLog(
      result.ok
        ? `[AI Provider] 채팅 테스트 성공 · AI:${provider.name} · ${result.latencyMs ?? 0}ms`
        : `[AI Provider] 채팅 테스트 실패 [${result.errorKind ?? 'unknown'}] · AI:${provider.name}`,
      result.ok ? 'success' : 'error',
      'AI Provider'
    );
  };

  // cloud 카드 status badge
  const cloudStatus = (providerId: string): AIProviderStatus => {
    void vaultVersion;
    if (connectFeedback[providerId]?.status === 'connected') return 'connected';
    return hasProviderKey(providerId) ? 'connected' : 'not_configured';
  };

  const renderModelSelect = (providerId: string) => {
    const options = CLOUD_MODEL_OPTIONS[providerId] || [];
    const current = modelChoice[providerId] ?? (getProviderModel(providerId) || getDefaultCloudModel(providerId));
    return (
      <div className="aip-field">
        <label className="aip-field-label">사용할 모델</label>
        <select className="aip-select" value={current} onChange={e => setModelChoice(prev => ({ ...prev, [providerId]: e.target.value }))}>
          {options.map(m => <option key={m} value={m}>{m}</option>)}
          <option value={CUSTOM_MODEL}>직접 입력</option>
        </select>
        {current === CUSTOM_MODEL && (
          <input
            type="text"
            className="aip-text-input aip-custom-model"
            placeholder={`예: ${getDefaultCloudModel(providerId) || '모델 이름을 직접 입력'}`}
            value={customModel[providerId] || ''}
            onChange={e => setCustomModel(prev => ({ ...prev, [providerId]: e.target.value }))}
            autoFocus
          />
        )}
      </div>
    );
  };

  const renderChatTest = (provider: AIProviderDefinition) => {
    const providerId = provider.id;
    const open = !!chatOpen[providerId];
    const running = cardChatRunning === providerId;
    const result = cardChatResult[providerId];
    return (
      <div className="aip-cardchat">
        <button
          type="button"
          className="aip-chat-toggle"
          onClick={() => setChatOpen(prev => ({ ...prev, [providerId]: !prev[providerId] }))}
        >
          {open ? '▾ 채팅 테스트 닫기' : '▸ 이 AI로 채팅 테스트'}
        </button>
        {open && (
          <div className="aip-cardchat-body">
            <textarea
              className="aip-textarea"
              rows={2}
              value={cardQuestion[providerId] ?? DEFAULT_QUESTION}
              onChange={e => setCardQuestion(prev => ({ ...prev, [providerId]: e.target.value }))}
            />
            <button type="button" className="aip-btn primary" disabled={running} onClick={() => handleCardChat(provider)}>
              {running ? '⏳ 보내는 중...' : '▶ 보내기'}
            </button>
            {result && (
              <div className={`aip-result ${result.ok ? 'result-connected' : 'result-error'}`}>
                {result.ok ? (
                  <>
                    <div className="aip-result-line"><strong>응답 성공</strong></div>
                    {result.modelId && <div className="aip-result-line mono">모델: {result.modelId}</div>}
                    {typeof result.latencyMs === 'number' && <div className="aip-result-line">응답 시간: {(result.latencyMs / 1000).toFixed(1)}초</div>}
                    {result.content && <div className="aip-result-line excerpt">응답: {result.content.trim().slice(0, 400)}</div>}
                  </>
                ) : (
                  <div className="aip-result-line"><strong>응답 실패</strong>: {chatErrorMessage[result.errorKind ?? 'unknown'] || result.errorMessage || '실패'}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ===== 카드 렌더 =====
  const renderCloudCard = (p: AIProviderDefinition) => {
    void vaultVersion;
    const status = cloudStatus(p.id);
    const fb = connectFeedback[p.id];
    const savedMask = hasProviderKey(p.id) ? maskProviderKey(getProviderKey(p.id) || '') : '';
    return (
      <div key={p.id} className="aip-card is-connect">
        <div className="aip-card-head">
          <span className="aip-card-name">{p.name}</span>
          <span className={`aip-status-badge status-${status}`}>{statusLabel[status]}</span>
        </div>
        <p className="aip-card-desc">{cloudTagline[p.type] || p.description}</p>

        <div className="aip-field">
          <label className="aip-field-label">연결 키</label>
          <input
            type="password"
            className="aip-text-input"
            placeholder={savedMask ? `저장됨: ${savedMask} (새 키 입력 시 교체)` : '연결 키를 붙여넣으세요'}
            value={keyInput[p.id] || ''}
            onChange={e => setKeyInput(prev => ({ ...prev, [p.id]: e.target.value }))}
            autoComplete="off"
          />
        </div>

        {renderModelSelect(p.id)}

        <div className="aip-connect-actions">
          <button type="button" className="aip-btn primary" disabled={connectingId === p.id} onClick={() => handleConnectCheck(p.id, p.name)}>
            {connectingId === p.id ? '⏳ 연결 확인 중...' : '연결 확인'}
          </button>
          <button type="button" className="aip-btn ghost" onClick={() => handleSaveKey(p.id, p.name)}>저장</button>
          <button type="button" className="aip-btn ghost danger" onClick={() => handleDeleteKey(p.id, p.name)}>삭제</button>
        </div>

        {fb && fb.status !== 'idle' && <div className={`aip-connect-feedback fb-${fb.status}`}>{fb.message}</div>}

        {renderChatTest(p)}
      </div>
    );
  };

  const renderLmStudioCard = (p: AIProviderDefinition) => {
    const status = results[p.id]?.status ?? p.status;
    const result = results[p.id];
    return (
      <div key={p.id} className="aip-card is-local">
        <div className="aip-card-head">
          <span className="aip-card-name">{p.name}</span>
          <span className={`aip-status-badge status-${status}`}>{isLocalDev ? statusLabel[status] : '개발 환경 전용'}</span>
        </div>
        <p className="aip-card-desc">{p.description}</p>
        <div className="aip-meta-row">
          <span className="aip-endpoint mono">{p.defaultEndpoint}</span>
        </div>
        <div className="aip-actions">
          {isLocalDev && (
            <p className="aip-coldstart-note">
              SuperGemma4 26B 모델은 첫 호출 시 모델 로딩 때문에 1분 이상 걸릴 수 있습니다. 처음 실패하더라도 모델이 로드된 뒤 다시 시도해 주세요.
            </p>
          )}
          <button
            type="button"
            className="aip-btn primary"
            disabled={!isLocalDev || testingId !== null}
            title={isLocalDev ? undefined : '운영 환경에서는 로컬 LM Studio 테스트를 사용할 수 없습니다.'}
            onClick={() => handleTestLmStudio(p)}
          >
            {!isLocalDev ? '운영 환경에서는 테스트 불가 (Local dev 전용)' : testingId === p.id ? '⏳ 연결 테스트 중...' : '🔌 연결 확인'}
          </button>
        </div>
        {result && (
          <div className={`aip-result result-${result.status}`}>
            {result.status === 'connected' ? (
              <>
                <div className="aip-result-line"><strong>연결 성공</strong>: {result.message}</div>
                {result.detectedModel && <div className="aip-result-line mono">모델: {result.detectedModel}</div>}
                {typeof result.latencyMs === 'number' && <div className="aip-result-line">지연시간: {result.latencyMs}ms</div>}
              </>
            ) : result.status === 'testing' ? (
              <div className="aip-result-line">테스트 진행 중...</div>
            ) : (
              <div className="aip-result-line"><strong>연결 실패</strong>: {result.message}</div>
            )}
          </div>
        )}
        {isLocalDev && renderChatTest(p)}
        {!isLocalDev && (
          <p className="aip-connect-hint">다른 컴퓨터나 정식 도메인에서는 OpenAI, Gemini, Claude 연결을 사용하세요.</p>
        )}
      </div>
    );
  };

  const renderPlaceholderCard = (p: AIProviderDefinition) => {
    const status = p.status;
    return (
      <div key={p.id} className="aip-card is-placeholder">
        <div className="aip-card-head">
          <span className="aip-card-name">{p.name}</span>
          <span className={`aip-status-badge status-${status}`}>{statusLabel[status]}</span>
        </div>
        <p className="aip-card-desc">{p.description}</p>
        <div className="aip-placeholder-note">{placeholderNote(p)}</div>
      </div>
    );
  };

  return (
    <div className="aip-pane">
      <div className="aip-intro">
        <h3 className="aip-section-title">🧩 AI 모델 연결</h3>
        <p className="aip-section-desc">
          GODO에서 사용할 AI를 카드에서 바로 연결하세요. OpenAI·Gemini·Claude는 연결 키를 붙여넣고 “연결 확인” →
          “저장”을 누르면 됩니다. 연결 후 카드 안에서 바로 채팅 테스트를 할 수 있습니다.
        </p>
        <p className="aip-privacy-note">🔒 연결 키는 현재 브라우저에 저장됩니다. 공용 PC에서는 사용 후 삭제하세요.</p>
        {!isLocalDev && (
          <p className="aip-env-banner">
            ⚠️ 지금은 운영(배포) 환경입니다. OpenAI·Gemini·Claude는 그대로 사용할 수 있고, LM Studio Local은 이 컴퓨터에서 <code>npm run dev</code>로 실행할 때만 사용할 수 있습니다.
          </p>
        )}
      </div>

      <div className="aip-grid">
        {providers.map(p => {
          if (isCloud(p)) return renderCloudCard(p);
          if (p.type === 'local_lmstudio') return renderLmStudioCard(p);
          return renderPlaceholderCard(p);
        })}
      </div>
    </div>
  );
};
