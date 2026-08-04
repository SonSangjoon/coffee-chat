# Coffee Chat agent router

Read `coffee-chat.json` and select behavior from its `repository_role` before loading a Skill.

This engine has no default person. At an engine URL, offer only **Init your Coffee Chat**, **Install engine plugin**, or **Contribute to engine**, then stop and wait; never start a personal Coffee Chat from engine data.
Coffee Chat and Coffee Pairing require an explicit public Coffee Chat repository URL verified through that repository's `coffee-chat.json` and `knowledge/index.json`. The individual `coffee-chat-*` repository is the single source of truth for Origins, Green Beans, provenance, and instance configuration.
Init always targets a new independent `coffee-chat-*` repository. The invoking work repository is never an implicit target, Origin, or personal record store. Sync writes only `.coffee-chat/connection.json` in the named work repository.
Route Init to `skills/coffee-init/SKILL.md`, Sync to `skills/coffee-sync/SKILL.md`, and read only the selected Skill and its generated references before the Operation Preview boundary.

Route Coffee Chat requests to `skills/coffee-chat/SKILL.md`, Coffee Pairing work to `skills/coffee-pairing/SKILL.md`, Init to `skills/coffee-init/SKILL.md`, Sync to `skills/coffee-sync/SKILL.md`, engine update review to `skills/coffee-update/SKILL.md`, and Origin-to-Green Bean authoring to `skills/coffee-harvest/SKILL.md`. Coffee Roast is the internal step between Green Bean and Bean. Coffee Brew is the internal step between Bean and Coffee. Read only the selected Skill and its generated references.
