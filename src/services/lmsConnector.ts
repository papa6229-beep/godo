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

const DEFAULT_ENDPOINT = 'http://localhost:1234/v1';
const TIMEOUT_MS = 30000;

function getFetchEndpoint(endpoint: string): string {
  const clean = endpoint.replace(/\/+$/, '');
  if (clean === 'http://localhost:1234/v1' || clean === 'http://localhost:1234') {
    return '/lmstudio/v1';
  }
  return clean;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * LM Studio의 모델 목록을 가져옵니다.
 */
export async function getModels(endpoint: string = DEFAULT_ENDPOINT): Promise<{ success: boolean; data?: LMSModel[]; error?: string }> {
  try {
    const cleanEndpoint = getFetchEndpoint(endpoint);
    const url = `${cleanEndpoint}/models`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json() as LMSModelsResponse;
    return {
      success: true,
      data: json.data || []
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * LM Studio에 채팅 완성을 요청합니다.
 */
export async function getChatCompletion(
  messages: Array<{ role: string; content: string }>,
  modelId: string,
  endpoint: string = DEFAULT_ENDPOINT
): Promise<{ success: boolean; content?: string; latency?: number; error?: string }> {
  const startTime = Date.now();
  try {
    const cleanEndpoint = getFetchEndpoint(endpoint);
    const url = `${cleanEndpoint}/chat/completions`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json() as LMSChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content || '';
    const latency = Date.now() - startTime;

    return {
      success: true,
      content,
      latency
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
