import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript", "vitest"],
    options: { typeAware: true, typeCheck: true },
    rules: {
      // Test helpers named expect* (e.g. expectInvalid) hold the assertions.
      "vitest/expect-expect": ["warn", { assertFunctionNames: ["expect", "expect*"] }],
    },
  },
  fmt: {},
});
