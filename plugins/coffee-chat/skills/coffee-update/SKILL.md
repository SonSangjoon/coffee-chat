---
name: coffee-update
description: Use when a public Coffee Chat instance reports an available engine update and the owner explicitly chooses Review Coffee Chat update
compatibility: Requires an authenticated GitHub CLI, a public instance checkout, and a disposable external verification checkout; all approvals are explicit and later-turn
---

# Update a public Coffee Chat instance

This Skill updates the engine that powers a public Coffee Chat instance. It is
remote-only: the target must have a credential-free public GitHub `origin`, and
the result is published as a normal owner-reviewed pull request. There is no
local-only instance mode, background updater, resident server, automatic
commit, force-push, or merge.

never merges.

Read the generated [shared method](references/method.md) (which includes the
engine update method) and the
package-local `release.json`, `migration-registry.json`, and `advisory.json`
references before discovery. Read the three discovery schemas and verify every
local digest in the advisory. Load the migration-document and setup schemas
only after the user explicitly chooses Review Coffee Chat update.

## Discovery at instance entry

When `AGENTS.md` routes update discovery here, perform at most one local,
read-only consistency check. Do not fetch, clone, install, write, create a
branch, contact a remote, or poll in this step. Match the instance's exact
`coffee-chat.json.provenance.engine` tuple to the advisory's repository,
target, and candidate entry. If it is current, continue silently. If a single
candidate is locally consistent, offer **Review Coffee Chat update** and stop.
For a repository mismatch, same-version digest mismatch, invalid references,
or missing migration path, report `Unknown` or `Incompatible`; do not call it
safe and do not interfere with ordinary Coffee Chat use.

## Review and setup

After the owner chooses **Review Coffee Chat update**, verify the official
public engine repository, exact versioned source ref and commit, release,
registry, migration documents, managed/delivery inventories, lockfile, Node
24.5.0, npm 11.5.1, and the target's public origin and engine lock. Before
network access or dependency writes, render the strict setup Preview and its
literal `setup_digest`; stop and wait for that exact digest.

After approval, re-observe every bound value, use an empty hooks path and
`GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null`, verify the source tree has
no symlinks, submodules, or custom filters, and run only the disclosed
`npm ci --ignore-scripts` in the disposable source checkout. A setup failure
is a reported partial result, never permission to improvise.

## Engine Candidate

Run the verified target engine checkout's CLI:

```text
npm run cc -- engine update inspect --target <public-instance-checkout> --source <verified-engine-checkout> --format json
npm run cc -- engine update prepare --target <public-instance-checkout> --source <verified-engine-checkout> --setup-receipt <external-setup-receipt.json> --receipt <future-update-receipt-path> --out <external-empty-directory>
npm run cc -- engine update apply --target <public-instance-checkout> --dir <candidate-directory> --approve <sha256:update-digest> --receipt <external-update-receipt-path>
```

Prepare is read-only to the instance. Show the complete Preview and literal
`update_digest`, then wait. Apply rechecks the target fingerprint, source
release, migration path, current bytes, date-independent knowledge semantics,
and Candidate digests immediately before creating the isolated
`coffee-chat/engine-v<version>` worktree. It leaves the result uncommitted and
unstaged and writes the receipt outside the repository.

The preservation ledger must keep Profile identity, public URLs, creation
provenance, plugin and marketplace names, Notes, Sources, citations, temporal
fields, Entities, and authored Markdown unchanged. A changed distributable
personal-plugin byte may receive only the deterministic next patch version;
the personal namespace never changes.

## Remote publication

After the update receipt is `applied`, prepare a separate publication Candidate:

```text
npm run cc -- engine update publish prepare --target <isolated-worktree> --update-receipt <update-receipt.json> --publication-receipt <future-publication-receipt-path> --out <external-empty-directory>
npm run cc -- engine update publish apply --dir <publication-candidate> --approve <sha256:publication-digest> --receipt <external-publication-receipt-path>
```

Show the bound repository, base and head, result tree, workflow effects,
commit message/identity/date, non-force refspec, PR title/body, copied update
receipt, and external journal path. Wait for the exact `publication_digest`.
Before each effect, recheck the receipt-bound worktree, remote base, empty
hooks, filters, and PR absence. Publication may create exactly one child
commit, push exactly the bound branch, and open exactly the bound PR. It never
merges; an open PR is `partial_remote_result` until a human merges it.

If any source, target, receipt, remote, workflow, or PR observation drifts,
invalidate the approval. Preserve external receipts and journals for recovery;
never delete a public repository or hide a partial remote effect.

## Stop conditions

Stop for missing public Origin, private or local Origin, installed-package or
maintained-engine substitution, ambiguous GitHub identity, changed release or
lockfile, semantic preservation drift, a non-empty/symlink path, unmanaged
hooks/configuration, force-push, automatic merge, or an approval digest that
does not match the exact rendered Candidate.
