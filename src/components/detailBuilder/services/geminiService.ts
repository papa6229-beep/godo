// 상세페이지 문구 생성 — 하이브리드(로컬 VLM 이미지 묘사 → 로컬 무검열 카피).
//  · 카피: GODO 어댑터(chatWithProvider) — 디자인팀 AI(로컬 무검열 Super Gemma 권장).
//  · 이미지 묘사(vision): 디자인 두뇌가 local_lmstudio일 때, 로드된 VLM(Qwen2.5-VL 등)을
//    lmsConnector로 직접 호출해 "형태·색·재질"을 영어로 묘사 → 카피 프롬프트에 주입.
//    (검열 클라우드/텍스트 전용 모델은 이미지를 못 보므로, 형태가 셀링포인트인 상품 대응)
//  · 실측 근거(2026-07): abliterated VLM은 ①대용량 이미지를 400으로 거부 → 전송 전 다운스케일,
//    ②장문에서 헛소리 루프 → max_tokens 타이트. VLM=영어 묘사, Super Gemma=한국어 카피로 역할 분리.
import type { ProductData } from "../types";
import { resolveAgentBrain, isBrainConnected } from "../../../services/aiBrainSettings";
import { chatWithProvider } from "../../../services/aiProviderAdapter";
import { getModels, getChatCompletion } from "../../../services/lmsConnector";

// 섹션 태그 → ProductData 이미지 필드 매핑 (해당 섹션의 실제 사진을 vision으로 묘사)
const SLOT_IMAGE_FIELD: Record<string, keyof ProductData> = {
  "[FEATURE]": "featureImage",
  "[KEYIMG]": "featureImage", // [고도몰] KEY FEATURE 좌측 이미지(vision 참고용, 구조태그 아님)
  "[POINT1_1]": "point1Image1",
  "[POINT1_2]": "point1Image2",
  "[POINT1_3]": "point1Image3",
  "[POINT2_1]": "point2Image1",
  "[POINT2_2]": "point2Image2",
  "[POINT2_3]": "point2Image3",
};

// 로드된 모델 중 vision(이미지 인식) 모델을 감지 (특정 모델명 하드코딩 금지).
const VISION_KEYWORDS = ["vl", "vision", "qwen", "minicpm", "llava", "internvl", "cogvlm", "moondream"];
const EMBED_KEYWORDS = ["embed", "embedding", "bge", "nomic"];
const detectVisionModelId = (models: { id: string }[]): string | undefined => {
  const m = models.find((x) => {
    const id = x.id.toLowerCase();
    if (EMBED_KEYWORDS.some((k) => id.includes(k))) return false;
    return VISION_KEYWORDS.some((k) => id.includes(k));
  });
  return m?.id;
};

// data URL 이미지를 브라우저 캔버스로 다운스케일 (LM Studio 400 회피 + 속도).
// 실패/비브라우저/이미 작은 이미지는 원본을 그대로 반환한다.
const downscaleDataUrl = (dataUrl: string, maxPx = 1024, quality = 0.85): Promise<string> =>
  new Promise((resolve) => {
    if (typeof document === "undefined" || !dataUrl.startsWith("data:image")) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const { width: w, height: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      if (scale >= 1) return resolve(dataUrl); // 이미 충분히 작음
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

// VLM으로 이미지 1장을 "형태·색·재질" 중심으로 묘사(영어). 실패 시 '' 반환(카피는 계속 진행).
const VISION_PROMPT =
  "Describe this product in 2-3 sentences: overall shape, any anatomical resemblance, color, material, and surface texture. Be direct and factual. Do not add sources, metadata, or commentary.";
const describeImage = async (dataUrl: string, visionModelId: string): Promise<string> => {
  const small = await downscaleDataUrl(dataUrl);
  const res = await getChatCompletion(
    [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: small } },
        ],
      },
    ],
    visionModelId,
    undefined,
    { temperature: 0.2, maxTokens: 160 }
  );
  return res.success && res.content ? res.content.trim() : "";
};

