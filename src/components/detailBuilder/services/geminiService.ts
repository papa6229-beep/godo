// 상세페이지 문구 생성 — GODO provider(디자인팀 AI)로 라우팅.
//  · 죽은 OpenRouter 토큰 대신 GODO 어댑터(chatWithProvider) 재사용 → 로컬 무검열/클라우드 선택형.
//  · 성인상품은 클라우드가 거부하므로, AI 직원 설정에서 디자인팀 AI를 "로컬(언센서드)"로 연결해 사용.
//  · 1단계: 스펙(텍스트) 기반. 이미지 분석(vision)은 어댑터 멀티모달 확장 후(선택) 얹는다.
import type { ProductData } from "../types";
import { resolveAgentBrain, isBrainConnected } from "../../../services/aiBrainSettings";
import { chatWithProvider } from "../../../services/aiProviderAdapter";

export const generateCopywriting = async (
  data: ProductData
): Promise<Partial<ProductData>> => {
  const brain = resolveAgentBrain('design');
  if (!isBrainConnected(brain.providerId)) {
    throw new Error('디자인팀 AI가 연결되어 있지 않습니다.\nAI 직원 설정에서 디자인팀 AI(로컬 언센서드 권장)를 먼저 연결해주세요.');
  }

  // 어떤 섹션 문구를 생성할지(입력된 이미지/설명 유무로 판단).
  const activeSlots: string[] = ["[FEATURE]", "[POINT1_1]"];
  let structureGuide = `[FEATURE]\n(메인 특징 요약)\n[POINT1_1]\n(포인트1-1 설명)\n`;
  const addSlot = (tag: string, guide: string, has: unknown) => { if (has) { activeSlots.push(tag); structureGuide += guide; } };
  addSlot("[POINT1_2]", `[POINT1_2]\n(포인트1-2 설명)\n`, data.point1Image2 || data.aiPoint1Desc2);
  addSlot("[POINT1_3]", `[POINT1_3]\n(포인트1-3 설명)\n`, data.point1Image3 || data.aiPoint1Desc3);
  addSlot("[POINT2_1]", `[POINT2_1]\n(포인트2-1 설명)\n`, data.point2Image1 || data.aiPoint2Desc);
  addSlot("[POINT2_2]", `[POINT2_2]\n(포인트2-2 설명)\n`, (data as { point2Image2?: unknown }).point2Image2 || data.aiPoint2Desc2);
  addSlot("[POINT2_3]", `[POINT2_3]\n(포인트2-3 설명)\n`, (data as { point2Image3?: unknown }).point2Image3 || data.aiPoint2Desc3);

  const systemPrompt =
    `당신은 쇼핑몰의 수석 카피라이터입니다. 제공된 상품 스펙(요약정보)을 바탕으로 판매 실적을 높일 매혹적이고 설득력 있는 상세페이지 문구를 작성하세요.\n` +
    `⚠️ [작성 목표]\n` +
    `1. 각 섹션(태그)마다 반드시 4~5줄 분량으로 작성.\n` +
    `2. 단순 설명이 아니라 구매 욕구를 자극하는 감성적·구체적 표현.\n` +
    `3. 제공된 스펙(요약정보)을 문구에 자연스럽게 녹여 신뢰도를 더함.\n` +
    `4. 핵심 판매 소구점/중요 키워드는 반드시 ## 로 감쌈. (예: ##강력한 진동##)\n` +
    `[출력 구조 — 이 태그 구조를 엄수]\n${structureGuide}`;

  const userTextPrompt =
    `상품명: ${data.productNameKr || '(미입력)'}\n브랜드: ${data.brandName || ''}\n\n[핵심 스펙 및 요약 정보]\n` +
    `${Array.isArray(data.summaryInfo) ? (data.summaryInfo as unknown[]).join('\n') : JSON.stringify(data.summaryInfo, null, 1)}\n\n` +
    `위 스펙을 바탕으로 각 섹션(태그)에 4~5줄 분량의 상세페이지 문구를 써주세요.`;

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
  out.aiFeatureDesc = extract("[FEATURE]");
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
