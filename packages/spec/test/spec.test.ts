import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { SPEC_VERSION } from "../src/index.ts";
import { STANDARD_OPERATIONS } from "../src/manifest.ts";
import { type AccountMe, AUDIT_ACTIONS, type CheckoutInput, type DraftApplyInput, HARNESS_OPTION_IDS, isHarnessOptionId, type Order, type ReleaseIndexEntry, type ReleaseIndexKind, ROUTES, type TermsAcceptInput } from "../src/routes.ts";
import type { BackupHealth, DynamicHandlers, DynamicHoldView, Health } from "../src/sdk.ts";

const dir = new URL("../schemas/", import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));

test("every schema compiles (draft 2020-12)", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  for (const f of readdirSync(dir)) ajv.addSchema(load(f));
  for (const f of readdirSync(dir)) assert.ok(ajv.getSchema(load(f).$id), f);
});

test("example manifest validates", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(load("manifest.schema.json"));
  const ex = JSON.parse(readFileSync(new URL("../examples/notes.manifest.json", import.meta.url), "utf8"));
  assert.equal(validate(ex), true, JSON.stringify(validate.errors));
});

test("route table: unique op ids and method+path", () => {
  const ids = new Set<string>();
  const mp = new Set<string>();
  for (const r of ROUTES) {
    assert.ok(!ids.has(r.opId), r.opId);
    ids.add(r.opId);
    const k = `${r.method} ${r.path}`;
    assert.ok(!mp.has(k), k);
    mp.add(k);
  }
  assert.ok(ROUTES.length >= 100);
});

test("standard operations use the reserved tb. prefix", () => {
  for (const id of STANDARD_OPERATIONS) assert.match(id, /^tb\.[a-z_]+$/);
});

test("harness option ids: one list, unique, canonical spelling, includes claude-code", () => {
  assert.equal(new Set(HARNESS_OPTION_IDS).size, HARNESS_OPTION_IDS.length);
  for (const id of HARNESS_OPTION_IDS) assert.match(id, /^[a-z][a-z0-9-]{1,63}$/);
  assert.equal(isHarnessOptionId("claude-code"), true);
  // CLI runner kinds and old spellings are not harness options (no aliases, C133)
  for (const bad of ["claude-sdk", "command", "claude_code", "generic", "codex", "tealbrick_cli", "", null, 3]) assert.equal(isHarnessOptionId(bad), false, String(bad));
});

test("v0.1.29 (C174): a cli release-index entry is a valid ReleaseIndexEntry; the version constant matches package.json", () => {
  const kinds: ReleaseIndexKind[] = ["app", "bridge", "desktop", "cli"];
  const cli: ReleaseIndexEntry = {
    id: "rel_01JA0000000000000000000009" as ReleaseIndexEntry["id"],
    product: "cli" as ReleaseIndexEntry["product"],
    kind: "cli",
    version: "0.2.0",
    channel: "stable",
    manifestDigest: null,
    manifestUrl: null,
    skillsDigest: null,
    image: null,
    source: null,
    artifact: {
      url: "https://github.com/Martin-Atrin/opt2-tealbrick-dist/releases/download/opt2-tealbrick-cli-cli-v0.2.0/opt2-tealbrick-cli-0.2.0.tgz",
      sha256: `sha256:${"a".repeat(64)}`,
      integrity: `sha512-${"A".repeat(86)}==`,
    },
    services: null,
    runtime: null,
    minOs: null,
    notarized: null,
    upgradeFrom: "*",
    repo: "Martin-Atrin/opt2-tealbrick-cli",
    commit: "e".repeat(40),
    tag: "cli-v0.2.0",
    publishedAt: "2026-10-14T00:00:00.000Z" as ReleaseIndexEntry["publishedAt"],
  };
  assert.ok(kinds.includes(cli.kind));
  // v0.1.30 (C181): kind package, same shape as cli
  const relay: ReleaseIndexEntry = {
    ...cli,
    product: "relay" as ReleaseIndexEntry["product"],
    kind: "package",
    version: "0.1.0",
    artifact: { ...(cli.artifact as NonNullable<ReleaseIndexEntry["artifact"]>), url: "https://github.com/Martin-Atrin/opt2-tealbrick-dist/releases/download/opt2-tealbrick-cli-relay-v0.1.0/opt2-tealbrick-relay-0.1.0.tgz" },
    tag: "relay-v0.1.0",
  };
  const allKinds: ReleaseIndexKind[] = [...kinds, "package"];
  assert.ok(allKinds.includes(relay.kind));
  assert.match(cli.artifact?.integrity ?? "", /^sha512-/);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(SPEC_VERSION, pkg.version);
});

