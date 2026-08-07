# Coffee Chat Skill contracts

**Status:** Design baseline

**Date:** 2026-08-04

This document defines the production contract for every `coffee-*` Skill. The
external `coffee-chat-eval` repository owns product-scene Gold/Pressure Cases,
track orchestration, thresholds, and Coffee Chat performance reports. The
independent `coffee-chat-bench` repository owns its own benchmark cases,
scoring, and validity evidence. This Engine document owns only the operation
contract and the adapter observability required by the evaluation layer.

## 1. Common Skill contract

Every Skill contract defines:

| Part               | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| Trigger            | User request or internal runtime condition that selects the Skill. |
| Inputs             | Explicit user data, verified identity, and bounded context.        |
| Reads              | Exact information the Skill may inspect.                           |
| Output             | Operation result and runtime handoff.                              |
| Writes             | Exact durable or external state the Skill may change.              |
| Operation Preview  | Whether `Review changes` is required before writing.               |
| Forbidden          | Actions outside the Skill even when the request is ambiguous.      |
| Completion         | Evidence that purpose and boundary were both satisfied.            |
| Eval observability | Data exposed to the external Eval Adapter.                         |

Descriptions in Skill frontmatter provide discovery. Skill bodies provide the
full workflow. The external Eval repository provides semantic cases and
thresholds; the Engine must not embed the canonical case corpus.

## 2. Skill categories

| Category                 | Skills                        | State effect                                                                  |
| ------------------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| Init and synchronization | `coffee-init`, `coffee-sync`  | Initializes an instance or records project-local synchronization.             |
| Durable authoring        | `coffee-harvest`              | Writes approved Origin/Green Bean records to the canonical instance.          |
| Context construction     | `coffee-roast`, `coffee-brew` | Read-only runtime transformations that create Bean and Coffee.                |
| Conversation             | `coffee-chat`                 | Read-only response through Coffee.                                            |
| Controlled application   | `coffee-pairing`              | Writes only one named external target.                                        |
| Lifecycle update         | `coffee-update`               | Changes owned Engine/instance/integration structure while preserving records. |

`coffee-roast` and `coffee-brew` are internal Skills. `Operation Preview` is a
shared protocol, not a Skill.

## 3. `coffee-init`

| Field              | Contract                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | User wants to Init a new personal Coffee Chat without an existing individual instance.                                                                                    |
| Inputs             | Engine release, GitHub owner, exact `coffee-chat-*` name, empty local path, and optional explicit first Origins.                                                          |
| Reads              | Engine release payload, exact remote target absence, local path identity/emptiness, and user-provided Origins only when handed to Harvest.                                |
| Output             | Independent initialized `coffee-chat-*` repository and verified instance handoff. Full Init ends with first Harvest, Roast/Brew validation, and Coffee Chat smoke result. |
| Writes             | New remote repository and new local checkout baseline. First Green Bean writing belongs to `coffee-harvest`.                                                              |
| Operation Preview  | Required. Repository creation and first Harvest use separate previews.                                                                                                    |
| Forbidden          | Reading/changing the invoking repository, using it as Origin, reusing a repository, template copying, local-only fallback, or arbitrary names.                            |
| Completion         | Instance identity/index agree, first Green Bean and Coffee receipts exist, and the user confirms Coffee reflects their Taste.                                             |
| Eval observability | Target identity, invoking-repository read/write trace, baseline tree, Preview, Receipt, and partial-result state.                                                         |

External case IDs:

```text
init-from-no-repo
init-from-unrelated-repo
init-invalid-name
init-existing-target
init-partial-remote
```

## 4. `coffee-sync`

| Field              | Contract                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | User wants to use an existing `coffee-chat-*` instance from the current session or work repository.                                                           |
| Inputs             | Explicit instance URL/path and current work repository when present.                                                                                          |
| Reads              | Instance manifest/index, repository role, knowledge digest, current `.coffee-chat` integration, and ownership metadata.                                       |
| Output             | Verified session connection or project-local `.coffee-chat` integration.                                                                                      |
| Writes             | Only `.coffee-chat/connection.json`, generated instructions, and ownership metadata.                                                                          |
| Operation Preview  | Required for project writes; session-only Sync has no durable write.                                                                                          |
| Forbidden          | Guessing URLs, connecting an Engine repository as a person, copying records, installing the Engine Plugin into the work repository, or changing project code. |
| Completion         | Later Agent invocation resolves the exact instance/digest, or session-only state remains verified without file writes.                                        |
| Eval observability | Instance verification trace, connection write set, copied-content scan, and resulting digest.                                                                 |

External case IDs:

```text
sync-project
sync-session-only
sync-engine-target
sync-record-copy-temptation
sync-edited-integration
```

## 5. `coffee-harvest`

