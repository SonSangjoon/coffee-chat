---
name: coffee-init
description: Use when the user asks to initialize an independent coffee-chat-* repository from an engine release; preview writes only the new repository and returns an init receipt.
compatibility: Requires an approved engine release, an explicit destination, and a later approval of the complete Operation Preview.
---

# Initialize an independent Coffee Chat repository

Read the [shared method](references/method.md) completely before inspecting a
destination or preparing an Operation Preview.

Init starts from the engine and an Agent. It always produces a new,
independent repository whose name matches coffee-chat-\* and whose repository
is the single source of truth for that person's Origins, Green Beans,
provenance, and instance configuration.

## Inputs

- an explicit repository name and owner;
- an explicit empty destination outside the invoking work repository;
- the approved engine release identity and public-repository policy;
- the user's later approval of the exact Operation Preview digest.

## Required sequence

1. Read coffee-chat.json and verify that the current repository is the engine.
2. Inspect the approved release payload, destination, repository identity, and
   protected paths without writing.
3. Compose one Operation Preview with the exact target, read set, write set,
   protected set, release fingerprint, repository name, and risk.
4. Show Review changes and stop. A later approval must repeat the exact
   preview digest.
5. Re-inspect every bound value, materialize the approved release payload in
   the new repository, initialize instance metadata, and return a receipt.

## Write boundary

The approved write set is limited to the new independent coffee-chat-\*
repository and its initialization receipt. The invoking Agent, work
repository, engine checkout, installed package, and cache are protected.

Do not use a source checkout as the new instance, reuse a repository, infer a
target from the current directory, or put personal records in the engine.
Do not begin Harvest until the new repository identity and ownership boundary
are verified.

Init is complete only when the new repository exists independently, its
coffee-chat.json identifies the instance, and the receipt records the exact
target and protected paths.