test("v0.1.31 (SDK-03): Health.backup is optional and additive", () => {
  const backup: BackupHealth = { schedule: "ok", lastOkAt: null, lastFailedAt: "2026-10-15T03:17:01.000Z" as BackupHealth["lastFailedAt"], lastError: "backup_failed", failures: 1, overdue: false };
  const old: Health = { status: "ok", sdk: "0.1.21", version: "1.0.0", manifestDigest: `sha256:${"0".repeat(64)}` as Health["manifestDigest"], keys: [] };
  const now: Health = { ...old, backup };
  assert.equal(old.backup, undefined);
  assert.equal(now.backup?.failures, 1);
});

test("v0.1.32 (C196 ENG-1/2/6): terms acceptance row, gate codes and optional AccountMe/Order fields", () => {
  const row = ROUTES.find((r) => r.opId === "account.terms_accept");
  assert.ok(row);
  assert.equal(row.method, "POST");
  assert.equal(row.path, "/me/terms");
  assert.deepEqual([...row.auth], ["browser"]); // a person ticks the box; never the owner CLI, never a draft
  assert.equal(row.draftable, false);
  assert.equal(row.audit, "account.terms_accept");
  assert.ok((AUDIT_ACTIONS as readonly string[]).includes("account.terms_accept"));
  const input: TermsAcceptInput = { documents: [{ doc: "terms", version: "1.0" }, { doc: "dpa", version: "1.0" }, { doc: "aup", version: "1.0" }], onBehalfOfBusiness: true };
  assert.equal(input.documents.length, 3);
  const before: AccountMe = { account: { id: "acc_1", createdAt: "2026-10-15T00:00:00.000Z" }, person: { id: "per_1", email: "", name: null, imageUrl: null }, firstSignIn: true, currentWorkspaceId: null, workspaceCount: 0 };
  const after: AccountMe = { ...before, terms: { current: [{ doc: "terms", version: "1.0", title: "Terms of Service", url: "https://tealbrick.com/terms" }], accepted: false, acceptedAt: null }, mfa: { required: true, enrolled: false } };
  assert.equal(before.terms, undefined);
  assert.equal(after.mfa?.required, true);
  const order: Pick<Order, "business"> = { business: { documents: input.documents, acceptedAt: "2026-10-15T00:00:00.000Z", name: "Novak Dental s.r.o.", taxIdProvided: true, checkoutTerms: "accepted" } };
  assert.equal(order.business?.checkoutTerms, "accepted");
});

test("v0.1.34 (C200, legal v1.1): three checkout boxes, licence not-before, order evidence", () => {
  const consumer: CheckoutInput = { offerId: "off_1", returnPath: "/w", buyer: { termsAccepted: true, business: false, immediateSupply: false } };
  const business: CheckoutInput = { offerId: "off_1", returnPath: "/w", buyer: { termsAccepted: true, business: true } };
  const draftStep: CheckoutInput = { offerId: "off_1", returnPath: "/w" };
  const apply: DraftApplyInput = { drf: "drf_1", revision: 2, confirm: true, buyer: { termsAccepted: true, business: false, immediateSupply: true } };
  assert.equal(consumer.buyer?.immediateSupply, false);
  assert.equal(business.buyer?.business, true);
  assert.equal(draftStep.buyer, undefined);
  assert.equal(apply.buyer?.immediateSupply, true);
  const accept: TermsAcceptInput = { documents: [{ doc: "terms", version: "1.1" }, { doc: "aup", version: "1.1" }, { doc: "privacy", version: "1.1" }, { doc: "dpa", version: "1.1" }] };
  assert.equal(accept.onBehalfOfBusiness, undefined);
  const order: Pick<Order, "business"> = {
    business: { documents: accept.documents, acceptedAt: "2026-10-15T00:00:00.000Z", name: null, taxIdProvided: false, checkoutTerms: null, buyerType: "consumer", withdrawalWaiverAt: null, businessDeclared: false, checkoutAcceptedAt: "2026-10-15T00:01:00.000Z", licenceActiveFrom: "2026-10-30T00:00:00.000Z" },
  };
  assert.equal(order.business?.licenceActiveFrom, "2026-10-30T00:00:00.000Z");
});

