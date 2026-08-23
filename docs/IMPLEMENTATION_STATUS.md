# First playable implementation status

- **Snapshot:** August 23, 2026
- **Milestone:** local “First Light at the Loom” prototype
- **Status:** playable single-player foundation; multiplayer governance is not implemented yet

## What is playable

The browser opens on Arrival Shore in a procedural corner of Resonance Reach. A player can enter the world, run, sprint, jump, hold Jump after the apex to glide, use mouse or gamepad camera controls, attune the Arrival Chime, cross the responding path, recover three durable Echo Shards hidden at the island’s landmarks (tidepool vista, mantle ledge, and the launch pond), wake the Loom once every Shard resonates, watch the finale transform the sky and ignite the distant Beacon, review a session summary with journey and best times, find an optional vista, pause, adjust presentation settings including synthesized sound mute, and restart or resume a locally saved journey.

The terrain, water, sky, Echo Shards, landmarks, foliage, rocks, clouds, particles, interface, and procedural fallback avatar are generated from repository code. All audio is synthesized at runtime with the Web Audio API; no downloaded audio exists. The player avatar uses the audited CC0 `RobotExpressive.glb` model with rigged idle, walking, running, and jumping animations plus a Vibes runtime palette; its pinned source, integrity hash, and modifications are recorded in [Third-party notices](../THIRD_PARTY_NOTICES.md). No downloaded audio, fonts, textures, or model weights are included.

## Implementation shape

- A React/Vite shell owns menus, accessible status, settings, diagnostics, and persistence.
- Three.js renders the world directly with a procedural terrain mesh, instancing, animated water, shadows, fog, particles, and a third-person camera.
- Rapier runs a fixed 30 Hz simulation inside a web worker. Rendering and authority communication meet through a transport interface so the local worker can later be replaced by an elected peer or Vibes Node authority.
- The shared game core owns traversal, coyote time, jump buffering, interactions, objective transitions, checkpoints, recovery, and bounded save/load behavior.
- The protocol package owns explicit versioned messages, Zod-validated durable data, and a bounded 32-byte little-endian realtime input codec.
- The world package is renderer-neutral and exports stable IDs, seeded placement data, terrain sampling, interaction definitions, and world validation.

## Evidence captured

The current automated gate covers formatting, strict linting, strict TypeScript, unit/integration coverage, a production build, and production-server browser smoke tests. The game-core coverage floor is 90% statements, 85% branches, and 90% functions. Browser checks reject application console warnings, page errors, failed requests, HTTP failures, stalled simulation, movement regressions, pause regressions, context loss, and reduced-motion shell regressions. Two narrowly matched WebGL driver performance diagnostics are ignored because they come from headless capture infrastructure rather than application code; shader errors and context loss still fail the suite.

Exact validation results belong in the commit or CI run that produced them rather than being treated as permanent claims in this document.

## Deliberate limits and open proof obligations

- This is a local authority prototype, not multiplayer. It has no rendezvous, WebRTC transport, peer identity, authority election, replication, reconnect, or host migration yet.
- It has no suggestion, local-model, voting, planner, administration, or GitHub publisher path yet. The governance documents remain design constraints, not implemented security claims.
- The standard Rapier JavaScript build is treated as locally repeatable under pinned code and input ordering. Cross-platform deterministic replay has not been proven and is still a Phase 0 decision.
- The prototype uses a small application-owned checkpoint format and reconstructs immutable Rapier world state on restore. Native WASM snapshot portability across browser and Node loaders remains an explicit spike item.
- Visual quality, frame pacing, startup cost, memory, and physics time still need measurements on the selected 2021-class reference laptop. A good result on a development machine does not close that gate.
- Accessibility currently includes scalable UI, reduced motion, captions/status announcements, camera sensitivity, keyboard/mouse, and gamepad input. Remapping, contrast modes, and broader assistive-technology testing remain ahead.

## Next evidence slice

The next integrated risk-retirement slice should connect two real peers through a replaceable signaling service, keep one authority simulation, synchronize two avatars and one Chime interaction, exercise reconnect and stale-authority rejection, and record packet/backpressure diagnostics. It should not yet add the complete suggestion system; identity and authority semantics need evidence first.
