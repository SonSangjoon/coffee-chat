import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSkillSandbox,
  diffFilesystem,
  evaluateSideEffects,
  removeSkillSandbox,
  requiredSkillScenarios,
  creationSkillScenarios,
  snapshotFilesystem,
  type CandidateApplyEvidence,
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
    temporaryRoots.splice(0).map((root) => removeSkillSandbox(root)),
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
    expect(
      requiredSkillScenarios.map(({ id, mode }) => ({ id, mode })),
    ).toEqual([
      { id: "coffee-chat-role-query", mode: "coffee-chat" },
      { id: "apply-perspective-named-task", mode: "apply-perspective" },
      { id: "build-kg-engine-no-downstream", mode: "build-kg" },
    ]);
    for (const scenario of requiredSkillScenarios) {
      expect(Object.keys(scenario).sort()).toEqual([
        "assertions",
        "id",
        "input",
        "mode",
      ]);
      expect(scenario.input.trim()).not.toBe("");
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

    expect(evaluateSideEffects("coffee-chat", changes, sandbox)).toEqual([
      "cache/derived-perspective.md",
    ]);
  });

  it("allows Apply Perspective to edit only the named external task target", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.namedTarget, "named task result\n", "utf8");
    let changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );
    expect(evaluateSideEffects("apply-perspective", changes, sandbox)).toEqual(
      [],
    );

    const beforeProtectedWrite = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.pluginSkill, "mutated plugin\n", "utf8");
    changes = diffFilesystem(
      beforeProtectedWrite,
      await snapshotFilesystem(sandbox.root),
    );
    expect(evaluateSideEffects("apply-perspective", changes, sandbox)).toEqual([
      "instance/plugins/example/skills/coffee-chat/SKILL.md",
    ]);
  });

  it("detects an empty directory creation", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await mkdir(resolve(sandbox.root, "cache/empty"));
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );

    expect(changes.map(({ path }) => path)).toEqual(["cache/empty"]);
    expect((await snapshotFilesystem(sandbox.root)).get("cache/empty")).toEqual(
      expect.objectContaining({ kind: "directory" }),
    );
  });

  it("records a derived-perspective symlink target without following it and cleans up safely", async () => {
    const sandbox = await newSandbox();
    const outside = await mkdtemp(resolve(tmpdir(), "coffee-chat-outside-"));
    const outsideFile = resolve(outside, "must-survive.txt");
    try {
      await writeFile(outsideFile, "outside\n", "utf8");
      const before = await snapshotFilesystem(sandbox.root);
      await symlink(outside, sandbox.derivedPerspective);

      const snapshot = await snapshotFilesystem(sandbox.root);
      const changes = diffFilesystem(before, snapshot);
      expect(changes.map(({ path }) => path)).toEqual([
        "cache/derived-perspective.md",
      ]);
      expect(evaluateSideEffects("coffee-chat", changes, sandbox)).toEqual([
        "cache/derived-perspective.md",
      ]);
      expect(snapshot.get("cache/derived-perspective.md")).toEqual(
        expect.objectContaining({ kind: "symlink", target: outside }),
      );
      expect(
        [...snapshot.keys()].some((path) => path.includes("must-survive.txt")),
      ).toBe(false);

      await removeSkillSandbox(sandbox.root);
      expect(await readFile(outsideFile, "utf8")).toBe("outside\n");
    } finally {
      await rm(outside, { recursive: true });
    }
  });

  it("detects chmod-only changes", async () => {
    const sandbox = await newSandbox();
    await chmod(sandbox.namedTarget, 0o640);
    const before = await snapshotFilesystem(sandbox.root);
    await chmod(sandbox.namedTarget, 0o600);
    const after = await snapshotFilesystem(sandbox.root);

    expect(diffFilesystem(before, after).map(({ path }) => path)).toEqual([
      "task/named.md",
    ]);
    expect(after.get("task/named.md")).toEqual(
      expect.objectContaining({ kind: "file", mode: 0o600 }),
    );
  });

  it("detects deleted files", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await rm(sandbox.canonicalNote);
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );

    expect(changes).toEqual([
      expect.objectContaining({
        path: "instance/knowledge/notes/note.md",
        before: expect.objectContaining({ kind: "file" }),
        after: undefined,
      }),
    ]);
  });

  const digestA = `sha256:${"a".repeat(64)}`;
  const digestB = `sha256:${"b".repeat(64)}`;

  function validCandidateApplyEvidence(
    overrides: Partial<CandidateApplyEvidence> = {},
  ): CandidateApplyEvidence {
    return {
      authoritativeInstanceRoot: "instance",
      candidateDigest: digestA,
      userApprovedLiteralDigest: digestA,
      approvalTurn: "later-message",
      previewPresentedInPriorTurn: true,
      candidateUnchanged: true,
      mutationRoute: "candidate-apply",
      receipt: {
        status: "applied",
        candidate_digest: digestA,
        changed_paths: ["./knowledge/notes/note.md"],
      },
      ...overrides,
    };
  }

  async function canonicalChange() {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.canonicalNote, "candidate-applied body\n", "utf8");
    return {
      sandbox,
      changes: diffFilesystem(before, await snapshotFilesystem(sandbox.root)),
    };
  }

  const invalidApprovalCases: Array<[string, Partial<CandidateApplyEvidence>]> =
    [
      ["same-message approval", { approvalTurn: "same-message" }],
      ["mismatched digest", { userApprovedLiteralDigest: digestB }],
      ["no prior Preview", { previewPresentedInPriorTurn: false }],
      ["Candidate drift", { candidateUnchanged: false }],
      ["unverified instance", { authoritativeInstanceRoot: null }],
      [
        "stale Receipt",
        {
          receipt: {
            status: "applied" as const,
            candidate_digest: digestB,
            changed_paths: ["./knowledge/notes/note.md"],
          },
        },
      ],
    ];

  it.each(invalidApprovalCases)(
    "rejects Build KG output after %s",
    async (_label, override) => {
      const { sandbox, changes } = await canonicalChange();
      expect(
        evaluateSideEffects(
          "build-kg",
          changes,
          sandbox,
          validCandidateApplyEvidence(override),
        ),
      ).toEqual(["instance/knowledge/notes/note.md"]);
    },
  );

  it("rejects direct canonical overwrite even with otherwise valid approval evidence", async () => {
    const { sandbox, changes } = await canonicalChange();
    expect(
      evaluateSideEffects(
        "build-kg",
        changes,
        sandbox,
        validCandidateApplyEvidence({ mutationRoute: "direct-write" }),
      ),
    ).toEqual(["instance/knowledge/notes/note.md"]);
  });

  it("rejects arbitrary plugin writes omitted from the Candidate Receipt", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await Promise.all([
      writeFile(sandbox.canonicalNote, "candidate-applied body\n", "utf8"),
      writeFile(sandbox.pluginSkill, "arbitrary plugin write\n", "utf8"),
    ]);
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );

    expect(
      evaluateSideEffects(
        "build-kg",
        changes,
        sandbox,
        validCandidateApplyEvidence(),
      ),
    ).toEqual(["instance/plugins/example/skills/coffee-chat/SKILL.md"]);
  });

  it("accepts only exact Candidate apply Receipt output after a later matching approval", async () => {
    const { sandbox, changes } = await canonicalChange();
    expect(
      evaluateSideEffects(
        "build-kg",
        changes,
        sandbox,
        validCandidateApplyEvidence(),
      ),
    ).toEqual([]);
  });
});

