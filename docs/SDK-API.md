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
| `KeySet` helpers: `keySetFrom(jwks, issuer)`, `keySetAnnounce(trusted, announced, announcedBy)` | | a new key is trusted only if announced by a document signed by an already-trusted key (CORE §4) |
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
| Slice | `verifySlice` with `TB_PORTAL_KEYS` until the first slice is installed, then only the slice's `portalKeys` (CREDENTIALS §9.2); `aud = sub = tb:ins:<id>`. Used fields: `bridge` (call-proof keys), `portalKeys`, `standalone`, `pause`, `revoked`, `personNbf`, `agents[]`, `grants` (companion grants held by this app: `mode: "bound"`, `wf` = the manifest-declared companion operations, `held` = workspace default held families, no caps — I8, C16 S5), `rev`. Stored in the app DB (last good). |
| Status + refresh | loop `POST <TB_BRIDGE_URL>/tb/v1/status?wait=60` with `AppStatus {readiness, version, sdkVersion, scopesRev, sliceRevision, keysRev, pendingHolds}` (BRIDGE §10.3; `pendingHolds` = count of receipts with status `held`, count only, no content — C16 S2: bridge → Core status report → canvas badge and TBD counts; the push is also sent at once when the count changes); a returned slice/`keysRev` is applied (trust set, pause, agent first sight §7.2, key cache). Slice `iat` + 12 h passed → `slice_stale` (§3.2). |
| Companion call | `callApp(product, op, input, { idempotencyKey? })` → `POST <TB_BRIDGE_URL>/tb/v1/call` with `TB-Assert`, `TB-Grant: <companion grant for that product from the slice's grants>`, body `CallEnvelope {target, op, input, idempotencyKey?, parentCall?}` (BRIDGE §8.3; `parentCall` = current `callId`). The bridge gates, runs hooks, forwards. Result `{status: "ok", output} | {status: "held", holdId, expiresAt}` or a thrown `TbError` (CORE §8 envelope). Ops not in manifest `companions[]` (= the grant's `wf`) throw `companion_undeclared` before any network call; `grant_stale` → the SDK re-reads its slice once and retries. |

## 10. Status (derived)
`GET /tb/v1/health` → `status` ∈ `ok | needs_claim | needs_keys | slice_stale | restoring | failed`, computed from claim record, slice age, manifest `settings.keys` + `when`, and boot state; `keys` = names + booleans only. The status push maps it to `AppStatus.readiness`: `ok` → `ready`, `needs_keys` → `needs_keys`, every other value → `degraded`. Portal shows what the bridge reports.

## 11. `tb-exec` (C2 wrapper entrypoint for companion containers) and service helpers (C6)
- Image = thin layer `FROM <pinned upstream>@sha256` + the `tb-exec` binary; upstream unmodified, never vendored. `ENTRYPOINT ["tb-exec", "--"]`, `CMD` = the upstream command.
- At start: claim as service `TB_SERVICE` of its instance (own K8 under its own `TB_KEK`, own K6 in `TB_ENROL_CODE`); take the app instance's public key from `ClaimResponse.app.publicKey` and the key→env list from `ClaimResponse.serviceKeys` (types/bridge.ts); fetch each listed key (`GET /tb/v1/keys/<name>`); spawn the upstream command as a child with each value in its listed env var; forward signals; exit with the child's code. A new `keysRev` restarts the child. Values are never written to disk or logs.
- Control port `7077` (constant, private network only) accepts only requests carrying an instance assertion from its own app (verified with that public key): `POST /tb/v1/exec/backup` runs `backup.dump` and streams stdout; `POST /tb/v1/exec/restore` runs `backup.restore` with the body on stdin.
- Helper (C6): a service that declares `helper { port, paths[] }` ships an app-owned helper process in its thin layer; `tb-exec` starts it beside the upstream command and lets through only the declared paths on `helper.port`, after verifying the same instance assertion. App side: `callServiceHelper(serviceId, path, body)` signs the assertion and POSTs JSON; an undeclared path throws `helper_path_undeclared` locally.

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
| `Dockerfile` | `node:24-slim@sha256`, non-root, `CMD ["node", "dist/main.js"]`; services: `FROM <upstream>@sha256` + `tb-exec` layer |
| `.woodpecker.yaml` | includes the ONE pipeline template from `opt2-tealbrick-platform` (typecheck, lint, unit, conformance, build image, publish, release record); no repo-local pipeline logic |
| `package.json` | `@opt2-tealbrick/*` deps as GitHub-release tarball URLs (REPOS §5); scripts `typecheck lint test conformance build gen` |
Generated (never hand-written, not committed): `tb-gen openapi | kit | docs | railway`. The per-app kit (`<product>-kit`: op id constants, input/output types from the manifest schemas, skill texts, a typed client over the bridge MCP tools) is built by CI and attached to the app's GitHub release as a tarball. `tb-gen railway` renders a self-host Railway template from the manifest (incl. the backup volume); Portal deploys use Core's recipe generated from the same manifest. Conformance drift check: generated output equals the manifest.

## 16. Versioning
SDK semver. Portal and the bridge support the current SDK major and the one before (manifest `sdkMajor`; claim reports the exact `sdk` version); an older major is refused `sdk_major_unsupported`. The wire paths stay `/tb/v1/…` across SDK majors; a breaking wire change requires a new SDK major and is supported by the bridge for that major and the previous one. The client package and `@opt2-tealbrick/ui` are versioned with the SDK.

## 17. Exported surface (coverage list; CONFORMANCE generates its coverage from `types/sdk.ts` exports at freeze)
Every name below is a runtime export with a declaration in `types/sdk.ts`; each has at least one conformance check. Types-only exports (wire shapes) are re-exported from `types/bridge.ts`, `types/credentials.ts`, `types/manifest.ts` and are not re-declared.
| Package | Functions / classes | Constants |
|---|---|---|
| `@opt2-tealbrick/manifest` | `canonicalize`, `digest`, `validateManifest`, `manifestDigest`, `validateCompanions`, `validateAppFiles`, `withStandardOps`, `generateKeyPair`, `thumbprint`, `keySetFrom`, `keySetAnnounce`, `signJws`, `verifyJws`, `signInstanceAssertion`, `verifyGrant`, `verifyCallProof`, `verifyHookProof`, `verifyBridgeOpProof`, `verifyTicket`, `verifySlice`, `verifyConfig`, `renderSkill`, `gate`, `authorize` | `RECEIPT_STATUSES`; re-exported vocabularies (`CRUD_ACTIONS`, `EFFECTS`, `HOLD_FAMILIES`, `AGENT_MODES`, `OPERATION_AUDIENCES`, `STANDARD_OPERATIONS`, `TYP`, `PROOF_HEADER`, …) |
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
