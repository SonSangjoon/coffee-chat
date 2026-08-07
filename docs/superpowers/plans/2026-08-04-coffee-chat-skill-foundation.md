# Coffee Chat Skill Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Replace the legacy Skill surface with the canonical coffee-\* language and implement a testable Init → Harvest foundation for independent Coffee Chat repositories.

**Architecture:** The engine exposes only canonical Skills and deterministic contracts. Init creates an independent coffee-chat-\* repository from the engine release payload, Sync records a relationship to that repository inside a work repository, Harvest writes durable Green Bean prose from Origins, Roast creates contextual Bean output, Brew creates Coffee, and Coffee Chat/Coffee Pairing consume that output. Product-scene evaluation orchestration and reports belong to the separate `coffee-chat-eval` repository; the independent `coffee-chat-bench` repository owns only its candidate-agnostic benchmark construct, cases, judges, and validity evidence. This engine contains only the adapter contract and observable receipts.

**Tech Stack:** Node.js 24.5.0, TypeScript, Vitest, AJV JSON Schema validation, GitHub CLI instructions, Astro site projections, npm scripts already defined in package.json.

## Global Constraints

- Do not preserve backward compatibility, aliases, migration layers, or fallback routes for Source, Perspective, Note, Taste profile, Agent context, Blend, Serve, or Create.
- The only product-facing vocabulary is Origin, Green Bean, Bean, Coffee, Harvest, Roast, Brew, Coffee Chat, Coffee Pairing, Sync, Init, and Update.
- Taste is contextual content carried by Bean. It is never a global profile, score, personality model, or decision policy.
- A Coffee Chat repository is the single source of truth for personal Origins, Green Beans, provenance, and instance metadata.
- A connected work repository may contain only explicit connection metadata. It is never an implicit Origin and never the personal record store.
- Every state-changing operation uses Operation Preview. Read-only Roast, Brew, and Coffee Chat do not write.
- Personal records must never enter the external evaluation corpus, generated fixtures, snapshots, logs, or release artifacts.
- Use test-first changes. Each task must begin with a failing focused test, then the smallest implementation, then the focused and full verification commands.
- Regenerate owned artifacts only through the repository generators; do not hand-edit generated output.

---

## Task 1: Establish the canonical Skill registry

**Files**

- Create tools/skill-contracts.ts.
- Update tests/skill-contracts.test.ts.
- Update tools/artifact-inventory.ts.
- Update tools/projections.ts and tools/workflow-projections.ts where Skill names are enumerated.

**Contract**

Define one exported registry with these entries and no others:

- coffee-init: creates a new independent Coffee Chat repository from the engine release.
- coffee-sync: synchronizes a work repository with an explicit Coffee Chat repository.
- coffee-harvest: structures Origins into durable Green Bean prose.
- coffee-roast: selects and compresses Green Beans into contextual Bean content.
- coffee-brew: applies Bean content to an Agent and produces Coffee.
- coffee-chat: runs a read-only conversation with Coffee.
- coffee-pairing: applies Coffee to an explicitly named project or task.
- coffee-update: reviews and applies an engine update to an authoritative Coffee Chat repository.

Each description must name its trigger, input boundary, output, and write boundary in one concise sentence. Description checks must reject vague descriptions, legacy terms, and missing coffee-\* prefixes.

**TDD steps**

- [ ] Add a failing test that imports the registry and asserts exact names, unique names, prefix compliance, and description requirements.
- [ ] Add a failing test that scans user-facing Skill frontmatter and rejects coffee-create, coffee-blend, coffee-serve, Source, Perspective, and Template as canonical contract terms.
- [ ] Implement the registry and validation helpers.
- [ ] Replace duplicated name lists in artifact inventory and projections with the registry.
- [ ] Run npm test -- --run tests/skill-contracts.test.ts and confirm the focused suite passes.

**Completion check:** one registry drives inventory, projections, and Skill contract tests; no second canonical list remains.

## Task 2: Replace routing and Skill files

**Files**

