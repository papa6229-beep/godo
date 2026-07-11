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

// ── VLM 섬네일 선택 — 후보 컷들 중 대표 섬네일로 최적을 우선순위대로 고름(제품당 1콜) ──
//   우선순위(사장님): 패키지+제품 › 제품(패키지일부) › 패키지단독 › 제품단독. 부적합=마케팅/내부컷/도표.
const THUMB_PROMPT =
  '아래 이미지들은 한 상품 상세페이지에서 뽑은 섬네일 후보입니다. 쇼핑몰 목록에 걸 대표 섬네일로 가장 적합한 하나를 고르세요.\n' +
  '[우선순위] 1)패키지 상자+제품 함께 깔끔한 컷 2)제품 잘 나오고 패키지 일부 보임 3)패키지 단독 4)제품 단독\n' +
  '[부적합] 마케팅/캐릭터 일러스트, 내부구조 클로즈업, 사용법 도표, 텍스트 위주\n' +
  '가장 적합한 후보의 번호만 숫자로 답하세요. 적합한 게 없으면 0.';

// 반환: { hadVLM, index }  index>=0 선택 · -1 없음(이슈) · hadVLM=false면 VLM 미탑재(폴백 필요)
export const pickBestThumbnailVLM = async (
  candidates: string[],
  maxCandidates = 10,
): Promise<{ hadVLM: boolean; index: number }> => {
  const modelsRes = await getModels();
  const vlm = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
  if (!vlm) return { hadVLM: false, index: -1 };
  const cap = candidates.slice(0, maxCandidates);
  const small = await Promise.all(cap.map((c) => downscaleDataUrl(c, 320, 0.8)));
  const content: any[] = [{ type: 'text', text: THUMB_PROMPT }];
  small.forEach((s, i) => { content.push({ type: 'text', text: `[${i + 1}]` }, { type: 'image_url', image_url: { url: s } }); });
  const res = await getChatCompletion([{ role: 'user', content }], vlm, undefined, { temperature: 0.1, maxTokens: 16 });
  if (!res.success || !res.content) return { hadVLM: true, index: -1 };
  const m = res.content.match(/\d+/);
  const num = m ? parseInt(m[0], 10) : 0;
  return { hadVLM: true, index: num >= 1 && num <= cap.length ? num - 1 : -1 };
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

  // 청크로 나눠 '동시'에 요청 — LM Studio가 병렬(continuous batching) 지원 시 단축, 순차 모드면 그대로.
  const chunks: Array<typeof targets> = [];
  for (let c = 0; c < targets.length; c += CHUNK) chunks.push(targets.slice(c, c + CHUNK));
  let done = 0;
  await Promise.all(
    chunks.map(async (chunk) => {
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
      done += chunk.length;
      onProgress?.({ done, total: targets.length, phase: '리라이트' });
    }),
  );
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

// ════════════════════════════════════════════════════════════════════════
// B(변환기 판단 지능) — 기본형→고도몰 섹션형 변환에서 쓰는 재사용 함수.
//   PoC(test/_gen_poc2.py)에서 실증된 로직의 앱 이식. 하드코딩 순서/스왑 금지 = 내용으로 판단.
// ════════════════════════════════════════════════════════════════════════

// ── baked 기본형: 원본 설명이 픽셀에 박혀 없음 → 각 이미지에 VLM 묘사→Gemma 캡션 생성(이미지와 정렬됨) ──
export const generateCaptionsForImages = async (
  images: string[],
  ctx: { productNameKr?: string; brandName?: string; headerText?: string } = {},
): Promise<string[]> => {
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) return images.map(() => '');
  const modelsRes = await getModels();
  const vlm = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
  const pseudoData = { productNameKr: ctx.productNameKr || '', brandName: ctx.brandName || '', flowHeaderText: ctx.headerText || '' } as ProductData;
  const out: string[] = [];
  for (const img of images) {
    try {
      const desc = vlm ? await describeImage(img, vlm) : '';
      out.push(await writeCaption(brain, pseudoData, desc));
    } catch { out.push(''); }
  }
  return out;
};

