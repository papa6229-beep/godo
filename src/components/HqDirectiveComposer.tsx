import React, { useRef, useState } from 'react';
import { DEPT_TEAM_META, type DeptTeamId, type TeamMessageAttachment } from '../types/teamMessage';

// 오늘의 운영 중앙 하단 — 최고관리자가 팀장에게 메시지 + 간단한 파일을 보내는 바(Quick Task Add 대체).

const DIRECTIVE_TEAMS: DeptTeamId[] = ['product', 'cs', 'marketing', 'design'];
const fmtSize = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}MB` : n >= 1000 ? `${Math.round(n / 1000)}KB` : `${n}B`);

/**
 * B-use-5: 전송 **결과**를 돌려주는 계약.
 *   예전에는 반환값이 없어서, 권한 실패로 아무것도 저장되지 않았을 때도 입력이 지워졌고
 *   성공 여부가 화면에서 보이지 않았다(로그 패널에만 남았다).
 */
export interface DirectiveSendResult { ok: boolean; message: string }

interface Props {
  onSend: (toTeam: DeptTeamId, text: string, attachments: TeamMessageAttachment[]) => DirectiveSendResult;
}

export const HqDirectiveComposer: React.FC<Props> = ({ onSend }) => {
  const [team, setTeam] = useState<DeptTeamId>('product');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<TeamMessageAttachment[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    setReading(true);
    Promise.all(Array.from(files).map((f) => new Promise<TeamMessageAttachment>((resolve) => {
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

  // 전송 결과 안내(입력창 바로 아래). 성공/실패를 화면에서 바로 보이게 한다.
  const [notice, setNotice] = useState<DirectiveSendResult | null>(null);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !reading;
  const send = () => {
    if (!canSend) return;
    const result = onSend(team, text.trim(), attachments);
    setNotice(result);
    // **성공했을 때만** 입력과 첨부를 비운다. 실패하면 쓴 내용을 잃지 않는다.
    if (result.ok) { setText(''); setAttachments([]); }
  };

  return (
    <div className="office-directive">
      <div className="office-directive-bar">
        <span className="office-directive-label">📣 팀에 지시</span>
        <select className="office-directive-team" value={team} onChange={(e) => setTeam(e.target.value as DeptTeamId)}>
          {DIRECTIVE_TEAMS.map((t) => <option key={t} value={t}>{DEPT_TEAM_META[t].emoji} {DEPT_TEAM_META[t].name}</option>)}
        </select>
        <input className="office-directive-input" value={text} placeholder="예: 품절 상품 응대 우선 처리해주세요 (엑셀·이미지 첨부 가능)" onChange={(e) => { setText(e.target.value); if (notice) setNotice(null); }} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <button type="button" className="office-directive-attach" onClick={() => fileRef.current?.click()} title="파일 첨부">📎</button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
        <button type="button" className="office-directive-btn" onClick={send} disabled={!canSend}>보내기</button>
      </div>
      {notice && (
        <div className={`office-directive-note ${notice.ok ? 'ok' : 'fail'}`} role="status">
          {notice.ok ? '✅ ' : '⚠️ '}{notice.message}
        </div>
      )}
      {(attachments.length > 0 || reading) && (
        <div className="office-directive-files">
          {reading && <span className="office-directive-reading">첨부 읽는 중…</span>}
          {attachments.map((a, i) => (
            <span key={i} className="office-directive-file">📎 {a.name} <span className="office-directive-file-size">{fmtSize(a.size)}</span>
              <button type="button" className="office-directive-file-x" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} aria-label="첨부 제거">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
