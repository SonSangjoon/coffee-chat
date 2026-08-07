import type { RepositoryProjection } from "./engine-contracts.ts";

const CHECKOUT = "d23441a48e516b6c34aea4fa41551a30e30af803";
const SETUP_NODE = "a0853c24544627f65ddf259abe73b1d18a591444";
const UPLOAD_PAGES = "7b1f4a764d45c48632c6b24a0339c27f5614fb0b";
const DEPLOY_PAGES = "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e";
const CODEQL = "c4dd10e44af883a891fe31ced449bcb4a6728b9b";
const DEPENDENCY_REVIEW = "a1d282b36b6f3519aa1f3fc636f609c47dddb294";
const ATTEST_BUILD = "96b4a1ef7235a096b17240c259729fdd70c83d45";
const SBOM = "d94f46e13c6c62f59525ac9a1e147a99dc0b9bf5";

function bytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function mergePolicy(): string {
  const protectedFiles = ["AGENTS.md", "package.json", "package-lock.json"];
  const protectedPrefixes = [
    ".github/",
    "tests/e2e/",
    "tools/workflow-projections.ts",
    "tools/ci-policy.mjs",
    "tools/merge-policy.mjs",
    "tools/release-version.ts",
    "tools/gitleaks.ts",
    "tools/artifact-inventory.ts",
    "engine/release.json",
    "docs/engineering/",
  ];
  return `{
  "protectedFiles": ${JSON.stringify(protectedFiles).replaceAll('\",\"', '\", \"')},
  "protectedPrefixes": ${JSON.stringify(protectedPrefixes, null, 2).replace(
    /\n/g,
    "\n  ",
  )}
}`;
}

function ci(): string {
  return `name: Coffee Chat CI

on:
  pull_request:
  merge_group:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: coffee-chat-ci-\${{ github.event.pull_request.number || github.event.merge_group.head_sha || github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

jobs:
  policy:
    name: policy
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - name: Check out repository without persisted credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Set up pinned Node.js
        uses: actions/setup-node@${SETUP_NODE}
        with:
          node-version: 24.5.0
      - name: Verify workflow and merge policy
        run: |
          set -euo pipefail
          while IFS= read -r ACTION; do
            REF="\${ACTION##*@}"
            [[ "$REF" =~ ^[0-9a-f]{40}$ ]] || { echo "Unpinned action: $ACTION" >&2; exit 1; }
          done < <(rg -o '^[[:space:]]*uses:[[:space:]]+[^[:space:]#]+' .github/workflows | sed 's/.*@//')
          DISALLOWED_TRIGGER='pull_request_'target
          ! rg -n -F "$DISALLOWED_TRIGGER" .github/workflows
          SECRET_MARKER="$(printf '\\044{{ secrets.')"
          ! rg -n -F "$SECRET_MARKER" .github/workflows
          for WORKFLOW in .github/workflows/*.yml; do
            rg -q '^permissions:' "$WORKFLOW"
          done
          node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(".github/merge-policy.json","utf8")); if (!Array.isArray(p.protectedFiles) || !Array.isArray(p.protectedPrefixes)) process.exit(1);'
      - name: Classify changed paths
        env:
          BASE_SHA: \${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha || github.event.before }}
          HEAD_SHA: \${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}
        run: |
          set -euo pipefail
          git diff --name-only "$BASE_SHA" "$HEAD_SHA" > "$RUNNER_TEMP/changed-files"
          POLICY="$(< .github/merge-policy.json)"
          while IFS= read -r FILE; do
            [ -z "$FILE" ] && continue
            while IFS= read -r PREFIX; do
              [[ "$FILE" == "$PREFIX"* ]] && echo "protected: $FILE" && exit 0
            done < <(jq -r '.protectedPrefixes[]?' <<<"$POLICY")
            while IFS= read -r EXACT; do
              [ "$FILE" = "$EXACT" ] && echo "protected: $FILE" && exit 0
            done < <(jq -r '.protectedFiles[]?' <<<"$POLICY")
          done < "$RUNNER_TEMP/changed-files"
          echo "auto lane: no protected paths"

  quality:
    name: quality
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - name: Check out repository without persisted credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Set up pinned Node.js
        uses: actions/setup-node@${SETUP_NODE}
        with:
          node-version: 24.5.0
          cache: npm
      - name: Install locked dependencies
        run: npm ci
      - name: Scan repository with verified Gitleaks v8.30.1
        run: node --experimental-strip-types tools/gitleaks.ts scan --mode repository --redact=100
      - name: Run complete test suite
        run: npm test
      - name: Run isolated native host integration gate
        run: npm run test:host
      - name: Type-check source
        run: npm run typecheck
      - name: Verify deterministic graph and projections
        run: |
          npm run cc -- check --snapshot worktree --format json
          npm run cc -- generate --check --format json
      - name: Validate generic plugin and Agent Skills
        run: npm test -- tests/skill-contracts.test.ts tests/task-4-projections.test.ts
      - name: Build documentation-only engine site
        run: npm run site:build
      - name: Verify isolated synthetic instance package
        run: npm test -- tests/fixture-isolation.test.ts
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Verify synthetic instance Pages and accessibility
        run: npm run test:site
`;
}

