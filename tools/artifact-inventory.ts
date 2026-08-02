import { resolve } from "node:path";
import { ValidationFailure } from "./contracts.ts";
import type { Manifest } from "./knowledge.ts";

export type ArtifactClass = "release" | "ephemeral-test";

export type ProjectionContext = {
  artifact_class: ArtifactClass;
  output_root: string;
};

export const GENERATED_OWNERSHIP_MARKER = ".coffee-chat-generated.json";

const SKILL_NAMES = ["coffee-chat", "apply-perspective", "build-kg"] as const;

/** The complete generated inventory for a role. It is deliberately closed. */
export function roleOwnedProjectionPaths(manifest: Manifest): string[] {
  const packageRoot = `plugins/${manifest.plugin.name}`;
  return [
    "README.md",
    "CONTENT_LICENSE.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    `${packageRoot}/${GENERATED_OWNERSHIP_MARKER}`,
    `${packageRoot}/.codex-plugin/plugin.json`,
    `${packageRoot}/.claude-plugin/plugin.json`,
    `${packageRoot}/LICENSE`,
    ...SKILL_NAMES.flatMap((name) => [
      `skills/${name}/references/method.md`,
      `${packageRoot}/skills/${name}/SKILL.md`,
      `${packageRoot}/skills/${name}/references/method.md`,
    ]),
  ].sort();
}

export async function assertArtifactBoundary(
  context: ProjectionContext,
  dependencies: string[],
): Promise<void> {
  if (context.artifact_class === "ephemeral-test") return;
  const fixture = dependencies.find(
    (path) =>
      path.startsWith("tests/fixtures/") || path.startsWith("examples/"),
  );
  if (fixture)
    throw new ValidationFailure({
      code: "release-fixture-dependency",
      path: `./${fixture}`,
      message:
        "Release artifacts cannot depend on tests/fixtures or examples inputs.",
    });
}

export function sameDirectory(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}
