/**
 * Per-request path instrumentation so tests can tell LLM vs fallback apart.
 * Logged once per turn and also returned on the /api/query JSON payload.
 */

export type ClassifyPath = 'llm' | 'heuristic' | 'fallback';
export type GroundingPath = 'llm' | 'fallback' | 'extractive' | 'skipped' | 'none';

export type TurnPathLog = {
  classify_turn: ClassifyPath;
  classify_reason?: string;
  grounding: GroundingPath;
  grounding_reason?: string;
};

const store = new Map<string, TurnPathLog>();

export function beginTurnPaths(requestId: string): TurnPathLog {
  const paths: TurnPathLog = {
    classify_turn: 'fallback',
    grounding: 'none',
  };
  store.set(requestId, paths);
  return paths;
}

export function getTurnPaths(requestId: string): TurnPathLog | undefined {
  return store.get(requestId);
}

export function setClassifyPath(
  requestId: string | undefined,
  path: ClassifyPath,
  reason?: string,
): void {
  if (!requestId) return;
  const cur = store.get(requestId) || beginTurnPaths(requestId);
  cur.classify_turn = path;
  if (reason) cur.classify_reason = reason;
}

export function setGroundingPath(
  requestId: string | undefined,
  path: GroundingPath,
  reason?: string,
): void {
  if (!requestId) return;
  const cur = store.get(requestId) || beginTurnPaths(requestId);
  cur.grounding = path;
  if (reason) cur.grounding_reason = reason;
}

export function logTurnPaths(requestId: string, extra?: Record<string, unknown>): void {
  const p = store.get(requestId);
  if (!p) return;
  console.info('[turn_paths]', {
    requestId,
    classify_turn: p.classify_turn,
    classify_reason: p.classify_reason || null,
    grounding: p.grounding,
    grounding_reason: p.grounding_reason || null,
    ...extra,
  });
  store.delete(requestId);
}
