// Generates the 40 challenge cards in src/levels.json.
//
// Random layouts are improved by hill climbing on the solver's minimum move
// count, then sorted into four difficulty bands. Run: npm run generate-levels
import { writeFileSync } from "node:fs";
import {
  COLS, FINISH_ROW, START_ROW, type Difficulty, type Level,
  colOf, fits, initialState, pt, rowOf, span,
} from "../src/game/rules";
import { solve } from "../src/game/solver";

// The physical game has five planks: two short, two medium, one long.
const PLANK_POOL = [1, 1, 2, 2, 3];

let seed = 20261117;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (n: number) => Math.floor(rand() * n);
const pick = <T>(xs: T[]): T => xs[randInt(xs.length)];

interface Layout {
  start: number; // column on the near bank
  finish: number; // column on the far bank
  river: Set<number>; // stump points inside the river
  planks: { length: number; a: number; b: number }[];
}

const riverPoints: number[] = [];
for (let r = FINISH_ROW + 1; r < START_ROW; r++) for (let c = 0; c < COLS; c++) riverPoints.push(pt(c, r));

function toLevel(l: Layout): Level {
  const stumps = [pt(l.start, START_ROW), pt(l.finish, FINISH_ROW), ...[...l.river].sort((x, y) => x - y)];
  return {
    id: 0,
    difficulty: "Beginner",
    minMoves: 0,
    stumps: stumps.map((p) => [colOf(p), rowOf(p)]),
    start: [l.start, START_ROW],
    finish: [l.finish, FINISH_ROW],
    planks: l.planks.map(({ a, b }) => [colOf(a), rowOf(a), colOf(b), rowOf(b)]),
  };
}

/** Puts a plank of this length at a random free spot, or returns false. */
function placeRandom(l: Layout, length: number): boolean {
  const state = initialState(toLevel(l));
  const spots: [number, number][] = [];
  for (const a of state.stumps) for (const b of state.stumps) {
    if (a < b && fits(state, a, b, length)) spots.push([a, b]);
  }
  if (spots.length === 0) return false;
  const [a, b] = pick(spots);
  l.planks.push({ length, a, b });
  return true;
}

/** Drops planks that no longer fit after stumps changed, then tries to put them back. */
function repair(l: Layout): void {
  const stumps = new Set([pt(l.start, START_ROW), pt(l.finish, FINISH_ROW), ...l.river]);
  const lost = l.planks.filter((p) => span(stumps, p.a, p.b) !== p.length);
  l.planks = l.planks.filter((p) => !lost.includes(p));
  for (const p of lost) placeRandom(l, p.length);
}

function randomLayout(): Layout {
  const l: Layout = { start: randInt(COLS), finish: randInt(COLS), river: new Set(), planks: [] };
  const count = 6 + randInt(7);
  while (l.river.size < count) l.river.add(pick(riverPoints));
  const planks = PLANK_POOL.filter(() => rand() < 0.8);
  for (const length of planks) placeRandom(l, length);
  return l;
}

function mutate(src: Layout): Layout {
  const l: Layout = { ...src, river: new Set(src.river), planks: src.planks.map((p) => ({ ...p })) };
  switch (randInt(6)) {
    case 0: l.river.add(pick(riverPoints)); break;
    case 1: if (l.river.size > 4) l.river.delete(pick([...l.river])); break;
    case 2: { l.river.delete(pick([...l.river])); l.river.add(pick(riverPoints)); break; }
    case 3: { const i = randInt(l.planks.length); const [p] = l.planks.splice(i, 1); if (p) placeRandom(l, p.length); break; }
    case 4: { const used = l.planks.map((p) => p.length); const spare = PLANK_POOL.slice();
      for (const u of used) spare.splice(spare.indexOf(u), 1);
      if (spare.length) placeRandom(l, pick(spare)); else l.planks.splice(randInt(l.planks.length), 1); break; }
    case 5: if (rand() < 0.5) l.start = randInt(COLS); else l.finish = randInt(COLS); break;
  }
  repair(l);
  return l;
}

function evaluate(l: Layout): { moves: number; explored: number } | null {
  if (l.planks.length === 0) return null;
  const sol = solve(initialState(toLevel(l)), 200_000);
  if (!sol || sol.moves.length === 0) return null;
  return { moves: sol.moves.length, explored: sol.explored };
}

const found = new Map<string, Level & { explored: number; run: number }>();
const runs = Number(process.argv[2] ?? 400);
for (let run = 0; run < runs; run++) {
  let cur = randomLayout();
  let score = evaluate(cur);
  while (!score) score = evaluate((cur = randomLayout()));
  // Keep every layout on the way up, so the easy bands get filled too.
  for (let step = 0; step < 300; step++) {
    const level = toLevel(cur);
    found.set(JSON.stringify(level), { ...level, minMoves: score.moves, explored: score.explored, run });
    const cand = mutate(cur);
    const s = evaluate(cand);
    if (!s || s.moves < score.moves) continue;
    cur = cand;
    score = s;
  }
  if (run % 20 === 0) console.error(`run ${run}: ${score.moves} moves`);
}

// Spread levels over the range of move counts found.
const all = [...found.values()].sort((x, y) => x.minMoves - y.minMoves || x.explored - y.explored);
const hist = new Map<number, number>();
for (const l of all) hist.set(l.minMoves, (hist.get(l.minMoves) ?? 0) + 1);
console.error("moves histogram:", [...hist].sort((a, b) => a[0] - b[0]));

const bands: [Difficulty, number, number][] = [
  ["Beginner", 1, 4],
  ["Intermediate", 5, 9],
  ["Advanced", 10, 15],
  ["Expert", 16, 99],
];
const levels: Level[] = [];
for (const [difficulty, lo, hi] of bands) {
  // One random level per climbing run, so levels in a band are not near-copies.
  const byRun = Map.groupBy(all.filter((l) => l.minMoves >= lo && l.minMoves <= hi), (l) => l.run);
  const pool = [...byRun.values()].map(pick).sort((x, y) => x.minMoves - y.minMoves || x.explored - y.explored);
  if (pool.length < 10) throw new Error(`only ${pool.length} ${difficulty} levels`);
  // Take 10 evenly spaced levels so each band ramps up.
  for (let i = 0; i < 10; i++) {
    const { explored: _e, run: _r, ...level } = pool[Math.round((i * (pool.length - 1)) / 9)];
    levels.push({ ...level, id: levels.length + 1, difficulty });
  }
}
writeFileSync(new URL("../src/levels.json", import.meta.url), "[\n" + levels.map((l) => JSON.stringify(l)).join(",\n") + "\n]\n");
console.error("wrote", levels.length, "levels:", levels.map((l) => l.minMoves).join(" "));