describe("Task 5 creation Skill evaluation harness", () => {
  it("defines static pressure fixtures for the native Template flow", () => {
    expect(
      creationSkillScenarios.map(({ id, mode }) => ({ id, mode })),
    ).toEqual([
      { id: "create-template-native-api", mode: "create-coffee-chat" },
      {
        id: "create-template-publication-boundary",
        mode: "create-coffee-chat",
      },
    ]);
    const assertions = new Set(
      creationSkillScenarios.flatMap((scenario) => scenario.assertions),
    );
    expect([...assertions].sort()).toEqual(
      [
        "ambiguous-timeout-reconcile",
        "approved-empty-nonsymlink-path",
        "build-kg-handoff-before-knowledge",
        "candidate-does-not-publish",
        "complete-preview-before-post",
        "credential-free",
        "default-branch-reconciliation",
        "native-template-api-only",
        "partial-external-result",
        "preconversion-route-no-recursion",
        "protected-branch-merge-boundary",
        "publication-preview-separate",
        "public-content-excluded",
        "release-observations-required",
        "template-mode-required",
        "template-provenance-verified",
      ].sort(),
    );
    for (const scenario of creationSkillScenarios) {
      expect(Object.keys(scenario).sort()).toEqual([
        "assertions",
        "id",
        "input",
        "mode",
      ]);
      expect(scenario.input.trim()).not.toBe("");
      expect(scenario).not.toHaveProperty("expectedResponse");
    }
  });

  it("treats creation filesystem writes as violations", async () => {
    const sandbox = await newSandbox();
    const before = await snapshotFilesystem(sandbox.root);
    await writeFile(sandbox.derivedPerspective, "creation wrote\n", "utf8");
    const changes = diffFilesystem(
      before,
      await snapshotFilesystem(sandbox.root),
    );
    expect(evaluateSideEffects("create-coffee-chat", changes, sandbox)).toEqual(
      ["cache/derived-perspective.md"],
    );
  });
});
