import React, { useEffect, useState } from 'react';
import './AgentTaskStudio.css';
import {
  loadAgentTasks, subscribeAgentTasks, saveUpsertTask, saveRemoveTask, resetAgentTasks, newTaskId
} from '../services/agentTaskStore';
import {
  scheduleLabel, APPROVAL_MODE_META, FOCUS_META,
  type AgentTaskSpec, type AgentTaskApprovalMode, type AgentTaskFocus, type AgentTaskScheduleKind
} from '../types/agentTask';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';

// AI 직원 → 자동 업무: 팀 AI 에이전트가 자동 수행할 업무와 승인모드를 정의·편집.
// 여기서 저장하면 부서 보드의 자동 업무 탭과 실행기가 그대로 소비한다(Studio↔실행 연결).

const TEAMS: DeptTeamId[] = ['hq', 'product', 'cs', 'marketing', 'design'];
const FOCI: AgentTaskFocus[] = ['overview', 'sales', 'inventory', 'cs'];
const MODES: AgentTaskApprovalMode[] = ['auto', 'approval', 'draft'];
const SCHED_KINDS: AgentTaskScheduleKind[] = ['manual', 'daily', 'weekly'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const blankTask = (): AgentTaskSpec => ({
  id: newTaskId(), teamId: 'product', agentId: 'product-lead', agentLabel: '상품 관리 AI',
  title: '새 자동 업무', focus: 'overview', reportTo: 'hq', reportKind: 'info',
  schedule: { kind: 'daily', at: '09:00' }, approvalMode: 'auto'
});

const TaskEditor: React.FC<{ spec: AgentTaskSpec; onSave: (s: AgentTaskSpec) => void; onDelete: (id: string) => void }> = ({ spec, onSave, onDelete }) => {
  // 부모가 spec 내용 변화 시 key로 리마운트하므로 초기값만 세팅(effect 동기화 불필요).
  const [f, setF] = useState<AgentTaskSpec>(spec);
  const set = (patch: Partial<AgentTaskSpec>) => setF((p) => ({ ...p, ...patch }));
  const setSched = (patch: Partial<AgentTaskSpec['schedule']>) => setF((p) => ({ ...p, schedule: { ...p.schedule, ...patch } }));
  const dirty = JSON.stringify(f) !== JSON.stringify(spec);

  return (
    <div className="ats-card">
      <div className="ats-row">
        <label className="ats-field ats-grow">
          <span>업무명</span>
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="ats-field">
          <span>수행 팀</span>
          <select value={f.teamId} onChange={(e) => set({ teamId: e.target.value as DeptTeamId })}>
            {TEAMS.map((t) => <option key={t} value={t}>{DEPT_TEAM_META[t].name}</option>)}
          </select>
        </label>
      </div>
      <div className="ats-row">
        <label className="ats-field ats-grow">
          <span>에이전트 표시명</span>
          <input value={f.agentLabel} onChange={(e) => set({ agentLabel: e.target.value })} />
        </label>
        <label className="ats-field">
          <span>초점(지표)</span>
          <select value={f.focus} onChange={(e) => set({ focus: e.target.value as AgentTaskFocus })}>
            {FOCI.map((x) => <option key={x} value={x}>{FOCUS_META[x]}</option>)}
          </select>
        </label>
        <label className="ats-field">
          <span>보고 대상</span>
          <select value={f.reportTo} onChange={(e) => set({ reportTo: e.target.value as DeptTeamId })}>
            {TEAMS.map((t) => <option key={t} value={t}>{DEPT_TEAM_META[t].name}</option>)}
          </select>
        </label>
      </div>
      <div className="ats-row">
        <label className="ats-field">
          <span>승인 모드</span>
          <select value={f.approvalMode} onChange={(e) => set({ approvalMode: e.target.value as AgentTaskApprovalMode })}>
            {MODES.map((m) => <option key={m} value={m}>{APPROVAL_MODE_META[m].label}</option>)}
          </select>
        </label>
        <label className="ats-field">
          <span>주기</span>
          <select value={f.schedule.kind} onChange={(e) => setSched({ kind: e.target.value as AgentTaskScheduleKind })}>
            {SCHED_KINDS.map((k) => <option key={k} value={k}>{k === 'manual' ? '수동' : k === 'daily' ? '매일' : '매주'}</option>)}
          </select>
        </label>
        {f.schedule.kind === 'weekly' && (
          <label className="ats-field">
            <span>요일</span>
            <select value={f.schedule.weekday ?? 1} onChange={(e) => setSched({ weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
            </select>
          </label>
        )}
        {f.schedule.kind !== 'manual' && (
          <label className="ats-field">
            <span>시각</span>
            <input value={f.schedule.at ?? ''} placeholder="09:00" onChange={(e) => setSched({ at: e.target.value })} />
          </label>
        )}
      </div>
      <div className="ats-card-foot">
        <span className="ats-mode-desc">{APPROVAL_MODE_META[f.approvalMode].desc} · {scheduleLabel(f.schedule)}</span>
        <div className="ats-card-actions">
          <button type="button" className="ats-del" onClick={() => onDelete(spec.id)}>삭제</button>
          <button type="button" className="ats-save" disabled={!dirty} onClick={() => onSave(f)}>{dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>
    </div>
  );
};

export const AgentTaskStudio: React.FC = () => {
  const [tasks, setTasks] = useState<AgentTaskSpec[]>(() => loadAgentTasks());
  useEffect(() => subscribeAgentTasks(() => setTasks(loadAgentTasks())), []);

  const onSave = (s: AgentTaskSpec) => setTasks(saveUpsertTask(s));
  const onDelete = (id: string) => setTasks(saveRemoveTask(id));
  const onAdd = () => setTasks(saveUpsertTask(blankTask()));
  const onReset = () => setTasks(resetAgentTasks());

  return (
    <div className="ats-panel">
      <div className="ats-head">
        <div>
          <h3 className="ats-title">🤖 팀 자동 업무 설정</h3>
          <p className="ats-sub">각 팀 AI 에이전트가 자동 수행할 업무와 <b>승인 모드</b>를 정의합니다. 저장하면 부서 보드의 자동 업무 탭에 바로 반영됩니다.</p>
        </div>
        <div className="ats-head-actions">
          <button type="button" className="ats-reset" onClick={onReset}>기본값 복원</button>
          <button type="button" className="ats-add" onClick={onAdd}>+ 업무 추가</button>
        </div>
      </div>
      {TEAMS.filter((t) => tasks.some((x) => x.teamId === t)).map((team) => (
        <div key={team} className="ats-team-group">
          <div className="ats-team-label">{DEPT_TEAM_META[team].emoji} {DEPT_TEAM_META[team].name}</div>
          {tasks.filter((x) => x.teamId === team).map((t) => (
            <TaskEditor key={JSON.stringify(t)} spec={t} onSave={onSave} onDelete={onDelete} />
          ))}
        </div>
      ))}
      {tasks.length === 0 && <p className="ats-empty">등록된 자동 업무가 없습니다. "+ 업무 추가"로 만들어 보세요.</p>}
    </div>
  );
};
