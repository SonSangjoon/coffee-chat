import { lstat, realpath } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { sameOrDescendant } from "../../tools/artifact-inventory.ts";
import { ValidationFailure } from "../../tools/contracts.ts";
import { canonicalizePotentialPath } from "../../tools/projections.ts";

export type SiteBuildRequest = {
  source_root: string;
  output_root: string;
  artifact_class: "release" | "ephemeral-test";
};

export type BoundSiteBuildRequest = SiteBuildRequest & {
  source_root: string;
  output_root: string;
};

export const repositoryRoot = resolve(import.meta.dirname, "../..");
export const releaseSiteRoot = resolve(repositoryRoot, "dist/site");

function boundaryFailure(code: string, message: string): ValidationFailure {
  return new ValidationFailure({ code, path: ".", message });
}

async function requirePlainDirectory(path: string): Promise<string> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isDirectory())
      throw boundaryFailure(
        "site-source-root-unsafe",
        "The site source root must be a non-symlinked directory.",
      );
    return await realpath(path);
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    throw boundaryFailure(
      "site-source-root-unsafe",
      "The site source root must be an existing safe directory.",
    );
  }
}

async function existingPlainDirectory(path: string): Promise<boolean> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isDirectory())
      throw boundaryFailure(
        "site-output-root-unsafe",
        "An existing site output root must be a non-symlinked directory.",
      );
    return true;
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw boundaryFailure(
      "site-output-root-unsafe",
      "The site output root could not be inspected safely.",
    );
  }
}

async function canonicalOutputRoot(path: string): Promise<string> {
  try {
    return await canonicalizePotentialPath(path);
  } catch {
    throw boundaryFailure(
      "site-output-root-unsafe",
      "The site output root could not be resolved safely.",
    );
  }
}

export async function bindSiteBuildRequest(
  request: SiteBuildRequest,
): Promise<BoundSiteBuildRequest> {
  if (
    request.artifact_class !== "release" &&
    request.artifact_class !== "ephemeral-test"
  )
    throw boundaryFailure(
      "site-artifact-class-invalid",
      "Site builds must declare release or ephemeral-test provenance.",
    );

  const requestedSourceRoot = resolve(request.source_root);
  const requestedOutputRoot = resolve(request.output_root);
  const [sourceRoot, outputRoot, currentRepositoryRoot] = await Promise.all([
    requirePlainDirectory(requestedSourceRoot),
    canonicalOutputRoot(requestedOutputRoot),
    realpath(repositoryRoot),
  ]);
  await existingPlainDirectory(requestedOutputRoot);

  if (request.artifact_class === "release") {
    if (
      requestedSourceRoot !== repositoryRoot ||
      sourceRoot !== currentRepositoryRoot
    )
      throw boundaryFailure(
        "site-release-source-mismatch",
        "Release Pages must read only the current repository root.",
      );
    if (requestedOutputRoot !== releaseSiteRoot)
      throw boundaryFailure(
        "site-release-output-mismatch",
        "Release Pages must write only to dist/site in the current repository.",
      );
    if (outputRoot !== resolve(currentRepositoryRoot, "dist/site"))
      throw boundaryFailure(
        "site-release-output-unsafe",
        "Release Pages output must resolve inside the current repository.",
      );
  } else {
    if (sameOrDescendant(currentRepositoryRoot, sourceRoot))
      throw boundaryFailure(
        "site-ephemeral-source-must-be-external",
        "Ephemeral site inputs must be outside the current repository.",
      );
    if (sameOrDescendant(currentRepositoryRoot, outputRoot))
      throw boundaryFailure(
        "site-ephemeral-output-must-be-external",
        "Ephemeral site output must be outside the current repository.",
      );
    if (
      sameOrDescendant(sourceRoot, outputRoot) ||
      sameOrDescendant(outputRoot, sourceRoot)
    )
      throw boundaryFailure(
        "site-ephemeral-roots-overlap",
        "Ephemeral site input and output roots must not contain one another.",
      );
  }

  return {
    source_root: sourceRoot,
    output_root: outputRoot,
    artifact_class: request.artifact_class,
  };
}

export function siteBasePath(pagesUrl: string): string {
  const pathname = new URL(pagesUrl).pathname;
  return posix.normalize(`/${pathname}/`);
}

export function siteHref(basePath: string, route = ""): string {
  const cleanRoute = route.replace(/^\/+/, "");
  let decodedRoute: string;
  try {
    decodedRoute = decodeURIComponent(cleanRoute);
  } catch {
    throw new Error("Site routes must use valid URL encoding.");
  }
  if (decodedRoute.split("/").includes(".."))
    throw new Error("Site routes cannot escape the configured base path.");
  const joined = posix.join(basePath, cleanRoute);
  return route === "" || route.endsWith("/")
    ? `${joined.replace(/\/$/, "")}/`
    : joined;
}
