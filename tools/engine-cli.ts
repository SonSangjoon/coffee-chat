import { mkdir, writeFile } from "node:fs/promises";
import { lstat, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
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
  GENERATED_OWNERSHIP_MARKER,
  artifactPolicyForPath,
  engineExcludedSourcePaths,
  engineManagedSourcePaths,
  engineDeliverySourcePaths,
} from "./artifact-inventory.ts";
import {
  REPOSITORY_GENERATED_OWNERSHIP_MARKER,
  buildGeneratedOwnershipMarker,
  generatedOwnershipMarkerBytes,
} from "./generated-ownership.ts";
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
import {
  applyEngineUpdate,
  createEngineUpdateRuntime,
  inspectEngineUpdate,
  prepareEngineUpdate,
  type Sha256Digest,
} from "./engine-update.ts";
import {
  applyEnginePublication,
  createEnginePublicationDependencies,
  prepareEnginePublication,
} from "./engine-publication.ts";

type EngineCommand = "generate" | "check";
type UpdateOptions =
  | {
      kind: "update-inspect" | "update-prepare" | "update-apply";
      target: string;
      source?: string;
      format: "human" | "json";
      setup_receipt?: string;
      receipt?: string;
      out?: string;
      candidate_dir?: string;
      approve?: Sha256Digest;
    }
  | {
      kind: "publication-prepare";
      worktree: string;
      update_receipt: string;
      publication_receipt: string;
      out: string;
      format: "json";
    }
  | {
      kind: "publication-apply";
      candidate_dir: string;
      approve: Sha256Digest;
      receipt: string;
      format: "json";
    };
function usage(): never {
  throw new UnableToComplete({
    code: "engine-cli-usage",
    path: ".",
    message:
      "Usage: engine-cli <generate|check> [--snapshot worktree|staged] [--format human|json] [--check]",
  });
}

