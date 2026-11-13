import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import type { KitConfig, RotationResult } from "../../../src/application/ports.js";
import { CriptonPaymentError, CriptonProblemError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import {
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  creditToken,
  expectTokenAbsent,
  loadFixture,
  siwxChallenge,
  siwxInfo,
  withBodyMembers,
  withoutSiwx,
  type ResponseFixture,
  type SiwxInfo,
} from "../../support/credit-fixtures.js";
import { FakeClock } from "../../support/fake-clock.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeSiwxSigner, fakeSiwxProof } from "../../support/fake-siwx-signer.js";
import { FakeTransport, type ScriptedResponse } from "../../support/fake-transport.js";

const solana = { network: "solana", productToken: "agent-apis-solana/0.1.0" };
/** A local API Worker whose `PUBLIC_ORIGIN` is `http://localhost:8787` (design D15). */
const BASE_URL = "http://localhost:8787";
const SLOT_URL = `${BASE_URL}/v1/pro/solana/slot/latest`;
const HEALTH_URL = `${BASE_URL}/v1/pro/solana/health`;
const ROTATION_URL = `${BASE_URL}/v1/pro/credits/token`;
const slotSchema = z.object({ slot: z.number() });
/** `X-Credits-Remaining: EUR=0.9995;USD=0` of the spec-derived SIWX-debited answer. */
const BALANCE = { EUR: "0.9995", USD: "0" };
const FIVE_MINUTES_MS = 5 * 60_000;

/** The spec-derived SIWX-debited answer of the slot route, carrying `X-SIWX-Next-Challenge`. */
const debitedWithNext = () => loadFixture("siwx-next-challenge");
const SLOT = debitedWithNext().body.slot;

/** The same SIWX-debited answer without a next challenge. */
function debited(): ResponseFixture {
  const recorded = debitedWithNext();
  const { "x-siwx-next-challenge": _next, ...headers } = recorded.headers;
  return { ...recorded, headers };
}

/** The members of the recorded `X-SIWX-Next-Challenge` header. */
function nextChallengeOf(response: ResponseFixture): Record<string, string> {
  const header = response.headers["x-siwx-next-challenge"] ?? "";
  const members = [...header.matchAll(/(\w+)="([^"]*)"/g)];
  return Object.fromEntries(members.map((match) => [match[1] ?? "", match[2] ?? ""]));
}

const NEXT = nextChallengeOf(debitedWithNext());
const NEXT_NONCE = NEXT.nonce ?? "";
/** A time inside the kept next challenge's validity. */
const REUSE_AT = Date.parse(NEXT.issuedAt ?? "") + 30_000;
/** A time after the kept next challenge's `expirationTime`. */
const EXPIRED_AT = Date.parse(NEXT.expirationTime ?? "") + 1_000;

const isoSeconds = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * A fresh challenge's nonce and timestamps, issued at `issuedAtMs` for five minutes; as in the
 * spec-derived fixtures, nonce bytes 0-3 are the `issuedAt` seconds and bytes 4-15 a fixed hash.
 */
function freshInfo(issuedAtMs: number): Pick<SiwxInfo, "nonce" | "issuedAt" | "expirationTime"> {
  const seconds = Math.floor(issuedAtMs / 1000);
  const tail = createHash("sha256").update(`fresh-challenge-${seconds}`).digest("hex").slice(0, 24);
  return {
    nonce: `${seconds.toString(16)}${tail}`,
    issuedAt: isoSeconds(issuedAtMs),
    expirationTime: isoSeconds(issuedAtMs + FIVE_MINUTES_MS),
  };
}

/** The recorded credits-only challenge rebound to the local slot route, listing devnet. */
const slotChallenge = (info: Partial<SiwxInfo> = {}) =>
  siwxChallenge("challenge-fee-credits-only", { url: SLOT_URL, chainIds: [SOLANA_DEVNET], info });

/** The recorded credits-only challenge rebound to the local health route, listing devnet. */
const healthChallenge = (info: Partial<SiwxInfo> = {}) =>
  siwxChallenge("challenge-fee-credits-only", { url: HEALTH_URL, chainIds: [SOLANA_DEVNET], info });

/** The recorded rotation challenge rebound to the local Worker, listing devnet. */
const rotationChallenge = (info: Partial<SiwxInfo> = {}) =>
  siwxChallenge("rotation-challenge", { url: ROTATION_URL, chainIds: [SOLANA_DEVNET], info });

/** The rotation challenge's `issuedAt`, the kit clock of the rotation scenarios. */
const ROTATION_AT = Date.parse(siwxInfo(rotationChallenge()).issuedAt);

/** The signed rotation refused for a wallet without credits: `accepts: []` and the prepaid offer. */
const rotationWithoutCredits = () =>
  withoutSiwx(siwxChallenge("challenge-fee-credits-only", { url: ROTATION_URL }));

interface SiwxKit {
  fake: FakeTransport;
  signer: FakeSiwxSigner;
  clock: FakeClock;
  client: ApiClient;
}

function siwxKit(
  responses: readonly ScriptedResponse[],
  configure: (signer: FakeSiwxSigner) => KitConfig,
  clock: FakeClock = new FakeClock(),
): SiwxKit {
  const fake = new FakeTransport();
  for (const response of responses) fake.respond(response);
  const signer = new FakeSiwxSigner();
  const client = new ApiClient(solana, {
    baseUrl: BASE_URL,
    tier: "pro",
    transport: fake.transport,
    clock,
    ...configure(signer),
  });
  return { fake, signer, clock, client };
}

/** A kit with SIWX spending configured and no credit token. */
const spendingKit = (...responses: ScriptedResponse[]) =>
  siwxKit(responses, (siwxSigner) => ({ credits: { siwxSigner, siwxSpend: true } }));

/** A kit with the wallet's SIWX signer (and an earlier token when given), at the rotation time. */
const rotationKit = (oldToken: string | undefined, ...responses: ScriptedResponse[]) =>
  siwxKit(
    responses,
    (siwxSigner) => ({
      credits: { siwxSigner, ...(oldToken !== undefined ? { token: oldToken } : {}) },
    }),
    new FakeClock(ROTATION_AT),
  );

const slotCall = (client: ApiClient) =>
  client.request({ route: "slot/latest", schema: slotSchema });

const healthCall = (client: ApiClient) => client.request({ route: "health", schema: z.object({}) });

async function outcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

/**
 * GIVEN a previous SIWX-debited answer for the slot route carried `X-SIWX-Next-Challenge`; the
 * `later` responses answer the next call. `before` is the number of requests sent so far.
 */
async function keptNextChallenge(...later: ScriptedResponse[]) {
  const kit = spendingKit(slotChallenge(), debitedWithNext(), ...later);
  const first = await outcome(() => slotCall(kit.client));
  expect(first, "the SIWX-debited call returns the slot data").toMatchObject({
    data: { slot: SLOT },
  });
  return { ...kit, before: kit.fake.requests.length };
}

/** Compares without printing the token in a failure message. */
function expectBearer(fake: FakeTransport, index: number, token: string): void {
  const authorization = fake.requests[index]?.headers.authorization;
  expect(
    authorization === `Bearer ${token}`,
    `request ${index} carries Authorization: Bearer <configured token>`,
  ).toBe(true);
}

/** Every rotation request is `POST /v1/pro/credits/token` without a token or a payment. */
function expectRotationRequests(fake: FakeTransport): void {
  for (const request of fake.requests) {
    expect(request.method).toBe("POST");
    expect(request.url).toBe(ROTATION_URL);
    expect(
      request.headers.authorization === undefined,
      "rotation request carries no Authorization header",
    ).toBe(true);
    expect(request.headers["payment-signature"]).toBeUndefined();
  }
}

describe("SIWX spending", () => {
  it("SIWX challenge without SIWX spending", async () => {
    const wallet = new FakePayer();
    const { signer, client } = siwxKit([slotChallenge()], (siwxSigner) => ({
      wallet,
      credits: { siwxSigner },
    }));
    const error = await outcome(() => slotCall(client));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "credits-required" });
    expect(signer.calls).toHaveLength(0);
    expect(wallet.signed).toHaveLength(0);
  });

  it("Credits-only route spent with SIWX", async () => {
    const challenge = slotChallenge();
    const { nonce } = siwxInfo(challenge);
    const { fake, signer, client } = spendingKit(challenge, debitedWithNext());
    const result = await outcome(() => slotCall(client));
    expect(result, "the SIWX-debited call returns the slot data and the balance").toMatchObject({
      data: { slot: SLOT },
      credits: BALANCE,
    });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.url).toBe(SLOT_URL);
    expect(fake.requests[1]?.headers["sign-in-with-x"]).toBe(fakeSiwxProof(nonce));
    expect(fake.requests[1]?.headers["payment-signature"]).toBeUndefined();
    expect(signer.calls).toHaveLength(1);
    expect(signer.calls[0]).toMatchObject({
      requestUrl: SLOT_URL,
      challenge: { nonce, domain: "localhost:8787", uri: SLOT_URL, chainId: SOLANA_DEVNET },
    });
    expect(client.spent()).toBe("0");
  });

  it("Challenge without the signer's chain", async () => {
    const challenge = siwxChallenge("challenge-fee-credits-only", {
      url: SLOT_URL,
      chainIds: [SOLANA_MAINNET],
    });
    const { signer, client } = spendingKit(challenge);
    const error = await outcome(() => slotCall(client));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "credits-required" });
    expect(signer.calls).toHaveLength(0);
  });

  it("Challenge bound to another origin", async () => {
    const { signer, client } = spendingKit(slotChallenge({ domain: "api.criptonlabs.com" }));
    const error = await outcome(() => slotCall(client));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "siwx-challenge-mismatch" });
    expect(signer.calls).toHaveLength(0);
  });

  it("Challenge for another resource", async () => {
    const { signer, client } = spendingKit(slotChallenge({ uri: HEALTH_URL }));
    const error = await outcome(() => slotCall(client));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "siwx-challenge-mismatch" });
    expect(signer.calls).toHaveLength(0);
  });

  it("Token refused is not followed by a SIWX proof", async () => {
    const token = creditToken();
    const refused = withBodyMembers(slotChallenge(), { error: "credits_invalid" });
    const { fake, signer, client } = siwxKit([refused], (siwxSigner) => ({
      credits: { token, siwxSigner, siwxSpend: true },
    }));
    const error = await outcome(() => slotCall(client));
    expectBearer(fake, 0, token);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "credits-required", reason: "credits_invalid" });
    expect(signer.calls).toHaveLength(0);
    expect(fake.requests).toHaveLength(1);
  });
});

