// OPTION_PRESERVE 모드 — 업체가 이미 완성한 "옵션별 상세페이지"를 누끼컷 단위로 찢지 않고
//   옵션 페이지 단위로 통째 보존하는 독립 분기(2026-07-20, v0).
//   ⚠️ 격리 원칙: 기존 simple1/simple2/simple3·classifyBakedPattern·bakedCropReader의 임계값과 내부
//      로직은 1바이트도 건드리지 않는다. 이 파일은 "새 판정"만 담당(커밋1). 렌더 구성은 커밋2.
//   대상 구조(시엑스류): 엑셀 복수옵션 + HTML 타이핑설명 없음 + 상단 마케팅 개요 1장 + 옵션당 완성 통이미지.
//     이 구조에서 simple2로 보내면 2열 그리드·제품컷·치수가 멋대로 찢긴다 → 통째 보존이 정답.
import type { ParsedMainMallProduct } from './mainMallExcelParser';
import type { FlowBlock } from '../types';

export type FlowRouteVerdict = 'OPTION_PRESERVE' | 'EXISTING_FLOW' | 'NEEDS_REVIEW';

export interface OptionPreserveDecision {
  verdict: FlowRouteVerdict;
  reason: string;
  optionCount: number;      // 엑셀 옵션 수
  imageCount: number;       // flowImages 수
  optionImageCount: number; // 마케팅 개요(첫 장) 제외한 옵션 이미지 수
  tailCombineCount: number; // 마지막 옵션 이미지가 함께 설명하는 옵션 수(1=단독, 2=시엑스 B+C)
}

// 옵션값 숫자 접두어 파싱("09. B타입" → 9). 없으면 null(원본 배열 순서 사용 신호).
export const optionOrderKey = (v: string): number | null => {
  const m = String(v || '').match(/^\s*(\d{1,3})\s*[.\-)]/);
  return m ? parseInt(m[1], 10) : null;
};

// 엑셀 옵션값을 숫자 접두어 오름차순 정렬. 접두어 없는 항목은 원본 순서 유지(뒤로).
export const sortOptionsByPrefix = (values: string[]): { values: string[]; hasAllPrefix: boolean } => {
  const keyed = values.map((v, i) => ({ v, k: optionOrderKey(v), i }));
  const hasAllPrefix = keyed.every((e) => e.k !== null);
  const sorted = [...keyed].sort((a, b) => {
    if (a.k === null && b.k === null) return a.i - b.i;
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    return a.k - b.k || a.i - b.i;
  });
  return { values: sorted.map((e) => e.v), hasAllPrefix };
};

// 라우팅 판정. 픽셀 단일신호가 아니라 엑셀·구조 신호의 조합으로만 결정한다.
//   상품명·상품번호·URL 번호·이미지 크기 등은 근거로 쓰지 않는다.
export const decideOptionPreserve = (p: ParsedMainMallProduct): OptionPreserveDecision => {
  const optionCount = p.optionValues.length;
  const imageCount = p.flowImages.length;
  const base = { optionCount, imageCount, optionImageCount: Math.max(0, imageCount - 1), tailCombineCount: 1 };

  // 필수 조건 — 하나라도 어긋나면 기존 경로(simple1/2/3) 그대로. "옵션 있음" 하나만으로는 절대 보내지 않는다.
  if (!p.hasOptions || optionCount < 2) return { ...base, verdict: 'EXISTING_FLOW', reason: '복수 옵션 아님' };
  if (p.hasTypedText) return { ...base, verdict: 'EXISTING_FLOW', reason: 'HTML 타이핑 설명형(닛포리류=기존 경로)' };
  if (imageCount < 2) return { ...base, verdict: 'EXISTING_FLOW', reason: '이미지 부족(옵션 완성페이지 구조 아님)' };

  // A 규약: 첫 이미지 = 옵션 전체 마케팅 개요, 이후 이미지 = 옵션에 순서대로 연결.
  const optionImageCount = imageCount - 1;
  // 개요 이후 이미지가 옵션보다 많다 = 옵션당 완성페이지 구조가 아님(누끼 스택 의심) → 기존 경로 유지.
  if (optionImageCount > optionCount) {
    return { ...base, optionImageCount, verdict: 'EXISTING_FLOW', reason: '옵션당 이미지 과다(완성페이지 구조 아님)' };
  }
  // 마지막 이미지가 함께 설명하는 옵션 수 = (옵션 - 옵션이미지) + 1.
  const deficit = optionCount - optionImageCount;
  const tailCombineCount = deficit + 1;
  // v0: 1:1(deficit 0) 또는 "마지막 1장만 2옵션 공동"(deficit 1, 시엑스 B+C)까지만 자신한다.
  //   그 이상 공동(deficit≥2)은 옵션-이미지 대응이 불명확 → NEEDS_REVIEW(원본 순서대로 통째 보존, 억지매칭·삭제·분할 금지).
  if (deficit <= 1) {
    return {
      ...base, optionImageCount, tailCombineCount,
      verdict: 'OPTION_PRESERVE',
      reason: deficit === 0 ? '개요 + 옵션 1:1' : `개요 + 옵션(마지막 이미지가 ${tailCombineCount}개 옵션 공동)`,
    };
  }
  return {
    ...base, optionImageCount, tailCombineCount,
    verdict: 'NEEDS_REVIEW',
    reason: `옵션-이미지 대응 불명확(마지막이 ${tailCombineCount}개 옵션 공동) — 통째 보존 + 검수`,
  };
};

