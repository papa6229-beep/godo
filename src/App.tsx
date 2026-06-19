// Godo AI Operating Center Main Entry
import { useState, useEffect } from 'react';
import type { Agent, LogEntry } from './types';
import type { OperationTask } from './types/task';
import type { ApprovalItem } from './types/approval';
import type { OperationReport } from './types/operation';
import { initialAgents } from './data/agents';
import { createDailyOperationTasks } from './engine/taskPlanner';
import { routeTask } from './engine/taskRouter';
import { executeTask } from './engine/taskExecutor';
import { TaskResultModal } from './components/TaskResultModal';
import { ApprovalDetailModal } from './components/ApprovalDetailModal';
import type { OperationArtifact } from './types/operationArtifact';
import { composeOperationReport } from './engine/reportComposer';
import { selectAIModel } from './engine/modelRouter';
import { mockGodoData } from './data/mockGodoData';
import { generateCSDrafts } from './engine/csDraftGenerator';
import { OpeningScreen } from './components/OpeningScreen';
import { MainLayout } from './components/MainLayout';
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
import type { OperationHistoryItem } from './types/calendar';
import { resetApiBridgeState } from './utils/apiBridgeStorage';
import './App.css';

function getRiskLevelAndPermission(task: OperationTask): 'low' | 'medium' | 'high' | 'critical' {
  const title = task.title;
  const agentId = task.assignedAgentId;
  
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  if (title.includes('가격') || title.includes('price')) {
    riskLevel = 'critical';
  } else if (title.includes('환불') || title.includes('refund')) {
    riskLevel = 'critical';
  } else if (title.includes('쿠폰') || title.includes('coupon')) {
    riskLevel = 'high';
  } else if (title.includes('마케팅') || title.includes('캠페인') || agentId === 'marketing') {
    riskLevel = 'high';
  } else if (title.includes('상품') || title.includes('수정') || title.includes('등록')) {
    riskLevel = 'high';
  } else if (agentId === 'cs') {
    riskLevel = 'medium';
  } else if (agentId === 'review') {
    riskLevel = 'medium';
  } else {
    riskLevel = task.riskLevel || 'medium';
  }
  
  return riskLevel;
}

