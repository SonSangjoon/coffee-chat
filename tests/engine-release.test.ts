import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_SURFACE_SELF_COPY_PATHS,
  artifactPolicyForPath,
  engineDeliverySourcePaths,
  engineExcludedSourcePaths,
  engineManagedSourcePaths,
} from "../tools/artifact-inventory.ts";
import {
  buildEngineRelease,
  buildTemplateSurface,
  canonicalEngineReleaseDigest,
  canonicalTemplateSurfaceDigest,
} from "../tools/engine-release.ts";
import { generatedProjectionBytes } from "../tools/projections.ts";
import { validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";
import { renderRoleWorkflows } from "../tools/workflow-projections.ts";
import { parseStrictJson, decodeCanonicalText } from "../tools/strict-input.ts";
import type { EngineManifest, InstanceGraph } from "../tools/knowledge.ts";
import type {
  EngineReleaseConfig,
  RepositoryProjection,
} from "../tools/engine-contracts.ts";

const root = resolve(import.meta.dirname, "..");

async function engineInputs() {
  const snapshot = await createSnapshot(root, "worktree");
  const result = await validateKnowledge(snapshot, { validateIndex: false });
  expect(result.diagnostics).toEqual([]);
  expect(result.graph?.manifest.repository_role).toBe("engine");
  const manifest = result.graph?.manifest as EngineManifest;
  const config = parseStrictJson(
    decodeCanonicalText(
      await snapshot.read("engine/release-config.json"),
      "engine/release-config.json",
    ),
    "engine/release-config.json",
  ) as EngineReleaseConfig;
  return { snapshot, manifest, config, graph: result.graph! };
}

describe("deterministic engine release contracts", () => {
  it("keeps release identity independent from the generic plugin version", async () => {
    const { snapshot, manifest, config } = await engineInputs();
    const release = await buildEngineRelease(snapshot, manifest, config);
    expect(release.repository).toBe(manifest.repository.url);
    expect(release.version).toBe(config.version);
    expect(release.source_ref).toBe(config.source_ref);
    expect(release.release_digest).toBe(canonicalEngineReleaseDigest(release));
    const manifestWithDifferentPlugin = structuredClone(manifest);
    manifestWithDifferentPlugin.plugin.version = "9.9.9";
    const changed = await buildEngineRelease(
      snapshot,
      manifestWithDifferentPlugin,
      config,
    );
    expect(changed.release_digest).toBe(release.release_digest);
  });

  it("sorts and uniquely classifies release inventory paths", async () => {
    const { snapshot, manifest, config } = await engineInputs();
    const release = await buildEngineRelease(snapshot, manifest, config);
    for (const files of [release.managed_files, release.delivery_files]) {
      expect(files.map((file) => file.path)).toEqual(
        [...files.map((file) => file.path)].sort(),
      );
      expect(new Set(files.map((file) => file.path)).size).toBe(files.length);
      for (const file of files)
        expect(artifactPolicyForPath(file.path)).toBeDefined();
    }
    expect(
      release.managed_files.some((file) => file.path === "./coffee-chat.json"),
    ).toBe(false);
    expect(
      release.delivery_files.some(
        (file) => file.path === "./engine/release.json",
      ),
    ).toBe(false);
  });

  it("binds every final template path exactly once and uses only approved self copies", async () => {
    const { snapshot, manifest, config, graph } = await engineInputs();
    const release = await buildEngineRelease(snapshot, manifest, config);
    const generated = await generatedProjectionBytes(
      snapshot,
      graph as InstanceGraph,
    );
    const projection: RepositoryProjection = {
      outputs: [...generated.entries()]
        .map(([path, bytes]) => ({
          path,
          bytes,
          mode: "100644" as "100644" | "100755",
        }))
        .concat(renderRoleWorkflows("engine").outputs),
      deletions: [],
    };
    const surface = await buildTemplateSurface(
      snapshot,
      release,
      [
        ...new Set([
          ...engineManagedSourcePaths(),
          ...engineDeliverySourcePaths(),
          ...engineExcludedSourcePaths(),
        ]),
      ]
        .map((path) => artifactPolicyForPath(path)!)
        .filter(Boolean),
      projection,
    );
    expect(surface.surface_digest).toBe(
      canonicalTemplateSurfaceDigest({
        ...surface,
        surface_digest: undefined,
      } as never),
    );
    expect(new Set(surface.files.map((file) => file.path)).size).toBe(
      surface.files.length,
    );
    for (const file of surface.files) {
      if (file.binding.kind === "surface-self-copy")
        expect(TEMPLATE_SURFACE_SELF_COPY_PATHS).toContain(file.path);
    }
  });

  it("renders bootstrap-safe engine workflows and publishable instance workflows", () => {
    const engine = renderRoleWorkflows("engine");
    const instance = renderRoleWorkflows("instance");
    const engineCodeql = engine.outputs
      .find((output) => output.path.endsWith("codeql.yml"))!
      .bytes.toString("utf8");
    const enginePages = engine.outputs
      .find((output) => output.path.endsWith("pages.yml"))!
      .bytes.toString("utf8");
    const instanceCodeql = instance.outputs
      .find((output) => output.path.endsWith("codeql.yml"))!
      .bytes.toString("utf8");
    const instancePages = instance.outputs
      .find((output) => output.path.endsWith("pages.yml"))!
      .bytes.toString("utf8");
    expect(engineCodeql).not.toMatch(/^\s*push:/m);
    expect(enginePages).not.toMatch(/^\s*push:/m);
    expect(instanceCodeql).toMatch(/^\s*push:/m);
    expect(instancePages).toMatch(/^\s*push:/m);
  });
});
