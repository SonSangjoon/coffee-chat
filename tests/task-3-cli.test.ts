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
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const temporaryRoots: string[] = [];

async function runCli(
  root: string,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cliPath, ...args],
      { cwd: root, encoding: "utf8" },
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as {
      code: number;
      stdout: string;
      stderr: string;
    };
    return {
      exitCode: failed.code,
      stdout: failed.stdout,
      stderr: failed.stderr,
    };
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Task 3 exact public CLI grammar", () => {
  it.each([
    ["candidate", "prepare"],
    ["candidate", "prepare", "--request", "request.json"],
    [
      "candidate",
      "prepare",
      "--request",
      "request.json",
      "--output-dir",
      "/tmp/candidate",
    ],
    ["candidate", "apply"],
    ["candidate", "apply", "--dir", "/tmp/candidate"],
    [
      "candidate",
      "apply",
      "--dir",
      "/tmp/candidate",
      "--approve",
      "not-a-digest",
    ],
  ])("rejects incomplete or legacy arguments: %s %s", async (...args) => {
    const result = await runCli(projectRoot, ...args);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("[cli-usage]");
  });

  it("recognizes only --request/--out and --dir/--approve before dispatch", async () => {
    const outside = await mkdtemp(resolve(tmpdir(), "coffee-chat-cli-"));
    temporaryRoots.push(outside);
    const prepare = await runCli(
      projectRoot,
      "candidate",
      "prepare",
      "--request",
      resolve(outside, "missing-request.json"),
      "--out",
      resolve(outside, "candidate"),
    );
    expect(prepare.exitCode).toBe(2);
    expect(prepare.stdout).not.toContain("[cli-usage]");
    expect(prepare.stdout).toContain("[candidate-request-unavailable]");

    const apply = await runCli(
      projectRoot,
      "candidate",
      "apply",
      "--dir",
      resolve(outside, "missing-candidate"),
      "--approve",
      `sha256:${"a".repeat(64)}`,
    );
    expect(apply.exitCode).toBe(2);
    expect(apply.stdout).not.toContain("[cli-usage]");
    expect(apply.stdout).toContain("[candidate-unavailable]");
  });

  it("accepts only hooks inspect, install, or uninstall with a documented format", async () => {
    for (const args of [
      ["hooks"],
      ["hooks", "run"],
      ["hooks", "inspect", "--format", "xml"],
      ["hooks", "inspect", "--unexpected"],
    ]) {
      const result = await runCli(projectRoot, ...args);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("[cli-usage]");
    }
  });

  it("dispatches hooks inspect to the real resolved repository hook lifecycle", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-cli-hook-"));
    temporaryRoots.push(root);
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    const result = await runCli(root, "hooks", "inspect", "--format", "json");
    expect(result.exitCode).toBe(0);
    const inspection = JSON.parse(result.stdout) as {
      classification: string;
      target_path: string;
    };
    expect(inspection.classification).toBe("absent");
    expect(inspection.target_path).toContain("hooks/pre-commit");
  });

  it("prepares and applies through the exact public Candidate commands", async () => {
    const base = await mkdtemp(resolve(tmpdir(), "coffee-chat-cli-candidate-"));
    temporaryRoots.push(base);
    const root = resolve(base, "repository");
    await mkdir(root);
    await cp(resolve(projectRoot, "tests/fixtures/initialized-valid"), root, {
      recursive: true,
    });
    await Promise.all([
      cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), {
        recursive: true,
      }),
      cp(resolve(projectRoot, "tools"), resolve(root, "tools"), {
        recursive: true,
      }),
    ]);
    for (const args of [
      ["init", "-q"],
      ["config", "user.email", "cli@example.com"],
      ["config", "user.name", "CLI Test"],
      ["remote", "add", "origin", "https://github.com/example/coffee-chat"],
      ["add", "."],
      ["commit", "-qm", "fixture"],
    ])
      await execFileAsync("git", args, { cwd: root });
    const requestPath = resolve(base, "request.json");
    const out = resolve(base, "candidate");
    await writeFile(
      requestPath,
      `${JSON.stringify(
        {
          schema_version: "1.0.0",
          mode: "update",
          entity_changes: [
            {
              action: "update",
              target_id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
              value: { label: "Iteration through CLI", kind: "process" },
            },
          ],
          note_changes: [],
          setup_effects: [],
        },
        null,
        2,
      )}\n`,
    );
    const prepared = await runCli(
      root,
      "candidate",
      "prepare",
      "--request",
      requestPath,
      "--out",
      out,
    );
    expect(prepared.exitCode).toBe(0);
    const summary = JSON.parse(prepared.stdout) as { candidate_digest: string };
    expect(summary.candidate_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((await lstat(resolve(out, "preview.json"))).isFile()).toBe(true);

    const applied = await runCli(
      root,
      "candidate",
      "apply",
      "--dir",
      out,
      "--approve",
      summary.candidate_digest,
    );
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      status: "applied",
      candidate_digest: summary.candidate_digest,
      validation: { status: "passed" },
    });
    expect(
      await readFile(resolve(root, "knowledge/entities.yml"), "utf8"),
    ).toContain("Iteration through CLI");
  });
});
