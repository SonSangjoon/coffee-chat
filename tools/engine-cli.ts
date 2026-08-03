import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Diagnostic } from "./contracts.ts";
import {
  UnableToComplete,
  ValidationFailure,
  repositoryPath,
} from "./contracts.ts";
import {
  engineReleaseBytes,
  buildEngineRelease,
  buildTemplateSurface,
  templateSurfaceBytes,
} from "./engine-release.ts";
import {
  artifactPolicyForPath,
  engineExcludedSourcePaths,
  engineManagedSourcePaths,
  engineDeliverySourcePaths,
} from "./artifact-inventory.ts";
import { generatedProjectionBytes } from "./projections.ts";
import { validateKnowledge } from "./knowledge.ts";
import { createSnapshot } from "./snapshot.ts";
import { parseStrictJson, decodeCanonicalText } from "./strict-input.ts";
import { renderRoleWorkflows } from "./workflow-projections.ts";
import type { EngineManifest } from "./knowledge.ts";
import type {
  EngineReleaseConfig,
  RepositoryProjection,
} from "./engine-contracts.ts";

type EngineCommand = "generate" | "check";

function usage(): never {
  throw new UnableToComplete({
    code: "engine-cli-usage",
    path: ".",
    message:
      "Usage: engine-cli <generate|check> [--snapshot worktree|staged] [--format human|json] [--check]",
  });
}

