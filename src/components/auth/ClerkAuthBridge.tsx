// src/components/auth/ClerkAuthBridge.tsx
// R-AUTH-FOUNDATION-01 GREEN A.1 — Clerk 세션 ↔ 앱 게이트 실브리지(실소비자).
//
// ClerkProvider 내부에 마운트되어:
//   1) useAuth() 로 loaded/signedIn/getToken 을 읽고
//   2) 세션 토큰 게터를 authorizedFetch 에 등록하고(보호 API 가 Bearer 로 전달)
//   3) /api/auth/me 를 실호출해 pending/active/suspended 를 가져오고
//   4) registerAuthSource() 로 게이트에 상태를 주입한다.
// 로그인·로그아웃·가입 완료·승인 후 재확인 시 notifyAuthChange 로 게이트가 갱신된다.

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import {
  registerAuthSource, notifyAuthChange, setServerAccount, registerAuthRefresh,
  takePendingSignupProfile
} from '../../services/authGate';
import type { AccountLiveStatus, ServerAccountView } from '../../services/authGate';
import { registerSessionTokenGetter, authorizedFetch } from '../../services/authorizedFetch';

interface MeResponse { account?: ServerAccountView | null; }

export function ClerkAuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // 게이트에 주입되는 스냅샷(모듈 렌더 주기와 분리된 ref — source 클로저가 항상 최신을 읽음).
  const snap = useRef<{ loaded: boolean; signedIn: boolean; status: AccountLiveStatus }>({
    loaded: false, signedIn: false, status: null
  });

  // /api/auth/me 재조회(가입 직후 프로필 전송 포함).
  const refreshMe = useCallback(async () => {
    if (!isSignedIn) { snap.current.status = null; setServerAccount(null); return; }
    try {
      let res = await authorizedFetch('/api/auth/me');
      let data = (await res.json()) as MeResponse;
      // 가입 직후: 계정 메타가 아직 없고 가입 폼이 프로필을 남겼다면 signup-metadata 전송.
      if (res.ok && !data.account) {
        const profile = takePendingSignupProfile();
        if (profile) {
          await authorizedFetch('/api/auth/signup-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile) // 이름·팀·직책만 — 비밀번호는 Clerk 에만 존재
          });
          res = await authorizedFetch('/api/auth/me');
          data = (await res.json()) as MeResponse;
        }
      }
      const account = res.ok ? (data.account ?? null) : null;
      snap.current.status = account ? account.status : null;
      setServerAccount(account);
    } catch {
      snap.current.status = null;
      setServerAccount(null);
    }
  }, [isSignedIn]);

  // 재확인(refreshAuthStatus)이 항상 최신 refreshMe 를 부르도록 ref 로 연결.
  const refreshRef = useRef(refreshMe);
  useEffect(() => { refreshRef.current = refreshMe; }, [refreshMe]);

  // 마운트 1회: 소스·토큰 게터·재확인 함수 등록.
  useEffect(() => {
    registerAuthSource(() => ({
      configured: true,
      loaded: snap.current.loaded,
      signedIn: snap.current.signedIn,
      status: snap.current.status
    }));
    registerAuthRefresh(async () => { await refreshRef.current(); notifyAuthChange(); });
    return () => { registerAuthRefresh(null); registerSessionTokenGetter(null); };
  }, []);

  // Clerk 상태 변화 → 토큰 게터 갱신 + me 재조회 + 게이트 통지.
  useEffect(() => {
    snap.current.loaded = isLoaded;
    snap.current.signedIn = !!isSignedIn;
    if (isSignedIn) {
      registerSessionTokenGetter(() => getToken());
    } else {
      registerSessionTokenGetter(null);
      snap.current.status = null;
      setServerAccount(null);
    }
    notifyAuthChange();
    if (isLoaded && isSignedIn) {
      void refreshMe().then(() => notifyAuthChange());
    }
  }, [isLoaded, isSignedIn, getToken, refreshMe]);

  return null;
}

export default ClerkAuthBridge;
