# Coffee Chat evaluation design

**Status:** Evaluation baseline

**Date:** 2026-08-04

Coffee Chat is an AI system. A design is incomplete until the system can show
that an input produces the intended result, respects the intended boundary, and
does not merely produce fluent text. Evaluation therefore precedes the next
implementation of each Skill.

## 1. Evaluation principles

### User scenes are the unit of evaluation

The primary unit is not an isolated prompt. It is a complete user scene:

```text
starting state → explicit input → system operation → artifact/output → user confirmation
```

The test must cover both the useful result and the prohibited side effect.

### Gates and quality are different

Every scene has two kinds of checks:

1. **Contract gates:** deterministic checks for identity, files, provenance,
   read/write boundaries, and lifecycle state.
2. **Quality evaluation:** rubric, pairwise preference, human confirmation, or
   a combination for POV and conversational quality.

A fluent output cannot pass a failed contract gate. A technically safe output
cannot pass a quality gate if it loses the author's POV.

### No single score represents Taste

Taste is contextual and source-grounded. The evaluator keeps a score vector and
failure reasons instead of reducing the product to one global Taste number.
An aggregate may be used for release comparison, but never as the only gate.

## 2. Gold case format

Gold cases are synthetic or explicitly consented examples. They must not copy a
user's private Coffee Chat repository into the Engine repository.

Each case contains:

```text
case_id
scene: build | connect | harvest | roast | brew | chat | pairing | update
starting_state
explicit_inputs
allowed_read_set
allowed_write_set
expected_lifecycle_state
quality_rubric
forbidden_behaviors
reference_evidence
judge_configuration
```

`allowed_read_set` and `allowed_write_set` are part of the gold answer. This
makes repository isolation testable rather than an instruction that is only
checked in a transcript.

Every gold case should have:

- a positive example that satisfies the contract;
- at least one plausible but wrong example;
- a boundary/failure example;
- an explanation of why the wrong example fails.

## 3. Contract gates by scene

| Scene          | Hard gates                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build          | New target is independent; name matches `coffee-chat-*`; invoking repository is not read or changed; baseline files are complete; instance identity and index agree; partial state is recoverable. |
| Connect        | Instance URL is explicit and verified; repository role and index match; only `.coffee-chat` integration files are written; no personal record is copied.                                           |
| Harvest        | Only explicit Origins enter; each Green Bean has a valid integrity envelope; Origin and POV remain distinguishable; the write is explicit and inspectable.                                         |
| Roast          | Selected Green Beans are traceable; output is contextual; no durable Bean/Taste profile is created; irrelevant records are not silently used.                                                      |
| Brew           | Coffee references the current Bean and Agent context; provenance survives; no personal record or work file is written.                                                                             |
| Coffee Chat    | No external write occurs; unconnected data is not read; Unknown remains Unknown; the answer cites or identifies relevant Green Beans when needed.                                                  |
| Coffee Pairing | One target is explicitly named; read/write scope is exact; only approved target changes; the individual repository is unchanged.                                                                   |
| Update         | Ownership preimages are verified; user-authored records remain byte-equivalent; only the selected repository changes; conflicts stop the operation.                                                |

## 4. Green Bean quality rubric

Harvest should produce prose that carries a POV, not a polished summary that
hides the author. A baseline judge scores each dimension from `0` to `3`:

| Dimension              | `0`                                                      | `3`                                                                                      |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Origin grounding       | The body cannot be traced to the supplied Origins.       | Claims and observations are traceable to one or more named Origins.                      |
| POV clarity            | The body is a neutral recap or generic advice.           | The author's interpretation and stance are unmistakable.                                 |
| Value criterion        | No reason is given for what was emphasized.              | The value criterion, trade-off, or priority is explicit.                                 |
| Multi-Origin reasoning | Origins are copied side by side or falsely merged.       | Connections and differences across Origins are explained when multiple Origins are used. |
| Authorship boundary    | Author inference is presented as Origin fact.            | Origin content, author judgment, and inference are clearly separated.                    |
| Limits and Unknowns    | Gaps are hidden or filled with invention.                | Relevant limits, disagreement, and Unknowns are named.                                   |
| Author recognition     | The author would not recognize the result as their view. | The author can recognize and correct the view as their own.                              |

Initial Harvest gate:

- no contract gate may fail;
- no dimension may score below `2` on the gold set;
- the author must be able to correct the body without rewriting a rigid form;
- the body must contain a source-grounded POV rather than only an Origin
  summary.

The last condition is categorical: a high-fluency summary is not a passing
Green Bean.

## 5. Roast quality rubric

Roast is judged against the current question or task, not against an abstract
global Taste profile.

| Dimension    | Evaluation question                                                            |
| ------------ | ------------------------------------------------------------------------------ |
| Relevance    | Were the Green Beans selected because they matter to this context?             |
| Coverage     | Does the Bean preserve the value criteria needed for the context?              |
| Compression  | Does it remove irrelevant detail without flattening the POV?                   |
| Traceability | Can each important Taste element be traced to selected Green Beans?            |
| Context fit  | Does it avoid applying a criterion outside the situation where it belongs?     |
| Restraint    | Does it avoid inventing a stable preference from one weak or unrelated record? |

Roast fails when it produces a permanent profile, selects records solely by
keyword, or removes the uncertainty that was present in the Green Beans.

## 6. Brew quality rubric

Brew is successful when Coffee behaves like an Agent carrying the current
Bean's Taste, not like a new person or an instruction executor.

