# Coffee Chat UX and Vocabulary v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Coffee Chat's public first-use experience, maintained design contract, Skill IDs, site copy, and generated artifacts around source-grounded Perspective Annotations and an emergent Taste projection.

**Architecture:** Keep the existing `Note` and provenance/index persistence model. Change the semantic contract and outward projections: `Note` means a Source-grounded Perspective Annotation, `Taste` remains a projection, and query-time output is agent-conditioned interpretation. Rename Skills to `coffee-brew`, `coffee-chat`, `coffee-serve`, `coffee-create`, and `coffee-update`, then regenerate all closed surfaces.

**Tech Stack:** TypeScript, Node 24.5.0, npm 11.5.1, Vitest, Astro, Playwright, Markdown/JSON generated projections.

## Global Constraints

- The neutral engine has no default person, default Taste, or instance fallback.
- `Perspective Annotation` is the durable semantic unit; the implementation record remains `Note`.
- `Taste` is a projection/read model, not a persisted schema or global profile.
- Query-time interpretation is never written to canonical knowledge, generated artifacts, plugin snapshots, Pages, task files, caches, or tests.
- New product copy must not introduce `judgment policy`, `Mental Model`, `Task Lens`, or `Derived Perspective`.
- README is a concise, factual first-read document for public discovery; detailed contracts belong in `docs/design/coffee-chat.md`.
- README and plugin copies are generated; edit source generators and Skills, then regenerate.
- Skill path changes are a breaking plugin-surface change and must update inventories, manifests, release/template surfaces, tests, and migration/version data.

---

### Task 1: Establish failing vocabulary and projection tests

**Files:** Create `tests/taste-vocabulary.test.ts`; modify `tests/readme-projections.test.ts`, `tests/role-contracts.test.ts`, and `tests/skill-contracts.test.ts`.

**Interfaces:** Consume the existing README/projection and Skill test helpers. Produce failing contract tests for the new public terms and paths.

- [ ] Add assertions that generated README contains `Source-grounded Perspective Annotation`, describes Taste as a pattern across annotations, and does not contain `Mental Model`, `Task Lens`, `judgment policy`, or `Derived Perspective`.
- [ ] Add assertions that generated surfaces contain `skills/coffee-brew/SKILL.md`, `skills/coffee-chat/SKILL.md`, and `skills/coffee-serve/SKILL.md`, and do not contain the old product Skill paths.
- [ ] Add assertions that the engine README says it has no default person or Taste, exposes Create yours / Install engine plugin / Contribute to engine, and does not emit an instance prompt placeholder.
- [ ] Add assertions that `docs/design/coffee-chat.md` is canonical documentation and the dated UX research file is authored documentation, not generated-owned output.
- [ ] Run `npm test -- tests/taste-vocabulary.test.ts tests/readme-projections.test.ts tests/role-contracts.test.ts tests/skill-contracts.test.ts` and confirm the failure is caused by the current vocabulary/paths.

### Task 2: Rename and rewrite source Skills and router contracts

**Files:** Rename `skills/build-kg/` to `skills/coffee-brew/`, `skills/apply-perspective/` to `skills/coffee-serve/`, `skills/create-coffee-chat/` to `skills/coffee-create/`, and `skills/update-coffee-chat/` to `skills/coffee-update/`. Modify their `SKILL.md` and references, plus `skills/coffee-chat/SKILL.md`, `AGENTS.md`, `method/shared-method.md`, and `method/engine-update.md`.

**Interfaces:** Consume `docs/design/coffee-chat.md`. Produce source Skill contracts with new IDs and unchanged safety boundaries.

- [ ] Rename directories with `git mv` and update frontmatter names/descriptions.
- [ ] Define `coffee-brew` as Source-grounded Perspective Annotation authoring and approval; state that an annotation stores what was seen, what mattered, why, values, and Unknown/limits, not decisions or policies.
- [ ] Define `coffee-chat` as read-only contextual retrieval plus agent-conditioned interpretation; keep engine/instance verification and no-default-person behavior.
- [ ] Define `coffee-serve` as bounded context delivery to an exact named external target; keep no-writeback behavior.
- [ ] Keep `coffee-create` and `coffee-update` technical lifecycle Skills, clearly separate from Taste data.
- [ ] Replace router references with conversation → `coffee-chat`, authoring → `coffee-brew`, task delivery → `coffee-serve`, Create yours → `coffee-create`, and engine update → `coffee-update`.
- [ ] Preserve `Authored`, `Sourced`, `Inferred`, and `Unknown`; replace legacy synthesis vocabulary with contextual retrieval and agent-conditioned interpretation.
- [ ] Run `npm test -- tests/skill-contracts.test.ts tests/role-contracts.test.ts tests/workflow-contracts.test.ts`.

