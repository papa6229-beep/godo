// 고도몰5 공통코드조회(Code_Search.php) 매퍼 + 정규화 (Common Code READ v0)
//
// 출처: docs/godomall5_openAPI_spec_v1.0_20250616 §6.1(Code_Search), §7.2(공통코드 code_type)
//   - Code_Search Request: code_type(STRING), scmNo(INTEGER, 선택).
//   - Response 구조는 **code_type마다 다르다**(§7.2 p84-86). 각 type의 code/label 필드가 상이.
//   - 코드값(영문/숫자)은 PDF에서 정상 추출. 한글 라벨은 실제 응답(labelRaw)에서 받는다.
//
// 보안: 이 매퍼는 정규화만 담당. raw XML 전문/키는 다루지 않는다.
//   - 기존 godomallOrderCodes.ts(정적 enum: 주문상태/결제수단/채널 등)와 역할이 다르다.
//     Code_Search는 운영자가 설정한 동적 코드(공급사/배송/클레임은행/택배사/아이콘 등)를 조회.

import { asArray, toStringValue, toNumber } from './godomallOrderNormalize.js';

// ── 허용 code_type (PDF §7.2 확정 13종) ──────────────────────────────────────
export const CODE_SEARCH_ALLOWLIST = [
  'scm',
  'imagePath',
  'memberGroup',
  'delivery',
  'deliveryInfo',
  'asInfo',
  'refundInfo',
  'exchangeInfo',
  'claimCode',
  'claimPayment',
  'claimBank',
  'deliveryCompany',
  'iconInfo'
] as const;

export type GodomallCodeType = (typeof CODE_SEARCH_ALLOWLIST)[number];

export function isAllowedCodeType(value: unknown): value is GodomallCodeType {
  return typeof value === 'string' && (CODE_SEARCH_ALLOWLIST as readonly string[]).includes(value);
}

// ── code_type별 code/label 필드 매핑 (PDF §7.2) ──────────────────────────────
type FieldPair = { codeField: string; labelField: string };
const CODE_FIELD_MAP: Record<GodomallCodeType, FieldPair> = {
  scm: { codeField: 'scmNo', labelField: 'companyNm' },
  imagePath: { codeField: 'storageName', labelField: 'imageStorage' },
  memberGroup: { codeField: 'sno', labelField: 'groupNm' },
  delivery: { codeField: 'sno', labelField: 'method' },
  deliveryInfo: { codeField: 'informCd', labelField: 'informNm' },
  asInfo: { codeField: 'informCd', labelField: 'informNm' },
  refundInfo: { codeField: 'informCd', labelField: 'informNm' },
  exchangeInfo: { codeField: 'informCd', labelField: 'informNm' },
  claimCode: { codeField: 'itemCd', labelField: 'itemNm' },
  claimPayment: { codeField: 'itemCd', labelField: 'itemNm' },
  claimBank: { codeField: 'itemCd', labelField: 'itemNm' },
  deliveryCompany: { codeField: 'invoiceCompanySno', labelField: 'invoiceCompanyName' },
  iconInfo: { codeField: 'iconCd', labelField: 'iconNm' }
};

// 매핑이 비거나 실응답 필드가 달라도 견고하게: 일반 후보로 code/label 추론.
const GENERIC_CODE_CANDIDATES = ['code', 'cd', 'itemCd', 'sno', 'no'];
const GENERIC_LABEL_CANDIDATES = ['label', 'nm', 'name', 'itemNm', 'title'];

const pickByExactThenSuffix = (rec: Record<string, unknown>, exact: string, candidates: string[]): string => {
  // 1) 정확 키
  if (toStringValue(rec[exact])) return toStringValue(rec[exact]);
  // 2) 후보 정확 키
  for (const c of candidates) {
    if (toStringValue(rec[c])) return toStringValue(rec[c]);
  }
  // 3) 접미사 매칭(대소문자 무시): *Cd/*No/*Sno (code), *Nm/*Name (label)
  const keys = Object.keys(rec);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().endsWith(c.toLowerCase()) && toStringValue(rec[k]));
    if (hit) return toStringValue(rec[hit]);
  }
  return '';
};

// ── 표준 코드 타입 ───────────────────────────────────────────────────────────
export type GodomallCommonCode = {
  codeType: string;
  code: string;
  labelKo?: string; // 한글 라벨(실응답). labelRaw와 동일 값(별칭) — 표시용.
  labelRaw?: string; // 응답 원본 라벨 문자열
  sortNo?: number;
  useFl?: string;
  raw?: Record<string, unknown>;
};

export type GodomallCodeSearchResult = {
  codeType: string;
  total: number;
  codes: GodomallCommonCode[];
  source: 'real' | 'mock';
};

// 단일 객체 / 배열 / 빈값 → 정규화된 코드 배열. (빈 응답 guard 포함)
export function normalizeCommonCodes(rawItems: unknown, codeType: string): GodomallCommonCode[] {
  const items = asArray<unknown>(rawItems).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  );
  const map = (CODE_FIELD_MAP as Record<string, FieldPair | undefined>)[codeType];
  const codeField = map?.codeField ?? 'code';
  const labelField = map?.labelField ?? 'nm';

  const out: GodomallCommonCode[] = [];
  for (const rec of items) {
    const code = pickByExactThenSuffix(rec, codeField, GENERIC_CODE_CANDIDATES);
    const label = pickByExactThenSuffix(rec, labelField, GENERIC_LABEL_CANDIDATES);
    // code/label 둘 다 없으면 의미 없는 항목 → 제외(빈 응답/래퍼 guard)
    if (!code && !label) continue;
    const sortRaw = rec['sortNo'] ?? rec['sort'] ?? rec['orderNo'];
    const code1: GodomallCommonCode = {
      codeType,
      code,
      ...(label ? { labelKo: label, labelRaw: label } : {}),
      ...(sortRaw !== undefined && toStringValue(sortRaw) ? { sortNo: toNumber(sortRaw) } : {}),
      ...(toStringValue(rec['useFl']) ? { useFl: toStringValue(rec['useFl']) } : {})
    };
    out.push(code1);
  }
  return out;
}

// 리스트 추출 후보 키 (Code_Search 응답 리스트). 태그명 비의존 추출과 함께 사용.
export const CODE_LIST_KEYS = ['code_data', 'codeData', 'code', 'item', 'list', 'row', 'data'];

// ── mock fallback (라이브 미설정/실패 시, 반드시 source:'mock'으로 표시) ──────
// 실제 코드가 아니라 구조 데모용 최소 샘플. real처럼 표시 금지.
const MOCK_CODES: Partial<Record<GodomallCodeType, GodomallCommonCode[]>> = {
  claimBank: [
    { codeType: 'claimBank', code: 'SYN-BANK-01', labelKo: '(mock) 테스트은행', labelRaw: '(mock) 테스트은행' }
  ],
  deliveryCompany: [
    { codeType: 'deliveryCompany', code: 'SYN-DLV-01', labelKo: '(mock) 테스트택배', labelRaw: '(mock) 테스트택배' }
  ]
};

export function getMockCommonCodes(codeType: string): GodomallCommonCode[] {
  return (MOCK_CODES as Record<string, GodomallCommonCode[] | undefined>)[codeType] ?? [];
}
