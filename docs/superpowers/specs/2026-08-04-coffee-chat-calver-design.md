# Coffee Chat CalVer Release Design

**Status:** Approved for implementation

**Date:** 2026-08-04

## Decision

Coffee Chat uses Calendar Versioning for engine releases:

```text
vYYYY.MM.DD
```

The date is UTC. This checkout starts a new release line at `v2026.08.04`.
Previous SemVer release identities and migration edges are out of scope; the
new migration registry starts empty.

One stable engine release is allowed per UTC calendar date. A second release
on the same date must wait for the next UTC date rather than inventing a
fourth numeric version segment or a non-monotonic suffix.

## Release ownership

Developers change source code and design documents locally. They do not edit
version-bearing files to publish a release. A manually dispatched GitHub
Actions workflow:

1. derives the UTC CalVer from the workflow date;
2. refuses an existing tag for that date or a non-baseline version that is not
   newer than the current CalVer release;
3. updates the engine manifest, release config, and package metadata;
4. regenerates release, template, plugin, advisory, and ownership projections;
5. runs the repository validation and test gates;
6. creates one release commit when source bytes changed, then the tag and
   GitHub Release. For the untagged initial baseline, it creates the tag and
   GitHub Release without an empty commit.

The workflow is the only documented release mutator. The underlying
`release prepare` command remains deterministic and testable, but local use
is for CI reproduction and diagnosis, not routine version maintenance.

## Version surfaces

The release preparation command keeps these values aligned:

- `coffee-chat.json.plugin.version`;
- `engine/release-config.json.version` and its `refs/tags/v<version>` ref;
- the root `package.json` and lockfile package version;
- generated engine release, template-surface, plugin manifest, advisory, and
  marketplace projections;
- future migration registry edges and their digests.

The manifest schema version remains independently controlled at `1.1.0`.
CalVer describes the distributable engine/plugin release, not the persisted
knowledge schema.

## Migration generation

For each post-baseline release, the command reads the current CalVer release
identity before changing version bytes. It creates one manifest-only migration
document and adds a registry edge from the current CalVer identity to the new
CalVer identity. The baseline itself has no imported historical edge.
The new release digest is calculated from the changed source tree before the
registry target is written; the registry digest is then incorporated into the
generated release projections without creating a digest cycle.

The first dispatch may publish the current `v2026.08.04` baseline when its tag
is absent and the registry is empty. That bootstrap path is not a migration;
every later release must advance to a newer UTC date.

## Failure boundaries

Preparation fails when the working tree is not clean, the requested date is
not a real UTC calendar date, the current release is invalid, a non-baseline
target is not newer, the date tag already exists, a migration edge is
ambiguous, or generation/tests fail. The workflow never force-pushes,
overwrites an existing tag, or silently skips a generated projection.
