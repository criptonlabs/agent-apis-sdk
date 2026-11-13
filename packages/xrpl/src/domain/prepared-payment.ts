import {
  addPercentFloor,
  CriptonRefusalError,
  CriptonValidationError,
  cmp,
  maxDecimals,
  mulPow10,
  type Meta,
} from "@criptonlabs/agent-apis-core";
import type { FeeResponse, PathsResponse, ReadinessResponse } from "./api-types.js";
import { parseAsset } from "./asset.js";
import { assertClassicAddress, assertDestinationTag } from "./validation.js";

export type FeeTier = "economy" | "standard" | "priority";

export interface PaymentIntent {
  source: string;
  destination: string;
  asset: string;
  amount: string;
  destinationTag?: number;
  sourceAsset?: string;
  sendMaxTolerancePct?: string;
  feeTier?: FeeTier;
  maxFeeDrops?: string;
}

export type TxAmount = string | { currency: string; issuer: string; value: string };

export interface UnsignedPayment {
  TransactionType: "Payment";
  Account: string;
  Destination: string;
  Amount: TxAmount;
  SendMax?: TxAmount;
  Paths?: unknown[][];
  DestinationTag?: number;
  Fee: string;
  Flags: 0;
}

export interface PreparedPayment {
  transaction: UnsignedPayment;
  readiness: ReadinessResponse;
  path: PathsResponse["alternatives"][number] | null;
  fee: { tier: FeeTier; drops: string; congestionBand: "low" | "medium" | "high" | (string & {}) };
  meta: Meta;
}

export class PaymentNotReadyError extends CriptonRefusalError {
  constructor(
    readonly code:
      | "payment-not-ready"
      | "payment-readiness-unknown"
      | "no-path-found"
      | "fee-over-cap",
    readonly reasons: readonly string[],
    readonly warnings: readonly string[],
    readonly checksFailed: readonly string[],
  ) {
    super(code);
  }
}

function toTxAmount(field: string, asset: string, value: string): TxAmount {
  const parsed = parseAsset(field, asset);
  if (parsed.kind === "issued") {
    return { currency: parsed.currency, issuer: parsed.issuer, value };
  }
  if (maxDecimals(value) > 6) {
    throw new CriptonValidationError(field, `${field} allows at most 6 decimals for XRP`);
  }
  return mulPow10(value, 6);
}

function ledgerOf(meta: Meta): number {
  return meta.ledger_index ?? Number.POSITIVE_INFINITY;
}

function oldestMeta(metas: readonly Meta[]): Meta {
  let oldest = metas[0] as Meta;
  for (const meta of metas) {
    if (ledgerOf(meta) < ledgerOf(oldest)) oldest = meta;
  }
  return oldest;
}

type PathAlternative = PathsResponse["alternatives"][number];

function isCrossCurrency(intent: PaymentIntent): boolean {
  return intent.sourceAsset !== undefined && intent.sourceAsset !== intent.asset;
}

/** Validates the parties and the amount, in the order errors are reported. */
function validatedAmount(intent: PaymentIntent): TxAmount {
  assertClassicAddress("source", intent.source);
  assertClassicAddress("destination", intent.destination);
  if (intent.destinationTag !== undefined) {
    assertDestinationTag("destinationTag", intent.destinationTag);
  }
  return toTxAmount("amount", intent.asset, intent.amount);
}

function cappedFee(intent: PaymentIntent, fee: FeeResponse): { tier: FeeTier; drops: string } {
  const tier: FeeTier = intent.feeTier ?? "standard";
  const drops = fee.fee[tier];
  if (intent.maxFeeDrops !== undefined && cmp(drops, intent.maxFeeDrops) > 0) {
    throw new PaymentNotReadyError("fee-over-cap", [], [], []);
  }
  return { tier, drops };
}

/** The path and SendMax of a cross-currency payment; null when source and destination assets match. */
function crossCurrencyLeg(
  intent: PaymentIntent,
  paths: PathsResponse | null,
): { alternative: PathAlternative; sendMax: TxAmount } | null {
  if (!isCrossCurrency(intent)) return null;
  const tolerance = intent.sendMaxTolerancePct;
  if (tolerance === undefined) {
    throw new CriptonValidationError(
      "sendMaxTolerancePct",
      "sendMaxTolerancePct is required for a cross-currency payment",
    );
  }
  const alternative = paths?.alternatives.find(
    (alt) => alt.source_amount.asset === intent.sourceAsset,
  );
  if (alternative === undefined) throw new PaymentNotReadyError("no-path-found", [], [], []);
  const value = addPercentFloor(alternative.source_amount.value, tolerance, 15);
  return { alternative, sendMax: toTxAmount("sourceAsset", intent.sourceAsset as string, value) };
}

export function buildPreparedPayment(
  intent: PaymentIntent,
  readiness: ReadinessResponse,
  paths: PathsResponse | null,
  fee: FeeResponse,
): PreparedPayment {
  const amount = validatedAmount(intent);
  const { tier, drops } = cappedFee(intent, fee);
  const leg = crossCurrencyLeg(intent, paths);

  const transaction: UnsignedPayment = {
    TransactionType: "Payment",
    Account: intent.source,
    Destination: intent.destination,
    Amount: amount,
    ...(leg !== null ? { SendMax: leg.sendMax, Paths: leg.alternative.paths } : {}),
    ...(intent.destinationTag !== undefined ? { DestinationTag: intent.destinationTag } : {}),
    Fee: drops,
    Flags: 0,
  };

  return {
    transaction,
    readiness,
    path: leg?.alternative ?? null,
    fee: { tier, drops, congestionBand: fee.congestion.band },
    meta: oldestMeta([readiness.meta, ...(paths ? [paths.meta] : []), fee.meta]),
  };
}
