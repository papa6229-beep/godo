import React, { useEffect, useMemo, useState } from 'react';
import './ExecutiveBriefing.css';
import { loadActivity, subscribeActivity, teamSummary, activityForTeam } from '../services/activityLedger';
import { loadTeamMessages, subscribeTeamMessages } from '../services/teamMessageCenter';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';
import type { ActivityEvent } from '../types/activityLedger';
import type { TeamMessage } from '../types/teamMessage';

// 오늘의 운영 우측 — 최고관리자 전용 전사 브리핑(읽기 전용).
// 활동 원장/팀 메시지를 "읽기만" 한다. 실행 버튼 없음.

const TEAMS: DeptTeamId[] = ['product', 'cs', 'marketing', 'hq'];

const localMidnightIso = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const shortTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  task_run: { label: '자동업무', emoji: '🤖' },
  message_sent: { label: '전달', emoji: '📨' },
  approval: { label: '승인', emoji: '✅' },
  chat_query: { label: '질의', emoji: '💬' },
  note: { label: '메모', emoji: '📝' }
};
const STATUS_KO: Record<string, string> = { done: '완료', pending: '대기', in_progress: '진행', rejected: '반려', info: '' };

export const ExecutiveBriefing: React.FC = () => {
  const [activity, setActivity] = useState<ActivityEvent[]>(() => loadActivity());
  const [messages, setMessages] = useState<TeamMessage[]>(() => loadTeamMessages());
  const [openTeam, setOpenTeam] = useState<DeptTeamId | null>(null);
  useEffect(() => subscribeActivity(() => setActivity(loadActivity())), []);
  useEffect(() => subscribeTeamMessages(() => setMessages(loadTeamMessages())), []);

  const since = useMemo(() => localMidnightIso(), []);
  const summaries = useMemo(() => TEAMS.map((t) => teamSummary(activity, t, since)), [activity, since]);
  const totals = useMemo(() => summaries.reduce((a, s) => ({
    taskRunTotal: a.taskRunTotal + s.taskRunTotal,
    taskRunDone: a.taskRunDone + s.taskRunDone,
    messagesSent: a.messagesSent + s.messagesSent,
    approvals: a.approvals + s.approvals,
    pending: a.pending + s.pending
  }), { taskRunTotal: 0, taskRunDone: 0, messagesSent: 0, approvals: 0, pending: 0 }), [summaries]);

  // 주의 알림 — 대기/진행 활동 + 미처리 팀 간 요청.
  const pendingActs = useMemo(() => activity.filter((e) => e.at >= since && (e.status === 'pending' || e.status === 'in_progress')).sort((a, b) => (a.at < b.at ? 1 : -1)), [activity, since]);
  const openRequests = useMemo(() => messages.filter((m) => m.status !== 'done'), [messages]);

  const popupRows = openTeam ? activityForTeam(activity, openTeam, since) : [];

  return (
    <div className="exb">
      <div className="exb-head">
        <h3 className="exb-title">📊 전사 브리핑</h3>
        <span className="exb-sub">오늘 · 읽기 전용</span>
      </div>

      {/* 전사 오늘 요약 */}
      <div className="exb-totals">
        <div className="exb-total"><span className="exb-total-n">{totals.taskRunDone}/{totals.taskRunTotal}</span><span className="exb-total-l">자동업무 완료</span></div>
        <div className="exb-total"><span className="exb-total-n">{totals.messagesSent}</span><span className="exb-total-l">팀 간 전달</span></div>
        <div className="exb-total"><span className="exb-total-n">{totals.approvals}</span><span className="exb-total-l">승인</span></div>
        <div className={`exb-total ${totals.pending > 0 ? 'warn' : ''}`}><span className="exb-total-n">{totals.pending}</span><span className="exb-total-l">대기</span></div>
      </div>

      {/* 팀별 오늘 활동 카드(클릭 → 상세) */}
      <div className="exb-section-label">팀별 오늘 활동</div>
      <div className="exb-team-cards">
        {summaries.map((s) => (
          <button key={s.teamId} type="button" className="exb-team-card" onClick={() => setOpenTeam(s.teamId)}>
            <div className="exb-team-card-top">
              <span className="exb-team-name">{DEPT_TEAM_META[s.teamId].emoji} {DEPT_TEAM_META[s.teamId].name}</span>
              {s.pending > 0 && <span className="exb-team-pending">대기 {s.pending}</span>}
            </div>
            <div className="exb-team-stats">
              <span>자동업무 {s.taskRunDone}/{s.taskRunTotal}</span>
              <span>전달 {s.messagesSent}</span>
              <span>승인 {s.approvals}</span>
            </div>
            <div className="exb-team-foot">{s.total > 0 ? `오늘 ${s.total}건 · 최근 ${shortTime(s.lastAt || '')}` : '오늘 활동 없음'} <span className="exb-team-more">상세 →</span></div>
          </button>
        ))}
      </div>

      {/* 주의 알림 */}
      <div className="exb-section-label">주의 알림</div>
      <div className="exb-alerts">
        {pendingActs.length === 0 && openRequests.length === 0 ? (
          <p className="exb-empty">주의가 필요한 항목이 없습니다.</p>
        ) : (
          <>
            {pendingActs.map((e) => (
              <button key={e.id} type="button" className="exb-alert" onClick={() => setOpenTeam(e.teamId)}>
                <span className="exb-alert-dot" />
                <span className="exb-alert-body"><b>{DEPT_TEAM_META[e.teamId].name}</b> · {e.title} <span className="exb-alert-tag">{STATUS_KO[e.status]}</span></span>
                <span className="exb-alert-time">{shortTime(e.at)}</span>
              </button>
            ))}
            {openRequests.length > 0 && (
              <div className="exb-alert-note">미처리 팀 간 요청 {openRequests.length}건 (부서 업무 관장 · 팀 간 요청에서 처리)</div>
            )}
          </>
        )}
      </div>

      {/* 팀 상세 팝업 */}
      {openTeam && (
        <div className="exb-pop-overlay" onClick={() => setOpenTeam(null)}>
          <div className="exb-pop" onClick={(e) => e.stopPropagation()}>
            <div className="exb-pop-head">
              <h4>{DEPT_TEAM_META[openTeam].emoji} {DEPT_TEAM_META[openTeam].name} · 오늘 활동</h4>
              <button type="button" className="exb-pop-close" onClick={() => setOpenTeam(null)} aria-label="닫기">✕</button>
            </div>
            <div className="exb-pop-body">
              {popupRows.length === 0 ? (
                <p className="exb-empty">오늘 기록된 활동이 없습니다.</p>
              ) : popupRows.map((e) => (
                <div key={e.id} className="exb-pop-row">
                  <span className="exb-pop-type">{TYPE_META[e.type]?.emoji} {TYPE_META[e.type]?.label}</span>
                  <div className="exb-pop-main">
                    <div className="exb-pop-title">{e.title} {STATUS_KO[e.status] && <span className={`exb-pop-status st-${e.status}`}>{STATUS_KO[e.status]}</span>}</div>
                    {e.detail && <div className="exb-pop-detail">{e.detail}</div>}
                    <div className="exb-pop-meta">{e.actor.kind === 'agent' ? `🤖 ${e.actor.label}` : `👤 ${e.actor.label}`}{e.relatedTeam ? ` → ${DEPT_TEAM_META[e.relatedTeam].name}` : ''} · {shortTime(e.at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="exb-pop-foot">※ 최고관리자 읽기 전용입니다. 지시는 부서 업무 관장 · 팀 간 요청 또는 HQ 채팅으로.</p>
          </div>
        </div>
      )}
    </div>
  );
};
