import { isAbsolute, relative, resolve, sep } from "node:path";
import { ValidationFailure } from "./contracts.ts";
import { isInstanceGraph, type KnowledgeGraph } from "./knowledge.ts";
import type {
  ArtifactAudience,
  ArtifactContext,
  ArtifactOwnership,
  EngineArtifactPolicy,
  TemplateDisposition,
} from "./engine-contracts.ts";

export type {
  ArtifactAudience,
  ArtifactContext,
  ArtifactOwnership,
  EngineArtifactPolicy,
};
export type { TemplateDisposition } from "./engine-contracts.ts";

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

/**
 * These are the only generated copies of the template-surface manifest.  They
 * intentionally use a self-copy binding because hashing their bytes would
 * create a surface -> copy -> surface cycle.
 */
export const TEMPLATE_SURFACE_SELF_COPY_PATHS = [
  "./engine/template-surface.json",
  "./skills/create-coffee-chat/references/template-surface.json",
  "./plugins/coffee-chat/skills/create-coffee-chat/references/template-surface.json",
] as const;

const MANAGED_PATHS = [
  ".editorconfig",
  ".gitattributes",
  ".github/workflows/ci.yml",
  ".gitignore",
  ".gitleaks.toml",
  ".node-version",
  ".pre-commit-config.yaml",
  ".prettierignore",
  "LICENSE",
  "astro.config.mjs",
  "docs/assets/readme/coffee-chat-cover.png",
  "docs/assets/readme/coffee-chat-flow.en.png",
  "docs/assets/readme/coffee-chat-trust.en.png",
  "method/shared-method.md",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "schemas/candidate-manifest.schema.json",
  "schemas/candidate-request.schema.json",
  "schemas/coffee-chat.schema.json",
  "schemas/engine-lock.schema.json",
  "schemas/generated-ownership.schema.json",
  "schemas/entity-registry.schema.json",
  "schemas/knowledge-index.schema.json",
  "schemas/note-frontmatter.schema.json",
  "schemas/preview.schema.json",
  "schemas/receipt.schema.json",
  "site/components/GraphView.astro",
  "site/components/KnowledgeList.astro",
  "site/components/TemporalFilters.astro",
  "site/env.d.ts",
  "site/layouts/BaseLayout.astro",
  "site/lib/build-context.ts",
  "site/lib/load-site-model.ts",
  "site/lib/render-markdown.ts",
  "site/lib/site-context.ts",
  "site/lib/view.ts",
  "site/pages/entities/[id].astro",
  "site/pages/graph.astro",
  "site/pages/index.astro",
  "site/pages/notes/[id].astro",
  "site/pages/sources/[slug].astro",
  "site/pages/timeline.astro",
  "site/styles/global.css",
  "skills/apply-perspective/SKILL.md",
  "skills/apply-perspective/references/method.md",
  "skills/build-kg/SKILL.md",
  "skills/build-kg/references/method.md",
  "skills/coffee-chat/SKILL.md",
  "skills/coffee-chat/references/method.md",
  "tests/artifact-boundaries.test.ts",
  "tests/candidate-downstream-identity.test.ts",
  "tests/e2e/site.spec.ts",
  "tests/engine-provenance.test.ts",
  "tests/fixture-isolation.test.ts",
  "tests/foundation-contracts.test.ts",
  "tests/generated-ownership.test.ts",
  "tests/gitleaks-contracts.test.ts",
  "tests/helpers/isolated-host-config.ts",
  "tests/helpers/site-fixture.ts",
  "tests/helpers/skill-harness.ts",
  "tests/isolated-host-config.test.ts",
  "tests/make-mine-acceptance.test.ts",
  "tests/plugin-lifecycle.test.ts",
  "tests/readme-assets.test.ts",
  "tests/readme-projections.test.ts",
  "tests/render-markdown.test.ts",
  "tests/role-contracts.test.ts",
  "tests/site-build.test.ts",
  "tests/site-model.test.ts",
  "tests/site-publication-boundary.test.ts",
  "tests/skill-contracts.test.ts",
  "tests/skill-evaluations.test.ts",
  "tests/task-2-contracts.test.ts",
  "tests/task-3-candidate.test.ts",
  "tests/task-3-cli.test.ts",
  "tests/task-3-hooks.test.ts",
  "tests/task-4-candidate-projections.test.ts",
  "tests/task-4-projections.test.ts",
  "tests/workflow-contracts.test.ts",
  "tools/artifact-inventory.ts",
  "tools/candidate.ts",
  "tools/cc.ts",
  "tools/contracts.ts",
  "tools/engine-contracts.ts",
  "tools/engine-provenance.ts",
  "tools/generate.ts",
  "tools/generated-ownership.ts",
  "tools/gitleaks.ts",
  "tools/hooks.ts",
  "tools/knowledge.ts",
  "tools/projections.ts",
  "tools/readme-assets.ts",
  "tools/readme.ts",
  "tools/site-build.ts",
  "tools/snapshot.ts",
  "tools/strict-input.ts",
  "tools/temporal.ts",
  "tsconfig.json",
  "vitest.config.ts",
] as const;

