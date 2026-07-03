import React, { useEffect, useMemo, useState } from 'react';
import './ExecutiveBriefing.css';
import { loadActivity, subscribeActivity, activitySince } from '../services/activityLedger';
import { loadTeamMessages, subscribeTeamMessages } from '../services/teamMessageCenter';
import { DEPT_TEAM_META, TEAM_MESSAGE_KIND_META, type DeptTeamId } from '../types/teamMessage';
import type { ActivityEvent } from '../types/activityLedger';
import type { TeamMessage } from '../types/teamMessage';

// 오늘의 운영 우측 — 팀별 "오늘 크리티컬(승인·확인 필요)" 업무만. 최고관리자 읽기 전용.
//  크리티컬 = ① 승인 대기/진행 중 활동(원장) ② 미처리 팀 간 요청(팀 메시지).

const TEAMS: DeptTeamId[] = ['product', 'cs', 'marketing', 'hq'];

const localMidnightIso = (): string => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const shortTime = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface CriticalItem { id: string; team: DeptTeamId; kind: 'approval' | 'request'; title: string; note: string; at: string; }

export const ExecutiveBriefing: React.FC = () => {
  const [activity, setActivity] = useState<ActivityEvent[]>(() => loadActivity());
  const [messages, setMessages] = useState<TeamMessage[]>(() => loadTeamMessages());
  useEffect(() => subscribeActivity(() => setActivity(loadActivity())), []);
  useEffect(() => subscribeTeamMessages(() => setMessages(loadTeamMessages())), []);
  const since = useMemo(() => localMidnightIso(), []);

  // 팀별 크리티컬 수집
  const byTeam = useMemo(() => {
    const map: Record<string, CriticalItem[]> = {};
    for (const t of TEAMS) map[t] = [];
    // ① 승인 대기 자동업무(진행 중은 이미 처리 중이므로 제외)
    for (const e of activitySince(activity, since)) {
      if (e.status === 'pending') {
        (map[e.teamId] ||= []).push({ id: e.id, team: e.teamId, kind: 'approval', title: e.title, note: '승인 대기', at: e.at });
      }
    }
    // ② 아직 손대지 않은(open) 받은 메시지 — 진행 중/완료는 제외(중복·처리중 제거)
    for (const m of messages) {
      if (m.status === 'open') {
        (map[m.toTeam] ||= []).push({ id: m.id, team: m.toTeam, kind: 'request', title: m.title, note: `${DEPT_TEAM_META[m.from.teamId].name}의 ${TEAM_MESSAGE_KIND_META[m.kind].label}`, at: m.createdAt });
      }
    }
    for (const t of TEAMS) map[t].sort((a, b) => (a.at < b.at ? 1 : -1));
    return map;
  }, [activity, messages, since]);

  const total = useMemo(() => TEAMS.reduce((n, t) => n + byTeam[t].length, 0), [byTeam]);
  const activeTeams = TEAMS.filter((t) => byTeam[t].length > 0);

  return (
    <div className="exb">
      <div className="exb-head">
        <h3 className="exb-title">🔔 승인·확인 필요</h3>
        <span className={`exb-count ${total > 0 ? 'warn' : ''}`}>{total}건</span>
      </div>
      <p className="exb-lead">오늘 각 팀에서 <b>승인·확인이 필요한</b> 업무만 모았습니다. (읽기 전용 · 처리는 부서 업무 관장에서)</p>

      {total === 0 ? (
        <div className="exb-clear">✅ 지금 승인·확인이 필요한 업무가 없습니다.</div>
      ) : (
        <div className="exb-crit-teams">
          {activeTeams.map((t) => (
            <div key={t} className="exb-crit-team">
              <div className="exb-crit-team-label">
                {DEPT_TEAM_META[t].emoji} {DEPT_TEAM_META[t].name}
                <span className="exb-crit-team-n">{byTeam[t].length}</span>
              </div>
              {byTeam[t].map((it) => (
                <div key={it.id} className={`exb-crit-item kind-${it.kind}`}>
                  <span className="exb-crit-dot" />
                  <div className="exb-crit-body">
                    <div className="exb-crit-title">{it.title}</div>
                    <div className="exb-crit-note">{it.kind === 'approval' ? '🤖 자동업무' : '📨 팀 간 메시지'} · {it.note}</div>
                  </div>
                  <span className="exb-crit-time">{shortTime(it.at)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