- Rename the retired creation route to skills/coffee-init and rewrite its SKILL.md plus references.
- Create skills/coffee-sync/SKILL.md and skills/coffee-sync/references/method.md.
- Rewrite skills/coffee-harvest/SKILL.md and references/method.md.
- Rewrite skills/coffee-roast/SKILL.md and references/method.md.
- Rewrite skills/coffee-brew/SKILL.md and references/method.md.
- Rewrite skills/coffee-chat/SKILL.md and references/method.md.
- Rewrite skills/coffee-pairing/SKILL.md and references/method.md.
- Rewrite skills/coffee-update/SKILL.md and references/method.md.
- Rewrite AGENTS.md, CLAUDE.md, coffee-chat.json, and method/shared-method.md.
- Update tests/taste-vocabulary.test.ts, tests/role-contracts.test.ts, tests/workflow-contracts.test.ts, tests/skill-evaluations.test.ts, and tests/skill-contracts.test.ts.

**Routing rules**

- Engine entry offers only Init your Coffee Chat, Install engine plugin, and Contribute to engine.
- Init is the only route that creates an instance and must create a repository matching coffee-chat-\*.
- Sync is the only route that integrates an existing work repository with an explicit Coffee Chat repository.
- Harvest is the only durable personal-record writer.
- Roast and Brew are internal transformations unless explicitly surfaced by the corresponding user flow.
- Coffee Chat is read-only.
- Coffee Pairing writes only the named target.
- Update requires an authoritative Coffee Chat repository and previews all changes.

**TDD steps**

- [ ] Change route tests to expect coffee-init and coffee-sync and to fail when any old route or name is present.
- [ ] Implement the route table and rewrite the Skill frontmatter/descriptions.
- [ ] Add the Init and Sync Skill instructions with explicit inputs, reads, writes, protected paths, preview, and completion receipt.
- [ ] Rewrite the remaining Skill instructions so their language and boundaries match docs/design/coffee-chat-skill-contracts.md.
- [ ] Remove the old coffee-create directory and all references to its template flow.
- [ ] Run the focused Skill and vocabulary suites.

**Completion check:** AGENTS.md, metadata, projections, Skill frontmatter, and tests all route through the same eight canonical Skills.

## Task 3: Implement the independent repository and connection contracts

**Files**

- Create schemas/coffee-chat-instance.schema.json.
- Create schemas/coffee-chat-connection.schema.json.
- Create schemas/coffee-chat-init-preview.schema.json.
- Create schemas/coffee-chat-init-receipt.schema.json.
- Create schemas/coffee-chat-sync-preview.schema.json.
- Create schemas/coffee-chat-sync-receipt.schema.json.
- Create tools/coffee-init.ts and tools/coffee-sync.ts.
- Update tools/cc.ts, tools/contracts.ts, tools/transaction.ts, and tools/generated-ownership.ts.
- Add tests/coffee-init.test.ts and tests/coffee-sync.test.ts.

**Behavior**

- Init accepts an explicit instance name, destination, engine release, and public instance URL policy.
- Init refuses names that do not match ^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)\*$.
- Init never clones or rewrites another repository. It materializes the approved engine release payload, initializes the new repository, writes instance metadata, and returns an Operation Preview before any write.
- The invoking Agent or work repository is not used as an Origin, target repository, or personal record store.
- Sync accepts a work repository and an explicit Coffee Chat repository URL, verifies coffee-chat.json and knowledge/index.json, and writes only .coffee-chat/connection.json plus its receipt.
- Sync refuses missing, private, malformed, or fingerprint-mismatched instance metadata.
- Both operations revalidate the target after approval and produce a receipt that lists the exact write set and protected set.

**TDD steps**

- [ ] Add failing tests for valid and invalid instance names, independent destination enforcement, release identity, and no writes before approval.
- [ ] Add failing tests for Sync metadata verification, exact write set, protected work-repository paths, and stale-target rejection.
- [ ] Implement schemas and deterministic validators.
- [x] Implement Init and Sync transaction orchestration using Operation Preview.
- [ ] Add receipts and generated ownership entries.
- [x] Run npm test -- --run tests/coffee-init.test.ts tests/coffee-sync.test.ts.

**Completion check:** a Init preview can create a new coffee-chat-\* repository and a Sync preview can add only connection metadata to an external work repository.

## Task 4: Replace the fixed Note and Perspective record model

**Files**

