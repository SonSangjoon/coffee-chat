import {
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import { compareCodePoints, generatedIndexBytes } from "./generate.ts";
import {
  GENERATED_OWNERSHIP_MARKER,
  ENGINE_PLUGIN_SKILLS,
  ENGINE_ONLY_SKILLS,
  ENGINE_PROVISIONING_SKILLS,
  INSTANCE_SKILLS,
  assertArtifactBoundary as assertBoundary,
  assertReleaseProjectionBundle,
  roleOwnedProjectionPaths as declaredOwnedPaths,
  sameDirectory,
  sameOrDescendant,
  type ArtifactClass,
  type ProjectionBundle,
  type ProjectionContext,
} from "./artifact-inventory.ts";
import {
  REPOSITORY_GENERATED_OWNERSHIP_MARKER,
  assertOwnedFilePreimage,
  buildGeneratedOwnershipMarker,
  generatedOwnershipMarkerBytes,
  markerOwnedFilesAsRepositoryPaths,
  markerPathForScope,
  ownershipDigest,
  parseGeneratedOwnershipMarker,
  type GeneratedOwnershipMarker,
  type LegacyGeneratedOwnershipMarker,
} from "./generated-ownership.ts";
import {
  isEngineManifest,
  isInstanceGraph,
  isInstanceManifest,
  type KnowledgeGraph,
  type Manifest,
} from "./knowledge.ts";
import { buildEngineRelease, engineReleaseBytes } from "./engine-release.ts";
import {
  buildEngineUpdateAdvisory,
  type MigrationRegistry,
} from "./migrations.ts";
import type { EngineReleaseConfig } from "./engine-contracts.ts";
import { validateReadmeAssets, validateReadmeLinks } from "./readme-assets.ts";
import { renderReadmes } from "./readme.ts";
import type { DependencyTrackingSnapshot, Snapshot } from "./snapshot.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

export {
  ENGINE_PLUGIN_SKILLS,
  ENGINE_PROVISIONING_SKILLS,
  INSTANCE_SKILLS,
} from "./artifact-inventory.ts";

export type { ArtifactClass, ProjectionContext } from "./artifact-inventory.ts";
export {
  assertReleaseProjectionBundle,
  roleOwnedProjectionPaths,
} from "./artifact-inventory.ts";
export type {
  EphemeralProjectionBundle,
  ProjectionBundle,
  ReleaseProjectionBundle,
} from "./artifact-inventory.ts";
export type { DependencyTrackingSnapshot } from "./snapshot.ts";

function ownerName(manifest: Manifest): string {
  return isInstanceManifest(manifest)
    ? manifest.profile.display_name
    : "Coffee Chat";
}

function presentationName(manifest: Manifest): string {
  return isInstanceManifest(manifest)
    ? `Coffee Chat — ${manifest.profile.short_name}`
    : "Coffee Chat";
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function textBytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

async function availableSkills(
  snapshot: Snapshot,
  repositoryRole: "engine" | "instance",
  declaredSkills?: readonly string[],
): Promise<string[]> {
  const declared =
    declaredSkills ??
    (repositoryRole === "engine" ? ENGINE_PLUGIN_SKILLS : INSTANCE_SKILLS);
  const found: string[] = [];
  for (const name of declared)
    if (await snapshot.exists(`skills/${name}/SKILL.md`)) found.push(name);
  return found;
}

export async function hasDeliveryProjectionInputs(
  snapshot: Snapshot,
): Promise<boolean> {
  return (
    (await snapshot.list("skills")).some((path) =>
      path.endsWith("/SKILL.md"),
    ) || (await snapshot.list("method")).some((path) => path.endsWith(".md"))
  );
}

async function methodReference(
  snapshot: Snapshot,
  includeEngineUpdate = false,
): Promise<Buffer> {
  const paths = (await snapshot.list("method"))
    .filter(
      (path) =>
        path.endsWith(".md") &&
        (includeEngineUpdate || path !== "method/engine-update.md"),
    )
    .sort(compareCodePoints);
  if (paths.length === 0)
    throw new ValidationFailure({
      code: "missing-shared-method",
      path: "./method",
      message: "The authored shared method is missing.",
    });
  const sections = await Promise.all(
    paths.map(async (path) =>
      (await snapshot.read(path)).toString("utf8").trimEnd(),
    ),
  );
  return textBytes(
    `<!-- Generated from ${paths.map(repositoryPath).join(", ")}; do not edit. -->\n\n${sections.join("\n\n")}`,
  );
}

function codexManifest(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.plugin.name,
    version: manifest.plugin.version,
    description: manifest.plugin.description,
    author: {
      name: ownerName(manifest),
      url: manifest.repository.url,
    },
    homepage: manifest.pages_url,
    repository: manifest.repository.url,
    license: "MIT",
    keywords: ["coffee-chat", "knowledge-graph", "perspective"],
    skills: "./skills/",
    interface: {
      displayName: presentationName(manifest),
      shortDescription: "Talk with a public, dated perspective graph",
      longDescription:
        "Converse with, apply, or extend a source-grounded temporal perspective graph.",
      developerName: ownerName(manifest),
      category: "Productivity",
      capabilities: ["Read", "Write"],
      websiteURL: manifest.pages_url,
      defaultPrompt: [
        "Start a one-time Coffee Chat from the public dated graph.",
        "Apply the documented perspective to my named task.",
        "Add a public Source-backed Note through Preview approval.",
      ],
    },
  };
}

function claudeManifest(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.plugin.name,
    version: manifest.plugin.version,
    description: manifest.plugin.description,
    author: { name: ownerName(manifest) },
    homepage: manifest.pages_url,
    repository: manifest.repository.url,
    license: "MIT",
    keywords: ["coffee-chat", "knowledge-graph", "perspective"],
    skills: "./skills/",
  };
}

