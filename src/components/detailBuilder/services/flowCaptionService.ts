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

// 태그된 응답에서 [1]..[n] 항목을 추출.
const parseNumbered = (text: string, n: number): string[] => {
  const out: string[] = [];
  for (let k = 1; k <= n; k++) {
    const re = new RegExp(`\\[\\s*${k}\\s*\\]([\\s\\S]*?)(?=\\[\\s*${k + 1}\\s*\\]|$)`);
    const m = text.match(re);
    out.push(m ? cleanCaption(m[1]) : '');
  }
  return out;
};

export interface CaptionProgress { done: number; total: number; phase: string }

// ── 가벼운 리라이트(주력): 원본 설명 텍스트를 '분량·팩트 유지, 표현만 변주'로 다시 씀 ──
//   VLM 안 씀(이미지 안 봄) · 제품당 배치(청크)로 Gemma 1~N콜 = 빠름 · 옵션/스펙 정확성 보존.
const REWRITE_SYSTEM =
  '당신은 성인용품 쇼핑몰의 카피라이터입니다. 아래 원본 설명들을 각각 리라이트하세요.\n' +
  '[규칙]\n' +
  '1. 의미와 분량을 원본과 비슷하게 유지(요약·확장 금지, 원본 길이 ±20% 이내).\n' +
  '2. 숫자·사이즈·무게·옵션명·재질·기능 등 팩트는 절대 바꾸지 말 것(원본 그대로 유지).\n' +
  '3. 어휘·표현·문장 흐름만 자연스럽게 바꿔 원본과 달라 보이게(표절 느낌 제거). 과장·허위 금지.\n' +
  '4. 각 항목에서 가장 중요한 소구 문구 1곳만 ##문구## 로 감쌀 것.\n' +
  '5. 출력은 각 항목을 [번호] 태그로 시작. 캡션 본문만(머리말·설명·따옴표 금지).';

const CHUNK = 10; // 한 번에 리라이트할 캡션 수(토큰 안전)

export const rewriteFlowCaptions = async (
  data: ProductData,
  blocks: FlowBlock[],
  onProgress?: (p: CaptionProgress) => void,
): Promise<FlowBlock[]> => {
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) {
    throw new Error('디자인팀 AI가 연결되어 있지 않습니다.\nAI 직원 설정에서 디자인팀 AI(로컬 언센서드)를 먼저 연결해주세요.');
  }
  const out = blocks.map((b) => ({ ...b }));
  const targets = out.map((b, i) => ({ b, i })).filter((x) => (x.b.caption || '').trim());
  if (!targets.length) {
    throw new Error('리라이트할 원본 설명 텍스트가 없습니다. (원본 설명이 있는 상품에서 동작 — 통이미지형은 캡션 생성이 필요합니다)');
  }

  for (let c = 0; c < targets.length; c += CHUNK) {
    const chunk = targets.slice(c, c + CHUNK);
    onProgress?.({ done: c, total: targets.length, phase: '리라이트' });
    const userPrompt =
      `상품명: ${data.productNameKr || ''} / 브랜드: ${data.brandName || ''}\n` +
      `아래 원본들을 규칙대로 리라이트해 주세요.\n\n` +
      chunk.map((x, j) => `[${j + 1}] 원본: ${x.b.caption}`).join('\n') +
      `\n\n각 항목을 [1] [2] … 태그로 리라이트만 출력하세요.`;
    try {
      const res = await chatWithProvider({
        providerId: brain.providerId,
        modelIdOverride: brain.modelId || undefined,
        purpose: 'agent_run',
        temperature: 0.6,
        maxTokens: 2200,
        messages: [{ role: 'system', content: REWRITE_SYSTEM }, { role: 'user', content: userPrompt }],
      });
      if (res.ok && res.content) {
        const parsed = parseNumbered(res.content, chunk.length);
        chunk.forEach((x, j) => { if (parsed[j]) out[x.i].caption = parsed[j]; });
      }
    } catch { /* 청크 실패는 원본 유지 */ }
  }
  onProgress?.({ done: targets.length, total: targets.length, phase: '완료' });
  return out;
};

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
