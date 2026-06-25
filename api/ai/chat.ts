// POST /api/ai/chat
// cloud provider(OpenAI/Gemini/Claude) chat 프록시.
// 브라우저가 사용자가 입력한 연결 키를 body로 전달하면, 이 요청에서만 사용하고
// 저장/로그/응답 노출을 하지 않는다. (handleAiChat 내부도 동일 원칙)

import type { IncomingMessage } from 'http';
import type { VercelResponse } from '../_shared/proxyResponse.js';
import { handleAiChat } from '../_shared/aiProviderServer.js';
import type { AiChatServerRequest } from '../_shared/aiProviderServer.js';

interface ExtendedRequest extends IncomingMessage {
  body?: Partial<AiChatServerRequest>;
}

export default async function handler(req: ExtendedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, providerId: 'unknown', errorKind: 'unknown', errorMessage: 'POST 요청만 허용됩니다.' });
    return;
  }

  const body = (req.body || {}) as Partial<AiChatServerRequest>;
  const result = await handleAiChat({
    providerId: body.providerId as AiChatServerRequest['providerId'],
    apiKey: body.apiKey || '',
    modelId: body.modelId || '',
    messages: Array.isArray(body.messages) ? body.messages : [],
    temperature: body.temperature,
    maxTokens: body.maxTokens,
    purpose: body.purpose
  });

  // 결과에는 apiKey가 포함되지 않는다(handleAiChat가 보장).
  res.status(result.ok ? 200 : 200).json(result);
}
