import React, { useState, useMemo } from 'react';
import type { BrainKnowledgeItem } from '../types/brain';
import type { Agent } from '../types';
import './BrainPanel.css';

interface BrainPanelProps {
  brainKnowledge: BrainKnowledgeItem[];
  agents: Agent[];
  onUpdateKnowledge: (updatedItems: BrainKnowledgeItem[]) => void;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onNavigateToStudio?: (itemId: string) => void;
}

export const BrainPanel: React.FC<BrainPanelProps> = ({
  brainKnowledge,
  agents,
  onUpdateKnowledge,
  onAddLog,
  selectedItemId,
  onSelectItem,
  onNavigateToStudio
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedImportance, setSelectedImportance] = useState<string>('all');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');

  // 에이전트 매핑 테이블 (ID -> Emoji/Name)
  const agentMap = useMemo(() => {
    const map: Record<string, { emoji: string; name: string }> = {};
    agents.forEach(a => {
      map[a.id] = { emoji: a.emoji, name: a.name.split(' ')[0] };
    });
    return map;
  }, [agents]);

  // 카테고리 한글 맵
  const categoryLabels: Record<string, string> = {
    all: '전체',
    policy: '정책 문서',
    raw: '원본/운영 데이터',
    report: '리포트',
    decision: '의사결정 로그',
    template: '템플릿',
    product: '상품 정보',
    marketing: '마케팅',
    cs: 'CS 정보'
  };

  // 1. 요약 카드 계산
  const summaryStats = useMemo(() => {
    const totalDocs = brainKnowledge.length;
    
    // 중복 제거된 에이전트 수
    const linkedAgents = new Set<string>();
    brainKnowledge.forEach(item => {
      item.linkedAgentIds.forEach(id => linkedAgents.add(id));
    });
    
    const todayReferenced = brainKnowledge.reduce((sum, item) => sum + item.usageCount, 0);
    const criticalDocs = brainKnowledge.filter(item => item.importance === 'critical' || item.importance === 'high').length;

    return {
      totalDocs,
      linkedAgentCount: linkedAgents.size,
      todayReferenced,
      criticalDocs
    };
  }, [brainKnowledge]);

  // 2. 검색 및 필터링 적용
  const filteredItems = useMemo(() => {
    return brainKnowledge.filter(item => {
      // 카테고리 필터
      if (selectedCategory !== 'all') {
        // cs, product, marketing 카테고리가 data 상에 있는 경우 매칭
        // 혹은 brainCategory 자체가 해당 문자열과 일치하는지 확인
        if (item.category !== selectedCategory) {
          // 태그나 에이전트 매핑 등 간접 매칭 여부 체크 가능
          if (selectedCategory === 'cs' && !item.tags.includes('CS') && !item.linkedAgentIds.includes('cs')) return false;
          if (selectedCategory === 'marketing' && !item.tags.includes('마케팅') && !item.linkedAgentIds.includes('marketing')) return false;
          if (selectedCategory === 'product' && !item.tags.includes('SEO') && !item.linkedAgentIds.includes('product')) return false;
          if (selectedCategory !== 'cs' && selectedCategory !== 'marketing' && selectedCategory !== 'product') return false;
        }
      }

      // 중요도 필터
      if (selectedImportance !== 'all' && item.importance !== selectedImportance) {
        return false;
      }

      // 연결 에이전트 필터
      if (selectedAgentFilter !== 'all' && !item.linkedAgentIds.includes(selectedAgentFilter)) {
        return false;
      }

      // 검색어 필터
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesFilename = item.filename.toLowerCase().includes(query);
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesSummary = item.summary.toLowerCase().includes(query);
        const matchesTags = item.tags.some(tag => tag.toLowerCase().includes(query));
        const matchesAgents = item.linkedAgentIds.some(id => id.toLowerCase().includes(query));
        const matchesCategory = item.category.toLowerCase().includes(query);

        if (!matchesFilename && !matchesTitle && !matchesSummary && !matchesTags && !matchesAgents && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [brainKnowledge, searchQuery, selectedCategory, selectedImportance, selectedAgentFilter]);

  // 3. 현재 선택된 아이템 정보
  const activeItem = useMemo(() => {
    if (!selectedItemId) return filteredItems[0] || null;
    return brainKnowledge.find(item => item.id === selectedItemId) || filteredItems[0] || null;
  }, [selectedItemId, brainKnowledge, filteredItems]);

  // 아이템 선택 핸들러
  const handleSelectItem = (item: BrainKnowledgeItem) => {
    onSelectItem(item.id);
    onAddLog(`[Brain] ${item.filename} 문서를 열람했습니다.`, 'info', 'Brain');
  };

  // Mock Update 핸들러
  const handleMockUpdate = (item: BrainKnowledgeItem) => {
    const updated = brainKnowledge.map(k => {
      if (k.id === item.id) {
        return {
          ...k,
          usageCount: k.usageCount + 1,
          updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return k;
    });
    onUpdateKnowledge(updated);
    onAddLog(`[Brain] ${item.filename}의 Mock Update를 완료했습니다. (참조 횟수 증가 및 타임스탬프 갱신)`, 'success', 'Brain');
  };

  // 에이전트 보기 핸들러
  const handleViewLinkedAgents = (item: BrainKnowledgeItem) => {
    const agentNames = item.linkedAgentIds
      .map(id => agentMap[id]?.name || id)
      .join(', ');
    onAddLog(`[Brain] ${item.filename}이(가) [${agentNames}] 에이전트와 연동되어 작동하고 있습니다.`, 'agent', 'Brain');
  };

  return (
    <div className="brain-panel-container">
      {/* 1. 상단 타이틀 */}
      <div className="brain-header-section">
        <div className="brain-title-wrapper">
          <h2 className="brain-main-title">🛰️ GODO BRAIN</h2>
          <span className="brain-subtitle">쇼핑몰 운영 AI 에이전트들이 공통으로 참조하여 의사결정을 내리는 RAG 지식 저장소입니다.</span>
        </div>
        
        {/* 요약 메트릭 카드 */}
        <div className="brain-metrics-row">
          <div className="metric-box">
            <span className="metric-lbl">지식 문서</span>
            <span className="metric-val">{summaryStats.totalDocs}개</span>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">연결 에이전트</span>
            <span className="metric-val">{summaryStats.linkedAgentCount}명</span>
          </div>
          <div className="metric-box warning">
            <span className="metric-lbl">누적 참조 횟수</span>
            <span className="metric-val">{summaryStats.todayReferenced}회</span>
          </div>
          <div className="metric-box danger">
            <span className="metric-lbl">중요 문서</span>
            <span className="metric-val">{summaryStats.criticalDocs}개</span>
          </div>
        </div>
      </div>

      {/* 2. 검색 및 컨트롤 필터 */}
      <div className="brain-control-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="파일명, 제목, 요약, 태그, 에이전트 ID 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="brain-search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>&times;</button>
          )}
        </div>

        <div className="filters-wrapper">
          <div className="filter-select-group">
            <span className="filter-label">중요도:</span>
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="brain-filter-select"
            >
              <option value="all">전체 중요도</option>
              <option value="low">LOW</option>
              <option value="medium">MEDIUM</option>
              <option value="high">HIGH</option>
              <option value="critical">CRITICAL</option>
            </select>
          </div>

          <div className="filter-select-group">
            <span className="filter-label">에이전트:</span>
            <select
              value={selectedAgentFilter}
              onChange={(e) => setSelectedAgentFilter(e.target.value)}
              className="brain-filter-select"
            >
              <option value="all">전체 에이전트</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.emoji} {a.name.split(' ')[0]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. 메인 콘텐츠 (좌측 리스트, 우측 상세) */}
      <div className="brain-content-layout">
        {/* 좌측: 카테고리 필터 + 문서 리스트 */}
        <aside className="brain-sidebar">
          {/* 카테고리 세로 탭 */}
          <div className="category-tabs">
            {Object.entries(categoryLabels).map(([key, label]) => (
              <button
                key={key}
                className={`category-tab-btn ${selectedCategory === key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 지식 리스트 */}
          <div className="knowledge-list-wrapper">
            {filteredItems.length === 0 ? (
              <div className="empty-results">검색 및 필터 조건에 부합하는 문서가 없습니다.</div>
            ) : (
              filteredItems.map(item => {
                const isActive = activeItem && activeItem.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`knowledge-item-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="card-header-row">
                      <span className="card-filename">📁 {item.filename}</span>
                      <span className={`importance-badge ${item.importance}`}>
                        {item.importance.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="card-title-text">{item.title}</h4>
                    <p className="card-summary-text">{item.summary}</p>
                    
                    <div className="card-footer-meta">
                      <div className="linked-agents-row">
                        {item.linkedAgentIds.map(id => {
                          const info = agentMap[id];
                          return info ? (
                            <span key={id} className="agent-tag-chip" title={info.name}>
                              {info.emoji} {info.name}
                            </span>
                          ) : (
                            <span key={id} className="agent-tag-chip">{id}</span>
                          );
                        })}
                      </div>
                      <span className="card-usage">참조: {item.usageCount}회</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* 우측: 지식 상세 정보 패널 */}
        <main className="brain-detail-view">
          {activeItem ? (
            <div className="detail-view-inner">
              <div className="detail-header-card">
                <div className="detail-title-row">
                  <h3 className="detail-title">📄 {activeItem.title}</h3>
                  <span className={`importance-badge large ${activeItem.importance}`}>
                    {activeItem.importance.toUpperCase()} IMPORTANCE
                  </span>
                </div>
                <div className="detail-meta-grid">
                  <div className="meta-cell">
                    <span className="meta-lbl">파일명</span>
                    <span className="meta-val">{activeItem.filename}</span>
                  </div>
                  <div className="meta-cell">
                    <span className="meta-lbl">카테고리</span>
                    <span className="meta-val-badge">{categoryLabels[activeItem.category] || activeItem.category}</span>
                  </div>
                  <div className="meta-cell">
                    <span className="meta-lbl">데이터 소스</span>
                    <span className="meta-val-mono">{activeItem.sourceType.toUpperCase()}</span>
                  </div>
                  <div className="meta-cell">
                    <span className="meta-lbl">참조 횟수</span>
                    <span className="meta-val-highlight">{activeItem.usageCount}회</span>
                  </div>
                  <div className="meta-cell">
                    <span className="meta-lbl">지식 신뢰도</span>
                    <span className="meta-val-highlight green">{activeItem.confidence}%</span>
                  </div>
                  <div className="meta-cell">
                    <span className="meta-lbl">최종 업데이트</span>
                    <span className="meta-val-mono">{activeItem.updatedAt}</span>
                  </div>
                </div>
              </div>

              {/* 요약 */}
              <div className="detail-section">
                <h4 className="detail-section-title">📝 문서 개요 (Summary)</h4>
                <p className="detail-summary-text-large">{activeItem.summary}</p>
              </div>

              {/* 콘텐츠 프리뷰 */}
              <div className="detail-section">
                <h4 className="detail-section-title">📂 마크다운 내용 미리보기 (Content Preview)</h4>
                <pre className="content-preview-box">
                  <code>{activeItem.contentPreview}</code>
                </pre>
              </div>

              {/* 연결 에이전트 목록 */}
              <div className="detail-section">
                <h4 className="detail-section-title">🤖 연결된 의사결정 에이전트 (Linked Agents)</h4>
                <div className="detail-agents-list">
                  {activeItem.linkedAgentIds.map(id => {
                    const info = agentMap[id];
                    return info ? (
                      <div key={id} className="detail-agent-card">
                        <span className="ag-emoji">{info.emoji}</span>
                        <span className="ag-name">{info.name} AI</span>
                      </div>
                    ) : (
                      <div key={id} className="detail-agent-card">
                        <span className="ag-name">{id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 사용 가능한 작업 예시 */}
              {activeItem.actionExamples && activeItem.actionExamples.length > 0 && (
                <div className="detail-section">
                  <h4 className="detail-section-title">⚙️ 실제 활용 작업 예시 (Action Scenarios)</h4>
                  <ul className="scenario-list">
                    {activeItem.actionExamples.map((ex, idx) => (
                      <li key={idx} className="scenario-item">
                        <span className="bullet">⚡</span> <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 인터랙션 버튼 영역 */}
              <div className="detail-action-buttons">
                <button
                  className="brain-action-btn secondary"
                  onClick={() => handleViewLinkedAgents(activeItem)}
                >
                  연결 에이전트 보기
                </button>
                <button
                  className="brain-action-btn secondary"
                  onClick={() => onAddLog(`[Brain] ${activeItem.filename} 지식 참조 정합성 로그 검사가 통과되었습니다. (RAG 스코어 0.94)`, 'info', 'Brain')}
                >
                  참조 로그 검사
                </button>
                {onNavigateToStudio && (
                  <button
                    className="brain-action-btn studio-edit-btn"
                    onClick={() => onNavigateToStudio(activeItem.id)}
                  >
                    ⚙️ Studio에서 편집
                  </button>
                )}
                <button
                  className="brain-action-btn primary"
                  onClick={() => handleMockUpdate(activeItem)}
                >
                  Mock Update (지식 갱신)
                </button>
              </div>
            </div>
          ) : (
            <div className="no-active-detail">
              <span>📚 세부 정보를 보려면 왼쪽에서 문서를 선택하십시오.</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
