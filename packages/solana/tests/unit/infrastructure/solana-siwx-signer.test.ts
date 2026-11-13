import {
  ApiClient,
  CriptonValidationError,
  MissingPeerDependencyError,
  type PeerImporter,
} from "@criptonlabs/agent-apis-core";
import {
  decodeBase58,
  formatSIWSMessage,
  parseSIWxHeader,
  verifySolanaSignature,
} from "@x402/extensions/sign-in-with-x";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  SOLANA_DEVNET,
  creditToken,
  loadFixture,
  siwxChallenge,
  siwxInfo,
  type ResponseFixture,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeClock } from "../../../../core/tests/support/fake-clock.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createSolanaAgentKit } from "../../../src/index.js";
import { SOLANA_DESCRIPTOR } from "../../../src/infrastructure/descriptor.js";
import { createSolanaSiwxSigner } from "../../../src/infrastructure/siwx/solana-siwx-signer.js";
import { throwawayKey, type ThrowawayKey } from "../../support/keys.js";

/** A local API Worker whose `PUBLIC_ORIGIN` is `http://localhost:8787` (design D15). */
const BASE_URL = "http://localhost:8787";
const SLOT_URL = `${BASE_URL}/v1/pro/solana/slot/latest`;
const ROTATION_URL = `${BASE_URL}/v1/pro/credits/token`;
const slotSchema = z.object({ slot: z.number() });

/** The spec-derived SIWX-debited answer of the slot route, without its next challenge. */
function slotAnswer(): ResponseFixture {
  const recorded = loadFixture("siwx-next-challenge");
  const { "x-siwx-next-challenge": _next, ...headers } = recorded.headers;
  return { ...recorded, headers };
}

const SLOT = slotAnswer().body.slot;

/** The recorded credits-only challenge rebound to the local slot route, listing devnet. */
const slotChallenge = () =>
  siwxChallenge("challenge-fee-credits-only", { url: SLOT_URL, chainIds: [SOLANA_DEVNET] });

/** The recorded rotation challenge rebound to the local Worker, listing devnet. */
const rotationChallenge = () =>
  siwxChallenge("rotation-challenge", { url: ROTATION_URL, chainIds: [SOLANA_DEVNET] });

