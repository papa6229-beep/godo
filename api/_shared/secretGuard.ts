// Godomall5 Open API 환경변수 보안 가드
// 키 원문은 절대 반환하지 않고, "존재 여부(boolean)"와 "해석된 모드"만 노출한다.

export type GodomallMode = 'real' | 'sandbox' | 'mock';

export interface ProxySafetyStatus {
  mode: GodomallMode;
  hasPartnerKey: boolean;
  hasUserKey: boolean;
  hasRealBaseUrl: boolean;
  hasSandboxBaseUrl: boolean;
  // 하위 호환 필드 (기존 프론트 UI가 참조하던 키 이름)
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasBaseUrl: boolean;
  productionLocked: boolean;
  message: string;
}

const present = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

// 환경변수 GODOMALL_API_MODE를 안전하게 해석 (기본값 mock)
export const resolveGodomallMode = (): GodomallMode => {
  const raw = (process.env.GODOMALL_API_MODE || 'mock').trim().toLowerCase();
  if (raw === 'real') return 'real';
  if (raw === 'sandbox') return 'sandbox';
  return 'mock';
};

// 환경변수 존재 여부를 체크하여 보안 상태를 반환 (실제 키 값은 노출하지 않음)
export const getSecretGuardStatus = (): ProxySafetyStatus => {
  const mode = resolveGodomallMode();
  const hasPartnerKey = present(process.env.GODOMALL_PARTNER_KEY);
  const hasUserKey = present(process.env.GODOMALL_USER_KEY);
  const hasRealBaseUrl = present(process.env.GODOMALL_REAL_BASE_URL);
  const hasSandboxBaseUrl = present(process.env.GODOMALL_SANDBOX_BASE_URL);

  return {
    mode,
    hasPartnerKey,
    hasUserKey,
    hasRealBaseUrl,
    hasSandboxBaseUrl,
    // 하위 호환 매핑
    hasApiKey: hasPartnerKey,
    hasApiSecret: hasUserKey,
    hasBaseUrl: mode === 'sandbox' ? hasSandboxBaseUrl : hasRealBaseUrl,
    // 쓰기(write) 액션은 여전히 전면 금지. READ 전용 브릿지.
    productionLocked: mode === 'real',
    message:
      mode === 'mock'
        ? 'Mock mode. No live Godomall calls are made.'
        : `Live READ mode (${mode}). Write actions remain disabled.`
  };
};
