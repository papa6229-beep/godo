// 기본형 본문 "라이브 텍스트 오버레이" — **격리 진단 전용** 순수 로직 (2026-08-25 실험).
//
// 무엇을 하는 실험인가
//   현재 본문 정본은 `원본 상세이미지 파일을 자르지 않고 그대로 싣기`다(basicBodyAssembly).
//   그 정본을 **바꾸지 않은 채**, 원본 위에 두 레이어만 얹을 수 있는지 가능성만 잰다.
//     1) 원본 글자를 가리는 마스크   2) 같은 내용을 HTML 글자로 얹기
//   → 본문 재분할·섹션 조립·Point 생성·이미지↔설명 짝맞춤은 **하지 않는다**.
//
// 이 파일의 규율
//   · 판정은 전부 순수 함수다. Canvas 는 어댑터 한 곳(sampleRegionRing)에만 있고, 없으면 null 을 준다
//     → Node 에서 실제 함수를 호출해 검사할 수 있다.
//   · AI 좌표를 임의 보정하지 않는다. 범위를 벗어나면 살리지 않고 거부하고 사유를 남긴다.
//   · 흰 배경이 아니면 지우려 하지 않는다(생성형 인페인팅 없음) — 원본을 그대로 둔다.
//   · 결과는 진단 필드에만 담긴다. ProductData·HTML 저장·이미지 저장에 넣지 않는다.
import type { BasicBandOrigin } from './basicBodyAssembly';

// ── 계약 ─────────────────────────────────────────────────────────────────────

/** AI(기존 1콜)가 돌려주는 본문 글자 영역 1건. 좌표는 **해당 밴드 기준 0..1** 이다. */
export interface BasicBodyTextRegion {
  bandIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  role: 'heading' | 'body' | 'label';
  action: 'replace' | 'keep_raster';
  reviewNote: string;
}

/** 검증을 통과한 영역. `id` 는 좌표에서 나오므로 입력 순서가 바뀌어도 같다. */
export interface ValidatedBodyTextRegion extends BasicBodyTextRegion {
  id: string;
}

/**
 * Claude 응답 JSON 에서 본문 글자 영역 장부만 꺼낸다.
 *   **여기서 판정하지 않는다** — 원소를 하나도 버리지 않고 그대로 넘기고,
 *   유효성은 validateBodyTextRegions 한 곳에서만 본다(판정이 두 곳에 생기지 않게).
 *   없거나 목록이 아니면 undefined → 기존 결과 생성은 그대로 계속된다.
 */
export const extractBodyTextRegions = (obj: unknown): BasicBodyTextRegion[] | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  const raw = (obj as Record<string, unknown>).bodyTextRegions;
  return Array.isArray(raw) ? (raw as BasicBodyTextRegion[]) : undefined;
};

const ROLES: BasicBodyTextRegion['role'][] = ['heading', 'body', 'label'];
const ACTIONS: BasicBodyTextRegion['action'][] = ['replace', 'keep_raster'];

/** 같은 밴드에서 이 비율(IoU) 이상 겹치면 "같은 글자를 두 번 적은 것"으로 보고 뒤엣것을 거부한다. */
export const OVERLAP_IOU_LIMIT = 0.35;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inUnit = (v: number): boolean => v >= 0 && v <= 1;

/** 좌표만으로 정해지는 안정된 id — 입력 순서·배열 위치를 쓰지 않는다. */
const regionId = (r: BasicBodyTextRegion): string => {
  const k = (v: number): string => String(Math.round(v * 1000)).padStart(4, '0');
  return `b${r.bandIndex}-x${k(r.rect.x)}-y${k(r.rect.y)}-w${k(r.rect.width)}-h${k(r.rect.height)}`;
};

const iou = (a: BasicBodyTextRegion['rect'], b: BasicBodyTextRegion['rect']): number => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

/**
 * AI 가 준 글자 영역 장부를 검증한다. **보정하지 않는다** — 통과 아니면 거부다.
 *   거부 사유는 사용자가 그대로 읽을 수 있는 짧은 한국어 문장으로 남긴다.
 *   결과 순서는 입력 순서와 무관하게 밴드 → y → x 로 고정한다(같은 상품이면 항상 같은 표가 나온다).
 */
