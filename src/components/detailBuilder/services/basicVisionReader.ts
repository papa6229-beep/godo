// 기본형(통이미지 baked) 리더 — Claude 비전 1콜로 밴드들을 읽어 godo 슬롯 구조를 반환.
//   철학(2026-07-13 대전환): 변환기 브레인 = Claude(클라우드). 로컬 Gemma/VLM 체인 폐기.
//   내가 손으로 하던 v4 재현(band 읽기→슬롯배정→라이트 리라이트→의미 줄바꿈)을 자동화한다.
//   ⚠️ 원칙: '사진 보고 없는 글 생성' 금지. 이미지에 박힌 원문을 읽어(팩트 그대로) 표현만 라이트 리라이트.
import { chatWithProvider } from '../../../services/aiProviderAdapter';
import { hasProviderKey } from '../../../services/aiKeyVault';
import type { ChatContentPart } from '../../../types/aiProvider';
import type { BasicBandType } from './basicBandTagger';
import type { AiBodySection, AiSectionItem } from './basicBodyAssembly';

// 변환기 브레인 = Claude(클라우드) 고정. 생성기 문구용 로컬 Gemma(design 두뇌)와 분리 —
// design 두뇌에 묶으면 로컬 LM Studio로 가서 대용량 이미지에 HTTP 400. 변환기는 항상 Claude.
// (단순형 리라이트 rewriteFlowCaptions도 이 상수를 재사용 — 변환기 공통 브레인.)
export const CONVERTER_PROVIDER = 'claude_api';
// 모델 고정: 판독/리라이트 품질이 중요한 1회성 작업 → 최신 모델. registry 기본값
// 'claude-sonnet-4-6'은 구모델이라 Anthropic 404 유발 가능 → 여기서 유효 모델로 오버라이드.
export const CONVERTER_MODEL = 'claude-opus-4-8';