const DELIVERY_PATHS = [
  "schemas/engine-migration-registry.schema.json",
  "schemas/engine-release-config.schema.json",
  "schemas/engine-release.schema.json",
  "schemas/engine-template-surface.schema.json",
  "tests/engine-generation-cli.test.ts",
  "tests/engine-release.test.ts",
  "tests/release-dependency-closure.test.ts",
  "tools/engine-cli.ts",
  "tools/engine-release.ts",
  "tools/workflow-projections.ts",
] as const;

const EXCLUDED_PATHS = [
  ".agents/plugins/marketplace.json",
  ".coffee-chat/generated-files.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".github/workflows/codeql.yml",
  ".github/workflows/pages.yml",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTENT_LICENSE.md",
  "README.ko.md",
  "README.md",
  "coffee-chat.json",
  "docs/superpowers/plans/2026-08-01-coffee-chat-v1.md",
  "docs/superpowers/plans/2026-08-02-codeql-merge-gate.md",
  "docs/superpowers/plans/2026-08-02-coffee-chat-engine-v1.md",
  "docs/superpowers/plans/2026-08-02-coffee-chat-readme.md",
  "docs/superpowers/plans/2026-08-03-coffee-chat-agent-lifecycle.md",
  "docs/superpowers/specs/2026-07-30-coffee-chat-design.md",
  "docs/superpowers/specs/2026-08-02-coffee-chat-readme-design.md",
  "docs/superpowers/specs/2026-08-03-coffee-chat-agent-lifecycle-design.md",
  "docs/testing.md",
  "engine/migrations/registry.json",
  "engine/release-config.json",
  "engine/release.json",
  "engine/template-surface.json",
  "method/engine-update.md",
  "plugins/coffee-chat/.claude-plugin/plugin.json",
  "plugins/coffee-chat/.codex-plugin/plugin.json",
  "plugins/coffee-chat/.coffee-chat-generated.json",
  "plugins/coffee-chat/LICENSE",
  "plugins/coffee-chat/skills/apply-perspective/SKILL.md",
  "plugins/coffee-chat/skills/apply-perspective/references/method.md",
  "plugins/coffee-chat/skills/build-kg/SKILL.md",
  "plugins/coffee-chat/skills/build-kg/references/method.md",
  "plugins/coffee-chat/skills/coffee-chat/SKILL.md",
  "plugins/coffee-chat/skills/coffee-chat/references/method.md",
  "plugins/coffee-chat/skills/create-coffee-chat/references/template-surface.json",
  "skills/create-coffee-chat/SKILL.md",
  "skills/create-coffee-chat/references/template-surface.json",
  "skills/update-coffee-chat/SKILL.md",
  "skills/update-coffee-chat/references/method.md",
  "skills/update-coffee-chat/references/release.json",
  "skills/update-coffee-chat/references/release.schema.json",
  "skills/update-coffee-chat/references/template-surface.json",
] as const;

