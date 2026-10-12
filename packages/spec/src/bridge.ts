// opt2 bridge wire types — types + data only (no runtime code). Normative twin of specs/BRIDGE.md,
// specs/workspace-config.schema.json and specs/instance-slice.schema.json (the schemas win on conflict).
// v0.1, Lead · Specs, 2026-10-11. Credential claims and the config/slice credential section come from ./credentials.ts;
// vocabularies and manifest shapes from ./manifest.ts. Nothing here re-declares them.

import type {
  AgentId,
  AgentRef,
  BridgeId,
  BridgeRef,
  CallId,
  ConfigClaims,
  ConnectionEntry,
  ConnectionId,
  Ed25519PublicJwk,
  InstanceId,
  InstanceKeyEntry,
  InstanceRef,
  Kid,
  PauseState,
  PortalKeyEntry,
  RevokedSet,
  Sha256Digest,
  SliceClaims,
  StandaloneState,
  Ulid,
  WorkspaceId,
} from "./credentials.ts";
import type {
  AgentMode,
  CrudAction,
  DynamicCatalogEntry,
  Effect,
  HoldFamily,
  HookHoldFamily,
  HookMatch,
  HookPhase,
  KeySource,
  ProductId,
  SemVer,
  SnakeId,
} from "./manifest.ts";

// ── Common ───────────────────────────────────────────────────────────────────
/** Compact JWS string (`header.payload.signature`). */
export type CompactJws = string;
/** Epoch seconds. */
export type EpochS = number;
/** ISO 8601 UTC timestamp. */
export type IsoTime = string;
/** Private-network origin of an app instance or the bridge internal listener, no path (e.g. `http://svc.internal:8080`). */
export type InternalUrl = string;
/** Runtime service id from manifest `runtime.services[].id`. */
export type ServiceId = string;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

/** The two bridge forms (BRIDGE §2). `relay` never enrols and speaks stdio only (CORE I5). */
export type BridgeForm = "deployed" | "relay";
/** Where an enrolled (full) bridge runs; matches `types/routes.ts` BridgeEnrolInput.form. */
export type EnrolForm = "deployed" | "own_infra";

// ── Error envelope (CORE §8) and bridge refuse codes (BRIDGE §8.4) ───────────
export type BridgeErrorCode =
  | "unauthenticated"
  | "paused"
  | "unknown_tool"
  | "no_grant"
  | "grant_invalid"
  | "grant_expired"
  | "grant_revoked"
  /** v0.1.11 (C70): companion grant minted under an older slice/config revision than the one the bridge holds; the SDK re-reads its slice and retries once */
  | "grant_stale"
  | "crud_exceeds_grant"
  | "audience_not_agent"
  | "scope_type_unknown"
  | "not_in_workflow"
  | "input_invalid"
  | "dynamic_resolve_failed"
  | "dynamic_ceiling_exceeded"
  | "hook_denied"
  | "hook_failed"
  | "hook_reentry"
  | "call_depth_exceeded"
  | "config_expired"
  | "app_unavailable"
  | "app_timeout"
  | "app_error"
  | "after_failed"
  | "payload_too_large"
  | "rate_limited"
  | "sdk_major_unsupported"
  | "code_invalid"
  /** v0.1.5 (C50): companion service claimed before its app; 503 + Retry-After, code not consumed */
  | "app_not_claimed"
  | "manifest_mismatch"
  | "key_not_declared"
  | "key_not_set"
  | "tool_name_too_long"
  /** v0.1.11 (BSD-07): an app / neighbour `internalUrl` outside the private-network forms (BRIDGE §5.7); the app is not routed */
  | "internal_url_refused";

/** One envelope everywhere. App-side codes (e.g. `scope_denied`, `idempotency_conflict`) pass through, hence `string`. */
export interface ErrorEnvelope<C extends string = BridgeErrorCode | (string & {})> {
  error: { code: C; message: string; requestId: string };
}

