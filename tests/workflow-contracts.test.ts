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
  "github/codeql-action/init@c4dd10e44af883a891fe31ced449bcb4a6728b9b";
const codeqlAnalyzeAction =
  "github/codeql-action/analyze@c4dd10e44af883a891fe31ced449bcb4a6728b9b";
const dependencyReviewAction =
  "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294";
const attestBuildAction =
  "actions/attest-build-provenance@96b4a1ef7235a096b17240c259729fdd70c83d45";
const sbomAction =
  "anchore/sbom-action@d94f46e13c6c62f59525ac9a1e147a99dc0b9bf5";

type JsonObject = Record<string, unknown>;
type LoadedWorkflow = { raw: string; value: JsonObject };

describe("Task 7 Coffee Chat CI workflow", () => {
  it("exposes policy and quality checks for pull requests and merge queues", async () => {
    const { raw, value } = await loadWorkflow("ci.yml");
    const events = object(value.on, "CI on");
    const permissions = object(value.permissions, "CI permissions");
    const jobs = object(value.jobs, "CI jobs");

    expect(value.name).toBe("Coffee Chat CI");
    expect(Object.keys(events)).toEqual([
      "pull_request",
      "merge_group",
      "push",
    ]);
    expect(events).not.toHaveProperty("pull_request_target");
    expect(raw).not.toMatch(/\bpull_request_target\b/);
    expect(permissions).toEqual({ contents: "read" });
    expect(Object.keys(jobs)).toEqual(["policy", "quality"]);

    const policy = object(jobs.policy, "CI policy job");
    expect(policy.name).toBe("policy");
    expect(effectivePermissions(value, policy)).toEqual({ contents: "read" });
    expect(policy).not.toHaveProperty("environment");

    const quality = object(jobs.quality, "CI quality job");
    expect(quality.name).toBe("quality");
    expect(effectivePermissions(value, quality)).toEqual({ contents: "read" });
    expect(quality).not.toHaveProperty("environment");

    const policySteps = jobSteps(policy);
    const policyRuns = runCorpus(policySteps);
    expect(policyRuns).toContain("merge-policy.json");

    const steps = jobSteps(quality);
    const runs = runCorpus(steps);
    const searchable = stepCorpus(steps);
    expect(runs).toMatch(/(?:^|\n)npm ci(?:\n|$)/);
    expect(searchable).toMatch(/gitleaks/i);
    expect(runs).toMatch(/tools\/gitleaks\.ts[^\n]*--redact/);
    expect(runs).toMatch(/(?:^|\n)npm test(?:\s|\n|$)/);
    expect(runs).toMatch(/(?:^|\n)npm run test:host(?:\n|$)/);
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
    const jobs = object(value.jobs, "Pages jobs");

    expect(value.name).toBe("Coffee Chat Pages");
    expect(Object.keys(events)).toEqual(["workflow_dispatch"]);
    expect(events).not.toHaveProperty("push");
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
    const workflows = await Promise.all([
      loadWorkflow("ci.yml"),
      loadWorkflow("pages.yml"),
      loadWorkflow("codeql.yml"),
      loadWorkflow("security.yml"),
      loadWorkflow("release.yml"),
      loadWorkflow("auto-merge.yml"),
    ]);
    const [ci, pages, codeql, security, release, autoMerge] = workflows;

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
    expect([...new Set(usedActions(codeql.value))].sort()).toEqual(
      [checkoutAction, codeqlInitAction, codeqlAnalyzeAction].sort(),
    );
    expect([...new Set(usedActions(security.value))].sort()).toEqual(
      [checkoutAction, setupNodeAction, dependencyReviewAction].sort(),
    );
    expect([...new Set(usedActions(release.value))].sort()).toEqual(
      [checkoutAction, setupNodeAction, attestBuildAction, sbomAction].sort(),
    );
    expect(usedActions(autoMerge.value)).toEqual([]);

    for (const workflow of workflows) {
      expect(hasObjectKey(workflow.value, "secrets")).toBe(false);
      expect(workflow.raw).not.toMatch(/\$\{\{\s*secrets\./i);
      expect(workflow.raw).not.toMatch(/\bpull_request_target\b/);

      const checkoutSteps = allSteps(workflow.value).filter(
        (step) => step.uses === checkoutAction,
      );
      for (const step of checkoutSteps) {
        const persistCredentials = object(step.with, "checkout inputs")[
          "persist-credentials"
        ];
        expect(persistCredentials).toBe(workflow === release ? true : false);
      }

      for (const action of usedActions(workflow.value)) {
        expect(action).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
        expect([
          checkoutAction,
          setupNodeAction,
          uploadPagesAction,
          deployPagesAction,
          codeqlInitAction,
          codeqlAnalyzeAction,
          dependencyReviewAction,
          attestBuildAction,
          sbomAction,
        ]).toContain(action);
      }
    }
  });
});

describe("Task 1 CodeQL workflow", () => {
  it("analyzes JavaScript and TypeScript on pull requests, merge queues, and main", async () => {
    const { raw, value } = await loadWorkflow("codeql.yml");
    const events = object(value.on, "CodeQL on");
    const permissions = object(value.permissions, "CodeQL permissions");
    const jobs = object(value.jobs, "CodeQL jobs");

    expect(value.name).toBe("CodeQL");
    expect(Object.keys(events)).toEqual([
      "pull_request",
      "merge_group",
      "push",
      "schedule",
      "workflow_dispatch",
    ]);
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

describe("Coffee Chat security workflow", () => {
  it("keeps policy scanning required and reviews dependencies on pull requests", async () => {
    const { raw, value } = await loadWorkflow("security.yml");
    const events = object(value.on, "Security on");
    const permissions = object(value.permissions, "Security permissions");
    const jobs = object(value.jobs, "Security jobs");

    expect(value.name).toBe("Coffee Chat Security");
    expect(Object.keys(events)).toEqual([
      "pull_request",
      "merge_group",
      "push",
      "schedule",
      "workflow_dispatch",
    ]);
    expect(permissions).toEqual({ contents: "read" });
    expect(Object.keys(jobs)).toEqual(["policy", "dependency-review"]);
    expect(
      runCorpus(jobSteps(object(jobs.policy, "Security policy job"))),
    ).toContain("npm run ci:policy");
    expect(raw).not.toMatch(/\brg\b/);

    const dependencyReview = object(
      jobs["dependency-review"],
      "Dependency review job",
    );
    expect(dependencyReview.if).toBe(
      "${{ github.event_name == 'pull_request' }}",
    );
    expect(effectivePermissions(value, dependencyReview)).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    const dependencyStep = jobSteps(dependencyReview)[0];
    expect(dependencyStep.uses).toBe(dependencyReviewAction);
    expect(
      object(dependencyStep.with, "Dependency review inputs")[
        "fail-on-severity"
      ],
    ).toBe("high");
    expect(raw).not.toMatch(/\bpull_request_target\b/);
  });
});

describe("Coffee Chat auto-merge controller", () => {
  it("only enables squash auto-merge for the latest low-risk PR", async () => {
    const { raw, value } = await loadWorkflow("auto-merge.yml");
    const trigger = object(value.on, "Auto-merge on");
    const permissions = object(value.permissions, "Auto-merge permissions");
    const jobs = object(value.jobs, "Auto-merge jobs");
    const enable = object(jobs.enable, "Auto-merge enable job");
    const runs = runCorpus(jobSteps(enable));

    expect(Object.keys(trigger)).toEqual(["workflow_run"]);
    expect(
      object(trigger.workflow_run, "workflow_run trigger").workflows,
    ).toEqual(["Coffee Chat CI", "CodeQL", "Coffee Chat Security"]);
    expect(permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
    });
    expect(Object.keys(jobs)).toEqual(["enable"]);
    expect(runs).toContain("gh pr checks");
    expect(runs).toContain("--required");
    expect(runs).toContain("--auto --squash --match-head-commit");
    expect(runs).toContain("merge-policy.json?ref=main");
    expect(runs).toContain("HEAD_SHA");
    expect(allSteps(value).every((step) => step.uses === undefined)).toBe(true);
    expect(raw).not.toMatch(/actions\/(?:checkout|setup-node)@/);
  });
});

describe("Coffee Chat CalVer release workflow", () => {
  it("owns the release mutation and keeps its write boundary explicit", async () => {
    const { raw, value } = await loadWorkflow("release.yml");
    const events = object(value.on, "Release on");
    const permissions = object(value.permissions, "Release permissions");
    const jobs = object(value.jobs, "Release jobs");
    const releaseJob = object(jobs.release, "Release job");
    const steps = jobSteps(releaseJob);
    const runs = runCorpus(steps);

    expect(value.name).toBe("Coffee Chat Release");
    expect(Object.keys(events)).toEqual(["workflow_dispatch"]);
    expect(permissions).toEqual({ contents: "read" });
    expect(releaseJob.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(effectivePermissions(value, releaseJob)).toEqual({
      contents: "write",
      "id-token": "write",
      attestations: "write",
    });
    expect([...new Set(usedActions(value))].sort()).toEqual(
      [checkoutAction, setupNodeAction, attestBuildAction, sbomAction].sort(),
    );
    expect(
      object(
        steps.find((step) => step.uses === checkoutAction)?.with,
        "Release checkout inputs",
      )["persist-credentials"],
    ).toBe(true);
    expect(runs).toMatch(/tools\/release-version\.ts calver/);
    expect(runs).toMatch(/tools\/release-version\.ts prepare --version/);
    expect(runs).toContain("npm run cc -- generate");
    expect(runs).toContain("npm run cc -- generate --check --format json");
    expect(runs).toContain("npm run test:all");
    expect(runs).toContain("npm run typecheck");
    expect(runs).toContain("npm run format:check");
    expect(runs).toContain("npm run gitleaks:scan");
    expect(runs).toContain("npm run site:build");
    expect(runs).toContain("npm run site:check");
    expect(steps.some((step) => step.uses === sbomAction)).toBe(true);
    expect(
      object(
        steps.find((step) => step.uses === sbomAction)?.with,
        "SBOM inputs",
      ).format,
    ).toBe("cyclonedx-json");
    expect(runs).toContain(".sbom.json");
    expect(runs).toContain("Publishing the existing CalVer baseline");
    expect(runs).toMatch(/git tag -a "v\$\{VERSION\}"/);
    expect(runs).toMatch(/git push origin "v\$\{VERSION\}"/);
    expect(runs).toMatch(/gh release create "v\$\{VERSION\}"/);
    expect(runs).toContain("dist/release/coffee-chat-\${VERSION}.tar.gz");
    expect(environmentName(releaseJob.environment)).toBe("release");
    expect(raw).not.toMatch(/git push[^\n]*--force/);
    expect(raw).not.toMatch(/\$\{\{\s*secrets\./i);
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
