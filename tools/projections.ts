import {
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import { compareCodePoints, generatedIndexBytes } from "./generate.ts";
import {
  GENERATED_OWNERSHIP_MARKER,
  assertArtifactBoundary as assertBoundary,
  assertReleaseProjectionBundle,
  roleOwnedProjectionPaths as declaredOwnedPaths,
  sameDirectory,
  sameOrDescendant,
  type ArtifactClass,
  type ProjectionBundle,
  type ProjectionContext,
} from "./artifact-inventory.ts";
import {
  isEngineManifest,
  isInstanceGraph,
  isInstanceManifest,
  type KnowledgeGraph,
  type Manifest,
} from "./knowledge.ts";
import { validateReadmeAssets, validateReadmeLinks } from "./readme-assets.ts";
import { renderReadmes } from "./readme.ts";
import type { DependencyTrackingSnapshot, Snapshot } from "./snapshot.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

const SKILL_NAMES = ["coffee-chat", "apply-perspective", "build-kg"] as const;

export type { ArtifactClass, ProjectionContext } from "./artifact-inventory.ts";
export {
  assertReleaseProjectionBundle,
  roleOwnedProjectionPaths,
} from "./artifact-inventory.ts";
export type {
  EphemeralProjectionBundle,
  ProjectionBundle,
  ReleaseProjectionBundle,
} from "./artifact-inventory.ts";
export type { DependencyTrackingSnapshot } from "./snapshot.ts";

function ownerName(manifest: Manifest): string {
  return isInstanceManifest(manifest)
    ? manifest.profile.display_name
    : "Coffee Chat";
}

function presentationName(manifest: Manifest): string {
  return isInstanceManifest(manifest)
    ? `Coffee Chat — ${manifest.profile.short_name}`
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
      displayName: presentationName(manifest),
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
    interface: { displayName: presentationName(manifest) },
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
  if (isEngineManifest(manifest))
    return textBytes(
      [
        "# Coffee Chat",
        "",
        "> **Talk with a point of view, not a personality prompt.**",
        ">",
        "> **성격 프롬프트가 아니라, 근거가 있는 관점과 대화하세요.**",
        "",
        "Coffee Chat is a temporal, source-linked personal knowledge graph for conversation and agent work. It lets you explore a person's recorded point of view, trace it to public Sources and dates, and see how it changed over time. Every answer keeps the author's record separate from source material, agent inference, and what remains unknown.",
        "Coffee Chat은 대화와 에이전트 업무를 위한 출처 기반 시계열 개인 지식 그래프입니다. 한 사람의 기록된 관점을 탐색하고, 공개 Source와 날짜까지 근거를 따라가며, 시간에 따른 변화를 살펴볼 수 있습니다. 모든 답변은 작성자의 기록·출처 내용·에이전트 추론·알 수 없는 부분을 구분합니다.",
        "",
        "Use it once by URL, or install that person's Coffee Chat plugin in Codex or Claude Code so an agent can derive the relevant POV, Mental Model, and Task Lens for real work.",
        "URL로 한 번 대화하거나, 그 사람의 Coffee Chat 플러그인을 Codex 또는 Claude Code에 설치하세요. 에이전트가 실제 업무에 필요한 POV·Mental Model·Task Lens를 그때그때 도출해 적용합니다.",
        "",
        "Coffee Chat starts from a premise: as AI lowers the cost of execution, point of view and mental models become the layer that shapes what an agent notices, values, and does. This project makes that layer usable in conversation and work without freezing it into a permanent persona file.",
        "Coffee Chat은 한 가지 전제에서 출발합니다. AI가 실행 비용을 낮출수록 에이전트가 무엇을 보고, 중요하게 여기고, 어떻게 행동할지를 결정하는 관점과 멘탈 모델이 더 중요해집니다. 이 프로젝트는 이를 영구적인 persona 파일로 고정하지 않고 대화와 업무에 활용하게 합니다.",
        "",
        "> [!IMPORTANT]",
        "> Coffee Chat does not crawl external publishing platforms and turn them into a profile. The author builds the knowledge graph here through an agent interview, a public-content Preview, and explicit approval. POV and Mental Model are then derived from that graph for each conversation or task.",
        ">",
        "> Coffee Chat은 외부 게시 플랫폼을 크롤링해 프로필로 만드는 도구가 아닙니다. 작성자는 에이전트 인터뷰·공개 내용 Preview·명시적 승인을 거쳐 여기에서 지식 그래프를 구축합니다. POV와 Mental Model은 대화나 작업마다 이 그래프에서 도출됩니다.",
        "",
        "## Talk with a Coffee Chat / Coffee Chat과 대화하기",
        "",
        "Someone shared their Coffee Chat URL? Give the instance URL to Codex, Claude, or another web-capable agent. A one-time Coffee Chat installs nothing.",
        "누군가 Coffee Chat URL을 공유했다면 그 인스턴스 URL을 Codex·Claude 또는 웹을 볼 수 있는 에이전트에 전달하세요. 일회성 Coffee Chat은 아무것도 설치하지 않습니다.",
        "",
        "This repository is the generic engine and represents no person. A conversation starts from an author's instance, for example `https://github.com/OWNER/coffee-chat-instance`.",
        "이 저장소는 특정 인물을 담지 않은 범용 엔진입니다. 대화는 `https://github.com/OWNER/coffee-chat-instance`와 같은 작성자의 인스턴스에서 시작합니다.",
        "",
        "```text",
        "Open <COFFEE_CHAT_INSTANCE_URL>.",
        "Read `coffee-chat.json`, then `AGENTS.md`.",
        "Start a one-time Coffee Chat. Do not install anything.",
        "Use the dated public knowledge graph and:",
        "- distinguish Authored, Sourced, Inferred, and Unknown",
        "- show the relevant Sources and dates",
        "- classify changed views as evolution, contextual coexistence, tension, contradiction, or Unknown only when the records support it.",
        "```",
        "",
        "Try asking / 이렇게 물어보세요:",
        "",
        "- What is this author's POV on a topic, and what shaped it? / 이 주제에 대한 작성자의 POV는 무엇이며, 무엇이 그 관점을 만들었나요?",
        "- How has that view changed over time? / 그 관점은 시간에 따라 어떻게 달라졌나요?",
        "- Where is the evidence limited or the view context-dependent? / 근거가 부족하거나 맥락에 따라 달라지는 부분은 어디인가요?",
        "- Apply this perspective to my decision without putting words in the author's mouth. / 작성자가 말하지 않은 내용을 만들어내지 말고, 이 관점을 내 의사결정에 적용해 주세요.",
        "",
        "Fictional answer shape / 가상 답변 형태:",
        "",
        "> **Question** — How has this author's recorded POV on `<topic>` changed?",
        ">",
        "> **Authored · earlier date** — What an earlier dated Note explicitly records.",
        ">",
        "> **Authored · later date** — What a later dated Note explicitly records.",
        ">",
        "> **Sourced** — What the linked public Sources contribute.",
        ">",
        "> **Inferred** — A bounded interpretation of the change, clearly labeled.",
        ">",
        "> **Unknown** — What the public record cannot establish.",
        "",
        "## Put a point of view to work / 관점을 업무에 적용하기",
        "",
        "A Coffee Chat is also a task-scoped perspective layer for Codex and Claude Code. The agent retrieves only the relevant temporal subgraph, derives a temporary POV, Mental Model, or Task Lens, and applies it to the named task without writing that synthesis back.",
        "Coffee Chat은 Codex와 Claude Code를 위한 작업별 관점 레이어이기도 합니다. 에이전트는 관련 시계열 부분 그래프만 검색해 임시 POV·Mental Model·Task Lens를 도출하고, 그 합성을 다시 저장하지 않은 채 명시된 작업에 적용합니다.",
        "",
        "For repeated perspective work, install the author's instance plugin, not this engine plugin. The instance README supplies commands with that author's plugin and marketplace names.",
        "관점을 반복해서 업무에 쓰려면 이 엔진 플러그인이 아니라 작성자의 인스턴스 플러그인을 설치하세요. 해당 인스턴스 README가 작성자별 플러그인·marketplace 이름이 들어간 명령을 제공합니다.",
        "",
        "```text",
        "Use <COFFEE_CHAT_INSTANCE_URL> as the perspective source for <TASK>.",
        "Retrieve only the public, dated knowledge relevant to the task.",
        "Derive a temporary POV, Mental Model, and Task Lens.",
        "Explain which criteria this changes and distinguish Authored from Inferred.",
        "Work only on <TARGET> and do not write the synthesis back to Coffee Chat.",
        "```",
        "",
        "## How a POV is made / POV가 만들어지는 과정",
        "",
        "```mermaid",
        "flowchart LR",
        '    A["Public reference + author context"] --> B["Agent interview"]',
        '    B --> C["Public Preview + digest approval"]',
        '    C --> D["Dated authored Note"]',
        '    D --> E["Temporal knowledge graph"]',
        '    F["Question or named task"] --> E',
        '    E --> G["Derived POV + Mental Model + Task Lens"]',
        '    G --> H["Coffee Chat or work"]',
        "```",
        "",
        "Public references and dated authored Notes are the record. The graph links them across Sources, neutral Entities, and time. POV, Mental Model, and Task Lens are derived only for the current question or task and are not written back.",
        "공개 레퍼런스와 날짜가 있는 작성자 Note가 기록의 원본입니다. 그래프는 이를 Source·중립 Entity·시간으로 연결합니다. POV·Mental Model·Task Lens는 현재 질문이나 작업에 맞춰서만 도출되며 다시 저장되지 않습니다.",
        "",
        "Your POV is not a profile field you fill in once. It emerges from the evidence relevant to the question and the time being discussed.",
        "POV는 한 번 작성해 고정하는 프로필 항목이 아닙니다. 질문과 시점에 관련된 근거에서 그때마다 발현됩니다.",
        "",
        "## Why trust it / 신뢰할 수 있는 이유",
        "",
        "- **Source-backed / 출처 기반:** every canonical Note starts from a public URL and keeps its citation metadata. / 모든 정식 Note는 공개 URL에서 시작하며 인용 메타데이터를 보존합니다.",
        "- **Time-aware / 시계열:** changed views remain visible with dates and evidence, then are classified as evolution, contextual coexistence, tension, contradiction, or `Unknown` only when supported. / 달라진 관점을 날짜·근거와 함께 보존하고, 근거가 있을 때만 변화·맥락적 공존·긴장·모순·`Unknown`으로 구분합니다.",
        "- **Attribution-aware / 구분 가능한 해석:** answers separate `Authored`, `Sourced`, `Inferred`, and `Unknown`. / 답변은 작성자 생각·출처 내용·에이전트 추론·알 수 없음을 구분합니다.",
        "- **No personality prompt / 성격 프롬프트 없음:** the record does not ask authors to declare their personality, strengths, or weaknesses. / 작성자에게 성격·장점·단점을 스스로 규정해 저장하도록 요구하지 않습니다.",
        "- **Ephemeral synthesis / 비영속 합성:** fixed POVs and Mental Models are never stored in Git, Pages, or plugin caches. / 고정된 POV와 Mental Model은 Git·Pages·플러그인 캐시에 저장하지 않습니다.",
        "- **Read-only by default / 기본은 읽기 전용:** one-time Coffee Chat changes neither the repository nor host configuration. / 일회성 Coffee Chat은 저장소나 호스트 설정을 변경하지 않습니다.",
        "",
        "Coffee Chat is an AI synthesis of public evidence. It is not the person and must not invent unrecorded beliefs.",
        "Coffee Chat은 공개 근거를 바탕으로 한 AI 합성입니다. 본인이 아니며 기록되지 않은 생각을 만들어내서는 안 됩니다.",
        "",
        "## Create your Coffee Chat / 나의 Coffee Chat 만들기",
        "",
        "A Coffee Chat starts with one public reference and your dated thought about it. Over time, it becomes a public knowledge window that lets people converse with your recorded POV and lets your agents use the relevant perspective in personal work.",
        "Coffee Chat은 공개 레퍼런스 하나와 그에 대한 날짜가 있는 생각에서 시작합니다. 이것이 쌓이면 다른 사람이 기록된 POV와 대화하고, 나의 에이전트가 개인 업무에 관련 관점을 활용할 수 있는 공개 지식 창구가 됩니다.",
        "",
        "1. Fork this knowledge-free engine into a separate instance repository. / 이 지식 비포함 엔진을 별도의 개인 인스턴스 저장소로 포크합니다.",
        "2. Give the agent one public reference and talk through your interpretation, counterpoint, context, or experience. / 공개 레퍼런스 하나를 주고 해석·반론·맥락·경험을 에이전트와 대화합니다.",
        "3. Review the complete public-content Preview and exact Candidate digest. / 공개될 전체 Preview와 정확한 Candidate digest를 확인합니다.",
        "4. Approve only when it says what you mean; the agent then writes the Note, Entities, graph, plugin, and Pages projections. / 의도한 내용이 맞을 때만 승인하면 에이전트가 Note·Entity·그래프·플러그인·Pages projection을 작성합니다.",
        "5. Repeat naturally. There is no score, required Source count, or rule that decides whether your perspective is correct. / 자연스럽게 반복합니다. 관점의 정답을 판단하는 점수·필수 Source 개수·의미 규칙은 없습니다.",
        "",
        "Give this repository to your agent / 이 저장소를 에이전트에 전달하세요:",
        "",
        "```text",
        `Open ${manifest.repository.url}.`,
        "Read `coffee-chat.json`, then `AGENTS.md`.",
        "Help me create a separate Coffee Chat instance.",
        "Start with one public reference and interview me to capture my dated thought.",
        "Show the complete public-content Preview and Candidate digest before mutating canonical instance files.",
        "```",
        "",
        "| Stored as the knowledge record / 지식 원본으로 저장 | Derived when needed / 필요할 때 도출 |",
        "| --- | --- |",
        "| Public Source URLs and citation observations / 공개 Source URL과 인용 관찰값 | Query-scoped POV / 질문별 POV |",
        "| Dated authored Notes / 날짜가 있는 작성자 Note | Mental Model / Mental Model |",
        "| Neutral Entity identity and temporal links / 중립 Entity identity와 시계열 연결 | Task Lens / Task Lens |",
        "",
        "## Use once or install / 일회성 사용 또는 설치",
        "",
        "The URL-based one-time path is the default. For repeated work with a particular recorded POV, follow that instance's README to install its public KG snapshot into Codex or Claude Code. The commands below install only the knowledge-free engine plugin for creating and operating Coffee Chats; it contains no represented-person Profile or Notes payload.",
        "URL 기반 일회성 사용이 기본입니다. 특정 기록된 POV를 반복적으로 업무에 활용하려면 해당 인스턴스 README에 따라 공개 KG snapshot을 Codex 또는 Claude Code에 설치하세요. 아래 명령은 Coffee Chat을 만들고 운영하는 지식 비포함 엔진 플러그인만 설치하며, 특정 인물의 Profile이나 Note payload는 포함하지 않습니다.",
        "",
        "<details>",
        "<summary>Codex install and remove / Codex 설치와 삭제</summary>",
        "",
        "```sh",
        `codex plugin marketplace add ${manifest.repository.url}`,
        `codex plugin add ${pluginSelector}`,
        "```",
        "",
        "```sh",
        `codex plugin remove ${pluginSelector}`,
        `codex plugin marketplace remove ${manifest.marketplace_name}`,
        "```",
        "",
        "</details>",
        "",
        "<details>",
        "<summary>Claude Code local-scope install and remove / Claude Code local scope 설치와 삭제</summary>",
        "",
        "```sh",
        `claude plugin marketplace add ${manifest.repository.url} --scope local`,
        `claude plugin install ${pluginSelector} --scope local`,
        "```",
        "",
        "```sh",
        `claude plugin uninstall ${pluginSelector} --scope local`,
        `claude plugin marketplace remove ${manifest.marketplace_name}`,
        "```",
        "",
        "</details>",
        "",
        "## Contribute to the engine / 엔진에 기여하기",
        "",
        "Contribute reusable schemas, methods, Skills, and safety guardrails here. Personal Notes belong only in an instance controlled by their author.",
        "이곳에는 재사용 가능한 스키마·방법론·Skill·안전 guardrail을 기여합니다. 개인 Note는 작성자가 관리하는 인스턴스에만 둡니다.",
        "",
        "See [testing and acceptance](./docs/testing.md) for the local verification matrix.",
        "로컬 검증 항목은 [testing and acceptance](./docs/testing.md)에서 확인할 수 있습니다.",
        "",
        "Code, schemas, templates, and Skills use the [MIT License](./LICENSE). Downstream authors own their Notes; see the [content terms](./CONTENT_LICENSE.md).",
      ].join("\n"),
    );
  const lines = [
    `# ${presentationName(manifest)}`,
    "",
    "> **Talk with a point of view, not a personality prompt.**",
    ">",
    "> **성격 프롬프트가 아니라, 근거가 있는 관점과 대화하세요.**",
    "",
    "This instance lets you explore the author's recorded point of view and how it changed across public, dated evidence. An agent derives the relevant POV for each conversation or task; it does not reproduce the person or claim unrecorded beliefs.",
    "이 인스턴스는 공개된 날짜별 근거를 따라 작성자의 기록된 관점과 그 변화를 탐색하게 합니다. 에이전트는 대화나 작업마다 관련 POV를 도출하며, 그 사람을 재현하거나 기록되지 않은 생각을 대신 말하지 않습니다.",
    "",
    "## Talk with a Coffee Chat / Coffee Chat과 대화하기",
    "",
    "Give this URL to Codex, Claude, or another web-capable agent. The one-time path installs nothing and changes neither this repository nor your host configuration.",
    "이 URL을 Codex·Claude 또는 웹을 볼 수 있는 에이전트에 전달하세요. 일회성 경로는 아무것도 설치하지 않으며 이 저장소와 호스트 설정을 변경하지 않습니다.",
    "",
    "```text",
    `Open ${manifest.repository.url}.`,
    "Read `coffee-chat.json`, then `AGENTS.md`.",
    "Start a one-time Coffee Chat. Do not install anything.",
    "Use the dated public knowledge graph and:",
    "- distinguish Authored, Sourced, Inferred, and Unknown",
    "- show the relevant Sources and dates",
    "- classify changed views as evolution, contextual coexistence, tension, contradiction, or Unknown only when the records support it.",
    "```",
    "",
    "Try asking / 이렇게 물어보세요:",
    "",
    "- What is this author's POV on a topic, and what shaped it? / 이 주제에 대한 작성자의 POV는 무엇이며, 무엇이 그 관점을 만들었나요?",
    "- How has that view changed over time? / 그 관점은 시간에 따라 어떻게 달라졌나요?",
    "- Where is the evidence limited or the view context-dependent? / 근거가 부족하거나 맥락에 따라 달라지는 부분은 어디인가요?",
    "- Apply this perspective to my task, but keep authored claims separate from inference. / 이 관점을 내 작업에 적용하되 작성자 주장과 추론을 구분해 주세요.",
    "",
    "## Put this point of view to work / 이 관점을 업무에 적용하기",
    "",
    "Install this instance in Codex or Claude Code when you want its public knowledge graph to become a task-scoped perspective layer. The agent retrieves only the relevant temporal subgraph, derives a temporary POV, Mental Model, or Task Lens, and applies it to the named task without writing that synthesis back.",
    "이 인스턴스를 Codex나 Claude Code에 설치하면 공개 지식 그래프를 작업별 관점 레이어로 사용할 수 있습니다. 에이전트는 관련 시계열 부분 그래프만 검색해 임시 POV·Mental Model·Task Lens를 도출하고, 그 합성을 다시 저장하지 않은 채 명시된 작업에 적용합니다.",
    "",
    "```text",
    `Use ${manifest.repository.url} as the perspective source for <TASK>.`,
    "Retrieve only the public, dated knowledge relevant to the task.",
    "Derive a temporary POV, Mental Model, and Task Lens.",
    "Explain which criteria this changes and distinguish Authored from Inferred.",
    "Work only on <TARGET> and do not write the synthesis back to Coffee Chat.",
    "```",
    "",
    `[Browse the temporal knowledge graph / 시계열 지식 그래프 보기](${manifest.pages_url})`,
    "",
    "## How the perspective is formed / 관점이 만들어지는 방식",
    "",
    "The canonical record contains public Source URLs, dated authored Notes, neutral Entities, and temporal links. For each conversation or task, the agent retrieves the relevant subgraph and derives a temporary POV, Mental Model, or Task Lens. That synthesis is never written back.",
    "정식 기록에는 공개 Source URL·날짜가 있는 작성자 Note·중립 Entity·시계열 연결만 들어갑니다. 에이전트는 대화나 작업마다 관련 부분 그래프를 검색해 임시 POV·Mental Model·Task Lens를 도출하며, 그 합성을 다시 저장하지 않습니다.",
    "",
    "## Why trust it / 신뢰할 수 있는 이유",
    "",
    "This is an AI synthesis of public, dated records—not the person and not a statement of unrecorded beliefs.",
    "공개된 날짜별 기록을 바탕으로 한 AI 합성입니다. 본인이 아니며 기록되지 않은 생각을 대신 말하지 않습니다.",
    "",
    "- Answers keep `Authored`, `Sourced`, `Inferred`, and `Unknown` distinguishable. / 답변은 작성자 생각·출처 내용·에이전트 추론·알 수 없음을 구분합니다.",
    "- Changed views remain visible with dates and evidence; the agent classifies them only as far as the records support. / 달라진 관점은 날짜와 근거를 유지하며, 에이전트는 기록이 뒷받침하는 범위에서만 이를 분류합니다.",
    "- No fixed POV, personality profile, or Mental Model is persisted. / 고정된 POV·성격 프로필·Mental Model은 저장하지 않습니다.",
    "- Only public records belong in this instance. / 이 인스턴스에는 공개 기록만 들어갑니다.",
    "",
    "## Build your knowledge base / 나의 지식 베이스 쌓기",
    "",
    "This knowledge graph is built here through an agent interview. Give the agent one public reference and your dated thought; it materializes Candidate and Preview artifacts outside the repository, and mutates canonical instance files only after you approve the exact digest.",
    "이 지식 그래프는 이곳에서 에이전트 인터뷰를 통해 구축합니다. 공개 레퍼런스 하나와 날짜가 있는 생각을 전달하면 에이전트가 저장소 밖에 Candidate와 Preview를 만들고, 정확한 digest를 승인한 뒤에만 정식 인스턴스 파일을 변경합니다.",
    "",
    "```text",
    `Open ${manifest.repository.url}.`,
    "Read `coffee-chat.json`, then `AGENTS.md`.",
    "Help me add one public reference and my dated thought to this knowledge graph.",
    "Interview me for context, interpretation, counterpoint, and application.",
    "Show the complete public-content Preview and Candidate digest before mutating canonical instance files.",
    "```",
    "",
    "Use the resulting knowledge graph for Coffee Chats, decisions, personal work, and agent tasks without freezing its POVs or Mental Models into a permanent self-description.",
    "완성된 지식 그래프를 Coffee Chat·의사결정·개인 업무·에이전트 작업에 활용하되, POV나 Mental Model을 영구적인 자기소개로 고정하지 않습니다.",
    "",
    "## Use once or install / 일회성 사용 또는 설치",
    "",
    "Install this instance plugin only for repeated Coffee Chats or task use. Coffee Chat v1 contributes three Skills and no service, runtime hook, MCP server, background process, or executable.",
    "반복적인 Coffee Chat이나 작업 활용이 필요할 때만 이 인스턴스 플러그인을 설치하세요. Coffee Chat v1은 Skill 세 개만 제공하며 서비스·runtime hook·MCP server·백그라운드 프로세스·실행 파일은 없습니다.",
    "",
    "Codex install / Codex 설치:",
    "",
    "```sh",
    `codex plugin marketplace add ${manifest.repository.url}`,
    `codex plugin add ${pluginSelector}`,
    "```",
    "",
    "Codex remove after use / 사용 후 Codex 삭제:",
    "",
    "```sh",
    `codex plugin remove ${pluginSelector}`,
    `codex plugin marketplace remove ${manifest.marketplace_name}`,
    "```",
    "",
    "Claude Code local-scope install / Claude Code local scope 설치:",
    "",
    "```sh",
    `claude plugin marketplace add ${manifest.repository.url} --scope local`,
    `claude plugin install ${pluginSelector} --scope local`,
    "```",
    "",
    "Claude Code remove after use / 사용 후 Claude Code 삭제:",
    "",
    "```sh",
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
    "Coffee Chat does not append derived POVs, Mental Models, Task Lenses, or new personal knowledge to the installed snapshot at runtime. The installed instance includes the public Profile and Notes snapshot. Host-managed caches, conversation history, logs, and retention may remain after removal.",
    "Coffee Chat은 runtime에 도출된 POV·Mental Model·Task Lens나 새 개인 지식을 설치된 snapshot에 덧붙이지 않습니다. 설치된 인스턴스에는 공개 Profile과 Note snapshot이 포함됩니다. 호스트가 관리하는 캐시·대화 기록·로그·보존 데이터는 삭제 후에도 남을 수 있습니다.",
    "",
    "</details>",
    "",
    "Code, schemas, templates, and Skills use the [MIT License](./LICENSE). Notes and original public prose use the [content terms](./CONTENT_LICENSE.md); third-party Sources retain their own terms.",
    "코드·스키마·템플릿·Skill은 [MIT License](./LICENSE)를, Note와 독창적 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따르며 제3자 Source의 권리는 각 권리자에게 있습니다.",
  ];
  return textBytes(lines.join("\n"));
}

function contentLicense(): Buffer {
  return textBytes(
    "# Content License\n\nThe [MIT License](./LICENSE) covers reusable Coffee Chat software, schemas, templates, and Skills. Downstream authors retain ownership of the Notes and original prose they add to their own instances.\n\nOnly `tests/fixtures/son-input/**` is © 2026 Son, All rights reserved. That path-scoped fixture notice does not apply to the generic plugin or downstream instances.\n\nThird-party Sources retain their own terms. Linking to, citing, indexing, or describing a third-party Source does not grant rights in that Source beyond its applicable terms.\n",
  );
}

function agentRouter(manifest: Manifest): Buffer {
  const roleEntry = isEngineManifest(manifest)
    ? [
        "This engine has no default person. At an engine URL, offer only **Create yours**, **Install engine plugin**, or **Contribute to engine**, then stop and wait; never follow an instance fallback from that same entry message or start a personal Coffee Chat from engine data.",
        "Coffee Chat and Apply Perspective require an explicit public instance URL verified through that instance's `coffee-chat.json` and `knowledge/index.json`. Build KG requires an explicit downstream instance checkout.",
      ]
    : [
        "Verify this initialized public instance by matching its explicit locator to `coffee-chat.json` `repository.url` or `pages_url`, then matching `repository_role` and profile id to `knowledge/index.json` before treating it as a target.",
        "At instance entry, ask the user to choose **one-time Coffee Chat** or **install instance plugin**, then wait before continuing.",
      ];
  return textBytes(
    [
      "# Coffee Chat agent router",
      "",
      "Read `coffee-chat.json` and select behavior from its `repository_role` before loading a Skill.",
      "",
      ...roleEntry,
      "",
      "Route conversation requests to `skills/coffee-chat/SKILL.md`, named external task application to `skills/apply-perspective/SKILL.md`, and Make mine or public graph updates to `skills/build-kg/SKILL.md`. Read only the selected Skill and its generated `references/method.md`.",
    ].join("\n"),
  );
}

export async function generatedProjectionBytes(
  snapshot: Snapshot,
  graph: KnowledgeGraph,
): Promise<Map<string, Buffer>> {
  await validateReadmeAssets(snapshot);
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
  const readmes = renderReadmes(manifest);
  await validateReadmeLinks(snapshot, readmes);
  for (const [path, bytes] of readmes) values.set(path, bytes);
  values.set(
    "CONTENT_LICENSE.md",
    isInstanceManifest(manifest)
      ? await snapshot.read("CONTENT_LICENSE.md")
      : contentLicense(),
  );
  values.set("AGENTS.md", agentRouter(manifest));
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
  values.set(
    `${packageRoot}/${GENERATED_OWNERSHIP_MARKER}`,
    jsonBytes({
      generated_by: "coffee-chat",
      schema_version: "1.0.0",
      repository_role: manifest.repository_role,
      package_name: manifest.plugin.name,
      owned_paths: [...values.keys()]
        .filter((path) => path.startsWith(`${packageRoot}/`))
        .sort(compareCodePoints),
    }),
  );
  if (isEngineManifest(manifest)) {
    const actual = [...values.keys()].sort(compareCodePoints);
    const declared = declaredOwnedPaths(graph);
    if (actual.join("\0") !== declared.join("\0"))
      throw new Error(
        "Engine projection escaped its closed artifact inventory",
      );
  }
  return new Map(
    [...values.entries()].sort(([left], [right]) =>
      compareCodePoints(left, right),
    ),
  );
}

/**
 * Builds a projection and binds it to every snapshot observation made while
 * validating and rendering it. Callers cannot provide their own dependency
 * list, so release provenance cannot be silently omitted.
 */
export async function buildProjectionBundle(
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  context: ProjectionContext,
): Promise<ProjectionBundle> {
  if (
    context.artifact_class === "release" &&
    !sameDirectory(context.output_root, snapshot.root)
  )
    throw new ValidationFailure({
      code: "release-output-must-be-checkout",
      path: ".",
      message: "Release projections must be generated in the current checkout.",
    });
  if (
    context.artifact_class === "ephemeral-test" &&
    (await pathResolvesWithin(snapshot.root, context.output_root))
  )
    throw new ValidationFailure({
      code: "ephemeral-output-must-be-external",
      path: ".",
      message:
        "Ephemeral test projections must be generated outside the checkout.",
    });
  const files = await generatedProjectionBytes(snapshot, graph);
  const dependencies = snapshot.dependencies();
  await assertBoundary(context, dependencies);
  return {
    artifact_class: context.artifact_class,
    files,
    dependencies: [...dependencies],
  };
}

const MAX_OUTPUT_SYMLINK_HOPS = 40;

export async function canonicalizePotentialPath(
  path: string,
  symlinkHops = 0,
): Promise<string> {
  let existing = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(existing), ...missingSegments.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let status;
      try {
        status = await lstat(existing);
      } catch (inspectionError) {
        if ((inspectionError as NodeJS.ErrnoException).code !== "ENOENT")
          throw inspectionError;
        const parent = dirname(existing);
        if (parent === existing) throw error;
        missingSegments.push(basename(existing));
        existing = parent;
        continue;
      }
      if (!status.isSymbolicLink()) throw error;
      if (symlinkHops >= MAX_OUTPUT_SYMLINK_HOPS)
        throw new Error("Too many output-root symlink hops.");
      const linkTarget = await readlink(existing);
      const resolvedTarget = isAbsolute(linkTarget)
        ? linkTarget
        : resolve(dirname(existing), linkTarget);
      return canonicalizePotentialPath(
        resolve(resolvedTarget, ...missingSegments.reverse()),
        symlinkHops + 1,
      );
    }
  }
}

