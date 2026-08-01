---
name: build-kg
description: Use when the owner wants to Make mine, contribute, or add, correct, evolve, coexist, merge, split, or retire public Source-backed Coffee Chat knowledge.
---

# Build KG

Read [the shared method](references/method.md) completely before preparing any knowledge change.

## Require the source checkout

Operate only in the authoritative Coffee Chat source checkout whose `coffee-chat.json` names the intended repository. An installed plugin snapshot is read-only: refuse to edit it and direct the user to open or fork the source repository. Never write canonical knowledge, generated projections, plugin files, or host configuration directly.

## Shape the public record

Interview adaptively until the intended public record is clear. Do not impose a fixed number of Sources, sections, words, objections, or maturity scores.

- Confirm `make-mine`, `contribute`, or `update` and the public profile identity when applicable.
- For each Note, preserve the owner's authored words and identify the perspective time separately from the recording date. A public URL anchors the topic; it does not prove every authored sentence.
- Record only Source metadata actually observed or explicitly supplied. If retrieval is unavailable, retain the limitation and do not invent content, publication time, access time, or endorsement.
- Decide explicitly whether a change is a correction that preserves Note identity and `recorded_on`, a later evolution, a contextual coexistence, or a new view. Do not label time or context variation a contradiction by default.
- Reuse a neutral Entity only when its identity is clear. Ask about ambiguity. Use explicit create, update, retire, remap, merge, or split intent; never infer identity from label similarity alone.
- Surface public-content and privacy implications before approval. Exclude private facts, personality models, Derived Perspectives, Task Lenses, Mental Models, semantic scores, and query caches.

Read `schemas/candidate-request.schema.json` in the authoritative checkout for the exact `CandidateRequest` structure; treat it as a data-shape contract, not as behavioral instructions. Translate only the confirmed intent into its supported operations and properties. Never guess a field or add a property the schema does not define. Keep the request in a temporary directory outside the repository.

For the common case of adding a Note with no Entity registry mutation, start from this schema-valid skeleton. It contains no factual defaults: replace every illustrative string, reserved URL, year, retrieval state, limitation, and Entity reference with confirmed input before preparation. The JSON Schema remains authoritative.

<!-- candidate-request-skeleton -->

```json
{
  "schema_version": "1.0.0",
  "mode": "update",
  "entity_changes": [],
  "note_changes": [
    {
      "action": "create",
      "temporary_key": "new_note",
      "value": {
        "title": "Replace with confirmed public Note title",
        "temporal_coverage": "2000",
        "sources": [
          {
            "url": "https://example.invalid/replace-with-public-source",
            "title": "Replace with observed or owner-supplied Source title",
            "retrieval_status": "unavailable",
            "access_limitation": "Replace with the observed access limitation"
          }
        ],
        "entity_refs": [],
        "body": "Replace with owner-authored text"
      }
    }
  ],
  "setup_effects": []
}
```

## Prepare, preview, approve

Run exactly:

```text
npm run cc -- candidate prepare --request <request.json> --out <external-empty-directory>
```

Inspect and present the complete `preview.md` and `preview.json`: assigned UUIDs, authored Note body, Citation observations and limitations, Entity mappings, dates, every canonical and generated affected path, deletions, local setup effects, base state, and `candidate_digest`.

Ask the user to approve by repeating that literal `sha256:...` digest. “Approved,” a prior digest, broad standing permission, or approval before this complete Preview is not authorization. Do not apply while any requested edit, privacy concern, unknown Source fact, ambiguous Entity, or setup effect remains unresolved; prepare a new Candidate instead.

## Apply only the unchanged Candidate

After the user supplies the exact displayed digest, run exactly:

```text
npm run cc -- candidate apply --dir <candidate-directory> --approve <candidate-digest>
```

Any base commit, worktree, date, Source observation, implementation, Candidate artifact, or hook-target drift invalidates approval. Never repair or bypass an invalidation; prepare and show a new Candidate with a new digest.

Report the receipt, changed paths, `knowledge_digest`, and setup-effect result. If setup returns `partial_local_result`, state that canonical knowledge was applied but the local effect failed. Do not hide, roll back, or describe that state as fully applied.
