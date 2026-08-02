# Coffee Chat README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bilingual mixed README with separate English and Korean, role-aware generated READMEs that lead with the Taste thesis and ship the approved Coffee Chat cover plus two localized explanatory diagrams.

**Architecture:** Move README rendering into a focused module that returns both locales from one manifest and keep `tools/projections.ts` as the projection orchestrator. Treat the five README visuals as canonical, MIT-licensed repository inputs: validate them before rendering, reference them from both role variants, and include their snapshot observations in projection provenance without copying them into plugin payloads.

**Tech Stack:** Node.js 24.5.0, npm 11.5.1, TypeScript 7.0.2, Vitest 4.1.10, GitHub-flavored Markdown, safe hand-authored SVG, PNG composed from the approved image-generation master.

## Global Constraints

- `README.md` is English and `README.ko.md` is Korean; each starts with a reciprocal relative language link.
- The hero starts with “AI makes execution abundant. Taste decides what is worth making.” and defines Taste as trained judgment under uncertainty, never as personality or aesthetic preference.
- Public Sources, dated author-approved Notes, neutral Entities, and temporal links are stored; fixed POV, Mental Model, Taste profile, and Task Lens are derived per question or task and never persisted.
- Engine copy represents no person; instance copy uses only manifest-provided public identity, URL, Pages URL, plugin name, and marketplace name.
- **Have a Coffee Chat** and **Build your Coffee Chat** receive equal first-page visibility; recruiting is an example, not the product identity.
- The cover is `docs/assets/readme/coffee-chat-cover.png`, exactly 1280 x 640 PNG and less than 1 MiB, derived from approved source SHA-256 `3a47a283ef60316ea1ef6bd0191bc4e15f49d251a90b364e88d58455828b8052`.
- Product-flow SVGs use `viewBox="0 0 960 720"`; trust-layer SVGs use `viewBox="0 0 1200 600"`.
- SVGs contain no scripts, event handlers, remote references, embedded raster data, animation, gradients, or runtime dependencies.
- The approved palette is `#EEE9DF`, `#25221F`, `#75503D`, `#9A7059`, and `#697166`; no neon, glossy 3D, robot, brain, laptop, or AI iconography is introduced.
- Image generation supplies raster illustration and texture only. Typography, diagram labels, semantic tables, and Markdown copy remain deterministic.
- Canonical knowledge, Candidate semantics, plugin behavior, Pages behavior, and schema behavior do not change.

---

### Task 1: Separate Role-Aware README Rendering by Locale

**Files:**

- Create: `tools/readme.ts`
- Create: `tests/readme-projections.test.ts`
- Modify: `tools/projections.ts`
- Modify: `tools/artifact-inventory.ts`
- Modify: `.prettierignore`

**Interfaces:**

- Consumes: `Manifest`, `isEngineManifest`, and manifest profile/plugin/marketplace metadata.
- Produces: `renderReadmes(manifest: Manifest): ReadonlyMap<"README.md" | "README.ko.md", Buffer>`.
- Produces: the closed role inventory containing both `README.md` and `README.ko.md`.

- [ ] **Step 1: Write the failing English/Korean engine projection tests**

Create `tests/readme-projections.test.ts` with real `generatedProjectionBytes` calls. The expected break is that `README.ko.md` is absent and `README.md` still mixes both languages.

```ts
const projected = await generatedProjectionBytes(snapshot, graph);
const english = projected.get("README.md")?.toString("utf8");
const korean = projected.get("README.ko.md")?.toString("utf8");

expect(english?.startsWith("[한국어](./README.ko.md)\n")).toBe(true);
expect(korean?.startsWith("[English](./README.md)\n")).toBe(true);
expect(english).toContain(
  "## AI makes execution abundant. Taste decides what is worth making.",
);
expect(korean).toContain(
  "## AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.",
);
expect(english).toContain("## Why Coffee Chat");
expect(korean).toContain("## 왜 Coffee Chat인가");
expect(english).not.toContain("Coffee Chat과 대화하기");
expect(korean).not.toContain("Talk with a Coffee Chat / ");
```

Also assert the English and Korean section order independently:

```ts
const englishHeadings = [
  "## AI makes execution abundant. Taste decides what is worth making.",
  "## Why Coffee Chat",
  "## Two needs, one graph",
  "## Have a Coffee Chat without installing",
  "## One record, two directions",
  "## Why this is not another knowledge base",
  "## How it earns trust",
  "## Put Taste to work",
  "## Build your Coffee Chat",
  "## Install, remove, contribute, and license",
];
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/readme-projections.test.ts`

Expected: FAIL because `README.ko.md` is `undefined` and the new hero/section order is absent.

