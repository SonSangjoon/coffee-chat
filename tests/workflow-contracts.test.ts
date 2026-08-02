import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCanonicalText, parseStrictYaml } from "../tools/strict-input.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const checkoutAction =
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803";
const setupNodeAction =
  "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444";
const uploadPagesAction =
  "actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b";
const deployPagesAction =
  "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e";
const codeqlInitAction =
  "github/codeql-action/init@f205ea1c3313d32999d8d6a48b4f6530d4437b38";
const codeqlAnalyzeAction =
  "github/codeql-action/analyze@f205ea1c3313d32999d8d6a48b4f6530d4437b38";

type JsonObject = Record<string, unknown>;
type LoadedWorkflow = { raw: string; value: JsonObject };

describe("Task 7 Coffee Chat CI workflow", () => {
  it("exposes one read-only pull-request verification check", async () => {
    const { raw, value } = await loadWorkflow("ci.yml");
    const events = object(value.on, "CI on");
    const permissions = object(value.permissions, "CI permissions");
    const jobs = object(value.jobs, "CI jobs");

    expect(value.name).toBe("Coffee Chat CI");
    expect(Object.keys(events)).toEqual(["pull_request"]);
    expect(events).not.toHaveProperty("pull_request_target");
    expect(raw).not.toMatch(/\bpull_request_target\b/);
    expect(permissions).toEqual({ contents: "read" });
    expect(Object.keys(jobs)).toEqual(["verify"]);

    const verify = object(jobs.verify, "CI verify job");
    expect(verify.name).toBe("verify");
    expect(effectivePermissions(value, verify)).toEqual({ contents: "read" });
    expect(verify).not.toHaveProperty("environment");

    const steps = jobSteps(verify);
    const runs = runCorpus(steps);
    const searchable = stepCorpus(steps);
    expect(runs).toMatch(/(?:^|\n)npm ci(?:\n|$)/);
    expect(searchable).toMatch(/gitleaks/i);
    expect(runs).toMatch(/tools\/gitleaks\.ts[^\n]*--redact/);
    expect(runs).toMatch(/(?:^|\n)npm test(?:\s|\n|$)/);
    expect(runs).toMatch(/(?:^|\n)npm run typecheck(?:\n|$)/);
    expect(runs).toContain("npm run cc -- check --snapshot worktree");
    expect(searchable).toMatch(/plugin/i);
    expect(runs).toMatch(
      /npm test[^\n]*tests\/(?:skill-contracts|task-4-projections)\.test\.ts/,
    );
    expect(runs).toMatch(/(?:^|\n)npm run site:build(?:\n|$)/);
    expect(searchable).toMatch(/synthetic instance/i);
    expect(runs).toMatch(/npm test[^\n]*tests\/fixture-isolation\.test\.ts/);
    expect(runs).toMatch(/(?:^|\n)npm run test:site(?:\n|$)/);
  });
});