// ── Workspace config payload (`tb-config+jws`) — workspace-config.schema.json ─
export interface WorkspaceConfig extends Omit<ConfigClaims, "iss">, ConfigCredentialFields {
  /** `tb:portal`, or the bridge itself after standalone (§11). */
  iss: ConfigClaims["iss"] | BridgeRef;
  workspace: { id: WorkspaceId; name: string };
  bridge: { id: BridgeId; publicUrl: string };
  apps: AppEntry[];
  agents: AgentEntry[];
  hooks: HookEntry[];
  skills: SkillsBundle;
  keyRequirements: KeyRequirementEntry[];
  enrolCodes: EnrolCodeEntry[];
}
/** CREDENTIALS §5.1 credential section as it appears in the config body. */
export interface ConfigCredentialFields {
  portalKeys: PortalKeyEntry[];
  pause: PauseState;
  revoked: RevokedSet;
  connections: ConnectionEntry[];
  instanceKeys: InstanceKeyEntry[];
  /** agent→app grants (K10 compact JWS) */
  grants: CompactJws[];
  standalone?: StandaloneState;
}
export interface AppEntry {
  ins: InstanceId;
  product: ProductId;
  version: SemVer;
  sdkMajor: number;
  manifestDigest: Sha256Digest;
  /**
   * v0.1.11 (BSD-07): `http://<name>.railway.internal:<port>`, or — only with `ownInfra: true` — any http(s) origin,
   * which the bridge routes to ONLY when it is listed in its local `TB_OWN_INFRA_ORIGINS` (BRIDGE §5.7).
   */
  internalUrl: InternalUrl;
  /** v0.1.11 (BSD-07): the instance runs on the owner's own infrastructure (neighbour, BRIDGE §10.2). Absent = false. */
  ownInfra?: boolean;
  /** Informational (status/display). Enforcement is absent grants/hooks/tickets; the bridge never decides on it. */
  entitled: boolean;
  /** Portal-signed instance slice (`tb-slice+jws`) relayed to the app. */
  slice: CompactJws;
}
export interface AgentEntry {
  agt: AgentId;
  name: string;
  mode: AgentMode;
}
export interface HookEntry {
  /** `<product>.<hookId>` */
  id: `${ProductId}.${SnakeId}`;
  ins: InstanceId;
  product: ProductId;
  hookId: SnakeId;
  phase: HookPhase;
  order: number;
  /** 100..2000 */
  timeoutMs: number;
  match: HookMatch;
}
export interface SkillsBundle {
  digest: Sha256Digest;
  files: SkillFile[];
}
export interface SkillFile {
  product: ProductId;
  id: string;
  title: string;
  when?: string;
  /** SKILL.md rendered by Core; `{{agent.name}}` / `{{agent.id}}` left for the bridge. */
  content: string;
}
export interface KeyRequirementEntry {
  name: string;
  label: string;
  provider?: string;
  ins: InstanceId;
  product: ProductId;
  required: boolean;
  source: KeySource;
  /** `"app"` or a service id */
  usedBy: ("app" | ServiceId)[];
}
export type EnrolCodeEntry =
  | { digest: Sha256Digest; kind: "instance" | "neighbour"; ins: InstanceId; product: ProductId; exp: EpochS }
  | { digest: Sha256Digest; kind: "service"; ins: InstanceId; service: ServiceId; product?: ProductId; exp: EpochS };

// ── Instance slice payload (`tb-slice+jws`) — instance-slice.schema.json ────
export interface InstanceSlice extends SliceClaims {
  ins: InstanceId;
  product: ProductId;
  portalKeys: PortalKeyEntry[];
  /** keys the app accepts for call proofs; v0.1.10 (C64) `publicUrl` = bridge public origin (OpContext.publicUrl) */
  bridge: { id: BridgeId; keys: Ed25519PublicJwk[]; publicUrl?: string };
  pause: PauseState;
  revoked: RevokedSet;
  personNbf: EpochS;
  /** companion grants this app presents as `TB-Grant` (K10 compact JWS) */
  grants: CompactJws[];
  agents: { id: AgentId; name: string; mode: AgentMode; status: "active" | "paused" }[];
  standalone?: StandaloneState;
  /** v0.1.13 (C86): the Portal GUI origin (`https://…`, no path); apps build owner links (`/w/<ws>/open?product=&path=`) */
  portalUrl?: string;
}

