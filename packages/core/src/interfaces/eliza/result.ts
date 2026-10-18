import { toErrorJson } from "../tools/error-json.js";

export function toElizaResult(
  outcome: { ok: true; value: unknown } | { ok: false; error: unknown },
): { success: boolean; text: string; data?: unknown } {
  if (outcome.ok) {
    return { success: true, text: JSON.stringify(outcome.value), data: outcome.value };
  }
  return { success: false, text: JSON.stringify(toErrorJson(outcome.error)) };
}
