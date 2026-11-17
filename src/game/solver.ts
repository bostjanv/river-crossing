import { type Pt, type State, placements, pickUp, putDown, reachable } from "./rules";

/** One plank move: standing on `end`, take the plank lying on `from` and put it on `to`. */
export interface Move {
  end: Pt;
  from: [Pt, Pt];
  to: [Pt, Pt];
}

export interface Solution {
  moves: Move[];
  /** Number of distinct positions searched; a rough measure of difficulty. */
  explored: number;
}

/**
 * Positions are equal when the Hiker can reach the same stumps and the same
 * plank segments are on the board (planks of equal length are interchangeable).
 */
function key(state: State, reach: Map<Pt, number>): string {
  const segs = state.planks.map((p) => p.a * 64 + p.b).sort((x, y) => x - y);
  return Math.min(...reach.keys()) + ":" + segs.join(",");
}

/**
 * Breadth-first search over plank moves. The puzzle is solved once the FINISH
 * stump is reachable, since walking is free. Returns null when unsolvable.
 */
export function solve(start: State, maxExplored = 500_000): Solution | null {
  const startReach = reachable(start);
  if (startReach.has(start.finish)) return { moves: [], explored: 1 };
  const seen = new Map<string, { parent: string | null; move: Move | null }>();
  const startKey = key(start, startReach);
  seen.set(startKey, { parent: null, move: null });
  let frontier: [string, State][] = [[startKey, start]];

  while (frontier.length > 0) {
    const next: [string, State][] = [];
    for (const [k, state] of frontier) {
      const reach = reachable(state);
      for (const plank of state.planks) {
        for (const end of new Set<Pt>([plank.a, plank.b])) {
          if (!reach.has(end)) continue;
          const carrying = pickUp(state, plank.id, end)!;
          for (const [a, b] of placements(carrying)) {
            if (a === plank.a && b === plank.b) continue;
            const after = putDown(carrying, a, b)!;
            const afterReach = reachable(after);
            const afterKey = key(after, afterReach);
            if (seen.has(afterKey)) continue;
            const move: Move = { end, from: [plank.a, plank.b], to: [a, b] };
            seen.set(afterKey, { parent: k, move });
            if (afterReach.has(after.finish)) return { moves: unwind(seen, afterKey), explored: seen.size };
            if (seen.size > maxExplored) return null;
            next.push([afterKey, after]);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}

function unwind(seen: Map<string, { parent: string | null; move: Move | null }>, k: string): Move[] {
  const moves: Move[] = [];
  for (let node = seen.get(k)!; node.move; node = seen.get(node.parent!)!) moves.unshift(node.move);
  return moves;
}