// ── Enrolment (BRIDGE §4) — op `bridge_api.enrol` ───────────────────────────
export interface EnrolRequest {
  /** K6 `tbe_…` from `TB_ENROL_CODE` */
  code: string;
  publicKey: Ed25519PublicJwk;
  version: SemVer;
  /** SDK majors this bridge serves (current + one before) */
  sdkMajors: number[];
  form: EnrolForm;
  publicOrigin: string;
}
export interface EnrolResponse {
  bridgeId: BridgeId;
  workspaceId: WorkspaceId;
  /** bootstrap trust set (CORE §4). v0.1.11: informational when `portalKeySet` is present (CREDENTIALS §9.5). */
  portalKeys: PortalKeyEntry[];
  /** v0.1.11 (C62/C63): current root-signed key-set statement; the bridge verifies it against its build-pinned roots and refuses enrolment if it fails. */
  portalKeySet?: CompactJws;
  configPath: string;
  ackPath: string;
  waitMaxS: number;
}

// ── Config pull (BRIDGE §5.1) — op `bridge_api.config` ──────────────────────
export interface ConfigPullQuery {
  /** `rev` of the last good config */
  after: number;
  /** ≤ 60 */
  wait: number;
}
/** 200: the config JWS itself (`application/jose`); 304: unchanged after `wait`. */
export type ConfigPullResponse = { status: 200; body: CompactJws } | { status: 304 };

// ── Status report = ack (BRIDGE §5.6) — op `bridge_api.ack` ─────────────────
export type AppState = "ok" | "degraded" | "down" | "needs_keys" | "unclaimed" | "paused";
export interface StatusReport {
  rev: number;
  appliedAt: IsoTime;
  bridge: {
    id: BridgeId;
    version: SemVer;
    form: EnrolForm;
    /** random id per process start; two alternating values → `bridge_duplicate` */
    boot: string;
    sdkMajors: number[];
    mcpVersions: string[];
  };
  portalReachable: boolean;
  /** v0.1.11: JCS digest() of the `portalKeys` array the bridge trusts after applying `rev`; Core compares it with what it signed (BSD-08 alert) */
  portalKeysDigest?: Sha256Digest;
  apps: {
    ins: InstanceId;
    state: AppState;
    version: SemVer | null;
    sdkVersion: SemVer | null;
    manifestDigest: Sha256Digest | null;
    lastSeen: IsoTime | null;
    /** holds waiting for the owner, count only (from AppStatus) → canvas badge */
    pendingHolds: number;
    /** v0.1.11: AppStatus.sliceRevision the app last reported (omitted before its first report); Core uses it for key transition tracking (BSD-15) */
    sliceRevision?: number;
  }[];
  /** presence booleans only — never values */
  keys: { name: string; ins: InstanceId; set: boolean }[];
  /** display-only, ≤ 80 chars, no third-party identifiers */
  scopeSummaries: { agt: AgentId; ins: InstanceId; label: string }[];
  connectionsCreated: { con: ConnectionId; agt: AgentId; method: "pairing"; clientName: string; createdAt: IsoTime; pairingJti: Ulid }[];
  connectionsRevoked: { con: ConnectionId; reason: "refresh_reuse" | "client_revoke" }[];
  claims: ClaimRecord[];
  rejected: { kind: "config" | "grant" | "slice" | "assertion" | "ticket" | "pairing" | "claim"; code: BridgeErrorCode | string; count: number }[];
  toolsOmitted: { ins: InstanceId; name: string; code: "tool_name_too_long" | "name_collision" | "ceiling" }[];
}
export interface ClaimRecord {
  kind: EnrolCodeEntry["kind"];
  ins: InstanceId;
  service?: ServiceId;
  publicKey: Ed25519PublicJwk;
  manifestDigest: Sha256Digest;
  version: SemVer;
  internalUrl?: InternalUrl;
  /** digest only; the code itself never travels to Portal */
  codeDigest: Sha256Digest;
  claimedAt: IsoTime;
}

// ── Bridge → app call (CORE §8, BRIDGE §8.1) ────────────────────────────────
/** Body of `POST <internalUrl>/tb/v1/ops/<op>` (headers: `Authorization: Bearer <grant>`, `TB-Call`). */
export interface OpCallBody<I = JsonValue> {
  input: I;
  /** open JSON; keys `<product>.<key>` added by context hooks */
  context: JsonObject;
  /** from MCP `_meta["tealbrick/idempotencyKey"]` (CORE §8) or `CallEnvelope.idempotencyKey` */
  idempotencyKey?: string;
}
export type OpResult<O = JsonValue> =
  | { status: "ok"; output: O; receiptId?: string }
  | { status: "held"; holdId: string; expiresAt: IsoTime };

