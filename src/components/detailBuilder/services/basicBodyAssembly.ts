// 기본형(통이미지 baked) 본문 — 원본 섹션을 "가변 배열"로 조립하는 순수 로직.
//
// 왜 필요한가(2026-08-22 1차 패치): 원본 본문은 섹션 수와 내부 구성이 상품마다 다른데,
//   출력은 `Point 01 · Point 02 · 하단 SIZE` 고정 슬롯이었다. 그래서 원본 4섹션이
//   2섹션으로 압축되고, 사이즈 섹션이 원본 위치가 아닌 최하단에 생겼다.
//   → 상단 요약(HERO·스펙·KEY FEATURE·패키지) 디자인은 그대로 두고, 본문만 가변 배열로 바꾼다.
//
// 이 파일의 규율
//   · DOM·네트워크·AI 호출 없음 → Node 에서 그대로 실행 검사할 수 있다(기본형 검사 공백 B-2 완화).
//   · AI 에게 픽셀 좌표를 묻지 않는다. AI 는 "어느 밴드가 어느 섹션의 몇 번째 항목인가"라는
//     의미 지도만 준다. 자르기·정규화·렌더는 기존 로컬 경로가 계속 담당한다.
//   · AI 응답을 그대로 믿지 않는다(Layer C). 홍보 GIF·TEXT 밴드·요약 원본·중복은 여기서 막는다.
//   · 애매하면 자르거나 지우지 않는다 — 복합 이미지로 통째 보존하고 손검수 사유를 남긴다.

export type BasicBandType = 'PHOTO' | 'TEXT' | 'MIXED' | 'UNKNOWN';

/** 밴드 1장의 선정·조립용 픽셀 지표(태거 `BasicBandMetrics` 의 부분집합). */
export interface BasicSlotMetrics {
  color: number;       // 유채색 비율 — 높으면 컬러 배경/합성 배너
  smallCC: number;     // 글자형 작은 연결요소 수 — 높으면 이미지에 글자가 박혀 있다
  largestCC: number;   // 가장 큰 연결요소 면적비 — 낮으면 제품이 없다/작다
  fillRatio: number;   // 전경이 자기 bbox 를 채우는 비율 — 높으면 사각 박스(패키지)
  height: number;
  dhash: boolean[];    // 같은 컷 판별용 64bit
}

/** 조립에 필요한 밴드 1장의 사실. `src` 는 렌더에 그대로 쓰는 자산이다. */
export interface BasicBandRef {
  src: string;             // 분할 밴드(dataURL) 또는 원본 GIF URL
  type: BasicBandType;
  promo: boolean;          // 바나나몰 홍보 GIF(파란 테두리·로고) — 어떤 슬롯에도 쓰지 않는다
  isGif?: boolean;         // 원본이 GIF → 정지 이미지로 바꾸지 않는다
  metrics?: BasicSlotMetrics;
}

// ── AI(Claude 1콜)가 돌려주는 의미 지도 — 픽셀 좌표 없음 ──────────────────────
export interface AiTextItem { kind: 'text'; text: string }
export interface AiMediaItem { kind: 'media'; index: number; composite?: boolean; reviewNote?: string }
export type AiSectionItem = AiTextItem | AiMediaItem;
export interface AiBodySection { number?: string; title?: string; items?: AiSectionItem[] }
export interface BasicSlotRequest {
  mainIndex: number;
  featureIndex: number;
  packageIndex: number;
  summarySourceIndexes?: number[];   // 원본 "요약정보" 영역에서 온 밴드들(본문 재사용 금지)
}

// ── 화면이 렌더하는 본문 정본 ────────────────────────────────────────────────
export type BasicMediaType = 'image' | 'gif';
export interface BasicBodyTextItem { kind: 'text'; text: string }
export interface BasicBodyMediaItem {
  kind: 'media';
  src: string;
  mediaType: BasicMediaType;
  composite: boolean;      // 제품과 설명·수치·표식이 한 시각 구성으로 묶인 이미지
  reviewNote?: string;     // 분리 애매 등 손검수 사유(있을 때만)
}
export type BasicBodyItem = BasicBodyTextItem | BasicBodyMediaItem;
export interface BasicBodySection {
  id: string;
  number: string;          // 원본 번호("01"…). 없을 수 있다
  title: string;           // 원본 섹션 제목. 없을 수 있다
  items: BasicBodyItem[];  // 원본 위→아래 순서
}

