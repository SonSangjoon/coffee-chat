import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, posix, relative, resolve, sep } from "node:path";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import { compareCodePoints, generatedIndexBytes } from "./generate.ts";
import {
  isInstanceGraph,
  isInstanceManifest,
  type KnowledgeGraph,
  type Manifest,
} from "./knowledge.ts";
import type { Snapshot } from "./snapshot.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

const SKILL_NAMES = ["coffee-chat", "apply-perspective", "build-kg"] as const;

function ownerName(manifest: Manifest): string {
  return isInstanceManifest(manifest)
    ? manifest.profile.display_name
    : "Coffee Chat";
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function textBytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

async function availableSkills(snapshot: Snapshot): Promise<string[]> {
  const found: string[] = [];
  for (const name of SKILL_NAMES)
    if (await snapshot.exists(`skills/${name}/SKILL.md`)) found.push(name);
  return found;
}

export async function hasDeliveryProjectionInputs(
  snapshot: Snapshot,
): Promise<boolean> {
  return (
    (await availableSkills(snapshot)).length > 0 ||
    (await snapshot.list("method")).some((path) => path.endsWith(".md"))
  );
}

async function methodReference(snapshot: Snapshot): Promise<Buffer> {
  const paths = (await snapshot.list("method"))
    .filter((path) => path.endsWith(".md"))
    .sort(compareCodePoints);
  if (paths.length === 0)
    throw new ValidationFailure({
      code: "missing-shared-method",
      path: "./method",
      message: "The authored shared method is missing.",
    });
  const sections = await Promise.all(
    paths.map(async (path) =>
      (await snapshot.read(path)).toString("utf8").trimEnd(),
    ),
  );
  return textBytes(
    `<!-- Generated from ${paths.map(repositoryPath).join(", ")}; do not edit. -->\n\n${sections.join("\n\n")}`,
  );
}

function codexManifest(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.plugin.name,
    version: manifest.plugin.version,
    description: manifest.plugin.description,
    author: {
      name: ownerName(manifest),
      url: manifest.repository.url,
    },
    homepage: manifest.pages_url,
    repository: manifest.repository.url,
    license: "MIT",
    keywords: ["coffee-chat", "knowledge-graph", "perspective"],
    skills: "./skills/",
    interface: {
      displayName: `Coffee Chat — ${ownerName(manifest)}`,
      shortDescription: "Talk with a public, dated perspective graph",
      longDescription:
        "Converse with, apply, or extend a source-grounded temporal perspective graph.",
      developerName: ownerName(manifest),
      category: "Productivity",
      capabilities: ["Read", "Write"],
      websiteURL: manifest.pages_url,
      defaultPrompt: [
        "Start a one-time Coffee Chat from the public dated graph.",
        "Apply the documented perspective to my named task.",
        "Add a public Source-backed Note through Preview approval.",
      ],
    },
  };
}

function claudeManifest(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.plugin.name,
    version: manifest.plugin.version,
    description: manifest.plugin.description,
    author: { name: ownerName(manifest) },
    homepage: manifest.pages_url,
    repository: manifest.repository.url,
    license: "MIT",
    keywords: ["coffee-chat", "knowledge-graph", "perspective"],
    skills: "./skills/",
  };
}

function codexMarketplace(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.marketplace_name,
    interface: { displayName: `${ownerName(manifest)} Coffee Chat` },
    plugins: [
      {
        name: manifest.plugin.name,
        source: {
          source: "local",
          path: `./plugins/${manifest.plugin.name}`,
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Productivity",
      },
    ],
  };
}

function claudeMarketplace(manifest: Manifest): Record<string, unknown> {
  return {
    name: manifest.marketplace_name,
    owner: { name: ownerName(manifest) },
    plugins: [
      {
        name: manifest.plugin.name,
        source: `./plugins/${manifest.plugin.name}`,
        description: manifest.plugin.description,
        version: manifest.plugin.version,
        author: { name: ownerName(manifest) },
        homepage: manifest.pages_url,
        repository: manifest.repository.url,
        license: "MIT",
        keywords: ["coffee-chat", "knowledge-graph", "perspective"],
        category: "Productivity",
        skills: "./skills/",
      },
    ],
  };
}

