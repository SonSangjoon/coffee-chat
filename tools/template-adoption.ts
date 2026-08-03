import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type {
  EngineReleaseManifest,
  EngineTemplateSurfaceManifest,
  RepositoryProjection,
  TemplateSurfaceFile,
} from "./engine-contracts.ts";
import {
  TEMPLATE_SURFACE_SELF_COPY_PATHS,
  artifactPolicyForPath,
  engineManagedSourcePaths,
  engineDeliverySourcePaths,
} from "./artifact-inventory.ts";
import { normalizeGitHubRepositoryUrl } from "./engine-provenance.ts";
import { canonicalizeJson, compareCodePoints } from "./generate.ts";
import { ValidationFailure, repositoryPath } from "./contracts.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

const execFileAsync = promisify(execFile);
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export type TemplateObservation = {
  source_repository_id: string;
  source_repository: string;
  source_is_template: true;
  source_visibility: "public";
  source_default_branch: string;
  source_default_commit: string;
  source_default_tree: string;
  source_release_ref: string;
  source_release_commit: string;
  source_release_tree: string;
  release_digest: `sha256:${string}`;
  template_surface_digest: `sha256:${string}`;
  target_repository_id: string;
  target_repository: string;
  target_description: string;
  template_repository: string;
  target_visibility: "public";
  target_default_branch: string;
  target_initial_commit: string;
  target_initial_tree: string;
};

type ObservationShape = Record<string, unknown>;

function digest(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function failure(
  code: string,
  path: string,
  message: string,
): ValidationFailure {
  return new ValidationFailure({ code, path: repositoryPath(path), message });
}

function canonicalRepository(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw failure(
      "template-observation-invalid",
      path,
      "Repository must be a string.",
    );
  try {
    return normalizeGitHubRepositoryUrl(value);
  } catch {
    throw failure(
      "template-observation-invalid",
      path,
      "Repository must be a canonical credential-free GitHub HTTPS URL.",
    );
  }
}

function commit(value: unknown, path: string): string {
  if (typeof value !== "string" || !COMMIT.test(value))
    throw failure(
      "template-observation-invalid",
      path,
      "Commit and tree identifiers must be lowercase hexadecimal object IDs.",
    );
  return value;
}

function digestValue(value: unknown, path: string): `sha256:${string}` {
  if (typeof value !== "string" || !DIGEST.test(value))
    throw failure(
      "template-observation-invalid",
      path,
      "Digest must be a lowercase SHA-256 digest.",
    );
  return value as `sha256:${string}`;
}

/** Validate the immutable shape before it is used as a Candidate binding. */
export function validateTemplateObservation(
  value: unknown,
): TemplateObservation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw failure(
      "template-observation-invalid",
      ".",
      "Template observation must be an object.",
    );
  const item = value as ObservationShape;
  const required = [
    "source_repository_id",
    "source_repository",
    "source_is_template",
    "source_visibility",
    "source_default_branch",
    "source_default_commit",
    "source_default_tree",
    "source_release_ref",
    "source_release_commit",
    "source_release_tree",
    "release_digest",
    "template_surface_digest",
    "target_repository_id",
    "target_repository",
    "target_description",
    "template_repository",
    "target_visibility",
    "target_default_branch",
    "target_initial_commit",
    "target_initial_tree",
  ] as const;
  for (const field of required)
    if (!(field in item))
      throw failure(
        "template-observation-invalid",
        ".",
        `Template observation field ${field} is required.`,
      );
  if (
    Object.keys(item).some(
      (key) => !required.includes(key as (typeof required)[number]),
    )
  )
    throw failure(
      "template-observation-invalid",
      ".",
      "Template observation contains an unknown field.",
    );
  if (
    typeof item.source_repository_id !== "string" ||
    !/^[1-9][0-9]*$/.test(item.source_repository_id)
  )
    throw failure(
      "template-observation-invalid",
      ".",
      "Source repository ID must be a decimal string.",
    );
  if (
    typeof item.target_repository_id !== "string" ||
    !/^[1-9][0-9]*$/.test(item.target_repository_id)
  )
    throw failure(
      "template-observation-invalid",
      ".",
      "Target repository ID must be a decimal string.",
    );
  if (
    item.source_is_template !== true ||
    item.source_visibility !== "public" ||
    item.target_visibility !== "public"
  )
    throw failure(
      "template-observation-invalid",
      ".",
      "The source and target repositories must be public and the source must remain a template.",
    );
  for (const field of [
    "source_default_branch",
    "source_release_ref",
    "target_default_branch",
    "target_description",
  ] as const)
    if (typeof item[field] !== "string" || item[field].length === 0)
      throw failure(
        "template-observation-invalid",
        ".",
        `${field} must be a non-empty string.`,
      );
  const source_repository = canonicalRepository(
    item.source_repository,
    "/source_repository",
  );
  const target_repository = canonicalRepository(
    item.target_repository,
    "/target_repository",
  );
  const template_repository = canonicalRepository(
    item.template_repository,
    "/template_repository",
  );
  const source_default_commit = commit(
    item.source_default_commit,
    "/source_default_commit",
  );
  const source_default_tree = commit(
    item.source_default_tree,
    "/source_default_tree",
  );
  const source_release_commit = commit(
    item.source_release_commit,
    "/source_release_commit",
  );
  const source_release_tree = commit(
    item.source_release_tree,
    "/source_release_tree",
  );
  const target_initial_commit = commit(
    item.target_initial_commit,
    "/target_initial_commit",
  );
  const target_initial_tree = commit(
    item.target_initial_tree,
    "/target_initial_tree",
  );
  const release_digest = digestValue(item.release_digest, "/release_digest");
  const template_surface_digest = digestValue(
    item.template_surface_digest,
    "/template_surface_digest",
  );
  return {
    source_repository_id: item.source_repository_id,
    source_repository,
    source_is_template: true,
    source_visibility: "public",
    source_default_branch: item.source_default_branch as string,
    source_default_commit,
    source_default_tree,
    source_release_ref: item.source_release_ref as string,
    source_release_commit,
    source_release_tree,
    release_digest,
    template_surface_digest,
    target_repository_id: item.target_repository_id,
    target_repository,
    target_description: item.target_description as string,
    template_repository,
    target_visibility: "public",
    target_default_branch: item.target_default_branch as string,
    target_initial_commit,
    target_initial_tree,
  };
}

