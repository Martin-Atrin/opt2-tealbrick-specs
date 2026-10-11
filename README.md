# opt2-tealbrick-specs

Teal Brick opt2: frozen interface specs (manifest, grants, bridge config, Portal API) and schemas.

**Status: opt2 build (clean-room v2 of Teal Brick), work in progress.** This repository is part of the opt2 build and lives under `Martin-Atrin` during the build; it moves to the Teal Brick organisation as one clean commit when opt2 is released. It is not the current production system.

Owner lane: Lead · Specs & SDK.

## No secrets policy

This repository is public. It must never contain secrets or personal data:

- No API keys, tokens, passwords, private keys, deployment secrets, `.env` files or connection strings. Use `.env.example` with placeholder values only.
- Runtime secrets live in the deployment platform (Railway variables, Woodpecker secrets) and are copied between services without printing them.
- No personal names, private agent configurations or customer data.
- Every push runs a secret scan (`.woodpecker/secret-scan.yaml`, gitleaks). GitHub secret scanning with push protection is enabled. Optional local guard: `pre-commit install`.
- If a secret is committed anyway: rotate it first, then remove it from history.

## CI

Woodpecker CI (shared opt2 pipeline template from `opt2-tealbrick-platform`).

## Language

New code is TypeScript (Node 24+). Swift only where the macOS app requires it.

## Contents

- `docs/` — the frozen opt2 interface specs (v0.1, frozen 2026-10-11; see `docs/FROZEN`). Mirror of the coordination folder; contracts change only through Lead · Specs with a Coordinator decision.
- `packages/spec` — `@opt2-tealbrick/spec`: JSON Schemas (`schemas/`), TypeScript types + data tables (`src/`: manifest vocabularies, credential registry, bridge wire types, route table, SDK signatures), example manifest. Data and types only; logic lives in `@opt2-tealbrick/manifest` (opt2-tealbrick-sdk).

Install by release URL (no npm registry):

```json
"@opt2-tealbrick/spec": "https://github.com/Martin-Atrin/opt2-tealbrick-specs/releases/download/spec-v0.1.0/opt2-tealbrick-spec-0.1.0.tgz"
```