- Create schemas/origin.schema.json.
- Create schemas/green-bean.schema.json.
- Create schemas/bean.schema.json.
- Create schemas/coffee.schema.json.
- Update tools/knowledge.ts, tools/contracts.ts, tools/projections.ts, and site/lib/load-site-model.ts.
- Update site/pages/sources/[slug].astro, site/pages/notes/[id].astro, site/pages/entities/[id].astro, site/pages/graph.astro, site/pages/timeline.astro, site/components/KnowledgeList.astro, and site/lib/view.ts.
- Rewrite tests/site-model.test.ts, tests/foundation-contracts.test.ts, tests/fixture-isolation.test.ts, and tests/artifact-boundaries.test.ts.

**Data rules**

- Origin stores external information and provenance.
- Green Bean stores a writer-authored prose passage grounded in one or more Origins. The contract requires provenance and uncertainty metadata but does not force the POV into a rigid list of fields.
- Bean is contextual and ephemeral. It references Green Beans and carries the Taste context selected for one Coffee Chat or Coffee Pairing operation.
- Coffee is contextual and ephemeral. It references a Bean and records the Agent application receipt.
- Green Bean is the only durable POV record.
- Personal prose is never treated as an evaluation fixture or generated public artifact.

**TDD steps**

- [ ] Add failing schema tests for Origin provenance, Green Bean prose, multi-Origin references, contextual Bean expiry, and Coffee references.
- [ ] Add failing loader/projection tests proving old note/entity routes are absent and the new unit names render consistently.
- [ ] Implement the four schemas and replace the knowledge types/loaders.
- [ ] Update site projections and pages to display the new units without exposing private records outside an instance.
- [ ] Remove note-frontmatter, entity-registry, and source/perspective user-facing contract paths from the active inventory.
- [ ] Run the focused schema, site-model, and artifact-boundary suites.

**Completion check:** the runtime and site use Origin, Green Bean, Bean, and Coffee; no legacy record type is required for loading or validation.

## Task 5: Implement Harvest and its observable quality contract

**Files**

- Create schemas/coffee-harvest-input.schema.json.
- Create schemas/coffee-harvest-output.schema.json.
- Create tools/coffee-harvest.ts.
- Update tools/transaction.ts and tools/projections.ts.
- Add tests/coffee-harvest.test.ts and tests/coffee-harvest-quality.test.ts.

**Behavior**

- Harvest accepts one or more Origins plus the author intent and produces one Green Bean prose record.
- The output must preserve source grounding, distinguish observation from interpretation, state the value criterion that made the information important, include uncertainty or Unknown when evidence is incomplete, and avoid inventing facts.
- Harvest must reject an output with no Origin reference, no POV-bearing prose, unsupported certainty, or a decision-policy instruction.
- Harvest uses Operation Preview and writes only the approved Green Bean path and its receipt.

**Evaluation hooks**

- Expose deterministic signals for provenance coverage, unsupported-claim count, POV presence, uncertainty presence, and policy leakage.
- Emit an external-eval case envelope without personal record contents beyond the redacted input/output summary and deterministic signals.
- Keep product-scene judge selection and thresholds in coffee-chat-eval, and keep the independent benchmark's judges and thresholds in coffee-chat-bench; the engine only exposes the adapter shape.

**TDD steps**

- [ ] Add failing good/bad fixture tests for grounded POV, multi-Origin synthesis, missing provenance, generic summary, unsupported claim, and policy leakage.
- [ ] Implement the Harvest input/output contracts and deterministic signals.
- [ ] Implement preview, approval, write, and receipt behavior.
- [ ] Run the focused Harvest suites and snapshot the adapter envelope.

**Completion check:** Harvest produces durable Green Bean prose that can be judged externally and refuses outputs that are merely summaries or decision rules.

## Task 6: Implement Roast, Brew, Coffee Chat, and Coffee Pairing boundaries

**Files**

- Create schemas/coffee-roast-input.schema.json and schemas/coffee-roast-output.schema.json.
- Create schemas/coffee-brew-input.schema.json and schemas/coffee-brew-output.schema.json.
- Create schemas/coffee-chat-session.schema.json.
- Create schemas/coffee-pairing-preview.schema.json and schemas/coffee-pairing-receipt.schema.json.
- Create tools/coffee-roast.ts, tools/coffee-brew.ts, tools/coffee-chat.ts, and tools/coffee-pairing.ts.
- Add tests/coffee-roast.test.ts, tests/coffee-brew.test.ts, tests/coffee-chat.test.ts, and tests/coffee-pairing.test.ts.

**Behavior**