export const validateBodyTextRegions = (
  input: unknown,
  bandCount: number,
): { valid: ValidatedBodyTextRegion[]; rejected: string[] } => {
  const rejected: string[] = [];
  if (input === undefined || input === null) {
    return { valid: [], rejected };   // 없는 것은 결함이 아니다(선택 필드).
  }
  if (!Array.isArray(input)) {
    rejected.push('본문 글자 영역 장부가 목록 형태가 아니어서 진단을 건너뜁니다.');
    return { valid: [], rejected };
  }

  const shaped: BasicBodyTextRegion[] = [];
  input.forEach((raw, i) => {
    const at = `${i + 1}번째 항목`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      rejected.push(`${at}: 글자 영역 형식이 아니어서 제외했습니다.`);
      return;
    }
    const o = raw as Record<string, unknown>;
    const bandIndex = o.bandIndex;
    if (!finite(bandIndex) || !Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= bandCount) {
      rejected.push(`밴드 ${String(bandIndex)}: 존재하지 않는 밴드 번호라 제외했습니다.`);
      return;
    }
    const rc = o.rect as Record<string, unknown> | undefined;
    if (!rc || typeof rc !== 'object'
      || !finite(rc.x) || !finite(rc.y) || !finite(rc.width) || !finite(rc.height)) {
      rejected.push(`밴드 ${bandIndex}: 글자 영역 좌표가 없어 제외했습니다.`);
      return;
    }
    const rect = { x: rc.x, y: rc.y, width: rc.width, height: rc.height };
    if (rect.width <= 0 || rect.height <= 0) {
      rejected.push(`밴드 ${bandIndex}: 글자 영역 크기가 0 이하라 제외했습니다.`);
      return;
    }
    if (!inUnit(rect.x) || !inUnit(rect.y) || !inUnit(rect.x + rect.width) || !inUnit(rect.y + rect.height)) {
      rejected.push(`밴드 ${bandIndex}: 글자 영역이 밴드 범위(0~1)를 벗어나 제외했습니다.`);
      return;
    }
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) {
      rejected.push(`밴드 ${bandIndex}: 옮길 문구가 비어 있어 제외했습니다.`);
      return;
    }
    const role = o.role as BasicBodyTextRegion['role'];
    if (!ROLES.includes(role)) {
      rejected.push(`밴드 ${bandIndex}: 알 수 없는 글자 종류(${String(o.role)})라 제외했습니다.`);
      return;
    }
    const action = o.action as BasicBodyTextRegion['action'];
    if (!ACTIONS.includes(action)) {
      rejected.push(`밴드 ${bandIndex}: 알 수 없는 처리 방식(${String(o.action)})이라 제외했습니다.`);
      return;
    }
    shaped.push({
      bandIndex, rect, text, role, action,
      reviewNote: typeof o.reviewNote === 'string' ? o.reviewNote : '',
    });
  });

  // 순서를 먼저 고정한 뒤 겹침을 본다 → 입력 순서가 바뀌어도 같은 쪽이 남는다.
  shaped.sort((a, b) => (a.bandIndex - b.bandIndex) || (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));

  const valid: ValidatedBodyTextRegion[] = [];
  for (const r of shaped) {
    const clash = valid.find((v) => v.bandIndex === r.bandIndex && iou(v.rect, r.rect) >= OVERLAP_IOU_LIMIT);
    if (clash) {
      rejected.push(`밴드 ${r.bandIndex}: 이미 적은 글자 영역과 겹쳐 제외했습니다("${r.text.slice(0, 12)}").`);
      continue;
    }
    valid.push({ ...r, id: regionId(r) });
  }
  return { valid, rejected };
};

// ── 좌표 투영 : 밴드 0..1 → 본문에 실린 원본 파일 픽셀 ────────────────────────
//   AI 는 픽셀을 모른다. 밴드 기준 비율만 답하고, 픽셀 환산은 여기 한 곳에서만 한다.
//   반올림 규칙도 여기 한 곳에 고정한다 — 네 변을 각각 반올림하고 폭·높이는 그 차이로 구한다
//   (폭을 따로 반올림하면 오른쪽 변이 1px 씩 밀려 마스크가 글자를 덜 덮는 일이 생긴다).