// 각 활성 섹션의 이미지를 순차로 묘사(LM Studio는 요청을 순차 처리)해 카피 프롬프트용 가이드 문자열을 만든다.
// 로컬 두뇌 + VLM 감지 시에만 동작하며, 어떤 실패도 조용히 무시하고 '' 를 반환한다(텍스트 기반 폴백).
const buildVisionGuide = async (data: ProductData, activeSlots: string[]): Promise<string> => {
  try {
    const modelsRes = await getModels();
    const visionModelId = modelsRes.success ? detectVisionModelId(modelsRes.data || []) : undefined;
    if (!visionModelId) return "";

    const lines: string[] = [];
    for (const slot of activeSlots) {
      const field = SLOT_IMAGE_FIELD[slot];
      const img = field ? (data[field] as string | null | undefined) : null;
      if (!img) continue;
      const desc = await describeImage(img, visionModelId);
      if (desc) lines.push(`${slot} 이미지: ${desc}`);
    }
    if (!lines.length) return "";

    return (
      `\n\n[이미지 분석 — 각 섹션 실제 사진의 형태/외관 관찰(영문)]\n` +
      lines.join("\n") +
      `\n(위 형태 관찰을 문구에 자연스럽게 반영하세요. 특히 제품의 형태·모양 자체가 특징이면 그 점을 살려 표현하세요.)`
    );
  } catch {
    return "";
  }
};

