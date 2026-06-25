// AI Cloud Provider 서버 호출 로직 (OpenAI / Gemini / Claude)
//
// 이 모듈은 route(api/ai/chat.ts)와 vite dev 미들웨어 양쪽에서 재사용된다.
// 보안 원칙:
//   - apiKey는 요청 단위로만 사용한다. 저장하지 않는다.
//   - apiKey를 console.log 등으로 절대 출력하지 않는다.
//   - 응답/에러 메시지에 apiKey를 포함하지 않는다.
// (import 없는 self-contained 모듈 — global fetch / AbortController 사용)

export type AiChatProviderId = 'openai_api' | 'gemini_api' | 'claude_api';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatServerRequest {
  providerId: AiChatProviderId;
  apiKey: string;
  modelId: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  purpose?: 'connection_test' | 'chat_playground' | 'agent_run';
}

export type AiChatServerErrorKind =
  | 'missing_key'
  | 'invalid_key'
  | 'model_not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'timeout'
  | 'bad_response'
  | 'provider_error'
  | 'unknown';

export interface AiChatServerResponse {
  ok: boolean;
  providerId: string;
  modelId?: string;
  content?: string;
  latencyMs?: number;
  errorKind?: AiChatServerErrorKind;
  errorMessage?: string;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 1024;

const fail = (
  providerId: string,
  modelId: string,
  errorKind: AiChatServerErrorKind,
  errorMessage: string,
  latencyMs?: number
): AiChatServerResponse => ({ ok: false, providerId, modelId, errorKind, errorMessage, latencyMs });

// HTTP status → errorKind (응답 본문 내용은 키 노출 위험이 있으므로 사용하지 않는다)
//  401/403 → 키 문제, 404 → 모델 이름 문제(provider가 모델 미존재 시 404),
//  429 → 한도/쿼터, 그 외 → 일반 provider 오류
const statusToErrorKind = (status: number): AiChatServerErrorKind => {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';
  return 'provider_error';
};

const isAbort = (err: unknown): boolean =>
  err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');

async function fetchJson(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
  timeoutMs: number
): Promise<{ status: number; json: unknown } | { aborted: true } | { networkError: true }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (err) {
    if (isAbort(err)) return { aborted: true };
    return { networkError: true };
  } finally {
    clearTimeout(id);
  }
}

// --- OpenAI (Chat Completions) ---
async function callOpenAI(req: AiChatServerRequest, timeoutMs: number): Promise<AiChatServerResponse> {
  const start = Date.now();
  const result = await fetchJson(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify({
        model: req.modelId,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    },
    timeoutMs
  );
  const latencyMs = Date.now() - start;
  if ('aborted' in result) return fail(req.providerId, req.modelId, 'timeout', '응답 시간이 초과되었습니다.', latencyMs);
  if ('networkError' in result) return fail(req.providerId, req.modelId, 'provider_error', '네트워크 오류가 발생했습니다.', latencyMs);

  if (result.status >= 400) {
    return fail(req.providerId, req.modelId, statusToErrorKind(result.status), `OpenAI 오류 (status ${result.status})`, latencyMs);
  }
  const body = result.json as { choices?: { message?: { content?: string } }[] } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) return fail(req.providerId, req.modelId, 'bad_response', '응답 내용을 받지 못했습니다.', latencyMs);
  return { ok: true, providerId: req.providerId, modelId: req.modelId, content, latencyMs };
}

// --- Gemini (generateContent) ---
async function callGemini(req: AiChatServerRequest, timeoutMs: number): Promise<AiChatServerResponse> {
  const start = Date.now();
  const systemText = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n').trim();
  const contents = req.messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.modelId)}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const reqBody: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: req.temperature ?? 0.7, maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS }
  };
  if (systemText) reqBody.systemInstruction = { parts: [{ text: systemText }] };

  const result = await fetchJson(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) },
    timeoutMs
  );
  const latencyMs = Date.now() - start;
  if ('aborted' in result) return fail(req.providerId, req.modelId, 'timeout', '응답 시간이 초과되었습니다.', latencyMs);
  if ('networkError' in result) return fail(req.providerId, req.modelId, 'provider_error', '네트워크 오류가 발생했습니다.', latencyMs);

  if (result.status >= 400) {
    // Gemini는 quota 초과도 429로 내려오는 경우가 많다. status 기반으로만 분류.
    const kind = result.status === 429 ? 'quota_exceeded' : statusToErrorKind(result.status);
    return fail(req.providerId, req.modelId, kind, `Gemini 오류 (status ${result.status})`, latencyMs);
  }
  const body = result.json as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const content = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!content) return fail(req.providerId, req.modelId, 'bad_response', '응답 내용을 받지 못했습니다.', latencyMs);
  return { ok: true, providerId: req.providerId, modelId: req.modelId, content, latencyMs };
}

// --- Claude (Anthropic Messages) ---
async function callClaude(req: AiChatServerRequest, timeoutMs: number): Promise<AiChatServerResponse> {
  const start = Date.now();
  const systemText = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n').trim();
  const messages = req.messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const reqBody: Record<string, unknown> = {
    model: req.modelId,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: req.temperature ?? 0.7,
    messages
  };
  if (systemText) reqBody.system = systemText;

  const result = await fetchJson(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(reqBody)
    },
    timeoutMs
  );
  const latencyMs = Date.now() - start;
  if ('aborted' in result) return fail(req.providerId, req.modelId, 'timeout', '응답 시간이 초과되었습니다.', latencyMs);
  if ('networkError' in result) return fail(req.providerId, req.modelId, 'provider_error', '네트워크 오류가 발생했습니다.', latencyMs);

  if (result.status >= 400) {
    return fail(req.providerId, req.modelId, statusToErrorKind(result.status), `Claude 오류 (status ${result.status})`, latencyMs);
  }
  const body = result.json as { content?: { text?: string }[] } | null;
  const content = body?.content?.map(c => c.text || '').join('').trim();
  if (!content) return fail(req.providerId, req.modelId, 'bad_response', '응답 내용을 받지 못했습니다.', latencyMs);
  return { ok: true, providerId: req.providerId, modelId: req.modelId, content, latencyMs };
}

/**
 * cloud provider chat 공통 진입점. apiKey는 요청 단위로만 사용/미저장.
 */
export async function handleAiChat(req: AiChatServerRequest): Promise<AiChatServerResponse> {
  const providerId = req?.providerId;
  const modelId = req?.modelId || '';

  if (!req || !providerId) return fail(providerId || 'unknown', modelId, 'unknown', '잘못된 요청입니다.');
  if (!req.apiKey) return fail(providerId, modelId, 'missing_key', '연결 키를 먼저 붙여넣어 주세요.');
  if (!modelId) return fail(providerId, modelId, 'bad_response', '사용할 모델을 선택해 주세요.');
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return fail(providerId, modelId, 'bad_response', '보낼 메시지가 없습니다.');
  }

  const timeoutMs = DEFAULT_TIMEOUT_MS;
  switch (providerId) {
    case 'openai_api':
      return callOpenAI(req, timeoutMs);
    case 'gemini_api':
      return callGemini(req, timeoutMs);
    case 'claude_api':
      return callClaude(req, timeoutMs);
    default:
      return fail(providerId, modelId, 'unknown', '지원하지 않는 provider 입니다.');
  }
}