function readme(manifest: Manifest): Buffer {
  const pluginSelector = `${manifest.plugin.name}@${manifest.marketplace_name}`;
  const lines = [
    `# Coffee Chat — ${ownerName(manifest)}`,
    "",
    "## Purpose / 목적",
    "",
    "A personal, dated point-of-view graph and wiki for Coffee Chats, a personal knowledge graph, and task-scoped agent perspective.",
    "개인의 날짜별 관점을 기록한 그래프이자 위키로, 커피챗·개인 지식 그래프·작업별 에이전트 관점에 활용합니다.",
    "",
    "It is not a personality clone, and synthesized Mental Models are never persisted.",
    "성격 복제물이 아니며, 합성된 Mental Model은 저장하지 않습니다.",
    "",
    "## AI synthesis / AI 해석",
    "",
    "This is an AI-generated synthesis of public, dated records—not the person and not a statement of unrecorded beliefs.",
    "공개된 날짜별 기록을 바탕으로 AI가 만든 해석입니다. 본인이 아니며, 기록되지 않은 생각을 대신 말하지 않습니다.",
    "",
    "## One-time Coffee Chat / 일회성 커피챗",
    "",
    "Paste this into a web-capable agent; one-time mode installs nothing.",
    "웹을 볼 수 있는 에이전트에 아래 문장을 붙여 넣으세요. 일회성 모드는 아무것도 설치하지 않습니다.",
    "",
    "```text",
    `Open ${manifest.repository.url}. Read \`coffee-chat.json\`, then \`AGENTS.md\`. Ask me first to choose one-time Coffee Chat or plugin installation. Use only public, dated evidence and keep Authored, Sourced, Inferred, and Unknown distinguishable.`,
    "```",
    "",
    "## Install plugin / 플러그인 설치",
    "",
    "Use the native host manager and review this repository as the source before installation. Coffee Chat v1 contributes only three Skills; it has no service, hook, MCP server, agent, or executable.",
    "호스트의 기본 관리자를 사용하고 설치 전에 이 저장소를 소스로 검토하세요. Coffee Chat v1은 Skill 세 개만 제공하며 서비스·hook·MCP server·agent·실행 파일은 없습니다.",
    "",
    "Codex install, then plugin-first removal / Codex 설치 후 플러그인 우선 삭제:",
    "",
    "```sh",
    `codex plugin marketplace add ${manifest.repository.url}`,
    `codex plugin add ${pluginSelector}`,
    `codex plugin remove ${pluginSelector}`,
    `codex plugin marketplace remove ${manifest.marketplace_name}`,
    "```",
    "",
    "Claude Code local-scope install, then plugin-first removal / Claude Code local scope 설치 후 플러그인 우선 삭제:",
    "",
    "```sh",
    `claude plugin marketplace add ${manifest.repository.url} --scope local`,
    `claude plugin install ${pluginSelector} --scope local`,
    `claude plugin uninstall ${pluginSelector} --scope local`,
    `claude plugin marketplace remove ${manifest.marketplace_name}`,
    "```",
    "",
    "<details>",
    "<summary>Lifecycle, update, cache, and removal receipt / 수명주기·업데이트·캐시·삭제 receipt</summary>",
    "",
    "Codex exposes no plugin scope selector in its current `plugin add` command. Its effective scope and exact host-managed configuration and cache paths are not declared by this repository. Inspect `codex plugin add --help` on the current host; if a lifecycle detail is not exposed, label it `Unknown` before installing.",
    "현재 Codex의 `plugin add` 명령은 플러그인 scope 선택자를 제공하지 않습니다. 실제 적용 범위와 호스트가 관리하는 설정·캐시의 정확한 경로는 이 저장소가 정하지 않습니다. 현재 호스트에서 `codex plugin add --help`를 확인하고, 확인되지 않는 수명주기 정보는 설치 전에 `Unknown`으로 표시하세요.",
    "",
    "Refresh the marketplace snapshot with the following command, then inspect `codex plugin list --json`. The current Codex CLI has no separate `plugin update` command, so do not claim the installed snapshot changed unless the native manager reports it.",
    "아래 명령으로 marketplace snapshot을 갱신한 뒤 `codex plugin list --json`을 확인하세요. 현재 Codex CLI에는 별도 `plugin update` 명령이 없으므로 기본 관리자가 확인해 주지 않은 설치 snapshot 변경을 단정하지 마세요.",
    "",
    "```sh",
    `codex plugin marketplace upgrade ${manifest.marketplace_name}`,
    "```",
    "",
    "`plugin remove` removes this plugin from Codex local configuration and cache. Remove its marketplace only when no other plugin needs that source:",
    "`plugin remove`는 Codex의 로컬 설정과 캐시에서 이 플러그인을 제거합니다. 다른 플러그인이 해당 소스를 사용하지 않을 때만 marketplace도 제거하세요:",
    "",
    "```sh",
    "codex plugin list --json",
    "codex plugin marketplace list --json",
    "```",
    "",
    "The last two read-only commands are the removal receipt: report whether this exact plugin and marketplace remain, plus any path the host leaves `Unknown`.",
    "마지막 두 읽기 전용 명령이 삭제 receipt입니다. 정확히 이 플러그인과 marketplace가 남아 있는지, 호스트가 공개하지 않아 `Unknown`인 경로가 무엇인지 보고하세요.",
    "",
    "Claude Code supports `user`, `project`, and `local` scopes; `local` is the narrowest temporary choice. It copies the plugin into a host cache. Installing at another scope changes that scope's settings. Uninstalling the last scope deletes plugin persistent data unless `--keep-data` is used; Coffee Chat v1 declares no persistent-data component.",
    "Claude Code는 `user`·`project`·`local` scope를 지원하며, 잠시 사용할 때는 `local`이 가장 좁습니다. 플러그인은 호스트 캐시에 복사되고, 다른 scope를 선택하면 해당 scope의 설정이 바뀝니다. 마지막 scope에서 삭제하면 `--keep-data`를 쓰지 않는 한 플러그인 영속 데이터도 삭제되지만 Coffee Chat v1은 영속 데이터 구성요소를 선언하지 않습니다.",
    "",
    "```sh",
    `claude plugin update ${pluginSelector} --scope local`,
    "claude plugin list --json",
    "claude plugin marketplace list --json",
    "```",
    "",
    "For Claude Code, the final two list commands are the same presence/absence receipt. Marketplace removal clears its registration and uninstalls remaining plugins from it; exact residual cache paths remain host-dependent unless the manager reports them.",
    "Claude Code에서도 마지막 두 list 명령을 presence/absence receipt로 사용합니다. marketplace 삭제는 등록을 지우고 그곳에서 설치한 남은 플러그인도 삭제하지만, 관리자가 알려주지 않는 잔여 캐시의 정확한 경로는 호스트에 따라 달라집니다.",
    "",
    "Coffee Chat writes no runtime cache or personal data. Host conversation history, logs, and retention are outside Coffee Chat and may remain after plugin removal.",
    "Coffee Chat 자체는 runtime cache나 개인 데이터를 기록하지 않습니다. 호스트의 대화 기록·로그·보존 정책은 Coffee Chat 밖에 있으며 플러그인을 지운 뒤에도 남을 수 있습니다.",
    "",
    "</details>",
    "",
    "## Make mine / 내 것으로 만들기",
    "",
    "Fork the repository, open the fork in Codex or Claude Code, explicitly choose **Make mine**, and ask `build-kg` to prepare your first public Source-backed Note. Nothing is written before you approve the exact Preview digest.",
    "저장소를 포크해 Codex 또는 Claude Code에서 열고 **Make mine**을 명시한 뒤, `build-kg`에 첫 공개 Source 기반 Note 준비를 요청하세요. 정확한 Preview digest를 승인하기 전에는 쓰지 않습니다.",
    "",
    "## Browse KG / KG 둘러보기",
    "",
    `[Browse the temporal graph / 시계열 그래프 보기](${manifest.pages_url})`,
    "",
    "### Build the public record / 공개 기록 만들기",
    "",
    "Public Sources plus dated thoughts become linked Notes, Sources, and neutral Entities in a temporal knowledge graph.",
    "공개 Source와 날짜가 있는 생각이 서로 연결된 Note·Source·중립 Entity의 시계열 지식 그래프가 됩니다.",
    "",
    "### Use the public record / 공개 기록 사용하기",
    "",
    "An agent retrieves the relevant temporal subgraph, derives a query-scoped Perspective and optional Task Lens, uses them with evidence, and never writes that synthesis back.",
    "에이전트는 관련 시계열 부분 그래프에서 질문별 Perspective와 선택적 Task Lens를 합성해 근거와 함께 사용하고, 그 합성을 다시 저장하지 않습니다.",
    "",
    "Code, schemas, templates, and Skills use the [MIT License](./LICENSE). Notes and original public prose use the [content terms](./CONTENT_LICENSE.md); third-party Sources retain their own terms.",
    "코드·스키마·템플릿·Skill은 [MIT License](./LICENSE)를, Note와 독창적 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따르며 제3자 Source의 권리는 각 권리자에게 있습니다.",
  ];
  return textBytes(lines.join("\n"));
}