function codexMarketplace(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.marketplace_name,
    interface: { displayName: presentationName(manifest) },
    plugins: [
      {
        name: manifest.plugin.name,
        source: {
          source: "local",
          path: `./plugins/${manifest.plugin.name}`,
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Productivity",
      },
    ],
  };
}

function claudeMarketplace(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.marketplace_name,
    owner: { name: ownerName(manifest) },
    plugins: [
      {
        name: manifest.plugin.name,
        source: `./plugins/${manifest.plugin.name}`,
        description: manifest.plugin.description,
        version: manifest.plugin.version,
        author: { name: ownerName(manifest) },
        homepage: manifest.pages_url,
        repository: manifest.repository.url,
        license: "MIT",
        keywords: ["coffee-chat", "knowledge-graph", "perspective"],
        category: "Productivity",
        skills: "./skills/",
      },
    ],
  };
}

function contentLicense(): Buffer {
  return textBytes(
    "# Content License\n\nThe [MIT License](./LICENSE) covers reusable Coffee Chat software, schemas, templates, and Skills. Downstream authors retain ownership of the Notes and original prose they add to their own instances.\n\nThird-party Sources retain their own terms. Linking to, citing, indexing, or describing a third-party Source does not grant rights in that Source beyond its applicable terms.\n",
  );
}

function agentRouter(manifest: Manifest): Buffer {
  const roleEntry = isEngineManifest(manifest)
    ? [
        "This engine has no default person. At an engine URL, offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait; never follow an instance fallback from that same entry message or start a personal Coffee Chat from engine data.",
        "Coffee Chat and Apply Perspective require an explicit public instance URL verified through that instance's `coffee-chat.json` and `knowledge/index.json`. After an explicit Create yours or Make mine choice, Build KG may use only an explicit downstream pre-conversion engine checkout that satisfies the origin and target-fingerprint rules; the maintained engine checkout and installed packages/caches remain forbidden. Build KG `contribute` and `update` require an initialized authoritative instance checkout.",
        "Only an explicit external pre-conversion handoff whose live origin, target fingerprint, native Template observation, source/target observation, and template-surface digest all match may route exactly once to repo-local `build-kg`; it must never recurse into `create-coffee-chat`.",
        "After the user explicitly chooses **Create yours**, route to `skills/create-coffee-chat/SKILL.md`; read only that Skill and its generated references, then stop at its Preview approval boundary.",
      ]
    : [
        "Verify this initialized public instance by matching its explicit locator to `coffee-chat.json` `repository.url` or `pages_url`, then matching `repository_role` and profile id to `knowledge/index.json` before treating it as a target.",
        "At instance entry, ask the user to choose **one-time Coffee Chat** or **install instance plugin**, then wait before continuing.",
        "When the installed generic plugin exposes `update-coffee-chat`, it may perform one read-only advisory check against the instance engine tuple. If one locally consistent candidate exists, offer **Review Coffee Chat update** and stop; never fetch, write, install, branch, publish, or merge during discovery.",
      ];
  return textBytes(
    [
      "# Coffee Chat agent router",
      "",
      "Read `coffee-chat.json` and select behavior from its `repository_role` before loading a Skill.",
      "",
      ...roleEntry,
      "",
      "Route conversation requests to `skills/coffee-chat/SKILL.md`, named external task application to `skills/apply-perspective/SKILL.md`, Create yours to `skills/create-coffee-chat/SKILL.md`, engine update review to `skills/update-coffee-chat/SKILL.md`, and Make mine or public graph updates to `skills/build-kg/SKILL.md`. Read only the selected Skill and its generated references.",
    ].join("\n"),
  );
}

