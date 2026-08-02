import { isAbsolute, relative, resolve, sep } from "node:path";
import { ValidationFailure } from "./contracts.ts";
import { isInstanceGraph, type KnowledgeGraph } from "./knowledge.ts";

export type ArtifactClass = "release" | "ephemeral-test";

export type ProjectionContext = {
  artifact_class: ArtifactClass;
  output_root: string;
};

type BundleFields = {
  files: Map<string, Buffer>;
  dependencies: string[];
};

export type ReleaseProjectionBundle = BundleFields & {
  artifact_class: "release";
};

export type EphemeralProjectionBundle = BundleFields & {
  artifact_class: "ephemeral-test";
};

export type ProjectionBundle =
  | ReleaseProjectionBundle
  | EphemeralProjectionBundle;

export const GENERATED_OWNERSHIP_MARKER = ".coffee-chat-generated.json";

const SKILL_NAMES = ["coffee-chat", "apply-perspective", "build-kg"] as const;

/** The complete generated inventory for a role. It is deliberately closed. */
export function roleOwnedProjectionPaths(graph: KnowledgeGraph): string[] {
  const manifest = graph.manifest;
  const packageRoot = `plugins/${manifest.plugin.name}`;
  const paths = [
    "README.md",
    "README.ko.md",
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
  ];
  if (isInstanceGraph(graph))
    paths.push(
      `${packageRoot}/knowledge/coffee-chat.json`,
      `${packageRoot}/knowledge/index.json`,
      `${packageRoot}/knowledge/entities.yml`,
      ...graph.notes.map((note) => `${packageRoot}/${note.path}`),
    );
  return paths.sort();
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

/** Rejects non-release bytes at a tracked, packaged, uploaded, or write boundary. */
export function assertReleaseProjectionBundle(
  bundle: ProjectionBundle,
): asserts bundle is ReleaseProjectionBundle {
  if (bundle.artifact_class !== "release")
    throw new ValidationFailure({
      code: "ephemeral-artifact-not-release-eligible",
      path: ".",
      message: "ephemeral-artifact-not-release-eligible",
    });
}

export function sameDirectory(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

export function sameOrDescendant(parent: string, candidate: string): boolean {
  const fromParent = relative(resolve(parent), resolve(candidate));
  return (
    fromParent === "" ||
    (!isAbsolute(fromParent) &&
      fromParent !== ".." &&
      !fromParent.startsWith(`..${sep}`))
  );
}
