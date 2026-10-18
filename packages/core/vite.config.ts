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
  test: {
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
