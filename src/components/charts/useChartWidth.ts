import { useEffect, useRef, useState, type RefObject } from 'react';

// 컨테이너의 실제 렌더 폭을 측정해 SVG viewBox 폭으로 사용 → 넓은 카드에서도 plot이 좌우 여백 없이 꽉 참.
//   (고정 viewBox + preserveAspectRatio="meet" 조합이 좁은 가운데로 몰리던 문제 해결)
export function useChartWidth(fallback: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = Math.round(e.contentRect.width);
        if (cw > 40) setWidth(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