// ── Hooks (CORE §8, BRIDGE §8.2) — `POST <internalUrl>/tb/v1/hooks/<hookId>` ─
export interface HookCallInfo {
  id: CallId;
  ws: WorkspaceId;
  caller: { type: "agent" | "app"; id: AgentId | InstanceId; mode?: AgentMode };
  target: { instance: InstanceId; product: ProductId; op: SnakeId; crud: CrudAction[]; effect: Effect; holdFamily?: HoldFamily };
  input?: JsonValue;
}
export interface HookRequestBase<P extends HookPhase> {
  phase: P;
  call: HookCallInfo;
  context: JsonObject;
}
export type BeforeHookRequest = HookRequestBase<"before">;
export type ContextHookRequest = HookRequestBase<"context">;
export interface AfterHookRequest extends HookRequestBase<"after"> {
  /** the app's ok output (after hooks run only on `ok`) */
  output: JsonValue;
}
export type HookRequest = BeforeHookRequest | ContextHookRequest | AfterHookRequest;
/** v0.1.13 (G1): `{allow: false, hold}` = hold verdict (never with allow true). Bridge precedence over the chain:
 *  any refuse wins at once; else the FIRST hold is kept, later before hooks still run (and may refuse); then forwarded
 *  with the verdict in the call proof (`hv`). The bridge re-runs the chain on the retry after approval (C82). */
export interface BeforeHookResponse { allow: boolean; reason?: string; hold?: HookHoldVerdict }
export interface HookHoldVerdict {
  family: HookHoldFamily;
  /** 1..280 chars, shown to the owner and the agent */
  reason: string;
}
/** every key MUST start with `<hook product>.` */
export interface ContextHookResponse { add: Record<`${ProductId}.${string}`, JsonValue> }
export interface AfterHookResponse {
  output?: JsonValue;
  /** JSON pointers into the output to remove */
  redactions?: string[];
}
export interface HookResponseByPhase {
  before: BeforeHookResponse;
  context: ContextHookResponse;
  after: AfterHookResponse;
}
// ── Bridge-only SDK calls (C16 B5): `POST <internalUrl>/tb/v1/bridge/<bop>` with a `CallProofBridgeOpClaims`
//    proof (types/credentials.ts, verified by `verifyBridgeOpProof`); no grant, no hooks.
export type BridgeOp = "catalog" | "resolve" | "mark" | "scope_summary";
export interface BridgeOpCatalogBody { op: SnakeId; query?: string; limit?: number }
export interface BridgeOpResolveBody { op: SnakeId; tool: string }
export interface BridgeOpMarkBody { call: CallId; mark: "after_failed" }
export type BridgeOpScopeSummaryBody = Record<string, never>;
export interface BridgeOpBodies {
  catalog: BridgeOpCatalogBody;
  resolve: BridgeOpResolveBody;
  mark: BridgeOpMarkBody;
  scope_summary: BridgeOpScopeSummaryBody;
}
export interface ScopeSummaryResult { agent: AgentId; label: string }

// ── MCP surface (BRIDGE §7) ──────────────────────────────────────────────────
export const TOOL_NAME_RULE = {
  separator: "__",
  pattern: "^[a-z0-9_-]+$",
  maxLength: 64,
  holdStatusOp: "tb_hold_status",
  skillsOp: "tb_skills",
  searchSuffix: "_search",
  callSuffix: "_call",
  idempotencyMetaKey: "tealbrick/idempotencyKey", // gitleaks:allow (MCP _meta key name, not a secret)
  /** v0.1.13 (G4b): runner-set claim, copied UNVERIFIED into context `tb.onBehalfOf` */
  onBehalfOfMetaKey: "tealbrick/onBehalfOf",
  skillUriPrefix: "tealbrick://skills/",
} as const;
/** `<product>__<op>`, `<product>__<op>_search|_call`, `<product>__<dynamic list entry>`, `<product>__tb_hold_status`. */
export type ToolName = `${ProductId}__${string}`;
export type ParsedToolName =
  | { kind: "op"; product: ProductId; op: SnakeId }
  | { kind: "dynamic_entry"; product: ProductId; op: SnakeId; entry: DynamicCatalogEntry["name"] }
  | { kind: "dynamic_search"; product: ProductId; op: SnakeId }
  | { kind: "dynamic_call"; product: ProductId; op: SnakeId }
  | { kind: "hold_status"; product: ProductId }
  /** bridge-answered fallback read tool (C16 S10) */
  | { kind: "skills"; product: ProductId };