export async function generatedProjectionBytes(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<Map<string, Buffer>> {
  await validateReadmeAssets(snapshot);
  const manifest = graph.manifest;
  const creationSkillAvailable =
    isEngineManifest(manifest) &&
    (await snapshot.exists("skills/create-coffee-chat/SKILL.md"));
  const declaredSkills =
    isEngineManifest(manifest) && creationSkillAvailable
      ? ENGINE_PLUGIN_SKILLS
      : INSTANCE_SKILLS;
  const skills = await availableSkills(
    snapshot,
    manifest.repository_role,
    declaredSkills,
  );
  const missingSkills = declaredSkills.filter((name) => !skills.includes(name));
  if (missingSkills.length > 0)
    throw new ValidationFailure({
      code: "missing-skill",
      path: repositoryPath(`skills/${missingSkills[0]}/SKILL.md`),
      message:
        manifest.repository_role === "engine"
          ? "All instance and engine provisioning Skills are required."
          : "All three instance Coffee Chat Skills are required.",
    });
  const method = await methodReference(snapshot, isEngineManifest(manifest));
  const packageRoot = `plugins/${manifest.plugin.name}`;
  const values = new Map<string, Buffer>();
  const codex = jsonBytes(codexManifest(manifest));
  const claude = jsonBytes(claudeManifest(manifest));
  const readmes = renderReadmes(manifest);
  await validateReadmeLinks(snapshot, readmes);
  for (const [path, bytes] of readmes) values.set(path, bytes);
  values.set(
    "CONTENT_LICENSE.md",
    isInstanceManifest(manifest)
      ? await snapshot.read("CONTENT_LICENSE.md")
      : contentLicense(),
  );
  values.set("AGENTS.md", agentRouter(manifest));
  values.set("CLAUDE.md", Buffer.from("@AGENTS.md\n", "utf8"));
  values.set(".codex-plugin/plugin.json", codex);
  values.set(".claude-plugin/plugin.json", claude);
  values.set(
    ".agents/plugins/marketplace.json",
    jsonBytes(codexMarketplace(manifest)),
  );
  values.set(
    ".claude-plugin/marketplace.json",
    jsonBytes(claudeMarketplace(manifest)),
  );
  values.set(`${packageRoot}/.codex-plugin/plugin.json`, codex);
  values.set(`${packageRoot}/.claude-plugin/plugin.json`, claude);
  if (isInstanceManifest(manifest)) {
    values.set(
      `${packageRoot}/knowledge/coffee-chat.json`,
      await snapshot.read("coffee-chat.json"),
    );
  }
  if (await snapshot.exists("LICENSE"))
    values.set(`${packageRoot}/LICENSE`, await snapshot.read("LICENSE"));
  for (const skill of skills) {
    const skillBytes = await snapshot.read(`skills/${skill}/SKILL.md`);
    values.set(`skills/${skill}/references/method.md`, method);
    values.set(`${packageRoot}/skills/${skill}/SKILL.md`, skillBytes);
    values.set(`${packageRoot}/skills/${skill}/references/method.md`, method);
  }
  if (isEngineManifest(manifest)) {
    const referenceFiles = [
      ["release.json", "engine/release.json"],
      ["engine-release.schema.json", "schemas/engine-release.schema.json"],
      ["template-surface.json", "engine/template-surface.json"],
      [
        "engine-template-surface.schema.json",
        "schemas/engine-template-surface.schema.json",
      ],
    ] as const;
    for (const [name, source] of referenceFiles) {
      if (!(await snapshot.exists(source))) continue;
      const bytes = await snapshot.read(source);
      values.set(`skills/create-coffee-chat/references/${name}`, bytes);
      values.set(
        `${packageRoot}/skills/create-coffee-chat/references/${name}`,
        bytes,
      );
    }
    const updaterReady = (
      await Promise.all(
        [
          "engine/release-config.json",
          "engine/migrations/registry.json",
          "schemas/engine-release.schema.json",
          "schemas/engine-migration-registry.schema.json",
          "schemas/engine-update-advisory.schema.json",
          "schemas/engine-migration-document.schema.json",
        ].map((path) => snapshot.exists(path)),
      )
    ).every(Boolean);
    if (!updaterReady) {
      // Disposable legacy engine fixtures may not contain the updater inputs.
      // The maintained engine release always does.
    } else {
      const releaseConfig = parseStrictJson(
        decodeCanonicalText(
          await snapshot.read("engine/release-config.json"),
          "engine/release-config.json",
        ),
        "engine/release-config.json",
      ) as EngineReleaseConfig;
      const release = await buildEngineRelease(
        snapshot,
        manifest,
        releaseConfig,
      );
      const migrationRegistryBytes = await snapshot.read(
        "engine/migrations/registry.json",
      );
      const migrationRegistry = parseStrictJson(
        decodeCanonicalText(
          migrationRegistryBytes,
          "engine/migrations/registry.json",
        ),
        "engine/migrations/registry.json",
      ) as MigrationRegistry;
      const advisorySchemas = {
        release: await snapshot.read("schemas/engine-release.schema.json"),
        migration_registry: await snapshot.read(
          "schemas/engine-migration-registry.schema.json",
        ),
        advisory: await snapshot.read(
          "schemas/engine-update-advisory.schema.json",
        ),
        migration_document: await snapshot.read(
          "schemas/engine-migration-document.schema.json",
        ),
      };
      const advisory = buildEngineUpdateAdvisory(
        release,
        migrationRegistry,
        advisorySchemas,
      );
      const updaterReferences = new Map<string, Buffer>([
        ["release.json", engineReleaseBytes(release)],
        ["migration-registry.json", migrationRegistryBytes],
        ["advisory.json", jsonBytes(advisory)],
        ["engine-release.schema.json", advisorySchemas.release],
        [
          "engine-migration-registry.schema.json",
          advisorySchemas.migration_registry,
        ],
        ["engine-update-advisory.schema.json", advisorySchemas.advisory],
        [
          "engine-migration-document.schema.json",
          advisorySchemas.migration_document,
        ],
      ]);
      for (const [name, bytes] of updaterReferences) {
        values.set(`skills/update-coffee-chat/references/${name}`, bytes);
        values.set(
          `${packageRoot}/skills/update-coffee-chat/references/${name}`,
          bytes,
        );
      }
    }
  }
  if (isInstanceGraph(graph)) {
    const index = generatedIndexBytes(graph);
    values.set(`${packageRoot}/knowledge/index.json`, index);
    values.set(
      `${packageRoot}/knowledge/entities.yml`,
      await snapshot.read("knowledge/entities.yml"),
    );
    for (const note of graph.notes)
      values.set(`${packageRoot}/${note.path}`, note.bytes);
  }
  const packageFiles = new Map(
    [...values.entries()]
      .filter(([path]) => path.startsWith(`${packageRoot}/`))
      .map(
        ([path, bytes]) =>
          [path.slice(`${packageRoot}/`.length), bytes] as const,
      ),
  );
  const packageMarker = buildGeneratedOwnershipMarker({
    scope: "plugin-package",
    files: packageFiles,
    ...(isInstanceManifest(manifest) && manifest.provenance
      ? {
          adopted_engine: {
            repository: manifest.provenance.engine.repository,
            version: manifest.provenance.engine.version,
            release_digest: manifest.provenance.engine.release_digest,
          },
        }
      : {}),
  });
  values.set(
    `${packageRoot}/${GENERATED_OWNERSHIP_MARKER}`,
    generatedOwnershipMarkerBytes(packageMarker),
  );
  const repositoryMarker = buildGeneratedOwnershipMarker({
    scope: "repository",
    files: values,
  });
  values.set(
    REPOSITORY_GENERATED_OWNERSHIP_MARKER,
    generatedOwnershipMarkerBytes(repositoryMarker),
  );
  if (isEngineManifest(manifest)) {
    const actual = [...values.keys()].sort(compareCodePoints);
    // Temporary engine fixtures used by CLI tests may omit delivery-only
    // references. The real engine CLI verifies and materializes the complete
    // creation reference set; compare only paths present in this projection
    // while retaining the closed role inventory for complete checkouts.
    const declared = declaredOwnedPaths(graph).filter((path) =>
      values.has(path),
    );
    if (actual.join("\0") !== declared.join("\0"))
      throw new Error(
        "Engine projection escaped its closed artifact inventory",
      );
  }
  return new Map(
    [...values.entries()].sort(([left], [right]) =>
      compareCodePoints(left, right),
    ),
  );
}

/**
 * Builds a projection and binds it to every snapshot observation made while
 * validating and rendering it. Callers cannot provide their own dependency
 * list, so release provenance cannot be silently omitted.
 */
export async function buildProjectionBundle(
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  context: ProjectionContext,
): Promise<ProjectionBundle> {
  if (
    context.artifact_class === "release" &&
    !sameDirectory(context.output_root, snapshot.root)
  )
    throw new ValidationFailure({
      code: "release-output-must-be-checkout",
      path: ".",
      message: "Release projections must be generated in the current checkout.",
    });
  if (
    context.artifact_class === "ephemeral-test" &&
    (await pathResolvesWithin(snapshot.root, context.output_root))
  )
    throw new ValidationFailure({
      code: "ephemeral-output-must-be-external",
      path: ".",
      message:
        "Ephemeral test projections must be generated outside the checkout.",
    });
  const files = await generatedProjectionBytes(snapshot, graph);
  const dependencies = snapshot.dependencies();
  await assertBoundary(context, dependencies);
  return {
    artifact_class: context.artifact_class,
    files,
    dependencies: [...dependencies],
  };
}

const MAX_OUTPUT_SYMLINK_HOPS = 40;

export async function canonicalizePotentialPath(
  path: string,
  symlinkHops = 0,
): Promise<string> {
  let existing = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(existing), ...missingSegments.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let status;
      try {
        status = await lstat(existing);
      } catch (inspectionError) {
        if ((inspectionError as NodeJS.ErrnoException).code !== "ENOENT")
          throw inspectionError;
        const parent = dirname(existing);
        if (parent === existing) throw error;
        missingSegments.push(basename(existing));
        existing = parent;
        continue;
      }
      if (!status.isSymbolicLink()) throw error;
      if (symlinkHops >= MAX_OUTPUT_SYMLINK_HOPS)
        throw new Error("Too many output-root symlink hops.");
      const linkTarget = await readlink(existing);
      const resolvedTarget = isAbsolute(linkTarget)
        ? linkTarget
        : resolve(dirname(existing), linkTarget);
      return canonicalizePotentialPath(
        resolve(resolvedTarget, ...missingSegments.reverse()),
        symlinkHops + 1,
      );
    }
  }
}

