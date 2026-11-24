import { ApiClient } from "@criptonlabs/agent-apis-core";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { FakeTransport } from "../../../core/tests/support/fake-transport.js";
import { SOLANA_DESCRIPTOR } from "../../src/infrastructure/descriptor.js";
import { createSolanaDataClient } from "../../src/infrastructure/http/solana-client.js";
import { RESPONSE_SCHEMAS, SOLANA_ROUTE_PATHS } from "../../src/infrastructure/http/schemas.js";
import type { SolanaRoutePath } from "../../src/infrastructure/http/schemas.js";

type Json = Record<string, any>;
const here = new URL("../fixtures/", import.meta.url);
// Shared with the XRPL kit (kit-solana design D10).
const openapi = JSON.parse(
  readFileSync(new URL("../../../../tests/fixtures/openapi.json", import.meta.url), "utf8"),
) as Json;

function resolveIn(root: Json, node: Json | undefined): Json {
  let current = node ?? {};
  while (typeof current.$ref === "string") {
    const parts = (current.$ref as string).replace(/^#\//, "").split("/");
    current = parts.reduce<Json>((acc, part) => acc[part], root);
  }
  return current;
}

function resolve(node: Json | undefined): Json {
  return resolveIn(openapi, node);
}

function snapshotSchema(path: string): Json {
  const op = openapi.paths[path].get;
  return resolve(op.responses["200"].content["application/json"].schema);
}

// Non-null branches of a node in the document `root`: `$ref` resolved, `anyOf` / `oneOf`
// flattened and `null` branches dropped (kit-api-sync-0-27 design D3).
function branchesOf(root: Json, node: Json | undefined): Json[] {
  const current = resolveIn(root, node);
  const nested: Json[] = [...(current.anyOf ?? []), ...(current.oneOf ?? [])];
  if (nested.length === 0) return current.type === "null" ? [] : [current];
  return nested.flatMap((branch) => branchesOf(root, branch));
}

// Enum set of a node: the values of its branches' `enum`, without the `null` of a nullable
// `type` array, sorted; undefined when no branch lists values.
function enumSet(root: Json, node: Json | undefined): unknown[] | undefined {
  const values = branchesOf(root, node).flatMap((branch: Json) =>
    Array.isArray(branch.enum) ? branch.enum.filter((v: unknown) => v !== null) : [],
  );
  const byJson = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  return values.length > 0 ? values.sort(byJson) : undefined;
}

function propertiesOf(root: Json, node: Json | undefined): Record<string, Json> | undefined {
  return branchesOf(root, node).find((branch) => branch.properties !== undefined)?.properties;
}

function itemsOf(root: Json, node: Json | undefined): Json | undefined {
  return branchesOf(root, node).find((branch) => branch.items !== undefined)?.items;
}

function sortedKeys(properties: Record<string, Json> | undefined): string[] {
  return Object.keys(properties ?? {}).sort(byName);
}

interface Side {
  root: Json;
  node: Json | undefined;
}

function enumDrift(kit: Side, snap: Side, path: string): string[] {
  const kitEnum = JSON.stringify(enumSet(kit.root, kit.node));
  const snapEnum = JSON.stringify(enumSet(snap.root, snap.node));
  return kitEnum === snapEnum ? [] : [`${path}: enum kit ${kitEnum} snapshot ${snapEnum}`];
}

function propertyDrift(kit: Side, snap: Side, path: string): string[] {
  const kitProps = propertiesOf(kit.root, kit.node);
  const snapProps = propertiesOf(snap.root, snap.node);
  if (kitProps === undefined && snapProps === undefined) return [];
  const kitNames = sortedKeys(kitProps);
  const snapNames = sortedKeys(snapProps);
  const problems =
    JSON.stringify(kitNames) === JSON.stringify(snapNames)
      ? []
      : [`${path}: properties kit ${kitNames.join(",")} snapshot ${snapNames.join(",")}`];
  for (const name of kitNames.filter((n) => snapNames.includes(n))) {
    problems.push(
      ...drift(
        { root: kit.root, node: kitProps?.[name] },
        { root: snap.root, node: snapProps?.[name] },
        `${path}.${name}`,
      ),
    );
  }
  return problems;
}

function itemDrift(kit: Side, snap: Side, path: string): string[] {
  const kitItems = itemsOf(kit.root, kit.node);
  const snapItems = itemsOf(snap.root, snap.node);
  if (kitItems === undefined && snapItems === undefined) return [];
  if (kitItems === undefined || snapItems === undefined) return [`${path}[]: array on one side`];
  return drift(
    { root: kit.root, node: kitItems },
    { root: snap.root, node: snapItems },
    `${path}[]`,
  );
}

// Property-name and enum differences at every object and array-item depth (design D3).
function drift(kit: Side, snap: Side, path: string): string[] {
  return [
    ...enumDrift(kit, snap, path),
    ...propertyDrift(kit, snap, path),
    ...itemDrift(kit, snap, path),
  ];
}

const FIXTURES_BY_PATH: Record<SolanaRoutePath, string[]> = {
  "/v1/solana/slot/latest": ["slot-latest"],
  "/v1/solana/health": ["health"],
  "/v1/solana/health/history": ["health-history"],
  "/v1/solana/token/{mint}": ["token"],
  "/v1/solana/transfer-readiness": ["transfer-readiness-sol", "transfer-readiness-spl"],
};

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`responses/${name}.json`, here), "utf8"));
}

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