const FIXTURE_PATH_PREFIX = "tests/fixtures/";

/** Sorted, exact paths that may be adopted by a downstream instance. */
export function engineManagedSourcePaths(): string[] {
  return [...MANAGED_PATHS].sort();
}

/** Sorted, exact engine-only verification/delivery paths. */
export function engineDeliverySourcePaths(): string[] {
  return [...DELIVERY_PATHS].sort();
}

export function engineExcludedSourcePaths(): string[] {
  return [...EXCLUDED_PATHS].sort();
}

export function forbiddenEngineManagedPath(path: string): boolean {
  const normalized = path.startsWith("./") ? path.slice(2) : path;
  return (
    normalized === "coffee-chat.json" ||
    normalized.startsWith("knowledge/") ||
    normalized === "CONTENT_LICENSE.md" ||
    normalized === ".coffee-chat/engine-lock.json" ||
    normalized === "engine/release.json" ||
    normalized === "engine/template-surface.json" ||
    normalized.startsWith("engine/migrations/") ||
    normalized.startsWith("plugins/") ||
    normalized.startsWith("README") ||
    normalized === "AGENTS.md" ||
    normalized === "CLAUDE.md"
  );
}

function stateFor(
  context: ArtifactContext,
  audience: ArtifactAudience,
  ownership: ArtifactOwnership,
): EngineArtifactPolicy["states"] {
  return {
    [context]: { audience, ownership },
  };
}

/**
 * Return the closed policy entry for a path.  Unknown files deliberately do
 * not receive a prefix-based fallback; release generation must stop until a
 * newly tracked path is intentionally classified.
 */
export function artifactPolicyForPath(
  path: string,
): EngineArtifactPolicy | undefined {
  const normalized = path.startsWith("./") ? path.slice(2) : path;
  if ((MANAGED_PATHS as readonly string[]).includes(normalized))
    return {
      path: normalized,
      states: {
        "engine-repository": { audience: "instance", ownership: "source" },
        "template-copy": { audience: "instance", ownership: "source" },
        "instance-repository": { audience: "instance", ownership: "source" },
      },
      template_disposition: "adopt-engine-source",
      release_class: "managed",
    };
  if ((DELIVERY_PATHS as readonly string[]).includes(normalized))
    return {
      path: normalized,
      states: {
        "engine-repository": { audience: "engine-only", ownership: "source" },
        "template-copy": { audience: "engine-only", ownership: "source" },
      },
      template_disposition: "remove-engine-only",
      release_class: "delivery",
    };
  if ((EXCLUDED_PATHS as readonly string[]).includes(normalized)) {
    const engineOnly =
      normalized.startsWith("engine/") ||
      normalized.startsWith("docs/") ||
      normalized.startsWith("method/engine-") ||
      normalized.startsWith("skills/create-") ||
      normalized.startsWith("skills/update-") ||
      normalized.startsWith("plugins/");
    const authored =
      normalized === "coffee-chat.json" || normalized === "CONTENT_LICENSE.md";
    return {
      path: normalized,
      states: {
        "engine-repository": {
          audience: engineOnly ? "engine-only" : "instance",
          ownership: authored ? "authored" : "generated",
        },
        "template-copy": {
          audience: engineOnly ? "engine-only" : "instance",
          ownership: authored ? "authored" : "generated",
        },
        "instance-repository": {
          audience: "instance",
          ownership: authored ? "authored" : "generated",
        },
      },
      template_disposition: authored
        ? "replace-instance-authored"
        : engineOnly
          ? "remove-engine-only"
          : "replace-instance-generated",
      release_class: "excluded",
    };
  }
  if (normalized.startsWith(FIXTURE_PATH_PREFIX))
    return {
      path: normalized,
      states: {
        "engine-repository": { audience: "engine-only", ownership: "authored" },
        "template-copy": { audience: "engine-only", ownership: "authored" },
      },
      template_disposition: "remove-engine-only",
      release_class: "delivery",
    };
  return undefined;
}

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
    ".coffee-chat/generated-files.json",
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
