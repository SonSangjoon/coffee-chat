import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedProjectionBytes } from "../tools/projections.ts";
import { validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");

async function engineProjection() {
  const snapshot = await createSnapshot(projectRoot, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  expect(validation.graph).toBeDefined();
  return generatedProjectionBytes(snapshot, validation.graph!);
}

describe("Coffee Chat product vocabulary", () => {
  it("uses one coffee vocabulary from the user journey through the system", async () => {
    const projected = await engineProjection();
    const readme = projected.get("README.md")?.toString("utf8");

    expect(readme).toContain("Harvest");
    expect(readme).toContain("Roast");
    expect(readme).toContain("Brew");
    expect(readme).toContain("Coffee Pairing");
    expect(readme).toContain("Green Bean");
    expect(readme).toContain("Bean");
    expect(readme).toContain(
      "Taste is the recurring value system behind how a person interprets information and assigns importance.",
    );
    expect(readme).toContain(
      "criteria remain recognizable across different Origins",
    );
    expect(readme).toContain("Put your Taste to work");
    expect(readme).toContain("Harvest one or more Origins");
    expect(readme).toContain("Roast the relevant Green Beans");
    expect(readme).not.toContain("Brew a Perspective");
    expect(readme).not.toContain("Source-grounded Perspective Annotation");
    expect(readme).not.toContain("Sip");
    expect(readme).not.toContain("Serve");
    expect(readme).not.toContain("Project");
    expect(readme).not.toMatch(/\bpersona\b/i);
    expect(readme).not.toContain("Mental Model");
    expect(readme).not.toContain("Task Lens");
    expect(readme).not.toContain("judgment policy");
    expect(readme).not.toContain("Derived Perspective");
  });

  it("exposes the canonical unit and transformation pipeline", async () => {
    const projected = await engineProjection();
    const readme = projected.get("README.md")?.toString("utf8");
    const design = await readFile(
      resolve(projectRoot, "docs/design/coffee-chat.md"),
      "utf8",
    );

    expect(readme).toContain(
      "Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing",
    );
    expect(readme).toContain("Harvest");
    expect(readme).toContain("Roast");
    expect(readme).toContain("Brew");
    expect(design).toContain(
      "Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing",
    );
    expect(design).toContain("Green Bean → Bean");
    expect(design).toContain("Bean → Coffee");
    expect(design).toContain("Ephemeral contextual Taste");
    expect(design).not.toContain("Perspective");
    expect(design).not.toContain("Source-grounded");
  });

  it("uses coffee-prefixed Skill IDs for product actions", async () => {
    const projected = await engineProjection();
    const paths = [...projected.keys()];

    for (const name of [
      "coffee-init",
      "coffee-sync",
      "coffee-harvest",
      "coffee-roast",
      "coffee-brew",
      "coffee-chat",
      "coffee-pairing",
      "coffee-update",
    ])
      expect(paths).toContain(`plugins/coffee-chat/skills/${name}/SKILL.md`);
    expect(paths).toContain("plugins/coffee-chat/skills/coffee-chat/SKILL.md");
    expect(paths).not.toContain(
      "plugins/coffee-chat/skills/coffee-serve/SKILL.md",
    );
    expect(paths).not.toContain("plugins/coffee-chat/skills/build-kg/SKILL.md");
    expect(paths).not.toContain(
      "plugins/coffee-chat/skills/apply-perspective/SKILL.md",
    );
  });

  it("keeps the engine entry neutral", async () => {
    const projected = await engineProjection();
    const readme = projected.get("README.md")?.toString("utf8");
    const agents = projected.get("AGENTS.md")?.toString("utf8");

    expect(readme).toContain("This engine has no default person or Taste");
    expect(readme).toContain("Init your Coffee Chat");
    expect(readme).toContain("Install engine plugin");
    expect(readme).toContain("Contribute to engine");
    expect(readme).not.toContain("Open <COFFEE_CHAT_INSTANCE_URL>");
    expect(agents).toContain("no default person");
  });

  it("keeps the maintained design and research documents authored", async () => {
    await expect(
      readFile(resolve(projectRoot, "docs/design/coffee-chat.md"), "utf8"),
    ).resolves.toContain("Approved system baseline");
    await expect(
      readFile(
        resolve(
          projectRoot,
          "docs/research/2026-08-04-coffee-chat-ux-research.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("Research snapshot");
  });
});