export function templateObservationBytes(value: TemplateObservation): Buffer {
  return Buffer.from(
    `${JSON.stringify(validateTemplateObservation(value), null, 2)}\n`,
    "utf8",
  );
}

export function sameTemplateObservation(
  left: TemplateObservation,
  right: TemplateObservation,
): boolean {
  return canonicalizeJson(left as never) === canonicalizeJson(right as never);
}

/**
 * Read the release/surface projections from the maintained engine checkout.
 * This is intentionally read-only and used to validate a native Template
 * observation before a Candidate can materialize an instance.
 */
export async function readEngineAdoptionInputs(root: string): Promise<{
  release: EngineReleaseManifest;
  surface: EngineTemplateSurfaceManifest;
}> {
  try {
    const [releaseBytes, surfaceBytes] = await Promise.all([
      readFile(resolve(root, "engine/release.json")),
      readFile(resolve(root, "engine/template-surface.json")),
    ]);
    const release = parseStrictJson(
      decodeCanonicalText(releaseBytes, "engine/release.json"),
      "engine/release.json",
    ) as EngineReleaseManifest;
    const surface = parseStrictJson(
      decodeCanonicalText(surfaceBytes, "engine/template-surface.json"),
      "engine/template-surface.json",
    ) as EngineTemplateSurfaceManifest;
    if (!release || !surface) throw new Error("invalid projections");
    if (
      surface.repository !== release.repository ||
      surface.release.version !== release.version ||
      surface.release.source_ref !== release.source_ref ||
      surface.release.release_digest !== release.release_digest
    )
      throw new Error("release/surface mismatch");
    const surfaceByPath = new Map(
      surface.files.map((file) => [file.path, file]),
    );
    await Promise.all(
      [...release.managed_files, ...release.delivery_files].map(
        async (file) => {
          const surfaceFile = surfaceByPath.get(file.path);
          if (!surfaceFile) {
            // Engine-only delivery files are intentionally absent from the public
            // Template surface. They still remain release-bound and are checked
            // against their on-disk digest below.
            const policy = artifactPolicyForPath(file.path);
            const templateState = policy?.states["template-copy"];
            if (
              !policy ||
              templateState?.audience !== "engine-only" ||
              policy.template_disposition !== "remove-engine-only"
            )
              throw new Error("release/surface file mismatch");
          } else if (
            surfaceFile.binding.kind !== "content" ||
            surfaceFile.binding.digest !== file.digest
          ) {
            throw new Error("release/surface file mismatch");
          }
          let bytes: Buffer;
          try {
            bytes = await readFile(
              resolve(root, ...file.path.slice(2).split("/")),
            );
          } catch (error) {
            const policy = artifactPolicyForPath(file.path);
            const templateState = policy?.states["template-copy"];
            // Delivery-only files are not part of the adopted Template surface;
            // a disposable downstream checkout may omit them while retaining the
            // release/surface identity. Managed source files remain mandatory.
            if (
              !surfaceFile &&
              templateState?.audience === "engine-only" &&
              policy?.template_disposition === "remove-engine-only" &&
              (error as NodeJS.ErrnoException).code === "ENOENT"
            )
              return;
            throw error;
          }
          if (digest(bytes) !== file.digest)
            throw new Error("release file drift");
        },
      ),
    );
    return { release, surface };
  } catch {
    throw failure(
      "template-adoption-inputs-unavailable",
      ".",
      "Engine release and template-surface projections are required for Make mine.",
    );
  }
}

