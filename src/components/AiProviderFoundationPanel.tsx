// AI Provider Foundation + AI 연결 마법사 v0
//
// 구성:
//  1) Provider 슬롯 개요(grid) — 상태 한눈에 보기. LM Studio는 로컬 dev에서 실연결 테스트.
//  2) AI 모델 연결(마법사) — OpenAI / Gemini / Claude 연결 키를 붙여넣고 모델 선택 + 연결 확인.
//  3) 모델 선택 채팅 테스트 — 사용할 AI를 골라 실제로 한 문장 받아보기.
//
// 보안(조용한 안전장치): 키 입력은 password, 저장 키는 마스킹 표시, console.log 금지,
//  응답/에러에 키 미포함. 실제 cloud 호출은 서버 route가 요청 단위로만 키를 사용(미저장).

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

// 로컬 dev 환경 여부. dev 빌드이거나 localhost/127.0.0.1 호스트면 로컬로 본다.
const isLocalDev: boolean =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

// 모델 id를 폭넓게 감지(특정 모델명 하드코딩 금지)
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

// chatWithProvider/cloud 결과 errorKind → 사용자 친화 한국어
const chatErrorMessage: Record<string, string> = {
  not_configured: '아직 연결되지 않았습니다. 연결 키를 붙여넣고 저장해 주세요.',
  provider_disabled: 'GODO에서 사용하는 정식 AI가 아니어서 호출하지 않습니다.',
  server_off: 'LM Studio 서버에 연결할 수 없습니다. Local Server가 켜져 있는지 확인하세요.',
  endpoint_not_found: '연결 경로를 찾지 못했습니다. 설정을 다시 확인해 주세요.',
  no_model: NO_MODEL_MESSAGE,
  model_not_found: NO_MODEL_MESSAGE,
  missing_key: '연결 키를 먼저 붙여넣어 주세요.',
  invalid_key: '연결 키가 올바르지 않습니다. 복사한 키를 다시 확인해 주세요.',
  rate_limited: '요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 다른 AI를 선택해 주세요.',
  quota_exceeded: '사용 한도를 모두 사용했습니다. 결제/한도를 확인하거나 다른 AI를 선택해 주세요.',
  timeout: '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  bad_response: '응답을 받지 못했습니다. 모델 이름을 확인하고 다시 시도해 주세요.',
  provider_error: 'AI 서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  network_error: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unknown: '알 수 없는 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
};

const placeholderNote = (p: AIProviderDefinition): string => {
  switch (p.type) {
    case 'gpt_subscription_experimental':
      return '실험 후보 · GODO 정식 AI 아님 · 기본 비활성화';
    case 'company_local_llm':
      return '준비 중 · 회사 서버 연결 후 사용';
    default:
      return '아래 “AI 모델 연결”에서 연결 키를 붙여넣어 사용하세요';
  }
};

// 연결 마법사에 노출할 cloud 카드 정의
const CLOUD_CONNECT: { id: string; label: string; hint: string }[] = [
  { id: 'openai_api', label: 'OpenAI 연결', hint: 'OpenAI 연결 키를 붙여넣으세요. 키는 비밀번호처럼 가려져 표시됩니다.' },
  { id: 'gemini_api', label: 'Gemini 연결', hint: 'Gemini 연결 키를 붙여넣으세요.' },
  { id: 'claude_api', label: 'Claude 연결', hint: 'Claude 연결 키를 붙여넣으세요.' }
];

// 채팅 테스트에서 고를 수 있는 AI 목록
const CHAT_AIS: { id: string; label: string; isLocal: boolean }[] = [
  { id: 'local_lmstudio', label: 'LM Studio Local', isLocal: true },
  { id: 'openai_api', label: 'OpenAI', isLocal: false },
  { id: 'gemini_api', label: 'Gemini', isLocal: false },
  { id: 'claude_api', label: 'Claude', isLocal: false }
];

const aiDisplayName = (providerId: string): string =>
  CHAT_AIS.find(a => a.id === providerId)?.label || providerId;

type ConnectFeedback = { status: 'idle' | 'testing' | 'connected' | 'error' | 'info'; message: string };

