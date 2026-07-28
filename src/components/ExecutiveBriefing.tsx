import React, { useEffect, useMemo, useState } from 'react';
import './ExecutiveBriefing.css';
import { loadTeamMessages, subscribeTeamMessages } from '../services/repositories/teamMessageRepository';
import { DEPT_TEAM_META, TEAM_MESSAGE_KIND_META, type DeptTeamId } from '../types/teamMessage';
import type { TeamMessage } from '../types/teamMessage';
import type { ApprovalItem } from '../types/approval';
import { approvalTeamId } from '../services/taskLifecycleAppAdapter';

// 오늘의 운영 우측 — 팀별 "오늘 크리티컬(승인·확인 필요)" 업무만. 최고관리자 읽기 전용.
//  크리티컬 = ① **지금 이 사용자가 결정해야 하는 실제 승인 항목** ② 미처리 팀 간 요청(팀 메시지).
//
// B-use-5 교정: 이전에는 활동 원장의 `status === 'pending'` 이벤트를 승인으로 **추측**했다.
//   그래서 (a) 실제 승인 대기가 있어도 활동 이벤트가 없으면 오른쪽에 안 보이고,
//   (b) 눌러서 열린 목록과 카드가 서로 다른 업무일 수 있었다.
//   이제 App 의 `myPendingApprovals` 를 그대로 받아서 만든다. 추측하지 않는다.

const TEAMS: DeptTeamId[] = ['product', 'cs', 'marketing', 'design', 'hq'];

const localMidnightIso = (): string => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const shortTime = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface CriticalItem { id: string; team: DeptTeamId; kind: 'approval' | 'request'; title: string; note: string; at: string; }

// B-use-5: 일반 팀 메시지를 '승인'처럼 보이게 하지 않는다.
//   승인 = 내가 결정해야 하는 것 / 처리 필요 = 해당 부서 업무 화면에서 처리하는 것.
const KIND_LABEL: Record<CriticalItem['kind'], string> = { approval: '승인 필요', request: '처리 필요' };

interface Props {
  /**
   * B-use-5 교정: **지금 이 사용자가 결정할 수 있는 승인 항목만**(App 의 `myPendingApprovals`).
   * 전체 `approvalQueue` 를 넘기면 왼쪽 숫자·오른쪽 항목이 다시 어긋난다.
   */
  pendingApprovalsForIdentity?: ApprovalItem[];
  /** B-use-5: 실제 승인 항목을 누르면 **같은 승인 대기열**을 연다(우측 하단 플로팅 대체). */
  onOpenApprovals?: () => void;
}

export const ExecutiveBriefing: React.FC<Props> = ({ pendingApprovalsForIdentity = [], onOpenApprovals }) => {
  const [messages, setMessages] = useState<TeamMessage[]>(() => loadTeamMessages());
  useEffect(() => subscribeTeamMessages(() => setMessages(loadTeamMessages())), []);
  const since = useMemo(() => localMidnightIso(), []);

  // 팀별 크리티컬 수집
  const byTeam = useMemo(() => {
    const map: Record<string, CriticalItem[]> = {};
    for (const t of TEAMS) map[t] = [];
    // ① 실제 승인 항목 — 활동 원장 추측이 아니라 **정본 승인 배열**에서 만든다.
    //    팀 귀속은 기존 정본 함수 approvalTeamId 를 재사용한다(새 규칙을 만들지 않는다).
    for (const it of pendingApprovalsForIdentity) {
      const team = approvalTeamId(it) ?? 'hq';
      (map[team] ||= []).push({
        id: it.id, team, kind: 'approval', title: it.title,
        // ApprovalItem 에는 시각 필드가 없다. 없는 값을 지어내지 않고 오늘 기준시각으로 묶는다.
        note: '승인 대기', at: since
      });
    }
    // ② 아직 손대지 않은(open) 받은 메시지 — 진행 중/완료는 제외(중복·처리중 제거)
    for (const m of messages) {
      if (m.status === 'open') {
        (map[m.toTeam] ||= []).push({ id: m.id, team: m.toTeam, kind: 'request', title: m.title, note: `${DEPT_TEAM_META[m.from.teamId].name}의 ${TEAM_MESSAGE_KIND_META[m.kind].label}`, at: m.createdAt });
      }
    }
    for (const t of TEAMS) map[t].sort((a, b) => (a.at < b.at ? 1 : -1));
    return map;
  }, [pendingApprovalsForIdentity, messages, since]);

  const total = useMemo(() => TEAMS.reduce((n, t) => n + byTeam[t].length, 0), [byTeam]);
  const activeTeams = TEAMS.filter((t) => byTeam[t].length > 0);

  return (
    <div className="exb">
      <div className="exb-head">
        <h3 className="exb-title">🔔 승인·처리 필요</h3>
        <span className={`exb-count ${total > 0 ? 'warn' : ''}`}>{total}건</span>
      </div>
      <p className="exb-lead">
        오늘 각 팀에서 손이 필요한 업무입니다. <b>승인 필요</b>는 눌러서 바로 확인하고,
        <b>처리 필요</b>는 부서 업무 관장에서 처리합니다.
      </p>

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
              {byTeam[t].map((it) => {
                const openable = it.kind === 'approval' && !!onOpenApprovals;
                const body = (
                  <>
                    <span className="exb-crit-dot" />
                    <div className="exb-crit-body">
                      <div className="exb-crit-title">{it.title}</div>
                      <div className="exb-crit-note">
                        <span className={`exb-crit-kind kind-${it.kind}`}>{KIND_LABEL[it.kind]}</span>
                        {' · '}{it.kind === 'approval' ? '🤖 자동업무' : '📨 팀 간 메시지'} · {it.note}
                      </div>
                    </div>
                    <span className="exb-crit-time">{shortTime(it.at)}</span>
                  </>
                );
                return openable ? (
                  <button key={it.id} type="button" className={`exb-crit-item kind-${it.kind} clickable`}
                    onClick={() => onOpenApprovals?.()} title="확인 대기 목록을 엽니다.">
                    {body}
                  </button>
                ) : (
                  <div key={it.id} className={`exb-crit-item kind-${it.kind}`}>{body}</div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
