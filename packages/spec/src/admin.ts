// Tealbrick Admin (operator plane, C184/C193/C203/C204): the ADMIN route table and its types.
// v0.1.36 (S1): admin.me, customers.search/get, licences comp issue/list/revoke, operator audit list/verify.
//
// The admin table is SEPARATE from ROUTES: it is not in ROUTES, not in /internal/routes and not in ROUTES_DIGEST.
// Core serves it only on its admin listener (TB_ADMIN_PORT, default 8091), never on the main listener, and the Portal GUI
// gateway never forwards it. Every admin request passes four checks (C193):
//   1. separate port (admin listener only),
//   2. admin-GUI service signature (`tb-admin-gw` header, Ed25519 over ADMIN_GATEWAY_SIGNING_INPUT),
//   3. operator Clerk session token (Authorization: Bearer, the Clerk application of that environment, `azp` = admin origin),
//   4. env allowlist TB_ADMIN_OPERATORS on Core (C204): "<email>:<role>" (the Clerk user's PRIMARY email, verified,
//      case-insensitive) or "user_…:<role>", comma separated. No database write and no UI can appoint an operator.
// Step-up (C203): ops with `stepUp: true` need a Clerk session verification younger than ADMIN_STEP_UP_MAX_AGE_MINUTES
// (Clerk reverification; session claim `fva`). Missing or older → 403 step_up_required; the GUI reverifies and retries with
// the same Idempotency-Key. Every admin op writes one operator_audit row (hash chained, append-only, kept 3 years).
import type { WorkspaceId } from "./credentials.ts";
import type { ProductId } from "./manifest.ts";
import type { AccountId, HttpMethod, IsoTime, Licence, LicenceId, OrderId, Page, PageQuery } from "./routes.ts";

type Id<P extends string> = `${P}_${string}`;

/** C204: `readonly` sees masked emails; `support` ⊂ `owner`. */
export type OperatorRole = "owner" | "support" | "readonly";
export const OPERATOR_ROLES = ["readonly", "support", "owner"] as const satisfies readonly OperatorRole[];
/** true when `have` includes the rights of `need` (owner ⊃ support ⊃ readonly). */
export const roleCovers = (have: OperatorRole, need: OperatorRole): boolean => OPERATOR_ROLES.indexOf(have) >= OPERATOR_ROLES.indexOf(need);

export const ADMIN_PATH_PREFIX = "/admin/v1" as const;
/** Default admin listener port on Core (env TB_ADMIN_PORT). */
export const ADMIN_DEFAULT_PORT = 8091 as const;
/** C203: destructive and money-adjacent ops need a Clerk verification younger than this. */
export const ADMIN_STEP_UP_MAX_AGE_MINUTES = 5 as const;

// ───────────────────────────── admin-GUI service signature (check 2) ─────────────────────────────
/** Request header carrying the admin-GUI signature: `v1;ts=<unix s>;rid=<request id>;sig=<base64url Ed25519>`. */
export const ADMIN_GATEWAY_HEADER = "tb-admin-gw" as const;
/** Accepted clock difference between admin-GUI and Core, seconds. A (rid) is accepted once within this window. */
export const ADMIN_GATEWAY_MAX_SKEW_S = 30 as const;
export interface AdminGatewaySigningParts {
  method: HttpMethod;
  /** path + query exactly as sent to Core, starting with /admin/v1 */
  pathAndQuery: string;
  /** lowercase hex sha256 of the raw body bytes; sha256 of the empty string when there is no body */
  bodySha256: string;
  /** 16–64 chars [A-Za-z0-9_-], single use */
  rid: string;
  /** unix seconds */
  ts: number;
}
/** The exact bytes (UTF-8) the admin GUI signs and Core verifies. */
export const ADMIN_GATEWAY_SIGNING_INPUT = (p: AdminGatewaySigningParts): string =>
  ["tb-admin-gw-v1", p.method, p.pathAndQuery, p.bodySha256, p.rid, String(p.ts)].join("\n");

// ───────────────────────────── route row ─────────────────────────────
export type AdminEffect = "read" | "write" | "destructive";
export type AdminRateClass = "admin_read" | "admin_write" | "admin_destructive" | "admin_export";
/** Per operator. `admin_destructive` also has a global daily cap (Core). */
export const ADMIN_RATE_CLASSES = {
  admin_read: { limit: 120, windowMs: 60_000 },
  admin_write: { limit: 20, windowMs: 60_000 },
  admin_destructive: { limit: 5, windowMs: 3_600_000 },
  admin_export: { limit: 3, windowMs: 3_600_000 },
} as const satisfies Record<AdminRateClass, { limit: number; windowMs: number }>;

export interface AdminRouteOp {
  opId: string;
  method: HttpMethod;
  /** absolute, starts with /admin/v1; `{name}` = input field */
  path: string;
  exposure: "admin";
  auth: readonly ["operator"];
  minRole: OperatorRole;
  effect: AdminEffect;
  stepUp: boolean;
  rate: AdminRateClass;
  /** allowed query keys (GET only) */
  query: readonly string[];
  input: AdminSchemaName;
  output: AdminSchemaName;
  /** Idempotency-Key header required */
  idempotent: boolean;
}

