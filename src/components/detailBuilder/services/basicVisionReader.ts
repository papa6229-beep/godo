// 기본형(통이미지 baked) 리더 — Claude 비전 1콜로 밴드들을 읽어 godo 슬롯 구조를 반환.
//   철학(2026-07-13 대전환): 변환기 브레인 = Claude(클라우드). 로컬 Gemma/VLM 체인 폐기.
//   내가 손으로 하던 v4 재현(band 읽기→슬롯배정→라이트 리라이트→의미 줄바꿈)을 자동화한다.
//   ⚠️ 원칙: '사진 보고 없는 글 생성' 금지. 이미지에 박힌 원문을 읽어(팩트 그대로) 표현만 라이트 리라이트.
import { chatWithProvider } from '../../../services/aiProviderAdapter';
import { hasProviderKey } from '../../../services/aiKeyVault';
import type { ChatContentPart } from '../../../types/aiProvider';
import type { BasicBandType } from './basicBandTagger';

// 변환기 브레인 = Claude(클라우드) 고정. 생성기 문구용 로컬 Gemma(design 두뇌)와 분리 —
// design 두뇌에 묶으면 로컬 LM Studio로 가서 대용량 이미지에 HTTP 400. 변환기는 항상 Claude.
// (단순형 리라이트 rewriteFlowCaptions도 이 상수를 재사용 — 변환기 공통 브레인.)
export const CONVERTER_PROVIDER = 'claude_api';
// 모델 고정: 판독/리라이트 품질이 중요한 1회성 작업 → 최신 모델. registry 기본값
// 'claude-sonnet-4-6'은 구모델이라 Anthropic 404 유발 가능 → 여기서 유효 모델로 오버라이드.
export const CONVERTER_MODEL = 'claude-opus-4-8';

export interface BasicPointBlock { index: number; caption: string }
export interface BasicVisionResult {
  productNameKr: string;   // \n 포함(의미 단위 2줄)
  productNameEn: string;
  summary: { feature?: string; type?: string; material?: string; weight?: string; power?: string; maker?: string };
  keyFeatures: { title: string; desc: string }[];   // 정확히 3 지향
  mainIndex: number;       // 히어로(깨끗한 단독 누끼). 없으면 -1
  featureIndex: number;    // KEY FEATURE 이미지. 없으면 -1
  sizeIndex: number;       // 사이즈 도해(치수+무게). 없으면 -1
  packageIndex: number;    // 패키지 박스. 없으면 -1
  point1: { title: string; blocks: BasicPointBlock[] };
  point2: { title: string; blocks: BasicPointBlock[] };
  notes: string[];
}

export interface BasicReadContext {
  productNameKr: string;
  productNameEn?: string;
  brandName?: string;
  introText?: string;   // 엑셀 상세HTML의 텍스트(상품특징 요약 카피) — 있으면 근거로 사용
}

// data URL 이미지를 폭 maxPx로 다운스케일(토큰 절약 + 전송 안정). 비 data URL은 그대로.
const downscale = (src: string, maxPx = 760, quality = 0.85): Promise<string> =>
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

