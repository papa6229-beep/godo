// src/components/auth/SignOutButton.tsx
// B-use-5 — 로그인한 active 사용자의 **로그아웃 진입점**.
//
// 배경(실제 화면에서 관측된 차단 결함): `signOut` 이 `AuthGateScreen` 의
//   승인 대기(PendingScreen)·정지(SuspendedScreen) 화면에만 있었다.
//   active 로 로그인하면 App 이 대시보드를 바로 렌더하는데 그 경로에는
//   로그아웃 수단이 전혀 없어서, 계정을 바꿀 수 없었다
//   (HQ→팀장→팀원 전환·가입 신청·계정 전환 자료 격리 검사가 모두 막혔다).
//
// 원칙
//   - **인증이 구성된 모드에서만** 렌더한다. 미구성 로컬(시험 역할) 모드에는
//     `ClerkProvider` 자체가 없으므로(main.tsx) 이 컴포넌트를 마운트하지 않는다.
//     그래서 Clerk 훅 호출은 이 컴포넌트 안에 가둔다 — 상위(MainLayout)는 훅을 부르지 않는다.
//   - 로그아웃은 **Clerk 의 기존 `signOut()`** 만 쓴다.
//     쿠키를 직접 지우거나 localStorage 를 비우거나 페이지를 강제로 새로 고치지 않는다.
//     세션 해제 → `ClerkAuthBridge` 의 기존 경로가 서버 계정을 내려놓고 게이트를 로그인 화면으로 되돌린다.
//   - 업무 자료는 **삭제하지 않는다.** 노출만 끊긴다.
//   - '계정 관리'(승인) 기능과 섞지 않는다. 이 버튼은 로그아웃만 한다.

import { useState } from 'react';
import { useClerk } from '@clerk/react';

export function SignOutButton() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      // 실패해도 버튼이 잠긴 채 남지 않게 한다(사용자가 다시 시도할 수 있어야 한다).
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="auth-signout-btn"
      onClick={() => void onClick()}
      disabled={busy}
      title="로그아웃하고 로그인 화면으로 돌아갑니다."
    >
      {busy ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}

export default SignOutButton;
