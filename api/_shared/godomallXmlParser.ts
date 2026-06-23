// 고도몰5 Open API XML 응답 파서
// - fast-xml-parser로 XML string -> JS object
// - header.code / header.msg 추출
// - code가 성공이 아니면 실패 처리
// - return(데이터) 영역 추출 헬퍼 제공

import { XMLParser } from 'fast-xml-parser';

export interface GodomallParseResult {
  ok: boolean;
  code: string;
  msg: string;
  root: Record<string, unknown>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false, // 숫자/문자 혼동 방지 위해 값은 문자열 유지
  parseAttributeValue: false
});

// 고도몰 응답은 성공 시 보통 code "000" 형태. "00.." / "0" / "200" 류를 성공으로 간주.
const SUCCESS_CODES = new Set(['000', '0000', '00', '0', '200', 'success', 'OK']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// 중첩 객체 어디에 있든 header({code,msg})를 방어적으로 탐색
const findHeader = (node: unknown, depth = 0): { code?: string; msg?: string } | null => {
  if (depth > 6 || !isObject(node)) return null;
  if (isObject(node.header)) {
    const h = node.header as Record<string, unknown>;
    return {
      code: h.code !== undefined ? String(h.code) : undefined,
      msg: h.msg !== undefined ? String(h.msg) : (h.message !== undefined ? String(h.message) : undefined)
    };
  }
  for (const value of Object.values(node)) {
    const found = findHeader(value, depth + 1);
    if (found) return found;
  }
  return null;
};

export const parseGodomallXml = (xml: string): GodomallParseResult => {
  let root: Record<string, unknown>;
  try {
    const parsed = parser.parse(xml);
    root = isObject(parsed) ? parsed : {};
  } catch {
    return { ok: false, code: 'PARSE_ERROR', msg: 'Failed to parse XML response.', root: {} };
  }

  const header = findHeader(root);
  const code = header?.code ?? '';
  const msg = header?.msg ?? '';

  // header가 아예 없으면, 데이터가 존재하는지로 성공을 판단 (스펙 편차 방어)
  if (!header) {
    return { ok: true, code: code || 'NO_HEADER', msg: msg || '', root };
  }

  const ok = SUCCESS_CODES.has(code);
  return { ok, code, msg, root };
};

// 단일 객체/배열/누락을 항상 배열로 정규화
export const asArray = (value: unknown): Record<string, unknown>[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.filter(isObject) as Record<string, unknown>[];
  if (isObject(value)) return [value];
  return [];
};

// 트리 전체에서 특정 key의 리스트를 깊이 우선으로 탐색
const findKeyDeep = (node: unknown, key: string, depth = 0): Record<string, unknown>[] => {
  if (depth > 8 || !isObject(node)) return [];
  if (key in node) {
    const arr = asArray(node[key]);
    if (arr.length > 0) return arr;
  }
  for (const value of Object.values(node)) {
    const found = findKeyDeep(value, key, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
};

// 후보 키를 "우선순위 순서대로" 트리 전체에서 탐색한다.
// 핵심: 구체 키(goods/order)를 래퍼 키(data/list/row)보다 먼저 찾아야
// <data>...</data> 같은 래퍼 엘리먼트를 리스트로 오인하지 않는다.
export const extractList = (
  node: unknown,
  candidateKeys: string[]
): Record<string, unknown>[] => {
  for (const key of candidateKeys) {
    const found = findKeyDeep(node, key);
    if (found.length > 0) return found;
  }
  return [];
};
