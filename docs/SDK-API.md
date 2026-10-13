# SDK-API — manifest package, Miniapp SDK (server + client), app template

Status: v0.1, Lead · Specs, 2026-10-11. Types: `types/sdk.ts` (declarations only). Authority: PRD-V2 > DECISION-LOG > CORE.md > this file.

Scope: the public surface of three packages in `opt2-tealbrick-sdk` (REPOS.md): `@opt2-tealbrick/manifest` (contract primitives, the only owner of crypto/canonical code and of the decision functions), `@opt2-tealbrick/miniapp-sdk` (server runtime + React client), and `create-tealbrick-miniapp` (template). It defines what an app author writes (handlers by operation id), what the SDK derives from the manifest (routes, OpenAPI, status, standard ops), and how an app talks to its four sides: Portal (claim and slices, always via the bridge), the harness (operations, holds, receipts), other apps (companion calls via the bridge), and the person (launch sign-in, app shell). Wire formats of the bridge (claim, slice, keys, call) are owned by BRIDGE.md; credential claims by CREDENTIALS.md; manifest fields by MANIFEST.md + `manifest.schema.json`. This file only says how the SDK uses them. No grantless path uses a hook-style proof: bridge-only calls use the bridge-op proof (C16 B5).

## 1. Rules (normative)
1. The manifest is the only source. An app registers handlers by operation id; the SDK derives routes, input/output validation, OpenAPI, MCP-relevant metadata, status, standard ops and the generated kit. A hand-written route table, OpenAPI file, operations list, status route, or claim route beside the manifest is a conformance failure (D110).
2. Every primitive (JCS, digest, JWS sign/verify, key sets, ticket/grant/proof verification, `verifyGrant`/`gate`/`authorize`, vocabularies) lives in `@opt2-tealbrick/manifest` only. The SDK, bridge, Core and conformance import it. A second implementation anywhere is a CI failure (CORE §3).
3. One mechanism per concern inside the SDK: one store (SQLite on `TB_DATA_DIR`), one receipts table (holds are receipt rows), one migration runner, one idempotency mechanism, one person sign-in module, one claim path, one env name per setting, one backup format and one export format (§7.3). Apps do not re-implement any of them (D105–D114).
4. No governance modes in the SDK beyond CORE §7 (`free|bound`, held families, caps). Rules/Fleet attach only through manifest hooks served by `defineApp({ hooks })`. No standing grants (C8). No `$file`/binary inputs (C11).
5. Nothing forward-declared: every export listed here ships in P1 and has a conformance check (CONFORMANCE A1–A9). No release-tag comments in code.
6. No product id in SDK or manifest-package source (CONFORMANCE M5). Product ids reach code only as manifest data.

## 2. `@opt2-tealbrick/manifest` (pure, no network; synchronous except WebCrypto key/sign calls and the CI-only `validateAppFiles`; no runtime deps beyond a vetted Ed25519/SHA-256 implementation)
| Export | Signature (see `types/sdk.ts` §A) | Notes |
|---|---|---|
| `validateManifest(json)` | `→ { ok: true, manifest } \| { ok: false, errors[] }` | schema + MANIFEST cross-field rules; used by Core Manifest Store, SDK boot, bridge, conformance |
| `manifestDigest(manifest)` | `→ "sha256:<hex>"` | digest of JCS bytes |
| `validateCompanions(manifest, targets)` / `validateAppFiles(manifest, repoDir)` | `→ ManifestValidation` | MANIFEST §13; `validateAppFiles` (CI, CLI) is the only export that reads files |
| `canonicalize(value)` | `→ string` | RFC 8785; rejects NaN/Infinity/bigint/undefined |
| `digest(value)` | `→ "sha256:<hex>"` | of `canonicalize(value)` bytes |
| `withStandardOps(manifest)` | `→ OperationView[]` | manifest ops + the agent/person standard ops (§6); the one list bridge and SDK use |
| `generateKeyPair()`, `thumbprint(jwk)` | Ed25519; `kid` = RFC 7638 | key generation is the only randomness-using export |
| `signJws(typ, claims, key)` / `verifyJws(token, keySet, expect)` | compact JWS, `alg: EdDSA` | `expect` = `{ typ, aud, iss[], now, maxLifetimeS }`; foreign/missing `typ`/`aud` → refusal (no warn path) |
| `KeySet` helpers: `keySetFrom(jwks, issuer)` | | the trusted Portal set comes only from a root-signed key-set statement (CORE §4; `keySetAnnounce` removed in 0.1.26, C133) |
| `verifyGrant(token, ctx)` | `→ VerifiedGrant \| Refusal` | CORE §7; K10 `tb-grant+jwt` |
| `verifyCallProof(token, ctx, bind)` / `verifyHookProof(token, ctx, bind)` | `→ VerifiedCallProof \| Refusal` | `TB-Call` (`typ tb-call+jwt`, CREDENTIALS §10): `aud`, `call`, `gjti`, `op` / `hook`+`phase`, `in`, `ctx`, ≤ 60 s |
| `verifyBridgeOpProof(token, ctx, bind)` | `→ VerifiedCallProof \| Refusal` | third `tb-call+jwt` variant `CallProofBridgeOpClaims { call, bop: catalog \| resolve \| mark \| scope_summary, op?, in? }` (types/credentials.ts; bridge key, `aud` = own instance, ≤ 60 s) for the grantless bridge-only calls (§3.2, C16 B5) |
| `verifyTicket(token, ctx)` | `→ VerifiedTicket \| Refusal` | K11 `tb-ticket+jwt`; SDK accepts only `pur: launch` |
| `verifySlice(token, ctx)` / `verifyConfig(token, ctx)` | | K9 `tb-slice+jws` / `tb-config+jws` |
| `signInstanceAssertion(input)` | → compact JWS | instance assertion for header `TB-Assert` (`typ tb-instance-assert+jwt`, `htm`, `htu`, `bd`; CREDENTIALS §10) |
| `renderSkill(skill, vars)` | `→ string` | the ONE skill renderer (N6): fills `{{agent.*}}`, `{{workspace.name}}`, `{{settings.*}}`, `{{scope.*}}`; used by Core (bundle) and bridge (per agent) |
| `gate(input)` | `→ { decision: "pass" \| "refuse", reason }` | bridge only (CORE §7) |
| `authorize(input)` | `→ { decision: "run" \| "hold" \| "refuse", reason, holdFamily? }` | app SDK only (CORE §7); exact input in `types/sdk.ts` `AuthorizeInput` |
| Vocabularies | re-exported from `types/manifest.ts` (`CRUD_ACTIONS`, `EFFECTS`, `HOLD_FAMILIES`, `AGENT_MODES`, `STANDARD_OPERATIONS`, …) and `types/credentials.ts` (`TYP`, `PROOF_HEADER`); owned here: `RECEIPT_STATUSES`, `SDK_AUDIT_ACTIONS` | declared once; Core stores values, holds no literals |

`authorize()` order (CORE §7 + I1, restated so this file is checkable): (0) the latest slice marks the workspace, the instance or the calling agent paused → refuse `paused`; (1) `verifyGrant` again; (2) `op.crud ⊆ grant.crud ∩ access.crud` (when the op has a `scopeType`) → else refuse `scope_denied`; (3) `op.effect === "money"` or `op.holdFamily ∈ grant.held` → hold, unless `approval = "approved"` for this exact call (§4.3); (4) Free caps: for the op's effect, `usage[effect] ≥ grant.caps[effect].max` → hold `caps` (I14: `caps: { write?, outward?, destructive? }`, each `{ max, per: "hour" | "day" }`; the SDK counts this caller's receipts with status `run` or `approved` and that effect over a sliding window of `per`; `money` has no cap, it is always held); (5) run. Pure: the SDK passes `now`, trust context, resolved access and counters in; nothing is read inside.

