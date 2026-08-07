# Coffee Chat Eval

**Status:** Design baseline

`coffee-chat-eval` is the cross-track evaluation and reporting repository for
Coffee Chat. It does not define one benchmark score. It pins a candidate,
runs multiple evaluation tracks, validates their receipts, and assembles the
Coffee Chat performance report.

## Repository roles

```text
coffee-chat       = product implementation + implementation-owned tests
coffee-chat-eval  = evaluation orchestration + Coffee Chat performance report
coffee-chat-bench = independent candidate-agnostic benchmark
```

`coffee-chat-eval` may run:

- Coffee Chat implementation tests;
- established external benchmark adapters;
- the independent `coffee-chat-bench` track;
- later domain-specific utility, safety, or efficiency tracks.

Every report preserves the track identity, suite version, candidate commit,
adapter version, judge/configuration version, run receipt, and explicit
measured/unmeasured/failed status. A cross-track aggregate is only a summary;
the per-track evidence remains canonical.

## Boundary

Implementation tests may inspect Coffee Chat internals because they verify the
current product contract. External benchmark adapters treat Coffee Chat as a
candidate and must use only the published adapter surface. The report layer
must not award value credit from private implementation details.

The independent benchmark's construct, sealed cases, scoring rules, and
validity evidence belong to
[`coffee-chat-bench`](./coffee-chat-bench-contract.md). Its result can be one
input to a Coffee Chat report, but `coffee-chat-eval` must not rewrite or weaken
that benchmark to improve a product score.

## Report lifecycle

```text
pin candidate → resolve track registry → run tracks → validate receipts
→ assemble report → publish provenance and interpretation
```

The canonical repository is
[`SonSangjoon/coffee-chat-eval`](https://github.com/SonSangjoon/coffee-chat-eval).
