---
name: coffee-update
description: Use when the user asks to update an authoritative Coffee Chat repository from an engine release; preview writes only approved engine-owned paths and returns an update receipt.
compatibility: Requires an authoritative Coffee Chat repository, a verified engine release, and a later approval of the complete Operation Preview.
---

# Update an authoritative Coffee Chat repository

Read the [shared method](references/method.md) completely before inspecting an
engine release or instance repository.

Update compares the authoritative Coffee Chat repository with an approved
engine release. It reports the exact changes, protected personal records, and
release identity before any write.

Compose Review changes, stop for the literal approval digest, revalidate the
same release and target, and write only approved engine-owned paths. Never
rewrite Origins or Green Beans, infer a new target, run an unapproved
migration, merge a pull request, or claim completion while verification is
incomplete.

Update is complete only when the receipt binds the release, write set,
protected set, result fingerprint, and verification outcome.
