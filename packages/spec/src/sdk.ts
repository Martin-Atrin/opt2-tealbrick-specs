// Teal Brick opt2 — public API of @opt2-tealbrick/manifest (contract primitives) and
// @opt2-tealbrick/miniapp-sdk (server + client). v0.1, Lead · Specs, 2026-10-11. SDK-API.md is the prose.
// Declarations only: no runtime code. Vocabularies and manifest/credential shapes are imported, never re-declared.

import type {
  AppStatus,
  BridgeOp,
  BridgeOpBodies,
  CallEnvelope,
  ClaimRequest,
  ClaimResponse,
  HookRequest,
  HookResponseByPhase,
  InstanceSlice,
  OpCallBody,
  OpResult,
  ScopeSummaryResult,
} from "./bridge.ts";
import type {
  AgentId,
  BridgeId,
  BridgeRef,
  CallId,
  CallProofBridgeOpClaims,
  CallProofHookClaims,
  CallProofOpClaims,
  ConfigClaims,
  Ed25519PublicJwk,
  FreeCaps,
  GrantClaims,
  InstanceId,
  InstanceRef,
  PersonId,
  PersonTicketLaunchClaims,
  PortalRef,
  Sha256Digest,
  SliceClaims,
  Typ,
  Ulid,
  WorkspaceId,
} from "./credentials.ts";
import type {
  AgentMode,
  CrudAction,
  DynamicCallInput,
  DynamicCatalogEntry,
  DynamicResolution,
  DynamicSearchInput,
  Effect,
  HoldFamily,
  HookPhase,
  Manifest,
  ManifestValidation,
  Operation,
  OperationAudience,
  Skill,
  StandardOperationId,
} from "./manifest.ts";

// Wire shapes owned by bridge.ts / credentials.ts / manifest.ts, re-exported for SDK users (not re-declared).
export type { AppStatus, BridgeOp, BridgeOpBodies, CallEnvelope, ClaimRequest, ClaimResponse, HookRequest, HookResponseByPhase, InstanceSlice, OpCallBody, OpResult, ScopeSummaryResult };

// ════════════════════════════════════════════════════════════════════════════
// §A  @opt2-tealbrick/manifest — pure, synchronous, no I/O
// ════════════════════════════════════════════════════════════════════════════

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Uniform refusal of every verifier and decision function (CORE §8 `code`). */
export interface Refusal {
  ok: false;
  code: string;
  reason: string;
}

// ── Canonical JSON, digest, manifest ──
export declare function canonicalize(value: Json): string;
export declare function digest(value: Json): Sha256Digest;
export declare function validateManifest(json: unknown): ManifestValidation;
export declare function manifestDigest(manifest: Manifest): Sha256Digest;
/** MANIFEST §13: companion declarations checked against the target manifests (Core, conformance). */
export declare function validateCompanions(manifest: Manifest, targets: readonly Manifest[]): ManifestValidation;
/** MANIFEST §13 (CI and CLI only; the one function here that reads files): skill files, frontmatter, variables. */
export declare function validateAppFiles(manifest: Manifest, repoDir: string): Promise<ManifestValidation>;

/** Standard op ids, derived from manifest.ts STANDARD_OPERATIONS (the one declaration). */
export type StandardOpId = StandardOperationId;
/** All standard ops are agent/person ops; the scope summary is the bridge op `scope_summary` (N1). */
export type AudiencedStandardOpId = StandardOpId;

/** One operation as SDK and bridge see it: a manifest op, or an agent/person standard op. Audience is OperationAudience only (N1). */
export type OperationView =
  | (Operation & { standard: false })
  | {
      standard: true;
      id: AudiencedStandardOpId;
      title: string;
      crud: CrudAction[];
      effect: Effect;
      audience: OperationAudience;
      idempotency: "none" | "supported";
      receipt: false;
    };
export declare function withStandardOps(manifest: Manifest): OperationView[];

// ── Keys and JWS ──
export interface Ed25519KeyPair {
  publicJwk: Ed25519PublicJwk;
  /** opaque handle; private material never leaves the holder process */
  privateKey: CryptoKey;
  kid: string;
}
export declare function generateKeyPair(): Promise<Ed25519KeyPair>;
/** RFC 7638 thumbprint = `kid`. */
export declare function thumbprint(jwk: Ed25519PublicJwk): string;

