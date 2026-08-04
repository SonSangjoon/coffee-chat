import type { RepositoryProjection } from "./engine-contracts.ts";

const CHECKOUT = "d23441a48e516b6c34aea4fa41551a30e30af803";
const SETUP_NODE = "a0853c24544627f65ddf259abe73b1d18a591444";
const UPLOAD_PAGES = "7b1f4a764d45c48632c6b24a0339c27f5614fb0b";
const DEPLOY_PAGES = "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e";
const CODEQL = "f205ea1c3313d32999d8d6a48b4f6530d4437b38";

function bytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function ci(): string {
  return `name: Coffee Chat CI

on:
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
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
${role === "instance" ? "  push:\n    branches:\n      - main\n" : ""}
permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
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
    runs-on: ubuntu-latest
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
    runs-on: ubuntu-latest
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
  contents: write

jobs:
  release:
    if: \${{ github.ref == 'refs/heads/main' }}
    name: release
    runs-on: ubuntu-latest
    permissions:
      contents: write
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
          npm test
          npm run typecheck
          npm run format:check
          npm run gitleaks:scan
          npm run site:build
          npm run site:check
          git diff --check
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
        run: gh release create "v\${VERSION}" --verify-tag --title "Coffee Chat v\${VERSION}" --generate-notes
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
