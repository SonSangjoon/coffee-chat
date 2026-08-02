import { isEngineManifest, type Manifest } from "./knowledge.ts";

export type ReadmePath = "README.md" | "README.ko.md";

const ENGINE_REPOSITORY_URL = "https://github.com/SonSangjoon/coffee-chat";

function textBytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function markdown(lines: readonly string[]): string {
  return lines.join("\n");
}

type ReadmeContext = {
  name: string;
  profileName: string;
  instanceUrl: string;
  taskUrl: string;
  buildUrl: string;
  pluginSelector: string;
  marketplace: string;
  isEngine: boolean;
  pagesUrl?: string;
};

function context(manifest: Manifest): ReadmeContext {
  const isEngine = isEngineManifest(manifest);
  return {
    name: isEngine
      ? "Coffee Chat"
      : `Coffee Chat — ${manifest.profile.display_name}`,
    profileName: isEngine ? "Coffee Chat" : manifest.profile.display_name,
    instanceUrl: isEngine
      ? "<COFFEE_CHAT_INSTANCE_URL>"
      : manifest.repository.url,
    taskUrl: isEngine ? "<YOUR_COFFEE_CHAT_URL>" : manifest.repository.url,
    buildUrl: isEngine ? "#build-your-coffee-chat" : ENGINE_REPOSITORY_URL,
    pluginSelector: `${manifest.plugin.name}@${manifest.marketplace_name}`,
    marketplace: manifest.marketplace_name,
    isEngine,
    pagesUrl: isEngine ? undefined : manifest.pages_url,
  };
}

function zeroInstallPrompt(url: string): string[] {
  return [
    "```text",
    `Open ${url}.`,
    "Read coffee-chat.json, then AGENTS.md.",
    "Start a one-time Coffee Chat. Do not install anything.",
    "",
    "Help me understand how this person approaches <ROLE_OR_PROJECT>.",
    "Show documented alignment, tension, and Unknown.",
    "Distinguish Authored, Sourced, Inferred, and Unknown.",
    "Do not score the person or make a hiring decision.",
    "```",
  ];
}

function taskPrompt(url: string): string[] {
  return [
    "```text",
    `Use ${url} as the perspective source for <TASK>.`,
    "Retrieve only the public, dated records relevant to the task.",
    "Derive a temporary POV, Mental Model, and Task Lens.",
    "Explain which judgment criteria affect the work and cite the supporting Notes.",
    "Work only on <TARGET>.",
    "Do not write the synthesis back to Coffee Chat.",
    "```",
  ];
}

function installCommands(
  context: ReadmeContext,
  locale: "en" | "ko",
): string[] {
  const install =
    locale === "en" ? "Codex install and remove" : "Codex 설치와 제거";
  const claude =
    locale === "en"
      ? "Claude Code install and remove"
      : "Claude Code 설치와 제거";
  return [
    `<details><summary>${install}</summary>`,
    "",
    "```sh",
    `codex plugin marketplace add ${context.isEngine ? ENGINE_REPOSITORY_URL : context.instanceUrl}`,
    `codex plugin add ${context.pluginSelector}`,
    "",
    `codex plugin remove ${context.pluginSelector}`,
    `codex plugin marketplace remove ${context.marketplace}`,
    "```",
    "",
    "</details>",
    "",
    `<details><summary>${claude}</summary>`,
    "",
    "```sh",
    `claude plugin marketplace add ${context.isEngine ? ENGINE_REPOSITORY_URL : context.instanceUrl} --scope local`,
    `claude plugin install ${context.pluginSelector} --scope local`,
    "",
    `claude plugin uninstall ${context.pluginSelector} --scope local`,
    `claude plugin marketplace remove ${context.marketplace}`,
    "```",
    "",
    "</details>",
  ];
}