const SYSTEM = [
  '당신은 성인용품 쇼핑몰의 상세페이지를 "고도몰 섹션형" 레이아웃으로 재조립하는 전문 편집자입니다.',
  '입력: 한 상품의 상세페이지(통이미지)를 위→아래 순서로 자른 밴드 이미지들([0],[1],... 인덱스).',
  '당신이 할 일: 각 밴드를 보고, (1) 이미지에 박힌 한글 텍스트를 정확히 읽고 (2) 고도몰 슬롯에 배치.',
  '',
  '[절대 규칙]',
  '1. 이미지에 박힌 팩트(사이즈·무게·재질·기능·옵션·숫자)는 지어내지 말고 읽은 그대로. 없는 정보는 비움("").',
  '2. Point 설명(caption)은 이미지에 박힌 원문을 근거로 "표현·톤만 자연스럽게" 라이트 리라이트(팩트 유지, 분량 비슷).',
  '   사진만 보고 새 문장을 창작하지 말 것. 원문 텍스트가 있으면 그걸 다듬는다.',
  '3. caption은 의미 단위로 줄바꿈(\\n) — 한 줄이 완결된 덩어리가 되게(조사/서술어 어색하게 자르지 말 것).',
  '4. 각 caption에서 가장 중요한 소구 어구 1곳만 ##문구## 로 감쌀 것(빨강 강조용). 없으면 생략.',
  '5. size(치수)는 옵션마다 다양해 부정확 → 스펙에 넣지 말 것(별도 사이즈 이미지로 처리).',
  '6. ⚠️ 각 밴드에는 (PHOTO)/(TEXT)/(MIXED)/(UNKNOWN) 타입이 붙는다.',
  '   · (TEXT) 밴드 = 글자만 박힌 설명/스펙 이미지. 스펙·설명·요약·캡션을 "읽는 근거"로만 사용한다.',
  '     → mainIndex·featureIndex·sizeIndex·packageIndex·Point 블록의 index 등 "어떤 이미지 슬롯에도" 절대 배정하지 말 것.',
  '       (배정하면 같은 문장이 라이브 설명 + 텍스트 이미지로 두 번 나오는 중복이 된다.)',
  '   · 이미지 슬롯 우선순위: (PHOTO) 우선 → (MIXED) 차선 → (UNKNOWN)은 다른 후보 없을 때만. (TEXT)는 이미지로 금지.',
  '   · Point 블록의 index는 그 설명이 "가리키는 실제 제품 (PHOTO/MIXED) 밴드"여야 한다(설명 원문이 박힌 TEXT 밴드가 아니라).',
  '',
  '[슬롯]',
  '- mainIndex: 배경 위 제품 누끼 히어로 컷(가장 대표적인 단독 컷).',
  '- featureIndex: KEY FEATURE용 제품 컷(두 번째로 깨끗한 누끼).',
  '- sizeIndex: 치수(cm)와 무게가 표기된 사이즈 도해 밴드.',
  '- packageIndex: 패키지(박스) 컷.',
  '- point1/point2: 제품 특징·사용법 설명 섹션. 각 block은 {index(설명에 맞는 이미지 밴드), caption(그 이미지에 붙일 설명)}. 각 섹션 최대 3블록.',
  '  point1 = 앞부분 특징(형태/재질/컨트롤 등), point2 = 뒷부분(전원/충전/사용법 등). 내용으로 판단.',
  '- keyFeatures: 상품의 핵심 특징 3가지 {title(짧게), desc(한 줄)}. 상단 요약/특징 문구에서 도출.',
  '- summary.type(타입)·material(재질)·weight(무게)·power(전원)·feature(한줄특징)·maker(제조사): 읽히면 채우고 아니면 "".',
  '',
  '[출력] 아래 JSON "하나만" 출력(코드펜스/설명/머리말 금지):',
  '{"productNameKr":"..\\n..","productNameEn":"..","summary":{"feature":"","type":"","material":"","weight":"","power":"","maker":""},',
  '"keyFeatures":[{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}],',
  '"mainIndex":0,"featureIndex":0,"sizeIndex":0,"packageIndex":0,',
  '"point1":{"title":"","blocks":[{"index":0,"caption":"..\\n.."}]},"point2":{"title":"","blocks":[]},"notes":[]}',
].join('\n');

const stripFence = (s: string): string =>
  s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/,'').trim();

const num = (v: unknown, d = -1): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const parseResult = (raw: string): BasicVisionResult => {
  const text = stripFence(raw);
  const m = text.match(/\{[\s\S]*\}/);
  const obj = m ? JSON.parse(m[0]) : {};
  const feats = Array.isArray(obj.keyFeatures) ? obj.keyFeatures : [];
  const pt = (p: any): { title: string; blocks: BasicPointBlock[] } => ({
    title: str(p?.title),
    blocks: (Array.isArray(p?.blocks) ? p.blocks : [])
      .map((b: any) => ({ index: num(b?.index), caption: str(b?.caption) }))
      .filter((b: BasicPointBlock) => b.index >= 0 && b.caption)
      .slice(0, 3),
  });
  return {
    productNameKr: str(obj.productNameKr),
    productNameEn: str(obj.productNameEn),
    summary: {
      feature: str(obj.summary?.feature), type: str(obj.summary?.type), material: str(obj.summary?.material),
      weight: str(obj.summary?.weight), power: str(obj.summary?.power), maker: str(obj.summary?.maker),
    },
    keyFeatures: feats.map((f: any) => ({ title: str(f?.title), desc: str(f?.desc) })).filter((f: any) => f.title).slice(0, 3),
    mainIndex: num(obj.mainIndex), featureIndex: num(obj.featureIndex),
    sizeIndex: num(obj.sizeIndex), packageIndex: num(obj.packageIndex),
    point1: pt(obj.point1), point2: pt(obj.point2),
    notes: Array.isArray(obj.notes) ? obj.notes.map(str).filter(Boolean) : [],
  };
};

