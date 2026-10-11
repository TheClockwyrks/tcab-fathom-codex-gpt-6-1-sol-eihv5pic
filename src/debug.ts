import * as C from "./constants";
import {
  type ReadState,
  type Screen,
  type Direction,
  type FathomState,
  copy,
  fresh,
  reconcile,
  changeScreen,
  menu,
  rect,
  open,
  center,
  roster,
  predator,
  setCell,
  dirs,
} from "./model";
function requireValue(ok: boolean) {
  if (!ok) throw new Error("Fathom: invalid debug argument or subject");
}
function number(n: number, min = 0, max = Infinity, whole = false) {
  requireValue(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!whole || Number.isInteger(n)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  requireValue(open(s, x, y, den));
}
function pose(s: ReadState, change: (next: FathomState) => void) {
  const next = copy(s);
  change(next);
  return reconcile(next);
}
function hunter(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drifter(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function boolean(v: boolean) {
  requireValue(typeof v === "boolean");
}
function direction(d: Direction) {
  requireValue(dirs.includes(d));
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) =>
    fresh(s.art as Record<string, ImageBitmap[]>, s.muted),
  snapshot(s: ReadState) {
    return {
      version: s.version,
      screen: s.screen,
      menuIndex: s.menuIndex,
      titleIndex: s.titleIndex,
      depth: s.depth,
      score: s.score,
      lives: s.lives,
      muted: s.muted,
      planktonRemaining: s.planktonRemaining,
      drifterIn: s.drifterIn,
      brightness: s.brightness,
      brightHold: s.brightHold,
      visionRadius: s.visionRadius,
      windowRadius: s.windowRadius,
      sonar: { ...s.sonar },
      ink: { ...s.ink },
      grid: { ...s.grid },
      tiles: [...s.tiles],
      plankton: [...s.plankton],
      visibility: [...s.visibility],
      forager: { ...s.forager },
      drifters: s.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: s.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: s.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
      inkClouds: s.inkClouds.map((i) => ({ ...i })),
      simTime: s.simTime,
    };
  },
  reconcile: (s: ReadState) => reconcile(copy(s)),
  setScreen: (s: ReadState, v: Screen) =>
    pose(s, (n) => {
      requireValue(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(v),
      );
      changeScreen(n, v);
      if (v === "playing") {
        n.playTime = 0;
      }
    }),
  setMenuIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, menu(n).length - 1, true);
      n.menuIndex = i;
    }),
  setTitleIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = i;
    }),
  menuItemRect: rect,
  setScore: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.score = v;
    }),
  setLives: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.lives = v;
    }),
  setDepth: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 1, Infinity, true);
      n.depth = v;
      n.predators = roster(v);
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      requireValue(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
      );
      const joined = rows.join("");
      requireValue(!/[gd]/.test(joined) || joined.split("g").length - 1 === 1);
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      tile(n, x, y);
      boolean(present);
      setCell(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = n.tiles.map(() => "-".repeat(C.GRID_COLS));
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = n.tiles.map(() => "u".repeat(C.GRID_COLS));
    }),
  setForagerTile: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y);
      Object.assign(n.forager, center(x, y), { moving: false });
    }),
  setForagerDir: (s: ReadState, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      n.forager.dir = n.desired = d;
      n.forager.moving = false;
    }),
  setBrightness: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, 1);
      n.brightness = v;
    }),
  setBrightHold: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.BRIGHT_HOLD);
      n.brightHold = v;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, k: C.PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      requireValue(C.DEN_ORDER.includes(k));
      tile(n, x, y);
      n.predators.push(predator(k, x, y, null));
    }),
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y, true);
      Object.assign(hunter(n, i), center(x, y));
    }),
  setPredatorDir: (s: ReadState, i: number, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      hunter(n, i).dir = d;
    }),
  setPredatorState: (s: ReadState, i: number, v: "den" | "wander" | "chase") =>
    pose(s, (n) => {
      const p = hunter(n, i);
      requireValue(["den", "wander", "chase"].includes(v));
      const t = n.tiles[p.ty]?.[p.tx];
      requireValue(v === "den" ? t === "d" || t === "g" : t === ".");
      p.state = v;
      p.fix = v === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.alertIn = 0;
      p.alert = false;
      p.flareIn = C.FLARE_INTERVAL;
      p.flareTime = 0;
      p.flareCharging = p.kind === "flarefish" ? false : null;
      p.flaring = p.kind === "flarefish" ? false : null;
      p.flareRadius = p.kind === "flarefish" ? 0 : null;
    }),
  setPredatorReleased: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      boolean(v);
      hunter(n, i).released = v;
    }),
  setPredatorMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      boolean(v);
      hunter(n, i).mind = v;
    }),
  setPredatorTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      boolean(v);
      hunter(n, i).travel = v;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y);
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      boolean(v);
      drifter(n, i).mind = v;
    }),
  setDrifterTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      boolean(v);
      drifter(n, i).travel = v;
    }),
  setDrifterIn: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = v;
    }),
  setSonarCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.sonar.cooldown = v;
    }),
  setInkCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.ink.cooldown = v;
    }),
};
export type FathomDebugApi = typeof debug;