## 3. Server: `defineApp` and `startApp`
```ts
const app = defineApp({ manifest, handlers, hooks?, dynamic?, publicRoutes?, migrations, backup?, events?, auditActions? });
await startApp(app, process.env);
```
| Field | Required | Content |
|---|---|---|
| `manifest` | yes | parsed manifest JSON; `startApp` re-validates and refuses to boot on error |
| `handlers` | yes | `{ [opId]: Handler \| { run, scope?, redact?, holdView? } }`; exactly one per manifest operation (non-`dynamic`); extra or missing ids → boot error |
| `hooks` | iff manifest `hooks[]` | `{ [hookId]: HookHandler }` (before / context / after per CORE §8) |
| `dynamic` | iff an op has `dynamic` | `{ [opId]: { catalog(q, ctx), resolve(tool, ctx), call(tool, input, ctx) } }` |
| `publicRoutes` | iff manifest `publicRoutes[]` | `{ [path]: PublicHandler }`; the app verifies state / provider signature itself |
| `migrations` | yes | directory path (§7.1) |
| `backup` | no | `{ beforeBackup?(), afterRestore?() }` quiesce hooks; what to back up comes from manifest `backups` |
| `events` | no | `{ agentAdded?(agent, ctx), agentRemoved?(agent, ctx), keysChanged?(names, ctx) }` |
| `auditActions` | no | typed literal list of the app's own audit actions (§7.4) |