// Response fields that D3 of kit-api-sync makes forward-compatible code lists, by name, with the
// enum fields of kit-api-sync-0-27 design D2.
const CODE_FIELDS = [
  "verdict",
  "reasons",
  "warnings",
  "checks_failed",
  "status",
  "state",
  "band",
  "amm_status",
  "obligations_status",
  "best",
  "side",
  "cache",
  "ledger_state",
  "role",
  "direction",
  "server_state",
  "destination_kind",
  "default_account_state",
];

interface CodeField {
  path: string[];
  values: string[];
}

function codeFieldsOf(schema: Json, parents: string[] = []): CodeField[] {
  const found: CodeField[] = [];
  for (const [name, raw] of Object.entries<Json>(resolve(schema).properties ?? {})) {
    const prop = resolve(raw);
    const leaf = prop.type === "array" ? resolve(prop.items) : prop;
    const path = [...parents, name];
    if (CODE_FIELDS.includes(name) && Array.isArray(leaf.enum)) {
      found.push({ path, values: leaf.enum.filter((v: unknown) => typeof v === "string") });
    }
    found.push(...codeFieldsOf(leaf, path));
  }
  return found;
}

function stepInto(node: any): any {
  if (node?.element) return node.element;
  return typeof node?.unwrap === "function" ? node.unwrap() : undefined;
}

function knownOf(node: any): readonly string[] | undefined {
  let current = node;
  while (current && !Array.isArray(current.known)) current = stepInto(current);
  return current?.known;
}

function kitField(schema: unknown, path: string[]): unknown {
  let node: any = schema;
  for (const key of path) {
    while (node && !node.shape) node = stepInto(node);
    node = node?.shape?.[key];
  }
  return node;
}

function knownProblem(known: readonly string[] | undefined, field: CodeField): string | undefined {
  if (!known) return `${field.path.join(".")}: no known list`;
  const absent = field.values.filter((value) => !known.includes(value));
  return absent.length > 0 ? `${field.path.join(".")}: missing ${absent.join(", ")}` : undefined;
}

const ROUTES = SOLANA_ROUTE_PATHS;

describe("OpenAPI snapshot contract", () => {
  it("snapshot is API 0.27.0", () => {
    expect(openapi.info.version).toBe("0.27.0");
  });

  it("every OpenAPI code value is in the kit's known list", () => {
    const fields = ROUTES.flatMap((route) =>
      codeFieldsOf(snapshotSchema(route)).map((field) => ({ route, field })),
    );
    const known = fields.map(({ route, field }) => ({
      route,
      field,
      list: knownOf(kitField(RESPONSE_SCHEMAS[route], field.path)),
    }));
    const checked = known.filter(({ list }) => list !== undefined);
    expect(fields.length).toBeGreaterThan(0);
    expect(checked).toHaveLength(fields.length);
    expect(
      known
        .map(({ route, field, list }) => {
          const problem = knownProblem(list, field);
          return problem ? `${route} ${problem}` : undefined;
        })
        .filter((problem) => problem !== undefined),
    ).toEqual([]);
  });

  for (const path of SOLANA_ROUTE_PATHS) {
    it(`schema of ${path} matches the snapshot property names and enums`, () => {
      const kit = z.toJSONSchema(RESPONSE_SCHEMAS[path]) as Json;
      const snap = openapi.paths[path].get.responses["200"].content["application/json"].schema;
      expect(drift({ root: kit, node: kit }, { root: openapi, node: snap }, path)).toEqual([]);
    });
  }

  it("every fixture parses with its route schema", () => {
    const files = readdirSync(new URL("responses/", here))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort(byName);
    expect(files).toEqual(Object.values(FIXTURES_BY_PATH).flat().sort(byName));
    const failing = SOLANA_ROUTE_PATHS.flatMap((path) =>
      FIXTURES_BY_PATH[path].filter(
        (name) => RESPONSE_SCHEMAS[path]?.safeParse(fixture(name)).success !== true,
      ),
    );
    expect(failing).toEqual([]);
  });

  it("query parameters the client sends are documented", async () => {
    const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const B = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
    const M = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const fake = new FakeTransport().respondWith((request) => {
      const path = matchPath(new URL(request.url).pathname);
      return { body: fixture(FIXTURES_BY_PATH[path][0] as string) as object };
    });
    const c = createSolanaDataClient(
      new ApiClient(SOLANA_DESCRIPTOR, { transport: fake.transport }),
    );
    await c.latestSlot();
    await c.health();
    await c.healthHistory({ window: "24h" });
    await c.token(M);
    await c.transferReadiness({ source: A, destination: B, mint: M, amount: "1" });
    expect(fake.requests).toHaveLength(SOLANA_ROUTE_PATHS.length);
    for (const request of fake.requests) {
      const url = new URL(request.url);
      const path = matchPath(url.pathname);
      const documented = (openapi.paths[path].get.parameters ?? [])
        .map((p: Json) => resolve(p))
        .filter((p: Json) => p.in === "query")
        .map((p: Json) => p.name as string);
      for (const key of url.searchParams.keys()) {
        expect(documented, `${path} ${key}`).toContain(key);
      }
    }
  });
});

function matchPath(pathname: string): SolanaRoutePath {
  for (const template of SOLANA_ROUTE_PATHS) {
    const re = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    if (re.test(pathname)) return template;
  }
  throw new Error(`unmatched path ${pathname}`);
}
