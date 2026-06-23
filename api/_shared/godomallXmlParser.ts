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

// 트리 내 모든 "객체 배열" 노드를 경로와 함께 수집
// (fast-xml-parser는 반복 형제 태그를 배열로 접는다 → 12개 상품이면 길이 12 배열)
export interface ArrayNodeInfo {
  path: string;
  leafKey: string;
  items: Record<string, unknown>[];
}

export const collectObjectArrays = (
  node: unknown,
  path = '',
  depth = 0,
  out: ArrayNodeInfo[] = []
): ArrayNodeInfo[] => {
  if (depth > 10 || !isObject(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) {
      const objs = value.filter(isObject) as Record<string, unknown>[];
      if (objs.length > 0) {
        out.push({ path: childPath, leafKey: key, items: objs });
        // 배열 원소 안에도 중첩 배열이 있을 수 있으나, 리스트 추출에는 상위 배열로 충분
      }
    } else if (isObject(value)) {
      collectObjectArrays(value, childPath, depth + 1, out);
    }
  }
  return out;
};

// 리스트 추출 — 태그명에 의존하지 않는 견고한 전략:
//  1) 트리 내 "객체 배열"들 중 후보 키 이름과 일치하는 배열(가장 큰 것) 우선
//  2) 없으면 트리 전체에서 가장 큰 객체 배열 (반복 엘리먼트 = 실제 리스트)
//  3) 배열이 전혀 없으면(단건 응답) 후보 키의 단일 객체를 우선순위대로 탐색
// 이로써 <data> 같은 래퍼 단일 객체를 리스트로 오인하던 문제를 제거한다.
export const extractList = (
  node: unknown,
  candidateKeys: string[]
): Record<string, unknown>[] => {
  const arrays = collectObjectArrays(node);

  if (arrays.length > 0) {
    const byCandidate = arrays
      .filter((a) => candidateKeys.includes(a.leafKey))
      .sort((x, y) => y.items.length - x.items.length);
    if (byCandidate.length > 0) return byCandidate[0].items;

    return arrays.slice().sort((x, y) => y.items.length - x.items.length)[0].items;
  }

  // 배열이 없으면 단건 응답으로 간주하고 후보 키 단일 객체 탐색
  for (const key of candidateKeys) {
    const found = findKeyDeep(node, key);
    if (found.length > 0) return found;
  }
  return [];
};
