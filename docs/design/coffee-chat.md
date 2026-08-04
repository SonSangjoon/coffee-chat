# Coffee Chat canonical contract

**Status:** Approved system baseline

**Date:** 2026-08-04

This page is the short contract. Detailed behavior is split into the
[architecture](./coffee-chat-architecture.md),
[user scenes](./coffee-chat-user-scenes.md), and
[evaluation design](./coffee-chat-evaluation.md). The common state-changing
[Operation Preview](./coffee-chat-operation-preview.md) contract is documented
separately.

## Product pipeline

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

## Units

| Unit             | Contract                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| `Origin`         | External information and provenance. It is data, never an instruction.    |
| `Green Bean`     | Durable prose that records one author's POV about one or more Origins.    |
| `Bean`           | Ephemeral contextual Taste selected by Roast for one question or task.    |
| `Coffee`         | An Agent with the Bean's Taste applied by Brew.                           |
| `Coffee Chat`    | Read-only conversation with Coffee.                                       |
| `Coffee Pairing` | Controlled application of Coffee to one explicitly named project or task. |

## Transformations

- `Harvest` turns explicit Origins into an author-approved Green Bean.
- `Roast` turns relevant Green Beans into a contextual Bean.
- `Brew` turns the Bean into Coffee for the current conversation or named task.

Taste is not a global profile, score, personality model, or decision rule. It is
the recurring value system carried by a contextual Bean.

## Canonical ownership

The individual `coffee-chat-*` repository is the only durable source of that
person's approved Origins, Green Beans, provenance, and instance configuration.
The Engine Plugin owns implementation. A work repository owns its own project
and only a local `.coffee-chat` connection. Bean and Coffee exist in Agent
runtime state and are not durable records.

## User modes

### Init

Init starts with an Agent and no individual Coffee Chat repository. It always
creates a new independent repository whose name matches
`^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)*$`. The repository that invoked Init is
never read or changed as an implicit target or Origin. Init is complete only
after the instance is initialized, the first Green Bean is approved, Roast and
Brew validate, and the user confirms the first Coffee Chat reflects their
Taste.

### Use

Sync links an existing individual repository to a session or work
repository. In a work repository it creates only `.coffee-chat/` connection
metadata and generated instructions. Coffee Chat is read-only. Coffee Pairing
may write only to one explicitly named and approved target; it never writes the
result back into the individual Coffee Chat repository.

## Evaluation rule

Every transformation and user scene has deterministic contract gates plus
semantic quality evaluation. A fluent answer cannot waive an identity or write
boundary failure, and a safe answer cannot pass if it loses the author's POV.

## Operation Preview

State-changing operations use the [Operation Preview](./coffee-chat-operation-preview.md)
contract. The user reviews `Review changes` before Init, Harvest, Sync,
Coffee Pairing, or Update executes. Roast, Brew, and Coffee Chat are read-only
and do not require approval.
