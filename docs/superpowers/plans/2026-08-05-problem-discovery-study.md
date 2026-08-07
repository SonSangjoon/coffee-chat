# Problem Discovery Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the first real-case discovery-study protocol and candidate-agnostic case template needed to validate the Coffee Chat problem before revising the benchmark construct or implementing new benchmark behavior.

**Architecture:** Keep the parent workspace problem definition as the normative hypothesis. Store the human/research protocol with the product research documentation and store the candidate-agnostic case contract with `coffee-chat-bench`. `coffee-chat-eval` is the later cross-track orchestration/reporting layer and is out of scope for this discovery study. Do not add runtime schemas, evaluator logic, product features, or public benchmark claims until the discovery study produces evidence.

**Tech Stack:** Markdown, Git, existing Coffee Chat documentation, existing `coffee-chat-bench` candidate-agnostic concepts. No new runtime dependency.

## Global Constraints

- Treat [PROBLEM-VALIDATION.md](/Users/sangjoon/Coding/coffee-chat/PROBLEM-VALIDATION.md) as the approved problem-definition input, not as proof that the problem is true.
- The first study measures source-grounded selection and prioritization among defensible candidates under a stated purpose, audience, and constraint.
- `Taste` is a hypothesis about recurring judgment patterns, not a score, gold label, or universal quality standard.
- The main `coffee-chat` vocabulary must not introduce `persona`.
- `coffee-chat-bench` documentation must remain implementation-agnostic and must not require Origin, Green Bean, Bean, Coffee, or private product types.
- Synthetic cases may test schema and evaluator mechanics, but they cannot support claims about real-world utility or benchmark validity.
- Human utility judgments, target/decision-owner judgments, and factual/provenance checks remain separate evidence layers.
- Do not modify product implementation, implementation tests, benchmark evaluator code, benchmark schemas, or current benchmark scores in this plan.
- Preserve unrelated existing working-tree changes in both repositories. Stage only the files named by each task.
- Use BetterBench design, implementation, documentation, and maintenance criteria as the validation checklist; report uncertainty and limitations explicitly.

---

## File map

| File                                                              | Responsibility                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coffee-chat/docs/research/2026-08-05-problem-discovery-study.md` | Human-case discovery protocol: purpose, sampling, case construction, annotation, controls, execution, analysis, and go/pivot rules.                     |
| `coffee-chat-bench/docs/discovery-case-template.md`               | Candidate-agnostic case template and example fields for source evidence, context, alternatives, judgments, contrasts, holdout, and outcome measurement. |
| `PROBLEM-VALIDATION.md`                                           | Approved parent-level problem definition and validity obligations; read-only input during this plan.                                                    |

The two new documents communicate through the case identifiers and field names
defined in the case template. The protocol owns why and how cases are created;
the template owns what one case must contain.

## Task 1: Write the discovery-study protocol

**Files:**

- Create: `coffee-chat/docs/research/2026-08-05-problem-discovery-study.md`
- Read: `/Users/sangjoon/Coding/coffee-chat/PROBLEM-VALIDATION.md`
- Read: `/Users/sangjoon/Coding/coffee-chat/BENCHMARK-THESIS.md`
- Read: `/Users/sangjoon/Coding/coffee-chat/VALUE-OPTIMIZATION.md`

**Interfaces:**

- Consumes: the approved problem statement, H1–H5, BetterBench obligations, and the parent distinction between external benchmark value and implementation tests.
- Produces: a repeatable human-case study protocol that can produce evidence for or against the problem definition without changing benchmark code.

- [ ] **Step 1: Define the study purpose and claims boundary**

Write the opening sections with these exact headings and decisions:

```markdown
## Purpose

This is a discovery study, not a public benchmark and not a leaderboard.
Its purpose is to determine whether factually defensible alternatives have
different task utility under target and context conditions, and whether
source-grounded judgment traces explain that difference.

## Claims this study may support