function contentLicense(manifest: Manifest): Buffer {
  if (!isInstanceManifest(manifest))
    return textBytes(
      "# Content License\n\nThis generic engine contains no represented-person knowledge or original public prose.\n",
    );
  return textBytes(
    `# Content License\n\n\`knowledge/notes/**\` and ${manifest.profile.display_name}'s original public prose are © 2026 ${manifest.profile.display_name}, All rights reserved.\n\nThird-party Sources retain their own terms. Linking to, citing, indexing, or describing a third-party Source does not grant rights in that Source beyond its applicable terms.\n`,
  );
}

export async function generatedProjectionBytes(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<Map<string, Buffer>> {
  const skills = await availableSkills(snapshot);
  const missingSkills = SKILL_NAMES.filter((name) => !skills.includes(name));
  if (missingSkills.length > 0)
    throw new ValidationFailure({
      code: "missing-skill",
      path: repositoryPath(`skills/${missingSkills[0]}/SKILL.md`),
      message: "All three declared Coffee Chat Skills are required.",
    });
  const method = await methodReference(snapshot);
  const manifest = graph.manifest;
  const packageRoot = `plugins/${manifest.plugin.name}`;
  const values = new Map<string, Buffer>();
  const codex = jsonBytes(codexManifest(manifest));
  const claude = jsonBytes(claudeManifest(manifest));
  values.set("README.md", readme(manifest));
  if (isInstanceManifest(manifest))
    values.set("CONTENT_LICENSE.md", contentLicense(manifest));
  values.set(
    "AGENTS.md",
    textBytes(
      `# Coffee Chat agent router\n\nRead \`coffee-chat.json\`. Route conversation requests to \`skills/coffee-chat/SKILL.md\`, named external task application to \`skills/apply-perspective/SKILL.md\`, and Make mine or public graph updates to \`skills/build-kg/SKILL.md\`. Read only the selected Skill and its generated shared-method reference.\n`,
    ),
  );
  values.set("CLAUDE.md", Buffer.from("@AGENTS.md\n", "utf8"));
  values.set(".codex-plugin/plugin.json", codex);
  values.set(".claude-plugin/plugin.json", claude);
  values.set(
    ".agents/plugins/marketplace.json",
    jsonBytes(codexMarketplace(manifest)),
  );
  values.set(
    ".claude-plugin/marketplace.json",
    jsonBytes(claudeMarketplace(manifest)),
  );
  values.set(`${packageRoot}/.codex-plugin/plugin.json`, codex);
  values.set(`${packageRoot}/.claude-plugin/plugin.json`, claude);
  if (isInstanceManifest(manifest)) {
    values.set(
      `${packageRoot}/knowledge/coffee-chat.json`,
      await snapshot.read("coffee-chat.json"),
    );
    values.set(`${packageRoot}/CONTENT_LICENSE.md`, contentLicense(manifest));
  }
  if (await snapshot.exists("LICENSE"))
    values.set(`${packageRoot}/LICENSE`, await snapshot.read("LICENSE"));
  for (const skill of skills) {
    const skillBytes = await snapshot.read(`skills/${skill}/SKILL.md`);
    values.set(`skills/${skill}/references/method.md`, method);
    values.set(`${packageRoot}/skills/${skill}/SKILL.md`, skillBytes);
    values.set(`${packageRoot}/skills/${skill}/references/method.md`, method);
  }
  if (isInstanceGraph(graph)) {
    const index = generatedIndexBytes(graph);
    values.set(`${packageRoot}/knowledge/index.json`, index);
    values.set(
      `${packageRoot}/knowledge/entities.yml`,
      await snapshot.read("knowledge/entities.yml"),
    );
    for (const note of graph.notes)
      values.set(`${packageRoot}/${note.path}`, note.bytes);
  }
  return new Map(
    [...values.entries()].sort(([left], [right]) =>
      compareCodePoints(left, right),
    ),
  );
}

export type GeneratedProjectionInspection = {
  expected: Map<string, Buffer>;
  ownedStalePaths: string[];
  statePaths: string[];
  diagnostics: Diagnostic[];
  blockingDiagnostics: Diagnostic[];
};

const ROOT_ADAPTER_PREFIXES = [
  ".codex-plugin",
  ".claude-plugin",
  ".agents/plugins",
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

async function isOwnedCoffeeChatPackage(
  snapshot: Snapshot,
  packageName: string,
): Promise<boolean> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) return false;
  const pluginPath = `plugins/${packageName}/.codex-plugin/plugin.json`;
  const knowledgePath = `plugins/${packageName}/knowledge/coffee-chat.json`;
  if (!(await snapshot.exists(pluginPath))) return false;
  try {
    const plugin = record(
      parseStrictJson(
        decodeCanonicalText(await snapshot.read(pluginPath), pluginPath),
        pluginPath,
      ),
    );
    if (!(await snapshot.exists(knowledgePath)))
      return (
        plugin?.name === packageName &&
        Array.isArray(plugin?.keywords) &&
        plugin.keywords.includes("coffee-chat")
      );
    const knowledge = record(
      parseStrictJson(
        decodeCanonicalText(await snapshot.read(knowledgePath), knowledgePath),
        knowledgePath,
      ),
    );
    const knowledgePlugin = record(knowledge?.plugin);
    return (
      plugin?.name === packageName &&
      knowledge?.schema_version === "1.0.0" &&
      knowledgePlugin?.name === packageName
    );
  } catch {
    return false;
  }
}

