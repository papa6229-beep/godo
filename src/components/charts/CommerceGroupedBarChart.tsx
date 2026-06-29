import React, { useState } from 'react';
import { won, wonShort, niceCeil, labelStep } from './commerceChartUtils';
import { CommerceChartTooltip } from './CommerceChartTooltip';

// 연도/세그먼트 비교: x축=구간(1월~12월), 각 구간마다 series(2024/2025…) 세로 막대를 나란히. SVG 직접 구현.
export type CommerceGroupedBarValue = { key: string; label: string; value: number; orderCount?: number; delta?: number; deltaRate?: number };
export type CommerceGroupedBarChartPoint = { key: string; label: string; values: CommerceGroupedBarValue[] };
export type CommerceGroupedBarChartProps = {
  title?: string;
  points: CommerceGroupedBarChartPoint[];
  valueFormatter?: (value: number) => string;
  countFormatter?: (value: number) => string;
  height?: number;
};

const SERIES_CLASS = ['cc-s0', 'cc-s1', 'cc-s2', 'cc-s3'];

export const CommerceGroupedBarChart: React.FC<CommerceGroupedBarChartProps> = ({ points, valueFormatter = won, height = 240 }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="cc-empty">표시할 데이터가 없습니다.</p>;

  const seriesKeys: { key: string; label: string }[] = [];
  for (const p of points) for (const v of p.values) if (!seriesKeys.some((s) => s.key === v.key)) seriesKeys.push({ key: v.key, label: v.label });

  const W = 560, H = height;
  const padL = 48, padR = 14, padT = 14, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  let maxV = 1;
  for (const p of points) for (const v of p.values) if (v.value > maxV) maxV = v.value;
  const niceMax = niceCeil(maxV);
  const n = points.length;
  const groupW = innerW / n;
  const sN = Math.max(1, seriesKeys.length);
  const barW = Math.max(3, Math.min(18, (groupW * 0.7) / sN));
  const groupCenter = (i: number): number => padL + groupW * i + groupW / 2;
  const step = labelStep(n);

  const hp = hover != null ? points[hover] : null;
  const ttRows = hp ? hp.values.map((v) => ({ label: v.label, value: valueFormatter(v.value) })) : [];
  if (hp && hp.values.length === 2) {
    const d = hp.values[1].value - hp.values[0].value;
    ttRows.push({ label: '차이', value: `${d >= 0 ? '+' : ''}${valueFormatter(Math.abs(d))}` });
  }

  return (
    <div className="cc-chart cc-grouped" style={{ minHeight: H }}>
      <div className="cc-legend">
        {seriesKeys.map((s, si) => (
          <span key={s.key} className="cc-legend-item"><span className={`cc-legend-swatch ${SERIES_CLASS[si % 4]}`} /> {s.label}</span>
        ))}
      </div>
      <div className="cc-plot" style={{ position: 'relative' }}>
        <svg className="cc-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="구간별 비교">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const yy = padT + innerH - innerH * t;
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={yy} y2={yy} className="cc-grid" />
                <text x={padL - 6} y={yy + 3} className="cc-ylabel" textAnchor="end">{wonShort(niceMax * t)}</text>
              </g>
            );
          })}
          {points.map((p, i) => {
            const center = groupCenter(i);
            const totalW = barW * sN + 2 * (sN - 1);
            const startX = center - totalW / 2;
            return (
              <g key={p.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={center - groupW / 2} y={padT} width={groupW} height={innerH} className="cc-group-hit" />
                {seriesKeys.map((s, si) => {
                  const v = p.values.find((x) => x.key === s.key);
                  const val = v?.value ?? 0;
                  const h = (val / niceMax) * innerH;
                  const bx = startX + si * (barW + 2);
                  return <rect key={s.key} x={bx} y={padT + innerH - h} width={barW} height={Math.max(0, h)} className={`cc-bar ${SERIES_CLASS[si % 4]} ${hover === i ? 'is-hover' : ''}`} />;
                })}
                {i % step === 0 && <text x={center} y={H - 8} className="cc-xlabel" textAnchor="middle">{p.label}</text>}
              </g>
            );
          })}
        </svg>
        {hp && <CommerceChartTooltip leftPercent={(groupCenter(hover!) / W) * 100} title={hp.label} rows={ttRows} />}
      </div>
    </div>
  );
};
