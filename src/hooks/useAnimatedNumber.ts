import { useEffect, useRef, useState } from 'react';

// 숫자 카운터 애니메이션 hook (ease-out, RAF). CS/상품 대시보드 공용.
//   - prefers-reduced-motion 환경에서는 애니메이션 비활성(즉시 표시).
//   - 데이터값은 변형하지 않고 "표시값"만 보간. unmount 시 RAF cleanup.

export interface UseAnimatedNumberOptions {
  durationMs?: number;
  decimals?: number;
  disabled?: boolean;
}

const prefersReducedMotion = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const roundTo = (n: number, decimals: number): number => {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
};

export function useAnimatedNumber(value: number, options: UseAnimatedNumberOptions = {}): number {
  const { durationMs = 450, decimals = 0, disabled = false } = options;
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safeTarget);
  const fromRef = useRef(safeTarget);

  useEffect(() => {
    const to = Number.isFinite(value) ? value : 0;
    const from = fromRef.current;
    if (from === to) { fromRef.current = to; return; }
    const hasRaf = typeof requestAnimationFrame !== 'undefined';
    const immediate = disabled || !hasRaf || prefersReducedMotion() || durationMs <= 0;
    // setState는 RAF/타이머 콜백 안에서만(effect 본문 동기 setState 회피).
    if (immediate) {
      fromRef.current = to;
      if (hasRaf) { const raf = requestAnimationFrame(() => setDisplay(to)); return () => cancelAnimationFrame(raf); }
      const id = setTimeout(() => setDisplay(to), 0);
      return () => clearTimeout(id);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number): void => {
      const p = Math.min(1, (t - start) / durationMs);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, disabled]);

  return roundTo(display, decimals);
}