// ───────────────────────────── S1 shapes ─────────────────────────────
export type CompGrantId = Id<"cmp">;
export type AdminEnvironment = "dev" | "live";

export interface AdminMe {
  operator: { clerkUserId: string; email: string | null; role: OperatorRole };
  /** from the Core environment (Railway environment `live` → live, anything else → dev) */
  environment: AdminEnvironment;
  /** Stripe mode of this Core's key (CORE-A-03); comps are issued in this mode */
  stripeMode: "test" | "live";
  /** the session's last verification is younger than ADMIN_STEP_UP_MAX_AGE_MINUTES */
  stepUpFresh: boolean;
  stepUpMaxAgeMinutes: number;
  version: string;
}

export type CustomerState = "active" | "closed" | "suspended" | "banned";
/** q: ≥ 3 characters of email or name, or an exact id (acc_, ws_, lic_, ord_, cmp_, user_, Stripe cus_/cs_/pi_). */
export type CustomerSearchInput = PageQuery & { q: string };
export interface CustomerSummary {
  id: AccountId;
  /** masked (`a•••@example.com`) for the readonly role */
  email: string;
  name: string | null;
  state: CustomerState;
  workspaces: number;
  licences: { paid: number; comp: number };
  createdAt: IsoTime;
}
export type CustomerList = Page<CustomerSummary>;
export interface CustomerRef { acc: AccountId }

export interface AdminWorkspace {
  id: WorkspaceId;
  name: string;
  status: "active" | "paused" | "standalone" | "deleted";
  channel: "stable" | "dev";
  infrastructure: { provider: string; destinationName: string } | null;
  bridge: { id: string | null; state: string; health: string | null; healthAt: IsoTime | null };
  apps: { product: ProductId; release: string | null; state: string; health: string | null }[];
  configRevision: number;
  createdAt: IsoTime;
  deletedAt: IsoTime | null;
}
export interface AdminOrder {
  id: OrderId;
  offerId: string;
  state: string;
  amountTotal: number | null;
  currency: string;
  promotionCode: string | null;
  buyerType: string | null;
  createdAt: IsoTime;
  paidAt: IsoTime | null;
}
export interface CustomerDetail {
  account: {
    id: AccountId;
    clerkUserId: string;
    email: string;
    name: string | null;
    state: CustomerState;
    createdAt: IsoTime;
    closedAt: IsoTime | null;
    purgedAt: IsoTime | null;
    termsAcceptedAt: IsoTime | null;
  };
  workspaces: AdminWorkspace[];
  licences: Licence[];
  orders: AdminOrder[];
  comps: CompGrant[];
}

/** Engineering name "comp"; the UI says "Free licence". */
export type CompKind = "promo" | "personal" | "friends" | "partner" | "goodwill";
export const COMP_KINDS = ["promo", "personal", "friends", "partner", "goodwill"] as const satisfies readonly CompKind[];
/** Default length by kind (days); null = lifetime of the major (owner only). */
export const COMP_DEFAULT_DAYS = { promo: 90, goodwill: 30, personal: null, friends: null, partner: null } as const satisfies Record<CompKind, number | null>;
/** support: promo/goodwill only, at most this many days. */
export const COMP_SUPPORT_MAX_DAYS = 90 as const;
/** Max active comps per account per product. */
export const COMP_MAX_ACTIVE_PER_PRODUCT = 3 as const;

export interface CompGrant {
  id: CompGrantId;
  accountId: AccountId;
  product: ProductId;
  major: number;
  kind: CompKind;
  reason: string;
  campaign: string | null;
  /** null = lifetime of this major */
  expiresAt: IsoTime | null;
  state: "active" | "expired" | "revoked";
  licenceId: LicenceId;
  livemode: boolean;
  issuedBy: string;
  issuedAt: IsoTime;
  revokedAt: IsoTime | null;
  revokedBy: string | null;
  revokeReason: string | null;
}
export interface CompIssueInput {
  acc: AccountId;
  product: ProductId;
  major: number;
  kind: CompKind;
  /** 3–300 chars, required */
  reason: string;
  campaign?: string;
  /** omitted → COMP_DEFAULT_DAYS; null → lifetime (owner only) */
  expiresAt?: IsoTime | null;
  /** optional: assign to this workspace of the account when the slot is free */
  assignTo?: WorkspaceId;
}
export interface CompRevokeInput { cmp: CompGrantId; reason: string }
export interface CompChange { comp: CompGrant; licence: Licence; configRevisions: { ws: WorkspaceId; revision: number }[] }
export type CompListInput = PageQuery & { state?: "active" | "all"; acc?: AccountId };
export type CompList = Page<CompGrant>;
export interface CompProducts { items: { product: ProductId; name: string; major: number }[] }

