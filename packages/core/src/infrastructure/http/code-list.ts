// Forward-compatible code list (kit-api-sync design D3): an API-owned code outside the known
// values passes through unchanged; a value that is not a string is still rejected.
import { z } from "zod";

/** Schema of an API code field: one of `known` or any other string; `known` stays readable. */
export function codeList<const T extends readonly [string, ...string[]]>(
  known: T,
): z.ZodType<T[number] | (string & {})> & { readonly known: T } {
  return Object.assign(z.union([z.enum(known), z.string()]), { known });
}