/** dHash 해밍 ≤ 이 값이면 같은 컷(실측: 동일 0~3 vs 다른 27+). */
export const BODY_DUP_HAMMING = 10;

/** HERO/Key Feature 자격 임계 — 핑거위글 21밴드 실측 고정(2026-07-16). 근거 없이 바꾸지 않는다. */
export const CLEAN_CUT_THRESHOLDS = {
  MAX_COLOR: 0.20,        // 초과 = 컬러 배너/합성 배경(분홍 요약 메인 등)
  MAX_SMALL_CC: 10,       // 초과 = 글자가 박힌 컷
  MIN_LARGEST_CC: 0.12,   // 미만 = 제품이 없거나 너무 작음
  MAX_FILL_RATIO: 0.62,   // 초과 = 사각 박스형(패키지)
} as const;

/** 두 dHash 의 해밍 거리. 길이가 다르면 비교 불가 = 최대치(64). */
export const dhashHamming = (a: boolean[], b: boolean[]): number => {
  if (!a?.length || !b?.length || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

/** 같은 사진인가(다른 밴드에 실린 동일 컷). */
export const isSameCut = (a?: BasicSlotMetrics, b?: BasicSlotMetrics): boolean =>
  !!a && !!b && dhashHamming(a.dhash, b.dhash) <= BODY_DUP_HAMMING;

export interface SlotDecision { role: string; requested: number; result: string; final: number; reason: string }
export interface BasicSlotResult {
  mainIndex: number;
  featureIndex: number;
  packageIndex: number;
  reserved: Set<number>;      // 본문에 다시 쓰지 않을 밴드(요약 원본 + 패키지)
  decisions: SlotDecision[];
  notes: string[];
}

const inRange = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 상단 요약 슬롯(메인 · Key Feature · 패키지) 선정 + 본문 재사용 금지 목록.
 *   · 패키지는 AI 지목을 검증만 한다(차단 대상이면 빈 슬롯 — 잘못된 사진보다 빈 슬롯이 안전).
 *   · 메인/Key Feature 는 "흰 배경의 깨끗한 제품 단독 컷" 자격을 로컬에서 다시 검사한다.
 *     AI 픽이 자격을 통과하면 존중하고, 아니면 후보풀에서 재선정한다. 둘은 서로 다른 컷이어야 한다.
 */
export const selectBasicSlots = (req: BasicSlotRequest, bands: BasicBandRef[]): BasicSlotResult => {
  const decisions: SlotDecision[] = [];
  const notes: string[] = [];
  const used = new Set<number>();
  const n = bands.length;

  const blockReason = (i: number): string | null => {
    if (!inRange(i, n)) return 'out_of_range';
    if (bands[i].promo) return 'bananamall_promo_gif';
    if (bands[i].type === 'TEXT') return 'text_band_not_allowed_for_image_slot';
    return null;
  };

  // 단일 역할(패키지): 차단 대상이면 거부 → 빈 슬롯.
  const validateRole = (requested: number, role: string): number => {
    const block = blockReason(requested);
    if (block) {
      decisions.push({ role, requested, result: inRange(requested, n) ? 'rejected→empty' : 'none', final: -1, reason: block });
      return -1;
    }
    used.add(requested);
    decisions.push({ role, requested, result: 'accepted', final: requested, reason: 'ok' });
    return requested;
  };

  const metricsOf = (i: number): BasicSlotMetrics | undefined => (inRange(i, n) ? bands[i].metrics : undefined);
  const cleanEligible = (i: number, avoid: number[]): boolean => {
    if (blockReason(i) || used.has(i)) return false;
    const m = metricsOf(i);
    if (!m) return false;
    const t = CLEAN_CUT_THRESHOLDS;
    if (m.color > t.MAX_COLOR || m.smallCC > t.MAX_SMALL_CC) return false;
    if (m.largestCC < t.MIN_LARGEST_CC || m.fillRatio > t.MAX_FILL_RATIO) return false;
    for (const ex of avoid) if (ex >= 0 && isSameCut(m, metricsOf(ex))) return false;
    return true;
  };
  const cleanScore = (i: number): number => {
    const m = metricsOf(i);
    if (!m) return -999;
    return m.largestCC * 2 - m.color - m.smallCC * 0.02 + Math.min(m.height, 700) / 2000;
  };
  const selectClean = (requested: number, role: string, avoid: number[]): number => {
    if (cleanEligible(requested, avoid)) {
      used.add(requested);
      decisions.push({ role, requested, result: 'accepted(clean)', final: requested, reason: 'AI 픽이 자격 통과' });
      return requested;
    }
    const pool = bands.map((_, i) => i).filter((i) => cleanEligible(i, avoid));
    if (!pool.length) {
      decisions.push({ role, requested, result: 'no-clean→empty', final: -1, reason: '깨끗한 제품컷 후보 없음 → 수동 지정 필요' });
      notes.push(role === 'main' ? '메인 이미지 후보 없음 — 수동 지정 필요.' : 'KEY FEATURE 이미지 후보 없음 — 수동 지정 필요.');
      return -1;
    }
    const chosen = [...pool].sort((a, b) => cleanScore(b) - cleanScore(a))[0];
    used.add(chosen);
    const m = metricsOf(chosen)!;
    decisions.push({
      role, requested, result: 'reselected(clean)', final: chosen,
      reason: `largestCC ${m.largestCC.toFixed(3)}·color ${m.color.toFixed(3)}·fill ${m.fillRatio.toFixed(2)}·smallCC ${m.smallCC}`,
    });
    return chosen;
  };

  // 패키지 먼저(메인/피처가 패키지와 같은 컷을 피할 수 있게), 그다음 메인 → 피처.
  const packageIndex = validateRole(req.packageIndex, 'package');
  const mainIndex = selectClean(req.mainIndex, 'main', [packageIndex]);
  const featureIndex = selectClean(req.featureIndex, 'feature', [packageIndex, mainIndex]);

  // 본문 재사용 금지: 원본 요약정보 영역 밴드 + 상단에 쓴 패키지 자산.
  const reserved = new Set<number>();
  for (const i of req.summarySourceIndexes ?? []) if (inRange(i, n)) reserved.add(i);
  if (packageIndex >= 0) reserved.add(packageIndex);
  if (!(req.summarySourceIndexes ?? []).length) notes.push('요약정보 원본 밴드 표시 없음 — 본문 중복 여부를 눈으로 확인하세요.');

  return { mainIndex, featureIndex, packageIndex, reserved, decisions, notes };
};

export interface BodyDecision { section: string; requested: number; result: string; reason: string }
export interface BasicBodyResult { sections: BasicBodySection[]; notes: string[]; decisions: BodyDecision[] }
export interface AssembleOptions { reserved?: Set<number> }

/**
 * AI 의 섹션 지도 → 화면 렌더용 본문 섹션 배열.
 *   원본의 섹션 개수·순서·항목 순서를 그대로 둔다(정렬·병합·자동 생성 없음).
 *   미디어 항목은 로컬 검증을 통과한 것만 남고, 제외되면 사유가 decisions 에 남는다.
 */
export const assembleBasicBody = (
  aiSections: AiBodySection[],
  bands: BasicBandRef[],
  opts: AssembleOptions = {},
): BasicBodyResult => {
  const reserved = opts.reserved ?? new Set<number>();
  const decisions: BodyDecision[] = [];
  const notes: string[] = [];
  const sections: BasicBodySection[] = [];
  const usedMedia = new Set<number>();          // 본문 전체에서 같은 밴드를 두 번 쓰지 않는다
  const n = bands.length;

  const dropReason = (i: number): string | null => {
    if (!inRange(i, n)) return 'out_of_range';
    if (bands[i].promo) return 'bananamall_promo_gif';
    if (bands[i].type === 'TEXT') return 'text_band_not_allowed_for_image_slot';
    if (reserved.has(i)) return 'reserved_for_summary_or_package';
    if (usedMedia.has(i)) return 'duplicate_in_body';
    for (const r of reserved) if (isSameCut(bands[i].metrics, bands[r]?.metrics)) return 'duplicate_of_reserved_cut';
    return null;
  };

  (Array.isArray(aiSections) ? aiSections : []).forEach((sec, si) => {
    const number = (sec?.number ?? '').toString().trim();
    const title = (sec?.title ?? '').toString().trim();
    const label = number || title || `${si + 1}`;
    const items: BasicBodyItem[] = [];

    for (const raw of Array.isArray(sec?.items) ? sec.items! : []) {
      if (!raw || typeof raw !== 'object') continue;
      if (raw.kind === 'text') {
        const text = (raw.text ?? '').toString().trim();
        if (text) items.push({ kind: 'text', text });
        continue;
      }
      if (raw.kind !== 'media') continue;
      const idx = typeof raw.index === 'number' ? raw.index : Number.parseInt(String(raw.index), 10);
      const reason = dropReason(idx);
      if (reason) {
        decisions.push({ section: label, requested: idx, result: 'dropped', reason });
        continue;
      }
      const band = bands[idx];
      usedMedia.add(idx);
      const reviewNote = (raw.reviewNote ?? '').toString().trim();
      items.push({
        kind: 'media',
        src: band.src,
        mediaType: band.isGif ? 'gif' : 'image',
        composite: raw.composite === true || band.type === 'MIXED',
        ...(reviewNote ? { reviewNote } : {}),
      });
      decisions.push({ section: label, requested: idx, result: 'kept', reason: band.type });
    }

    if (!items.length) notes.push(`본문 ${label} 섹션에 남은 자료가 없습니다 — 손검수 필요.`);
    sections.push({ id: `godo-body-${si + 1}-${number || 'x'}`, number, title, items });
  });

  if (!sections.length) notes.push('AI 가 본문 섹션을 인식하지 못했습니다 — 손검수 필요.');
  const dropped = decisions.filter((d) => d.result === 'dropped').length;
  if (dropped) notes.push(`본문에서 ${dropped}건 제외(요약 원본·홍보 GIF·텍스트 밴드·중복).`);

  return { sections, notes, decisions };
};

export interface BasicSummaryFields {
  feature?: string; type?: string; material?: string; weight?: string; power?: string; maker?: string;
}
export interface BasicSummaryOut {
  feature: string; type: string; material: string; size: string; weight: string; power: string; maker: string;
}

/**
 * 고정 스펙 5개 조립. 치수는 항상 `상세페이지 참조` 다 —
 * 옵션마다 치수가 달라 원본을 그대로 옮길 수 없다는 요구자료 규정(사장님 확정).
 * 나머지는 AI 가 원본에서 읽은 값만 쓴다(없으면 빈 값 — 지어내지 않는다).
 */
export const buildBasicSummaryInfo = (
  summary: BasicSummaryFields | undefined,
  ctx: { brandName?: string } = {},
): BasicSummaryOut => {
  const s = summary ?? {};
  return {
    feature: s.feature ?? '',
    type: s.type ?? '',
    material: s.material ?? '',
    size: '상세페이지 참조',
    weight: s.weight ?? '',
    power: s.power ?? '',
    maker: ctx.brandName || s.maker || '',
  };
};

/** 동적 본문이 있으면 그것이 본문 정본이다(고정 Point 01·02·SIZE 렌더를 함께 쓰지 않는다). */
export const hasDynamicBody = (data?: { godoBodySections?: BasicBodySection[] } | null): boolean =>
  !!data && Array.isArray(data.godoBodySections) && data.godoBodySections.length > 0;