- that the selected task contains observable judgment variation;
- that independent evaluators can identify some utility differences;
- that a candidate can be compared against explicit controls on held-out cases.

## Claims this study may not support

- a universal Taste score;
- human-level general intelligence;
- generalization across all domains;
- product value without an independent utility measure;
- a validated public benchmark.
```

Use these remaining protocol headings exactly so the document can be checked
without semantic guessing:

```markdown
## Task family and unit of analysis

## Discovery sample and exclusions

## Case authoring and provenance

## Human annotation

## Controls and contrast cases

## Observation and analysis

## Go, pivot, and stop rules

## Reproducibility and data governance

## Handoff
```

- [ ] **Step 2: Specify the first task family and unit of analysis**

Define the task family as source-grounded selection/prioritization among 3–5
factually defensible candidates under a purpose, audience, and constraint.
Define one `case_family` as one source and one decision owner/context family;
define one `episode` as one target/context/candidate decision. State that every
case family must contain at least one novel candidate or recombination, one
irrelevant perturbation, and one decision-relevant context contrast.

Include the episode lifecycle:

```text
source evidence
→ target judgment traces
→ current task/context
→ defensible candidates
→ candidate decision
→ criterion/evidence/uncertainty
→ blind utility judgment and correction measurement
```

- [ ] **Step 3: Define the discovery sample and exclusions**

Specify a starting sample of 8–12 real case families in one low-stakes domain
where source provenance and outcome judgments can be collected. State that the
sample is for assumption discovery and evaluator calibration, not statistical
leaderboard ranking. Exclude cases with a single factual answer, no meaningful
alternative, no observable omission cost, no identifiable decision owner, or
no way to obtain an independent utility judgment.

- [ ] **Step 4: Define case authoring and data provenance**

Document the authoring sequence:

1. Record the original source and provenance.
2. Extract only facts available before the decision.
3. Record unknowns, stale/conflicting evidence, and future-information
   boundaries.
4. Record the decision owner's prior judgments and reasons without converting
   them into a global rule.
5. Create 3–5 candidates that are factually defensible but differ in relevant
   trade-offs.
6. Define the current context and the expected decision-relevant contrast.
7. Seal the target judgment, conditional acceptability, omission cost, and
   outcome labels from the candidate under evaluation.

Require provenance for source facts and a written reason for every candidate's
inclusion. Do not generate the target gold labels with the system being tested.

- [ ] **Step 5: Define the human annotation protocol**

Separate three roles:

| Role                | Responsibility                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| Decision owner      | States the actual purpose, constraint, judgment, and acceptable trade-offs.     |
| Domain reviewer     | Checks factual sufficiency, candidate defensibility, and domain-specific risks. |
| Blind utility rater | Compares candidate outputs without seeing system identity or intended answer.   |

For each episode, collect:

- acceptable decisions;
- conditionally acceptable decisions;
- plausible but wrong decisions;
- forbidden or unsafe decisions;
- criterion and trade-off explanation;
- evidence support;
- omission cost;
- confidence and disagreement;
- blind pairwise utility preference;
- correction time or edit burden when an artifact is produced.

Record disagreement rather than forcing one canonical answer. A case cannot
become gold merely because one author prefers one option.

- [ ] **Step 6: Define controls and contrast cases**

Require these controls where the case allows them:

```text
facts-only
raw-history
retrieval-only
explicit-rule
style-controlled
human decision
random / majority baseline
```

Require two paired perturbation types:

```text
irrelevant change → decision should remain stable
decision-relevant change → decision should change appropriately
```

Require a held-out candidate or recombination so that reproducing an observed
decision is not counted as criterion transfer.

- [ ] **Step 7: Define the observation and analysis plan**

The protocol must report separate dimensions:

- factual/provenance gate;
- decision action and selection/exclusion;
- criterion-to-decision consistency;
- evidence support;
- context sensitivity;
- irrelevant-perturbation invariance;
- held-out transfer;
- hold/ask calibration;
- blind utility;
- correction burden;
- latency and cost when available.

For the discovery study, use paired comparisons within case families. Report
the number of cases, number of raters, agreement/disagreement, effect size,
confidence interval or bootstrap interval, and missing/outcome-unavailable
cases. Do not collapse the dimensions into one Taste score.

- [ ] **Step 8: Define go, pivot, and stop rules**

Continue toward benchmark design only if the study observes utility differences
among factually valid alternatives, independent raters recover some of those
differences, at least one control is separable, held-out transfer is testable,
and one decision metric relates to an independent outcome.

Pivot to a personalized regression suite or domain-specific benchmark if the
effect is only explicit preference following, only style, only one private
case, or lacks an independent utility surface. Stop the benchmark claim if the
case cannot establish a meaningful difference or if the evaluator is less
reliable than the phenomenon it is supposed to measure.

- [ ] **Step 9: Add reproducibility and data-governance rules**

Record case version, source snapshot, author, annotation roles, timestamp,
available-information boundary, candidate order randomization, model/config
version, run identifier, latency, token/tool cost, and evaluator version.
Keep sealed judgments separate from candidate-visible inputs. State licensing,
privacy, redaction, contamination, and release rules before any public release.

- [ ] **Step 10: Validate the document**

Run:

```bash
git -C coffee-chat diff --check -- docs/research/2026-08-05-problem-discovery-study.md
rg -n "^## (Purpose|Claims this study may support|Claims this study may not support|Task family and unit of analysis|Discovery sample and exclusions|Case authoring and provenance|Human annotation|Controls and contrast cases|Observation and analysis|Go, pivot, and stop rules|Reproducibility and data governance|Handoff)" coffee-chat/docs/research/2026-08-05-problem-discovery-study.md
```

Expected result: `git diff --check` prints no errors and every required
protocol section is present. Review the protocol against every H1–H5 and every
missing row in the BetterBench matrix before committing only this file.

- [ ] **Step 11: Commit the protocol document**

```bash
git -C coffee-chat add docs/research/2026-08-05-problem-discovery-study.md
git -C coffee-chat commit -m "docs: define problem discovery study"
```

## Task 2: Write the candidate-agnostic case template

**Files:**

- Create: `coffee-chat-bench/docs/discovery-case-template.md`
- Read: `coffee-chat-bench/README.md`
- Read: `coffee-chat-bench/src/taste.ts`
- Read: `coffee-chat-bench/schemas/taste-episode.schema.json`

**Interfaces:**

- Consumes: the study lifecycle and field semantics from Task 1.
- Produces: a case template that any candidate adapter can consume without importing Coffee Chat internals.

- [ ] **Step 1: Create the template header and case identity fields**

Define the document as a research-data template, not a runtime schema. Include
these required identity fields:

```yaml
case_id: "discovery-content-001"
case_family_id: "family-content-001"
study_version: "0.1.0"
domain: "content-curation"
split: "discovery|calibration|held-out"
decision_owner_id: "owner-001"
provenance_status: "verified|partial|unverified"
```

State that identifiers must be stable and pseudonymous, source licenses must be
recorded, and private target information must not be placed in a public case.

- [ ] **Step 2: Define the public evidence and unknowns sections**

Add fields for:

```markdown
## Source and provenance

