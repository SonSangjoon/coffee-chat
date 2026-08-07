# Coffee Chat Bench boundary

**Status:** Design baseline

`coffee-chat-bench` is an independent, candidate-agnostic benchmark. It is not
Coffee Chat's implementation test suite and it is not the cross-track
performance-report repository.

Its working construct is **stakeholder-conditioned judgment under
underspecified objectives**: choosing, excluding, ranking, holding, or asking
among factually defensible alternatives when the task-relevant value criterion
is only sparsely specified by evidence and context.

## What it must prove

The benchmark is meaningful only if it demonstrates all of the following:

1. existing benchmark families leave a material coverage gap;
2. the measured behavior is not reducible to factuality, retrieval, explicit
   rule following, style imitation, or generic preference;
3. the benchmark adds explanatory or predictive value for independent task
   utility beyond those controls;
4. human/evaluator judgments are reliable and reproducible;
5. held-out and contrast cases separate candidates without depending on one
   product's internal representation.

`Taste` is the product's explanatory language for recurring judgment patterns;
it is not a universal benchmark label or a claim that one person's preference
defines quality.

## Relationship to the other repositories

- `coffee-chat` implements the product and owns implementation tests.
- `coffee-chat-eval` invokes this benchmark alongside other tracks and writes
  the Coffee Chat performance report.
- `coffee-chat-bench` owns the benchmark construct, cases, controls, scoring,
  baselines, validity evidence, and benchmark release versions.

The canonical benchmark repository is
[`SonSangjoon/coffee-chat-bench`](https://github.com/SonSangjoon/coffee-chat-bench).
