# Coffee Chat

## Purpose / 목적

Coffee Chat is a reusable, knowledge-free engine for public, dated perspective graphs.
Coffee Chat은 공개된 날짜별 관점 그래프를 위한 재사용 가능한 지식 비포함 엔진입니다.

## Create yours / 내 것으로 만들기

Fork this engine, initialize an instance, and write only your own public, dated Notes.
이 엔진을 포크해 인스턴스를 만들고, 자신의 공개된 날짜별 Note만 작성하세요.

## Use an instance / 인스턴스 사용

Open an explicit instance URL, not this generic engine, for a one-time Coffee Chat: `https://github.com/OWNER/coffee-chat-instance`.
일회성 Coffee Chat에는 이 범용 엔진이 아니라 명시적인 인스턴스 URL을 여세요: `https://github.com/OWNER/coffee-chat-instance`.

## Install the engine plugin / 엔진 플러그인 설치

Install the knowledge-free engine plugin when you want its three Skills and shared method; it contains no represented-person data or Notes payload.
Skill 세 개와 공유 방법론이 필요할 때 지식 비포함 엔진 플러그인을 설치하세요. Profile이나 knowledge payload는 포함하지 않습니다.

Codex install / Codex 설치:

```sh
codex plugin marketplace add https://github.com/SonSangjoon/coffee-chat
codex plugin add coffee-chat@coffee-chat-marketplace
```

Codex remove after use / 사용 후 Codex 삭제:

```sh
codex plugin remove coffee-chat@coffee-chat-marketplace
codex plugin marketplace remove coffee-chat-marketplace
```

Claude Code local-scope install / Claude Code local scope 설치:

```sh
claude plugin marketplace add https://github.com/SonSangjoon/coffee-chat --scope local
claude plugin install coffee-chat@coffee-chat-marketplace --scope local
```

Claude Code remove after use / 사용 후 Claude Code 삭제:

```sh
claude plugin uninstall coffee-chat@coffee-chat-marketplace --scope local
claude plugin marketplace remove coffee-chat-marketplace
```

## Contribute to engine / 엔진에 기여

Contribute reusable schemas, methods, and Skills to the engine. Contribute personal Notes only to an instance you control.
재사용 가능한 스키마·방법론·Skill은 엔진에 기여하고, 개인 Note는 본인이 관리하는 인스턴스에만 기여하세요.

### Build the public record / 공개 기록 만들기

Public Sources plus dated thoughts become linked Notes, Sources, and neutral Entities in a temporal knowledge graph.
공개 Source와 날짜가 있는 생각이 서로 연결된 Note·Source·중립 Entity의 시계열 지식 그래프가 됩니다.

### Use the public record / 공개 기록 사용하기

An agent derives a query-scoped Perspective from an instance graph and never writes that synthesis back.
에이전트는 인스턴스 그래프에서 질문별 Perspective를 합성하고 그 해석을 다시 저장하지 않습니다.

Code, schemas, templates, and Skills use the [MIT License](./LICENSE). Downstream authors own their Notes; see the [content terms](./CONTENT_LICENSE.md).
