import React, { useMemo, useState } from 'react';
import './DesignTeamDashboard.css';
import { inboxFor } from '../services/teamMessageCenter';
import { DEPT_TEAM_META, TEAM_MESSAGE_KIND_META, TEAM_MESSAGE_STATUS_META, type TeamMessage } from '../types/teamMessage';
import DetailPageBuilder from './detailBuilder/DetailPageBuilder';
import { getAgentBrainChoice, setAgentBrainChoice, isBrainConnected, getGlobalBrainSelection, providerLabel } from '../services/aiBrainSettings';
import type { BrainProviderId } from '../types/aiProvider';

// 디자인팀 문구 생성 AI(두뇌)의 대상 키. geminiService의 resolveAgentBrain('design')과 일치시킨다.
const DESIGN_AGENT_ID = 'design';

// 디자인팀 워크스페이스 — 커머스 대시보드가 아니라 "작업 보드".
// 상품팀 등에서 온 제작 요청(팀 메시지)을 큐로 보여주고, 상세페이지 생성기(다음 단계)를 담을 자리.

interface Props { messages: TeamMessage[] }

const shortTime = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export const DesignTeamDashboard: React.FC<Props> = ({ messages }) => {
  const [builderOpen, setBuilderOpen] = useState(false);
  const requests = useMemo(() => inboxFor(messages, 'design'), [messages]);
  const open = requests.filter((m) => m.status !== 'done');
  const doneCount = requests.length - open.length;

  // 디자인 AI 두뇌 연결(넣었다 뺐다). 성인상품이라 기본값 = 로컬 무검열(Super Gemma / LM Studio).
  // 한 번도 지정 안 했으면(전체 기본=Claude는 성인 거부) 로컬 무검열로 기본 연결하고 저장한다.
  const [brainChoice, setBrainChoice] = useState<'global' | BrainProviderId>(() => {
    const saved = getAgentBrainChoice(DESIGN_AGENT_ID);
    if (saved === 'global') { setAgentBrainChoice(DESIGN_AGENT_ID, 'local_lmstudio'); return 'local_lmstudio'; }
    return saved;
  });
  const changeBrain = (v: 'global' | BrainProviderId) => { setAgentBrainChoice(DESIGN_AGENT_ID, v); setBrainChoice(v); };
  const activeProvider: BrainProviderId = brainChoice === 'global' ? getGlobalBrainSelection().providerId : brainChoice;
  const brainConnected = isBrainConnected(activeProvider);

  return (
    <div className="dtd">
      <div className="dtd-header">
        <div>
          <h2 className="dtd-title">🎨 디자인팀 워크스페이스</h2>
          <p className="dtd-sub">제작 요청을 받아 상세페이지·섬네일을 작업하고 상품등록을 준비합니다.</p>
        </div>
        <div className="dtd-counts">
          <span className="dtd-count"><b>{open.length}</b> 진행/대기</span>
          <span className="dtd-count"><b>{doneCount}</b> 완료</span>
        </div>
      </div>

      {/* 디자인 AI 두뇌 연결 (문구 생성 AI) */}
      <div className="dtd-brain">
        <span className="dtd-brain-icon">🧠</span>
        <div className="dtd-brain-body">
          <h3 className="dtd-brain-title">
            디자인 AI 두뇌
            <span className={`dtd-brain-status ${brainConnected ? 'on' : 'off'}`}>{brainConnected ? '● 연결됨' : '○ 미연결'}</span>
          </h3>
          <p className="dtd-brain-desc">상세페이지 <b>문구</b>를 생성하는 AI. 성인 상품은 클라우드가 거부하므로 <b>로컬 무검열(Super Gemma)</b> 권장. <span className="dtd-brain-note">(현재 이미지 인식(vision) 미지원 모델 → 스펙 텍스트 기반)</span></p>
        </div>
        <select className="dtd-brain-select" value={brainChoice} onChange={(e) => changeBrain(e.target.value as 'global' | BrainProviderId)}>
          <option value="local_lmstudio">🦙 Super Gemma (로컬 무검열)</option>
          <option value="global">전체 기본 AI ({providerLabel(getGlobalBrainSelection().providerId)})</option>
        </select>
      </div>

      {/* 상세페이지 생성기(이식됨) */}
      <div className="dtd-generator-slot">
        <div className="dtd-gen-icon">🖼️</div>
        <div className="dtd-gen-body">
          <h3 className="dtd-gen-title">상세페이지 생성기</h3>
          <p className="dtd-gen-desc">상세페이지·섬네일을 제작하고 이미지로 내보냅니다. 문구는 <b>디자인팀 AI</b>로 생성(AI 직원 설정에서 연결).</p>
        </div>
        <button type="button" className="dtd-gen-open" onClick={() => setBuilderOpen(true)}>생성기 열기 →</button>
      </div>

      {/* 생성기 전체화면 오버레이 */}
      {builderOpen && (
        <div className="dtd-builder-overlay">
          <div className="dtd-builder-bar">
            <span className="dtd-builder-bar-title">🖼️ 상세페이지 생성기</span>
            <button type="button" className="dtd-builder-close" onClick={() => setBuilderOpen(false)}>✕ 닫기</button>
          </div>
          <div className="dtd-builder-body">
            <DetailPageBuilder />
          </div>
        </div>
      )}

      {/* 제작 요청 큐 */}
      <div className="dtd-section-head">
        <h3 className="dtd-section-title">제작 요청 큐</h3>
        <span className="dtd-section-meta">상품팀·총괄 등에서 받은 요청 · 처리는 우측 <b>팀 간 메시지</b>에서</span>
      </div>

      {requests.length === 0 ? (
        <div className="dtd-empty">아직 받은 제작 요청이 없습니다. 상품팀이 자료(엑셀·이미지)를 <b>팀 간 메시지</b>로 보내면 이곳에 쌓입니다.</div>
      ) : (
        <div className="dtd-req-list">
          {requests.map((m) => (
            <div key={m.id} className={`dtd-req status-${m.status}`}>
              <div className="dtd-req-top">
                <span className="dtd-req-from">{DEPT_TEAM_META[m.from.teamId].emoji} {DEPT_TEAM_META[m.from.teamId].name}{m.from.kind === 'agent' ? ' · AI' : ''}</span>
                <span className="dtd-req-kind">{TEAM_MESSAGE_KIND_META[m.kind].emoji} {TEAM_MESSAGE_KIND_META[m.kind].label}</span>
                <span className={`dtd-req-status st-${m.status}`}>{TEAM_MESSAGE_STATUS_META[m.status].label}</span>
                <span className="dtd-req-time">{shortTime(m.createdAt)}</span>
              </div>
              <div className="dtd-req-title">{m.title}</div>
              {m.body && <div className="dtd-req-body">{m.body}</div>}
              {m.attachments.length > 0 && (
                <div className="dtd-req-atts">📎 첨부 {m.attachments.length}건 · {m.attachments.map((a) => a.name).join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