function App() {
  const [showOpening, setShowOpening] = useState(true);
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [operationRunState, setOperationRunState] = useState<'idle' | 'running' | 'completed'>('idle');
  const [activeTab, setActiveTab] = useState<'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar'>('office');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalItem[]>([]);
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
  const [activeOperationsData, setActiveOperationsData] = useState<OperationsDataSnapshot>(() => {
    try {
      const saved = localStorage.getItem('godo.data.activeSnapshot');
      return saved ? JSON.parse(saved) : defaultOperationsData;
    } catch {
      return defaultOperationsData;
    }
  });

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [studioSubTab, setStudioSubTab] = useState<'brain' | 'agent' | 'skills' | 'tools' | 'permissions' | 'import_export'>('brain');

  // LocalStorage 자동 동기화 훅
  useEffect(() => {
    localStorage.setItem('godo.brainKnowledge', JSON.stringify(brainKnowledge));
    localStorage.setItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [brainKnowledge]);

  useEffect(() => {
    localStorage.setItem('godo.agents', JSON.stringify(agents));
    localStorage.setItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [agents]);

  useEffect(() => {
    localStorage.setItem('godo.skills', JSON.stringify(skills));
    localStorage.setItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [skills]);

  useEffect(() => {
    localStorage.setItem('godo.tools', JSON.stringify(tools));
    localStorage.setItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [tools]);

  useEffect(() => {
    localStorage.setItem('godo.permissionMatrix', JSON.stringify(permissionMatrix));
    localStorage.setItem('godo.studio.lastSavedAt', new Date().toISOString());
  }, [permissionMatrix]);

  // GODO ENGINE LocalStorage 자동 동기화 훅
  useEffect(() => {
    localStorage.setItem('godo.engine.mode', engineMode);
    localStorage.setItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineMode]);

  useEffect(() => {
    localStorage.setItem('godo.engine.providers', JSON.stringify(engineProviders));
    localStorage.setItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineProviders]);

  useEffect(() => {
    localStorage.setItem('godo.engine.routingRules', JSON.stringify(engineRoutingRules));
    localStorage.setItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineRoutingRules]);

  useEffect(() => {
    localStorage.setItem('godo.engine.safetyRules', JSON.stringify(engineSafetyRules));
    localStorage.setItem('godo.engine.lastSavedAt', new Date().toISOString());
  }, [engineSafetyRules]);

  // GODO DATA CONNECTOR LocalStorage 자동 동기화 훅
  useEffect(() => {
    localStorage.setItem('godo.data.activeSnapshot', JSON.stringify(activeOperationsData));
    localStorage.setItem('godo.data.lastSavedAt', new Date().toISOString());
  }, [activeOperationsData]);

  useEffect(() => {
    localStorage.setItem('godo.data.importHistory', JSON.stringify(importHistory));
    localStorage.setItem('godo.data.lastSavedAt', new Date().toISOString());
  }, [importHistory]);

  // GODO OPERATION CALENDAR LocalStorage 자동 동기화 훅
  useEffect(() => {
    localStorage.setItem('godo.calendar.lastSelectedDate', lastSelectedDate);
  }, [lastSelectedDate]);

  useEffect(() => {
    localStorage.setItem('godo.calendar.lastViewedMonth', lastViewedMonth);
  }, [lastViewedMonth]);

  useEffect(() => {
    localStorage.setItem('godo.calendar.operationHistory', JSON.stringify(operationHistory));
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
    setOperationRunState('idle');
    setBrainKnowledge(initialBrainKnowledgeItems);
    setAgents(initialAgents);
    setSkills(defaultSkills);
    setTools(defaultTools);
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
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    setOperationRunState('running');
    setReport(null);
    setApprovalQueue([]);
    
    // 0. 데이터 소스 정보 로깅
    if (activeOperationsData && activeOperationsData.sourceType !== 'demo') {
      addLog(`[Data] 현재 ${activeOperationsData.sourceType.toUpperCase()} 업로드 데이터 스냅샷을 기준으로 운영을 시작합니다.`, 'info', 'SYSTEM');
      const lastUpdate = activeOperationsData.importedAt ? new Date(activeOperationsData.importedAt).toLocaleString() : '미정';
      addLog(`[Data] 데이터 소스: ${activeOperationsData.sourceType}, 마지막 업데이트: ${lastUpdate}`, 'info', 'SYSTEM');
    } else {
      addLog('[Data] 업로드된 운영 데이터가 없어 Demo 데이터로 운영을 시작합니다.', 'info', 'SYSTEM');
    }

    // 1. 작업 플래닝
    const dailyTasks = createDailyOperationTasks(activeOperationsData);
    setTasks(dailyTasks);
    
    // 매니저가 업무 분석 시작
    setAgents(prev => prev.map(a => 
      a.id === 'manager' 
        ? { ...a, status: 'working', bubbleText: '운영 작업 분석 및 분해 중...' } 
        : { ...a, status: 'idle', bubbleText: undefined }
    ));
    
    addLog('오늘의 운영 작업을 생성했습니다.', 'info', 'CEO');
    
    const currentTasks = [...dailyTasks];
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    await sleep(1500);
    
    for (let i = 0; i < currentTasks.length; i++) {
      const task = currentTasks[i];
      
      // 2. 라우팅
      const routedTask = routeTask(task, engineMode, engineRoutingRules, engineSafetyRules);
      const modelConfig = selectAIModel(routedTask, engineMode, engineProviders, engineRoutingRules);
      
      currentTasks[i] = routedTask;
      setTasks([...currentTasks]);
      
      const agent = agents.find(a => a.id === routedTask.assignedAgentId);
      const shortAgentName = agent ? agent.name.split(' ')[0] : routedTask.assignedAgentId;
      
      // Usage Log 기록 생성
      const newUsageLog: EngineUsageLog = {
        id: `usage-${Date.now()}-${i}`,
        timestamp: getFormattedTime(),
        taskId: routedTask.id,
        taskTitle: routedTask.title,
        agentId: routedTask.assignedAgentId,
        routeType: routedTask.routeType,
        providerId: modelConfig.providerId || 'unknown',
        modelName: modelConfig.modelName,
        reason: routedTask.routeType === 'human' ? '민감 데이터/승인 필요로 휴먼 게이트 배정' : '인프라 및 규칙 기반 라우팅 완료',
        status: routedTask.routeType === 'human' ? 'blocked' : 'routed'
      };
      setEngineUsageLogs(prev => [...prev, newUsageLog]);

      addLog(`${routedTask.title} -> ${agent?.name || routedTask.assignedAgentId} 배정`, 'info', 'Router');
      
      // Engine 상세 로그 출력
      addLog(`[Engine] ${routedTask.title}은 ${routedTask.routeType.toUpperCase()} 규칙에 따라 ${modelConfig.modelName}으로 라우팅되었습니다.`, 'info', 'Engine');
      
      // 민감 정보 보호 차단 로그 모의 (Engine / Safety Guard 연동)
      const isSensitive = routedTask.title.includes('고객') || routedTask.title.includes('inquiry') || routedTask.title.includes('CS') || routedTask.title.includes('주문') || routedTask.relatedDataType === 'orders' || routedTask.relatedDataType === 'inquiries';
      const isSafetyRuleEnabled = (id: string) => engineSafetyRules.find(r => r.id === id)?.isEnabled ?? false;
      if (isSensitive && isSafetyRuleEnabled('safety_1')) {
        addLog(`[Safety] 고객 민감정보가 포함된 ${routedTask.relatedDataType === 'orders' ? '주문' : '문의'} 데이터는 Cloud Engine으로 전송하지 않습니다.`, 'warning', 'Engine');
        if (routedTask.assignedAgentId === 'cs') {
          addLog(`[Engine] CS 문의 분석 작업을 Local 또는 Hybrid 보호 경로로 라우팅했습니다.`, 'info', 'Engine');
        } else if (routedTask.routeType === 'local') {
          addLog(`[Engine] 고객 민감정보 보호를 위해 Cloud 전송을 차단하고 Local Engine으로 우회시켰습니다.`, 'warning', 'Engine');
        }
      }

      // 3. 작업 진행 상태로 갱신 (running)
      routedTask.status = 'running';
      currentTasks[i] = routedTask;
      setTasks([...currentTasks]);
      
      // 에이전트 캐릭터의 모션 상태 주입
      const characterStatus = routedTask.permission === 'approval_required' ? 'thinking' : 'working';
      setAgents(prev => prev.map(a => 
        a.id === routedTask.assignedAgentId 
          ? { ...a, status: characterStatus, bubbleText: `${routedTask.title} 수행 중...` } 
          : a
      ));
      
      addLog(`${routedTask.title}은 ${modelConfig.modelName}으로 처리합니다.`, 'info', 'Engine');
      
      if (routedTask.requiredSkills && routedTask.requiredSkills.length > 0) {
        addLog(`스킬 활성화: ${shortAgentName} AI가 [${routedTask.requiredSkills.join(', ')}] 스킬을 적용하여 분석을 수행합니다.`, 'agent', agent?.name);
      }
      
      // 실제 모의 실행 시간 대기
      await sleep(1200 + Math.random() * 600);
      
      // 4. 실행 결과 산정
      let executedTask: OperationTask;
      if (routedTask.assignedAgentId === 'cs') {
        const queryCount = activeOperationsData.inquiries.filter(inq => inq.status === '미답변').slice(0, 3).length;
        addLog(`[CS] 미답변 문의 ${queryCount}건 분석 시작`, 'info', 'CS');
        
        // LM Studio 설정 조회
        const lmsProvider = engineProviders.find(p => p.id === 'lms_gemma_4');
        const useRealLMS = lmsProvider && lmsProvider.status === 'connected' && lmsProvider.isEnabled;
        const modelId = lmsProvider?.modelName || 'google/gemma-4-e4b';
        
        if (useRealLMS) {
          addLog(`[LLM] Local Gemma 호출 시작: ${modelId}`, 'info', 'Engine');
        } else {
          addLog(`[LLM] Local Gemma 연결이 비활성화 상태이므로 템플릿 Fallback 모드를 준비합니다.`, 'warning', 'Engine');
        }
        
        addLog(`[Engine] CS 답변 초안 생성 작업을 시작합니다. (cs_reply_draft started)`, 'info', 'Engine');
        
        const startTime = Date.now();
        const draftResults = await generateCSDrafts(activeOperationsData, engineProviders);
        const elapsed = Date.now() - startTime;
        
        const isFallback = draftResults.some(r => r.fallbackUsed);
        
        if (isFallback) {
          if (useRealLMS) {
            addLog(`[LLM] Local Gemma 호출 실패`, 'error', 'Engine');
          }
          addLog(`[Fallback] CS 답변 초안은 템플릿으로 대체 생성됨 (cs_reply_draft fallback used)`, 'warning', 'Engine');
          addLog(`[Approval] Fallback CS 답변 초안 ${draftResults.length}건이 승인 대기열에 추가됨`, 'warning', 'Approval');
        } else {
          addLog(`[LLM] CS 답변 초안 ${draftResults.length}건 생성 완료`, 'success', 'Engine');
          addLog(`[Approval] CS 답변 초안 ${draftResults.length}건이 승인 대기열에 추가됨`, 'success', 'Approval');
        }
        
        if (draftResults.some(r => r.piiRemoved)) {
          addLog(`[Safety] 고객 개인정보는 마스킹 후 처리됨`, 'warning', 'Safety');
        }
        
        addLog(`[Engine] CS 답변 초안 생성 완료 (cs_reply_draft generated). 소요시간: ${elapsed}ms`, 'success', 'Engine');
        
        draftResults.forEach(res => {
          addLog(`[Engine] 문의 ID: ${res.inquiryId} 처리 완료 (elapsed time: ${res.latency}ms, fallback: ${res.fallbackUsed}, PII 제거: ${res.piiRemoved})`, 'info', 'Engine');
        });

        // CS 초안 작성 사용 이력 추가 기록
        const csUsageLog: EngineUsageLog = {
          id: `usage-cs-${Date.now()}-${i}`,
          timestamp: getFormattedTime(),
          taskId: routedTask.id,
          taskTitle: `${routedTask.title} (Draft Generated)`,
          agentId: 'cs',
          routeType: routedTask.routeType,
          providerId: modelConfig.providerId || 'lms_gemma_4',
          modelName: modelConfig.modelName,
          reason: `[taskType: cs_reply_draft] [fallbackUsed: ${isFallback}] [piiRemoved: ${draftResults.some(r => r.piiRemoved)}] [latency: ${elapsed}ms] [approvalRequired: true]`,
          status: isFallback ? 'fallback' : 'completed'
        };
        setEngineUsageLogs(prev => [...prev, csUsageLog]);

        // CSDraftResult 1건당 OperationArtifact 1건 생성
        const csArtifacts: OperationArtifact[] = draftResults.map((res, idx) => ({
          id: `art-cs-draft-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          taskId: routedTask.id,
          taskType: 'cs_reply_draft',
          agentId: 'cs',
          title: `CS 답변 초안 - ${res.customerNameMasked} 고객님`,
          sourceType: activeOperationsData.sourceType,
          originalIssue: res.originalContent,
          maskedInput: res.cleanedContent,
          generatedDraft: res.draftReply,
          summary: res.title,
          modelId: res.modelId,
          route: routedTask.routeType.toUpperCase() as 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK',
          latency: res.latency,
          fallbackUsed: res.fallbackUsed,
          piiRemoved: res.piiRemoved,
          riskLevel: 'medium',
          approvalStatus: 'waiting',
          referencedKnowledge: ['cs_policy.md', 'cs_auto_template.md'],
          createdAt: new Date().toISOString()
        }));

        // Approval Queue 적재 시 확장된 구조화 필드 적용
        const newCSApprovals: ApprovalItem[] = draftResults.map((res, idx) => {
          const proposedText = `[문의 요약]: ${res.title}\n[문의 내용]: ${res.cleanedContent}\n\n[답변 초안]: ${res.draftReply}\n\n[상세 정보]:\n- Model ID: ${res.modelId}\n- Latency: ${res.latency}ms\n- Fallback 사용 여부: ${res.fallbackUsed ? '예' : '아니오'}\n- PII 제거 여부: ${res.piiRemoved ? '예' : '아니오'}`;
          
          const apprId = `appr-cs-draft-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
          return {
            id: apprId,
            taskId: routedTask.id,
            title: `CS 답변 초안 - ${res.customerNameMasked} 고객님`,
            requestedByAgentId: 'cs',
            riskLevel: 'medium' as const,
            reason: 'CS 답변 초안 검토 및 승인 대기',
            proposedAction: proposedText,
            status: 'waiting' as const,
            originalIssue: res.originalContent,
            maskedInput: res.cleanedContent,
            generatedDraft: res.draftReply,
            metadata: {
              modelId: res.modelId,
              latency: res.latency,
              fallbackUsed: res.fallbackUsed,
              piiRemoved: res.piiRemoved,
              route: routedTask.routeType.toUpperCase() as 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK',
              taskType: 'cs_reply_draft',
              sourceType: activeOperationsData.sourceType,
              referencedKnowledge: ['cs_policy.md', 'cs_auto_template.md'],
              approvalRequired: true
            }
          };
        });

        executedTask = {
          ...routedTask,
          status: 'needs_approval' as const,
          resultSummary: `미답변 문의 ${draftResults.length}건에 대한 CS 답변 초안을 성공적으로 생성했습니다.`,
          logs: [
            ...routedTask.logs || [],
            `[Engine] CS 답변 초안 생성 모듈 기동.`,
            `[Engine] 소요 시간: ${elapsed}ms`,
            `[Engine] 감지된 모델: ${modelId}`,
            `[Engine] PII 마스킹 처리 결과: ${draftResults.some(r => r.piiRemoved) ? '제거 완료' : '대상 없음'}`,
            `[Engine] Fallback 적용 건수: ${draftResults.filter(r => r.fallbackUsed).length}건`
          ],
          completedAt: new Date().toISOString(),
          artifacts: csArtifacts,
          approvalItemIds: newCSApprovals.map(a => a.id)
        };
        
        setApprovalQueue(prev => [...prev, ...newCSApprovals]);
        addLog(`[Engine] cs_reply_draft 승인 카드가 대기열에 추가되었습니다. (cs_reply_draft approval queued)`, 'info', 'Engine');
      } else {
        executedTask = await executeTask(routedTask, mockGodoData, activeOperationsData);
      }

      // CS 외 에이전트의 산출물/아티팩트 구조화 추가
      if (executedTask.assignedAgentId !== 'cs') {
        const riskLevel = getRiskLevelAndPermission(executedTask);
        const artId = `art-ex-${Date.now()}-${i}`;
        const defaultArtifact: OperationArtifact = {
          id: artId,
          taskId: executedTask.id,
          taskType: 'auto_execution',
          agentId: executedTask.assignedAgentId,
          title: executedTask.title,
          summary: executedTask.resultSummary,
          generatedDraft: executedTask.resultSummary,
          riskLevel: riskLevel,
          route: executedTask.routeType.toUpperCase() as 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK',
          approvalStatus: executedTask.status === 'needs_approval' ? 'waiting' : 'none',
          createdAt: new Date().toISOString()
        };
        executedTask.artifacts = [defaultArtifact];
      }

      currentTasks[i] = executedTask;
      setTasks([...currentTasks]);

      // RAG 지식 참조 시뮬레이션: brainKnowledge 사용 횟수(usageCount) 및 로그 업데이트
      let referencedFiles: string[] = [];
      if (executedTask.assignedAgentId === 'order') {
        referencedFiles = ['order_check_template.md'];
      } else if (executedTask.assignedAgentId === 'cs') {
        referencedFiles = ['cs_policy.md', 'cs_auto_template.md'];
      } else if (executedTask.assignedAgentId === 'stock') {
        referencedFiles = ['inventory_snapshot.json'];
      } else if (executedTask.assignedAgentId === 'finance') {
        referencedFiles = ['sales_report_template.md'];
      } else if (executedTask.assignedAgentId === 'marketing') {
        referencedFiles = ['campaign_result_report.md', 'marketing_decision_log.md'];
      } else if (executedTask.assignedAgentId === 'review') {
        referencedFiles = ['review_reply_template.md'];
      }

      if (referencedFiles.length > 0) {
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
          if (file === 'inventory_snapshot.json' && activeOperationsData) {
            addLog(`[Brain] inventory_snapshot.json이 현재 운영 데이터 스냅샷 기준으로 참조되었습니다.`, 'info', 'Brain');
          } else {
            addLog(`[Brain] RAG 시스템이 지식 저장소에서 "${file}"을(를) 참조했습니다.`, 'info', 'Brain');
          }
        });
      }
      
      // 4-7. Today’s Tasks와 Approval Queue 상태 연결
      const isApprovalRequired =
        routedTask.permission === 'approval_required' ||
        routedTask.permission === 'draft_only' ||
        routedTask.assignedAgentId === 'cs';

      if (isApprovalRequired) {
        executedTask.status = 'needs_approval';
      }

      // 상태 분기 처리
      if (executedTask.status === 'needs_approval') {
        // 에이전트를 승인 대기 중으로 유지
        setAgents(prev => prev.map(a => 
          a.id === executedTask.assignedAgentId 
            ? { ...a, status: 'thinking', bubbleText: '승인 대기 중...' } 
            : a
        ));
        
        // 승인 대기 목록 추가 (CS는 위에서 카드별로 이미 추가했으므로 제외)
        if (executedTask.assignedAgentId !== 'cs') {
          const riskLevel = getRiskLevelAndPermission(executedTask);
          const apprId = `appr-${Date.now()}-${i}`;
          const newApproval: ApprovalItem = {
            id: apprId,
            taskId: executedTask.id,
            title: executedTask.title,
            requestedByAgentId: executedTask.assignedAgentId,
            riskLevel: riskLevel,
            reason: `${executedTask.title} 검토 및 승인 대기`,
            proposedAction: executedTask.resultSummary || '',
            status: 'waiting' as const,
            originalIssue: executedTask.description,
            generatedDraft: executedTask.resultSummary,
            metadata: {
              route: executedTask.routeType.toUpperCase() as 'LOCAL' | 'HYBRID' | 'CLOUD' | 'HUMAN' | 'MOCK',
              taskType: 'auto_execution',
              sourceType: activeOperationsData.sourceType,
              referencedKnowledge: [`${executedTask.assignedAgentId}_policy.md`],
              approvalRequired: true
            }
          };
          executedTask.approvalItemIds = [apprId];
          setApprovalQueue(prev => [...prev, newApproval]);
          addLog(`[Engine] ${executedTask.title} 승인 카드가 대기열에 추가되었습니다. (approval queued)`, 'info', 'Engine');
        }
        
        addLog(`${shortAgentName} AI가 ${executedTask.assignedAgentId}_operation_template.md를 참조했습니다.`, 'agent', 'Brain');
        addLog(`${executedTask.title}은 승인 대기 상태입니다.`, 'warning', 'Approval');
      } else {
        // 에이전트를 완료 상태로 전환
        setAgents(prev => prev.map(a => 
          a.id === executedTask.assignedAgentId 
            ? { ...a, status: 'completed', bubbleText: '작업 완료!' } 
            : a
        ));
        
        addLog(executedTask.resultSummary || '', 'success', agent?.name);
        addLog(`${shortAgentName} AI가 ${executedTask.assignedAgentId}_auto_template.md를 참조했습니다.`, 'agent', 'Brain');
      }
      
      await sleep(1000);
    }
    
    // 5. 종합 운영 리포트 작성
    const finalReport = composeOperationReport(currentTasks, activeOperationsData);
    setReport(finalReport);
    
    setAgents(prev => prev.map(a => 
      a.id === 'manager' 
        ? { ...a, status: 'completed', bubbleText: '오늘의 운영 리포트 작성 완료!' } 
        : a
    ));

    // OperationHistoryItem 축적 저장 (GODO CALENDAR 연동)
    const newHistoryItem: OperationHistoryItem = {
      id: `op-hist-${Date.now()}`,
      date: activeOperationsData.importedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
      timestamp: new Date().toLocaleTimeString(),
      sourceType: activeOperationsData.sourceType,
      reportTitle: `일일 자동화 운영 보고서 (${activeOperationsData.sourceType.toUpperCase()})`,
      autoCompletedCount: finalReport.autoCompletedCount,
      approvalPendingCount: finalReport.approvalRequiredCount,
      issueHighlights: finalReport.warningSignals,
      createdFrom: 'start_operation'
    };
    setOperationHistory(prev => [newHistoryItem, ...prev]);
    
    addLog('오늘의 운영 리포트를 생성했습니다.', 'success', 'CEO');
    setIsSimulating(false);
    setOperationRunState('completed');
  };

  // 수동 태스크 추가
  const handleAddTask = (title: string, agentId: string) => {
    const newTask: OperationTask = {
      id: `opt-task-${Date.now()}`,
      title,
      description: `수동으로 추가된 작업: ${title}`,
      assignedAgentId: agentId,
      status: 'pending',
      riskLevel: 'low',
      permission: 'auto',
      routeType: 'local',
      createdAt: new Date().toISOString()
    };
    
    setTasks(prev => [...prev, newTask]);
    const agent = agents.find(a => a.id === agentId);
    addLog(`사용자가 새로운 수동 작업 "${title}"을 추가하고 [${agent?.name || agentId}] 에이전트에 배정했습니다.`, 'info', 'SYSTEM');
  };

  // 상세 모달에서 개별 지시 내리기
  const handleDirectInstruct = (agentId: string, instruction: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

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

  // 승인 처리 액션
  const handleApprove = (approvalId: string) => {
    const item = approvalQueue.find(i => i.id === approvalId);
    if (!item) return;

    // 관련 태스크를 완료 상태로 변경
    setTasks(currentTasks => currentTasks.map(t => {
      if (t.id === item.taskId) {
        const updatedArtifacts = t.artifacts?.map(art => {
          if (t.assignedAgentId === 'cs') {
            const isMatch = item.title.includes(art.title.replace('CS 답변 초안 - ', '').replace(' 고객님', '')) || item.proposedAction.includes(art.generatedDraft || '');
            if (isMatch) return { ...art, approvalStatus: 'approved' as const };
          } else {
            return { ...art, approvalStatus: 'approved' as const };
          }
          return art;
        });

        return {
          ...t,
          status: 'completed',
          resultSummary: `${t.resultSummary} (운영자 최종 승인 완료)`,
          artifacts: updatedArtifacts
        };
      }
      return t;
    }));

    // 관련 에이전트 캐릭터를 완료 상태로 갱신하여 픽셀 오피스에 피드백
    setAgents(currentAgents => currentAgents.map(a => 
      a.id === item.requestedByAgentId 
        ? { ...a, status: 'completed', bubbleText: '승인 확인 완료! 🎉' } 
        : a
    ));

    const isCS = item.id.includes('appr-cs-draft') || item.title.includes('CS 답변 초안');
    
    if (isCS) {
      addLog(`[Approval] CS 답변 초안 승인됨 (approval approved)`, 'success', 'Approval');
      addLog(`[System] 실제 고도몰 답변 등록은 아직 미연동 상태입니다.`, 'info', 'SYSTEM');
    } else {
      addLog(`[Approval] "${item.title}" 작업이 운영자 승인을 통과했습니다.`, 'success', 'Approval');
      addLog(`[System] 승인 처리된 고도몰 액션(쿠폰/발행)을 외부 API 샌드박스로 커밋 완료.`, 'info', 'SYSTEM');
    }

    // approval approved Usage Log 기록
    const approvalUsageLog: EngineUsageLog = {
      id: `usage-appr-ok-${Date.now()}`,
      timestamp: getFormattedTime(),
      taskId: item.taskId,
      taskTitle: item.title,
      agentId: item.requestedByAgentId,
      routeType: 'human',
      providerId: 'human_gate',
      modelName: 'System Operator',
      reason: `[taskType: approval] [status: approved]`,
      status: 'completed'
    };
    setEngineUsageLogs(prev => [...prev, approvalUsageLog]);

    // 큐에서 아이템 제거
    setApprovalQueue(prev => prev.filter(i => i.id !== approvalId));

    // 상세 모달 열려있으면 동기화 후 닫기
    setSelectedApprovalDetail(null);
  };

  // 거절 처리 액션
  const handleReject = (approvalId: string) => {
    const item = approvalQueue.find(i => i.id === approvalId);
    if (!item) return;

    // 관련 태스크를 실패 상태로 변경
    setTasks(currentTasks => currentTasks.map(t => {
      if (t.id === item.taskId) {
        const updatedArtifacts = t.artifacts?.map(art => {
          if (t.assignedAgentId === 'cs') {
            const isMatch = item.title.includes(art.title.replace('CS 답변 초안 - ', '').replace(' 고객님', '')) || item.proposedAction.includes(art.generatedDraft || '');
            if (isMatch) return { ...art, approvalStatus: 'rejected' as const };
          } else {
            return { ...art, approvalStatus: 'rejected' as const };
          }
          return art;
        });

        return {
          ...t,
          status: 'failed',
          resultSummary: `${t.resultSummary} (운영자 검토 후 반려 처리)`,
          artifacts: updatedArtifacts
        };
      }
      return t;
    }));

    // 관련 에이전트 캐릭터를 대기 상태로 원복
    setAgents(currentAgents => currentAgents.map(a => 
      a.id === item.requestedByAgentId 
        ? { ...a, status: 'idle', bubbleText: '작업 반려됨' } 
        : a
    ));

    const isCS = item.id.includes('appr-cs-draft') || item.title.includes('CS 답변 초안');
    
    if (isCS) {
      addLog(`[Approval] CS 답변 초안 거절됨 (approval rejected)`, 'error', 'Approval');
    } else {
      addLog(`[Approval] "${item.title}" 작업이 운영자에 의해 반려(Reject)되었습니다.`, 'error', 'Approval');
    }

    // approval rejected Usage Log 기록
    const approvalUsageLog: EngineUsageLog = {
      id: `usage-appr-no-${Date.now()}`,
      timestamp: getFormattedTime(),
      taskId: item.taskId,
      taskTitle: item.title,
      agentId: item.requestedByAgentId,
      routeType: 'human',
      providerId: 'human_gate',
      modelName: 'System Operator',
      reason: `[taskType: approval] [status: rejected]`,
      status: 'blocked'
    };
    setEngineUsageLogs(prev => [...prev, approvalUsageLog]);

    // 큐에서 아이템 제거
    setApprovalQueue(prev => prev.filter(i => i.id !== approvalId));

    // 상세 모달 열려있으면 동기화 후 닫기
    setSelectedApprovalDetail(null);
  };

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
        <MainLayout
          agents={agents}
          tasks={tasks}
          logs={logs}
          isSimulating={isSimulating}
          operationRunState={operationRunState}
          activeTab={activeTab}
          approvalQueue={approvalQueue}
          setActiveTab={setActiveTab}
          onStartSimulation={handleStartSimulation}
          onAddTask={handleAddTask}
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
        />
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
          approvalQueue={approvalQueue}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {selectedApprovalDetail && (
        <ApprovalDetailModal
          item={selectedApprovalDetail}
          onClose={() => setSelectedApprovalDetail(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </>
  );
}

export default App;
