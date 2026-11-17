import { Application } from "pixi.js";
import { type Level, type Pt, type State, initialState, isWon, pickUp, putDown, reachable, walk, walkPath } from "./game/rules";
import levelsData from "./levels.json";
import { BoardView } from "./render/board";

const levels = levelsData as Level[];
const $ = (id: string) => document.getElementById(id)!;

const SOLVED_KEY = "river-crossing:solved";
const solved = new Set<number>(JSON.parse(localStorage.getItem(SOLVED_KEY) ?? "[]"));

let level = levels[0];
let state: State = initialState(level);
let moves = 0;
/** States before each pick up or put down; walking alone is not undone. */
let history: { state: State; moves: number }[] = [];
let busy = false;
let board: BoardView;

async function start(): Promise<void> {
  const stage = $("stage");
  const app = new Application();
  await app.init({ background: 0x1d3b2a, antialias: true, resolution: devicePixelRatio, autoDensity: true });
  stage.appendChild(app.canvas);
  board = new BoardView(app, { stump: onStump, plank: onPlank, spot: onSpot });
  new ResizeObserver(() => {
    app.renderer.resize(stage.clientWidth, stage.clientHeight);
    board.resize(stage.clientWidth, stage.clientHeight);
  }).observe(stage);

  buildLevelList();
  $("levels-btn").onclick = () => showLevels(true);
  $("close-levels").onclick = () => showLevels(false);
  $("undo").onclick = undo;
  $("restart").onclick = () => load(level);
  $("win-levels").onclick = () => showLevels(true);
  $("next").onclick = () => load(levels[level.id]);
  addEventListener("keydown", (e) => {
    if (e.key === "z" || e.key === "u") undo();
    else if (e.key === "r") load(level);
    else if (e.key === "Escape") showLevels($("levels").classList.contains("hidden"));
  });

  const fromHash = levels.find((l) => `#${l.id}` === location.hash);
  load(fromHash ?? levels.find((l) => !solved.has(l.id)) ?? levels[0]);
  if (!fromHash) showLevels(true);
}

function load(l: Level): void {
  level = l;
  state = initialState(l);
  moves = 0;
  history = [];
  busy = false;
  $("win").classList.add("hidden");
  showLevels(false);
  window.history.replaceState(null, "", `#${l.id}`);
  board.render(state);
  hud();
}

function hud(): void {
  $("level-name").textContent = `Challenge ${level.id}`;
  $("level-info").textContent = `${level.difficulty} · Moves ${moves} · Best ${level.minMoves}`;
  ($("undo") as HTMLButtonElement).disabled = history.length === 0;
  $("hint").textContent = isWon(state)
    ? "You crossed the river!"
    : state.held
      ? "Tap a glowing gap to lay the plank down, or tap a stump to carry it there."
      : "Tap a stump to walk there. Tap a plank next to a stump you can reach to pick it up.";
}

async function perform(next: State, path: Pt[], kind: "walk" | "pick" | "place"): Promise<void> {
  busy = true;
  if (kind !== "walk") history.push({ state, moves });
  await board.walk(path);
  state = next;
  if (kind === "place") moves++;
  board.render(state);
  busy = false;
  hud();
  if (isWon(state)) win();
}

function onStump(p: Pt): void {
  if (busy || isWon(state)) return;
  const next = walk(state, p);
  const path = walkPath(state, p);
  if (next && path && path.length > 1) void perform(next, path, "walk");
}

/**
 * The Hiker lifts the plank from the end he stands on. Otherwise he walks to
 * the end nearer the tap, or to the other end when that one is out of reach.
 */
function onPlank(id: number, near: Pt): void {
  if (busy || isWon(state) || state.held) return;
  const plank = state.planks.find((p) => p.id === id)!;
  const reach = reachable(state);
  const far = near === plank.a ? plank.b : plank.a;
  const end = [state.hiker, near, far].find((e) => (e === plank.a || e === plank.b) && reach.has(e));
  if (end === undefined) return;
  void perform(pickUp(state, id, end)!, walkPath(state, end)!, "pick");
}

function onSpot(a: Pt, b: Pt): void {
  if (busy || isWon(state)) return;
  const next = putDown(state, a, b);
  if (next) void perform(next, walkPath(state, next.hiker)!, "place");
}

function undo(): void {
  if (busy || history.length === 0) return;
  ({ state, moves } = history.pop()!);
  $("win").classList.add("hidden");
  board.render(state);
  hud();
}

function win(): void {
  solved.add(level.id);
  localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved]));
  buildLevelList();
  $("win-text").textContent =
    moves <= level.minMoves
      ? `Perfect: ${moves} plank ${moves === 1 ? "move" : "moves"}, the fewest possible.`
      : `You used ${moves} plank moves. It can be done in ${level.minMoves}.`;
  $("next").hidden = level.id === levels.length;
  $("win").classList.remove("hidden");
}

function showLevels(show: boolean): void {
  $("levels").classList.toggle("hidden", !show);
}

function buildLevelList(): void {
  const list = $("level-list");
  list.replaceChildren();
  for (const difficulty of ["Beginner", "Intermediate", "Advanced", "Expert"]) {
    const section = document.createElement("section");
    section.innerHTML = `<h3 class="${difficulty.toLowerCase()}">${difficulty}</h3>`;
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const l of levels.filter((x) => x.difficulty === difficulty)) {
      const b = document.createElement("button");
      b.textContent = String(l.id);
      b.title = `${l.minMoves} ${l.minMoves === 1 ? "move" : "moves"}`;
      b.classList.toggle("solved", solved.has(l.id));
      b.onclick = () => load(l);
      grid.appendChild(b);
    }
    section.appendChild(grid);
    list.appendChild(section);
  }
}

void start();