// ── ⓪ 밴드 역할 자동분류(추출 지능): VLM이 각 이미지를 고도몰 슬롯 역할로 분류 ──
//    PoC(test/_b_roles_poc.py)에서 검증된 정제 프롬프트. 핵심: PACKAGE(박스, 제품사진 인쇄돼 있어도) vs ACCESSORY(낱개 제품+리모컨) 구분.
export type BandRole = 'MAIN' | 'ACCESSORY' | 'CABLE' | 'CONTROL' | 'SIZE' | 'PACKAGE' | 'HEADING' | 'OTHER';
const BAND_ROLES: BandRole[] = ['MAIN', 'ACCESSORY', 'CABLE', 'CONTROL', 'SIZE', 'PACKAGE', 'HEADING', 'OTHER'];
const ROLE_PROMPT =
  'Classify this ONE cut from an adult-product detail page into exactly one ROLE:\n' +
  'PACKAGE = a rectangular retail BOX/carton (box edges/corners and printed branding text visible). This wins even if a product photo is printed on the box front.\n' +
  'ACCESSORY = a loose product photographed together with a separate handheld remote (NOT a box)\n' +
  'MAIN = a clean single product cutout on plain white, no box, no annotations\n' +
  'CABLE = a charging/USB cable is the main subject\n' +
  'CONTROL = buttons/usage explained with callout lines or a hand pressing buttons\n' +
  'SIZE = a dimension diagram (measurement numbers/arrows like cm)\n' +
  'HEADING = a section-title banner: mostly text/graphic, little or no product\n' +
  'OTHER = marketing/illustration/text-only or none of the above\n' +
  'Answer strictly as: ROLE=<one label> | <=6 words why';

// 배치판(빠름·대량 변환용): 여러 이미지를 한 VLM 콜로 분류(직렬 N콜 → 1콜). 컨텍스트 과부하 방지로 chunk장씩.
const ROLE_BATCH_PROMPT =
  '여러 상세페이지 컷이 [1][2]… 라벨과 함께 주어집니다. 각 컷의 ROLE을 분류하세요.\n' +
  'PACKAGE=직사각 소매 박스(테두리/브랜딩, 제품사진 인쇄돼 있어도 우선) · ACCESSORY=박스 아닌 낱개 제품+리모컨 · ' +
  'MAIN=흰배경 단독 깨끗한 누끼(주석X) · CABLE=충전/USB 케이블 · CONTROL=버튼/조작 콜아웃·손 · SIZE=치수 도해(cm 숫자) · ' +
  'HEADING=텍스트 위주 섹션 제목 · OTHER=그 외.\n' +
  '각 컷마다 한 줄씩 "번호=ROLE"로만 출력(예: 1=MAIN). 다른 말 금지.';

export const classifyImageRolesBatch = async (images: string[], chunk = 12): Promise<BandRole[]> => {
  const roles: BandRole[] = images.map(() => 'OTHER' as BandRole);
  if (!images.length) return roles;
  const modelsRes = await getModels();
  const vlm = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
  if (!vlm) return roles;
  for (let start = 0; start < images.length; start += chunk) {
    const group = images.slice(start, start + chunk);
    const small = await Promise.all(group.map((c) => downscaleDataUrl(c, 384, 0.8)));
    const content: any[] = [{ type: 'text', text: ROLE_BATCH_PROMPT }];
    small.forEach((s, i) => { content.push({ type: 'text', text: `[${i + 1}]` }, { type: 'image_url', image_url: { url: s } }); });
    try {
      const res = await getChatCompletion([{ role: 'user', content }], vlm, undefined, { temperature: 0.1, maxTokens: 12 * group.length + 24 });
      const txt = res.success && res.content ? res.content : '';
      const re = /(\d+)\s*=\s*([A-Za-z]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const idx = parseInt(m[1], 10) - 1;
        let r = m[2].toUpperCase();
        if (r.startsWith('HEADING')) r = 'HEADING';
        if (idx >= 0 && idx < group.length && BAND_ROLES.includes(r as BandRole)) roles[start + idx] = r as BandRole;
      }
    } catch { /* 그룹 실패는 OTHER 유지 */ }
  }
  return roles;
};

