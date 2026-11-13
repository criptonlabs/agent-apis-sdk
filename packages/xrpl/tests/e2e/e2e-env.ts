// Environment and guards shared by the XRPL testnet end-to-end suites (CONTRIBUTING.md,
// "End-to-end checks on the test networks"). Errors name the variable, never its value.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

/** The local API base URL; refuses any host but this machine and any XRPL network but testnet. */
export function guardedBaseUrl(): string {
  const baseUrl = requireEnv("CRIPTON_E2E_BASE_URL");
  if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error("CRIPTON_E2E_BASE_URL must point to localhost, 127.0.0.1 or [::1]");
  }
  if (process.env["CRIPTON_XRPL_NETWORK"] !== "testnet") {
    throw new Error("CRIPTON_XRPL_NETWORK must be 'testnet'");
  }
  return baseUrl;
}

/** The testnet payer seed, read from the environment only and never printed. */
export function payerSeed(): string {
  return requireEnv("CRIPTON_XRPL_PAYER_SEED");
}

/** A decimal string the run needs; a missing one fails the test naming only what is missing. */
export function decimalOf(value: string | null | undefined, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} is missing`);
  return value;
}

/** The error a call rejects with, or `undefined` when it resolves. */
export async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => undefined,
    (error: unknown) => error,
  );
}