- [ ] **Step 3: Implement the focused renderer**

Create `tools/readme.ts` with locale-specific section arrays and no line-by-line bilingual branching inside a section.

```ts
export type ReadmePath = "README.md" | "README.ko.md";

export function renderReadmes(
  manifest: Manifest,
): ReadonlyMap<ReadmePath, Buffer> {
  const outputs = new Map<ReadmePath, Buffer>();
  outputs.set("README.md", textBytes(renderEnglish(manifest)));
  outputs.set("README.ko.md", textBytes(renderKorean(manifest)));
  return outputs;
}
```

Render the complete copy and exact prompts from design spec sections 4.1 through 4.10. The first actionable blocks must be exactly:

```text
Open <COFFEE_CHAT_INSTANCE_URL>.
Read coffee-chat.json, then AGENTS.md.
Start a one-time Coffee Chat. Do not install anything.

Help me understand how this person approaches <ROLE_OR_PROJECT>.
Show documented alignment, tension, and Unknown.
Distinguish Authored, Sourced, Inferred, and Unknown.
Do not score the person or make a hiring decision.
```

and:

```text
Use <YOUR_COFFEE_CHAT_URL> as the perspective source for <TASK>.
Retrieve only the public, dated records relevant to the task.
Derive a temporary POV, Mental Model, and Task Lens.
Explain which judgment criteria affect the work and cite the supporting Notes.
Work only on <TARGET>.
Do not write the synthesis back to Coffee Chat.
```

The instance renderer substitutes its exact repository URL and public display name. The engine renderer retains the explicit instance placeholder and says that the engine has no person to chat with.
Because the v1 instance schema has no upstream-engine field and schema changes are out of scope, define the neutral engine backlink once in `tools/readme.ts` as `https://github.com/SonSangjoon/coffee-chat`; do not infer it from the instance repository URL.

- [ ] **Step 4: Wire both files into the closed projection inventory**

In `tools/projections.ts`, replace `values.set("README.md", readme(manifest))` with iteration over `renderReadmes(manifest)`. In `tools/artifact-inventory.ts`, add `README.ko.md` next to `README.md`. Add `README.ko.md` to `.prettierignore` because both files are generated.

- [ ] **Step 5: Run the focused projection test and verify GREEN**

Run: `npm test -- tests/readme-projections.test.ts`

Expected: PASS with two locale-specific README buffers and the approved hierarchy.

- [ ] **Step 6: Run the existing projection suite**

Run: `npm test -- tests/task-4-projections.test.ts tests/artifact-boundaries.test.ts`

Expected: existing exact-copy assertions fail only where superseded by the new approved README contract; update those assertions to user-visible behavior, then rerun to PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/readme.ts tools/projections.ts tools/artifact-inventory.ts tests/readme-projections.test.ts tests/task-4-projections.test.ts tests/artifact-boundaries.test.ts .prettierignore
git commit -m "feat: generate role-aware localized readmes"
```

### Task 2: Preserve Instance Identity and Candidate Projection Completeness

**Files:**

- Modify: `tests/readme-projections.test.ts`
- Modify: `tests/task-4-projections.test.ts`
- Modify: `tests/task-4-candidate-projections.test.ts`
- Modify: any focused test helper whose temporary repository copy list omits `README.ko.md`

**Interfaces:**

- Consumes: `renderReadmes(manifest)` from Task 1 and `roleOwnedProjectionPaths(graph)`.
- Produces: both localized READMEs in instance projections, Candidate preview outputs, changed paths, and apply receipts.

- [ ] **Step 1: Write the failing initialized-instance assertions**

Use `tests/fixtures/initialized-valid` and assert literal manifest substitutions without inheriting engine or Son fixture identity:

```ts
expect(english).toContain("Open https://github.com/example/coffee-chat");
expect(korean).toContain("https://github.com/example/coffee-chat");
expect(english).toContain(
  "coffee-chat-example@coffee-chat-example-marketplace",
);
expect(korean).toContain("coffee-chat-example@coffee-chat-example-marketplace");
expect(english).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
expect(korean).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
expect(english).not.toContain("Sangjoon Son");
expect(korean).not.toContain("Sangjoon Son");
```

Add Candidate assertions for `./README.ko.md` beside `./README.md` in the manifest output list, preview affected paths when changed, and applied checkout.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/readme-projections.test.ts tests/task-4-candidate-projections.test.ts`

Expected: FAIL where temporary copy lists, Candidate expectations, or role-owned path expectations still assume one README.

- [ ] **Step 3: Update test fixtures and role-aware expectations**

