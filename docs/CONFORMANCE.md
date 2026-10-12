# CONFORMANCE — what the conformance suite checks

Status: v0.1, Lead · Specs, 2026-10-11. Package: `@opt2-tealbrick/conformance` in `opt2-tealbrick-sdk` (REPOS.md).

## 1. Scope and status of the evidence
- Conformance proves that an implementation obeys the frozen interface specs (CORE, MANIFEST, CREDENTIALS, BRIDGE, PORTAL-API, SDK-API). It is a builder tool.
- **Conformance is NOT release evidence.** Release evidence = Lead · Adversarial QA's acceptance tests written from PRD-V2 and the journeys (`opt2-tealbrick-qa`). A green conformance run never replaces a QA verdict.
- It runs as ONE stage (`pnpm conformance`) in the ONE pipeline template from `opt2-tealbrick-platform`, in every repo that ships an app, the bridge or Core.

## 2. Targets
| Target | Run as | Counterparts used |
|---|---|---|
| App (any miniapp), Portal mode | `tb-conformance app --url <app> --manifest <file>` | fake bridge (+ fake Portal behind it) |
| App, standalone mode | `tb-conformance app --standalone` | none (app is its own issuer) |
| Bridge (deployed form) | `tb-conformance bridge --url <bridge>` | fake Portal, fake app(s) generated from the example manifests, fake agent |
| Bridge (relay form, CLI) | `tb-conformance relay --cmd "tealbrick bridge serve --stdio"` | fake deployed bridge |
| Portal Core | `tb-conformance core --url <gateway>` | fake bridge (enrol/pull/ack), fake device client, Stripe test fixtures |
| Manifest | `tb-conformance manifest <file>` | none (schema + cross-field rules + generators) |

## 3. Fakes are generated from the specs (cannot drift)
- The suite imports ONLY `@opt2-tealbrick/spec` and `@opt2-tealbrick/manifest` (S12: never miniapp-sdk or bridge, so the bridge is never tested with itself and there is no repo cycle).
- One **fake Portal** and one **fake bridge**, both built from `@opt2-tealbrick/spec` (JSON Schemas, `types/routes.ts` route table, workspace-config / instance-slice schemas) and `@opt2-tealbrick/manifest` (the real `verifyGrant`/`gate`/`authorize`, JCS, JWS). They do not re-declare any shape.
- The fake Portal implements exactly the `bridge`-auth and `device`-auth rows of the route table plus a test control API (mint config revision, pause agent, rotate key, revoke connection, go offline, issue codes/tickets). Unknown routes → 404 (default deny is itself checked).
- The fake bridge implements the bridge internal surface (`/tb/v1/claim`, `/tb/v1/keys/<name>`, `/tb/v1/call`, `/tb/v1/status`) and the bridge→app call path (grant + `TB-Call` proof, hook envelopes) with a control API (set context, inject failing hook, tamper proof, expire grant).
- Drift guard: a CI check fails when a fake's request/response validators are not the spec schemas by reference (digest of the imported schema set is printed in every report).

## 4. Checks (each has a real assertion; no "coverage: none")
IDs are stable; the report lists every ID with pass/fail and the asserted value.

### 4.1 Manifest (M)
- M1 schema valid (`tealbrick.miniapp/2`), strict objects, no unknown keys, no `legacy` values.
- M2 cross-field rules (create ⇒ idempotency `required`; crud/effect consistency; `money` ⇒ held; scopeType declared; hooks reference real ops; `when` references real settings; key names unique; `tb.`/`tb_` prefix reserved; MCP tool name `<product>__<op>` ≤ 64 chars).
- M3 digest = sha256(JCS) reproducible across two runs and two machines' outputs.
- M4 generators: MCP tool list, OpenAPI, Portal form/deploy steps, deploy recipe, per-app kit, skills inputs — regenerated output equals committed nothing (no hand-written copies exist: repo scan for `openapi.*`, `manifest.json`, `recipe.json` beside the manifest fails).
- M5 no product literal: Core, bridge, SDK source trees contain no product id from any example/real manifest (grep list built from manifests).

