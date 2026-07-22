// ────────────────────────────────────────────────────────────────────────────
// Inquiry Status Contract — CS 문의 상태 단일 정의(Single Source of Truth) · RC-1 C-4
//
// 배경: 문의 상태를 소비자 18곳이 제각각 해석(===unanswered / 5-alt 정규식 / !isAnswered /
//   !=='답변완료' 한국어)해 같은 문의셋의 미답변/미처리가 1·5·7·8로 발산했다.
//   또 생산자가 영어(unanswered/answered/needs_human)와 한국어(미답변/답변완료)로 나뉘어 있었다.
//
// 계약(사장 확정) canonical 6상태: unanswered / in_progress / on_hold / needs_human / answered / unknown
//   미답변 = unanswered만 · 관리자확인필요 = needs_human만 · 답변완료 = answered만
//   미처리(unresolved) = answered를 제외한 전부(= unanswered+in_progress+on_hold+needs_human+unknown)
//   unknown = 해석 못한 원시 상태. answered/unanswered로 뭉개지 않고 별도 수량 + 원시값 근거 보존.
//     미처리·attention에는 포함.
//
// 원칙: 소비자에서 원시 문자열 비교를 복붙하지 않는다. 입력 경계에서 1회 정규화하고(normalizeInquiryRecord),
//   소비자는 canonical status와 공통 predicate만 쓴다. normalize는 idempotent(안전장치이지 중복 정규화의 근거 아님).
//   범위: 'C-4 문의 상태 입력 정규화'. CommerceSnapshot 전체 정규화가 아니다.
// ────────────────────────────────────────────────────────────────────────────

export type InquiryStatus = 'unanswered' | 'in_progress' | 'on_hold' | 'needs_human' | 'answered' | 'unknown';
export type NormalizationReason = 'known_alias' | 'empty' | 'unrecognized' | 'canonical';

export interface InquiryStatusResult {
  canonicalStatus: InquiryStatus;
  rawStatus: string;
  normalizationReason: NormalizationReason;
}

const CANONICAL = new Set<InquiryStatus>(['unanswered', 'in_progress', 'on_hold', 'needs_human', 'answered', 'unknown']);
export const isInquiryStatus = (v: unknown): v is InquiryStatus => typeof v === 'string' && CANONICAL.has(v as InquiryStatus);

// 알려진 원시 별칭만 명시적으로 매핑한다(의미 추측 금지). 영문은 소문자, 한글은 원문 키.
const ALIAS: Record<string, InquiryStatus> = {
  unanswered: 'unanswered', pending: 'unanswered', open: 'unanswered', '미답변': 'unanswered',
  in_progress: 'in_progress', processing: 'in_progress', '처리중': 'in_progress',
  hold: 'on_hold', on_hold: 'on_hold', '보류': 'on_hold',
  needs_human: 'needs_human',
  answered: 'answered', resolved: 'answered', closed: 'answered', done: 'answered', '답변완료': 'answered', '처리완료': 'answered'
};

/**
 * 원시 상태 문자열 → canonical + 근거. 공백·대소문자만 정리(의미 추측 금지). idempotent.
 *   빈 값/undefined → unknown(empty) · 매핑 없는 값 → unknown(unrecognized).
 *   이미 canonical인 문자열은 그대로 canonical로 인정(reason=canonical).
 */
export function normalizeInquiryStatus(raw: unknown): InquiryStatusResult {
  const rawStatus = raw === undefined || raw === null ? '' : String(raw);
  const trimmed = rawStatus.trim();
  if (trimmed === '') return { canonicalStatus: 'unknown', rawStatus, normalizationReason: 'empty' };
  if (isInquiryStatus(trimmed)) return { canonicalStatus: trimmed, rawStatus, normalizationReason: 'canonical' };
  const c = ALIAS[trimmed.toLowerCase()] ?? ALIAS[trimmed];
  if (c) return { canonicalStatus: c, rawStatus, normalizationReason: 'known_alias' };
  return { canonicalStatus: 'unknown', rawStatus, normalizationReason: 'unrecognized' };
}

