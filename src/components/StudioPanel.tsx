/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from 'react';
import type { BrainKnowledgeItem, BrainCategory, ImportanceLevel, SourceType } from '../types/brain';
import type { Agent, LogEntry } from '../types';
import type { SkillItem, ToolItem, PermissionMatrixItem } from '../types/studio';
import type { TaskPermission, TaskRiskLevel } from '../types/task';
import type { EngineMode, EngineProvider, EngineRoutingRule, EngineSafetyRule } from '../types/engine';
import './StudioPanel.css';

interface StudioPanelProps {
  brainKnowledge: BrainKnowledgeItem[];
  agents: Agent[];
  skills: SkillItem[];
  tools: ToolItem[];
  permissionMatrix: PermissionMatrixItem[];
  
  onUpdateKnowledge: (items: BrainKnowledgeItem[]) => void;
  onUpdateAgents: (items: Agent[]) => void;
  onUpdateSkills: (items: SkillItem[]) => void;
  onUpdateTools: (items: ToolItem[]) => void;
  onUpdatePermissionMatrix: (items: PermissionMatrixItem[]) => void;
  
  onAddLog: (text: string, type: LogEntry['type'], agentName?: string) => void;
  
  // 연동 포커스용
  activeSubTab: 'brain' | 'agent' | 'skills' | 'tools' | 'permissions' | 'import_export';
  onChangeSubTab: (tab: 'brain' | 'agent' | 'skills' | 'tools' | 'permissions' | 'import_export') => void;
  selectedBrainId: string | null;
  onSelectBrainId: (id: string | null) => void;
  selectedAgentId: string | null;
  onSelectAgentId: (id: string | null) => void;
  onResetAllData: () => void;

  // Engine 관련 (Import/Export 용)
  engineMode?: EngineMode;
  engineProviders?: EngineProvider[];
  engineRoutingRules?: EngineRoutingRule[];
  engineSafetyRules?: EngineSafetyRule[];
  onUpdateEngineMode?: (mode: EngineMode) => void;
  onUpdateEngineProviders?: (providers: EngineProvider[]) => void;
  onUpdateEngineRoutingRules?: (rules: EngineRoutingRule[]) => void;
  onUpdateEngineSafetyRules?: (rules: EngineSafetyRule[]) => void;
}