// 옵션값 "01. F타입" → { num:"01", name:"F타입" }. 접두어 없으면 num=''(원본 전체를 이름으로).
const splitOptionValue = (v: string): { num: string; name: string } => {
  const m = String(v || '').match(/^\s*(\d{1,3})\s*[.\-)]\s*(.*)$/);
  if (m) return { num: m[1].padStart(2, '0'), name: m[2].trim() };
  return { num: '', name: String(v || '').trim() };
};

let _opSeq = 0;
const opId = (): string => `optpr_${(_opSeq++).toString(36)}`;

// OPTION_PRESERVE / NEEDS_REVIEW → 원본 완성 이미지를 통째로 보존하는 FlowBlock 배열.
//   A규약: [0]=마케팅 개요(헤더 없음), 이후=엑셀 옵션 숫자 오름차순으로 순서 연결. 마지막 이미지가
//   남은 복수 옵션을 함께 설명하면 공동 헤더("09–10 · B타입 / C타입"). 이미지 내부는 절대 재분할하지 않는다.
//   NEEDS_REVIEW = 옵션명 추측 없이 원본 순서대로 통째 보존 + 검수 표시.
export const buildOptionPreserveBlocks = (
  p: ParsedMainMallProduct,
  d: OptionPreserveDecision,
): FlowBlock[] => {
  const imgs = p.flowImages;
  if (!imgs.length) return [];

  // NEEDS_REVIEW: 매핑 불확실 → 옵션 헤더 없이 원본 순서 통째 보존(첫 장=개요, 나머지=보존). 삭제·분할·추측 금지.
  if (d.verdict === 'NEEDS_REVIEW') {
    return imgs.map((image, i) => ({
      id: opId(), image,
      ...(i === 0 ? { marketing: true } : { preserved: true }),
      ...(i === 0 ? { reviewNote: '옵션-이미지 대응이 불명확 — 원본 순서 통째 보존(검수 필요)' } : {}),
    }));
  }

  const { values: sorted } = sortOptionsByPrefix(p.optionValues);
  const blocks: FlowBlock[] = [];
  // [0] 옵션 전체 마케팅 개요 — 통째, 옵션 헤더 없음.
  blocks.push({ id: opId(), image: imgs[0], marketing: true });

  const optionImgs = imgs.slice(1);
  let optIdx = 0;
  optionImgs.forEach((image, i) => {
    const isLast = i === optionImgs.length - 1;
    const count = isLast ? Math.max(1, sorted.length - optIdx) : 1; // 마지막 이미지가 남은 옵션 공동 흡수
    const group = sorted.slice(optIdx, optIdx + count).map(splitOptionValue);
    optIdx += count;
    const nums = group.map((g) => g.num).filter(Boolean);
    const names = group.map((g) => g.name).filter(Boolean);
    const numLabel = nums.length
      ? (nums.length === 1 ? nums[0] : `${nums[0]}–${nums[nums.length - 1]}`)
      : String(i + 1).padStart(2, '0'); // 접두어 없으면 순번
    const optionHeader = names.length ? `${numLabel} · ${names.join(' / ')}` : numLabel;
    blocks.push({ id: opId(), image, optionHeader });
  });
  return blocks;
};
