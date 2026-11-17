// PixiJS view of the board. It draws a State and reports taps; main.ts owns the rules.
import { type Application, Circle, Container, type FederatedPointerEvent, Graphics, Rectangle, Text, type Ticker } from "pixi.js";
import { COLS, ROWS, type Pt, type State, colOf, placements, reachable, rowOf } from "../game/rules";

export interface BoardEvents {
  stump(p: Pt): void;
  /** A plank was tapped; `near` is its end closer to the tap. */
  plank(id: number, near: Pt): void;
  spot(a: Pt, b: Pt): void;
}

const WATER = 0x3d8fc6;
const WATER_DARK = 0x2c74a8;
const GRASS = 0x79b452;
const SAND = 0xe3cc94;
const WOOD = 0xc08a50;
const WOOD_DARK = 0x6e4524;
const BARK = 0x7a5230;
const STUMP_TOP = 0xdcab6c;
const START_COLOR = 0x43a047;
const FINISH_COLOR = 0xe53935;

/** Seconds the Hiker takes to cross one grid unit. */
const WALK_SPEED = 0.17;

export class BoardView {
  private readonly root = new Container();
  private readonly ground = new Graphics();
  private readonly waves = new Graphics();
  private readonly pieces = new Container();
  private readonly ghosts = new Container();
  private readonly hiker = new Container();
  private cell = 64;
  private width = 0;
  private time = 0;
  private state: State | null = null;

