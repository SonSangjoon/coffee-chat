# Coffee Chat Agent Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For every behavior change, also use `superpowers:test-driven-development`; when creating or changing Skills, use `superpowers:writing-skills`; before declaring completion or publishing a PR, use `superpowers:verification-before-completion` and `superpowers:requesting-code-review`.

**Goal:** Let an installed generic Coffee Chat plugin create independently owned GitHub Template instances, preserve verifiable engine ancestry in each instance, and safely offer structural engine updates through AGENTS, Preview, literal digest approval, an isolated branch/worktree, and an optional user-approved PR.

**Architecture:** The maintained `coffee-chat` repository remains a knowledge-free engine and GitHub Template. Its generic plugin packages five instruction-only Skills and deterministic engine release metadata. A created instance stores immutable GitHub-template origin plus the exact adopted engine release and a digest-bound lock. Personal knowledge remains owned only by Build KG. A separately installed current engine plugin performs local read-only update discovery and runs a dedicated engine-update Candidate from a verified target engine checkout; it never overloads the existing knowledge `mode: "update"`.

**Tech Stack:** Node.js 24.5.0, npm 11.5.1, TypeScript 7.0.2, Vitest 4.1.10, Astro 7.1.6, Playwright 1.62.1, Ajv 8.20.0, YAML 2.9.0, Git, GitHub CLI, RFC 8785 canonical JSON, SHA-256, Codex and Claude plugin formats.

**Normative contract:** `docs/superpowers/specs/2026-08-03-coffee-chat-agent-lifecycle-design.md`