async function ownedPackageRoots(
  snapshot: Snapshot,
  currentPackageName: string,
): Promise<string[]> {
  const roots = new Set<string>([currentPackageName]);
  const packageNames = new Set(
    (await snapshot.list("plugins"))
      .map((path) => path.split("/")[1])
      .filter((value): value is string => Boolean(value)),
  );
  for (const packageName of packageNames)
    if (
      packageName !== currentPackageName &&
      (await isOwnedCoffeeChatPackage(snapshot, packageName))
    )
      roots.add(packageName);
  return [...roots].sort(compareCodePoints);
}

async function stalePathIsSafe(
  snapshot: Snapshot,
  path: string,
): Promise<boolean> {
  try {
    await snapshot.assertSafe(path);
    if (snapshot.mode === "worktree") {
      const status = await lstat(resolve(snapshot.root, ...path.split("/")));
      if (status.isSymbolicLink() || !status.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function inspectGeneratedProjections(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<GeneratedProjectionInspection> {
  const expected = await generatedProjectionBytes(snapshot, graph);
  const diagnostics: Diagnostic[] = [];
  const blockingDiagnostics: Diagnostic[] = [];
  const ownedStalePaths = new Set<string>();

  for (const [path, bytes] of expected) {
    let matches = false;
    if (await snapshot.exists(path))
      matches = (await snapshot.read(path)).equals(bytes);
    if (!matches) {
      const diagnostic = {
        code: "stale-generated-projection",
        path: repositoryPath(path),
        message: "Generated delivery projection is missing or stale.",
      };
      diagnostics.push(diagnostic);
    }
  }

  const allowedSkillPaths = new Set([
    ...SKILL_NAMES.map((name) => `skills/${name}/SKILL.md`),
    ...SKILL_NAMES.map((name) => `skills/${name}/references/method.md`),
  ]);
  for (const path of await snapshot.list("skills")) {
    if (allowedSkillPaths.has(path)) continue;
    const diagnostic = {
      code: "unexpected-skill",
      path: repositoryPath(path),
      message:
        "Root Skills are closed to coffee-chat, apply-perspective, and build-kg.",
    };
    diagnostics.push(diagnostic);
    blockingDiagnostics.push(diagnostic);
  }

  for (const prefix of ROOT_ADAPTER_PREFIXES) {
    for (const path of await snapshot.list(prefix)) {
      if (expected.has(path)) continue;
      const diagnostic = {
        code: "unexpected-generated-projection",
        path: repositoryPath(path),
        message:
          "Unexpected content exists inside a closed root adapter directory.",
      };
      diagnostics.push(diagnostic);
      blockingDiagnostics.push(diagnostic);
    }
  }

  for (const packageName of await ownedPackageRoots(
    snapshot,
    graph.manifest.plugin.name,
  )) {
    const packageRoot = `plugins/${packageName}`;
    for (const path of await snapshot.list(packageRoot)) {
      if (expected.has(path)) continue;
      if (!(await stalePathIsSafe(snapshot, path))) {
        const diagnostic = {
          code: "unsafe-generated-projection",
          path: repositoryPath(path),
          message:
            "Owned generated package content must be a safe regular file.",
        };
        diagnostics.push(diagnostic);
        blockingDiagnostics.push(diagnostic);
        continue;
      }
      ownedStalePaths.add(path);
      diagnostics.push({
        code: "unexpected-generated-projection",
        path: repositoryPath(path),
        message:
          "Owned generated package content is not part of the current deterministic projection.",
      });
    }
  }

  const sortedStalePaths = [...ownedStalePaths].sort(compareCodePoints);
  return {
    expected,
    ownedStalePaths: sortedStalePaths,
    statePaths: [...new Set([...expected.keys(), ...sortedStalePaths])].sort(
      compareCodePoints,
    ),
    diagnostics: sortDiagnostics(diagnostics),
    blockingDiagnostics: sortDiagnostics(blockingDiagnostics),
  };
}

export async function generatedProjectionStatePaths(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<string[]> {
  return (await inspectGeneratedProjections(snapshot, graph)).statePaths;
}

export async function checkGeneratedProjections(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<Diagnostic[]> {
  return (await inspectGeneratedProjections(snapshot, graph)).diagnostics;
}

async function assertSafeOutput(root: string, path: string): Promise<string> {
  const target = resolve(root, ...path.split("/"));
  const canonicalRoot = await realpath(root);
  let candidate = dirname(target);
  while (candidate !== root) {
    try {
      await lstat(candidate);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      candidate = dirname(candidate);
    }
  }
  const canonicalParent = await realpath(candidate);
  const fromRoot = relative(canonicalRoot, canonicalParent);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`))
    throw new ValidationFailure({
      code: "symlink-escape",
      path: repositoryPath(path),
      message: "Generated output path must resolve inside the repository.",
    });
  try {
    if ((await lstat(target)).isSymbolicLink())
      throw new ValidationFailure({
        code: "symlink-escape",
        path: repositoryPath(path),
        message: "Generated output path must not be a symbolic link.",
      });
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function writeGeneratedProjections(
  root: string,
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<void> {
  const inspection = await inspectGeneratedProjections(snapshot, graph);
  if (inspection.blockingDiagnostics.length > 0)
    throw new ValidationFailure(inspection.blockingDiagnostics[0]!);
  const removedDirectories = new Set<string>();
  for (const path of inspection.ownedStalePaths) {
    const target = await assertSafeOutput(root, path);
    await unlink(target);
    let directory = posix.dirname(path);
    while (
      directory.startsWith("plugins/") &&
      directory.split("/").length > 1
    ) {
      removedDirectories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  for (const path of [...removedDirectories].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  )) {
    const target = await assertSafeOutput(root, `${path}/.keep-check`);
    try {
      await rmdir(dirname(target));
    } catch (error) {
      if (
        !["ENOENT", "ENOTEMPTY", "EEXIST"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
  }
  const projections = inspection.expected;
  for (const [path, bytes] of projections) {
    const target = await assertSafeOutput(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    if (!(await readFile(target)).equals(bytes))
      throw new Error("Generated bytes could not be verified");
  }
}
