import type { PrepaidBundle, PrepaidOffer } from "../../domain/prepaid-offer.js";

export const PREPAID_EXTENSION_KEY = "com.criptonlabs/prepaid-credits";

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function bundleOf(value: unknown): PrepaidBundle | undefined {
  const b = record(value);
  if (
    b === undefined ||
    typeof b.id !== "string" ||
    typeof b.amount !== "string" ||
    typeof b.credited_units !== "string"
  ) {
    return undefined;
  }
  return {
    id: b.id,
    amount: b.amount,
    creditedUnits: b.credited_units,
    ...(typeof b.approx_calls === "number" ? { approxCalls: b.approx_calls } : {}),
  };
}

/** Reads the prepaid offer from an `extensions` object; anything malformed yields `undefined`. */
export function readPrepaidOffer(extensions: unknown): PrepaidOffer | undefined {
  const info = record(record(record(extensions)?.[PREPAID_EXTENSION_KEY])?.info);
  if (info === undefined || typeof info.bundle_version !== "string") return undefined;
  if (!Array.isArray(info.bundles)) return undefined;
  const bundles: PrepaidBundle[] = [];
  for (const raw of info.bundles) {
    const bundle = bundleOf(raw);
    if (bundle === undefined) return undefined;
    bundles.push(bundle);
  }
  return {
    bundleVersion: info.bundle_version,
    ...(typeof info.topup_url === "string" ? { topupUrl: info.topup_url } : {}),
    ...(typeof info.requirements_url === "string"
      ? { requirementsUrl: info.requirements_url }
      : {}),
    bundles,
  };
}
