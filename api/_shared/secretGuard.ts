import type { ProxySafetyStatus } from '../../src/types/proxy';

// 환경변수 존재 여부를 체크하여 보안 상태를 반환 (실제 키 값은 노출하지 않음)
export const getSecretGuardStatus = (): ProxySafetyStatus => {
  const hasApiKey = typeof process.env.GODOMALL_API_KEY === 'string' && process.env.GODOMALL_API_KEY.trim().length > 0;
  const hasApiSecret = typeof process.env.GODOMALL_API_SECRET === 'string' && process.env.GODOMALL_API_SECRET.trim().length > 0;
  const hasBaseUrl = typeof process.env.GODOMALL_BASE_URL === 'string' && process.env.GODOMALL_BASE_URL.trim().length > 0;

  return {
    hasApiKey,
    hasApiSecret,
    hasBaseUrl,
    productionLocked: true, // 이번 MVP 샌드박스 단계에서는 프로덕션 고정 락
    message: 'Production API connection is locked in this MVP.'
  };
};