/**
 * 밴드 이미지들(위→아래 순서, data URL) + 컨텍스트 → Claude 비전 1콜로 godo 슬롯 구조 반환.
 * design 두뇌가 클라우드(Claude)면 버셀 OK. 로컬 VLM이어도 멀티모달 통과(단 품질/한글은 Claude 권장).
 */
export const readBasicLayout = async (
  bands: string[],
  ctx: BasicReadContext,
  bandTypes?: BasicBandType[],   // 기본형 태거(로컬 픽셀)가 붙인 밴드 타입 — 프롬프트 가드용. 없으면 UNKNOWN.
): Promise<BasicVisionResult> => {
  if (!hasProviderKey(CONVERTER_PROVIDER)) {
    throw new Error('변환기 AI(Claude) 키가 연결되어 있지 않습니다. 관리자 설정 → AI 연결에서 Claude API 키를 붙여넣어 주세요.');
  }
  const small = await Promise.all(bands.map((b) => downscale(b)));
  const typeOf = (i: number): BasicBandType => bandTypes?.[i] ?? 'UNKNOWN';

  const content: ChatContentPart[] = [{
    type: 'text',
    text:
      `상품명(한글): ${ctx.productNameKr || '(미상)'}\n` +
      `영문명: ${ctx.productNameEn || ''}\n브랜드: ${ctx.brandName || ''}\n` +
      (ctx.introText ? `상세 상단 요약 텍스트(근거): ${ctx.introText.slice(0, 600)}\n` : '') +
      `\n아래 밴드 ${small.length}장을 위→아래 순서로 봅니다. 각 밴드 옆의 (PHOTO/TEXT/MIXED/UNKNOWN) 타입 규칙(규칙6)을 지켜 배치하고 JSON 하나만 출력하세요.`,
  }];
  small.forEach((s, i) => {
    content.push({ type: 'text', text: `[${i}](${typeOf(i)})` });
    content.push({ type: 'image', image: s });
  });

  const res = await chatWithProvider({
    providerId: CONVERTER_PROVIDER,   // Claude 고정(키는 vault에서 chatWithCloud가 해석)
    modelIdOverride: CONVERTER_MODEL, // 유효 최신 비전 모델 고정(구 registry 기본값 404 회피)
    purpose: 'agent_run',
    temperature: 0.3,
    maxTokens: 2600,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
  });
  if (!res.ok || !res.content) {
    throw new Error(res.errorMessage || '변환기 AI(Claude) 응답을 받지 못했습니다. Claude 연결 키/모델을 확인해 주세요.');
  }
  try {
    return parseResult(res.content);
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다(JSON 파싱 실패). 다시 시도해 주세요.');
  }
};

// ── 통이미지 단순형(버진루프/트리니티류) → flow(사진+설명 지그재그) 리더 ──
//   구조: 상단 큰 이미지(패키지/제품/마케팅) + 하단 [사진→그 아래 설명] 반복.
//   속도 우선 → 읽기 + 라이트 리라이트 + ##강조##를 1패스로. 지그재그 배치는 PreviewGodoFlow가 자동.
export interface TypedBand { dataUrl: string; type: 'PHOTO' | 'TEXT' | 'LINE' }
export interface BakedFlowResult {
  mainIndices: number[];                              // 상단 대표(마케팅) 영역 (사진) 밴드들 → 세로로 합쳐 메인 풀폭
  blocks: { imageIndex: number; caption: string }[];  // [사진 + 리라이트+강조 캡션]
  notes: string[];
}