export interface OperatorAuditEntry {
  id: number;
  at: IsoTime;
  operatorId: string;
  role: OperatorRole;
  opId: string;
  subjectKind: string | null;
  subjectId: string | null;
  caseRef: string | null;
  outcome: "ok" | "failed" | "refused";
  reason: string | null;
  requestId: string;
  hash: string;
}
export type OperatorAuditListInput = PageQuery & { operator?: string };
export type OperatorAuditList = Page<OperatorAuditEntry>;
export interface OperatorAuditVerify { ok: boolean; rows: number; brokenAtId: number | null; headHash: string | null }

export interface AdminEmpty { [k: string]: never }

export interface AdminSchemaMap {
  AdminEmpty: AdminEmpty;
  AdminMe: AdminMe;
  CustomerSearchInput: CustomerSearchInput;
  CustomerList: CustomerList;
  CustomerRef: CustomerRef;
  CustomerDetail: CustomerDetail;
  CompIssueInput: CompIssueInput;
  CompRevokeInput: CompRevokeInput;
  CompChange: CompChange;
  CompListInput: CompListInput;
  CompList: CompList;
  CompProducts: CompProducts;
  OperatorAuditListInput: OperatorAuditListInput;
  OperatorAuditList: OperatorAuditList;
  OperatorAuditVerify: OperatorAuditVerify;
}
export type AdminSchemaName = keyof AdminSchemaMap;

// ───────────────────────────── the admin table ─────────────────────────────
const OP = ["operator"] as const;
const NOQ = [] as const;
const PAGE = ["cursor", "limit"] as const;

export const ADMIN_ROUTES = [
  { opId: "admin.me", method: "GET", path: "/admin/v1/me", exposure: "admin", auth: OP, minRole: "readonly", effect: "read", stepUp: false, rate: "admin_read", query: NOQ, input: "AdminEmpty", output: "AdminMe", idempotent: false },
  { opId: "customers.search", method: "GET", path: "/admin/v1/customers", exposure: "admin", auth: OP, minRole: "readonly", effect: "read", stepUp: false, rate: "admin_read", query: ["q", "cursor", "limit"], input: "CustomerSearchInput", output: "CustomerList", idempotent: false },
  { opId: "customers.get", method: "GET", path: "/admin/v1/customers/{acc}", exposure: "admin", auth: OP, minRole: "readonly", effect: "read", stepUp: false, rate: "admin_read", query: NOQ, input: "CustomerRef", output: "CustomerDetail", idempotent: false },
  { opId: "licences.comp_products", method: "GET", path: "/admin/v1/licences/comp-products", exposure: "admin", auth: OP, minRole: "support", effect: "read", stepUp: false, rate: "admin_read", query: NOQ, input: "AdminEmpty", output: "CompProducts", idempotent: false },
  { opId: "licences.comp_list", method: "GET", path: "/admin/v1/licences/comps", exposure: "admin", auth: OP, minRole: "readonly", effect: "read", stepUp: false, rate: "admin_read", query: ["state", "acc", "cursor", "limit"], input: "CompListInput", output: "CompList", idempotent: false },
  { opId: "licences.comp_issue", method: "POST", path: "/admin/v1/licences/comps", exposure: "admin", auth: OP, minRole: "support", effect: "write", stepUp: true, rate: "admin_write", query: NOQ, input: "CompIssueInput", output: "CompChange", idempotent: true },
  { opId: "licences.comp_revoke", method: "POST", path: "/admin/v1/licences/comps/{cmp}/revoke", exposure: "admin", auth: OP, minRole: "owner", effect: "destructive", stepUp: true, rate: "admin_destructive", query: NOQ, input: "CompRevokeInput", output: "CompChange", idempotent: true },
  { opId: "operator_audit.list", method: "GET", path: "/admin/v1/operator-audit", exposure: "admin", auth: OP, minRole: "readonly", effect: "read", stepUp: false, rate: "admin_read", query: ["operator", ...PAGE], input: "OperatorAuditListInput", output: "OperatorAuditList", idempotent: false },
  { opId: "operator_audit.verify", method: "GET", path: "/admin/v1/operator-audit/verify", exposure: "admin", auth: OP, minRole: "owner", effect: "read", stepUp: false, rate: "admin_read", query: NOQ, input: "AdminEmpty", output: "OperatorAuditVerify", idempotent: false },
] as const satisfies readonly AdminRouteOp[];

type AdminRow = (typeof ADMIN_ROUTES)[number];
export type AdminOpId = AdminRow["opId"];

type Check<T extends true> = T;
/** AR1: every admin path is under /admin/v1. */
export type InvariantAdminPaths = Check<[Exclude<AdminRow, { path: `/admin/v1/${string}` }>] extends [never] ? true : false>;
/** AR2: destructive ops always need a step-up. */
export type InvariantDestructiveStepUp = Check<[Extract<AdminRow, { effect: "destructive"; stepUp: false }>] extends [never] ? true : false>;
/** AR3: every mutation is idempotent (the GUI retries after a step-up with the same key). */
export type InvariantAdminWritesIdempotent = Check<[Extract<AdminRow, { method: "POST" | "PUT" | "PATCH" | "DELETE"; idempotent: false }>] extends [never] ? true : false>;
