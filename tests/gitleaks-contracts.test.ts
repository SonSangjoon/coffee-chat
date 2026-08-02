import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { sha256 } from "../tools/knowledge.ts";
import {
  GITLEAKS_ASSETS,
  GITLEAKS_COMMIT,
  GITLEAKS_RELEASE,
  GITLEAKS_RELEASE_MANIFEST_SHA256,
  renderGitleaksResult,
  scanRepositoryForSecrets,
  verifyGitleaksReleaseBytes,
} from "../tools/gitleaks.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];
const preCommitAvailable =
  spawnSync("pre-commit", ["--version"], { encoding: "utf8" }).status === 0;

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Task 7 immutable Gitleaks supply chain", () => {
  it("pins the approved release, source commit, manifest, and platform archives", () => {
    expect(GITLEAKS_RELEASE).toBe("v8.30.1");
    expect(GITLEAKS_COMMIT).toBe("83d9cd684c87d95d656c1458ef04895a7f1cbd8e");
    expect(GITLEAKS_RELEASE_MANIFEST_SHA256).toBe(
      "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae",
    );
    expect(GITLEAKS_ASSETS).toMatchObject({
      "linux-x64": {
        name: "gitleaks_8.30.1_linux_x64.tar.gz",
        sha256:
          "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
      },
      "darwin-arm64": {
        name: "gitleaks_8.30.1_darwin_arm64.tar.gz",
        sha256:
          "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
      },
    });
  });

  it("rejects a changed checksum manifest or archive before extraction", () => {
    const asset = GITLEAKS_ASSETS["linux-x64"];
    const manifest = Buffer.from(`${asset.sha256}  ${asset.name}\n`);
    expect(() =>
      verifyGitleaksReleaseBytes({
        manifest,
        manifestSha256: `sha256:${"0".repeat(64)}`,
        archive: Buffer.from("not an archive"),
        asset,
      }),
    ).toThrow(/manifest/i);
    expect(() =>
      verifyGitleaksReleaseBytes({
        manifest,
        manifestSha256: sha256(manifest),
        archive: Buffer.from("not an archive"),
        asset,
      }),
    ).toThrow(/archive/i);
  });
});

describe("Task 7 redacted secret enforcement", () => {
  it("blocks a staged representative secret without returning the matched value", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-gitleaks-"));
    temporaryRoots.push(root);
    await git(root, "init", "--quiet", "--initial-branch=main");
    await git(root, "config", "user.name", "Secret Gate Test");
    await git(root, "config", "user.email", "secret-gate@example.com");
    await writeFile(
      resolve(root, ".gitleaks.toml"),
      await readFile(resolve(projectRoot, ".gitleaks.toml")),
    );
    await writeFile(resolve(root, "sentinel.txt"), "safe baseline\n");
    await git(root, "add", ".gitleaks.toml", "sentinel.txt");
    await git(root, "commit", "--quiet", "-m", "safe baseline");
    const fakeSecret = [
      "aB3d",
      "E5fG",
      "7hI9",
      "jK1m",
      "N3pQ",
      "5rS7",
      "tU9v",
      "W1xY",
    ].join("");
    await writeFile(resolve(root, "secret.env"), `api_key = "${fakeSecret}"\n`);
    await git(root, "add", "secret.env");

    const result = await scanRepositoryForSecrets(root, "staged");
    const rendered = renderGitleaksResult(result);
    expect(result.status).toBe("blocked");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]).toMatchObject({
      path: "secret.env",
    });
    expect(rendered).toContain("secret.env");
    expect(rendered).toContain("rule_id");
    expect(JSON.stringify(result)).not.toContain(fakeSecret);
    expect(rendered).not.toContain(fakeSecret);
  }, 60_000);

  it("configures Gitleaks first and the staged structural validator second", async () => {
    const configText = await readFile(
      resolve(projectRoot, ".pre-commit-config.yaml"),
      "utf8",
    );
    const config = parse(configText) as {
      fail_fast: boolean;
      repos: Array<{
        repo: string;
        rev?: string;
        hooks: Array<{
          id: string;
          entry?: string;
          args?: string[];
          pass_filenames?: boolean;
        }>;
      }>;
    };
    expect(config.fail_fast).toBe(true);
    expect(config.repos[0]).toMatchObject({
      repo: "https://github.com/gitleaks/gitleaks",
      rev: GITLEAKS_COMMIT,
    });
    expect(config.repos[0]!.hooks[0]).toMatchObject({
      id: "gitleaks",
      pass_filenames: false,
    });
    expect(config.repos[0]!.hooks[0]!.args?.join(" ")).toMatch(
      /--redact(?:=100)?/,
    );
    expect(config.repos[1]!.repo).toBe("local");
    expect(config.repos[1]!.hooks).toHaveLength(1);
    expect(config.repos[1]!.hooks[0]).toMatchObject({
      entry: "npm run cc -- check --snapshot staged --format human",
      pass_filenames: false,
    });
    expect(configText).not.toMatch(/--no-verify|SKIP=|allowlist/i);
  });

  it.skipIf(!preCommitAvailable)(
    "blocks an actual commit before later hooks without disclosing the secret",
    async () => {
      const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-precommit-"));
      temporaryRoots.push(root);
      await git(root, "init", "--quiet", "--initial-branch=main");
      await git(root, "config", "user.name", "Pre-commit Gate Test");
      await git(root, "config", "user.email", "precommit@example.com");
      for (const path of [".gitleaks.toml", ".pre-commit-config.yaml"]) {
        await writeFile(
          resolve(root, path),
          await readFile(resolve(projectRoot, path)),
        );
      }
      await writeFile(resolve(root, "sentinel.txt"), "safe baseline\n");
      await git(root, "add", "--all");
      await git(root, "commit", "--quiet", "-m", "safe baseline");
      const baseline = await git(root, "rev-parse", "HEAD");
      await execFileAsync("pre-commit", ["install"], {
        cwd: root,
        encoding: "utf8",
      });

      const fakeSecret = [
        "mN4p",
        "Q6rS",
        "8tU2",
        "vW4x",
        "Y6zA",
        "8bC2",
        "dE4f",
        "G6hJ",
      ].join("");
      await writeFile(
        resolve(root, "blocked.env"),
        `api_key = "${fakeSecret}"\n`,
      );
      await git(root, "add", "blocked.env");

      let commitOutput = "";
      let exitCode = 0;
      try {
        await execFileAsync("git", ["commit", "-m", "must be blocked"], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
      } catch (error) {
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        exitCode = typeof failure.code === "number" ? failure.code : 2;
        commitOutput = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
      }

      expect(exitCode).not.toBe(0);
      expect(await git(root, "rev-parse", "HEAD")).toBe(baseline);
      expect(commitOutput).toMatch(/gitleaks/i);
      expect(commitOutput).not.toContain(fakeSecret);
    },
    180_000,
  );
});

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  return result.stdout.trim();
}
