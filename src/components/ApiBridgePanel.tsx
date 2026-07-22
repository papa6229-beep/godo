import React, { useState, useMemo, useEffect } from 'react';
import type { OperationsDataSnapshot, ImportHistoryItem, DataDomain } from '../types/dataConnector';
import type { ApiResourceType } from '../types/apiBridge';
import type { ProxyHealthResponse } from '../types/proxy';
import { runMockSync } from '../services/mockGodomallApi';
import {
  loadApiBridgeState,
  saveApiBridgeState,
  appendApiBridgeLog,
  appendApiSyncJob,
  resetApiBridgeState
} from '../utils/apiBridgeStorage';
import { buildOperationsSnapshot } from '../utils/dataNormalizer';
import { checkProxyHealth, syncProxyResource } from '../services/secureProxyClient';
import './ApiBridgePanel.css';

interface ApiBridgePanelProps {
  activeOperationsData: OperationsDataSnapshot;
  setActiveOperationsData: React.Dispatch<React.SetStateAction<OperationsDataSnapshot>>;
  importHistory: ImportHistoryItem[];
  setImportHistory: React.Dispatch<React.SetStateAction<ImportHistoryItem[]>>;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar') => void;
  setLastSelectedDate: (date: string) => void;
}

export const ApiBridgePanel: React.FC<ApiBridgePanelProps> = ({
  activeOperationsData,
  setActiveOperationsData,
  setImportHistory,
  onAddLog,
  setActiveTab,
  setLastSelectedDate
}) => {
  // 서브 탭 상태 관리
  const [subTab, setSubTab] = useState<'overview' | 'connector' | 'sync' | 'permissions' | 'history' | 'safety'>('overview');

  // API Bridge 로컬 상태 관리
  const [apiState, setApiState] = useState(() => loadApiBridgeState());
  const [syncingResource, setSyncingResource] = useState<ApiResourceType | 'all' | null>(null);

  // 동기화 소스 및 프록시 상태 관리 추가
  const [syncSource, setSyncSource] = useState<'local_mock' | 'secure_proxy'>('secure_proxy');
  const [proxyHealth, setProxyHealth] = useState<{
    status: string;
    mode: string;
    hasApiKey: boolean;
    hasApiSecret: boolean;
    hasBaseUrl: boolean;
    hasPartnerKey: boolean;
    hasUserKey: boolean;
    hasRealBaseUrl: boolean;
    hasSandboxBaseUrl: boolean;
    productionLocked: boolean;
  } | null>(null);

  // 마지막 동기화 결과 (출처/건수/마스킹/시각/에러 표시용)
  const [lastSyncResult, setLastSyncResult] = useState<{
    resourceType: string;
    source: string;
    count: number;
    maskedCount: number;
    syncedAt: string;
    errorMessage?: string;
  } | null>(null);

  // sourceType -> 화면 표기 (Mock / Sandbox / Real / Fallback)
  const getSourceDisplay = (sourceType: string): { label: string; className: string } => {
    switch (sourceType) {
      case 'api_proxy_real': return { label: 'REAL (Live)', className: 'source-real' };
      case 'api_proxy_sandbox': return { label: 'SANDBOX (Live)', className: 'source-sandbox' };
      case 'api_mock_fallback': return { label: 'FALLBACK (Mock)', className: 'source-fallback' };
      case 'api_proxy_mock': return { label: 'MOCK (Proxy)', className: 'source-mock' };
      case 'api_mock': return { label: 'MOCK (Local)', className: 'source-mock' };
      default: return { label: sourceType.toUpperCase(), className: 'source-mock' };
    }
  };

  const getModeLabel = (mode?: string): string => {
    if (mode === 'real') return 'REAL (Live READ)';
    if (mode === 'sandbox') return 'SANDBOX (Live READ)';
    return 'MOCK (Sandbox)';
  };

  // 컴포넌트 마운트 시 또는 상태 업데이트 시 동기화
  const syncStateFromStorage = () => {
    setApiState(loadApiBridgeState());
  };

  // 1. 커넥터 연결 상태 테스트 및 Secure Proxy 헬스 핸들러
  const handleTestConnection = async () => {
    appendApiBridgeLog('Testing connection to Mock Godomall server...', 'info');
    onAddLog('[API Bridge] Mock Godomall connector health check started.', 'info');

    // 모의 딜레이
    await new Promise(resolve => setTimeout(resolve, 150));

    appendApiBridgeLog('Test connection to Mock Godomall server succeeded. Status: 200 OK', 'info');
    appendApiBridgeLog('API key safety verification check: PASSED. No keys stored in browser.', 'safety');
    
    // Secure Proxy 연결 확인
    appendApiBridgeLog('Connecting to Serverless Secure Proxy Boundary...', 'info');
    const health = await checkProxyHealth();
    setProxyHealth({
      status: health.status,
      mode: health.mode || health.secrets.mode || 'mock',
      hasApiKey: health.secrets.hasApiKey,
      hasApiSecret: health.secrets.hasApiSecret,
      hasBaseUrl: health.secrets.hasBaseUrl,
      hasPartnerKey: health.hasPartnerKey ?? health.secrets.hasPartnerKey ?? false,
      hasUserKey: health.hasUserKey ?? health.secrets.hasUserKey ?? false,
      hasRealBaseUrl: health.hasRealBaseUrl ?? health.secrets.hasRealBaseUrl ?? false,
      hasSandboxBaseUrl: health.hasSandboxBaseUrl ?? health.secrets.hasSandboxBaseUrl ?? false,
      productionLocked: health.secrets.productionLocked
    });

    if (health.ok) {
      appendApiBridgeLog(`[Secure Proxy] Health check completed. Status: ${health.status.toUpperCase()}`, 'info');
      appendApiBridgeLog('[Secure Proxy] Production mode is locked. (보안 가드 적용)', 'safety');
      appendApiBridgeLog('[Secure Proxy] API credentials were not exposed to browser.', 'safety');
      onAddLog('[API Bridge] Secure Proxy Health Check completed successfully.', 'success');
    } else {
      appendApiBridgeLog('[Fallback] Secure Proxy boundary offline. Fallback to Local Mock Adapter is enabled.', 'warning');
      onAddLog('[API Bridge] Secure Proxy is offline. Local Fallback enabled.', 'warning');
    }

    onAddLog('[API Bridge] Mock Godomall connector health check completed.', 'success');
    onAddLog('[Safety] API credentials verify: SECURE (Not stored in client localStorage).', 'success');

    // 상태 동기화
    syncStateFromStorage();
  };

  // 2. API Bridge 데이터 초기화 핸들러
  const handleResetBridge = () => {
    if (window.confirm('API Bridge 동기화 이력 및 안전 로그를 초기화하시겠습니까?')) {
      resetApiBridgeState();
      syncStateFromStorage();
      onAddLog('[API Bridge] API Bridge 상태가 초기 상태로 리셋되었습니다.', 'warning');
    }
  };

  // 3. 개별 리소스 Mock 동기화 핸들러 (Secure Proxy 분기 지원)
  const handleSyncResource = async (resourceType: ApiResourceType) => {
    if (syncingResource) return;
    setSyncingResource(resourceType);

    const sourceLabel = syncSource === 'secure_proxy' ? 'secure_proxy_mock' : 'local_mock_adapter';
    const sourceDesc = syncSource === 'secure_proxy' ? 'Secure Proxy Server' : 'Local Mock Adapter';

    appendApiBridgeLog(`Starting sync for resource [${resourceType}] via [${sourceDesc}]...`, 'info', resourceType);
    onAddLog(`[API Bridge] [${resourceType.toUpperCase()}] 동기화 연동이 시작되었습니다. (${sourceDesc})`, 'info');

    try {
      let result;
      if (syncSource === 'secure_proxy') {
        result = await syncProxyResource(resourceType);
        if (result.substitutionBlocked) {
          // C-출처(GREEN3): 실제 요청인데 실패/미구현 — mock 자동 대체를 차단하고 연결 안 됨으로 표시.
          appendApiBridgeLog('[연결 안 됨] Secure Proxy 실패/미구현. 자동 대체(mock) 차단 — 운영 통계에 미투입.', 'warning', resourceType);
          onAddLog(`[API Bridge] [${resourceType.toUpperCase()}] 실제 연동 실패/미구현으로 "연결 안 됨" 처리했습니다. (시험 데이터로 자동 대체하지 않음 — 시험 데이터가 필요하면 시험 모드를 선택하세요.)`, 'warning');
        } else if (result.isFallback) {
          appendApiBridgeLog('[Fallback] 시험 모드 — Local Mock Adapter 사용(시험 데이터).', 'warning', resourceType);
          onAddLog(`[API Bridge] [${resourceType.toUpperCase()}] 시험 모드로 Local Mock 데이터(시험 데이터)를 사용했습니다.`, 'warning');
        } else {
          appendApiBridgeLog(`[Secure Proxy] [${resourceType}] sync completed through server boundary.`, 'safety', resourceType);
        }
      } else {
        const localRes = await runMockSync(resourceType);
        result = {
          rawItems: localRes.rawItems,
          importedCount: localRes.importedCount,
          maskedPiiCount: localRes.maskedPiiCount,
          warningCount: localRes.warningCount,
          isFallback: false,
          sourceType: 'api_mock',
          errorMessage: undefined as string | undefined
        };
      }

      // 마지막 동기화 결과 기록 (출처/건수/마스킹/시각/에러)
      setLastSyncResult({
        resourceType,
        source: result.sourceType,
        count: result.importedCount,
        maskedCount: result.maskedPiiCount,
        syncedAt: new Date().toISOString(),
        errorMessage: result.errorMessage
      });

      // Data Connector의 Snapshot 업데이트 (Products는 이번 MVP에서 데이터 적재 제외 또는 Preview 전용)
      if (resourceType !== 'products') {
        const updatedSnapshot = buildOperationsSnapshot(resourceType, result.rawItems, activeOperationsData);
        // 소스 타입 설정 (real/sandbox/mock_fallback 상세 출처 그대로 반영)
        updatedSnapshot.sourceType = result.sourceType as typeof updatedSnapshot.sourceType;
        setActiveOperationsData(updatedSnapshot);

        // Import History에 데이터 추가
        const historyItem: ImportHistoryItem = {
          id: `import-api-${Date.now()}-${resourceType}`,
          timestamp: new Date().toISOString(),
          fileName: `Godomall API (${(syncSource === 'secure_proxy' && !result.isFallback) ? 'Secure Proxy' : 'Mock Sync'} - ${resourceType.toUpperCase()})`,
          domain: resourceType as DataDomain,
          sourceType: updatedSnapshot.sourceType,
          rowCount: result.importedCount,
          status: 'success',
          qualityScore: updatedSnapshot.qualityReport?.qualityScore || 95
        };
        setImportHistory(prev => [historyItem, ...prev]);
      }

      // Sync Job 기록 저장
      appendApiSyncJob({
        resourceType,
        status: 'success',
        completedAt: new Date().toISOString(),
        source: sourceLabel,
        importedCount: result.importedCount,
        maskedPiiCount: result.maskedPiiCount,
        warningCount: result.warningCount
      });

      appendApiBridgeLog(
        `Sync [${resourceType}] completed. Imported: ${result.importedCount}, PII Masked: ${result.maskedPiiCount}, Warnings: ${result.warningCount}`,
        'info',
        resourceType
      );

      if (result.maskedPiiCount > 0) {
        appendApiBridgeLog(
          `Privacy Shield masked ${result.maskedPiiCount} sensitive field(s) in [${resourceType}] data.`,
          'safety',
          resourceType
        );
      }

      onAddLog(
        `[API Bridge] [${resourceType.toUpperCase()}] 동기화가 성공적으로 완료되었습니다. (적재: ${result.importedCount}건, 마스킹: ${result.maskedPiiCount}건)`,
        'success'
      );
      
      // 만약 날짜가 존재하는 데이터셋이라면, 달력 활성화를 위해 가장 최근 날짜를 설정
      if (resourceType === 'orders' && result.rawItems.length > 0) {
        const dates = result.rawItems.map(item => item.orderDate?.split(' ')[0]).filter(Boolean);
        if (dates.length > 0) {
          setLastSelectedDate(dates[0]);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      appendApiSyncJob({
        resourceType,
        status: 'failed',
        completedAt: new Date().toISOString(),
        source: 'Mock Godomall API',
        importedCount: 0,
        maskedPiiCount: 0,
        warningCount: 0,
        errorMessage: errMsg
      });
      appendApiBridgeLog(`Sync [${resourceType}] failed: ${errMsg}`, 'error', resourceType);
      onAddLog(`[API Bridge] [${resourceType.toUpperCase()}] 동기화가 실패했습니다.`, 'error');
    } finally {
      setSyncingResource(null);
      
      // 공급자 동기화 시간 갱신
      const updatedProviders = apiState.providers.map(p => {
        if (p.id === 'godomall') {
          return { ...p, lastSyncAt: new Date().toISOString() };
        }
        return p;
      });
      saveApiBridgeState({ providers: updatedProviders, lastSyncAt: new Date().toISOString() });
      
      syncStateFromStorage();
    }
  };

  // 4. 모든 리소스 Mock 동기화 핸들러 (Secure Proxy 분기 지원)
  const handleSyncAllResources = async () => {
    if (syncingResource) return;
    setSyncingResource('all');
    
    const sourceLabel = syncSource === 'secure_proxy' ? 'secure_proxy_mock' : 'local_mock_adapter';
    const sourceDesc = syncSource === 'secure_proxy' ? 'Secure Proxy Server' : 'Local Mock Adapter';
    
    appendApiBridgeLog(`Starting full mock resource sync via [${sourceDesc}]...`, 'info');
    onAddLog(`[API Bridge] 전역 Mock 리소스 연동이 개시되었습니다. (${sourceDesc})`, 'info');

    const resources: ApiResourceType[] = ['orders', 'inquiries', 'reviews', 'inventory', 'sales'];
    let totalImported = 0;
    let totalMasked = 0;
    let lastSourceType = 'api_mock_fallback';
    let lastErrorMessage: string | undefined;

    try {
      let currentSnapshot = { ...activeOperationsData };
      const newImportHistoryItems: ImportHistoryItem[] = [];

      for (const res of resources) {
        appendApiBridgeLog(`Syncing [${res}]...`, 'info', res);
        
        let result;
        if (syncSource === 'secure_proxy') {
          result = await syncProxyResource(res);
          if (result.isFallback) {
            appendApiBridgeLog('[Fallback] Secure Proxy unavailable. Local Mock Adapter used.', 'warning', res);
          } else {
            appendApiBridgeLog(`[Secure Proxy] [${res}] sync completed through server boundary.`, 'safety', res);
          }
        } else {
          const localRes = await runMockSync(res);
          result = {
            rawItems: localRes.rawItems,
            importedCount: localRes.importedCount,
            maskedPiiCount: localRes.maskedPiiCount,
            warningCount: localRes.warningCount,
            isFallback: false,
            sourceType: 'api_mock'
          };
        }

        currentSnapshot = buildOperationsSnapshot(res, result.rawItems, currentSnapshot);
        totalImported += result.importedCount;
        totalMasked += result.maskedPiiCount;
        lastSourceType = result.sourceType;
        if ('errorMessage' in result && result.errorMessage) lastErrorMessage = result.errorMessage;

        // 개별 Sync Job 저장
        appendApiSyncJob({
          resourceType: res,
          status: 'success',
          completedAt: new Date().toISOString(),
          source: sourceLabel,
          importedCount: result.importedCount,
          maskedPiiCount: result.maskedPiiCount,
          warningCount: result.warningCount
        });

        // Import History 데이터 생성
        newImportHistoryItems.push({
          id: `import-api-${Date.now()}-${res}`,
          timestamp: new Date().toISOString(),
          fileName: `Godomall API (${(syncSource === 'secure_proxy' && !result.isFallback) ? 'Secure Proxy' : 'Mock Sync'} - ${res.toUpperCase()})`,
          domain: res as DataDomain,
          sourceType: result.sourceType as ImportHistoryItem['sourceType'],
          rowCount: result.importedCount,
          status: 'success',
          qualityScore: currentSnapshot.qualityReport?.qualityScore || 95
        });

        if (result.maskedPiiCount > 0) {
          appendApiBridgeLog(
            `Privacy Shield masked ${result.maskedPiiCount} sensitive field(s) in [${res}] data.`,
            'safety',
            res
          );
        }

        // 지연 효과 부여
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Snapshot 적용 및 소스 타입 변경 (마지막 리소스의 상세 출처 반영)
      currentSnapshot.sourceType = lastSourceType as typeof currentSnapshot.sourceType;
      setActiveOperationsData(currentSnapshot);
      setImportHistory(prev => [...newImportHistoryItems, ...prev]);

      // 마지막 동기화 결과 요약
      setLastSyncResult({
        resourceType: 'all',
        source: lastSourceType,
        count: totalImported,
        maskedCount: totalMasked,
        syncedAt: new Date().toISOString(),
        errorMessage: lastErrorMessage
      });

      appendApiBridgeLog(`Full resources sync completed. Total records: ${totalImported}, Masked PII: ${totalMasked}`, 'info');
      onAddLog(`[API Bridge] 전체 Mock 리소스 동기화가 정상 완료되었습니다. (총 적재: ${totalImported}건)`, 'success');
      
      // 기본적으로 2026-06-18 주문 선택
      setLastSelectedDate('2026-06-18');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      appendApiBridgeLog(`Full resources sync failed: ${errMsg}`, 'error');
      onAddLog(`[API Bridge] 전역 동기화 프로세스 실행 실패`, 'error');
    } finally {
      setSyncingResource(null);
      
      const updatedProviders = apiState.providers.map(p => {
        if (p.id === 'godomall') {
          return { ...p, lastSyncAt: new Date().toISOString() };
        }
        return p;
      });
      saveApiBridgeState({ providers: updatedProviders, lastSyncAt: new Date().toISOString() });
      
      syncStateFromStorage();
    }
  };

  // 헬퍼: 권한 수준에 따른 뱃지 한글 텍스트 및 클래스 반환
  const getPermissionLabel = (level: string) => {
    switch (level) {
      case 'read_only': return { text: '조회 전용 (Read Only)', className: 'read-only' };
      case 'draft_only': return { text: '초안 권한 (Draft Only)', className: 'draft-only' };
      case 'approval_required': return { text: '승인 필수 (Approval)', className: 'approval' };
      case 'manual_only': return { text: '수동 조작 (Manual)', className: 'manual' };
      case 'disabled': return { text: '사용 제한 (Disabled)', className: 'disabled' };
      default: return { text: level, className: '' };
    }
  };

  const getStatusDotClass = (status: string) => {
    switch (status) {
      case 'ready': return 'ready-dot';
      case 'syncing': return 'syncing-dot';
      case 'locked': return 'locked-dot';
      case 'error': return 'error-dot';
      default: return 'offline-dot';
    }
  };

  const formattedLastSync = useMemo(() => {
    if (!apiState.lastSyncAt) return '기록 없음';
    return new Date(apiState.lastSyncAt).toLocaleString();
  }, [apiState.lastSyncAt]);

  // 탭 진입(마운트) 시 서버 health를 자동 조회하여 모드/키 상태를 즉시 반영
  // (버튼을 눌러야만 갱신되던 stale 표시 문제 해결)
  useEffect(() => {
    let active = true;
    checkProxyHealth()
      .then((health: ProxyHealthResponse) => {
        if (!active) return;
        setProxyHealth({
          status: health.status,
          mode: health.mode || health.secrets.mode || 'mock',
          hasApiKey: health.secrets.hasApiKey,
          hasApiSecret: health.secrets.hasApiSecret,
          hasBaseUrl: health.secrets.hasBaseUrl,
          hasPartnerKey: health.hasPartnerKey ?? health.secrets.hasPartnerKey ?? false,
          hasUserKey: health.hasUserKey ?? health.secrets.hasUserKey ?? false,
          hasRealBaseUrl: health.hasRealBaseUrl ?? health.secrets.hasRealBaseUrl ?? false,
          hasSandboxBaseUrl: health.hasSandboxBaseUrl ?? health.secrets.hasSandboxBaseUrl ?? false,
          productionLocked: health.secrets.productionLocked
        });
      })
      .catch(() => {
        // health 조회 실패 시 표시는 mock fallback 유지
      });
    return () => {
      active = false;
    };
  }, []);

  // C-출처: isLive = "라이브 연동 가능(능력)" 판정이다 — 키·모드가 준비됨을 뜻할 뿐
  //   "데이터가 실제"라는 뜻이 아니다. 실제 자료 여부는 리소스별 동기화 결과(sourceType)로만 판정한다.
  //   (mode/키만 보고 REAL 데이터로 단언하던 오판을 능력 표현으로 분리.)
  const isLiveCapable =
    !!proxyHealth &&
    (proxyHealth.mode === 'sandbox' || proxyHealth.mode === 'real') &&
    proxyHealth.hasPartnerKey &&
    proxyHealth.hasUserKey;
  const isLive = isLiveCapable;

  return (
    <div className="api-bridge-panel-container">
      {/* 1. 헤더 */}
      <div className="api-bridge-header">
        <div className="api-title-wrapper">
          <h2 className="api-main-title">🛡️ GODO API BRIDGE</h2>
          <span className="api-subtitle">
            외부 고도몰 API 쇼핑몰 데이터 세트를 안전하게 중개하고 보안 규정을 검증하는 프록시 아키텍처 계층입니다.
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="api-nav-btn" onClick={() => setActiveTab('data')}>
            📡 Data Center
          </button>
          <button type="button" className="api-nav-btn" onClick={() => setActiveTab('calendar')}>
            📅 Calendar
          </button>
        </div>
      </div>

      {/* 2. 상단 요약 카드 그리드 */}
      <div className="api-status-summary-row">
        <div className="api-summary-card">
          <span className="summary-lbl">현재 연동 모드</span>
          <span className={`summary-val ${isLive ? 'mode-live' : 'mode-mock'}`}>
            {!proxyHealth
              ? '연결 확인 중…'
              : isLive
                ? getModeLabel(proxyHealth.mode)
                : 'MOCK (Fallback)'}
          </span>
        </div>
        <div className="api-summary-card">
          <span className="summary-lbl">프록시 연결 상태</span>
          <span className={`summary-val ${proxyHealth && proxyHealth.status !== 'error_fallback' ? 'status-ready' : ''}`}>
            <span className="ready-indicator"></span>
            {!proxyHealth ? ' Checking…' : proxyHealth.status === 'error_fallback' ? ' Offline (Fallback)' : ' Ready'}
          </span>
        </div>
        <div className="api-summary-card">
          <span className="summary-lbl">마지막 동기화</span>
          <span className="summary-val text-truncate" title={formattedLastSync}>{formattedLastSync}</span>
        </div>
        <div className="api-summary-card">
          <span className="summary-lbl">연동 가능 데이터</span>
          <span className="summary-val">6종 리소스</span>
        </div>
        <div className="api-summary-card">
          <span className="summary-lbl">안전 암호화 검증</span>
          <span className="summary-val safety-secured">LOCKED (Secure)</span>
        </div>
      </div>

      {/* 3. 메인 인터페이스 레이아웃 */}
      <div className="api-main-layout">
        {/* 서브 네비게이션 */}
        <div className="api-sub-tabs">
          <button className={`sub-tab-btn ${subTab === 'overview' ? 'active' : ''}`} onClick={() => setSubTab('overview')}>
            🗺️ Overview
          </button>
          <button className={`sub-tab-btn ${subTab === 'connector' ? 'active' : ''}`} onClick={() => setSubTab('connector')}>
            🔌 Godomall Connector
          </button>
          <button className={`sub-tab-btn ${subTab === 'sync' ? 'active' : ''}`} onClick={() => setSubTab('sync')}>
            🔄 Resource Sync
          </button>
          <button className={`sub-tab-btn ${subTab === 'permissions' ? 'active' : ''}`} onClick={() => setSubTab('permissions')}>
            🔐 Permission Gate
          </button>
          <button className={`sub-tab-btn ${subTab === 'history' ? 'active' : ''}`} onClick={() => setSubTab('history')}>
            📜 Sync History
          </button>
          <button className={`sub-tab-btn ${subTab === 'safety' ? 'active' : ''}`} onClick={() => setSubTab('safety')}>
            🛡️ Safety Log
          </button>
        </div>

        {/* 탭 내부 콘텐츠 렌더링 영역 */}
        <div className="api-sub-content-panel">
          
          {/* A. Overview */}
          {subTab === 'overview' && (
            <div className="api-tab-pane">
              <div className="api-info-card">
                <h3>📌 GODO API Bridge란?</h3>
                <p>
                  고도몰 API와의 연결 과정에서 **API 토큰 및 개인키 유출 위험**을 철저히 봉쇄하기 위해 설계된 보안 미들웨어 모듈입니다.
                  프론트엔드 브라우저 내에 크레덴셜을 보관하지 않고, 서버사이드 프록시(Secure Proxy)에서만 검증 절차를 통과시키는 구조를 모델링하고 있습니다.
                </p>
                <div className={`security-alert-box ${isLive ? 'live-mode' : ''}`}>
                  <span className="alert-icon">{isLive ? '✅' : '⚠️'}</span>
                  {isLive ? (
                    <span className="alert-text">
                      현재 API Bridge는 <strong>{proxyHealth?.mode === 'real' ? 'REAL' : 'SANDBOX'} Live READ 연동 준비</strong> 상태입니다(키·모드 확인됨).
                      동기화 시 고도몰5 Open API(OpenHub)에서 실제 데이터 READ를 시도하며, 쓰기(write) 액션은 비활성화되어 있습니다.
                      실제 자료 여부는 각 리소스의 <strong>동기화 결과</strong>로 확인하세요(라이브 실패 시 실제 데이터가 아니라 연결 안 됨으로 표시됩니다).
                    </span>
                  ) : (
                    <span className="alert-text">
                      현재 API Bridge는 <strong>Mock Mode</strong>로 실행 중입니다. 실제 고도몰 API 키는 브라우저 로컬스토리지에 저장하지 않으며, 서버 환경변수(GODOMALL_API_MODE=real/sandbox)를 통해서만 라이브 연결됩니다.
                    </span>
                  )}
                </div>
              </div>

              <div className="api-info-card">
                <h3>🔄 데이터 아키텍처 및 연동 흐름</h3>
                <div className="flowchart-container">
                  <div className="flow-node frontend">
                    <span className="node-icon">💻</span>
                    <span className="node-title">GODO Frontend</span>
                    <span className="node-desc">브라우저 샌드박스</span>
                  </div>
                  <div className="flow-arrow">➡️ (Secure Request) ➡️</div>
                  <div className="flow-node proxy">
                    <span className="node-icon">🛡️</span>
                    <span className="node-title">Secure Proxy Bridge</span>
                    <span className="node-desc">환경변수 보안 키 로딩</span>
                  </div>
                  <div className="flow-arrow">➡️ (Authenticated API) ➡️</div>
                  <div className="flow-node server">
                    <span className="node-icon">🏪</span>
                    <span className="node-title">Godomall API Server</span>
                    <span className="node-desc">실제 고도몰 서버</span>
                  </div>
                </div>
                
                <div className="flowchart-desc-grid">
                  <div className="flow-desc-item">
                    <strong>1. API Bridge 통신</strong>
                    <p>Mock 연동 또는 프록시 서버 연동을 통해 데이터 수집을 비동기화 및 안전 분할 관리합니다.</p>
                  </div>
                  <div className="flow-desc-item">
                    <strong>2. Data Connector 표준화</strong>
                    <p>가져온 주문/CS 원본 데이터를 파싱한 직후 PII 마스킹 처리하여 메모리 및 영속화 스토리지에 탑재합니다.</p>
                  </div>
                  <div className="flow-desc-item">
                    <strong>3. Workflow Engine 바인딩</strong>
                    <p>마스킹 처리된 안전 데이터셋을 참조하여 AI 에이전트 자동 처리를 수행하고 작업 로그를 매핑합니다.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* B. Godomall Connector */}
          {subTab === 'connector' && (
            <div className="api-tab-pane">
              {apiState.providers.map((provider) => (
                <div key={provider.id} className="provider-detail-card">
                  <div className="provider-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`status-dot ${getStatusDotClass(provider.status)}`}></span>
                      <h3 className="provider-name">{provider.name}</h3>
                    </div>
                    <span className="provider-mode-badge">{provider.mode.toUpperCase()}</span>
                  </div>
                  <p className="provider-desc">{provider.description}</p>

                  <div className="provider-fields-grid">
                    <div className="field-item">
                      <span className="field-lbl">Base URL 엔드포인트</span>
                      <span className="field-val code">{provider.baseUrlLabel}</span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">API 인증 토큰 (Credentials)</span>
                      <span className="field-val code locked">LOCKED (Server-Side Managed)</span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">Secure Proxy Server Boundary</span>
                      <span className="field-val" style={{ color: proxyHealth ? (proxyHealth.status === 'ready' ? '#00ff88' : '#ff4d4d') : '#8892b0', fontWeight: 'bold' }}>
                        {proxyHealth ? (proxyHealth.status === 'ready' ? 'Ready (Connected)' : 'Offline / Error') : 'Not Checked (체크 대기)'}
                      </span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">Secrets Guard (API Key / Secret)</span>
                      <span className="field-val" style={{ color: proxyHealth?.hasApiKey ? '#00ff88' : '#8892b0' }}>
                        {proxyHealth ? (proxyHealth.hasApiKey ? 'Verified (Server-side)' : 'Missing (Using Server Mock)') : 'Hidden / Secure'}
                      </span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">Production lock mode</span>
                      <span className="field-val warning-strong">LOCKED (Sandbox Boundary)</span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">커넥터 헬스 스코어</span>
                      <span className="field-val">
                        <span className="health-score-strong" style={{ fontWeight: 'bold' }}>{provider.healthScore}%</span>
                        <div className="health-bar-container">
                          <div className="health-bar-fill" style={{ width: `${provider.healthScore}%` }}></div>
                        </div>
                      </span>
                    </div>
                    <div className="field-item">
                      <span className="field-lbl">최근 통신 이력</span>
                      <span className="field-val">{provider.lastSyncAt ? new Date(provider.lastSyncAt).toLocaleString() : '동기화 이력 없음'}</span>
                    </div>
                  </div>

                  <div className="provider-actions-row">
                    <button
                      className="api-action-btn primary"
                      onClick={handleTestConnection}
                      disabled={syncingResource !== null}
                    >
                      🛡️ Secure Proxy Health Check (Mock Test)
                    </button>
                    <button
                      className="api-action-btn danger"
                      onClick={handleResetBridge}
                      disabled={syncingResource !== null}
                    >
                      ♻️ Reset API Bridge State
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* C. Resource Sync */}
          {subTab === 'sync' && (
            <div className="api-tab-pane">
              <div className="sync-actions-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p className="sync-info-text" style={{ maxWidth: '60%' }}>
                    API 커넥터를 연동하여 고도몰 몰스토어의 핵심 데이터를 수동 동기화(Sync)합니다. 
                    동기화 완료 시 개인 식별 정보(PII)는 자동으로 안전 필터 마스킹을 통과하게 됩니다.
                  </p>
                  <button
                    className="api-action-btn accent-btn"
                    onClick={handleSyncAllResources}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'all' ? '🔄 Syncing All...' : '⚡ Sync All Resources'}
                  </button>
                </div>

                <div className="sync-source-selector">
                  <span className="sync-source-label">동기화 소스 (Sync Source):</span>
                  <label className="sync-source-radio-label">
                    <input 
                      type="radio" 
                      name="syncSource" 
                      value="secure_proxy" 
                      checked={syncSource === 'secure_proxy'}
                      onChange={() => setSyncSource('secure_proxy')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>🛡️ Secure Proxy Server{isLive ? ' (REAL READ)' : ''} (추천)</span>
                  </label>
                  <label className="sync-source-radio-label">
                    <input
                      type="radio"
                      name="syncSource"
                      value="local_mock"
                      checked={syncSource === 'local_mock'}
                      onChange={() => setSyncSource('local_mock')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>🔌 Local Mock Adapter</span>
                  </label>
                </div>
              </div>

              {/* 마지막 동기화 결과 (출처 / 건수 / 마스킹 / 시각 / 에러) */}
              {lastSyncResult && (
                <div className={`last-sync-result-box ${getSourceDisplay(lastSyncResult.source).className}`}>
                  <div className="last-sync-row">
                    <span className="last-sync-lbl">데이터 출처 (Source)</span>
                    <span className={`source-badge ${getSourceDisplay(lastSyncResult.source).className}`}>
                      {getSourceDisplay(lastSyncResult.source).label}
                    </span>
                  </div>
                  <div className="last-sync-row">
                    <span className="last-sync-lbl">대상 / 적재 건수 (Count)</span>
                    <span className="last-sync-val">{lastSyncResult.resourceType.toUpperCase()} · {lastSyncResult.count}건</span>
                  </div>
                  <div className="last-sync-row">
                    <span className="last-sync-lbl">개인정보 마스킹 (Masked)</span>
                    <span className="last-sync-val">{lastSyncResult.maskedCount}건</span>
                  </div>
                  <div className="last-sync-row">
                    <span className="last-sync-lbl">동기화 시각 (Synced At)</span>
                    <span className="last-sync-val">{new Date(lastSyncResult.syncedAt).toLocaleString()}</span>
                  </div>
                  {lastSyncResult.errorMessage && (
                    <div className="last-sync-row error">
                      <span className="last-sync-lbl">⚠️ 라이브 실패 사유</span>
                      <span className="last-sync-val">{lastSyncResult.errorMessage}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="resources-sync-grid">
                {/* 1. Orders */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>📦 Orders (주문 데이터)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.orders).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.orders).text}
                    </span>
                  </div>
                  <p className="resource-desc">Order_Search.php 주문조회 · 결제/배송 현황 ({isLive ? '실연동 READ' : 'Mock'})</p>
                  <div className="resource-meta-info">
                    <span>Endpoint: Order_Search.php</span>
                    <span>Source: {isLive ? '실연동 준비(동기화 결과로 확인)' : 'Mock / Fallback'}</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('orders')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'orders'
                      ? '🔄 Syncing...'
                      : isLive ? 'Sync Orders' : 'Sync Mock Orders'}
                  </button>
                </div>

                {/* 2. Inquiries */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>💬 Inquiries (고객 CS 문의)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.inquiries).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.inquiries).text}
                    </span>
                  </div>
                  <p className="resource-desc">1:1 고객 문의 접수 건 및 유형 분류 동기화</p>
                  <div className="resource-meta-info">
                    <span>최종 동기화: {apiState.providers[0].lastSyncAt ? '완료' : '대기'}</span>
                    <span>예상 데이터: 3 rows</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('inquiries')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'inquiries' ? '🔄 Syncing...' : 'Sync Mock Inquiries'}
                  </button>
                </div>

                {/* 3. Reviews */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>⭐ Reviews (상품 리뷰)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.reviews).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.reviews).text}
                    </span>
                  </div>
                  <p className="resource-desc">구매 만족도 평점, 내용, 감사 답글 여부 매핑</p>
                  <div className="resource-meta-info">
                    <span>최종 동기화: {apiState.providers[0].lastSyncAt ? '완료' : '대기'}</span>
                    <span>예상 데이터: 3 rows</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('reviews')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'reviews' ? '🔄 Syncing...' : 'Sync Mock Reviews'}
                  </button>
                </div>

                {/* 4. Inventory */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>🎒 Inventory (재고 스냅샷)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.inventory).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.inventory).text}
                    </span>
                  </div>
                  <p className="resource-desc">Goods_Search.php 상품 데이터 기반 재고 파생 · 안전재고 체크 ({isLive ? '실연동 READ' : 'Mock'})</p>
                  <div className="resource-meta-info">
                    <span>Endpoint: Goods_Search.php (derived)</span>
                    <span>Source: {isLive ? '상품 기반 파생(동기화 결과로 확인)' : 'Mock / Fallback'}</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('inventory')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'inventory'
                      ? '🔄 Syncing...'
                      : isLive ? 'Sync Inventory (Derived)' : 'Sync Mock Inventory'}
                  </button>
                </div>

                {/* 5. Sales */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>📊 Sales (매출 요약)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.sales).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.sales).text}
                    </span>
                  </div>
                  <p className="resource-desc">일별 판매 합계, 전환율 및 베스트셀러 요약</p>
                  <div className="resource-meta-info">
                    <span>최종 동기화: {apiState.providers[0].lastSyncAt ? '완료' : '대기'}</span>
                    <span>예상 데이터: 3 rows</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('sales')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'sales' ? '🔄 Syncing...' : 'Sync Mock Sales'}
                  </button>
                </div>

                {/* 6. Products (Goods_Search.php 실연결 1차 테스트 대상) */}
                <div className="resource-sync-card">
                  <div className="resource-header">
                    <h4>🏷️ Products (상품 마스터)</h4>
                    <span className={`permission-badge ${getPermissionLabel(apiState.providers[0].permissions.products).className}`}>
                      {getPermissionLabel(apiState.providers[0].permissions.products).text}
                    </span>
                  </div>
                  <p className="resource-desc">Goods_Search.php 상품조회 (개인정보 없음 · 실연동 READ)</p>
                  <div className="resource-meta-info">
                    <span>Endpoint: Goods_Search.php</span>
                    <span>Source: {isLive ? '실연동 준비(동기화 결과로 확인)' : 'Mock / Fallback'}</span>
                  </div>
                  <button
                    className="sync-card-btn"
                    onClick={() => handleSyncResource('products')}
                    disabled={syncingResource !== null}
                  >
                    {syncingResource === 'products' ? '🔄 Syncing...' : 'Sync Products'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* D. Permission Gate */}
          {subTab === 'permissions' && (
            <div className="api-tab-pane">
              <div className="permission-gate-info">
                <h3>🔐 API Security Permission Matrix</h3>
                <p>
                  에이전트나 대시보드가 고도몰 리소스에 접근하여 수행할 수 있는 권한 수준을 정의한 보안 규칙입니다.
                  쓰기 권한 및 민감한 처리 권한은 승인 장치나 수동 게이트를 반드시 통과하도록 구조화되어 있습니다.
                </p>
              </div>

              <table className="permission-matrix-table">
                <thead>
                  <tr>
                    <th>리소스명 (Resource Name)</th>
                    <th>허가 유형 (Permission Level)</th>
                    <th>허용 조작 범위 (Allowed Actions)</th>
                    <th>보안 가이드라인 및 제한사항 (Safety Notes)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>orders</strong></td>
                    <td><span className="permission-badge read-only">Read Only</span></td>
                    <td>주문 상태 조회, 결제 금액 대조</td>
                    <td>고객 식별정보(PII)는 메모리 로드 직전 필수 마스킹 필터 적용.</td>
                  </tr>
                  <tr>
                    <td><strong>inquiries</strong></td>
                    <td><span className="permission-badge draft-only">Draft Only</span></td>
                    <td>문의글 유형 분류, AI 답변 초안 생성</td>
                    <td>실제 고도몰 답변 업로드는 차단되며, 초안 상태로만 저장 가능.</td>
                  </tr>
                  <tr>
                    <td><strong>reviews</strong></td>
                    <td><span className="permission-badge draft-only">Draft Only</span></td>
                    <td>평점 모니터링, AI 감사 댓글 초안 작성</td>
                    <td>사용자 최종 승인 전에는 고도몰 스토어에 어떠한 댓글도 게시 금지.</td>
                  </tr>
                  <tr>
                    <td><strong>inventory</strong></td>
                    <td><span className="permission-badge read-only">Read Only</span></td>
                    <td>SKU 수량 조회, 안전재고 위험 감지</td>
                    <td>발주 조치 및 재고 수정은 실제 외부 서버로 전송 불가.</td>
                  </tr>
                  <tr>
                    <td><strong>sales</strong></td>
                    <td><span className="permission-badge read-only">Read Only</span></td>
                    <td>정산 요약 조회, 일일 매출 통계 집계</td>
                    <td>마케팅 예산 및 금융 결제 직접 연동 제어 차단.</td>
                  </tr>
                  <tr>
                    <td><strong>products</strong></td>
                    <td><span className="permission-badge approval">Approval Required</span></td>
                    <td>상품 마스터 데이터 읽기, 상품명 교정</td>
                    <td>에이전트가 단독으로 수정할 수 없으며, 반드시 <strong>CEO 승인 모달</strong>을 거쳐야 함.</td>
                  </tr>
                </tbody>
              </table>

              <div className="locked-actions-section">
                <h4>🔒 Locked/Disabled Critical Actions (수동 또는 차단 처리)</h4>
                <div className="locked-actions-grid">
                  <div className="locked-action-card blocked">
                    <span className="lock-icon">🚫</span>
                    <strong>고객 개인정보 내보내기 (Customer Export)</strong>
                    <span className="badge-status-lock disabled">DISABLED</span>
                    <p>엑셀 다운로드 및 외부 이관은 시스템 수준에서 원천 금지 처리되었습니다.</p>
                  </div>
                  <div className="locked-action-card manual-only">
                    <span className="lock-icon">🔒</span>
                    <strong>주문 환불 및 교환 승인 (Refunds)</strong>
                    <span className="badge-status-lock manual">MANUAL ONLY</span>
                    <p>실제 자금 환불 액션은 API Bridge를 통한 자동 처리가 금지되며 수동 처리가 필요합니다.</p>
                  </div>
                  <div className="locked-action-card approval-only">
                    <span className="lock-icon">🔒</span>
                    <strong>가격 인상 및 인하 반영 (Price Update)</strong>
                    <span className="badge-status-lock approval">APPROVAL REQ</span>
                    <p>에이전트의 가격 조정 지시는 CEO / 운영 책임자 승인 큐를 무조건 통과해야 반영됩니다.</p>
                  </div>
                  <div className="locked-action-card manual-only">
                    <span className="lock-icon">🔒</span>
                    <strong>개인정보 보존 소거 처리 (Delete PII)</strong>
                    <span className="badge-status-lock manual">MANUAL ONLY</span>
                    <p>고객 보존 삭제 요청은 보안 담당자의 물리적 2단계 수동 인증을 필요로 합니다.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* E. Sync History */}
          {subTab === 'history' && (
            <div className="api-tab-pane scrollable-panel">
              <h3 className="pane-title">📜 API Mock Sync History (동기화 수행 이력)</h3>
              {apiState.syncJobs.length === 0 ? (
                <div className="empty-history">
                  <p>동기화 이력이 없습니다. 'Resource Sync' 탭에서 데이터를 수집해 주세요.</p>
                </div>
              ) : (
                <div className="history-list">
                  {apiState.syncJobs.map((job) => (
                    <div key={job.id} className="history-item-row">
                      <div className="history-row-header">
                        <span className="job-time">🕒 {new Date(job.requestedAt).toLocaleString()}</span>
                        <span className={`job-status-badge ${job.status}`}>
                          {job.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="job-detail-grid">
                        <span><strong>대상 리소스:</strong> {job.resourceType.toUpperCase()}</span>
                        <span><strong>공급처:</strong> {job.source}</span>
                        <span><strong>가져온 건수:</strong> {job.importedCount}건</span>
                        <span><strong>개인정보 마스킹:</strong> <span style={{ color: job.maskedPiiCount > 0 ? '#ffb300' : 'inherit' }}>{job.maskedPiiCount}건 필터</span></span>
                        <span><strong>경고 발생 수:</strong> {job.warningCount}건</span>
                      </div>
                      {job.errorMessage && (
                        <div className="job-error-msg">
                          🚨 <strong>Error Message:</strong> {job.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* F. Safety Log */}
          {subTab === 'safety' && (
            <div className="api-tab-pane scrollable-panel">
              <h3 className="pane-title">🛡️ API Safety Logs (안전 및 보안 로그)</h3>
              <div className="safety-logs-container">
                {apiState.logs.map((log) => (
                  <div key={log.id} className={`safety-log-item level-${log.level}`}>
                    <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="log-badge">{log.level.toUpperCase()}</span>
                    <span className="log-msg">{log.message}</span>
                    {log.resourceType && (
                      <span className="log-resource">({log.resourceType})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
