// Godo AI Operating Center Main Entry
import { useState, useEffect, useCallback } from 'react';
import type { Agent, LogEntry } from './types';
import type { OperationTask } from './types/task';
import type { ApprovalItem } from './types/approval';
import type { OperationReport } from './types/operation';
import { initialAgents } from './data/agents';
import { TaskResultModal } from './components/TaskResultModal';
import { ApprovalDetailModal } from './components/ApprovalDetailModal';
import { OpeningScreen } from './components/OpeningScreen';
import { MainLayout } from './components/MainLayout';
import { ApprovalListModal } from './components/ApprovalListModal';
import { AgentDetailModal } from './components/AgentDetailModal';
import { ReportModal } from './components/ReportModal';
import { initialBrainKnowledgeItems } from './data/brainKnowledge';
import type { BrainKnowledgeItem } from './types/brain';
import { defaultSkills, defaultTools, defaultPermissionMatrix } from './data/defaultStudioData';
import type { SkillItem, ToolItem, PermissionMatrixItem } from './types/studio';
import type { EngineMode, EngineProvider, EngineRoutingRule, EngineSafetyRule, EngineUsageLog } from './types/engine';
import { defaultEngineProviders, defaultEngineRoutingRules, defaultEngineSafetyRules } from './data/defaultEngineData';
import type { OperationsDataSnapshot, ImportHistoryItem } from './types/dataConnector';
import { defaultOperationsData } from './data/defaultOperationsData';
import { normalizeInquiryRecords } from './services/inquiryStatusContract';
import type { OperationHistoryItem } from './types/calendar';
import { runNativeAgentOperation } from './engine/nativeAgentRuntime/nativeAgentRuntime';
import type { NativeAgentRun } from './engine/nativeAgentRuntime/types';
import { resetApiBridgeState } from './utils/apiBridgeStorage';
import { composeOperationReport } from './engine/reportComposer';
import { getScenarioData, type ValidationScenarioType } from './engine/nativeAgentRuntime/validationScenarios';
import { useTheme } from './hooks/useTheme';
import { classifyResource, userLabelOf, migrateResourceProvenance } from './services/dataSourceProvenanceContract';
import { migrateLegacyGhostOrders } from './services/legacyOrderSnapshotMigration';
import { isSameAgent } from './services/agentIdRegistry';
import {
  hydrateAppState, applyDecision, createDirectiveTask, teamOfAgent, visibleTasksFor,
  actorForRole, pendingForActor, assignExecutor, takeOverByLead, submitResult, createCollaborationRequest
} from './services/taskLifecycleAppAdapter';
import type { ApprovalDecisionKind, LifecycleTask } from './services/taskLifecycleContract';
import { loadRole, subscribeRole, roleMeta, VIEWER_ROLES } from './services/sessionRole';
import type { ViewerRole } from './services/sessionRole';
import './App.css';

// localStorage 쓰기 방어: 용량 초과(QuotaExceededError) 등으로 throw돼도 앱이 죽지 않게.
// (effect 안의 unguarded setItem이 throw하면 React가 통째로 언마운트/흰 화면이 됨 → 방지)
// 업무 id·시각 생성기 — 렌더 중 호출되지 않도록 컴포넌트 밖에 둔다(핸들러에서만 부른다).
const nowIso = () => new Date().toISOString();
const newTaskId = () => `task-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const newLogId = () => `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

