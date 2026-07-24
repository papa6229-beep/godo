import React, { useMemo, useRef, useState } from 'react';
import {
  inboxFor, outboxFor, unreadCountFor,
  type CreateTeamMessageInput
} from '../services/teamMessageCenter';
import {
  DEPT_TEAM_META, TEAM_MESSAGE_KIND_META, TEAM_MESSAGE_STATUS_META,
  type DeptTeamId, type TeamMessage, type TeamMessageKind, type TeamMessageStatus, type TeamMessageAttachment
} from '../types/teamMessage';

// 팀 간 소통 패널 — 받은 요청 / 보낸 요청 / 새 요청.
//
// RC-2 D-1.3.1: **보고 있는 팀(viewedTeamId)과 보내는 사람(actor)은 다른 값이다.**
//   총괄이 상품팀 화면을 열어 놓고 메시지를 보내도 발신자는 총괄이어야 한다.
//   화면 선택값으로 신원을 만들면 그 팀 사람인 것처럼 기록된다(사칭).

interface Props {
  /** 지금 화면에서 보고 있는 팀의 메시지함. 신원이 아니다. */
  viewedTeamId: DeptTeamId;
  /** 실제로 보내고 처리하는 사람. 세션 역할에서 온다. */
  actor: { kind: 'human' | 'agent'; teamId: DeptTeamId; label: string };
  messages: TeamMessage[];
  onPost: (input: CreateTeamMessageInput) => void;
  onResolve: (id: string, status: TeamMessageStatus) => void;
  onMarkRead: (id: string) => void;
}

