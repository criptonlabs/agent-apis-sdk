import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import type { PathsResponse, ReadinessResponse } from "../domain/api-types.js";
import {
  buildPreparedPayment,
  PaymentNotReadyError,
  type PaymentIntent,
  type PreparedPayment,
} from "../domain/prepared-payment.js";
import type { XrplDataPort } from "./ports.js";

function assertReady(readiness: ReadinessResponse): void {
  if (readiness.verdict === "ready") return;
  throw new PaymentNotReadyError(
    readiness.verdict === "not_ready" ? "payment-not-ready" : "payment-readiness-unknown",
    readiness.reasons,
    readiness.warnings,
    readiness.checks_failed,
  );
}

async function readinessOf(data: XrplDataPort, intent: PaymentIntent): Promise<ReadinessResponse> {
  const { source, destination, asset, amount, destinationTag } = intent;
  const query = { source, destination, asset, amount };
  return (
    await data.paymentReadiness(destinationTag !== undefined ? { ...query, destinationTag } : query)
  ).data;
}

async function pathsOf(data: XrplDataPort, intent: PaymentIntent): Promise<PathsResponse | null> {
  const { sourceAsset } = intent;
  if (sourceAsset === undefined || sourceAsset === intent.asset) return null;
  const { source, destination, asset, amount } = intent;
  return (await data.paths({ source, destination, asset, amount, sourceAssets: [sourceAsset] }))
    .data;
}

export async function preparePayment(
  data: XrplDataPort,
  intent: PaymentIntent,
): Promise<PreparedPayment> {
  const crossCurrency = intent.sourceAsset !== undefined && intent.sourceAsset !== intent.asset;
  if (crossCurrency && intent.sendMaxTolerancePct === undefined) {
    throw new CriptonValidationError(
      "sendMaxTolerancePct",
      "sendMaxTolerancePct is required for a cross-currency payment",
    );
  }
  const readiness = await readinessOf(data, intent);
  assertReady(readiness);
  const paths = await pathsOf(data, intent);
  const fee = (await data.fee()).data;
  return buildPreparedPayment(intent, readiness, paths, fee);
}