// 소비자 predicate — 원시 또는 canonical 어느 쪽이든 안전(idempotent).
const canon = (raw: unknown): InquiryStatus => (isInquiryStatus(raw) ? raw : normalizeInquiryStatus(raw).canonicalStatus);
export const isUnanswered = (raw: unknown): boolean => canon(raw) === 'unanswered';
export const isInProgress = (raw: unknown): boolean => canon(raw) === 'in_progress';
export const isOnHold = (raw: unknown): boolean => canon(raw) === 'on_hold';
export const isNeedsHuman = (raw: unknown): boolean => canon(raw) === 'needs_human';
export const isAnswered = (raw: unknown): boolean => canon(raw) === 'answered';
export const isUnknown = (raw: unknown): boolean => canon(raw) === 'unknown';
/** 미처리 = answered가 아닌 전부(unanswered+in_progress+on_hold+needs_human+unknown). */
export const isUnresolved = (raw: unknown): boolean => canon(raw) !== 'answered';

// canonical → 사용자 표시 한국어 라벨(단일 정의). 내부 영문 키를 화면에 노출하지 않는다.
export const INQUIRY_STATUS_LABEL_KO: Record<InquiryStatus, string> = {
  unanswered: '미답변', in_progress: '처리 중', on_hold: '보류', needs_human: '관리자 확인 필요', answered: '답변완료', unknown: '상태 미확인'
};
export const inquiryStatusKo = (raw: unknown): string => INQUIRY_STATUS_LABEL_KO[normalizeInquiryStatus(raw).canonicalStatus];

export interface InquiryStatusSummary {
  unanswered: number;
  inProgress: number;
  onHold: number;
  needsHuman: number;
  answered: number;
  unknown: number;
  unresolved: number;   // = 미처리 (answered 제외 전부)
  attention: number;    // = 미처리 (unknown·needs_human 포함)
  total: number;
  unknownSamples: string[]; // unknown 원시값 진단(상태 문자열만·중복제거·길이제한, PII/본문 금지)
}

const MAX_UNKNOWN_SAMPLES = 20;
const MAX_SAMPLE_LEN = 40;

/** 원시 상태 목록 → 상태별 집계. unknown 원시값 근거(unknownSamples) 보존. */
export function summarizeInquiryStatus(raws: unknown[]): InquiryStatusSummary {
  let unanswered = 0, inProgress = 0, onHold = 0, needsHuman = 0, answered = 0, unknown = 0;
  const samples = new Set<string>();
  for (const raw of raws) {
    const { canonicalStatus, rawStatus } = normalizeInquiryStatus(raw);
    if (canonicalStatus === 'unanswered') unanswered += 1;
    else if (canonicalStatus === 'in_progress') inProgress += 1;
    else if (canonicalStatus === 'on_hold') onHold += 1;
    else if (canonicalStatus === 'needs_human') needsHuman += 1;
    else if (canonicalStatus === 'answered') answered += 1;
    else {
      unknown += 1;
      if (samples.size < MAX_UNKNOWN_SAMPLES) samples.add(rawStatus.trim().slice(0, MAX_SAMPLE_LEN) || '(빈 값)');
    }
  }
  const unresolved = unanswered + inProgress + onHold + needsHuman + unknown;
  const total = unanswered + inProgress + onHold + needsHuman + answered + unknown;
  return { unanswered, inProgress, onHold, needsHuman, answered, unknown, unresolved, attention: unresolved, total, unknownSamples: [...samples] };
}

/**
 * 입력 경계 정규화: 문의 record에 canonicalStatus·rawStatus·normalizationReason을 부여한다.
 * 이미 정규화된 record는 재정규화하지 않고 최초 근거를 보존한다(idempotent, 저장 데이터 hydration 호환).
 */
export function normalizeInquiryRecord<T extends { status?: unknown; canonicalStatus?: InquiryStatus; rawStatus?: string; normalizationReason?: NormalizationReason }>(
  rec: T
): T & InquiryStatusResult {
  if (rec.canonicalStatus && CANONICAL.has(rec.canonicalStatus) && rec.rawStatus !== undefined && rec.normalizationReason) {
    return rec as T & InquiryStatusResult;
  }
  const n = normalizeInquiryStatus(rec.status);
  return { ...rec, canonicalStatus: n.canonicalStatus, rawStatus: n.rawStatus, normalizationReason: n.normalizationReason };
}

/**
 * 입력 경계용 배치 정규화: 문의 목록을 1회 canonical화(각 record는 idempotent).
 * 스냅샷 조립/어댑터/저장 복원 경계에서 한 번만 호출한다. 저장→복원 후 재호출해도 최초 근거를 보존.
 */
export function normalizeInquiryRecords<T extends { status?: unknown; canonicalStatus?: InquiryStatus; rawStatus?: string; normalizationReason?: NormalizationReason }>(
  list: readonly T[] | undefined | null
): Array<T & InquiryStatusResult> {
  return (list ?? []).map(normalizeInquiryRecord);
}