function codeql(role: "engine" | "instance"): string {
  return `name: CodeQL

on:
  pull_request:
  merge_group:
  push:
    branches:
      - main
  schedule:
    - cron: "17 3 * * 1"
  workflow_dispatch:
permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-24.04
    steps:
      - name: Check out repository without persisted credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: false
      - name: Initialize CodeQL
        uses: github/codeql-action/init@${CODEQL}
        with:
          languages: javascript-typescript
      - name: Analyze with CodeQL
        uses: github/codeql-action/analyze@${CODEQL}
`;
}

function pages(role: "engine" | "instance"): string {
  return `name: Coffee Chat Pages

on:
${role === "instance" ? "  push:\n    branches:\n      - main\n" : ""}  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    name: build
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - name: Check out repository without persisted credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Set up pinned Node.js
        uses: actions/setup-node@${SETUP_NODE}
        with:
          node-version: 24.5.0
          cache: npm
      - name: Install locked dependencies
        run: npm ci
      - name: Verify canonical graph and projections
        run: npm run cc -- check --snapshot worktree --format json
      - name: Build role-aware static site
        run: npm run site:build
      - name: Upload only the Coffee Chat site
        uses: actions/upload-pages-artifact@${UPLOAD_PAGES}
        with:
          path: dist/site
  deploy:
    name: deploy
    needs: build
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy Coffee Chat Pages
        id: deployment
        uses: actions/deploy-pages@${DEPLOY_PAGES}
`;
}

function security(): string {
  return `name: Coffee Chat Security

on:
  pull_request:
  merge_group:
  push:
    branches:
      - main
  schedule:
    - cron: "43 3 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  policy:
    name: security-policy
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - name: Check out repository without persisted credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: false
      - name: Set up pinned Node.js
        uses: actions/setup-node@${SETUP_NODE}
        with:
          node-version: 24.5.0
      - name: Verify workflow and action policy
        run: |
          set -euo pipefail
          while IFS= read -r ACTION; do
            REF="\${ACTION##*@}"
            [[ "$REF" =~ ^[0-9a-f]{40}$ ]] || { echo "Unpinned action: $ACTION" >&2; exit 1; }
          done < <(rg -o '^[[:space:]]*uses:[[:space:]]+[^[:space:]#]+' .github/workflows | sed 's/.*@//')
          DISALLOWED_TRIGGER='pull_request_'target
          ! rg -n -F "$DISALLOWED_TRIGGER" .github/workflows
          SECRET_MARKER="$(printf '\\044{{ secrets.')"
          ! rg -n -F "$SECRET_MARKER" .github/workflows
          for WORKFLOW in .github/workflows/*.yml; do
            rg -q '^permissions:' "$WORKFLOW"
          done
      - name: Scan repository for secrets
        run: node --experimental-strip-types tools/gitleaks.ts scan --mode repository --redact=100

  dependency-review:
    name: dependency-review
    if: \${{ github.event_name == 'pull_request' }}
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      pull-requests: read
    steps:
      - name: Review dependency changes
        uses: actions/dependency-review-action@${DEPENDENCY_REVIEW}
        with:
          fail-on-severity: high
`;
}