  constructor(
    private readonly app: Application,
    private readonly events: BoardEvents,
  ) {
    this.root.addChild(this.ground, this.waves, this.pieces, this.hiker);
    app.stage.addChild(this.root);
    app.ticker.add((t) => {
      this.time += t.deltaMS / 1000;
      this.drawWaves();
      this.ghosts.alpha = 0.65 + 0.25 * Math.sin(this.time * 4);
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.cell = Math.max(24, Math.floor(Math.min(width / (COLS + 0.4), height / (ROWS + 0.3))));
    const c = this.cell;
    this.root.position.set(Math.round((width - COLS * c) / 2), Math.round((height - ROWS * c) / 2));
    this.drawGround();
    if (this.state) this.render(this.state);
  }

  render(state: State): void {
    this.state = state;
    if (this.width === 0) return;
    const c = this.cell;
    for (const child of this.pieces.removeChildren()) if (child !== this.ghosts) child.destroy({ children: true });
    for (const child of this.ghosts.removeChildren()) child.destroy();
    const reach = reachable(state);

    for (const plank of state.planks) {
      const g = new Graphics();
      this.drawPlank(g, plank.a, plank.b, false);
      if (!state.held && (reach.has(plank.a) || reach.has(plank.b))) {
        this.tappable(g, this.band(plank.a, plank.b, 0.6), (e) => {
          const { x, y } = e.getLocalPosition(this.root);
          const A = this.at(plank.a);
          const B = this.at(plank.b);
          const nearA = Math.hypot(x - A.x, y - A.y) <= Math.hypot(x - B.x, y - B.y);
          this.events.plank(plank.id, nearA ? plank.a : plank.b);
        });
      }
      this.pieces.addChild(g);
    }

    // Spots where the carried plank can go.
    this.pieces.addChild(this.ghosts);
    for (const [a, b] of placements(state)) {
      const g = new Graphics();
      this.drawPlank(g, a, b, true);
      this.tappable(g, this.band(a, b, 0.6), () => this.events.spot(a, b));
      this.ghosts.addChild(g);
    }

    for (const p of state.stumps) {
      const g = new Graphics();
      const { x, y } = this.at(p);
      this.drawStump(g, x, y, p === state.start ? START_COLOR : p === state.finish ? FINISH_COLOR : null);
      if (p === state.finish) this.drawFlag(g, x, y);
      // Every stump takes its own taps, so a tap on it never picks up a plank underneath.
      this.tappable(g, new Circle(x, y, c * 0.32), () => this.events.stump(p));
      if (reach.has(p) && p !== state.hiker) {
        g.circle(x, y, c * 0.31).stroke({ width: c * 0.035, color: 0xfff3b0, alpha: 0.9 });
      } else {
        g.cursor = "default";
      }
      this.pieces.addChild(g);
    }

    this.label("START", state.start, 0.38);
    this.label("FINISH", state.finish, -0.38);
    this.drawHiker(state);
    this.hiker.position.copyFrom(this.feet(state.hiker));
  }

  /** Animates the Hiker along a path of stumps; resolves when he arrives. */
  walk(path: Pt[]): Promise<void> {
    if (path.length < 2) return Promise.resolve();
    const pts = path.map((p) => this.feet(p));
    const durations = pts.slice(1).map((q, i) => (WALK_SPEED * (Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y))) / this.cell);
    const total = durations.reduce((s, d) => s + d, 0);
    let t = 0;
    return new Promise((resolve) => {
      const tick = (ticker: Ticker) => {
        t = Math.min(total, t + ticker.deltaMS / 1000);
        let i = 0;
        let local = t;
        while (i < durations.length - 1 && local > durations[i]) local -= durations[i++];
        const k = durations[i] > 0 ? Math.min(1, local / durations[i]) : 1;
        const from = pts[i];
        const to = pts[i + 1];
        if (to.x !== from.x) this.hiker.scale.x = to.x < from.x ? -1 : 1;
        const bob = t < total ? Math.abs(Math.sin(t * 16)) * this.cell * 0.04 : 0;
        this.hiker.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - bob);
        if (t >= total) {
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
  }

  private at(p: Pt): { x: number; y: number } {
    return { x: (colOf(p) + 0.5) * this.cell, y: (rowOf(p) + 0.5) * this.cell };
  }

  private feet(p: Pt): { x: number; y: number } {
    const { x, y } = this.at(p);
    return { x, y: y + this.cell * 0.1 };
  }

  /** Axis-aligned rectangle from stump a to stump b, `f` cells wide. */
  private band(a: Pt, b: Pt, f: number): Rectangle {
    const A = this.at(a);
    const B = this.at(b);
    const w = this.cell * f;
    const horizontal = A.y === B.y;
    return new Rectangle(
      Math.min(A.x, B.x) - (horizontal ? 0 : w / 2),
      Math.min(A.y, B.y) - (horizontal ? w / 2 : 0),
      horizontal ? Math.abs(A.x - B.x) : w,
      horizontal ? w : Math.abs(A.y - B.y),
    );
  }

  private tappable(g: Graphics, hitArea: Rectangle | Circle, onTap: (e: FederatedPointerEvent) => void): void {
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = hitArea;
    g.on("pointertap", onTap);
  }

  private drawGround(): void {
    const c = this.cell;
    const g = this.ground;
    const W = COLS * c;
    const H = ROWS * c;
    const bank = c * 0.85;
    g.clear();
    g.roundRect(0, 0, W, H, c * 0.18).fill(WATER);
    g.rect(0, H * 0.33, W, H * 0.34).fill({ color: WATER_DARK, alpha: 0.35 });
    for (const top of [true, false]) {
      const y = top ? 0 : H - bank;
      g.roundRect(0, y, W, bank, c * 0.18).fill(GRASS);
      g.rect(0, top ? bank / 2 : y, W, bank / 2).fill(GRASS);
      g.rect(0, top ? bank - c * 0.07 : y, W, c * 0.07).fill(SAND);
    }
    // The holes of the game grid.
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const bankRow = r === 0 || r === ROWS - 1;
        g.circle((col + 0.5) * c, (r + 0.5) * c, c * 0.07).fill({ color: bankRow ? 0x3f6e2c : 0x1d4f75, alpha: 0.55 });
      }
    }
  }

  private drawWaves(): void {
    const c = this.cell;
    const g = this.waves;
    const W = COLS * c;
    g.clear();
    if (this.width === 0) return;
    for (let i = 0; i < 16; i++) {
      const span = W - c * 0.5;
      const x = c * 0.1 + ((((i * 0.383) % 1) * span + this.time * c * (0.12 + (i % 3) * 0.04)) % span);
      const y = c * (1.05 + ((i * 0.618) % 1) * 4.9);
      const lift = Math.sin(this.time * 2 + i) * c * 0.02;
      g.moveTo(x, y).quadraticCurveTo(x + c * 0.14, y - c * 0.07 + lift, x + c * 0.28, y);
    }
    g.stroke({ width: Math.max(1, c * 0.03), color: 0xffffff, alpha: 0.28, cap: "round" });
  }

  private drawPlank(g: Graphics, a: Pt, b: Pt, ghost: boolean): void {
    const c = this.cell;
    const r = this.band(a, b, 0.3);
    if (ghost) {
      g.roundRect(r.x, r.y, r.width, r.height, c * 0.05).fill({ color: 0xfff1a8, alpha: 0.55 });
      g.stroke({ width: c * 0.03, color: 0xffffff, alpha: 0.9 });
      return;
    }
    g.roundRect(r.x + c * 0.03, r.y + c * 0.04, r.width, r.height, c * 0.05).fill({ color: 0x000000, alpha: 0.25 });
    g.roundRect(r.x, r.y, r.width, r.height, c * 0.05).fill(WOOD).stroke({ width: c * 0.025, color: WOOD_DARK });
    const horizontal = r.width > r.height;
    for (const f of [0.35, 0.68]) {
      if (horizontal) g.moveTo(r.x + c * 0.1, r.y + r.height * f).lineTo(r.right - c * 0.1, r.y + r.height * f);
      else g.moveTo(r.x + r.width * f, r.y + c * 0.1).lineTo(r.x + r.width * f, r.bottom - c * 0.1);
    }
    g.stroke({ width: Math.max(1, c * 0.012), color: WOOD_DARK, alpha: 0.4 });
  }

  private drawStump(g: Graphics, x: number, y: number, ring: number | null): void {
    const c = this.cell;
    const r = c * 0.24;
    g.circle(x + c * 0.03, y + c * 0.07, r).fill({ color: 0x000000, alpha: 0.25 });
    g.circle(x, y + c * 0.05, r).fill(BARK);
    g.circle(x, y, r).fill(STUMP_TOP).stroke({ width: c * 0.03, color: ring ?? BARK });
    g.circle(x, y, r * 0.62).stroke({ width: Math.max(1, c * 0.014), color: 0xa8743f });
    g.circle(x, y, r * 0.28).stroke({ width: Math.max(1, c * 0.014), color: 0xa8743f });
  }

  private drawFlag(g: Graphics, x: number, y: number): void {
    const c = this.cell;
    const px = x + c * 0.2;
    g.rect(px - c * 0.012, y - c * 0.42, c * 0.024, c * 0.36).fill(0x5d4037);
    g.poly([px, y - c * 0.42, px + c * 0.2, y - c * 0.35, px, y - c * 0.28]).fill(FINISH_COLOR);
  }

  private label(text: string, p: Pt, dy: number): void {
    const { x, y } = this.at(p);
    const t = new Text({
      text,
      style: { fontFamily: "system-ui, sans-serif", fontSize: Math.max(9, this.cell * 0.15), fontWeight: "800", fill: 0xffffff, stroke: { color: 0x234d1a, width: 3 } },
    });
    t.anchor.set(0.5);
    t.position.set(x, y + dy * this.cell);
    this.pieces.addChild(t);
  }

  private drawHiker(state: State): void {
    for (const child of this.hiker.removeChildren()) child.destroy();
    const s = this.cell;
    const g = new Graphics();
    g.ellipse(0, 0, s * 0.15, s * 0.05).fill({ color: 0x000000, alpha: 0.3 });
    // Legs and boots.
    g.rect(-s * 0.07, -s * 0.16, s * 0.055, s * 0.15).fill(0x3e4a6b);
    g.rect(s * 0.015, -s * 0.16, s * 0.055, s * 0.15).fill(0x3e4a6b);
    g.roundRect(-s * 0.085, -s * 0.03, s * 0.08, s * 0.04, s * 0.015).fill(0x4e342e);
    g.roundRect(s * 0.005, -s * 0.03, s * 0.08, s * 0.04, s * 0.015).fill(0x4e342e);
    // Backpack, body, head and hat.
    g.roundRect(-s * 0.15, -s * 0.38, s * 0.09, s * 0.2, s * 0.03).fill(0xf0a030).stroke({ width: s * 0.015, color: 0x9c5f10 });
    g.roundRect(-s * 0.09, -s * 0.38, s * 0.18, s * 0.24, s * 0.05).fill(0xd94f3d);
    g.circle(0, -s * 0.46, s * 0.085).fill(0xf2c49b);
    g.ellipse(0, -s * 0.52, s * 0.13, s * 0.03).fill(0x3f6b35);
    g.roundRect(-s * 0.07, -s * 0.6, s * 0.14, s * 0.08, s * 0.03).fill(0x3f6b35);
    if (state.held) {
      // Arms up, carrying the plank overhead. Its drawn length shows which plank it is.
      const len = s * (0.3 + 0.22 * state.held.length);
      g.moveTo(-s * 0.08, -s * 0.34).lineTo(-s * 0.14, -s * 0.66).moveTo(s * 0.08, -s * 0.34).lineTo(s * 0.14, -s * 0.66);
      g.stroke({ width: s * 0.04, color: 0xd94f3d, cap: "round" });
      g.roundRect(-len / 2, -s * 0.74, len, s * 0.1, s * 0.03).fill(WOOD).stroke({ width: s * 0.02, color: WOOD_DARK });
    } else {
      g.moveTo(-s * 0.08, -s * 0.34).lineTo(-s * 0.12, -s * 0.2).moveTo(s * 0.08, -s * 0.34).lineTo(s * 0.12, -s * 0.2);
      g.stroke({ width: s * 0.04, color: 0xd94f3d, cap: "round" });
    }
    this.hiker.addChild(g);
  }
}