// 각 이미지의 역할을 반환(images와 같은 길이). VLM 없거나 실패 시 'OTHER'.
export const classifyImageRoles = async (images: string[]): Promise<BandRole[]> => {
  const fallback = images.map(() => 'OTHER' as BandRole);
  if (!images.length) return fallback;
  const modelsRes = await getModels();
  const vlm = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
  if (!vlm) return fallback;
  const roles: BandRole[] = [];
  for (const img of images) {
    try {
      const small = await downscaleDataUrl(img);
      const res = await getChatCompletion(
        [{ role: 'user', content: [{ type: 'text', text: ROLE_PROMPT }, { type: 'image_url', image_url: { url: small } }] }],
        vlm, undefined, { temperature: 0.1, maxTokens: 50 },
      );
      const raw = res.success && res.content ? res.content : '';
      let r = (raw.match(/ROLE\s*=\s*([A-Z_]+)/i)?.[1] || 'OTHER').toUpperCase();
      if (r.startsWith('HEADING')) r = 'HEADING'; // VLM이 가끔 'HEADINGS' 반환
      roles.push((BAND_ROLES.includes(r as BandRole) ? r : 'OTHER') as BandRole);
    } catch { roles.push('OTHER'); }
  }
  return roles;
};

// ── ① 이미지↔슬롯 의미 매칭: VLM이 각 컷을 실제 관찰 → 판정기(Gemma)가 문구 의도에 1:1 배정 ──
//    반환: slotTexts와 같은 길이 배열, 각 원소 = 배정된 images 인덱스(없으면 -1). 밴드 순서를 신뢰하지 않음.
const MATCH_VISION_PROMPT =
  'You are analyzing one cut from a product detail page. List ONLY the distinct physical objects actually visible, ' +
  'as a short comma-separated list. Then answer exactly, each on its own line: ' +
  'REMOTE=yes/no (a separate handheld remote controller), CABLE=yes/no (a charging/USB cable), ' +
  'BUTTONS=yes/no (control buttons shown/annotated), HAND=yes/no (a human hand holding it). Be strictly factual, no guessing.';

