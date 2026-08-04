# Coffee Chat agent router

Read `coffee-chat.json` and select behavior from its `repository_role` before loading a Skill.

This engine has no default person. At an engine URL, offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait; never follow an instance fallback from that same entry message or start a personal Coffee Chat from engine data.
Coffee Chat and Coffee Pairing require an explicit public instance URL verified through that instance's `coffee-chat.json` and `knowledge/index.json`. After an explicit Create yours or Make mine choice, Coffee Harvest may use only an explicit downstream pre-conversion engine checkout that satisfies the origin and target-fingerprint rules; the maintained engine checkout and installed packages/caches remain forbidden. Coffee Harvest `contribute` and `update` require an initialized authoritative instance checkout.
Only an explicit external pre-conversion handoff whose live origin, target fingerprint, native Template observation, source/target observation, and template-surface digest all match may route exactly once to repo-local `coffee-harvest`; it must never recurse into `coffee-create`.
After the user explicitly chooses **Create yours**, route to `skills/coffee-create/SKILL.md`; read only that Skill and its generated references, then stop at its Preview approval boundary.

Route Coffee Chat requests to `skills/coffee-chat/SKILL.md`, named external Coffee Pairing work to `skills/coffee-pairing/SKILL.md`, Taste context application to an Agent to `skills/coffee-brew/SKILL.md`, Create yours to `skills/coffee-create/SKILL.md`, engine update review to `skills/coffee-update/SKILL.md`, and Origin-to-Green Bean authoring to `skills/coffee-harvest/SKILL.md`. Coffee Roast is an internal step invoked by Coffee Brew, Coffee Chat, and Coffee Pairing. Read only the selected Skill and its generated references.
