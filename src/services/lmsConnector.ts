export interface LMSModel {
  id: string;
  object: string;
  owned_by?: string;
}

export interface LMSModelsResponse {
  data: LMSModel[];
  object: string;
}

export interface LMSChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 연결 실패 원인 세분화
export type LmsErrorKind =
  | 'endpoint_not_found' // 404: chat endpoint path mismatch
  | 'server_off'         // connection refused / CORS / network
  | 'model_not_found'    // model id mismatch
  | 'timeout'            // model response timeout
  | 'bad_response'       // 200이지만 object/content 형식 불일치 또는 기타 HTTP 오류
  | 'unknown';

// 디버그용 호출 메타 (프롬프트 전문은 절대 포함하지 않는다)
export interface LmsCallDebug {
  method: string;
  finalUrl: string;    // 브라우저 fetch가 실제로 호출하는 URL (dev에서는 프록시 경로)
  upstreamUrl: string; // 프록시가 향하는 실제 LM Studio URL
  status?: number;
  objectType?: string; // response.object
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1';
const TIMEOUT_MS = 30000;
// 모델 목록 조회는 가벼우므로 짧게.
const MODELS_TIMEOUT_MS = 12000;
// SuperGemma4 26B 등 대형 모델은 cold start 시 첫 응답이 1분 이상 걸릴 수 있어 길게.
const CHAT_TIMEOUT_MS = 90000;

/**
 * endpoint 문자열로부터 fetch용 base와 실제 upstream base를 안전하게 조립한다.
 * - 끝의 슬래시 제거
 * - /v1 이 없으면 한 번만 부여 (/v1/v1 중복 방지)
 * - LM Studio 로컬(localhost/127.0.0.1:1234)은 dev 프록시(/lmstudio/v1)로 라우팅하여
 *   CORS 및 Windows의 localhost→IPv6(::1) 미스를 회피
 */
export function resolveLmsBase(endpoint: string = DEFAULT_ENDPOINT): { fetchBase: string; upstreamBase: string } {
  const raw = (endpoint || DEFAULT_ENDPOINT).trim().replace(/\/+$/, '');
  const upstreamBase = /\/v1$/i.test(raw) ? raw : `${raw}/v1`;

  let isLmStudioLocal: boolean;
  try {
    const u = new URL(upstreamBase);
    isLmStudioLocal = (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '1234';
  } catch {
    isLmStudioLocal = false;
  }

  return {
    fetchBase: isLmStudioLocal ? '/lmstudio/v1' : upstreamBase,
    upstreamBase
  };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// throw된 fetch 에러를 종류로 분류 (timeout vs 서버 off)
function classifyThrownError(err: unknown): { kind: LmsErrorKind; message: string } {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', message: 'LM Studio model response timeout' };
  }
  // TypeError(Failed to fetch) = 서버 off / 거부 / CORS
  return { kind: 'server_off', message: 'LM Studio server off or unreachable (connection refused)' };
}

/**
 * LM Studio의 모델 목록을 가져옵니다.  GET {base}/models
 */
export async function getModels(
  endpoint: string = DEFAULT_ENDPOINT
): Promise<{ success: boolean; data?: LMSModel[]; error?: string; errorKind?: LmsErrorKind; debug: LmsCallDebug }> {
  const { fetchBase, upstreamBase } = resolveLmsBase(endpoint);
  const finalUrl = `${fetchBase}/models`;
  const upstreamUrl = `${upstreamBase}/models`;
  const debug: LmsCallDebug = { method: 'GET', finalUrl, upstreamUrl };

  try {
    const response = await fetchWithTimeout(finalUrl, { method: 'GET', headers: { Accept: 'application/json' } }, MODELS_TIMEOUT_MS);
    debug.status = response.status;

    if (!response.ok) {
      const kind: LmsErrorKind = response.status === 404 ? 'endpoint_not_found' : 'bad_response';
      return { success: false, error: `HTTP ${response.status}`, errorKind: kind, debug };
    }

    const json = (await response.json()) as LMSModelsResponse;
    debug.objectType = json.object;
    return { success: true, data: json.data || [], debug };
  } catch (err: unknown) {
    const { kind, message } = classifyThrownError(err);
    return { success: false, error: message, errorKind: kind, debug };
  }
}

/**
 * LM Studio에 채팅 완성을 요청합니다.  POST {base}/chat/completions
 * 성공 기준: HTTP 200 && content 존재. (object 검증은 호출측에서 debug.objectType로 수행)
 */
export async function getChatCompletion(
  messages: Array<{ role: string; content: string }>,
  modelId: string,
  endpoint: string = DEFAULT_ENDPOINT
): Promise<{
  success: boolean;
  content?: string;
  latency?: number;
  error?: string;
  errorKind?: LmsErrorKind;
  debug: LmsCallDebug;
}> {
  const startTime = Date.now();
  const { fetchBase, upstreamBase } = resolveLmsBase(endpoint);
  const finalUrl = `${fetchBase}/chat/completions`;
  const upstreamUrl = `${upstreamBase}/chat/completions`;
  const debug: LmsCallDebug = { method: 'POST', finalUrl, upstreamUrl };

  try {
    const response = await fetchWithTimeout(finalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model: modelId, messages, temperature: 0.7 })
    }, CHAT_TIMEOUT_MS);
    debug.status = response.status;

    if (!response.ok) {
      // 본문에서 모델 불일치 여부 판별 (프롬프트는 로그하지 않음)
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '';
      }
      const mentionsModel = /model/i.test(bodyText) && /(not\s*found|not\s*loaded|no\s*model|unknown)/i.test(bodyText);
      let kind: LmsErrorKind;
      if (mentionsModel) {
        kind = 'model_not_found';
      } else if (response.status === 404) {
        kind = 'endpoint_not_found';
      } else {
        kind = 'bad_response';
      }
      return { success: false, error: `HTTP ${response.status}`, errorKind: kind, debug };
    }

    const json = (await response.json()) as LMSChatCompletionResponse;
    debug.objectType = json.object;
    const content = json.choices?.[0]?.message?.content || '';
    const latency = Date.now() - startTime;

    if (!content) {
      return { success: false, error: 'Empty completion content', errorKind: 'bad_response', latency, debug };
    }

    return { success: true, content, latency, debug };
  } catch (err: unknown) {
    const { kind, message } = classifyThrownError(err);
    return { success: false, error: message, errorKind: kind, debug };
  }
}
