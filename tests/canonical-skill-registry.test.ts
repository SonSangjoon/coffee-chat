import { describe, expect, it } from "vitest";
import {
  COFFEE_SKILL_NAMES,
  COFFEE_SKILLS,
  validateSkillDescription,
} from "../tools/skill-contracts.ts";

describe("canonical Coffee Skill registry", () => {
  it("contains exactly the public and internal coffee-* Skills", () => {
    expect(COFFEE_SKILL_NAMES).toEqual([
      "coffee-init",
      "coffee-sync",
      "coffee-harvest",
      "coffee-roast",
      "coffee-brew",
      "coffee-chat",
      "coffee-pairing",
      "coffee-update",
    ]);
    expect(new Set(COFFEE_SKILL_NAMES).size).toBe(COFFEE_SKILL_NAMES.length);
    expect(COFFEE_SKILLS.map((skill) => skill.name)).toEqual(
      COFFEE_SKILL_NAMES,
    );
  });

  it("requires concise descriptions with explicit boundaries", () => {
    for (const skill of COFFEE_SKILLS) {
      expect(skill.description).toMatch(/^Use (when|internally when) /);
      expect(skill.description.length).toBeLessThanOrEqual(500);
      expect(validateSkillDescription(skill.name, skill.description)).toEqual(
        [],
      );
    }
  });

  it("rejects legacy names and descriptions without a boundary", () => {
    expect(
      validateSkillDescription(
        "coffee-init",
        "Create a Template from Source and Perspective.",
      ),
    ).toEqual(
      expect.arrayContaining([
        "description-must-start-with-use",
        "description-contains-legacy-term",
        "description-missing-boundary",
      ]),
    );
  });
});