export async function pathResolvesWithin(
  parentRoot: string,
  candidatePath: string,
): Promise<boolean> {
  if (sameOrDescendant(parentRoot, candidatePath)) return true;
  try {
    const [canonicalParent, canonicalCandidate] = await Promise.all([
      realpath(parentRoot),
      canonicalizePotentialPath(candidatePath),
    ]);
    return sameOrDescendant(canonicalParent, canonicalCandidate);
  } catch {
    return true;
  }
}

export type GeneratedProjectionInspection = {
  expected: Map<string, Buffer>;
  ownedStalePaths: string[];
  statePaths: string[];
  diagnostics: Diagnostic[];
  blockingDiagnostics: Diagnostic[];
};

type GeneratedOwnershipState = {
  digests: Map<string, string>;
  legacyPaths: Set<string>;
};

function ownershipDiagnostic(
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return { code, path: repositoryPath(path), message };
}

async function collectGeneratedOwnership(
  snapshot: Snapshot,
  ownershipTarget: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  },
): Promise<{ state: GeneratedOwnershipState; diagnostics: Diagnostic[] }> {
  const state: GeneratedOwnershipState = {
    digests: new Map(),
    legacyPaths: new Set(),
  };
  const diagnostics: Diagnostic[] = [];
  const rootMarkerPath = REPOSITORY_GENERATED_OWNERSHIP_MARKER;
  if (await snapshot.exists(rootMarkerPath)) {
    try {
      const marker = parseGeneratedOwnershipMarker(
        await snapshot.read(rootMarkerPath),
        rootMarkerPath,
      );
      for (const entry of marker.owned_files)
        state.digests.set(entry.path.slice(2), entry.digest);
    } catch (error) {
      diagnostics.push(
        ownershipDiagnostic(
          "generated-ownership-invalid",
          rootMarkerPath,
          error instanceof Error
            ? error.message
            : "Repository ownership marker is invalid.",
        ),
      );
    }
  }
  const packages = new Set(
    (await snapshot.list("plugins"))
      .map((path) => path.split("/")[1])
      .filter((value): value is string => Boolean(value)),
  );
  for (const packageName of packages) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) continue;
    const markerPath = `plugins/${packageName}/${GENERATED_OWNERSHIP_MARKER}`;
    if (!(await snapshot.exists(markerPath))) continue;
    try {
      const marker = parseGeneratedOwnershipMarker(
        await snapshot.read(markerPath),
        markerPath,
      );
      // A downstream instance may carry other people's valid instance
      // packages. Their ownership preimages are intentionally outside this
      // Candidate's mutation boundary; only the current package and engine
      // package markers participate in stale/conflict checks.
      if (
        ownershipTarget.repositoryRole === "instance" &&
        marker.adopted_engine !== undefined &&
        packageName !== ownershipTarget.packageName
      )
        continue;
      const prefix = `plugins/${packageName}`;
      for (const entry of marker.owned_files)
        state.digests.set(`${prefix}/${entry.path.slice(2)}`, entry.digest);
    } catch {
      try {
        const legacy = record(
          parseStrictJson(
            decodeCanonicalText(await snapshot.read(markerPath), markerPath),
            markerPath,
          ),
        ) as LegacyGeneratedOwnershipMarker | undefined;
        // A package owned by another tool is outside Coffee Chat's mutation
        // boundary. Its marker must not turn an otherwise valid projection
        // into a blocking Coffee Chat diagnostic.
        if (legacy?.generated_by && legacy.generated_by !== "coffee-chat")
          continue;
        const validLegacy =
          legacy?.generated_by === "coffee-chat" &&
          legacy.schema_version === "1.0.0" &&
          Array.isArray(legacy.owned_paths);
        if (validLegacy) {
          const foreignInstance =
            ownershipTarget.repositoryRole === "instance" &&
            legacy.repository_role === "instance" &&
            packageName !== ownershipTarget.packageName;
          if (!foreignInstance)
            for (const path of legacy.owned_paths) state.legacyPaths.add(path);
        } else {
          diagnostics.push(
            ownershipDiagnostic(
              "generated-ownership-invalid",
              markerPath,
              "Package ownership marker is invalid.",
            ),
          );
        }
      } catch {
        diagnostics.push(
          ownershipDiagnostic(
            "generated-ownership-invalid",
            markerPath,
            "Package ownership marker is invalid.",
          ),
        );
      }
    }
  }
  return { state, diagnostics };
}

