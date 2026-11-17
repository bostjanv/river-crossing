// River Crossing rules engine. Pure data and functions, no rendering.
//
// The board is a grid of COLS x ROWS holes. Row FINISH_ROW (top) is the far
// bank, row START_ROW (bottom) the near bank, and the rows between are river.
// A point is encoded as row * COLS + col.

export const COLS = 5;
export const ROWS = 7;
export const FINISH_ROW = 0;
export const START_ROW = ROWS - 1;

export type Pt = number;

export const pt = (col: number, row: number): Pt => row * COLS + col;
export const colOf = (p: Pt): number => p % COLS;
export const rowOf = (p: Pt): number => Math.floor(p / COLS);

export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";

/** A challenge card. Coordinates are [col, row]. */
export interface Level {
  id: number;
  difficulty: Difficulty;
  /** Minimum number of plank moves (pick up + put down) to solve. */
  minMoves: number;
  stumps: [number, number][];
  start: [number, number];
  finish: [number, number];
  /** Each plank lies between two stumps: [col1, row1, col2, row2]. */
  planks: [number, number, number, number][];
}

export interface Plank {
  id: number;
  length: number;
  /** Endpoints, a < b. */
  a: Pt;
  b: Pt;
}

export interface HeldPlank {
  id: number;
  length: number;
}

export interface State {
  stumps: ReadonlySet<Pt>;
  start: Pt;
  finish: Pt;
  hiker: Pt;
  planks: readonly Plank[];
  held: HeldPlank | null;
}

export function initialState(level: Level): State {
  const planks = level.planks.map(([c1, r1, c2, r2], id) => {
    const a = pt(c1, r1);
    const b = pt(c2, r2);
    return { id, a: Math.min(a, b), b: Math.max(a, b), length: Math.abs(c1 - c2) + Math.abs(r1 - r2) };
  });
  const start = pt(...level.start);
  return {
    stumps: new Set(level.stumps.map(([c, r]) => pt(c, r))),
    start,
    finish: pt(...level.finish),
    hiker: start,
    planks,
    held: null,
  };
}

/**
 * Length of a plank that would fit exactly between stumps a and b, or 0 when
 * they are not in one row or column or another stump stands between them.
 */
export function span(stumps: ReadonlySet<Pt>, a: Pt, b: Pt): number {
  if (a === b || !stumps.has(a) || !stumps.has(b)) return 0;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  let step: number;
  if (rowOf(lo) === rowOf(hi)) step = 1;
  else if (colOf(lo) === colOf(hi)) step = COLS;
  else return 0;
  for (let p = lo + step; p < hi; p += step) if (stumps.has(p)) return 0;
  return (hi - lo) / step;
}

/** True when two plank segments share a point that is not a shared end stump. */
function conflicts(a1: Pt, b1: Pt, a2: Pt, b2: Pt): boolean {
  if (a1 === a2 && b1 === b2) return true;
  const h1 = rowOf(a1) === rowOf(b1);
  const h2 = rowOf(a2) === rowOf(b2);
  if (h1 === h2) return false; // parallel planks between stumps never overlap
  const [h, v] = h1 ? [[a1, b1], [a2, b2]] : [[a2, b2], [a1, b1]];
  const r = rowOf(h[0]);
  const c = colOf(v[0]);
  // Crossing strictly inside both planks.
  return colOf(h[0]) < c && c < colOf(h[1]) && rowOf(v[0]) < r && r < rowOf(v[1]);
}

/** Whether a plank of this length fits between a and b on the current board. */
export function fits(state: State, a: Pt, b: Pt, length: number): boolean {
  if (span(state.stumps, a, b) !== length) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return state.planks.every((p) => !conflicts(lo, hi, p.a, p.b));
}

/** Stumps the Hiker can walk to, with the walking distance to each. */
export function reachable(state: Pick<State, "hiker" | "planks">): Map<Pt, number> {
  const dist = new Map<Pt, number>([[state.hiker, 0]]);
  const queue = [state.hiker];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const p of state.planks) {
      const next = p.a === at ? p.b : p.b === at ? p.a : -1;
      if (next >= 0 && !dist.has(next)) {
        dist.set(next, dist.get(at)! + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/** Stumps along the shortest walk from the Hiker to target, both included. */
export function walkPath(state: State, target: Pt): Pt[] | null {
  const prev = new Map<Pt, Pt>([[state.hiker, -1]]);
  const queue = [state.hiker];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    if (at === target) break;
    for (const p of state.planks) {
      const next = p.a === at ? p.b : p.b === at ? p.a : -1;
      if (next >= 0 && !prev.has(next)) {
        prev.set(next, at);
        queue.push(next);
      }
    }
  }
  if (!prev.has(target)) return null;
  const path: Pt[] = [];
  for (let p = target; p !== -1; p = prev.get(p)!) path.unshift(p);
  return path;
}

export function isWon(state: State): boolean {
  return state.hiker === state.finish;
}

export function walk(state: State, target: Pt): State | null {
  if (!reachable(state).has(target)) return null;
  return { ...state, hiker: target };
}

/** Pick up a plank from one of its ends; the Hiker ends up standing on that end. */
export function pickUp(state: State, plankId: number, end: Pt): State | null {
  if (state.held) return null;
  const plank = state.planks.find((p) => p.id === plankId);
  if (!plank || (plank.a !== end && plank.b !== end)) return null;
  if (!reachable(state).has(end)) return null;
  return {
    ...state,
    hiker: end,
    planks: state.planks.filter((p) => p !== plank),
    held: { id: plank.id, length: plank.length },
  };
}

/** All places the held plank can be put down: it must fit and touch a reachable stump. */
export function placements(state: State): [Pt, Pt][] {
  if (!state.held) return [];
  const reach = reachable(state);
  const result: [Pt, Pt][] = [];
  const stumps = [...state.stumps].sort((x, y) => x - y);
  for (const a of stumps) {
    for (const b of stumps) {
      if (b <= a || (!reach.has(a) && !reach.has(b))) continue;
      if (fits(state, a, b, state.held.length)) result.push([a, b]);
    }
  }
  return result;
}

/** Put the held plank down between a and b. The Hiker walks to the nearer reachable end. */
export function putDown(state: State, a: Pt, b: Pt): State | null {
  if (!state.held) return null;
  const reach = reachable(state);
  if (!reach.has(a) && !reach.has(b)) return null;
  if (!fits(state, a, b, state.held.length)) return null;
  const hiker = !reach.has(b) || (reach.has(a) && reach.get(a)! <= reach.get(b)!) ? a : b;
  return {
    ...state,
    hiker,
    planks: [...state.planks, { ...state.held, a: Math.min(a, b), b: Math.max(a, b) }],
    held: null,
  };
}