/** An importer for which `@x402/extensions` is not installed; counts its calls. */
function missingLibrary(): { importer: PeerImporter; calls: () => number } {
  let calls = 0;
  const importer: PeerImporter = () => {
    calls += 1;
    const error = Object.assign(new Error("Cannot find package '@x402/extensions'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    return Promise.reject(error);
  };
  return { importer, calls: () => calls };
}

async function outcome(run: () => unknown): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

/** Every text encoding of the secret key (64 bytes) and of its 32-byte seed. */
function secretEncodings(key: ThrowawayKey): string[] {
  const seed = Buffer.from(key.bytes.slice(0, 32));
  const full = Buffer.from(key.bytes);
  return [
    key.base58,
    key.jsonArray,
    JSON.stringify(Array.from(seed)),
    ...[full, seed].flatMap((bytes) => [
      bytes.toString("base64"),
      bytes.toString("base64url"),
      bytes.toString("hex"),
    ]),
  ];
}

/** Asserts no encoding of the secret key appears in the header or its decoded text; never prints it. */
function expectSecretAbsent(header: string, key: ThrowawayKey): void {
  const decoded = Buffer.from(header, "base64").toString("utf8");
  for (const secret of secretEncodings(key)) {
    expect(header.includes(secret), "SIGN-IN-WITH-X header contains the secret key").toBe(false);
    expect(decoded.includes(secret), "decoded SIGN-IN-WITH-X contains the secret key").toBe(false);
  }
}

/** Asserts the proof names `address` and its signature verifies over the SIWS message with that key. */
function expectSignedBy(header: string, address: string): void {
  const payload = parseSIWxHeader(header);
  expect(payload.address).toBe(address);
  expect(payload.chainId).toBe(SOLANA_DEVNET);
  const message = formatSIWSMessage(
    {
      domain: payload.domain,
      uri: payload.uri,
      version: payload.version,
      chainId: payload.chainId,
      type: payload.type,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      ...(payload.expirationTime !== undefined ? { expirationTime: payload.expirationTime } : {}),
      ...(payload.statement !== undefined ? { statement: payload.statement } : {}),
    },
    payload.address,
  );
  const valid = verifySolanaSignature(
    message,
    decodeBase58(payload.signature),
    decodeBase58(address),
  );
  expect(valid, "the signature verifies with the wallet address's public key").toBe(true);
}

describe("Solana SIWX signer", () => {
  it("SIWX proof signed by the wallet", async () => {
    const key = throwawayKey();
    const challenge = slotChallenge();
    const fake = new FakeTransport().respond(challenge).respond(slotAnswer());
    const kit = createSolanaAgentKit({
      baseUrl: BASE_URL,
      tier: "pro",
      transport: fake.transport,
      clock: new FakeClock(),
      wallet: { key: key.base58, network: "devnet" },
      credits: { siwx: true },
    });

    const result = await outcome(() => kit.data.latestSlot());

    expect(result, "the SIWX-signed call returns the slot data").toMatchObject({
      data: { slot: SLOT },
    });
    expect(fake.requests).toHaveLength(2);
    expect(siwxInfo(challenge)).toMatchObject({ domain: "localhost:8787", uri: SLOT_URL });
    const header = fake.requests[1]?.headers["sign-in-with-x"] ?? "";
    expect(header, "the signed retry carries SIGN-IN-WITH-X").not.toBe("");
    expectSignedBy(header, key.address);
    expect(parseSIWxHeader(header)).toMatchObject({
      domain: "localhost:8787",
      uri: SLOT_URL,
      nonce: siwxInfo(challenge).nonce,
    });
    expectSecretAbsent(header, key);
  });

  it("SIWX without a wallet", () => {
    let error: unknown;
    try {
      createSolanaAgentKit({ tier: "pro", credits: { siwx: true } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ code: "invalid-input", field: "wallet" });
  });
});

describe("credit token rotation", () => {
  it("Rotation without a wallet", async () => {
    const fake = new FakeTransport().respond(rotationChallenge());
    const kit = createSolanaAgentKit({ baseUrl: BASE_URL, tier: "pro", transport: fake.transport });

    const error = await outcome(() => kit.credits.rotateToken());

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ code: "invalid-input", field: "wallet" });
    expect(fake.requests).toHaveLength(0);
  });
});

describe("SIWX library is an optional peer", () => {
  it("Rotation without the SIWX library", async () => {
    const library = missingLibrary();
    const challenge = rotationChallenge();
    const fake = new FakeTransport().respond(challenge);
    const client = new ApiClient(SOLANA_DESCRIPTOR, {
      baseUrl: BASE_URL,
      tier: "pro",
      transport: fake.transport,
      clock: new FakeClock(Date.parse(siwxInfo(challenge).issuedAt)),
      credits: {
        siwxSigner: createSolanaSiwxSigner({
          key: throwawayKey().base58,
          network: "devnet",
          importer: library.importer,
        }),
      },
    });

    const error = await outcome(() => client.rotateToken());

    expect(error).toBeInstanceOf(MissingPeerDependencyError);
    expect(error).toMatchObject({ code: "missing-peer-dependency" });
    const packageName = (error as { packageName?: unknown }).packageName;
    expect(String(packageName)).toMatch(/^@x402\/extensions(\/|$)/);
  });

  it("Token spending without the SIWX library", async () => {
    const library = missingLibrary();
    const fake = new FakeTransport().respond(slotAnswer());
    const client = new ApiClient(SOLANA_DESCRIPTOR, {
      baseUrl: BASE_URL,
      tier: "pro",
      transport: fake.transport,
      clock: new FakeClock(),
      credits: {
        token: creditToken(),
        siwxSigner: createSolanaSiwxSigner({
          key: throwawayKey().base58,
          network: "devnet",
          importer: library.importer,
        }),
      },
    });

    const result = await outcome(() =>
      client.request({ route: "slot/latest", schema: slotSchema }),
    );

    expect(result, "the token-spent call returns the slot data").toMatchObject({
      data: { slot: SLOT },
    });
    expect(fake.requests).toHaveLength(1);
    expect(library.calls()).toBe(0);
  });
});