- source references
- publication/observation time
- available-at-decision timestamp
- provenance notes

## Factual evidence

- fact id
- claim
- source reference
- confidence

## Unknowns and conflicts

- unknown id
- unavailable information
- stale or conflicting evidence
- prohibited future information
```

The candidate-visible projection must contain only information available at the
decision time. Sealed judgment and outcome fields must be clearly marked as
evaluator-only.

- [ ] **Step 3: Define target judgment traces without turning them into rules**

Use a repeated-judgment table:

| trace_id  | prior context | considered candidates | decision | stated reason | evidence refs | confidence |
| --------- | ------------- | --------------------- | -------- | ------------- | ------------- | ---------- |
| `trace-1` | ...           | ...                   | ...      | ...           | ...           | ...        |

Require at least two traces for a transfer case and require the author to mark
which parts are explicit, inferred, uncertain, or contradictory. Do not create
a single global preference list in the template.

- [ ] **Step 4: Define the current task, context, and candidate surface**

Add exact sections for:

```yaml
task_purpose: "Choose a shortlist for a time-constrained editorial review"
audience: "Editorial review owner"
stakes: "low|medium|high"
constraints:
  - "The shortlist must contain no more than three candidates"
decision_relevant_variables:
  - "The audience has five minutes rather than thirty minutes"
