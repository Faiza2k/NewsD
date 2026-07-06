'use client';

import type { NewsItem } from '@/types';
import { format } from 'date-fns';

interface TimelineEvent {
  time: Date;
  title: string;
  category: string;
  importance: 'high' | 'medium';
}

function buildTimeline(items: NewsItem[]): TimelineEvent[] {
  return items
    .slice(0, 6)
    .map((item) => ({
      time: new Date(item.publishedAt),
      title: item.title,
      category: item.category,
      importance: item.significance >= 8 ? 'high' as const : 'medium' as const,
    }));
}

export function TimelinePanel({ items }: { items: NewsItem[] }) {
  const timeline = buildTimeline(items);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Global Operations Timeline</h3>
        <span className="panel-action">Full View</span>
      </div>
      <div className="panel-body">
        <div className="timeline-list">
          {timeline.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '8px 0' }}>
              Syncing live timeline — check back in a moment.
            </p>
          ) : (
            timeline.map((event, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-time">{format(event.time, 'HH:mm')}</div>
                <div className={`timeline-dot ${event.importance}`} />
                <div className="timeline-content">
                  <h4>{event.title}</h4>
                  <p
                    style={{
                      textTransform: 'uppercase',
                      fontSize: '0.65rem',
                      color: 'var(--accent-cyan)',
                      fontWeight: 600,
                    }}
                  >
                    {event.category}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
