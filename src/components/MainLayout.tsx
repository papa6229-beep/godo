import React from 'react';
import type { Agent, LogEntry } from '../types';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { BrainKnowledgeItem } from '../types/brain';
import type { SkillItem, ToolItem, PermissionMatrixItem } from '../types/studio';
import type { EngineMode, EngineProvider, EngineRoutingRule, EngineSafetyRule, EngineUsageLog } from '../types/engine';
import { ChatConsole } from './ChatConsole';
import { AgentPanel } from './AgentPanel';
import { OfficeView } from './OfficeView';
import { ActivityLog } from './ActivityLog';
import { BrainPanel } from './BrainPanel';
import { StudioPanel } from './StudioPanel';
import { EnginePanel } from './EnginePanel';
import { DataPanel } from './DataPanel';
import { CalendarPanel } from './CalendarPanel';
import { ApiBridgePanel } from './ApiBridgePanel';
import type { OperationsDataSnapshot, ImportHistoryItem } from '../types/dataConnector';
import './MainLayout.css';

interface MainLayoutProps {
  agents: Agent[];
  tasks: OperationTask[];
  logs: LogEntry[];
  isSimulating: boolean;
  activeTab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar';
  approvalQueue: ApprovalItem[];
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar') => void;
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onClearLogs: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  
  // Brain 관련 props
  brainKnowledge: BrainKnowledgeItem[];
  onUpdateKnowledge: (updatedItems: BrainKnowledgeItem[]) => void;
  onAddLog: (text: string, type: LogEntry['type'], agentName?: string) => void;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;

  // Studio 관련 props
  skills: SkillItem[];
  tools: ToolItem[];
  permissionMatrix: PermissionMatrixItem[];
  onUpdateAgents: (items: Agent[]) => void;
  onUpdateSkills: (items: SkillItem[]) => void;
  onUpdateTools: (items: ToolItem[]) => void;
  onUpdatePermissionMatrix: (items: PermissionMatrixItem[]) => void;
  activeSubTab: 'brain' | 'agent' | 'skills' | 'tools' | 'permissions' | 'import_export';
  onChangeSubTab: (tab: 'brain' | 'agent' | 'skills' | 'tools' | 'permissions' | 'import_export') => void;
  selectedAgentId: string | null;
  onSelectAgentId: (id: string | null) => void;
  onSelectBrainId: (id: string | null) => void;
  onResetAllData: () => void;

  // Engine 관련 props
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

  // Data Connector 관련 props
  activeOperationsData: OperationsDataSnapshot;
  setActiveOperationsData: React.Dispatch<React.SetStateAction<OperationsDataSnapshot>>;
  importHistory: ImportHistoryItem[];
  setImportHistory: React.Dispatch<React.SetStateAction<ImportHistoryItem[]>>;

