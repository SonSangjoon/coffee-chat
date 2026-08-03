# Coffee Chat testing

Coffee Chat verifies the generic engine and disposable fictional instances without publishing personal fixture data or changing a real host configuration.

## Local commands

```sh
npm ci
npm test
npm run typecheck
npm run format:check
npm run gitleaks:scan
npm run cc -- validate --snapshot worktree --format human
npm run cc -- generate --check
npm run cc -- check --snapshot worktree
npm run site:build
npm run site:check
npm run test:site
```

`npm run test:acceptance` runs the cross-cutting local acceptance set. It covers the input-only Make mine flow, generated-artifact isolation, secret rejection, query behavior, and native plugin lifecycle before the browser suite runs separately through `npm run test:site`.

`npm test` caps Vitest at two workers because Candidate fixtures materialize and hash the shared README PNG support files. Higher local concurrency can turn filesystem contention into unrelated per-test timeouts.

The two integration cases that repeatedly spawn the CLI or copy the complete engine checkout declare explicit 15-second and 30-second budgets. The assertions remain unchanged; the larger budgets absorb filesystem variance on GitHub-hosted runners without weakening the default timeout for unit-scale tests.

## CodeQL analysis

`npm test -- tests/workflow-contracts.test.ts` validates the source-controlled CodeQL workflow contract locally, including its triggers, least-privilege permissions, pinned Actions, JavaScript/TypeScript language selection, and secret-free pull-request boundary.

The analysis itself runs only on GitHub-hosted runners as `CodeQL / Analyze (javascript-typescript)` for pull requests and pushes to `main`. JavaScript/TypeScript extraction needs no project-specific build step.

## Acceptance map

| Flow                                                                | Evidence                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Knowledge-free engine validation and byte-identical generation      | `foundation-contracts`, `role-contracts`, `task-4-projections`  |
| Separate reciprocal English and Korean README projections           | `readme-projections`, `task-4-projections`                      |
| Locked README PNG dimensions, digests, and parsed local links       | `readme-assets`                                                 |
| Candidate materialization of both READMEs and shared visual support | `task-4-candidate-projections`, `candidate-downstream-identity` |
| No Son or synthetic fixture dependency in an engine release         | `fixture-isolation`, `artifact-boundaries`                      |
| Docs-only engine Pages                                              | `site-build`, `site-publication-boundary`, Playwright           |
| Disposable Make mine through Preview digest approval                | `make-mine-acceptance`, Candidate contract tests                |
| Instance Note, temporal KG, plugin snapshot, and Pages              | projection, site-model, site-build, and Playwright tests        |
| Public-evidence Coffee Chat and task-scoped query behavior          | `skill-evaluations`                                             |
| Local commit and CI-style secret rejection without value disclosure | `gitleaks-contracts`, workflow contracts                        |
| Co-installed engine plus two fictional instance plugins             | `plugin-lifecycle`                                              |

The fictional fixture under `tests/fixtures/example-input/` is input-only and non-canonical. Release inventory tests prove that its bytes and the synthetic instance bytes do not enter the engine Profile, knowledge graph, plugin, README, or Pages.

## Create yours Skill evaluation

`tests/skill-evaluations.test.ts` keeps the creation pressure prompts as a
static filesystem/instruction contract. It does not execute a model, call
GitHub, or treat a transcript as a runtime. The prompts cover native Template
creation, complete Preview-before-POST, Template-mode/provenance checks,
credential redaction, safe empty checkout paths, timeout reconciliation,
Build KG handoff, pre-conversion non-recursion, and the separate
commit/push/PR/merge publication boundary.

The pre-Skill diagnostic runs use isolated temporary homes and a hermetic
temporary repository with a recording fake `gh`; no GitHub credential or
personal content is retained. The required host evidence is recorded here as
non-secret receipts:

| phase      | host        | observed version/result                                                                                                   | receipt                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| baseline   | Codex CLI   | `codex-cli 0.146.0-alpha.9.2`; unavailable before model turn because the isolated home could not resolve `api.openai.com` | `rc=1`, no POST/clone/dependency write, only transport/DNS errors, no credential output |
| baseline   | Claude Code | executable absent (`command -v claude` returned no path)                                                                  | unsupported host; no session claimed                                                    |
| post-Skill | Codex CLI   | same isolated invocation; unavailable before model turn for the same DNS failure                                          | `rc=1`, no POST/clone/dependency write, no credential output                            |
| post-Skill | Claude Code | executable absent                                                                                                         | unsupported host; no session claimed                                                    |

These are explicit environment limitations rather than model pass claims. The
reproducible static contract remains the deterministic gate: it requires the
complete Preview before POST, separate publication approval, exactly-once
pre-conversion Build KG routing, and credential-free behavior. A live host
evaluation must be repeated in an environment with the corresponding host and
network access before claiming runtime model compliance.

README asset tests parse PNG signatures and IHDR dimensions directly, enforce byte ceilings and approved SHA-256 digests for the three shared visuals, and walk inline, reference-style, and angle-bracket local Markdown targets through `mdast`. Candidate projection tests prove that both localized READMEs and those three support assets materialize transactionally without entering plugin payloads or the knowledge graph.

## Native host isolation

Codex lifecycle tests create an existing temporary `CODEX_HOME` and use marketplace-qualified selectors. They never override `HOME` or write the real Codex configuration. The test installs an unrelated sentinel plugin together with the generic engine and two fictional namespaces, compares source and installed bytes, removes each Coffee Chat plugin independently, and proves the other two packages and sentinel remain unchanged. Empty host-owned cache parent directories may remain after removal; plugin payload and inventory entries may not.

Claude lifecycle tests use a temporary `CLAUDE_CONFIG_DIR`, plugin cache, and disposable project with local scope. When the `claude` executable is absent, the test is skipped with the explicit reason `unsupported host: claude executable absent`. If the executable exists, missing or changed lifecycle commands are failures rather than silent skips.

Codex has no plugin disable/enable command in the supported local CLI surface, so the test does not invent one. Claude testing includes validation, marketplace add, install, new-process discovery, disable/enable, update, uninstall, and marketplace removal.

## External publication boundary

Local acceptance does not push a branch, open a pull request, edit repository rulesets, enable GitHub Pages, or deploy. Those mutations begin only after explicit authorization and a green `Coffee Chat CI / verify` check.
