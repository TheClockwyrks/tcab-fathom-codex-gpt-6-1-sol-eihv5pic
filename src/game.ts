import "./stage.css";
import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  type FathomState as GameState,
  type ReadState,
  type Direction,
  copy,
  fresh,
  reconcile,
  changeScreen,
  menu,
  rect,
} from "./model";
import { debug, type FathomDebugApi as DebugSurface } from "./debug";
import { tick } from "./simulation";
import { render, STAGE_BACKGROUND } from "./render";
export type FathomState = GameState;
export type FathomDebugApi = DebugSurface;
export type {
  Direction,
  Screen,
  Body,
  Drifter,
  Predator,
  Pulse,
} from "./model";
export const BACKGROUND = STAGE_BACKGROUND;
function newDive(s: FathomState) {
  const next = fresh(s.art, s.muted);
  Object.assign(s, next, {
    simTime: s.simTime,
    titleIndex: s.titleIndex,
    remainder: s.remainder,
  });
  changeScreen(s, "countdown");
}
function title(s: FathomState) {
  const next = fresh(s.art, s.muted);
  Object.assign(s, next, {
    simTime: s.simTime,
    titleIndex: s.titleIndex,
    remainder: s.remainder,
  });
  changeScreen(s, "title");
}
function confirm(s: FathomState) {
  if (s.screen === "title") {
    s.titleIndex = s.menuIndex ?? 0;
    if (s.menuIndex === 0) newDive(s);
    else changeScreen(s, "howto");
  } else if (s.screen === "paused") {
    if (s.menuIndex === 0) changeScreen(s, "playing");
    else if (s.menuIndex === 1) newDive(s);
    else title(s);
  } else if (s.screen === "gameover") {
    if (s.menuIndex === 0) newDive(s);
    else title(s);
  }
}
function input(s: FathomState, api: UpdateApi) {
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (api.input.pressed("pause")) {
      changeScreen(s, "paused");
      return;
    }
    if (api.input.pressed("a")) s.pendingSonar = true;
    if (api.input.pressed("b")) s.pendingInk = true;
    return;
  }
  if (
    s.screen === "paused" &&
    (api.input.pressed("pause") || api.input.pressed("back"))
  ) {
    changeScreen(s, "playing");
    return;
  }
  if (s.screen === "howto") {
    let tapped = false;
    for (const sample of api.input.pointerSamples()) {
      if (sample.button !== "primary") continue;
      if (sample.type === "down") s.pointerStart[sample.id] = -2;
      if (sample.type === "up") {
        tapped ||= s.pointerStart[sample.id] === -2;
        delete s.pointerStart[sample.id];
      }
    }
    if (api.input.pressed("confirm") || api.input.pressed("back") || tapped)
      title(s);
    return;
  }
  const items = menu(s);
  if (!items.length) return;
  if (api.input.pressed("back") && s.screen === "gameover") {
    title(s);
    return;
  }
  if (api.input.pressed("up"))
    s.menuIndex = ((s.menuIndex ?? 0) + items.length - 1) % items.length;
  if (api.input.pressed("down"))
    s.menuIndex = ((s.menuIndex ?? 0) + 1) % items.length;
  const p = api.input.pointer();
  const hit = items.findIndex((_, i) => {
    const r = rect(s, i)!;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  });
  if ((p.x !== s.pointerX || p.y !== s.pointerY) && hit >= 0) s.menuIndex = hit;
  s.pointerX = p.x;
  s.pointerY = p.y;
  let pointerConfirm = false;
  for (const sample of api.input.pointerSamples()) {
    const index = items.findIndex((_, i) => {
      const r = rect(s, i)!;
      return (
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (index >= 0) s.menuIndex = index;
    if (sample.button !== "primary") continue;
    if (sample.type === "down")
      s.pointerStart[sample.id] = index >= 0 ? index : null;
    if (sample.type === "up") {
      if (index >= 0 && s.pointerStart[sample.id] === index) {
        pointerConfirm = true;
        s.menuIndex = index;
      }
      delete s.pointerStart[sample.id];
    }
  }
  if (api.input.pressed("confirm") || pointerConfirm) confirm(s);
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 2 ? "triangle" : "sine",
        freq: [780, 460, 110, 260, 180, 90, 520][i],
        freqTo: [1100, 90, 45, 650, 940, 30, 1040][i],
        durationMs: [60, 320, 400, 230, 600, 700, 850][i],
        gain: 0.12,
      }),
    );
    const sheets: [string, number][] = [
      ["glimmerfin", 8],
      ["lanternjaw", 16],
      ["gloamfin", 8],
      ["flarefish", 8],
      ["drifter", 8],
      ["flare-bloom", 8],
      ["trench-walls", 19],
    ];
    const art = Object.fromEntries(
      await Promise.all(
        sheets.map(async ([name, count]) => [
          name,
          await Promise.all(
            Array.from({ length: count }, (_, i) =>
              api.assets.loadImage(`${name}/${i}.png`),
            ),
          ),
        ]),
      ),
    );
    const sources: Record<string, (s: ReadState) => string | number> = {
      screen: (s) => s.screen,
      depth: (s) => s.depth,
      score: (s) => s.score,
      lives: (s) => s.lives,
      G: (s) => s.brightness,
      V: (s) => s.visionRadius,
      R: (s) => s.windowRadius,
      sonar: (s) => s.sonar.cooldown,
      ink: (s) => s.ink.cooldown,
      plankton: (s) => s.planktonRemaining,
      forager: (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    };
    for (const [name, source] of Object.entries(sources))
      api.diagnostics.register(name, source);
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`predator ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "—";
      });
    return [fresh(art), debug];
  },
  update(state, api, dt) {
    const s = copy(state);
    input(s, api);
    reconcile(s);
    let held: Direction | null = null;
    for (const d of ["up", "down", "left", "right"] as Direction[]) {
      if (api.input.pressed(d)) s.desired = d;
      if (api.input.value(d) > 0) held = s.desired;
    }
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder = Math.max(0, s.remainder - C.TICK_DT);
      const events = new Set<C.CueName>();
      tick(s, held, events);
      for (const cue of events) api.audio.play(cue);
    }
    return reconcile(s);
  },
  render,
};
