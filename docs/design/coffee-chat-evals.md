# Coffee Chat evaluation repository

**Status:** Design baseline

**Date:** 2026-08-04

`coffee-chat-evals` is a separate repository that owns the evaluation system
for Coffee Chat. It is not a test folder copied into the Engine repository and
it is not a collection of personal Coffee Chat records.

## 1. Decision

The planned evaluation source of truth is:

```text
https://github.com/SonSangjoon/coffee-chat-evals
```

The repository name must match the `coffee-*` namespace. Its suite version is
independent from the Engine CalVer. Every report binds the exact:

- Engine repository and commit/release;
- `coffee-chat-evals` suite version and commit;
- adapter version;
- judge model/configuration version;
- threshold configuration version.

The Engine repository must not contain the canonical Gold/Pressure Case corpus,
judge prompts, private evaluation inputs, or benchmark reports. It may contain
small deterministic contract tests needed to protect production code and the
adapter contract.

## 2. Ownership boundary

| Repository                          | Owns                                                                                                      | Must not own                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `coffee-chat` Engine                | Skills, runtime, schemas, deterministic validators, production fixtures, and the Eval Adapter contract.   | Gold answers, personal records, judge decisions, or benchmark history.                    |
| `coffee-chat-evals`                 | Evaluation cases, public corpora, sealed inputs, judges, thresholds, runners, reports, and release gates. | Production behavior, personal Coffee Chat records, or an alternate Engine implementation. |
| Individual `coffee-chat-*` instance | User-approved Origins, Green Beans, provenance, and instance state.                                       | Evaluation corpora, Engine benchmark reports, or hidden judge data.                       |

The Eval repository tests the Engine as an external candidate through a stable
adapter. It must not reach into private Engine modules to make a failing test
pass. If the adapter cannot observe a required boundary, the evaluation fails
with `insufficient_observability`.

## 3. Repository shape

The target repository may use this structure:

```text
coffee-chat-evals/
├── README.md
├── evals/
│   ├── cases/
│   │   ├── public/
│   │   │   ├── init/
│   │   │   ├── sync/
│   │   │   ├── harvest/
│   │   │   ├── roast/
│   │   │   ├── brew/
│   │   │   ├── chat/
│   │   │   ├── pairing/
│   │   │   └── update/
│   │   └── sealed/
│   ├── judges/
│   ├── thresholds/
│   ├── adapters/
│   └── runners/
├── schemas/
│   ├── eval-case.schema.json
│   ├── eval-run.schema.json
│   └── eval-report.schema.json
└── .github/workflows/
    ├── smoke.yml
    └── release-gate.yml
```

The exact language and runner are implementation choices. The ownership and
separation are not.

### Public cases

Public cases contain synthetic or explicitly consented inputs that another
maintainer can reproduce. They should make it possible to understand what the
suite measures without exposing a person's private Taste.

### Sealed cases

Sealed cases test memorization, prompt overfitting, and hidden boundary
failures. Their inputs and expected judgments are not shipped in the Engine
repository or exposed to the candidate during a run. They may be supplied by a
protected branch, CI secret, or private evaluation source owned by the Eval
repository. The report records the suite identity and result, not the sealed
content.

## 4. Evaluation case contract

Every case is a complete user scene, not only a prompt:

```text
EvalCase {
  case_id
  suite_version
  scene
  starting_state
  explicit_inputs
  allowed_read_set
  allowed_write_set
  protected_set
  expected_lifecycle_state
  expected_artifacts
  quality_rubric
  forbidden_behaviors
  evaluation_method
  privacy_class
}
```

### Required case properties

- `case_id` is stable and unique within the suite.
- `scene` uses only `Init`, `Sync`, `Harvest`, `Roast`, `Brew`, `Coffee
Chat`, `Coffee Pairing`, or `Update`.
- `starting_state` is reproducible without a personal instance.
- `explicit_inputs` distinguishes user-provided inputs from generated context.
- `allowed_read_set`, `allowed_write_set`, and `protected_set` are observable
  and exact.
- `expected_artifacts` describes the result without requiring one textual
  answer when multiple good answers are possible.
- `forbidden_behaviors` includes plausible failure modes, not only impossible
  actions.
- `privacy_class` prevents private or consented material from entering public
  reports.

## 5. Eval Adapter contract

The Engine exposes a stable adapter boundary. The Eval repository invokes the
candidate only through this boundary:

```text
EvalAdapter {
  adapter_version
  candidate_identity
  prepare(case)
  invoke(case)
  observe(case)
  collect_artifacts(case)
  cleanup(case)
}
```

The adapter must expose:

- candidate Engine version, commit, and package digest;
- selected `coffee-*` Skill and operation;
- repository identities and roles involved;
- read/write trace or an equivalent exact boundary observation;
- Operation Preview payload and approval binding when required;
- resulting files, remote actions, diffs, and Receipt;
- semantic output presented to the judge;
- cleanup status and any partial external result.

The adapter must not expose credentials, copy personal records, or allow the
Eval runner to silently widen the candidate's permissions.

## 6. Evaluation pipeline

```text
Select suite and candidate
        ↓
Create isolated case sandbox
        ↓
Invoke Engine through Eval Adapter
        ↓
Collect output, trace, Preview, diff, and Receipt
        ↓
Run deterministic contract gates
        ↓
Run semantic judge / pairwise comparison / human check
        ↓
Aggregate thresholds
        ↓
Publish redacted report
```

