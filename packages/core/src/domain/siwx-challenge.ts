import { CriptonPaymentError } from "./errors.js";

/** The x402 extension key of a Sign-In-With-X challenge. */
const SIWX_EXTENSION_KEY = "sign-in-with-x";

/**
 * One chain's `sign-in-with-x` challenge as a SIWX signer signs it: the challenge `info` with one
 * `supportedChains` entry (the shape of the application port `SiwxChallenge`, design D9).
 */
export interface SiwxChallengeFields {
  domain: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  statement?: string;
  chainId: string;
  type: string;
  signatureScheme?: string;
}

/** The members of `X-SIWX-Next-Challenge`: a fresh challenge for the same resource. */
export interface NextChallenge {
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

const INFO_MEMBERS = ["domain", "uri", "version", "nonce", "issuedAt"] as const;
const CHAIN_MEMBERS = ["chainId", "type"] as const;
const NEXT_MEMBERS = ["nonce", "issuedAt", "expirationTime"] as const;
/** One `name="value"` member of `X-SIWX-Next-Challenge`. */
const NEXT_MEMBER = /^(\w+)="([^"]*)"$/;

type ChallengeInfo = Omit<SiwxChallengeFields, "chainId" | "type" | "signatureScheme">;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The named members when every one is a string; otherwise `undefined`. */
function strings<K extends string>(
  source: Record<string, unknown> | undefined,
  keys: readonly K[],
): Record<K, string> | undefined {
  if (source === undefined) return undefined;
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== "string") return undefined;
    picked[key] = value;
  }
  return picked as Record<K, string>;
}

/** An optional string member, left out when it is absent or not a string. */
function optional<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  return typeof value === "string" ? ({ [key]: value } as Record<K, string>) : {};
}

/** The challenge `info` members a signer echoes, or `undefined` when a required one is missing. */
function infoOf(value: unknown): ChallengeInfo | undefined {
  const info = record(value);
  const required = strings(info, INFO_MEMBERS);
  if (info === undefined || required === undefined) return undefined;
  return {
    ...required,
    ...optional("expirationTime", info.expirationTime),
    ...optional("statement", info.statement),
  };
}

/** The challenge for one `supportedChains` entry, or `undefined` when the entry is malformed. */
function chainChallenge(info: ChallengeInfo, entry: unknown): SiwxChallengeFields | undefined {
  const chain = record(entry);
  const members = strings(chain, CHAIN_MEMBERS);
  if (chain === undefined || members === undefined) return undefined;
  return { ...info, ...members, ...optional("signatureScheme", chain.signatureScheme) };
}

/**
 * The challenges of an x402 `extensions` member's `sign-in-with-x` extension, one per valid
 * `supportedChains` entry (design D9); a missing or malformed extension yields none.
 */
function siwxChallenges(extensions: unknown): SiwxChallengeFields[] {
  const siwx = record(record(extensions)?.[SIWX_EXTENSION_KEY]);
  const info = infoOf(siwx?.info);
  const chains: unknown = siwx?.supportedChains;
  if (info === undefined || !Array.isArray(chains)) return [];
  return chains
    .map((entry) => chainChallenge(info, entry))
    .filter((challenge): challenge is SiwxChallengeFields => challenge !== undefined);
}

/** The challenge for the signer's chain, or `undefined` when the extension does not list it. */
export function challengeForChain(
  extensions: unknown,
  chainId: string,
): SiwxChallengeFields | undefined {
  return siwxChallenges(extensions).find((challenge) => challenge.chainId === chainId);
}

/**
 * Refuses a challenge that is not bound to the API origin and the requested resource (design D9):
 * its `domain` must be the base URL's host and its `uri` the base URL's origin plus the request
 * path without query. Nothing is signed for a refused challenge.
 */
export function assertBound(
  challenge: Pick<SiwxChallengeFields, "domain" | "uri">,
  baseUrl: string,
  requestUrl: string,
): void {
  const base = new URL(baseUrl);
  const resource = `${base.origin}${new URL(requestUrl).pathname}`;
  if (challenge.domain === base.host && challenge.uri === resource) return;
  throw new CriptonPaymentError("siwx-challenge-mismatch", []);
}

function memberOf(part: string): readonly [string, string] | undefined {
  const match = NEXT_MEMBER.exec(part.trim());
  const name = match?.[1];
  const value = match?.[2];
  return name === undefined || value === undefined ? undefined : [name, value];
}

/**
 * Parses `X-SIWX-Next-Challenge` (`nonce="…", issuedAt="…", expirationTime="…"`). A missing header,
 * a missing member or an `expirationTime` that is not a timestamp yields `null`: nothing is kept.
 */
export function parseNextChallenge(header: string | null): NextChallenge | null {
  if (header === null) return null;
  const members = header
    .split(",")
    .map(memberOf)
    .filter((member) => member !== undefined);
  const next = strings(Object.fromEntries(members), NEXT_MEMBERS);
  if (next === undefined || Number.isNaN(Date.parse(next.expirationTime))) return null;
  return next;
}

/** Whether the next challenge's `expirationTime` is before the clock's current time. */
export function isExpired(next: NextChallenge, nowMs: number): boolean {
  return Date.parse(next.expirationTime) < nowMs;
}

/** The answered challenge renewed with the next challenge's nonce and validity (same resource and chain). */
export function renewed(challenge: SiwxChallengeFields, next: NextChallenge): SiwxChallengeFields {
  return {
    ...challenge,
    nonce: next.nonce,
    issuedAt: next.issuedAt,
    expirationTime: next.expirationTime,
  };
}
