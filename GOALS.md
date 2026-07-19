# GOALS.md

**Play the world. Propose its future. Build it together.**

---

## Mission

Vibes is a self-hostable, browser-based multiplayer open-world game in which players do more than inhabit the world: they collectively guide its evolution. Small peer-owned communities explore a compelling shared adventure, turn in-game experience into clear proposals with local AI, approve changes through explicit unanimous consent, and promote accepted ideas into implementation-ready GitHub issues. Vibes makes AI-assisted software development part of the multiplayer experience while keeping human agency, community ownership, and normal engineering controls at the center.

---

## Core Tenets

1. **The game must be worth playing on its own** — A beautiful, responsive, explorable world and satisfying cooperative play are the foundation. Novel governance cannot compensate for a weak game.
2. **Worlds belong to the communities that run them** — A community can operate, preserve, move, and recover its world on machines it controls without depending permanently on one vendor.
3. **Experience becomes actionable direction** — Proposals originate in actual play, retain their gameplay context, and state the player problem and desired outcome before implementation ideas.
4. **Shared change requires explicit consent** — Every eligible active player sees and approves the same immutable proposal. Silence, absence, roster manipulation, or administrative power can never be converted into a yes vote.
5. **AI capability follows trust and cost** — A small local model helps the author clarify feedback before sharing it. Richer AI is used only after approval, within a disclosed privacy boundary, and cannot act beyond preparing the agreed development proposal.
6. **Trust and administration are game systems** — Identity, admission, roles, moderation, privacy, integration credentials, auditability, and recovery are designed alongside rendering and networking rather than added after launch.
7. **Consensus creates accountable work, not autonomous mutation** — Approval authorizes one traceable GitHub issue. Review, prioritization, implementation, tests, release approval, and deployment remain separate human-controlled steps.

---

## Target Users

- **Players as co-creators** — Friends and small communities who want a shared adventure and meaningful influence over how their world evolves.
- **World operators** — People who self-host an instance, invite trusted peers, protect its persistence, and configure its privacy and integrations.
- **Contributors** — Designers, artists, developers, and AI-assisted builders who turn community-approved outcomes into reviewed releases under the project’s eventual contribution and license policy.
- **Creative technologists** — Communities interested in participatory game design, local AI, peer-hosted software, and transparent governance.

---

## Milestones

### v0.1 — A World Worth Sharing

Vibes offers a polished browser-native open-world slice with its own visual identity, satisfying traversal, systemic interaction, a memorable objective designed for later cooperative play, durable solo state, and measured performance on ordinary recent laptops.

- **Coherent adventure** — A new player can enter Resonance Reach, understand its objective, explore three distinct regions, and complete a memorable 15–30 minute arc without developer guidance.
- **Expressive movement** — Running, jumping, mantling, climbing, and gliding feel responsive enough that traversal is enjoyable before networking is enabled.
- **Original identity** — World, characters, language, mechanics, art, and audio are recognizably Vibes rather than copies of an existing game.
- **Expandable foundations** — The world is compact and richly authored but can grow in content and scale without invalidating player progress or replacing its core experience.

### v0.2 — Trusted Shared Adventure

A world operator can invite trusted peers into a stable two-to-eight-player session. Players see one another, cooperate on the same objective, and observe consistent authoritative world state across ordinary home-network conditions.

- **Peer-owned operation** — A community can host play and durable progress on player-controlled machines, with no mandatory centralized gameplay server.
- **Understandable authority** — Players can see which community machine currently resolves shared outcomes, how they connected, and what happens when it disconnects.
- **Convergent play** — Movement, interactions, collectibles, puzzles, and objective completion do not produce duplicate or contradictory durable outcomes.
- **Recoverable worlds** — Host loss or restart has explicit recovery behavior that protects progress and never pretends an unsafe continuation succeeded.

### v0.3 — The Player Proposal Loop

An eligible player can capture feedback from play, review a locally refined title and body, share an immutable revision, and open a deterministic unanimous vote with a durable audit trail.

- **Private drafting** — Raw draft text does not leave its disclosed local inference boundary without the author’s explicit confirmation.
- **Common truth** — Every voter can verify the same proposal, electorate, policy, and deadline before voting.
- **Verifiable consent** — The result proves that every required player approved; missing, invalid, or negative votes never reach planning.
- **Usable governance** — Trusted-peer administration, moderation, rate limits, recovery states, and accessible voting interfaces make the loop practical rather than ceremonial.

### v0.4 — Consensus-to-GitHub Bridge

An approved proposal can be expanded into a repository-aware technical plan and reach one GitHub issue—or an explicit recoverable attention state—without exposing credentials, creating silent duplicates, or changing the agreed player outcome.

- **Decision-complete planning** — Issues include scope, non-goals, architecture implications, accessibility, security, acceptance criteria, tests, rollout, risks, and verified repository context.
- **Bounded authority** — Publication is limited to one configured destination, and neither players nor models receive broader repository power than the approved outcome requires.
- **Traceable publication** — Players can follow the proposal through planning and publication to the final issue URL, with build and audit provenance.
- **Failure safety** — Planner outages, rate limits, crashes, and ambiguous network results preserve the accepted work in a visible recoverable state; the system never automatically repeats an uncertain publication or demands another vote.

### v1.0 — Community-Operated Living World

A new operator can install, secure, run, back up, update, diagnose, and recover Vibes without bespoke assistance. The game, networking, governance, administration, AI, and GitHub handoff feel like one resilient product.

- **Operational independence** — A community can run the complete product on infrastructure it controls without losing core play, governance, or recovery capabilities.
- **Resilient authority** — A world can recover from host loss within its published interruption budget without losing acknowledged durable progress or administrative ownership.
- **Safe evolution** — Operators can verify, back up, migrate, adopt, and when necessary recover from releases deliberately rather than receiving silent live changes.
- **Credible community launch** — Documentation, accessibility, privacy disclosures, observability, threat review, and closed-alpha evidence support responsible broader use.

---

## Long-Term Vision

*(Inferred direction pending founder and community validation.)* Vibes becomes a family of independently operated living worlds with distinct histories and community identities. Playing and building form one cooperative metagame: ideas emerge from shared experience, consensus creates traceable development proposals, contributors ship reviewed changes, and releases visibly reflect the people who imagined them—without requiring one publisher-operated universe.

---

## Non-Goals

- **Automatic self-modification or deployment** — A vote files an issue; it does not generate executable patches, merge code, or update a running world.
- **A centralized global MMO at launch** — The first product serves bounded, trusted groups rather than massive concurrency, global matchmaking, or one canonical world state.
- **Anonymous permissionless governance** — Device keys and invitations support known instance members. Global reputation, proof-of-personhood, and public Sybil resistance are later research areas, not implied guarantees.
- **A feature-for-feature imitation of another game** — Familiar open-world quality is an ambition, not a license to copy protected assets, characters, places, language, or distinctive expression.
- **AAA breadth in the first world** — “Impressive” means dense, coherent, polished, and systemic rather than enormous, procedurally repetitive, or filled with unfinished mechanics.
- **A claim that P2P means serverless or cheat-proof** — Internet play may still require supporting connectivity infrastructure. A player-owned authority can be trusted by a community but cannot be made incapable of cheating.
- **Cloud-first handling of raw feedback** — The first refinement boundary is local. Remote planning is optional, disclosed, and limited to an approved proposal plus declared project context.

---

For the tactical backlog, sequencing, and current work, see [PLAN.md](./PLAN.md).
