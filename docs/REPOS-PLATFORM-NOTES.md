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
- Already adopted and pushed: specs, sdk (conformance on), qa, packages, platform.
- Lead to adopt (repo already has lead commits; Platform did not touch it): knowledge, connect, bridge, portal-core, portal-gui, website, tbd. Command:
  `cd /Users/puma/work/active/tealbrick-opt2/opt2-tealbrick-platform && node ci/tb-ci.ts adopt ../opt2-tealbrick-<name> --kind <miniapp|bridge|portal|web|desktop>` then edit `tealbrick-ci.json` (images, paths) and commit. It deletes `.woodpecker/secret-scan.yaml` (the template has that step).
- Package rules: `"private": true` everywhere, lockfile committed, root scripts `typecheck lint test` (+ `conformance` for miniapp/bridge, + `build` in pnpm workspaces); no `tealbrick`/`@tealbrick/*` deps.
- Woodpecker activation of the repos is pending (Platform QUESTIONS Q1); until then CI does not run on push. Local check: `CI_WORKSPACE=$PWD TB_CI_REF=ci-v2 node ../opt2-tealbrick-platform/ci/tb-ci.ts setup` in your repo.
- Images: `ghcr.io/martin-atrin/opt2-tealbrick-<name>[-<component>]`, public. No npm publishing; cross-repo packages = GitHub release tarball URLs (REPOS.md §5).
