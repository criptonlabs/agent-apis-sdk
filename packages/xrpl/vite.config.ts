import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // Declarations come from src only and resolve sibling packages through their published dist (design D2).
    tsconfig: "tsconfig.build.json",
    entry: {
      index: "src/index.ts",
      mcp: "src/mcp.ts",
      "ai-sdk": "src/ai-sdk.ts",
      mastra: "src/mastra.ts",
      eliza: "src/eliza.ts",
      cli: "src/cli.ts",
    },
    format: ["esm"],
    platform: "node",
    dts: true,
    deps: { neverBundle: true },
    fixedExtension: false,
  },
  // Resolve the core package to its TypeScript sources inside this repository (design D1).
  ssr: { resolve: { conditions: ["@criptonlabs/source", "node", "import", "module", "default"] } },
  resolve: { conditions: ["@criptonlabs/source", "node", "import", "module", "default"] },
  test: {
    // The testnet end-to-end run is opt-in and human-run only (design Risks, task 11.1).
    exclude:
      process.env["CRIPTON_E2E"] === "1"
        ? ["**/node_modules/**"]
        : ["**/node_modules/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        "src/domain/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
        "src/application/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
