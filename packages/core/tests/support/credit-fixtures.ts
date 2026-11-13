import { readFileSync } from "node:fs";
import { expect } from "vite-plus/test";

/** A JSON response fixture of `tests/fixtures/` (see PROVENANCE.md). */
export interface ResponseFixture {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function base64url(byteLength: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength))).toString("base64url");
}

/**
 * A credit token in the API grammar `clc_<kid>.<rid>.<rnd>.<mac>`, built at run time from random
 * bytes so no token is ever stored in a file.
 */
export function creditToken(kid = "k1"): string {
  return `clc_${kid}.${base64url(12)}.${base64url(16)}.${base64url(32)}`;
}

/**
 * Loads `tests/fixtures/<name>.json` as a scripted response; each placeholder key (for example
 * `<credit-token>`) is replaced by its value. The decoded `paymentRequired` copy is dropped.
 */
export function loadFixture(
  name: string,
  replacements: Record<string, string> = {},
): ResponseFixture {
  let text = readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8");
  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.split(placeholder).join(value);
  }
  const { status, headers, body } = JSON.parse(text) as ResponseFixture;
  return { status, headers, body };
}

/** The response with extra members merged into its JSON body. */
export function withBodyMembers(
  response: ResponseFixture,
  members: Record<string, unknown>,
): ResponseFixture {
  return { ...response, body: { ...response.body, ...members } };
}

/** The response with extra headers. */
export function withHeaders(
  response: ResponseFixture,
  headers: Record<string, string>,
): ResponseFixture {
  return { ...response, headers: { ...response.headers, ...headers } };
}

export function decodePaymentRequired(header: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
}

export function encodePaymentRequired(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

/** The body of the XRPL kit's recorded `payment-readiness` response. */
export function readinessBody(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      new URL("../../../xrpl/tests/fixtures/responses/payment-readiness.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

/** Serializes every value as JSON and asserts the token string is absent (design D8); never prints it. */
export function expectTokenAbsent(values: readonly unknown[], token: string): void {
  for (const value of values) {
    expect(JSON.stringify(value).includes(token), "serialized value contains the token").toBe(
      false,
    );
  }
}

/** CAIP-2 of Solana mainnet, the network of the recorded top-up challenge's Solana entries. */
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
/** CAIP-2 of Solana devnet, the chain of a local API Worker with `SOLANA_NETWORK=devnet`. */
export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/** The extension key of an x402 `sign-in-with-x` challenge. */
const SIWX_KEY = "sign-in-with-x";

/** The `info` of a recorded `sign-in-with-x` challenge. */
export interface SiwxInfo {
  domain: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

interface SiwxExtension {
  info: SiwxInfo;
  supportedChains: Record<string, unknown>[];
}

/** What a scenario rewrites in a recorded challenge that carries a `sign-in-with-x` extension. */
export interface SiwxRebinding {
  /** The resource URL: sets `resource.url` and `instance`, and by default `domain` (its host) and `uri`. */
  url: string;
  /** `info` members set after the binding, such as `domain`, `uri`, `nonce` or the timestamps. */
  info?: Partial<SiwxInfo>;
  /** The chains of `supportedChains` (the recorded entry with another `chainId`); absent keeps the recorded list. */
  chainIds?: readonly string[];
}

function siwxExtensionOf(required: Record<string, unknown>): SiwxExtension {
  const extensions = required.extensions as Record<string, SiwxExtension | undefined>;
  const siwx = extensions[SIWX_KEY];
  if (siwx === undefined) throw new Error("fixture has no sign-in-with-x challenge");
  return siwx;
}

function reboundChains(
  recorded: SiwxExtension,
  chainIds: readonly string[] | undefined,
): Record<string, unknown>[] {
  if (chainIds === undefined) return recorded.supportedChains;
  const template = recorded.supportedChains[0] ?? {};
  return chainIds.map((chainId) => ({ ...template, chainId }));
}

/**
 * The recorded challenge `name` (`challenge-fee-credits-only` or `rotation-challenge`) rebound to
 * another resource URL, with its `sign-in-with-x` extension rewritten as the scenario needs; the
 * `PAYMENT-REQUIRED` header and the body stay equal.
 */
export function siwxChallenge(name: string, rebinding: SiwxRebinding): ResponseFixture {
  const recorded = loadFixture(name);
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const siwx = siwxExtensionOf(required);
  const url = new URL(rebinding.url);
  const info = { ...siwx.info, domain: url.host, uri: url.toString(), ...rebinding.info };
  const supportedChains = reboundChains(siwx, rebinding.chainIds);
  const rebound = {
    ...required,
    resource: { url: url.toString() },
    extensions: {
      ...(required.extensions as Record<string, unknown>),
      [SIWX_KEY]: { ...siwx, info, supportedChains },
    },
  };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound, instance: url.pathname },
  };
}

/** The `info` of a response's `sign-in-with-x` challenge, read from its `PAYMENT-REQUIRED` header. */
export function siwxInfo(response: ResponseFixture): SiwxInfo {
  return siwxExtensionOf(decodePaymentRequired(response.headers["payment-required"] ?? "")).info;
}

/** The response with the `sign-in-with-x` challenge removed from its header and body extensions. */
export function withoutSiwx(response: ResponseFixture): ResponseFixture {
  const required = decodePaymentRequired(response.headers["payment-required"] ?? "");
  const { [SIWX_KEY]: _siwx, ...extensions } = required.extensions as Record<string, unknown>;
  const stripped = { ...required, extensions };
  return {
    ...response,
    headers: { ...response.headers, "payment-required": encodePaymentRequired(stripped) },
    body: { ...response.body, ...stripped },
  };
}
/** Official EURC mint on Solana (the API's asset registry). */
export const EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";

/** A `PAYMENT-RESPONSE` header value of a successful settlement. */
export function settlementHeader(settle: {
  transaction: string;
  network: string;
  payer: string;
}): string {
  return Buffer.from(JSON.stringify({ success: true, ...settle })).toString("base64");
}

/**
 * The top-up challenge of bundle `eur-1` (`1.21` EUR), derived from the recorded `usd-starter`
 * one: EUR bundles are paid in EURC on Solana only (the recorded prepaid offer's `assets`), so it
 * keeps the three Solana entries with the EURC mint and `1210000` atomic units and no RLUSD entry.
 */
export function eurOneTopupChallenge(): ResponseFixture {
  const recorded = loadFixture("topup-challenge-usd-starter");
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const path = "/v1/pro/credits/eur-1";
  const accepts = (required.accepts as Record<string, unknown>[])
    .filter((option) => option.network === SOLANA_MAINNET)
    .map((option) => ({ ...option, asset: EURC_MINT, amount: "1210000" }));
  const rebound = { ...required, resource: { url: `https://api.criptonlabs.com${path}` }, accepts };
  const detail = String(recorded.body.detail).replace(
    "Bundle usd-starter: 1 USD",
    "Bundle eur-1: 1.21 EUR",
  );
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound, detail, instance: path },
  };
}

/** The spec-derived top-up 201 with the token and the settlement header built at run time. */
export function topupCreated(
  token: string,
  settlement: string,
  members: Record<string, unknown> = {},
): ResponseFixture {
  const created = loadFixture("topup-201-usd-starter", {
    "<credit-token>": token,
    "<payment-response>": settlement,
  });
  return withBodyMembers(created, members);
}