**Official external contracts:** [GitHub Template creation](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template), [enable a template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository), [GitHub REST create-from-template endpoint](https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template), [workflow `push` behavior for template creation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push), [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site), and [`gh repo create --template`](https://cli.github.com/manual/gh_repo_create).

## Global Constraints

- Work in an isolated implementation worktree created from the then-current remote `main`; never execute this plan on an instance repository or on an installed plugin/cache.
- Every task follows red -> run and observe the named failure -> smallest implementation -> focused green -> broader green -> commit. Do not weaken an assertion to make it pass.
- The engine root stays free of Profile, Note, Entity, personal snapshot, and personal plugin identity.
- `build-kg` remains the sole canonical personal-knowledge writer. `create-coffee-chat` provisions and hands off; `update-coffee-chat` migrates engine structure.
- Existing `CandidateRequest.mode: "update"` continues to mean Note/Entity update. Every engine migration interface uses the `engine update` namespace.
- Prepare operations write only to a newly created directory outside the target repository. Apply-time drift causes zero authoritative writes.
- From Task 2 onward, every change to a classified source/generated input runs full generation twice before commit and stages the resulting release, template surface, self-copy references, ownership markers, router/README, manifests/catalog, and generic package together. No intermediate commit may leave projection drift, even though the generic plugin version remains unreleased until Task 12.
- `projectionBundlePaths(role, manifest)` is the single closed list of generated outputs. It expands only the explicit constants for `engine/release.json`, `engine/template-surface.json`, the three surface self-copies, every generated root Skill reference, `.coffee-chat/generated-files.json`, instance-only `knowledge/index.json`, role-specific `.github/workflows/codeql.yml` and `.github/workflows/pages.yml`, `AGENTS.md`, `CLAUDE.md`, both READMEs, the four root plugin/marketplace manifests, and every file plus `.coffee-chat-generated.json` in the one generic or one namespaced personal plugin package. It never discovers outputs with a filesystem glob. Workflow safety separately enumerates every direct `.github/workflows/*.{yml,yaml}` file, including unmanaged additions. In Tasks 2-12, each **Files** section and commit scope implicitly includes every path returned by this function whenever an input to that bundle changes; task-specific lists name only the additional source, schema, test, or documentation files.
- Creation, branch creation, commit, push, PR, workflow execution caused by either push or pull-request events, template enablement, tag publication, Pages settings, and merge are distinct effects. An approval covers only effects named in its bound Preview.
- No central registry, Showcase, telemetry, install counter, background service, or automatic merge is introduced.
- There is no local-only instance-creation, local-merge, or private-lifecycle route in v1. Temporary local checkouts and isolated worktrees exist only to verify a change before remote GitHub publication.
- Do not activate Template mode or create `coffee-chat-son` until the implementation PR is merged and the release acceptance steps explicitly authorize those remote effects.

---

## File responsibility map

| Unit | Responsibility | Primary files |
| --- | --- | --- |
| Manifest and provenance | Strict engine/instance identities, immutable template origin, adopted release lock, knowledge-version separation | `coffee-chat.json`, `schemas/coffee-chat.schema.json`, `schemas/engine-lock.schema.json`, `tools/engine-provenance.ts`, `tools/knowledge.ts` |
| Release and artifact policy | Canonical engine release version/ref, exact adopted source inventory, closed role/phase-aware template surface, independent migration catalog digest | `engine/release-config.json`, `engine/release.json`, `engine/template-surface.json`, `engine/migrations/registry.json`, `tools/engine-release.ts`, `tools/artifact-inventory.ts` |
| Generated ownership | Repository/package generated-path preimages and safe stale deletion | `schemas/generated-ownership.schema.json`, `.coffee-chat/generated-files.json`, `tools/projections.ts` |
| Creation | Instruction-only native GitHub Template provisioning and Build KG handoff | `skills/create-coffee-chat/SKILL.md`, its generated references, `method/shared-method.md` |
| Knowledge Candidate | First-Note requirement, live template observation, downstream fingerprint, atomic engine-to-instance conversion | Candidate schemas, `tools/candidate.ts`, `tools/snapshot.ts` |
| Migration resolution | Advisory table, verified release graph, declarative migration documents, update CLI parsing | `tools/update-advisory.ts`, `tools/migrations.ts`, `tools/engine-update.ts`, engine-update schemas |
| Filesystem transaction | Preimage-bound atomic replace/delete and rollback shared by both Candidate families | `tools/transaction.ts` |
| Update publication | Digest-bound commit, push, and PR target/effects with reconciliation | `tools/engine-publication.ts`, publication schemas |
| Agent delivery | Five-Skill generic plugin, three-Skill personal plugin, AGENTS local advisory routing, host-specific refresh | `skills/update-coffee-chat/**`, `tools/projections.ts`, plugin lifecycle tests |
| Public surfaces | Agent-first creation CTA and canonical Built with attribution | `tools/readme.ts`, `site/lib/load-site-model.ts`, `site/layouts/BaseLayout.astro` |
| Acceptance and release | Read-only PR gates, remote release/template activation, `coffee-chat-son` dogfood | workflows, acceptance tests, `docs/testing.md` |

---

### Task 1: Separate manifest provenance from knowledge identity

**Files:**

- Modify: `coffee-chat.json`
- Modify: `schemas/coffee-chat.schema.json`
- Modify: `schemas/knowledge-index.schema.json`
- Add: `schemas/engine-lock.schema.json`
- Modify: `tools/knowledge.ts`
- Modify: `tools/candidate.ts`
- Add: `tools/engine-provenance.ts`
- Modify: `tools/generate.ts`
- Modify: `tools/contracts.ts`
- Modify: `tests/fixtures/engine-valid/coffee-chat.json`
- Modify: `tests/fixtures/initialized-valid/coffee-chat.json`
- Add: `tests/fixtures/initialized-valid/.coffee-chat/engine-lock.json`
- Modify: `tests/fixtures/synthetic-instance/coffee-chat.json`
- Add: `tests/fixtures/synthetic-instance/.coffee-chat/engine-lock.json`
- Add: `tests/engine-provenance.test.ts`
- Modify: `tests/foundation-contracts.test.ts`
- Modify: `tests/role-contracts.test.ts`
- Modify: `tests/task-2-contracts.test.ts`
- Modify: `tests/task-3-candidate.test.ts`
- Modify: `tests/make-mine-acceptance.test.ts`

**Interfaces:**

- Consumes: current `EngineManifest | InstanceManifest`, strict URL/digest helpers, and knowledge-index generation.
- Produces: `EngineProvenance`, `InstanceProvenance`, `EngineManagedFile`, `EngineDeliveryFile`, `EngineLock`, provenance/lock parsers, and `KNOWLEDGE_INDEX_SCHEMA_VERSION` for Tasks 2, 4, 6, 8, and 10.

- [ ] **Step 1: Write failing schema and digest tests**

Add the public types and assertions first:

```ts
export type EngineProvenance = {
  repository: string;
  version: string;
  source_commit: string;
  release_digest: `sha256:${string}`;
};

export type InstanceProvenance = {
  engine: EngineProvenance;
  created_from: {
    method: "github-template";
    template_repository: string;
  };
};

export type EngineManagedFile = {
  path: `./${string}`;
  class: "engine-source";
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineDeliveryFile = {
  path: `./${string}`;
  class: "engine-delivery";
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineLock = {
  schema_version: "1.0.0";
  engine: EngineProvenance;
  managed_files: EngineManagedFile[];
};
```

In `tests/engine-provenance.test.ts`, require a schema-1.1 instance fixture and an explicitly legacy schema-1.0 fixture:

```ts
expect(validateInstance(validInstance)).toEqual([]);
expect(validateInstance(validLegacyInstance)).toEqual([]);
expect(classifyInstanceProvenance(validLegacyInstance)).toEqual({ status: "legacy" });
expect(validateInstance(schema11WithoutProvenance)).toContainEqual(
  expect.objectContaining({ code: "schema-required", pointer: "/provenance" }),
);
expect(validateInstance(withMixedCaseCommit)).toContainEqual(
  expect.objectContaining({ code: "schema-pattern" }),
);
expect(validateInstance(withCredentialUrl)).toContainEqual(
  expect.objectContaining({ code: "repository-url-invalid" }),
);
expect(validateEngine(engineWithProvenance)).toContainEqual(
  expect.objectContaining({ code: "schema-additional-property", pointer: "/provenance" }),
);
```

Add a regression in `tests/task-2-contracts.test.ts` that changes only root manifest provenance and root schema version, then asserts the same `knowledge_digest`:

```ts
expect(after.knowledge_digest).toBe(before.knowledge_digest);
```

Run:

```bash
npm test -- tests/engine-provenance.test.ts tests/foundation-contracts.test.ts tests/role-contracts.test.ts tests/task-2-contracts.test.ts
```

Expected red: schema v1.1 and provenance/engine-lock parsing do not exist, legacy provenance state is not classified, and `buildKnowledgeIndex` feeds the root manifest schema version into the knowledge digest.

- [ ] **Step 2: Implement strict provenance and lock parsing**

Set the root engine manifest to root schema `1.1.0`. The parser remains backward-compatible with an already initialized schema-`1.0.0` instance and classifies it as `{ status: "legacy" }`. In `tools/candidate.ts`, introduce a temporary explicit `LEGACY_MAKE_MINE_SCHEMA_VERSION = "1.0.0"` and use it instead of deriving output schema from the new engine base; Tasks 1-3 must keep the pre-existing Candidate and acceptance suite green by emitting that legacy shape. Add a regression that Make mine against the schema-1.1 engine still produces a valid schema-1.0 instance without provenance. A schema-`1.1.0` instance requires provenance, and engine role forbids provenance. Task 4 deletes the temporary pin and is the only step that changes Make mine to emit a schema-`1.1.0` instance, so no intermediate task has a knowingly broken broader suite. Provenance-dependent create/update discovery treats a legacy instance as `unknown`, never inferred. Validate:

- strict SemVer;
- canonical credential-free GitHub HTTPS URLs;
- commit pattern `^(?:[0-9a-f]{40}|[0-9a-f]{64})$`;
- digest pattern `^sha256:[0-9a-f]{64}$`;
- equal normalized engine and template repository for the supported creation path;
- exact lock/provenance engine equality;
- sorted unique managed paths, safe relative paths, allowed modes, and forbidden instance-owned prefixes.

Export these interfaces from `tools/engine-provenance.ts`:

```ts
export function normalizeGitHubRepositoryUrl(value: string): string;
export function classifyInstanceProvenance(
  manifest: InstanceManifest,
): { status: "legacy" } | { status: "bound"; provenance: InstanceProvenance };
export function validateEngineProvenance(value: unknown, path: string): Diagnostic[];
export function parseEngineLock(bytes: Buffer, path: string): EngineLock;
export function assertLockMatchesManifest(
  manifest: InstanceManifest,
  lock: EngineLock,
): Diagnostic[];
```

Do not accept query strings, fragments, credentials, non-GitHub hosts, subpaths, or `.git`-variant ambiguity after normalization.

- [ ] **Step 3: Decouple the knowledge schema version**

Add and use:

```ts
export const KNOWLEDGE_INDEX_SCHEMA_VERSION = "1.0.0" as const;
```

`buildKnowledgeIndex` and its RFC 8785 digest input must use this constant and knowledge semantics only. Root manifest schema, engine version, source commit, release digest, creation provenance, and engine lock are excluded. A real knowledge-index contract change must deliberately bump this constant in a future migration.

Run focused tests, then:

```bash
npm run typecheck
npm run format:check
```

Commit:

```bash
git add coffee-chat.json schemas tools tests
git commit -m "feat: bind instances to engine provenance"
```

### Task 2: Generate a deterministic engine release and adoption lock

**Files:**

- Add: `engine/migrations/registry.json`
- Add: `engine/release-config.json`
- Add: `engine/release.json`
- Add: `engine/template-surface.json`
- Add: `schemas/engine-release-config.schema.json`
- Add: `schemas/engine-release.schema.json`
- Add: `schemas/engine-template-surface.schema.json`
- Add: `schemas/engine-migration-registry.schema.json`
- Add: `tools/engine-release.ts`
- Add: `tools/engine-contracts.ts`
- Add: `tools/engine-cli.ts`
- Add: `tools/workflow-projections.ts`
- Modify: `tools/artifact-inventory.ts`
- Modify: `tools/projections.ts`
- Modify: `tools/snapshot.ts`
- Modify: `tools/generate.ts`
- Modify: `tools/cc.ts`
- Add: `tests/engine-release.test.ts`
- Add: `tests/engine-generation-cli.test.ts`
- Add: `tests/release-dependency-closure.test.ts`
- Add: `tests/helpers/engine-release-fixture.ts`
- Modify: `tests/artifact-boundaries.test.ts`
- Modify: `tests/foundation-contracts.test.ts`
- Modify: `tests/task-3-cli.test.ts`
- Modify: `tests/workflow-contracts.test.ts`
- Modify: `.github/workflows/pages.yml`
- Modify: `.github/workflows/codeql.yml`
- Generate: `.codex-plugin/plugin.json`
- Generate: `.claude-plugin/**`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `plugins/coffee-chat/**`

**Interfaces:**

- Consumes: Task 1 provenance/digest formats, current Snapshot abstraction, and closed artifact classification.
- Produces: managed shared `EngineReleaseConfig`/`EngineReleaseManifest`/`EngineTemplateSurfaceManifest` contracts, delivery-only `tools/engine-cli.ts`, release/surface digest builders and verifiers, a transitive managed/delivery dependency-closure gate, role/phase-aware artifact policy, bootstrap-safe engine workflows plus instance workflow renderers, schema auto-discovery, and canonical `engine/release.json` plus `engine/template-surface.json` for later tasks.

- [ ] **Step 1: Fix the release contract with failing tests**

Define:

```ts
export type EngineReleaseConfig = {
  schema_version: "1.0.0";
  version: string;
  source_ref: `refs/tags/v${string}`;
  target_manifest_schema_version: string;
};

export type EngineReleaseManifest = {
  schema_version: "1.0.0";
  repository: string;
  version: string;
  source_ref: `refs/tags/v${string}`;
  target_manifest_schema_version: string;
  migration_registry: { path: string; digest: `sha256:${string}` };
  managed_files: EngineManagedFile[];
  delivery_files: EngineDeliveryFile[];
  release_digest: `sha256:${string}`;
};

export type RepositorySnapshotEntry = {
  path: string;
  mode: "100644" | "100755" | "120000";
};

export type RepositoryProjection = {
  outputs: Array<{
    path: string;
    bytes: Buffer;
    mode: "100644" | "100755";
  }>;
  deletions: string[];
};

// Add this method to the existing Snapshot interface.
export interface Snapshot {
  listRepositoryEntries(): Promise<RepositorySnapshotEntry[]>;
}

export type TemplateDisposition =
  | "adopt-engine-source"
  | "replace-instance-authored"
  | "replace-instance-generated"
  | "remove-engine-only";

export type EngineTemplateSurfaceManifest = {
  schema_version: "1.0.0";
  repository: string;
  release: Pick<
    EngineReleaseManifest,
    "version" | "source_ref" | "release_digest"
  >;
  files: Array<{
    path: `./${string}`;
    mode: "100644" | "100755";
    engine_audience: "instance" | "engine-only";
    engine_ownership: "source" | "generated" | "authored";
    disposition: TemplateDisposition;
    binding:
      | { kind: "content"; digest: `sha256:${string}` }
      | { kind: "surface-self-copy" };
  }>;
  surface_digest: `sha256:${string}`;
};

export function projectionBundlePaths(
  role: "engine" | "instance",
  manifest: EngineManifest | InstanceManifest,
): `./${string}`[];

export function renderRoleWorkflows(
  role: "engine" | "instance",
): RepositoryProjection;
```

Test that engine version/ref comes only from `engine/release-config.json`, generic plugin version comes only from `coffee-chat.json.plugin.version`, and neither is derived from the other. Test exact ordering, modes, path safety, forbidden roots, duplicate rejection, registry/document digest validation, domain separation, release self-exclusion, migration-registry digest independence, and byte-identical second generation. Prove the release digest changes when either an adopted managed byte or an executable delivery byte changes, while Skill-instruction-only bytes do not change it. Add a regression proving that an edge may name the target `release_digest` without a digest cycle. Require the template surface to classify every repository entry exactly once. Worktree entries are the sorted union of `git ls-files --cached --others --exclude-standard`; staged entries come only from the Git index, and base entries come only from the named tree. All ordinary entries bind path/mode/digest/audience/ownership/disposition. Only `engine/template-surface.json` and the exact generated reference-copy paths may use `surface-self-copy`; each must byte-equal the final manifest. Reject every other missing digest, unlisted/duplicate/symlink path, or unequal self-copy. Also require `generate --check` to fail when one release-inventory or template-surface byte/mode changes without regenerating metadata.

In `tests/workflow-contracts.test.ts`, enumerate the parsed `on` keys of every direct `.github/workflows/*.yml` and `*.yaml` file in an engine/template projection, including unmanaged additions. Native GitHub template generation emits `push`, so require zero matching `push` trigger in that phase, and specifically prove CodeQL and Pages cannot run or deploy on repository creation. Render the corresponding instance CodeQL/Pages forms in memory and require their intended push triggers and least-privilege permissions; they are written only by Make mine and their first remote executions must be named in the later publication Preview.

In `tests/release-dependency-closure.test.ts`, parse every static import, re-export, dynamic literal import, type import, package-script entrypoint, `tsconfig`-included local module, and local executable path named by a test or script. Require the transitive graph of each managed module/test to remain inside `release_class: "managed"`; delivery may import managed but never the reverse. Split any mixed CLI test so a test that invokes an engine-only command or fixture is delivery plus `remove-engine-only`, while only instance-validating tests survive. Keep pure shared release types in managed `tools/engine-contracts.ts`. Require managed `tools/cc.ts` to have no static/type dependency on delivery code. It reads role and uses an argument-array subprocess to delivery `tools/engine-cli.ts` for engine `generate`/`check`; instance `generate`/`check` continue through managed `tools/generate.ts`. Task 6 extends that same delivery entrypoint with `engine update`. Any missing post-conversion script/import/fixture/command target fails release generation.

Replace the hard-coded schema test list in `tests/foundation-contracts.test.ts` with sorted deterministic discovery of every `schemas/*.schema.json`; each later schema must compile automatically.

Run:

```bash
npm test -- tests/engine-release.test.ts tests/artifact-boundaries.test.ts tests/task-3-cli.test.ts
```

Expected red: no release schema, inventory, digest builder, or generated file exists.

- [ ] **Step 2: Implement a closed exact-path inventory**

In `tools/artifact-inventory.ts`, classify each path on two independent axes:

```ts
export type ArtifactContext =
  | "engine-repository"
  | "template-copy"
  | "instance-repository";
export type ArtifactAudience = "instance" | "engine-only" | "local";
export type ArtifactOwnership = "source" | "generated" | "authored";

export type EngineArtifactPolicy = {
  path: string;
  states: Partial<
    Record<
      ArtifactContext,
      { audience: ArtifactAudience; ownership: ArtifactOwnership }
    >
  >;
  template_disposition: TemplateDisposition;
  release_class: "managed" | "delivery" | "excluded";
};

export function engineManagedSourcePaths(): string[];
export function forbiddenEngineManagedPath(path: string): boolean;

export const TEMPLATE_SURFACE_SELF_COPY_PATHS = [
  "./engine/template-surface.json",
  "./skills/create-coffee-chat/references/template-surface.json",
  "./plugins/coffee-chat/skills/create-coffee-chat/references/template-surface.json",
] as const;
```

The inventory must be explicit, context-aware, deterministic, and dependency-closed. Instance runtime, schema, site source, three instance-facing root Skills/shared method, package/lockfile, instance-validating tests, read-only PR CI, and shared static assets transition through `adopt-engine-source` with `release_class: "managed"`. Release verification plus engine update/migration/publication runtime, schemas, and dependent tests/fixtures use `release_class: "delivery"` and `remove-engine-only`. Every workflow with a `push` trigger is `replace-instance-generated`: `renderRoleWorkflows("engine")` produces the bootstrap-safe template form with no push trigger, while `renderRoleWorkflows("instance")` produces the instance CodeQL/Pages forms before separately approved first publication. Creation/update Skill instructions, engine-update method, release/template-surface manifests, migration registry/documents, generic plugin, and engine-only docs are `excluded` from release identity but still use `remove-engine-only` and template-surface binding. The copied engine root manifest and content notice use `replace-instance-authored`; README, AGENTS, CLAUDE, index, Pages projections, and personal plugin namespaces use `replace-instance-generated`. `node_modules` and transaction state remain local and never enter the template surface. Only the three exact constants above may be self-copy-bound when present; every other tracked path is content-digested. Template transition and steady-state instance ownership remain separate fields. New unclassified tracked files or dependency-closure violations make tests fail until intentionally classified.

- [ ] **Step 3: Implement release generation and checking**

In `tools/engine-release.ts`, expose:

```ts
export async function buildEngineRelease(
  snapshot: Snapshot,
  manifest: EngineManifest,
  config: EngineReleaseConfig,
): Promise<EngineReleaseManifest>;

export type EngineReleaseDigestInput = Pick<
  EngineReleaseManifest,
  | "repository"
  | "version"
  | "source_ref"
  | "target_manifest_schema_version"
  | "managed_files"
  | "delivery_files"
>;

export function canonicalEngineReleaseDigest(
  value: EngineReleaseDigestInput,
): `sha256:${string}`;

export async function verifyEngineRelease(
  snapshot: Snapshot,
  release: EngineReleaseManifest,
): Promise<Diagnostic[]>;

export async function buildTemplateSurface(
  snapshot: Snapshot,
  release: EngineReleaseManifest,
  policy: EngineArtifactPolicy[],
  projection: RepositoryProjection,
): Promise<EngineTemplateSurfaceManifest>;

export function canonicalTemplateSurfaceDigest(
  value: Omit<EngineTemplateSurfaceManifest, "surface_digest">,
): `sha256:${string}`;

export async function verifyTemplateSurface(
  snapshot: Snapshot,
  surface: EngineTemplateSurfaceManifest,
): Promise<Diagnostic[]>;
```

Use the repository only from the engine manifest and version/ref/schema only from release config. Require `source_ref === refs/tags/v${version}`. Use RFC 8785 canonical JSON over exactly `{ domain: "coffee-chat-engine-release/v1", repository, version, source_ref, target_manifest_schema_version, managed_files, delivery_files }`. Hash `engine/migrations/registry.json` independently into `migration_registry.digest`; do not include that object, the registry path, or migration documents in either release inventory, because registry edges name target release digests. The engine-update Candidate later binds the release, registry, and selected document digests. The delivery CLI builds release/surface values and passes their bytes through managed contract-shaped arguments to the managed projection renderer; `tools/projections.ts` never imports a delivery implementation. Build the complete projection in memory: generate `engine/release.json`; render every other non-surface output and release/schema reference; render ownership markers while excluding self-copy paths; overlay those outputs/deletions on the selected Snapshot; generate `engine/template-surface.json` with domain `coffee-chat-template-surface/v1`; then add identical surface bytes at the approved reference paths. The surface digest input contains the closed self-copy path entries but no self-copy content digests. `generate --check` compares this virtual final tree without writing; `generate` writes exactly the same bytes. Before distribution, bump the generic plugin once after every distributable input is fixed; the generated self-copy does not cause a second bump. Extend `npm run cc -- generate --check` and `check` to validate both in worktree and staged snapshots.

Set `engine/release-config.json` to engine `1.1.0`, `source_ref: refs/tags/v1.1.0`, and manifest schema `1.1.0`. Keep the unreleased generic plugin at its current `1.0.0` during Tasks 2-11 to prove the identities are independent; Task 12 performs the single final `1.1.0` plugin bump after every distributable byte is fixed. Keep the production migration registry empty; synthetic edges are created in temporary test repositories.

Run focused tests twice to prove byte identity, then full type and formatting checks.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: generate verifiable engine releases"
```

### Task 3: Make generated-file ownership digest-bound

**Files:**

- Add: `schemas/generated-ownership.schema.json`
- Add: `tools/generated-ownership.ts`
- Add: `.coffee-chat/generated-files.json` (generated after exact legacy adoption)
- Generate: `plugins/coffee-chat/.coffee-chat-generated.json`
- Generate: each fixture/personal package `.coffee-chat-generated.json` under its exact package root
- Modify: `tools/projections.ts`
- Modify: `tools/artifact-inventory.ts`
- Modify: `schemas/candidate-manifest.schema.json`
- Modify: `tests/task-4-projections.test.ts`
- Modify: `tests/task-4-candidate-projections.test.ts`
- Modify: `tests/artifact-boundaries.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`

**Interfaces:**

- Consumes: Task 1 engine provenance and Task 2 artifact classification.
- Produces: `GeneratedOwnershipMarker` v1.1 and preimage-bound projection replace/delete behavior used by Make mine, engine migration, plugin lifecycle, and README/Pages generation.

- [ ] **Step 0: Freeze the pre-change projection baseline**

Before adding any Task 3 file or editing any projection/test, require a clean Task 2 checkout and run the old `npm run cc -- generate --check`. Record the exact base commit, generated path set, path modes, byte digests, legacy marker bytes, and closed `owned_paths` set in a read-only receipt outside the repository. Hash that receipt and keep it immutable. Every later adoption test reads an exact Git snapshot at that base commit plus the external receipt; it must reject a receipt with another base commit, path, mode, digest, or marker. Do not compute “legacy” expected bytes from the already modified Task 3 worktree.

- [ ] **Step 1: Replace the unsafe path-only marker in red tests**

Specify marker v1.1:

```ts
export type GeneratedOwnershipMarker = {
  schema_version: "1.1.0";
  owner: "coffee-chat";
  scope: "repository" | "plugin-package";
  owned_files: Array<{
    path: `./${string}`;
    digest: `sha256:${string}`;
  }>;
  adopted_engine?: Pick<EngineProvenance, "repository" | "version" | "release_digest">;
};
```

Change the prior deletion test that trusts injected path membership. It must now assert:

```ts
await expect(regenerateWithTamperedOwnedFile()).rejects.toMatchObject({
  code: "generated-owned-file-conflict",
});
expect(await readFile(tamperedPath, "utf8")).toBe(sentinel);
```

Test both `.coffee-chat/generated-files.json` at repository scope and `.coffee-chat-generated.json` at plugin-package scope. An unchanged stale generated file may be deleted; a changed stale file is preserved with an error; neither marker owns itself; neither marker may claim a `TEMPLATE_SURFACE_SELF_COPY_PATHS` entry; a repository marker may otherwise claim only known root projections and the plugin/marketplace namespaces in its own manifest; and one instance plugin removal cannot touch another namespace or sentinel setting. Add a cycle regression proving surface generation, self-copy projection, and marker generation reach byte identity in one ordered pass plus one no-op check.

Add a regression that instance `CONTENT_LICENSE.md` is canonical authored input: generation reads and passes through the exact bytes but neither repository nor package ownership markers may claim the root file. A second generation must preserve it byte-for-byte.

Add bootstrap regressions for the current v1.0 package marker and the absent repository marker. `adoptLegacyGeneratedOwnership()` may write only the new marker when every existing generated byte exactly equals the current pre-change projection bundle and the old `owned_paths` set equals the closed expected set. Any tampered, missing, extra, symlinked, or differently scoped byte returns `generated-ownership-upgrade-required` with zero writes. A legacy instance presented directly to a later changed generator must therefore stop rather than overwrite.

Run:

```bash
npm test -- tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts tests/artifact-boundaries.test.ts tests/plugin-lifecycle.test.ts
```

Expected red: the marker stores only `owned_paths` and grants deletion from path membership alone.

- [ ] **Step 2: Implement preimage-bound generation**

When generating a repository or package:

1. hash every generated output except the ownership marker itself and the closed template-surface self-copy paths, which are owned by the surface verifier;
2. write `.coffee-chat/generated-files.json` for the repository and `.coffee-chat-generated.json` inside each generated plugin package;
3. write each sorted `owned_files` marker last and never include a marker in its own inventory;
4. before replace/delete, require the current digest to match the old marker;
5. treat missing, duplicate, unsafe, or broadened marker entries as validation failures;
6. include adopted engine identity in instance repository/package markers but not engine-role markers;
7. never read either marker as authority outside its exact scope root.

Implement:

```ts
export async function adoptLegacyGeneratedOwnership(input: {
  root: string;
  scope: "repository" | "plugin-package";
  expected_files: Map<string, Buffer>;
  legacy_marker?: { owned_paths: string[] };
}): Promise<GeneratedOwnershipMarker>;
```

Using only Step 0's base-commit snapshot and immutable receipt, the first v1.1 generation adopts those exact prior bytes and writes markers only; rerun generation after that marker-only adoption. This compatibility path never guesses expected old bytes after later projection changes.

Do not add custom provenance properties to `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, or marketplace manifests.

Run the focused suite and:

```bash
npm run cc -- generate
npm run cc -- generate --check
git diff --check
```

Commit all regenerated projections with the implementation:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "fix: bind generated ownership to file digests"
```

### Task 4: Bind Make mine to native creation evidence and a first Note

**Files:**

- Modify: `schemas/candidate-request.schema.json`
- Modify: `schemas/candidate-manifest.schema.json`
- Modify: `schemas/preview.schema.json`
- Modify: `schemas/receipt.schema.json`
- Modify: `tools/candidate.ts`
- Add: `tools/template-adoption.ts`
- Modify: `tools/projections.ts`
- Modify: `tools/engine-provenance.ts`
- Modify: `tools/snapshot.ts`
- Modify: `tests/candidate-downstream-identity.test.ts`
- Modify: `tests/task-3-candidate.test.ts`
- Modify: `tests/task-3-cli.test.ts`
- Modify: `tests/task-4-candidate-projections.test.ts`
- Modify: `tests/make-mine-acceptance.test.ts`
- Modify: `tests/release-dependency-closure.test.ts`
- Modify: `tests/foundation-contracts.test.ts`
- Modify: `tests/fixture-isolation.test.ts`
- Modify: `tests/task-4-projections.test.ts`
- Modify: `CONTENT_LICENSE.md`
- Delete: `tests/fixtures/son-input/README.md`
- Delete: `tests/fixtures/son-input/first-note-request.json`
- Add: `tests/fixtures/example-input/README.md`
- Add: `tests/fixtures/example-input/first-note-request.json` (clearly fictional, neutral public test data)

**Interfaces:**

- Consumes: Task 1 provenance/lock contract, Task 2 release/template-surface inventory, and Task 3 projection ownership.
- Produces: Make mine `instance_configuration.provenance`, `TemplateObservation`, one reusable `resolveTargetFingerprint()`, and Preview/receipt provenance evidence consumed by Tasks 5, 6, 8, 10, and 11.

- [ ] **Step 1: Add provenance and first-Note failures**

Extend Make mine's `instance_configuration` only:

```ts
export type TemplateObservation = {
  source_repository_id: string;
  source_repository: string;
  source_is_template: true;
  source_visibility: "public";
  source_default_branch: string;
  source_default_commit: string;
  source_default_tree: string;
  source_release_ref: string;
  source_release_commit: string;
  source_release_tree: string;
  release_digest: `sha256:${string}`;
  template_surface_digest: `sha256:${string}`;
  target_repository_id: string;
  target_repository: string;
  target_description: string;
  template_repository: string;
  target_visibility: "public";
  target_default_branch: string;
  target_initial_commit: string;
  target_initial_tree: string;
};

export type ProfileValue = {
  temporary_key: string;
  display_name: string;
  short_name: string;
};

export type RepositoryValue = {
  url: string;
  default_branch: string;
};

export type PluginValue = {
  name: string;
  version: string;
  description: string;
};

export type MakeMineConfiguration = {
  profile: ProfileValue;
  time_zone: string;
  repository: RepositoryValue;
  pages_url: string;
  plugin: PluginValue;
  content_notice: string;
  provenance: InstanceProvenance;
  template_observation: TemplateObservation;
};
```

Add tests that reject, before Candidate materialization:

- zero created Notes;
- missing `profile.temporary_key`, `pages_url`, or `content_notice`;
- missing or malformed observation;
- source repository/version/release mismatch;
- source no longer public or no longer a template;
- target origin mismatch;
- target description mismatch;
- different GitHub `template_repository`;
- source tree/release managed-file or template-surface mismatch;
- maintained engine checkout, installed package, or cache as target;
- observation, origin, base commit, root manifest, or date drift after prepare.

Replace the former Son fixture with an explicitly fictional `Example Author` request and neutral public-domain/CC0 test prose. Remove the Son path clause from canonical `CONTENT_LICENSE.md` and its generator, update exact-byte license/projection tests, and add a fixture-isolation gate proving `tests/fixtures/son-input` is absent and no Son Profile, authored Note, personal repository/plugin identity, or Son-specific content notice remains anywhere under `tests/fixtures/**`.

Require `source_default_tree === target_initial_tree`. The stable tag, template default branch, and target initial tree must each byte/mode-match every entry in both `release.managed_files` and `release.delivery_files`; only release-excluded engine-only paths may differ between the stable tag and default tree, and the complete default/target trees remain closed by the template surface. Recompute `release_digest` from the tag manifest rather than comparing a file subset to a digest string. Record all three commits without pretending GitHub used the tag directly. Extend `CandidateDependencies` with:

```ts
export type ObserveTemplate = (
  expected: TemplateObservation,
) => Promise<TemplateObservation>;

export type CandidateDependencies = {
  clock?: { now(): Date };
  uuid?: { next(): string };
  fileSystem?: CandidateFileSystem;
  git?: GitExecutor;
  process?: ProcessExecutor;
  preflight?: {
    checkpoint(
      point: "before-shared-validation" | "before-candidate-transaction",
    ): Promise<void>;
  };
  observeTemplate?: ObserveTemplate;
};
```

The production dependency resolver supplies `observeTemplate`; Make mine rejects the request if it is absent, while contribute/update never call it. The observer performs read-only `gh api` calls for the release ref, source template/public state, complete template surface, and target repository/description/commit/tree/native template relation. Prepare and the `before-candidate-transaction` checkpoint re-run the observer, target fingerprint, frozen-date, Source-observation, and setup-effect checks and require exact equality. Tests inject source-ref movement, source template/public-state drift, template-surface drift, target description/commit/tree movement, template relation change, repository-ID change, visibility change, and observer/network failure; every case must invalidate with zero Candidate or canonical writes at its boundary.

Materialize `provenance.engine.source_commit` from the actual `source_default_commit` used by GitHub Template creation; keep the stable release-ref commit and target initial commit in Preview/receipt evidence.

Require Preview, Candidate manifest, receipt, canonical `coffee-chat.json`, and `.coffee-chat/engine-lock.json` to carry the same verified engine identity. The API observation remains in Preview/receipt rather than becoming a permanent `verified` claim.

Run:

```bash
npm test -- tests/candidate-downstream-identity.test.ts tests/task-3-candidate.test.ts tests/task-3-cli.test.ts tests/make-mine-acceptance.test.ts
```

Expected red: Make mine accepts no engine provenance and can currently initialize without binding GitHub native template evidence.

- [ ] **Step 2: Implement the observer and one fingerprint resolver**

Expose and reuse at prepare, apply entry, and the final pre-transaction checkpoint:

```ts
export type TargetFingerprint = {
  git_common_dir: {
    real_path: string;
    device: string;
    inode: string;
  };
  origin_url: string;
  base_commit: string;
  pre_conversion_manifest_digest: `sha256:${string}`;
};

export async function resolveTargetFingerprint(
  root: string,
  dependencies: CandidateDependencies,
): Promise<TargetFingerprint>;
```

Read device and inode with bigint stats and serialize exact decimal strings. Do not use JavaScript `number`. Keep worktree-status binding separate from repository identity. Immediately before canonical mutation, re-resolve the complete fingerprint after Candidate, Source-observation, date, and setup-effect checks.

- [ ] **Step 3: Prove observation and fingerprint races fail closed**

Run:

```bash
npm test -- tests/candidate-downstream-identity.test.ts tests/task-3-candidate.test.ts -t "template observation|target fingerprint|late drift"
```

Expected green: exact observations pass; every source, surface, target, date, or fingerprint drift produces the named invalidation code with zero Candidate/canonical writes.

- [ ] **Step 4: Atomically materialize the instance contract**

Delete Task 1's temporary `LEGACY_MAKE_MINE_SCHEMA_VERSION` pin. Make mine consumes the bound template-surface manifest through managed `tools/template-adoption.ts` and writes a schema-`1.1.0` instance role, immutable creation provenance, adopted engine provenance, engine lock, Profile UUID minted from `profile.temporary_key`, Pages URL, exact authored content notice, first Note/Entities, and deterministic projections in one Candidate transaction. `tools/candidate.ts` must not import a delivery module merely to perform this conversion. It adopts only `adopt-engine-source` preimages, replaces every authored/generated transition path—including the bootstrap-safe workflow files with `renderRoleWorkflows("instance")`—and deletes every `remove-engine-only` path such as the template-surface file itself, generic plugin, creation/update Skills, engine-update method, release manifest, migration catalog, and delivery-dependent tests. The Candidate Preview names the workflow files but authorizes no remote run; the later Git publication Preview separately lists every workflow its push will trigger. An unclassified or changed path blocks the Candidate. The existing engine checkout and newly created remote remain unchanged until literal Candidate digest approval.

Add a receipt equality test:

```ts
expect(receipt.target_fingerprint).toEqual(preview.target_fingerprint);
expect(receipt.provenance).toEqual(candidateManifest.provenance);
expect(canonicalManifest.provenance).toEqual(receipt.provenance);
expect(canonicalManifest.profile.id).toBe(receipt.minted_ids.profile);
expect(canonicalManifest.pages_url).toBe(request.instance_configuration.pages_url);
expect(readContentNotice()).toBe(request.instance_configuration.content_notice);
expect(receipt.knowledge_digest).toBe(generatedIndex.knowledge_digest);
```

- [ ] **Step 5: Run the complete Make mine slice and commit**

Run all Candidate tests, typecheck, and deterministic generation twice. Then, against the fully converted temporary instance after every `remove-engine-only` deletion, run `npm run cc -- validate --snapshot worktree --format json`, `npm run typecheck`, the surviving instance test suite, and one Build KG prepare-without-apply smoke test. Require all local imports and package-script entrypoints to exist, a byte-identical second generation, and no diff in the maintained engine checkout. This is the first concrete regression for the managed/delivery dependency-closure contract.

Commit:

```bash
git add .github coffee-chat.json CONTENT_LICENSE.md engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: verify template provenance during make mine"
```

### Task 5: Add the agent-driven GitHub Template creation Skill

**Files:**

- Add: `skills/create-coffee-chat/SKILL.md`
- Add: `skills/create-coffee-chat/references/method.md` (generated)
- Add: `skills/create-coffee-chat/references/release.json` (generated)
- Add: `skills/create-coffee-chat/references/engine-release.schema.json` (generated)
- Add: `skills/create-coffee-chat/references/template-surface.json` (generated)
- Add: `skills/create-coffee-chat/references/engine-template-surface.schema.json` (generated)
- Modify: `method/shared-method.md`
- Modify: `tools/artifact-inventory.ts`
- Modify: `tools/projections.ts`
- Modify: `tools/engine-cli.ts`
- Modify: `tests/helpers/skill-harness.ts`
- Modify: `tests/skill-contracts.test.ts`
- Modify: `tests/skill-evaluations.test.ts`
- Modify: `tests/task-4-projections.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: Task 2 generated engine release/template-surface references, Task 3 role-aware projection ownership, and Task 4's live-observed Make mine contract.
- Produces: `create-coffee-chat` Skill, generated release/surface/schema references, temporary `ENGINE_PROVISIONING_SKILLS`, and a verified repo-local Build KG handoff.

- [ ] **Step 1: Write the failing static creation contract**

Use `superpowers:writing-skills`. The existing Vitest harness remains a static instruction/filesystem contract and must not be described as executing a model. Add fixtures for agents that:

- use `git clone` plus remote rewriting instead of GitHub Template creation;
- issue a POST without exact owner/name/public/path confirmation;
- continue when `is_template` is false;
- request, print, or store a token;
- reuse an existing repository or non-empty/symlink local directory;
- blindly retry an ambiguous timeout;
- trust an unexpected `template_repository` value;
- include a public Note or other personal content in the repository-creation request;
- write knowledge before handing off to repo-local Build KG.
- recurse from the pre-conversion engine-role checkout back into Create yours;
- approve a target before release/default/template-surface/lockfile observations exist.
- commit or push the converted instance under Candidate approval.

Run:

```bash
npm test -- tests/skill-evaluations.test.ts tests/skill-contracts.test.ts
```

Expected red: no creation Skill or route exists, so the static creation/provenance handoff contract fails.

- [ ] **Step 2: Record actual baseline agent failures**

Run one actual baseline Codex subagent and one actual baseline Claude Code session in isolated temporary homes without the new Skill. Use a hermetic temporary Git repository plus a fake `gh` executable/API fixture that records argument arrays and returns deterministic public/template/default/release/target observations without contacting GitHub. Keep transcripts outside the repository; record only scenario, host version, observed pass/fail, and non-secret receipt in `docs/testing.md`. Baseline behavior is diagnostic, not a gate: do not require either model to fail nondeterministically. The red gate is the deterministic static test from Step 1.

- [ ] **Step 3: Write the smallest complete creation protocol**

The Skill must:

1. verify it is the generic engine Skill and read its generated method, release, template-surface, and schema references;
2. inspect existing `gh auth status` without exposing credentials;
3. resolve the official source repository, require public visibility and `is_template: true`, resolve `refs/tags/v<engine-version>` plus default HEAD/tree, and require every path/mode/digest in both release inventories to match the stable tag and template default branch; then verify every live default-tree path against the packaged template-surface manifest, prove every template workflow is bootstrap-safe with no matching `push` trigger, and inspect the committed lockfile/registry host;
4. render one complete Preview binding source repository ID/status, release ref/commit/tree/digest, default commit/tree, template-surface digest, target owner/name/description/public URL, local path, clone/API arguments, the fact that native creation triggers no matching workflow, Node/npm versions, lockfile digest, registry host, and `node_modules/**` write;
5. stop and wait for exact confirmation of that complete Preview;
6. immediately re-observe all source, surface, lockfile, target-absence, and local-path values; any drift cancels approval;
7. invoke the argument array equivalent of `gh api --method POST repos/{template_owner}/{template_repo}/generate -f owner={owner} -f name={name} -f description={description} -F private=false -F include_all_branches=false`—the API field is `private: false`, not `visibility`;
8. reconcile timeout by GET of the exact target, including its approved description, before deciding whether a retry is safe;
9. verify target ID/URL/public visibility, exact description, and `template_repository` through GET;
10. re-read the release ref and target, require the target initial tree to equal the approved default-branch tree and every path/mode/digest to equal the template surface, and stop if either changed;
11. clone only into the approved empty non-symlink directory;
12. verify Node 24.5.0 and npm 11.5.1, then run `npm ci --ignore-scripts` in the new checkout from its committed lockfile;
13. pass the complete `TemplateObservation` and surface identity through an external request file to the new checkout;
14. invoke the explicit pre-conversion AGENTS exception, which rechecks origin/fingerprint/native relation/surface and routes once to repo-local `build-kg` instead of Create yours;
15. after a successful Candidate receipt, offer a separate standard Git publication Preview for the exact repository/base/diff/commit/push target; never treat Candidate approval as commit/push approval and obey any protected-branch/PR requirement;
16. report `partial_external_result` without remote deletion when a later step fails.

The pre-POST Preview binds the exact dependency effect as well as GitHub/clone effects: command, Node/npm versions, lockfile digest, registry host, approved checkout path, and `node_modules/**` destination. No approval means no repository, clone, dependency traffic, or local dependency write.

The post-Candidate publication has two closed handoff outcomes. If a read-only preflight proves the approved default branch accepts the exact commit, the Preview binds that default ref and direct push plus every resulting workflow; a separate publication-digest approval authorizes only that commit/push. If protection requires a branch/PR, the Preview binds the branch, commit, push, PR title/body, and every push/PR workflow; approval authorizes only commit/push/PR and never merge. The Skill then stops with `awaiting_owner_merge` and records the pushed PR head SHA plus the bound result-tree digest. It may report creation complete only after a fresh read observes the PR as merged with the same base and PR head SHA, obtains the actual `merge_commit_sha` (or proves fast-forward and uses the bound PR head), and verifies that the default-branch SHA equals that observed merge commit (or fast-forward head) and its tree equals the bound result tree. Named CI/CodeQL/Pages results are then read against that observed default SHA. Pages activation and URL handoff occur only after this default-branch reconciliation; an open PR is a resumable partial result, not a successful publication.

The Skill may use the user's authenticated GitHub CLI, but the plugin still packages no `bin`, Node runtime, MCP, Hook, agent definition, service, or credential material.

- [ ] **Step 4: Project the correct role-specific Skill surfaces**

For the first green creation slice, replace the single closed list with:

```ts
export const INSTANCE_SKILLS = [
  "coffee-chat",
  "apply-perspective",
  "build-kg",
] as const;

export const ENGINE_PROVISIONING_SKILLS = ["create-coffee-chat"] as const;

export const ENGINE_PLUGIN_SKILLS = [
  ...INSTANCE_SKILLS,
  ...ENGINE_PROVISIONING_SKILLS,
] as const;
```

Task 10 replaces `ENGINE_PROVISIONING_SKILLS` with the final two-entry `ENGINE_ONLY_SKILLS` after the updater Skill exists. Every intermediate commit therefore remains internally closed and green. The personal instance plugin continues to package exactly the three instance Skills.

In the same projection, add the narrowly gated AGENTS pre-conversion route required by Step 3: normal engine-role entry still offers only Create/Install/Contribute, but an explicit external handoff whose live origin, target fingerprint, source/target observation, and template-surface digest satisfy Task 4 routes exactly once to repo-local `build-kg`. Maintained engine checkouts and installed package/cache paths remain forbidden. Task 10 must preserve this route while adding update discovery.

- [ ] **Step 5: Run the static and projection suite**

Run:

```bash
npm test -- tests/skill-evaluations.test.ts tests/skill-contracts.test.ts tests/task-4-projections.test.ts tests/plugin-lifecycle.test.ts
npm run cc -- generate --check
```

Expected green: the complete Preview precedes approval, the pre-conversion route cannot recurse, Candidate approval cannot publish Git state, the generic package contains the creation Skill/references, and the personal package remains exactly three Skills.

- [ ] **Step 6: Run actual post-implementation agent evaluations**

Repeat the isolated Codex and Claude scenarios from Step 2 with the generated Skill against the same hermetic fake-`gh`/temporary-template fixture. Require both hosts to stop before the fake POST without the exact Preview confirmation, route the verified fixture checkout to Build KG exactly once, require a fresh confirmation before any bootstrap commit/push, and expose no credential. This proves instruction following without claiming a live template release exists; Task 13 alone proves the real native API/tag/Template-mode path. Keep transcripts outside Git and append only non-secret receipts to `docs/testing.md`.

- [ ] **Step 7: Commit the complete creation slice**

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills docs/testing.md .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: create instances through the template API"
```

### Task 6: Implement release-path inspection and migration resolution

**Files:**

- Add: `schemas/engine-update-advisory.schema.json`
- Add: `schemas/engine-migration-document.schema.json`
- Add: `tools/engine-update.ts`
- Modify: `tools/engine-cli.ts`
- Add: `tools/update-advisory.ts`
- Add: `tools/migrations.ts`
- Modify: `tools/cc.ts`
- Add: `tests/helpers/engine-update-fixture.ts`
- Add: `tests/engine-update.test.ts`
- Add: `tests/engine-update-cli.test.ts`

**Interfaces:**

- Consumes: Task 1 `EngineProvenance`, Task 2 verified release/registry, and Task 4 target fingerprint.
- Produces: advisory and verified status unions, `EngineReleaseIdentity`, `MigrationEdge`, `MigrationRegistry`, `MigrationDocument`, `buildEngineUpdateAdvisory()`, `compareEngineUpdateAdvisory()`, `validateMigrationRegistry()`, `resolveUniqueMigrationPath()`, `inspectEngineUpdate()`, delivery-only `tools/engine-cli.ts`, and the verified read-only CLI used by later tasks.

- [ ] **Step 1: Define status and graph behavior in red tests**

Expose every public type used by this and later tasks:

```ts
export type EngineReleaseIdentity = {
  repository: string;
  version: string;
  release_digest: `sha256:${string}`;
};

export type MigrationEdge = {
  id: string;
  from: EngineReleaseIdentity;
  to: EngineReleaseIdentity;
  document: `./engine/migrations/${string}.json`;
  document_digest: `sha256:${string}`;
  write_scopes: ["manifest"];
};

export type MigrationRegistry = {
  schema_version: "1.0.0";
  edges: MigrationEdge[];
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ManifestMutationPointer = "/schema_version";
export type ManifestTestPointer =
  | ManifestMutationPointer
  | "/repository_role"
  | "/provenance/engine/repository"
  | "/provenance/engine/version"
  | "/provenance/engine/release_digest";

export type JsonPatch =
  | {
      op: "add" | "replace";
      path: ManifestMutationPointer;
      value: JsonValue;
    }
  | { op: "test"; path: ManifestTestPointer; value: JsonValue };

export type MigrationOperation = {
  kind: "manifest-json-patch";
  path: "./coffee-chat.json";
  patch: JsonPatch[];
};

export type MigrationDocument = {
  schema_version: "1.0.0";
  id: string;
  operations: MigrationOperation[];
};

export type MigrationFileOperation = {
  path: "./coffee-chat.json";
  before: Buffer;
  after: Buffer;
  scope: "manifest";
};

export type EngineUpdateAdvisory = {
  schema_version: "1.0.0";
  repository: string;
  target: EngineReleaseIdentity;
  registry_digest: `sha256:${string}`;
  reference_schemas: {
    release: BoundUpdaterReference<"./references/engine-release.schema.json">;
    migration_registry: BoundUpdaterReference<"./references/engine-migration-registry.schema.json">;
    advisory: BoundUpdaterReference<"./references/engine-update-advisory.schema.json">;
    migration_document: BoundUpdaterReference<"./references/engine-migration-document.schema.json">;
  };
  candidates: Array<{
    current: EngineReleaseIdentity;
    migration_edge_ids: string[];
  }>;
};

export type BoundUpdaterReference<Path extends `./references/${string}.schema.json`> = {
  path: Path;
  digest: `sha256:${string}`;
};

export type AdvisoryUpdateStatus =
  | { status: "current"; current: EngineProvenance }
  | {
      status: "review_candidate_available";
      current: EngineProvenance;
      target: EngineReleaseIdentity;
      migration_edge_ids: string[];
    }
  | { status: "unknown"; reason_code: string }
  | { status: "incompatible"; reason_code: string };

export type VerifiedEngineUpdateStatus =
  | { status: "current"; current: EngineProvenance }
  | {
      status: "update_available";
      current: EngineProvenance;
      target: EngineProvenance;
      migration_path: MigrationEdge[];
      documents: MigrationDocument[];
    }
  | { status: "unknown"; reason_code: string }
  | { status: "incompatible"; reason_code: string };

export type InspectEngineUpdateInput = {
  target_root: string;
  source_root: string;
};

export type EngineUpdateDependencies = {
  read_file: (path: string) => Promise<Buffer>;
  lstat: (path: string) => Promise<{ mode: bigint; isSymbolicLink(): boolean }>;
  run_git_readonly: (cwd: string, args: string[]) => Promise<string>;
};

export async function inspectEngineUpdate(
  input: InspectEngineUpdateInput,
  dependencies: EngineUpdateDependencies,
): Promise<VerifiedEngineUpdateStatus>;
```

Use temporary synthetic releases `1.1.0` and `1.1.1` assembled by `tests/helpers/engine-update-fixture.ts`. Test:

- exact advisory target is `current`;
- one advisory-table entry is `review_candidate_available` without reading a migration document;
- exact verified source release is `current`;
- one verified forward edge plus documents is `update_available`;
- SemVer increase without an edge is `unknown`;
- two possible paths are `unknown`;
- cycles, missing documents, changed document digest, repository mismatch, and invalid release digest are `incompatible`;
- same version/different digest is `incompatible`;
- an old instance without provenance is `unknown`, never guessed;
- advisory comparison and verified inspect make no writes, ref changes, fetches, or network calls;
- advisory generation binds exact release/registry/advisory/migration-document schema paths and digests; local discovery detects any changed byte in the package marker, three discovery objects, or their three discovery schemas, while migration-document schema verification remains Review-only.

Add malicious-document regressions for unsupported operation names, executable/module paths, any target other than `./coffee-chat.json`, `remove`/`move`/`copy`, escaped or aliased pointers, mutation outside `/schema_version`, tests outside the five exact pointers, knowledge/Authored/generated targets, custom JSON values, and process/network requests. Assert the migration evaluator receives only an immutable manifest Buffer/parsed value and returns at most one manifest operation; the process/network spies are never invoked. Advisory tests distinguish integrity failures (`incompatible`) from missing/unsupported ancestry (`unknown`) with stable reason codes.

Run:

```bash
npm test -- tests/engine-update.test.ts tests/engine-update-cli.test.ts
```

Expected red: the engine-update modules and CLI grammar do not exist.

- [ ] **Step 2: Implement strict graph resolution**

In `tools/migrations.ts`, expose:

```ts
export function validateMigrationRegistry(
  registry: unknown,
  release: EngineReleaseManifest,
): Diagnostic[];

export function resolveUniqueMigrationPath(
  registry: MigrationRegistry,
  current: EngineReleaseIdentity,
  target: EngineReleaseIdentity,
): MigrationEdge[] | undefined;

export function buildEngineUpdateAdvisory(
  release: EngineReleaseManifest,
  registry: MigrationRegistry,
  schemas: {
    release: Buffer;
    migration_registry: Buffer;
    advisory: Buffer;
    migration_document: Buffer;
  },
): EngineUpdateAdvisory;

export function compareEngineUpdateAdvisory(
  current: EngineProvenance,
  advisory: EngineUpdateAdvisory,
): AdvisoryUpdateStatus;

export function evaluateMigrationDocument(
  manifest: Buffer,
  edge: MigrationEdge,
  document: MigrationDocument,
): MigrationFileOperation[];
```

Use exact `(repository, version, release_digest)` identity. Traverse only forward SemVer edges, require one path, and validate every document digest before returning it. Do not choose a shortest path from ambiguous alternatives. `evaluateMigrationDocument()` parses strict JSON data only, has no filesystem/process/network dependency, requires `write_scopes: ["manifest"]`, permits mutation only at `/schema_version`, permits `test` only at the closed pointer union above, and returns one complete in-memory manifest result. The updater derives the target `/provenance/engine` and engine lock from verified release observations and derives `/plugin/version` only from the package-content contract; migration data controls neither. Engine file moves/additions/deletions are derived only from old/new release inventories. It never imports or runs migration code.

- [ ] **Step 3: Run the graph and declarative evaluator green**

Run:

```bash
npm test -- tests/engine-update.test.ts -t "advisory|migration registry|manifest document"
```

Expected green: unique exact paths resolve, Unknown and Incompatible remain distinct, and no document can name a knowledge/generated/unmanaged path.

- [ ] **Step 4: Add the read-only CLI**

Parse exactly:

```text
npm run cc -- engine update inspect --target <path> --source <verified-engine-checkout> --format human|json
```

The managed `tools/cc.ts` reads the local manifest role without importing updater types. It rejects `engine update` in an instance checkout; in an engine checkout it uses the Task 2 argument-array subprocess route to `tools/engine-cli.ts` and propagates the exact exit code. `tools/engine-cli.ts` is delivery-class and owns all static imports of release/update/migration/publication modules. Test that deleting every delivery path leaves the surviving dispatcher, instance generate/check, validate, Build KG, typecheck, and instance tests functional.

Exit `0` when inspection itself completes, including `current`, `update_available`, `unknown`, or `incompatible`; exit `1` for malformed/invalid local contracts that prevent a status result; exit `2` when execution is unavailable. JSON stdout is machine-only and uses stable `reason_code` values.

- [ ] **Step 5: Run the complete inspection slice and commit**

Run focused tests and typecheck.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: inspect verified engine update paths"
```

### Task 7: Extract the atomic transaction without behavior change

**Files:**

- Add: `tools/transaction.ts`
- Modify: `tools/candidate.ts`
- Add: `tests/transaction.test.ts`
- Modify: `tests/task-3-candidate.test.ts`
- Modify: `tests/make-mine-acceptance.test.ts`

**Interfaces:**

- Consumes: the already-tested Candidate filesystem transaction embedded in `tools/candidate.ts`.
- Produces: `AtomicFileOperation`, `AtomicTransactionReceipt`, and `applyAtomicFileTransaction()` with unchanged Candidate behavior for Task 8.

- [ ] **Step 1: Characterize the existing Candidate transaction**

Before moving code, add tests for successful replacement, deletion, preimage drift, checkpoint drift, journal cleanup, rollback, rollback failure receipt, symlink/path escape, candidate-buffer tampering, and process interruption recovery. The tests must pass against the existing Candidate implementation.

Run:

```bash
npm test -- tests/transaction.test.ts tests/task-3-candidate.test.ts tests/make-mine-acceptance.test.ts
```

Expected red only for the new direct transaction API; all existing Candidate behavior remains green.

- [ ] **Step 2: Extract one narrow reusable primitive**

Expose:

```ts
export type AtomicFileOperation = {
  path: string;
  before: Buffer | null;
  after: Buffer | null;
  mode?: "100644" | "100755";
};

export type TransactionCheckpoint =
  | "before-journal"
  | "before-each-swap"
  | "after-each-swap"
  | "before-cleanup";

export type AtomicTransactionReceipt = {
  status: "applied" | "rolled_back" | "partial_apply_result";
  changed_paths: string[];
  restored_paths: string[];
  journal_path?: string;
};

export async function applyAtomicFileTransaction(input: {
  root: string;
  journal_root: string;
  operations: AtomicFileOperation[];
  checkpoint: (name: TransactionCheckpoint) => Promise<void>;
}): Promise<AtomicTransactionReceipt>;
```

Move only already-tested filesystem transaction logic. Candidate-specific schema, Source checks, date checks, fingerprint checks, setup effects, Preview, and receipt construction stay in `candidate.ts`. Preserve byte-for-byte Candidate behavior and error codes.

Run the entire Candidate suite, typecheck, and `git diff --check`.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "refactor: share the verified file transaction"
```

### Task 8: Prepare and apply engine updates in an isolated worktree

**Files:**

- Modify: `tools/engine-update.ts`
- Modify: `tools/migrations.ts`
- Modify: `tools/engine-cli.ts`
- Modify: `tools/snapshot.ts`
- Add: `schemas/engine-update-candidate.schema.json`
- Add: `schemas/engine-update-preview.schema.json`
- Add: `schemas/engine-update-receipt.schema.json`
- Add: `schemas/engine-review-setup-preview.schema.json`
- Add: `schemas/engine-review-setup-receipt.schema.json`
- Add: `tests/engine-update-acceptance.test.ts`
- Add: `tests/engine-review-setup.test.ts`
- Add: `tests/engine-review-setup-skill.test.ts`
- Modify: `tests/engine-update.test.ts`
- Modify: `tests/engine-update-cli.test.ts`
- Modify: `tests/gitleaks-contracts.test.ts`

**Interfaces:**

- Consumes: Tasks 1-2 provenance/release/lock, Task 4 fingerprint, Task 6 migration path, and Task 7 atomic transaction.
- Produces: strict setup Preview/Receipt contracts, the agent-native setup test contract, `EngineUpdatePreview`, `EngineUpdateCandidateManifest`, the discriminated `EngineUpdateReceipt`, `InstanceKnowledgeSemantics`, `extractKnowledgeSemantics()`, `prepareEngineUpdate()`, `applyEngineUpdate()`, and exact prepare/apply files and CLI behavior consumed by Task 9.

- [ ] **Step 1: Lock the Preview and digest contract in tests**

Define:

```ts
export type EngineSourceFingerprint = {
  real_path: string;
  origin_url: string;
  source_commit: string;
  source_tree: string;
  release_digest: `sha256:${string}`;
  registry_digest: `sha256:${string}`;
  package_lock_digest: `sha256:${string}`;
};

export type EngineReviewSetupGitEffect = {
  kind: "git-checkout";
  command: string[];
  network_hosts: string[];
  writes: string[];
};

export type EngineReviewSetupNpmEffect = {
  kind: "npm-ci";
  command: ["npm", "ci", "--ignore-scripts"];
  network_hosts: [string];
  writes: ["node_modules/**"];
};

export type EngineReviewSetupEffect =
  | EngineReviewSetupGitEffect
  | EngineReviewSetupNpmEffect;

export type EngineReviewSetupPreview = {
  schema_version: "1.0.0";
  setup_digest: `sha256:${string}`;
  source: {
    repository: string;
    source_ref: string;
    source_commit: string;
    release_digest: `sha256:${string}`;
    registry_digest: `sha256:${string}`;
    package_lock_digest: `sha256:${string}`;
  };
  checkout: {
    path: string;
    node_version: "24.5.0";
    npm_version: "11.5.1";
    receipt_path: string;
  };
  effects: [EngineReviewSetupGitEffect, EngineReviewSetupNpmEffect];
};

export type EngineReviewSetupCommandResult = {
  command: string[];
  exit_code: number;
  stdout_digest: `sha256:${string}`;
  stderr_digest: `sha256:${string}`;
};

export type CompletedEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: `sha256:${string}`;
  status: "completed";
  source: EngineReviewSetupPreview["source"];
  checkout_path: string;
  observations: {
    source_commit: string;
    source_tree: string;
    release_digest: `sha256:${string}`;
    registry_digest: `sha256:${string}`;
    package_lock_digest: `sha256:${string}`;
    node_version: "24.5.0";
    npm_version: "11.5.1";
    registry_host: string;
    writes: ["node_modules/**"];
  };
  command_results: [EngineReviewSetupCommandResult, EngineReviewSetupCommandResult];
  completed_effects: ["git-checkout", "npm-ci"];
};

export type InvalidatedEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: `sha256:${string}`;
  status: "invalidated";
  reason_codes: string[];
  completed_effects: [];
};

export type PartialEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: `sha256:${string}`;
  status: "partial_setup_result";
  completed_effects: [] | ["git-checkout"];
  checkout_path?: string;
  command_results: EngineReviewSetupCommandResult[];
  recovery: string[];
};

export type EngineReviewSetupReceipt =
  | CompletedEngineReviewSetupReceipt
  | InvalidatedEngineReviewSetupReceipt
  | PartialEngineReviewSetupReceipt;

export type EngineSetupObservation = {
  kind: "npm-ci";
  setup_digest: `sha256:${string}`;
  setup_receipt_digest: `sha256:${string}`;
  cwd: string;
  command: ["npm", "ci", "--ignore-scripts"];
  node_version: "24.5.0";
  npm_version: "11.5.1";
  lockfile_digest: `sha256:${string}`;
  registry_host: string;
  writes: [string];
  exit_code: 0;
  stdout_digest: `sha256:${string}`;
  stderr_digest: `sha256:${string}`;
};

export type PrepareCheck = {
  name: string;
  status: "passed" | "blocked";
  diagnostic_codes: string[];
};

export type InstancePreservationLedger = {
  before_semantic_digest: `sha256:${string}`;
  after_semantic_digest: `sha256:${string}`;
  fields: Array<{
    pointer: string;
    before_digest: `sha256:${string}`;
    after_digest: `sha256:${string}`;
    status: "preserved";
  }>;
};

export type EngineUpdatePreview = {
  schema_version: "1.0.0";
  update_digest: `sha256:${string}`;
  target_fingerprint: TargetFingerprint;
  source_fingerprint: EngineSourceFingerprint;
  current_engine: EngineProvenance;
  target_engine: EngineProvenance;
  migration_path: MigrationEdge[];
  worktree_plan: {
    branch_name: string;
    path: string;
    base_commit: string;
    empty_hooks_path: string;
    empty_hooks_path_digest: `sha256:${string}`;
    effective_config_digest: `sha256:${string}`;
    worktree_argv: ["-c", string, "worktree", "add", "--no-checkout", "-b", string, string, string];
    tree_materialization: "ls-tree-cat-file";
    filters: "custom-filters-rejected";
  };
  receipt_plan: { path: string };
  setup_observations: EngineSetupObservation[];
  validation_commands: string[];
  prepare_checks: PrepareCheck[];
  changed_paths: Array<{
    path: string;
    change: "create" | "update" | "delete";
    ownership: "engine" | "manifest" | "projection";
    before_digest?: `sha256:${string}`;
    after_digest?: `sha256:${string}`;
    before_mode?: "100644" | "100755";
    after_mode?: "100644" | "100755";
  }>;
  conflicts: Array<{
    path: string;
    expected_digest: `sha256:${string}`;
    expected_mode: "100644" | "100755";
    actual:
      | {
          state: "file";
          digest: `sha256:${string}`;
          mode: "100644" | "100755";
        }
      | { state: "missing" | "symlink" | "other" };
  }>;
  preservation: InstancePreservationLedger;
  instance_plugin_version: {
    before: string;
    after: string;
    before_content_digest: `sha256:${string}`;
    after_content_digest: `sha256:${string}`;
    reason: "unchanged-package" | "distributable-package-changed";
  };
  validation: { status: "passed" | "blocked" };
};

export type EngineUpdateCandidateFile = {
  candidate_path: `./files/${string}`;
  target_path: `./${string}`;
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineUpdateCandidateManifest = {
  schema_version: "1.0.0";
  update_digest: `sha256:${string}`;
  preview: Omit<EngineUpdatePreview, "update_digest">;
  proposed_files: EngineUpdateCandidateFile[];
  deletions: Array<{
    target_path: `./${string}`;
    before_digest: `sha256:${string}`;
    before_mode: "100644" | "100755";
  }>;
  support_files: Array<{
    path: `./schemas/${string}.json`;
    digest: `sha256:${string}`;
  }>;
};

export type EngineUpdateCommandResult = {
  command: string;
  exit_code: number;
  stdout_digest: `sha256:${string}`;
  stderr_digest: `sha256:${string}`;
};

export type EngineUpdateReceiptCommon = {
  schema_version: "1.0.0";
  update_digest: `sha256:${string}`;
  base_commit: string;
  current_engine: EngineProvenance;
  target_engine: EngineProvenance;
  source_fingerprint: EngineSourceFingerprint;
  migration_edge_ids: string[];
  changed_paths: string[];
  preservation: InstancePreservationLedger;
  command_results: EngineUpdateCommandResult[];
};

export type AppliedEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "applied";
  branch_name: string;
  worktree_path: string;
  result_tree: {
    git_tree_sha: string;
    inventory_digest: `sha256:${string}`;
    base_index_tree_sha: string;
    unstaged_diff_digest: `sha256:${string}`;
    changed_paths: string[];
  };
};

export type InvalidatedEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "invalidated";
  reason_codes: string[];
  completed_steps: [];
};

export type PartialEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "partial_apply_result";
  branch_name?: string;
  worktree_path?: string;
  completed_steps: Array<"branch-created" | "worktree-created" | "files-applied">;
  recovery: string[];
};

export type EngineUpdateReceipt =
  | AppliedEngineUpdateReceipt
  | InvalidatedEngineUpdateReceipt
  | PartialEngineUpdateReceipt;

export type PrepareEngineUpdateInput = {
  target_root: string;
  source_root: string;
  out_dir: string;
  setup_receipt_path: string;
  receipt_path: string;
};

export type ApplyEngineUpdateInput = {
  target_root: string;
  candidate_dir: string;
  approval_digest: `sha256:${string}`;
  receipt_path: string;
};

export type CommandResult = {
  exit_code: number;
  stdout: Buffer;
  stderr: Buffer;
};

export type EngineUpdateRuntime = {
  read_file: (path: string) => Promise<Buffer>;
  lstat: EngineUpdateDependencies["lstat"];
  run_git: (input: {
    cwd: string;
    args: string[];
    env?: Readonly<Record<string, string>>;
    stdin?: Buffer;
  }) => Promise<CommandResult>;
  run_command: (cwd: string, argv: string[]) => Promise<CommandResult>;
  now: () => Date;
};

export function prepareEngineUpdate(
  input: PrepareEngineUpdateInput,
  runtime: EngineUpdateRuntime,
): Promise<EngineUpdatePreview>;

export function applyEngineUpdate(
  input: ApplyEngineUpdateInput,
  runtime: EngineUpdateRuntime,
): Promise<EngineUpdateReceipt>;
```

The setup contract is independently strict and machine-readable. `engine-review-setup-preview.schema.json` rejects unknown keys, duplicate JSON keys, comments, trailing commas, non-JSON values, unsafe paths, and unbounded commands. `setup_digest` is SHA-256 of the RFC 8785 canonical digest-free setup data with domain `coffee-chat-engine-review-setup/v1`; the top-level `setup_digest` is omitted from that input and added only when the exact Preview is rendered. The rendered `setup-preview.json` and `setup-preview.md` therefore never hash their own digest field. `engine-review-setup-receipt.schema.json` is a discriminated union of `completed`, `invalidated`, and `partial_setup_result`; the latter permits only `[]` or `["git-checkout"]` as `completed_effects`. The completed arm must carry `setup_digest`, source/ref/commit/tree/release/registry/lockfile observations, Node/npm versions, registry host, `node_modules/**` write, two non-secret command-result digests, and `["git-checkout","npm-ci"]`. A setup receipt is valid only when its literal path, digest, source, checkout, command argv, and observations recheck immediately before engine prepare. Setup has no public engine CLI or target-engine setup function: the installed generic updater Skill is the bootstrap authority and uses host-provided Git/GitHub/npm tools after literal digest approval. Its static contract test verifies the exact no-checkout/isolated-config/empty-Hooks/filter-rejection effect, byte rechecks, command-result observations, and receipt write; the Skill then invokes the target checkout's normal `engine update prepare` CLI. The Git effect is exact: use `git -c core.hooksPath=<empty> clone --no-checkout --origin origin <repository> <checkout>` (or an equivalent empty-repository `fetch` with the same explicit config), set `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, and an empty `core.hooksPath`, verify the source commit/release/registry/package-lock bytes and reject symlinks, submodules, and clean/smudge/process filters before materializing any file. Only then run `npm ci --ignore-scripts`; all command argv, hosts, paths, and write globs are bound in Preview and rechecked in apply.

The canonical update digest binds domain `coffee-chat-engine-update/v1` plus `candidate-manifest.json` with only its top-level `update_digest` omitted. That manifest contains the digest-free Preview, exact proposed canonical/generated file inventory and bytes under `files/`, exact deletions, target/source fingerprints, target source commit, release/registry/document digests, migration order, complete worktree and receipt plans, preservation ledger, validation commands, prepare-check results, the separately approved setup observations/receipt digest, and the packaged schema digests. Worktree verification command results do not exist yet and belong only to the later update receipt. Render `preview.json` and `preview.md` only after computing the digest; apply schema-validates `candidate-manifest.json`, re-renders both Preview files, and byte-compares them instead of hashing their self-referential bytes.

Preserve the personal plugin and marketplace names. Compute a version-independent content digest over every distributable package byte, excluding ownership markers and normalizing plugin-version fields. If any Skill, method, manifest, packaged provenance, or other distributable byte changes, propose the deterministic next patch of the current personal `plugin.version`; otherwise preserve it. Bind both content digests, both versions, and the reason into Preview. Never copy the engine version into the personal plugin version.

Tests must prove prepare leaves target bytes, Git refs, Hooks, remotes, and plugin state unchanged; produces byte-identical Candidate output twice; and marks a modified engine-owned file as a non-applicable conflict while preserving it.

Run:

```bash
npm test -- tests/engine-update.test.ts tests/engine-update-cli.test.ts tests/engine-update-acceptance.test.ts
npm test -- tests/engine-review-setup.test.ts tests/engine-review-setup-skill.test.ts
```

Expected red: inspect exists, but prepare/apply and their schemas do not.

- [ ] **Step 2: Implement the semantic preservation projection**

Expose a schema-versioned normalized representation:

```ts
export type CanonicalProfileSemantics = {
  id: string;
  display_name: string;
  short_name: string;
  time_zone: string;
  repository_url: string;
  pages_url: string;
  plugin_name: string;
  marketplace_name: string;
  created_from: InstanceProvenance["created_from"];
};

export type CanonicalCitationSemantics = {
  url: string;
  title: string;
  published_on?: string;
  accessed_on?: string;
};

export type CanonicalNoteSemantics = {
  id: string;
  title: string;
  recorded_on: string;
  temporal_coverage: string;
  authored_body_digest: `sha256:${string}`;
  sources: CanonicalCitationSemantics[];
  entities: string[];
  internal_links: string[];
};

export type CanonicalEntitySemantics = {
  id: string;
  label: string;
  kind?: string;
  aliases: string[];
  same_as: string[];
};

export type InstanceKnowledgeSemantics = {
  instance_owned_manifest_digest: `sha256:${string}`;
  profile: CanonicalProfileSemantics;
  notes: CanonicalNoteSemantics[];
  entities: CanonicalEntitySemantics[];
  content_license_digest: `sha256:${string}`;
  forbidden_persisted_synthesis: [];
};

export function extractKnowledgeSemantics(
  graph: InstanceGraph,
): InstanceKnowledgeSemantics;
```

`InstanceGraph` is the existing validated instance graph exported by `tools/knowledge.ts`; do not introduce a second graph type.

Compute `instance_owned_manifest_digest` from canonical RFC 8785 manifest JSON after masking exactly the three engine-controlled locations: `/schema_version`, `/provenance/engine`, and `/plugin/version`. Require that digest to remain equal, which preserves otherwise easy-to-omit fields such as Profile identity/names/temporary state, time zone, repository/default branch, Pages URL, plugin name/description/marketplace namespace, paths, content metadata, and immutable `provenance.created_from`. Separately require equality for Note/Authored body/time/Source/entity/link fields, Entity identity/relationships, content-license bytes, and absence of persisted synthesis. The new `/provenance/engine` must equal the verified target release/source observation, and `/plugin/version` may change only when the bound version-independent personal-package content digest changes. This lifecycle release has no `knowledge-schema` migration scope, so before/after knowledge bytes and normalized semantics must both remain unchanged. No engine migration may introduce or edit an authored claim.

- [ ] **Step 3: Run the semantic-preservation tests**

Run:

```bash
npm test -- tests/engine-update.test.ts -t "preserves normalized knowledge semantics"
```

Expected: PASS for fixtures whose knowledge is unchanged; FAIL-safe diagnostics for any changed Profile, Authored body, date, Source, Entity relation, content license, knowledge representation, or persisted synthesis.

- [ ] **Step 4: Implement read-only prepare preflight**

Parse exactly:

```text
npm run cc -- engine update prepare --target <instance-path> --source <engine-path> --setup-receipt <external-setup-receipt.json> --receipt <future-update-receipt-path> --out <external-empty-directory>
```

Require the source checkout's credential-free official origin, resolved `source_ref` commit, release/registry/documents, and every managed/delivery byte to verify before executing any delivery code. Require `--out` to be outside source and target, non-existent or empty, and not a symlink. Resolve target/source fingerprints, old lock, generated marker, exact current preimages, unique migration path, and all conflicts before writing the external directory.

Require the external setup receipt produced by Task 10's separately approved Review Setup Preview. Re-hash it, recheck its official source/ref/commit, clone path, Node/npm versions, lockfile/registry, exact commands/destinations, and successful non-secret command-result digests; then bind it as `setup_observations`. Prepare never performs the clone or `npm ci` retrospectively. Require `--receipt` to be the same future external path embedded in `receipt_plan`, outside source/target/Candidate/worktree and not yet present. No package is installed globally.

- [ ] **Step 5: Materialize the external update Candidate**

Evaluate declarative migration documents only over the in-memory root manifest, combine that single scoped result with old/new-inventory-derived engine-source replacements and generated projections, compute package content/version changes, build the preservation ledger, and write exactly `candidate-manifest.json`, `preview.json`, `preview.md`, `files/**`, and `schemas/{engine-update-candidate,engine-update-preview,engine-update-receipt}.schema.json` under `--out` only. Compute `update_digest` with the non-self-referential contract above and write Preview files last. On success, prepare writes one JSON line to stdout containing `{ "status": "prepared", "candidate_dir", "update_digest", "preview_json", "preview_markdown" }`, writes no normal output to stderr, and exits `0`.

- [ ] **Step 6: Prove prepare is deterministic and read-only**

Run:

```bash
npm test -- tests/engine-update.test.ts -t "prepare"
npm test -- tests/engine-update-cli.test.ts -t "prepare"
```

Expected: PASS; two fresh output directories are byte-identical, while the instance bytes, refs, remotes, Hooks, and plugin state remain unchanged. A collision at a new managed path, a missing/deleted old managed path, a tampered generated path, or a symlink produces a blocked Preview and no target write.

- [ ] **Step 7: Implement apply approval and late preflight**

Parse exactly:

```text
npm run cc -- engine update apply --target <instance-path> --dir <candidate-path> --approve <sha256:digest> --receipt <external-receipt-path>
```

`--receipt` must literally equal the Candidate-bound `receipt_plan.path` and remain a new non-symlink file path outside the target, source, Candidate, and isolated worktree. After literal digest comparison, re-read and re-hash the Candidate, source release/registry/documents, target/source fingerprints, current managed/generated preimages, knowledge semantics, branch availability, setup observations, and destination worktree path. On exact equality, create only the bound branch `coffee-chat/engine-v<target-version>` and isolated worktree from the bound base commit. Worktree creation is owned exclusively by Task 8: invoke `git -c core.hooksPath=<empty> worktree add --no-checkout -b <branch> <path> <base>` with `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, a verified empty Hooks directory, and the bound effective-config digest; materialize the base only from `git ls-tree`/`git cat-file`, rejecting symlinks, submodules, and custom clean/smudge/process filters. Once a valid Candidate has been loaded, every terminal state atomically writes exactly one schema-valid receipt to that path and emits the same receipt as one compact JSON line on stdout.

- [ ] **Step 8: Apply and verify only inside the isolated worktree**

Translate `MigrationFileOperation` values into `AtomicFileOperation` values, apply through `applyAtomicFileTransaction`, write the new provenance/lock, regenerate projections, and rerun the semantic ledger. Then run exactly:

Run in the worktree:

```text
npm ci --ignore-scripts
npm run cc -- validate --snapshot worktree --format json
npm run cc -- generate --check
npm run cc -- check --snapshot worktree
npm run typecheck
npm test
npm run gitleaks:scan
```

The applied receipt is external and requires the exact worktree/branch plus a virtual Git result tree computed without changing the real index: Git tree SHA, sorted path/mode/byte inventory digest, unchanged base-index tree, unstaged-diff digest, and changed paths. It also includes current/target identity, preservation result, and command-result digests without secret values. Task 8 deliberately leaves the verified update uncommitted and unstaged; Task 9 only rechecks this receipt-bound worktree/branch/HEAD/base-index/result-tree state and stages reviewed blobs in a temporary index after its separate publication approval. Invalidated and partial variants carry their required reason/completed-step/recovery evidence and cannot masquerade as `applied`.

Both CLI commands use exit `0` only for `prepared`/`applied`, exit `1` for schema/validation/invalidation, and exit `2` for inability to execute or `partial_apply_result`. Machine JSON is stdout-only; stderr contains only stable non-secret diagnostics or recovery text. A failure before a Candidate can be parsed or before a receipt destination can be safely opened exits `2` without inventing a receipt.

- [ ] **Step 9: Test every late race and rollback boundary**

Inject drift immediately before worktree creation and immediately before file transaction for origin, common-dir inode, base commit, manifest, lock, managed/generated bytes, migration document, Candidate bytes, branch ref, Note body, Source date, and worktree destination. Assert zero authoritative target writes and no misleading success. Inject failures during copy, declarative evaluation, generation, verification, and journal swap; assert rollback or explicit partial receipt. Assert the default branch and original worktree remain byte-identical in every case.

- [ ] **Step 10: Run the complete update slice and commit**

Run the focused suite and full tests.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: prepare approved engine update branches"
```

### Task 9: Bind commit, push, and PR to a publication digest

**Files:**

- Add: `schemas/engine-update-publication-preview.schema.json`
- Add: `schemas/engine-update-publication-candidate.schema.json`
- Add: `schemas/engine-update-publication-receipt.schema.json`
- Add: `schemas/engine-update-publication-journal.schema.json`
- Add: `tools/engine-publication.ts`
- Modify: `tools/engine-cli.ts`
- Add: `tests/engine-publication.test.ts`
- Add: `tests/engine-publication-cli.test.ts`

**Interfaces:**

- Consumes: Task 8 `AppliedEngineUpdateReceipt`, its receipt-bound uncommitted/unstaged isolated worktree, bound update branch, and exact virtual result tree.
- Produces: `EnginePublicationPreview`, `EnginePublicationCandidateManifest`, the discriminated `EnginePublicationReceipt`, `prepareEnginePublication()`, `applyEnginePublication()`, and exact publication Candidate/receipt CLI behavior used by the updater Skill.

- [ ] **Step 1: Write failing publication-binding tests**

Define every public type:

```ts
export type EnginePublicationPreview = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  repository: {
    id: string;
    origin_url: string;
    remote: "origin";
  };
  base: { branch: string; remote_sha: string };
  head: {
    branch: string;
    pre_commit_head_sha: string;
    push_refspec: string;
  };
  worktree: {
    path: string;
    status: "matches-update-receipt";
    git_tree_sha: string;
    inventory_digest: `sha256:${string}`;
    base_index_tree_sha: string;
    unstaged_diff_digest: `sha256:${string}`;
    changed_paths: string[];
  };
  git_isolation: {
    existing_worktree: "created-and-materialized-by-task-8";
    empty_hooks_path: string;
    empty_hooks_path_digest: `sha256:${string}`;
    effective_config_digest: `sha256:${string}`;
    temporary_index: string;
    filters: "custom-filters-rejected";
  };
  update_receipt: {
    path: "./update-receipt.json";
    digest: `sha256:${string}`;
  };
  receipt_plan: {
    path: string;
    journal_path: string;
  };
  commit: {
    parent_sha: string;
    message: string;
    author_name: string;
    author_email: string;
    committer_name: string;
    committer_email: string;
    authored_at: string;
    committed_at: string;
    signing: "none";
  };
  pull_request: {
    title: string;
    body: string;
    merge: false;
  };
  workflow_effects: Array<{
    path: `./.github/workflows/${string}.${"yml" | "yaml"}`;
    event: "push" | "pull_request" | "pull_request_target" | "workflow_run" | "workflow_call";
    source: "result-tree" | "remote-base";
    source_commit: string;
    workflow_digest: `sha256:${string}`;
    filters_digest: `sha256:${string}`;
    triggered_by: string[];
    jobs: string[];
    permissions_digest: `sha256:${string}`;
    referenced_secret_names: string[];
    environment_names: string[];
  }>;
};

export type PrepareEnginePublicationInput = {
  worktree_root: string;
  update_receipt_path: string;
  publication_receipt_path: string;
  out_dir: string;
};

export type ApplyEnginePublicationInput = {
  candidate_dir: string;
  approval_digest: `sha256:${string}`;
  receipt_path: string;
};

export type ObservedPullRequest = {
  url: string;
  repository_id: string;
  state: "open";
  base: string;
  head: string;
  title: string;
  body: string;
};

export type EnginePublicationCandidateManifest = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  preview: Omit<EnginePublicationPreview, "publication_digest">;
  copied_update_receipt: {
    path: "./update-receipt.json";
    digest: `sha256:${string}`;
  };
  support_files: Array<{
    path: `./schemas/${string}.json`;
    digest: `sha256:${string}`;
  }>;
};

export type PublishedEnginePublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  status: "published";
  commit_sha: string;
  remote_head_sha: string;
  pull_request: ObservedPullRequest;
  completed_effects: ["commit", "push", "pull-request"];
};

export type InvalidatedEnginePublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  status: "invalidated";
  reason_codes: string[];
  completed_effects: [];
};

export type CommittedOnlyPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  status: "partial_remote_result";
  commit_sha: string;
  completed_effects: ["commit"];
  recovery: string[];
};

export type PushedPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  status: "partial_remote_result";
  commit_sha: string;
  remote_head_sha: string;
  completed_effects: ["commit", "push"];
  recovery: string[];
};

export type IndeterminatePublicationReceipt =
  | {
      schema_version: "1.0.0";
      publication_digest: `sha256:${string}`;
      status: "partial_remote_result";
      known_completed_effects: [];
      indeterminate_effect: "commit";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
      recovery: string[];
    }
  | {
      schema_version: "1.0.0";
      publication_digest: `sha256:${string}`;
      status: "partial_remote_result";
      known_completed_effects: ["commit"];
      indeterminate_effect: "push";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
      recovery: string[];
    }
  | {
      schema_version: "1.0.0";
      publication_digest: `sha256:${string}`;
      status: "partial_remote_result";
      known_completed_effects: ["commit", "push"];
      indeterminate_effect: "pull-request";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
      recovery: string[];
    };

export type FinalizationPendingPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  status: "partial_remote_result";
  commit_sha: string;
  remote_head_sha: string;
  pull_request: ObservedPullRequest;
  known_completed_effects: ["commit", "push", "pull-request"];
  indeterminate_effect: "receipt-finalization";
  returned_identifiers: Record<string, string>;
  observed_identifiers: Record<string, string>;
  recovery: string[];
};

export type PublicationEffectPrefix =
  | []
  | ["commit"]
  | ["commit", "push"]
  | ["commit", "push", "pull-request"];

export type PublicationJournalEffect =
  | "commit"
  | "push"
  | "pull-request"
  | "receipt-finalization";

export type PublicationAttemptState =
  | {
      phase: "attempting" | "indeterminate";
      known_completed_effects: [];
      effect: "commit";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
    }
  | {
      phase: "attempting" | "indeterminate";
      known_completed_effects: ["commit"];
      effect: "push";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
    }
  | {
      phase: "attempting" | "indeterminate";
      known_completed_effects: ["commit", "push"];
      effect: "pull-request";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
    }
  | {
      phase: "attempting" | "indeterminate";
      known_completed_effects: ["commit", "push", "pull-request"];
      effect: "receipt-finalization";
      returned_identifiers: Record<string, string>;
      observed_identifiers: Record<string, string>;
    };

export type EnginePublicationJournal = {
  schema_version: "1.0.0";
  publication_digest: `sha256:${string}`;
  candidate_bytes_digest: `sha256:${string}`;
  receipt_path: string;
  journal_path: string;
  state:
    | { phase: "intent"; known_completed_effects: [] }
    | PublicationAttemptState
    | {
        phase: "committed";
        known_completed_effects: ["commit"];
        commit_sha: string;
      }
    | {
        phase: "pushed";
        known_completed_effects: ["commit", "push"];
        commit_sha: string;
        remote_head_sha: string;
      }
    | {
        phase: "pull-request-created";
        known_completed_effects: ["commit", "push", "pull-request"];
        commit_sha: string;
        remote_head_sha: string;
        pull_request: ObservedPullRequest;
      }
    | {
        phase: "finalized";
        receipt_digest: `sha256:${string}`;
      };
};

export type EnginePublicationReceipt =
  | PublishedEnginePublicationReceipt
  | InvalidatedEnginePublicationReceipt
  | CommittedOnlyPublicationReceipt
  | PushedPublicationReceipt
  | IndeterminatePublicationReceipt
  | FinalizationPendingPublicationReceipt;

export type EnginePublicationDependencies = {
  run_git: (input: {
    cwd: string;
    args: string[];
    env?: Readonly<Record<string, string>>;
    stdin?: Buffer;
  }) => Promise<CommandResult>;
  observe_repository: (origin_url: string) => Promise<{
    id: string;
    default_branch: string;
    default_branch_sha: string;
    head_ref_sha?: string;
  }>;
  observe_pull_request: (input: {
    repository_id: string;
    base: string;
    head: string;
  }) => Promise<ObservedPullRequest | null>;
  create_pull_request: (input: {
    repository_id: string;
    base: string;
    head: string;
    title: string;
    body: string;
  }) => Promise<{ url: string }>;
};

export function prepareEnginePublication(
  input: PrepareEnginePublicationInput,
  dependencies: EnginePublicationDependencies,
): Promise<EnginePublicationPreview>;

export function applyEnginePublication(
  input: ApplyEnginePublicationInput,
  dependencies: EnginePublicationDependencies,
): Promise<EnginePublicationReceipt>;
```

Test drift in repository ID/origin, base SHA, pre-commit HEAD/expected parent, receipt-bound uncommitted diff/index, result tree, copied update receipt, author/committer identities and fixed dates, signing policy, head ref, message, PR title/body, named workflow effects, isolation plan, and candidate bytes. Enumerate both workflow extensions, evaluate exact event action/branch/path filters, read push/pull-request/local-call workflows from the result tree, and read `pull_request_target` plus matching `workflow_run` cascades from the unchanged remote base SHA. Bind source revision/content/filter/permission digests, referenced secret names, and environment names. Every eligible workflow and job must declare explicit permissions; inherited repository Actions defaults are unsupported. Recursively include local reusable workflows and block non-local/dynamic reusable-workflow `jobs.<id>.uses` targets instead of pretending their effects are known. Test hostile Hooks and custom clean/smudge/process filters and prove none execute. Test ambiguous commit/push/PR failures and exact state-specific reconciliation. Assert `known_completed_effects` is only `[]`, `["commit"]`, `["commit","push"]`, or `["commit","push","pull-request"]`, and `indeterminate_effect` is exactly the next effect (including `receipt-finalization`). An observed PR counts as completed only when repository ID, open state, base, head, title, and body all equal the approved Preview. Assert exactly one child commit, no force push, no merge API call, no credential leak, and no implicit signing prompt.

- [ ] **Step 2: Run the publication tests and observe red**

Run:

```bash
npm test -- tests/engine-publication.test.ts tests/engine-publication-cli.test.ts
```

Expected red: publication schemas, functions, and CLI grammar do not exist.

- [ ] **Step 3: Implement read-only publication prepare**

Parse exactly:

```text
npm run cc -- engine update publish prepare --target <isolated-worktree> --update-receipt <update-receipt.json> --publication-receipt <future-publication-receipt-path> --out <external-empty-directory>
```

Require an `applied` Task 8 receipt. Copy its exact bytes to `--out/update-receipt.json`, bind the copy in `publication-candidate.json`, and derive current/target release, source commit/digests, migration IDs, changed paths, preservation digests, and verification results only from those bytes. Require the existing worktree to be the receipt branch with HEAD at the receipt base, the real index to equal the receipt's base-index tree, and its uncommitted/unstaged state to contain exactly the receipt-bound changed paths, virtual Git tree, inventory digest, and diff digest with no extras. Task 9 never calls `git worktree add`, recreates the branch, or rematerializes the base tree; it only rechecks the Task 8 receipt-bound worktree, branch, HEAD, empty Hooks/config/filter evidence, and result tree. Require the future publication receipt to be outside repository/worktree/Candidate and absent; derive and bind its sibling journal path. Bind `pre_commit_head_sha` and `commit.parent_sha`; both must equal the receipt base commit and unchanged remote base SHA. Read the credential-free origin/repository ID, require the remote head and matching PR to be absent, resolve and display both public author and committer names/emails, freeze author/committer dates, set `signing: "none"`, and render the exact commit message plus full PR title/body. Parse the approved result-tree workflow files and bind every job plus permission digest that the push or subsequent PR creation will trigger. Bind a `git_isolation` plan with `existing_worktree: "created-and-materialized-by-task-8"`, a verified empty Hooks directory/config digest, no custom clean/smudge/process filters, a temporary index path, and a plumbing-only staging/commit/push contract. Compute `publication_digest` over RFC 8785 canonical JSON with domain `coffee-chat-engine-publication/v1` plus `publication-candidate.json`, omitting only its top-level digest. Write exactly `publication-candidate.json`, `preview.json`, `preview.md`, `update-receipt.json`, and `schemas/{engine-update-publication-candidate,engine-update-publication-preview,engine-update-publication-receipt,engine-update-publication-journal}.schema.json` under `--out`; re-render rather than self-hash the two Preview files. Prepare emits one compact JSON line with status, directory, digest, and Preview paths and exits `0`.

- [ ] **Step 4: Implement digest-approved publication**

Parse exactly:

```text
npm run cc -- engine update publish apply --dir <publication-candidate> --approve <sha256:digest> --receipt <external-receipt-path>
```

Require `--receipt` to equal `receipt_plan.path` literally; derive the same sibling journal path and require equality with `receipt_plan.journal_path`. Both remain outside the repository/worktree/Candidate. Compute `candidate_bytes_digest` as SHA-256 of the exact UTF-8 bytes of `publication-candidate.json` (including its `publication_digest` and excluding no bytes); bind it in the journal and recheck it before every effect. Before the first effect, create the schema-valid journal with exclusive create, fsync the file and parent, and bind the Candidate/publication digest plus both paths. If that durable intent cannot be created, exit `2` with zero Git/remote effects. On a retry, accept an existing journal or final receipt only when every binding matches the same approved Candidate; reconcile its state rather than demanding the initial absence conditions again.

Re-read/re-render `publication-candidate.json` and byte-compare its copied update receipt before every effect. Before commit, require base HEAD, unchanged base index, and the exact receipt-bound uncommitted diff/result tree; repository ID/origin, remote base SHA, remote head/PR absence, author/committer identities and dates, signing policy, message, PR body, and bound workflow effects must still match. Re-read the bound `git_isolation` plan, verify the empty Hooks path/digest and config digest, prove no custom clean/smudge/process filter can run, and reject any hostile post-checkout/pre-commit/reference-transaction/pre-push/config change. Persist and fsync `attempting: commit`, create exactly one bound child with the plumbing contract below, reconcile it, then persist `committed`. Before push, reparse and match every push-triggered workflow, require the exact clean child state and absent remote head/PR, persist `attempting: push`, push the new ref with no force using the empty Hooks path and exact refspec, reconcile, and persist `pushed`. Before PR creation, reparse and match every pull-request/pull-request-target/cascade effect, require the same exact child, remote head equal to it, and only the PR absent, then persist `attempting: pull-request`; after the call, re-observe the complete PR and persist `pull-request-created` only when every bound field matches.

The plumbing contract is exact and consumes only the Task 8 worktree: never call `worktree add`, recreate the branch, or materialize the base again. Recheck the receipt-bound worktree path, branch, HEAD/base-index/result-tree digests, empty Hooks path, effective config, and filter rejection. Set a temporary `GIT_INDEX_FILE` with `git read-tree`; write reviewed blobs with `git hash-object -w --stdin` without `--path`, stage exact mode/blob pairs through `git update-index --cacheinfo`, and close with `git write-tree`. Run the staged validator and Gitleaks against that exact temporary index. Create the child with `git commit-tree` plus explicit author/committer environment, frozen dates, `-c commit.gpgSign=false`, and the exact parent/message; update only the bound branch through compare-and-swap `git update-ref`. Install the verified temporary index at the worktree-specific path and recheck a clean result. Push with `git -c core.hooksPath=<empty> push` and the exact non-force refspec after rechecking the credential-free URL/config digest. The test harness installs hostile post-checkout, pre-commit, reference-transaction, pre-push hooks and custom clean/smudge/process filters and asserts none execute or mutate state.

If an effect call is ambiguous and reconciliation is unavailable or inconclusive, persist `indeterminate`, emit the schema-valid indeterminate receipt on stdout, and stop without retrying the effect. Once all three remote effects are known complete, atomically write/fsync the final receipt before marking the journal finalized. A receipt rename/fsync failure emits `FinalizationPendingPublicationReceipt` on stdout with the complete observed commit/remote/PR record and leaves the journal resumable; a rerun performs no remote effect and only finalizes the receipt. If an exact final receipt already exists, validate and return it idempotently. Exit `0` only for a persisted `published` receipt, `1` for pre-effect `invalidated`, and `2` for inability to execute, indeterminate state, finalization pending, or another `partial_remote_result`; stderr remains stable and non-secret.

- [ ] **Step 5: Run focused publication tests and commit**

Run:

```bash
npm test -- tests/engine-publication.test.ts tests/engine-publication-cli.test.ts
npm run typecheck
git diff --check
```

Expected: PASS; no external effect occurs before literal publication-digest approval, and every late drift invalidates.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: bind engine update publication"
```

### Task 10: Add update-coffee-chat and AGENTS update discovery

**Files:**

- Add: `method/engine-update.md`
- Add: `skills/update-coffee-chat/SKILL.md`
- Add: `skills/update-coffee-chat/references/method.md` (generated)
- Add: `skills/update-coffee-chat/references/release.json` (generated)
- Add: `skills/update-coffee-chat/references/migration-registry.json` (generated)
- Add: `skills/update-coffee-chat/references/advisory.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-release.schema.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-migration-registry.schema.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-migration-document.schema.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-update-advisory.schema.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-review-setup-preview.schema.json` (generated)
- Add: `skills/update-coffee-chat/references/engine-review-setup-receipt.schema.json` (generated)
- Modify: `method/shared-method.md`
- Modify: `tools/artifact-inventory.ts`
- Modify: `tools/projections.ts`
- Modify: `tools/engine-cli.ts`
- Modify: `tests/helpers/skill-harness.ts`
- Modify: `tests/skill-contracts.test.ts`
- Modify: `tests/skill-evaluations.test.ts`
- Modify: `tests/engine-review-setup.test.ts`
- Modify: `tests/task-4-projections.test.ts`
- Modify: `tests/task-4-candidate-projections.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `docs/testing.md`
- Generate: `AGENTS.md`
- Generate: `CLAUDE.md`
- Generate: `plugins/coffee-chat/**`

**Interfaces:**

- Consumes: Task 2 release/registry, Task 6 precomputed advisory plus verified inspection, Task 8 local prepare/apply, and Task 9 publication prepare/apply.
- Produces: final `ENGINE_ONLY_SKILLS`, five-Skill generic engine package, three-Skill personal package, `update-coffee-chat`, and generated AGENTS advisory discovery used in Tasks 11-13.

- [ ] **Step 1: Add red router and updater evaluations**

Test generic engine plugin has exactly five Skills while a personal instance plugin has exactly three. Test generated instance AGENTS behavior:

```text
no generic updater available -> no update mention
exact advisory release -> no update mention
one exact advisory table entry -> offer "Review Coffee Chat update" and wait
invalid or missing path -> do not claim a safe update; explicit request returns Unknown
repository/digest integrity conflict -> report Incompatible only on explicit review
decline -> continue original Coffee Chat or task
```

The Vitest harness verifies static instruction and filesystem contracts; it does not claim to execute an agent. Fixtures pressure-test agents that try to fetch every session, use the stale repo-local updater, mutate after plugin install, overload Build KG update, skip Preview, accept a paraphrased approval, apply on the default branch, publish under the local update digest instead of a publication digest, merge automatically, or discard a modified engine file.

Run:

```bash
npm test -- tests/skill-contracts.test.ts tests/skill-evaluations.test.ts tests/task-4-projections.test.ts tests/plugin-lifecycle.test.ts
```

Expected red: there is no updater Skill, release reference, role-specific five/three Skill projection, or AGENTS discovery protocol.

- [ ] **Step 2: Write the updater Skill**

Use `superpowers:writing-skills`. The Skill must:

1. accept only an explicit authoritative instance checkout;
2. distinguish local inspect from later network/source verification;
3. use the generated advisory table only to offer review and never call it remotely verified; validate its exact four-schema path/digest bindings and package-marker preimages first, while deferring migration-document schema loading until Review;
4. when offering `Review Coffee Chat update`, disclose that choosing it authorizes only read-only official GitHub metadata/blob lookups and creation of one non-secret external setup-Preview file—no clone, fetch, dependency traffic, repository write, or ref change;
5. after the user chooses Review, resolve the exact official repository/ref/commit plus release/registry/document/lockfile bytes through read-only GitHub calls, choose an empty non-symlink temporary checkout and external setup-receipt path, and render strict `setup-preview.json` validated by `engine-review-setup-preview.schema.json`, binding every Git clone/fetch argument, network host, checkout path, Node/npm version, `npm ci --ignore-scripts`, registry host, lockfile digest, and `node_modules/**` write;
6. compute `setup_digest` from the RFC 8785 canonical digest-free setup data with domain `coffee-chat-engine-review-setup/v1` (omitting only the top-level digest field), render the exact setup Preview bytes from that data plus the digest, show both, and stop; only a later message containing that literal digest authorizes those setup effects; apply re-renders and byte-compares the Preview instead of hashing its self-referential bytes;
7. re-observe all remote/local setup values, then create the temporary checkout, verify every release managed/delivery byte plus registry/document/schema/lockfile digest using packaged schemas and local SHA-256/Git reads before executing checkout code, and run the approved `npm ci --ignore-scripts` only with the exact engine Node/npm versions;
8. atomically write a non-secret external `setup-receipt.json` validated by `engine-review-setup-receipt.schema.json`, containing the approved setup digest, source/checkout fingerprints, exact effect observations, and command-result digests; an invalidated or partial setup receipt is reported and never passed to prepare;
9. invoke the target engine checkout's `engine update prepare` with that setup receipt and a preselected future update-receipt path;
10. show the entire update Preview and stop;
11. accept only the exact update digest in a later message;
12. run isolated apply and show its receipt;
13. run `engine update publish prepare` with a preselected future publication-receipt path, show the complete publication Preview, and stop;
14. accept only the exact publication digest in a later message;
15. run publication apply, which commits the bound tree, pushes only the bound branch, and opens but never merges the bound PR;
16. reconcile from the external publication journal after any ambiguous result or receipt-finalization failure;
17. report every partial setup/remote effect and recovery path.

The Skill must not package or invoke its own stale runtime. It orchestrates GitHub CLI, Git, and the verified target engine checkout.

- [ ] **Step 3: Run the focused updater Skill contract**

Run:

```bash
npm test -- tests/skill-contracts.test.ts tests/skill-evaluations.test.ts -t "update-coffee-chat"
```

Expected green: the Skill remains read-only before review, requires the setup → update → publication three-stop sequence with three literal digests, uses the verified target checkout runtime, and never merges.

- [ ] **Step 4: Generate the thin router**

Replace the temporary creation-only surface with the final role contract:

```ts
export const ENGINE_ONLY_SKILLS = [
  "create-coffee-chat",
  "update-coffee-chat",
] as const;

export const ENGINE_PLUGIN_SKILLS = [
  ...INSTANCE_SKILLS,
  ...ENGINE_ONLY_SKILLS,
] as const;
```

Update `agentRouter()` so:

- engine `Create yours` routes to `create-coffee-chat`;
- engine install remains an explicit generic plugin install choice;
- one explicit, Task 5-bound pre-conversion handoff routes directly to repo-local `build-kg` only after live origin, target fingerprint, native template observation, and template-surface checks; every other engine-role entry retains the normal engine menu;
- instance Coffee Chat, named external application, and KG authoring route to the existing three Skills;
- on the first relevant instance entry, inspect the host-provided Skill inventory once; when `coffee-chat:update-coffee-chat` is present, read and strictly validate its package-local `.coffee-chat-generated.json`, generated release, migration-registry, advisory, and the release/registry/advisory schema references, recompute their SHA-256 values, require equality with both the package marker and advisory's exact reference bindings, and compare the instance's exact `(repository, version, release_digest)` tuple without network or writes; the bound migration-document and setup Preview/Receipt schemas are read only after Review;
- only `review_candidate_available` adds `Review Coffee Chat update` and waits;
- integrity conflicts map to `incompatible`, while absent provenance/path maps to `unknown`; neither is advertised as a safe update;
- do not load or execute the updater Skill during advisory comparison; a chosen review then routes to the installed generic `update-coffee-chat`, never a repo-local stale copy.

`CLAUDE.md` continues to import only `@AGENTS.md`.

For engine-role generation, delivery `tools/engine-cli.ts` verifies the release and registry, calls `buildEngineUpdateAdvisory()` with the four exact discovery schema Buffers, renders the two Review-only setup schema references, and passes the resulting advisory plus already rendered reference bytes to managed `tools/projections.ts` through an optional contract-shaped `engine_updater_bundle`. The managed renderer only copies those validated bytes; it never imports migration/update code. Instance generation calls the same renderer without this optional input and must remain byte-identical after every delivery file is deleted.

- [ ] **Step 5: Run router and projection tests**

Run:

```bash
npm test -- tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts tests/skill-contracts.test.ts
npm run cc -- generate --check
```

Expected green: generic packages contain five Skills and complete local advisory plus Review-only setup references, personal packages contain three, AGENTS stays silent when current, and pre-conversion handoff cannot recurse. Tampering the package marker, release/registry/advisory bytes, or one of the three local-discovery schema bytes/bindings suppresses the review offer and produces `incompatible` only when update review is explicitly requested. Tampering the migration-document or either setup schema is detected after Review before any checkout code executes. A converted instance still generates and validates with no `engine_updater_bundle` or delivery file.

- [ ] **Step 6: Run actual updater agent evaluations**

Under `superpowers:writing-skills`, run actual Codex and Claude Code sessions in isolated temporary homes against the update-pressure scenarios from Step 1. Keep transcripts outside Git; record only host version, scenario, pass/fail, and non-secret receipt in `docs/testing.md`. Both hosts must preserve the three approval stops (setup, update, publication) and refuse stale-runtime/default-branch/auto-merge pressure.

- [ ] **Step 7: Verify full host lifecycle and namespace isolation**

In isolated Codex and Claude homes, test generic marketplace add/install/update/remove and personal plugin install/use/remove. Copy the generic marketplace/package into a temporary fixture, mutate one Skill/reference/schema/surface byte there, bump only that fixture from `1.0.0` to `1.0.1`, regenerate its fixture catalog, and require the host to observe both the byte and version change. Do not change the tracked production plugin version in this task; it remains unreleased `1.0.0` until Task 12 performs the only real bump. For Codex, refresh the fixture only with `codex plugin marketplace upgrade coffee-chat-marketplace`, then use read-only list output and the isolated package path to prove `references/release.json` and `references/advisory.json` bytes changed; do not invent a plugin update command, scope selector, or disable/enable command. For Claude, use `claude plugin update coffee-chat@coffee-chat-marketplace --scope local` and prove the same fixture byte changes. Install two different personal namespaces plus the generic plugin, remove each in every order, and assert the others and sentinel configuration remain unchanged.

Also install the pre-migration personal plugin, apply a synthetic engine migration that changes any distributable package byte—including packaged provenance—and publish the fixture branch to the isolated fake host. Require the version-independent package content digest to change and the proposed patch version to make the updated personal package discoverable. A fully byte-identical normalized package must retain its version.

- [ ] **Step 8: Run the complete agent-delivery slice and commit**

Run all Skill, projection, and lifecycle tests and regenerate tracked outputs. Require a byte-identical second generation.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools tests method skills docs/testing.md .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: review engine updates through agents"
```

### Task 11: Make creation and provenance visible without a registry

**Files:**

- Modify: `tools/readme.ts`
- Modify: `site/lib/load-site-model.ts`
- Modify: `site/layouts/BaseLayout.astro`
- Modify: `site/pages/index.astro`
- Modify: `tests/readme-projections.test.ts`
- Modify: `tests/site-model.test.ts`
- Modify: `tests/e2e/site.spec.ts`
- Modify: `tests/site-publication-boundary.test.ts`
- Generate: `README.md`
- Generate: `README.ko.md`

**Interfaces:**

- Consumes: Task 1 canonical instance provenance, Task 5 creation route, and Task 10 final plugin/router surfaces.
- Produces: role-aware README creation copy, instance `Built with Coffee Chat` attribution, Pages provenance metadata, and no-telemetry browser contract for Tasks 12-13.

- [ ] **Step 1: Add red conversion and attribution tests**

Engine README tests require a copyable, agent-first `Create yours` route that names the generic plugin path and GitHub Template result. Instance README tests require exactly one final line derived from canonical provenance:

```text
Built with [Coffee Chat](https://github.com/SonSangjoon/coffee-chat) · v1.1.0
```

Korean and English documents keep separate files; images remain English-only. Do not add Showcase, central registration, aggregate counts, referral codes, or telemetry.

Pages tests require the same quiet footer link and exact machine-readable metadata:

```html
<meta name="coffee-chat:engine-repository" content="..." />
<meta name="coffee-chat:engine-version" content="..." />
<meta name="coffee-chat:engine-source-commit" content="..." />
<meta name="coffee-chat:engine-release-digest" content="..." />
```

Test engine Pages omits instance provenance, instance values equal `coffee-chat.json`, no value leaks into unsafe HTML, and browser requests contain no beacon or remote embed.

Run:

```bash
npm test -- tests/readme-projections.test.ts tests/site-model.test.ts tests/site-publication-boundary.test.ts
npm run site:build
npm run test:site -- tests/e2e/site.spec.ts
```

Expected red: the README has no working creation handoff, uses a hardcoded engine URL in instance projection, and Pages has no engine-provenance surface.

- [ ] **Step 2: Render only from canonical data**

Remove the hardcoded instance upstream constant from `tools/readme.ts`. Render instance attribution from `manifest.provenance.engine`; render engine creation copy from its own canonical repository identity. Add provenance to the site model only for instance role and escape all metadata values.

The engine's primary README remains `Your point of view, open for conversation.` and its two product paths remain Talk and Create. This task adds the executable creation path and quiet proof; it does not turn the README into infrastructure documentation or a recruiting-only pitch.

Generate twice and require no second diff.

Commit:

```bash
git add .github coffee-chat.json engine schemas tools site tests method skills .coffee-chat AGENTS.md CLAUDE.md README.md README.ko.md .codex-plugin .claude-plugin .agents plugins
git commit -m "feat: expose template creation and provenance"
```

### Task 12: Close CI, security, and end-to-end acceptance

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `package.json`
- Modify: `coffee-chat.json`
- Modify: `tests/workflow-contracts.test.ts`
- Modify: `tests/gitleaks-contracts.test.ts`
- Modify: `tests/make-mine-acceptance.test.ts`
- Modify: `tests/engine-update-acceptance.test.ts`
- Modify: `tests/engine-review-setup.test.ts`
- Modify: `tests/engine-review-setup-skill.test.ts`
- Modify: `tests/engine-publication.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `docs/testing.md`
- Generate: `engine/release.json`
- Generate: `engine/template-surface.json`
- Generate: `.coffee-chat/generated-files.json`
- Generate: `AGENTS.md`, `CLAUDE.md`, `README.md`, `README.ko.md`
- Generate: `.codex-plugin/**`, `.claude-plugin/**`, `.agents/**`, `plugins/coffee-chat/**`

**Interfaces:**

- Consumes: every local interface and generated surface from Tasks 1-11.
- Produces: one deterministic local acceptance flow, read-only PR CI gates, security regressions, and exact release evidence requirements for Task 13.

- [ ] **Step 1: Add the complete local acceptance test**

Build one disposable local flow with a fake GitHub observer and real Git repositories:

```text
verified template response
-> bootstrap-safe template workflows do not match creation push
-> independent downstream checkout
-> exact template-surface equality and one pre-conversion Build KG route
-> Make mine with first Note
-> provenance and engine lock
-> generated personal plugin and Pages
-> separate approved Pages workflow-mode setting
-> publication Preview names role-specific push workflows
-> separate approved bootstrap commit/push
-> generic plugin update metadata changes only
-> AGENTS reports one update
-> read-only Review
-> setup Preview with exact source/checkout/dependency effects
-> literal setup digest approval
-> verified source checkout and npm ci
-> completed setup receipt
-> external update Candidate
-> literal digest approval
-> isolated branch/worktree apply
-> preserved knowledge semantics
-> publication Preview binds copied update receipt and pre-commit parent
-> literal publication digest approval
-> simulated one-child commit/push/exact-PR with no merge
```

Assert the engine checkout, target default branch, original target worktree, other plugin namespaces, and sentinel config stay unchanged at every read-only boundary. Assert a secret fixture is blocked without printing the secret. Assert no Derived Perspective, Mental Model, Taste profile, or Task Lens appears anywhere tracked or packaged.

- [ ] **Step 2: Keep PR CI read-only**

Extend `Coffee Chat CI / verify` to run the release, provenance, Skill, migration, publication, deterministic generation, secret, type, unit, acceptance, site, and plugin-lifecycle gates. Keep `package.json`'s `test:acceptance` command instance-safe: every named test remains managed and present after Make mine. The engine CI invokes delivery-only `tests/engine-update-acceptance.test.ts` and the publication acceptance slice explicitly while those files exist; no surviving instance package script may name a removed delivery test. The workflow retains `pull_request`, `contents: read`, `persist-credentials: false`, and no secrets. PR CI must not make authenticated or side-effecting application/API calls, create repositories/branches/tags/PRs/Pages deployments, or install plugins in real user homes. Ordinary dependency, browser, and pinned Gitleaks acquisition may use their existing unauthenticated network paths.

The engine/template Pages workflow remains bootstrap-safe with no `push` trigger. Its build job is read-only and uploads only `dist/site`; only an explicitly dispatched deploy job retains Pages/id-token permissions. The Make mine instance projection may restore its intended push trigger, which the publication Preview must name. All Actions stay pinned to the existing reviewed commit SHAs unless a separate dependency task verifies and approves an update.

- [ ] **Step 3: Run independent code and security review before the production version bump**

Use `superpowers:requesting-code-review` for the complete diff. Run a security diff review focused on authenticated GitHub effects, URL normalization, path containment, symlink handling, archive/candidate trust, command argument injection, digest domains, TOCTOU checkpoints, credential/log exposure, ownership/deletion, and cross-plugin namespace removal. Resolve all Critical and Important findings with failing regressions before continuing.

- [ ] **Step 4: Freeze the package, bump once, and run final verification**

Only after the review and every resulting source/test/documentation fix are complete, bump the generic `coffee-chat.json.plugin.version` from unreleased `1.0.0` to final `1.1.0`. Regenerate the release, template surface, self-copies, ownership markers, manifests, marketplace catalog, router, README, and plugin package once, then regenerate a second time. The second run must be byte-identical. No changed generic package may be published under `1.0.0`, no review fix lands after the bump, and no generated self-copy causes a second version bump.

Run:

```bash
npm run cc -- validate --snapshot worktree --format json
npm run cc -- generate --check
npm run cc -- check --snapshot worktree
npm run typecheck
npm run format:check
npm test
npm run test:acceptance
npm test -- tests/engine-review-setup.test.ts tests/engine-update-acceptance.test.ts tests/engine-publication.test.ts
npm run site:build
npm run test:site
npm run gitleaks:scan
git diff --check
```

Before committing, inspect the complete reviewed changed-path inventory. Stage every approved Task 1-12 source and closed projection path, including `.github`, `coffee-chat.json`, `package.json`, `package-lock.json`, TypeScript/Astro config, `CONTENT_LICENSE.md`, `method/`, `schemas/`, `tools/`, `site/`, `skills/`, `tests/`, `docs/`, `docs/assets/`, all generated markers/manifests, and both plugin namespaces. Do not rely on a shortened directory list or silently stage unrelated files. Stage that reviewed inventory before running any staged snapshot gate:

```bash
git status --short
git add .agents .claude-plugin .codex-plugin .coffee-chat .github .gitignore .gitattributes .gitleaks.toml .pre-commit-config.yaml .prettierignore AGENTS.md CLAUDE.md CONTENT_LICENSE.md LICENSE README.md README.ko.md coffee-chat.json package.json package-lock.json tsconfig.json vitest.config.ts playwright.config.ts astro.config.mjs engine schemas tools site method skills tests docs plugins
git diff --name-only --exit-code
test -z "$(git ls-files --others --exclude-standard)"
git diff --cached --check
npm run cc -- validate --snapshot staged --format json
npm run cc -- check --snapshot staged
git diff --cached --name-only
```

Expected green: every command exits `0`, no tracked or untracked reviewed path remains outside the index, generated outputs have no drift, the second generation is byte-identical, and the staged tree—not only the worktree—contains the complete reviewed change set. Do not run another `git add` after these gates; commit this exact index.

Commit the reviewed, final-version bundle:

```bash
git commit -m "test: close the agent lifecycle acceptance"
```

### Task 13: Release the engine and dogfood coffee-chat-son

**Files:**

- No source edits before the implementation PR is merged and verified.
- Remote effects: GitHub tag/release, repository Template setting, generic marketplace/plugin refresh, new `coffee-chat-son` repository, optional Pages workflow-mode activation, and an optional non-secret acceptance-evidence update to the existing GitHub Release.

**Interfaces:**

- Consumes: Task 12 green implementation commit, `engine/release.json`, `engine/template-surface.json`, generic plugin, official GitHub Template API, and a separately supplied, already approved Son public first-Note request kept outside the engine repository, release, template tree, and plugin.
- Produces: versioned `v1.1.0` source ref with exact commit/digest readback, enabled Template repository, independently owned `coffee-chat-son`, native GitHub provenance, deployed instance surfaces, and non-secret acceptance evidence.

- [ ] **Step 1: Publish the implementation PR**

Use `superpowers:finishing-a-development-branch` and `github:yeet`. Push the implementation branch and open a PR that links the lifecycle design and plan. Confirm `Coffee Chat CI / verify`, CodeQL, Pages build, and any preserved ruleset gates are green. Merge only through the repository's protected GitHub flow; do not bypass or weaken checks.

- [ ] **Step 2: Create the stable engine release**

After merge, fetch the verified merge commit and run the full verification suite from a clean checkout. Show a single Preview binding the non-force-updated `v1.1.0` tag, the GitHub Release target/title/body, `draft: false`, `prerelease: false`, and host-specific generic plugin refresh as explicit effects. After approval:

1. create and push `v1.1.0` at the verified commit;
2. create the GitHub Release with `gh release create v1.1.0 --target <verified-commit> --title <bound-title> --notes-file <bound-notes>` (or the equivalent official API), requiring the exact tag, target commit, title/body, `draft: false`, and `prerelease: false`;
3. read back the Release ID/URL/tag/target/title/body/draft/prerelease and fail closed if any field differs;
4. verify the tag's `engine/release.json`, source ref, managed and delivery bytes, registry, and plugin copy;
5. require every path/mode/digest in the tag's managed and delivery inventories to equal the template default branch, and every tracked path/mode/binding/disposition to equal the packaged template surface before creation can be enabled;
6. refresh Codex with `codex plugin marketplace upgrade coffee-chat-marketplace` and Claude with `claude plugin update coffee-chat@coffee-chat-marketplace --scope local` in isolated homes;
7. prove the installed release/advisory reference bytes changed as expected and local advisory inspection makes no repository writes. If tagging succeeds but Release creation/readback or refresh fails, report a resumable partial result without deleting or retagging; a retry re-observes the existing tag/Release and performs only missing effects.

- [ ] **Step 3: Enable GitHub Template mode**

Read current repository settings and confirm admin access, public visibility, default branch, clean release identity, no Git LFS content, `is_template: false`, exact stable-tag managed/delivery verification, default-branch equality for every release inventory entry, bootstrap-safe workflows, and live-tree/packaged-template-surface equality. Show the single proposed settings mutation. After approval, enable Template mode through the official GitHub repository API and read it back as `is_template: true`. Any later merged managed/delivery change makes creation unavailable until release config, migration path, generated release, and versioned source ref are advanced together; any migration-registry/document change also requires a new engine version/ref plus regenerated release, registry, advisory, and plugin; a Skill-instruction/engine-only-documentation/transition-projection change requires regenerated surface metadata plus refreshed generic plugin bytes while all release inventories and registry/document bytes remain identical.

- [ ] **Step 4: Create coffee-chat-son through the released Skill**

Invoke the installed `create-coffee-chat` Skill; do not manually copy or fork. Preview the complete bound release/default-tree/template-surface, public `coffee-chat-son` target, local path, and dependency effects, then wait for approval. After creation:

1. verify GitHub `template_repository` points to the engine;
2. verify source release/default tree, packaged surface, target initial tree, and target origin;
3. prove the pre-conversion AGENTS exception routes once to repo-local Build KG without recursion;
4. set both `profile.display_name` and `profile.short_name` to `Son`, then prepare the first Son Note Candidate from the separately supplied approved public Source/request outside the engine checkout; never copy that request into an engine fixture or Candidate cache under the engine root;
5. show Profile UUID, Note/Entity UUIDs, full public diff, provenance, engine lock, and Candidate digest;
6. apply only after the literal digest is approved;
7. read `GET /repos/{owner}/{repo}/pages`, show one exact Preview for `POST /repos/{owner}/{repo}/pages` with `{ "build_type": "workflow" }` (or the documented update endpoint if a site already exists), obtain separate approval, apply only that GitHub Actions workflow-mode setting, and require a `GET` readback of `build_type: "workflow"` before any instance push;
8. show a separate standard Git publication Preview that binds the converted diff and names every instance workflow the push will trigger, obtain explicit approval, and use `github:yeet` or the protected-branch equivalent to commit and push only that tree; if a PR is required, record its pushed head SHA and result-tree digest, stop at `awaiting_owner_merge`, and do not continue until a fresh read observes the merged PR with that same head, the actual merge commit (or a proven fast-forward), default-branch SHA equal to that observed merge commit/head, and default-branch tree equal to the bound result tree;
9. only after direct default push or exact merged-default readback, wait for the named CI/CodeQL/Pages runs, then verify Pages, URL-based Coffee Chat, personal plugin install/use/remove, and `Built with Coffee Chat` attribution;
10. keep Son content out of the engine repository and engine plugin.

If remote creation succeeds but a later step fails, report the new repository and resume point; do not delete it automatically.

- [ ] **Step 5: Record release evidence**

Do not edit any tracked engine file after release: even a documentation-only commit changes the closed template surface and generic package reference. Instead, prepare a non-secret `acceptance-evidence.json` outside both repositories containing engine release and template-surface identities, Template-mode readback, target native template relation, Candidate/knowledge digests, Pages deployed commit/digest, plugin lifecycle results, and update-inspection result. Show its digest and the exact proposed GitHub Release note/asset update, obtain separate approval, attach it to the existing `v1.1.0` release, and read back the asset digest. This is release evidence, not a user registry, Showcase, or usage counter.

## Final verification checklist

Before declaring the implementation complete:

- [ ] `coffee-chat.json` is engine role, schema 1.1, and has no personal knowledge or provenance.
- [ ] Engine source, fixtures, template surface, and generic plugin contain only neutral fictional test data and no Son Profile, Note, Entity, or authored request.
- [ ] `engine/release.json` regenerates byte-identically and verifies its closed inventory.
- [ ] `engine/template-surface.json` closes every tracked default-template path and matches the packaged creation reference.
- [ ] New instances require immutable `created_from` GitHub-template provenance and an exact engine lock.
- [ ] Root manifest/provenance-only changes do not alter `knowledge_digest`.
- [ ] Generic plugin contains five Skills; personal plugin contains exactly three.
- [ ] Create uses the official Template API and hands canonical writing to Build KG.
- [ ] Updating/installing the generic plugin alone changes no instance bytes or refs.
- [ ] Any generic package-byte change bumps its plugin version, even when the engine release identity remains unchanged.
- [ ] AGENTS is silent when current and offers review only for an exact advisory entry; prepare performs remote/source verification.
- [ ] Engine inspect/prepare are read-only; apply requires the literal digest and uses an isolated branch/worktree.
- [ ] Modified engine-owned and generated files are never silently overwritten or deleted.
- [ ] Profile, Note, Entity, Source, time, content license, and creation provenance semantics are preserved.
- [ ] Commit/push/PR bind the exact update receipt, pre-commit HEAD/parent, and PR body under a separate literal publication-digest approval; merge is never automated.
- [ ] README/Pages attribution is derived from canonical provenance and emits no telemetry.
- [ ] Full local, CI, site, secret, and both-host plugin suites pass.
- [ ] Template activation and `coffee-chat-son` creation occur only after the verified release.

## Plan completion and handoff

After every task commit is present, run the complete verification command block from Task 12 in a clean worktree, request independent review, and compare the result to every acceptance item in the normative design. Record exact commands and exit codes; do not infer completion from a visible PR, test card, or generated screen.

Execution should use one fresh subagent per task with parent review between tasks because Tasks 1-13 share canonical schemas and generated files. Parallelize only read-only audits or independent test reviews; never let two agents edit `tools/candidate.ts`, `tools/projections.ts`, schemas, or generated outputs concurrently.
