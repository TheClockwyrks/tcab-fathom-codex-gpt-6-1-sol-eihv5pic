import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertIn: number;
  markIn: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareTime: number;
  fadeIn: number;
  chaseSpeed: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  remainder: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  pendingSonar: boolean;
  pendingInk: boolean;
  seed: number;
  start: { tx: number; ty: number };
  pointerStart: Record<number, number | null>;
  pointerX: number;
  pointerY: number;
  art: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export const dirs: Direction[] = ["up", "right", "down", "left"];
export const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
/** Copy mutable simulation values while sharing immutable decoded art. */
export function copy(s: ReadState): FathomState {
  return {
    ...s,
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    forager: { ...s.forager },
    start: { ...s.start },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    drifters: s.drifters.map((d) => ({ ...d })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((i) => ({ ...i })),
    pointerStart: { ...s.pointerStart },
    art: s.art as Record<string, ImageBitmap[]>,
  };
}
/** A mirrored network of loops; the sealed central chamber has one exit. */
export function maze(): string[] {
  const a = Array.from({ length: C.GRID_ROWS }, () =>
    Array<string>(C.GRID_COLS).fill("#"),
  );
  for (const y of [1, 5, 11, 16])
    for (let x = 1; x < C.GRID_COLS - 1; x++) a[y][x] = ".";
  for (const x of [1, 5, 9, 13, 22, 26, 30, 34])
    for (let y = 1; y <= 16; y++) a[y][x] = ".";
  a[11][0] = a[11][35] = ".";
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) a[y][x] = "d";
  a[6][17] = "g";
  return a.map((r) => r.join(""));
}
export function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
  slot: number | null,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    lit: false,
    mind: true,
    travel: true,
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertIn: 0,
    markIn: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fadeIn: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    slot,
  };
}
export function roster(depth: number): Predator[] {
  const kinds = [...C.DEN_ORDER];
  for (let n = 1; n < Math.min(depth, C.ROSTER_CAP_DEPTH); n++)
    kinds.push(C.ROSTER_ADD_ORDER[n - 1]);
  return kinds.map((k, i) =>
    predator(k, 16 + (i % 4), 8 + Math.floor(i / 4), i),
  );
}
export function fresh(
  art: Record<string, ImageBitmap[]> = {},
  muted = false,
): FathomState {
  const tiles = maze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: tiles.map(() => "u".repeat(C.GRID_COLS)),
    forager: { ...center(17, 16), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenTime: 0,
    playTime: 0,
    desired: "left",
    pendingSonar: false,
    pendingInk: false,
    seed: 7321,
    start: { tx: 17, ty: 16 },
    pointerStart: {},
    pointerX: 0,
    pointerY: 0,
    art,
  });
}
export function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function reconcile(s: FathomState): FathomState {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  locate(s.forager);
  for (const b of [...s.drifters, ...s.predators]) locate(b);
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
export function setCell(rows: string[], x: number, y: number, v: string) {
  rows[y] = rows[y].slice(0, x) + v + rows[y].slice(x + 1);
}
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  d: Direction,
): [number, number] {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (
    ny === y &&
    s.tiles[y]?.[0] === "." &&
    s.tiles[y]?.[C.GRID_COLS - 1] === "."
  )
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, ny];
}
export function open(s: ReadState, x: number, y: number, den = false) {
  const t = s.tiles[y]?.[x];
  return t === "." || (den && (t === "g" || t === "d"));
}
export function distances(
  s: ReadState,
  x: number,
  y: number,
  den = false,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!open(s, x, y, den)) return map;
  const q: [[number, number], number][] = [[[x, y], 0]];
  map.set(`${x},${y}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [[tx, ty], n] = q[i];
    for (const d of dirs) {
      const [nx, ny] = neighbor(s, tx, ty, d);
      const k = `${nx},${ny}`;
      if (open(s, nx, ny, den) && !map.has(k)) {
        map.set(k, n + 1);
        q.push([[nx, ny], n + 1]);
      }
    }
  }
  return map;
}
export function random(s: FathomState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function line(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  targetRock = false,
) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  for (let i = 0; i <= Math.ceil(len / 4); i++) {
    const t = i / Math.max(1, Math.ceil(len / 4));
    const x = Math.floor((a.x + (b.x - a.x) * t - C.GRID_ORIGIN_X) / C.TILE),
      y = Math.floor((a.y + (b.y - a.y) * t - C.GRID_ORIGIN_Y) / C.TILE);
    if (
      s.tiles[y]?.[x] === "#" &&
      !(
        targetRock &&
        x === Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE) &&
        y === Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE)
      )
    )
      return false;
  }
  return true;
}
export function changeScreen(s: FathomState, screen: Screen) {
  s.screen = screen;
  s.screenTime = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
}
export function menu(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function rect(s: ReadState, index: number) {
  return Number.isInteger(index) && index >= 0 && index < menu(s).length
    ? {
        x: 470,
        y: (s.screen === "title" ? 390 : 365) + index * 62,
        w: 340,
        h: 48,
      }
    : null;
}
