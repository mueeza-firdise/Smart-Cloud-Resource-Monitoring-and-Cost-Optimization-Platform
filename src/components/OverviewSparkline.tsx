interface OverviewSparklineProps {
  values: number[];
  strokeColor: string;
  min?: number;
  max?: number;
  ariaLabel: string;
}

export function OverviewSparkline({
  values,
  strokeColor,
  min = 0,
  max = 100,
  ariaLabel,
}: OverviewSparklineProps) {
  const safeValues = values.length >= 2 ? values.slice(-14) : [values[0] ?? 0, values[0] ?? 0];
  const width = 120;
  const height = 28;
  const padY = 3;
  const span = Math.max(1, max - min);

  const coords = safeValues.map((val, idx) => {
    const x = (idx / Math.max(1, safeValues.length - 1)) * width;
    const clamped = Math.max(min, Math.min(max, val));
    const y = height - padY - ((clamped - min) / span) * (height - padY * 2);
    return {x, y};
  });

  const linePath = coords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-7 overflow-visible"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={areaPath} fill={strokeColor} fillOpacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill={strokeColor} />
    </svg>
  );
}