`scope(input, caller)` returns the scope instance id the call targets (or `null` = "across instances": access check uses the caller's best access of that type, and the handler MUST filter results with `ctx.scope.readable()`). Ops with a `scopeType` and no `scope` function → boot error. `redact(input, output?)` returns the receipt `summary` (≤ 280 chars, no secrets; default = op title). `holdView(input)` returns what the owner sees on a hold (≤ 16 000 chars; longer → refuse `hold_view_too_large`, never truncated).

### 3.1 Handler context (`OpContext`)
| Member | Meaning |
|---|---|
| `caller` | `{ type: "agent" \| "app" \| "person", id, name, mode }` — agent/app from verified grant `sub` (+ name from the slice); person from the session principal. Never from a caller-set header |
| `grant` | `VerifiedGrant` (null for person calls) |
| `op` | the `OperationView` (manifest op or standard op) |
| `scope` | resolved access: `access` (this call), `readable()`, `writable()`, `can(type, id, crud)` |
| `callId`, `idempotencyKey` | from `TB-Call` / body field `idempotencyKey` (CORE §8) |
| `context` | open hook context JSON (namespaced keys from context hooks) |
| `receipt` | `summary(text)`, `meta(json)` — `meta` is free JSON ≤ 4 KB (e.g. `{ subjectKind: "as_me" }`) |
| `getKey(name)` | §8 |
| `callApp(product, op, input, opts?)` | §9 |
| `callServiceHelper(serviceId, path, body)` | §11 |
| `db` | the app's SQLite handle (app tables only; `tb_*` names are SDK-reserved) |
| `log` | `debug/info/warn/error(msg, fields?)`; fields whose key matches `/key|token|secret|password|authorization|cookie/i` and any value equal to a fetched key value are replaced by `[redacted]` |
| `signal` | abort on client disconnect / 30 s op timeout |

Handlers return output (validated against the manifest `output` schema) or throw `new TbError(code, message, httpStatus)`; the SDK maps it to the CORE §8 envelope.

### 3.2 Routes the SDK mounts (derived; apps add none under `/tb`)
| Route | Caller / auth | Purpose |
|---|---|---|
| `POST /tb/v1/ops/:op` | bridge: `Authorization: Bearer <grant>` + `TB-Call` | agent and app→app calls (agent-audience ops) |
| `POST /tb/v1/hooks/:hookId` | bridge: `TB-Call` (`phase`) | hook calls (no receipts, never trigger hooks) |
| `POST /tb/v1/bridge/catalog` | bridge: `TB-Call` bridge-op proof (`bop: catalog`, `op`; `verifyBridgeOpProof`) | body `BridgeOpCatalogBody { op, query?, limit? }` → `DynamicCatalogEntry[]` (≤ 256 for `list`; query for `search`) |
| `POST /tb/v1/bridge/resolve` | bridge-op proof (`bop: resolve`, `op`, `in`) | body `BridgeOpResolveBody { op, tool }` → `DynamicResolution` (bridge caches 5 min). Dynamic calls themselves arrive on `/tb/v1/ops/:op` with `DynamicCallInput {tool, arguments}` (types/manifest.ts) |
| `POST /tb/v1/bridge/mark` | bridge-op proof (`bop: mark`, `in`) | body `BridgeOpMarkBody { call, mark: "after_failed" }` → receipt status `after_failed` (CORE §8, BRIDGE §8.1 step 12) |
| `POST /tb/v1/bridge/scope-summary` | bridge-op proof (`bop: scope_summary`) | `{}` → `ScopeSummaryResult[]` `[{ agent, label ≤ 80 }]` (bodies in types/bridge.ts) |
| `GET /tb/v1/manifest` | private network, no auth | verbatim manifest (bridge verifies `manifestDigest`) |
| `GET /tb/v1/openapi.json` | private network, no auth | OpenAPI 3.1 generated in memory from the manifest |
| `GET /tb/v1/health` | private network, no auth | `{ status, sdk, version, manifestDigest, keys: [{name, present, source}] }` (§10) |
| `POST /a/<product>/tb/launch` | form POST of a K11 ticket | person sign-in (§5) |
| `GET /a/<product>/tb/v1/session` · `POST …/logout` | session cookie (+ CSRF on POST) | principal + CSRF token; sign-out |
| `POST /a/<product>/tb/v1/ops/:op` | session cookie + `TB-CSRF` | person-audience ops (manifest + standard) |
| `GET /a/<product>/<ui path>` | session cookie (launch page excepted) | the app UI (static build from `dist/ui`), manifest `ui.launchPath` / `configurePath` |
| `GET\|POST <publicRoute.path>` | none (app verifies `state` / provider signature) | manifest-declared public routes only; the bridge forwards `https://<bridge>/p/<product><path>` → `<internalUrl><path>` (BRIDGE §9.2) |

Request checks on `/tb/v1/ops/:op`, in order: call proof valid (`verifyCallProof`: key in slice `bridge.keys`; binds grant via `gjti`, op, input and context digests — CREDENTIALS §10, I2) → `verifyGrant` → op exists, audience `agent` → input schema → idempotency (§4.4) → `authorize()` (step 0 = slice pause, I1) → handler. A request without a valid proof (e.g. a direct call on the private network) → 401 `call_proof_invalid`. A slice older than 12 h → 503 `slice_stale` for ops (person UI stays up), matching the bridge rule (CORE §13 C9).

## 4. Holds and receipts (one table: `tb_receipts`)
### 4.1 Receipt shape (`Receipt` in `types/sdk.ts`)
| Field | Content |
|---|---|
| `id` | `hld_<ULID>` if the row was created by a hold (that id is the `holdId` and stays the receipt id), else `rcp_<ULID>` — one id per row, one table |
| `callId` | bridge `call_` id from `TB-Call` |
| `caller` | `{ type, id, name }` |
| `op`, `effect`, `holdFamily` | from the op (dynamic ops: from `resolve`) |
| `status` | `run \| held \| approved \| denied \| refused \| failed \| after_failed` |
| `inputDigest` | `sha256:` of JCS input — raw input is never stored |
| `summary` | redacted text from `redact` (≤ 280) |
| `meta` | free JSON ≤ 4 KB (e.g. `subjectKind: as_me \| as_itself`, `tool`, `account` label) |
| `idempotencyKey` | nullable; remembered 24 h |
| `view` | hold view text; kept only while `held`/`approved`, deleted at a terminal status |
| `createdAt`, `decidedAt`, `expiresAt` | epoch ms; `expiresAt` for holds |
| `decidedBy` | `per_<id>` (owner) or `"expiry"`; null otherwise |

One row per agent/app call that reaches `authorize()` for ops with `receipt: true` (MANIFEST) and for every hold/refusal regardless of the flag. Retention: 90 days, then deleted (counters only look back ≤ 24 h).

### 4.2 Status transitions
`authorize → run` → handler ok → `run`; handler throws → `failed`. `authorize → refuse` → `refused`. `authorize → hold` → `held` (pending TTL 15 min default, max 24 h). Owner decides → `approved` or `denied`; pending TTL passes → `denied` with `decidedBy: "expiry"`. Bridge reports an after-hook failure → `after_failed` (the action is not undone).

### 4.3 Approval without stored input (C8: one approval per call, no "always allow")
The held response is `202 { status: "held", holdId, expiresAt }` (BRIDGE §8.1 step 11). The agent polls `tb.hold_status`. After approval the agent repeats the SAME call (same op, same input, same idempotency key if any) within 15 min of the decision; the SDK finds the `approved` row for `(caller, op, inputDigest)`, passes `approval: "approved"` to `authorize()`, runs, and updates that row to `run`/`failed`. A different input never matches. An approved row is consumed once. While the slice shows a pause the retry is refused by `authorize()` step 0; the approval is kept until it expires. This keeps raw input out of storage.

### 4.4 Idempotency (manifest `operations[].idempotency`)
Key: 8–128 chars (BRIDGE §7.2), carried as body field `idempotencyKey` on the bridge→app op call (CORE §8; the agent passes MCP `_meta["tealbrick/idempotencyKey"]`) and as `CallEnvelope.idempotencyKey` on `callApp` (BRIDGE §8.3). Key scope = `(caller id, op, key)`. `required` and missing → 400 `idempotency_key_required`. Same key + same `inputDigest` → the stored result (output sealed with `TB_KEK`, kept 24 h, then purged with the key). Same key + different input → 409 `idempotency_conflict`. A held call keeps its key; the post-approval retry with the same key resolves to the hold (§4.3).

### 4.5 Hold decide API (person only)
`tb.holds_decide({ holdId, decision: "approve" | "deny", note? })` is person-audience only; an agent or app caller can never reach it (it is not on `/tb/v1/ops`). Owners decide in the app's own UI (`<AppShell>` holds page) opened by a `pur: launch` ticket from the Portal canvas (K1 browser session). TBD and the CLI never obtain any K11 ticket (K3 cannot, C16 B4): TBD opens the Portal launch for the hold in the system browser, and shows only hold counts (`pendingHolds`, §9). There is no Portal waiting view and no other approval channel in opt2.

## 5. Person sign-in (one module: `personAuth`)
| Item | Rule |
|---|---|
| Launch redeemer | `POST /a/<product>/tb/launch` form field `ticket`. `verifyTicket`: `typ tb-ticket+jwt`, `pur: launch`, `aud = tb:ins:<own id>`, issuer in trust set (Portal keys, or the standalone issuer named by a Portal-signed slice, or the instance key in app-alone mode), `exp`, `jti` unused (stored in `tb_used_jti` until `exp`). Redirect 303 to the ticket's path claim if it is under `/a/<product>/`, else `ui.launchPath`. |
| Session cookie | ONE cookie `tb_session` = 32 random bytes base64url; DB stores SHA-256 only; `Path=/a/<product>/; HttpOnly; Secure; SameSite=Lax`; absolute lifetime 8 h (CREDENTIALS §12); invalid when created before the slice's `personNbf`; deleted by logout. |
| CSRF | ONE header `TB-CSRF` = per-session random token returned by `GET …/tb/v1/session`; required (with `Origin` = request host) on every non-GET under `/a/<product>/`. |
| Principal | ONE shape `PersonPrincipal { type: "person", id: "per_…", ws, instance, iss, sessionExpiresAt }`; only the workspace owner (ticket `sub`) can hold it in opt2. |
| Errors | `ticket_invalid`, `ticket_used`, `session_required`, `csrf_invalid` (CORE §8 envelope; HTML pages show the same codes). |
| App-alone mode | the same module; the app mints the ticket itself (§12). |

## 6. Standard operations every app gets (defined once in `STANDARD_OPERATIONS`; `tb_` prefix reserved by the manifest schema)
| Op id | Audience | CRUD / effect | Input → output |
|---|---|---|---|
| `tb.hold_status` | agent | read / read | `{ holdId }` → `{ status, decidedAt?, expiresAt }` — caller's own holds only (MCP tool `<product>__tb_hold_status`) |
| (bridge op `scope_summary`, not a standard operation) | none — bridge op (not an audience, N1) | read / read | `POST /tb/v1/bridge/scope-summary` (bridge-op proof) → `[{ agent, label ≤ 80 }]`; the bridge calls it when `AppStatus.scopesRev` changes (BRIDGE §10.3); labels only, no third-party identifiers (CORE §13) |
| `tb.holds_list` | person | read / read | `{ status?, cursor? }` → holds with `view` |
| `tb.holds_decide` | person | update / write | §4.5 |
| `tb.receipts_list` | person | read / read | `{ caller?, op?, status?, cursor? }` → receipts |
| `tb.agents_list` | person | read / read | `{}` → slice agents with their scope access |
| `tb.scopes_set` | person | update / write | `{ agent, type, id, access \| null }` → updated access (audited) |
| `tb.keys_status` | person | read / read | `{}` → `[{ name, required, present, source }]` |
| `tb.key_set` / `tb.key_delete` | person | update / write · delete / write | `{ name, value }` / `{ name }` — app-own keys only; the value is never returned or logged |
| `tb.export` | person | read / read | `{}` → writes and streams a `tb-export-<timestamp>.tar.gz` (§7.3) |

`tb.hold_status` is the only agent-audience standard op (MCP tool `<product>__tb_hold_status`, BRIDGE §7.2); it needs only a valid grant from the caller (no CRUD check, I4), returns only the caller's own holds and writes no receipt. Person ops are reachable only through the session routes (§3.2). Audiences are `agent | person` only (`OPERATION_AUDIENCES`, N1); the scope summary is not a standard operation: it is reachable only as the bridge op above. `STANDARD_OPERATIONS` (types/manifest.ts, the one declaration; `StandardOpId` in types/sdk.ts is derived from it) holds exactly these 10 ids: `tb.hold_status`, `tb.holds_list`, `tb.holds_decide`, `tb.receipts_list`, `tb.agents_list`, `tb.scopes_set`, `tb.keys_status`, `tb.key_set`, `tb.key_delete`, `tb.export`. Manifest op ids can never collide (`snakeId` forbids `tb_` and dots).

## 7. Data plumbing
### 7.1 Store and migrations (one runner, forward-only)
- Store: SQLite (`node:sqlite`) at `TB_DATA_DIR/app.db`, WAL mode, one process. SDK tables (`tb_receipts`, `tb_scopes`, `tb_sessions`, `tb_used_jti`, `tb_keys`, `tb_audit`, `tb_migrations`) migrate first under the SDK's own numbered set.
- App migrations: `migrations/NNNN_<name>.sql` or `NNNN_<name>.ts` (`export function up(db)`), 4-digit, gap-free from `0001`, each in one transaction; recorded as `(scope: "app", version, name, sha256, appliedAt)`. An applied file whose sha256 changed, a missing number, or a down migration → boot fails `migration_invalid`. One baseline per app (no imported history).

### 7.2 Scope store (types and access levels from manifest `scopes[]`)
- Rows `(agent, type, instanceId, access)`; instances are app data (`ctx.scope.instances.create(type, id, label)`).
- First sight of an agent edge (agent appears in the slice `agents[]`, or first call — whichever is first): SDK calls `events.agentAdded` (the app creates per-agent instances, e.g. an "own" area), then applies manifest `defaultGrants` (`own` → the agent's own instance, `shared` → instances the app marked shared, `all` → every instance of the type). Applied once per (agent, type); later owner edits win.
- Lookups: `access(agent, type, id)`, `best(agent, type)`, `list(agent)`; `summary(agent)` renders `summaryTemplate` (≤ 80 chars) for the `scope_summary` bridge op.
- Agent removed from the slice: rows are kept (re-adding restores them); calls are refused anyway without a grant.

### 7.3 Backups, restore, export
- Runner: on manifest `backups.schedule` (cron, UTC), keep `backups.retain` archives in `TB_BACKUP_DIR`. v0.1.1 (C28): Railway mounts ONE volume per service, so the deploy recipe mounts one volume at the `data` volume's mountPath and sets `TB_BACKUP_DIR=<data mountPath>/backup` (a subdirectory); manifests keep declaring both volumes and Core merges them. Off-volume copies come from the provider's volume backup.
- Archive (MANIFEST §11) = `TB_BACKUP_DIR/tb-backup-<UTC timestamp>.tar.gz` containing `meta.json` = `{ format: "tealbrick.backup/1", product, version, manifestDigest, instance, sdk, createdAt, parts: [{ name, file, sha256, bytes }] }` and the parts: `app.db` (SQLite `VACUUM INTO`: app tables, receipts, holds, idempotency keys), each manifest `backups.files[]` entry under `files/`, and `services/<id>.<extension>` per deployed service with `backup` — the runner calls that service's `tb-exec` (§11), which runs `backup.dump` and streams stdout over the private network.
- Export (`tb.export`, MANIFEST §11) = `tb-export-<timestamp>.tar.gz`: `meta.json` (`format: "tealbrick.export/1"`) + one JSONL file per app table + `receipts.jsonl` + `audit.jsonl`; written to the backup volume and streamed to the person. It is the portable, human-readable copy; `tb_keys`, `tb_sessions` and `tb_used_jti` are never exported. Restore uses backup archives only.
- Restore: set `TB_RESTORE_FROM=<archive file name>` and redeploy. At boot, before migrations, the SDK verifies every part's sha256, restores `app.db`, files, and each service through `tb-exec` (`backup.restore` argv, dump on stdin), calls `backup.afterRestore`, records the id in `tb_audit`, and ignores the variable on later boots. A failed part → boot fails `restore_failed`, nothing partially applied to the app DB.
- Secrets: the instance key and the KEK (env or `tb/kek` file) are never in an archive; app-own keys are sealed under `TB_KEK`, so a restore into a deployment with a different seal key drops them (status `needs_keys`).
- Restore test: conformance A7 round-trip, plus the ops runbook (PRD §11).

### 7.4 Audit (`tb_audit`)
Person and system actions only (agent calls are receipts): `id aud_…, at, actor (per_… \| system), action, target, detail`. `action` ∈ `SDK_AUDIT_ACTIONS` (SDK registry, distinct from Core's `AUDIT_ACTIONS`: `session.signin`, `session.signout`, `hold.decide`, `scope.set`, `key.set`, `key.delete`, `backup.create`, `backup.restore`, `migration.apply`, `claim.complete`) plus app actions declared as a typed literal list in `defineApp({ auditActions })`. No behaviour reads audit rows.

## 8. Keys (CORE §10, C2)
- `getKey(name)` → `Promise<string | null>`; `name` MUST be in manifest `settings.keys` with `usedBy` containing `app` (else throws `key_undeclared`, a programming error).
- Precedence: app-own value (`tb_keys`, sealed per CREDENTIALS §9.1 under `TB_KEK`, entered through `tb.key_set`) > account default (`GET <TB_BRIDGE_URL>/tb/v1/keys/<name>` with `TB-Assert`; response `{name, value, keysRev}`; 404 `key_not_set` → absent). Defaults are cached in memory until `keysRev` changes; the cache is dropped when the slice shows a pause.
- `onKeysChanged(cb)` (= `events.keysChanged`) fires when an app-own key is set/deleted or the status long-poll (§9) returns a new `keysRev`. Values are never logged or compared in clear (digest compare).
- Readiness `needs_keys`: a `required` key whose `when` condition holds is absent from both sources. Ops that call `getKey` then fail `key_missing`; health and `tb.keys_status` show it; the app UI tells the owner to open the bridge key page from Portal (the app mints no ticket).

## 9. Claim, slices, companion calls (always via the bridge; one credential: the instance key K8)
| Step | Rule |
|---|---|
| Instance key | generated at first boot (`generateKeyPair`), sealed under `TB_KEK` in `TB_DATA_DIR/tb/instance-key`; never leaves the instance. Settings reach the app only as env at (re)deploy; the slice carries no settings (C16 S6). Every SDK request to the bridge carries an instance assertion in header `TB-Assert` (`typ tb-instance-assert+jwt`, `htm`, `htu`, `bd`; CREDENTIALS §10). |
| Claim | no claim record → `POST <TB_BRIDGE_URL>/tb/v1/claim` with `ClaimRequest {code: TB_ENROL_CODE, instancePublicKey, manifestDigest, version, sdkVersion, service?}` (BRIDGE §10.1). Response `{ins, bridge {id, publicKey, internalUrl}, slice?}`; `ins` MUST equal `TB_INSTANCE_ID` (else boot fails `instance_mismatch`). Retry with backoff; health `needs_claim` meanwhile. After success the code is ignored. Lost key/volume → owner issues a new K6 in Portal (re-enrol). The SDK serves no claim route of its own. |
| Slice | v0.1.11: the key-set rule first (`trustedPortalKeys`, CREDENTIALS §9.5; see "v0.1.11 additions"); before the first slice is installed `verifySlice` uses the bootstrap `TB_PORTAL_KEYS`; after it only the statement's keys (CREDENTIALS §9.2, §9.5); `aud = sub = tb:ins:<id>`. Used fields: `bridge` (call-proof keys), `portalKeys`, `standalone`, `pause`, `revoked`, `personNbf`, `agents[]`, `grants` (companion grants held by this app: `mode: "bound"`, `wf` = the manifest-declared companion operations, `held` = workspace default held families, no caps — I8, C16 S5), `rev`. Stored in the app DB (last good). |
| Status + refresh | loop `POST <TB_BRIDGE_URL>/tb/v1/status?wait=60` with `AppStatus {readiness, version, sdkVersion, scopesRev, sliceRevision, keysRev, pendingHolds}` (BRIDGE §10.3; `pendingHolds` = count of receipts with status `held`, count only, no content — C16 S2: bridge → Core status report → canvas badge and TBD counts; the push is also sent at once when the count changes); a returned slice/`keysRev` is applied (trust set, pause, agent first sight §7.2, key cache). Slice `iat` + 12 h passed → `slice_stale` (§3.2). |
| Companion call | `callApp(product, op, input, { idempotencyKey? })` → `POST <TB_BRIDGE_URL>/tb/v1/call` with `TB-Assert`, `TB-Grant: <companion grant for that product from the slice's grants>`, body `CallEnvelope {target, op, input, idempotencyKey?, parentCall?}` (BRIDGE §8.3; `parentCall` = current `callId`). The bridge gates, runs hooks, forwards. Result `{status: "ok", output} | {status: "held", holdId, expiresAt}` or a thrown `TbError` (CORE §8 envelope). Ops not in manifest `companions[]` (= the grant's `wf`) throw `companion_undeclared` before any network call; `grant_stale` or `grant_expired` (v0.1.11, C70; BRIDGE §8.4) → the SDK re-reads its slice once and retries once; any other refusal surfaces unchanged. |

## 10. Status (derived)
`GET /tb/v1/health` → `status` ∈ `ok | needs_claim | needs_keys | slice_stale | restoring | failed`, computed from claim record, slice age, manifest `settings.keys` + `when`, and boot state; `keys` = names + booleans only. The status push maps it to `AppStatus.readiness`: `ok` → `ready`, `needs_keys` → `needs_keys`, every other value → `degraded`. Portal shows what the bridge reports.

## 11. `tb-exec` (C2 wrapper entrypoint for companion containers) and service helpers (C6)
- Image = thin layer `FROM <pinned upstream>@sha256` + the `tb-exec` binary; upstream unmodified, never vendored. `ENTRYPOINT ["tb-exec", "--"]`, `CMD` = the upstream command.
- At start: claim as service `TB_SERVICE` of its instance (own K8 under its own `TB_KEK`, own K6 in `TB_ENROL_CODE`); take the app instance's public key from `ClaimResponse.app.publicKey` and the key→env list from `ClaimResponse.serviceKeys` (types/bridge.ts); fetch each listed key (`GET /tb/v1/keys/<name>`); spawn the upstream command as a child with each value in its listed env var; forward signals; exit with the child's code. A new `keysRev` restarts the child. Values are never written to disk or logs.
- Control port `7077` (constant, private network only) accepts only requests carrying an instance assertion from its own app (verified with that public key): `POST /tb/v1/exec/backup` runs `backup.dump` and streams stdout; `POST /tb/v1/exec/restore` runs `backup.restore` with the body on stdin.
- Helper (C6): a service that declares `helper { port, paths[] }` ships an app-owned helper process in its thin layer; `tb-exec` starts it beside the upstream command and lets through only the declared paths on `helper.port`, after verifying the same instance assertion. App side: `callServiceHelper(serviceId, path, body)` signs the assertion and POSTs JSON; an undeclared path throws `helper_path_undeclared` locally.

- v0.1.3 (C33): `tb-exec` is a Node bin shipped by `@opt2-tealbrick/miniapp-sdk` (the thin layer installs Node + the package). Flags: `tb-exec [--helper-cmd "<cmd>" --helper-target 127.0.0.1:<port>] -- <upstream...>`; `--helper-cmd` starts the helper process, `--helper-target` is where the authenticating proxy on `helper.port` forwards declared paths.
- v0.1.3 (C33): `defineApp({ onStart(ctx: { db, log, scopes, getKey, callServiceHelper }) })` runs once after boot + claim. `callServiceHelper(serviceId, path, body)` = JSON POST to the service helper on the private network with an instance assertion (`TB-Assert`, htm/htu/bd), timeout, error envelope.
- v0.1.3 (C31): `OpContext.publicUrl` (from slice `bridge.publicUrl`), `OpContext.workspace`, `scopes.instances` on person-op and public-route ctx, and `ctx.secrets { put, get, delete }` sealed under `TB_KEK` (AAD = name; excluded from export, sealed in backups) — THE app-secret mechanism.

## 12. Standalone
| Case | What changes for the SDK |
|---|---|
| Leaving Portal (bridge standalone, CORE §4) | nothing in the app: a Portal-signed slice names `standalone.issuer`; from then the SDK accepts grants, tickets and slices from that issuer. No env change, no restart. |
| App alone (`TB_STANDALONE=1`, no bridge, no Portal) | trust set = the instance key only; no claim, no slice; `TB_INSTANCE_ID` absent → the SDK generates and stores an `ins_` id at first boot; `/tb/v1/ops`, hooks and dynamic routes answer 503 `no_bridge`; person UI is served on the app's own port. Sign-in: first boot prints a one-time setup code (stdout; stored as SHA-256; 24 h) → owner opens `/a/<product>/tb/standalone`, enters it and sets a passphrase (≥ 12 chars, scrypt); later sign-ins with the passphrase (5 tries/min). The SDK then mints a K11-shaped ticket (`iss = aud = tb:ins:<id>`, 60 s) and hands it to the SAME redeemer → same cookie, CSRF, principal (`per_` id generated at setup). `TB_STANDALONE_RESET=1` prints a fresh setup code at boot. Holds, receipts, scopes, keys (app-own only), backups, export work unchanged. |
Agent access to an app needs a bridge (enforcement lives only there, CORE §9); a bridge first start without Portal is next wave (I11), so an app run without a bridge serves persons only.

## 13. Environment variables (one name per setting, no aliases; the manifest schema reserves `TB_`)
| Name | Who | Set by | Meaning |
|---|---|---|---|
| `TB_INSTANCE_ID` | app, services | deploy recipe (absent in app-alone mode) | own `ins_` id; must equal the claim response |
| `TB_SERVICE` | services only | deploy recipe | manifest service id |
| `TB_ENROL_CODE` | app, services | deploy recipe (Core issues K6) | one-time claim code |
| `TB_BRIDGE_URL` | app, services | deploy recipe | bridge internal (private network) base URL |
| `TB_PORTAL_KEYS` | app, services | deploy recipe | Portal public JWKS JSON (public values only) |
| `TB_KEK` | app, services (the bridge uses the same name) | generated by the provider at deploy (Railway `secret()`); if the provider cannot, the service creates it on first boot in `TB_DATA_DIR/tb/kek`, excluded from backups (I3). Portal never sees it | 32-byte KEK for sealing |
| `TB_KEK_PREVIOUS` | app, services | owner, during KEK rotation only | old KEK; the SDK reseals every blob at boot, then the owner removes it |
| `TB_DATA_DIR` | app, services (`tb-exec`) | deploy recipe (manifest `data` volume mount; for a service without a volume the recipe adds a 1 GB one) | data volume mount (sealed instance key, `app.db`) |
| `TB_DATA_EPHEMERAL` | app, services (`tb-exec`) | tests and conformance runners ONLY (never a deploy recipe) | `1` = skip the v0.1.12 first-claim mount check of `TB_DATA_DIR` (temp dirs are not volumes) |
| `TB_BACKUP_DIR` | app | deploy recipe: `<data mountPath>/backup` (C28) | backup directory on the one data volume |
| `TB_STANDALONE` | app | owner (self-host) | `1` = app-alone mode |
| `TB_STANDALONE_RESET` | app | owner | `1` = print a new standalone setup code |
| `TB_RESTORE_FROM` | app | owner | archive name to restore at next boot |
| `TB_LOG_LEVEL` | app, services | optional | `error \| warn \| info \| debug` (default `info`) |
The listen port is manifest `runtime.port`; backup schedule and retention are manifest `backups`. Any other `TB_*` variable present at boot → warning `env_unknown` (no fallback names are read).

## 14. Client (`@opt2-tealbrick/miniapp-sdk/client`, React)
| Export | Content |
|---|---|
| `<TbProvider product>` | context: session, CSRF, base path `/a/<product>/` |
| `<AppShell>` | re-exported from `@opt2-tealbrick/ui` — the ONE shell (header, nav, standard pages: Holds, Receipts, Agents & scopes, Keys, Backups/export; app pages as children). No per-app copies (D113). |
| `useSession()` | `{ principal, status: "loading" \| "signed_in" \| "signed_out", signOut() }` |
| `useHolds(filter?)` | `{ holds, decide(holdId, decision, note?) }` over `tb.holds_list` / `tb.holds_decide` |
| `useScopes(agent?)` | `{ access, set(agent, type, id, access) }` over `tb.agents_list` / `tb.scopes_set` |
| `useAgents()` | slice agents (`tb.agents_list`) |
| `tbFetch(path, init?)` | same-origin fetch with `TB-CSRF`, base path, CORE error envelope → `TbError` |
| `callOp(op, input)` | person op via `/a/<product>/tb/v1/ops/:op` |

## 15. Template (`create-tealbrick-miniapp`) output
| Path | Content |
|---|---|
| `tealbrick.manifest.json` | starter manifest (one op, one scope type, `backups`, data + backup volumes) |
| `src/app.ts`, `src/main.ts` | `defineApp` with a typed handler stub per op; `main.ts` = `startApp(app, process.env)` |
| `src/ui/` | React app using `<TbProvider>` + `<AppShell>`; built to `dist/ui` |
| `migrations/0001_init.sql`, `skills/<id>/SKILL.md` | baseline + one skill file |
| `Dockerfile` | THE one app Dockerfile pattern (C53/BSA-06; Knowledge and Connect follow it) — see §15.1 |
| `.woodpecker.yaml` | includes the ONE pipeline template from `opt2-tealbrick-platform` (typecheck, lint, unit, conformance, build image, publish, release record); no repo-local pipeline logic |
| `package.json` | `@opt2-tealbrick/*` deps as GitHub-release tarball URLs (REPOS §5); scripts `typecheck lint test conformance build gen` |
Generated (never hand-written, not committed): `tb-gen openapi | kit | docs | railway`. The per-app kit (`<product>-kit`: op id constants, input/output types from the manifest schemas, skill texts, a typed client over the bridge MCP tools) is built by CI and attached to the app's GitHub release as a tarball. `tb-gen railway` renders a self-host Railway template from the manifest (incl. the backup volume); Portal deploys use Core's recipe generated from the same manifest. Conformance drift check: generated output equals the manifest.

### 15.1 The one Dockerfile pattern (C53/BSA-06, v0.1.7)
1. Build stage `node:24-slim@sha256:<pinned>`: `corepack enable`; `pnpm install --frozen-lockfile`; `tb-gen kit` (types come from the generated kit, BSA-12); `tsc -p tsconfig.build.json` → `dist/`; UI build → `dist/ui`.
2. Runtime stage: the same pinned `node:24-slim@sha256`; production deps only (`pnpm install --prod --frozen-lockfile`); copy `dist/` and `migrations/`, `skills/`.
3. Manifest copied to `/opt/tb/tealbrick.manifest.json` (read by the SDK and `tb-exec --manifest`).
4. Data under `/data` (`TB_DATA_DIR=/data`, `TB_BACKUP_DIR=/data/backup`, C28); one volume per service.
5. `USER node`; `CMD ["node", "dist/main.js"]`. If the platform starts the container as root (Railway volume mounts, C38), `startApp` chowns `TB_DATA_DIR` and drops to uid/gid 1000 before opening anything (BSA-05).
6. Companion services: `FROM <upstream>@sha256` + Node + `@opt2-tealbrick/miniapp-sdk` (`tb-exec`); `ENTRYPOINT ["tb-exec", "--manifest", "/opt/tb/tealbrick.manifest.json", "--"]`, `CMD` = the upstream command. `tb-exec` drops to 1000 only when the service sets `dropPrivileges: true` (C54).
No npm, no `node src/main.ts` in images, no hand-written types mirroring the manifest.

## 16. Versioning
SDK semver. Portal and the bridge support the current SDK major and the one before (manifest `sdkMajor`; claim reports the exact `sdk` version); an older major is refused `sdk_major_unsupported`. The wire paths stay `/tb/v1/…` across SDK majors; a breaking wire change requires a new SDK major and is supported by the bridge for that major and the previous one. The client package and `@opt2-tealbrick/ui` are versioned with the SDK.

## 17. Exported surface (coverage list; CONFORMANCE generates its coverage from `types/sdk.ts` exports at freeze)
Every name below is a runtime export with a declaration in `types/sdk.ts`; each has at least one conformance check. Types-only exports (wire shapes) are re-exported from `types/bridge.ts`, `types/credentials.ts`, `types/manifest.ts` and are not re-declared.
| Package | Functions / classes | Constants |
|---|---|---|
| `@opt2-tealbrick/manifest` | `canonicalize`, `digest`, `validateManifest`, `manifestDigest`, `validateCompanions`, `validateAppFiles`, `withStandardOps`, `generateKeyPair`, `thumbprint`, `keySetFrom`, `signJws`, `verifyJws`, `signInstanceAssertion`, `verifyGrant`, `verifyCallProof`, `verifyHookProof`, `verifyBridgeOpProof`, `verifyTicket`, `verifySlice`, `verifyConfig`, `renderSkill`, `gate`, `authorize` | `RECEIPT_STATUSES`; re-exported vocabularies (`CRUD_ACTIONS`, `EFFECTS`, `HOLD_FAMILIES`, `AGENT_MODES`, `OPERATION_AUDIENCES`, `STANDARD_OPERATIONS`, `TYP`, `PROOF_HEADER`, …) |
| `@opt2-tealbrick/miniapp-sdk` (server) | `defineApp`, `startApp`, `TbError`, `decideHold`, `getKey`, `onKeysChanged` (plus the `RunningApp` members: `receipts`, `scopes`, `keys`, `audit`, `backups`, `status`, `stop`) | `SDK_AUDIT_ACTIONS`, `SESSION_COOKIE` (`tb_session`), `CSRF_HEADER` (`TB-CSRF`), `TB_EXEC_CONTROL_PORT` (7077) |
| `@opt2-tealbrick/miniapp-sdk/client` | `TbProvider`, `useSession`, `useHolds`, `useScopes`, `useAgents`, `tbFetch`, `callOp` (`AppShell` comes from `@opt2-tealbrick/ui`) | — |
| binaries | `tb-exec` (§11), `tb-gen openapi \| kit \| docs \| railway` (§15), `create-tealbrick-miniapp` (§15) | — |

## Checklist mapping (SPEC-REVIEW-CHECKLIST §SDK-API)
| Checklist line | Answered in |
|---|---|
| Four sides have named functions; claim via bridge | §9 (Portal: claim/slice, harness: §3/§4/§6, apps: `callApp` §9, person: §5/§14) |
| ONE authorization function, same in bridge and app, signature | §2 (`verifyGrant` shared; `gate` bridge, `authorize` app per CORE §7 C10), `types/sdk.ts` `AuthorizeInput` |
| Holds/receipts one table, one shape; approvals in app GUI/TBD; no Portal waiting view | §4.1–§4.5 |
| Data plumbing SDK-owned: migrations, idempotency, audit, backups to template volume, export | §7.1, §4.4, §7.4, §7.3, §15 |
| Human sign-in one module; standalone same code | §5, §12 |
| One claim path, one credential, one proof header, no aliases, one env name per setting | §9, §3.2 (`TB-Call`), §13 |
| App registers only handlers; routes/OpenAPI/status derive from manifest | §1 rule 1, §3, §3.2, §10 |
| Rules/Fleet only via hooks; no built-in governance modes | §1 rule 4, §3 (`hooks`) |
| Template covers manifest, SDK wiring, conformance CI, Dockerfile/entrypoint, backup volume, per-app kit | §15 |
| App shell is one component | §14 |
| Each primitive one owner package; copying = CI failure | §1 rule 2, §2, §17 |
| Nothing forward-declared, no release-tag comments | §1 rule 5, §17 |

## Open questions
None open. Resolved at v0.1: the scope summary is the bridge op `scope_summary` only and is not in `STANDARD_OPERATIONS` (10 ids; the `tb.` prefix stays reserved by the manifest id rules).

## v0.1.3 clarifications (C35)
- Idempotency keys live in `tb_idempotency` (also for `receipt: false` ops); results sealed, 24 h.
- Companion (app) callers' scope rows are keyed by instance id, manifest default grants applied on first call.
- Standard person-op outputs: lists `{items, nextCursor}`, `tb.agents_list` `{agents}`, `tb.keys_status` `{keys}`, mutations `{ok}`.
- SDK 0.x counts as manifest `sdkMajor` 1 until SDK 1.0.
- `TB_KEK`: exactly 32 bytes, base64url (43 chars) or hex (64 chars); KEK id = non-secret fingerprint `kek_<16 hex>`. Grant failures use `grant_invalid | grant_expired | grant_revoked`; other token failures `invalid_token`. Backup/export failures: `backup_failed`, `export_failed`. App tables export as `tables/<name>.jsonl`.
- `onStart`, `ctx.publicUrl`, `ctx.workspace`, `ctx.scopes.instances`, `ctx.secrets` are now in types/sdk.ts (C31/C33).

## v0.1.7 additions (C53, C54)
- BSA-05/C54: ONE privilege drop (`dropPrivileges` in the SDK): `startApp` always drops to uid/gid 1000 when started as root (chown `TB_DATA_DIR`, and `TB_BACKUP_DIR` if outside it, then setgid/setuid; failure → `privilege_drop_failed`); `tb-exec` drops only when `runtime.services[].dropPrivileges: true`.
- BSA-12: `SessionInfo.idempotencyRequired` (person-audience op ids with `idempotency: required`); client `callOp` adds a fresh key for them unless the caller passes one; retrying the same logical call with the same key is the caller's job.

## v0.1.11 additions (C62/C63, C70)
- **Key-set statements (CREDENTIALS §9.5).** `@opt2-tealbrick/manifest` 0.1.6 adds `portalRootKeys(channel)`, `signKeySetStatement(claims, rootKey)` (offline ceremony tool only), `verifyKeySetStatement(jws, roots, pinned?)`, `trustedPortalKeys(body, pinned, roots)` (the ONE trust rule for config and slice bodies) and `isPrivateInternalUrl(url, {ownInfra, allowList})` (BRIDGE §5.7). `keySetAnnounce` was removed in manifest 0.1.18 (spec 0.1.26, C133); `trustedPortalKeys` has no `required` option and no `legacy` result.
- **Slice rule in miniapp-sdk 0.1.11** (`TrustState.install`), in this order: (1) after a `standalone` slice: only the standalone issuer, `portalKeySet` ignored; (2) slice carries `portalKeySet` → `trustedPortalKeys` against the pinned statement and the build-pinned roots; refused (`keyset_invalid` / `keyset_rollback`) → slice dropped; else the slice must be signed by an `active` or `pending` key of the statement, and on install the statement's keys REPLACE the trusted set and `{seq, kss}` is persisted with the slice in the app store; (3) a statement is pinned and the slice has none → dropped (`keyset_missing`, no downgrade); (4) nothing pinned and no `portalKeySet` → dropped (`keyset_missing`); there is no transition path (removed, C133: miniapp-sdk 0.1.19 has no `KEYSET_REQUIRED` and no `slice_keyset_transition` warning), and a build with no pinned roots refuses every slice (`keyset_invalid`). A refused slice is logged (`slice rejected`, code only) and the status loop waits 1 s before the next exchange.
- **Pinned roots**: miniapp-sdk 0.1.x builds pin the DEV root pair (`PORTAL_ROOT_CHANNEL = "dev"`, a build constant); the cutover release switches it to `prod`. No env name selects roots. `startApp(app, env, harness?)`: `harness.portalRootKeys` (types/sdk.ts `StartHooks`) replaces the pinned roots for test harnesses only (conformance start modules pass `env.TBCONF_PORTAL_ROOT_KEYS`, CONFORMANCE §7); production `main.ts` never passes it.
- **Companion retry (C70)**: `callApp` retries once after one slice re-read for `grant_stale` and `grant_expired` (unchanged behaviour, now also stated for `grant_stale` in BRIDGE §8.4).
- **Path bases (C70, MANIFEST §3)**: `tb-gen` follows MANIFEST §3 path bases. Build paths (`runtime.build`, `runtime.services[].build`) are repo-relative. Skill files are manifest-relative (relative to the directory of `--manifest`). `--repo <dir>` names the repo root; the default is the manifest directory. With `--repo`, `tb-gen railway` refuses a build context or Dockerfile that does not exist under it (`build_path_missing`). `validateAppFiles(manifest, repoDir, manifestDir = repoDir)` uses the same two bases.

## v0.1.12 (fallback removed, 2026-10-12T10:19:19Z)
- miniapp-sdk 0.1.12 set `KEYSET_REQUIRED = true`; 0.1.19 removes the constant (C133): the statement is always required.

## v0.1.12 addition (claim guard, spine S1: a claim on ephemeral disk lost its identity)
- **Mount gate.** Before a FIRST claim (no claim record) and before a reclaim, `startApp` and `tb-exec` check `TB_DATA_DIR` against `/proc/self/mountinfo`: the nearest mount (longest mount point equal to or a parent of the resolved data dir; on a tie the later, stacked entry) must not be `/` and its fs type not `overlay`, `aufs`, `tmpfs`, `ramfs`, `devtmpfs`, `fuse` or `fuse.*` (no allow-list of fs types or devices; Railway volumes are their own ext4 mount, `/` is overlay). Only `TB_DATA_DIR` is checked, never `TB_BACKUP_DIR` (one volume per service; Core sets `/data/backup` inside it). Not mounted → the one-time `TB_ENROL_CODE` is NOT redeemed; health `needs_claim` with detail `attention: "data_dir_not_mounted"` (wire `readiness: degraded`; `tb-exec`: warning log); the check repeats 5 s → 60 s and the claim follows once mounted. No mountinfo (macOS, non-Linux) → check skipped. `TB_DATA_EPHEMERAL=1` skips it (tests / conformance only).
- **Boot line.** One info log `data_dir_mount {dataDir, mounted: true|false|unknown, mountPoint, fsType}` at every boot.
- **Reclaim.** The claim record stores `codeDigest` = sha256 of the code it was claimed with (never the code). When the bridge refuses the stored identity (401 `unauthenticated` on an instance-assertion request) AND the current `TB_ENROL_CODE` digest differs from `codeDigest` (a record without one counts as different), the SDK claims once with the new code, replaces the record and drops the old identity's slice; the sealed instance key, app data and the pinned key-set statement stay. Same or no new code → keep refusing with backoff, health `needs_claim` + `attention: "identity_refused"` (logged once per episode). Each code is tried at most once per process.
- **Conformance.** The app runner sets `TB_DATA_EPHEMERAL=1`; new check `A1.reclaim_on_new_code` (fake bridge forgets the instance key: restart with the same code → no claim; with a new code → one claim, then an accepted status push).

## v0.1.13 additions (C81, C82, C85, C86, Fleet)
- **authorize() (G1):** `AuthorizeInput.holdVerdict` = the proof's `hv` (or null). Order: (0) slice pause → verifyGrant → scope access → **hook hold verdict** → held family / money → caps → run. With a verdict and no approval → `hold` (family = `hv.f`, reason = `hv.r`, receipt `heldBy = hv.by`, `holdFamily` may be `policy`). `approval: "approved"` (approved, unconsumed hold for (caller, op, inputDigest)) satisfies the verdict, held-family and money steps alike; the approved call runs once (C8). Scope refusals beat a verdict.
- **tb.holds_pending (G4):** standard op, audience agent, crud read, effect read, idempotency none, receipt false. Input `HoldsPendingInput {limit? 1..100 (50), cursor?}`; output `HoldsPendingOutput {items: HoldsPendingItem[], nextCursor}` — summaries only (`summary` = the redacted receipt summary; never `input`, `view` or `meta`). An agent caller sees only its own `held` receipts; an app caller (companion grant naming `tb.holds_pending`) sees all `held` receipts of the instance. `decidePath = /holds/<id>`: every app's person UI MUST open the hold's decision view at that path (template 0.1.7 routes it; apps without a UI get the SDK's minimal decision page at `/holds/<id>`, a person route using `tb.holds_list` / `tb.holds_decide`). Order: oldest first.
- **C85 callApp outside a handler:** `StartContext.callApp` and `EventContext.callApp` (same signature as `OpContext.callApp`) send `CallEnvelope` without `parentCall`; the SDK uses the app's companion grant from the slice (re-read + one retry on `grant_stale`). Usable for the app's whole lifetime (keep the ctx). Same hooks and holds as any caller; a held outward call waits for the owner like any hold.
- **C86 pendingCount / statusChanged:** `defineApp({pendingCount?(db)})`: `AppStatus.pendingHolds` = held receipts + `pendingCount()` (clamped 0..10 000; 1 s timeout; error/timeout → 0 and a WARNING log each time, rate-limited to 1 per minute with a suppressed count). `ctx.statusChanged()` (op ctx, StartContext, EventContext) pushes status within 1 s (debounced; ≤ 1 push/s).
- **Fleet: `events.agentsChanged(agents, ctx)`:** the full `SliceAgent[]` once per installed slice whose `agents[]` differ (ids, names, mode, status) and once for the first slice after boot. `agentAdded`/`agentRemoved` stay. All event handlers get `EventContext {db, log, scopes, callApp, statusChanged}`.
- **Slice `portalUrl` (C86):** `ctx.ownerLink(path)` (OpContext, StartContext, EventContext) → `<portalUrl>/w/<ws>/open?product=<own product>&path=<encoded path>`, or null until the slice carries `portalUrl`; `path` must pass the launch path rule (PORTAL-API v0.1.13), else it throws `path_invalid`.

## 18. Cross-app contracts (v0.1.13)
Pattern: a namespaced context key or a documented op behaviour, a version field `v`, and fail closed on an unknown version. Contracts are data between apps; the spine (Core, bridge, GUI) never interprets them.
- **`rules.narrowing` (G5)** — written by the app whose product id is `rules` (context hook): `RulesNarrowingV1 {v: 1, ruleId, reason, memoryTags?: {anyOf?: string[], noneOf?: string[]}}` (tags ≤ 64 chars, ≤ 32 per list). A memory app (Knowledge) MUST, for every read/recall op: keep only items whose `tags[]` intersect `anyOf` (when given) and do not intersect `noneOf`; refuse with `narrowing_unsupported` (409) on an unknown `v`; apply nothing when the key is absent. Knowledge results carry `tags[]` so a Rules `after` hook can also redact (generic after-hook mechanism).
- **`tb.onBehalfOf` (G4b)** — written by the bridge only (BRIDGE §8.5): `{claim: {kind, id, display?}, verified: false, via: "mcp_meta"}`. `channel_sender` ids: `"<channel>:<value>"`, channel lowercase `[a-z0-9_-]{1,32}` (`buzz`, `slack`, `telegram`), value = Connect's sender value (Buzz npub, Slack user id, Telegram numeric id); producers always send the prefixed form; consumers MAY read a bare `npub1…` as `buzz:`. Unverified → narrow only. Rules may copy it into `rules.onBehalfOf` (Rules' choice).
- **Connect app-caller sender identity (C86)** — when the caller of a Connect send op is a companion APP (`caller.type = "app"`), Connect sends from the workspace sender identity the owner picked in Connect (one per channel); an agent caller keeps its own identity. None set → refuse `no_sender_identity` (409, not retryable, message names the Connect settings page). The receipt records the identity used.
- **v0.1.13 clarifications (implementation, mirrored in spec 0.1.14):** the SDK calls `statusChanged()` itself whenever a hold is created, decided or expires (so `pendingHolds` reaches the canvas within ~1 s); `tb.hold_status` output gains `family` and `reason` (the hook verdict reason or the SDK hold reason) so the agent sees why it was held (C90: only that reason text — never the input, the hold view or another app's payload).
- **v0.1.14 addition:** `ctx.companionTargets(): string[]` (OpContext, StartContext, EventContext) = product ids from the slice `companionTargets` (sorted, unique; [] when absent).

- **`rules.narrowing` details (v0.1.22, G5 decision + Knowledge SPEC-GAP):**
  1. Tags compare after `normalizeTag(t)` = trim + lower case, on write AND on compare; `tagsMatch(memoryTags, tags)` in @opt2-tealbrick/manifest (≥ 0.1.16) is THE comparison: `anyOf` PRESENT (even empty) → at least one normalised item tag in it, so `anyOf: []` passes NOTHING (Rules emits it for a disjoint merge); absent `anyOf` → no anyOf constraint; `noneOf` → no item tag in it. v0.1.23 correction (C115): 0.1.22 read an empty `anyOf` as "no constraint", which WIDENED access; manifest 0.1.15's `tagsMatch` has that bug and must not be used. Rules (`rules_filter`) and every memory app import it (L1).
  2. A read that cannot honour the filter answers `narrowing_unsupported` (409, fail closed), not only for an unknown `v` (e.g. engine tools whose items carry engine-side tags; untagged items under `anyOf`; `noneOf` alone may run when untagged items are allowed by it).
  3. The memory app records `ctx.receipt.meta({narrowing: {v, ruleId}})` on every narrowed read; Rules records its own decision.
  4. Items whose tags are unknown are DROPPED under any narrowing (fail closed); a hidden item answers `not_found` on direct reads; writes ignore the narrowing.

## v0.1.14 addition (C91)
- **Bridge-op proof binding (C91, spec 0.1.14):** ONE rule, implemented once as `bridgeOpBinding(bop, body)` / `bridgeOpProofClaims(bop, body)` in @opt2-tealbrick/manifest 0.1.8 (the bridge signs with the second, the SDK and conformance verify with the first): `catalog` → `{bop, op}` only — the search body `{op, query?, limit?}` is NOT bound (no `in`; a read-only search, replay still blocked by `jti`); `resolve` → `{bop, op, in}`; `mark` → `{bop, in}`; `scope_summary` → `{bop}` (empty body). `in` = digest(JCS body). A proof that carries any other claim set for its `bop` is refused (`call_proof_invalid`, 401). Dynamic CALLS are not bridge ops: they arrive on `/tb/v1/ops/<op>` with an op proof (`in` = digest(input)). The §3.2 table rows already state it; this note makes it normative and names the shared function.
- **v0.1.13 (Kanban QA S2):** `scopes.instances.create(type, id, label, {shared: true})` on a new or not-yet-shared instance applies the `shared` defaultGrant to every caller whose defaults were applied before (INSERT-if-absent: owner edits win; owner removals after the share are kept). Apps no longer need server-side grant workarounds (Kanban `board_share_sync` can go).
- **v0.1.14 (C102):** for app callers the SDK sets `Caller.name` from slice `companionCallers` (matched by the verified grant `sub` = `tb:ins:<ins>`); fallback the instance id. Apps never show a raw instance id or an unverified label.
- **v0.1.14 (Connect Q-C2):** `defaultGrants[].callers?: ("agent" | "app")[]` (default both): first-sight defaults and the shared-on-share rule apply a grant only to the listed caller types (an app caller = a companion instance).
- **v0.1.15 (C105a):** `callApp` (any ctx) returns `{status: "held", holdId, expiresAt}` when the target holds; the calling app keeps its item pending and retries with the SAME idempotency key after approval (the approved hold runs once). `ctx.appsPolicy()` returns the slice's `appsPolicy.held` (or null) for display. No app may hold or skip holds by itself.
- **v0.1.18 (C106a, Connect F21):** `ctx.agentScopeRequest(agt)` (OpContext, StartContext, EventContext) → the slice's `agents[].scopeRequest` for that agent (`{product, kind, id?, createName?}`) or null. Only requests for THIS product are returned (`scopeRequest.product` = own product id).
- **v0.1.20:** `ctx.ownerLinkFor(product, path)` (OpContext, StartContext, EventContext) = `ownerLink` for ANOTHER app (e.g. Inbox opening a hold's `decidePath` in the owning app); product id and launch path are checked with the shared rules (`product_invalid`, `path_invalid`). Agents get NO direct `tb.holds_pending` tool on other apps: they read pending holds through an app op (e.g. Inbox `holds_overview`); spine T9 step 4 uses that.
- **Fix (miniapp-sdk 0.1.16):** the SDK validates hook answers with the shared `hookResponseProblem` (L1). SDK ≤ 0.1.15 used its own key list and turned every `hold` answer into `500 hook_failed`, so hook holds were REFUSED (fail closed), never held, behind those SDKs. Apps with hold-answering hooks (Rules, sample-gate) need SDK ≥ 0.1.16 and declare `requires.bridge: "0.1.17"`.
- **v0.1.21 (queued):** `startApp(app, env, harness)` harness option `port` (0 = any free port; harness-only, never from env) replaces manifest `runtime.port`; `RunningApp.port` = the bound port.
