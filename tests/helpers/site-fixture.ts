import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { generatedIndexBytes } from "../../tools/generate.ts";
import { isInstanceGraph, validateKnowledge } from "../../tools/knowledge.ts";
import { createSnapshot } from "../../tools/snapshot.ts";

const execFileAsync = promisify(execFile);
export const projectRoot = resolve(import.meta.dirname, "../..");

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  return stdout.trim();
}

export type SyntheticSiteFixture = {
  base: string;
  source: string;
  output: string;
  head: string;
  knowledgeDigest: string;
  cleanup(): Promise<void>;
};

export async function createSyntheticSiteFixture(): Promise<SyntheticSiteFixture> {
  const base = await mkdtemp(resolve(tmpdir(), "coffee-chat-site-fixture-"));
  const source = resolve(base, "source");
  const output = resolve(base, "output");
  try {
    await mkdir(source);
    await Promise.all([
      cp(resolve(projectRoot, "tests/fixtures/synthetic-instance"), source, {
        recursive: true,
      }),
      cp(resolve(projectRoot, "schemas"), resolve(source, "schemas"), {
        recursive: true,
      }),
    ]);

    const snapshot = await createSnapshot(source, "worktree");
    const validation = await validateKnowledge(snapshot, {
      validateIndex: false,
    });
    if (
      validation.diagnostics.length > 0 ||
      !validation.graph ||
      !isInstanceGraph(validation.graph)
    ) {
      throw new Error(
        `Synthetic site fixture is invalid: ${JSON.stringify(validation.diagnostics)}`,
      );
    }
    const indexBytes = generatedIndexBytes(validation.graph);
    await writeFile(resolve(source, "knowledge/index.json"), indexBytes);
    const index = JSON.parse(indexBytes.toString("utf8")) as {
      knowledge_digest: string;
    };

    await git(source, "init", "--quiet", "--initial-branch=main");
    await git(source, "config", "user.name", "Coffee Chat Site Test");
    await git(source, "config", "user.email", "site-test@example.com");
    await git(source, "add", "--all");
    await git(source, "commit", "--quiet", "-m", "Synthetic site fixture");
    const head = await git(source, "rev-parse", "HEAD");

    return {
      base,
      source,
      output,
      head,
      knowledgeDigest: index.knowledge_digest,
      async cleanup() {
        await rm(base, { recursive: true, force: true });
        try {
          await lstat(base);
          throw new Error(`Temporary site fixture survived cleanup: ${base}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    };
  } catch (error) {
    await rm(base, { recursive: true, force: true });
    throw error;
  }
}

export async function gitHead(root: string): Promise<string> {
  return git(root, "rev-parse", "HEAD");
}

export async function commitFixtureMarker(
  root: string,
  marker: string,
): Promise<string> {
  await writeFile(resolve(root, "fixture-marker.txt"), `${marker}\n`);
  await git(root, "add", "fixture-marker.txt");
  await git(root, "commit", "--quiet", "-m", marker);
  return gitHead(root);
}

export async function readKnowledgeIndex(
  root: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(resolve(root, "knowledge/index.json"), "utf8"),
  ) as Record<string, unknown>;
}
