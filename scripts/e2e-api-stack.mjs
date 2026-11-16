// Local API stack for the SDK testnet/devnet e2e suites (design D15 of change `kit-api-sync`).
// The API repository (`API_ROOT`) is read only: this script runs `git archive` (and the
// read-only `rev-parse`) on it and reads its four env files; it never edits, installs or starts
// anything inside it. The export of the API's released main (`ce704b9`) lives in the SDK's
// gitignored `.e2e-api/ce704b9/`, together with the generated test secrets. No env value, seed or
// key is ever printed or written elsewhere.
// `start` passes `--test-scheduled` to every `wrangler dev`, since the local stack never fires cron
// triggers by itself; `run` fires the billing Worker's ECB trigger once (the ledger values USD
// amounts with the latest ECB rate) and stops unless it answers 200, then launches the suites.
// Usage (Node 26):
//   node scripts/e2e-api-stack.mjs start                     # API stack on http://localhost:8787
//   node scripts/e2e-api-stack.mjs run <xrpl|solana> [filter]  # ECB trigger, then a kit's test:e2e
import { spawn, spawnSync } from "node:child_process";
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { parseEnv } from "node:util";

const REV = "ce704b9";
const PNPM_VERSION = "11.28.4";
const GATEWAY_PORT = 8787;
const GATEWAY = `http://localhost:${GATEWAY_PORT}`;
// `dev-workers.ts` runs the billing Worker on the gateway port + 200.
const BILLING = `http://localhost:${GATEWAY_PORT + 200}`;
// The billing Worker's ECB cron (`15 15 * * 1-5`, the public ECB daily feed), URL-encoded.
const ECB_TRIGGER = `${BILLING}/__scheduled?cron=15+15+*+*+1-5`;
const SDK_ROOT = join(import.meta.dirname, "..");
const API_ROOT = join(import.meta.dirname, "..", "..", "kryptonianlabs-apis");
const EXPORT_DIR = join(import.meta.dirname, "..", ".e2e-api", REV);
const EXPORT_MARKER = join(EXPORT_DIR, ".sdk-export-complete");
const GENERATED_ENV = join(EXPORT_DIR, "sdk-e2e.env");
// The API env files in the order of its `dev:e2e` script.
const DEV_VARS = join(API_ROOT, ".dev.vars");
const SOLANA_DATA_ENV = join(API_ROOT, ".env.solana-data");
const SOLANA_DEVNET_ENV = join(API_ROOT, ".env.solana-devnet");
const XRPL_TESTNET_ENV = join(API_ROOT, ".env.xrpl-testnet");
const API_ENV_FILES = [DEV_VARS, SOLANA_DATA_ENV, SOLANA_DEVNET_ENV, XRPL_TESTNET_ENV];
const PNPM_CJS = join(
  process.env.COREPACK_HOME ?? join(homedir(), ".cache", "node", "corepack"),
  "v1",
  "pnpm",
  PNPM_VERSION,
  "bin",
  "pnpm.cjs",
);
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// DER PKCS#8 header of an Ed25519 private key; the 32-byte seed follows it.
const ED25519_PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");

function fail(message) {
  console.error(`e2e-api-stack: ${message}`);
  process.exit(1);
}

function apiEnv() {
  return {
    ...parseEnv(readFileSync(DEV_VARS, "utf8")),
    ...parseEnv(readFileSync(SOLANA_DATA_ENV, "utf8")),
    ...parseEnv(readFileSync(SOLANA_DEVNET_ENV, "utf8")),
    ...parseEnv(readFileSync(XRPL_TESTNET_ENV, "utf8")),
  };
}

/** Key names whose merged value would point the stack away from Solana devnet and XRPL testnet. */
export function networkGuardIssues(env) {
  const issues = [];
  if (env.SOLANA_NETWORK !== "devnet") issues.push("SOLANA_NETWORK");
  if (env.XRPL_NETWORK !== "testnet") issues.push("XRPL_NETWORK");
  if ((env.SOLANA_RPC_URL ?? "").toLowerCase().includes("mainnet")) issues.push("SOLANA_RPC_URL");
  return issues;
}

/** Exits non-zero, naming only the keys, unless the merged env targets devnet and testnet. */
export function assertTestNetworks(env) {
  const issues = networkGuardIssues(env);
  if (issues.length === 0) return;
  fail(
    `refusing to start: ${issues.join(", ")} (needs SOLANA_NETWORK=devnet, XRPL_NETWORK=testnet, no mainnet SOLANA_RPC_URL)`,
  );
}

function secret() {
  return randomBytes(32).toString("hex");
}

/** Fresh per-run secrets and the local overrides, as env file text. */
function generatedEnv() {
  const credit = secret();
  const siwx = secret();
  if (credit === siwx) fail("generated CREDIT_TOKEN_SECRET equals SIWX_NONCE_SECRET");
  const values = {
    CREDIT_TOKEN_SECRET: credit,
    CREDIT_TOKEN_KID: "k1",
    SIWX_NONCE_SECRET: siwx,
    BILLING_QUOTE_SECRET: secret(),
    ADMIN_TOKEN: secret(),
    PUBLIC_ORIGIN: GATEWAY,
    XRPL_TESTNET_ISSUER_OVERRIDE: "",
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
}

function checkedRun(command, args, options) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`${args.slice(0, 2).join(" ")} failed`);
}

