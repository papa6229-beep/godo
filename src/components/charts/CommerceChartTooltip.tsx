import React from 'react';

// 차트 위에 absolute로 떠서 레이아웃을 밀지 않고, pointer-events:none으로 mouseleave를 유발하지 않는 tooltip.
export type CommerceTooltipRow = { label: string; value: string };
export type CommerceChartTooltipProps = {
  leftPercent: number; // 0~100 (chart container 기준)
  title: string;
  rows: CommerceTooltipRow[];
  align?: 'left' | 'center';
};

export const CommerceChartTooltip: React.FC<CommerceChartTooltipProps> = ({ leftPercent, title, rows, align = 'center' }) => {
  const clamped = Math.max(6, Math.min(94, leftPercent));
  return (
    <div
      className="cc-tooltip"
      style={{ left: `${clamped}%`, transform: align === 'center' ? 'translateX(-50%)' : 'none' }}
      role="status"
    >
      <div className="cc-tt-title">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="cc-tt-row"><span>{r.label}</span><b className="tabular-nums">{r.value}</b></div>
      ))}
    </div>
  );
};
