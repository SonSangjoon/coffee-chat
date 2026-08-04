export const COFFEE_SKILLS = [
  {
    name: "coffee-init",
    audience: "engine",
    mutates: true,
    description:
      "Use when the user asks to initialize an independent coffee-chat-* repository from an engine release; preview writes only the new repository and returns an init receipt.",
  },
  {
    name: "coffee-sync",
    audience: "work-repository",
    mutates: true,
    description:
      "Use when the user asks to synchronize a work repository with an explicit Coffee Chat repository; preview writes only .coffee-chat sync metadata and returns a sync receipt.",
  },
  {
    name: "coffee-harvest",
    audience: "instance",
    mutates: true,
    description:
      "Use when the user asks to turn one or more Origins into durable Green Bean prose; preview writes only the approved Green Bean record and returns a harvest receipt.",
  },
  {
    name: "coffee-roast",
    audience: "internal",
    mutates: false,
    description:
      "Use internally when a context requires selecting Green Beans into a contextual Bean; read-only execution returns traceable Taste context and writes nothing.",
  },
  {
    name: "coffee-brew",
    audience: "internal",
    mutates: false,
    description:
      "Use internally when a Bean must be applied to an Agent; read-only execution returns Coffee with bounded context and writes nothing.",
  },
  {
    name: "coffee-chat",
    audience: "instance",
    mutates: false,
    description:
      "Use when the user asks to converse with Coffee; read-only execution returns a session response and never writes repository state.",
  },
  {
    name: "coffee-pairing",
    audience: "target-repository",
    mutates: true,
    description:
      "Use when the user asks to apply Coffee to a named project or task; preview writes only the explicitly approved target and returns a pairing receipt.",
  },
  {
    name: "coffee-update",
    audience: "instance",
    mutates: true,
    description:
      "Use when the user asks to update an authoritative Coffee Chat repository from an engine release; preview writes only approved engine-owned paths and returns an update receipt.",
  },
] as const;

export type CoffeeSkillName = (typeof COFFEE_SKILLS)[number]["name"];
export type CoffeeSkill = (typeof COFFEE_SKILLS)[number];

export const COFFEE_SKILL_NAMES = COFFEE_SKILLS.map(
  (skill) => skill.name,
) as CoffeeSkillName[];

export const INSTANCE_SKILL_NAMES = [
  "coffee-harvest",
  "coffee-roast",
  "coffee-brew",
  "coffee-chat",
  "coffee-pairing",
] as const satisfies readonly CoffeeSkillName[];

export const ENGINE_ONLY_SKILL_NAMES = [
  "coffee-init",
  "coffee-sync",
  "coffee-update",
] as const satisfies readonly CoffeeSkillName[];

export const ENGINE_PROVISIONING_SKILL_NAMES = [
  "coffee-init",
] as const satisfies readonly CoffeeSkillName[];

export const ENGINE_PLUGIN_SKILL_NAMES = [
  ...COFFEE_SKILL_NAMES,
] as const satisfies readonly CoffeeSkillName[];

const LEGACY_TERMS = [
  "source",
  "perspective",
  "note",
  "taste profile",
  "agent context",
  "blend",
  "serve",
  "create",
  "build",
  "connect",
  "template",
  "judgment policy",
] as const;

export function validateSkillDescription(
  name: string,
  description: string,
): string[] {
  const diagnostics: string[] = [];
  if (!/^Use (when|internally when) /.test(description))
    diagnostics.push("description-must-start-with-use");
  if (description.length > 500) diagnostics.push("description-too-long");
  if (!/(preview|read-only|writes?|returns?)/i.test(description))
    diagnostics.push("description-missing-boundary");
  const lowercase = description.toLowerCase();
  if (LEGACY_TERMS.some((term) => lowercase.includes(term)))
    diagnostics.push("description-contains-legacy-term");
  return diagnostics;
}

export function skillContract(name: CoffeeSkillName): CoffeeSkill {
  const skill = COFFEE_SKILLS.find((candidate) => candidate.name === name);
  if (!skill) throw new Error("Unknown Coffee Skill: " + name);
  return skill;
}
