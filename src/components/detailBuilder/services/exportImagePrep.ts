// @ts-nocheck — export(캔버스 캡처) 직전, CDN URL 이미지를 서버 base64로 지연 변환.
// 배경(2026-07-09 확정): 엑셀에서 온 flowImages/섬네일 소스는 크로스오리진 CDN URL(CORS 헤더 없음)
//  → html-to-image가 캔버스에 그릴 때 taint → toJpeg가 SecurityError.
// 해결: 표시는 URL 그대로(저장소 안 부풀림), export 순간에만 서버가 base64로 바꿔 끼운다.
// 실패한 이미지는 원본 URL을 유지(부분 성공) — 전량 실패로 저장 자체가 막히는 것보단 낫다.

import type { ProductData } from '../types';

const isRemote = (u: unknown): boolean =>
  typeof u === 'string' && /^https?:\/\//i.test(u) && !u.startsWith('data:');

// data 안에서 서버 변환이 필요한(원격 http) 이미지 URL이 하나라도 있는지.
export const hasRemoteImages = (data: ProductData): boolean => {
  const flow = Array.isArray(data.flowImages) ? data.flowImages : [];
  return flow.some(isRemote) || isRemote((data as any).mainImage);
};

// 단일 URL → data URL(base64). 실패 시 원본 URL 반환.
const convertUrl = async (url: string): Promise<string> => {
  if (!isRemote(url)) return url;
  try {
    const res = await fetch('/api/detail?action=image-base64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.ok && typeof json.dataUrl === 'string') return json.dataUrl;
  } catch {
    /* 네트워크 실패 → 원본 유지 */
  }
  return url;
};

export interface ExportPrepResult {
  data: ProductData;      // base64로 치환된 사본
  total: number;          // 시도한 원격 이미지 수
  failed: number;         // 변환 실패(원본 유지)한 수
}

// data 사본을 만들고 원격 이미지 URL을 모두 base64로 치환.
// 동일 URL 중복 fetch 방지(캐시). flowImages 순서 보존.
export const buildExportableData = async (data: ProductData): Promise<ExportPrepResult> => {
  const cache = new Map<string, string>();
  let total = 0;
  let failed = 0;

  const resolve = async (url: string): Promise<string> => {
    if (!isRemote(url)) return url;
    total++;
    if (cache.has(url)) return cache.get(url)!;
    const converted = await convertUrl(url);
    if (converted === url) failed++; // 변환 안 됨(실패)
    cache.set(url, converted);
    return converted;
  };

  const flow = Array.isArray(data.flowImages) ? data.flowImages : [];
  const flowImages = await Promise.all(flow.map((u) => resolve(u)));
  const mainImage = isRemote((data as any).mainImage)
    ? await resolve((data as any).mainImage)
    : (data as any).mainImage;

  return {
    data: { ...data, flowImages, mainImage },
    total,
    failed,
  };
};

// 요소 안의 모든 <img>가 실제로 로드 완료될 때까지 대기(재렌더 직후 캡처 전).
export const waitForImages = async (el: HTMLElement | null): Promise<void> => {
  if (!el) return;
  const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            const done = () => {
              img.removeEventListener('load', done);
              img.removeEventListener('error', done);
              res();
            };
            img.addEventListener('load', done);
            img.addEventListener('error', done);
          }),
    ),
  );
};