### 4.2 Credentials (C) — one case per kind, plus negatives
- C1 every kind K1–K12 + K2b: positive path verified with the documented verifier and checks in the documented order.
- C2 `aud` mandatory: missing, array, or foreign `aud` → refused (grant, agent session, pairing code, person ticket, call proof, assertions).
- C3 `typ` confusion: each token presented where another kind is expected → refused (e.g. person ticket as grant, grant as agent session).
- C4 **F4-1 class**: a person credential (Clerk session or owner CLI session) presented at the bridge MCP endpoint, the relay, an app op route, or any agent path → refused; and no agent-facing response, config, slice or instruction set ever contains a person credential (scan of all fake-captured payloads).
- C5 expired / not-yet-valid / wrong-issuer / unannounced `kid` → refused; rotated key: announced key accepted after activation, retired key accepted only until its tokens expire.
- C6 one-time codes: device code, pairing code, enrolment code, person ticket replayed → refused; codes stored only as digests (Core DB inspection hook in the Core target).
- C7 no 1-year bearer: no issued token has `exp − iat` above its kind's lifetime.
- C8 no shared secret: the app and bridge targets start with no secret env except their one-time enrolment code and the provider-generated `TB_KEK` (CORE I3); the app obtains keys only from `/tb/v1/keys`.
- C9 credential case ids from CREDENTIALS §18 (`cred.*`, e.g. `cred.p1.bridge_rejects_clerk_jwt`, `cred.p1.kit_cannot_get_owner`) are sub-ids of C1–C8/R8 and appear verbatim in the report.

