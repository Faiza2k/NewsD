'use client';

export function ImportanceScore({ score }: { score: number }) {
  let level: 'high' | 'medium' | 'low' = 'low';
  if (score >= 8) level = 'high';
  else if (score >= 5) level = 'medium';

  const filled = Math.ceil(score / 2);

  return (
    <div className="importance-score" title={`Importance: ${score}/10`}>
      <div className="importance-dots">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`importance-dot ${i < filled ? `filled ${level}` : ''}`}
          />
        ))}
      </div>
      <span className="importance-label">{score}</span>
    </div>
  );
}