function renderEnglish(manifest: Manifest): string {
  const c = context(manifest);
  const roleCopy = c.isEngine
    ? "This is the neutral engine: it has no person to chat with. Use an initialized public instance URL for a conversation."
    : `This is ${c.profileName}'s approved public record. It is an interface to documented evidence, not a claim that a model is the person.`;
  const timelineLinks = c.pagesUrl
    ? ` Explore the public [Timeline](${c.pagesUrl}timeline/) and [Graph](${c.pagesUrl}graph/).`
    : "";
  return markdown([
    "[한국어](./README.ko.md)",
    "",
    `# ${c.name}`,
    "",
    "## AI makes execution abundant. Taste decides what is worth making.",
    "",
    "Taste here means judgment under uncertainty: what you notice, value, choose, refine, reject, and stop. Coffee Chat turns public Sources and dated, author-approved thinking into a temporal perspective graph that people and agents can question and use.",
    "",
    "It does not clone a person or store a fixed Mental Model. It derives only the perspective relevant to the current question or task, shows what supports it, and makes the boundary of the public record visible.",
    "",
    "[**Have a Coffee Chat — no install**](#have-a-coffee-chat-without-installing) · [**Build your Coffee Chat**](" +
      c.buildUrl +
      ")",
    "",
    "## Why Coffee Chat",
    "",
    "A coffee chat helps you understand how someone sees and decides through your own questions. Coffee Chat gives people and agents that same entry point into a documented point of view—with Sources, dates, and visible limits.",
    "",
    "- **Your agent has a Coffee Chat with you:** it reads the relevant record before a task and derives a temporary POV, Mental Model, or Task Lens.",
    "- **Someone else has a Coffee Chat with you:** they or their agent ask their own questions to understand, compare, or carefully apply the recorded perspective.",
    "",
    roleCopy + timelineLinks,
    "",
    "## Two needs, one graph",
    "",
    "| Build and use your Taste | Understand and use another perspective |",
    "| --- | --- |",
    "| Add one public Source and your dated thought through an agent interview. | Open an instance URL and ask a question without installing. |",
    "| Let your own Agent retrieve the relevant record before a named task. | Trace the response to dated Notes and public Sources. |",
    "| Derive a temporary POV, Mental Model, or Task Lens without storing it. | Surface alignment, tension, and Unknown without impersonation or scores. |",
    "",
    "## Have a Coffee Chat without installing",
    "",
    c.isEngine
      ? "Start with an initialized public instance URL. A one-time Coffee Chat installs nothing."
      : "Give this public instance URL to Codex, Claude, or another web-capable agent. A one-time Coffee Chat installs nothing.",
    "",
    ...zeroInstallPrompt(c.instanceUrl),
    "",
    "Try asking:",
    "",
    "- What does this person optimize for when making this kind of decision?",
    "- What public evidence shaped that judgment?",
    "- How has the view changed over time, and why?",
    "- Where might this role or project align with or challenge the documented view?",
    "- What should I ask the person directly because the public record cannot answer it?",
    "",
    "Role or hiring comparison is one optional question pattern, not the product identity.",
    "",
    "## One record, two directions",
    "",
    "```text",
    "Public Source + dated judgment",
    "              |",
    "        approved Note",
    "              |",
    "  temporal perspective graph",
    "       /                 \\",
    "you + your Agent    people + their Agents",
    "       |                 |",
    "relevant Task Lens  grounded Coffee Chat",
    "       |                 |",
    "work with your Taste  understand or apply with limits",
    "```",
    "",
    "Derived Perspective and Task Lens are used for the current question or task and are not written back.",
    "",
    "- **Build:** begin with one public Source and one dated thought.",
    "- **Use:** recover relevant judgment before a named task.",
    "- **Talk:** explore a documented point of view without installation.",
    "- **Apply:** inform a relevant task with attribution and limits.",
    "",
    "## Why this is not another knowledge base",
    "",
    "Other systems make information retrievable or teach an AI to remember or represent a user. Coffee Chat makes documented judgment usable by its owner and their agents, inspectable by other people, and selectively applicable by their agents.",
    "",
    "| Category | Primary question | Coffee Chat boundary |",
    "| --- | --- | --- |",
    "| Personal knowledge base | What has the owner saved or learned? | What does the approved public record show about how this issue was judged? |",
    "| RAG or GraphRAG | What does this corpus say? | What is Authored, Sourced, Inferred, or Unknown? |",
    "| Agent memory | What should the agent remember? | Only approved public records persist; task synthesis does not. |",
    "",
    "A knowledge base retrieves what someone knows. Coffee Chat lets people and agents work with how that person's documented judgment has evolved.",
    "",
    "## How it earns trust",
    "",
    "- A public Source anchors each record.",
    "- The author approves each dated Note.",
    "- Change over time remains visible.",
    "- Answers distinguish Authored, Sourced, Inferred, and Unknown.",
    "- No personality or fixed Mental Model is stored.",
    "- Derived perspectives are not persisted.",
    "",
    "Use it to make work more consistent and conversations more informed—not to freeze or replace a person.",
    "",
    "## Put Taste to work",
    "",
    "Name an exact external task and target. The agent retrieves only relevant dated records, discloses the Notes that support an advisory Task Lens, changes only the named target, and leaves Coffee Chat knowledge and installed plugin data untouched.",
    "",
    ...taskPrompt(c.taskUrl),
    "",
    "## Build your Coffee Chat",
    "",
    "```text",
    "one public reference + your dated thought",
    "→ agent interview",
    "→ public Preview and approval",
    "→ first Note and temporal graph",
    "→ Coffee Chat and task use",
    "```",
    "",
    c.isEngine
      ? "Create a separate instance from this neutral engine. Authors do not fill in a personality profile or a fixed Mental Model; the first useful result is one approved Note that can support a question or task immediately."
      : `This record belongs to ${c.profileName}. Build your own separate Coffee Chat from the [neutral engine](${ENGINE_REPOSITORY_URL}); authors do not fill in a personality profile or a fixed Mental Model.`,
    "",
    "The owner using the graph with their own agents is the primary loop. Public conversation and careful reuse by others grow from that same record.",
    "",
    "## Install, remove, contribute, and license",
    "",
    c.isEngine
      ? "Install the engine plugin to build and operate an instance. For repeated conversation or task work, install the relevant person's instance plugin instead."
      : "Install this instance plugin only for repeated Coffee Chats or task work. The one-time URL path remains available without installation.",
    "",
    ...installCommands(c, "en"),
    "",
    "Inspect lifecycle commands before use; host-managed paths and details that the manager does not report remain Unknown.",
    "",
    "Contribute reusable schemas, methods, Skills, and safety guardrails to the [engine](" +
      ENGINE_REPOSITORY_URL +
      "). Personal Notes belong only in an instance controlled by their author.",
    "",
    "See [testing and acceptance](./docs/testing.md). Code, schemas, templates, and Skills use the [MIT License](./LICENSE); Notes and original public prose use the [content terms](./CONTENT_LICENSE.md).",
  ]);
}