  // Calendar 관련 props
  lastSelectedDate: string;
  setLastSelectedDate: (date: string) => void;
  lastViewedMonth: string;
  setLastViewedMonth: (month: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  agents,
  tasks,
  logs,
  isSimulating,
  activeTab,
  approvalQueue,
  setActiveTab,
  onStartSimulation,
  onAddTask,
  onSelectAgent,
  onClearLogs,
  onApprove,
  onReject,
  brainKnowledge,
  onUpdateKnowledge,
  onAddLog,
  selectedItemId,
  onSelectItem,
  
  skills,
  tools,
  permissionMatrix,
  onUpdateAgents,
  onUpdateSkills,
  onUpdateTools,
  onUpdatePermissionMatrix,
  activeSubTab,
  onChangeSubTab,
  selectedAgentId,
  onSelectAgentId,
  onSelectBrainId,
  onResetAllData,

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
  
  activeOperationsData,
  setActiveOperationsData,
  importHistory,
  setImportHistory,
  
  lastSelectedDate,
  setLastSelectedDate,
  lastViewedMonth,
  setLastViewedMonth
}) => {
  return (
    <div className="main-layout">
      {/* 상단 헤더 */}
      <header className="main-header">
        <div className="header-left">
          <div className="logo-icon">🛰️</div>
          <div className="logo-text-group">
            <h1 className="logo-title">GODO AI OS</h1>
            <span className="logo-subtitle">OPERATING CENTER v1.0</span>
          </div>
        </div>

        <div className="header-center">
          <span className="demo-badge">
            <span className="badge-blink"></span>
            LOCAL DEMO MODE
          </span>
        </div>

        <div className="header-right">
          <button
            className={`header-run-btn ${isSimulating ? 'running' : ''}`}
            onClick={onStartSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? '🛰️ RUNNING' : '▶ START OPERATION'}
          </button>

          <div className="header-nav-tabs">
            <button
              className={`nav-tab-btn ${activeTab === 'office' ? 'active' : ''}`}
              onClick={() => setActiveTab('office')}
              title="가상 사무실 뷰"
            >
              🏢 OFFICE
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
              title="에이전트 목록"
            >
              🤖 AGENTS
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'brain' ? 'active' : ''}`}
              onClick={() => setActiveTab('brain')}
              title="지식 저장소"
            >
              🧠 BRAIN
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('studio')}
              title="에이전트 및 지식 설정 편집실"
            >
              ⚙️ STUDIO
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'engine' ? 'active' : ''}`}
              onClick={() => setActiveTab('engine')}
              title="AI 모델 엔진 라우터 설정"
            >
              🚀 ENGINE
            </button>
             <button
               className={`nav-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
               onClick={() => setActiveTab('data')}
               title="쇼핑몰 데이터 적재 및 관리"
             >
               📡 DATA
             </button>
             <button
               className={`nav-tab-btn ${activeTab === 'api' ? 'active' : ''}`}
               onClick={() => setActiveTab('api')}
               title="고도몰 API 연동 및 보안 미들웨어"
             >
               🔌 API
             </button>
             <button
               className={`nav-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
               onClick={() => setActiveTab('calendar')}
               title="일자별 운영 캘린더 및 일지"
             >
               📅 CALENDAR
             </button>
             <button
               className={`nav-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
               onClick={() => setActiveTab('logs')}
               title="실시간 시스템 로그"
             >
               📝 LOGS
             </button>
          </div>
        </div>
      </header>

      {/* 메인 뷰포트 영역 */}
      <div className="main-viewport">
        {/* 좌측: 메인 채팅 제어 콘솔 */}
        <aside className="viewport-left">
          <ChatConsole />
        </aside>

        {/* 우측: 다이나믹 패널 표시 영역 */}
        <main 
          className="viewport-right" 
          tabIndex={-1} 
          style={{ outline: 'none' }}
        >
          {activeTab === 'office' && (
            <OfficeView
              agents={agents}
              tasks={tasks}
              logs={logs}
              isSimulating={isSimulating}
              approvalQueue={approvalQueue}
              onStartSimulation={onStartSimulation}
              onAddTask={onAddTask}
              onSelectAgent={onSelectAgent}
              onClearLogs={onClearLogs}
              onApprove={onApprove}
              onReject={onReject}
            />
          )}

          {activeTab === 'agents' && (
            <AgentPanel agents={agents} onSelectAgent={onSelectAgent} />
          )}

          {activeTab === 'brain' && (
            <BrainPanel
              brainKnowledge={brainKnowledge}
              agents={agents}
              onUpdateKnowledge={onUpdateKnowledge}
              onAddLog={onAddLog}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onNavigateToStudio={(itemId) => {
                onSelectBrainId(itemId);
                onChangeSubTab('brain');
                setActiveTab('studio');
              }}
            />
          )}

          {activeTab === 'studio' && (
            <StudioPanel
              brainKnowledge={brainKnowledge}
              agents={agents}
              skills={skills}
              tools={tools}
              permissionMatrix={permissionMatrix}
              onUpdateKnowledge={onUpdateKnowledge}
              onUpdateAgents={onUpdateAgents}
              onUpdateSkills={onUpdateSkills}
              onUpdateTools={onUpdateTools}
              onUpdatePermissionMatrix={onUpdatePermissionMatrix}
              onAddLog={onAddLog}
              activeSubTab={activeSubTab}
              onChangeSubTab={onChangeSubTab}
              selectedBrainId={selectedItemId}
              onSelectBrainId={onSelectBrainId}
              selectedAgentId={selectedAgentId}
              onSelectAgentId={onSelectAgentId}
              onResetAllData={onResetAllData}
              engineMode={engineMode}
              engineProviders={engineProviders}
              engineRoutingRules={engineRoutingRules}
              engineSafetyRules={engineSafetyRules}
              onUpdateEngineMode={onUpdateEngineMode}
              onUpdateEngineProviders={onUpdateEngineProviders}
              onUpdateEngineRoutingRules={onUpdateEngineRoutingRules}
              onUpdateEngineSafetyRules={onUpdateEngineSafetyRules}
            />
          )}

          {activeTab === 'engine' && (
            <EnginePanel
              engineMode={engineMode}
              engineProviders={engineProviders}
              engineRoutingRules={engineRoutingRules}
              engineSafetyRules={engineSafetyRules}
              engineUsageLogs={engineUsageLogs}
              onUpdateEngineMode={onUpdateEngineMode}
              onUpdateEngineProviders={onUpdateEngineProviders}
              onUpdateEngineRoutingRules={onUpdateEngineRoutingRules}
              onUpdateEngineSafetyRules={onUpdateEngineSafetyRules}
              onUpdateEngineUsageLogs={onUpdateEngineUsageLogs}
              permissionMatrix={permissionMatrix}
              onAddLog={onAddLog}
            />
          )}

          {activeTab === 'logs' && (
            <div className="full-logs-panel">
              <ActivityLog logs={logs} onClearLogs={onClearLogs} />
            </div>
          )}

          {activeTab === 'data' && (
             <DataPanel
               activeOperationsData={activeOperationsData}
               setActiveOperationsData={setActiveOperationsData}
               importHistory={importHistory}
               setImportHistory={setImportHistory}
               onAddLog={onAddLog}
               setActiveTab={setActiveTab}
               setLastSelectedDate={setLastSelectedDate}
             />
           )}

          {activeTab === 'api' && (
             <ApiBridgePanel
               activeOperationsData={activeOperationsData}
               setActiveOperationsData={setActiveOperationsData}
               importHistory={importHistory}
               setImportHistory={setImportHistory}
               onAddLog={onAddLog}
               setActiveTab={setActiveTab}
               setLastSelectedDate={setLastSelectedDate}
             />
           )}

          {activeTab === 'calendar' && (
             <CalendarPanel
               activeOperationsData={activeOperationsData}
               lastSelectedDate={lastSelectedDate}
               setLastSelectedDate={setLastSelectedDate}
               lastViewedMonth={lastViewedMonth}
               setLastViewedMonth={setLastViewedMonth}
               setActiveTab={setActiveTab}
               onAddLog={onAddLog}
             />
           )}
        </main>
      </div>
    </div>
  );
};
