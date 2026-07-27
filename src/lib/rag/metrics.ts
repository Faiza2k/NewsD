import type { RagStageMetrics } from '@/lib/rag/types';

export function newRequestId(): string {
  return `rag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStageTimer(requestId: string): {
  mark: (stage: string) => void;
  snapshot: (extra?: Partial<RagStageMetrics>) => RagStageMetrics;
} {
  const started = Date.now();
  const last = { t: started };
  const stages: Record<string, number> = {};

  return {
    mark(stage: string) {
      const now = Date.now();
      stages[stage] = now - last.t;
      last.t = now;
    },
    snapshot(extra) {
      stages.totalMs = Date.now() - started;
      const row: RagStageMetrics = {
        requestId,
        stages,
        ...extra,
      };
      console.info('[rag]', JSON.stringify(row));
      return row;
    },
  };
}
