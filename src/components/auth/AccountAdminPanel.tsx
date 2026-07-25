// src/components/auth/AccountAdminPanel.tsx
// R-AUTH-FOUNDATION-01 GREEN A.1 — 최소 계정 관리 패널(팀장/HQ 전용, 포털 아님).
//
// - 팀장: 자기 팀 pending member 목록 승인 / 자기 팀 member 정지·임시 비번 초기화.
// - HQ: 전체 pending(member 또는 team_lead 로 승인) / 전체 정지·초기화.
// 목록 스코프·권한 판정은 전부 서버(/api/auth/pending-approvals·approve·suspend·reset-password)가
// 강제한다 — 이 화면은 서버 응답을 표시하고 버튼을 누를 뿐이다. 계정 삭제 기능 없음.
// 임시 비밀번호는 입력 즉시 서버로 전달되고 어디에도 저장·표시 유지되지 않는다.

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { authorizedFetch } from '../../services/authorizedFetch';
import { getServerAccount } from '../../services/authGate';
import type { ServerAccountView } from '../../services/authGate';

const TEAM_LABEL: Record<string, string> = { product: '상품관리팀', cs: 'CS팀', marketing: '마케팅팀', design: '디자인팀', hq: '본사' };
const ROLE_LABEL: Record<string, string> = { hq: '총괄', team_lead: '팀장', member: '팀원' };

const OVERLAY: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
};
const PANEL: CSSProperties = {
  width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', background: '#fff',
  borderRadius: 16, padding: 24, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', fontFamily: 'system-ui, sans-serif'
};
const ROW: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 8, flexWrap: 'wrap'
};
const SBTN: CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb',
  fontSize: 12, cursor: 'pointer'
};
const PRIMARY: CSSProperties = { ...SBTN, background: '#2563eb', borderColor: '#2563eb', color: '#fff' };

interface Lists { pending: ServerAccountView[]; managed: ServerAccountView[]; }

export function AccountAdminPanel({ onClose }: { onClose: () => void }) {
  const me = getServerAccount();
  const isHq = me?.role === 'hq';
  const [lists, setLists] = useState<Lists>({ pending: [], managed: [] });
  const [message, setMessage] = useState('');
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authorizedFetch('/api/auth/pending-approvals');
      const data = await res.json();
      if (res.ok) setLists({ pending: data.pending ?? [], managed: data.managed ?? [] });
      else setMessage(String(data.errorMessage ?? '목록을 불러올 수 없습니다.'));
    } catch {
      setMessage('목록을 불러올 수 없습니다.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (action: string, body: Record<string, unknown>, okMsg: string) => {
    setMessage('');
    try {
      const res = await authorizedFetch(`/api/auth/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      setMessage(res.ok ? okMsg : String(data.errorMessage ?? '요청이 거부되었습니다.'));
      await load();
    } catch {
      setMessage('요청에 실패했습니다.');
    }
  };

  const who = (a: ServerAccountView) =>
    `${a.name} · ${TEAM_LABEL[a.team] ?? a.team} · ${a.position} (${ROLE_LABEL[a.role] ?? a.role})`;

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={PANEL} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>계정 관리 {isHq ? '(총괄)' : '(팀장)'}</h2>
          <button type="button" style={SBTN} onClick={onClose}>닫기</button>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 8px' }}>가입 승인 대기 ({lists.pending.length})</h3>
        {lists.pending.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>대기 중인 신청이 없습니다.</p>}
        {lists.pending.map((a) => (
          <div key={a.userId} style={ROW}>
            <span style={{ fontSize: 13 }}>{who(a)}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={PRIMARY}
                onClick={() => void post('approve', { targetUserId: a.userId, approveAsRole: 'member' }, '팀원으로 승인했습니다.')}>
                팀원으로 승인
              </button>
              {isHq && (
                <button type="button" style={SBTN}
                  onClick={() => void post('approve', { targetUserId: a.userId, approveAsRole: 'team_lead' }, '팀장으로 승인했습니다.')}>
                  팀장으로 승인
                </button>
              )}
            </span>
          </div>
        ))}

        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>관리 대상 계정 ({lists.managed.length})</h3>
        {lists.managed.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>관리할 수 있는 계정이 없습니다.</p>}
        {lists.managed.map((a) => (
          <div key={a.userId} style={ROW}>
            <span style={{ fontSize: 13 }}>{who(a)}{a.status === 'suspended' ? ' · 정지됨' : ''}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {a.status === 'active' && (
                <button type="button" style={SBTN}
                  onClick={() => void post('suspend', { targetUserId: a.userId }, '계정을 정지했습니다(기록은 보존됩니다).')}>
                  정지
                </button>
              )}
              {resetTarget === a.userId ? (
                <>
                  <input
                    style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, width: 140 }}
                    type="password" placeholder="임시 비밀번호(8자+)" value={tempPw} autoComplete="new-password"
                    onChange={(e) => setTempPw(e.target.value)}
                  />
                  <button type="button" style={PRIMARY}
                    onClick={() => {
                      const pw = tempPw; setTempPw(''); setResetTarget(null);
                      void post('reset-password', { targetUserId: a.userId, tempPassword: pw },
                        '임시 비밀번호를 발급했습니다. 기존 세션은 종료되며 다음 로그인에서 변경이 요구됩니다.');
                    }}>
                    발급
                  </button>
                  <button type="button" style={SBTN} onClick={() => { setTempPw(''); setResetTarget(null); }}>취소</button>
                </>
              ) : (
                <button type="button" style={SBTN} onClick={() => setResetTarget(a.userId)}>임시 비번</button>
              )}
            </span>
          </div>
        ))}

        {message && <p style={{ fontSize: 13, color: '#2563eb', marginTop: 12 }}>{message}</p>}
      </div>
    </div>
  );
}

export default AccountAdminPanel;
