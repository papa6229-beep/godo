// 공통 커머스 차트 유틸 (순수 함수, React 비의존). ProductTeamDashboard TrendChart 패턴을 공통화.
export const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const wonShort = (n: number): string => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return `${Math.round(n).toLocaleString('ko-KR')}`;
};
export const countFmt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}건`;

// y축 상단을 보기 좋은 값으로 올림(1/2/5 × 10^k).
export const niceCeil = (v: number): number => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * mag;
};

// Catmull-Rom → cubic bezier (부드러운 추세선). 수치는 점 좌표 그대로 — 시각 표현만 매끄럽게.
export const smoothPath = (pts: { x: number; y: number }[]): string => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
};

// 라벨이 많을 때 x축 라벨 표시 간격(겹침 방지). 버킷은 유지하고 라벨만 축약.
export const labelStep = (n: number): number => (n <= 12 ? 1 : n <= 18 ? 2 : n <= 31 ? 3 : Math.ceil(n / 12));