export type SkillResourceUri = `tealbrick://skills/${ProductId}/${string}`;
/** `structuredContent` of a held tool result (not an error). */
export interface HeldToolResult {
  status: "held";
  holdId: string;
  expiresAt: IsoTime;
  checkWith: ToolName;
}
export interface HoldStatusToolInput { holdId: string }
export interface SkillsToolInput { skillId?: string }

// ── OAuth AS (BRIDGE §6) ─────────────────────────────────────────────────────
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: [string];
  bearer_methods_supported: ["header"];
}
export interface DcrRequest {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: "none";
  grant_types?: ("authorization_code" | "refresh_token")[];
  response_types?: ["code"];
}
export interface DcrResponse {
  /** bridge-signed, self-contained registration (no client table) */
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: ("authorization_code" | "refresh_token")[];
  response_types: ["code"];
}
export interface TokenResponse {
  /** K5 access (`tb-agent-session+jwt`) */
  access_token: CompactJws;
  token_type: "Bearer";
  expires_in: 900;
  /** `tbr_…`; pairing connections only (key connections re-assert with K4) */
  refresh_token?: string;
}

// ── Bridge internal API (BRIDGE §3.2, §8.3, §9.4, §10) ─────────────────────
/** `POST /tb/v1/claim` (no assertion yet; the K6 code authenticates). */
export interface ClaimRequest {
  code: string;
  instancePublicKey: Ed25519PublicJwk;
  manifestDigest: Sha256Digest;
  version: SemVer;
  sdkVersion: SemVer;
  service?: ServiceId;
  /** neighbours (own infrastructure) only */
  internalUrl?: InternalUrl;
}
export interface ClaimResponse {
  ins: InstanceId;
  bridge: { id: BridgeId; publicKey: Ed25519PublicJwk; internalUrl: InternalUrl };
  /** absent until Core lists the key in `instanceKeys` */
  slice?: CompactJws;
  /** services only: the instance key `tb-exec` accepts on its control port */
  app?: { publicKey: Ed25519PublicJwk };
  /** services only: declared keys and the env names `tb-exec` injects */
  serviceKeys?: { name: string; env: string }[];
}
/** `POST /tb/v1/status?wait=60` with `TB-Assert`. */
export interface AppStatus {
  readiness: "ready" | "needs_keys" | "degraded";
  version: SemVer;
  sdkVersion: SemVer;
  scopesRev: number;
  sliceRevision: number;
  keysRev: number;
  /** items waiting for the owner, count only = held receipts + `pendingCount()` (v0.1.13, C86) */
  pendingHolds: number;
}
/** 200 when the slice or keysRev changed; otherwise 204 after `wait`. */
export interface AppStatusResponse {
  slice: CompactJws;
  sliceRevision: number;
  keysRev: number;
}
/** `GET /tb/v1/keys/<name>` with `TB-Assert`; `Cache-Control: no-store`. */
export interface KeyFetchResponse {
  name: string;
  value: string;
  keysRev: number;
}
/** `POST /tb/v1/call` with `TB-Assert` + `TB-Grant` (companion path). Result: `OpResult` or `ErrorEnvelope`. */
export interface CallEnvelope<I = JsonValue> {
  target: ProductId;
  op: SnakeId;
  input: I;
  idempotencyKey?: string;
  /** set by the SDK to the current call id; used for hook re-entry and depth limits. v0.1.13 (C85): ABSENT for
   *  app-initiated calls (StartContext / events ctx / timers): the bridge audits them `call.app_initiated`. */
  parentCall?: CallId;
}