/** 본문에 실제로 실린 그 원본 파일 기준 픽셀 사각형. */
export interface ProjectedBodyRegion {
  sourceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 밴드 기준 0..1 좌표 → 본문에 실린 원본 파일의 픽셀 좌표.
 *   `bodyCropY` = 그 파일에 적용된 본문 시작 크롭(없으면 0). **정확히 한 번만** 뺀다.
 *   범위를 벗어나거나 크기 정보가 없으면 **보정하지 않고 null 로 거부**한다.
 */
export const projectRegionToSource = (
  region: ValidatedBodyTextRegion,
  origin: BasicBandOrigin | undefined,
  bodyCropY: number,
): ProjectedBodyRegion | null => {
  if (!origin) return null;
  if (!Number.isInteger(origin.sourceIndex) || origin.sourceIndex < 0) return null;
  if (!finite(origin.y) || origin.y < 0) return null;
  if (!finite(origin.width) || !finite(origin.height) || origin.width <= 0 || origin.height <= 0) return null;
  const crop = finite(bodyCropY) && bodyCropY > 0 ? bodyCropY : 0;

  const left = Math.round(region.rect.x * origin.width);
  const right = Math.round((region.rect.x + region.rect.width) * origin.width);
  const top = Math.round(origin.y + region.rect.y * origin.height) - crop;
  const bottom = Math.round(origin.y + (region.rect.y + region.rect.height) * origin.height) - crop;

  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;          // 반올림 뒤 사라지는 영역은 살리지 않는다
  if (left < 0 || top < 0) return null;              // 본문 시작 위쪽(=본문 밖)
  if (right > origin.width) return null;             // 밴드 폭 = 원본 파일 폭
  return { sourceIndex: origin.sourceIndex, x: left, y: top, width, height };
};

// ── 흰 배경 안전 게이트 (1차 실험은 흰 배경만) ───────────────────────────────
//   설계서 고정값이다. 모든 배경을 처리하려는 최종 규칙이 아니라, 원본을 망가뜨리지 않고
//   실제 GREEN 범위를 재기 위한 보수적인 출발점이다. 색·그라데이션·사진 배경은 지우려 하지 않는다.

/** 글자 사각형 바깥으로 이만큼(px)의 고리를 본다. */
export const WHITE_RING_PX = 3;
/** 고리 픽셀이 "흰색에 가깝다"고 인정되는 최소 채널값(RGB 각각). */
export const WHITE_MIN_CHANNEL = 245;
/** 고리에서 흰 픽셀이 이 비율 이상일 때만 마스크를 허용한다. */
export const WHITE_MIN_RATIO = 0.98;

/** 글자 사각형 + 그 둘레를 담은 픽셀 표본. `inner` 는 표본 안에서 글자 사각형의 위치다. */
export interface RingSample {
  width: number;
  height: number;
  data: ArrayLike<number>;    // RGBA
  inner: { x: number; y: number; width: number; height: number };
}

export interface WhiteRingVerdict {
  safe: boolean;
  ratio: number;      // 고리에서 흰 픽셀 비율(0..1)
  sampled: number;    // 실제로 본 고리 픽셀 수
  reason: string;
}

/**
 * 순수 판정 — 픽셀 배열만 받는다(Canvas·DOM 없음).
 *   고리를 잴 수 없으면(테두리 0px) 안전하지 않다고 본다. 배경색을 추정하거나 메우지 않는다.
 */
export const judgeWhiteRing = (sample: RingSample | undefined | null): WhiteRingVerdict => {
  if (!sample || !sample.data || !(sample.width > 0) || !(sample.height > 0)) {
    return { safe: false, ratio: 0, sampled: 0, reason: '배경 픽셀을 읽지 못해 원본을 유지합니다.' };
  }
  const { width, height, data, inner } = sample;
  let white = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const insideInner = x >= inner.x && x < inner.x + inner.width
        && y >= inner.y && y < inner.y + inner.height;
      if (insideInner) continue;                       // 글자 자체는 보지 않는다
      const i = (y * width + x) * 4;
      total += 1;
      if (data[i] >= WHITE_MIN_CHANNEL && data[i + 1] >= WHITE_MIN_CHANNEL && data[i + 2] >= WHITE_MIN_CHANNEL) white += 1;
    }
  }
  if (total === 0) {
    return { safe: false, ratio: 0, sampled: 0, reason: '글자 둘레를 잴 수 없어 원본을 유지합니다.' };
  }
  const ratio = white / total;
  const safe = ratio >= WHITE_MIN_RATIO;
  return {
    safe,
    ratio,
    sampled: total,
    reason: safe
      ? `글자 둘레 ${Math.round(ratio * 100)}% 가 흰 배경이라 가려도 안전합니다.`
      : `글자 둘레의 흰 배경이 ${Math.round(ratio * 100)}% 뿐이라(기준 98%) 원본을 유지합니다.`,
  };
};

