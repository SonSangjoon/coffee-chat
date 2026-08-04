# Coffee Chat UX research — 2026-08-04

Research snapshot.

## Research conclusion

Information is easy to access and summarize. What remains difficult to see is
how someone evaluates the same information: what they select, what they ignore,
and which values make the selection meaningful. That recurring value system is
Taste. Its importance comes from always-recurring criteria across different
Origins and situations, not from any claim that one person's criteria are
superior.

Coffee Chat makes Taste usable without turning it into a fixed profile or
decision rule. The product therefore distinguishes units from transformations:

```text
Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing
          Harvest        Roast   Brew
```

## Target users and needs

| User         | Need                                                                              | Product response                               |
| ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Author       | Make personal value criteria visible without writing a biography.                 | Harvest one or more Origins into a Green Bean. |
| Reader       | Understand how the author values information, not only the summary.               | Coffee Chat with Coffee and its provenance.    |
| Agent owner  | Give an Agent recurring judgment context without claiming the Agent is the owner. | Roast Green Beans into Bean, then Brew Coffee. |
| Collaborator | Apply that context to concrete work.                                              | Coffee Pairing with one named project or task. |

## UX decisions

1. Use `Origin`, `Green Bean`, `Bean`, and `Coffee` as product units.
2. Use `Harvest`, `Roast`, and `Brew` only for transformations.
3. Show the transformation on the arrow and the unit at the node.
4. Make Green Bean the author's bounded POV; it may connect multiple Origins.
5. Make Bean the contextual Taste result of Roast, never a global Taste profile.
6. Make Coffee visibly mean “Agent with Taste,” not merely an Agent runtime.
7. Make Coffee Chat and Coffee Pairing parallel experiences after Coffee exists.
8. Keep Coffee Pairing's write boundary limited to the explicitly named target.

## Evaluation criteria

- A new user can distinguish Origin, Green Bean, Bean, and Coffee.
- A new user can explain what Harvest, Roast, and Brew each do.
- The user understands that Taste is carried by Bean and applied to the Agent
  when Coffee is made.
- The user understands why Coffee Chat starts only after Brew.
- The user understands why Coffee Pairing applies Taste to work without writing
  the task result into the durable Coffee Chat record.
