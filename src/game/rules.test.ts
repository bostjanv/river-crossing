import { describe, expect, it } from "vitest";
import levels from "../levels.json";
import { type Level, fits, initialState, pickUp, placements, pt, putDown, reachable, span } from "./rules";
import { solve } from "./solver";

// Start (0,6) -1- A (0,5) -2- C (2,5) -3- D (2,2); B (0,2) and finish (0,0) are cut off.
// Two moves are needed because the finish has no plank and A-B is empty.
const twoMoves: Level = {
  id: 0, difficulty: "Beginner", minMoves: 2,
  stumps: [[0, 6], [0, 5], [2, 5], [2, 2], [0, 2], [0, 0]],
  start: [0, 6], finish: [0, 0],
  planks: [[0, 6, 0, 5], [0, 5, 2, 5], [2, 5, 2, 2]],
};
const A = pt(0, 5), B = pt(0, 2), C = pt(2, 5), F = pt(0, 0);

describe("plank placement", () => {
  const s = initialState(twoMoves);

  it("fits only an exact length between aligned stumps with nothing in between", () => {
    expect(span(s.stumps, A, B)).toBe(3);
    expect(span(s.stumps, A, pt(2, 2))).toBe(0); // diagonal
    expect(span(s.stumps, pt(0, 6), B)).toBe(0); // A stands in between
    expect(fits(s, A, B, 3)).toBe(true);
    expect(fits(s, A, B, 2)).toBe(false);
  });

  it("rejects planks that cross at an empty hole but allows sharing a stump", () => {
    const level: Level = {
      ...twoMoves,
      stumps: [[0, 3], [2, 3], [1, 2], [1, 4], [2, 1]],
      planks: [[0, 3, 2, 3]],
    };
    const t = initialState(level);
    expect(fits(t, pt(1, 2), pt(1, 4), 2)).toBe(false);
    expect(fits(t, pt(2, 1), pt(2, 3), 2)).toBe(true);
  });
});

describe("hiker actions", () => {
  it("can only pick up planks touching a reachable stump", () => {
    const s = initialState(twoMoves);
    const bridge = s.planks.find((p) => p.length === 2)!;
    const far = s.planks.find((p) => p.length === 3)!;
    const carrying = pickUp(s, bridge.id, A)!;
    expect(carrying.hiker).toBe(A);
    // With the bridge in hand the 3-plank is out of reach.
    expect(pickUp(carrying, far.id, C)).toBeNull();
    expect([...reachable(carrying).keys()].sort()).toEqual([A, pt(0, 6)].sort());
  });

  it("can only put a plank down touching a reachable stump", () => {
    const s = initialState(twoMoves);
    const carrying = pickUp(s, s.planks.find((p) => p.length === 3)!.id, C)!;
    expect(placements(carrying)).toContainEqual([B, A]);
    expect(putDown(carrying, F, B)).toBeNull(); // wrong length and unreachable
    const placed = putDown(carrying, A, B)!;
    expect(reachable(placed).has(B)).toBe(true);
  });
});

describe("solver", () => {
  it("finds the shortest solution", () => {
    const sol = solve(initialState(twoMoves))!;
    expect(sol.moves).toHaveLength(2);
    expect(sol.moves[1].to).toContain(F);
  });

  it("solves every shipped level in its recorded number of moves", () => {
    expect(levels).toHaveLength(40);
    for (const level of levels as Level[]) {
      expect(solve(initialState(level))?.moves.length, `level ${level.id}`).toBe(level.minMoves);
    }
  });
});
