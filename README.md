# Vibes

**Play the world. Propose its future. Build it together.**

Vibes is a self-hostable, browser-based multiplayer adventure where the players help decide how the game evolves. Friends explore an original shared open world, turn moments from play into structured proposals with a local model, vote on the exact proposal together, and promote unanimously approved ideas into implementation-ready GitHub issues.

The aim is both a game worth returning to and a new multiplayer development loop: playing produces evidence, consensus produces a traceable development proposal, and normal software delivery decides when and how accepted work becomes a release.

> **Project status:** planning foundation. The repository does not yet contain a playable build. The first implementation target is the compact open-world vertical slice described in [Resonance Reach](./docs/FIRST_WORLD.md).

## The core loop

1. A world operator runs a Vibes instance on their own machine and invites trusted peers.
2. Two to eight players explore, cooperate, and experience the same authoritative world state.
3. A player writes feedback in context. A local model turns it into a clear title and proposal without inventing product scope.
4. The author reviews the exact text before it is shared.
5. Every eligible player sees the same immutable proposal and electorate, then votes with a thumbs up or down.
6. All eligible players must approve. Missing or negative votes can never become approval.
7. A richer, repository-aware planner expands the approved proposal into a technical plan.
8. A least-privilege GitHub App files one traceable issue. A vote never authorizes code execution, merging, or deployment.

## Planned architectural shape

- **Game:** the current plan uses TypeScript and Three.js in the browser, with a shared deterministic simulation core and Rapier physics.
- **Networking:** WebRTC DataChannels in an elected-authority star. The authority runs on a player-owned `Vibes Node` when possible; a browser host is a constrained fallback.
- **Control plane:** a small replaceable rendezvous service provides authenticated signaling, expiring authority fencing, and short-lived TURN credentials. It does not carry frame-by-frame world state.
- **Persistence:** immutable world assets plus checkpoints and an append-only durable event stream, replicated to eligible peer nodes in the resilient hosting tier.
- **Governance:** versioned proposals, frozen electorates, signed votes, and independently verifiable unanimous-approval certificates.
- **AI:** raw feedback is refined locally. Only approved proposal text and a declared repository context package may reach a configured richer planner.
- **GitHub:** credentials remain in a trusted publisher process, never in a browser, peer packet, or model prompt.

See [Architecture](./docs/ARCHITECTURE.md) and [Governance](./docs/GOVERNANCE.md) for the decision details and threat boundaries.

## Planning documents

- [GOALS.md](./GOALS.md) — mission, tenets, milestones, and explicit non-goals
- [PLAN.md](./PLAN.md) — sequenced implementation backlog and phase gates
- [Architecture](./docs/ARCHITECTURE.md) — runtime topology, transport, simulation, persistence, security, and proposed repository layout
- [Governance](./docs/GOVERNANCE.md) — identity, trust, proposal lifecycle, unanimous voting, AI boundaries, and GitHub publication
- [Resonance Reach](./docs/FIRST_WORLD.md) — the initial world, player experience, content budget, and measurable quality bar
- [Marketing](./docs/MARKETING.md) — positioning, launch story, reusable copy, and messaging guardrails

## What Vibes is not

Vibes is not a feature-for-feature clone of another game, a centralized MMO, an anonymous governance network, or a machine that deploys whatever an LLM writes. The first release focuses on small trusted communities, an original polished world, explicit human consent, and an auditable handoff into ordinary software delivery.

## Repository policy still to decide

The code and content licenses must be selected before implementation assets or third-party contributions land. The current recommendation is an open-source code license paired with a separately explicit content-asset license; the choice is tracked in [PLAN.md](./PLAN.md).