/** A verifier's trusted key set (Portal keys, standalone issuer, bridge keys from the slice, own instance key). */
export interface KeySet {
  keys: { jwk: Ed25519PublicJwk; status: "pending" | "active" | "retired"; issuer: PortalRef | BridgeRef | InstanceRef }[];
}
export declare function keySetFrom(jwks: { keys: Ed25519PublicJwk[] }, issuer: PortalRef | BridgeRef | InstanceRef): KeySet;
/** Adds keys only if `announcedBy` was verified with a key already in `trusted` (CORE §4). */
export declare function keySetAnnounce(trusted: KeySet, announced: KeySet, announcedBy: { kid: string }): KeySet;

export interface JwsExpect {
  typ: Typ;
  aud: string;
  iss: readonly string[];
  /** epoch seconds */
  now: number;
  maxLifetimeS: number;
}
export declare function signJws<C extends object>(typ: Typ, claims: C, key: Ed25519KeyPair): Promise<string>;
/** v0.1.1 (C26): JWS assembly with an external signer (private key outside the process: OS keychain / Secure Enclave). */
export interface ExternalSigner { kid: string; sign(signingInput: string): string | Promise<string> }
export declare function signJwsWithSigner<C extends object>(typ: Typ, claims: C, signer: ExternalSigner): Promise<string>;
export declare function verifyJws<C extends object>(token: string, keys: KeySet, expect: JwsExpect): { ok: true; header: { typ: Typ; kid: string }; claims: C } | Refusal;

/** Instance assertion (`TB-Assert`, typ tb-instance-assert+jwt) bound to method, path and body digest. */
export declare function signInstanceAssertion(input: {
  key: Ed25519KeyPair;
  ins: InstanceId;
  svc?: string;
  bridge: BridgeId;
  method: string;
  pathAndQuery: string;
  body?: Uint8Array;
  now: number;
}): Promise<string>;

// ── Verification context shared by all verifiers ──
export interface TrustContext {
  /** epoch seconds */
  now: number;
  self: InstanceRef;
  ws: WorkspaceId;
  /** workspace bridge id (grant `cnf.brg`) */
  bridge: BridgeId;
  /** Portal keys, or the standalone issuer named by a Portal-signed slice, or (app-alone) the own instance key */
  issuers: KeySet;
  /** call-proof keys = slice `bridge.keys` */
  bridgeKeys: KeySet;
  /** slice `revoked.jtis` */
  revokedJtis: ReadonlySet<Ulid>;
}

export interface VerifiedGrant {
  ok: true;
  token: string;
  claims: GrantClaims;
  caller: { type: "agent"; id: AgentId } | { type: "app"; id: InstanceId };
}
export declare function verifyGrant(token: string, ctx: TrustContext): VerifiedGrant | Refusal;

export interface VerifiedCallProof<C extends CallProofOpClaims | CallProofHookClaims | CallProofBridgeOpClaims = CallProofOpClaims> {
  ok: true;
  claims: C;
}
export declare function verifyCallProof(
  token: string,
  ctx: TrustContext,
  bind: { op: string; inputDigest: Sha256Digest; contextDigest: Sha256Digest; grantJti: Ulid },
): VerifiedCallProof | Refusal;
export declare function verifyHookProof(
  token: string,
  ctx: TrustContext,
  bind: { hook: string; phase: HookPhase; contextDigest: Sha256Digest; inputDigest?: Sha256Digest },
): VerifiedCallProof<CallProofHookClaims> | Refusal;

/** Bridge-only SDK calls (C16 B5): `POST /tb/v1/bridge/<bop>`; bodies = BridgeOpBodies (bridge.ts). */
export declare function verifyBridgeOpProof(
  token: string,
  ctx: TrustContext,
  bind: { bop: BridgeOp; op?: string; inputDigest?: Sha256Digest },
): VerifiedCallProof<CallProofBridgeOpClaims> | Refusal;

/** The ONE skill renderer (N6), used by Core (workspace bundle) and the bridge (per agent). */
export interface SkillVars {
  agent?: { id: AgentId; name: string };
  workspace?: { name: string };
  settings?: Record<string, string | number | boolean>;
  /** `{{scope.<type>.<kind>}}` labels */
  scope?: Record<string, Record<string, string>>;
}
export declare function renderSkill(skill: Skill, body: string, vars: SkillVars): string;

