import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowRoot = join(repositoryRoot, ".github", "workflows");
const workflowNames = (await readdir(workflowRoot))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();
const failures = [];

for (const name of workflowNames) {
  const path = join(workflowRoot, name);
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
    const action = match[1];
    const at = action.lastIndexOf("@");
    if (at < 1 || !/^[0-9a-f]{40}$/.test(action.slice(at + 1))) {
      failures.push(`${name}: action is not pinned to a full SHA: ${action}`);
    }
  }
  if (/\bpull_request_target\b/.test(source)) {
    failures.push(`${name}: pull_request_target is not allowed`);
  }
  if (!/^permissions:\s*$/m.test(source)) {
    failures.push(`${name}: workflow permissions must be explicit`);
  }
  if (/\bpull_request:\s*/.test(source) && /\$\{\{\s*secrets\./.test(source)) {
    failures.push(`${name}: pull-request workflows must not expose secrets`);
  }
  if (
    ["ci.yml", "codeql.yml", "security.yml"].includes(name) &&
    !/\bmerge_group:\s*/.test(source)
  ) {
    failures.push(`${name}: required workflow must listen to merge_group`);
  }
}

const policy = JSON.parse(
  await readFile(join(repositoryRoot, ".github", "merge-policy.json"), "utf8"),
);
if (
  !Array.isArray(policy.protectedFiles) ||
  !Array.isArray(policy.protectedPrefixes)
) {
  failures.push(
    ".github/merge-policy.json: protectedFiles and protectedPrefixes must be arrays",
  );
}
for (const requiredPrefix of [".github/", "tests/e2e/"]) {
  if (!policy.protectedPrefixes.includes(requiredPrefix)) {
    failures.push(
      `.github/merge-policy.json: missing required prefix ${requiredPrefix}`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`CI policy passed for ${workflowNames.length} workflow(s).`);
}
