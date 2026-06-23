// 고도몰5 Open API (OpenHub) POST 클라이언트
// - real/sandbox base URL 선택
// - partner_key, key 기본 파라미터 주입 (키 원문은 절대 로깅/반환하지 않음)
// - POST 전송 후 XML(string) 수신
// - 에러 표준화 ({ ok:false, error })

import { resolveGodomallMode } from './secretGuard.js';
import type { GodomallMode } from './secretGuard.js';

export interface GodomallConfig {
  mode: GodomallMode;
  partnerKey: string;
  userKey: string;
  realBaseUrl: string;
  sandboxBaseUrl: string;
  activeBaseUrl: string;
  hasPartnerKey: boolean;
  hasUserKey: boolean;
}

export interface GodomallCallResult {
  ok: boolean;
  status: number;
  xml?: string;
  error?: string;
}

// 환경변수 로드 + 모드별 활성 base URL 결정
export const getGodomallConfig = (): GodomallConfig => {
  const mode = resolveGodomallMode();
  const partnerKey = (process.env.GODOMALL_PARTNER_KEY || '').trim();
  const userKey = (process.env.GODOMALL_USER_KEY || '').trim();
  const realBaseUrl = (process.env.GODOMALL_REAL_BASE_URL || 'https://openhub.godo.co.kr/godomall5').trim();
  const sandboxBaseUrl = (process.env.GODOMALL_SANDBOX_BASE_URL || 'http://sbopenhub.godo.co.kr/godomall5').trim();
  const activeBaseUrl = mode === 'sandbox' ? sandboxBaseUrl : realBaseUrl;

  return {
    mode,
    partnerKey,
    userKey,
    realBaseUrl,
    sandboxBaseUrl,
    activeBaseUrl,
    hasPartnerKey: partnerKey.length > 0,
    hasUserKey: userKey.length > 0
  };
};

// 실제 Open API 호출 가능 여부 (real/sandbox + 키/URL 구비)
export const isLiveMode = (config: GodomallConfig): boolean => {
  if (config.mode === 'mock') return false;
  if (!config.hasPartnerKey || !config.hasUserKey) return false;
  return config.activeBaseUrl.length > 0;
};

// base URL과 경로를 안전하게 결합 (// 중복 방지)
const joinUrl = (base: string, path: string): string => {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
};

const REQUEST_TIMEOUT_MS = 30000;

// OpenHub POST 요청 — partner_key, key 자동 주입. 응답은 XML 문자열.
export const postGodomall = async (
  path: string,
  params: Record<string, string | number>,
  config: GodomallConfig
): Promise<GodomallCallResult> => {
  if (!isLiveMode(config)) {
    return { ok: false, status: 0, error: 'Godomall live mode is not configured.' };
  }

  const url = joinUrl(config.activeBaseUrl, path);
  const form = new URLSearchParams();
  // 인증 파라미터 (키 원문은 본문에만 실리며 로깅하지 않음)
  form.set('partner_key', config.partnerKey);
  form.set('key', config.userKey);
  for (const [k, v] of Object.entries(params)) {
    form.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/xml, text/xml, */*'
      },
      body: form.toString(),
      signal: controller.signal
    });

    const xml = await res.text();

    if (!res.ok) {
      // 본문에 키가 echo될 수 있으므로 상태코드만 노출
      return { ok: false, status: res.status, error: `Godomall API returned HTTP ${res.status}` };
    }

    return { ok: true, status: res.status, xml };
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : 'Error';
    const message = name === 'AbortError' ? 'Godomall API request timed out (30s).' : 'Godomall API request failed.';
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
};