irrelevant_variables:
  - "The candidate display order is reversed"
allowed_actions: [select, rank, exclude, hold, ask]
```

Then define each candidate with an ID, factual description, evidence
references, relevant trade-offs, and expected omission cost. Candidates must be
factually defensible; a deliberately wrong candidate belongs in a separate
diagnostic field.

- [ ] **Step 5: Define sealed judgment and utility annotations**

Add evaluator-only sections for:

```markdown
## Sealed judgment package

- acceptable decisions
- conditional acceptable decisions and conditions
- plausible wrong decisions
- forbidden/unsafe decisions
- criterion anchors
- trade-off expectations
- evidence expectations
- uncertainty/hold expectation
- temporal/update rule

## Utility surface

- candidate utility
- omission cost
- action cost
- downstream outcome definition
- human acceptance/edit-time protocol
- disagreement distribution
```

State that utility values are not arbitrary numbers assigned only by the case
author. Each numeric or ordinal utility label must identify its source:
decision owner, independent panel, observed outcome, or calibrated rubric.

- [ ] **Step 6: Define contrast, holdout, and control metadata**

Add fields for:

```yaml
pair:
  pair_id: "pair-content-001"
  role: "anchor|contrast"
  perturbation: "none|irrelevant|decision-relevant|temporal|evidence-conflict"
  expected_relation: "same-decision|different-decision|independent"
matched_controls:
  - "facts-only"
  - "raw-history"
  - "retrieval-only"
  - "explicit-rule"
  - "style-controlled"
held_out_description: "A new candidate combination not present in prior traces"
```

The template must require a written rationale for the expected pair relation
and must reject a contrast whose only change is an untracked wording or style
change.

- [ ] **Step 7: Define candidate output and evaluation record**

Document the generic candidate output:

```yaml
decision:
  action: "select|rank|exclude|hold|ask"
  selected_ids: []
  ordered_ids: []
  excluded_ids: []
criterion: "Prefer durable, easy-to-explain candidates when audience attention is limited"
trade_off: "Accept less novelty in exchange for clearer downstream use"
evidence_refs: []
uncertainty:
  level: "low|medium|high"
  note: "The source does not establish whether the audience values novelty over depth"
