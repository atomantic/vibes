# Contributing to Vibes

Vibes is being built in evidence-producing vertical slices. Keep changes small enough to review, test the player-visible outcome, and preserve the trust boundaries in [GOALS.md](./GOALS.md) and [docs/GOVERNANCE.md](./docs/GOVERNANCE.md).

## Local setup

Vibes currently requires Node.js 24 and pnpm 11.9.0.

```bash
corepack enable
pnpm install
pnpm dev
```

The development server runs at [http://127.0.0.1:5175](http://127.0.0.1:5175) and hot-reloads source changes. The browser suite builds its own fresh production bundle before starting the preview server.

Before submitting a change, run:

```bash
pnpm check
pnpm test:e2e
```

The browser suite uses Chromium, Firefox, and WebKit. Install their local Playwright builds when needed:

```bash
pnpm exec playwright install chromium firefox webkit
```

## Change shape

- Start from a documented plan item or explain the player problem the change addresses.
- Keep simulation, protocol, presentation, and authority responsibilities separated.
- Treat network messages, saves, model output, and GitHub input as untrusted data.
- Add focused tests for new rules and regression tests for corrected behavior.
- Do not add cloud AI calls for raw player feedback or credentials to browser code.
- Use conventional commit subjects such as `feat:`, `fix:`, or `docs:`.

## Licensing and assets

Original code, documentation, and procedural content in this repository are available under the [ISC License](./LICENSE). Dependencies keep their upstream licenses. Any third-party model, texture, audio, font, or other asset must have a compatible redistribution license and land with its source, license, and attribution recorded; do not commit material of uncertain origin.