describe("SIWX next challenge", () => {
  it("Next challenge used without a round trip", async () => {
    const { fake, clock, client, before } = await keptNextChallenge(debited());
    clock.set(REUSE_AT);
    await slotCall(client);
    const sent = fake.requests.slice(before);
    expect(sent[0]?.headers["sign-in-with-x"]).toBe(fakeSiwxProof(NEXT_NONCE));
    expect(sent).toHaveLength(1);
  });

  it("Stale next challenge replaced once", async () => {
    const fresh = freshInfo(REUSE_AT);
    const refused = withBodyMembers(slotChallenge(fresh), { error: "siwx_invalid" });
    const { fake, clock, client, before } = await keptNextChallenge(refused, debited());
    clock.set(REUSE_AT);
    const result = await slotCall(client);
    const sent = fake.requests.slice(before);
    expect(result.data.slot).toBe(SLOT);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.headers["sign-in-with-x"]).toBe(fakeSiwxProof(NEXT_NONCE));
    expect(sent[1]?.headers["sign-in-with-x"]).toBe(fakeSiwxProof(fresh.nonce));
  });

  it("Expired next challenge discarded", async () => {
    const answer = slotChallenge(freshInfo(EXPIRED_AT));
    const { fake, clock, client, before } = await keptNextChallenge(answer, debited());
    clock.set(EXPIRED_AT);
    await outcome(() => slotCall(client));
    const request = fake.requests[before];
    expect(request, "the next call sent a request").toBeDefined();
    expect(request?.headers["sign-in-with-x"]).toBeUndefined();
  });

  it("Next challenge used once", async () => {
    const answer = slotChallenge(freshInfo(REUSE_AT));
    const { fake, clock, client, before } = await keptNextChallenge(debited(), answer, debited());
    clock.set(REUSE_AT);
    await slotCall(client);
    const used = fake.requests.slice(before);
    expect(used, "the kept challenge's call sent one request").toHaveLength(1);
    expect(used[0]?.headers["sign-in-with-x"]).toBe(fakeSiwxProof(NEXT_NONCE));
    const after = fake.requests.length;
    await outcome(() => slotCall(client));
    const request = fake.requests[after];
    expect(request, "the third call sent a request").toBeDefined();
    expect(request?.headers["sign-in-with-x"]).toBeUndefined();
  });

  it("Next challenge kept per path", async () => {
    const answer = healthChallenge(freshInfo(REUSE_AT));
    const { fake, clock, client, before } = await keptNextChallenge(answer, debited());
    clock.set(REUSE_AT);
    await outcome(() => healthCall(client));
    const request = fake.requests[before];
    expect(request, "the health call sent a request").toBeDefined();
    expect(request?.url).toBe(HEALTH_URL);
    expect(request?.headers["sign-in-with-x"]).toBeUndefined();
  });
});

