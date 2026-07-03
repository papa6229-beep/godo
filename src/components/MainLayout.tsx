import React, { useState, useRef, useEffect } from 'react';
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
import { DepartmentWorkspacePanel } from './DepartmentWorkspacePanel';
import type { OperationsDataSnapshot, ImportHistoryItem } from '../types/dataConnector';
import type { NativeAgentRun } from '../engine/nativeAgentRuntime/types';
import type { ValidationScenarioType } from '../engine/nativeAgentRuntime/validationScenarios';
import './MainLayout.css';

// 관리/설정성 메뉴 — 우측 "관리자 설정" 드롭다운으로 묶음 (라우팅 키/화면 동작은 그대로)
type AdminNavKey = 'data' | 'api' | 'logs' | 'brain' | 'studio' | 'engine';
const ADMIN_NAV_GROUPS: { label: string; items: { key: AdminNavKey; label: string; title: string }[] }[] = [
  {
    label: '데이터 / 연동',
    items: [
      { key: 'data', label: '📡 데이터 가져오기', title: '쇼핑몰 데이터 적재 및 관리' },
      { key: 'api', label: '🔌 쇼핑몰 연동', title: '고도몰 API 연동 및 보안 미들웨어' }
    ]
  },
  {
    label: '기록 / 감사',
    items: [{ key: 'logs', label: '📝 작업기록', title: '실시간 시스템 작업기록' }]
  },
  {
    label: '지식 / AI 설정',
    items: [
      { key: 'brain', label: '🧠 업무 매뉴얼', title: '업무 지식 및 매뉴얼 관리' },
      { key: 'studio', label: '⚙️ AI 설정실', title: 'AI 직원 설정 편집실' },
      { key: 'engine', label: '🚀 AI 두뇌 설정', title: 'AI 모델 엔진 라우터 설정' }
    ]
  }
];
const ADMIN_NAV_KEYS: AdminNavKey[] = ['data', 'api', 'logs', 'brain', 'studio', 'engine'];