The runner must execute cases in randomized order when order could affect the
result, isolate filesystem and repository state per case, and clean up after a
run. A failed cleanup is itself a failed case when it leaves external state.

## 7. Evaluation methods

### Deterministic contract gates

These run without an LLM and are mandatory:

- target identity and repository-role verification;
- `coffee-*` Skill name and routing checks;
- exact read/write/protected-set checks;
- Operation Preview presence and fingerprint binding;
- stale-target detection;
- Receipt/result reconciliation;
- no unapproved path or remote action;
- no personal content in Engine or work-repository artifacts;
- partial-result reporting.

One hard-gate failure fails the case regardless of semantic quality.

### Rubric judge

Use a pinned judge configuration for semantic criteria such as POV
recognizability, Taste fidelity, source grounding, and Coffee Chat usefulness.
The judge receives only the case's declared inputs, expected criteria, and
candidate output. It must not receive unrelated repository content.

The judge configuration binds model/version, prompt digest, temperature,
randomization seed, scoring scale, and threshold version. A judge score is
evidence, not permission to waive a deterministic boundary failure.

### Pairwise preference

For Roast, Brew, and Coffee Chat, compare the candidate against a baseline that
intentionally flattens or loses Taste. Randomize presentation order and hide
the candidate label. Record preference, rationale, and confidence.

### Human confirmation

Human confirmation is reserved for the product truths that an automated judge
cannot establish alone:

- the author recognizes the first Green Bean as their POV;
- the author recognizes the first Coffee Chat as reflecting their Taste.

Human inputs must be consented and must not be committed into the Engine.

## 8. Suite coverage

The initial public suite must include at least:

| Scene          | Required cases                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Init           | no repository, unrelated repository, invalid name, existing target, partial remote result          |
| Sync           | work repository, session-only, engine target, edited integration, record-copy temptation           |
| Harvest        | one Origin, many Origins, summary-only, Origin-as-instruction, Unknown preservation                |
| Roast          | contextual relevance, irrelevant record, tension preservation, single-record overreach             |
| Brew           | Taste application, Unknown preservation, data/instruction separation, ephemeral boundary           |
| Coffee Chat    | read-only, unconnected instance, Unknown preservation, Origin-as-instruction, Taste distinction    |
| Coffee Pairing | named target, no target, target-only diff, no write-back, reviewable change                        |
| Update         | preserve Green Beans, managed-file conflict, wrong target, connection-only refresh, partial result |

The public suite contains the reproducible scenario definitions. Sealed cases
extend these scenes without changing the public contract.

## 9. Thresholds and reports

The suite uses a vector of gates, not one global score:

1. hard contract gates must pass with zero violations;
2. no required quality dimension may fall below its minimum threshold;
3. pairwise Taste-fidelity preference must not regress against the accepted
   baseline;
4. privacy and cleanup checks must pass;
5. the report must identify each failed dimension and case.

Every report includes:

```text
EvalReport {
  report_id
  suite_version
  suite_commit
  candidate_identity
  adapter_version
  judge_configuration
  threshold_configuration
  started_at
  completed_at
  case_results[]
  aggregate_gates
  redacted_artifact_digests
  status
}
```

Reports must not include raw private Green Bean prose, credentials, hidden case
content, or a misleading single “Taste score.”

## 10. CI and release integration

### Engine pull requests

Engine CI runs deterministic contract tests locally and may invoke a small
public smoke subset from `coffee-chat-evals`. Pull requests do not need the
sealed suite unless the changed surface is marked release-critical.

### Engine releases

An Engine release candidate is passed to the Eval repository by immutable
commit, tag, package digest, or artifact reference. The Eval repository runs
the full public suite and the configured sealed suite, then returns a report
bound to that candidate.

The Engine release gate accepts only a report whose candidate identity exactly
matches the release candidate. A report for a different commit or package is
not evidence for the release.

### Eval suite changes

Changes to cases, judge configuration, thresholds, or adapter behavior are
versioned as Eval repository changes. A suite change must explain whether it
changes the measured contract, the measurement method, or only the runner.
Engine releases do not silently absorb an unrecorded suite change.

## 11. Privacy and provenance

- Public cases are synthetic or explicitly consented.
- Individual `coffee-chat-*` repositories are never crawled to create cases.
- The Engine repository never receives personal Green Bean bodies through CI.
- Sealed inputs are not printed in logs or reports.
- Reports use content digests and redacted summaries where possible.
- Each semantic judgment links to a case, judge configuration, and candidate
  identity.

## 12. Non-goals

`coffee-chat-evals` is not a production memory store, a user analytics system,
an alternate Engine, or a public ranking of people's Taste. It evaluates
whether Coffee Chat preserves source-grounded POV and respects its boundaries.

## 13. Implementation sequence

After this repository contract is approved:

1. create the independent `coffee-chat-evals` repository;
2. define the case, adapter, run, and report schemas there;
3. implement the Engine adapter surface and one public case per scene;
4. add deterministic gates before semantic judges;
5. add pinned rubric and pairwise evaluation;
6. Engine PR smoke runs and release-gate runs;
7. expand the suite and add sealed cases without changing the Engine's product
   language.
