# REPOS — repositories, packages, dependency direction

Status: v0.1, Lead · Specs, 2026-10-11 (agreed inputs from Lead · Platform: `REPOS-PLATFORM-NOTES.md`, REQUESTS `## platform`).

## 1. Rules
- Every repo is PUBLIC under GitHub user **Martin-Atrin**, named `opt2-tealbrick-<name>`. Never the Tealbrick org (migration there is one clean commit at release). Never push to v1 repos.
- Local working tree = repo name: `/Users/puma/work/active/tealbrick-opt2/opt2-tealbrick-<name>` (one tree per repo). Existing short folders (`sdk/`, `bridge/`, …) are renamed or removed by their owner lane before first push.
- No secrets, no personal data, no home-infrastructure names in any repo (secret scan in CI; GitHub push protection on).
- TypeScript only (Node 24+, type stripping for scripts/tests; `tsc --noEmit` typecheck). Exceptions: Swift in `-tbd` (macOS app); config files a tool requires as JS. No `.js`/`.mjs` sources.
- No vendored upstream code (GBrain, Open Notebook: pinned images by digest), no committed build output, no inline third-party specs (the Connect catalog is a sha256-pinned release artifact).
- Frozen specs change only through Lead · Specs with a Coordinator decision (append to `coordination/specs/REQUESTS.md`).

## 2. Repos and packages (each package lives in exactly one repo)
| Repo | Owner lane | Packages / deployables | Notes |
|---|---|---|---|
| opt2-tealbrick-specs | Specs & SDK | `@opt2-tealbrick/spec` (data only: JSON Schemas, `types/*.ts`, route table, the shared vocabularies — re-exported by `manifest`) + the spec markdown | Mirrors `coordination/specs/` at freeze; tag `spec-v<semver>` |
| opt2-tealbrick-sdk | Specs & SDK | `@opt2-tealbrick/manifest` (validator, digest, JCS, JWS, key sets, `verifyGrant`/`gate`/`authorize`, vocabularies), `@opt2-tealbrick/miniapp-sdk` (server + client), `create-tealbrick-miniapp` (template), `@opt2-tealbrick/conformance` (checks + fake Portal + fake bridge) | The only owner of crypto/canonical primitives |
| opt2-tealbrick-bridge | Bridge & Harness | `@opt2-tealbrick/bridge` (core, both forms), `bridge-server` (deployed Docker image `ghcr.io/martin-atrin/opt2-tealbrick-bridge`), `tealbrick` CLI (owner mode, agent mode, local relay), `@opt2-tealbrick/harness-claude`, `@opt2-tealbrick/harness-eve` | Eve code only in harness-eve |
| opt2-tealbrick-packages | Portal GUI (ui) · Bridge & Harness (buzz, avm) | `@opt2-tealbrick/ui` (design system + app shell component), `@opt2-tealbrick/buzz` (with voice), `@opt2-tealbrick/avm` | NEW repo — Lead · Platform creates it (REQUESTS) |
| opt2-tealbrick-portal-core | Portal Core | Core service (JSON API, private) | Imports `@opt2-tealbrick/spec` + `@opt2-tealbrick/manifest` only |
| opt2-tealbrick-portal-gui | Portal GUI | GUI service + generated gateway | No app code, no app list; imports spec (routes), ui |
| opt2-tealbrick-website | Docs & Website | static Astro site | No Portal code; own deploy |
| opt2-tealbrick-knowledge | Knowledge | app service (+ `tb-exec` wrapped engine images), per-app kit package generated from its manifest | Built on miniapp-sdk |
| opt2-tealbrick-connect | Connect | app service, catalog artifact (release asset), per-app kit | Built on miniapp-sdk |
| opt2-tealbrick-tbd | TBD Desktop | macOS app (Swift) + its agent runtime (TS, Claude Agent SDK via harness-claude) | Free; GitHub releases; no GPL code beyond the accepted STT rewrite risk recorded in DECISION-LOG |
| opt2-tealbrick-platform | Platform | ONE Woodpecker pipeline template, release registry (signed index, outside any image), environment/ops docs | Release registry is read by Core at run time |
| opt2-tealbrick-qa | Adversarial QA | acceptance tests (Playwright, scenario tests) | Release evidence lives here, not in builder repos |

PRD §9 package check: manifest, miniapp-sdk, create-tealbrick-miniapp, conformance → `-sdk`; bridge, bridge-server, tealbrick CLI, harness-claude, harness-eve → `-bridge`; buzz, avm, ui → `-packages`. Each exactly once.

## 3. Dependency direction (acyclic; CI rejects a reverse import)
```
@opt2-tealbrick/spec  ◄── manifest ◄── miniapp-sdk ◄── knowledge, connect, create-tealbrick-miniapp
        ▲                   ▲   ▲            ▲
        │                   │   └── bridge ◄─┴── tealbrick CLI, harness-claude, harness-eve
        │                   │
   portal-core ─────────────┘        (Core imports spec + manifest ONLY; never miniapp-sdk, bridge, ui)
   portal-gui ── spec (routes), ui
   conformance ── spec, manifest ONLY (fake Portal + fake bridge are generated from spec; S12 — no import of miniapp-sdk or bridge, no repo cycle)
   ui ◄── miniapp-sdk/client (app shell), portal-gui, tbd (optional)
   buzz ◄── connect
```
- Nothing depends on an app repo. Core holds no copy of any package.
- `ui` depends on nothing of ours.

## 4. Monorepo layout and toolchain (multi-package repos: specs, sdk, bridge, packages)
- pnpm workspaces, Node 24, `packages/<name>/` each with its own `package.json`; root scripts required by the CI template: `pnpm typecheck | lint | test | conformance | build`.
- Packages are written in TypeScript and shipped COMPILED (`dist/*.js` + `.d.ts`) because Node does not strip types inside `node_modules`. `dist/` is build output: never committed.

## 5. Cross-repo distribution (no npm publish)
- Scope **`@opt2-tealbrick/*`**. These names are NOT published to any registry (no npm publish is allowed in opt2) and are deliberately different from v1's `tealbrick` / `@tealbrick/*` names, so a stray registry lookup can never pull v1 code.
- Each release of a multi-package repo attaches one `npm pack` tarball per package to a GitHub Release (tag `<package>-v<semver>`, e.g. `manifest-v0.1.0`). Consumers depend by URL:
  `"@opt2-tealbrick/manifest": "https://github.com/Martin-Atrin/opt2-tealbrick-sdk/releases/download/manifest-v0.1.0/opt2-tealbrick-manifest-0.1.0.tgz"`.
  Public, no auth, works with pnpm/npm, ships built `dist/`. (Plain git deps would need a build at install and do not handle sub-packages well.)
- CI check (template): every `@opt2-tealbrick/*` dependency must be a GitHub-release URL; a registry version string fails the build.
- Container images: `ghcr.io/martin-atrin/opt2-tealbrick-<repo>[-<component>]`, public, referenced by digest in release records.
- Release records (product, version, manifest digest, image digest, channel) go to the signed release registry in `-platform`; the bridge is a release there too (kind `bridge`).

## 6. Requests to Lead · Platform (also appended to REQUESTS.md)
1. Create `opt2-tealbrick-packages` (public, same baseline as the others).
2. CI template: pnpm workspaces root scripts (§4), tarball-per-package release job (§5), the `@opt2-tealbrick/*` URL-dependency check, conformance stage.