interface MainLayoutProps {
  agents: Agent[];
  tasks: OperationTask[];
  logs: LogEntry[];
  isSimulating: boolean;
  activeTab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar' | 'department';
  approvalQueue: ApprovalItem[];
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'api' | 'calendar' | 'department') => void;
  onStartSimulation: () => void;
  onAddTask: (title: string, agentId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onClearLogs: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectTask?: (task: OperationTask) => void;
  onSelectApproval?: (item: ApprovalItem) => void;
  
  
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
  activeSubTab: 'brain' | 'agent' | 'agent_tasks' | 'skills' | 'tools' | 'permissions' | 'import_export';
  onChangeSubTab: (tab: 'brain' | 'agent' | 'agent_tasks' | 'skills' | 'tools' | 'permissions' | 'import_export') => void;
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
  lastNativeAgentRun?: NativeAgentRun | null;

  // Native Runtime Verification props
  validationScenario: ValidationScenarioType;
  onScenarioChange: (scenario: ValidationScenarioType) => void;
  uploadedFiles: Record<string, { name: string; size: number; type: string; timestamp: string }[]>;
  onAddFileMetadata: (deptId: string, file: { name: string; size: number; type: string }) => void;
  manualCommands: Record<string, { text: string; timestamp: string }[]>;
  onAddManualCommand: (deptId: string, text: string) => void;

  // 테마
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
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
  onSelectTask,
  onSelectApproval,
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
  setLastViewedMonth,
  lastNativeAgentRun,

  validationScenario,
  onScenarioChange,
  uploadedFiles,
  onAddFileMetadata,
  manualCommands,
  onAddManualCommand,
  theme,
  onToggleTheme,
}) => {
  // 관리자 설정 드롭다운 (외부 클릭/ESC 닫기)
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!adminOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) setAdminOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdminOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [adminOpen]);
  const adminActive = ADMIN_NAV_KEYS.includes(activeTab as AdminNavKey);
  const selectAdminTab = (key: AdminNavKey) => {
    setActiveTab(key);
    setAdminOpen(false);
  };

  return (
    <div className="main-layout">
      {/* 상단 헤더 */}
      <header className="main-header">
        <div className="header-left">
          <div className="logo-icon">🛰️</div>
          <div className="logo-text-group">
            <h1 className="logo-title">GODO AI OS</h1>
            <span className="logo-subtitle">쇼핑몰 AI 운영센터</span>
          </div>
        </div>

        <div className="header-center">
          <span className="demo-badge">
            <span className="badge-blink"></span>
            LOCAL APP MODE
          </span>
        </div>

        <div className="header-right">
          <button
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            <span className="theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          <div className="header-nav-tabs">
            {/* ── 운영 메뉴 (매일 쓰는 핵심) ── */}
            <button
              className={`nav-tab-btn ${activeTab === 'office' ? 'active' : ''}`}
              onClick={() => setActiveTab('office')}
              title="오늘의 운영 현황"
            >
              🏢 오늘의 운영
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'department' ? 'active' : ''}`}
              onClick={() => setActiveTab('department')}
              title="팀별 업무 공간 — 부서를 선택해 업무를 확인하고 지시"
            >
              🗂️ 부서 업무 관장
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
              title="AI 직원 현황"
            >
              🤖 AI 직원
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
              onClick={() => setActiveTab('calendar')}
              title="일자별 운영 캘린더 및 일지"
            >
              📅 운영일지
            </button>

            {/* ── 관리/설정 드롭다운 ── */}
            <div className="nav-divider" aria-hidden="true"></div>
            <div className="nav-admin" ref={adminRef}>
              <button
                type="button"
                className={`nav-tab-btn nav-admin-trigger ${adminActive || adminOpen ? 'active' : ''}`}
                onClick={() => setAdminOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={adminOpen}
                title="데이터·기록·지식·AI 설정 등 관리 메뉴"
              >
                ⚙️ 관리자 설정 <span className={`nav-admin-caret ${adminOpen ? 'open' : ''}`}>▾</span>
              </button>
              {adminOpen && (
                <div className="nav-admin-menu" role="menu">
                  {ADMIN_NAV_GROUPS.map((group) => (
                    <div key={group.label} className="nav-admin-group">
                      <div className="nav-admin-group-label">{group.label}</div>
                      {group.items.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          role="menuitem"
                          className={`nav-admin-item ${activeTab === it.key ? 'active' : ''}`}
                          onClick={() => selectAdminTab(it.key)}
                          title={it.title}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 메인 뷰포트 영역 */}
      <div className={`main-viewport ${activeTab === 'office' ? 'office-tab-layout' : ''}${activeTab === 'department' ? 'department-tab-layout' : ''}`}>
        {/* 좌측: 메인 채팅 제어 콘솔 (오늘의 운영/부서 업무 관장 탭은 자체 레이아웃 사용) */}
        {activeTab !== 'office' && activeTab !== 'department' && (
          <aside className="viewport-left">
            <ChatConsole
              activeOperationsData={activeOperationsData}
              tasks={tasks}
              approvalQueue={approvalQueue}
              onAddLog={onAddLog}
              onAddTask={onAddTask}
              onStartSimulation={onStartSimulation}
              onApprove={onApprove}
              onReject={onReject}
              agents={agents}
              onUpdateAgents={onUpdateAgents}
              isSimulating={isSimulating}
            />
          </aside>
        )}

        {/* 우측: 다이나믹 패널 표시 영역 */}
        <main 
          className="viewport-right" 
          tabIndex={-1} 
          style={{ outline: 'none', padding: (activeTab === 'office' || activeTab === 'department') ? '0' : '15px' }}
        >
          {activeTab === 'office' && (
            <OfficeView
              agents={agents}
              tasks={tasks}
              isSimulating={isSimulating}
              approvalQueue={approvalQueue}
              onStartSimulation={onStartSimulation}
              onAddTask={onAddTask}
              onApprove={onApprove}
              onReject={onReject}
              onSelectTask={onSelectTask}
              onSelectApproval={onSelectApproval}
              activeOperationsData={activeOperationsData}
              onUpdateAgents={onUpdateAgents}
              onAddLog={onAddLog}
              lastNativeAgentRun={lastNativeAgentRun}
              
              // Native Runtime Verification props
              validationScenario={validationScenario}
              onScenarioChange={onScenarioChange}
              uploadedFiles={uploadedFiles}
              onAddFileMetadata={onAddFileMetadata}
              manualCommands={manualCommands}
              onAddManualCommand={onAddManualCommand}
            />
          )}

          {activeTab === 'department' && (
            <DepartmentWorkspacePanel />
          )}

          {activeTab === 'agents' && (
            <AgentPanel
              agents={agents} 
              onSelectAgent={onSelectAgent} 
              lastNativeAgentRun={lastNativeAgentRun}
            />
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