export const matchImagesToSlots = async (images: string[], slotTexts: string[]): Promise<number[]> => {
  const fallback = slotTexts.map((_, i) => (i < images.length ? i : -1)); // 순서대로(폴백)
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId) || images.length === 0 || slotTexts.length === 0) return fallback;
  const modelsRes = await getModels();
  const vlm = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
  if (!vlm) return fallback;
  // 1) VLM 관찰(익명 컷 A/B/…)
  const labels = images.map((_, i) => String.fromCharCode(65 + i));
  const descs: string[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const small = await downscaleDataUrl(images[i]);
      const res = await getChatCompletion(
        [{ role: 'user', content: [{ type: 'text', text: MATCH_VISION_PROMPT }, { type: 'image_url', image_url: { url: small } }] }],
        vlm, undefined, { temperature: 0.1, maxTokens: 140 },
      );
      descs.push(res.success && res.content ? res.content.trim() : '');
    } catch { descs.push(''); }
  }
  // 2) 판정기(Gemma)가 문구 의도 ↔ 컷 내용으로 배정
  const judgeSys =
    '당신은 상세페이지 편집자입니다. 각 문구에 "내용상 가장 맞는" 이미지를 1:1로 배정하세요. ' +
    '문구가 리모컨을 말하면 REMOTE=yes 컷을, 충전/케이블을 말하면 CABLE=yes 컷을, 버튼 조작을 말하면 BUTTONS=yes 컷을 고릅니다. ' +
    '각 컷은 한 문구에만. 반드시 JSON만 출력: {"0":"컷키", ...} (키=문구 인덱스, 값=컷 키 A/B/…).';
  const judgeUser =
    '[이미지 컷 관찰]\n' + descs.map((d, i) => `컷 ${labels[i]}: ${d}`).join('\n') +
    '\n\n[배정할 문구]\n' + slotTexts.map((t, i) => `문구 ${i}: ${t}`).join('\n') +
    '\n\nJSON으로만 배정.';
  const result = await chatWithProvider({
    providerId: brain.providerId, modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run', temperature: 0.1, maxTokens: 120,
    messages: [{ role: 'system', content: judgeSys }, { role: 'user', content: judgeUser }],
  });
  if (!result.ok || !result.content) return fallback;
  const m = result.content.match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(m[0]); } catch { return fallback; }
  const assign = slotTexts.map(() => -1);
  const used = new Set<number>();
  for (const [sk, ck] of Object.entries(raw)) {
    const si = parseInt(String(sk).match(/\d+/)?.[0] ?? '', 10);
    const cm = String(ck).match(/[A-Za-z]/)?.[0]?.toUpperCase();
    if (!Number.isNaN(si) && si >= 0 && si < assign.length && cm) {
      const ci = cm.charCodeAt(0) - 65;
      if (ci >= 0 && ci < images.length && !used.has(ci)) { assign[si] = ci; used.add(ci); }
    }
  }
  // 배정 누락 슬롯은 남은 이미지 순서대로 채움
  for (let i = 0; i < assign.length; i++) {
    if (assign[i] < 0) {
      for (let ci = 0; ci < images.length; ci++) { if (!used.has(ci)) { assign[i] = ci; used.add(ci); break; } }
    }
  }
  return assign;
};

// ── ② 의미 단위 줄바꿈: 글자는 그대로, \n 위치만 판단(상품명=고유명/분류 경계, 설명=완결 의미덩어리) ──
//    안전장치: 공백 제거 후 원문과 일치할 때만 채택(AI가 글자를 변조하면 원문 유지).
const stripWs = (s: string) => (s || '').replace(/\s+/g, '');
export const lineBreakForLayout = async (
  name: string, captions: string[],
): Promise<{ name: string; captions: string[] }> => {
  const fallback = { name, captions };
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) return fallback;
  const sys =
    '당신은 상세페이지 조판 편집자입니다. 주어진 제목과 설명들에 "의미 단위" 줄바꿈만 넣습니다.\n' +
    '[철칙] 글자·단어·문장부호는 절대 바꾸지 말 것. 오직 줄바꿈(\\n) 위치만 결정.\n' +
    '[상품명] 제품 고유명과 분류(용도)의 경계에서 2줄로. 예: "핑거 위글 전립선 마사져" → "핑거 위글"+"전립선 마사져".\n' +
    '[설명] 각 줄이 완결된 의미 덩어리(조사·서술어가 어색하게 잘리지 않게), 한 줄 대략 12~24자, 2~4줄 권장.\n' +
    '반드시 JSON만 출력: {"name":"...\\n...","caps":["...\\n...", ...]}';
  const usr = `제목: ${name}\n설명들:\n` + captions.map((c, i) => `[${i}] ${c}`).join('\n') + '\n\n줄바꿈(\\n)만 넣어 JSON으로 출력.';
  const res = await chatWithProvider({
    providerId: brain.providerId, modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run', temperature: 0.2, maxTokens: 800,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
  });
  if (!res.ok || !res.content) return fallback;
  const m = res.content.match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  try {
    const obj = JSON.parse(m[0]) as { name?: unknown; caps?: unknown };
    const nm = typeof obj.name === 'string' && stripWs(obj.name) === stripWs(name) ? obj.name : name;
    const caps = captions.map((c, i) => {
      const v = Array.isArray(obj.caps) ? obj.caps[i] : undefined;
      return typeof v === 'string' && stripWs(v) === stripWs(c) ? v : c;
    });
    return { name: nm, captions: caps };
  } catch { return fallback; }
};
