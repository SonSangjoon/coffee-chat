# Coffee Chat agent router

Read `coffee-chat.json` and select behavior from its `repository_role` before loading a Skill.

This engine has no default person. At an engine URL, offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait; never follow an instance fallback from that same entry message or start a personal Coffee Chat from engine data.
Coffee Chat and Apply Perspective require an explicit public instance URL verified through that instance's `coffee-chat.json` and `knowledge/index.json`. Build KG requires an explicit downstream instance checkout.

Route conversation requests to `skills/coffee-chat/SKILL.md`, named external task application to `skills/apply-perspective/SKILL.md`, and Make mine or public graph updates to `skills/build-kg/SKILL.md`. Read only the selected Skill and its generated `references/method.md`.