/**
 * Canvas 어댑터 — 실제 이미지에서 글자 사각형 + 둘레만 잘라 픽셀 표본을 만든다.
 *   판정은 하지 않는다(judgeWhiteRing 한 곳). 브라우저가 아니거나 읽기 실패면 null.
 *   전체 이미지를 그리지 않고 필요한 작은 사각형만 그린다(세로 1만 px 통이미지 대비).
 */
export const sampleRegionRing = (
  img: CanvasImageSource,
  rect: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  ringPx: number = WHITE_RING_PX,
): RingSample | null => {
  if (typeof document === 'undefined' || !img) return null;
  const sx = Math.max(0, rect.x - ringPx);
  const sy = Math.max(0, rect.y - ringPx);
  const ex = Math.min(imageWidth, rect.x + rect.width + ringPx);
  const ey = Math.min(imageHeight, rect.y + rect.height + ringPx);
  const w = ex - sx;
  const h = ey - sy;
  if (!(w > 0) || !(h > 0)) return null;
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return { width: w, height: h, data, inner: { x: rect.x - sx, y: rect.y - sy, width: rect.width, height: rect.height } };
  } catch { return null; }   // CORS taint 등 → 원본 보존
};

// ── 진단 결과 조립 : 계획(순수) → 픽셀 확인(어댑터) → 신호(순수) ─────────────

export type BodyOverlaySignal = 'green' | 'yellow' | 'red';
export type BodyOverlayOutcome = 'replaced' | 'kept_raster' | 'rejected' | 'pending';

export interface BodyOverlayDecision {
  id: string;
  bandIndex: number;
  role: BasicBodyTextRegion['role'];
  action: BasicBodyTextRegion['action'];
  text: string;
  reviewNote: string;
  outcome: BodyOverlayOutcome;
  reason: string;
  bodySourceIndex: number;                 // 본문에 실린 파일 순번(-1 = 본문 밖)
  rect: ProjectedBodyRegion | null;
}

/** 본문에 실제로 실린 원본 파일 1장(진단 미리보기가 그대로 보여 준다). */
export interface OverlayBodyImage {
  bodySourceIndex: number;
  sourceIndex: number;
  src: string;
  width: number;
  height: number;
}

export interface OverlayCandidate {
  region: ValidatedBodyTextRegion;
  projected: ProjectedBodyRegion;
  bodySourceIndex: number;
}

export interface OverlayPlan {
  detected: number;
  candidates: OverlayCandidate[];   // 픽셀 확인이 필요한 replace 후보만
  decisions: BodyOverlayDecision[]; // 검출된 전부(후보는 outcome='pending')
  rejected: string[];
}

export interface BasicBodyOverlayExperiment {
  signal: BodyOverlaySignal;
  detected: number;
  decisions: BodyOverlayDecision[];
  images: OverlayBodyImage[];
  rejected: string[];
  notes: string[];
}

/**
 * 검출된 글자 영역을 "픽셀을 보기 전"까지 정리한다(순수).
 *   · keep_raster · 본문 밖 파일 · 좌표 거부는 여기서 확정된다.
 *   · replace 후보만 candidates 로 남아 호출부가 픽셀을 확인한다.
 */
