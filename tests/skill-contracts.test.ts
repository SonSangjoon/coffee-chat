import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  COFFEE_SKILL_NAMES,
  COFFEE_SKILLS,
  skillContract,
} from "../tools/skill-contracts.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const legacyUserTerms =
  /\b(?:Perspective|Note|Entity|Blend|Serve|Template)\b|coffee-create|coffee-blend|coffee-serve/;

async function readSkill(name: string) {
  const skillPath = resolve(projectRoot, "skills", name, "SKILL.md");
  const text = await readFile(skillPath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  expect(match, name + " has parseable frontmatter").not.toBeNull();
  return {
    text,
    metadata: parseYaml(match![1]) as Record<string, unknown>,
    body: match![2],
  };
}

describe("canonical Coffee Skill surface", () => {
  it.each(COFFEE_SKILL_NAMES)(
    "%s has registry-bound metadata and shared method routing",
    async (name) => {
      const skill = await readSkill(name);
      const contract = skillContract(name);

      expect(skill.metadata).toMatchObject({
        name,
        description: contract.description,
      });
      expect(skill.metadata.compatibility).toEqual(expect.any(String));
      expect(skill.body).toContain("[shared method](references/method.md)");
      expect(skill.text).not.toContain("allowed-tools:");
      expect(skill.body).not.toMatch(legacyUserTerms);

      const entries = await readdir(resolve(projectRoot, "skills", name), {
        recursive: true,
      });
      expect(entries).toContain("references");
      expect(entries).toContain("references/method.md");
    },
  );

  it("uses the registry order and does not expose a removed Skill route", async () => {
    const agents = await readFile(resolve(projectRoot, "AGENTS.md"), "utf8");
    const method = await readFile(
      resolve(projectRoot, "method/shared-method.md"),
      "utf8",
    );

    expect(COFFEE_SKILLS.map((skill) => skill.name)).toEqual(
      COFFEE_SKILL_NAMES,
    );
    expect(agents).toContain("repository_role");
    expect(agents).toContain("Init your Coffee Chat");
    expect(agents).toContain("Install engine plugin");
    expect(agents).toContain("Contribute to engine");
    expect(agents).toContain("skills/coffee-init/SKILL.md");
    expect(agents).toContain("skills/coffee-sync/SKILL.md");
    expect(agents).toContain(".coffee-chat/connection.json");
    expect(agents).toContain("Coffee Chat");
    expect(agents).not.toMatch(legacyUserTerms);
    expect(method).toContain(
      "Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing",
    );
    expect(method).toContain("Harvest");
    expect(method).toContain("Roast");
    expect(method).toContain("Brew");
    expect(method).not.toMatch(legacyUserTerms);
  });
});
