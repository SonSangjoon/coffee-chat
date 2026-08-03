import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { validateKnowledge } from "../tools/knowledge.ts";
import { generatedProjectionBytes } from "../tools/projections.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const instanceSkillNames = [
  "coffee-chat",
  "apply-perspective",
  "build-kg",
] as const;
const engineSkillNames = [...instanceSkillNames, "create-coffee-chat"] as const;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function readSkill(name: (typeof engineSkillNames)[number]) {
  const text = await readFile(
    resolve(projectRoot, "skills", name, "SKILL.md"),
    "utf8",
  );
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  expect(match, `${name} has parseable frontmatter`).not.toBeNull();
  return {
    text,
    metadata: parseYaml(match![1]) as Record<string, unknown>,
    body: match![2],
  };
}

async function instanceProjection() {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-skill-instance-"));
  temporaryRoots.push(root);
  for (const path of [
    "schemas",
    "method",
    "skills",
    "docs/assets/readme",
    "docs/testing.md",
    "LICENSE",
    "CONTENT_LICENSE.md",
  ])
    await cp(resolve(projectRoot, path), resolve(root, path), {
      recursive: true,
    });
  await cp(
    resolve(projectRoot, "tests/fixtures/initialized-valid/coffee-chat.json"),
    resolve(root, "coffee-chat.json"),
  );
  await cp(
    resolve(projectRoot, "tests/fixtures/initialized-valid/knowledge"),
    resolve(root, "knowledge"),
    { recursive: true },
  );
  const snapshot = await createSnapshot(root, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  return generatedProjectionBytes(snapshot, validation.graph!);
}

describe("Task 4 Agent Skill contracts", () => {
  it.each(engineSkillNames)(
    "%s is a concise Agent Skills router with standard compatibility metadata",
    async (name) => {
      const skill = await readSkill(name);
      expect(Object.keys(skill.metadata).sort()).toEqual([
        "compatibility",
        "description",
        "name",
      ]);
      expect(skill.metadata.name).toBe(name);
      expect(skill.metadata.description).toMatch(/^Use when /);
      expect(skill.metadata.compatibility).toEqual(expect.any(String));
      expect((skill.metadata.compatibility as string).length).toBeGreaterThan(
        0,
      );
      expect(
        (skill.metadata.compatibility as string).length,
      ).toBeLessThanOrEqual(500);
      expect(skill.body).not.toContain("## Compatibility");
      expect(skill.body).toContain("[shared method](references/method.md)");
      expect(skill.text).not.toContain("allowed-tools:");

      const entries = await readdir(resolve(projectRoot, "skills", name), {
        recursive: true,
      });
      const expectedReferences =
        name === "create-coffee-chat"
          ? [
              "references",
              "references/engine-release.schema.json",
              "references/engine-template-surface.schema.json",
              "references/method.md",
              "references/release.json",
              "references/template-surface.json",
            ]
          : ["references", "references/method.md"];
      expect(entries.sort()).toEqual(["SKILL.md", ...expectedReferences]);
    },
  );

  it("keeps the creation Skill instruction-only and binds the complete Preview protocol", async () => {
    const skill = await readSkill("create-coffee-chat");
    for (const phrase of [
      "generic engine Skill",
      "gh auth status",
      "is_template",
      "refs/tags/v",
      "template-surface",
      "complete Preview",
      "gh api --method POST",
      "private=false",
      "template_repository",
      "npm ci --ignore-scripts",
      "Node 24.5.0",
      "npm 11.5.1",
      "node_modules/**",
      "TemplateObservation",
      "pre-conversion",
      "repo-local `build-kg`",
      "publication Preview",
      "awaiting_owner_merge",
      "partial_external_result",
    ])
      expect(skill.body).toContain(phrase);
    for (const forbidden of [
      "MCP server",
      "mcpServers",
      "agent definition",
      "service",
    ])
      expect(skill.body).not.toContain(forbidden);
  });

  it("routes engine and instance entry from repository role without a default person", async () => {
    const agents = await readFile(resolve(projectRoot, "AGENTS.md"), "utf8");
    const claude = await readFile(resolve(projectRoot, "CLAUDE.md"), "utf8");

    expect(agents).toContain("repository_role");
    expect(agents).toContain("Create yours");
    expect(agents).toContain("Install engine plugin");
    expect(agents).toContain("Contribute to engine");
    expect(agents).toContain("knowledge/index.json");
    expect(agents).toContain("no default person");
    expect(agents).toContain("downstream pre-conversion engine checkout");
    expect(agents).toContain("origin and target-fingerprint rules");
    expect(agents).toContain("maintained engine checkout");
    expect(agents).toContain(
      "`contribute` and `update` require an initialized authoritative instance checkout",
    );
    expect(agents).not.toContain(
      "Build KG requires an explicit downstream instance checkout",
    );
    expect(claude).toBe("@AGENTS.md\n");
  });

  it("asks the instance entry choice only after manifest and generated-index verification", async () => {
    const projected = await instanceProjection();
    const agents = projected.get("AGENTS.md")?.toString("utf8");
    expect(agents).toContain("repository_role");
    expect(agents).toContain("knowledge/index.json");
    expect(agents).toContain("repository.url");
    expect(agents).toContain("pages_url");
    expect(agents).toContain("one-time Coffee Chat");
    expect(agents).toContain("install instance plugin");
  });

  it("allows Make mine only in a verified downstream engine copy", async () => {
    const buildKg = await readSkill("build-kg");
    const method = await readFile(
      resolve(projectRoot, "method/shared-method.md"),
      "utf8",
    );

    for (const guidance of [buildKg.body, method]) {
      expect(guidance).toContain("Make mine");
      expect(guidance).toContain("pre-conversion engine checkout");
      expect(guidance).toContain("`repository_role: engine`");
      expect(guidance).toContain(
        "normalized actual `origin` differs from the engine manifest `repository.url`",
      );
      expect(guidance).toContain(
        "matches the proposed instance `repository.url`",
      );
      expect(guidance).toContain("maintained engine checkout");
      expect(guidance).toContain("`contribute` and `update`");
      expect(guidance).toContain("initialized authoritative instance checkout");
    }
  });

  it("projects byte-identical source Skills and one-level shared-method references without agent definitions", async () => {
    const snapshot = await createSnapshot(projectRoot, "worktree");
    const validation = await validateKnowledge(snapshot, {
      validateIndex: false,
    });
    expect(validation.diagnostics).toEqual([]);
    const projected = await generatedProjectionBytes(
      snapshot,
      validation.graph!,
    );

    for (const name of instanceSkillNames) {
      expect(
        projected.get(`plugins/coffee-chat/skills/${name}/SKILL.md`),
      ).toEqual(await snapshot.read(`skills/${name}/SKILL.md`));
      expect(
        projected.get(
          `plugins/coffee-chat/skills/${name}/references/method.md`,
        ),
      ).toEqual(projected.get(`skills/${name}/references/method.md`));
    }

    expect(
      [...projected.keys()].filter((path) =>
        /(?:^|\/)agents\/openai\.yaml$/.test(path),
      ),
    ).toEqual([]);
  });
});
