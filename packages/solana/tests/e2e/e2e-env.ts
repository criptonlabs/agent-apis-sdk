import type { Transport } from "@criptonlabs/agent-apis-core";

// Environment, guards and request recording shared by the Solana devnet end-to-end suites
// (CONTRIBUTING.md, "End-to-end checks on the test networks"). Errors name the variable, never its value.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

/** The local API base URL; refuses any host but this machine and any Solana network but devnet. */
export function guardedBaseUrl(): string {
  const baseUrl = requireEnv("CRIPTON_E2E_BASE_URL");
  if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error("CRIPTON_E2E_BASE_URL must point to localhost, 127.0.0.1 or [::1]");
  }
  if (process.env["CRIPTON_SOLANA_NETWORK"] !== "devnet") {
    throw new Error("CRIPTON_SOLANA_NETWORK must be 'devnet'");
  }
  return baseUrl;
}

/** The devnet payer key, read from the environment only and never printed. */
export function payerKey(): string {
  return requireEnv("CRIPTON_SOLANA_PAYER_KEY");
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

/** What a recorded request carried; header values are never kept, only presence and sizes. */
export interface SentRequest {
  method: string;
  path: string;
  authorization: boolean;
  siwx: boolean;
  /** UTF-8 byte length of the `PAYMENT-SIGNATURE` header, `null` when absent. */
  paymentSignatureBytes: number | null;
}

/** A transport that records each request into `log` and sends it with the global fetch. */
export function recordingTransport(log: SentRequest[]): Transport {
  return (url, init) => {
    const headers = new Headers(init.headers);
    const signature = headers.get("payment-signature");
    log.push({
      method: init.method ?? "GET",
      path: new URL(url).pathname,
      authorization: headers.has("authorization"),
      siwx: headers.has("sign-in-with-x"),
      paymentSignatureBytes:
        signature === null ? null : new TextEncoder().encode(signature).byteLength,
    });
    return fetch(url, init);
  };
}
