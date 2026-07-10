// @ts-nocheck — 변환기(flow) 블록 캡션 AI 생성. 하이브리드: 로컬 VLM(Qwen2.5-VL)이 각 이미지를
//   형태/색/재질 중심으로 읽고(영문 팩트) → 로컬 무검열 Super Gemma가 차별화된 한글 캡션 작성.
//   원칙(사장님 확정, C-5): 팩트(사이즈·재질·기능)는 지어내지 않고, 표현/톤만 호기심 자극+이미지 합치.
//   VLM/Gemma 모두 로컬 LM Studio(127.0.0.1:1234) — dev(npm run dev)에서만 동작(배포엔 연결 불가).
import type { ProductData, FlowBlock } from '../types';
import { resolveAgentBrain, isBrainConnected } from '../../../services/aiBrainSettings';
import { chatWithProvider } from '../../../services/aiProviderAdapter';
import { getModels, getChatCompletion } from '../../../services/lmsConnector';

const VISION_KEYWORDS = ['vl', 'vision', 'qwen', 'minicpm', 'llava', 'internvl', 'cogvlm', 'moondream'];
const EMBED_KEYWORDS = ['embed', 'embedding', 'bge', 'nomic'];
const detectVisionModelId = (models: { id: string }[]): string | undefined => {
  const m = models.find((x) => {
    const id = x.id.toLowerCase();
    if (EMBED_KEYWORDS.some((k) => id.includes(k))) return false;
    return VISION_KEYWORDS.some((k) => id.includes(k));
  });
  return m?.id;
};

// data URL 이미지를 다운스케일(LM Studio 400 회피 + 속도). 비-data URL(원격)은 그대로 반환(LM Studio가 fetch).
const downscaleDataUrl = (src: string, maxPx = 1024, quality = 0.85): Promise<string> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !src.startsWith('data:image')) return resolve(src);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale >= 1) return resolve(src);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

// VLM으로 이미지 1장을 형태/색/재질 중심으로 묘사(영문, 팩트). 실패 시 '' 반환.
const VISION_PROMPT =
  'Describe this product photo in 2 sentences: what is shown, overall shape/anatomy resemblance, color, material, surface texture, and any visible size/scale cues. Be direct and factual. No commentary, no metadata.';
const describeImage = async (image: string, visionModelId: string): Promise<string> => {
  const small = await downscaleDataUrl(image);
  const res = await getChatCompletion(
    [{ role: 'user', content: [{ type: 'text', text: VISION_PROMPT }, { type: 'image_url', image_url: { url: small } }] }],
    visionModelId,
    undefined,
    { temperature: 0.2, maxTokens: 160 },
  );
  return res.success && res.content ? res.content.trim() : '';
};

// 출력 캡션 정리: 따옴표/머리말/메타 제거.
const cleanCaption = (t: string): string =>
  String(t || '')
    .replace(/^["'`\s:：)\-]+/, '')
    .replace(/["'`\s]+$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Gemma로 이미지 1장에 붙일 한글 캡션 작성.
const writeCaption = async (brain: any, data: ProductData, visionDesc: string): Promise<string> => {
  const ctx = (data.flowHeaderText || '').trim().slice(0, 400);
  const systemPrompt =
    '당신은 성인용품 쇼핑몰의 수석 카피라이터입니다. 상세페이지 이미지 한 장 아래에 들어갈 짧은 캡션을 씁니다.\n' +
    '[규칙]\n' +
    '1. 이 이미지에 실제로 보이는 것(형태·질감·각도·구조)에 근거해서 쓸 것.\n' +
    '2. 사이즈·재질·기능 같은 팩트는 지어내지 말 것(주어진 정보/이미지 관찰 범위 안에서만).\n' +
    '3. 표현과 톤은 구매 호기심을 자극하되 과장·허위 금지. 이미지와 문구가 반드시 합치.\n' +
    '4. 2~3줄, 각 줄은 짧고 감각적으로. 군더더기·머리말·따옴표·설명 없이 캡션 본문만 출력.';
  const userPrompt =
    `상품명: ${data.productNameKr || '(미입력)'}\n브랜드: ${data.brandName || ''}\n` +
    (ctx ? `제품 개요: ${ctx}\n` : '') +
    (visionDesc ? `이 이미지 분석(영문 관찰): ${visionDesc}\n` : '') +
    '\n위 이미지에 붙일 한글 캡션(2~3줄)만 써주세요.';
  const result = await chatWithProvider({
    providerId: brain.providerId,
    modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run',
    temperature: 0.75,
    maxTokens: 300,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
  });
  if (!result.ok || !result.content) return '';
  return cleanCaption(result.content);
};

export interface CaptionProgress { done: number; total: number; phase: string }

// 블록 각각에 대해 VLM 묘사 → Gemma 캡션 → block.caption 채움. onlyEmpty=true면 빈 캡션만 채움.
export const generateFlowCaptions = async (
  data: ProductData,
  blocks: FlowBlock[],
  onProgress?: (p: CaptionProgress) => void,
  onlyEmpty = true,
): Promise<FlowBlock[]> => {
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) {
    throw new Error('디자인팀 AI가 연결되어 있지 않습니다.\nAI 직원 설정에서 디자인팀 AI(로컬 언센서드)를 먼저 연결해주세요.');
  }
  const modelsRes = await getModels();
  const visionModelId = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;

  const out = blocks.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    if (onlyEmpty && (out[i].caption || '').trim()) continue;
    onProgress?.({ done: i, total: out.length, phase: '이미지 분석·문구 작성' });
    try {
      const desc = visionModelId ? await describeImage(out[i].image, visionModelId) : '';
      const caption = await writeCaption(brain, data, desc);
      if (caption) out[i].caption = caption;
    } catch { /* 개별 실패는 건너뜀(다음 블록 계속) */ }
  }
  onProgress?.({ done: out.length, total: out.length, phase: '완료' });
  return out;
};
