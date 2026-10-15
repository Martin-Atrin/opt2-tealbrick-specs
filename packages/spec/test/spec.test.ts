import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { SPEC_VERSION } from "../src/index.ts";
import { STANDARD_OPERATIONS } from "../src/manifest.ts";
import { HARNESS_OPTION_IDS, isHarnessOptionId, type ReleaseIndexEntry, type ReleaseIndexKind, ROUTES } from "../src/routes.ts";

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