export interface BasicVisionResult {
  productNameKr: string;   // \n 포함(의미 단위 2줄)
  productNameEn: string;
  summary: { feature?: string; type?: string; material?: string; weight?: string; power?: string; maker?: string };
  keyFeatures: { title: string; desc: string }[];   // 정확히 3 지향
  mainIndex: number;       // 히어로(깨끗한 단독 누끼). 없으면 -1
  featureIndex: number;    // KEY FEATURE 이미지. 없으면 -1
  packageIndex: number;    // 패키지 박스. 없으면 -1
  mainIsSoloProductCut: boolean;    // 메인이 "흰 배경 + 제품 단독" 컷인가(false = 손검수 안내)
  summarySourceIndexes: number[];   // 원본 "요약정보" 영역에서 온 밴드(본문에 다시 넣지 않는다)
  sections: AiBodySection[];        // 원본 순서를 유지한 본문 섹션·항목 지도(픽셀 좌표 없음)
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
  '당신이 할 일: (1) 이미지에 박힌 한글 텍스트를 정확히 읽고 (2) 상단 요약 슬롯을 고르고',
  '(3) 본문을 "원본에 있던 섹션 순서 그대로" 지도로 만든다. 이미지를 자르는 일은 당신이 하지 않는다.',
  '',
  '[절대 규칙]',
  '1. 이미지에 박힌 팩트(사이즈·무게·재질·기능·옵션·숫자)는 지어내지 말고 읽은 그대로. 없는 정보는 비움("").',
  '2. 설명 텍스트는 이미지에 박힌 원문을 근거로 "표현·톤만 자연스럽게" 라이트 리라이트(팩트 유지, 분량 비슷).',
  '   사진만 보고 새 문장을 창작하지 말 것. 원문 텍스트가 있으면 그걸 다듬는다.',
  '3. 설명은 의미 단위로 줄바꿈(\\n) — 한 줄이 완결된 덩어리가 되게(조사/서술어 어색하게 자르지 말 것).',
  '4. 각 설명에서 가장 중요한 소구 어구 1곳만 ##문구## 로 감쌀 것(빨강 강조용). 없으면 생략.',
  '5. size(치수)는 옵션마다 다양해 부정확 → 스펙에 넣지 말 것(본문 사이즈 섹션이 그대로 보여준다).',
  '   전원은 원본의 충전·배터리 정보를 그대로. 전원이 없는 수동 제품이면 "수동형".',
  '6. ⚠️ 각 밴드에는 (PHOTO)/(TEXT)/(MIXED)/(UNKNOWN) 타입이 붙는다.',
  '   · (TEXT) 밴드 = 글자만 박힌 설명/스펙 이미지. 내용을 "읽어서 글자로 옮기는" 근거로만 쓴다.',
  '     → mainIndex·featureIndex·packageIndex·본문 media 항목 등 "어떤 이미지 자리에도" 절대 넣지 말 것.',
  '       (넣으면 같은 문장이 글자와 이미지로 두 번 나오는 중복이 된다.)',
  '   · 이미지 자리 우선순위: (PHOTO) 우선 → (MIXED) 차선 → (UNKNOWN)은 다른 후보 없을 때만.',
  '7. ⚠️ (BANANAMALL_워터마크·이미지금지) 라벨이 붙은 밴드 = 쇼핑몰 자체 홍보 움짤(파란 테두리·바나나몰 로고).',
  '   → 상단 슬롯·본문 어디에도 절대 넣지 말 것. 근거로도 쓰지 말 것.',
  '   (본문 안에서 기능·사용법을 보여주는 움짤은 이와 다르다 — 그런 밴드는 본문 media 로 그대로 유지한다.)',
  '',
  '[상단 요약 슬롯]',
  '- mainIndex: **흰 배경에 제품만 단독으로 놓인 컷**을 최우선으로 고른다.',
  '  · 손·사람·신체 일부·소품·연출 배경·설명 글자·장식이 함께 찍힌 컷은 뒤로 미룬다(제품 단독 컷이 있으면 그것을 쓴다).',
  '  · 그런 단독 컷이 정말 없으면 가장 나은 컷을 고르고 "mainIsSoloProductCut": false 로 알려라(빈칸·실패로 만들지 말 것).',
  '- featureIndex: KEY FEATURE용 제품 컷 — mainIndex 와 "반드시 다른 컷".',
  '  · 여기서도 깨끗한 제품 컷이 우선이지만 조건은 mainIndex 보다 완화해도 된다(손이 나온 컷도 허용).',
  '  ⚠️ 배경색·그림·장식 문양이 깔렸거나 설명 문구가 이미지로 박힌 밴드(요약정보 영역의 컬러 배경 메인컷 포함)는',
  '     mainIndex·featureIndex 후보가 아니다.',
  '- packageIndex: 패키지(박스) 컷. 원본 요약영역에 있으면 그것을 쓴다. 없으면 -1.',
  '- keyFeatures: 핵심 특징 3가지 {title(짧은 제목 1줄), desc(짧은 설명 1줄)}.',
  '  원본 요약정보 아래 3줄 설명을 우선 근거로 쓰고, 부족할 때만 본문 섹션 제목·설명으로 보충한다. 길게 쓰지 말 것.',
  '- summary.type(타입)·material(재질)·weight(무게)·power(전원)·feature(한줄특징)·maker(제조사): 읽히면 채우고 아니면 "".',
  '- summarySourceIndexes: 원본 "요약정보" 영역(상품명·요약표·3줄 카피·패키지 등 상단 구성에 쓴 원본)에서 온 밴드 번호 전부.',
  '  본문에 다시 넣지 않기 위한 목록이다.',
  '',
  '[본문 sections — 원본 그대로]',
  '- sections: 원본 본문의 섹션들을 "있던 개수·있던 순서 그대로" 나열한다. 합치거나 빼거나 새로 만들지 말 것.',
  '- 각 섹션 = {number(원본 번호 "01" 등, 없으면 ""), title(원본 섹션 제목, 없으면 ""), items:[...]}.',
  '- 섹션의 끝은 "다음 번호 또는 다음 섹션 제목이 시작되는 지점"이다.',
  '- items 는 원본 위→아래 순서 그대로. 두 종류만 쓴다.',
  '  · {"kind":"text","text":"…"}  = 이미지와 독립된 섹션 안내문·일반 설명 문단(글자로 옮긴다).',
  '  · {"kind":"media","index":N,"composite":false} = 그 자리에 있던 이미지/움짤 밴드 번호.',
  '- 판단 기준은 하나다 — **이미지에서 떼어도 그 문장만으로 읽히는가.**',
  '  · 읽힌다(제목·안내 라벨·일반 설명·주석 등 별도 줄에 적힌 문장) → {"kind":"text"} 로 옮긴다.',
  '    예: "전원 · 진동 버튼" / "충전" / "USB연결형으로 건전지 걱정없이! 충전해서 사용할 수 있습니다." / "* 리모컨은 CR2032 건전지 1개를 사용합니다."',
  '  · 읽히지 않는다(제품의 특정 부위·기능을 이미지 안에서 가리키거나 배치로 설명하는 글자·선·화살표·표식)',
  '    → 글자로 옮기지 말고 그 밴드를 media 로 두고 "composite":true 로 표시한다.',
  '- ⚠️ 라벨이 (MIXED) 여도 **실제 제품 사진·사람·제품 도해·일러스트가 하나도 없고** 제목·색상 띠·일반 설명 문장만',
  '  있는 밴드는 media 가 아니라 text 로 옮긴다(색 배경 제목 띠도 마찬가지 — 글자 이미지를 그대로 싣지 말 것).',
  '  · 그 밴드에서 제목으로 쓸 문구는 그 섹션의 title 에만 넣고 items 의 text 로 중복해서 넣지 않는다.',
  '  · 제품 사진이나 제품 도해가 조금이라도 함께 있는 밴드는 이 규칙 대상이 아니다(그대로 media).',
  '- ⚠️ 제품 이미지와 한 시각 구성으로 묶인 텍스트·아이콘·표식은 화살표나 선의 유무와 관계없이 "이미지의 일부"다.',
  '- 분리 여부가 애매하면 자르거나 삭제하지 말고 복합 이미지 하나로 보존하고 "reviewNote"에 손검수 사유를 한 줄 남긴다.',
  '  · 예: 제품 사진 + 설명 문구 + 사이즈 도해가 한 배경(색 배경 포함)에 결합된 밴드',
  '    → {"kind":"media","index":N,"composite":true,"reviewNote":"제품·설명·사이즈가 한 이미지에 결합됨 — 손검수 필요"}',
  '- 사이즈·전원 섹션도 원본에 있던 그 위치에 그대로 둔다. 별도의 사이즈 섹션을 새로 만들지 말 것.',
  '- 번호·섹션 제목은 items 에 다시 넣지 말 것(number/title 필드가 이미 담는다).',
  '',
  '[출력] 아래 JSON "하나만" 출력(코드펜스/설명/머리말 금지):',
  '{"productNameKr":"..\\n..","productNameEn":"..","summary":{"feature":"","type":"","material":"","weight":"","power":"","maker":""},',
  '"keyFeatures":[{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}],',
  '"mainIndex":0,"featureIndex":0,"packageIndex":0,"mainIsSoloProductCut":true,"summarySourceIndexes":[0],',
  '"sections":[{"number":"01","title":"제품특징","items":[{"kind":"text","text":"..\\n.."},{"kind":"media","index":3,"composite":false}]}],',
  '"notes":[]}',
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
  // 본문 섹션 지도: 개수·순서를 그대로 보존한다(정렬·병합·상한 절단 없음).
  //   여기서는 형태만 강제하고, 실제 배제(홍보 GIF·TEXT·요약 원본·중복)는 basicBodyAssembly가 한다.
  const sectionItem = (raw: any): AiSectionItem | null => {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind === 'text') { const t = str(raw.text); return t.trim() ? { kind: 'text', text: t } : null; }
    if (raw.kind === 'media') {
      const index = num(raw.index);
      if (index < 0) return null;
      const reviewNote = str(raw.reviewNote);
      return { kind: 'media', index, composite: raw.composite === true, ...(reviewNote ? { reviewNote } : {}) };
    }
    return null;
  };
  const sections: AiBodySection[] = (Array.isArray(obj.sections) ? obj.sections : []).map((s: any) => ({
    number: str(s?.number), title: str(s?.title),
    items: (Array.isArray(s?.items) ? s.items : []).map(sectionItem).filter(Boolean) as AiSectionItem[],
  }));
  return {
    productNameKr: str(obj.productNameKr),
    productNameEn: str(obj.productNameEn),
    summary: {
      feature: str(obj.summary?.feature), type: str(obj.summary?.type), material: str(obj.summary?.material),
      weight: str(obj.summary?.weight), power: str(obj.summary?.power), maker: str(obj.summary?.maker),
    },
    keyFeatures: feats.map((f: any) => ({ title: str(f?.title), desc: str(f?.desc) })).filter((f: any) => f.title).slice(0, 3),
    mainIndex: num(obj.mainIndex), featureIndex: num(obj.featureIndex), packageIndex: num(obj.packageIndex),
    // 미회신이면 true(=문제 없음)로 본다. 명시적으로 false 일 때만 손검수 안내를 남긴다.
    mainIsSoloProductCut: obj.mainIsSoloProductCut !== false,
    summarySourceIndexes: (Array.isArray(obj.summarySourceIndexes) ? obj.summarySourceIndexes : [])
      .map((v: unknown) => num(v)).filter((v: number) => v >= 0),
    sections,
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
  bandTypes?: BasicBandType[],    // 기본형 태거(로컬 픽셀)가 붙인 밴드 타입 — 프롬프트 가드용. 없으면 UNKNOWN.
  excludeFlags?: boolean[],       // 바나나몰 홍보 GIF 등 "이미지 슬롯 전면 금지" 밴드 플래그(로컬 판정).
): Promise<BasicVisionResult> => {
  if (!hasProviderKey(CONVERTER_PROVIDER)) {
    throw new Error('변환기 AI(Claude) 키가 연결되어 있지 않습니다. 관리자 설정 → AI 연결에서 Claude API 키를 붙여넣어 주세요.');
  }
  const small = await Promise.all(bands.map((b) => downscale(b)));
  const typeOf = (i: number): BasicBandType => bandTypes?.[i] ?? 'UNKNOWN';
  const excluded = (i: number): boolean => !!excludeFlags?.[i];

  const content: ChatContentPart[] = [{
    type: 'text',
    text:
      `상품명(한글): ${ctx.productNameKr || '(미상)'}\n` +
      `영문명: ${ctx.productNameEn || ''}\n브랜드: ${ctx.brandName || ''}\n` +
      (ctx.introText ? `상세 상단 요약 텍스트(근거): ${ctx.introText.slice(0, 600)}\n` : '') +
      `\n아래 밴드 ${small.length}장을 위→아래 순서로 봅니다. 각 밴드 옆의 타입 규칙(규칙6·7)을 지키고,\n`
      + '본문 sections 는 원본에 있던 섹션 개수·순서·항목 순서를 그대로 옮겨 JSON 하나만 출력하세요.',
  }];
  small.forEach((s, i) => {
    const label = excluded(i) ? `[${i}](BANANAMALL_워터마크·이미지금지)` : `[${i}](${typeOf(i)})`;
    content.push({ type: 'text', text: label });
    content.push({ type: 'image', image: s });
  });

  const res = await chatWithProvider({
    providerId: CONVERTER_PROVIDER,   // Claude 고정(키는 vault에서 chatWithCloud가 해석)
    modelIdOverride: CONVERTER_MODEL, // 유효 최신 비전 모델 고정(구 registry 기본값 404 회피)
    purpose: 'agent_run',
    temperature: 0.3,
    // 본문 섹션 지도(원본 섹션 수만큼 항목이 늘어난다)까지 한 응답에 담아야 하므로 상향.
    //   호출 횟수는 그대로 1회다 — 나눠 부르지 않는다.
    maxTokens: 4000,
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