- Roast selects relevant Green Beans for an explicit context and produces a Bean with traceable references; it does not write personal records.
- Brew applies the Bean Taste context to an Agent and produces Coffee with a bounded system context; it does not mutate Green Beans.
- Coffee Chat reads Coffee and session input only, never changes the Coffee Chat repository, and exposes provenance when a response depends on a Green Bean.
- Coffee Pairing previews and writes only the explicitly named project or task target. It cannot write the personal Coffee Chat repository unless that repository is the named target and the operation contract permits it.

**TDD steps**

- [ ] Add failing boundary tests for read-only Roast/Brew/Chat and exact Pairing writes.
- [ ] Add failing traceability tests from Coffee to Bean to Green Bean to Origin.
- [ ] Implement transformations and Pairing preview/receipt.
- [ ] Add deterministic observability signals for context fidelity, provenance retention, scope adherence, and unsupported inference.
- [ ] Run all four focused suites.

**Completion check:** each stage has one purpose, one input boundary, one output, and an enforceable write boundary.

## Task 7: Add the engine-side Eval Adapter and external release gate

**Files**

- Create schemas/eval-case-envelope.schema.json.
- Create schemas/eval-observation.schema.json.
- Create tools/eval-adapter.ts.
- Update docs/design/coffee-chat-eval.md, docs/design/coffee-chat-bench-contract.md, and docs/design/coffee-chat-evaluation.md if implementation details differ.
- Add tests/eval-adapter.test.ts and tests/eval-boundary.test.ts.
- Update package.json scripts only if a deterministic adapter check is needed.

**Contract**

- The adapter accepts a named Skill operation, sanitized case input, engine commit, and adapter version.
- The adapter returns operation output, deterministic signals, trace references, protected-path observations, and a report binding envelope.
- It never loads personal Coffee Chat repositories, private Green Beans, or local user records.
- It does not implement judges, thresholds, gold cases, sealed cases, or release decisions; product-scene evaluation belongs to coffee-chat-eval and the independent benchmark's measurement assets belong to coffee-chat-bench.
- Engine CI runs deterministic contract tests and public smoke fixtures. Release metadata records the external suite commit and report reference when supplied.

**TDD steps**

- [ ] Add failing tests proving the adapter rejects personal paths and emits stable binding fields.
- [ ] Implement the two schemas and adapter.
- [ ] Add a public smoke command that does not require the external repository.
- [ ] Verify engine release metadata cannot claim an external pass without a matching suite/report binding.

**Completion check:** the engine is evaluable without owning the evaluation corpus, and external reports can reproduce exactly which engine and suite were judged.

## Task 8: Regenerate, verify, and document the migration-free cutover

**Files**

- Update README.md, README.ko.md, docs/design/README.md, and docs/design/coffee-chat-skills.md only where the implemented contracts require wording changes.
- Update generated engine/release.json, engine/template-surface.json, manifests, and snapshots through npm run cc -- generate.
- Update docs/testing.md with the coffee-chat-eval workflow and the separate coffee-chat-bench track.
- Add or update tests/readme-projections.test.ts, tests/readme-assets.test.ts, tests/generated-ownership.test.ts, and tests/skill-evaluations.test.ts.

**Verification sequence**

- [ ] Run npm test.
- [ ] Run npm run typecheck.
- [ ] Run npm run format:check.
- [ ] Run npm run cc -- check --snapshot worktree.
- [ ] Run npm run cc -- generate, then rerun the snapshot check and confirm no drift.
- [ ] Run npm run site:build and npm run site:check.
- [ ] Run npm run gitleaks.
- [ ] Run rg checks proving Source, Perspective, Note, Blend, Serve, Create, and Template are absent from user-facing runtime contracts and active Skill routes.

**Completion check:** all generated artifacts are reproducible, all tests and checks pass, and the implementation matches docs/design/coffee-chat-skill-contracts.md plus the coffee-chat-eval boundary without compatibility shims.

## Review checkpoints

- After Task 2, review the canonical Skill surface before data-model changes.
- After Task 3, inspect Init and Sync previews and receipts before allowing write behavior.
- After Task 5, review Harvest good/bad cases and observable signals before implementing downstream transformations.
- After Task 7, verify the external-eval ownership boundary before adding any judge or corpus.
- Do not begin the next checkpoint if the current focused tests or vocabulary checks fail.