function autoMerge(): string {
  return `name: Coffee Chat Auto Merge

on:
  workflow_run:
    workflows:
      - Coffee Chat CI
      - CodeQL
      - Coffee Chat Security
    types:
      - completed

permissions:
  contents: write
  pull-requests: write

jobs:
  enable:
    name: enable-low-risk-squash-auto-merge
    if: \${{ github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-24.04
    steps:
      - name: Evaluate PR metadata without checkout
        env:
          GH_TOKEN: \${{ github.token }}
          REPOSITORY: \${{ github.repository }}
          RUN_SHA: \${{ github.event.workflow_run.head_sha }}
        run: |
          set -euo pipefail
          PR_NUMBER="$(jq -r '.workflow_run.pull_requests[0].number // empty' "$GITHUB_EVENT_PATH")"
          if [ -z "$PR_NUMBER" ]; then exit 0; fi

          PR_JSON="$(gh api "repos/$REPOSITORY/pulls/$PR_NUMBER")"
          HEAD_SHA="$(jq -r '.head.sha' <<<"$PR_JSON")"
          HEAD_REPOSITORY="$(jq -r '.head.repo.full_name // empty' <<<"$PR_JSON")"
          if [ "$HEAD_SHA" != "$RUN_SHA" ] || [ "$HEAD_REPOSITORY" != "$REPOSITORY" ]; then exit 0; fi

          POLICY="$(gh api "repos/$REPOSITORY/contents/.github/merge-policy.json?ref=main" --jq '.content' | tr -d '\\n' | base64 --decode)"
          mapfile -t FILES < <(gh api --paginate "repos/$REPOSITORY/pulls/$PR_NUMBER/files" --jq '.[].filename')
          for FILE in "\${FILES[@]}"; do
            [ -z "$FILE" ] && continue
            while IFS= read -r PREFIX; do
              if [[ "$FILE" == "$PREFIX"* ]]; then exit 0; fi
            done < <(jq -r '.protectedPrefixes[]?' <<<"$POLICY")
            while IFS= read -r EXACT; do
              if [ "$FILE" = "$EXACT" ]; then exit 0; fi
            done < <(jq -r '.protectedFiles[]?' <<<"$POLICY")
          done

          CHECKS="$(gh pr checks "$PR_NUMBER" --repo "$REPOSITORY" --required --json name,state,bucket)"
          if ! jq -e 'length > 0 and all(.[]; .state == "SUCCESS" and .bucket == "pass")' <<<"$CHECKS" >/dev/null; then exit 0; fi
          gh pr merge "$PR_NUMBER" --repo "$REPOSITORY" --auto --squash --match-head-commit "$HEAD_SHA"
`;
}

