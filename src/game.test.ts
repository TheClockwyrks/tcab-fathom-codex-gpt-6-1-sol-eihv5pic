import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type FathomState,
  type FathomDebugApi,
} from "./game";
import * as C from "./constants";
import { center, dirs, neighbor, distances } from "./model";
const engines: Engine<FathomState, FathomDebugApi>[] = [];
beforeAll(() => {
  vi.stubGlobal("fetch", async (path: string) => new Response(path));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(await blob.text()),
  );
});
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});
async function setup(step = 1000 / 60) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  function key(code: string, down = true) {
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  }
  return { e: engine, key, target, canvas };
}
function fixture(rows: Record<number, string>) {
  return Array.from(
    { length: C.GRID_ROWS },
    (_, y) => rows[y] ?? "#".repeat(C.GRID_COLS),
  );
}
async function empty() {
  const t = await setup();
  t.e.apply((s) => t.e.debug.clearPredators(s));
  t.e.apply((s) => t.e.debug.clearPlankton(s));
  t.e.apply((s) => t.e.debug.setScreen(s, "playing"));
  return t;
}
describe("engine driven dive", () => {
  it("initializes all assets, a conforming connected maze and pure readings", async () => {
    const { e } = await setup();
    const s = e.state;
    expect(s.screen).toBe("title");
    expect(s.visibility.every((r) => /^u+$/.test(r))).toBe(true);
    expect(Object.values(s.art).reduce((n, a) => n + a.length, 0)).toBe(75);
    const map = distances(s, s.start.tx, s.start.ty);
    const corridors = s.tiles.join("").split(".").length - 1;
    expect(map.size).toBe(corridors);
    expect(corridors / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    let neighbors = 0;
    const degree = new Map<string, number>();
    for (const key of map.keys()) {
      const [x, y] = key.split(",").map(Number);
      const n = dirs.filter((d) => {
        const [nx, ny] = neighbor(s, x, y, d);
        return s.tiles[ny]?.[nx] === ".";
      }).length;
      expect(n).toBeGreaterThanOrEqual(2);
      neighbors += n;
      degree.set(key, n);
      expect(s.tiles[y][x]).toBe(s.tiles[y][35 - x]);
      expect(
        !(
          s.tiles[y][x + 1] === "." &&
          s.tiles[y + 1]?.[x] === "." &&
          s.tiles[y + 1]?.[x + 1] === "."
        ),
      ).toBe(true);
    }
    expect(neighbors / corridors).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const seen = new Set<string>();
    const runs: number[] = [];
    for (const [key, n] of degree) {
      if (n !== 2 || seen.has(key)) continue;
      const queue = [key];
      seen.add(key);
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i].split(",").map(Number);
        for (const d of dirs) {
          const [nx, ny] = neighbor(s, x, y, d);
          const k = `${nx},${ny}`;
          if (degree.get(k) === 2 && !seen.has(k)) {
            seen.add(k);
            queue.push(k);
          }
        }
      }
      runs.push(queue.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(e.diagnostics().length).toBeGreaterThan(12);
    const before = JSON.stringify(e.debug.snapshot(s));
    e.debug.snapshot(s);
    expect(JSON.stringify(e.debug.snapshot(s))).toBe(before);
  });
  it("starts through countdown, consumes plankton, and pauses once on Escape", async () => {
    const { e, key, canvas } = await setup();
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    expect(e.state.screen).toBe("countdown");
    await e.advance(120);
    expect(e.state.screen).toBe("playing");
    expect(e.state.score).toBe(C.SCORE_PLANKTON);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("paused");
    const before = e.debug.snapshot(e.state);
    const picture = canvas.toDataURL();
    await e.advance(60);
    expect(canvas.toDataURL()).toBe(picture);
    expect(e.state.forager).toEqual(before.forager);
    expect(e.state.brightHold).toBe(before.brightHold);
    key("Escape", false);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
  });
  it("moves continuously, stops on release and preserves previous state", async () => {
    const { e, key } = await empty();
    const old = e.state;
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(old.forager.x - C.TILE);
    expect(old.forager.x).toBe(center(17, 16).x);
    key("ArrowLeft", false);
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(old.forager.x - C.TILE);
    expect(e.state.forager.moving).toBe(false);
  });
  it("buffers a perpendicular turn and reverses between centers", async () => {
    const { e, key } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 6, 16));
    key("ArrowLeft");
    await e.advance(5);
    key("ArrowUp");
    await e.advance(15);
    expect(e.state.forager.tx).toBe(5);
    expect(e.state.forager.dir).toBe("up");
    expect(e.state.forager.x).toBeCloseTo(center(5, 16).x);
    key("ArrowLeft", false);
    key("ArrowUp", false);
    key("ArrowDown");
    await e.advance(1);
    expect(e.state.forager.dir).toBe("down");
  });
  it("crosses the wrap tunnel without snapping or losing speed", async () => {
    const { e, key } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 0, 11));
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(center(35, 11).x);
    expect(e.state.forager.ty).toBe(11);
  });
  it("integrates identical ticks under different frame divisions", async () => {
    const a = await empty(),
      b = await empty();
    b.e.setClock(new SequenceClock([5, 25, 10, 60]));
    for (const e of [a.e, b.e]) {
      e.apply((s) => e.debug.setBrightness(s, 1));
      e.apply((s) => e.debug.setSonarCooldown(s, 3));
    }
    await a.e.advance(60);
    await b.e.advance(40);
    expect(a.e.debug.snapshot(a.e.state)).toEqual(
      b.e.debug.snapshot(b.e.state),
    );
    expect(a.e.state.brightness).toBeCloseTo(0.5 ** (1 / C.BRIGHT_HALFLIFE));
  });
  it("casts corridor sonar with cooldown and ink with fixed lifetime", async () => {
    const { e, key } = await empty();
    key("Space");
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.pulses[0].front).toBeCloseTo(C.SONAR_WAVE_SPEED / 60);
    expect(e.state.sonar.ready).toBe(false);
    expect(e.state.inkClouds[0].radius).toBe(C.INK_RADIUS);
    const x = e.state.inkClouds[0].x;
    key("ArrowLeft");
    await e.advance(20);
    expect(e.state.inkClouds[0].x).toBe(x);
    key("Space", false);
    key("ShiftLeft", false);
    await e.advance(180);
    expect(e.state.inkClouds).toHaveLength(0);
    expect(e.state.sonar.ready).toBe(true);
  });
  it("keeps fog remembered outside the Kindle window and clearFog is inert", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 1, 16));
    await e.advance(1);
    expect(e.state.visibility[16][1]).toBe("l");
    e.apply((s) => e.debug.setForagerTile(s, 34, 16));
    await e.advance(1);
    expect(e.state.visibility[16][1]).toBe("r");
    e.apply((s) => e.debug.clearFog(s));
    e.apply((s) => e.debug.reconcile(s));
    expect(e.state.visibility.every((r) => /^u+$/.test(r))).toBe(true);
  });
  it("uses light and ink for Lanternjaw, and hearing through rock for Gloamfin", async () => {
    const { e, key } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 5, 16));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 8, 16));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].alert).toBe(false);
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 5, 15));
    e.apply((s) => e.debug.setPredatorTravel(s, 1, false));
    await e.advance(1);
    expect(e.state.predators[1].hearingLock).toBe(true);
    expect(e.state.predators[1].state).toBe("chase");
    expect(e.state.predators[1].alert).toBe(true);
  });
  it("sonar front hands Gloamfin a fix on arrival, never marks amber bodies", async () => {
    const { e, key } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 5, 16));
    for (const kind of ["gloamfin", "lanternjaw"] as const)
      e.apply((s) => e.debug.addPredator(s, kind, 9, 16));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    e.apply((s) => e.debug.setPredatorMind(s, 1, false));
    key("Space");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    await e.advance(18);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].lit).toBe(true);
    expect(e.state.predators[1].lit).toBe(false);
  });
  it("Flarefish charges then reveals through rock", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 1, 16));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 26, 5));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(421);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(31);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.visibility[7][26]).toBe("l");
    await e.advance(61);
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.visibility[7][26]).toBe("r");
  });
  it("costs one reserve life, preserves score, eaten plankton and memory", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setScore(s, 123));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 17, 16));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.lives).toBe(2);
    expect(e.state.score).toBe(123);
    expect(e.state.planktonRemaining).toBe(0);
    e.apply((s) => e.debug.setLives(s, 0));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.clearPredators(s));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 17, 16));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
    expect(e.state.lives).toBe(0);
  });
  it("clears only by eating the last plankton and descends with the correct roster", async () => {
    const { e } = await empty();
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    e.apply((s) => e.debug.setPlankton(s, 17, 16, true));
    await e.advance(1);
    expect(e.state.screen).toBe("cleared");
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    await e.advance(120);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.depth).toBe(2);
    expect(e.state.predators).toHaveLength(4);
    expect(e.state.sonar.range).toBe(8);
  });
  it("admits drifters and rewards tile contact", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setPlankton(s, 1, 1, true));
    e.apply((s) => e.debug.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    expect(e.state.drifterIn).toBeGreaterThan(24);
    e.apply((s) => e.debug.spawnDrifter(s, 17, 16));
    e.apply((s) => e.debug.setDrifterMind(s, 1, false));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_DRIFTER);
  });
  it("accepts fixtures without a den, including isolated corridors", async () => {
    const { e, key } = await empty();
    const rows = fixture({ 10: "#".repeat(5) + "." + "#".repeat(30) });
    e.apply((s) => e.debug.setMaze(s, rows));
    e.apply((s) => e.debug.setForagerTile(s, 5, 10));
    key("ArrowRight");
    await e.advance(60);
    expect(e.state.forager).toMatchObject(center(5, 10));
    expect(e.state.forager.moving).toBe(false);
    e.apply((s) => e.debug.setDepth(s, 6));
    await e.advance(60);
    expect(e.state.predators.every((p) => p.state === "den")).toBe(true);
  });
  it("poses without advancing, rejects invalid domains and resets with mute preserved", async () => {
    const { e, key } = await setup();
    const before = e.state;
    e.apply((s) => e.debug.setBrightness(s, 1));
    expect(e.state.visionRadius).toBe(C.VISION_MIN + C.VISION_GAIN);
    expect(e.state.windowRadius).toBe(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN,
    );
    expect(e.state.simTime).toBe(0);
    expect(before.brightness).toBe(0);
    expect(() => e.debug.setMaze(e.state, ["..."])).toThrow();
    expect(() => e.debug.setMenuIndex(e.state, 9)).toThrow();
    expect(() => e.debug.setBrightness(e.state, 2)).toThrow();
    expect(() => e.debug.setPredatorTile(e.state, 8, 1, 1)).toThrow();
    key("KeyM");
    await e.advance(1);
    e.apply((s) => e.debug.reset(s));
    expect(e.state.muted).toBe(true);
    expect(e.state.score).toBe(0);
    expect(e.state.simTime).toBe(0);
  });
  it("remembers the confirmed title item and returns from field notes", async () => {
    const { e, key } = await setup();
    key("ArrowDown");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    key("Enter", false);
    key("ArrowDown", false);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    expect(e.debug.menuItemRect(e.state, 1)).not.toBeNull();
  });
  it("requires pointer press and release in the same menu region, including one-frame taps", async () => {
    const { e, target } = await setup();
    const send = (
      type: string,
      x: number,
      y: number,
      id = 1,
      device = "mouse",
    ) =>
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: id,
          pointerType: device,
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    const r = e.debug.menuItemRect(e.state, 1)!;
    send("pointerdown", r.x + 10, r.y + 10);
    send("pointerup", r.x + 10, r.y - 55);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    send("pointerdown", r.x + 10, r.y + 10, 2, "touch");
    send("pointerup", r.x + 10, r.y + 10, 2, "touch");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    send("pointerdown", 100, 100);
    send("pointerup", 100, 100);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.titleIndex).toBe(1);
  });
  it("defers action edges until a simulation tick is available", async () => {
    const { e, key } = await empty();
    e.setClock(new ConstantClock(1));
    key("Space");
    await e.advance(1);
    expect(e.state.pulses).toHaveLength(0);
    key("Space", false);
    await e.advance(8);
    expect(e.state.pulses).toHaveLength(1);
  });
  it("paths around rock and pays for a Gloamfin corner", async () => {
    const { e } = await empty();
    const row = (cells: string) =>
      "#####" + cells + "#".repeat(36 - 5 - cells.length);
    e.apply((s) =>
      e.debug.setMaze(s, fixture({ 9: row("......"), 10: row(".####.") })),
    );
    e.apply((s) => e.debug.setForagerTile(s, 10, 10));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 5, 10));
    e.apply((s) => e.debug.setPredatorDir(s, 0, "right"));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    await e.advance(1);
    expect(e.state.predators[0].dir).toBe("up");
    expect(e.state.predators[0].x).toBe(center(5, 10).x);
    expect(e.state.predators[0].y).toBeLessThan(center(5, 10).y);
    expect(e.state.predators[0].speed).toBeLessThan(C.GLOAMFIN_CHASE_SPEED);
  });
  it("holds a lapsed light fix for two seconds, then returns to patrol", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 5, 16));
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 8, 16));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    e.apply((s) => e.debug.setForagerTile(s, 30, 16));
    await e.advance(60);
    expect(e.state.predators[0].state).toBe("chase");
    await e.advance(61);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].speed).toBe(C.DRIFTER_SPEED);
  });
  it("searches an empty fix and casts exactly one orange lost-you ping", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 9, 16));
    e.apply((s) => e.debug.addPredator(s, "gloamfin", 9, 16));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    e.apply((s) => e.debug.setPredatorState(s, 0, "chase"));
    e.apply((s) => e.debug.setForagerTile(s, 30, 16));
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    await e.advance(75);
    expect(e.state.predators[0].state).toBe("search");
    expect(e.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    expect(cues.filter((c) => c === C.CUES.predatorPing)).toHaveLength(1);
    await e.advance(240);
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("takes a flare lock through rock and ends the bloom on acquisition", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.setForagerTile(s, 26, 11));
    e.apply((s) => e.debug.addPredator(s, "flarefish", 26, 5));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    await e.advance(455);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.predators[0].alert).toBe(true);
  });
  it("holds minds and travel independently and caps depth rosters", async () => {
    const { e } = await empty();
    e.apply((s) => e.debug.addPredator(s, "lanternjaw", 9, 16));
    e.apply((s) => e.debug.setPredatorMind(s, 0, false));
    const original = e.state.predators[0];
    await e.advance(90);
    expect(e.state.predators[0].x).toBe(original.x);
    expect(e.state.predators[0].state).toBe("wander");
    e.apply((s) => e.debug.setPredatorMind(s, 0, true));
    e.apply((s) => e.debug.setPredatorTravel(s, 0, false));
    e.apply((s) => e.debug.setForagerTile(s, 8, 16));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].x).toBe(original.x);
    e.apply((s) => e.debug.setDepth(s, 100));
    expect(e.state.predators).toHaveLength(6);
    expect(e.state.sonar.range).toBe(C.SONAR_RANGE_MIN);
    e.apply((s) => e.debug.setPredatorReleased(s, 2, true));
    expect(e.state.predators[2].released).toBe(true);
  });
  it("restarts and quits from pause, preserving the title selection", async () => {
    const { e, key } = await empty();
    e.apply((s) => e.debug.setTitleIndex(s, 1));
    e.apply((s) => e.debug.setScore(s, 800));
    e.apply((s) => e.debug.setScreen(s, "paused"));
    e.apply((s) => e.debug.setMenuIndex(s, 1));
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toBe(0);
    key("Enter", false);
    e.apply((s) => e.debug.setScreen(s, "paused"));
    e.apply((s) => e.debug.setMenuIndex(s, 2));
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
  });
  it("sets and clears every drifter pose without changing the cadence", async () => {
    const { e } = await empty();
    for (let i = 0; i < 3; i++) e.apply((s) => e.debug.spawnDrifter(s, 5, 16));
    expect(e.state.drifters).toHaveLength(3);
    e.apply((s) => e.debug.setDrifterTravel(s, 0, false));
    e.apply((s) => e.debug.setDrifterMind(s, 1, false));
    e.apply((s) => e.debug.setDrifterIn(s, 11));
    await e.advance(1);
    expect(e.state.drifters[0].x).toBe(center(5, 16).x);
    expect(e.state.drifters[1].x).toBe(center(5, 16).x);
    e.apply((s) => e.debug.clearDrifters(s));
    expect(e.state.drifters).toHaveLength(0);
    expect(e.state.drifterIn).toBeCloseTo(11 - 1 / 60);
    e.apply((s) => e.debug.setInkCooldown(s, 12));
    e.apply((s) => e.debug.setBrightHold(s, 1));
    e.apply((s) => e.debug.setForagerDir(s, "right"));
    expect(e.state.ink.cooldown).toBe(12);
    expect(e.state.forager.dir).toBe("right");
  });
});