describe("credit token rotation", () => {
  it("Rotation returns a new token", async () => {
    const oldToken = creditToken();
    const token = creditToken();
    const challenge = rotationChallenge();
    const created = loadFixture("rotation-201", { "<credit-token>": token });
    const { fake, client } = rotationKit(oldToken, challenge, created);
    const result = await outcome(() => client.rotateToken());
    expect(result, "rotateToken() resolves with the rotation result").not.toBeInstanceOf(Error);
    const rotation = result as RotationResult;
    expect(rotation.token === token, "result.token holds the new token").toBe(true);
    expect(JSON.parse(JSON.stringify(rotation))).toEqual({ token: "[redacted]" });
    expectTokenAbsent([rotation], token);
    expect(fake.requests).toHaveLength(2);
    expectRotationRequests(fake);
    expect(fake.requests[0]?.headers["sign-in-with-x"]).toBeUndefined();
    expect(fake.requests[1]?.headers["sign-in-with-x"]).toBe(
      fakeSiwxProof(siwxInfo(challenge).nonce),
    );
  });

  it("Rotation for a wallet without credits", async () => {
    const challenge = rotationChallenge();
    const { fake, client } = rotationKit(undefined, challenge, rotationWithoutCredits());
    const error = await outcome(() => client.rotateToken());
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({
      code: "credits-required",
      prepaidOffer: { bundleVersion: "2026-10-26" },
    });
    expect(fake.requests[1]?.headers["sign-in-with-x"]).toBe(
      fakeSiwxProof(siwxInfo(challenge).nonce),
    );
  });

  it("Rotation proof refused", async () => {
    const refused = withBodyMembers(rotationChallenge(freshInfo(ROTATION_AT)), {
      error: "siwx_invalid",
    });
    const { client } = rotationKit(undefined, rotationChallenge(), refused);
    const error = await outcome(() => client.rotateToken());
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "payment-required", reason: "siwx_invalid" });
  });

  it("Rotation proof refused with an offer", async () => {
    const refused = withBodyMembers(rotationWithoutCredits(), { error: "siwx_invalid" });
    const { fake, client } = rotationKit(undefined, rotationChallenge(), refused);
    const error = await outcome(() => client.rotateToken());
    expect(fake.requests[1]?.headers["sign-in-with-x"], "the rotation was signed").toBeDefined();
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).not.toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-required", reason: "siwx_invalid" });
  });
});
