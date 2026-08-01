# Coffee Chat v1 Implementation Plan

**Normative product contract:** `docs/superpowers/specs/2026-07-30-coffee-chat-design.md`

## Global constraints

- Node.js `24.5.0`, npm `11.5.1`, TypeScript `7.0.2`, Astro `7.1.6`; one root ESM package with an exact `package-lock.json`.
- Canonical authored state is only `coffee-chat.json`, `knowledge/notes/*.md`, `knowledge/entities.yml`, and `method/`. Generated surfaces must never add authored meaning.
- Only structural, provenance, public-safety, secret, packaging, and deterministic-generation gates are allowed. Do not add semantic scoring, minimum-length rules, Source-count ranking, personality inference, or stored POV/Mental Model records.
- Public IDs are lowercase UUIDv4 values minted before Preview and immutable after approval. Source identity is the exact approved HTTP(S) URL.
- Every implementation behavior follows strict TDD: failing behavioral test, observed expected failure, minimal implementation, green suite, refactor.
- The first public Note must be prepared by the Candidate engine and may not be written to canonical paths until the user approves its exact `candidate_digest` and Preview. Commit, push, Pages enablement, and GitHub ruleset mutation are separate actions.

## Task 1: Foundation, canonical metadata, schemas, and licenses

Create the root TypeScript/Astro/Vitest package, `.node-version`, editor/text policies, and generated-artifact ignore rules. Mark the design specification Approved.

Create `coffee-chat.json` with schema version `1.0.0`, time zone `Asia/Seoul`, display name `Sangjoon Son`, repository `https://github.com/SonSangjoon/coffee-chat`, Pages URL `https://sonsangjoon.github.io/coffee-chat/`, plugin `coffee-chat-sangjoon` version `1.0.0`, and marketplace name derived as `coffee-chat-sangjoon-marketplace`. The Profile UUID is absent only in a pre-initialization fixture; the canonical manifest receives one through the approved first Candidate.

Define strict JSON Schema Draft 2020-12 documents for the root manifest, Note frontmatter, Entity Registry, generated index, Candidate request, Preview, and Receipt. Properties use lower `snake_case`, unknown properties fail, paths are repository-relative POSIX paths, and missing optional values are omitted rather than null or empty sentinel strings.

Add an exact MIT `LICENSE` for code, schemas, templates, Skills, and site shell. Add `CONTENT_LICENSE.md` stating that `knowledge/notes/**` and Sangjoon Son's original public prose are `© 2026 Sangjoon Son, All rights reserved`, while third-party Sources retain their own terms.

Bootstrap tests first, then implement manifest/schema/license behavior. Commit only after tests, typecheck, and format/check commands pass.

## Task 2: Strict validation and deterministic temporal KG

Implement the `npm run cc -- validate`, `generate`, and `check` commands. Support `--snapshot worktree|staged`, `--format human|json`, and optional `--base-ref`. Exit `0` on success, `1` on validation errors, and `2` when the validator cannot complete. JSON diagnostics are `{code,path,pointer?,message}` with stable lowercase-kebab codes and redacted messages.

Reject duplicate JSON members, comments, trailing commas, NaN, and Infinity before Ajv validation. Parse authored YAML as the JSON-compatible YAML 1.2 subset and reject duplicate keys, merge keys, aliases, custom tags, and non-JSON values. Enforce UTF-8, LF, one final newline, safe repository-relative paths without symlink escape, exact declared external Markdown links, no remote images/embeds, canonical UUIDv4 syntax, Note filename/ID equality, and optional base-ref ID immutability.

Implement Gregorian `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, and inclusive closed ranges with mixed precision. Expose overlap matching for Perspective time and a full-date first-recorded cutoff without inventing precision.

Generate tracked `knowledge/index.json` with sorted Note, Source, and Entity nodes and de-duplicated `cites`, `mentions`, and `links_to` triples. Preserve every Note-local Citation observation. Compute Note `content_digest` from full canonical Markdown bytes and `knowledge_digest` from RFC 8785 canonical JSON excluding the digest field. Repeated generation must be byte-identical; `generate --check` must never write.

Cover all behavior with failing fixtures before implementation, including one Source reused across Notes, one Note with several Sources, body-only digest changes, unsafe links, temporal edges, and staged-tree isolation.

## Task 3: Transactional Candidate authoring and repository hook lifecycle

Implement `candidate prepare` and `candidate apply` using CandidateRequest operations: mode `make-mine|contribute|update`; Entity `create|update|retire`; Note `create|correct`; and setup effect `install-pre-commit` only. New Entity and Note operations may reference candidate-local temporary keys that are replaced with minted UUIDv4 values before Preview.

`prepare` writes only to an explicit temporary directory outside the repository. It materializes the complete desired canonical and generated files plus `preview.json`, `preview.md`, and a candidate manifest binding base HEAD, every canonical input digest, frozen configured-zone date, Source observations, relevant worktree state, setup-effect target fingerprint, output paths and hashes, and an RFC 8785 `candidate_digest`.

`apply --approve <digest>` must revalidate the Candidate and rehash every bound input, date, base state, and hook target. Any drift returns approval-invalidated without canonical writes. Apply canonical files with sibling temporary files, backups, and rollback on failure; verify applied bytes and generated state. Run approved setup effects afterward and report canonical success plus setup failure as a partial local result.

Implement `hooks inspect|install|uninstall`. Resolve the actual hook with `git rev-parse --git-path hooks/pre-commit`; reject external `core.hooksPath`, unmanaged hook bytes, and Preview races. Install pre-commit only after inspection. Uninstall only the framework-managed hook and Coffee Chat-owned repo-local runtime. Never implement `--no-verify`, `SKIP`, silent chaining, or automatic allowlisting.

Use dependency injection for filesystem, clock, UUID, Git, and process execution so race, rollback, rollover, and partial-result tests exercise real temporary repositories rather than mock assertions.

## Task 4: Shared agent method, three Skills, plugin packaging, README, and first Candidate

Before authoring each new Skill, run a fresh-agent baseline scenario without that Skill and record the observed failure. Then create and forward-test one Skill at a time: `coffee-chat`, `apply-perspective`, and `build-kg`. Keep each `SKILL.md` concise with only `name` and a trigger-focused `description` in frontmatter. Each Skill reads its generated `references/method.md`; `method/` is the sole authored method.

The shared method must reconstruct relevant temporal trajectories and keep Authored, Sourced, Inferred, and Unknown distinguishable. Different dates or situations are not contradictions by default. `coffee-chat` starts by asking one-time Coffee Chat or plugin installation and never mutates persistent state. `apply-perspective` may edit only user-named task targets outside Coffee Chat canonical/plugin paths. `build-kg` uses the Candidate flow and is the only Skill allowed to initialize or update canonical knowledge after exact Preview approval.

Create a thin root `AGENTS.md`; create `CLAUDE.md` containing only `@AGENTS.md`. Generate `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `.claude-plugin/marketplace.json` from `coffee-chat.json` and the actual Skill inventory. The Codex manifest contains no hooks, MCP servers, apps, or unsupported fields. The repo-local marketplace includes explicit AVAILABLE/ON_INSTALL policy and Productivity category. Validate with the bundled plugin validator, Skill quick validator, Agent Skills rules, and Claude validator when available.

