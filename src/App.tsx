// Godo AI Operating Center Main Entry
import { useState, useEffect } from 'react';
import type { Agent, LogEntry } from './types';
import type { OperationTask } from './types/task';
import type { ApprovalItem } from './types/approval';
import type { OperationReport } from './types/operation';
import { initialAgents } from './data/agents';
import { TaskResultModal } from './components/TaskResultModal';
import { ApprovalDetailModal } from './components/ApprovalDetailModal';
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
import { runNativeAgentOperation } from './engine/nativeAgentRuntime/nativeAgentRuntime';
import type { NativeAgentRun } from './engine/nativeAgentRuntime/types';
import { resetApiBridgeState } from './utils/apiBridgeStorage';
import { composeOperationReport } from './engine/reportComposer';
import { getScenarioData, type ValidationScenarioType } from './engine/nativeAgentRuntime/validationScenarios';
import { useTheme } from './hooks/useTheme';
import './App.css';


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

  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar' | 'department'>('office');
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
      localStorage.setItem('godo.nativeAgentRuntime.lastRun', JSON.stringify(lastNativeAgentRun));
    }
  }, [lastNativeAgentRun]);

  useEffect(() => {
    localStorage.setItem('godo.nativeAgentRuntime.activeScenario', validationScenario);
  }, [validationScenario]);

  useEffect(() => {
    localStorage.setItem('godo.nativeAgentRuntime.uploadedFiles', JSON.stringify(uploadedFiles));
  }, [uploadedFiles]);

  useEffect(() => {
    localStorage.setItem('godo.nativeAgentRuntime.manualCommands', JSON.stringify(manualCommands));
  }, [manualCommands]);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [studioSubTab, setStudioSubTab] = useState<'brain' | 'agent' | 'agent_tasks' | 'skills' | 'tools' | 'permissions' | 'import_export'>('brain');

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
    setReport(null);
    setApprovalQueue([]);
    
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
      setAgents(prev => prev.map(a => {
        let matchingJob = null;
        if (a.id === 'manager') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'manager_agent');
        } else if (a.id === 'product') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'product_lead');
        } else if (a.id === 'order') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'product_analyst');
        } else if (a.id === 'stock') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'inventory_monitor');
        } else if (a.id === 'cs') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'cs_lead');
        } else if (a.id === 'delivery') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'inquiry_analyst');
        } else if (a.id === 'review') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'review_detector');
        } else if (a.id === 'marketing') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'marketing_lead');
        } else if (a.id === 'trend_researcher' || a.id === 'finance') {
          matchingJob = runtimeResult.run.jobs.find(j => j.assignedAgentId === 'trend_researcher');
        }

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

      // 3. Today's Tasks(tasks)에 협업 제안 반영
      const runtimeTasks: OperationTask[] = runtimeResult.orchestration.proposedTasks.map((t, idx) => ({
        id: `runtime-task-${idx}-${Date.now()}`,
        title: t.title,
        description: t.description,
        assignedAgentId: t.agentId,
        status: 'completed',
        riskLevel: 'medium',
        permission: 'approval_required',
        routeType: 'local',
        resultSummary: t.description,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }));
      setTasks(runtimeTasks);

      // 4. Approval Queue에 반영
      const newApprovals: ApprovalItem[] = runtimeResult.orchestration.proposedApprovalItems.map((item, idx) => {
        const apprId = `appr-runtime-${idx}-${Date.now()}`;
        return {
          id: apprId,
          taskId: `task-${item.agentId}-${Date.now()}`,
          title: item.title,
          requestedByAgentId: item.agentId,
          riskLevel: item.artifact.approvalRequired ? 'high' : 'medium',
          reason: item.reason,
          proposedAction: item.proposedAction + '\n\n' + item.artifact.body,
          status: 'waiting',
          originalIssue: item.artifact.body,
          generatedDraft: item.artifact.body,
          metadata: {
            modelId: (item.artifact.data?.modelId as string) || 'local_gemma',
            latency: 1200,
            fallbackUsed: false,
            piiRemoved: true,
            route: 'LOCAL',
            taskType: item.artifact.type,
            sourceType: activeOperationsData.sourceType,
            approvalRequired: item.artifact.approvalRequired
          }
        };
      });
      setApprovalQueue(newApprovals);

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
        id: `op-hist-${Date.now()}`,
        date: activeOperationsData.importedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        timestamp: new Date().toLocaleTimeString(),
        sourceType: activeOperationsData.sourceType,
        reportTitle: `Native 협업 자동화 운영 보고서 (${activeOperationsData.sourceType.toUpperCase()})`,
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