artifact: "A three-item shortlist with one-sentence rationales"
```

Add evaluator records for hard gates, structured decision dimensions, blind
pairwise utility, correction burden, latency, token/tool cost, retries, and
judge/evaluator version. Make clear that the case template records
observations; it does not prescribe how a candidate internally represents
criteria.

- [ ] **Step 8: Add one fully worked neutral example**

Include a small, non-personal example with two factually defensible choices,
one context contrast, one irrelevant perturbation, one held-out candidate, and
one hold/ask boundary. Keep the example generic enough that it demonstrates the
fields without becoming a benchmark gold case.

- [ ] **Step 9: Validate the template against existing contracts**

Run:

```bash
rg -n "case_id|case_family_id|factual_evidence|target|context|candidates|allowed_actions|sealed|utility|omission|pair|held_out|controls|uncertainty" coffee-chat-bench/docs/discovery-case-template.md
git -C coffee-chat-bench diff --check -- docs/discovery-case-template.md
```

Expected result: every field needed by the study protocol and every required
contrast/control concept appears in the template, and `git diff --check`
prints no errors. Confirm that the document does not import Coffee Chat types
or require Green Bean, Bean, Coffee, or Coffee Chat fields.

- [ ] **Step 10: Commit the case template**

```bash
git -C coffee-chat-bench add docs/discovery-case-template.md
git -C coffee-chat-bench commit -m "docs: add discovery case template"
```

## Task 3: Cross-document self-review and study handoff

**Files:**

- Review: `PROBLEM-VALIDATION.md`
- Review: `coffee-chat/docs/research/2026-08-05-problem-discovery-study.md`
- Review: `coffee-chat-bench/docs/discovery-case-template.md`
- Do not modify: `coffee-chat-bench/src/`, `coffee-chat-bench/schemas/`, or product implementation files.

**Interfaces:**

- Consumes: the completed protocol and template from Tasks 1–2.
- Produces: a reviewed, internally consistent handoff for collecting the first real cases.

- [ ] **Step 1: Check problem-to-case traceability**

For each H1–H5 in `PROBLEM-VALIDATION.md`, record the exact protocol section
and case-template field that supplies evidence. The mapping must be:

| Hypothesis | Protocol evidence                                             | Case-template evidence                     |
| ---------- | ------------------------------------------------------------- | ------------------------------------------ |
| H1         | factually defensible candidate construction and blind utility | candidates, facts, utility surface         |
| H2         | controls and held-out study procedure                         | target traces, controls, held-out metadata |
| H3         | relevant/irrelevant contrast protocol                         | pair perturbation and expected relation    |
| H4         | independent outcome and correction measurement                | utility and outcome annotations            |
| H5         | repeated runs, paired comparison, and fixed study version     | evaluation record and version fields       |

- [ ] **Step 2: Run the documentation checks**

Run:

```bash
git -C coffee-chat diff --check -- docs/research/2026-08-05-problem-discovery-study.md
git -C coffee-chat-bench diff --check -- docs/discovery-case-template.md
rg -n "TBD|TODO|persona|global Taste score|public leaderboard" coffee-chat/docs/research/2026-08-05-problem-discovery-study.md coffee-chat-bench/docs/discovery-case-template.md
```

Expected result: no whitespace errors; no `TBD` or `TODO`; `persona` does not
appear in the main product research protocol; and any mention of a global
Taste score or public leaderboard appears only as an explicit non-goal.

- [ ] **Step 3: Preserve repository boundaries**

Run:

```bash
git -C coffee-chat status --short -- docs/research/2026-08-05-problem-discovery-study.md
git -C coffee-chat-bench status --short -- docs/discovery-case-template.md
git -C coffee-chat diff --name-only
git -C coffee-chat-bench diff --name-only
```

Confirm that only the two new documentation files are staged by this work and
that pre-existing changes in `coffee-chat` remain untouched.

- [ ] **Step 4: Create the study handoff note**

After the self-review, add a short handoff section to the protocol naming the
single next human action: recruit or identify the first decision owner and
collect the first case family using the template. Do not add a benchmark score,
leaderboard, or implementation task at this point.

- [ ] **Step 5: Commit only the handoff change**

```bash
git -C coffee-chat add docs/research/2026-08-05-problem-discovery-study.md
git -C coffee-chat commit -m "docs: finalize discovery study handoff"
```

## Completion criteria

The plan is complete when:

- the protocol defines a bounded discovery study rather than a public
  benchmark;
- the template captures source provenance, target traces, context, defensible
  alternatives, sealed judgments, contrasts, holdout, controls, and external
  utility;
- every H1–H5 has a concrete observation path;
- BetterBench design and reproducibility obligations are visible;
- no code, runtime schema, evaluator, product feature, or benchmark score was
  changed;
- both repositories contain only the intended documentation changes from this
  plan;
- the next action is human case collection, not benchmark implementation.