export const StudioPanel: React.FC<StudioPanelProps> = ({
  brainKnowledge,
  agents,
  skills,
  tools,
  permissionMatrix,
  onUpdateKnowledge,
  onUpdateAgents,
  onUpdateSkills,
  onUpdateTools,
  onUpdatePermissionMatrix,
  onAddLog,
  activeSubTab,
  onChangeSubTab,
  selectedBrainId,
  onSelectBrainId,
  selectedAgentId,
  onSelectAgentId,
  onResetAllData,

  engineMode,
  engineProviders,
  engineRoutingRules,
  engineSafetyRules,
  onUpdateEngineMode,
  onUpdateEngineProviders,
  onUpdateEngineRoutingRules,
  onUpdateEngineSafetyRules
}) => {
  // 1. Brain Editor States
  const [activeBrainId, setActiveBrainId] = useState<string>('');
  const [brainForm, setBrainForm] = useState<Partial<BrainKnowledgeItem>>({});
  
  // 2. Agent Editor States
  const [activeAgentId, setActiveAgentId] = useState<string>('');
  const [agentForm, setAgentForm] = useState<Partial<Agent>>({});
  const [memoryText, setMemoryText] = useState<string>('');

  // 3. Skill Registry States
  const [activeSkillId, setActiveSkillId] = useState<string>('');
  const [skillForm, setSkillForm] = useState<Partial<SkillItem>>({});
  const [isAddingSkill, setIsAddingSkill] = useState(false);

  // 4. Tool Registry States
  const [activeToolId, setActiveToolId] = useState<string>('');
  const [toolForm, setToolForm] = useState<Partial<ToolItem>>({});
  const [isAddingTool, setIsAddingTool] = useState(false);

  // 5. Permission Matrix States
  const [activePermId, setActivePermId] = useState<string>('');
  const [permForm, setPermForm] = useState<Partial<PermissionMatrixItem>>({});

  // 6. Import/Export States
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Toast State
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

  // --- 포커스 연동 처리 ---
  useEffect(() => {
    if (selectedBrainId) {
      setActiveBrainId(selectedBrainId);
      const item = brainKnowledge.find(b => b.id === selectedBrainId || b.filename === selectedBrainId);
      if (item) {
        setBrainForm({ ...item });
      }
      onSelectBrainId(null); // 한 번 연동된 후 초기화
    }
  }, [selectedBrainId, brainKnowledge, onSelectBrainId]);

  useEffect(() => {
    if (selectedAgentId) {
      setActiveAgentId(selectedAgentId);
      const item = agents.find(a => a.id === selectedAgentId);
      if (item) {
        setAgentForm({ ...item });
        setMemoryText(item.memory ? item.memory.join('\n') : '');
      }
      onSelectAgentId(null); // 한 번 연동된 후 초기화
    }
  }, [selectedAgentId, agents, onSelectAgentId]);

  // 카테고리 한글 라벨 매퍼
  const categoryLabels: Record<string, string> = {
    policy: '정책 문서',
    raw: '원본/운영 데이터',
    report: '리포트',
    decision: '의사결정 로그',
    template: '템플릿',
    product: '상품 정보',
    marketing: '마케팅',
    cs: 'CS 정보'
  };

  // --- Brain Editor 로직 ---
  const activeBrainItem = useMemo(() => {
    return brainKnowledge.find(b => b.id === activeBrainId) || brainKnowledge[0] || null;
  }, [brainKnowledge, activeBrainId]);

  useEffect(() => {
    if (activeBrainItem && !selectedBrainId) {
      setActiveBrainId(activeBrainItem.id);
      setBrainForm({ ...activeBrainItem });
    }
  }, [activeBrainItem, selectedBrainId]);

  const handleBrainSelect = (id: string) => {
    setActiveBrainId(id);
    const item = brainKnowledge.find(b => b.id === id);
    if (item) {
      setBrainForm({ ...item });
    }
  };

  const handleBrainSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brainForm.filename || !brainForm.filename.trim()) {
      showToast('파일명은 비어있을 수 없습니다.', 'error');
      return;
    }
    if (!brainForm.title?.trim() || !brainForm.summary?.trim() || !brainForm.contentPreview?.trim()) {
      showToast('제목, 요약, 마크다운 미리보기 내용은 필수 입력 사항입니다.', 'error');
      return;
    }

    const updated = brainKnowledge.map(item => {
      if (item.id === brainForm.id) {
        return {
          ...item,
          ...brainForm,
          updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        } as BrainKnowledgeItem;
      }
      return item;
    });

    onUpdateKnowledge(updated);
    onAddLog(`[Studio] ${brainForm.filename} 문서가 성공적으로 수정되었습니다.`, 'success', 'Studio');
    
    // 에이전트 매핑 이름 추출
    const linkedNames = (brainForm.linkedAgentIds || [])
      .map(id => agents.find(a => a.id === id)?.name.split(' ')[0] || id)
      .join(', ');
    if (linkedNames) {
      onAddLog(`[Brain] [${linkedNames}] AI의 참조 지식 정보가 갱신되었습니다.`, 'info', 'Brain');
    }
    
    showToast('수정이 완료되었습니다. BRAIN 지식 탭에 즉시 반영됩니다.', 'success');
  };

  // --- Agent Editor 로직 ---
  const activeAgentItem = useMemo(() => {
    return agents.find(a => a.id === activeAgentId) || agents[0] || null;
  }, [agents, activeAgentId]);

  useEffect(() => {
    if (activeAgentItem && !selectedAgentId) {
      setActiveAgentId(activeAgentItem.id);
      setAgentForm({ ...activeAgentItem });
      setMemoryText(activeAgentItem.memory ? activeAgentItem.memory.join('\n') : '');
    }
  }, [activeAgentItem, selectedAgentId]);

  const handleAgentSelect = (id: string) => {
    setActiveAgentId(id);
    const item = agents.find(a => a.id === id);
    if (item) {
      setAgentForm({ ...item });
      setMemoryText(item.memory ? item.memory.join('\n') : '');
    }
  };

  const handleAgentSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.name || !agentForm.name.trim()) {
      showToast('에이전트 이름은 필수입니다.', 'error');
      return;
    }

    const updatedMemory = memoryText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const updated = agents.map(item => {
      if (item.id === agentForm.id) {
        return {
          ...item,
          ...agentForm,
          memory: updatedMemory
        } as Agent;
      }
      return item;
    });

    onUpdateAgents(updated);
    onAddLog(`[Studio] 에이전트 [${agentForm.name.split(' ')[0]}]의 설정 정보가 갱신되었습니다.`, 'success', 'Studio');
    showToast('에이전트 정보가 저장되었습니다. AGENTS 탭과 Pixel Office에 즉시 반영됩니다.', 'success');
  };

  // --- Skill Registry 로직 ---
  const activeSkillItem = useMemo(() => {
    return skills.find(s => s.id === activeSkillId) || skills[0] || null;
  }, [skills, activeSkillId]);

  useEffect(() => {
    if (activeSkillItem && !isAddingSkill) {
      setActiveSkillId(activeSkillItem.id);
      setSkillForm({ ...activeSkillItem });
    }
  }, [activeSkillItem, isAddingSkill]);

  const handleSkillSelect = (id: string) => {
    setIsAddingSkill(false);
    setActiveSkillId(id);
    const item = skills.find(s => s.id === id);
    if (item) {
      setSkillForm({ ...item });
    }
  };

  const handleSkillCreate = () => {
    setIsAddingSkill(true);
    setSkillForm({
      id: `skill-${Date.now()}`,
      name: '',
      description: '',
      category: 'General',
      recommendedAgents: [],
      riskLevel: 'low'
    });
  };

  const handleSkillSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillForm.name || !skillForm.name.trim()) {
      showToast('스킬 이름은 필수입니다.', 'error');
      return;
    }

    let updated: SkillItem[];
    if (isAddingSkill) {
      updated = [...skills, skillForm as SkillItem];
      onAddLog(`[Studio] 신규 스킬 [${skillForm.name}]이(가) 스킬 레지스트리에 등록되었습니다.`, 'success', 'Studio');
    } else {
      updated = skills.map(s => (s.id === skillForm.id ? (skillForm as SkillItem) : s));
      onAddLog(`[Studio] 스킬 [${skillForm.name}]의 설정 정보가 수정되었습니다.`, 'success', 'Studio');
    }
    onUpdateSkills(updated);
    setIsAddingSkill(false);
    setActiveSkillId(skillForm.id || '');
    showToast('스킬 설정이 저장되었습니다.', 'success');
  };

  const handleSkillDelete = (id: string) => {
    if (!confirm('정말로 이 스킬을 레지스트리에서 영구 삭제하시겠습니까?')) return;
    const item = skills.find(s => s.id === id);
    const updated = skills.filter(s => s.id !== id);
    onUpdateSkills(updated);
    if (activeSkillId === id) {
      setActiveSkillId(updated[0]?.id || '');
    }
    onAddLog(`[Studio] 스킬 [${item?.name}]이(가) 스킬 레지스트리에서 제거되었습니다.`, 'warning', 'Studio');
  };

  // --- Tool Registry 로직 ---
  const activeToolItem = useMemo(() => {
    return tools.find(t => t.id === activeToolId) || tools[0] || null;
  }, [tools, activeToolId]);

  useEffect(() => {
    if (activeToolItem && !isAddingTool) {
      setActiveToolId(activeToolItem.id);
      setToolForm({ ...activeToolItem });
    }
  }, [activeToolItem, isAddingTool]);

  const handleToolSelect = (id: string) => {
    setIsAddingTool(false);
    setActiveToolId(id);
    const item = tools.find(t => t.id === id);
    if (item) {
      setToolForm({ ...item });
    }
  };

  const handleToolCreate = () => {
    setIsAddingTool(true);
    setToolForm({
      id: `tool-${Date.now()}`,
      name: '',
      description: '',
      category: 'General',
      permission: 'draft_only',
      riskLevel: 'low',
      availableAgentIds: [],
      isEnabled: true
    });
  };

  const handleToolSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolForm.name || !toolForm.name.trim()) {
      showToast('도구 이름은 필수입니다.', 'error');
      return;
    }

    let updated: ToolItem[];
    if (isAddingTool) {
      updated = [...tools, toolForm as ToolItem];
      onAddLog(`[Studio] 신규 Mock Tool [${toolForm.name}]이(가) API 레지스트리에 등록되었습니다.`, 'success', 'Studio');
    } else {
      updated = tools.map(t => (t.id === toolForm.id ? (toolForm as ToolItem) : t));
      onAddLog(`[Studio] 도구 [${toolForm.name}]가 ${toolForm.permission} 권한 레벨로 갱신되었습니다.`, 'success', 'Studio');
    }
    onUpdateTools(updated);
    setIsAddingTool(false);
    setActiveToolId(toolForm.id || '');
    showToast('도구 설정이 저장되었습니다.', 'success');
  };

  const handleToolDelete = (id: string) => {
    if (!confirm('정말로 이 도구를 도구 레지스트리에서 영구 삭제하시겠습니까?')) return;
    const item = tools.find(t => t.id === id);
    const updated = tools.filter(t => t.id !== id);
    onUpdateTools(updated);
    if (activeToolId === id) {
      setActiveToolId(updated[0]?.id || '');
    }
    onAddLog(`[Studio] 도구 [${item?.name}]이(가) 레지스트리에서 제거되었습니다.`, 'warning', 'Studio');
  };

  // --- Permission Matrix 로직 ---
  const activePermItem = useMemo(() => {
    return permissionMatrix.find(p => p.id === activePermId) || permissionMatrix[0] || null;
  }, [permissionMatrix, activePermId]);

  useEffect(() => {
    if (activePermItem) {
      setActivePermId(activePermItem.id);
      setPermForm({ ...activePermItem });
    }
  }, [activePermItem]);

  const handlePermSelect = (id: string) => {
    setActivePermId(id);
    const item = permissionMatrix.find(p => p.id === id);
    if (item) {
      setPermForm({ ...item });
    }
  };

  const handlePermSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = permissionMatrix.map(p => (p.id === permForm.id ? (permForm as PermissionMatrixItem) : p));
    onUpdatePermissionMatrix(updated);
    onAddLog(`[Studio] ${permForm.taskName} 작업의 권한 매트릭스가 [${permForm.currentPermission?.toUpperCase()}] 레벨로 갱신되었습니다.`, 'success', 'Studio');
    showToast('권한 매트릭스가 갱신되었습니다.', 'success');
  };

  // --- Import / Export 로직 ---
  const handleExport = () => {
    const config = {
      brainKnowledge,
      agents,
      skills,
      tools,
      permissionMatrix,
      engineMode,
      engineProviders,
      engineRoutingRules,
      engineSafetyRules,
      exportedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(config, null, 2);
    setImportJsonText(jsonStr);
    
    // 파일 다운로드 브라우저 기능
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `godo_studio_config_${new Date().toISOString().substring(0, 10)}.json`;
    link.click();
    
    onAddLog('[Studio] 현재 AI 운영 설정 구조를 JSON 파일로 추출하여 백업했습니다.', 'success', 'Studio');
  };

  const handleImport = () => {
    try {
      setImportError(null);
      if (!importJsonText.trim()) {
        setImportError('JSON 텍스트 입력창이 비어 있습니다.');
        return;
      }
      const config = JSON.parse(importJsonText);
      
      // 유효성 체크
      if (!config.brainKnowledge || !config.agents || !config.skills || !config.tools || !config.permissionMatrix) {
        setImportError('잘못된 GODO STUDIO 백업 포맷입니다. 주요 5대 데이터 노드가 누락되었습니다.');
        return;
      }

      onUpdateKnowledge(config.brainKnowledge);
      onUpdateAgents(config.agents);
      onUpdateSkills(config.skills);
      onUpdateTools(config.tools);
      onUpdatePermissionMatrix(config.permissionMatrix);

      // Engine 설정 복원
      if (config.engineMode && onUpdateEngineMode) {
        onUpdateEngineMode(config.engineMode);
      }
      if (config.engineProviders && onUpdateEngineProviders) {
        onUpdateEngineProviders(config.engineProviders);
      }
      if (config.engineRoutingRules && onUpdateEngineRoutingRules) {
        onUpdateEngineRoutingRules(config.engineRoutingRules);
      }
      if (config.engineSafetyRules && onUpdateEngineSafetyRules) {
        onUpdateEngineSafetyRules(config.engineSafetyRules);
      }
      
      onAddLog('[Studio] Engine 설정을 포함한 전체 운영 설정을 불러왔습니다.', 'success', 'Studio');
      showToast('설정이 성공적으로 로드 및 복원되었습니다.', 'success');
    } catch (err) {
      const error = err as Error;
      setImportError(`JSON 파싱 오류: ${error.message}`);
      onAddLog('[Studio] 백업 파일 로딩에 실패했습니다. (파싱 깨짐 경고)', 'error', 'Studio');
    }
  };

  const handleResetToDefault = () => {
    onResetAllData();
    setShowResetConfirm(false);
    onAddLog('[Studio] GODO STUDIO의 모든 설정을 기본 더미 스펙으로 초기화했습니다.', 'warning', 'Studio');
    showToast('모든 설정이 초기 기본값으로 복원되었습니다.', 'warning');
  };

  // 통계 계산
  const statsSummary = useMemo(() => {
    return {
      brainCount: brainKnowledge.length,
      agentCount: agents.length,
      skillCount: skills.length,
      approvalReqCount: tools.filter(t => t.permission === 'approval_required').length + permissionMatrix.filter(p => p.currentPermission === 'approval_required').length,
      storageState: localStorage.getItem('godo.studio.lastSavedAt') ? 'SAVED (LOCAL)' : 'DEFAULT'
    };
  }, [brainKnowledge, agents, skills, tools, permissionMatrix]);

  return (
    <div className="studio-panel-container">
      {/* 1. 상단 타이틀 */}
      <div className="studio-header-section">
        <div className="studio-title-wrapper">
          <h2 className="studio-main-title">🛰️ GODO STUDIO MVP</h2>
          <span className="studio-subtitle">안티그라비티 코드 변경 없이, 실시간으로 AI 에이전트의 스킬, 도구, 지식 및 시스템 권한 매트릭스를 제어하는 설정 편집소입니다.</span>
        </div>
        
        {/* 요약 통계 */}
        <div className="studio-metrics-row">
          <div className="metric-box">
            <span className="metric-lbl">지식 문서</span>
            <span className="metric-val">{statsSummary.brainCount}개</span>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">AI 에이전트</span>
            <span className="metric-val">{statsSummary.agentCount}명</span>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">등록된 스킬</span>
            <span className="metric-val">{statsSummary.skillCount}개</span>
          </div>
          <div className="metric-box warning">
            <span className="metric-lbl">승인 필요 권한</span>
            <span className="metric-val">{statsSummary.approvalReqCount}개</span>
          </div>
          <div className="metric-box info">
            <span className="metric-lbl">저장 상태</span>
            <span className="metric-val" style={{ fontSize: '0.75rem' }}>{statsSummary.storageState}</span>
          </div>
        </div>
      </div>

      {/* 2. 내부 탭 네비게이션 */}
      <div className="studio-tab-bar">
        <button className={`studio-tab-btn ${activeSubTab === 'brain' ? 'active' : ''}`} onClick={() => onChangeSubTab('brain')}>
          🧠 Brain Editor
        </button>
        <button className={`studio-tab-btn ${activeSubTab === 'agent' ? 'active' : ''}`} onClick={() => onChangeSubTab('agent')}>
          🤖 Agent Editor
        </button>
        <button className={`studio-tab-btn ${activeSubTab === 'skills' ? 'active' : ''}`} onClick={() => onChangeSubTab('skills')}>
          ⚡ Skill Registry
        </button>
        <button className={`studio-tab-btn ${activeSubTab === 'tools' ? 'active' : ''}`} onClick={() => onChangeSubTab('tools')}>
          🛠️ Tool Registry
        </button>
        <button className={`studio-tab-btn ${activeSubTab === 'permissions' ? 'active' : ''}`} onClick={() => onChangeSubTab('permissions')}>
          🔑 Permission Matrix
        </button>
        <button className={`studio-tab-btn ${activeSubTab === 'import_export' ? 'active' : ''}`} onClick={() => onChangeSubTab('import_export')}>
          💾 Import / Export
        </button>
      </div>

      {/* 3. 콘텐츠 레이아웃 */}
      <div className="studio-content-body">
        
        {/* --- A. Brain Editor --- */}
        {activeSubTab === 'brain' && (
          <div className="studio-grid-layout">
            <aside className="studio-list-sidebar">
              <h3 className="sidebar-title">지식 문서 리스트</h3>
              <div className="sidebar-items-scroller">
                {brainKnowledge.map(b => (
                  <div
                    key={b.id}
                    className={`sidebar-item-card ${activeBrainId === b.id ? 'active' : ''}`}
                    onClick={() => handleBrainSelect(b.id)}
                  >
                    <span className="item-filename">📁 {b.filename}</span>
                    <span className="item-title">{b.title}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="studio-form-pane">
              <form onSubmit={handleBrainSave} className="editor-form">
                <div className="form-header-row">
                  <h3 className="form-pane-title">📄 지식 문서 수정</h3>
                  <span className="form-info-tag">ID: {brainForm.id}</span>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>파일명 (고유 식별자)</label>
                    <input
                      type="text"
                      value={brainForm.filename || ''}
                      onChange={e => setBrainForm({ ...brainForm, filename: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>지식 문서 명칭</label>
                    <input
                      type="text"
                      value={brainForm.title || ''}
                      onChange={e => setBrainForm({ ...brainForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>문서 분류 카테고리</label>
                    <select
                      value={brainForm.category || 'policy'}
                      onChange={e => setBrainForm({ ...brainForm, category: e.target.value as BrainCategory })}
                    >
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>중요도 등급</label>
                    <select
                      value={brainForm.importance || 'medium'}
                      onChange={e => setBrainForm({ ...brainForm, importance: e.target.value as ImportanceLevel })}
                    >
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>지식 신뢰도 (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={brainForm.confidence || 0}
                      onChange={e => setBrainForm({ ...brainForm, confidence: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>데이터 소스 타임</label>
                    <select
                      value={brainForm.sourceType || 'markdown'}
                      onChange={e => setBrainForm({ ...brainForm, sourceType: e.target.value as SourceType })}
                    >
                      <option value="demo">DEMO</option>
                      <option value="markdown">MARKDOWN</option>
                      <option value="github">GITHUB</option>
                      <option value="api">API</option>
                      <option value="manual">MANUAL</option>
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>문서 한 줄 요약 (Summary)</label>
                  <input
                    type="text"
                    value={brainForm.summary || ''}
                    onChange={e => setBrainForm({ ...brainForm, summary: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>마크다운 본문 미리보기 (contentPreview)</label>
                  <textarea
                    rows={6}
                    value={brainForm.contentPreview || ''}
                    onChange={e => setBrainForm({ ...brainForm, contentPreview: e.target.value })}
                    className="code-textarea"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>연결된 의사결정 에이전트 매핑 (중복 체크 가능)</label>
                  <div className="checkbox-flex-row">
                    {agents.map(a => {
                      const isLinked = (brainForm.linkedAgentIds || []).includes(a.id);
                      return (
                        <label key={a.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => {
                              const currentIds = [...(brainForm.linkedAgentIds || [])];
                              if (isLinked) {
                                setBrainForm({
                                  ...brainForm,
                                  linkedAgentIds: currentIds.filter(id => id !== a.id)
                                });
                              } else {
                                setBrainForm({
                                  ...brainForm,
                                  linkedAgentIds: [...currentIds, a.id]
                                });
                              }
                            }}
                          />
                          {a.emoji} {a.name.split(' ')[0]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>활용 태스크 태그 (쉼표로 구분)</label>
                  <input
                    type="text"
                    value={brainForm.tags ? brainForm.tags.join(', ') : ''}
                    onChange={e => setBrainForm({ ...brainForm, tags: e.target.value.split(',').map(t => t.trim()) })}
                  />
                </div>

                <div className="form-action-row">
                  <button type="button" className="btn secondary" onClick={() => setBrainForm({ ...activeBrainItem })}>
                    취소 (되돌리기)
                  </button>
                  <button type="submit" className="btn primary">
                    💾 설정 저장 (Save Changes)
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        {/* --- B. Agent Editor --- */}
        {activeSubTab === 'agent' && (
          <div className="studio-grid-layout">
            <aside className="studio-list-sidebar">
              <h3 className="sidebar-title">에이전트 목록</h3>
              <div className="sidebar-items-scroller">
                {agents.map(a => (
                  <div
                    key={a.id}
                    className={`sidebar-item-card ${activeAgentId === a.id ? 'active' : ''}`}
                    onClick={() => handleAgentSelect(a.id)}
                  >
                    <span className="item-filename">{a.emoji} {a.name.split(' ')[0]}</span>
                    <span className="item-title">{a.role}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="studio-form-pane">
              <form onSubmit={handleAgentSave} className="editor-form">
                <div className="form-header-row">
                  <h3 className="form-pane-title">🤖 에이전트 매개변수 설정</h3>
                  <span className="form-info-tag">ID: {agentForm.id}</span>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>이름 (Name)</label>
                    <input
                      type="text"
                      value={agentForm.name || ''}
                      onChange={e => setAgentForm({ ...agentForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>담당 역할 (Role)</label>
                    <input
                      type="text"
                      value={agentForm.role || ''}
                      onChange={e => setAgentForm({ ...agentForm, role: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>시스템 지시 프롬프트 (System Prompt)</label>
                  <textarea
                    rows={4}
                    value={agentForm.systemPrompt || ''}
                    onChange={e => setAgentForm({ ...agentForm, systemPrompt: e.target.value })}
                  />
                </div>

                {/* 지식 매핑 체크박스 */}
                <div className="form-group full-width">
                  <label>연결 지식 문서 (Knowledge Base Map)</label>
                  <div className="checkbox-flex-row">
                    {brainKnowledge.map(bk => {
                      const isChecked = (agentForm.knowledge || []).includes(bk.filename);
                      return (
                        <label key={bk.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const cur = [...(agentForm.knowledge || [])];
                              if (isChecked) {
                                setAgentForm({ ...agentForm, knowledge: cur.filter(f => f !== bk.filename) });
                              } else {
                                setAgentForm({ ...agentForm, knowledge: [...cur, bk.filename] });
                              }
                            }}
                          />
                          📄 {bk.filename}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 스킬 매핑 */}
                <div className="form-group full-width">
                  <label>보유 가능 스킬 (Skills Registry)</label>
                  <div className="checkbox-flex-row">
                    {skills.map(sk => {
                      const isChecked = (agentForm.skills || []).includes(sk.name);
                      return (
                        <label key={sk.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const cur = [...(agentForm.skills || [])];
                              if (isChecked) {
                                setAgentForm({ ...agentForm, skills: cur.filter(s => s !== sk.name) });
                              } else {
                                setAgentForm({ ...agentForm, skills: [...cur, sk.name] });
                              }
                            }}
                          />
                          ⚡ {sk.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 도구 매핑 */}
                <div className="form-group full-width">
                  <label>장착된 실행 도구 (Tool Registry)</label>
                  <div className="checkbox-flex-row">
                    {tools.map(tl => {
                      const isChecked = (agentForm.tools || []).includes(tl.name);
                      return (
                        <label key={tl.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const cur = [...(agentForm.tools || [])];
                              if (isChecked) {
                                setAgentForm({ ...agentForm, tools: cur.filter(t => t !== tl.name) });
                              } else {
                                setAgentForm({ ...agentForm, tools: [...cur, tl.name] });
                              }
                            }}
                          />
                          🛠️ {tl.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 메모리 텍스트 편집 */}
                <div className="form-group full-width">
                  <label>최근 기동 메모리 히스토리 (Memory, 줄바꿈으로 구분)</label>
                  <textarea
                    rows={4}
                    value={memoryText}
                    onChange={e => setMemoryText(e.target.value)}
                    placeholder="예: 09:00 - 업무 동기화 기동 완료"
                  />
                </div>

                <div className="form-action-row">
                  <button type="button" className="btn secondary" onClick={() => {
                    setAgentForm({ ...activeAgentItem });
                    setMemoryText(activeAgentItem.memory ? activeAgentItem.memory.join('\n') : '');
                  }}>
                    취소
                  </button>
                  <button type="submit" className="btn primary">
                    💾 에이전트 저장 (Save Agent)
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        {/* --- C. Skill Registry --- */}
        {activeSubTab === 'skills' && (
          <div className="studio-grid-layout">
            <aside className="studio-list-sidebar">
              <div className="sidebar-header-row">
                <h3 className="sidebar-title">스킬 목록</h3>
                <button type="button" className="add-btn" onClick={handleSkillCreate}>+ 추가</button>
              </div>
              <div className="sidebar-items-scroller">
                {skills.map(s => (
                  <div
                    key={s.id}
                    className={`sidebar-item-card ${activeSkillId === s.id && !isAddingSkill ? 'active' : ''}`}
                    onClick={() => handleSkillSelect(s.id)}
                  >
                    <span className="item-filename">⚡ {s.name}</span>
                    <span className="item-title">{s.category}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="studio-form-pane">
              <form onSubmit={handleSkillSave} className="editor-form">
                <div className="form-header-row">
                  <h3 className="form-pane-title">
                    {isAddingSkill ? '⚡ 신규 스킬 등록' : '⚡ 스킬 설정 편집'}
                  </h3>
                  <span className="form-info-tag">ID: {skillForm.id}</span>
                </div>
                
                <div className="form-grid">
                  <div className="form-group">
                    <label>스킬명</label>
                    <input
                      type="text"
                      value={skillForm.name || ''}
                      onChange={e => setSkillForm({ ...skillForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>카테고리</label>
                    <input
                      type="text"
                      value={skillForm.category || ''}
                      onChange={e => setSkillForm({ ...skillForm, category: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>디폴트 위험도 등급</label>
                    <select
                      value={skillForm.riskLevel || 'low'}
                      onChange={e => setSkillForm({ ...skillForm, riskLevel: e.target.value as TaskRiskLevel })}
                    >
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>스킬 상세 기능 설명</label>
                  <input
                    type="text"
                    value={skillForm.description || ''}
                    onChange={e => setSkillForm({ ...skillForm, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-action-row">
                  {!isAddingSkill && (
                    <button type="button" className="btn danger-outline" onClick={() => handleSkillDelete(skillForm.id!)}>
                      삭제
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button type="button" className="btn secondary" onClick={() => {
                    setIsAddingSkill(false);
                    setSkillForm({ ...activeSkillItem });
                  }}>
                    취소
                  </button>
                  <button type="submit" className="btn primary">
                    💾 스킬 저장
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        {/* --- D. Tool Registry --- */}
        {activeSubTab === 'tools' && (
          <div className="studio-grid-layout">
            <aside className="studio-list-sidebar">
              <div className="sidebar-header-row">
                <h3 className="sidebar-title">Mock API 도구</h3>
                <button type="button" className="add-btn" onClick={handleToolCreate}>+ 추가</button>
              </div>
              <div className="sidebar-items-scroller">
                {tools.map(t => (
                  <div
                    key={t.id}
                    className={`sidebar-item-card ${activeToolId === t.id && !isAddingTool ? 'active' : ''}`}
                    onClick={() => handleToolSelect(t.id)}
                  >
                    <span className="item-filename">🛠️ {t.name}</span>
                    <span className="item-title">{t.category} | {t.permission}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="studio-form-pane">
              <form onSubmit={handleToolSave} className="editor-form">
                <div className="form-header-row">
                  <h3 className="form-pane-title">
                    {isAddingTool ? '🛠️ 신규 Mock Tool 등록' : '🛠️ 도구 매개변수 및 권한 제어'}
                  </h3>
                  <span className="form-info-tag">ID: {toolForm.id}</span>
                </div>
                
                <div className="form-grid">
                  <div className="form-group">
                    <label>도구명 (Tool Name)</label>
                    <input
                      type="text"
                      value={toolForm.name || ''}
                      onChange={e => setToolForm({ ...toolForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>분류</label>
                    <input
                      type="text"
                      value={toolForm.category || ''}
                      onChange={e => setToolForm({ ...toolForm, category: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>기본 작동 권한 레벨 (Execution Permission)</label>
                    <select
                      value={toolForm.permission || 'draft_only'}
                      onChange={e => setToolForm({ ...toolForm, permission: e.target.value as TaskPermission })}
                    >
                      <option value="auto">AUTO (자동 무승인 실행)</option>
                      <option value="draft_only">DRAFT ONLY (답글/카피 초안 임시 등록)</option>
                      <option value="approval_required">APPROVAL REQUIRED (관리자 승인 필수)</option>
                      <option value="manual_only">MANUAL ONLY (100% 수동 직접 개입)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>위험성 레벨 (Risk Level)</label>
                    <select
                      value={toolForm.riskLevel || 'low'}
                      onChange={e => setToolForm({ ...toolForm, riskLevel: e.target.value as TaskRiskLevel })}
                    >
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL (인간 전담 권장)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>활성화 여부</label>
                    <select
                      value={toolForm.isEnabled ? 'true' : 'false'}
                      onChange={e => setToolForm({ ...toolForm, isEnabled: e.target.value === 'true' })}
                    >
                      <option value="true">작동 (ENABLED)</option>
                      <option value="false">비활성화 (DISABLED)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>도구 기능 및 매개변수 설명</label>
                  <input
                    type="text"
                    value={toolForm.description || ''}
                    onChange={e => setToolForm({ ...toolForm, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-action-row">
                  {!isAddingTool && (
                    <button type="button" className="btn danger-outline" onClick={() => handleToolDelete(toolForm.id!)}>
                      삭제
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button type="button" className="btn secondary" onClick={() => {
                    setIsAddingTool(false);
                    setToolForm({ ...activeToolItem });
                  }}>
                    취소
                  </button>
                  <button type="submit" className="btn primary">
                    💾 도구 설정 저장
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        {/* --- E. Permission Matrix --- */}
        {activeSubTab === 'permissions' && (
          <div className="studio-grid-layout">
            <aside className="studio-list-sidebar">
              <h3 className="sidebar-title">시스템 작업 유형</h3>
              <div className="sidebar-items-scroller">
                {permissionMatrix.map(p => (
                  <div
                    key={p.id}
                    className={`sidebar-item-card ${activePermId === p.id ? 'active' : ''}`}
                    onClick={() => handlePermSelect(p.id)}
                  >
                    <span className="item-filename">🔑 {p.taskName}</span>
                    <span className="item-title">{p.currentPermission.toUpperCase()} | {p.riskLevel}</span>
                  </div>
                ))}
              </div>
            </aside>
            <main className="studio-form-pane">
              <form onSubmit={handlePermSave} className="editor-form">
                <div className="form-header-row">
                  <h3 className="form-pane-title">🔑 권한 매트릭스 룰셋 편집</h3>
                  <span className="form-info-tag">ID: {permForm.id}</span>
                </div>
                
                <div className="form-grid">
                  <div className="form-group">
                    <label>작업 코드명 (Task Name)</label>
                    <input
                      type="text"
                      value={permForm.taskName || ''}
                      readOnly
                      style={{ opacity: 0.7, background: 'rgba(0,0,0,0.2)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>권한 등급 설정 (Required Permission)</label>
                    <select
                      value={permForm.currentPermission || 'auto'}
                      onChange={e => setPermForm({ ...permForm, currentPermission: e.target.value as TaskPermission })}
                    >
                      <option value="auto">AUTO (자동 실행)</option>
                      <option value="draft_only">DRAFT ONLY (초안 등록)</option>
                      <option value="approval_required">APPROVAL REQUIRED (관리자 승인 필수)</option>
                      <option value="manual_only">MANUAL ONLY (수동 전담)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>작업 위험도 (Risk Level)</label>
                    <select
                      value={permForm.riskLevel || 'low'}
                      onChange={e => setPermForm({ ...permForm, riskLevel: e.target.value as TaskRiskLevel })}
                    >
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>작업 설명</label>
                  <input
                    type="text"
                    value={permForm.description || ''}
                    onChange={e => setPermForm({ ...permForm, description: e.target.value })}
                  />
                </div>

                <div className="form-action-row">
                  <button type="button" className="btn secondary" onClick={() => setPermForm({ ...activePermItem })}>
                    되돌리기
                  </button>
                  <button type="submit" className="btn primary">
                    💾 매트릭스 룰 저장
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        {/* --- F. Import / Export --- */}
        {activeSubTab === 'import_export' && (
          <div className="studio-import-export-layout">
            <div className="io-card">
              <h3 className="io-card-title">💾 백업 및 설정 추출 (Export Configuration)</h3>
              <p className="io-desc">GODO STUDIO에서 수정한 모든 에이전트, 스킬, 도구, 지식 및 권한 룰을 JSON 파일로 백업합니다. 내보낸 JSON 데이터를 파일로 보관하거나 아래의 클립보드 데이터를 공유하십시오.</p>
              <button type="button" className="btn primary" onClick={handleExport}>
                ⚙️ Export Config (JSON 다운로드)
              </button>
            </div>

            <div className="io-card">
              <h3 className="io-card-title">📂 백업 파일 로드 및 적용 (Import Configuration)</h3>
              <p className="io-desc">이전에 백업했거나 직접 수정한 GODO STUDIO 설정 JSON 텍스트를 아래 입력창에 붙여 넣은 후 적용 버튼을 클릭하십시오.</p>
              <textarea
                rows={10}
                value={importJsonText}
                onChange={e => setImportJsonText(e.target.value)}
                placeholder="여기에 백업 JSON 문자열을 붙여넣으십시오..."
                className="code-textarea io-textarea"
              />
              {importError && (
                <div className="io-error-box">
                  ⚠️ {importError}
                </div>
              )}
              <div className="io-actions-row">
                <button type="button" className="btn secondary" onClick={() => setImportJsonText('')}>
                  지우기
                </button>
                <button type="button" className="btn primary" onClick={handleImport}>
                  📂 Import Config (설정 반영)
                </button>
              </div>
            </div>

            <div className="io-card danger-zone">
              <h3 className="io-card-title text-danger">⚠️ 위험 구역 (Danger Zone)</h3>
              <p className="io-desc">에이전트 이름, 지식, 룰 등 모든 설정 내역을 최초 기본 상태(Default Spec)로 강제 복원합니다. **이 작업은 취소할 수 없습니다.**</p>
              
              {!showResetConfirm ? (
                <button type="button" className="btn danger" onClick={() => setShowResetConfirm(true)}>
                  Reset to Default (기본값 강제 복원)
                </button>
              ) : (
                <div className="reset-confirm-box">
                  <span className="confirm-text">경고: 로컬스토리지에 저장된 모든 에이전트 및 룰 세팅이 삭제됩니다. 계속하시겠습니까?</span>
                  <div className="confirm-actions">
                    <button type="button" className="btn secondary" onClick={() => setShowResetConfirm(false)}>
                      취소
                    </button>
                    <button type="button" className="btn danger" onClick={handleResetToDefault}>
                      예, 강제 초기화합니다.
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {toast && (
        <div className={`studio-toast ${toast.type}`}>
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