/** `git archive` of the API at `REV`, unpacked into the export directory, then marked complete. */
function exportRevision() {
  const commit = spawnSync("git", [
    "-C",
    API_ROOT,
    "rev-parse",
    "--verify",
    "--quiet",
    `${REV}^{commit}`,
  ]);
  if (commit.status !== 0) fail(`revision ${REV} not found in the API repository`);
  mkdirSync(EXPORT_DIR, { recursive: true });
  const archive = spawnSync("git", ["-C", API_ROOT, "archive", "--format=tar", REV], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (archive.status !== 0) fail(`git archive ${REV} failed`);
  checkedRun("tar", ["-x", "-f", "-", "-C", EXPORT_DIR], { input: archive.stdout, stdio: "pipe" });
  writeFileSync(EXPORT_MARKER, `${REV}\n`);
}

function install() {
  // CI=1 skips the API's `prepare` script, which would set git hooks on the SDK repository.
  checkedRun(process.execPath, [PNPM_CJS, "install", "--frozen-lockfile"], {
    cwd: EXPORT_DIR,
    env: { ...process.env, CI: "1" },
  });
}

/** The API env files in `dev:e2e` order, then the generated file (last wins, as in wrangler). */
function mergedEnv() {
  return { ...apiEnv(), ...parseEnv(readFileSync(GENERATED_ENV, "utf8")) };
}

function runForeground(command, args, options) {
  const child = spawn(command, args, { stdio: "inherit", detached: true, ...options });
  const forward = (signal) => child.kill(signal);
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

function start(args) {
  if (args.length > 0) fail("start takes no arguments");
  if (Number(process.versions.node.split(".")[0]) < 26) fail("Node 26 is required");
  if (!existsSync(EXPORT_MARKER)) exportRevision();
  install();
  writeFileSync(GENERATED_ENV, generatedEnv(), { mode: 0o600 });
  assertTestNetworks(mergedEnv());
  const envArgs = [...API_ENV_FILES, GENERATED_ENV].flatMap((file) => ["--env-file", file]);
  const path = `${join(EXPORT_DIR, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`;
  const devArgs = [join(EXPORT_DIR, "scripts", "dev-workers.ts"), ...envArgs, "--test-scheduled"];
  runForeground(process.execPath, devArgs, {
    cwd: EXPORT_DIR,
    env: { ...process.env, PATH: path },
  });
}

function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  const zeros = bytes.findIndex((b) => b !== 0);
  return "1".repeat(zeros === -1 ? bytes.length : zeros) + out;
}

/** The 64-byte Solana secret key (seed then public key) and the address of a 32-byte hex seed. */
function solanaPayer(seedHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(seedHex ?? ""))
    fail("X402_E2E_CLIENT_SEED must be 64 hex characters");
  const seed = Buffer.from(seedHex, "hex");
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_HEADER, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  return { key: JSON.stringify([...seed, ...publicKey]), address: base58(publicKey) };
}

function kitEnv(kit, env) {
  if (kit === "xrpl") {
    if (!env.XRPL_TESTNET_PAYER_SEED) fail("XRPL_TESTNET_PAYER_SEED is not set");
    return {
      CRIPTON_XRPL_NETWORK: "testnet",
      CRIPTON_XRPL_PAYER_SEED: env.XRPL_TESTNET_PAYER_SEED,
    };
  }
  const payer = solanaPayer(env.X402_E2E_CLIENT_SEED);
  return {
    CRIPTON_SOLANA_NETWORK: "devnet",
    CRIPTON_SOLANA_PAYER_KEY: payer.key,
    CRIPTON_E2E_SOLANA_SOURCE: payer.address,
  };
}

async function gatewayAnswers() {
  try {
    await fetch(`${GATEWAY}/v1/xrpl/fee`, { signal: AbortSignal.timeout(10_000) });
    return true;
  } catch {
    return false;
  }
}

/** Whether the billing Worker's ECB trigger ran and answered 200. */
async function ecbTriggerAnswers() {
  try {
    const response = await fetch(ECB_TRIGGER, { signal: AbortSignal.timeout(30_000) });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function run(args) {
  const [kit, ...filter] = args;
  if (kit !== "xrpl" && kit !== "solana") fail("run needs xrpl or solana");
  if (!(await gatewayAnswers())) fail(`no gateway answers on ${GATEWAY}; run start first`);
  if (!(await ecbTriggerAnswers()))
    fail(`the billing Worker's ECB trigger on ${BILLING} did not answer 200; restart with start`);
  const env = { ...process.env, ...kitEnv(kit, apiEnv()), CRIPTON_E2E_BASE_URL: GATEWAY };
  runForeground(process.execPath, [PNPM_CJS, "-C", join("packages", kit), "test:e2e", ...filter], {
    cwd: SDK_ROOT,
    env,
  });
}

async function main([mode, ...rest]) {
  if (mode === "start") start(rest);
  else if (mode === "run") await run(rest);
  else fail("usage: start | run <xrpl|solana> [filter]");
}

if (import.meta.main) await main(process.argv.slice(2));