function surfacePath(file: TemplateSurfaceFile): string {
  return file.path.replace(/^\.\//, "");
}

async function assertNoSymlink(root: string, path: string): Promise<void> {
  const segments = path.split("/");
  for (let index = 1; index <= segments.length; index += 1) {
    const partial = segments.slice(0, index).join("/");
    try {
      const status = await lstat(resolve(root, ...partial.split("/")));
      if (status.isSymbolicLink())
        throw failure(
          "candidate-symlink-unsafe",
          partial,
          "Template source paths must not contain symbolic links.",
        );
    } catch (error) {
      if (error instanceof ValidationFailure) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw failure(
        "template-surface-missing",
        path,
        "A bound Template-surface file could not be inspected.",
      );
    }
  }
}

/**
 * Verify the source checkout is exactly the observed Template surface and
 * return the source files that an instance is allowed to adopt. Generated
 * instance files and engine-only delivery files are deliberately excluded.
 */
export async function adoptEngineSourceFiles(
  root: string,
  surface: EngineTemplateSurfaceManifest,
): Promise<Map<string, Buffer>> {
  const adopted = await Promise.all(
    surface.files.map(async (file) => {
      if (file.disposition !== "adopt-engine-source") return;
      const path = surfacePath(file);
      await assertNoSymlink(root, path);
      let bytes: Buffer;
      try {
        bytes = await readFile(resolve(root, ...path.split("/")));
      } catch {
        throw failure(
          "template-surface-missing",
          path,
          "A bound Template-surface file is missing.",
        );
      }
      if (
        file.binding.kind === "content" &&
        digest(bytes) !== file.binding.digest
      )
        throw failure(
          "template-surface-content-mismatch",
          path,
          "Template-surface content changed after observation.",
        );
      if (file.binding.kind === "surface-self-copy") {
        // A self-copy is resolved against the canonical surface bytes, not the
        // digest-less placeholder used while the surface was generated.
        if (
          !(TEMPLATE_SURFACE_SELF_COPY_PATHS as readonly string[]).includes(
            file.path,
          )
        )
          throw failure(
            "template-surface-binding-invalid",
            path,
            "Unsupported self-copy path.",
          );
        const expected = templateSurfaceBytes(surface);
        if (!bytes.equals(expected))
          throw failure(
            "template-surface-self-copy-mismatch",
            path,
            "Template surface self-copy bytes changed.",
          );
      }
      return [path, bytes] as const;
    }),
  );
  return new Map(
    adopted.filter(
      (entry): entry is readonly [string, Buffer] => entry !== undefined,
    ),
  );
}

export function templateSurfaceBytes(
  surface: EngineTemplateSurfaceManifest,
): Buffer {
  return Buffer.from(`${JSON.stringify(surface, null, 2)}\n`, "utf8");
}

export function engineLockFiles(
  release: EngineReleaseManifest,
): EngineReleaseManifest["managed_files"] {
  const managed = [...release.managed_files].sort((left, right) =>
    compareCodePoints(left.path, right.path),
  );
  // Keep these assertions local so a malformed release projection cannot be
  // silently converted into an instance lock.
  const allowed = new Set(
    engineManagedSourcePaths().map((path) => `./${path}`),
  );
  const delivery = new Set(
    engineDeliverySourcePaths().map((path) => `./${path}`),
  );
  if (
    managed.some((file) => !allowed.has(file.path) || delivery.has(file.path))
  )
    throw failure(
      "engine-lock-invalid",
      "./engine/release.json",
      "Release managed files must be engine-source paths.",
    );
  return managed;
}

/** Build a pre-conversion projection for the adopted engine-source files. */
export async function buildAdoptionProjection(
  root: string,
  surface: EngineTemplateSurfaceManifest,
  release: EngineReleaseManifest,
): Promise<RepositoryProjection> {
  const adopted = await adoptEngineSourceFiles(root, surface);
  const lockPaths = new Set(
    engineLockFiles(release).map((file) => file.path.slice(2)),
  );
  if ([...lockPaths].some((path) => !adopted.has(path)))
    throw failure(
      "template-surface-missing",
      "engine/template-surface.json",
      "Every release managed file must be adopted.",
    );
  const outputs = [...adopted.entries()]
    .map(([path, bytes]) => ({ path, bytes, mode: "100644" as const }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return { outputs, deletions: [] };
}

function ghJson(root: string, args: string[]): Promise<unknown> {
  return execFileAsync("gh", ["api", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).then(({ stdout }) => JSON.parse(stdout));
}

function ownerRepo(repository: string): string {
  return repository.replace(/^https:\/\/github\.com\//, "");
}

function apiCommit(value: unknown): string {
  const item = value as ObservationShape;
  const commitObject = item.commit as ObservationShape;
  return String(commitObject.sha ?? item.sha ?? "");
}

function apiTree(value: unknown): string {
  const item = value as ObservationShape;
  const commitObject = item.commit as ObservationShape;
  const nested = commitObject?.commit as ObservationShape;
  const tree = nested?.tree as ObservationShape;
  const direct = item.tree as ObservationShape;
  return String(direct?.sha ?? tree?.sha ?? "");
}

/**
 * Production observer. It uses read-only `gh api` calls and fails closed when
 * GitHub cannot prove the native Template relation or public state. Tests and
 * agent adapters should inject this dependency rather than mocking globals.
 */
export async function observeTemplateFromGitHub(
  root: string,
  expected: TemplateObservation,
): Promise<TemplateObservation> {
  const inputs = await readEngineAdoptionInputs(root);
  const source = ownerRepo(expected.source_repository);
  const target = ownerRepo(expected.target_repository);
  try {
    const sourceRepo = (await ghJson(root, [
      `repos/${source}`,
    ])) as ObservationShape;
    const targetRepo = (await ghJson(root, [
      `repos/${target}`,
    ])) as ObservationShape;
    const sourceBranch = (await ghJson(root, [
      `repos/${source}/branches/${encodeURIComponent(expected.source_default_branch)}`,
    ])) as ObservationShape;
    const sourceReleaseRef = (await ghJson(root, [
      `repos/${source}/git/ref/${expected.source_release_ref.replace(/^refs\//, "")}`,
    ])) as ObservationShape;
    const sourceReleaseCommit = String(
      (sourceReleaseRef.object as ObservationShape)?.sha ?? "",
    );
    const sourceReleaseCommitObject = (await ghJson(root, [
      `repos/${source}/git/commits/${sourceReleaseCommit}`,
    ])) as ObservationShape;
    const targetBranch = (await ghJson(root, [
      `repos/${target}/branches/${encodeURIComponent(expected.target_default_branch)}`,
    ])) as ObservationShape;
    const sourceDefaultCommit = apiCommit(sourceBranch);
    const sourceDefaultTree = apiTree(sourceBranch);
    const sourceReleaseTree = apiTree(sourceReleaseCommitObject);
    const targetInitialCommit = apiCommit(targetBranch);
    const targetInitialTree = apiTree(targetBranch);
    const templateRepository = String(
      ((targetRepo.template_repository as ObservationShape) ?? {}).html_url ??
        ((targetRepo.template_repository as ObservationShape) ?? {})
          .full_name ??
        "",
    );
    return validateTemplateObservation({
      source_repository_id: String(sourceRepo.id),
      source_repository: expected.source_repository,
      source_is_template: sourceRepo.is_template === true,
      source_visibility: sourceRepo.visibility,
      source_default_branch: String(sourceRepo.default_branch),
      source_default_commit: sourceDefaultCommit,
      source_default_tree: sourceDefaultTree,
      source_release_ref: expected.source_release_ref,
      source_release_commit: sourceReleaseCommit,
      source_release_tree: sourceReleaseTree,
      release_digest: inputs.release.release_digest,
      template_surface_digest: inputs.surface.surface_digest,
      target_repository_id: String(targetRepo.id),
      target_repository: expected.target_repository,
      target_description: String(targetRepo.description ?? ""),
      template_repository: templateRepository,
      target_visibility: targetRepo.visibility,
      target_default_branch: String(targetRepo.default_branch),
      target_initial_commit: targetInitialCommit,
      target_initial_tree: targetInitialTree,
    });
  } catch {
    throw failure(
      "template-observation-unavailable",
      ".",
      "GitHub Template provenance could not be observed without mutation.",
    );
  }
}
