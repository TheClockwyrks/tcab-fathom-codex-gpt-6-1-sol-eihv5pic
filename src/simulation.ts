import * as C from "./constants";
import {
  type FathomState,
  type Body,
  type Direction,
  type Predator,
  dirs,
  vectors,
  center,
  neighbor,
  open,
  distances,
  random,
  line,
  locate,
  reconcile,
  setCell,
  roster,
  changeScreen,
  fresh,
} from "./model";
// Timers finish on their exact fixed tick despite floating-point subtraction.
function countdown(value: number) {
  const next = value - C.TICK_DT;
  return next < 1e-9 ? 0 : next;
}
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  choose: () => Direction | null,
  den = false,
) {
  if (!open(s, b.tx, b.ty, den)) return;
  let left = speed * C.TICK_DT;
  while (left > 1e-8) {
    const c = center(b.tx, b.ty);
    const at = Math.abs(b.x - c.x) < 1e-7 && Math.abs(b.y - c.y) < 1e-7;
    if (at) {
      const d = choose();
      if (!d) return;
      b.dir = d;
      if (!open(s, ...neighbor(s, b.tx, b.ty, d), den)) return;
    }
    const [dx, dy] = vectors[b.dir];
    const delta = dx ? (b.x - c.x) * dx : (b.y - c.y) * dy;
    const distance = delta < -1e-7 ? -delta : C.TILE - delta;
    const step = Math.min(left, distance);
    b.x += dx * step;
    b.y += dy * step;
    left -= step;
    if (b.x < C.GRID_ORIGIN_X) b.x += C.GRID_COLS * C.TILE;
    if (b.x >= C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE)
      b.x -= C.GRID_COLS * C.TILE;
    locate(b);
    if (step === distance) {
      const cc = center(b.tx, b.ty);
      b.x = cc.x;
      b.y = cc.y;
    }
  }
}
function wander(s: FathomState, b: Body, den = false) {
  let options = dirs.filter((d) => open(s, ...neighbor(s, b.tx, b.ty, d), den));
  const reverse = dirs[(dirs.indexOf(b.dir) + 2) % 4];
  if (options.length > 1) options = options.filter((d) => d !== reverse);
  return options.length
    ? options[Math.floor(random(s) * options.length)]
    : null;
}
function path(
  s: FathomState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
) {
  if (b.tx === target.tx && b.ty === target.ty) return null;
  const map = distances(s, target.tx, target.ty, den);
  let best = Infinity;
  let result: Direction | null = null;
  for (const d of dirs) {
    const [x, y] = neighbor(s, b.tx, b.ty, d);
    const n = map.get(`${x},${y}`) ?? Infinity;
    if (n < best) {
      best = n;
      result = d;
    }
  }
  return result;
}
function blind(s: FathomState, p: Predator) {
  return s.inkClouds.some((i) => {
    const f = s.forager,
      dx = f.x - p.x,
      dy = f.y - p.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((i.x - p.x) * dx + (i.y - p.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(p.x + t * dx - i.x, p.y + t * dy - i.y) <= i.radius;
  });
}
function acquire(s: FathomState, p: Predator, freshSound = false) {
  if (p.state !== "chase" || freshSound) {
    p.alertIn = p.kind === "lanternjaw" ? 0 : C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.linger = C.LINGER_TIME;
  if (p.flaring) p.fadeIn = 0.3;
  p.flareTime = 0;
  p.flareCharging = false;
  p.flaring = false;
  p.flareRadius = p.kind === "flarefish" ? 0 : null;
}
export function cast(
  s: FathomState,
  source: "forager" | "gloamfin",
  owner: number | null = null,
  tint: "cyan" | "violet" | "orange" = "cyan",
) {
  const b = owner === null ? s.forager : s.predators[owner];
  s.pulses.push({
    source,
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: source === "forager" ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
  });
}
export function attempt(s: FathomState) {
  s.forager = { ...center(s.start.tx, s.start.ty), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = s.ink.cooldown = 0;
  s.playTime = 0;
  s.pendingSonar = s.pendingInk = false;
  changeScreen(s, "countdown");
  reconcile(s);
}
/** The only clock for movement, sensing, AI, contact and progression. */
export function tick(
  s: FathomState,
  held: Direction | null,
  events: Set<C.CueName>,
) {
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    if (s.screenTime + 1e-9 >= 2) {
      changeScreen(s, "playing");
      for (const p of s.predators) if (p.slot === 0) p.released = true;
    }
    lighting(s);
    return;
  }
  if (s.screen === "cleared") {
    if (s.screenTime + 1e-9 >= 2) {
      const next = fresh(s.art, s.muted);
      Object.assign(s, next, {
        score: s.score,
        lives: s.lives,
        depth: s.depth + 1,
        simTime: s.simTime,
        titleIndex: s.titleIndex,
        remainder: s.remainder,
      });
      s.predators = roster(s.depth);
      changeScreen(s, "countdown");
      reconcile(s);
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.playTime += C.TICK_DT;
  // Action edges wait for a whole simulation tick, including frames shorter than one tick.
  if (s.pendingSonar && s.sonar.cooldown === 0) {
    cast(s, "forager");
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    events.add(C.CUES.sonar);
  }
  if (s.pendingInk && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    events.add(C.CUES.ink);
  }
  s.pendingSonar = s.pendingInk = false;

  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = countdown(s.brightHold);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.sonar.cooldown = countdown(s.sonar.cooldown);
  s.ink.cooldown = countdown(s.ink.cooldown);
  s.inkClouds = s.inkClouds
    .map((i) => ({ ...i, remaining: countdown(i.remaining) }))
    .filter((i) => i.remaining > 0);
  if (held) {
    s.desired = held;
    const v = vectors[s.forager.dir],
      w = vectors[held];
    if (v[0] === -w[0] && v[1] === -w[1]) s.forager.dir = held;
    const before = { x: s.forager.x, y: s.forager.y };
    move(s, s.forager, C.FORAGER_SPEED, () =>
      open(s, ...neighbor(s, s.forager.tx, s.forager.ty, s.desired))
        ? s.desired
        : open(s, ...neighbor(s, s.forager.tx, s.forager.ty, s.forager.dir))
          ? s.forager.dir
          : null,
    );
    s.forager.moving = before.x !== s.forager.x || before.y !== s.forager.y;
  } else s.forager.moving = false;
  const f = s.forager;
  if (s.tiles[f.ty]?.[f.tx] === "." && s.plankton[f.ty]?.[f.tx] === "*") {
    setCell(s.plankton, f.tx, f.ty, "-");
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    events.add(C.CUES.eat);
    reconcile(s);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      events.add(C.CUES.descend);
      changeScreen(s, "cleared");
      lighting(s);
      return;
    }
  }
  reconcile(s);
  for (let index = 0; index < s.predators.length; index++) {
    const p = s.predators[index];
    p.alertIn = countdown(p.alertIn);
    p.markIn = countdown(p.markIn);
    p.fadeIn = countdown(p.fadeIn);
    p.alert = p.alertIn > 0;
    if (p.slot !== null && s.playTime + 1e-9 >= p.slot * C.DEN_RELEASE_GAP)
      p.released = true;
    if (!p.mind) continue;
    if (p.state === "den") {
      const gate = s.tiles.flatMap((r, y) =>
        [...r].flatMap((t, x) => (t === "g" ? [{ tx: x, ty: y }] : [])),
      )[0];
      if (
        gate &&
        s.tiles.some((r) => r.includes("d")) &&
        p.released &&
        p.travel
      ) {
        const exit = dirs
          .map((d) => neighbor(s, gate.tx, gate.ty, d))
          .find(([x, y]) => open(s, x, y));
        if (exit)
          move(
            s,
            p,
            p.speed,
            () => path(s, p, { tx: exit[0], ty: exit[1] }, true),
            true,
          );
        if (s.tiles[p.ty]?.[p.tx] === ".") p.state = "wander";
      }
      continue;
    }
    const distance = Math.hypot(p.x - f.x, p.y - f.y);
    if (p.kind === "gloamfin") {
      const was = p.hearingLock;
      p.hearingLock = distance <= C.GLOAMFIN_HEAR;
      if (p.hearingLock) {
        acquire(s, p, !was);
        p.pingIn = 0;
      }
      p.pingIn = countdown(p.pingIn);
      p.sincePing += C.TICK_DT;
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
            C.GLOAMFIN_RAMP_TIME,
      );
      if (
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        !p.hearingLock
      ) {
        p.state = "search";
        p.searchTime = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.searchTime += C.TICK_DT;
        if (p.searchTime + 1e-9 >= C.GLOAMFIN_GIVEUP) {
          p.state = "wander";
          p.fix = null;
        }
      }
      const guaranteed =
        p.state === "search" &&
        !p.searchPing &&
        p.searchTime + 1e-9 >= C.GLOAMFIN_SEARCH_DELAY;
      if (
        !p.hearingLock &&
        p.sincePing + 1e-9 >= C.GLOAMFIN_PING_MIN_GAP &&
        (guaranteed || p.pingIn <= 0 || was)
      ) {
        cast(s, "gloamfin", index, guaranteed ? "orange" : "violet");
        if (guaranteed) p.searchPing = true;
        p.pingIn = C.GLOAMFIN_PING_INTERVAL;
        p.sincePing = 0;
        events.add(C.CUES.predatorPing);
      }
    } else {
      const blocked = blind(s, p);
      const sense =
        !blocked && distance <= (p.detectRange ?? 0) && line(s, p, f);
      const bloomSense = p.flaring && !blocked && distance <= C.FLARE_RADIUS;
      if (sense || bloomSense) acquire(s, p);
      else if (p.state === "chase") {
        p.linger = countdown(p.linger);
        if (blocked || p.linger <= 0) {
          p.state = "wander";
          p.fix = null;
          p.flareIn = C.FLARE_INTERVAL;
        }
      }
      if (p.kind === "flarefish" && p.state === "wander") {
        if (p.flareTime > 0) {
          p.flareTime = countdown(p.flareTime);
          if (p.flareTime <= 0) {
            p.flaring = false;
            p.flareCharging = false;
            p.flareRadius = 0;
            p.flareIn = C.FLARE_INTERVAL;
            p.fadeIn = 0.3;
          } else if (p.flareTime <= C.FLARE_BLOOM + 1e-9 && !p.flaring) {
            p.flareCharging = false;
            p.flaring = true;
            p.flareRadius = C.FLARE_RADIUS;
            events.add(C.CUES.flare);
          }
        } else {
          p.flareIn = countdown(p.flareIn);
          if (p.flareIn <= 0) {
            p.flareTime = C.FLARE_CHARGE + C.FLARE_BLOOM;
            p.flareCharging = true;
          }
        }
        // The bloom can acquire through rock on its very first lit tick.
        if (p.flaring && !blocked && distance <= C.FLARE_RADIUS) acquire(s, p);
      }
    }
    reconcile(s);
    if (p.travel) {
      if (p.state === "chase" && p.fix) {
        const desired = path(s, p, p.fix);
        if (desired && dirs[(dirs.indexOf(p.dir) + 2) % 4] === desired)
          p.dir = desired;
      }
      const old = p.dir;
      move(s, p, p.speed, () => {
        if (p.state === "chase" && p.fix) return path(s, p, p.fix);
        if (
          p.state === "search" &&
          p.fix &&
          (distances(s, p.fix.tx, p.fix.ty).get(`${p.tx},${p.ty}`) ??
            Infinity) >= C.GLOAMFIN_SEARCH_ROAM
        )
          return path(s, p, p.fix);
        return wander(s, p);
      });
      if (
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        vectors[old][0] * vectors[p.dir][0] +
          vectors[old][1] * vectors[p.dir][1] ===
          0
      )
        p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
    }
    p.alert = p.alertIn > 0;
  }
  for (const pulse of s.pulses) {
    const previous = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const map = distances(s, pulse.ox, pulse.oy, true);
    const reached = (x: number, y: number) => {
      const d = map.get(`${x},${y}`);
      return (
        d !== undefined &&
        d <= pulse.range &&
        d <= pulse.front &&
        (d > previous || (previous === 0 && d === 0))
      );
    };
    if (pulse.source === "forager") {
      for (const [key, d] of map) {
        if (d <= pulse.range && d <= pulse.front) {
          const [x, y] = key.split(",").map(Number);
          if (s.visibility[y][x] === "u") setCell(s.visibility, x, y, "r");
          for (const dir of dirs) {
            const [nx, ny] = neighbor(s, x, y, dir);
            if (s.tiles[ny]?.[nx] === "#" && s.visibility[ny][nx] === "u")
              setCell(s.visibility, nx, ny, "r");
          }
        }
      }
      for (const p of s.predators)
        if (
          p.state !== "den" &&
          reached(p.tx, p.ty) &&
          p.kind !== "lanternjaw"
        ) {
          p.markIn = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p, true);
        }
    } else if (!pulse.caught && reached(f.tx, f.ty)) {
      pulse.caught = true;
      const p = pulse.owner === null ? null : s.predators[pulse.owner];
      if (p?.mind) acquire(s, p, true);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  s.drifterIn = countdown(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const gate = s.tiles.flatMap((r, y) =>
      [...r].flatMap((t, x) => (t === "g" ? [[x, y]] : [])),
    )[0];
    if (gate) {
      const exit = dirs
        .map((d) => neighbor(s, gate[0], gate[1], d))
        .find(([x, y]) => open(s, x, y));
      if (exit) {
        s.drifters.push({
          ...center(...exit),
          dir: "up",
          lit: false,
          mind: true,
          travel: true,
        });
        s.drifterIn = C.DRIFTER_INTERVAL;
      }
    }
  }
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (
    s.predators.some((p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty)
  ) {
    events.add(C.CUES.caught);
    if (s.lives === 0) changeScreen(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  reconcile(s);
  lighting(s);
}
/** Rebuild current lighting while retaining every previously revealed tile. */
export function lighting(s: FathomState) {
  const blooms = s.predators.filter((p) => p.flaring);
  const sonarMaps = s.pulses
    .filter((p) => p.source === "forager")
    .map((p) => ({ pulse: p, map: distances(s, p.ox, p.oy, true) }));
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const c = center(x, y);
      const light =
        Math.hypot(c.x - s.forager.x, c.y - s.forager.y) <= s.visionRadius &&
        line(s, s.forager, c, true);
      const flare = blooms.some(
        (p) => Math.hypot(c.x - p.x, c.y - p.y) <= C.FLARE_RADIUS,
      );
      const sonar = sonarMaps.some(
        ({ pulse, map }) =>
          Math.abs((map.get(`${x},${y}`) ?? Infinity) - pulse.front) < 0.55,
      );
      setCell(
        s.visibility,
        x,
        y,
        light || flare || sonar ? "l" : s.visibility[y][x] === "u" ? "u" : "r",
      );
    }
  for (const b of [...s.predators, ...s.drifters]) {
    const c = center(b.tx, b.ty);
    const passive =
      Math.hypot(c.x - s.forager.x, c.y - s.forager.y) <= s.visionRadius &&
      line(s, s.forager, c);
    const flare = blooms.some(
      (p) => Math.hypot(b.x - p.x, b.y - p.y) <= C.FLARE_RADIUS,
    );
    b.lit = passive || flare;
    if ("kind" in b) {
      const p = b as Predator;
      p.alert = p.alertIn > 0;
      p.lit = p.state !== "den" && (p.lit || p.markIn > 0 || p.alert);
    }
  }
}
