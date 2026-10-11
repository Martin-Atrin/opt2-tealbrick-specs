# opt2 repos — Lead · Platform notes

Created 2026-10-11 by Lead · Platform. All PUBLIC under GitHub user Martin-Atrin, topic `tealbrick-opt2`.
Each repo: README (opt2 status + no-secrets policy), `.gitignore` (blocks .env*, keys, build output), `.woodpecker/secret-scan.yaml` (gitleaks on push/PR), `.pre-commit-config.yaml` (optional local gitleaks). GitHub secret scanning + push protection: enabled on all 12.
Final split stays Lead · Specs's call in `specs/REPOS.md`; Platform creates any extra repo on request (append to `specs/REQUESTS.md`).

Local working trees: `/Users/puma/work/active/tealbrick-opt2/opt2-tealbrick-<name>` (one convention: folder = repo name).

| Repo | URL | Owner lane | Local folder state |
|---|---|---|---|
| opt2-tealbrick-specs | https://github.com/Martin-Atrin/opt2-tealbrick-specs | Specs & SDK | cloned |
| opt2-tealbrick-sdk | https://github.com/Martin-Atrin/opt2-tealbrick-sdk | Specs & SDK | cloned |
| opt2-tealbrick-bridge | https://github.com/Martin-Atrin/opt2-tealbrick-bridge | Bridge & Harness | cloned |
| opt2-tealbrick-portal-core | https://github.com/Martin-Atrin/opt2-tealbrick-portal-core | Portal Core | cloned |
| opt2-tealbrick-portal-gui | https://github.com/Martin-Atrin/opt2-tealbrick-portal-gui | Portal GUI | cloned |
| opt2-tealbrick-website | https://github.com/Martin-Atrin/opt2-tealbrick-website | Docs & Website | lead's own folder (git init, no commits yet); `origin` added. Lead: `git pull origin main --allow-unrelated-histories` (or rebase onto origin/main) before first push. |
| opt2-tealbrick-knowledge | https://github.com/Martin-Atrin/opt2-tealbrick-knowledge | Knowledge | cloned |
| opt2-tealbrick-connect | https://github.com/Martin-Atrin/opt2-tealbrick-connect | Connect | cloned |
| opt2-tealbrick-tbd | https://github.com/Martin-Atrin/opt2-tealbrick-tbd | TBD Desktop | lead's own folder WITHOUT git; untouched. Lead: `git init -b main && git remote add origin https://github.com/Martin-Atrin/opt2-tealbrick-tbd.git && git pull origin main --allow-unrelated-histories` after the secret check. |
| opt2-tealbrick-platform | https://github.com/Martin-Atrin/opt2-tealbrick-platform | Platform | cloned |
| opt2-tealbrick-packages | https://github.com/Martin-Atrin/opt2-tealbrick-packages | Portal GUI (ui) · Bridge & Harness (buzz, avm) | cloned; CI ci-v2 adopted |
| opt2-tealbrick-qa | https://github.com/Martin-Atrin/opt2-tealbrick-qa | Adversarial QA | cloned |

Remote `main` of every repo holds one initial commit (README, .gitignore, secret scan). Keep those files; extend the README.

## CI standard (template ci-v2) — every lead: adopt it
- Standard + runner: `opt2-tealbrick-platform/ci/` (read `ci/README.md`). One pipeline: secret-scan, setup (template drift, `tealbrick-ci.json`, package rules, `@opt2-tealbrick/*` URL-dependency check), install, typecheck, lint, unit, conformance, build, kaniko image-check; on `v*` tags image-publish to `ghcr.io/martin-atrin/<image>` + signed release record → release registry; on `<package>-v<ver>` tags a tarball per package on the GitHub release.
- Current template: `ci-v3` (adds the pinned manifest package for signed release records). Repos on ci-v2 keep working; re-run `adopt` to move to ci-v3 (needed only by repos that publish images: knowledge, connect, bridge, portal-core, portal-gui).
- Adopted on main (2026-10-11 ~19:45): specs, sdk, qa, packages, platform, bridge, connect. NOT yet: knowledge, portal-core, portal-gui, website, tbd.
- Woodpecker is LIVE for all 12 repos (2026-10-11 ~20:20): every push to main and every PR runs the pipeline. Fork PRs need approval.
- Lead to adopt (repo already has lead commits; Platform did not touch it): knowledge, connect, bridge, portal-core, portal-gui, website, tbd. Command:
  `cd /Users/puma/work/active/tealbrick-opt2/opt2-tealbrick-platform && node ci/tb-ci.ts adopt ../opt2-tealbrick-<name> --kind <miniapp|bridge|portal|web|desktop>` then edit `tealbrick-ci.json` (images, paths) and commit. It deletes `.woodpecker/secret-scan.yaml` (the template has that step).
- Package rules: `"private": true` everywhere, lockfile committed, root scripts `typecheck lint test` (+ `conformance` for miniapp/bridge, + `build` in pnpm workspaces); no `tealbrick`/`@tealbrick/*` deps.
- Local check before pushing: `CI_WORKSPACE=$PWD TB_CI_REF=ci-v2 node ../opt2-tealbrick-platform/ci/tb-ci.ts setup` in your repo.
- Images: `ghcr.io/martin-atrin/opt2-tealbrick-<name>[-<component>]`, public. No npm publishing; cross-repo packages = GitHub release tarball URLs (REPOS.md §5).

## Deploying to Railway "opt2" (C32) — every lead
- Standard path: Railway builds the service from its PUBLIC GitHub repo at a PUSHED commit SHA (no Railway GitHub app needed). One command from the platform tree:
  ```sh
  cd /Users/puma/work/active/tealbrick-opt2/opt2-tealbrick-platform
  node ops/railway-deploy.ts --service <portal-core|portal-gui|website> --repo opt2-tealbrick-<name> --sha <full 40-char sha on origin/main> [--dockerfile <path>] [--root <dir>]
  ```
  It refuses a SHA that is not on GitHub, sets `RAILWAY_DOCKERFILE_PATH`, points the service source at the repo and deploys exactly that commit (`serviceInstanceDeployV2(commitSha)`). Record the SHA in your STATUS deploy note. Verified 2026-10-11 on service db-backup (platform@ac202e3, build SUCCESS).
- Fallback only (Railway API down): `railway up --detach -p 15297ce5-0283-4901-a408-9c802e6ac53a -e production -s <service> -m "deploy <sha>"` from a clean tree whose HEAD equals origin/main.
- Ask Platform for a new service; do not create services yourself.
- Health checks set on Railway: portal-core `GET /internal/health` (spec `system.health`; Core scaffold currently serves `/healthz`: serve the spec path or the deploy fails), website `/`. portal-gui: tell Platform your health path.
- Errors: `SENTRY_DSN` + `SENTRY_ENVIRONMENT=opt2` are set on portal-core and portal-gui (GlitchTip, server-side PII scrubbing on). Use them; never log tokens, codes or bodies.
- Customer workspaces (opt2-test-customer) get only releases from the signed index (registry/README.md), never `railway up`.