Copy both README files only when the helper copies generated state. Do not add personal knowledge to engine fixtures. Replace obsolete bilingual-heading and fictional-answer assertions with the approved English/Korean product behavior. Preserve all lifecycle, plugin command, content-license, and identity-leak assertions.

- [ ] **Step 4: Verify instance and Candidate paths**

Run: `npm test -- tests/readme-projections.test.ts tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts`

Expected: PASS; each initialized instance has exact URL/plugin identity in both locales and Candidate apply includes `README.ko.md` transactionally.

- [ ] **Step 5: Commit**

```bash
git add tests/readme-projections.test.ts tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts
git commit -m "test: cover localized instance readme projections"
```

### Task 3: Add the Approved Cover and Safe Localized Diagrams

**Files:**

- Create: `tools/readme-assets.ts`
- Create: `tests/readme-assets.test.ts`
- Create: `docs/assets/readme/coffee-chat-cover.png`
- Create: `docs/assets/readme/coffee-chat-flow.en.svg`
- Create: `docs/assets/readme/coffee-chat-flow.ko.svg`
- Create: `docs/assets/readme/coffee-chat-trust.en.svg`
- Create: `docs/assets/readme/coffee-chat-trust.ko.svg`
- Modify: `tools/projections.ts`
- Modify: `tools/readme.ts`
- Modify: `tools/candidate.ts`
- Modify: temporary-repository helper copy lists used by projection tests

**Interfaces:**

- Produces: `README_ASSET_PATHS: readonly string[]`.
- Produces: `validateReadmeAssets(snapshot: Snapshot): Promise<void>`.
- Produces: `validateReadmeLinks(snapshot: Snapshot, readmes: ReadonlyMap<string, Buffer>): Promise<void>`.
- Consumes: the five canonical asset files and both rendered README buffers.

- [ ] **Step 1: Write failing asset-contract tests**

The tests exercise real repository bytes and mutations in copied temporary repositories. Expected production breaks are wrong PNG dimensions/size, unsafe SVG content, locale-geometry drift, and missing local Markdown targets.

```ts
await expect(validateReadmeAssets(snapshot)).resolves.toBeUndefined();

await writeFile(
  flowEnglish,
  '<svg viewBox="0 0 960 720"><script>alert(1)</script></svg>',
);
await expect(validateReadmeAssets(mutatedSnapshot)).rejects.toMatchObject({
  diagnostic: expect.objectContaining({ code: "unsafe-readme-asset" }),
});
```

Add literal assertions for:

```ts
expect(readPngDimensions(cover)).toEqual({ width: 1280, height: 640 });
expect(cover.byteLength).toBeLessThan(1024 * 1024);
expect(flowSlots).toEqual([
  "public-source",
  "dated-judgment",
  "approved-note",
  "temporal-graph",
  "owner-agent",
  "other-agents",
  "task-lens",
  "grounded-chat",
  "owner-outcome",
  "other-outcome",
]);
expect(trustSlots).toEqual(["authored", "sourced", "inferred", "unknown"]);
```

- [ ] **Step 2: Run the asset tests and verify RED**

Run: `npm test -- tests/readme-assets.test.ts`

Expected: FAIL because the validator and five assets do not exist.

- [ ] **Step 3: Compose the approved cover deterministically**

Verify the approved source hash before use:

```bash
shasum -a 256 /Users/sangjoon/.codex/generated_images/019fb2e9-af85-7c70-a465-e9225d32269f/exec-386897b7-009a-442b-a668-02a8edd09052.png
```

Resize the exact 1774 x 887 source to 1280 x 640, preserving its full 2:1 composition. Add deterministic left-side typography only:

```text
COFFEE CHAT
A point of view, with a history.
```

Use Avenir Next or Helvetica Neue for the title, Georgia for the subtitle, charcoal `#25221F`, and the existing left negative space. Optimize the PNG below 1 MiB without adding a new generated scene. Inspect the final raster at original resolution before committing it.

- [ ] **Step 4: Author the four safe SVGs**

Build the exact geometry and localized label sets from spec sections 5.3 and 5.4. Give every semantic label a stable `data-slot`, keep non-text SVG bytes equivalent between locale pairs, and include localized `<title>` and `<desc>` elements. Use only paths, circles, rects, groups, and text; do not use `<image>`, `<foreignObject>`, filters, masks, animation, links, or CSS imports.

- [ ] **Step 5: Implement byte-level asset validation**

In `tools/readme-assets.ts`:

- parse the PNG signature and IHDR width/height directly from the Buffer;
- reject byte length `>= 1024 * 1024`;
- reject SVG tokens `<script`, `<image`, `<foreignObject`, `<animate`, `<set`, `on...=`, `href=`, `xlink:href=`, `url(`, and gradient elements case-insensitively;
- require the exact viewBox for each pair;
- parse `data-slot` order and compare locale structural fingerprints after normalizing only `<title>`, `<desc>`, and `<text>` contents;
- throw `ValidationFailure` with stable `missing-readme-asset`, `invalid-readme-cover`, `unsafe-readme-asset`, or `readme-asset-locale-drift` diagnostics.

