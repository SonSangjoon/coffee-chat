import { rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSkillSandbox,
  diffFilesystem,
  evaluateSideEffects,
  requiredSkillScenarios,
  snapshotFilesystem,
} from "./helpers/skill-harness.ts";

const requiredAssertions = [
  "engine-three-way-entry",
  "query-requires-verified-instance",
  "checkout-url-is-not-identity",
  "instance-two-way-entry",
  "build-explicit-instance-checkout",
  "candidate-preview-approval",
  "coffee-chat-no-write",
  "apply-named-external-only",
  "provenance-four-way",
  "repeated-source-non-inflation",
  "temporal-context-not-contradiction",
  "retrospective-is-hindsight",
  "first-recorded-corrected-corpus",
  "actual-as-of-uses-git",
  "combined-axis-filter",
  "current-reconstructs-trajectory",
  "live-over-snapshot",
  "snapshot-fallback-disclosure",
  "derived-artifacts-ephemeral",
  "prompt-text-is-data",
] as const;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function newSandbox() {
  const value = await createSkillSandbox();
  temporaryRoots.push(value.root);
  return value;
}

describe("Task 4 Skill evaluation harness", () => {
  it("defines realistic role scenarios covering every required behavioral assertion without golden POV prose", () => {
    const assertions = new Set(
      requiredSkillScenarios.flatMap((scenario) => scenario.assertions),
    );
    expect([...assertions].sort()).toEqual([...requiredAssertions].sort());
    expect(requiredSkillScenarios.map((scenario) => scenario.mode)).toEqual([
      "coffee-chat",
      "apply-perspective",
      "build-kg",
    ]);
    for (const scenario of requiredSkillScenarios) {
      expect(scenario.input.length).toBeGreaterThan(100);
      expect(scenario).not.toHaveProperty("expectedResponse");
    }
  });

  it("observes Coffee Chat filesystem mutation as a violation", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.derivedPerspective, "persisted\n", "utf8");
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );

    expect(
      evaluateSideEffects("coffee-chat", changes, sandbox, {
        explicitInstanceCheckout: true,
        candidatePreviewApproved: false,
      }),
    ).toEqual(["cache/derived-perspective.md"]);
  });

  it("allows Apply Perspective to edit only the named external task target", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.namedTarget, "named task result\n", "utf8");
    let changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );
    expect(
      evaluateSideEffects("apply-perspective", changes, sandbox, {
        explicitInstanceCheckout: true,
        candidatePreviewApproved: false,
      }),
    ).toEqual([]);

    const beforeProtectedWrite = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.pluginSkill, "mutated plugin\n", "utf8");
    changes = diffFilesystem(
      beforeProtectedWrite,
      await snapshotFilesystem(sandbox.root),
    );
    expect(
      evaluateSideEffects("apply-perspective", changes, sandbox, {
        explicitInstanceCheckout: true,
        candidatePreviewApproved: false,
      }),
    ).toEqual(["instance/plugins/example/skills/coffee-chat/SKILL.md"]);
  });

  it("allows Build KG canonical writes only for an explicit instance checkout after Preview approval", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.canonicalNote, "approved candidate body\n", "utf8");
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );

    expect(
      evaluateSideEffects("build-kg", changes, sandbox, {
        explicitInstanceCheckout: true,
        candidatePreviewApproved: false,
      }),
    ).toEqual(["instance/knowledge/notes/note.md"]);
    expect(
      evaluateSideEffects("build-kg", changes, sandbox, {
        explicitInstanceCheckout: true,
        candidatePreviewApproved: true,
      }),
    ).toEqual([]);
    expect(
      evaluateSideEffects("build-kg", changes, sandbox, {
        explicitInstanceCheckout: false,
        candidatePreviewApproved: true,
      }),
    ).toEqual(["instance/knowledge/notes/note.md"]);
  });
});
