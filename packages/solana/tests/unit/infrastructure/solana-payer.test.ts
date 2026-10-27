import {
  ApiClient,
  CriptonPaymentError,
  CriptonValidationError,
  type PaymentOption,
} from "@criptonlabs/agent-apis-core";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { challenge } from "../../../../core/tests/support/x402-fixtures.js";
import { createSolanaPayer } from "../../../src/infrastructure/x402/solana-payer.js";
import {
  FAKE_BLOCKHASH,
  startFakeSolanaRpc,
  type FakeSolanaRpc,
} from "../../support/fake-solana-rpc.js";
import { throwawayAddress, throwawayKey, toBase58 } from "../../support/keys.js";

const DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const RESOURCE_URL = "https://api.criptonlabs.com/v1/pro/solana/transfer-readiness";

const descriptor = { network: "solana", productToken: "agent-apis-solana/0.0.0" };
const anyBody = z.unknown();

function usdcOption(amount = "14520"): PaymentOption {
  return {
    scheme: "exact",
    network: DEVNET,
    asset: DEVNET_USDC,
    amount,
    payTo: throwawayAddress(),
    maxTimeoutSeconds: 60,
    extra: { feePayer: throwawayAddress() },
  };
}

function required(option: PaymentOption): unknown {
  return { x402Version: 2, resource: { url: RESOURCE_URL }, accepts: [option] };
}

function paid() {
  const settle = { success: true, transaction: "5".repeat(88), network: DEVNET, payer: "x" };
  return {
    status: 200,
    headers: { "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(settle)).toString("base64") },
    body: { ok: true },
  };
}

interface DecodedPayment {
  payload: { accepted: unknown; payload: { transaction: string } };
  feePayer: string | undefined;
  signers: Record<string, boolean>;
  blockhash: string;
}

function decodePayment(header: string | undefined): DecodedPayment {
  const payload = JSON.parse(Buffer.from(header ?? "", "base64").toString("utf8"));
  const wire = getBase64Encoder().encode(payload.payload.transaction);
  const tx = getTransactionDecoder().decode(wire);
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const signers = Object.fromEntries(
    Object.entries(tx.signatures).map(([signer, signature]) => [signer, signature !== null]),
  );
  return {
    payload,
    feePayer: message.staticAccounts[0],
    signers,
    blockhash: message.lifetimeToken,
  };
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectKeyRejected(raw: string): void {
  const thrown = captureError(() => createSolanaPayer({ key: raw, network: "devnet" }));
  expect(thrown).toBeInstanceOf(CriptonValidationError);
  const error = thrown as CriptonValidationError;
  expect(error.code).toBe("invalid-input");
  expect(error.field).toBe("key");
  expect(error.message).not.toContain(raw);
}

let rpc: FakeSolanaRpc;

beforeAll(async () => {
  rpc = await startFakeSolanaRpc();
});

afterAll(async () => {
  await rpc.stop();
});

describe("fake solana rpc", () => {
  it("answers getLatestBlockhash and records the method", async () => {
    const response = await fetch(rpc.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" }),
    });
    const body = (await response.json()) as { result: { value: { blockhash: string } } };
    expect(body.result.value.blockhash).toBe(FAKE_BLOCKHASH);
    expect(rpc.methods).toContain("getLatestBlockhash");
  });

  it("answers unknown methods with a JSON-RPC error", async () => {
    const response = await fetch(rpc.url, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "sendTransaction" }),
    });
    const body = (await response.json()) as { error?: { code: number } };
    expect(body.error?.code).toBe(-32601);
  });
});

describe("createSolanaPayer", () => {
  it("Base58 key payer", async () => {
    const key = throwawayKey();
    const payer = createSolanaPayer({ key: key.base58, network: "devnet", rpcUrl: rpc.url });
    const option = usdcOption();

    const headers = await payer.createPaymentHeaders(required(option), option);

    const decoded = decodePayment(headers["PAYMENT-SIGNATURE"]);
    expect(decoded.payload.accepted).toEqual(option);
    expect(decoded.feePayer).toBe(option.extra?.["feePayer"]);
    expect(decoded.signers[key.address]).toBe(true);
    expect(decoded.signers[option.extra?.["feePayer"] as string]).toBe(false);
    expect(decoded.blockhash).toBe(FAKE_BLOCKHASH);
  });

  it("JSON array key payer", async () => {
    const key = throwawayKey();
    const option = usdcOption();
    const fromBase58 = createSolanaPayer({ key: key.base58, network: "devnet", rpcUrl: rpc.url });
    const fromJson = createSolanaPayer({ key: key.jsonArray, network: "devnet", rpcUrl: rpc.url });

    const a = decodePayment(
      (await fromBase58.createPaymentHeaders(required(option), option))["PAYMENT-SIGNATURE"],
    );
    const b = decodePayment(
      (await fromJson.createPaymentHeaders(required(option), option))["PAYMENT-SIGNATURE"],
    );

    expect(Object.keys(b.payload)).toEqual(Object.keys(a.payload));
    expect(b.payload.accepted).toEqual(a.payload.accepted);
    expect(b.feePayer).toBe(a.feePayer);
    expect(Object.keys(b.signers).sort()).toEqual(Object.keys(a.signers).sort());
    expect(b.signers[key.address]).toBe(true);
  });

  it("Invalid Solana key", () => {
    const tenBytes = JSON.stringify(Array.from({ length: 10 }, (_, i) => i + 1));
    expectKeyRejected(tenBytes);
  });

  it("rejects base58 text that is not 64 bytes", () => {
    expectKeyRejected(toBase58(throwawayKey().bytes.slice(0, 32)));
  });

  it("rejects a JSON array with a value above 255", () => {
    const values = Array.from(throwawayKey().bytes);
    values[5] = 256;
    expectKeyRejected(JSON.stringify(values));
  });

  it("Atomic amount within the cap", async () => {
    const payer = createSolanaPayer({
      key: throwawayKey().base58,
      network: "devnet",
      rpcUrl: rpc.url,
    });
    const option = usdcOption("14520");
    expect(payer.decimalAmount?.(option)).toBe("0.01452");

    const fake = new FakeTransport().respond(challenge(option)).respond(paid());
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "0.05" },
    });
    await client.request({ route: "transfer-readiness", schema: anyBody });

    expect(client.spent()).toBe("0.01452");
    expect(fake.requests.at(-1)?.headers).toHaveProperty("payment-signature");
  });

  it("Signing sends nothing", async () => {
    const before = rpc.methods.length;
    const payer = createSolanaPayer({
      key: throwawayKey().base58,
      network: "devnet",
      rpcUrl: rpc.url,
    });
    const option = usdcOption();

    await payer.createPaymentHeaders(required(option), option);

    const called = rpc.methods.slice(before);
    expect(called.length).toBeGreaterThan(0);
    expect(called).not.toContain("sendTransaction");
    expect(called).not.toContain("sendRawTransaction");
  });

  it("Configured asset not offered", async () => {
    const payer = createSolanaPayer({
      key: throwawayKey().base58,
      network: "devnet",
      asset: "EURC",
      rpcUrl: rpc.url,
    });
    const option = usdcOption();
    expect(payer.selectOption([option])).toBeNull();

    const fake = new FakeTransport().respond(challenge(option)).respond(paid());
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "0.05" },
    });
    const error = await client
      .request({ route: "transfer-readiness", schema: anyBody })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "no-supported-payment-option" });
  });
});
