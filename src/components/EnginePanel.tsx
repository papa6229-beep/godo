/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from 'react';
import type { EngineMode, EngineProvider, EngineRoutingRule, EngineSafetyRule, EngineUsageLog } from '../types/engine';
import type { PermissionMatrixItem } from '../types/studio';
import type { LogEntry } from '../types';
import { getModels, getChatCompletion } from '../services/lmsConnector';
import { AiProviderFoundationPanel } from './AiProviderFoundationPanel';
import './EnginePanel.css';

interface EnginePanelProps {
  engineMode: EngineMode;
  engineProviders: EngineProvider[];
  engineRoutingRules: EngineRoutingRule[];
  engineSafetyRules: EngineSafetyRule[];
  engineUsageLogs: EngineUsageLog[];
  onUpdateEngineMode: (mode: EngineMode) => void;
  onUpdateEngineProviders: (providers: EngineProvider[]) => void;
  onUpdateEngineRoutingRules: (rules: EngineRoutingRule[]) => void;
  onUpdateEngineSafetyRules: (rules: EngineSafetyRule[]) => void;
  onUpdateEngineUsageLogs: (logs: EngineUsageLog[]) => void;
  permissionMatrix: PermissionMatrixItem[];
  onAddLog: (text: string, type: LogEntry['type'], agentName?: string) => void;
}