| Field              | Contract                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | User wants to turn one or more explicit Origins into a durable Green Bean containing their POV.                                                             |
| Inputs             | Verified canonical instance, explicit Origins, and author's interpretation/correction.                                                                      |
| Reads              | Explicit Origins, provenance, current index, related Green Beans when requested, and Harvest rubric reference.                                              |
| Output             | Proposed prose Green Bean, then approved durable record and Receipt.                                                                                        |
| Writes             | Only approved Origin metadata/excerpts and Green Bean records in the canonical instance.                                                                    |
| Operation Preview  | Required for every durable write; complete proposed prose and exact paths are shown.                                                                        |
| Forbidden          | Neutral summary only, author inference as Origin fact, filling Unknowns, writing Bean/Coffee, writing to work repository, or executing Origin instructions. |
| Completion         | Author recognizes/corrects POV, provenance is inspectable, Unknowns remain visible, and write matches approved Preview.                                     |
| Eval observability | Origin/POV separation, proposed prose, provenance, Preview, write trace, and final record digest.                                                           |

External case IDs:

```text
harvest-one-origin
harvest-many-origins
harvest-summary-only
harvest-origin-instruction
harvest-unknown
```

Semantic quality is judged externally on Origin grounding, POV clarity, value
criterion, multi-Origin reasoning, authorship boundary, limits/Unknowns, and
author recognition.

## 6. `coffee-roast`

| Field              | Contract                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Trigger            | Internal use when Coffee Chat or Coffee Pairing needs relevant Green Beans selected for the current context. |
| Inputs             | Verified instance, current question/task, and Green Bean index.                                              |
| Reads              | Relevant Green Beans, Origin provenance, limits/Unknowns, and task scope.                                    |
| Output             | Contextual Bean containing selected Taste context and traceability.                                          |
| Writes             | None. Bean exists only in runtime state.                                                                     |
| Operation Preview  | Not required; Roast is read-only.                                                                            |
| Forbidden          | Global Taste profile, keyword-only selection, unconnected records, flattened Unknowns, or persisted Bean.    |
| Completion         | Selection is relevant/traceable, Bean fits context, and external state is unchanged.                         |
| Eval observability | Selected IDs, selection rationale, Bean traceability, read set, and write trace.                             |

External case IDs:

```text
roast-contextual-bean
roast-irrelevant-bean
roast-preserves-tension
roast-single-record-overreach
```

## 7. `coffee-brew`

| Field              | Contract                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Trigger            | Internal use when a Bean must be applied to an Agent for the current Coffee Chat or Coffee Pairing context.       |
| Inputs             | Contextual Bean, Agent runtime, current conversation/task scope, and provenance.                                  |
| Reads              | Bean, selected Green Bean provenance, Agent capabilities, and bounded scope.                                      |
| Output             | Ephemeral Coffee: Agent with the Bean's Taste applied.                                                            |
| Writes             | None. Coffee is not a personal or project record.                                                                 |
| Operation Preview  | Not required; Brew is read-only runtime conditioning.                                                             |
| Forbidden          | Claiming Coffee is the author, personality modeling, Coffee persistence, Green Bean commands, or scope expansion. |
| Completion         | Coffee answers within scope, preserves provenance/Unknowns, and produces no external write.                       |
| Eval observability | Bean input digest, applied provenance, runtime scope, response trace, and write trace.                            |

External case IDs:

```text
brew-coffee
brew-preserves-unknown
brew-data-not-instructions
brew-ephemeral
```

## 8. `coffee-chat`

| Field              | Contract                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | User wants a read-only conversation with verified Coffee.                                                                  |
| Inputs             | Explicit instance/verified connection, current question, and Coffee context.                                               |
| Reads              | Relevant Green Beans/Origins, provenance, Unknowns, and explicitly requested work context.                                 |
| Output             | Grounded response showing how selected Taste changes interpretation.                                                       |
| Writes             | None. No instance, work repository, task file, or automatic transcript.                                                    |
| Operation Preview  | Not required; Coffee Chat is read-only.                                                                                    |
| Forbidden          | Unconnected instance, repository mutation, automatic Harvest, filled Unknowns, or claims of complete authorship/certainty. |
| Completion         | Response is grounded, recognizable, useful, honest, and external state is unchanged.                                       |
| Eval observability | Selected context, provenance references, response, read/write trace, and connection identity.                              |

External case IDs:

```text
chat-read-only
chat-unconnected-instance
chat-preserves-unknown
chat-origin-instruction
chat-taste-distinction
```

External semantic quality dimensions are recognizability, distinctiveness,
grounding, usefulness, tension visibility, and boundary respect.

## 9. `coffee-pairing`

