import React, { useEffect, useMemo, useState } from 'react';
import './DeptActivityModal.css';
import { loadActivity, subscribeActivity, activityForTeam, teamSummary } from '../services/activityLedger';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { ActivityEvent } from '../types/activityLedger';

// 부서 업무 확인 — 최고관리자가 한 팀의 오늘 업무(자동업무·전달·승인)를 활동 원장으로 확인(읽기 전용).

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  task_run: { label: '자동업무', emoji: '🤖' },
  message_sent: { label: '전달', emoji: '📨' },
  approval: { label: '승인', emoji: '✅' },
  chat_query: { label: '질의', emoji: '💬' },
  note: { label: '메모', emoji: '📝' }
};
const STATUS_KO: Record<string, string> = { done: '완료', pending: '승인 대기', in_progress: '진행 중', rejected: '반려', info: '' };
const shortTime = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getMonth() + 1)}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface Props { teamId: DeptTeamId; onClose: () => void; }

export const DeptActivityModal: React.FC<Props> = ({ teamId, onClose }) => {
  const [activity, setActivity] = useState<ActivityEvent[]>(() => loadActivity());
  const [scope, setScope] = useState<'today' | 'all'>('today');
  useEffect(() => subscribeActivity(() => setActivity(loadActivity())), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const since = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }, []);
  const rows = useMemo(() => activityForTeam(activity, teamId, scope === 'today' ? since : undefined), [activity, teamId, scope, since]);
  const sum = useMemo(() => teamSummary(activity, teamId, since), [activity, teamId, since]);
  const meta = DEPT_TEAM_META[teamId];

  return (
    <div className="dam-overlay" onClick={onClose}>
      <div className="dam" onClick={(e) => e.stopPropagation()}>
        <div className="dam-head">
          <h3>{meta.emoji} {meta.name} · 부서 업무 확인</h3>
          <button type="button" className="dam-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className="dam-summary">
          <div className="dam-sum"><b>{sum.taskRunDone}/{sum.taskRunTotal}</b><span>자동업무 완료</span></div>
          <div className="dam-sum"><b>{sum.messagesSent}</b><span>전달</span></div>
          <div className="dam-sum"><b>{sum.approvals}</b><span>승인</span></div>
          <div className={`dam-sum ${sum.pending > 0 ? 'warn' : ''}`}><b>{sum.pending}</b><span>승인 대기</span></div>
        </div>

        <div className="dam-scope">
          <button type="button" className={scope === 'today' ? 'active' : ''} onClick={() => setScope('today')}>오늘</button>
          <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>전체</button>
        </div>

        <div className="dam-body">
          {rows.length === 0 ? (
            <p className="dam-empty">{scope === 'today' ? '오늘' : ''} 기록된 업무가 없습니다. (AI 설정실에서 자동업무를 설정하고 팀 대시보드에서 실행하면 이곳에 쌓입니다.)</p>
          ) : rows.map((e) => (
            <div key={e.id} className="dam-row">
              <span className="dam-type">{TYPE_META[e.type]?.emoji} {TYPE_META[e.type]?.label}</span>
              <div className="dam-main">
                <div className="dam-title">{e.title} {STATUS_KO[e.status] && <span className={`dam-status st-${e.status}`}>{STATUS_KO[e.status]}</span>}</div>
                {e.detail && <div className="dam-detail">{e.detail}</div>}
                <div className="dam-meta">{e.actor.kind === 'agent' ? `🤖 ${e.actor.label}` : `👤 ${e.actor.label}`}{e.relatedTeam ? ` → ${DEPT_TEAM_META[e.relatedTeam].name}` : ''} · {shortTime(e.at)}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="dam-foot">※ 읽기 전용입니다. 지시·처리는 부서 업무 관장 또는 팀 간 요청에서.</p>
      </div>
    </div>
  );
};
