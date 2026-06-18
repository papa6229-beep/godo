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
import { composeOperationReport } from './engine/reportComposer';
import { selectAIModel } from './engine/modelRouter';
import { mockGodoData } from './data/mockGodoData';
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
import './App.css';

function App() {
  const [showOpening, setShowOpening] = useState(true);
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data'>('office');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalItem[]>([]);
  const [report, setReport] = useState<OperationReport | null>(null);

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

  const handleResetAllData = () => {
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
    
    // 1. 작업 플래닝
    const dailyTasks = createDailyOperationTasks();
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
      
      // 민감 정보 보호 차단 로그 모의
      const isSensitive = routedTask.title.includes('고객') || routedTask.title.includes('inquiry') || routedTask.title.includes('CS') || routedTask.title.includes('주문');
      const isSafetyRuleEnabled = (id: string) => engineSafetyRules.find(r => r.id === id)?.isEnabled ?? false;
      if (isSensitive && isSafetyRuleEnabled('safety_1') && routedTask.routeType === 'local') {
        addLog(`[Engine] 고객 민감정보 보호를 위해 Cloud 전송을 차단하고 Local Engine으로 우회시켰습니다.`, 'warning', 'Engine');
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
      const executedTask = await executeTask(routedTask, mockGodoData);
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
          addLog(`[Brain] RAG 시스템이 지식 저장소에서 "${file}"을(를) 참조했습니다.`, 'info', 'Brain');
        });
      }
      
      // 상태 분기 처리
      if (executedTask.status === 'needs_approval') {
        // 에이전트를 승인 대기 중으로 유지
        setAgents(prev => prev.map(a => 
          a.id === executedTask.assignedAgentId 
            ? { ...a, status: 'thinking', bubbleText: '승인 대기 중...' } 
            : a
        ));
        
        // 승인 대기 목록 추가
        const newApproval: ApprovalItem = {
          id: `appr-${Date.now()}-${i}`,
          taskId: executedTask.id,
          title: executedTask.title,
          requestedByAgentId: executedTask.assignedAgentId,
          riskLevel: executedTask.riskLevel,
          reason: '정책 및 의사결정 승인 필요 (HIGH_RISK)',
          proposedAction: executedTask.resultSummary || '',
          status: 'waiting'
        };
        setApprovalQueue(prev => [...prev, newApproval]);
        
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
    const finalReport = composeOperationReport(currentTasks);
    setReport(finalReport);
    
    setAgents(prev => prev.map(a => 
      a.id === 'manager' 
        ? { ...a, status: 'completed', bubbleText: '오늘의 운영 리포트 작성 완료!' } 
        : a
    ));
    
    addLog('오늘의 운영 리포트를 생성했습니다.', 'success', 'CEO');
    setIsSimulating(false);
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
    setApprovalQueue(prev => prev.map(item => {
      if (item.id === approvalId) {
        // 해당 승인 아이템을 approved 처리
        const updatedItem = { ...item, status: 'approved' as const };
        
        // 관련 태스크를 완료 상태로 변경
        setTasks(currentTasks => currentTasks.map(t => {
          if (t.id === item.taskId) {
            return {
              ...t,
              status: 'completed',
              resultSummary: `${t.resultSummary} (운영자 최종 승인 완료)`
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
        
        addLog(`[Approval] "${item.title}" 작업이 운영자 승인을 통과했습니다.`, 'success', 'Approval');
        addLog(`[System] 승인 처리된 고도몰 액션(쿠폰/발행)을 외부 API 샌드박스로 커밋 완료.`, 'info', 'SYSTEM');
        
        return updatedItem;
      }
      return item;
    }));
  };

  // 거절 처리 액션
  const handleReject = (approvalId: string) => {
    setApprovalQueue(prev => prev.map(item => {
      if (item.id === approvalId) {
        // 해당 승인 아이템을 rejected 처리
        const updatedItem = { ...item, status: 'rejected' as const };
        
        // 관련 태스크를 실패 상태로 변경
        setTasks(currentTasks => currentTasks.map(t => {
          if (t.id === item.taskId) {
            return {
              ...t,
              status: 'failed',
              resultSummary: `${t.resultSummary} (운영자 검토 후 반려 처리)`
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
        
        addLog(`[Approval] "${item.title}" 작업이 운영자에 의해 반려(Reject)되었습니다.`, 'error', 'Approval');
        
        return updatedItem;
      }
      return item;
    }));
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
          activeTab={activeTab}
          approvalQueue={approvalQueue}
          setActiveTab={setActiveTab}
          onStartSimulation={handleStartSimulation}
          onAddTask={handleAddTask}
          onSelectAgent={(agent) => setSelectedAgent(agent)}
          onClearLogs={handleClearLogs}
          onApprove={handleApprove}
          onReject={handleReject}
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
        />
      )}
    </>
  );
}

export default App;