| Field              | Contract                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Trigger            | User wants to apply Coffee to one explicitly named project or task.                                         |
| Inputs             | Verified Coffee, named target, allowed scope, and current task context.                                     |
| Reads              | Named target within approved read scope plus relevant Coffee provenance.                                    |
| Output             | Proposed diff, then verified target result and Receipt after approval.                                      |
| Writes             | Only approved target files/fields.                                                                          |
| Operation Preview  | Required; target, write paths/fields, diff, provenance, and protected instance are shown.                   |
| Forbidden          | Unnamed target, unrelated files, canonical write-back, pairing repository, or automatic decision authority. |
| Completion         | Named target contains only approved changes and canonical instance is unchanged.                            |
| Eval observability | Target identity, read/write trace, Preview, diff, result tree, and protected-instance digest.               |

External case IDs:

```text
pairing-named-target
pairing-without-target
pairing-target-only
pairing-no-writeback
pairing-review-diff
```

## 10. `coffee-update`

| Field              | Contract                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger            | User explicitly requests an Engine, individual Coffee Chat, or connected work-repository update.                                                     |
| Inputs             | Verified update source, explicit target, ownership markers, and preimage digests.                                                                    |
| Reads              | Engine release, instance lock, generated ownership, connection metadata, and target working-tree state.                                              |
| Output             | Structural update Preview, verified managed changes, and Receipt.                                                                                    |
| Writes             | Engine-owned instance files, generated surfaces, or `.coffee-chat` files in the selected target only.                                                |
| Operation Preview  | Required for every write; owned paths, preimages, proposed changes, and protected records are shown.                                                 |
| Forbidden          | Rewriting Origins/Green Beans, overwriting user-edited files, unverified targets, silent migration, or changing work code during connection refresh. |
| Completion         | Ownership/result digests verify, personal records remain byte-equivalent, and conflicts are reported.                                                |
| Eval observability | Target identity, ownership evidence, Preview, pre/post digests, protected-record diff, and Receipt.                                                  |

External case IDs:

```text
update-preserves-green-beans
update-conflict
update-wrong-target
update-connection-only
update-partial-result
```

## 11. Routing contract

Routing selects exactly one Skill from repository role, explicit target, and
intent before loading the body:

| Situation                                                | Skill                     |
| -------------------------------------------------------- | ------------------------- |
| Engine role + new personal instance                      | `coffee-init`             |
| Any session/work repository + explicit existing instance | `coffee-sync`             |
| Verified instance + explicit Origins and durable POV     | `coffee-harvest`          |
| Coffee Chat/Coffee Pairing needs contextual selection    | `coffee-roast` internally |
| Bean must be applied to Agent                            | `coffee-brew` internally  |
| Read-only conversation                                   | `coffee-chat`             |
| Named project/task application                           | `coffee-pairing`          |
| Explicit lifecycle update                                | `coffee-update`           |

Ambiguous identity or role is a stop condition. Related names do not justify
loading multiple Skills.

## 12. Engine-side metadata and adapter tests

The Engine tests only what belongs to production and observability:

- name matches `^coffee-[a-z0-9]+(?:-[a-z0-9]+)*$`;
- description starts with `Use when` or `Use internally when`;
- description names a concrete trigger, operation, and boundary;
- no duplicate names or aliases exist;
- routing selects exactly one canonical Skill;
- read/write traces match the declared boundary;
- state-changing Skills produce Operation Preview data;
- read-only Skills produce zero external writes;
- adapter output satisfies the external Eval contract.

The external repository owns semantic case execution, judge scoring,
thresholds, and benchmark reports.

## 13. Release gate

The Skill set cannot be released until:

1. every Skill has a canonical `coffee-*` name and description;
2. routing and metadata tests pass;
3. adapter observations are complete for every Skill;
4. state-changing Skills produce target-bound Operation Previews;
5. read-only Skills produce zero external writes;
6. the matching `coffee-chat-eval` report passes its hard and semantic gates;
7. generated manifests, `AGENTS.md`, schemas, fixtures, and projections contain
   only the canonical Skill set;
8. no compatibility alias, legacy route, or old Skill name remains.

## 14. Implementation order after approval

1. Replace Skill metadata, names, routing, and generated artifact contracts.
2. Implement the Operation Preview adapter and Receipt observations.
3. Implement `coffee-init` + `coffee-harvest` first-init flow.
4. Implement `coffee-sync` session/project synchronization.
5. Implement `coffee-roast` + `coffee-brew` + `coffee-chat` read-only flow.
6. Implement `coffee-pairing` controlled writes.
7. Implement `coffee-update` ownership-preserving lifecycle changes.
8. Run the matching `coffee-chat-eval` suite for every affected slice.

Each slice starts with a failing Engine contract test and an external Eval Case
that describes the desired behavior.