export const generateCopywriting = async (
  data: ProductData
): Promise<Partial<ProductData>> => {
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) {
    throw new Error('디자인팀 AI가 연결되어 있지 않습니다.\nAI 직원 설정에서 디자인팀 AI(로컬 언센서드 권장)를 먼저 연결해주세요.');
  }

  // [고도몰] KEY FEATURE 3블록: 사용자가 메인특징(title)을 넣었으면 그 항목별 설명을 생성.
  const kf = Array.isArray(data.keyFeatures) ? data.keyFeatures : [];
  const keyIdxs = [0, 1, 2].filter((i) => (kf[i]?.title || "").trim());
  const useKeyFeatures = keyIdxs.length > 0;

  // 어떤 섹션 문구를 생성할지(입력된 이미지/설명 유무로 판단).
  const activeSlots: string[] = [];
  let structureGuide = "";
  if (useKeyFeatures) {
    keyIdxs.forEach((i) => {
      const tag = `[KEY${i + 1}]`;
      activeSlots.push(tag);
      structureGuide += `${tag}\n(핵심특징 "${kf[i].title.trim()}"에 대한 4~5줄 설명)\n`;
    });
  } else {
    activeSlots.push("[FEATURE]");
    structureGuide += `[FEATURE]\n(메인 특징 요약)\n`;
  }
  activeSlots.push("[POINT1_1]");
  structureGuide += `[POINT1_1]\n(포인트1-1 설명)\n`;
  const addSlot = (tag: string, guide: string, has: unknown) => { if (has) { activeSlots.push(tag); structureGuide += guide; } };
  addSlot("[POINT1_2]", `[POINT1_2]\n(포인트1-2 설명)\n`, data.point1Image2 || data.aiPoint1Desc2);
  addSlot("[POINT1_3]", `[POINT1_3]\n(포인트1-3 설명)\n`, data.point1Image3 || data.aiPoint1Desc3);
  addSlot("[POINT2_1]", `[POINT2_1]\n(포인트2-1 설명)\n`, data.point2Image1 || data.aiPoint2Desc);
  addSlot("[POINT2_2]", `[POINT2_2]\n(포인트2-2 설명)\n`, (data as { point2Image2?: unknown }).point2Image2 || data.aiPoint2Desc2);
  addSlot("[POINT2_3]", `[POINT2_3]\n(포인트2-3 설명)\n`, (data as { point2Image3?: unknown }).point2Image3 || data.aiPoint2Desc3);

  // 하이브리드: 디자인 두뇌가 로컬(LM Studio)이면 로드된 VLM으로 각 섹션 이미지를 먼저 묘사.
  // 고도몰 모드에선 KEY FEATURE 좌측 이미지(featureImage)도 묘사에 포함.
  const visionSlots = useKeyFeatures ? ["[KEYIMG]", ...activeSlots] : activeSlots;
  const visionGuide = brain.providerId === 'local_lmstudio' ? await buildVisionGuide(data, visionSlots) : '';

  // 고도몰: 사용자가 지정한 핵심 특징 3가지 — AI가 반드시 반영할 핵심 참고자료.
  const keyFeatureRef = useKeyFeatures
    ? `\n\n[반드시 반영할 핵심 특징 — 사용자 지정]\n` +
      keyIdxs.map((i) => `${i + 1}. ${kf[i].title.trim()}`).join("\n") +
      `\n(각 [KEY#] 섹션은 해당 번호의 핵심 특징을 설명하는 문구여야 합니다.)`
    : "";

  const systemPrompt =
    `당신은 쇼핑몰의 수석 카피라이터입니다. 제공된 상품 스펙(요약정보)을 바탕으로 판매 실적을 높일 매혹적이고 설득력 있는 상세페이지 문구를 작성하세요.\n` +
    `⚠️ [작성 목표]\n` +
    `1. 각 섹션(태그)마다 반드시 4~5줄 분량으로 작성.\n` +
    `2. 단순 설명이 아니라 구매 욕구를 자극하는 감성적·구체적 표현.\n` +
    `3. 제공된 스펙(요약정보)을 문구에 자연스럽게 녹여 신뢰도를 더함.\n` +
    `4. 핵심 판매 소구점/중요 키워드는 반드시 ## 로 감쌈. (예: ##강력한 진동##)\n` +
    `5. [이미지 분석]이 제공되면, 각 섹션 사진의 실제 형태·외관을 문구에 반영. (형태 자체가 특징인 상품은 그 모양을 살려 표현)\n` +
    `[출력 구조 — 이 태그 구조를 엄수]\n${structureGuide}`;

  const userTextPrompt =
    `상품명: ${data.productNameKr || '(미입력)'}\n브랜드: ${data.brandName || ''}\n\n[핵심 스펙 및 요약 정보]\n` +
    `${Array.isArray(data.summaryInfo) ? (data.summaryInfo as unknown[]).join('\n') : JSON.stringify(data.summaryInfo, null, 1)}` +
    `${keyFeatureRef}${visionGuide}\n\n` +
    `위 스펙${visionGuide ? '과 이미지 분석' : ''}을 바탕으로 각 섹션(태그)에 4~5줄 분량의 상세페이지 문구를 써주세요.`;

  const result = await chatWithProvider({
    providerId: brain.providerId,
    modelIdOverride: brain.modelId || undefined,
    purpose: 'agent_run',
    temperature: 0.6,
    maxTokens: 1500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userTextPrompt }
    ]
  });
  if (!result.ok || !result.content) throw new Error(result.errorMessage || 'AI 문구 생성에 실패했습니다.');

  const text = result.content;
  const extract = (tag: string): string => {
    const regex = new RegExp(`\\${tag}([\\s\\S]*?)(\\[|$)`, 'i');
    const match = text.match(regex);
    return match ? formatDescription(match[1]) : "";
  };

  const out: Partial<ProductData> = {};
  if (useKeyFeatures) {
    // 고도몰: 항목별 설명을 keyFeatures[].desc로. title은 사용자 입력 유지.
    out.keyFeatures = [0, 1, 2].map((i) => ({
      title: kf[i]?.title || "",
      desc: keyIdxs.includes(i) ? extract(`[KEY${i + 1}]`) : (kf[i]?.desc || ""),
    }));
  } else {
    out.aiFeatureDesc = extract("[FEATURE]");
  }
  out.aiPoint1Desc = extract("[POINT1_1]");
  if (activeSlots.includes("[POINT1_2]")) out.aiPoint1Desc2 = extract("[POINT1_2]");
  if (activeSlots.includes("[POINT1_3]")) out.aiPoint1Desc3 = extract("[POINT1_3]");
  if (activeSlots.includes("[POINT2_1]")) out.aiPoint2Desc = extract("[POINT2_1]");
  if (activeSlots.includes("[POINT2_2]")) out.aiPoint2Desc2 = extract("[POINT2_2]");
  if (activeSlots.includes("[POINT2_3]")) out.aiPoint2Desc3 = extract("[POINT2_3]");
  return out;
};

const formatDescription = (text: string): string => {
  if (!text) return "";
  let result = text.trim().replace(/^[:：)\-]/, "").trim();
  result = result.replace(/\. /g, ".\n");
  ["또한", "그리고", "특히", "가장", "동시에"].forEach((word) => {
    result = result.replace(new RegExp(`\\s?${word}`, "g"), `\n${word}`);
  });
  return result;
};
