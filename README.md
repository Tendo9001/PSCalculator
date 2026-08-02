# Profit Split Calculator

A small, personal, pure front-end PWA that live-computes a profit-split
calculation chain and shows the result from two different perspectives.

**Live site:** https://tendo9001.github.io/PSCalculator/

## What it does

- Enter Principal, Monthly Rate, Period, Cost of Fund, and Tax Rate.
- A shared breakdown (Annual Rate, Balance Interest, After Takaful) updates
  live as you type — no submit button.
- Two tabs show the result from two perspectives: **MY Team** (default) and
  **Investor**.
- If any step goes negative, the affected rows turn red and a popup
  explains which input caused it.
- Installable as a PWA — "Add to Home Screen" on mobile.

## Tech

Plain HTML, CSS, and JavaScript. No framework, no build step, no bundler, no
runtime dependencies. The calculation engine (`calc.js`) is unit-tested with
Node's built-in test runner.

## Local development

```
git clone https://github.com/Tendo9001/PSCalculator.git
cd PSCalculator
```

Open `index.html` directly in a browser — no server or build step needed.

Run the calculation engine's tests:

```
node --test calc.test.mjs
```

Regenerate the PWA icons (requires Pillow, a one-time local tool, not a
runtime dependency):

```
pip install Pillow
python scripts/generate_icons.py
```

## Project structure

```
PSCalculator/
├── index.html                  Page markup
├── styles.css                  Dark theme styling
├── calc.js                     Calculation engine (pure function, no DOM)
├── calc.test.mjs               Tests for calc.js
├── script.js                   DOM wiring: rendering, tabs, input formatting
├── manifest.json                PWA manifest
├── icons/                       PWA icons
├── scripts/generate_icons.py   Icon-generation script (dev-only)
└── docs/
    ├── timeline.md                    Chronological record of decisions
    └── superpowers/
        ├── specs/                     Design specs written during development
        └── plans/                     Implementation plans written during development
```

See `docs/timeline.md` for the full history of what was built, why, and
what changed along the way.

## Deployment

Static site on GitHub Pages, served from the `main` branch root.
