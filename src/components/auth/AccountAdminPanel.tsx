// src/components/auth/AccountAdminPanel.tsx
// R-AUTH-FOUNDATION-01 최종 채택 — 최소 계정 관리 패널(팀장/HQ 전용, 포털 아님).
//
// 채택 범위는 "가입 승인" 하나뿐이다.
// - 팀장: 자기 팀 pending member 승인.  - HQ: 전체 pending 을 member 또는 team_lead 로 승인.
// 목록 스코프·권한 판정은 전부 서버(/api/auth/pending-approvals·approve)가 강제한다 —
// 이 화면은 서버 응답을 표시하고 승인 버튼을 누를 뿐이다. 계정 삭제 기능 없음.
//
// 2026-07-27 최소화: 임시 비밀번호 발급·계정 정지 UI 와 호출 경로를 제거했다.
// 두 기능은 제품 안에 복구 경로가 없어(강제 변경 화면 없음 / 정지 해제 없음) 사용자를
// 막다른 상태로 만든다. 서버도 두 액션을 503 으로 닫았다(api/auth/[action].ts DISABLED_ACTIONS).
// 비밀번호 문제와 계정 중지는 당분간 Clerk 관리자 대시보드에서만 처리한다.

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

export function AccountAdminPanel({ onClose }: { onClose: () => void }) {
  const me = getServerAccount();
  const isHq = me?.role === 'hq';
  const [pending, setPending] = useState<ServerAccountView[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authorizedFetch('/api/auth/pending-approvals');
      const data = await res.json();
      if (res.ok) setPending(data.pending ?? []);
      else setMessage(String(data.errorMessage ?? '목록을 불러올 수 없습니다.'));
    } catch {
      setMessage('목록을 불러올 수 없습니다.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const approve = async (targetUserId: string, approveAsRole: 'member' | 'team_lead', okMsg: string) => {
    setMessage('');
    try {
      const res = await authorizedFetch('/api/auth/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, approveAsRole })
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
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>가입 승인 {isHq ? '(총괄)' : '(팀장)'}</h2>
          <button type="button" style={SBTN} onClick={onClose}>닫기</button>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 8px' }}>가입 승인 대기 ({pending.length})</h3>
        {pending.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>대기 중인 신청이 없습니다.</p>}
        {pending.map((a) => (
          <div key={a.userId} style={ROW}>
            <span style={{ fontSize: 13 }}>{who(a)}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={PRIMARY}
                onClick={() => void approve(a.userId, 'member', '팀원으로 승인했습니다.')}>
                팀원으로 승인
              </button>
              {isHq && (
                <button type="button" style={SBTN}
                  onClick={() => void approve(a.userId, 'team_lead', '팀장으로 승인했습니다.')}>
                  팀장으로 승인
                </button>
              )}
            </span>
          </div>
        ))}

        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, lineHeight: 1.6 }}>
          비밀번호 초기화와 계정 중지는 이 화면에서 제공하지 않습니다.
          총괄 관리자가 Clerk 관리자 대시보드에서 처리합니다.
        </p>

        {message && <p style={{ fontSize: 13, color: '#2563eb', marginTop: 12 }}>{message}</p>}
      </div>
    </div>
  );
}

export default AccountAdminPanel;
