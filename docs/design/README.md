# Coffee Chat design

**Status:** Approved system baseline

This directory contains the maintained design baseline for Coffee Chat. The
README explains the product. These documents explain the system that must make
the product true.

## Canonical product language

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

`Origin`, `Green Bean`, `Bean`, and `Coffee` are product units. `Harvest`,
`Roast`, and `Brew` are transformations between units. `Taste` is the value
system carried by a contextual `Bean`; it is not a separate durable profile.

All new user-facing contracts, Skills, schemas, generated files, and
documentation use this language. Compatibility aliases and migration layers
are not part of this design baseline.

## Document map

| Document | Responsibility |
| --- | --- |
| [`coffee-chat.md`](./coffee-chat.md) | Short canonical contract and pipeline summary. |
| [`coffee-chat-architecture.md`](./coffee-chat-architecture.md) | Repository ownership, data lifecycle, source of truth, and security boundaries. |
| [`coffee-chat-user-scenes.md`](./coffee-chat-user-scenes.md) | Init, Sync, Use, and Update journeys, including completion and stop conditions. |
| [`coffee-chat-evaluation.md`](./coffee-chat-evaluation.md) | Evaluation-first quality gates and gold cases for every transformation and experience. |
| [`coffee-chat-bench.md`](./coffee-chat-bench.md) | Legacy path for the external evaluation-boundary design; the orchestration repository is `coffee-chat-eval`. |
| [`coffee-chat-eval.md`](./coffee-chat-eval.md) | `coffee-chat-eval` orchestration, track registry, run receipts, and Coffee Chat performance reports. |
| [`coffee-chat-bench-contract.md`](./coffee-chat-bench-contract.md) | Boundary for the independent candidate-agnostic benchmark and its validity claim. |
| [`coffee-chat-skill-contracts.md`](./coffee-chat-skill-contracts.md) | Per-Skill inputs, outputs, boundaries, adapter observations, and external Eval case IDs. |
| [`coffee-chat-operation-preview.md`](./coffee-chat-operation-preview.md) | The common approval, scope, revalidation, and Receipt contract for state-changing operations. |
| [`coffee-chat-skills.md`](./coffee-chat-skills.md) | Canonical Skill names, descriptions, responsibilities, routing, and evaluation rules. |
| [`../research/2026-08-04-coffee-chat-ux-research.md`](../research/2026-08-04-coffee-chat-ux-research.md) | Product reasoning behind the language and two-step journey. |

## Fixed decisions

1. Init starts with an Agent and no existing Coffee Chat repository.
2. Init always creates a new independent Coffee Chat repository.
3. The repository that invoked Init is never the Init target, storage
   location, or implicit Origin.
4. Every new instance repository must match
   `^coffee-chat-[a-z0-9]+(?:-[a-z0-9]+)*$`.
5. The individual `coffee-chat-*` repository is the single source of truth for
   that person's Origins, Green Beans, provenance, and instance configuration.
6. Sync creates a project-local integration surface; it does not copy
   personal records into the work repository.
7. Coffee Chat is read-only. Coffee Pairing can write only to one explicitly
   named work target.
8. Bean and Coffee exist only for the current conversation or named task.
9. Operation Preview is the common approval boundary for every state-changing
   operation. Its user-facing action is `Review changes`.
10. Every Skill uses the `coffee-*` namespace, and its description states the
    trigger, operation, and boundary clearly.

## Design status

This is the design baseline for the next implementation cycle. It is not a
claim that the current implementation already satisfies every contract. The
implementation must be changed to conform to these documents, with evaluation
cases written before each behavior is rebuilt.