function parseArgs(args: string[]):
  | {
      command: EngineCommand;
      snapshot: "worktree" | "staged";
      format: "human" | "json";
    }
  | UpdateOptions {
  const initialCommand = args.shift();
  if (initialCommand === "update") {
    if (
      args.length === 10 &&
      args[0] === "publish" &&
      args[1] === "prepare" &&
      args[2] === "--target" &&
      args[3] &&
      args[4] === "--update-receipt" &&
      args[5] &&
      args[6] === "--publication-receipt" &&
      args[7] &&
      args[8] === "--out" &&
      args[9]
    )
      return {
        kind: "publication-prepare",
        worktree: args[3],
        update_receipt: args[5],
        publication_receipt: args[7],
        out: args[9],
        format: "json",
      };
    if (
      args.length === 8 &&
      args[0] === "publish" &&
      args[1] === "apply" &&
      args[2] === "--dir" &&
      args[3] &&
      args[4] === "--approve" &&
      args[5] &&
      /^sha256:[a-f0-9]{64}$/.test(args[5]) &&
      args[6] === "--receipt" &&
      args[7]
    )
      return {
        kind: "publication-apply",
        candidate_dir: args[3],
        approve: args[5] as Sha256Digest,
        receipt: args[7],
        format: "json",
      };
    if (
      args.length === 7 &&
      args[0] === "inspect" &&
      args[1] === "--target" &&
      args[2] &&
      args[3] === "--source" &&
      args[4] &&
      args[5] === "--format" &&
      (args[6] === "human" || args[6] === "json")
    )
      return {
        kind: "update-inspect",
        target: args[2],
        source: args[4],
        format: args[6],
      };
    if (
      args.length === 11 &&
      args[0] === "prepare" &&
      args[1] === "--target" &&
      args[2] &&
      args[3] === "--source" &&
      args[4] &&
      args[5] === "--setup-receipt" &&
      args[6] &&
      args[7] === "--receipt" &&
      args[8] &&
      args[9] === "--out" &&
      args[10]
    )
      return {
        kind: "update-prepare",
        target: args[2],
        source: args[4],
        setup_receipt: args[6],
        receipt: args[8],
        out: args[10],
        format: "json",
      };
    if (
      args.length === 9 &&
      args[0] === "apply" &&
      args[1] === "--target" &&
      args[2] &&
      args[3] === "--dir" &&
      args[4] &&
      args[5] === "--approve" &&
      args[6] &&
      /^sha256:[a-f0-9]{64}$/.test(args[6]) &&
      args[7] === "--receipt" &&
      args[8]
    )
      return {
        kind: "update-apply",
        target: args[2],
        candidate_dir: args[4],
        approve: args[6] as Sha256Digest,
        receipt: args[8],
        format: "json",
      };
    usage();
  }
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

function runGitReadonly(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

function renderUpdate(
  result: Awaited<ReturnType<typeof inspectEngineUpdate>>,
  format: "human" | "json",
): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.status === "current")
    process.stdout.write("Coffee Chat engine is current.\n");
  else if (result.status === "update_available")
    process.stdout.write(
      `Coffee Chat engine update available: ${result.target.version}.\n`,
    );
  else
    process.stdout.write(
      `Coffee Chat engine update ${result.status}: ${result.reason_code}.\n`,
    );
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

/** Rebind ownership markers after adding delivery-only release references. */
function refreshOwnershipMarkers(
  projection: RepositoryProjection,
  packageRoot: string,
): RepositoryProjection {
  const values = new Map(
    projection.outputs.map((output) => [output.path, output.bytes]),
  );
  const packageMarkerPath = `${packageRoot}/${GENERATED_OWNERSHIP_MARKER}`;
  const packageFiles = new Map(
    [...values.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${packageRoot}/`) && path !== packageMarkerPath,
      )
      .map(
        ([path, bytes]) =>
          [path.slice(`${packageRoot}/`.length), bytes] as const,
      ),
  );
  const packageMarker = buildGeneratedOwnershipMarker({
    scope: "plugin-package",
    files: packageFiles,
  });
  values.set(packageMarkerPath, generatedOwnershipMarkerBytes(packageMarker));
  const repositoryFiles = new Map(
    [...values.entries()].filter(
      ([path]) =>
        path !== REPOSITORY_GENERATED_OWNERSHIP_MARKER &&
        path !== "engine/release.json" &&
        path !== "engine/template-surface.json" &&
        !path.startsWith(".github/workflows/"),
    ),
  );
  const repositoryMarker = buildGeneratedOwnershipMarker({
    scope: "repository",
    files: repositoryFiles,
  });
  values.set(
    REPOSITORY_GENERATED_OWNERSHIP_MARKER,
    generatedOwnershipMarkerBytes(repositoryMarker),
  );
  return {
    outputs: [...values.entries()]
      .map(([path, bytes]) => ({ path, bytes, mode: "100644" as const }))
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
    deletions: projection.deletions,
  };
}

const CREATION_REFERENCE_SOURCES = [
  ["skills/create-coffee-chat/references/release.json", "engine/release.json"],
  [
    "skills/create-coffee-chat/references/engine-release.schema.json",
    "schemas/engine-release.schema.json",
  ],
  [
    "skills/create-coffee-chat/references/template-surface.json",
    "engine/template-surface.json",
  ],
  [
    "skills/create-coffee-chat/references/engine-template-surface.schema.json",
    "schemas/engine-template-surface.schema.json",
  ],
] as const;

async function creationReferenceProjection(
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
  packageRoot: string,
  releaseBytes: Buffer,
  finalSurfaceBytes?: Buffer,
): Promise<RepositoryProjection> {
  // Older disposable engine fixtures predate the provisioning Skill and are
  // still valid inputs for Candidate contract tests. A maintained engine
  // checkout always contains the Skill, so only that checkout receives these
  // engine-only references.
  if (!(await snapshot.exists("skills/create-coffee-chat/SKILL.md")))
    return { outputs: [], deletions: [] };
  const outputs: RepositoryProjection["outputs"] = [];
  for (const [path, source] of CREATION_REFERENCE_SOURCES) {
    if (!(await snapshot.exists(source)))
      throw new ValidationFailure({
        code: "creation-reference-missing",
        path: repositoryPath(source),
        message:
          "The engine creation Skill requires every generated release and template-surface reference.",
      });
    const bytes =
      source === "engine/release.json"
        ? releaseBytes
        : source === "engine/template-surface.json" && finalSurfaceBytes
          ? finalSurfaceBytes
          : await snapshot.read(source);
    outputs.push({ path, bytes, mode: "100644" });
    outputs.push({
      path: `${packageRoot}/${path}`,
      bytes,
      mode: "100644",
    });
  }
  return { outputs, deletions: [] };
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
  const workflow = renderRoleWorkflows("engine");
  const release = await buildEngineRelease(
    snapshot,
    manifest,
    config,
    workflow,
  );
  const generated = await generatedProjectionBytes(
    snapshot,
    validation.graph,
    workflow,
  );
  const baseProjection: RepositoryProjection = {
    outputs: [...generated.entries()].map(([path, bytes]) => ({
      path,
      bytes,
      mode: "100644" as const,
    })),
    deletions: [],
  };
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
  const creationReferences = await creationReferenceProjection(
    snapshot,
    "plugins/coffee-chat",
    engineReleaseBytes(release),
  );
  const withReferences = refreshOwnershipMarkers(
    mergeProjection(first, creationReferences),
    "plugins/coffee-chat",
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
    withReferences,
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
  const finalCreationReferences = await creationReferenceProjection(
    snapshot,
    "plugins/coffee-chat",
    engineReleaseBytes(release),
    templateSurfaceBytes(surface),
  );
  return refreshOwnershipMarkers(
    mergeProjection(withReferences, surfaceProjection, finalCreationReferences),
    "plugins/coffee-chat",
  );
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
    if ("kind" in options) {
      if (options.kind === "publication-prepare") {
        const preview = await prepareEnginePublication(
          {
            worktree_root: options.worktree,
            update_receipt_path: options.update_receipt,
            publication_receipt_path: options.publication_receipt,
            out_dir: options.out,
          },
          createEnginePublicationDependencies(),
        );
        process.stdout.write(
          `${JSON.stringify({
            status: "prepared",
            candidate_dir: options.out,
            publication_digest: preview.publication_digest,
            preview_json: resolve(options.out, "preview.json"),
            preview_markdown: resolve(options.out, "preview.md"),
          })}\n`,
        );
        process.exitCode = 0;
        return;
      }
      if (options.kind === "publication-apply") {
        const receipt = await applyEnginePublication(
          {
            candidate_dir: options.candidate_dir,
            approval_digest: options.approve,
            receipt_path: options.receipt,
          },
          createEnginePublicationDependencies(),
        );
        process.stdout.write(`${JSON.stringify(receipt)}\n`);
        process.exitCode = receipt.status === "published" ? 0 : 2;
        return;
      }
      if (options.kind === "update-inspect") {
        const result = await inspectEngineUpdate(
          {
            target_root: options.target,
            source_root: options.source as string,
          },
          {
            read_file: readFile,
            lstat: (path) => lstat(path, { bigint: true }),
            run_git_readonly: runGitReadonly,
          },
        );
        renderUpdate(result, options.format);
        process.exitCode = 0;
        return;
      }
      if (options.kind === "update-prepare") {
        const preview = await prepareEngineUpdate(
          {
            target_root: options.target,
            source_root: options.source as string,
            setup_receipt_path: options.setup_receipt as string,
            receipt_path: options.receipt as string,
            out_dir: options.out as string,
          },
          createEngineUpdateRuntime(),
        );
        process.stdout.write(
          JSON.stringify({
            status: "prepared",
            candidate_dir: options.out,
            update_digest: preview.update_digest,
            preview_json: resolve(options.out as string, "preview.json"),
            preview_markdown: resolve(options.out as string, "preview.md"),
          }) + "\n",
        );
        process.exitCode = 0;
        return;
      }
      if (options.kind === "update-apply") {
        const receipt = await applyEngineUpdate(
          {
            target_root: options.target,
            candidate_dir: options.candidate_dir as string,
            approval_digest: options.approve as Sha256Digest,
            receipt_path: options.receipt as string,
          },
          createEngineUpdateRuntime(),
        );
        process.stdout.write(JSON.stringify(receipt) + "\n");
        process.exitCode =
          receipt.status === "applied"
            ? 0
            : receipt.status === "invalidated"
              ? 1
              : 2;
        return;
      }
    }
    if ("kind" in options) throw new Error("engine-cli-usage");
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
    process.exitCode = error instanceof ValidationFailure ? 1 : 2;
  }
}

await main();
