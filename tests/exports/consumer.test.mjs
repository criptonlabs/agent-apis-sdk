import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const dist = (pkg, entry) => new URL(`packages/${pkg}/dist/${entry}.js`, root);
const load = (pkg, entry) => import(pathToFileURL(dist(pkg, entry).pathname).href);

const ENTRIES = {
  core: ["index", "mcp", "ai-sdk", "mastra", "eliza", "cli"],
  xrpl: ["index", "mcp", "ai-sdk", "mastra", "eliza"],
};

const NAMED = {
  "core/index": ["ApiClient", "CriptonKitError", "assertDecimal", "loadPeer"],
  "xrpl/index": ["createXrplAgentKit", "PaymentNotReadyError"],
  "xrpl/mcp": ["createXrplMcpServer", "startXrplMcpServer"],
  "xrpl/ai-sdk": ["createCriptonXrplTools"],
  "xrpl/mastra": ["createMastraXrplTools"],
  "xrpl/eliza": ["createCriptonXrplPlugin", "criptonXrplPlugin"],
};

for (const [pkg, entries] of Object.entries(ENTRIES)) {
  for (const entry of entries) {
    await test(`${pkg} dist/${entry}.js imports and exposes its named exports`, async () => {
      const mod = await load(pkg, entry);
      for (const name of NAMED[`${pkg}/${entry}`] ?? []) {
        assert.ok(name in mod, `${pkg}/${entry} lacks export ${name}`);
      }
    });
  }
}

await test("data client entries have no static framework import", () => {
  const forbidden = [
    /(?:from|import)\s*\(?\s*["']@modelcontextprotocol\//,
    /(?:from|import)\s*\(?\s*["']ai["']/,
    /(?:from|import)\s*\(?\s*["']@mastra\//,
    /(?:from|import)\s*\(?\s*["']@elizaos\//,
  ];
  for (const pkg of ["core", "xrpl"]) {
    const source = readFileSync(dist(pkg, "index"), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${pkg}/dist/index.js matches ${pattern}`);
    }
  }
});

await test("xrpl package exports no ./cli", () => {
  const manifest = JSON.parse(readFileSync(new URL("packages/xrpl/package.json", root), "utf8"));
  assert.equal(Object.hasOwn(manifest.exports, "./cli"), false);
});
