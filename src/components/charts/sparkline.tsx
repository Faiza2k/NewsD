'use client';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

export function Sparkline({
  data,
  color = 'var(--accent-emerald)',
  height = 48,
  width,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  // Sample data to max 50 points for performance
  const sampled = data.length > 50
    ? data.filter((_, i) => i % Math.ceil(data.length / 50) === 0)
    : data;

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  const svgWidth = width || 200;
  const padding = 2;
  const chartHeight = height - padding * 2;
  const chartWidth = svgWidth - padding * 2;

  const points = sampled.map((val, i) => {
    const x = padding + (i / (sampled.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((val - min) / range) * chartHeight;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${padding + chartWidth},${padding + chartHeight} L ${padding},${padding + chartHeight} Z`;

  const gradientId = `sparkline-gradient-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
      />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot */}
      {points.length > 0 && (
        <circle
          cx={parseFloat(points[points.length - 1].split(',')[0])}
          cy={parseFloat(points[points.length - 1].split(',')[1])}
          r="2"
          fill={color}
        />
      )}
    </svg>
  );
}
