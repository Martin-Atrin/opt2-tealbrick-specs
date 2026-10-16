# Tealbrick specs: architecture

State: verified against the repo on 2026-10-17. Claims cite paths in this repo. Anything not verified is marked UNVERIFIED. For the whole system see `engineering/ARCHITECTURE.md` and `engineering/SYSTEM-OVERVIEW.md` in the private repo `Tealbrick/opt2-tealbrick-docs`.

## 1. What lives here

- **Route table** (`routes.ts`): the source of truth for every Portal operation. Core builds its router, validators, rate limits and audit hooks from it. Core serves it at `GET /internal/routes`. The GUI generates its one gateway from it. The owner CLI and the fake Portal are generated from it. An operation without a row is unreachable (default deny). Type-level invariants RT1 to RT8 are compiled into the file (owner-CLI rows are reads and drafts only, draftable rows are browser mutations, internal exposure only under `/internal`, idempotent rows never skip body logging, no code, ticket or token fields in owner-CLI outputs).
- **Admin table** (`admin.ts`): a separate table, not in `ROUTES`, not in `/internal/routes`, not in the digest. Served only on Core's admin listener.
- **Credentials** (`credentials.ts`): `TYP` values, claim sets, lifetimes, opaque prefixes, refusal codes, and the Portal root keys. `PORTAL_ROOT_KEYS` has two dev public keys and an EMPTY `prod` array until the cutover ceremony.
- **Vocabularies** (`manifest.ts`): hold families, `DEFAULT_HELD_FAMILIES` (destructive, money, first_contact, identity), effects, standard operations (11), wildcard companion rule.
- **Schemas**: manifest, workspace config, instance slice.

## 2. Frozen decisions that code depends on

Ids `<prefix>_<ULID>`. Audience `tb:<kind>:<id>`. Ed25519 JWS, RFC 8785 canonical JSON, `sha256:<hex>` digests, AES-256-GCM sealing. Thirteen credential kinds (K1 to K12 and K2b). One grant format for agent to app and app to app (`crud`, `mode`, `held`, `caps`, `wf`, 12 hour life). Three call-proof variants (op, hook, bridge op). Hold verdict claim `hv {f, r, by}`. Hook response contract and order. Error envelope `{error:{code, message, requestId, details?}}`. Manifest schema `tealbrick.miniapp/2`, config `v: 1`, API base `/api/v1`. The root channel is a build constant (dev builds pin `dev`, stable builds pin only `prod`), never an environment variable.

Spec 0.1.39 (additive; C213 US-1 to US-4): `AppStatus` and `Health` gain `schemaVersion {app, sdk}`, `minCompatibleCode`, `preUpdateSnapshot` and `failure` (`BootFailure {phase, code, reason?, file?, at}`, `FailedHealth`, `BOOT_FAILURE_ATTENTION`); `StatusReport.apps[]` gains `schemaVersion`, `minCompatibleCode`, `failure`; `Instance` gains `lastUpdate` and `updating`; error codes `update_rolling_back`, `update_rolled_back`, `rollback_failed`, `rollback_needs_restore`; `BackupMeta` gains `kind: "preupdate"`, `fromVersion`, `toVersion`, `schema`. SDK-API section 7.3a describes the upgrade-safe boot.

Hold view binding (SDK-API section 4.6, spec 0.1.35): `DynamicHandlers.holdView`, `viewSha256`, fail closed on an unreadable view.

## 3. Change process

Contracts change only through the specs lead and a recorded decision. Additive within a minor; breaking only in a major with both versions served during a deprecation window and conformance pinned per version (C207 point 3). Request changes by appending to `docs/REQUESTS.md`. Readers tolerate unknown values that cannot widen access; writers stay strict (L24).

## 4. Consumers

Direct pins of `@opt2-tealbrick/spec` on 2026-10-17: 0.1.39 in portal-core, bridge (`packages/bridge`, `packages/bridge-server`), connect, knowledge and evolution; 0.1.38 in portal-gui and admin; 0.1.35 in miniapp-sdk; 0.1.31 in conformance; 0.1.28 in the cli repo (cli, relay, harnesses) and in the bridge repo's `packages/cli` and `packages/harness-claude`; 0.1.27 in manifest; 0.1.20 in platform; 0.1.7 in qa and 0.1.2 in tbd (both very old). Apps that do not pin it directly (fleet, inbox, kanban, rules, samples) get it through miniapp-sdk.

## 5. Known gaps

- `docs/PORTAL-API.md` says "100 rows"; the table has 105. `docs/SDK-API.md` says 10 standard operations; the code has 11.
- `sdk.ts` does not declare `onStop`, `jobs` or `schedule` (documented SPEC-GAP in SDK-API section 19; the SDK defines them locally).
- `PORTAL_ROOT_KEYS.prod` is empty.
- `docs/` and the coordinator's local `coordination/specs` copies differ (BRIDGE, CONFORMANCE, CORE, PORTAL-API, RELEASES, REQUESTS and SDK-API, compared 2026-10-17).
- `docs/PORTAL-API.md` (Agent Policy and C105 notes) lists three default held families (`destructive`, `money`, `first_contact`); `DEFAULT_HELD_FAMILIES` in `manifest.ts` has four (plus `identity`).
- Spec 0.1.39 exports only types for the upgrade-safety members, plus the `BOOT_FAILURE_ATTENTION` constant (no runtime phase list, no validators, no JSON Schema). The bridge keeps local shape checks typed against them.
- N12 (licence per major) is closed in the decision log (a lifetime licence covers the major bought), but `docs/FROZEN`, `docs/CORE.md` and `docs/PORTAL-API.md` still say it waits on the owner.
- Licence: `package.json` declares MIT and no `LICENSE` file exists in the repo or the package, while decision C191 sets the Tealbrick SDK Licence (see README).