// ── Reserved context (v0.1.13, G4b) ─────────────────────────────────────────
/** The `tb.` context namespace is bridge-only: a context hook answer with a `tb.*` key is refused (hook_failed). */
export const RESERVED_CONTEXT_PREFIX = "tb." as const;
/** `_meta["tealbrick/onBehalfOf"]` as the runner sends it (≤ 1 KB JCS, else dropped). */
export interface OnBehalfOfClaim {
  kind: "person" | "agent" | "channel_sender";
  /** channel_sender: `"<channel>:<value>"`, channel `[a-z0-9_-]{1,32}` (buzz | slack | telegram …), value = Connect's sender
   *  value (Buzz npub, Slack user id, Telegram numeric id); consumers MAY read a bare `npub1…` as `buzz:` */
  id: string;
  display?: string;
}
/** Context key `tb.onBehalfOf`. Unverified = a claim: consumers may use it to NARROW, never to widen access.
 *  Later (Martin Q5): `verified: true` + `attestation` (e.g. a Connect-signed sender) — same key, pluggable. */
export interface OnBehalfOfContext {
  claim: OnBehalfOfClaim;
  verified: false;
  via: "mcp_meta";
}
export type CompanionCallResponse<O = JsonValue> = OpResult<O> | ErrorEnvelope;

/** Request headers the bridge reads or writes (one name per purpose). */
export const BRIDGE_HEADERS = {
  assertion: "TB-Assert",
  callProof: "TB-Call",
  companionGrant: "TB-Grant",
  csrf: "TB-CSRF",
} as const;

/** Bridge-internal routes (private listener) and SDK routes the bridge calls. */
export const BRIDGE_INTERNAL_PATHS = {
  claim: "/tb/v1/claim",
  status: "/tb/v1/status",
  keys: "/tb/v1/keys/{name}",
  call: "/tb/v1/call",
  metrics: "/metrics",
} as const;
export const SDK_PATHS_CALLED_BY_BRIDGE = {
  op: "/tb/v1/ops/{op}",
  hook: "/tb/v1/hooks/{hookId}",
  manifest: "/tb/v1/manifest",
  bridgeCatalog: "/tb/v1/bridge/catalog",
  bridgeResolve: "/tb/v1/bridge/resolve",
  bridgeMark: "/tb/v1/bridge/mark",
  bridgeScopeSummary: "/tb/v1/bridge/scope-summary",
} as const;

// ── Standalone admin (BRIDGE §11, C16 B7): exactly 4 ops, owner assertion ─
export const STANDALONE_ADMIN_PATHS = {
  pause: "/admin/v1/pause",
  resume: "/admin/v1/resume",
  revokeConnection: "/admin/v1/revoke-connection",
  ticket: "/admin/v1/ticket",
} as const;
/** without `agt` = workspace kill switch */
export interface AdminPauseBody { agt?: AgentId }
export type AdminResumeBody = AdminPauseBody;
export interface AdminRevokeConnectionBody { con: ConnectionId }
export interface AdminTicketBody { pur: "launch" | "keys"; product?: ProductId }
export interface AdminTicketResult { ticket: CompactJws; url: string }

// ── Persistent bridge state records (BRIDGE §1.2; volume layout is internal, shapes are normative) ─
export interface PairingConnectionRecord {
  con: ConnectionId;
  agt: AgentId;
  refreshDigest: Sha256Digest;
  gen: number;
  /** CORE I12: the immediately previous refresh token, accepted once until `previousUntil` (now + 30 s at rotation) */
  previousDigest: Sha256Digest | null;
  previousUntil: EpochS | null;
  previousUsed: boolean;
  expiresAt: EpochS;
  clientName: string;
  createdAt: EpochS;
  /** true once a config lists this connection */
  reported: boolean;
}
export interface BridgeIdentityRecord {
  bridgeId: BridgeId;
  workspaceId: WorkspaceId;
  kid: Kid;
  publicKey: Ed25519PublicJwk;
  /** CREDENTIALS §9.1 sealed private key */
  sealedPrivateKey: unknown;
  portalKeys: PortalKeyEntry[];
  enrolCodeDigest: Sha256Digest;
}

// Re-exported refs so implementers import bridge-facing identity types from one place.
export type { AgentRef, BridgeRef, InstanceRef };