In `validateReadmeLinks`, treat `README.md` and `README.ko.md` as projected paths and require every other `./...` image or link target to exist in the selected snapshot.

- [ ] **Step 6: Integrate validation and image references**

Call `validateReadmeAssets(snapshot)` before rendering projections and `validateReadmeLinks(snapshot, readmes)` after rendering. Add the five local image references with descriptive localized alt text at their named README sections. Extend `tools/candidate.ts` `supportPaths()` to walk and include `docs/assets/readme/**`; Candidate materialization must carry the canonical visual inputs before instance projection generation runs. Update temporary repository helpers to copy `docs/assets/readme` so tests exercise real inputs rather than mocks.

- [ ] **Step 7: Run the focused asset and projection suites**

Run: `npm test -- tests/readme-assets.test.ts tests/readme-projections.test.ts tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts`

Expected: PASS with safe assets, valid local links, and identical locale geometry.

- [ ] **Step 8: Commit**

```bash
git add tools/readme-assets.ts tools/readme.ts tools/projections.ts tools/candidate.ts tests/readme-assets.test.ts tests/readme-projections.test.ts tests/task-4-projections.test.ts tests/task-4-candidate-projections.test.ts docs/assets/readme
git commit -m "feat: add Coffee Chat readme visual system"
```

### Task 4: Regenerate, Visually Review, and Verify the Full Branch

**Files:**

- Modify generated: `README.md`
- Create generated: `README.ko.md`
- Modify: `docs/testing.md`
- Modify: `docs/superpowers/specs/2026-07-30-coffee-chat-design.md`
- Modify: `docs/superpowers/specs/2026-08-02-coffee-chat-readme-design.md`
- Modify if superseded assertions remain: focused tests only

**Interfaces:**

- Consumes: the role-aware renderer, asset validator, canonical manifest, and current engine graph.
- Produces: byte-stable tracked engine README projections and verification evidence.

- [ ] **Step 1: Regenerate the engine projections**

Run: `npm run cc -- generate --format human`

Expected: `README.md` and `README.ko.md` are written from canonical metadata without changing knowledge files.

- [ ] **Step 2: Verify generation is byte-stable**

Run: `npm run cc -- generate --check`

Expected: exit 0 with no stale projection diagnostics. Run `npm run cc -- generate --check` a second time and confirm the same result.

- [ ] **Step 3: Perform visual QA**

Inspect the cover at 1280 x 640 and both SVG pairs at narrow and wide widths. Confirm:

- title and subtitle remain legible at repository-social-preview scale;
- the cup remains on the right and does not collide with typography;
- each diagram reads in the documented order at approximately 360 px and 900 px content width;
- Korean labels do not clip;
- no glyph-like image-generation artifacts appear in the cover;
- solid off-white assets remain intentional against light and dark GitHub surroundings.

- [ ] **Step 4: Run formatting, type, projection, and security checks**

Run:

```bash
npm run format:check
npm run typecheck
npm test
npm run cc -- check --snapshot worktree
npm run cc -- validate --snapshot worktree --format human
npm run site:build
git diff --check
```

Expected: every command exits 0. If a failure appears, use `superpowers:systematic-debugging` before modifying implementation.

- [ ] **Step 5: Re-read the approved spec and audit every acceptance item**

Compare implementation against all 13 acceptance items in `docs/superpowers/specs/2026-08-02-coffee-chat-readme-design.md`. Update `docs/testing.md` with localized README, visual-asset safety/link validation, and Candidate projection coverage. Replace the superseded bilingual-paired-lines contract in section 9.1 of `docs/superpowers/specs/2026-07-30-coffee-chat-design.md` with a direct pointer to this approved redesign spec. Record any deliberate exception before claiming completion; otherwise update the redesign spec status to `Implemented`.

- [ ] **Step 6: Commit the generated outputs and final status**

```bash
git add README.md README.ko.md docs/testing.md docs/superpowers/specs/2026-07-30-coffee-chat-design.md docs/superpowers/specs/2026-08-02-coffee-chat-readme-design.md
git commit -m "docs: publish the Coffee Chat readme experience"
```

- [ ] **Step 7: Request broad branch review**

Dispatch a final reviewer against the approved spec and the diff from `0cf1ea7` through `HEAD`. Address any load-bearing finding, rerun the full Step 4 verification, and only then hand off the branch/PR.
