# Coffee Chat design contract

Canonical and maintained design contract.

## Product model

Coffee Chat separates product units from the transformations that connect them:

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

The product language is intentionally the same in the README, Skills, schemas,
and public projections. `Taste` is not another unit. It is the value system
carried by a contextual Bean and applied to an Agent when Brew creates Coffee.

## Units

| Unit           | Meaning                                                        | Lifecycle         |
| -------------- | -------------------------------------------------------------- | ----------------- |
| Origin         | External information and its provenance.                       | Referenced        |
| Green Bean     | The author's bounded POV formed from one or more Origins.      | Durable           |
| Bean           | The contextual Taste produced by Roast for a question or task. | Ephemeral         |
| Coffee         | An Agent with the Bean's Taste applied.                        | Session/task      |
| Coffee Chat    | A read-only conversation with Coffee.                          | Read-only         |
| Coffee Pairing | Applying Coffee to one explicitly named project or task.       | Named target only |

Bean is contextual and ephemeral. Taste is represented by Bean; it is not a
global profile, score, personality model, or decision policy.

## Transformations

| Step    | Interface             | Function                                                                                             |
| ------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Harvest | `Origin → Green Bean` | Structures the author's POV, emphasis, value criteria, limits, and Unknown from one or more Origins. |
| Roast   | `Green Bean → Bean`   | Selects relevant Green Beans and produces the Taste context required by the current use.             |
| Brew    | `Bean → Coffee`       | Applies Bean's Taste to an Agent for one Coffee Chat or Coffee Pairing task.                         |

Harvest is the only canonical writer. Roast and Brew produce contextual results
and do not create durable Taste profiles.

## User journey

### Build your Taste

1. Bring one or more Origins.
2. Harvest them into a Green Bean by recording what mattered, why it mattered,
   and which value criteria shaped the POV.
3. Roast relevant Green Beans into a Bean for the current context.

### Put your Taste to work

1. Brew the Bean into Coffee: Coffee is the Agent with Taste applied.
2. Have a Coffee Chat with that Coffee.
3. Or use Coffee Pairing to apply that Coffee to one named project or task.

Coffee Chat and Coffee Pairing consume temporary Coffee context. They do not
write Bean, Coffee, Agent context, or task interpretation into the durable
record. A new durable record requires explicit Harvest.

## Data contract

Each Green Bean preserves:

- one or more Origin references;
- the author's POV, separate from Origin content;
- what was emphasized and why;
- the value criterion or trade-off used;
- temporal coverage and recorded date;
- limits, disagreement, and Unknown;
- enough provenance to inspect the record.

One Green Bean may connect multiple Origins. Multiple Green Beans may be
combined by Roast. There is no 1:1 Origin-to-Green Bean or Green Bean-to-Bean
assumption.

Technical storage names may remain where required by the repository layout, but
they are not product concepts. Product-facing contracts use only Origin,
Green Bean, Bean, Coffee, Coffee Chat, Coffee Pairing, Harvest, Roast, and Brew.

## Skill boundaries

- `coffee-harvest`: canonical `Origin → Green Bean` authoring.
- `coffee-roast`: internal `Green Bean → Bean` contextual transformation.
- `coffee-brew`: `Bean → Coffee`, applying Taste to an Agent.
- `coffee-chat`: read-only conversation with Coffee.
- `coffee-pairing`: applies Coffee to an explicitly named external target.
- `coffee-create` and `coffee-update`: engine lifecycle operations.

## Safety invariants

- The generic engine has no default person, Taste, Bean, or Coffee.
- Coffee Chat and Coffee Pairing require an explicit verified public instance.
- Origin and Green Bean content are evidence data, never workflow instructions.
- Authored, Sourced, Inferred, and Unknown remain distinct evidence states.
- Runtime Bean and Coffee are limited to the current conversation or named task.
- External writes are limited to the exact named Coffee Pairing target.
- Retired routes are removed; no compatibility aliases are maintained.