export async function pathResolvesWithin(
  parentRoot: string,
  candidatePath: string,
): Promise<boolean> {
  if (sameOrDescendant(parentRoot, candidatePath)) return true;
  try {
    const [canonicalParent, canonicalCandidate] = await Promise.all([
      realpath(parentRoot),
      canonicalizePotentialPath(candidatePath),
    ]);
    return sameOrDescendant(canonicalParent, canonicalCandidate);
  } catch {
    return true;
  }
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

async function ownedCoffeeChatPackagePaths(
  snapshot: Snapshot,
  packageName: string,
): Promise<
  | {
      repositoryRole: "engine" | "instance";
      paths: Set<string>;
    }
  | undefined
> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) return undefined;
  const markerPath = `plugins/${packageName}/${GENERATED_OWNERSHIP_MARKER}`;
  if (!(await snapshot.exists(markerPath))) return undefined;
  try {
    const marker = record(
      parseStrictJson(
        decodeCanonicalText(await snapshot.read(markerPath), markerPath),
        markerPath,
      ),
    );
    const pluginPath = `plugins/${packageName}/.codex-plugin/plugin.json`;
    if (!(await snapshot.exists(pluginPath))) return undefined;
    const plugin = record(
      parseStrictJson(
        decodeCanonicalText(await snapshot.read(pluginPath), pluginPath),
        pluginPath,
      ),
    );
    const prefix = `plugins/${packageName}/`;
    const ownedPaths = marker?.owned_paths;
    const validPath = (path: unknown): path is string =>
      typeof path === "string" &&
      path.startsWith(prefix) &&
      path.length > prefix.length &&
      !path.includes("\\") &&
      !path.split("/").includes("..") &&
      posix.normalize(path) === path;
    if (
      marker?.generated_by === "coffee-chat" &&
      marker?.schema_version === "1.0.0" &&
      (marker?.repository_role === "engine" ||
        marker?.repository_role === "instance") &&
      (marker?.package_name === undefined ||
        marker?.package_name === packageName) &&
      plugin?.name === packageName &&
      Array.isArray(plugin?.keywords) &&
      plugin.keywords.includes("coffee-chat") &&
      Array.isArray(ownedPaths) &&
      ownedPaths.every(validPath) &&
      new Set(ownedPaths).size === ownedPaths.length
    )
      return {
        repositoryRole: marker.repository_role as "engine" | "instance",
        paths: new Set([...ownedPaths, markerPath]),
      };
    return undefined;
  } catch {
    return undefined;
  }
}