export interface VerifiedTicket {
  ok: true;
  claims: PersonTicketLaunchClaims;
}
/** Accepts only `pur: "launch"` with `aud` = ctx.self. The jti one-time check is the SDK's (DB), not this function's. */
export declare function verifyTicket(token: string, ctx: TrustContext): VerifiedTicket | Refusal;

export declare function verifySlice(token: string, ctx: Omit<TrustContext, "bridgeKeys" | "revokedJtis">): { ok: true; slice: InstanceSlice } | Refusal;
export declare function verifyConfig(token: string, ctx: { now: number; self: BridgeRef; issuers: KeySet }): { ok: true; claims: ConfigClaims; body: unknown } | Refusal;

/** One agent entry of the slice (`rev`, `grants` etc. come from InstanceSlice in bridge.ts). */
export type SliceAgent = InstanceSlice["agents"][number];

// ── Decision functions (CORE §7, C10) ──
export interface GateInput {
  paused: { workspace: boolean; agent: boolean; connection: boolean; instance: boolean };
  grant: string;
  trust: TrustContext;
  op: OperationView;
  /** scope types declared by the target manifest */
  declaredScopeTypes: readonly string[];
}
export interface GateDecision {
  decision: "pass" | "refuse";
  reason: string;
}
/** Bridge only. `tb.hold_status` skips the CRUD check (valid grant suffices, CORE I4). */
export declare function gate(input: GateInput): GateDecision;

export interface AuthorizeInput {
  /** step (0), CORE I1: from the latest instance slice */
  paused: { workspace: boolean; instance: boolean; agent: boolean };
  /** compact K10; `authorize()` re-runs verifyGrant (step 1) */
  grant: string;
  trust: TrustContext;
  /** effective op (dynamic ops: crud/effect/holdFamily from `resolve`) */
  op: { id: string; crud: CrudAction[]; effect: Effect; holdFamily?: HoldFamily; scopeType?: string };
  /** caller's access on the targeted scope instance (or best access when the op spans instances); null when the op has no scopeType */
  access: { level: string; crud: CrudAction[] } | null;
  /** receipts (status run|approved) per effect over each cap's sliding window (`per`), computed by the SDK (CORE I14) */
  usage: Partial<Record<Effect, number>>;
  /** "approved" only when an approved, unconsumed hold matches (caller, op, inputDigest) — SDK-API §4.3 */
  approval: "none" | "approved";
}
export interface Decision {
  decision: "run" | "hold" | "refuse";
  reason: string;
  holdFamily?: HoldFamily | "caps";
}
/** App SDK only. Order: (0) slice pause → verifyGrant → scope access → held family / money → caps → run. */
export declare function authorize(input: AuthorizeInput): Decision;

// ── Vocabularies owned here (others re-exported from manifest.ts / credentials.ts) ──
export declare const RECEIPT_STATUSES: readonly ["run", "held", "approved", "denied", "refused", "failed", "after_failed"];
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export declare const SDK_AUDIT_ACTIONS: readonly [
  "session.signin",
  "session.signout",
  "hold.decide",
  "scope.set",
  "key.set",
  "key.delete",
  "backup.create",
  "backup.restore",
  "migration.apply",
  "claim.complete",
];
export type SdkAuditAction = (typeof SDK_AUDIT_ACTIONS)[number];

// ════════════════════════════════════════════════════════════════════════════
// §B  @opt2-tealbrick/miniapp-sdk — server
// ════════════════════════════════════════════════════════════════════════════

export declare class TbError extends Error {
  constructor(code: string, message: string, httpStatus?: number);
  readonly code: string;
  readonly httpStatus: number;
}

export interface Caller {
  type: "agent" | "app" | "person";
  /** agt_ / ins_ / per_ */
  id: AgentId | InstanceId | PersonId;
  name: string;
  /** agents only */
  mode: AgentMode | null;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, Json>): void;
  info(msg: string, fields?: Record<string, Json>): void;
  warn(msg: string, fields?: Record<string, Json>): void;
  error(msg: string, fields?: Record<string, Json>): void;
}