test("v0.1.35 (SDK-HV-1): DynamicHandlers.holdView is optional and async; DynamicHoldView {summary?, view}", async () => {
  const base: DynamicHandlers = { catalog: async () => [], resolve: async () => null, call: async () => null };
  assert.equal(base.holdView, undefined);
  const withView: DynamicHandlers = { ...base, holdView: async (tool) => (tool === "x" ? { view: "To: a@b.c" } : null) };
  const v: DynamicHoldView | null | undefined = await withView.holdView?.("x", {}, {} as Parameters<NonNullable<DynamicHandlers["holdView"]>>[2]);
  assert.deepEqual(v, { view: "To: a@b.c" });
  assert.equal(v?.summary, undefined);
});

test("v0.1.36 (C193/C203/C204): ADMIN_ROUTES is separate from ROUTES; admin paths, step-up and idempotency rules", async () => {
  const admin = await import("../src/admin.ts");
  const ids = new Set<string>();
  for (const r of admin.ADMIN_ROUTES) {
    assert.ok(!ids.has(r.opId), r.opId);
    ids.add(r.opId);
    assert.equal(r.exposure, "admin");
    assert.match(r.path, /^\/admin\/v1\//);
    if (r.effect === "destructive") assert.equal(r.stepUp, true, r.opId);
    if (r.method !== "GET") assert.equal(r.idempotent, true, r.opId);
  }
  // ROUTES has no admin row and no /admin path
  for (const r of ROUTES as readonly { exposure: string; path: string }[]) {
    assert.notEqual(r.exposure, "admin");
    assert.ok(!r.path.startsWith("/admin"), r.path);
  }
  assert.equal(admin.roleCovers("owner", "support"), true);
  assert.equal(admin.roleCovers("support", "owner"), false);
  assert.equal(admin.roleCovers("readonly", "readonly"), true);
  const input = admin.ADMIN_GATEWAY_SIGNING_INPUT({ method: "POST", pathAndQuery: "/admin/v1/licences/comps", bodySha256: "e3b0", rid: "r".repeat(16), ts: 1 });
  assert.equal(input, `tb-admin-gw-v1\nPOST\n/admin/v1/licences/comps\ne3b0\n${"r".repeat(16)}\n1`);
  assert.equal(admin.ADMIN_STEP_UP_MAX_AGE_MINUTES, 5);
  assert.equal(SPEC_VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});

test("v0.1.37 (C184 §2.3/§6, Admin S2): suspend/ban/lift + health rows; account_suspended; AccountMe.restriction and Health.commerce optional", async () => {
  const admin = await import("../src/admin.ts");
  const byId = new Map(admin.ADMIN_ROUTES.map((r) => [r.opId, r] as const));
  assert.equal(byId.get("customers.ban")?.minRole, "owner");
  assert.equal(byId.get("customers.ban")?.effect, "destructive");
  assert.equal(byId.get("customers.suspend")?.stepUp, true);
  assert.equal(byId.get("admin.health")?.minRole, "readonly");
  const me: AccountMe = { account: { id: "acc_x", createdAt: "" }, person: { id: "per_x", email: "", name: null, imageUrl: null }, firstSignIn: false, currentWorkspaceId: null, workspaceCount: 0 };
  assert.equal(me.restriction, undefined);
  const h: import("../src/routes.ts").Health = { ok: true, version: "x", db: "ok" };
  assert.equal(h.commerce, undefined);
});
