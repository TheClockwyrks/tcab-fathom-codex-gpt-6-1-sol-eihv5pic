# Fathom

A bioluminescent deep-sea maze chase. Graze every plankton mote to descend while three predators hunt your light, your sound, and the flashes of their own flares.

This is the **Kindle** dive: your circular window grows as you eat. Explored corridors remain in memory, but even remembered ground outside that window disappears into the abyss. Sonar finds routes around corners, while ink buys time against hunters that see.

## Run

Requires a recent Node.js version supported by Vite.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The game runs entirely in the browser, with local art and synthesized audio.

## Build

```sh
npm run build
```

Serve `dist/` using any static server. Its `index.html` is the entry point; the same directory works at the server root or under a sub-path. `npm run preview` serves the production build locally.

## Controls

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Swim; up/down select menu items |
| Space | Sonar; confirm menu selection |
| Shift | Ink cloud |
| Enter | Confirm |
| P / Escape | Pause or resume |
| Escape | Return from help or menus |
| M | Toggle sound |
| Backtick | Engine diagnostic overlay |

Menus accept mouse and touch. On touch devices, the engine provides a directional pad, sonar and ink buttons, and menu controls.

Eating makes your light brighter, which also makes you easier to spot. Lanternjaw wears an amber drifter's disguise and follows light. Gloamfin hears through rock and ink, and follows sonar to its source. Flarefish lights whole pockets of the maze to find you. Three reserve lives give you four attempts; eaten plankton and explored terrain survive a catch.

## Verify

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The engine-driven tests use a native canvas and counted clocks to exercise the fixed-step simulation, maze geometry, fog, movement, hunters, menus, scoring, and progression. The game returns its state and debug API through Simple 2D; no debug interface is installed on the page.

The player presentation and captured media are in [showcase/showcase.md](showcase/showcase.md).