/** node:sqlite handle restricted to app tables (`tb_*` reserved). */
export interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  transaction<T>(fn: () => T): T;
}

export interface ReceiptHelpers {
  /** redacted, ≤ 280 chars */
  summary(text: string): void;
  /** free JSON ≤ 4 KB, e.g. { subjectKind: "as_me" } */
  meta(value: Json): void;
}

export interface ScopeAccessView {
  /** access for this call's scope instance (null if the op has no scopeType) */
  access: { type: string; id: string | null; level: string; crud: CrudAction[] } | null;
  readable(type: string): Promise<string[]>;
  writable(type: string): Promise<string[]>;
  can(type: string, id: string, crud: CrudAction): Promise<boolean>;
}

/** callApp result = OpResult (bridge.ts); refusals are thrown as TbError. */
export type CompanionResult<O = Json> = OpResult<O>;

export interface OpContext {
  caller: Caller;
  /** null for person calls */
  grant: VerifiedGrant | null;
  op: OperationView;
  scope: ScopeAccessView;
  callId: CallId | null;
  idempotencyKey: string | null;
  /** open hook context: "<product>.<key>" → JSON */
  context: Record<string, Json>;
  receipt: ReceiptHelpers;
  getKey(name: string): Promise<string | null>;
  callApp<O = Json>(product: string, op: string, input: Json, opts?: { idempotencyKey?: string }): Promise<CompanionResult<O>>;
  callServiceHelper<O = Json>(serviceId: string, path: string, body: Json): Promise<O>;
  db: Db;
  log: Logger;
  signal: AbortSignal;
  /** v0.1.3 (C31): bridge public origin from the slice (`bridge.publicUrl`); null until known */
  publicUrl: string | null;
  /** v0.1.3 (C31) */
  workspace: WorkspaceId;
  /** v0.1.3 (C31): create scope instances outside events.agentAdded (person ops, public routes) */
  scopes: Pick<ScopeStore, "instances">;
  /** v0.1.3 (C31): THE app-secret mechanism */
  secrets: AppSecrets;
}

/** v0.1.3 (C31): app secrets sealed under TB_KEK (AAD = name); excluded from export, sealed inside backups. */
export interface AppSecrets {
  put(name: string, value: string): Promise<void>;
  get(name: string): Promise<string | null>;
  delete(name: string): Promise<void>;
}

/** v0.1.3 (C33): `defineApp({ onStart })` runs once after boot and claim. */
export interface StartContext {
  db: Db;
  log: Logger;
  scopes: ScopeStore;
  secrets: AppSecrets;
  getKey(name: string): Promise<string | null>;
  callServiceHelper<O = Json>(serviceId: string, path: string, body: Json): Promise<O>;
}

export type Handler<I = Json, O = Json> = (input: I, ctx: OpContext) => Promise<O>;
export interface HandlerSpec<I = Json, O = Json> {
  run: Handler<I, O>;
  /** scope instance id the call targets; null = spans instances (handler filters with ctx.scope) */
  scope?: (input: I, caller: Caller) => string | null;
  /** receipt summary (≤ 280, no secrets) */
  redact?: (input: I, output?: O) => string;
  /** owner-facing hold text (≤ 16 000; longer → refuse hold_view_too_large) */
  holdView?: (input: I) => string;
}

// ── Hooks (CORE §8) ──
export interface HookContext {
  log: Logger;
  db: Db;
  getKey(name: string): Promise<string | null>;
  signal: AbortSignal;
  /** v0.1.3 (C31) */
  secrets: AppSecrets;
}
export type HookHandler = (req: HookRequest, ctx: HookContext) => Promise<HookResponseByPhase[HookRequest["phase"]]>;

// ── Dynamic ops (CORE §13) ──
export interface DynamicHandlers {
  catalog(query: DynamicSearchInput | null, ctx: HookContext): Promise<DynamicCatalogEntry[]>;
  resolve(tool: string, ctx: HookContext): Promise<DynamicResolution | null>;
  call(tool: string, args: DynamicCallInput["arguments"], ctx: OpContext): Promise<Json>;
}