Write the short paired English/Korean README in this action order: purpose, AI-synthesis disclosure, one-time Coffee Chat prompt, install plugin, Make mine, Browse KG. Generate owner/repository/plugin/Pages strings so forks cannot retain stale identity. Include exact native removal guidance and explain that one-time Coffee Chat installs nothing.

Prepare, but do not apply, the first `make-mine` Candidate. It creates three Entities: `Taste` kind `concept`, `Iteration` kind `process`, and `AI agent` kind `technology`, with no aliases or extra Entities. It creates the Note titled `Iteration이 싸질수록 Taste가 해자가 된다`, temporal coverage `2026-02/2026-07`, exact user-provided Korean body, and the five approved Citations and observed dates from the user plan. `recorded_on` is the Asia/Seoul date frozen immediately before Preview. Report the exact Preview path and `candidate_digest` to the controller for user approval.

## Task 5: Astro editorial archive and temporal graph projection

Build a static Astro site from canonical files only. Derive `site` and `base` from `coffee-chat.json.pages_url`; output only `dist/site`. Use a warm off-white background, charcoal type, coffee-brown accent, system serif headings, and system sans UI. Pair English/Korean interface labels; render Note bodies only in their authored language.

Implement Home, Timeline, Graph, Note Detail, Entity Detail, and Source Detail. Source URL remains identity while route slug is SHA-256 of the exact URL. Show temporal coverage and first-recorded date together, Note-local Citation observations, backlinks, repository, source commit, and knowledge digest.

Timeline and Graph share GET/query parameters `perspective` and `recorded_through` using the core temporal matcher. Clearly state that filters operate on the current corrected corpus rather than reconstructing a historical Git snapshot. Use Cytoscape only on Graph and provide an equivalent semantic list fallback. No page may synthesize or publish a Derived Perspective or Task Lens.

Disable raw HTML and remote embeds, sanitize rendered Markdown, allow only HTTP(S) and repository-relative links, and add opener protection to external links. Test static routes, filter semantics, source slugging, publication inventory, unsafe content, keyboard navigation, reduced motion, and responsive layouts at 360, 768, and 1440 pixels.

## Task 6: Gitleaks, CI, Pages workflow, package lifecycle, and acceptance

Add `.pre-commit-config.yaml` with `fail_fast: true`; first use Gitleaks v8.30.1 commit `83d9cd684c87d95d656c1458ef04895a7f1cbd8e` in redacted staged mode, then run the staged Coffee Chat check. Lock the CI Gitleaks release artifact URL and official SHA-256 and verify before execution.

Create a `pull_request` workflow named `Coffee Chat CI` with job `verify`, `contents: read`, no secrets, no `pull_request_target`, checkout credential persistence disabled, and full history. Run exact dependency install, unit/integration tests, typecheck, deterministic check, packaging validation, Gitleaks, Astro build, and offline site inspection.

Create a main/workflow_dispatch Pages workflow with read-only validate/build/upload jobs and a separate `github-pages` environment deploy job holding only `pages: write` and `id-token: write`. Upload only `dist/site`. Pin Actions to the exact SHAs in the user plan and retain readable version comments.

Implement package lifecycle smoke tests in disposable configuration: Codex marketplace add/list, plugin add/list/remove, marketplace remove; Claude validate, marketplace add, install, list, disable/enable, update, uninstall, marketplace remove. Do not invent unsupported Codex enable/disable commands. Co-install two fork namespaces and prove removing one leaves the other and sentinel state intact.

After the approved first Candidate is applied, run the full acceptance suite, a seeded-secret local commit rejection test in a disposable repository, clean deterministic regeneration, site visual inspection, and a final whole-branch review. External GitHub mutations are last: push a branch/PR, obtain the first green `Coffee Chat CI / verify`, enable Pages workflow mode, and update existing ruleset `20040261` by preserving all live rules and adding only the required check. Use GitHub squash merge so main receives a verified GitHub-created commit.
