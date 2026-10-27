import { CriptonProblemError, type PrepaidSignals } from "../../domain/errors.js";
import { readPrepaidOffer } from "../x402/prepaid-offer.js";

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function slugOf(type: string): string | undefined {
  let path = type;
  try {
    path = new URL(type).pathname;
  } catch {
    // not an absolute URI: use the raw text
  }
  const last = path.split("/").filter(Boolean).pop();
  if (last === undefined) return undefined;
  const slug = last.replace(/\.md$/, "");
  return slug === "" ? undefined : slug;
}

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  return Number(raw.trim());
}

/** The problem's `error` member and the prepaid offer of its `extensions` member, when valid. */
export function signalsOf(body: unknown): PrepaidSignals {
  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : undefined;
  if (record === undefined) return {};
  const reason = str(record.error);
  const prepaidOffer = readPrepaidOffer(record.extensions);
  return {
    ...(reason !== undefined ? { reason } : {}),
    ...(prepaidOffer !== undefined ? { prepaidOffer } : {}),
  };
}

/** Body of a response as JSON, or `undefined` when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    return undefined;
  }
}

/** Maps a non-2xx response to a CriptonProblemError (RFC 9457 body, else `unexpected-status`). */
export async function parseProblem(response: Response): Promise<CriptonProblemError> {
  const retryAfterSeconds = retryAfter(response);
  const body = await readJson(response);
  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : undefined;
  const type = record ? str(record.type) : undefined;
  const slug = type !== undefined ? slugOf(type) : undefined;
  if (record === undefined || slug === undefined) {
    return new CriptonProblemError(
      "unexpected-status",
      response.status,
      undefined,
      undefined,
      undefined,
      retryAfterSeconds,
    );
  }
  return new CriptonProblemError(
    slug,
    response.status,
    str(record.title),
    str(record.detail),
    str(record.instance),
    retryAfterSeconds,
    signalsOf(record),
  );
}
