import { ApiClient } from "@criptonlabs/agent-apis-core";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { FakeTransport } from "../../../core/tests/support/fake-transport.js";
import { createXrplDataClient } from "../../src/infrastructure/http/xrpl-client.js";
import { RESPONSE_SCHEMAS, XRPL_ROUTE_PATHS } from "../../src/infrastructure/http/schemas.js";

type Json = Record<string, any>;
const here = new URL("../fixtures/", import.meta.url);
// Shared with the Solana kit (kit-solana design D10).
const openapi = JSON.parse(
  readFileSync(new URL("../../../../tests/fixtures/openapi.json", import.meta.url), "utf8"),
) as Json;

function resolve(node: Json | undefined): Json {
  let current = node ?? {};
  while (typeof current.$ref === "string") {
    const parts = (current.$ref as string).replace(/^#\//, "").split("/");
    current = parts.reduce<Json>((acc, part) => acc[part], openapi);
  }
  return current;
}

function snapshotSchema(path: string): Json {
  const op = openapi.paths[path].get;
  return resolve(op.responses["200"].content["application/json"].schema);
}

// Enum values of a property: its own `enum`, or those inside its `anyOf` / `oneOf` branches
// (the shape `z.toJSONSchema` emits for a code list, kit-api-sync design D3).
function enumValues(prop: Json): unknown[] | undefined {
  if (Array.isArray(prop.enum)) return prop.enum;
  const branches = [...(prop.anyOf ?? []), ...(prop.oneOf ?? [])].flatMap((branch: Json) => {
    const values = resolve(branch).enum;
    return Array.isArray(values) ? values : [];
  });
  return branches.length > 0 ? branches : undefined;
}

function enums(schema: Json): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [name, raw] of Object.entries<Json>(schema.properties ?? {})) {
    const values = enumValues(resolve(raw));
    if (values) out[name] = [...values].sort((a, b) => String(a).localeCompare(String(b)));
  }
  return out;
}

const FIXTURE_BY_PATH: Record<string, string> = {
  "/v1/xrpl/fee": "fee",
  "/v1/xrpl/health": "health",
  "/v1/xrpl/network/health": "network-health",
  "/v1/xrpl/health/history": "health-history",
  "/v1/xrpl/ledger/latest": "ledger-latest",
  "/v1/xrpl/orderbook": "orderbook",
  "/v1/xrpl/slippage": "slippage",
  "/v1/xrpl/amm/{a}/{b}": "amm",
  "/v1/xrpl/account/{address}/summary": "account-summary",
  "/v1/xrpl/account/{address}/lines": "account-lines",
  "/v1/xrpl/account/{address}/transactions": "account-transactions",
  "/v1/xrpl/token/{asset}": "token",
  "/v1/xrpl/payment-readiness": "payment-readiness",
  "/v1/xrpl/paths": "paths",
};

// Response fields that D3 of kit-api-sync makes forward-compatible code lists, by name.
const CODE_FIELDS = [
  "verdict",
  "reasons",
  "warnings",
  "blockers",
  "checks_failed",
  "status",
  "state",
  "band",
  "amm_status",
  "obligations_status",
  "best",
  "side",
  "cache",
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

const ROUTES = XRPL_ROUTE_PATHS;

describe("OpenAPI snapshot contract", () => {
  it("snapshot is API 0.21.0", () => {
    expect(openapi.info.version).toBe("0.21.0");
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

  for (const path of XRPL_ROUTE_PATHS) {
    it(`schema of ${path} matches the snapshot property names and enums`, () => {
      const kit = z.toJSONSchema(RESPONSE_SCHEMAS[path]) as Json;
      const snap = snapshotSchema(path);
      expect(Object.keys(kit.properties ?? {}).sort((a, b) => a.localeCompare(b))).toEqual(
        Object.keys(snap.properties ?? {}).sort((a, b) => a.localeCompare(b)),
      );
      expect(enums(kit)).toEqual(enums(snap));
    });
  }

  it("every fixture parses with its route schema", () => {
    const files = readdirSync(new URL("responses/", here))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => a.localeCompare(b));
    expect(files).toEqual(Object.values(FIXTURE_BY_PATH).sort((a, b) => a.localeCompare(b)));
    const failing: string[] = [];
    for (const path of XRPL_ROUTE_PATHS) {
      const body = JSON.parse(
        readFileSync(new URL(`responses/${FIXTURE_BY_PATH[path]}.json`, here), "utf8"),
      );
      const parsed = RESPONSE_SCHEMAS[path].safeParse(body);
      if (!parsed.success) failing.push(path);
    }
    expect(failing).toEqual([]);
  });

  it("query parameters the client sends are documented", async () => {
    const A = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
    const B = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
    const I = `USD.${A}`;
    const fake = new FakeTransport().respondWith((request) => {
      const name = FIXTURE_BY_PATH[matchPath(new URL(request.url).pathname)] as string;
      return { body: JSON.parse(readFileSync(new URL(`responses/${name}.json`, here), "utf8")) };
    });
    const api = new ApiClient(
      { network: "xrpl", productToken: "agent-apis-xrpl/0.0.0" },
      { transport: fake.transport },
    );
    const c = createXrplDataClient(api);
    await c.fee();
    await c.health();
    await c.networkHealth();
    await c.healthHistory({ window: "24h" });
    await c.latestLedger();
    await c.orderbook({ base: "XRP", quote: I, depth: 10 });
    await c.slippage({ base: "XRP", quote: I, amount: "1", depth: 10 });
    await c.amm("XRP", I);
    await c.accountSummary(A);
    await c.accountLines(A, { limit: 10, peer: B, marker: "m" });
    await c.accountTransactions(A, { limit: 1, marker: "m" });
    await c.token(I);
    await c.paymentReadiness({
      source: A,
      destination: B,
      asset: "XRP",
      amount: "1",
      destinationTag: 1,
    });
    await c.paths({
      source: A,
      destination: B,
      asset: "XRP",
      amount: "1",
      sendMaxAsset: I,
      sendMax: "2",
      sourceAssets: [I],
    });
    expect(fake.requests).toHaveLength(XRPL_ROUTE_PATHS.length);
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

function matchPath(pathname: string): string {
  for (const template of XRPL_ROUTE_PATHS) {
    const re = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    if (re.test(pathname)) return template;
  }
  throw new Error(`unmatched path ${pathname}`);
}