function renderKorean(manifest: Manifest): string {
  const c = context(manifest);
  const roleCopy = c.isEngine
    ? "이곳은 특정 인물을 담지 않은 중립 엔진입니다. 대화하려면 초기화된 공개 인스턴스 URL을 사용하세요."
    : `이곳은 ${c.profileName}의 승인된 공개 기록입니다. 모델이 그 사람이라고 주장하는 것이 아니라, 문서화된 근거에 접근하는 인터페이스입니다.`;
  const timelineLinks = c.pagesUrl
    ? ` 공개 [Timeline](${c.pagesUrl}timeline/)과 [Graph](${c.pagesUrl}graph/)도 볼 수 있습니다.`
    : "";
  return markdown([
    "[English](./README.md)",
    "",
    `# ${c.name}`,
    "",
    "## AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.",
    "",
    "여기서 Taste는 미적 취향이나 성격이 아니라 불확실성 속에서 무엇을 보고·선택하고·다듬고·버리며·멈출지를 정하는 판단입니다. Coffee Chat은 공개 Source와 날짜가 있는 작성자 승인 기록을, 사람과 Agent가 질문하고 활용할 수 있는 시계열 관점 그래프로 만듭니다.",
    "",
    "Coffee Chat은 사람을 복제하거나 고정된 Mental Model을 저장하지 않습니다. 현재 질문이나 작업에 필요한 관점만 도출하고, 무엇이 그 관점을 뒷받침하는지와 공개 기록의 경계를 함께 보여줍니다.",
    "",
    "[**설치 없이 Coffee Chat 하기**](#설치-없이-coffee-chat-하기) · [**나만의 Coffee Chat 만들기**](" +
      c.buildUrl +
      ")",
    "",
    "## 왜 Coffee Chat인가",
    "",
    "커피챗은 내가 던지는 질문을 통해 누군가가 어떻게 보고 판단하는지 이해하는 자리입니다. Coffee Chat은 사람과 Agent가 Source·날짜·보이는 한계를 갖춘 문서화된 관점에 같은 방식으로 접근하게 합니다.",
    "",
    "- **나의 Agent가 나와 Coffee Chat을 합니다:** 작업 전 관련 기록을 읽고 임시 POV·Mental Model·Task Lens를 도출합니다.",
    "- **다른 사람이 나와 Coffee Chat을 합니다:** 그 사람 또는 그 Agent가 자기 질문으로 기록된 관점을 이해·비교·신중하게 활용합니다.",
    "",
    roleCopy + timelineLinks,
    "",
    "## 두 가지 필요, 하나의 그래프",
    "",
    "| 나의 Taste를 쌓고 활용하기 | 다른 사람의 관점을 이해하고 활용하기 |",
    "| --- | --- |",
    "| 공개 Source 하나와 날짜가 있는 생각을 Agent 인터뷰로 더합니다. | 인스턴스 URL을 열고 설치 없이 질문합니다. |",
    "| 나의 Agent가 작업 전 관련 기록을 찾게 합니다. | 날짜가 있는 Note와 공개 Source까지 답변을 추적합니다. |",
    "| 저장하지 않는 임시 POV·Mental Model·Task Lens를 도출합니다. | 가장·점수 없이 alignment·tension·Unknown을 드러냅니다. |",
    "",
    "## 설치 없이 Coffee Chat 하기",
    "",
    c.isEngine
      ? "초기화된 공개 인스턴스 URL에서 시작하세요. 일회성 Coffee Chat은 아무것도 설치하지 않습니다."
      : "이 공개 인스턴스 URL을 Codex·Claude 또는 웹을 볼 수 있는 Agent에 전달하세요. 일회성 Coffee Chat은 아무것도 설치하지 않습니다.",
    "",
    ...zeroInstallPrompt(c.instanceUrl),
    "",
    "이렇게 물어볼 수 있습니다:",
    "",
    "- 이 사람은 이런 결정을 할 때 무엇을 가장 중요하게 보나요?",
    "- 그 판단을 만든 공개 근거는 무엇인가요?",
    "- 관점은 시간에 따라 어떻게, 왜 바뀌었나요?",
    "- 이 역할이나 프로젝트와 맞닿거나 긴장되는 지점은 어디인가요?",
    "- 공개 기록만으로 답할 수 없어 이 사람에게 직접 물어봐야 할 것은 무엇인가요?",
    "",
    "역할·채용 비교는 선택 가능한 질문 패턴 중 하나일 뿐, 제품의 정체성이 아닙니다.",
    "",
    "## 하나의 기록, 두 방향",
    "",
    "```text",
    "공개 Source + 날짜가 있는 판단",
    "              |",
    "          승인된 Note",
    "              |",
    "      시계열 관점 그래프",
    "       /                 \\",
    "나와 나의 Agent      다른 사람과 그들의 Agent",
    "       |                 |",
    "관련 Task Lens       근거 기반 Coffee Chat",
    "       |                 |",
    "내 Taste를 반영한 업무  경계가 있는 이해·활용",
    "```",
    "",
    "도출된 Perspective와 Task Lens는 현재 질문이나 작업에만 쓰며 다시 저장하지 않습니다.",
    "",
    "- **Build:** 공개 Source 하나와 날짜가 있는 생각에서 시작합니다.",
    "- **Use:** 명시된 작업 전에 관련 판단을 되찾습니다.",
    "- **Talk:** 설치 없이 문서화된 관점을 탐색합니다.",
    "- **Apply:** 출처와 한계를 밝히며 관련 작업에 참고합니다.",
    "",
    "## 또 하나의 지식 베이스가 아닌 이유",
    "",
    "다른 시스템은 정보를 찾게 하거나 AI가 사용자를 기억·재현하게 합니다. Coffee Chat은 문서화된 판단을 주인과 그 Agent가 활용하고, 다른 사람이 살펴보고, 다른 Agent가 필요한 범위에서 선택적으로 적용하게 합니다.",
    "",
    "| 범주 | 핵심 질문 | Coffee Chat의 경계 |",
    "| --- | --- | --- |",
    "| 개인 지식 베이스 | 주인이 무엇을 저장하거나 배웠나? | 승인된 공개 기록이 이 사안을 어떻게 판단했는가? |",
    "| RAG 또는 GraphRAG | 이 코퍼스는 무엇을 말하나? | 무엇이 Authored·Sourced·Inferred·Unknown인가? |",
    "| Agent memory | Agent가 무엇을 기억해야 하나? | 승인된 공개 기록만 남고 작업 합성은 남지 않습니다. |",
    "",
    "지식 베이스는 누군가가 아는 것을 찾습니다. Coffee Chat은 그 사람의 문서화된 판단이 어떻게 변화했는지를 사람과 Agent가 활용하게 합니다.",
    "",
    "## 신뢰를 얻는 방식",
    "",
    "- 모든 기록은 공개 Source에 닿아 있습니다.",
    "- 작성자가 날짜가 있는 Note를 승인합니다.",
    "- 시간에 따른 변화가 보입니다.",
    "- 답변은 Authored·Sourced·Inferred·Unknown을 구분합니다.",
    "- 성격이나 고정 Mental Model을 저장하지 않습니다.",
    "- 도출된 관점은 지속 저장하지 않습니다.",
    "",
    "업무는 더 일관되게, 대화는 더 충분한 정보 위에서 하되 사람을 고정하거나 대체하지 마세요.",
    "",
    "## Taste를 업무에 적용하기",
    "",
    "정확한 외부 작업과 대상을 이름 붙이세요. Agent는 관련된 날짜별 기록만 찾고, 조언 성격의 Task Lens를 뒷받침하는 Note를 밝히며, 이름 붙인 대상만 바꾸고 Coffee Chat 지식과 설치된 플러그인 데이터는 건드리지 않습니다.",
    "",
    ...taskPrompt(c.taskUrl),
    "",
    "## 나만의 Coffee Chat 만들기",
    "",
    "```text",
    "공개 레퍼런스 하나 + 날짜가 있는 나의 생각",
    "→ Agent 인터뷰",
    "→ 공개 Preview와 승인",
    "→ 첫 Note와 시계열 그래프",
    "→ Coffee Chat과 작업 활용",
    "```",
    "",
    c.isEngine
      ? "이 중립 엔진에서 별도의 인스턴스를 만드세요. 작성자는 성격 프로필이나 고정 Mental Model을 채우지 않으며, 첫 승인 Note 하나만으로도 질문이나 관련 작업을 바로 지원할 수 있습니다."
      : `${c.profileName}의 기록과는 별개로, [중립 엔진](${ENGINE_REPOSITORY_URL})에서 나만의 Coffee Chat을 만드세요. 작성자는 성격 프로필이나 고정 Mental Model을 채우지 않습니다.`,
    "",
    "주인이 자신의 Agent와 그래프를 쓰는 것이 핵심 반복입니다. 공개 대화와 다른 사람의 신중한 활용은 같은 기록에서 생기는 배포·협업의 반복입니다.",
    "",
    "## 설치, 제거, 기여, 라이선스",
    "",
    c.isEngine
      ? "인스턴스를 만들고 운영하려면 엔진 플러그인을 설치하세요. 반복적인 대화나 작업에는 해당 인물의 인스턴스 플러그인을 설치하세요."
      : "반복적인 Coffee Chat이나 작업에만 이 인스턴스 플러그인을 설치하세요. 설치 없이 URL로 사용하는 경로도 그대로 열려 있습니다.",
    "",
    ...installCommands(c, "ko"),
    "",
    "사용 전 lifecycle 명령을 확인하세요. 호스트 관리자가 알려주지 않는 경로와 세부 사항은 Unknown으로 남습니다.",
    "",
    "재사용 가능한 스키마·방법론·Skill·안전 가드레일은 [엔진](" +
      ENGINE_REPOSITORY_URL +
      ")에 기여하세요. 개인 Note는 작성자가 관리하는 인스턴스에만 둡니다.",
    "",
    "[testing and acceptance](./docs/testing.md)를 확인하세요. 코드·스키마·템플릿·Skill은 [MIT License](./LICENSE)를, Note와 독창적 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따릅니다.",
  ]);
}

export function renderReadmes(
  manifest: Manifest,
): ReadonlyMap<ReadmePath, Buffer> {
  const outputs = new Map<ReadmePath, Buffer>();
  outputs.set("README.md", textBytes(renderEnglish(manifest)));
  outputs.set("README.ko.md", textBytes(renderKorean(manifest)));
  return outputs;
}
