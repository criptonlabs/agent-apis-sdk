import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript", "vitest"],
    jsPlugins: ["eslint-plugin-security"],
    options: { typeAware: true, typeCheck: true },
    rules: {
      // Code quality gates (CLAUDE.md): McCabe <= 8, nesting <= 2.
      complexity: ["error", 8],
      "max-depth": ["error", 2],
      // Zero-trust: no dynamic code evaluation.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      // eslint-plugin-security recommended set as errors. detect-object-injection stays off:
      // it flags every typed obj[key] access in TypeScript (false positives).
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-invisible-characters": "error",
      // Test helpers named expect* (e.g. expectInvalid) hold the assertions.
      "vitest/expect-expect": ["warn", { assertFunctionNames: ["expect", "expect*"] }],
    },
    overrides: [
      {
        // Tests read fixtures and build matchers from module-relative constants, never user input.
        files: ["**/tests/**"],
        rules: {
          "security/detect-non-literal-fs-filename": "off",
          "security/detect-non-literal-regexp": "off",
        },
      },
    ],
  },
  fmt: {},
});