const TEAM_IDS: DeptTeamId[] = ['hq', 'product', 'cs', 'marketing', 'design'];
const KINDS: TeamMessageKind[] = ['support', 'confirm', 'info'];
const fmtSize = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}MB` : n >= 1000 ? `${Math.round(n / 1000)}KB` : `${n}B`);
const shortTime = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const StatusChip: React.FC<{ status: TeamMessageStatus }> = ({ status }) => (
  <span className={`tmsg-status tmsg-status-${status}`}>{TEAM_MESSAGE_STATUS_META[status].label}</span>
);

const Attachments: React.FC<{ items: TeamMessageAttachment[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <div className="tmsg-attachments">
      {items.map((a, i) => (
        a.dataUrl && !a.omitted ? (
          <a key={i} className="tmsg-attach" href={a.dataUrl} download={a.name} title={`${a.name} (${fmtSize(a.size)})`}>📎 {a.name} <span className="tmsg-attach-size">{fmtSize(a.size)}</span></a>
        ) : (
          <span key={i} className="tmsg-attach tmsg-attach-omitted" title="용량이 커서 메타만 보관(실사용 시 스토리지 연결)">📎 {a.name} <span className="tmsg-attach-size">{fmtSize(a.size)} · 미리보기 없음</span></span>
        )
      ))}
    </div>
  );
};

export const TeamMessagePanel: React.FC<Props> = ({ viewedTeamId, actor, messages, onPost, onResolve, onMarkRead }) => {
  // 메시지함은 보고 있는 팀 기준, 발신·처리 권한은 actor 기준.
  const teamId = viewedTeamId;
  /** 이 메시지를 처리할 수 있는 사람인가 — 받은 팀 본인만. 총괄이 대신 처리하지 않는다. */
  const canResolve = (m: TeamMessage): boolean => actor.teamId === m.toTeam;
  const [tab, setTab] = useState<'inbox' | 'outbox' | 'compose'>('inbox');
  // compose 상태
  const [toTeam, setToTeam] = useState<DeptTeamId>(TEAM_IDS.find((t) => t !== actor.teamId) as DeptTeamId);
  const [kind, setKind] = useState<TeamMessageKind>('support');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<TeamMessageAttachment[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const inbox = useMemo(() => inboxFor(messages, teamId), [messages, teamId]);
  const outbox = useMemo(() => outboxFor(messages, teamId), [messages, teamId]);
  const unread = useMemo(() => unreadCountFor(messages, teamId), [messages, teamId]);

  // 받는 팀 후보(자기 자신 제외)
  const toOptions = TEAM_IDS.filter((t) => t !== actor.teamId);

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    setReading(true);
    const arr = Array.from(files);
    Promise.all(arr.map((f) => new Promise<TeamMessageAttachment>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream', dataUrl: typeof reader.result === 'string' ? reader.result : undefined });
      reader.onerror = () => resolve({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream' });
      reader.readAsDataURL(f);
    }))).then((loaded) => {
      setAttachments((prev) => [...prev, ...loaded]);
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    });
  };

  const canSend = !!toTeam && (title.trim().length > 0 || body.trim().length > 0) && !reading;
  const send = () => {
    if (!canSend) return;
    onPost({
      // 발신자는 화면 선택값이 아니라 실제 보내는 사람이다.
      from: { kind: actor.kind, teamId: actor.teamId, label: actor.label },
      toTeam, kind, title, body, attachments
    });
    setTitle(''); setBody(''); setAttachments([]); setKind('support');
    setTab('outbox');
  };

  return (
    <div className="tmsg-panel">
      <div className="tmsg-tabs">
        <button type="button" className={`tmsg-tab ${tab === 'inbox' ? 'active' : ''}`} onClick={() => setTab('inbox')}>
          받은 메시지{unread > 0 && <span className="tmsg-tab-badge">{unread}</span>}
        </button>
        <button type="button" className={`tmsg-tab ${tab === 'outbox' ? 'active' : ''}`} onClick={() => setTab('outbox')}>보낸 메시지</button>
        <button type="button" className={`tmsg-tab tmsg-tab-new ${tab === 'compose' ? 'active' : ''}`} onClick={() => setTab('compose')}>+ 새 메시지</button>
      </div>

      {tab === 'inbox' && (
        <div className="tmsg-list">
          {inbox.length === 0 ? <p className="tmsg-empty">받은 메시지가 없습니다.</p> : inbox.map((m) => (
            <div key={m.id} className={`tmsg-item ${!m.readByTo ? 'is-unread' : ''}`} onMouseEnter={() => !m.readByTo && onMarkRead(m.id)}>
              <div className="tmsg-item-head">
                <span className="tmsg-from">{DEPT_TEAM_META[m.from.teamId].emoji} {DEPT_TEAM_META[m.from.teamId].name}{m.from.kind === 'agent' ? ' · AI' : ''}</span>
                <span className="tmsg-kind">{TEAM_MESSAGE_KIND_META[m.kind].emoji} {TEAM_MESSAGE_KIND_META[m.kind].label}</span>
                <StatusChip status={m.status} />
                <span className="tmsg-time">{shortTime(m.createdAt)}</span>
              </div>
              <div className="tmsg-title">{m.title}</div>
              {m.body && <div className="tmsg-body">{m.body}</div>}
              <Attachments items={m.attachments} />
              <div className="tmsg-actions">
                {canResolve(m) && m.status !== 'in_progress' && m.status !== 'done' && (
                  <button type="button" className="tmsg-btn" onClick={() => onResolve(m.id, 'in_progress')}>진행중으로</button>
                )}
                {canResolve(m) && m.status !== 'done' && (
                  <button type="button" className="tmsg-btn tmsg-btn-done" onClick={() => onResolve(m.id, 'done')}>완료 처리</button>
                )}
                {m.status === 'done' && <span className="tmsg-done-note">처리 완료됨</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'outbox' && (
        <div className="tmsg-list">
          {outbox.length === 0 ? <p className="tmsg-empty">보낸 메시지가 없습니다.</p> : outbox.map((m) => (
            <div key={m.id} className="tmsg-item">
              <div className="tmsg-item-head">
                <span className="tmsg-from">→ {DEPT_TEAM_META[m.toTeam].emoji} {DEPT_TEAM_META[m.toTeam].name}</span>
                <span className="tmsg-kind">{TEAM_MESSAGE_KIND_META[m.kind].emoji} {TEAM_MESSAGE_KIND_META[m.kind].label}</span>
                <StatusChip status={m.status} />
                <span className="tmsg-time">{shortTime(m.createdAt)}</span>
              </div>
              <div className="tmsg-title">{m.title}</div>
              {m.body && <div className="tmsg-body">{m.body}</div>}
              <Attachments items={m.attachments} />
              <div className="tmsg-meta-line">{m.readByTo ? '상대 팀 열람함' : '아직 열람 전'}{m.status === 'done' ? ' · 완료' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'compose' && (
        <div className="tmsg-compose">
          <label className="tmsg-field">
            <span className="tmsg-field-label">받는 팀</span>
            <select className="tmsg-select" value={toTeam} onChange={(e) => setToTeam(e.target.value as DeptTeamId)}>
              {toOptions.map((t) => <option key={t} value={t}>{DEPT_TEAM_META[t].emoji} {DEPT_TEAM_META[t].name}</option>)}
            </select>
          </label>
          <div className="tmsg-field">
            <span className="tmsg-field-label">유형</span>
            <div className="tmsg-kind-chips">
              {KINDS.map((k) => (
                <button key={k} type="button" className={`tmsg-kind-chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                  {TEAM_MESSAGE_KIND_META[k].emoji} {TEAM_MESSAGE_KIND_META[k].label}
                </button>
              ))}
            </div>
          </div>
          <input className="tmsg-input" placeholder="제목 (예: 품절 상품 응대 문구 확인 요청)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="tmsg-textarea" rows={4} placeholder="요청 내용을 적어주세요." value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="tmsg-attach-row">
            <input ref={fileRef} type="file" multiple className="tmsg-file-input" onChange={(e) => onPickFiles(e.target.files)} />
            {reading && <span className="tmsg-reading">첨부 읽는 중…</span>}
          </div>
          {attachments.length > 0 && (
            <div className="tmsg-attach-pending">
              {attachments.map((a, i) => (
                <span key={i} className="tmsg-attach">📎 {a.name} <span className="tmsg-attach-size">{fmtSize(a.size)}</span>
                  <button type="button" className="tmsg-attach-remove" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} aria-label="첨부 제거">✕</button>
                </span>
              ))}
            </div>
          )}
          <button type="button" className="tmsg-send" onClick={send} disabled={!canSend}>메시지 보내기</button>
          <p className="tmsg-compose-note">※ 현재는 이 브라우저(운영자) 기준 데모입니다. 실사용 시 각 팀이 각자 화면에서 실시간으로 주고받게 됩니다.</p>
        </div>
      )}
    </div>
  );
};