function release(): string {
  return `name: Coffee Chat Release

on:
  workflow_dispatch:
    inputs:
      release_date:
        description: UTC release date in YYYY-MM-DD form (optional)
        required: false
        type: string

permissions:
  contents: read

jobs:
  release:
    if: \${{ github.ref == 'refs/heads/main' }}
    name: release
    runs-on: ubuntu-24.04
    permissions:
      contents: write
      id-token: write
      attestations: write
    environment:
      name: release
    steps:
      - name: Check out repository with release credentials
        uses: actions/checkout@${CHECKOUT}
        with:
          persist-credentials: true
          fetch-depth: 0
      - name: Set up pinned Node.js
        uses: actions/setup-node@${SETUP_NODE}
        with:
          node-version: 24.5.0
          cache: npm
      - name: Install locked dependencies
        run: npm ci
      - name: Resolve UTC CalVer
        id: calver
        env:
          RELEASE_DATE: \${{ inputs.release_date }}
        run: |
          if [ -n "$RELEASE_DATE" ]; then
            VERSION="$(node --experimental-strip-types tools/release-version.ts calver --date "$RELEASE_DATE")"
          else
            VERSION="$(node --experimental-strip-types tools/release-version.ts calver)"
          fi
          if git rev-parse --verify "refs/tags/v\${VERSION}" >/dev/null 2>&1; then
            echo "Release tag already exists: v\${VERSION}" >&2
            exit 1
          fi
          echo "version=\${VERSION}" >> "$GITHUB_OUTPUT"
      - name: Prepare CalVer source
        env:
          VERSION: \${{ steps.calver.outputs.version }}
        run: node --experimental-strip-types tools/release-version.ts prepare --version "$VERSION"
      - name: Generate release projections
        run: npm run cc -- generate
      - name: Verify release
        run: |
          npm run cc -- check --snapshot worktree --format json
          npm run cc -- generate --check --format json
          npm run test:all
          npm run typecheck
          npm run format:check
          npm run gitleaks:scan
          npm run site:build
          npm run site:check
          git diff --check
      - name: Create release archive
        env:
          VERSION: \${{ steps.calver.outputs.version }}
        run: |
          mkdir -p dist/release
          tar -czf "dist/release/coffee-chat-\${VERSION}.tar.gz" \\
            --exclude='./.git' \\
            --exclude='./node_modules' \\
            --exclude='./dist' \\
            .
      - name: Generate CycloneDX release SBOM
        uses: anchore/sbom-action@${SBOM}
        with:
          path: .
          format: cyclonedx-json
          output-file: dist/release/coffee-chat-\${{ steps.calver.outputs.version }}.sbom.json
      - name: Attest release archive
        uses: actions/attest-build-provenance@${ATTEST_BUILD}
        with:
          subject-path: dist/release/coffee-chat-\${{ steps.calver.outputs.version }}.tar.gz
      - name: Attest release SBOM
        uses: actions/attest-build-provenance@${ATTEST_BUILD}
        with:
          subject-path: dist/release/coffee-chat-\${{ steps.calver.outputs.version }}.sbom.json
      - name: Commit and tag release
        env:
          VERSION: \${{ steps.calver.outputs.version }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "Publishing the existing CalVer baseline v\${VERSION}."
          else
            git commit -m "chore(release): v\${VERSION} [skip ci]"
          fi
          git tag -a "v\${VERSION}" -m "Coffee Chat v\${VERSION}"
      - name: Push commit and tag
        env:
          VERSION: \${{ steps.calver.outputs.version }}
        run: |
          git push origin HEAD:main
          git push origin "v\${VERSION}"
      - name: Create GitHub Release
        env:
          GH_TOKEN: \${{ github.token }}
          VERSION: \${{ steps.calver.outputs.version }}
        run: gh release create "v\${VERSION}" "dist/release/coffee-chat-\${VERSION}.tar.gz" "dist/release/coffee-chat-\${VERSION}.sbom.json" --verify-tag --title "Coffee Chat v\${VERSION}" --generate-notes
`;
}

export function renderRoleWorkflows(
  role: "engine" | "instance",
): RepositoryProjection {
  const outputs: RepositoryProjection["outputs"] = [
    { path: ".github/workflows/ci.yml", bytes: bytes(ci()), mode: "100644" },
    {
      path: ".github/workflows/codeql.yml",
      bytes: bytes(codeql(role)),
      mode: "100644",
    },
    {
      path: ".github/workflows/pages.yml",
      bytes: bytes(pages(role)),
      mode: "100644",
    },
    {
      path: ".github/workflows/security.yml",
      bytes: bytes(security()),
      mode: "100644",
    },
    {
      path: ".github/workflows/auto-merge.yml",
      bytes: bytes(autoMerge()),
      mode: "100644",
    },
    {
      path: ".github/merge-policy.json",
      bytes: bytes(mergePolicy()),
      mode: "100644",
    },
  ];
  if (role === "engine")
    outputs.push({
      path: ".github/workflows/release.yml",
      bytes: bytes(release()),
      mode: "100644",
    });
  return {
    outputs,
    deletions: [],
  };
}
