// Generates fresh secret samples at runtime and asserts `gitleaks stdin` flags each one.
// Nothing generated here is ever written to disk or printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(new URL("../packages/xrpl/package.json", import.meta.url));
const { Wallet, ECDSA } = require("xrpl");

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

function solanaKeypair() {
  for (;;) {
    const bytes = randomBytes(64);
    const text = base58(bytes);
    if (text.length >= 87 && text.length <= 88) return { bytes, text };
  }
}

// Same grammar as the API: `clc_<kid>.<rid>.<rnd>.<mac>`, short kid, base64url parts.
function prepaidToken() {
  const rid = Buffer.from(`xrpl:0:${Wallet.generate().address}`).toString("base64url");
  const part = () => randomBytes(32).toString("base64url");
  return ["clc_k1", rid, part(), part()].join(".");
}

const kp = solanaKeypair();
const samples = {
  "xrpl-family-seed-ed25519": `payer: ${Wallet.generate(ECDSA.ed25519).seed}\n`,
  "xrpl-family-seed-secp256k1": `payer: ${Wallet.generate(ECDSA.secp256k1).seed}\n`,
  "hex-private-key-near-keyword": `private_key = ${randomBytes(32).toString("hex")}\n`,
  "solana-keypair-base58": `key: ${kp.text}\n`,
  "solana-keypair-json-array": `${JSON.stringify([...kp.bytes])}\n`,
  "criptonlabs-prepaid-token": `Authorization: Bearer ${prepaidToken()}\n`,
  "cripton-seed-or-secret-assignment": `${["CRIPTON_XRPL_PAYER", "SEED"].join("_")}=${randomBytes(12).toString("hex")}\n`,
  "cripton-key-assignment": `${["CRIPTON_SOLANA_PAYER", "KEY"].join("_")}=${randomBytes(12).toString("hex")}\n`,
};
const clean = { "clean-text-control": "const answer = 42;\nCRIPTON_TIER=free\n" };

function scan(text) {
  const r = spawnSync(
    "gitleaks",
    [
      "stdin",
      "--config",
      `${root}.gitleaks.toml`,
      "--redact",
      "--no-banner",
      "--log-level",
      "error",
      "--report-format",
      "json",
      "--report-path",
      "-",
    ],
    { input: text, encoding: "utf8" },
  );
  if (r.error) throw r.error;
  const ids = r.stdout.trim() ? JSON.parse(r.stdout).map((f) => f.RuleID) : [];
  return { status: r.status, ids };
}

let failed = 0;
for (const [name, text] of Object.entries(samples)) {
  const { status, ids } = scan(text);
  const detected = status === 1 && ids.includes(name);
  console.log(`${detected ? "detected" : "MISSED  "} ${name}`);
  if (!detected) failed += 1;
}
for (const [name, text] of Object.entries(clean)) {
  const flagged = scan(text).status !== 0;
  console.log(`${flagged ? "FLAGGED " : "clean   "} ${name}`);
  if (flagged) failed += 1;
}
if (failed > 0) {
  console.error(`${failed} secret rule check(s) failed`);
  process.exit(1);
}
console.log("all secret rules verified");
