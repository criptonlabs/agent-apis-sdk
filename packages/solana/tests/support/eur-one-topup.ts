import {
  decodePaymentRequired,
  encodePaymentRequired,
  eurOneTopupChallenge,
  settlementHeader,
  topupCreated,
  type ResponseFixture,
} from "../../../core/tests/support/credit-fixtures.js";
import { PAY_ASSET_MINTS, SOLANA_CAIP2 } from "../../src/index.js";
import type { ThrowawayKey } from "./keys.js";

/** The `eur-1` top-up challenge (EURC `1210000`) rebound to Solana devnet and its EURC mint. */
export function eurOneDevnetChallenge(): ResponseFixture {
  const recorded = eurOneTopupChallenge();
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const accepts = (required.accepts as Record<string, unknown>[]).map((option) => ({
    ...option,
    network: SOLANA_CAIP2.devnet,
    asset: PAY_ASSET_MINTS.EURC.devnet,
  }));
  const rebound = { ...required, accepts };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound },
  };
}

/** The top-up 201 of `eur-1` for the wallet, with the token built at run time. */
export function eurOneCreated(key: ThrowawayKey, token: string): ResponseFixture {
  const settlement = settlementHeader({
    transaction: "5".repeat(88),
    network: SOLANA_CAIP2.devnet,
    payer: key.address,
  });
  return topupCreated(token, settlement, {
    wallet: `${SOLANA_CAIP2.devnet}:${key.address}`,
    denomination: "EUR",
    balance: "1",
  });
}
