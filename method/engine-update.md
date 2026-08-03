# Engine update method

This method describes the remote-only Coffee Chat engine update path. A public
instance remains the source of truth for its own Profile, Notes, Entities,
provenance, and plugin namespace. An update may replace only engine-owned
software and generated projections; it must preserve the instance's authored
knowledge and identity.

The updater is an instruction-level Skill, not a resident service or hidden
runtime. It may inspect a locally checked-out public instance without writing
to it, but every useful result is prepared for the instance's public GitHub
repository and ends in an owner-reviewed pull request. A local-only instance,
private source, fork rewrite, automatic commit, force-push, or merge is out of
scope.

## Discovery

On entry, the router may perform one read-only package-consistency check when
the generic `update-coffee-chat` Skill is installed. It compares the exact
instance engine tuple `(repository, version, release_digest)` with the
generated advisory references and reports only `current`, `review_candidate_available`,
`unknown`, or `incompatible`. The advisory is not proof of remote authenticity;
Review must verify the official public GitHub release and every bound byte.

## Approval boundaries

There are three independent approvals:

1. Review the official source and setup Preview before clone/fetch, dependency
   traffic, or `npm ci` in the disposable verified source checkout.
2. Approve the engine update digest after migration, semantic-preservation,
   validation, and secret checks have produced an external Candidate and an
   uncommitted receipt-bound worktree.
3. Approve the publication digest before the exact commit, non-force push, and
   open pull request.

Each approval is a later message containing the exact literal digest. A prior
approval never authorizes a later effect. An open PR is a partial result and
the merge remains a human decision.

## Evidence

Every Preview binds the official repository and source commit, release and
migration digests, changed engine paths, instance semantic preservation ledger,
result tree, branch/base, workflow effects, fixed commit identities and dates,
public PR body, and external receipt paths. `Authored` knowledge is never
rewritten by an engine update. If an observation changes, invalidate the
approval and prepare a new Candidate.