// ── Public routes (manifest publicRoutes; app verifies) ──
export type PublicHandler = (
  req: Request,
  ctx: {
    log: Logger;
    db: Db;
    getKey(name: string): Promise<string | null>;
    /** v0.1.3 (C31) */
    publicUrl: string | null;
    workspace: WorkspaceId;
    scopes: Pick<ScopeStore, "instances">;
    secrets: AppSecrets;
  },
) => Promise<Response>;

// ── App definition ──
export interface AppEvents {
  agentAdded?(agent: SliceAgent, ctx: { db: Db; scopes: ScopeStore; log: Logger }): Promise<void>;
  agentRemoved?(agent: SliceAgent, ctx: { db: Db; log: Logger }): Promise<void>;
  keysChanged?(names: string[], ctx: { log: Logger }): Promise<void>;
}
export interface AppDefinition<A extends string = never> {
  manifest: Manifest;
  handlers: Record<string, Handler | HandlerSpec>;
  hooks?: Record<string, HookHandler>;
  dynamic?: Record<string, DynamicHandlers>;
  publicRoutes?: Record<string, PublicHandler>;
  /** directory of NNNN_<name>.sql | NNNN_<name>.ts */
  migrations: string;
  backup?: { beforeBackup?(): Promise<void>; afterRestore?(): Promise<void> };
  events?: AppEvents;
  /** app audit actions (typed literal list; no free strings) */
  auditActions?: readonly A[];
  /** v0.1.3 (C33) */
  onStart?(ctx: StartContext): Promise<void>;
}
export interface App {
  readonly manifest: Manifest;
  readonly digest: Sha256Digest;
  readonly operations: readonly OperationView[];
}
export declare function defineApp<A extends string = never>(def: AppDefinition<A>): App;

/** Reads only the TB_* names of SdkEnv; refuses to boot on an invalid manifest, handler set or migration set. */
export declare function startApp(app: App, env: Record<string, string | undefined>): Promise<RunningApp>;
export interface RunningApp {
  readonly status: () => HealthStatus;
  readonly receipts: ReceiptStore;
  readonly scopes: ScopeStore;
  readonly keys: KeyApi;
  readonly audit: AuditLog;
  readonly backups: BackupApi;
  stop(): Promise<void>;
}

// ── Env (one name per setting; SDK-API §13) ──
export interface SdkEnv {
  /** absent only in app-alone mode (TB_STANDALONE=1) */
  TB_INSTANCE_ID?: InstanceId;
  /** companion services only */
  TB_SERVICE?: string;
  TB_ENROL_CODE?: string;
  TB_BRIDGE_URL?: string;
  /** JSON JWKS, public values */
  TB_PORTAL_KEYS?: string;
  TB_KEK: string;
  TB_KEK_PREVIOUS?: string;
  TB_DATA_DIR: string;
  TB_BACKUP_DIR?: string;
  TB_STANDALONE?: "1";
  TB_STANDALONE_RESET?: "1";
  TB_RESTORE_FROM?: string;
  TB_LOG_LEVEL?: "error" | "warn" | "info" | "debug";
}

// ── Receipts and holds (one table) ──
export interface Receipt {
  /** hld_<ULID> when created by a hold, else rcp_<ULID> */
  id: `hld_${Ulid}` | `rcp_${Ulid}`;
  callId: CallId | null;
  caller: { type: "agent" | "app"; id: AgentId | InstanceId; name: string };
  op: string;
  effect: Effect;
  holdFamily: HoldFamily | "caps" | null;
  status: ReceiptStatus;
  inputDigest: Sha256Digest;
  summary: string;
  meta: Json;
  idempotencyKey: string | null;
  /** hold view; present only while held/approved, person reads only */
  view?: string;
  createdAt: number;
  decidedAt: number | null;
  expiresAt: number | null;
  decidedBy: PersonId | "expiry" | null;
}
export interface ReceiptQuery {
  caller?: AgentId | InstanceId;
  op?: string;
  status?: ReceiptStatus | ReceiptStatus[];
  cursor?: string;
  limit?: number;
}
export interface ReceiptStore {
  get(id: Receipt["id"]): Promise<Receipt | null>;
  list(q: ReceiptQuery): Promise<{ items: Receipt[]; nextCursor: string | null }>;
  /** counters for authorize(): receipts with status run|approved per effect inside each cap window */
  usage(caller: AgentId | InstanceId, caps: FreeCaps, now: number): Promise<Partial<Record<Effect, number>>>;
  holdStatus(caller: AgentId | InstanceId, holdId: string): Promise<{ status: ReceiptStatus; decidedAt: number | null; expiresAt: number | null } | null>;
}
/** Person only (tb.holds_decide). */
export interface HoldDecideInput {
  holdId: `hld_${Ulid}`;
  decision: "approve" | "deny";
  note?: string;
}
export declare function decideHold(principal: PersonPrincipal, input: HoldDecideInput): Promise<Receipt>;