describe("Task 7 Coffee Chat Pages workflow", () => {
  it("builds and uploads only dist/site before a separately privileged deploy", async () => {
    const { value } = await loadWorkflow("pages.yml");
    const events = object(value.on, "Pages on");
    const push = object(events.push, "Pages push event");
    const jobs = object(value.jobs, "Pages jobs");

    expect(value.name).toBe("Coffee Chat Pages");
    expect(Object.keys(events).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(push.branches).toEqual(["main"]);
    expect(value.permissions).toEqual({ contents: "read" });
    expect(jobs).toHaveProperty("build");
    expect(jobs).toHaveProperty("deploy");

    const build = object(jobs.build, "Pages build job");
    const buildRuns = runCorpus(jobSteps(build));
    expect(buildRuns).toMatch(/(?:^|\n)npm ci(?:\n|$)/);
    expect(buildRuns).toContain("npm run cc -- check --snapshot worktree");
    expect(buildRuns).toMatch(/(?:^|\n)npm run site:build(?:\n|$)/);

    const nonDeploySteps = Object.entries(jobs)
      .filter(([key]) => key !== "deploy")
      .flatMap(([, job]) => jobSteps(object(job, "Pages non-deploy job")));
    const uploadSteps = nonDeploySteps.filter(
      (step) => step.uses === uploadPagesAction,
    );
    expect(uploadSteps).toHaveLength(1);
    expect(object(uploadSteps[0]?.with, "Pages upload inputs").path).toBe(
      "dist/site",
    );

    for (const [key, jobValue] of Object.entries(jobs)) {
      if (key === "deploy") continue;
      const job = object(jobValue, `Pages ${key} job`);
      expect(effectivePermissions(value, job), key).toEqual({
        contents: "read",
      });
      expect(permissionValues(effectivePermissions(value, job))).not.toContain(
        "write",
      );
    }

    const deploy = object(jobs.deploy, "Pages deploy job");
    expect(environmentName(deploy.environment)).toBe("github-pages");
    expect(object(deploy.permissions, "Pages deploy permissions")).toEqual({
      pages: "write",
      "id-token": "write",
    });
    expect(jobSteps(deploy).map((step) => step.uses)).toEqual([
      deployPagesAction,
    ]);
    expect(jobSteps(deploy).some((step) => typeof step.run === "string")).toBe(
      false,
    );
  });
});

describe("Task 7 shared workflow hardening", () => {
  it("pins every Action, disables credential persistence, and receives no secrets", async () => {
    const [ci, pages] = await Promise.all([
      loadWorkflow("ci.yml"),
      loadWorkflow("pages.yml"),
    ]);

    expect([...new Set(usedActions(ci.value))].sort()).toEqual(
      [checkoutAction, setupNodeAction].sort(),
    );
    expect([...new Set(usedActions(pages.value))].sort()).toEqual(
      [
        checkoutAction,
        setupNodeAction,
        uploadPagesAction,
        deployPagesAction,
      ].sort(),
    );

    for (const workflow of [ci, pages]) {
      expect(hasObjectKey(workflow.value, "secrets")).toBe(false);
      expect(workflow.raw).not.toMatch(/\$\{\{\s*secrets\./i);
      expect(workflow.raw).not.toMatch(/\bpull_request_target\b/);

      const checkoutSteps = allSteps(workflow.value).filter(
        (step) => step.uses === checkoutAction,
      );
      expect(checkoutSteps.length).toBeGreaterThan(0);
      for (const step of checkoutSteps) {
        expect(
          object(step.with, "checkout inputs")["persist-credentials"],
        ).toBe(false);
      }

      for (const action of usedActions(workflow.value)) {
        expect(action).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
        expect([
          checkoutAction,
          setupNodeAction,
          uploadPagesAction,
          deployPagesAction,
        ]).toContain(action);
      }
    }
  });
});

describe("Task 1 CodeQL workflow", () => {
  it("analyzes JavaScript and TypeScript on pull requests and main", async () => {
    const { raw, value } = await loadWorkflow("codeql.yml");
    const events = object(value.on, "CodeQL on");
    const push = object(events.push, "CodeQL push event");
    const permissions = object(value.permissions, "CodeQL permissions");
    const jobs = object(value.jobs, "CodeQL jobs");

    expect(value.name).toBe("CodeQL");
    expect(Object.keys(events).sort()).toEqual(["pull_request", "push"]);
    expect(push.branches).toEqual(["main"]);
    expect(events).not.toHaveProperty("pull_request_target");
    expect(raw).not.toMatch(/\bpull_request_target\b/);
    expect(raw).not.toMatch(/\$\{\{\s*secrets\./i);
    expect(hasObjectKey(value, "secrets")).toBe(false);
    expect(permissions).toEqual({
      contents: "read",
      "security-events": "write",
    });
    expect(Object.keys(jobs)).toEqual(["analyze"]);

    const analyze = object(jobs.analyze, "CodeQL analyze job");
    expect(analyze.name).toBe("Analyze (javascript-typescript)");
    expect(effectivePermissions(value, analyze)).toEqual(permissions);
    expect(analyze).not.toHaveProperty("environment");

    const steps = jobSteps(analyze);
    expect(steps.map((step) => step.uses)).toEqual([
      checkoutAction,
      codeqlInitAction,
      codeqlAnalyzeAction,
    ]);
    expect(
      object(steps[0]?.with, "CodeQL checkout inputs")["persist-credentials"],
    ).toBe(false);
    expect(object(steps[1]?.with, "CodeQL init inputs").languages).toBe(
      "javascript-typescript",
    );
    expect(steps.some((step) => typeof step.run === "string")).toBe(false);
  });
});

async function loadWorkflow(name: string): Promise<LoadedWorkflow> {
  const repositoryPath = `.github/workflows/${name}`;
  const raw = decodeCanonicalText(
    await readFile(resolve(projectRoot, repositoryPath)),
    repositoryPath,
  );
  return {
    raw,
    value: object(parseStrictYaml(raw, repositoryPath), repositoryPath),
  };
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new TypeError(`${label} must be a mapping.`);
  return value as JsonObject;
}

function jobSteps(job: JsonObject): JsonObject[] {
  if (!Array.isArray(job.steps))
    throw new TypeError("Workflow job steps must be a sequence.");
  return job.steps.map((step) => object(step, "workflow step"));
}

function allSteps(workflow: JsonObject): JsonObject[] {
  return Object.values(object(workflow.jobs, "workflow jobs")).flatMap((job) =>
    jobSteps(object(job, "workflow job")),
  );
}

function usedActions(workflow: JsonObject): string[] {
  return allSteps(workflow).flatMap((step) =>
    typeof step.uses === "string" ? [step.uses] : [],
  );
}

function runCorpus(steps: JsonObject[]): string {
  return steps
    .flatMap((step) => (typeof step.run === "string" ? [step.run.trim()] : []))
    .join("\n");
}

function stepCorpus(steps: JsonObject[]): string {
  return steps
    .flatMap((step) => [step.name, step.run])
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function effectivePermissions(
  workflow: JsonObject,
  job: JsonObject,
): JsonObject {
  return object(job.permissions ?? workflow.permissions, "job permissions");
}

function permissionValues(permissions: JsonObject): unknown[] {
  return Object.values(permissions);
}

function environmentName(value: unknown): unknown {
  return typeof value === "string"
    ? value
    : object(value, "Pages environment").name;
}

function hasObjectKey(value: unknown, key: string): boolean {
  if (Array.isArray(value))
    return value.some((item) => hasObjectKey(item, key));
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as JsonObject).some(
    ([name, nested]) => name === key || hasObjectKey(nested, key),
  );
}
