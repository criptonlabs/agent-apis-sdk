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

/** Every bundle must be valid; one malformed entry drops the whole list. */
function bundlesOf(value: unknown): PrepaidBundle[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const bundles = value.map(bundleOf);
  return bundles.every((b): b is PrepaidBundle => b !== undefined) ? bundles : undefined;
}

function optionalUrls(
  info: Record<string, unknown>,
): Pick<PrepaidOffer, "topupUrl" | "requirementsUrl"> {
  return {
    ...(typeof info.topup_url === "string" ? { topupUrl: info.topup_url } : {}),
    ...(typeof info.requirements_url === "string"
      ? { requirementsUrl: info.requirements_url }
      : {}),
  };
}

/** Reads the prepaid offer from an `extensions` object; anything malformed yields `undefined`. */
export function readPrepaidOffer(extensions: unknown): PrepaidOffer | undefined {
  const info = record(record(record(extensions)?.[PREPAID_EXTENSION_KEY])?.info);
  if (info === undefined || typeof info.bundle_version !== "string") return undefined;
  const bundles = bundlesOf(info.bundles);
  if (bundles === undefined) return undefined;
  return { bundleVersion: info.bundle_version, ...optionalUrls(info), bundles };
}
