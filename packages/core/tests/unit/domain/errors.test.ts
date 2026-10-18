import { describe, expect, it } from "vite-plus/test";
import {
  CriptonNetworkError,
  CriptonPaymentError,
  CriptonProblemError,
  CriptonResponseError,
  CriptonValidationError,
  MissingPeerDependencyError,
} from "../../../src/domain/errors.js";

const roundTrip = (e: unknown) => JSON.parse(JSON.stringify(e));
const option = { network: "xrpl:0", asset: "RLUSD", amount: "0.012", payTo: "rPayTo" };

describe("error serialization", () => {
  it("Secret absent from errors", () => {
    const secret = crypto.randomUUID();
    const used = { header: `PAYMENT-SIGNATURE ${secret}` };
    expect(used.header).toContain(secret);

    const payment = new CriptonPaymentError("payment-over-cap", [option]);
    expect(JSON.stringify(payment)).not.toContain(secret);
    expect(payment.message).not.toContain(secret);
    expect(String(payment.stack ?? "")).not.toContain(secret);

    expect(roundTrip(new CriptonValidationError("amount", "bad amount"))).toEqual({
      code: "invalid-input",
      message: "bad amount",
      details: { field: "amount" },
    });
    expect(roundTrip(new CriptonResponseError("bad body"))).toEqual({
      code: "invalid-response",
      message: "bad body",
    });
    expect(
      roundTrip(
        new CriptonProblemError("upstream-unavailable", 503, "Title", "Detail", "/v1/xrpl/fee", 5),
      ),
    ).toEqual({
      code: "upstream-unavailable",
      message: "Detail",
      status: 503,
      retryAfterSeconds: 5,
      details: { instance: "/v1/xrpl/fee" },
    });
    expect(roundTrip(new CriptonNetworkError("timeout", "timed out"))).toEqual({
      code: "timeout",
      message: "timed out",
    });
    expect(roundTrip(payment)).toEqual({
      code: "payment-over-cap",
      message: payment.message,
      details: { options: [option] },
    });
    const peer = new MissingPeerDependencyError("@x402/xrpl");
    expect(roundTrip(peer)).toEqual({
      code: "missing-peer-dependency",
      message: peer.message,
      details: { packageName: "@x402/xrpl" },
    });
  });
});
