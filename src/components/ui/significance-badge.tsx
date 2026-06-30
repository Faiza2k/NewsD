'use client';

import { cn } from '@/lib/utils';

interface SignificanceBadgeProps {
  score: number;
}

export function SignificanceBadge({ score }: SignificanceBadgeProps) {
  const getConfig = (s: number) => {
    if (s <= 3) return {
      bg: 'rgba(255,255,255,0.04)',
      color: 'var(--text-muted)',
      label: 'Low',
      glow: 'transparent',
      border: 'var(--border-subtle)'
    };
    if (s <= 6) return {
      bg: 'rgba(59,130,246,0.12)',
      color: '#3B82F6',
      label: 'Moderate',
      glow: 'rgba(59,130,246,0.20)',
      border: 'rgba(59,130,246,0.25)'
    };
    if (s <= 8) return {
      bg: 'rgba(245,158,11,0.12)',
      color: '#F59E0B',
      label: 'High',
      glow: 'rgba(245,158,11,0.20)',
      border: 'rgba(245,158,11,0.25)'
    };
    return {
      bg: 'rgba(239,68,68,0.12)',
      color: '#EF4444',
      label: 'Critical',
      glow: 'rgba(239,68,68,0.25)',
      border: 'rgba(239,68,68,0.30)'
    };
  };

  const config = getConfig(score);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[10px] font-bold',
        score >= 9 && 'animate-pulse-glow'
      )}
      style={{
        background: config.bg,
        color:      config.color,
        border:     `1px solid ${config.border}`,
        boxShadow:  `0 0 10px ${config.glow}`,
      }}
      title={`Significance: ${score}/10 (${config.label})`}
    >
      <span className="stat-number">{score}</span>
      <span
        className="w-px h-2.5"
        style={{ background: config.color, opacity: 0.3 }}
      />
      <span
        className="text-[9px] font-bold tracking-widest"
        style={{ letterSpacing: '0.06em' }}
      >
        {config.label.toUpperCase()}
      </span>
    </div>
  );
}