const BAKED_FLOW_SYSTEM = [
  '당신은 국내(한국) 성인용품 쇼핑몰 상세페이지 편집자입니다. 입력은 통이미지를 위→아래로 자른 밴드들입니다.',
  '각 밴드는 [i](사진) 또는 [i](설명글)로 라벨됩니다. (사진)=제품/패키지/마케팅 이미지. (설명글)=그 위 사진을 설명하는 한글 텍스트 줄.',
  '',
  '[할 일]',
  '1. mainIndices: 최상단부터 "아래에 한글 설명 문장이 붙는 첫 제품 블록"이 시작되기 전까지의 (사진) 밴드 번호들(연속). 이 영역 = 크고 대표적인 마케팅 이미지(일본어·캐릭터·화려함·설명글 없음)일 수 있고, 여러 밴드면 전부 나열(세로로 합쳐 메인 1개가 됨).',
  '   · 마케팅이 없으면(예: 버진루프) 상단의 "패키지+제품이 함께 나온 대표 (사진)" 1개만 mainIndices에 넣는다. 즉 mainIndices는 보통 최소 1개.',
  '2. blocks: mainIndices 이후의 각 제품 (사진)마다 {imageIndex: 그 (사진) 밴드 번호, caption: 그 사진 "바로 아래 (설명글)"을 읽어 리라이트한 문구}. 위→아래 순서.',
  '   · (설명글) 밴드는 이미지가 아니다 → imageIndex로 쓰지 말 것(캡션 근거로만).',
  '   · 마케팅을 mainIndices에 넣었다면, 그 아래 "패키지+제품" 사진은 mainIndices가 아니라 blocks의 첫 번째가 된다(설명이 있으면 caption 포함).',
  '',
  '[구분 규칙]',
  '· 상품명·옵션명 "헤딩"(예 "버진 루프 하드"(금색 밑줄), "TORNADO/SPHERE" 같은 이름 단어)은 설명이 아님 → caption으로 쓰지 말 것.',
  '· 통짜 일본어/영어 텍스트는 설명(구분자)이 아님. 설명은 "한글 위주 문장"이다(상품명 때문에 영/일 조금 섞일 순 있음).',
  '[caption 규칙]',
  '· 원문 설명을 근거로 표현·톤만 자연스럽게 변주. 숫자/사이즈/무게/재질/기능 등 팩트는 원문 그대로. 사진만 보고 창작 금지.',
  '· 의미 단위 줄바꿈(\\n). 가장 중요한 소구 어구 1곳만 ##문구##로 감쌀 것.',
  '',
  '[출력] JSON 하나만(코드펜스/설명/머리말 금지):',
  '{"mainIndices":[0],"blocks":[{"imageIndex":2,"caption":"..\\n.."}],"notes":[]}',
].join('\n');

export const readBakedFlow = async (bands: TypedBand[], ctx: BasicReadContext): Promise<BakedFlowResult> => {
  if (!hasProviderKey(CONVERTER_PROVIDER)) {
    throw new Error('변환기 AI(Claude) 키가 연결되어 있지 않습니다. 관리자 설정 → AI 연결에서 Claude API 키를 붙여넣어 주세요.');
  }
  const small = await Promise.all(bands.map((b) => downscale(b.dataUrl)));
  const content: ChatContentPart[] = [{
    type: 'text',
    text:
      `상품명: ${ctx.productNameKr || ''}\n브랜드: ${ctx.brandName || ''}\n` +
      (ctx.introText ? `상단 요약(근거): ${ctx.introText.slice(0, 500)}\n` : '') +
      `\n밴드 ${small.length}개를 위→아래 순서로 봅니다. (사진)/(설명글) 라벨을 보고 규칙대로 JSON 하나만.`,
  }];
  small.forEach((s, i) => {
    const label = bands[i].type === 'TEXT' ? `[${i}](설명글)` : `[${i}](사진)`;
    content.push({ type: 'text', text: label });
    content.push({ type: 'image', image: s });
  });

  const res = await chatWithProvider({
    providerId: CONVERTER_PROVIDER,
    modelIdOverride: CONVERTER_MODEL,
    purpose: 'agent_run',
    maxTokens: 3200,
    messages: [{ role: 'system', content: BAKED_FLOW_SYSTEM }, { role: 'user', content }],
  });
  if (!res.ok || !res.content) throw new Error(res.errorMessage || '변환기 AI(Claude) 응답을 받지 못했습니다.');
  try {
    const text = stripFence(res.content);
    const m = text.match(/\{[\s\S]*\}/);
    const obj: any = m ? JSON.parse(m[0]) : {};
    const mainIndices = (Array.isArray(obj.mainIndices) ? obj.mainIndices : []).map((v: any) => num(v)).filter((n: number) => n >= 0);
    const blocks = (Array.isArray(obj.blocks) ? obj.blocks : [])
      .map((b: any) => ({ imageIndex: num(b?.imageIndex), caption: str(b?.caption) }))
      .filter((b: any) => b.imageIndex >= 0);
    const notes = Array.isArray(obj.notes) ? obj.notes.map(str).filter(Boolean) : [];
    return { mainIndices, blocks, notes };
  } catch {
    throw new Error('AI 응답 해석 실패(JSON 파싱).');
  }
};