### 4.3 Pause and revocation matrix (P) — every cell of CREDENTIALS' pause matrix
- P1 workspace kill switch, agent pause, connection revoke, instance pause: for EVERY path that reaches an app (MCP call, relay call, app→app companion call, hook call, key fetch, person launch where applicable) → refused at the documented enforcement point within the documented latency (online: next config revision, ≤ 60 s; asserted with the fake Portal's control API).
- P2 owner CLI session revoked → next CLI call refused; agents keep working (owner self-setup flow).
- P3 agent revoked → its sessions and refresh tokens refused; other agents unaffected.

### 4.4 Bridge (B)
- B1 public surface equals the documented list (MCP, OAuth AS endpoints + metadata, `/a/<product>/*`, declared `/p/<product>/<path>`, `/keys`, `/healthz`); any other path → 404; internal surface not reachable on the public listener.
- B2 enrolment: one-time code, own key pair generated, Portal stores only the public key; re-enrolment invalidates the old key.
- B3 config: signature verified, monotonic revision (older revision rejected), atomic apply, last good kept on a bad document, ack/status sent with key presence booleans only (no values — payload scan).
- B4 **Portal-down**: fake Portal goes offline → calls keep working; after signed config age > 12 h → bridge fails closed for agent and app→app calls; person launch and key page stay up.
- B5 `gate()` order: paused → no grant → CRUD → audience → scopeType → Bound workflow; Bound agent calling an op outside `wf` → refused.
- B6 hooks: order (phase, `order`, product id); failing/slow (> 2 s) `before` → refused (fail closed); failing `context` → refused; failing `after` → output withheld, receipt marked `after_failed`; hook calls never trigger hooks; context is extensible (unknown namespaced field passes through untouched).
- B7 MCP: `tools/list` equals exactly the agent-audience ops allowed by the agent's grants (+ dynamic list entries / search+call pair), never person-audience ops; changes after a config revision emit `list_changed`; skills served as resources with per-agent variables filled.
- B8 call path: app receives grant + valid `TB-Call` proof bound to op, input digest and context digest; tampered input → app refuses.
- B9 no tool payload or call metadata is sent to Portal (fake Portal records every request; only enrol/config/ack/status shapes allowed).
- B10 relay form speaks stdio only (no listener), holds no grants, keys or config (filesystem + memory snapshot check) and duplicates no checks; enforcement observed only at the deployed bridge.
- B11 key page: `pur: keys` ticket required; values written to the sealed store; never in logs (log capture scan) or status; app gets only manifest-declared keys with an instance assertion; undeclared key → refused.
- B11a (v0.1.6, C52): the keys-ticket POST response itself is the key form (200, Strict session cookie on that response, no 3xx); check id `B11.ticket_post_is_form`.
- B11b (v0.1.10, C59): every B11 key-page request (ticket POST, page GET, submit) is sent to the keys origin (`TB_KEYS_PUBLIC_URL`, `Host` = its host name). New checks: `B11.main_origin_keys_404` (main origin `/keys` → 404); `B11.keys_origin_only` (keys origin `/a/*`, `/mcp`, `/oauth/*` → 404); `B11.keys_origin_csp` (key-page responses carry `Content-Security-Policy` with `form-action 'self'`); `B11.keys_origin_unset_503` (bridge started without `TB_KEYS_PUBLIC_URL` → `/keys` 503).
- B12 OAuth AS: metadata documents valid; DCR + PKCE S256 enforced; pairing code redeemed offline; refresh rotation with reuse detection (previous token once within 30 s, CORE I12; other reuse → connection revoked); no custom pairing grant type at `/oauth/token` (S9).
- B13 bridge-op proofs (B5): `/tb/v1/bridge/{catalog,resolve,mark,scope-summary}` accept only the bridge-op call-proof variant; an op proof or hook proof there → refused; a bridge-op proof at `/tb/v1/ops/*` → refused.
- B14 standalone handover (B7): after the final config, apps accept bridge-issued grants and slices; Portal-key-signed tokens issued after the handover are refused; the admin surface has exactly 4 ops (pause/resume, revoke connection, ticket) — any other admin path → 404; adding agents/edges → not possible.
- B15 pairing path A: `tb-pair-state+jwt` one-time, `ret` must equal the bridge's own callback, tampered/expired state → refused; no bridge→Portal server call on the path.
- B16 limits: dynamic tool beyond the manifest ceiling → `dynamic_ceiling_exceeded`; hook re-entry → `hook_reentry`; companion call depth > limit → `call_depth_exceeded`; app with slice older than its validity → `slice_stale`.
- B17 skills: `<product>__tb_skills` read tool is listed for every agent with any grant on that app (S10); skill text is served as rendered by `renderSkill()` (no bridge-side filtering).
- B18 `pendingHolds` count reaches the status report (count only, no hold content) (S2).

### 4.5 App + SDK (A)
- A1 claim via the bridge with the enrolment code; instance key generated; no claim route other than the SDK's.
- A2 app re-verifies every grant (`verifyGrant`) and call proof; request without proof (direct call on the private network) → refused.
- A3 `authorize()`: scope access from the app store (`grant.crud ∩ access.crud`); held family → `{status: "held", holdId}`; Free caps exceeded → hold; `money` always held; no "always allow" record exists after an approval (C8).
- A4 holds/receipts: one table, one receipt shape; approvals only through person-audience ops (app GUI / TBD via launch); receipt stores input digest + redacted summary, never raw secrets.
- A5 idempotency: same key + same input → same result; different input → 409 `idempotency_conflict`.
- A6 person sign-in: launch ticket redeemed once; one session cookie, one CSRF header; standalone mode uses the same module.
- A7 data plumbing: migrations forward-only and repeatable from empty; backup to `TB_BACKUP_DIR` + restore round-trip; export produces the documented format.
- A8 default scope grants applied on first sight of an agent edge (C1 behaviour asserted with a generic manifest, not a product).
- A9 public address: app target fails if it listens on anything but the private interface in deployed mode (Railway template check: no public domain on app services).
- A10 post-approval retry (SDK §4.3): an approved hold runs only when the agent repeats the same input (same digest); a different input → new hold; no raw input stored for the hold.
- A11 every exported function of `types/sdk.ts` has at least one check; the list is generated from the exports at FREEZE and committed with the suite (a new export without a check fails CI).

### 4.6 Portal Core (R)
- R1 route table served at `/internal/routes` equals `types/routes.ts`; an op without a row is unreachable through the gateway (default deny); Core not reachable except via the gateway (deploy check: no public domain).
- R2 owner-cli auth class: only reads + `drafts.*`; any other mutation → refused; `drafts.apply` needs a browser person session and confirmation.
- R3 licence gate: unlicensed app → no grants, no edges in config, no launch ticket; `isEntitled(workspace, product, major)` single implementation (assign/move/unassign transitions).
- R4 no op accepts a key value (schema scan: no route input field holds a secret); key status returns booleans only.
- R5 no op exists for tool execution, connectors, channels, relay, Fleet, rooms, or app data (route table scan against the forbidden list in PORTAL-API).
- R6 signing keys sealed (DB contains no plaintext private key — inspection hook); Railway token sealed.
- R7 device flow (`/device/authorize`, polling): polling errors use the one error envelope with codes `authorization_pending`, `slow_down` (+5 s), `access_denied`, `expired_token`; codes one-time, 10 min, digests only.
- R8 device binding (B2/B3): no op lists pending device requests without a user code; `device.lookup` / `device.approve` require the user code (digest match; 6th wrong try in 10 min → locked); no output contains a clear user code; `scope=owner` with `client_id=kit` (or with a public key) → refused (`cred.p1.kit_cannot_get_owner`); an agent-scope request never yields K3; a batch request with 65 agents → refused, with 64 → one approval creates 64 connections (S4).
- R9 owner-cli outputs: no route reachable with K3 returns a one-time code, a pairing code or a person ticket (route-table scan, S1/B4); K3 idle > 24 h → refused.
- R10 idempotency store never holds a response of a `bodyLog: none` row; replay of such a request → 409 `idempotency_conflict` (B8).
- R11 onboarding order (B1): after `workspaces.set_infrastructure` the bridge is enrolled and an agent can be authorised (device flow and pairing) before any app is deployed; licence-last (R4): deployed unpaid app → `entitled:false`, no grants, no launch ticket; after the Stripe test webhook → next config revision carries grants.
- R12 pairing approval (S3): Core refuses `pairing.approve` when the bridge's workspace does not belong to the principal; approval view returns the redirect host and the client name flagged unverified.

## 5. Version matrix
Every target runs against the current SDK major and the one before (bridge and Core must accept both; apps built with either must pass). Older majors are expected to fail with a clear `sdk_major_unsupported` error.

## 6. Report shape
JSON (machine) + markdown (human): target, spec digest, SDK versions, every check ID with result and asserted value, captured-payload scan summary. Exit code 0 only if every check passes.

## Checklist mapping
| Checklist (CONFORMANCE) | § |
|---|---|
| Targets apps (Portal + standalone), bridge, Core; one fake Portal + one fake bridge | §2, §3 |
| Every check has a real assertion; every SDK function and credential kind covered | §4 (C1 per kind; A11 generated per `types/sdk.ts` export at freeze), §6 |
| Negative cases (person token, aud, expired, pause every kind, Bound, held, failing before hook, public address) | C4, C2, C5, P1, B5, A3, B6, A9 |
| Portal-down case | B4 |
| Drift check generated vs manifest; no product literal | M4, M5, §3 drift guard |
| Version matrix | §5 |
| Not release evidence | §1 |
| One CI stage | §1 |

## Open questions
1. A9 "app has no public address" can only be asserted from the Railway template / deployment record, not from inside the app. Recommendation: Core's deploy adapter asserts it at deploy time and conformance checks the generated template; QA checks the live project.

## v0.1.10 additions (C59)
- Bridge target: the suite sets `TB_KEYS_PUBLIC_URL` in the bridge env (a second host name that reaches the same public listener) and sends every key-page request with that origin/`Host`; B1's documented public list is per origin (main: everything except `/keys`; keys: `/keys`, `/healthz`, `/readyz`). New check ids `B11.main_origin_keys_404`, `B11.keys_origin_only`, `B11.keys_origin_csp`, `B11.keys_origin_unset_503` (§4.4 B11b). Package `@opt2-tealbrick/conformance` 0.1.6.