export const planOverlayRegions = (input: {
  regions: unknown;
  bandCount: number;
  origins: BasicBandOrigin[];
  cropY: (sourceIndex: number) => number;
  bodySourceIndexOf: (sourceIndex: number) => number;
}): OverlayPlan => {
  const { valid, rejected } = validateBodyTextRegions(input.regions, input.bandCount);
  const decisions: BodyOverlayDecision[] = [];
  const candidates: OverlayCandidate[] = [];

  for (const region of valid) {
    const origin = input.origins[region.bandIndex];
    const base = {
      id: region.id, bandIndex: region.bandIndex, role: region.role, action: region.action,
      text: region.text, reviewNote: region.reviewNote,
    };
    const bodySourceIndex = origin ? input.bodySourceIndexOf(origin.sourceIndex) : -1;
    if (!origin || bodySourceIndex < 0) {
      decisions.push({
        ...base, outcome: 'rejected', bodySourceIndex: -1, rect: null,
        reason: '본문에 실리지 않은 원본(원본 메인섹션 등)이라 진단에서 제외했습니다.',
      });
      continue;
    }
    const projected = projectRegionToSource(region, origin, input.cropY(origin.sourceIndex));
    if (!projected) {
      decisions.push({
        ...base, outcome: 'rejected', bodySourceIndex, rect: null,
        reason: '좌표를 원본 픽셀로 되돌릴 수 없어(범위 밖·크기 미상) 원본을 유지합니다.',
      });
      continue;
    }
    if (region.action === 'keep_raster') {
      decisions.push({
        ...base, outcome: 'kept_raster', bodySourceIndex, rect: projected,
        reason: region.reviewNote || '그림 의미의 일부라 원본을 그대로 둡니다.',
      });
      continue;
    }
    decisions.push({ ...base, outcome: 'pending', bodySourceIndex, rect: projected, reason: '배경 확인 대기' });
    candidates.push({ region, projected, bodySourceIndex });
  }

  return { detected: valid.length, candidates, decisions, rejected };
};

/**
 * 점수표 없이 신호를 정한다. 상품명·가중치를 쓰지 않는다.
 *   GREEN 허용 교체 1개 이상 + 보존·거부 0개 / YELLOW 둘이 함께 / RED 검출은 있으나 허용 교체 0개.
 *   검출 자체가 0건이면 신호가 없다(null).
 */
export const computeOverlaySignal = (
  decisions: BodyOverlayDecision[],
  rejectedCount = 0,
): BodyOverlaySignal | null => {
  const replaced = decisions.filter((d) => d.outcome === 'replaced').length;
  const preserved = decisions.filter((d) => d.outcome === 'kept_raster' || d.outcome === 'rejected').length + rejectedCount;
  if (replaced === 0 && preserved === 0) return null;
  if (replaced === 0) return 'red';
  return preserved === 0 ? 'green' : 'yellow';
};

/** 픽셀 확인 결과를 받아 진단을 마감한다(순수). 판정이 없으면 원본 보존이다. */
export const finalizeOverlayExperiment = (
  plan: OverlayPlan,
  verdicts: Record<string, WhiteRingVerdict | null | undefined>,
  images: OverlayBodyImage[],
): BasicBodyOverlayExperiment => {
  const decisions: BodyOverlayDecision[] = plan.decisions.map((d) => {
    if (d.outcome !== 'pending') return d;
    const v = verdicts[d.id];
    if (v && v.safe) return { ...d, outcome: 'replaced' as const, reason: v.reason };
    return {
      ...d,
      outcome: 'kept_raster' as const,
      reason: v ? v.reason : '배경 픽셀을 읽지 못해 원본을 유지합니다.',
    };
  });

  const replaced = decisions.filter((d) => d.outcome === 'replaced').length;
  const kept = decisions.filter((d) => d.outcome === 'kept_raster').length;
  const dropped = decisions.filter((d) => d.outcome === 'rejected').length;
  const notes = [
    `본문 글자 영역 ${plan.detected}건 검출 — 교체 가능 ${replaced} · 원본 보존 ${kept} · 제외 ${dropped + plan.rejected.length}.`,
    '이 진단은 기존 본문 출력·HTML 저장·이미지 저장에 연결되지 않습니다(가능성 시험 전용).',
  ];
  return {
    signal: computeOverlaySignal(decisions, plan.rejected.length) ?? 'red',
    detected: plan.detected,
    decisions,
    images,
    rejected: plan.rejected,
    notes,
  };
};