/** Idempotency outcome before a handler runs (SDK-API §4.4). */
export type IdempotencyCheck =
  | { kind: "new" }
  | { kind: "replay"; output: Json }
  | { kind: "held"; holdId: string }
  | { kind: "conflict" };

// ── Scope store ──
export interface ScopeInstance {
  type: string;
  id: string;
  label: string;
  shared: boolean;
}
export interface ScopeGrantRow {
  agent: AgentId;
  type: string;
  instanceId: string;
  /** access level id from manifest scopes[].access */
  access: string;
}
export interface ScopeStore {
  instances: {
    create(type: string, id: string, label: string, opts?: { shared?: boolean; ownerAgent?: AgentId }): Promise<ScopeInstance>;
    list(type: string): Promise<ScopeInstance[]>;
  };
  access(agent: AgentId, type: string, instanceId: string): Promise<ScopeGrantRow | null>;
  best(agent: AgentId, type: string): Promise<ScopeGrantRow | null>;
  list(agent: AgentId): Promise<ScopeGrantRow[]>;
  /** person only (tb.scopes_set); null removes */
  set(principal: PersonPrincipal, agent: AgentId, type: string, instanceId: string, access: string | null): Promise<void>;
  /** applies manifest defaultGrants once per (agent, type) */
  applyDefaults(agent: SliceAgent): Promise<void>;
  /** renders scopes[].summaryTemplate, ≤ 80 chars */
  summary(agent: AgentId): Promise<string>;
}

// ── Keys (CORE §10) ──
export interface KeyStatus {
  name: string;
  required: boolean;
  present: boolean;
  source: "app_own" | "account_default" | null;
}
export interface KeyApi {
  getKey(name: string): Promise<string | null>;
  onKeysChanged(cb: (names: string[]) => void): () => void;
  status(): Promise<KeyStatus[]>;
}
export declare function getKey(name: string): Promise<string | null>;
export declare function onKeysChanged(cb: (names: string[]) => void): () => void;

// ── Health / readiness ──
export type HealthStatus = "ok" | "needs_claim" | "needs_keys" | "slice_stale" | "restoring" | "failed";
export interface Health {
  status: HealthStatus;
  sdk: string;
  version: string;
  manifestDigest: Sha256Digest;
  keys: KeyStatus[];
}
/** Status push body = AppStatus (bridge.ts); the SDK fills `pendingHolds` = count of held receipts (C16 S2). */

// ── Audit ──
export interface AuditEntry {
  id: `aud_${Ulid}`;
  at: number;
  actor: PersonId | "system";
  action: string;
  target: string | null;
  detail: Json;
}
export interface AuditLog {
  record(entry: Omit<AuditEntry, "id" | "at">): Promise<void>;
  list(q: { action?: string; cursor?: string; limit?: number }): Promise<{ items: AuditEntry[]; nextCursor: string | null }>;
}

// ── Backups (tb-backup-<ts>.tar.gz, meta.json format tealbrick.backup/1) and export (tb-export-<ts>.tar.gz) ──
export interface BackupMeta {
  format: "tealbrick.backup/1";
  product: string;
  version: string;
  manifestDigest: Sha256Digest;
  instance: InstanceId;
  sdk: string;
  createdAt: string;
  parts: { name: string; file: string; sha256: string; bytes: number }[];
}
export interface ExportMeta {
  format: "tealbrick.export/1";
  product: string;
  version: string;
  instance: InstanceId;
  sdk: string;
  createdAt: string;
  /** one JSONL file per app table + receipts.jsonl + audit.jsonl */
  files: { file: string; rows: number; sha256: string }[];
}
export interface BackupApi {
  runNow(): Promise<{ file: string; meta: BackupMeta }>;
  list(): Promise<{ file: string; meta: BackupMeta }[]>;
  /** writes tb-export-<ts>.tar.gz to the backup volume and returns its stream (tb.export) */
  exportNow(): Promise<{ file: string; meta: ExportMeta; stream: ReadableStream<Uint8Array> }>;
}

