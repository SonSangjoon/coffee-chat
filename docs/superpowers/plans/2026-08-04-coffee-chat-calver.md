# Coffee Chat CalVer Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Coffee Chat engine releases to UTC CalVer and make GitHub Actions the only routine version mutator.

**Architecture:** Replace release SemVer validation and comparison with a small CalVer module that accepts only real UTC `YYYY.MM.DD` values. Start the repository at a clean `v2026.08.04` baseline with no imported historical migration edge. Add a deterministic release-preparation module for future CalVer edges, then let the engine projection generator produce all derived release files. Add an engine-only manually dispatched workflow that runs preparation, gates, commit, tag, and GitHub Release with write permission.

**Tech Stack:** TypeScript, Node 24.5.0, npm 11.5.1, Vitest, GitHub Actions, existing Coffee Chat projection and migration tools.

## Global Constraints

- Release versions use UTC `YYYY.MM.DD` CalVer.
- Previous SemVer release identities and compatibility edges are not imported.
- The current checkout is initialized as the first CalVer release, `v2026.08.04`.
- Only one stable release may use a given UTC date; the untagged empty-registry
  baseline may be bootstrapped once without a migration edge.
- `coffee-chat.json.plugin.version`, `engine/release-config.json`, package metadata, migration target identity, and generated projections must agree.
- The persisted manifest schema version remains `1.1.0` and is not replaced by the release date.
- Release workflow credentials are limited to `contents: write`; no pull-request or external input path is accepted.
- The release workflow must use pinned Actions and must never force-push or overwrite an existing tag.

---

### Task 1: Lock the release policy in maintained documentation

**Files:**

- Modify: `docs/design/coffee-chat.md`
- Modify: `docs/testing.md`
- Add: `docs/superpowers/specs/2026-08-04-coffee-chat-calver-design.md`
- Add: `docs/superpowers/plans/2026-08-04-coffee-chat-calver.md`

**Interfaces:** The maintained design contract states the version policy; the test guide names the release checks; dated spec/plan preserve the approved rationale.

- [ ] Add a release-versioning section to `docs/design/coffee-chat.md` defining UTC `YYYY.MM.DD`, one release per date, CI ownership, and independent schema versioning.
- [ ] Remove the current design text that treats the release as a SemVer major/minor/patch identity; refer to the CalVer release surface instead.
- [ ] Add the release preparation and workflow checks to `docs/testing.md`.
- [ ] Review the new spec and plan for placeholders, contradictory version rules, and any undocumented local mutation path.
- [ ] Run `npm run format:check`.

### Task 2: Implement deterministic CalVer preparation

**Files:**

- Add: `tools/release-version.ts`
- Add: `tools/calver.ts`
- Modify: `tools/artifact-inventory.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Add: `tests/release-version.test.ts`

**Interfaces:** Export `calverForUtc(date: Date): string`, `isCalver(value: string): boolean`, and `prepareRelease(root: string, version: string): Promise<{ from: string; to: string; migration_id: string }>`; expose the executable as `node --experimental-strip-types tools/release-version.ts calver|prepare`.

- [ ] Write tests for UTC date formatting, invalid dates, CalVer-only target monotonicity, package/manifest/config alignment, deterministic migration IDs, and rejection of an existing target tag.
- [ ] Implement strict `YYYY.MM.DD` validation with real month/day ranges and UTC formatting.
- [ ] Read the current release identity before mutation, allow only the one-time untagged empty-registry baseline bootstrap, and reject every other target that is not newer or whose tag already exists.
- [ ] Update only the source version surfaces: `coffee-chat.json`, `engine/release-config.json`, package root versions, and the generated migration document/registry edge.
- [ ] Calculate the new release digest from the post-version source tree before writing the registry target digest, then leave generated projections for the existing engine generator.
- [ ] Keep migration documents limited to the existing manifest-only test/replace operation and preserve schema version `1.1.0`.
- [ ] Register the CalVer and release tools as engine-only delivery so downstream instance templates do not receive release automation.

### Task 3: Add the engine-only release workflow

**Files:**

- Modify: `tools/workflow-projections.ts`
- Modify: `tests/workflow-contracts.test.ts`
- Generate: `.github/workflows/release.yml`

**Interfaces:** Engine workflow projection emits a `workflow_dispatch` release workflow; instance projection does not emit it. The workflow calls the release-preparation CLI, runs all repository gates, commits one release change, pushes `main` and the new tag, and creates a GitHub Release.

- [ ] Render `release.yml` only for `repository_role: engine` with pinned checkout/setup-node Actions and `contents: write`.
- [ ] Accept an optional explicit UTC `release_date` input for reproducible CI diagnosis while defaulting to the runner's UTC date.
- [ ] Fail outside `main`, fail when the target tag exists, and use `persist-credentials: true` only for this write workflow.
- [ ] Run `npm ci`, release preparation, `npm run cc -- generate`, `npm run cc -- check`, `npm run cc -- generate --check`, `npm test`, `npm run typecheck`, `npm run format:check`, and `npm run gitleaks:scan` before commit.
- [ ] Commit as `chore(release): v<version> [skip ci]` when source bytes changed, push the branch and tag without force, and create the GitHub Release with generated notes.
- [ ] Test the workflow contract for trigger, permissions, pinned actions, branch guard, release commands, and the credential exception.

### Task 4: Switch the current release to CalVer and regenerate

**Files:**

- Modify: `coffee-chat.json`
- Modify: `engine/release-config.json`
- Modify: `engine/migrations/registry.json`
- Delete: the historical SemVer migration document from `engine/migrations/`
- Generate: engine, plugin, marketplace, advisory, release, template, and ownership projections

**Interfaces:** The current checkout becomes the initial `2026.08.04` release baseline; no historical SemVer path is imported.

- [ ] Set the current source surfaces to the new `2026.08.04` baseline and clear the historical migration registry.
- [ ] Run `npm run cc -- generate` and verify the release digest, template surface, advisory target, and all copies agree.
- [ ] Confirm the baseline registry is empty, no historical migration document remains, and all generated release identities report `2026.08.04`.

### Task 5: Verify release integrity

**Files:** Verify all changed source, generated, workflow, test, and documentation files.

**Interfaces:** Produce a clean, deterministic CalVer checkout ready for a future GitHub Actions release dispatch.

- [ ] Run `npm run cc -- generate --check` and `npm run cc -- check --snapshot worktree --format json`.
- [ ] Run `npm test`, `npm run typecheck`, `npm run format:check`, `npm run gitleaks:scan`, `npm run site:build`, and `npm run site:check`.
- [ ] Run `git diff --check`, inspect `git status --short`, and verify no local absolute paths or unrelated external content entered the release surfaces.
- [ ] Confirm the current manifest, release config, package metadata, release, template surface, advisory, and migration registry all report `2026.08.04` consistently.