| Dimension                   | Evaluation question                                                   |
| --------------------------- | --------------------------------------------------------------------- |
| Taste fidelity              | Does the Agent's interpretation reflect the relevant Bean?            |
| Provenance                  | Can the applied Taste be traced to the Bean and Green Beans?          |
| Scope                       | Is the context limited to the current conversation or named task?     |
| Data/instruction separation | Are Origins and Green Beans treated as evidence rather than commands? |
| Uncertainty honesty         | Does Coffee preserve Unknowns instead of manufacturing confidence?    |
| Ephemeral boundary          | Does Brew avoid writing durable personal or project state?            |

## 7. Coffee Chat quality rubric

A good Coffee Chat is not simply an agreeable or verbose answer. It lets the
user experience how a particular Taste changes interpretation.

| Dimension          | Evaluation question                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| Recognizability    | Does the user recognize the author's recurring value criteria in the response?       |
| Distinctiveness    | Would a different Bean plausibly produce a meaningfully different emphasis?          |
| Grounding          | Are important claims anchored in the available Origins/Green Beans?                  |
| Usefulness         | Does the answer help the user think, compare, or act within the asked scope?         |
| Tension visibility | Does it surface relevant trade-offs instead of hiding them behind certainty?         |
| Boundary respect   | Does it avoid claiming authorship, making an automatic decision, or saving a record? |

For the first Build validation, author confirmation is required in addition to
the rubric. The author should be able to answer “this reflects what I value and
how I interpret information” or identify a concrete correction.

## 8. Coffee Pairing quality rubric

Pairing is evaluated as a controlled application, not as a general Agent
performance benchmark.

| Dimension          | Evaluation question                                                    |
| ------------------ | ---------------------------------------------------------------------- |
| Target specificity | Is the named project/task unambiguous?                                 |
| Work relevance     | Does the result address the target rather than merely restating Taste? |
| Taste application  | Is the author's value criterion visible in the applied work?           |
| Change clarity     | Can a reviewer understand what changed and why?                        |
| Write boundary     | Did only approved target files or fields change?                       |
| Origin protection  | Did the individual Coffee Chat repository remain unchanged?            |

## 9. Evaluation methods

### Deterministic tests

Use filesystem snapshots, manifest validation, digest comparison, import/write
tracing, and repository identity checks for all contract gates. These tests must
run without an LLM and must fail closed on an unknown path or ambiguous
identity.

### LLM-as-judge

Use a pinned judge configuration for rubric scoring when semantic judgment is
required. The judge receives the gold case, the relevant Origins/Green Beans,
the output, and the rubric. It does not receive unrelated repository content.
Judge prompts, model/version, temperature, ordering, and threshold are bound in
the evaluation fixture so a later run is reproducible.

LLM judges are one signal, not the source of truth. A judge result cannot waive
a deterministic boundary failure or replace author confirmation for the first
Green Bean.

### Pairwise preference

For Roast, Brew, and Coffee Chat, compare the candidate output with a baseline
that intentionally loses or flattens Taste. Record which output better preserves
the author's POV, why, and whether the difference is meaningful. Randomize
presentation order and keep the judge blind to the candidate label.

### Human confirmation

Human confirmation is required at two product moments:

1. the author approves the first Green Bean as a faithful, correctable POV;
2. the author confirms the first Coffee Chat reflects their Taste.

Human confirmation does not replace automated regression tests. It provides the
ground truth that the system's representation is recognizable to its owner.

## 10. Initial gold-case suite

The first implementation cycle must define at least these cases:

| Case                           | What it proves                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `build-from-no-repo`           | Build creates a new `coffee-chat-*` repository and does not touch the invoking repository. |
| `build-from-unrelated-repo`    | The same isolation holds when Build is invoked inside an existing work repository.         |
| `harvest-one-origin`           | One Origin can become a prose Green Bean with a visible POV.                               |
| `harvest-many-origins`         | Multiple Origins can be connected without forcing a 1:1 relationship or false agreement.   |
| `harvest-summary-only`         | A fluent neutral summary fails the Green Bean quality gate.                                |
| `connect-project`              | A work repository receives connection metadata only, not personal records.                 |
| `connect-session-only`         | A session without a work repository writes no project files.                               |
| `roast-contextual-bean`        | Roast selects contextual Taste and does not create a global profile.                       |
| `brew-coffee`                  | Brew applies Taste to an Agent and keeps the result ephemeral.                             |
| `chat-preserves-unknown`       | Coffee Chat does not turn missing information into certainty.                              |
| `chat-read-only`               | Coffee Chat produces no external write.                                                    |
| `pairing-named-target`         | Coffee Pairing changes only the named work target.                                         |
| `pairing-without-target`       | No target means no write.                                                                  |
| `update-preserves-green-beans` | An Engine update can change owned structure without changing personal records.             |
| `update-conflict`              | A user-edited managed file stops the update instead of being overwritten.                  |

## 11. Release gates

An Engine release that changes Build, Connect, Harvest, Roast, Brew, Coffee
Chat, Coffee Pairing, or Update must pass:

1. all deterministic contract gates for affected scenes;
2. all Green Bean hard conditions and rubric thresholds on the gold suite;
3. no regression in pairwise Taste-fidelity preference against the previous
   accepted baseline;
4. the first-build human confirmation flow in a synthetic or consented fixture;
5. privacy review confirming that no personal records entered the Engine or
   evaluation artifacts;
6. a clean generated artifact and documentation consistency check.

If a change improves fluency but reduces POV recognizability, source grounding,
or write-boundary safety, it does not pass. The evaluation result should explain
which criterion failed rather than hide the trade-off in a single score.

## 12. Next design scope

This document defines when a Preview is required but not how the Preview should
look or feel. The next design task is a dedicated Skill Preview contract that
defines the preview payload, diff/read/write presentation, approval identity,
stale-preview detection, cancellation, and recovery for Build, Harvest,
Connect, Coffee Pairing, and Update.