async function ownedPackagePaths(
  snapshot: Snapshot,
): Promise<
  Map<string, { repositoryRole: "engine" | "instance"; paths: Set<string> }>
> {
  const packages = new Map<
    string,
    { repositoryRole: "engine" | "instance"; paths: Set<string> }
  >();
  const packageNames = new Set(
    (await snapshot.list("plugins"))
      .map((path) => path.split("/")[1])
      .filter((value): value is string => Boolean(value)),
  );
  for (const packageName of packageNames) {
    const paths = await ownedCoffeeChatPackagePaths(snapshot, packageName);
    if (paths) packages.set(packageName, paths);
  }
  return packages;
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
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  ownershipTarget: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  } = {
    repositoryRole: graph.manifest.repository_role,
    packageName: graph.manifest.plugin.name,
  },
): Promise<GeneratedProjectionInspection> {
  const expected = (
    await buildProjectionBundle(snapshot, graph, {
      artifact_class: "release",
      output_root: snapshot.root,
    })
  ).files;
  const diagnostics: Diagnostic[] = [];
  const blockingDiagnostics: Diagnostic[] = [];
  const ownedStalePaths = new Set<string>();
  const ownedPackages = await ownedPackagePaths(snapshot);

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

  for (const [packageName, ownedPackage] of ownedPackages) {
    if (
      ownershipTarget.repositoryRole === "instance" &&
      packageName !== ownershipTarget.packageName &&
      ownedPackage.repositoryRole !== "engine"
    )
      continue;
    const ownedPaths = ownedPackage.paths;
    const packageRoot = `plugins/${packageName}`;
    for (const path of await snapshot.list(packageRoot)) {
      if (expected.has(path)) continue;
      if (!ownedPaths.has(path)) continue;
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
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
  ownershipTarget?: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  },
): Promise<string[]> {
  return (await inspectGeneratedProjections(snapshot, graph, ownershipTarget))
    .statePaths;
}

export async function checkGeneratedProjections(
  snapshot: DependencyTrackingSnapshot,
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
  snapshot: DependencyTrackingSnapshot,
  graph: KnowledgeGraph,
): Promise<void> {
  if (snapshot.mode !== "worktree" || !sameDirectory(root, snapshot.root))
    throw new ValidationFailure({
      code: "release-output-must-be-checkout",
      path: ".",
      message: "Release projections must be generated in the current checkout.",
    });
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
  const bundle = await buildProjectionBundle(snapshot, graph, {
    artifact_class: "release",
    output_root: root,
  });
  assertReleaseProjectionBundle(bundle);
  const projections = bundle.files;
  for (const [path, bytes] of projections) {
    const target = await assertSafeOutput(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    if (!(await readFile(target)).equals(bytes))
      throw new Error("Generated bytes could not be verified");
  }
}