function parseArgs(args: string[]): {
  command: EngineCommand;
  snapshot: "worktree" | "staged";
  format: "human" | "json";
} {
  const initialCommand = args.shift();
  if (initialCommand !== "generate" && initialCommand !== "check") usage();
  let command: EngineCommand = initialCommand;
  let snapshot: "worktree" | "staged" = "worktree";
  let format: "human" | "json" = "human";
  while (args.length) {
    const option = args.shift();
    if (option === "--snapshot") {
      const value = args.shift();
      if (value !== "worktree" && value !== "staged") usage();
      snapshot = value;
    } else if (option === "--format") {
      const value = args.shift();
      if (value !== "human" && value !== "json") usage();
      format = value;
    } else if (option === "--check" && command === "generate") {
      // `generate --check` is an alias for check in the engine delivery CLI.
      command = "check";
    } else usage();
  }
  return { command, snapshot, format };
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readConfig(
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
): Promise<EngineReleaseConfig> {
  return parseStrictJson(
    decodeCanonicalText(
      await snapshot.read("engine/release-config.json"),
      "engine/release-config.json",
    ),
    "engine/release-config.json",
  ) as EngineReleaseConfig;
}

function mergeProjection(
  ...projections: RepositoryProjection[]
): RepositoryProjection {
  const outputMap = new Map<string, RepositoryProjection["outputs"][number]>();
  const deletions = new Set<string>();
  for (const projection of projections) {
    for (const path of projection.deletions) {
      deletions.add(path);
      outputMap.delete(path);
    }
    for (const output of projection.outputs) {
      outputMap.set(output.path, output);
      deletions.delete(output.path);
    }
  }
  return {
    outputs: [...outputMap.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
    deletions: [...deletions].sort(),
  };
}

async function expectedProjection(
  root: string,
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
): Promise<RepositoryProjection> {
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  if (!validation.graph || validation.diagnostics.length)
    throw new ValidationFailure(
      validation.diagnostics[0] ?? {
        code: "engine-manifest-invalid",
        path: "./coffee-chat.json",
        message: "Engine manifest is invalid.",
      },
    );
  const manifest = validation.graph.manifest as EngineManifest;
  if (manifest.repository_role !== "engine")
    throw new ValidationFailure({
      code: "engine-role-required",
      path: "./coffee-chat.json",
      message: "Engine release generation requires an engine-role checkout.",
    });
  const config = await readConfig(snapshot);
  const release = await buildEngineRelease(snapshot, manifest, config);
  const generated = await generatedProjectionBytes(snapshot, validation.graph);
  const baseProjection: RepositoryProjection = {
    outputs: [...generated.entries()].map(([path, bytes]) => ({
      path,
      bytes,
      mode: "100644" as const,
    })),
    deletions: [],
  };
  const workflow = renderRoleWorkflows("engine");
  const releaseProjection: RepositoryProjection = {
    outputs: [
      {
        path: "engine/release.json",
        bytes: engineReleaseBytes(release),
        mode: "100644",
      },
    ],
    deletions: [],
  };
  const surfacePlaceholder: RepositoryProjection = {
    outputs: [
      {
        path: "engine/template-surface.json",
        bytes: Buffer.alloc(0),
        mode: "100644",
      },
    ],
    deletions: [],
  };
  const first = mergeProjection(
    baseProjection,
    workflow,
    releaseProjection,
    surfacePlaceholder,
  );
  const policies = [
    ...new Set([
      ...engineManagedSourcePaths(),
      ...engineDeliverySourcePaths(),
      ...engineExcludedSourcePaths(),
    ]),
  ]
    .map((path) => artifactPolicyForPath(path))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const surface = await buildTemplateSurface(
    snapshot,
    release,
    policies,
    first,
  );
  const surfaceProjection: RepositoryProjection = {
    outputs: [
      {
        path: "engine/template-surface.json",
        bytes: templateSurfaceBytes(surface),
        mode: "100644",
      },
    ],
    deletions: [],
  };
  return mergeProjection(first, surfaceProjection);
}

async function writeProjection(
  root: string,
  projection: RepositoryProjection,
): Promise<void> {
  for (const path of projection.deletions) {
    // Task 2 does not delete user files; deletions are reserved for later
    // instance conversion/update transactions.
    void path;
  }
  for (const output of projection.outputs) {
    if (output.path.startsWith("/") || output.path.split("/").includes(".."))
      throw new ValidationFailure({
        code: "engine-output-path-invalid",
        path: repositoryPath(output.path),
        message: "Engine generated output must remain inside the checkout.",
      });
    const target = resolve(root, ...output.path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output.bytes, {
      mode: output.mode === "100755" ? 0o755 : 0o644,
    });
  }
}

async function compareProjection(
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
  projection: RepositoryProjection,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const entries = new Map(
    (await snapshot.listRepositoryEntries()).map((entry) => [
      entry.path,
      entry.mode,
    ]),
  );
  for (const output of projection.outputs) {
    try {
      const path = output.path.replace(/^\.\//, "");
      const actual = await snapshot.read(path);
      if (!actual.equals(output.bytes) || entries.get(path) !== output.mode)
        diagnostics.push({
          code: "stale-engine-projection",
          path: repositoryPath(output.path),
          message: "Generated engine projection is missing or stale.",
        });
    } catch {
      diagnostics.push({
        code: "stale-engine-projection",
        path: repositoryPath(output.path),
        message: "Generated engine projection is missing or stale.",
      });
    }
  }
  return diagnostics;
}

async function main(): Promise<void> {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(process.argv.slice(2));
    const root = process.cwd();
    const snapshot = await createSnapshot(root, options.snapshot);
    const projection = await expectedProjection(root, snapshot);
    const diagnostics =
      options.command === "check"
        ? await compareProjection(snapshot, projection)
        : [];
    if (options.command === "generate" && options.snapshot === "worktree")
      await writeProjection(root, projection);
    if (options.format === "json")
      process.stdout.write(`${JSON.stringify(diagnostics)}\n`);
    else if (diagnostics.length)
      for (const item of diagnostics)
        process.stdout.write(`${item.path}: [${item.code}] ${item.message}\n`);
    else process.stdout.write("Coffee Chat engine generation passed.\n");
    process.exitCode = diagnostics.length ? 1 : 0;
  } catch (error) {
    const diagnostic =
      error instanceof ValidationFailure || error instanceof UnableToComplete
        ? error.diagnostic
        : {
            code: "engine-cli-internal-error",
            path: ".",
            message: "Engine generation could not complete.",
          };
    process.stdout.write(`${JSON.stringify([diagnostic])}\n`);
    process.exitCode = error instanceof UnableToComplete ? 2 : 1;
  }
}

await main();
