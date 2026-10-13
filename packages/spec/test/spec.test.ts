import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { STANDARD_OPERATIONS } from "../src/manifest.ts";
import { HARNESS_OPTION_IDS, isHarnessOptionId, ROUTES } from "../src/routes.ts";

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
