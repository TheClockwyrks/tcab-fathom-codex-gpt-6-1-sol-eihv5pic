import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  type ReadState,
  type Direction,
  center,
  dirs,
  neighbor,
  distances,
  line,
  menu,
  rect,
} from "./model";
export const STAGE_BACKGROUND = "#03060c";
const cyan = "#8cf7eb",
  dim = "#557e88",
  amber = "#ff9560";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = cyan,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 0.3,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function sprite(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  sheet: string,
  index: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const image = s.art[sheet]?.[index];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
const frame = (dir: Direction) => ({ down: 0, up: 2, left: 4, right: 6 })[dir];
function tile(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  full = false,
) {
  const v = s.visibility[y][x];
  if (v === "u" && !full) return;
  const t = s.tiles[y][x];
  let index = t === "g" ? 18 : 16;
  if (t === "#") {
    index = 0;
    [1, 2, 4, 8].forEach((bit, i) => {
      const [nx, ny] = neighbor(s, x, y, dirs[i]);
      if (s.tiles[ny]?.[nx] === "#") index += bit;
    });
  }
  const c = center(x, y);
  ctx.globalAlpha = full || v === "l" ? 1 : 0.28;
  sprite(s, ctx, "trench-walls", index, c.x, c.y);
  if (s.plankton[y][x] === "*") {
    ctx.fillStyle = cyan;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(c.x, c.y, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
function amberMote(ctx: CanvasRenderingContext2D, x: number, y: number) {
  glow(ctx, x, y, 21, amber, 0.6);
  ctx.fillStyle = "#ffbb88";
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}
function terrain(s: ReadState, ctx: CanvasRenderingContext2D) {
  const fog = s.art["trench-walls"]?.[17];
  if (fog)
    ctx.drawImage(
      fog,
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
  // A true circular clip hides remembered terrain without changing its memory.

  ctx.save();
  ctx.beginPath();
  ctx.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
  ctx.clip();
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) tile(s, ctx, x, y);
  glow(ctx, s.forager.x, s.forager.y, s.windowRadius, "#19d8c6", 0.08);
  for (const b of [
    ...s.drifters,
    ...s.predators.filter((p) => p.kind === "lanternjaw" && p.state !== "den"),
  ])
    amberMote(ctx, b.x, b.y);
  ctx.restore();
  for (const p of s.predators.filter((p) => p.flaring)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) tile(s, ctx, x, y, true);
    ctx.restore();
  }
  for (const p of s.pulses) {
    const map = distances(s, p.ox, p.oy, true);
    const color =
      p.tint === "cyan" ? cyan : p.tint === "violet" ? "#ba93ff" : "#ff9a55";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    for (const [key, d] of map) {
      const delta = Math.abs(d - p.front);
      if (delta > 1 || d > p.range) continue;
      const [x, y] = key.split(",").map(Number);
      const c = center(x, y);
      ctx.globalAlpha = 1 - delta;
      ctx.strokeRect(c.x - 12, c.y - 12, 24, 24);
    }
    ctx.restore();
  }
  for (const i of s.inkClouds) {
    glow(ctx, i.x, i.y, i.radius, "#000106", 0.98);
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, i.remaining);
    ctx.fillStyle = "#00030a";
    ctx.beginPath();
    ctx.arc(i.x, i.y, i.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const animation = Math.floor(s.playTime * 8);
  for (const d of s.drifters)
    if (d.lit)
      sprite(
        s,
        ctx,
        "drifter",
        d.mind && d.travel ? animation % 8 : 0,
        d.x,
        d.y,
      );
  for (const p of s.predators) {
    if (p.lit) {
      const swimming = p.mind && p.travel;
      const index =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (swimming ? animation % 8 : 0)
          : frame(p.dir) + (swimming ? animation % 2 : 0);
      const c = center(p.tx, p.ty);
      const passive =
        Math.hypot(c.x - s.forager.x, c.y - s.forager.y) <= s.visionRadius &&
        line(s, s.forager, c);
      const flare = s.predators.some(
        (other) =>
          other.flaring &&
          Math.hypot(other.x - p.x, other.y - p.y) <= C.FLARE_RADIUS,
      );
      ctx.save();
      ctx.globalAlpha =
        p.alert || passive || flare ? 1 : p.markIn / C.SONAR_MARK_TIME;
      sprite(s, ctx, p.kind, index, p.x, p.y);
      ctx.restore();
    }
    if (p.alert) {
      ctx.save();
      ctx.strokeStyle = p.kind === "gloamfin" ? "#bd9aff" : amber;
      ctx.globalAlpha = p.alertIn / C.ALERT_TIME;
      ctx.lineWidth = 2;
      const r = 18 + (1 - p.alertIn / C.ALERT_TIME) * 30;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        ctx.lineTo(p.x + Math.cos(a) * (r + 12), p.y + Math.sin(a) * (r + 12));
        ctx.stroke();
      }
      ctx.restore();
    }
    if (p.flareCharging || p.flaring || p.fadeIn > 0) {
      const index = p.flareCharging
        ? Math.min(
            2,
            Math.floor(
              ((C.FLARE_CHARGE + C.FLARE_BLOOM - p.flareTime) /
                C.FLARE_CHARGE) *
                3,
            ),
          )
        : p.flaring
          ? 3 +
            Math.min(
              2,
              Math.floor(((C.FLARE_BLOOM - p.flareTime) / C.FLARE_BLOOM) * 3),
            )
          : p.fadeIn > 0.15
            ? 6
            : 7;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      sprite(s, ctx, "flare-bloom", index, p.x, p.y, C.FLARE_RADIUS * 2);
      ctx.restore();
    }
  }
  glow(ctx, s.forager.x, s.forager.y, 44, cyan, 0.3);
  sprite(
    s,
    ctx,
    "glimmerfin",
    frame(s.forager.dir) + (s.forager.moving ? animation % 2 : 0),
    s.forager.x,
    s.forager.y,
  );
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#17353e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 72);
  ctx.lineTo(1216, 72);
  ctx.moveTo(64, 666);
  ctx.lineTo(1216, 666);
  ctx.stroke();
  text(ctx, C.TITLE_TEXT, 64, 43, 22);
  text(ctx, C.DIVE_LABEL, 190, 43, 12, dim);
  text(ctx, String(s.score).padStart(6, "0"), 640, 58, 48, cyan, "center");
  text(ctx, `${s.planktonRemaining} MOTES REMAIN`, 1216, 42, 14, dim, "right");
  text(ctx, `DEPTH ${s.depth}`, 64, 702, 18);
  for (let i = 0; i < s.lives; i++)
    sprite(s, ctx, "glimmerfin", 6, 240 + i * 27, 695, 24);
  function gauge(
    label: string,
    x: number,
    cool: number,
    max: number,
    color: string,
  ) {
    text(ctx, label, x, 698, 13, color);
    ctx.fillStyle = "#12313a";
    ctx.fillRect(x + 130, 685, 125, 7);
    ctx.fillStyle = color;
    ctx.fillRect(x + 130, 685, 125 * Math.max(0, 1 - cool / max), 7);
  }
  gauge("SPACE / SONAR", 430, s.sonar.cooldown, C.SONAR_COOLDOWN, cyan);
  gauge("SHIFT / INK", 760, s.ink.cooldown, C.INK_COOLDOWN, "#9fa6c9");
  text(ctx, "P PAUSE · M SOUND", 1216, 700, 12, dim, "right");
}
function menuDraw(s: ReadState, ctx: CanvasRenderingContext2D) {
  menu(s).forEach((item, i) => {
    const r = rect(s, i)!;
    const selected = s.menuIndex === i;
    ctx.fillStyle = selected ? "#102c33" : "#08151c";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? "#6dcbbc" : "#19313a";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) text(ctx, "›", r.x + 19, r.y + 31, 24);
    text(
      ctx,
      item,
      r.x + r.w / 2,
      r.y + 30,
      18,
      selected ? cyan : dim,
      "center",
    );
  });
}
function title(s: ReadState, ctx: CanvasRenderingContext2D) {
  glow(ctx, 640, 330, 350, "#0e514f", 0.2);
  for (let i = 0; i < 75; i++) {
    const x = (i * 173 + 47) % C.STAGE_W,
      y = (i * 79 + 109) % C.STAGE_H;
    ctx.fillStyle = i % 4 ? "#132c34" : "#36545b";
    ctx.fillRect(x, y, 2, 2);
  }
  text(ctx, "01 / THE ABYSSAL ZONE", 64, 61, 12, dim);
  text(ctx, "A BIOLUMINESCENT MAZE CHASE", 1216, 61, 12, dim, "right");
  ctx.strokeStyle = "#19353d";
  ctx.strokeRect(40, 35, 1200, 650);
  text(ctx, "↓", 640, 171, 32, dim, "center");
  ctx.save();
  ctx.shadowColor = "#36ceb8";
  ctx.shadowBlur = 30;
  text(ctx, C.TITLE_TEXT, 640, 292, 112, cyan, "center");
  ctx.restore();
  text(ctx, C.TAGLINE_TEXT.split("").join(" "), 640, 338, 17, dim, "center");
  menuDraw(s, ctx);
  text(
    ctx,
    "A small light. An endless dark. Something is listening.",
    640,
    570,
    14,
    "#769297",
    "center",
  );
  sprite(s, ctx, "glimmerfin", 6, 608, 616);
  amberMote(ctx, 678, 616);
  text(
    ctx,
    "ARROWS / WASD   MOVE     SPACE   SONAR     SHIFT   INK",
    640,
    665,
    12,
    dim,
    "center",
  );
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = STAGE_BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (s.screen === "title") title(s, ctx);
  else if (s.screen === "howto") {
    text(ctx, "FIELD NOTES / 01", 90, 70, 14, dim);
    text(ctx, "SURVIVE BY SENSING", 90, 130, 42);
    const notes = [
      [
        "FIND YOUR WAY",
        "ARROWS / WASD move. Graze every glowing mote to descend.",
      ],
      [
        "CARRY A LITTLE LIGHT",
        "Eating widens your light. Explored paths fade; beyond your circle is darkness.",
      ],
      [
        "LISTEN BEFORE YOU LEAP",
        "SPACE sends sonar around corners. It reveals paths — and gives you away.",
      ],
      [
        "VANISH INTO INK",
        "SHIFT blinds light hunters for a moment. Gloamfin still hears you.",
      ],
      [
        "KNOW WHAT HUNTS",
        "Lanternjaw follows light, disguised as an amber drifter.",
      ],
      ["", "Gloamfin follows sound. Flarefish searches with a blinding bloom."],
    ];
    notes.forEach(([a, b], i) => {
      text(ctx, a, 90, 195 + i * 65, 15, amber);
      text(ctx, b, 90, 220 + i * 65, 16, "#94b8be");
    });
    text(
      ctx,
      "P / ESC pause     M mute     ENTER / ESC / TAP return",
      90,
      659,
      16,
      cyan,
    );
  } else if (s.screen === "gameover") {
    glow(ctx, 640, 300, 300, "#623e3c", 0.2);
    text(ctx, "YOUR LIGHT GOES QUIET", 640, 205, 36, amber, "center");
    text(
      ctx,
      `SCORE ${s.score}  /  DEPTH ${s.depth}`,
      640,
      275,
      22,
      cyan,
      "center",
    );
    menuDraw(s, ctx);
    text(ctx, "The abyss remembers.", 640, 575, 16, dim, "center");
  } else {
    terrain(s, ctx);
    hud(s, ctx);
    if (s.screen === "paused") {
      ctx.fillStyle = "#030a10d9";
      ctx.fillRect(390, 190, 500, 410);
      text(ctx, "HOLD YOUR BREATH", 640, 290, 28, cyan, "center");
      menuDraw(s, ctx);
    } else if (s.screen === "countdown" || s.screen === "cleared") {
      ctx.fillStyle = "#030a10d9";
      ctx.fillRect(390, 260, 500, 150);
      text(
        ctx,
        s.screen === "countdown" ? "DIVE" : `DEPTH ${s.depth} CLEARED`,
        640,
        321,
        30,
        cyan,
        "center",
      );
      text(
        ctx,
        s.screen === "countdown"
          ? `${Math.max(1, Math.ceil(2 - s.screenTime))}`
          : "DESCENDING INTO THE DARK",
        640,
        376,
        20,
        dim,
        "center",
      );
    }
  }
  ctx.restore();
}