export const EnginePanel: React.FC<EnginePanelProps> = ({
  engineMode,
  engineProviders,
  engineRoutingRules,
  engineSafetyRules,
  engineUsageLogs,
  onUpdateEngineMode,
  onUpdateEngineProviders,
  onUpdateEngineRoutingRules,
  onUpdateEngineSafetyRules,
  onUpdateEngineUsageLogs,
  permissionMatrix,
  onAddLog
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'mode' | 'providers' | 'local' | 'cloud' | 'rules' | 'logs' | 'safety'>('overview');
  
  // TS6133 방지용 매개변수 사용성 부여
  if (onUpdateEngineUsageLogs && typeof onUpdateEngineUsageLogs === 'function') {
    // No-op
  }

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- 1. Overview States & Calculations ---
  const overviewStats = useMemo(() => {
    const totalRouted = engineUsageLogs.length;
    const localCount = engineUsageLogs.filter(l => l.routeType === 'local').length;
    const cloudCount = engineUsageLogs.filter(l => l.routeType === 'cloud').length;
    const hybridCount = engineUsageLogs.filter(l => l.routeType === 'hybrid').length;
    const humanCount = engineUsageLogs.filter(l => l.routeType === 'human').length;

    const localPct = totalRouted > 0 ? Math.round(((localCount + hybridCount * 0.5) / totalRouted) * 100) : 60;
    const cloudPct = totalRouted > 0 ? Math.round(((cloudCount + hybridCount * 0.5) / totalRouted) * 100) : 30;
    const humanPct = totalRouted > 0 ? Math.round((humanCount / totalRouted) * 100) : 10;

    let privacyStatus = 'SAFE (LOCAL PROCESSING)';
    let costStatus = 'LOW (FREE LOCAL)';
    if (engineMode === 'cloud_first') {
      privacyStatus = 'CAUTION (CLOUD SENT)';
      costStatus = 'MEDIUM (API BILLING)';
    } else if (engineMode === 'hybrid_auto') {
      privacyStatus = 'HYBRID SECURED';
      costStatus = 'BALANCED';
    }

    return {
      totalRouted,
      localPct,
      cloudPct,
      humanPct,
      privacyStatus,
      costStatus
    };
  }, [engineUsageLogs, engineMode]);

  // --- 2. Engine Mode State ---
  const [tempMode, setTempMode] = useState<EngineMode>(engineMode);
  useEffect(() => {
    setTempMode(engineMode);
  }, [engineMode]);

  const handleModeSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateEngineMode(tempMode);
    onAddLog(`[Engine] 전역 엔진 처리 모드가 ${tempMode.toUpperCase()}로 변경되었습니다.`, 'success', 'Engine');
    showToast(`전역 엔진 모드가 ${tempMode.toUpperCase()}로 저장되었습니다.`, 'success');
  };

  // --- 3. Local Engine States & Handlers ---
  const [selectedLocalId, setSelectedLocalId] = useState<string>('');
  const lmsGemmaProvider = useMemo(() => {
    return engineProviders.find(p => p.id === 'lms_gemma_4');
  }, [engineProviders]);

  const localEngines = useMemo(() => engineProviders.filter(p => p.type === 'local'), [engineProviders]);
  const activeLocalItem = useMemo(() => {
    return localEngines.find(p => p.id === selectedLocalId) || localEngines[0] || null;
  }, [localEngines, selectedLocalId]);

  useEffect(() => {
    if (activeLocalItem && !selectedLocalId) {
      setSelectedLocalId(activeLocalItem.id);
    }
  }, [activeLocalItem, selectedLocalId]);

  const [testingLocalId, setTestingLocalId] = useState<string | null>(null);
  const [refreshingLocalId, setRefreshingLocalId] = useState<string | null>(null);

  const handleLocalTest = async (id: string) => {
    setTestingLocalId(id);
    const providerItem = engineProviders.find(p => p.id === id);
    
    if (id === 'lms_gemma_4') {
      const modelId = providerItem?.modelName || 'google/gemma-4-e4b';
      onAddLog(`[Engine] 로컬 엔진 [${providerItem?.name}] LM Studio 연결 테스트를 시작합니다. (Endpoint: ${providerItem?.endpoint}, Model: ${modelId})`, 'info', 'Engine');

      // 실제 chat completion 호출로 검증 (프롬프트 전문은 로그하지 않음)
      const result = await getChatCompletion(
        [{ role: 'user', content: 'ping' }],
        modelId,
        providerItem?.endpoint
      );
      const elapsed = result.latency ?? 0;

      setTestingLocalId(null);

      // 디버그 라인: method / finalUrl / status / object type 만 기록
      const objectType = result.debug.objectType ?? 'n/a';
      onAddLog(
        `[Engine] LM Studio 호출 → method: ${result.debug.method} | finalUrl: ${result.debug.finalUrl} | upstream: ${result.debug.upstreamUrl} | status: ${result.debug.status ?? 'N/A'} | object: ${objectType}`,
        'info',
        'Engine'
      );

      // 성공 기준: HTTP 200 && object === "chat.completion" && content 존재
      const isChatCompletion = result.debug.objectType === 'chat.completion';
      const ok = result.success && isChatCompletion && !!result.content;

      if (ok) {
        const updated = engineProviders.map(p =>
          p.id === id
            ? { ...p, status: 'connected' as const, modelName: modelId, lastLatency: elapsed, lastTestTime: new Date().toLocaleString() }
            : p
        );
        onUpdateEngineProviders(updated);

        onUpdateEngineUsageLogs([...engineUsageLogs, {
          id: `usage-test-${Date.now()}`,
          timestamp: new Date().toTimeString().split(' ')[0],
          taskId: 'connection_test',
          taskTitle: 'Gemma 4 E4B Connection Test',
          agentId: 'system',
          routeType: 'local' as const,
          providerId: 'lms_gemma_4',
          modelName: modelId,
          reason: `[taskType: connection_test] [latency: ${elapsed}ms] [status: connected] [object: ${objectType}]`,
          status: 'completed' as const
        }]);

        onAddLog(`[Engine] 로컬 엔진 [Gemma 4 E4B] 연결 성공! (object: chat.completion, 지연시간: ${elapsed}ms)`, 'success', 'Engine');
        showToast(`Gemma 4 E4B 연결 테스트 성공! (${elapsed}ms)`, 'success');
      } else {
        // 실패 원인 세분화 메시지
        const reasonByKind: Record<string, string> = {
          endpoint_not_found: 'LM Studio chat endpoint path mismatch (404). baseUrl이 /v1 인지 확인하세요.',
          server_off: 'LM Studio server off (연결 거부). 서버가 127.0.0.1:1234 에서 실행 중인지 확인하세요.',
          model_not_found: `model id mismatch. 모델 [${modelId}] 이 LM Studio에 로드되어 있는지 확인하세요.`,
          timeout: 'model response timeout (30s 초과).',
          bad_response: result.success
            ? `응답 형식 불일치 (object: ${objectType}). chat.completion 이 아닙니다.`
            : `예상치 못한 HTTP 응답 (status: ${result.debug.status ?? 'N/A'}).`,
          unknown: result.error || 'Unknown error'
        };
        const kind = result.errorKind || (result.success ? 'bad_response' : 'unknown');
        const reason = reasonByKind[kind] || result.error || 'Unknown error';

        const updated = engineProviders.map(p =>
          p.id === id
            ? { ...p, status: 'error' as const, lastLatency: undefined, lastTestTime: new Date().toLocaleString() }
            : p
        );
        onUpdateEngineProviders(updated);

        onUpdateEngineUsageLogs([...engineUsageLogs, {
          id: `usage-test-${Date.now()}`,
          timestamp: new Date().toTimeString().split(' ')[0],
          taskId: 'connection_test',
          taskTitle: 'Gemma 4 E4B Connection Test',
          agentId: 'system',
          routeType: 'local' as const,
          providerId: 'lms_gemma_4',
          modelName: modelId,
          reason: `[taskType: connection_test] [errorKind: ${kind}] [status: error]`,
          status: 'blocked' as const
        }]);

        onAddLog(`[Engine] 로컬 엔진 [Gemma 4 E4B] 연결 실패 [${kind}]: ${reason}`, 'error', 'Engine');
        showToast(`Gemma 4 E4B 연결 실패: ${reason}`, 'error');
      }
    } else {
      setTimeout(() => {
        setTestingLocalId(null);
        const provider = engineProviders.find(p => p.id === id);
        const updated = engineProviders.map(p => {
          if (p.id === id) {
            return {
              ...p,
              status: 'mock' as const,
              lastLatency: 12,
              lastTestTime: new Date().toLocaleString()
            };
          }
          return p;
        });
        onUpdateEngineProviders(updated);
        onAddLog(`[Engine] 로컬 엔진 [${provider?.name}] Mock Connection 연결 성공 (Ping: 12ms)`, 'success', 'Engine');
        showToast(`${provider?.name} 로컬 Mock 연결 테스트가 완료되었습니다.`, 'success');
      }, 800);
    }
  };

  const handleLocalRefresh = async (id: string) => {
    setRefreshingLocalId(id);
    const providerItem = engineProviders.find(p => p.id === id);
    
    if (id === 'lms_gemma_4') {
      onAddLog(`[Engine] 로컬 엔진 [Gemma 4 E4B] 모델 목록 갱신을 요청합니다.`, 'info', 'Engine');
      const result = await getModels(providerItem?.endpoint);
      setRefreshingLocalId(null);
      
      if (result.success && result.data) {
        const models = result.data;
        const targetModel = models.find(m => m.id === 'google/gemma-4-e4b' || m.id.includes('gemma-4-e4b') || m.id.includes('gemma-4'));
        const detectedModelId = targetModel ? targetModel.id : (models[0]?.id || 'google/gemma-4-e4b');
        
        const updated = engineProviders.map(p => {
          if (p.id === id) {
            return {
              ...p,
              status: models.length > 0 ? ('connected' as const) : ('no_model' as const),
              modelName: detectedModelId
            };
          }
          return p;
        });
        onUpdateEngineProviders(updated);

        const refreshLog = {
          id: `usage-refresh-${Date.now()}`,
          timestamp: new Date().toTimeString().split(' ')[0],
          taskId: 'models_refresh',
          taskTitle: 'Gemma 4 E4B Models Refresh',
          agentId: 'system',
          routeType: 'local' as const,
          providerId: 'lms_gemma_4',
          modelName: detectedModelId,
          reason: `[taskType: models_refresh] [status: refreshed]`,
          status: 'completed' as const
        };
        onUpdateEngineUsageLogs([...engineUsageLogs, refreshLog]);

        onAddLog(`[Engine] 모델 목록 갱신 성공. 감지된 모델: ${detectedModelId} (Models refreshed)`, 'success', 'Engine');
        showToast(`모델 목록이 갱신되었습니다: ${detectedModelId}`, 'success');
      } else {
        const refreshLog = {
          id: `usage-refresh-${Date.now()}`,
          timestamp: new Date().toTimeString().split(' ')[0],
          taskId: 'models_refresh',
          taskTitle: 'Gemma 4 E4B Models Refresh',
          agentId: 'system',
          routeType: 'local' as const,
          providerId: 'lms_gemma_4',
          modelName: 'google/gemma-4-e4b',
          reason: `[taskType: models_refresh] [error: ${result.error || 'Unknown error'}] [status: error]`,
          status: 'blocked' as const
        };
        onUpdateEngineUsageLogs([...engineUsageLogs, refreshLog]);

        onAddLog(`[Engine] 모델 목록 갱신 실패: ${result.error}`, 'error', 'Engine');
        showToast(`모델 갱신 실패: ${result.error}`, 'error');
      }
    } else {
      setTimeout(() => {
        setRefreshingLocalId(null);
        showToast('Mock 엔진 모델 목록 갱신 완료.', 'success');
      }, 500);
    }
  };

  const handleSetDefaultLocal = (id: string) => {
    const updated = engineProviders.map(p => {
      if (p.type === 'local') {
        return { ...p, isDefault: p.id === id };
      }
      return p;
    });
    onUpdateEngineProviders(updated);
    const provider = engineProviders.find(p => p.id === id);
    onAddLog(`[Engine] [${provider?.name}]가 기본 로컬 엔진으로 설정되었습니다.`, 'info', 'Engine');
    showToast(`${provider?.name}가 디폴트 로컬 엔진으로 설정되었습니다.`, 'info');
  };

  const handleToggleLocal = (id: string, enable: boolean) => {
    const updated = engineProviders.map(p => {
      if (p.id === id) {
        return { ...p, isEnabled: enable, status: (enable ? 'mock' : 'disabled') as EngineProvider['status'] };
      }
      return p;
    });
    onUpdateEngineProviders(updated);
    const provider = engineProviders.find(p => p.id === id);
    onAddLog(`[Engine] 로컬 엔진 [${provider?.name}]이(가) ${enable ? '활성화' : '비활성화'}되었습니다.`, enable ? 'success' : 'warning', 'Engine');
    showToast(`${provider?.name}가 ${enable ? '활성화' : '비활성화'}되었습니다.`, 'success');
  };

  // --- 4. Cloud Engine States & Handlers ---
  const [selectedCloudId, setSelectedCloudId] = useState<string>('');
  const cloudEngines = useMemo(() => engineProviders.filter(p => p.type === 'cloud'), [engineProviders]);
  const activeCloudItem = useMemo(() => {
    return cloudEngines.find(p => p.id === selectedCloudId) || cloudEngines[0] || null;
  }, [cloudEngines, selectedCloudId]);

  useEffect(() => {
    if (activeCloudItem && !selectedCloudId) {
      setSelectedCloudId(activeCloudItem.id);
    }
  }, [activeCloudItem, selectedCloudId]);

  const [testingCloudId, setTestingCloudId] = useState<string | null>(null);
  const handleCloudTest = (id: string) => {
    setTestingCloudId(id);
    setTimeout(() => {
      setTestingCloudId(null);
      const provider = engineProviders.find(p => p.id === id);
      onAddLog(`[Engine] 클라우드 API [${provider?.name}] Mock API Handshake 성공 (HTTP 200 OK)`, 'success', 'Engine');
      showToast(`${provider?.name} 클라우드 Mock API 연동 테스트 성공!`, 'success');
    }, 800);
  };

  const handleToggleCloud = (id: string, enable: boolean) => {
    const updated = engineProviders.map(p => {
      if (p.id === id) {
        return { ...p, isEnabled: enable, status: (enable ? 'mock' : 'disabled') as EngineProvider['status'] };
      }
      return p;
    });
    onUpdateEngineProviders(updated);
    const provider = engineProviders.find(p => p.id === id);
    onAddLog(`[Engine] 클라우드 엔진 [${provider?.name}]이(가) ${enable ? '활성화' : '비활성화'}되었습니다.`, enable ? 'success' : 'warning', 'Engine');
    showToast(`${provider?.name}가 ${enable ? '활성화' : '비활성화'}되었습니다.`, 'success');
  };

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const handleApiKeyChange = (id: string, val: string) => {
    setApiKeys(prev => ({ ...prev, [id]: val }));
  };
  const handleApiKeySave = (id: string) => {
    onAddLog(`[Security] API Key(${id}) MVP 버전 제한: API Key는 브라우저 LocalStorage에 저장되지 않고 휘발성 메모리 내에 마스킹 처리됩니다.`, 'warning', 'Security');
    showToast('MVP 단계에서는 API Key를 디스크에 영구 저장하지 않습니다.', 'warning');
  };

  // --- 5. Routing Rules States & Handlers ---
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const activeRuleItem = useMemo(() => {
    return engineRoutingRules.find(r => r.id === selectedRuleId) || engineRoutingRules[0] || null;
  }, [engineRoutingRules, selectedRuleId]);

  const [ruleForm, setRuleForm] = useState<Partial<EngineRoutingRule>>({});
  useEffect(() => {
    if (activeRuleItem) {
      setRuleForm({ ...activeRuleItem });
    }
  }, [activeRuleItem]);

  // 권한 충돌 체크
  const permissionWarning = useMemo(() => {
    if (!ruleForm.taskType || !ruleForm.requiredPermission) return null;
    
    // Studio permissionMatrix에서 해당 taskName 에 매핑된 값 탐색
    const matrixItem = permissionMatrix.find(p => p.taskName === ruleForm.taskType);
    if (!matrixItem) return null;

    // 만약 Matrix의 제한 등급이 manual_only인데 Engine에서 auto/draft_only/approval_required로 주려 하는 경우
    if (matrixItem.currentPermission === 'manual_only' && ruleForm.requiredPermission !== 'manual_only') {
      return `현재 Studio Permission Matrix에 의해 이 작업은 manual_only로 제한됩니다.`;
    }
    // Matrix의 제한 등급이 approval_required인데 Engine에서 auto/draft_only로 주려 하는 경우
    if (matrixItem.currentPermission === 'approval_required' && (ruleForm.requiredPermission === 'auto' || ruleForm.requiredPermission === 'draft_only')) {
      return `현재 Studio Permission Matrix에 의해 이 작업은 최소 approval_required 이상으로 제한됩니다.`;
    }
    return null;
  }, [ruleForm.taskType, ruleForm.requiredPermission, permissionMatrix]);

  const handleRuleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (permissionWarning) {
      showToast('Studio 권한 매트릭스 설정값과 충돌하여 규칙을 저장할 수 없습니다.', 'error');
      return;
    }

    const updated = engineRoutingRules.map(r => {
      if (r.id === ruleForm.id) {
        return { ...r, ...ruleForm } as EngineRoutingRule;
      }
      return r;
    });
    onUpdateEngineRoutingRules(updated);
    onAddLog(`[Engine] 라우팅 규칙 [${ruleForm.name}]이(가) 정상적으로 갱신되었습니다.`, 'success', 'Engine');
    showToast('라우팅 규칙이 성공적으로 갱신되었습니다.', 'success');
  };

  // --- 6. Usage Logs Filter & States ---
  const [logFilter, setLogFilter] = useState<'all' | 'local' | 'cloud' | 'hybrid' | 'human' | 'blocked'>('all');
  const filteredUsageLogs = useMemo(() => {
    return engineUsageLogs.filter(l => {
      if (logFilter === 'all') return true;
      if (logFilter === 'blocked') return l.status === 'blocked';
      return l.routeType === logFilter;
    });
  }, [engineUsageLogs, logFilter]);

  // --- 7. Safety Guard States ---
  const handleToggleSafetyRule = (id: string, enable: boolean) => {
    const updated = engineSafetyRules.map(r => {
      if (r.id === id) {
        return { ...r, isEnabled: enable };
      }
      return r;
    });
    onUpdateEngineSafetyRules(updated);
    const rule = engineSafetyRules.find(r => r.id === id);
    onAddLog(`[Safety] [${rule?.name}] 안전 규칙이 ${enable ? '활성화' : '비활성화'}되었습니다.`, enable ? 'success' : 'warning', 'Safety');
    showToast(`안전 가이드 [${rule?.name}] 상태가 갱신되었습니다.`, 'success');
  };

  // 통계 헤더 데이터
  const headerSummary = useMemo(() => {
    return {
      modeText: engineMode.toUpperCase().replace('_', ' '),
      activeLocal: engineProviders.filter(p => p.type === 'local' && p.isEnabled).length,
      activeCloud: engineProviders.filter(p => p.type === 'cloud' && p.isEnabled).length,
      hybridRules: engineRoutingRules.filter(r => r.enabled && r.preferredRoute === 'hybrid').length,
      humanRules: engineRoutingRules.filter(r => r.enabled && r.preferredRoute === 'human').length
    };
  }, [engineMode, engineProviders, engineRoutingRules]);

  return (
    <div className="engine-panel-container">
      {/* 1. 상단 타이틀 및 통계 대시보드 */}
      <div className="engine-header-section">
        <div className="engine-title-wrapper">
          <h2 className="engine-main-title">🚀 GODO ENGINE</h2>
          <span className="engine-subtitle">AI 에이전트의 작업 특성, 개인정보 보호 요구 및 비용 효율성에 근거해 추론 엔진 경로를 분기 제어합니다.</span>
        </div>

        <div className="engine-metrics-row">
          <div className="metric-box info">
            <span className="metric-lbl">Engine Mode</span>
            <span className="metric-val" style={{ fontSize: '0.8rem' }}>{headerSummary.modeText}</span>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">활성 Local 모델</span>
            <span className="metric-val">{headerSummary.activeLocal}개</span>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">활성 Cloud API</span>
            <span className="metric-val">{headerSummary.activeCloud}개</span>
          </div>
          <div className="metric-box warning">
            <span className="metric-lbl">Hybrid 규칙</span>
            <span className="metric-val">{headerSummary.hybridRules}개</span>
          </div>
          <div className="metric-box danger">
            <span className="metric-lbl">Human 게이트</span>
            <span className="metric-val">{headerSummary.humanRules}개</span>
          </div>
          <div className="metric-box success">
            <span className="metric-lbl">연동 상태</span>
            {lmsGemmaProvider && lmsGemmaProvider.status === 'connected' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="metric-val accent-strong" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>LOCAL LLM READY</span>
                {lmsGemmaProvider.lastLatency !== undefined && (
                  <span className="accent-strong" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                    {lmsGemmaProvider.lastLatency}ms ({lmsGemmaProvider.lastTestTime})
                  </span>
                )}
              </div>
            ) : (
              <span className="metric-val" style={{ color: 'var(--accent-primary)', fontSize: '0.75rem' }}>CONNECTED (MOCK)</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. 엔진 제어 탭바 */}
      <div className="engine-tab-bar">
        <button className={`engine-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          📊 Overview
        </button>
        <button className={`engine-tab-btn ${activeTab === 'mode' ? 'active' : ''}`} onClick={() => setActiveTab('mode')}>
          🌐 Engine Mode
        </button>
        <button className={`engine-tab-btn ${activeTab === 'providers' ? 'active' : ''}`} onClick={() => setActiveTab('providers')}>
          🧩 AI Providers
        </button>
        <button className={`engine-tab-btn ${activeTab === 'local' ? 'active' : ''}`} onClick={() => setActiveTab('local')}>
          🖥️ Local Engines
        </button>
        <button className={`engine-tab-btn ${activeTab === 'cloud' ? 'active' : ''}`} onClick={() => setActiveTab('cloud')}>
          ☁️ Cloud Engines
        </button>
        <button className={`engine-tab-btn ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          🧭 Routing Rules
        </button>
        <button className={`engine-tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          📜 Usage Log
        </button>
        <button className={`engine-tab-btn ${activeTab === 'safety' ? 'active' : ''}`} onClick={() => setActiveTab('safety')}>
          🛡️ Safety Guard
        </button>
      </div>

      {/* 3. 콘텐츠 영역 */}
      <div className="engine-content-body">
        
        {/* --- A. Overview --- */}
        {activeTab === 'overview' && (
          <div className="engine-overview-grid">
            <div className="overview-card main-status">
              <h3 className="card-title">🌐 전역 모델 라우터 현황</h3>
              <div className="status-indicator-block">
                <span className="status-label">현재 가동 모드:</span>
                <span className="status-value-highlight">{headerSummary.modeText}</span>
              </div>
              <p className="status-desc">
                {engineMode === 'demo' && '현장 시연 및 연동 모의를 위해 임의의 연결 상태로 라우팅을 시연하고 있습니다.'}
                {engineMode === 'local_first' && '개인정보 보호와 인프라 무비용 가동을 우선하여 가능한 로컬 언어모델(SLM)을 일차 할당합니다.'}
                {engineMode === 'cloud_first' && '추론 퀄리티와 정밀도를 우선시하여 비민감성 마케팅/전략 분석 작업을 클라우드 거대 모델(LLM)에 직접 보냅니다.'}
                {engineMode === 'hybrid_auto' && '고성능 지능형 분기 알고리즘에 기초하여 로컬 전처리 및 2차 클라우드 확장을 오토 라우팅합니다.'}
                {engineMode === 'manual_control' && '에러 차단을 최우선시하여 승인이 요구되는 고위험성 운영 작업은 전원 휴먼 게이트로 리다이렉트합니다.'}
              </p>
              
              <div className="metric-sub-row">
                <div className="sub-metric">
                  <span className="sub-lbl">데이터 보안 등급</span>
                  <span className="sub-val" style={{ color: engineMode === 'cloud_first' ? 'var(--warning)' : 'var(--accent-primary)' }}>
                    {overviewStats.privacyStatus}
                  </span>
                </div>
                <div className="sub-metric">
                  <span className="sub-lbl">예상 과금 레벨</span>
                  <span className="sub-val">{overviewStats.costStatus}</span>
                </div>
              </div>
              <div className="metric-sub-row" style={{ marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                <div className="sub-metric">
                  <span className="sub-lbl">LM Studio 연동</span>
                  <span className="sub-val" style={{ color: lmsGemmaProvider?.status === 'connected' ? '#00e676' : 'var(--danger)' }}>
                    {lmsGemmaProvider?.status?.toUpperCase() || 'DISCONNECTED'}
                  </span>
                </div>
                {lmsGemmaProvider?.status === 'connected' && (
                  <div className="sub-metric">
                    <span className="sub-lbl">최근 Latency / 시간</span>
                    <span className="sub-val accent-strong" style={{ fontSize: '0.75rem' }}>
                      {lmsGemmaProvider.lastLatency}ms / {lmsGemmaProvider.lastTestTime}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="overview-card ratios-chart">
              <h3 className="card-title">📊 최근 세션 라우팅 처리 비율 (Cascade Chart)</h3>
              <div className="bar-ratios-container">
                <div className="ratio-segment local" style={{ width: `${overviewStats.localPct}%` }}>
                  <span className="seg-lbl">Local {overviewStats.localPct}%</span>
                </div>
                <div className="ratio-segment cloud" style={{ width: `${overviewStats.cloudPct}%` }}>
                  <span className="seg-lbl">Cloud {overviewStats.cloudPct}%</span>
                </div>
                <div className="ratio-segment human" style={{ width: `${overviewStats.humanPct}%` }}>
                  <span className="seg-lbl">Human {overviewStats.humanPct}%</span>
                </div>
              </div>
              <div className="bar-legend">
                <span className="lg-item"><span className="lg-dot local"></span> Local: 무비용, 오프라인 보안 안전</span>
                <span className="lg-item"><span className="lg-dot cloud"></span> Cloud: 고성능, 종량제 비용 발생</span>
                <span className="lg-item"><span className="lg-dot human"></span> Human: 100% 안전성, 관리 검증 거침</span>
              </div>
              
              <div className="total-routed-count">
                <span>오늘 누적 라우팅 횟수: </span>
                <strong>{overviewStats.totalRouted}회</strong>
              </div>
            </div>

            <div className="overview-card quick-guideline">
              <h3 className="card-title">📖 라우팅 아키텍처 원칙</h3>
              <div className="guideline-list">
                <div className="guideline-item">
                  <span className="item-num">01</span>
                  <p>고객의 연락처, 주문 세부 데이터 등 <strong>개인 식별 정보(PII)</strong>가 포함된 작업은 외부 클라우드로의 전송이 원천 차단됩니다.</p>
                </div>
                <div className="guideline-item">
                  <span className="item-num">02</span>
                  <p>상품 가격 변경, 실제 환불 실행 등 <strong>재무적 치명성</strong>이 높은 행동은 휴먼 게이트 승인이 필수입니다.</p>
                </div>
                <div className="guideline-item">
                  <span className="item-num">03</span>
                  <p>로컬 엔진의 상태가 disconnected 또는 disabled 일 경우, 자동으로 cloud 또는 human fallback 경로로 우회 이관됩니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- B. Engine Mode --- */}
        {activeTab === 'mode' && (
          <div className="engine-mode-editor-pane">
            <form onSubmit={handleModeSave} className="mode-selection-form">
              <h3 className="pane-section-title">🌐 전역 AI 라우터 모드 선택</h3>
              
              <div className="mode-options-list">
                <label className={`mode-option-card ${tempMode === 'demo' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="engineMode"
                    value="demo"
                    checked={tempMode === 'demo'}
                    onChange={() => setTempMode('demo')}
                  />
                  <div className="option-details">
                    <span className="opt-title">✨ Demo Mode</span>
                    <span className="opt-desc">모의 운영 환경을 테스트하기 위해 로컬/클라우드 상태를 무조건 mock으로 연결하고 가상 시뮬레이션을 진행합니다.</span>
                  </div>
                </label>

                <label className={`mode-option-card ${tempMode === 'local_first' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="engineMode"
                    value="local_first"
                    checked={tempMode === 'local_first'}
                    onChange={() => setTempMode('local_first')}
                  />
                  <div className="option-details">
                    <span className="opt-title">🖥️ Local First (온프레미스 보호)</span>
                    <span className="opt-desc">외부 자금 소요 차단 및 절대적인 데이터 프라이버시를 지키기 위해 가능한 한 로컬 설치형 GodoSLM 모델을 기본값으로 할당합니다.</span>
                  </div>
                </label>

                <label className={`mode-option-card ${tempMode === 'cloud_first' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="engineMode"
                    value="cloud_first"
                    checked={tempMode === 'cloud_first'}
                    onChange={() => setTempMode('cloud_first')}
                  />
                  <div className="option-details">
                    <span className="opt-title">☁️ Cloud First (지능형 고도화)</span>
                    <span className="opt-desc">API 비용 요금이 부과되더라도 가장 명민한 답변과 창의적인 마케팅 문장 생성을 위해 Gemini / Claude 클라우드 추론망을 적극 매칭합니다.</span>
                  </div>
                </label>

                <label className={`mode-option-card ${tempMode === 'hybrid_auto' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="engineMode"
                    value="hybrid_auto"
                    checked={tempMode === 'hybrid_auto'}
                    onChange={() => setTempMode('hybrid_auto')}
                  />
                  <div className="option-details">
                    <span className="opt-title">🚀 Hybrid Auto (지능적 오토 분기)</span>
                    <span className="opt-desc">(권장) 민감 데이터는 로컬에서 마스킹 및 전처리하며, 복잡도가 높거나 거대한 자료 요약은 클라우드로 자동 분류 확장해 지능을 믹스합니다.</span>
                  </div>
                </label>

                <label className={`mode-option-card ${tempMode === 'manual_control' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="engineMode"
                    value="manual_control"
                    checked={tempMode === 'manual_control'}
                    onChange={() => setTempMode('manual_control')}
                  />
                  <div className="option-details">
                    <span className="opt-title">🔑 Manual Control (보안 검토 고정)</span>
                    <span className="opt-desc">모든 중요 결제, 룰 및 마케팅 캠페인 최종 승인을 AI의 결정 대신 사람이 최종 수동 동의하도록 하여 통제권을 확보합니다.</span>
                  </div>
                </label>
              </div>

              <div className="form-action-row">
                <button type="submit" className="btn primary">
                  💾 전역 모드 설정 저장
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- B-2. AI Provider Foundation --- */}
        {activeTab === 'providers' && (
          <AiProviderFoundationPanel onAddLog={onAddLog} />
        )}

        {/* --- C. Local Engines --- */}
        {activeTab === 'local' && (
          <div className="engine-grid-layout">
            <aside className="engine-list-sidebar">
              <h3 className="sidebar-title">로컬 추론 모델</h3>
              <div className="sidebar-items-scroller">
                {localEngines.map(p => (
                  <div
                    key={p.id}
                    className={`sidebar-item-card ${selectedLocalId === p.id ? 'active' : ''}`}
                    onClick={() => setSelectedLocalId(p.id)}
                  >
                    <span className="item-filename">🖥️ {p.name}</span>
                    <span className="item-title">{p.provider.toUpperCase()} | {p.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="engine-form-pane">
              {activeLocalItem && (
                <div className="engine-detail-inner">
                  <div className="detail-header-row">
                    <h3 className="detail-pane-title">🖥️ {activeLocalItem.name}</h3>
                    <span className={`status-badge ${activeLocalItem.isEnabled ? 'active' : 'disabled'}`}>
                      {activeLocalItem.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="meta-grid-boxes">
                    <div className="meta-box-item">
                      <span className="box-lbl">인프라 타입</span>
                      <span className="box-val">LOCAL EDGE</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">프레임워크</span>
                      <span className="box-val">{activeLocalItem.provider.toUpperCase()}</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">데이터 보안</span>
                      <span className="box-val green">SAFE (로컬 한정)</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">로컬 엔드포인트</span>
                      <span className="box-val mono">{activeLocalItem.endpoint}</span>
                    </div>
                    {activeLocalItem.id === 'lms_gemma_4' && (
                      <div className="meta-box-item" style={{ gridColumn: 'span 2' }}>
                        <span className="box-lbl">감지된 모델 ID</span>
                        <span className="box-val mono warning-strong" style={{ fontSize: '0.75rem' }}>
                          {activeLocalItem.modelName || 'None'}
                        </span>
                      </div>
                    )}
                    {activeLocalItem.lastLatency !== undefined && (
                      <div className="meta-box-item" style={{ gridColumn: 'span 2' }}>
                        <span className="box-lbl">최근 Latency / 테스트 시각</span>
                        <span className="box-val accent-strong" style={{ fontSize: '0.75rem' }}>
                          {activeLocalItem.lastLatency}ms / {activeLocalItem.lastTestTime}
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="engine-desc-text">{activeLocalItem.description}</p>

                  <div className="detail-section">
                    <span className="section-subtitle">지원하는 주 작업 유형</span>
                    <div className="tags-flex-row">
                      {activeLocalItem.supportedTaskTypes.map(tag => (
                        <span key={tag} className="tag-chip">#{tag}</span>
                      ))}
                    </div>
                  </div>

                  <div className="detail-action-buttons">
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={testingLocalId !== null}
                      onClick={() => handleLocalTest(activeLocalItem.id)}
                    >
                      {testingLocalId === activeLocalItem.id
                        ? '⏳ 통신 테스트 중...'
                        : activeLocalItem.id === 'lms_gemma_4'
                        ? '🔌 Connection Test'
                        : '🔌 Mock Connection Test'}
                    </button>

                    {activeLocalItem.id === 'lms_gemma_4' && (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={refreshingLocalId !== null}
                        onClick={() => handleLocalRefresh(activeLocalItem.id)}
                      >
                        {refreshingLocalId === activeLocalItem.id ? '⏳ 모델 목록 갱신 중...' : '🔄 모델 새로고침'}
                      </button>
                    )}
                    
                    {!activeLocalItem.isDefault && (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => handleSetDefaultLocal(activeLocalItem.id)}
                      >
                        Set as Default
                      </button>
                    )}

                    {activeLocalItem.isEnabled ? (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => handleToggleLocal(activeLocalItem.id, false)}
                      >
                        Disable Engine
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => handleToggleLocal(activeLocalItem.id, true)}
                      >
                        Enable Engine
                      </button>
                    )}
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* --- D. Cloud Engines --- */}
        {activeTab === 'cloud' && (
          <div className="engine-grid-layout">
            <aside className="engine-list-sidebar">
              <h3 className="sidebar-title">클라우드 API 모델</h3>
              <div className="sidebar-items-scroller">
                {cloudEngines.map(p => (
                  <div
                    key={p.id}
                    className={`sidebar-item-card ${selectedCloudId === p.id ? 'active' : ''}`}
                    onClick={() => setSelectedCloudId(p.id)}
                  >
                    <span className="item-filename">☁️ {p.name}</span>
                    <span className="item-title">{p.provider.toUpperCase()} | {p.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="engine-form-pane">
              {activeCloudItem && (
                <div className="engine-detail-inner">
                  <div className="detail-header-row">
                    <h3 className="detail-pane-title">☁️ {activeCloudItem.name}</h3>
                    <span className={`status-badge ${activeCloudItem.isEnabled ? 'active' : 'disabled'}`}>
                      {activeCloudItem.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="meta-grid-boxes">
                    <div className="meta-box-item">
                      <span className="box-lbl">인프라 타입</span>
                      <span className="box-val">CLOUD API</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">제공사</span>
                      <span className="box-val">{activeCloudItem.provider.toUpperCase()}</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">예상 비용</span>
                      <span className="box-val yellow">{activeCloudItem.estimatedCostLevel.toUpperCase()}</span>
                    </div>
                    <div className="meta-box-item">
                      <span className="box-lbl">지연 시간</span>
                      <span className="box-val">{activeCloudItem.latencyLevel.toUpperCase()}</span>
                    </div>
                  </div>

                  <p className="engine-desc-text">{activeCloudItem.description}</p>

                  <div className="detail-section">
                    <span className="section-subtitle">지원하는 주 작업 유형</span>
                    <div className="tags-flex-row">
                      {activeCloudItem.supportedTaskTypes.map(tag => (
                        <span key={tag} className="tag-chip">#{tag}</span>
                      ))}
                    </div>
                  </div>

                  {/* Masked API Key Input */}
                  <div className="detail-section api-key-section">
                    <span className="section-subtitle">API Key 설정 (Masked, LocalStorage 저장하지 않음)</span>
                    <div className="api-key-input-row">
                      <input
                        type="password"
                        placeholder="••••••••••••••••••••••••••••••••"
                        value={apiKeys[activeCloudItem.id] || ''}
                        onChange={e => handleApiKeyChange(activeCloudItem.id, e.target.value)}
                        className="api-key-textbox"
                      />
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => handleApiKeySave(activeCloudItem.id)}
                      >
                        적용
                      </button>
                    </div>
                    <span className="input-helper-text">⚠️ 보안 상의 이유로 입력하신 API Key는 화면 세션 메모리에서만 사용되며 저장되지 않습니다.</span>
                  </div>

                  <div className="detail-action-buttons">
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={testingCloudId !== null}
                      onClick={() => handleCloudTest(activeCloudItem.id)}
                    >
                      {testingCloudId === activeCloudItem.id ? '⏳ API 핸드셰이크 테스트 중...' : '🔌 Mock API Test'}
                    </button>

                    {activeCloudItem.isEnabled ? (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => handleToggleCloud(activeCloudItem.id, false)}
                      >
                        Disable API
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => handleToggleCloud(activeCloudItem.id, true)}
                      >
                        Enable API
                      </button>
                    )}
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* --- E. Routing Rules --- */}
        {activeTab === 'rules' && (
          <div className="engine-grid-layout">
            <aside className="engine-list-sidebar">
              <h3 className="sidebar-title">라우팅 규칙 목록</h3>
              <div className="sidebar-items-scroller">
                {engineRoutingRules.map(r => (
                  <div
                    key={r.id}
                    className={`sidebar-item-card ${selectedRuleId === r.id ? 'active' : ''}`}
                    onClick={() => setSelectedRuleId(r.id)}
                  >
                    <span className="item-filename">🧭 {r.name}</span>
                    <span className="item-title">{r.preferredRoute.toUpperCase()} | {r.taskType}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="engine-form-pane">
              {activeRuleItem && (
                <form onSubmit={handleRuleSave} className="editor-form">
                  <div className="form-header-row">
                    <h3 className="form-pane-title">🧭 라우팅 규칙 상세 편집</h3>
                    <span className="form-info-tag">ID: {ruleForm.id}</span>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>규칙 이름</label>
                      <input
                        type="text"
                        value={ruleForm.name || ''}
                        onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>작업 분류 코드 (taskType)</label>
                      <input
                        type="text"
                        value={ruleForm.taskType || ''}
                        readOnly
                        style={{ opacity: 0.6, background: 'rgba(0,0,0,0.2)' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>1차 권장 인프라 (Preferred Route)</label>
                      <select
                        value={ruleForm.preferredRoute || 'local'}
                        onChange={e => setRuleForm({ ...ruleForm, preferredRoute: e.target.value as EngineRoutingRule['preferredRoute'] })}
                      >
                        <option value="local">LOCAL (온프레미스 로컬 최선)</option>
                        <option value="cloud">CLOUD (클라우드 초안 지능화)</option>
                        <option value="hybrid">HYBRID (요약 및 확장 동시 가동)</option>
                        <option value="human">HUMAN (휴먼 게이트 강제 승인)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>우회 폴백 인프라 (Fallback Route)</label>
                      <select
                        value={ruleForm.fallbackRoute || 'human'}
                        onChange={e => setRuleForm({ ...ruleForm, fallbackRoute: e.target.value as EngineRoutingRule['fallbackRoute'] })}
                      >
                        <option value="local">LOCAL (로컬 엔진)</option>
                        <option value="cloud">CLOUD (클라우드 API)</option>
                        <option value="hybrid">HYBRID (하이브리드)</option>
                        <option value="human">HUMAN (인간 전담 이관)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>보안 민감성 (Sensitivity)</label>
                      <select
                        value={ruleForm.sensitivity || 'low'}
                        onChange={e => setRuleForm({ ...ruleForm, sensitivity: e.target.value as EngineRoutingRule['sensitivity'] })}
                      >
                        <option value="low">LOW</option>
                        <option value="medium">MEDIUM</option>
                        <option value="high">HIGH (클라우드 전송 제한 경고)</option>
                        <option value="critical">CRITICAL (인간 필수)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>데이터 스코프 (Data Scope)</label>
                      <select
                        value={ruleForm.dataScope || 'public'}
                        onChange={e => setRuleForm({ ...ruleForm, dataScope: e.target.value as EngineRoutingRule['dataScope'] })}
                      >
                        <option value="public">PUBLIC (공개용)</option>
                        <option value="internal">INTERNAL (사내 일반)</option>
                        <option value="customer_sensitive">CUSTOMER SENSITIVE (개인정보)</option>
                        <option value="financial">FINANCIAL (결제/과금)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>요구되는 권한 등급 (Required Permission)</label>
                      <select
                        value={ruleForm.requiredPermission || 'auto'}
                        onChange={e => setRuleForm({ ...ruleForm, requiredPermission: e.target.value as EngineRoutingRule['requiredPermission'] })}
                      >
                        <option value="auto">AUTO (무승인 즉시 실행)</option>
                        <option value="draft_only">DRAFT ONLY (초안 등록)</option>
                        <option value="approval_required">APPROVAL REQUIRED (관리자 승인 필수)</option>
                        <option value="manual_only">MANUAL ONLY (수동 전담)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>활성화 여부</label>
                      <select
                        value={ruleForm.enabled ? 'true' : 'false'}
                        onChange={e => setRuleForm({ ...ruleForm, enabled: e.target.value === 'true' })}
                      >
                        <option value="true">가동 (ENABLED)</option>
                        <option value="false">비가동 (DISABLED)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group full-width" style={{ marginTop: '10px' }}>
                    <label>규칙 세부 조건 설명</label>
                    <input
                      type="text"
                      value={ruleForm.description || ''}
                      onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })}
                      required
                    />
                  </div>

                  {/* Studio Permission Matrix 충돌 경고 알림 */}
                  {permissionWarning && (
                    <div className="permission-conflict-alert">
                      ⚠️ {permissionWarning}
                    </div>
                  )}

                  <div className="form-action-row">
                    <button type="button" className="btn secondary" onClick={() => setRuleForm({ ...activeRuleItem })}>
                      되돌리기
                    </button>
                    <button type="submit" className="btn primary" disabled={permissionWarning !== null}>
                      💾 라우팅 규칙 저장
                    </button>
                  </div>
                </form>
              )}
            </main>
          </div>
        )}

        {/* --- F. Usage Log --- */}
        {activeTab === 'logs' && (
          <div className="engine-usage-logs-pane">
            <div className="usage-filter-bar">
              <span className="filter-label">인프라 필터:</span>
              <div className="filter-buttons-row">
                <button className={`filter-btn ${logFilter === 'all' ? 'active' : ''}`} onClick={() => setLogFilter('all')}>전체</button>
                <button className={`filter-btn ${logFilter === 'local' ? 'active' : ''}`} onClick={() => setLogFilter('local')}>Local</button>
                <button className={`filter-btn ${logFilter === 'cloud' ? 'active' : ''}`} onClick={() => setLogFilter('cloud')}>Cloud</button>
                <button className={`filter-btn ${logFilter === 'hybrid' ? 'active' : ''}`} onClick={() => setLogFilter('hybrid')}>Hybrid</button>
                <button className={`filter-btn ${logFilter === 'human' ? 'active' : ''}`} onClick={() => setLogFilter('human')}>Human</button>
                <button className={`filter-btn ${logFilter === 'blocked' ? 'active' : ''}`} onClick={() => setLogFilter('blocked')}>Blocked</button>
              </div>
            </div>

            <div className="usage-logs-table-container">
              {filteredUsageLogs.length === 0 ? (
                <div className="empty-logs-message">최근 생성된 AI 엔진 라우팅 기록이 없습니다.</div>
              ) : (
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>시간</th>
                      <th>작업명</th>
                      <th>담당 AI</th>
                      <th>경로 타입</th>
                      <th>할당 모델</th>
                      <th>라우팅 사유</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsageLogs.map(log => (
                      <tr key={log.id}>
                        <td className="mono-cell">{log.timestamp}</td>
                        <td className="bold-cell">{log.taskTitle}</td>
                        <td>{log.agentId.toUpperCase()} AI</td>
                        <td>
                          <span className={`route-badge ${log.routeType}`}>
                            {log.routeType.toUpperCase()}
                          </span>
                        </td>
                        <td className="mono-cell">{log.modelName}</td>
                        <td className="desc-cell">{log.reason}</td>
                        <td>
                          <span className={`status-pill ${log.status}`}>
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* --- G. Safety Guard --- */}
        {activeTab === 'safety' && (
          <div className="engine-safety-guard-pane">
            <h3 className="pane-section-title">🛡️ AI 추론 보안 및 라이프사이클 규정 (Safety Guard)</h3>
            <p className="pane-desc-text">AI 에이전트 가동 시 정보 유출과 예산 낭비를 막기 위한 시스템 핵심 안전 규제입니다. 토글 온오프 시 즉각 적용됩니다.</p>
            
            <div className="safety-rules-grid">
              {engineSafetyRules.map(rule => (
                <div key={rule.id} className={`safety-rule-card ${rule.isEnabled ? 'active' : ''}`}>
                  <div className="card-header-row">
                    <span className="rule-name">🛡️ {rule.name}</span>
                    <span className={`risk-tag ${rule.riskLevel}`}>
                      {rule.riskLevel.toUpperCase()} RISK
                    </span>
                  </div>
                  <p className="rule-desc">{rule.description}</p>
                  
                  <div className="card-footer-row">
                    <span className="permission-tag">요구 권한: {rule.requiredPermission.toUpperCase()}</span>
                    <div className="toggle-switch-wrapper">
                      <span className="toggle-label">{rule.isEnabled ? '규칙 적용 중' : '비활성'}</span>
                      <input
                        type="checkbox"
                        checked={rule.isEnabled}
                        onChange={e => handleToggleSafetyRule(rule.id, e.target.checked)}
                        className="toggle-checkbox"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Toast Notification Container */}
      {toast && (
        <div className={`engine-toast ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' && '✨'}
            {toast.type === 'info' && 'ℹ️'}
            {toast.type === 'warning' && '⚠️'}
            {toast.type === 'error' && '🚨'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
};
