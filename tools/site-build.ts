import { build as astroBuild } from "astro";
import { lstat, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { posix, relative, resolve, sep } from "node:path";
import {
  bindSiteBuildRequest,
  releaseSiteRoot,
  repositoryRoot,
  type BoundSiteBuildRequest,
  type SiteBuildRequest,
} from "../site/lib/build-context.ts";
import { loadSiteModel, type SiteModel } from "../site/lib/load-site-model.ts";
import { ValidationFailure } from "./contracts.ts";

export type SiteBuildResult = {
  role: "engine" | "instance";
  artifact_class: "release" | "ephemeral-test";
  output_root: string;
  base_path: string;
  source_commit: string;
  knowledge_digest?: string;
  published_routes: string[];
};

function publishedRoutes(model: SiteModel): string[] {
  if (model.role === "engine") return ["index.html"];
  return [
    "index.html",
    "timeline/index.html",
    "graph/index.html",
    ...model.graph.notes.map((note) => `notes/${note.id}/index.html`),
    ...model.graph.entities.map((entity) => `entities/${entity.id}/index.html`),
    ...model.graph.sources.map((source) => `sources/${source.slug}/index.html`),
  ];
}

function buildResult(
  request: BoundSiteBuildRequest,
  model: SiteModel,
): SiteBuildResult {
  const data = model.role === "engine" ? model.documentation : model.graph;
  return {
    role: model.role,
    artifact_class: request.artifact_class,
    output_root: request.output_root,
    base_path: data.base_path,
    source_commit: data.source_commit,
    ...(model.role === "instance"
      ? { knowledge_digest: model.graph.knowledge_digest }
      : {}),
    published_routes: publishedRoutes(model),
  };
}

async function assertEphemeralOutputIsEmpty(
  request: BoundSiteBuildRequest,
): Promise<void> {
  if (request.artifact_class !== "ephemeral-test") return;
  try {
    if ((await readdir(request.output_root)).length === 0) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new ValidationFailure({
    code: "site-ephemeral-output-not-empty",
    path: ".",
    message:
      "Ephemeral site output must be absent or empty before a build starts.",
  });
}

export async function buildSite(
  request: SiteBuildRequest,
): Promise<SiteBuildResult> {
  const bound = await bindSiteBuildRequest(request);
  await assertEphemeralOutputIsEmpty(bound);
  const model = await loadSiteModel(bound);
  const base = (model.role === "engine" ? model.documentation : model.graph)
    .base_path;

  await astroBuild({
    root: repositoryRoot,
    configFile: "astro.config.mjs",
    srcDir: resolve(repositoryRoot, "site"),
    outDir: bound.output_root,
    site: model.manifest.pages_url,
    base,
    output: "static",
    trailingSlash: "always",
    build: { format: "directory" },
    vite: {
      define: {
        "import.meta.env.COFFEE_CHAT_SITE_MODEL_JSON": JSON.stringify(
          JSON.stringify(model),
        ),
      },
    },
  });

  if (model.role === "engine") {
    await Promise.all(
      ["timeline", "graph"].map((route) =>
        rm(resolve(bound.output_root, route), { recursive: true, force: true }),
      ),
    );
  }
  await writeFile(resolve(bound.output_root, ".nojekyll"), "");
  const result = buildResult(bound, model);
  await checkSiteOutput(result);
  return result;
}

async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(root, prefix), {
    withFileTypes: true,
  })) {
    const path = posix.join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Published site contains a symbolic link: ${path}`);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function internalPublishedPath(
  reference: string,
  result: SiteBuildResult,
): string | undefined {
  if (reference.startsWith("#")) return undefined;
  let url: URL;
  try {
    url = new URL(reference, "https://coffee-chat.invalid/");
  } catch {
    throw new Error(`Published site contains an invalid URL: ${reference}`);
  }
  if (url.origin !== "https://coffee-chat.invalid") return undefined;
  if (!url.pathname.startsWith(result.base_path))
    throw new Error(`Published URL escapes the configured base: ${reference}`);
  let path = url.pathname.slice(result.base_path.length);
  if (path === "" || path.endsWith("/")) path += "index.html";
  return decodeURIComponent(path);
}

async function assertPublishedReference(
  reference: string,
  result: SiteBuildResult,
): Promise<void> {
  const path = internalPublishedPath(reference, result);
  if (!path) return;
  const absolute = resolve(result.output_root, path);
  const fromRoot = relative(result.output_root, absolute);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    resolve(result.output_root, fromRoot) !== absolute
  )
    throw new Error(`Published reference escapes output: ${reference}`);
  if (!(await lstat(absolute)).isFile())
    throw new Error(`Published reference is missing: ${reference}`);
}

function externalAnchorFailures(html: string): string[] {
  const failures: string[] = [];
  for (const match of html.matchAll(/<a\b([^>]*\bhref="https?:\/\/[^>]+)>/gi)) {
    const attributes = match[1] ?? "";
    if (!/\btarget="_blank"/i.test(attributes))
      failures.push("external anchor lacks target=_blank");
    const rel = /\brel="([^"]*)"/i.exec(attributes)?.[1] ?? "";
    if (!/\bnoopener\b/i.test(rel) || !/\bnoreferrer\b/i.test(rel))
      failures.push("external anchor lacks noopener noreferrer");
  }
  return failures;
}

export async function checkSiteOutput(result: SiteBuildResult): Promise<void> {
  const status = await lstat(result.output_root);
  if (status.isSymbolicLink() || !status.isDirectory())
    throw new Error("Published site output must be a plain directory.");
  const files = await walkFiles(result.output_root);
  const htmlFiles = files.filter((path) => path.endsWith(".html"));
  if (
    JSON.stringify(htmlFiles) !==
    JSON.stringify([...result.published_routes].sort())
  )
    throw new Error(
      `Published HTML inventory drift: ${JSON.stringify(htmlFiles)}`,
    );

  for (const route of result.published_routes) {
    const html = await readFile(resolve(result.output_root, route), "utf8");
    if (!html.includes(result.source_commit))
      throw new Error(`Published route omits source commit: ${route}`);
    if (result.knowledge_digest && !html.includes(result.knowledge_digest))
      throw new Error(`Published route omits knowledge digest: ${route}`);
    if (/<(?:iframe|embed|object)\b/i.test(html))
      throw new Error(`Published route contains a blocked embed: ${route}`);
    const anchorFailures = externalAnchorFailures(html);
    if (anchorFailures.length > 0)
      throw new Error(`${route}: ${anchorFailures[0]}`);
    for (const match of html.matchAll(
      /\b(?:href|src|poster)=(?:"([^"]+)"|'([^']+)')/gi,
    )) {
      await assertPublishedReference(match[1] ?? match[2] ?? "", result);
    }
  }
}

type ParsedSiteCommand =
  | { check: true; request: SiteBuildRequest }
  | { check: false; request: SiteBuildRequest };

export function parseSiteBuildArgs(args: string[]): ParsedSiteCommand {
  let check = false;
  let sourceRoot: string | undefined;
  let outputRoot: string | undefined;
  let artifactClass: SiteBuildRequest["artifact_class"] | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      check = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) throw new Error(`Missing value for ${argument}`);
    if (argument === "--source-root") sourceRoot = value;
    else if (argument === "--output-root") outputRoot = value;
    else if (argument === "--artifact-class") {
      if (value !== "release" && value !== "ephemeral-test")
        throw new Error("Unsupported site artifact class.");
      artifactClass = value;
    } else throw new Error(`Unknown site build argument: ${argument}`);
    index += 1;
  }

  const explicit =
    sourceRoot !== undefined ||
    outputRoot !== undefined ||
    artifactClass !== undefined;
  if (explicit && (!sourceRoot || !outputRoot || !artifactClass))
    throw new Error(
      "Explicit site builds require source-root, output-root, and artifact-class.",
    );
  return {
    check,
    request: explicit
      ? {
          source_root: sourceRoot as string,
          output_root: outputRoot as string,
          artifact_class: artifactClass as SiteBuildRequest["artifact_class"],
        }
      : {
          source_root: repositoryRoot,
          output_root: releaseSiteRoot,
          artifact_class: "release",
        },
  };
}

async function checkExisting(
  request: SiteBuildRequest,
): Promise<SiteBuildResult> {
  const bound = await bindSiteBuildRequest(request);
  const model = await loadSiteModel(bound);
  const result = buildResult(bound, model);
  await checkSiteOutput(result);
  return result;
}

async function main(): Promise<void> {
  try {
    const command = parseSiteBuildArgs(process.argv.slice(2));
    const result = command.check
      ? await checkExisting(command.request)
      : await buildSite(command.request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Site build failed."}\n`,
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
