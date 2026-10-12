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
  | "tool_name_too_long";

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
  internalUrl: InternalUrl;
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
  /** keys the app accepts for call proofs */
  bridge: { id: BridgeId; keys: Ed25519PublicJwk[] };
  pause: PauseState;
  revoked: RevokedSet;
  personNbf: EpochS;
  /** companion grants this app presents as `TB-Grant` (K10 compact JWS) */
  grants: CompactJws[];
  agents: { id: AgentId; name: string; mode: AgentMode; status: "active" | "paused" }[];
  standalone?: StandaloneState;
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
  /** bootstrap trust set, pinned (CORE §4) */
  portalKeys: PortalKeyEntry[];
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
  apps: {
    ins: InstanceId;
    state: AppState;
    version: SemVer | null;
    sdkVersion: SemVer | null;
    manifestDigest: Sha256Digest | null;
    lastSeen: IsoTime | null;
    /** holds waiting for the owner, count only (from AppStatus) → canvas badge */
    pendingHolds: number;
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
export interface BeforeHookResponse { allow: boolean; reason?: string }
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
  idempotencyMetaKey: "tealbrick/idempotencyKey",
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
  /** holds waiting for the owner, count only */
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
  /** set by the SDK to the current call id; used for hook re-entry and depth limits */
  parentCall?: CallId;
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