### Task 3: Rewrite the README generator for public discovery

**Files:** Modify `tools/readme.ts`, `tests/readme-projections.test.ts`, and `tests/readme-assets.test.ts`; preserve `docs/assets/readme/coffee-chat-cover.png`.

**Interfaces:** Consume `Manifest` and existing engine/instance context helpers. Produce concise English and Korean README projections.

- [ ] Keep the cover image and language switch.
- [ ] Render, in order: product thesis; Source → Perspective Annotation → Taste → agent-conditioned interpretation; stored/not stored boundary; one Source-centered instance prompt; truthful engine/instance next actions; compact technical core; links to design, method, schemas, and testing docs; install/contribute details.
- [ ] Make the English artifact factual for a public first visit; preserve the same meaning and order in Korean.
- [ ] Do not render an instance prompt or placeholder instance URL for the neutral engine.
- [ ] Remove deprecated terms and the hiring-first narrative from generated public copy.
- [ ] Run `npm test -- tests/readme-projections.test.ts tests/readme-assets.test.ts` and `npm run cc -- generate --check`.

### Task 4: Align Pages with the first-use model

**Files:** Modify `site/pages/index.astro`, `site/pages/graph.astro`, `site/pages/notes/[id].astro`, `site/pages/entities/[id].astro`, `tests/e2e/site.spec.ts`, `tests/site-build.test.ts`, and `tests/site-publication-boundary.test.ts`.

**Interfaces:** Consume the existing `siteModel` and `siteHref` APIs. Produce role-safe engine/instance Pages without changing the data model.

- [ ] Use neutral engine language and preserve the three engine actions without a default person.
- [ ] Use `Taste`, `Perspective Annotation`, `Source`, provenance, and `Unknown` on instance and graph pages.
- [ ] Label Note pages as `Perspective Annotation / 관점 주석` while retaining the technical Note identity, dates, and links.
- [ ] Add route assertions for neutral engine choices, annotation/provenance copy, and absence of deprecated terms.
- [ ] Run the focused site tests and `npm run site:check`.

### Task 5: Reconcile generated plugin and release surfaces

**Files:** Modify `tools/artifact-inventory.ts`, `tools/projections.ts`, `tools/engine-cli.ts`, `tools/candidate.ts`, `tests/helpers/skill-harness.ts`, release/template references, and generated files under `plugins/coffee-chat/`.

**Interfaces:** Consume renamed source Skills and generators. Produce a closed, self-consistent generated surface.

- [ ] Replace old Skill paths in inventories, projections, engine mappings, candidate guards, fixtures, release files, and template-surface files.
- [ ] Mark `docs/design/coffee-chat.md` as canonical authored documentation and the UX research snapshot as non-generated authored research.
- [ ] Regenerate with the repository's existing `cc generate` and engine generation commands.
- [ ] Search active source/generated/tests/docs for old Skill paths and deprecated terms; historical documents may mention them only in an explicit migration notice.
- [ ] Run artifact boundary, ownership, release, lifecycle, and candidate identity tests.

### Task 6: Separate historical specs from the maintained design

**Files:** Modify the dated README/core/lifecycle specs and plans under `docs/superpowers/`; modify `docs/testing.md`.

**Interfaces:** Consume `docs/design/coffee-chat.md` and final Skill IDs. Produce navigable historical records that cannot be mistaken for current policy.

- [ ] Add a historical/superseded notice and link to the canonical design at the top of each affected dated spec/plan.
- [ ] Document design-first changes, generator ownership, vocabulary search, generated-surface checks, and Skill migration rules in `docs/testing.md`.
- [ ] Run foundation, role, workflow, and README projection tests.

### Task 7: Verify and report public-share readiness

**Files:** Verify all changed files and generated outputs; update the research snapshot only if evidence changes.

**Interfaces:** Consume all prior tasks. Produce verified branch state and a separate readiness report for README, engine docs, verified instance/demo, no-install Coffee Chat, and plugin lifecycle.

- [ ] Run `npm test`, `npm run typecheck`, `npm run format:check`, `npm run gitleaks:scan`, `npm run site:check`, and `node --experimental-strip-types tools/engine-cli.ts check --format human`.
- [ ] Run `git status --short`, `git diff --check`, and `git diff --stat`; confirm generated ownership and no personal instance content in the engine.
- [ ] Report whether a verified public instance exists before claiming the repository is ready for public sharing.