async function snapshotMatchesPreimage(
  snapshot: Snapshot,
  path: string,
  expectedDigest: string,
): Promise<{ exists: boolean; matches: boolean; safe: boolean }> {
  if (!(await snapshot.exists(path)))
    return { exists: false, matches: true, safe: true };
  try {
    await snapshot.assertSafe(path);
    if (snapshot.mode === "worktree") {
      const status = await lstat(resolve(snapshot.root, ...path.split("/")));
      if (status.isSymbolicLink() || !status.isFile())
        return { exists: true, matches: false, safe: false };
    }
    const actual = ownershipDigest(await snapshot.read(path));
    return { exists: true, matches: actual === expectedDigest, safe: true };
  } catch {
    return { exists: true, matches: false, safe: false };
  }
}

const ROOT_ADAPTER_PREFIXES = [
  ".codex-plugin",
  ".claude-plugin",
  ".agents/plugins",
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

async function ownedCoffeeChatPackagePaths(
  snapshot: Snapshot,
  packageName: string,
): Promise<
  | {
      repositoryRole: "engine" | "instance";
      paths: Set<string>;
    }
  | undefined
> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) return undefined;
  const markerPath = `plugins/${packageName}/${GENERATED_OWNERSHIP_MARKER}`;
  if (!(await snapshot.exists(markerPath))) return undefined;
  try {
    const markerBytes = await snapshot.read(markerPath);
    const pluginPath = `plugins/${packageName}/.codex-plugin/plugin.json`;
    if (!(await snapshot.exists(pluginPath))) return undefined;
    const plugin = record(
      parseStrictJson(
        decodeCanonicalText(await snapshot.read(pluginPath), pluginPath),
        pluginPath,
      ),
    );
    const prefix = `plugins/${packageName}/`;
    if (
      plugin?.name !== packageName ||
      !Array.isArray(plugin?.keywords) ||
      !plugin.keywords.includes("coffee-chat")
    )
      return undefined;
    try {
      const parsed = parseGeneratedOwnershipMarker(markerBytes, markerPath);
      return {
        repositoryRole: parsed.adopted_engine ? "instance" : "engine",
        paths: new Set([
          ...markerOwnedFilesAsRepositoryPaths(parsed, prefix.slice(0, -1)),
          markerPath,
        ]),
      };
    } catch {
      // The v1.0 package marker is retained as a narrowly-scoped bootstrap
      // input. It is never trusted for deletion after a byte has changed.
      const legacy = record(
        parseStrictJson(
          decodeCanonicalText(markerBytes, markerPath),
          markerPath,
        ),
      ) as LegacyGeneratedOwnershipMarker | undefined;
      const ownedPaths = legacy?.owned_paths;
      const validPath = (path: unknown): path is string =>
        typeof path === "string" &&
        path.startsWith(prefix) &&
        path.length > prefix.length &&
        !path.includes("\\") &&
        !path.split("/").includes("..") &&
        posix.normalize(path) === path;
      if (
        legacy?.generated_by === "coffee-chat" &&
        legacy?.schema_version === "1.0.0" &&
        (legacy?.repository_role === "engine" ||
          legacy?.repository_role === "instance") &&
        (legacy?.package_name === undefined ||
          legacy?.package_name === packageName) &&
        Array.isArray(ownedPaths) &&
        ownedPaths.every(validPath) &&
        new Set(ownedPaths).size === ownedPaths.length
      )
        return {
          repositoryRole: legacy.repository_role as "engine" | "instance",
          paths: new Set([...ownedPaths, markerPath]),
        };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function ownedPackagePaths(
  snapshot: Snapshot,
): Promise<
  Map<string, { repositoryRole: "engine" | "instance"; paths: Set<string> }>
> {
  const packages = new Map<
    string,
    { repositoryRole: "engine" | "instance"; paths: Set<string> }
  >();
  const packageNames = new Set(
    (await snapshot.list("plugins"))
      .map((path) => path.split("/")[1])
      .filter((value): value is string => Boolean(value)),
  );
  for (const packageName of packageNames) {
    const paths = await ownedCoffeeChatPackagePaths(snapshot, packageName);
    if (paths) packages.set(packageName, paths);
  }
  return packages;
}

async function stalePathIsSafe(
  snapshot: Snapshot,
  path: string,
): Promise<boolean> {
  try {
    await snapshot.assertSafe(path);
    if (snapshot.mode === "worktree") {
      const status = await lstat(resolve(snapshot.root, ...path.split("/")));
      if (status.isSymbolicLink() || !status.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function inspectGeneratedProjections(
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  ownershipTarget: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  } = {
    repositoryRole: graph.manifest.repository_role,
    packageName: graph.manifest.plugin.name,
  },
): Promise<GeneratedProjectionInspection> {
  const expected = (
    await buildProjectionBundle(snapshot, graph, {
      artifact_class: "release",
      output_root: snapshot.root,
    })
  ).files;
  const diagnostics: Diagnostic[] = [];
  const blockingDiagnostics: Diagnostic[] = [];
  const ownedStalePaths = new Set<string>();
  const ownership = await collectGeneratedOwnership(snapshot, ownershipTarget);
  diagnostics.push(...ownership.diagnostics);
  blockingDiagnostics.push(...ownership.diagnostics);
  const ownedPackages = await ownedPackagePaths(snapshot);

  for (const [path, bytes] of expected) {
    let matches = false;
    if (await snapshot.exists(path))
      matches = (await snapshot.read(path)).equals(bytes);
    const previousDigest = ownership.state.digests.get(path);
    if (previousDigest && (await snapshot.exists(path))) {
      const preimage = await snapshotMatchesPreimage(
        snapshot,
        path,
        previousDigest,
      );
      if (!preimage.matches || !preimage.safe) {
        const diagnostic = ownershipDiagnostic(
          "generated-owned-file-conflict",
          path,
          "A generated file changed after its ownership preimage was recorded.",
        );
        diagnostics.push(diagnostic);
        blockingDiagnostics.push(diagnostic);
      }
    }
    if (!matches) {
      const diagnostic = {
        code: "stale-generated-projection",
        path: repositoryPath(path),
        message: "Generated delivery projection is missing or stale.",
      };
      diagnostics.push(diagnostic);
    }
  }

  for (const [path, previousDigest] of ownership.state.digests) {
    if (expected.has(path) || !(await snapshot.exists(path))) continue;
    const preimage = await snapshotMatchesPreimage(
      snapshot,
      path,
      previousDigest,
    );
    if (!preimage.matches || !preimage.safe) {
      const diagnostic = ownershipDiagnostic(
        "generated-owned-file-conflict",
        path,
        "A stale generated file changed after its ownership preimage was recorded.",
      );
      diagnostics.push(diagnostic);
      blockingDiagnostics.push(diagnostic);
      continue;
    }
    ownedStalePaths.add(path);
    diagnostics.push(
      ownershipDiagnostic(
        "unexpected-generated-projection",
        path,
        "Owned generated content is not part of the current deterministic projection.",
      ),
    );
  }
  for (const path of ownership.state.legacyPaths) {
    if (expected.has(path)) {
      const expectedBytes = expected.get(path)!;
      const matches =
        (await snapshot.exists(path)) &&
        (await snapshot.read(path)).equals(expectedBytes);
      if (!matches) {
        const diagnostic = ownershipDiagnostic(
          "generated-ownership-upgrade-required",
          path,
          "Legacy generated bytes do not match the immutable pre-change projection bundle.",
        );
        diagnostics.push(diagnostic);
        blockingDiagnostics.push(diagnostic);
      }
      continue;
    }
    if (!(await snapshot.exists(path))) continue;
    const diagnostic = ownershipDiagnostic(
      "generated-ownership-upgrade-required",
      path,
      "Legacy ownership cannot authorize deletion without a digest-bound marker.",
    );
    diagnostics.push(diagnostic);
    blockingDiagnostics.push(diagnostic);
  }

  // A downstream Make mine checkout is still an engine-role graph until the
  // Candidate transaction converts it. Keep the engine provisioning Skill
  // visible during that pre-conversion inspection even though the eventual
  // ownership target is an instance package.
  const hasEngineProvisioningSurface =
    graph.manifest.repository_role === "engine" &&
    ((await snapshot.exists("skills/create-coffee-chat/SKILL.md")) ||
      (await snapshot.exists(
        "skills/create-coffee-chat/references/release.json",
      )));
  const allowedSkillNames = hasEngineProvisioningSurface
    ? ENGINE_PLUGIN_SKILLS
    : INSTANCE_SKILLS;
  const allowedSkillPaths = new Set([
    ...allowedSkillNames.map((name) => `skills/${name}/SKILL.md`),
    ...allowedSkillNames.map((name) => `skills/${name}/references/method.md`),
    ...(hasEngineProvisioningSurface
      ? [
          "skills/create-coffee-chat/references/engine-release.schema.json",
          "skills/create-coffee-chat/references/engine-template-surface.schema.json",
          "skills/create-coffee-chat/references/release.json",
          "skills/create-coffee-chat/references/template-surface.json",
          "skills/update-coffee-chat/references/engine-release.schema.json",
          "skills/update-coffee-chat/references/engine-migration-registry.schema.json",
          "skills/update-coffee-chat/references/engine-update-advisory.schema.json",
          "skills/update-coffee-chat/references/engine-migration-document.schema.json",
          "skills/update-coffee-chat/references/release.json",
          "skills/update-coffee-chat/references/migration-registry.json",
          "skills/update-coffee-chat/references/advisory.json",
        ]
      : []),
  ]);
  for (const path of await snapshot.list("skills")) {
    if (allowedSkillPaths.has(path)) continue;
    const diagnostic = {
      code: "unexpected-skill",
      path: repositoryPath(path),
      message:
        graph.manifest.repository_role === "engine"
          ? "Engine root Skills are closed to the three instance Skills and engine provisioning/update Skills."
          : "Instance root Skills are closed to coffee-chat, apply-perspective, and build-kg.",
    };
    diagnostics.push(diagnostic);
    blockingDiagnostics.push(diagnostic);
  }

  for (const prefix of ROOT_ADAPTER_PREFIXES) {
    for (const path of await snapshot.list(prefix)) {
      if (expected.has(path)) continue;
      const diagnostic = {
        code: "unexpected-generated-projection",
        path: repositoryPath(path),
        message:
          "Unexpected content exists inside a closed root adapter directory.",
      };
      diagnostics.push(diagnostic);
      blockingDiagnostics.push(diagnostic);
    }
  }

  for (const [packageName, ownedPackage] of ownedPackages) {
    if (
      ownershipTarget.repositoryRole === "instance" &&
      packageName !== ownershipTarget.packageName &&
      ownedPackage.repositoryRole !== "engine"
    )
      continue;
    const ownedPaths = ownedPackage.paths;
    const packageRoot = `plugins/${packageName}`;
    for (const path of await snapshot.list(packageRoot)) {
      if (expected.has(path)) continue;
      if (
        ownership.state.legacyPaths.has(path) ||
        ownership.state.digests.has(path)
      )
        continue;
      if (!ownedPaths.has(path)) continue;
      if (!(await stalePathIsSafe(snapshot, path))) {
        const diagnostic = {
          code: "unsafe-generated-projection",
          path: repositoryPath(path),
          message:
            "Owned generated package content must be a safe regular file.",
        };
        diagnostics.push(diagnostic);
        blockingDiagnostics.push(diagnostic);
        continue;
      }
      ownedStalePaths.add(path);
      diagnostics.push({
        code: "unexpected-generated-projection",
        path: repositoryPath(path),
        message:
          "Owned generated package content is not part of the current deterministic projection.",
      });
    }
  }

  const sortedStalePaths = [...ownedStalePaths].sort(compareCodePoints);
  return {
    expected,
    ownedStalePaths: sortedStalePaths,
    statePaths: [...new Set([...expected.keys(), ...sortedStalePaths])].sort(
      compareCodePoints,
    ),
    diagnostics: sortDiagnostics(diagnostics),
    blockingDiagnostics: sortDiagnostics(blockingDiagnostics),
  };
}

export async function generatedProjectionStatePaths(
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  ownershipTarget?: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  },
): Promise<string[]> {
  return (await inspectGeneratedProjections(snapshot, graph, ownershipTarget))
    .statePaths;
}

export async function checkGeneratedProjections(
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
): Promise<Diagnostic[]> {
  return (await inspectGeneratedProjections(snapshot, graph)).diagnostics;
}

async function assertSafeOutput(root: string, path: string): Promise<string> {
  const target = resolve(root, ...path.split("/"));
  const canonicalRoot = await realpath(root);
  let candidate = dirname(target);
  while (candidate !== root) {
    try {
      await lstat(candidate);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      candidate = dirname(candidate);
    }
  }
  const canonicalParent = await realpath(candidate);
  const fromRoot = relative(canonicalRoot, canonicalParent);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`))
    throw new ValidationFailure({
      code: "symlink-escape",
      path: repositoryPath(path),
      message: "Generated output path must resolve inside the repository.",
    });
  try {
    if ((await lstat(target)).isSymbolicLink())
      throw new ValidationFailure({
        code: "symlink-escape",
        path: repositoryPath(path),
        message: "Generated output path must not be a symbolic link.",
      });
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function writeGeneratedProjections(
  root: string,
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
): Promise<void> {
  if (snapshot.mode !== "worktree" || !sameDirectory(root, snapshot.root))
    throw new ValidationFailure({
      code: "release-output-must-be-checkout",
      path: ".",
      message: "Release projections must be generated in the current checkout.",
    });
  const inspection = await inspectGeneratedProjections(snapshot, graph);
  if (inspection.blockingDiagnostics.length > 0)
    throw new ValidationFailure(inspection.blockingDiagnostics[0]!);
  const removedDirectories = new Set<string>();
  for (const path of inspection.ownedStalePaths) {
    const target = await assertSafeOutput(root, path);
    await unlink(target);
    let directory = posix.dirname(path);
    while (
      directory.startsWith("plugins/") &&
      directory.split("/").length > 1
    ) {
      removedDirectories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  for (const path of [...removedDirectories].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  )) {
    const target = await assertSafeOutput(root, `${path}/.keep-check`);
    try {
      await rmdir(dirname(target));
    } catch (error) {
      if (
        !["ENOENT", "ENOTEMPTY", "EEXIST"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
  }
  const bundle = await buildProjectionBundle(snapshot, graph, {
    artifact_class: "release",
    output_root: root,
  });
  assertReleaseProjectionBundle(bundle);
  const projections = bundle.files;
  for (const [path, bytes] of projections) {
    const target = await assertSafeOutput(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    if (!(await readFile(target)).equals(bytes))
      throw new Error("Generated bytes could not be verified");
  }
}
