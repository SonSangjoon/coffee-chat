# CodeQL Merge Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Coffee Chat PRs satisfy the repository's existing CodeQL merge protection before squash-merging PR #1.

**Architecture:** Add one source-controlled advanced CodeQL workflow for JavaScript/TypeScript because `main` contains no analyzable code until PR #1 lands and Default Setup is configured with no languages. Keep security analysis separate from the read-only product CI job. Pin every Action to a verified full commit SHA, disable the empty Default Setup before the first advanced upload, preserve the remaining ruleset, add only the already-green `Coffee Chat CI / verify` UI check (API context `verify`, GitHub Actions integration ID `15368`) as a required check, and merge only when both checks are green.

**Tech Stack:** GitHub Actions, CodeQL Action v4.37.4, Vitest 4, GitHub REST API.

## Global Constraints

- Preserve deletion, non-fast-forward, creation, required-signature, pull-request, and CodeQL code-scanning rules in ruleset `20040261`.
- Do not restore the unavailable GitHub Code Quality rule for this personal-account public repository.
- Use `pull_request` and `push` only; never use `pull_request_target` or repository secrets.
- Pin `actions/checkout` and every CodeQL Action invocation to verified 40-character commit SHAs.
- The CodeQL job receives only `contents: read` and `security-events: write`.
- Merge PR #1 only by GitHub squash merge against expected head `374930f7ff27c279258be913f7955d1c692babc0` or its tested descendant.

---

### Task 1: Source-controlled CodeQL analysis

**Files:**

- Create: `.github/workflows/codeql.yml`
- Modify: `tests/workflow-contracts.test.ts`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: existing pinned checkout Action and strict YAML workflow loader.
- Produces: a `CodeQL / Analyze (javascript-typescript)` pull-request check and continuous scan on `main`.

- [ ] **Step 1: Write the failing workflow contract test**

Require `codeql.yml` to use `pull_request` and `push` to `main`, contain one `analyze` job, grant only `contents: read` plus `security-events: write`, initialize and analyze `javascript-typescript`, avoid secrets and `pull_request_target`, and pin these Actions:

```text
actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803
github/codeql-action/init@f205ea1c3313d32999d8d6a48b4f6530d4437b38
github/codeql-action/analyze@f205ea1c3313d32999d8d6a48b4f6530d4437b38
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/workflow-contracts.test.ts`

Expected: FAIL because `.github/workflows/codeql.yml` does not exist.

- [ ] **Step 3: Add the minimal workflow and testing documentation**

Create a single-language advanced setup with no build step because JavaScript/TypeScript extraction needs no special build. Document the local contract test and the GitHub-hosted analysis boundary.

- [ ] **Step 4: Verify GREEN and the full local suite**

Run:

```bash
npm test -- tests/workflow-contracts.test.ts
npm run format:check
npm run typecheck
npm run cc -- check --snapshot worktree
npm run gitleaks:scan
npm test
```

Expected: all commands exit 0; the full suite reports no failed tests.

- [ ] **Step 5: Commit and push**

```bash
git add .github/workflows/codeql.yml tests/workflow-contracts.test.ts docs/testing.md docs/superpowers/plans/2026-08-02-codeql-merge-gate.md
git commit -m "ci: add pinned CodeQL analysis"
git push origin codex/coffee-chat-v1
```

### Task 2: Activate gates and merge

**Files:**

- No repository file changes.

**Interfaces:**

- Consumes: PR head checks and live ruleset `20040261`.
- Produces: a GitHub-created verified squash commit on `main`.

- [ ] **Step 1: Disable the empty Default Setup before advanced analysis uploads**

PATCH `/repos/SonSangjoon/coffee-chat/code-scanning/default-setup` with `{ "state": "not-configured" }`, then verify the returned configuration.

- [ ] **Step 2: Push or rerun the PR event and wait for both checks**

Require `Coffee Chat CI / verify` and `CodeQL / Analyze (javascript-typescript)` to complete successfully on the same head SHA. Inspect CodeQL logs and alerts if analysis fails.

- [ ] **Step 3: Add the product CI required check without replacing rules**

Read ruleset `20040261`, append one `required_status_checks` rule for API context `verify` with integration ID `15368` and strict required checks enabled (the corresponding UI label is `Coffee Chat CI / verify`), and send the complete preserved rule set back through the REST API. Read it again and compare every rule.

- [ ] **Step 4: Re-read merge state and squash merge**

Require a clean local tree, an unchanged remote head, no unresolved review comments, successful required checks, and `MERGEABLE`. Merge PR #1 through GitHub with `merge_method: squash` and `expected_head_sha` set to the verified PR head.

- [ ] **Step 5: Verify the merged result**

Fetch PR #1 and `origin/main`, confirm the PR is merged, confirm the returned squash commit is on `main` and GitHub-verified, and report any post-merge Pages workflow separately without claiming deployment until it completes.
