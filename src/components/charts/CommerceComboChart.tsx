import React, { useState } from 'react';
import { won, wonShort, countFmt, niceCeil, smoothPath, labelStep } from './commerceChartUtils';
import { CommerceChartTooltip } from './CommerceChartTooltip';

// 단일 기간 월별 매출 등: 세로 막대(barValue) + 부드러운 추세선(lineValue) combo. SVG 직접 구현.
//   ProductTeamDashboard TrendChart 패턴을 공통화 — 정상 viewBox, y grid/축, x 라벨, absolute tooltip.
export type CommerceComboChartPoint = {
  key: string;
  label: string;
  barValue: number;
  lineValue: number;
  orderCount?: number;
  delta?: number;
  deltaRate?: number;
  meta?: Record<string, string | number | boolean>;
};
export type CommerceComboChartProps = {
  title?: string;
  points: CommerceComboChartPoint[];
  barLabel: string;
  lineLabel: string;
  valueFormatter?: (value: number) => string;
  countFormatter?: (value: number) => string;
  height?: number;
};

export const CommerceComboChart: React.FC<CommerceComboChartProps> = ({ points, barLabel, lineLabel, valueFormatter = won, countFormatter = countFmt, height = 240 }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="cc-empty">표시할 데이터가 없습니다.</p>;

  const W = 560, H = height;
  const padL = 48, padR = 14, padT = 14, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const niceMax = niceCeil(Math.max(1, ...points.map((d) => Math.max(d.barValue, d.lineValue))));
  const n = points.length;
  const x = (i: number): number => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const y = (v: number): number => padT + innerH - (v / niceMax) * innerH;
  const linePts = points.map((d, i) => ({ x: x(i), y: y(d.lineValue) }));
  const line = smoothPath(linePts);
  const area = `${line} L${linePts[n - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${linePts[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const barW = Math.max(4, Math.min(22, innerW / n / 1.8));
  const step = labelStep(n);

  const hp = hover != null ? points[hover] : null;
  const ttRows = hp ? [
    { label: barLabel, value: valueFormatter(hp.barValue) },
    ...(hp.orderCount != null ? [{ label: '주문수', value: countFormatter(hp.orderCount) }] : []),
    ...(hp.deltaRate != null ? [{ label: '전 구간 대비', value: `${hp.deltaRate >= 0 ? '+' : ''}${hp.deltaRate}%` }] : hp.delta != null ? [{ label: '전 구간 대비', value: valueFormatter(hp.delta) }] : [])
  ] : [];

  return (
    <div className="cc-chart cc-combo" style={{ minHeight: H }}>
      <div className="cc-legend">
        <span className="cc-legend-item"><span className="cc-legend-bar" /> {barLabel}</span>
        <span className="cc-legend-item"><span className="cc-legend-line" /> {lineLabel}</span>
      </div>
      <div className="cc-plot" style={{ position: 'relative' }}>
        <svg className="cc-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${barLabel} 추이`}>
          <defs>
            <linearGradient id="ccAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const yy = padT + innerH - innerH * t;
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={yy} y2={yy} className="cc-grid" />
                <text x={padL - 6} y={yy + 3} className="cc-ylabel" textAnchor="end">{wonShort(niceMax * t)}</text>
              </g>
            );
          })}
          {points.map((d, i) => {
            const h = (d.barValue / niceMax) * innerH;
            return (
              <rect key={`b${i}`} x={x(i) - barW / 2} y={padT + innerH - h} width={barW} height={Math.max(0, h)}
                className={`cc-bar ${hover === i ? 'is-hover' : ''}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            );
          })}
          <path d={area} className="cc-area" />
          <path d={line} className="cc-line" fill="none" />
          {points.map((d, i) => (
            <g key={`p${i}`}>
              {i % step === 0 && <text x={x(i)} y={H - 8} className="cc-xlabel" textAnchor="middle">{d.label}</text>}
              <circle cx={x(i)} cy={y(d.lineValue)} r={hover === i ? 5 : 3} className="cc-dot"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          ))}
        </svg>
        {hp && <CommerceChartTooltip leftPercent={(x(hover!) / W) * 100} title={hp.label} rows={ttRows} />}
      </div>
    </div>
  );
};