const safeSetItem = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[localStorage] "${key}" 저장 실패(용량 초과 등) — 건너뜀:`, e);
  }
};

// C-4 입력 경계: 스냅샷이 앱 상태로 들어오는 유일 지점에서 문의 상태를 1회 canonical화한다.
//   (문의만 대상 — 주문/재고/매출 등 다른 필드는 건드리지 않는다.) normalizeInquiryRecords는
//   idempotent이므로 이미 canonical인 record(저장 복원분 포함)는 최초 rawStatus/근거를 보존한다.
// 출처 마이그레이션: 구버전 저장 상태(리소스별 근거 없음)를 최신 계약으로 재판정한다(추측 금지·fail-closed).
//   Sync 버튼을 누르기 전에도 첫 hydration 직후 정직한 상태(실제/시험/연결 안 됨)를 표시한다. idempotent.
const withCanonicalInquiries = (snapshot: OperationsDataSnapshot): OperationsDataSnapshot => {
  if (!snapshot) return snapshot;
  const inquiries = Array.isArray(snapshot.inquiries) ? normalizeInquiryRecords(snapshot.inquiries) : snapshot.inquiries;
  const counts: Record<string, number> = {
    orders: snapshot.orders?.length ?? 0,
    inquiries: snapshot.inquiries?.length ?? 0,
    reviews: snapshot.reviews?.length ?? 0,
    inventory: snapshot.inventory?.length ?? 0,
    sales: snapshot.sales?.length ?? 0
  };
  const resourceProvenance = migrateResourceProvenance(snapshot.sourceType, snapshot.resourceProvenance, counts);
  return { ...snapshot, inquiries, resourceProvenance };
};


function App() {
  const { theme, toggleTheme } = useTheme();
  const [showOpening, setShowOpening] = useState(true);
  const [validationScenario, setValidationScenario] = useState<ValidationScenarioType>(() => {
    try {
      const saved = localStorage.getItem('godo.nativeAgentRuntime.activeScenario');
      return (saved as ValidationScenarioType) || 'normal';
    } catch {
      return 'normal';
    }
  });

  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { name: string; size: number; type: string; timestamp: string }[]>>(() => {
    try {
      const saved = localStorage.getItem('godo.nativeAgentRuntime.uploadedFiles');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [manualCommands, setManualCommands] = useState<Record<string, { text: string; timestamp: string }[]>>(() => {
    try {
      const saved = localStorage.getItem('godo.nativeAgentRuntime.manualCommands');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // RC-2 D-1: 업무·승인 상태의 정본은 저장된 lifecycle task 다. 화면 상태는 거기서 파생한다.
  //   (App 이 localStorage 를 직접 만지지 않고 어댑터/저장 서비스만 사용한다.)
  const [tasks, setTasks] = useState<OperationTask[]>(() => visibleTasksFor(actorForRole(loadRole())));
  // RC-2 D-1.3: 팀장 화면은 화면용 요약이 아니라 **정본 LifecycleTask** 를 그대로 본다.
  //   (수행자·이력·제출 내용이 필요하다. 저장·갱신은 계속 App 이 소유한다.)
  const [lifecycleTasks, setLifecycleTasks] = useState<LifecycleTask[]>(() => hydrateAppState().source);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar' | 'department'>('office');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalItem[]>(() => hydrateAppState().approvalQueue);
  // 결정이 끝난 항목도 이력에서 계속 조회 가능해야 한다(승인 대기열에서만 빠진다).
  const [approvalHistory, setApprovalHistory] = useState<ApprovalItem[]>(() => hydrateAppState().history);
  // 역할 전환기와 동기화 — 전환 직후 결정 버튼도 새 역할을 사용한다.
  const [viewerRole, setViewerRole] = useState<ViewerRole>(() => loadRole());
  // 역할이 바뀌면 열람 범위도 함께 바뀐다(팀장 ↔ 총괄 전환 시 이전 역할의 목록이 남지 않게).
  useEffect(() => subscribeRole(() => {
    const next = loadRole();
    setViewerRole(next);
    setTasks(visibleTasksFor(actorForRole(next)));
    setLifecycleTasks(hydrateAppState().source);
  }), []);
  // 지금 이 역할이 결정할 수 있는 대기 업무(= '내 확인 대기').
  const myPendingTasks = pendingForActor(actorForRole(viewerRole));
  // '내 확인 대기' 목록(기존 승인 모달 재사용 — 새 화면을 만들지 않는다).
  const myPendingApprovals = approvalQueue.filter(q => myPendingTasks.some(t => t.id === q.taskId));
  const [showMyApprovals, setShowMyApprovals] = useState(false);
  const [report, setReport] = useState<OperationReport | null>(null);
  const [selectedTaskForResult, setSelectedTaskForResult] = useState<OperationTask | null>(null);
  const [selectedApprovalDetail, setSelectedApprovalDetail] = useState<ApprovalItem | null>(null);

  // GODO STUDIO MVP 지식/에이전트/스킬/도구/권한 상태 관리 (localStorage 우선)
  const [brainKnowledge, setBrainKnowledge] = useState<BrainKnowledgeItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.brainKnowledge');
      return saved ? JSON.parse(saved) : initialBrainKnowledgeItems;
    } catch {
      return initialBrainKnowledgeItems;
    }
  });

  const [agents, setAgents] = useState<Agent[]>(() => {
    try {
      const saved = localStorage.getItem('godo.agents');
      return saved ? JSON.parse(saved) : initialAgents;
    } catch {
      return initialAgents;
    }
  });

  const [skills, setSkills] = useState<SkillItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.skills');
      return saved ? JSON.parse(saved) : defaultSkills;
    } catch {
      return defaultSkills;
    }
  });

  const [tools, setTools] = useState<ToolItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.tools');
      return saved ? JSON.parse(saved) : defaultTools;
    } catch {
      return defaultTools;
    }
  });

  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrixItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.permissionMatrix');
      return saved ? JSON.parse(saved) : defaultPermissionMatrix;
    } catch {
      return defaultPermissionMatrix;
    }
  });

  // GODO ENGINE MVP 상태 정의
  const [engineMode, setEngineMode] = useState<EngineMode>(() => {
    try {
      const saved = localStorage.getItem('godo.engine.mode');
      return saved ? (saved as EngineMode) : 'hybrid_auto';
    } catch {
      return 'hybrid_auto';
    }
  });

  const [engineProviders, setEngineProviders] = useState<EngineProvider[]>(() => {
    try {
      const saved = localStorage.getItem('godo.engine.providers');
      return saved ? JSON.parse(saved) : defaultEngineProviders;
    } catch {
      return defaultEngineProviders;
    }
  });

  const [engineRoutingRules, setEngineRoutingRules] = useState<EngineRoutingRule[]>(() => {
    try {
      const saved = localStorage.getItem('godo.engine.routingRules');
      return saved ? JSON.parse(saved) : defaultEngineRoutingRules;
    } catch {
      return defaultEngineRoutingRules;
    }
  });

  const [engineSafetyRules, setEngineSafetyRules] = useState<EngineSafetyRule[]>(() => {
    try {
      const saved = localStorage.getItem('godo.engine.safetyRules');
      return saved ? JSON.parse(saved) : defaultEngineSafetyRules;
    } catch {
      return defaultEngineSafetyRules;
    }
  });

  const [engineUsageLogs, setEngineUsageLogs] = useState<EngineUsageLog[]>([]);

  // GODO DATA CONNECTOR MVP 상태 관리 (localStorage 우선)
  // C-4: 문의 상태는 이 스냅샷이 앱 상태로 들어오는 단일 경계(초기 조립/localStorage 복원/API·import setter)
  //   에서 1회만 canonical화한다. default/mock/API 응답/저장 복원 모든 경로가 여기를 통과.
  //   idempotent이므로 재설정·재복원 시에도 최초 rawStatus/normalizationReason이 보존된다.
  // GODO-ORDER-MAPPING-01(D-2): 저장 스냅샷 복원 시 **과거 코드가 만든 유령 주문**만 1회 청소한다.
  //   (신원 필드가 전혀 없는데 수량1·0원·결제완료·배송대기로 채워진 행 — 실제 0원 주문은 보존)
  //   순수·멱등이며, 출처는 '실제 데이터'를 유지한 채 건수만 정정한다 → Sync 전에도 '실제 데이터 0건'.
  //   setter 경로가 아니라 복원 경계에만 건다(새 동기화 결과는 D-1 매퍼가 이미 유령을 만들지 않는다).
  const [activeOperationsData, setActiveOperationsDataRaw] = useState<OperationsDataSnapshot>(() => {
    try {
      const saved = localStorage.getItem('godo.data.activeSnapshot');
      const restored = saved ? JSON.parse(saved) : defaultOperationsData;
      return withCanonicalInquiries(migrateLegacyGhostOrders(restored).snapshot);
    } catch {
      return withCanonicalInquiries(defaultOperationsData);
    }
  });
  const setActiveOperationsData = useCallback<React.Dispatch<React.SetStateAction<OperationsDataSnapshot>>>((update) => {
    setActiveOperationsDataRaw((prev) => {
      const next = typeof update === 'function'
        ? (update as (p: OperationsDataSnapshot) => OperationsDataSnapshot)(prev)
        : update;
      return withCanonicalInquiries(next);
    });
  }, []);

  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.data.importHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // GODO OPERATION CALENDAR 상태 관리 (localStorage 우선)
  const [lastSelectedDate, setLastSelectedDate] = useState<string>(() => {
    try {
      return localStorage.getItem('godo.calendar.lastSelectedDate') || '';
    } catch {
      return '';
    }
  });

  const [lastViewedMonth, setLastViewedMonth] = useState<string>(() => {
    try {
      return localStorage.getItem('godo.calendar.lastViewedMonth') || '';
    } catch {
      return '';
    }
  });

  const [operationHistory, setOperationHistory] = useState<OperationHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('godo.calendar.operationHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedBrainItemId, setSelectedBrainItemId] = useState<string | null>(null);
  const [lastNativeAgentRun, setLastNativeAgentRun] = useState<NativeAgentRun | null>(() => {
    try {
      const saved = localStorage.getItem('godo.nativeAgentRuntime.lastRun');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (lastNativeAgentRun) {
      safeSetItem('godo.nativeAgentRuntime.lastRun', JSON.stringify(lastNativeAgentRun));
    }
  }, [lastNativeAgentRun]);

  useEffect(() => {
    safeSetItem('godo.nativeAgentRuntime.activeScenario', validationScenario);
  }, [validationScenario]);

  useEffect(() => {
    safeSetItem('godo.nativeAgentRuntime.uploadedFiles', JSON.stringify(uploadedFiles));
  }, [uploadedFiles]);

  useEffect(() => {
    safeSetItem('godo.nativeAgentRuntime.manualCommands', JSON.stringify(manualCommands));
  }, [manualCommands]);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [studioSubTab, setStudioSubTab] = useState<'brain' | 'agent' | 'agent_tasks' | 'skills' | 'tools' | 'permissions' | 'import_export'>('brain');

  // LocalStorage 자동 동기화 훅
  useEffect(() => {
    safeSetItem('godo.brainKnowledge', JSON.stringify(brainKnowledge));
    safeSetItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [brainKnowledge]);

  useEffect(() => {
    safeSetItem('godo.agents', JSON.stringify(agents));
    safeSetItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [agents]);

  useEffect(() => {
    safeSetItem('godo.skills', JSON.stringify(skills));
    safeSetItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [skills]);

  useEffect(() => {
    safeSetItem('godo.tools', JSON.stringify(tools));
    safeSetItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [tools]);

  useEffect(() => {
    safeSetItem('godo.permissionMatrix', JSON.stringify(permissionMatrix));
    safeSetItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [permissionMatrix]);

  // GODO ENGINE LocalStorage 자동 동기화 훅
  useEffect(() => {
    safeSetItem('godo.engine.mode', engineMode);
    safeSetItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineMode]);

  useEffect(() => {
    safeSetItem('godo.engine.providers', JSON.stringify(engineProviders));
    safeSetItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineProviders]);

  useEffect(() => {
    safeSetItem('godo.engine.routingRules', JSON.stringify(engineRoutingRules));
    safeSetItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineRoutingRules]);

  useEffect(() => {
    safeSetItem('godo.engine.safetyRules', JSON.stringify(engineSafetyRules));
    safeSetItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineSafetyRules]);

  // GODO DATA CONNECTOR LocalStorage 자동 동기화 훅
  useEffect(() => {
    safeSetItem('godo.data.activeSnapshot', JSON.stringify(activeOperationsData));
    safeSetItem('godo.data.lastSavedAt', new Date().toISOString());
  }, [activeOperationsData]);

  useEffect(() => {
    safeSetItem('godo.data.importHistory', JSON.stringify(importHistory));
    safeSetItem('godo.data.lastSavedAt', new Date().toISOString());
  }, [importHistory]);

  // GODO OPERATION CALENDAR LocalStorage 자동 동기화 훅
  useEffect(() => {
    safeSetItem('godo.calendar.lastSelectedDate', lastSelectedDate);
  }, [lastSelectedDate]);

  useEffect(() => {
    safeSetItem('godo.calendar.lastViewedMonth', lastViewedMonth);
  }, [lastViewedMonth]);

  useEffect(() => {
    safeSetItem('godo.calendar.operationHistory', JSON.stringify(operationHistory));
  }, [operationHistory]);

  // MVP 데이터 정밀 동기화 및 마이그레이션 훅
  useEffect(() => {
    let changedProviders = false;
    const currentProviders = [...engineProviders];
    
    // Gemma 4 E4B 누락 시 강제 편입
    if (!currentProviders.some(p => p.id === 'lms_gemma_4')) {
      const gemma = defaultEngineProviders.find(p => p.id === 'lms_gemma_4');
      if (gemma) {
        currentProviders.push(gemma);
        changedProviders = true;
      }
    }

    if (changedProviders) {
      setTimeout(() => {
        setEngineProviders(currentProviders);
      }, 0);
    }

    let changedRules = false;
    const currentRules = engineRoutingRules.map(rule => {
      if (rule.id === 'rule_4') {
        if (
          rule.preferredRoute !== 'local' ||
          rule.fallbackRoute !== 'human' ||
          rule.requiredPermission !== 'approval_required' ||
          rule.sensitivity !== 'high' ||
          rule.dataScope !== 'customer_sensitive'
        ) {
          changedRules = true;
          return {
            ...rule,
            description: '고객 피드백 답변 추천 초안 생성. 로컬 엔진을 우선하여 구동하고 실패 시 인간 검토로 이관합니다.',
            sensitivity: 'high' as const,
            dataScope: 'customer_sensitive' as const,
            preferredRoute: 'local' as const,
            fallbackRoute: 'human' as const,
            requiredPermission: 'approval_required' as const
          };
        }
      }
      return rule;
    });

    if (changedRules) {
      setTimeout(() => {
        setEngineRoutingRules(currentRules);
      }, 0);
    }
  }, [engineProviders, engineRoutingRules]);

  const handleResetAllData = () => {
    setBrainKnowledge(initialBrainKnowledgeItems);
    setAgents(initialAgents);
    setSkills(defaultSkills);
    setTools(defaultTools);
    setUploadedFiles({});
    setManualCommands({});
    setValidationScenario('normal');
    localStorage.removeItem('godo.nativeAgentRuntime.uploadedFiles');
    localStorage.removeItem('godo.nativeAgentRuntime.manualCommands');
    localStorage.removeItem('godo.nativeAgentRuntime.activeScenario');
    localStorage.removeItem('godo.nativeAgentRuntime.lastRun');
    setLastNativeAgentRun(null);
    setPermissionMatrix(defaultPermissionMatrix);
    setEngineMode('hybrid_auto');
    setEngineProviders(defaultEngineProviders);
    setEngineRoutingRules(defaultEngineRoutingRules);
    setEngineSafetyRules(defaultEngineSafetyRules);
    setEngineUsageLogs([]);
    setActiveOperationsData(defaultOperationsData);
    setImportHistory([]);

    localStorage.removeItem('godo.brainKnowledge');
    localStorage.removeItem('godo.agents');
    localStorage.removeItem('godo.skills');
    localStorage.removeItem('godo.tools');
    localStorage.removeItem('godo.permissionMatrix');
    localStorage.removeItem('godo.studio.lastSavedAt');

    localStorage.removeItem('godo.engine.mode');
    localStorage.removeItem('godo.engine.providers');
    localStorage.removeItem('godo.engine.routingRules');
    localStorage.removeItem('godo.engine.safetyRules');
    localStorage.removeItem('godo.engine.lastSavedAt');

    localStorage.removeItem('godo.data.activeSnapshot');
    localStorage.removeItem('godo.data.importHistory');
    localStorage.removeItem('godo.data.lastSavedAt');

    setLastSelectedDate('');
    setLastViewedMonth('');
    setOperationHistory([]);

    localStorage.removeItem('godo.calendar.lastSelectedDate');
    localStorage.removeItem('godo.calendar.lastViewedMonth');
    localStorage.removeItem('godo.calendar.operationHistory');

    // API Bridge 상태 리셋 연동
    resetApiBridgeState();
  };

  // 현재 시간 포맷
  const getFormattedTime = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  };

  // 로그 추가 유틸리티
  const addLog = (text: string, type: LogEntry['type'], agentName?: string) => {
    const newLog: LogEntry = {
      id: newLogId(),
      timestamp: getFormattedTime(),
      text,
      type,
      agentName
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // 비동기 순차 실행 시뮬레이터
  const handleStartSimulation = async () => {
    if (isSimulating) return;

    setIsSimulating(true);
    setReport(null);

    // RC-2 D-1.3: 총괄의 '오늘의 운영 시작'은 **각 팀장에게 오늘 점검을 지시**하는 것이다.
    //   총괄이 다른 팀 AI 를 대신 실행하지 않는다. 수행 방식은 각 팀장이 정한다.
    if (viewerRole === 'hq') {
      const targets = VIEWER_ROLES.filter((r) => r.id !== 'hq');
      for (const t of targets) {
        createDirectiveTask(
          { title: `오늘의 운영 점검 — ${t.label}`, targetTeamId: t.id, instructedBy: sessionActor() },
          { newId: newTaskId, nowIso: nowIso() }
        );
      }
      refreshLifecycleState();
      addLog(`오늘의 운영 점검을 ${targets.length}개 팀장에게 지시했습니다. 수행 방식은 각 팀장이 정합니다.`, 'info', 'SYSTEM');
    }
    // RC-2 D-1.1: 실행 중 기존 승인 목록을 비우지 않는다.
    //   (비우면 실행 실패 시 새로고침 전까지 대기 건이 사라져 보인다. 정본은 저장 원장이다.)
    
    // 시나리오 데이터 적용
    const scenarioData = getScenarioData(validationScenario);
    const snapshotToUse = scenarioData.snapshot;
    const agentsToUse = scenarioData.agents;

    // 0. 데이터 소스 정보 로깅
    addLog(`[Scenario] 검증 프리셋 [${validationScenario.toUpperCase()}] 적용: ${scenarioData.description}`, 'info', 'SYSTEM');

    try {
      addLog('[Native Agent Runtime] 다중 에이전트 협업 엔진 기동 시작...', 'info', 'SYSTEM');
      
      // Native Agent Runtime 실행
      const runtimeResult = await runNativeAgentOperation(
        '오늘 운영 점검', 
        snapshotToUse, 
        engineProviders,
        agentsToUse
      );
      
      // 실시간으로 협업 단계 로그 출력
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      for (const logText of runtimeResult.activityLogs) {
        let logType: LogEntry['type'] = 'info';
        let sender = 'SYSTEM';
        if (logText.includes('상품관리팀')) {
          logType = 'agent';
          sender = '상품관리 팀장 AI';
        } else if (logText.includes('CS팀')) {
          logType = 'agent';
          sender = 'CS 팀장 AI';
        } else if (logText.includes('마케팅팀')) {
          logType = 'agent';
          sender = '마케팅 전략 팀장';
        } else if (logText.includes('총괄 매니저')) {
          logType = 'success';
          sender = 'HQ-01';
        }
        
        addLog(logText, logType, sender);
        await sleep(600);
      }

      // 픽셀 오피스 에이전트 상태 업데이트 (기존 9인 캐릭터 매핑)
      // RC-2(G4): 화면 id ↔ 런타임 id 를 if-else 로 수동 매핑하지 않는다.
      //   단일 별칭표(agentIdRegistry)로 canonical 비교한다. 캐릭터명·표시명은 그대로.
      setAgents(prev => prev.map(a => {
        const matchingJob = runtimeResult.run.jobs.find(j => isSameAgent(j.assignedAgentId, a.id)) ?? null;

        if (matchingJob) {
          return {
            ...a,
            status: 'completed' as const,
            currentTask: matchingJob.title,
            bubbleText: '협업 분석 완료! 🎉'
          };
        }
        
        if (a.id === 'manager') {
          return {
            ...a,
            status: 'completed' as const,
            bubbleText: '종합 브리핑 완성!'
          };
        }
        return a;
      }));

      // RAG 지식 참조 기록 처리 (사용 횟수 및 로그 갱신)
      const referencedFiles = ['order_check_template.md', 'cs_policy.md', 'cs_auto_template.md', 'inventory_snapshot.json', 'campaign_result_report.md', 'marketing_decision_log.md', 'review_reply_template.md'];
      setBrainKnowledge(prev => prev.map(k => {
        if (referencedFiles.includes(k.filename)) {
          return {
            ...k,
            usageCount: k.usageCount + 1,
            lastUsedAt: new Date().toTimeString().split(' ')[0]
          };
        }
        return k;
      }));
      referencedFiles.forEach(file => {
        addLog(`[Brain] RAG 시스템이 지식 저장소에서 "${file}"을(를) 참조했습니다.`, 'info', 'Brain');
      });

      // 3. RC-2 D-1.3: 이 실행은 **시험 운영**이다.
      //    입력이 검증 시나리오(getScenarioData → defaultOperationsData 복제본)이고,
      //    총괄이 버튼 하나로 각 팀 AI 를 대신 돌린 결과이기도 하다.
      //    그래서 결과를 실제 운영 업무·승인함에 넣지 않는다(팀장 우회 + 시험/실제 혼합 금지).
      //    실제 업무는 아래에서 **각 팀장에게 보내는 지시**로만 만들어진다.
      for (const p of runtimeResult.orchestration.proposedTasks) {
        addLog(`[시험 운영] 제안: ${p.title} — 시험 자료입니다(실제 업무 아님).`, 'info', 'SYSTEM');
      }
      addLog(
        `[시험 운영] 결과 ${runtimeResult.orchestration.proposedTasks.length}건은 시험 자료입니다. ` +
        '실제 업무·승인함에는 저장하지 않았습니다.',
        'warning', 'SYSTEM'
      );

      // 5. 종합 운영 리포트 작성
      const simulatedTasksForReport: OperationTask[] = runtimeResult.run.jobs.map(j => ({
        id: j.id,
        title: j.title,
        description: j.objective,
        assignedAgentId: j.assignedAgentId,
        status: j.riskLevel === 'approval_required' ? 'needs_approval' : 'completed',
        riskLevel: j.riskLevel === 'auto_safe' ? 'low' : 'high',
        permission: j.riskLevel === 'auto_safe' ? 'auto' : 'approval_required',
        routeType: 'local',
        resultSummary: j.objective,
        createdAt: j.createdAt,
        completedAt: j.completedAt
      }));
      const finalReport = composeOperationReport(simulatedTasksForReport, snapshotToUse);
      // 이 리포트는 검증 시나리오로 돌린 **시험 운영** 결과다. 실제 운영 실적으로 읽히지 않게 표시한다.
      finalReport.summary = `[시험 운영 · 검증 시나리오] ${finalReport.summary}`;
      
      finalReport.warningSignals = runtimeResult.run.results.reduce((acc: string[], r) => {
        return acc.concat(r.riskFlags);
      }, []);
      finalReport.recommendedActions = runtimeResult.run.results.reduce((acc: string[], r) => {
        return acc.concat(r.recommendations);
      }, []);
      
      setReport(finalReport);
      setLastNativeAgentRun(runtimeResult.run);

      // OperationHistoryItem 축적 저장 (캘린더 연동)
      const newHistoryItem: OperationHistoryItem = {
        // RC-2: 임의 시각 기반 id 대신 이 실행의 run id 로 고정한다(역추적 가능·순수).
        id: `op-hist-${runtimeResult.run.id}`,
        date: activeOperationsData.importedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        timestamp: new Date().toLocaleTimeString(),
        sourceType: activeOperationsData.sourceType,
        reportTitle: `Native 협업 자동화 운영 보고서 (${userLabelOf(classifyResource({ sourceType: activeOperationsData.sourceType }).kind)})`,
        autoCompletedCount: finalReport.autoCompletedCount,
        approvalPendingCount: finalReport.approvalRequiredCount,
        issueHighlights: finalReport.warningSignals,
        createdFrom: 'start_operation'
      };
      setOperationHistory(prev => [newHistoryItem, ...prev]);

      addLog('총괄 매니저 AI가 최종 브리핑을 완성했습니다.', 'success', 'CEO');
    } catch (err: unknown) {
      addLog(`[Error] Native Agent Runtime 실행 오류: ${err instanceof Error ? err.message : String(err)}`, 'error', 'SYSTEM');
    } finally {
      setIsSimulating(false);
    }
  };

  // RC-2 D-1.1: 현재 세션 역할(역할 전환기) → 계약 ActorRef.
  //   역할 전환기를 권한 실증의 정본으로 쓴다(실제 로그인·백엔드 권한은 범위 밖).
  const sessionActor = () => actorForRole(viewerRole);

  // 저장소 정본에서 화면 상태를 다시 파생한다(단일 갱신 지점).
  //   RC-2 D-1.2: 업무 목록은 **역할별 열람 범위**로 거른다.
  //   총괄은 전 팀을 하나의 흐름으로 보고, 팀장은 자기 팀 업무와 자기가 요청한 협업만 본다.
  const refreshLifecycleState = (next?: ReturnType<typeof hydrateAppState>) => {
    const st = next ?? hydrateAppState();
    setTasks(visibleTasksFor(sessionActor()));
    setLifecycleTasks(st.source);
    setApprovalQueue(st.approvalQueue);
    setApprovalHistory(st.history);
  };

  // 업무 지시 — **팀에게** 보낸다. 수행 방식(AI 배정/직접 처리)은 담당 팀장이 고른다.
  //   RC-2 D-1.2: 화면에서 AI 를 직접 골라 배정하지 않는다.
  const handleAddTask = (title: string, targetTeamId: string) => {
    const teamId = (VIEWER_ROLES.some((r) => r.id === targetTeamId) ? targetTeamId : viewerRole) as ViewerRole;
    createDirectiveTask(
      { title, targetTeamId: teamId, instructedBy: sessionActor() },
      { newId: newTaskId, nowIso: nowIso() }
    );
    refreshLifecycleState();
    addLog(`새 업무 "${title}"을 ${roleMeta(teamId).label}에게 전달했습니다. 수행 방식은 담당 팀장이 정합니다.`, 'info', 'SYSTEM');
  };

  // ── RC-2 D-1.3: 팀장 화면 실배선 ──────────────────────────────────────────
  //   화면은 결정하지 않는다. 계약 함수가 거부하면 그 이유를 그대로 보여 준다.

  const reportOutcome = (r: { ok: boolean; reason?: string }, okText: string) => {
    if (r.ok) addLog(okText, 'success', 'SYSTEM');
    else addLog(r.reason ?? '처리할 수 없습니다.', 'warning', 'SYSTEM');
    refreshLifecycleState();
  };

  /** 팀장이 수행 방식을 고른다 — 우리 팀 AI에게 맡기기 / 내가 직접 처리. */
  const handleAssignExecutor = (taskId: string, kind: 'agent' | 'human', executorId?: string) => {
    const r = assignExecutor(taskId, { kind, executorId, actor: sessionActor() }, { nowIso: nowIso() });
    reportOutcome(r, kind === 'agent' ? '담당 AI에게 업무를 맡겼습니다.' : '직접 처리로 지정했습니다.');
  };

  /** 진행 중인 AI 작업을 팀장이 인수한다(기존 시도는 이력에 남는다). */
  const handleTakeOver = (taskId: string) => {
    const r = takeOverByLead(taskId, { actor: sessionActor() }, { nowIso: nowIso() });
    reportOutcome(r, '팀장이 직접 인수했습니다. 이전 수행 기록은 그대로 남습니다.');
  };

  /** 수행자가 결과(업무보고)를 제출한다. 빈 보고는 계약에서 거부된다. */
  const handleSubmitResult = (taskId: string, report: string) => {
    const r = submitResult(taskId, { resultSummary: report, actor: sessionActor() }, { nowIso: nowIso() });
    reportOutcome(r, '결과를 제출했습니다. 담당 팀장 확인 대기로 넘어갑니다.');
  };

  /** 확인 완료·수정 요청·미채택·중단·반송 — 어떤 것이 가능한지는 계약이 정한다. */
  const handleTaskDecision = (taskId: string, kind: ApprovalDecisionKind, reason?: string) => {
    const r = applyDecision(taskId, { kind, actor: sessionActor(), reason }, { nowIso: nowIso(), newId: newTaskId });
    reportOutcome(r, '처리했습니다.');
  };

  /** 팀 간 협업 요청 — 요청팀 카드와 수행팀 카드를 함께 남긴다. */
  const handleCollaborationRequest = (title: string, targetTeamId: string) => {
    const team = (VIEWER_ROLES.some((r) => r.id === targetTeamId) ? targetTeamId : viewerRole) as ViewerRole;
    createCollaborationRequest(
      { title, requestingTeamId: viewerRole, targetTeamId: team, instructedBy: sessionActor() },
      { newId: newTaskId, nowIso: nowIso() }
    );
    refreshLifecycleState();
    addLog(`${roleMeta(team).label}에게 협업을 요청했습니다. 요청팀·수행팀 카드가 함께 생성됩니다.`, 'info', 'SYSTEM');
  };

  // 상세 모달에서 개별 지시 내리기
  const handleDirectInstruct = (target: { agentId: string; byTeamId: string }, instruction: string) => {
    const { agentId, byTeamId } = target;
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    // RC-2 D-1.2: 자기 팀 AI 에 대한 팀장 지시만 허용. 총괄·다른 팀장의 우회 경로를 막는다.
    const ownerTeam = teamOfAgent(agentId);
    if (!ownerTeam || byTeamId !== ownerTeam || viewerRole !== ownerTeam) {
      addLog(`직접 지시가 거절되었습니다 — 담당 팀장만 이 담당자에게 지시할 수 있습니다.`, 'warning', 'SYSTEM');
      return;
    }

    setSelectedAgent(null);

    // 에이전트 상태 업데이트
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status: 'working',
              bubbleText: `지시 수행 중: "${instruction}"`
            }
          : a
      )
    );

    addLog(`사용자 개별 지시 수신: "${instruction}" 작업을 시작합니다.`, 'info', agent.name);

    setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? {
                ...a,
                status: 'completed',
                bubbleText: `지시 완료! 🎉`
              }
            : a
        )
      );
      addLog(`사용자 지시 사항: "${instruction}" 처리가 성공적으로 완수되었습니다.`, 'success', agent.name);
    }, 2000);
  };

  // ── RC-2 D-1: 승인 결정은 전부 공통 decideApproval 을 통과한다 ──────────────
  //   App 이 상태를 직접 바꾸지 않고, 어떤 결정도 레코드를 삭제하지 않는다.
  //   승인 대기열에서만 빠지고 이력(approvalHistory)에는 계속 남는다.
  const DECISION_LABEL: Record<string, string> = {
    approve: '확인 완료', request_revision: '수정 요청',
    not_adopted: '이번 결과 사용 안 함', stop: '작업 중단', return: '협업 요청 반송'
  };

  const handleDecision = (
    approvalId: string,
    kind: 'approve' | 'request_revision' | 'not_adopted' | 'stop' | 'return',
    reason?: string
  ) => {
    const item = approvalQueue.find(i => i.id === approvalId);
    if (!item) return;
    if (kind === 'request_revision' && !String(reason ?? '').trim()) {
      addLog('[Approval] 수정 요청은 사유가 필요합니다.', 'warning', 'Approval');
      return;
    }

    const result = applyDecision(
      item.taskId,
      { kind, actor: sessionActor(), reason },
      { nowIso: new Date().toISOString(), newId: () => `task-rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
    );

    if (!result.ok) {
      addLog(`[Approval] 처리할 수 없습니다: ${result.reason ?? '권한 없음'}`, 'warning', 'Approval');
      return;
    }

    refreshLifecycleState(result.state);
    // 이력은 남고 대기열에서만 빠졌음을 사용자에게 알린다(영구 삭제 아님).
    addLog(`[Approval] 승인 대기 ${result.state.approvalQueue.length}건 · 처리 완료 이력 ${Math.max(0, result.state.history.length - result.state.approvalQueue.length)}건`, 'info', 'Approval');
    setAgents(currentAgents => currentAgents.map(a =>
      isSameAgent(a.id, item.requestedByAgentId)
        ? { ...a, status: kind === 'approve' ? 'completed' : 'idle', bubbleText: DECISION_LABEL[kind] }
        : a
    ));

    const done = result.state.tasks.find(t => t.id === item.taskId);
    const stillWaiting = result.state.approvalQueue.some(q => q.taskId === item.taskId);
    addLog(
      `[Approval] "${item.title}" — ${DECISION_LABEL[kind]}${reason ? ` (${reason})` : ''}` +
      (stillWaiting ? ' · 다음 확인 단계가 남아 있습니다.' : done?.status === 'completed' ? ' · 확인이 모두 끝났습니다.' : ''),
      kind === 'approve' ? 'success' : 'info', 'Approval'
    );
    if (result.revisionTaskId) {
      addLog(`[Approval] 기존 결과는 보존되고 수정본 업무가 생성되었습니다. (원본 ${item.taskId} → 수정본 ${result.revisionTaskId})`, 'info', 'Approval');
    }
    addLog('[System] 고도몰 외부 실제 실행(WRITE)은 아직 연동되지 않았습니다. 확인 기록만 남습니다.', 'info', 'SYSTEM');
    setSelectedApprovalDetail(null);
  };

  const handleApprove = (approvalId: string) => handleDecision(approvalId, 'approve');
  const handleReject = (approvalId: string, reason = '이번 결과 사용 안 함') => handleDecision(approvalId, 'not_adopted', reason);
  const handleRequestRevision = (approvalId: string, reason: string) => handleDecision(approvalId, 'request_revision', reason);
  const handleCancel = (approvalId: string, reason = '운영자 작업 중단') => handleDecision(approvalId, 'stop', reason);
  const handleReturn = (approvalId: string, reason = '수행 불가로 반송') => handleDecision(approvalId, 'return', reason);


  const handleCloseReport = () => {
    setReport(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      const viewport = document.querySelector('.viewport-right') as HTMLElement;
      if (viewport) {
        viewport.focus();
      }
    }, 50);
  };

  const handleAddManualCommand = (deptId: string, text: string) => {
    const newCmd = { text, timestamp: new Date().toISOString() };
    setManualCommands(prev => ({
      ...prev,
      [deptId]: [newCmd, ...(prev[deptId] || [])]
    }));
    
    const deptNames: Record<string, string> = {
      manager: '본부 및 오케스트레이션',
      product: '상품관리팀',
      cs: 'CS 운영팀',
      marketing: '마케팅 기획팀'
    };
    const deptName = deptNames[deptId] || deptId;
    addLog(`[Direct Command] 운영자가 ${deptName}장에게 신규 업무를 지시했습니다: "${text}"`, 'info', 'SYSTEM');
  };

  const handleAddFileMetadata = (deptId: string, file: { name: string; size: number; type: string }) => {
    const newFile = { ...file, timestamp: new Date().toISOString() };
    setUploadedFiles(prev => ({
      ...prev,
      [deptId]: [newFile, ...(prev[deptId] || [])]
    }));
    
    const deptNames: Record<string, string> = {
      manager: '본부 및 오케스트레이션',
      product: '상품관리팀',
      cs: 'CS 운영팀',
      marketing: '마케팅 기획팀'
    };
    const deptName = deptNames[deptId] || deptId;
    addLog(`[File Attached] ${deptName}에 신규 파일이 첨부되었습니다: ${file.name} (${file.type})`, 'info', 'SYSTEM');
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const currentSelectedAgent = selectedAgent
    ? agents.find((a) => a.id === selectedAgent.id) || null
    : null;

  return (
    <>
      {showOpening ? (
        <OpeningScreen onFinished={() => setShowOpening(false)} />
      ) : (
        <>
        {/* RC-2 D-1.1: 역할별 '내 확인 대기' 진입로. 팀장은 본인이 결정할 수 있는 업무만 본다. */}
        {myPendingApprovals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMyApprovals(true)}
            style={{
              position: 'fixed', right: 18, bottom: 18, zIndex: 60, padding: '10px 16px', borderRadius: 999,
              border: '1px solid var(--border, #444)', background: 'var(--accent, #2df5a2)', color: '#04241a',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
            }}
            title={`${roleMeta(viewerRole).label}이 지금 확인할 수 있는 업무`}
          >
            ✅ 내 확인 대기 {myPendingApprovals.length}건
          </button>
        )}

        <ApprovalListModal
          isOpen={showMyApprovals}
          onClose={() => setShowMyApprovals(false)}
          items={myPendingApprovals}
          agents={agents}
          statuses={['waiting']}
          title={`내 확인 대기 · ${roleMeta(viewerRole).label}`}
          onSelectApproval={(item) => { setShowMyApprovals(false); setSelectedApprovalDetail(item); }}
        />

        <MainLayout
          agents={agents}
          tasks={tasks}
          logs={logs}
          isSimulating={isSimulating}
          activeTab={activeTab}
          approvalQueue={approvalQueue}
          setActiveTab={setActiveTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          onStartSimulation={handleStartSimulation}
          onAddTask={handleAddTask}
          departmentLifecycle={{
            actor: sessionActor(),
            onCollaborate: handleCollaborationRequest,
            tasks: lifecycleTasks,
            onAssign: handleAssignExecutor,
            onTakeOver: handleTakeOver,
            onSubmit: handleSubmitResult,
            onDecide: handleTaskDecision
          }}
          onSelectAgent={(agent) => setSelectedAgent(agent)}
          onClearLogs={handleClearLogs}
          onApprove={handleApprove}
          onReject={handleReject}
          onSelectTask={(task) => setSelectedTaskForResult(task)}
          onSelectApproval={(appr) => setSelectedApprovalDetail(appr)}
          brainKnowledge={brainKnowledge}
          onUpdateKnowledge={setBrainKnowledge}
          onAddLog={addLog}
          selectedItemId={selectedBrainItemId}
          onSelectItem={setSelectedBrainItemId}
          
          // Studio 추가 props
          skills={skills}
          tools={tools}
          permissionMatrix={permissionMatrix}
          onUpdateAgents={setAgents}
          onUpdateSkills={setSkills}
          onUpdateTools={setTools}
          onUpdatePermissionMatrix={setPermissionMatrix}
          activeSubTab={studioSubTab}
          onChangeSubTab={setStudioSubTab}
          selectedAgentId={selectedAgentId}
          onSelectAgentId={setSelectedAgentId}
          onSelectBrainId={setSelectedBrainItemId}
          onResetAllData={handleResetAllData}

          // Engine 추가 props
          engineMode={engineMode}
          engineProviders={engineProviders}
          engineRoutingRules={engineRoutingRules}
          engineSafetyRules={engineSafetyRules}
          engineUsageLogs={engineUsageLogs}
          onUpdateEngineMode={setEngineMode}
          onUpdateEngineProviders={setEngineProviders}
          onUpdateEngineRoutingRules={setEngineRoutingRules}
          onUpdateEngineSafetyRules={setEngineSafetyRules}
          onUpdateEngineUsageLogs={setEngineUsageLogs}

          // Data Connector 추가 props
          activeOperationsData={activeOperationsData}
          setActiveOperationsData={setActiveOperationsData}
          importHistory={importHistory}
          setImportHistory={setImportHistory}

          // Calendar 추가 props
          lastSelectedDate={lastSelectedDate}
          setLastSelectedDate={setLastSelectedDate}
          lastViewedMonth={lastViewedMonth}
          setLastViewedMonth={setLastViewedMonth}
          lastNativeAgentRun={lastNativeAgentRun}

          // Native Runtime Verification props
          validationScenario={validationScenario}
          onScenarioChange={setValidationScenario}
          uploadedFiles={uploadedFiles}
          onAddFileMetadata={handleAddFileMetadata}
          manualCommands={manualCommands}
          onAddManualCommand={handleAddManualCommand}
        />
        </>
      )}

      {currentSelectedAgent && (
        <AgentDetailModal
          agent={currentSelectedAgent}
          onClose={() => setSelectedAgent(null)}
          onDirectInstruct={handleDirectInstruct}
          onNavigateToBrain={(itemId) => {
            setSelectedAgent(null);
            setSelectedBrainItemId(itemId);
            setActiveTab('brain');
          }}
          onNavigateToStudio={(agentId) => {
            setSelectedAgent(null);
            setSelectedAgentId(agentId);
            setStudioSubTab('agent');
            setActiveTab('studio');
          }}
        />
      )}

      {report && (
        <ReportModal
          report={report}
          onClose={handleCloseReport}
          activeOperationsData={activeOperationsData}
          setActiveTab={setActiveTab}
          setLastSelectedDate={setLastSelectedDate}
        />
      )}

      {selectedTaskForResult && (
        <TaskResultModal
          task={selectedTaskForResult}
          onClose={() => setSelectedTaskForResult(null)}
          // RC-2 D-1: 결과 화면에는 이력 전체를 넘긴다(승인·미채택·중단도 계속 조회 가능).
          approvalQueue={approvalHistory}
          onApprove={handleApprove}
          onReject={handleReject}
          onCancel={handleCancel}
        />
      )}

      {selectedApprovalDetail && (
        <ApprovalDetailModal
          item={selectedApprovalDetail}
          onRequestRevision={handleRequestRevision}
          onReturn={tasks.find(t => t.id === selectedApprovalDetail.taskId)?.parentTaskId ? handleReturn : undefined}
          onClose={() => setSelectedApprovalDetail(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}

export default App;
