import type { PrepaidBundle, PrepaidOffer } from "../../domain/prepaid-offer.js";

/** One asset that pays a denomination of the offer, as typed in `PrepaidOffer.assets`. */
type PrepaidAsset = { asset: string; network: string };

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

function assetOf(value: unknown): PrepaidAsset | undefined {
  const a = record(value);
  if (a === undefined || typeof a.asset !== "string" || typeof a.network !== "string") {
    return undefined;
  }
  return { asset: a.asset, network: a.network };
}

/** The valid assets of one denomination; a malformed entry is left out. */
function denominationAssets(value: unknown): PrepaidAsset[] {
  if (!Array.isArray(value)) return [];
  return value.map(assetOf).filter((a): a is PrepaidAsset => a !== undefined);
}

/** The assets per denomination; a malformed member is left out, never the rest of the offer. */
function optionalAssets(info: Record<string, unknown>): Pick<PrepaidOffer, "assets"> {
  const map = record(info.assets);
  if (map === undefined) return {};
  const entries = Object.entries(map)
    .map(([denomination, value]) => [denomination, denominationAssets(value)] as const)
    .filter(([, assets]) => assets.length > 0);
  return entries.length > 0 ? { assets: Object.fromEntries(entries) } : {};
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
  return {
    bundleVersion: info.bundle_version,
    ...optionalUrls(info),
    bundles,
    ...optionalAssets(info),
  };
}