// ── Claim (BRIDGE §10.1): ClaimRequest / ClaimResponse from bridge.ts; performed by startApp and tb-exec ──

// ── Person sign-in (one module) ──
export interface PersonPrincipal {
  type: "person";
  id: PersonId;
  ws: WorkspaceId;
  instance: InstanceId;
  iss: PortalRef | BridgeRef | InstanceRef;
  /** epoch ms; absolute 8 h */
  sessionExpiresAt: number;
}
export declare const SESSION_COOKIE: "tb_session";
export declare const CSRF_HEADER: "TB-CSRF";
export interface SessionInfo {
  principal: PersonPrincipal;
  csrf: string;
}

// ── tb-exec (companion containers; C2, C6) ──
export declare const TB_EXEC_CONTROL_PORT: 7077;
/** CLI: `tb-exec -- <upstream command...>`; env: TB_INSTANCE_ID, TB_SERVICE, TB_ENROL_CODE, TB_BRIDGE_URL, TB_PORTAL_KEYS, TB_KEK, TB_DATA_DIR, TB_LOG_LEVEL. */
export interface TbExecControl {
  "POST /tb/v1/exec/backup": { request: Record<string, never>; response: "application/octet-stream" };
  "POST /tb/v1/exec/restore": { request: "application/octet-stream"; response: { ok: true } };
}

// ── Routes derived from the manifest (SDK-API §3.2) ──
export type SdkRoute =
  | "POST /tb/v1/ops/:op"
  | "POST /tb/v1/hooks/:hookId"
  | "POST /tb/v1/bridge/catalog"
  | "POST /tb/v1/bridge/resolve"
  | "POST /tb/v1/bridge/mark"
  | "POST /tb/v1/bridge/scope-summary"
  | "GET /tb/v1/manifest"
  | "GET /tb/v1/openapi.json"
  | "GET /tb/v1/health"
  | "POST /a/:product/tb/launch"
  | "GET /a/:product/tb/v1/session"
  | "POST /a/:product/tb/v1/logout"
  | "POST /a/:product/tb/v1/ops/:op"
  | "GET /a/:product/tb/standalone"
  | "POST /a/:product/tb/standalone";

/** Answers of POST /tb/v1/ops/:op = OpResult (bridge.ts). */

// ════════════════════════════════════════════════════════════════════════════
// §C  @opt2-tealbrick/miniapp-sdk/client — React (AppShell lives in @opt2-tealbrick/ui)
// ════════════════════════════════════════════════════════════════════════════

/** Minimal React element type so this file needs no React types; the package uses React's own. */
export type ReactNodeLike = unknown;

export interface TbProviderProps {
  product: string;
  children?: ReactNodeLike;
}
export declare function TbProvider(props: TbProviderProps): ReactNodeLike;

export interface UseSession {
  principal: PersonPrincipal | null;
  status: "loading" | "signed_in" | "signed_out";
  signOut(): Promise<void>;
}
export declare function useSession(): UseSession;

export interface UseHolds {
  holds: Receipt[];
  loading: boolean;
  decide(holdId: `hld_${Ulid}`, decision: "approve" | "deny", note?: string): Promise<void>;
}
export declare function useHolds(filter?: { status?: "held" | "approved" | "denied" }): UseHolds;

export interface UseScopes {
  access: ScopeGrantRow[];
  loading: boolean;
  set(agent: AgentId, type: string, instanceId: string, access: string | null): Promise<void>;
}
export declare function useScopes(agent?: AgentId): UseScopes;

export interface UseAgents {
  agents: SliceAgent[];
  loading: boolean;
}
export declare function useAgents(): UseAgents;

/** Same-origin fetch under /a/<product>/ with TB-CSRF; CORE error envelope → TbError. */
export declare function tbFetch(path: string, init?: RequestInit): Promise<Response>;
/** Person op via POST /a/<product>/tb/v1/ops/:op. */
export declare function callOp<O = Json>(op: string, input: Json): Promise<O>;