export const AiProviderFoundationPanel: React.FC<AiProviderFoundationPanelProps> = ({ onAddLog }) => {
  const providers: AIProviderDefinition[] = defaultAIProviders;

  // --- 1) grid: LM Studio 실연결 테스트 상태 ---
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AIProviderTestResult>>({});
  const setResult = (r: AIProviderTestResult) => setResults(prev => ({ ...prev, [r.providerId]: r }));

  // --- 2) 연결 마법사 상태 ---
  const [keyInput, setKeyInput] = useState<Record<string, string>>({});
  const [modelChoice, setModelChoice] = useState<Record<string, string>>({});
  const [customModel, setCustomModel] = useState<Record<string, string>>({});
  const [connectFeedback, setConnectFeedback] = useState<Record<string, ConnectFeedback>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [vaultVersion, setVaultVersion] = useState(0); // 저장/삭제 후 마스킹 재읽기용
  const bumpVault = () => setVaultVersion(v => v + 1);

  // --- 3) 모델 선택 채팅 테스트 상태 ---
  const [selectedAi, setSelectedAi] = useState<string>('local_lmstudio');
  const [chatModelChoice, setChatModelChoice] = useState<Record<string, string>>({});
  const [chatCustomModel, setChatCustomModel] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState<string>(DEFAULT_QUESTION);
  const [runningChat, setRunningChat] = useState(false);
  const [chatResult, setChatResult] = useState<ProviderChatResult | null>(null);

  // 선택된 모델 해석 (preset 또는 직접 입력)
  const resolveModel = (
    providerId: string,
    choiceMap: Record<string, string>,
    customMap: Record<string, string>
  ): string => {
    const choice = choiceMap[providerId] ?? (getProviderModel(providerId) || getDefaultCloudModel(providerId));
    if (choice === CUSTOM_MODEL) return (customMap[providerId] || '').trim();
    return choice;
  };

  // ===== grid: LM Studio 실연결 테스트 =====
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

  const effectiveStatus = (p: AIProviderDefinition): AIProviderStatus => results[p.id]?.status ?? p.status;

  // ===== 연결 마법사 =====
  const handleSaveKey = (providerId: string, label: string) => {
    const key = (keyInput[providerId] || '').trim();
    if (!key) {
      setConnectFeedback(prev => ({ ...prev, [providerId]: { status: 'info', message: '연결 키를 먼저 붙여넣어 주세요.' } }));
      return;
    }
    saveProviderKey(providerId, key);
    const model = resolveModel(providerId, modelChoice, customModel);
    if (model) saveProviderModel(providerId, model);
    setKeyInput(prev => ({ ...prev, [providerId]: '' })); // 입력창에서 원문 제거
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
    const model = resolveModel(providerId, modelChoice, customModel) || getDefaultCloudModel(providerId);
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

  // ===== 모델 선택 채팅 테스트 =====
  const handleSendChat = async () => {
    const ai = CHAT_AIS.find(a => a.id === selectedAi);
    if (!ai) return;
    if (ai.isLocal && !isLocalDev) return; // 로컬 AI는 dev에서만
    const q = (question || '').trim();
    if (!q) return;

    setRunningChat(true);
    setChatResult(null);
    const modelOverride = ai.isLocal ? undefined : (resolveModel(selectedAi, chatModelChoice, chatCustomModel) || getDefaultCloudModel(selectedAi));
    onAddLog(`[AI Provider] 채팅 테스트 시작 · AI:${ai.label}${modelOverride ? ` · model:${modelOverride}` : ''}`, 'info', 'AI Provider');

    const result = await chatWithProvider({
      providerId: selectedAi,
      purpose: 'chat_playground',
      modelIdOverride: modelOverride,
      messages: [{ role: 'user', content: q }]
    });
    setRunningChat(false);
    setChatResult(result);
    if (result.ok) {
      onAddLog(`[AI Provider] 채팅 테스트 성공 · AI:${ai.label} · model:${result.modelId} · ${result.latencyMs ?? 0}ms`, 'success', 'AI Provider');
    } else {
      onAddLog(`[AI Provider] 채팅 테스트 실패 [${result.errorKind ?? 'unknown'}] · AI:${ai.label}`, 'error', 'AI Provider');
    }
  };

  // 모델 select 렌더 헬퍼
  const renderModelSelect = (
    providerId: string,
    choiceMap: Record<string, string>,
    setChoice: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    customMap: Record<string, string>,
    setCustom: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => {
    const options = CLOUD_MODEL_OPTIONS[providerId] || [];
    const current = choiceMap[providerId] ?? (getProviderModel(providerId) || getDefaultCloudModel(providerId));
    return (
      <div className="aip-field">
        <label className="aip-field-label">사용할 모델</label>
        <select
          className="aip-select"
          value={current}
          onChange={e => setChoice(prev => ({ ...prev, [providerId]: e.target.value }))}
        >
          {options.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={CUSTOM_MODEL}>직접 입력</option>
        </select>
        {current === CUSTOM_MODEL && (
          <input
            type="text"
            className="aip-text-input"
            placeholder="모델 이름을 직접 입력"
            value={customMap[providerId] || ''}
            onChange={e => setCustom(prev => ({ ...prev, [providerId]: e.target.value }))}
          />
        )}
      </div>
    );
  };

  return (
    <div className="aip-pane">
      <div className="aip-intro">
        <h3 className="aip-section-title">🧩 AI Provider Foundation</h3>
        <p className="aip-section-desc">
          GODO에서 사용할 AI 두뇌(로컬/클라우드)를 연결하고 선택하는 곳입니다.
          아래 <strong>AI 모델 연결</strong>에서 OpenAI·Gemini·Claude 연결 키를 붙여넣고, 원하는 AI로 바로 채팅 테스트할 수 있습니다.
        </p>
        {!isLocalDev && (
          <p className="aip-env-banner">
            ⚠️ 지금은 운영(배포) 환경입니다. OpenAI·Gemini·Claude는 그대로 사용할 수 있고,
            LM Studio Local은 이 컴퓨터에서 <code>npm run dev</code>로 실행할 때만 사용할 수 있습니다.
          </p>
        )}
      </div>

      {/* 1) Provider 슬롯 개요 */}
      <div className="aip-grid">
        {providers.map(p => {
          const status = effectiveStatus(p);
          const result = results[p.id];
          const isLmStudio = p.type === 'local_lmstudio';
          return (
            <div key={p.id} className={`aip-card ${isLmStudio ? 'is-local' : 'is-placeholder'}`}>
              <div className="aip-card-head">
                <span className="aip-card-name">{p.name}</span>
                <span className={`aip-status-badge status-${status}`}>{statusLabel[status]}</span>
              </div>
              <p className="aip-card-desc">{p.description}</p>
              <div className="aip-meta-row">
                <span className={`aip-risk risk-${p.riskLevel}`}>RISK: {p.riskLevel.toUpperCase()}</span>
                <span className="aip-prod">{p.isProductionSafe ? '운영 환경 사용 가능' : '운영 환경에서는 사용 안 함'}</span>
                {p.defaultEndpoint && <span className="aip-endpoint mono">{p.defaultEndpoint}</span>}
              </div>
              {isLmStudio ? (
                <div className="aip-actions">
                  {isLocalDev && (
                    <p className="aip-coldstart-note">
                      SuperGemma4 26B 모델은 첫 호출 시 모델 로딩 때문에 1분 이상 걸릴 수 있습니다.
                      처음 실패하더라도 모델이 로드된 뒤 다시 시도해 주세요.
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
              {result && isLmStudio && (
                <div className={`aip-result result-${result.status}`}>
                  {result.status === 'connected' ? (
                    <>
                      <div className="aip-result-line"><strong>연결 성공</strong>: {result.message}</div>
                      {result.detectedModel && <div className="aip-result-line mono">모델: {result.detectedModel}</div>}
                      {typeof result.latencyMs === 'number' && <div className="aip-result-line">지연시간: {result.latencyMs}ms</div>}
                      {result.responseExcerpt && <div className="aip-result-line excerpt">응답: {result.responseExcerpt}</div>}
                    </>
                  ) : result.status === 'testing' ? (
                    <div className="aip-result-line">테스트 진행 중...</div>
                  ) : (
                    <div className="aip-result-line"><strong>연결 실패</strong>: {result.message}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2) AI 모델 연결 (마법사) */}
      <div className="aip-wizard">
        <h3 className="aip-section-title">🔑 AI 모델 연결</h3>
        <p className="aip-section-desc">
          OpenAI, Gemini, Claude 또는 로컬 LM Studio를 연결해 GODO에서 사용할 AI를 선택할 수 있습니다.
          연결 키를 붙여넣고 “연결 확인”을 누르면 바로 테스트할 수 있습니다.
        </p>
        <p className="aip-privacy-note">🔒 연결 키는 현재 브라우저에 저장됩니다. 공용 PC에서는 사용 후 삭제하세요.</p>

        <div className="aip-connect-grid">
          {CLOUD_CONNECT.map(c => {
            const saved = (() => { void vaultVersion; return hasProviderKey(c.id) ? maskProviderKey(getProviderKey(c.id) || '') : ''; })();
            const fb = connectFeedback[c.id];
            return (
              <div key={c.id} className="aip-connect-card">
                <div className="aip-connect-head">
                  <span className="aip-card-name">{c.label}</span>
                  {saved
                    ? <span className="aip-status-badge status-connected">연결됨</span>
                    : <span className="aip-status-badge status-not_configured">아직 연결 전</span>}
                </div>
                <p className="aip-connect-hint">{c.hint}</p>

                <div className="aip-field">
                  <label className="aip-field-label">연결 키</label>
                  <input
                    type="password"
                    className="aip-text-input"
                    placeholder={saved ? `저장됨: ${saved} (새 키 입력 시 교체)` : '연결 키를 붙여넣으세요'}
                    value={keyInput[c.id] || ''}
                    onChange={e => setKeyInput(prev => ({ ...prev, [c.id]: e.target.value }))}
                    autoComplete="off"
                  />
                </div>

                {renderModelSelect(c.id, modelChoice, setModelChoice, customModel, setCustomModel)}

                <div className="aip-connect-actions">
                  <button
                    type="button"
                    className="aip-btn primary"
                    disabled={connectingId === c.id}
                    onClick={() => handleConnectCheck(c.id, c.label)}
                  >
                    {connectingId === c.id ? '⏳ 연결 확인 중...' : '연결 확인'}
                  </button>
                  <button type="button" className="aip-btn ghost" onClick={() => handleSaveKey(c.id, c.label)}>저장</button>
                  <button type="button" className="aip-btn ghost danger" onClick={() => handleDeleteKey(c.id, c.label)}>삭제</button>
                </div>

                {fb && fb.status !== 'idle' && (
                  <div className={`aip-connect-feedback fb-${fb.status}`}>{fb.message}</div>
                )}
              </div>
            );
          })}

          {/* LM Studio 안내 카드 */}
          <div className="aip-connect-card aip-lms-note-card">
            <div className="aip-connect-head">
              <span className="aip-card-name">LM Studio Local</span>
              <span className="aip-status-badge status-not_configured">개발 환경 전용</span>
            </div>
            <p className="aip-connect-hint">
              LM Studio는 이 컴퓨터에서 직접 실행할 때만 사용할 수 있습니다.
              다른 컴퓨터나 정식 도메인에서는 OpenAI, Gemini, Claude 연결을 사용하세요.
            </p>
            <p className="aip-connect-hint mono">연결 테스트는 위쪽 “LM Studio Local” 카드에서 할 수 있습니다.</p>
          </div>
        </div>
      </div>

      {/* 3) 모델 선택 채팅 테스트 */}
      <div className="aip-chattest-card">
        <div className="aip-chattest-head">
          <span className="aip-chattest-title">💬 모델 선택 채팅 테스트</span>
        </div>
        <p className="aip-chattest-desc">사용할 AI를 고르고 질문을 보내 실제 응답을 확인합니다. 연결 키가 저장된 AI만 응답합니다.</p>

        <div className="aip-field">
          <label className="aip-field-label">사용할 AI 선택</label>
          <div className="aip-ai-choices">
            {CHAT_AIS.map(a => (
              <button
                key={a.id}
                type="button"
                className={`aip-ai-chip ${selectedAi === a.id ? 'active' : ''}`}
                onClick={() => setSelectedAi(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {selectedAi !== 'local_lmstudio' ? (
          renderModelSelect(selectedAi, chatModelChoice, setChatModelChoice, chatCustomModel, setChatCustomModel)
        ) : (
          <p className="aip-connect-hint mono">모델: 로컬에 로드된 모델 자동 감지 (supergemma4 등)</p>
        )}

        <div className="aip-field">
          <label className="aip-field-label">질문</label>
          <textarea
            className="aip-textarea"
            rows={2}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
        </div>

        {selectedAi === 'local_lmstudio' && !isLocalDev ? (
          <button type="button" className="aip-btn primary" disabled title="운영 환경에서는 로컬 AI를 사용할 수 없습니다.">
            로컬 AI는 개발 환경에서만 사용할 수 있습니다
          </button>
        ) : (
          <button type="button" className="aip-btn primary" disabled={runningChat} onClick={handleSendChat}>
            {runningChat ? '⏳ 보내는 중...' : '▶ 보내기'}
          </button>
        )}

        {chatResult && (
          <div className={`aip-result ${chatResult.ok ? 'result-connected' : 'result-error'}`}>
            {chatResult.ok ? (
              <>
                <div className="aip-result-line"><strong>응답 성공</strong></div>
                <div className="aip-result-line">AI: {aiDisplayName(chatResult.providerId)}</div>
                {chatResult.modelId && <div className="aip-result-line mono">모델: {chatResult.modelId}</div>}
                {typeof chatResult.latencyMs === 'number' && <div className="aip-result-line">응답 시간: {(chatResult.latencyMs / 1000).toFixed(1)}초</div>}
                {chatResult.content && <div className="aip-result-line excerpt">응답: {chatResult.content.trim().slice(0, 400)}</div>}
              </>
            ) : (
              <>
                <div className="aip-result-line"><strong>응답 실패</strong></div>
                <div className="aip-result-line">{chatErrorMessage[chatResult.errorKind ?? 'unknown'] || chatResult.errorMessage || '실패'}</div>
                <div className="aip-result-line">AI: {aiDisplayName(chatResult.providerId)}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
