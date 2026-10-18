import { CriptonProblemError } from "../../domain/errors.js";

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

/** Maps a non-2xx response to a CriptonProblemError (RFC 9457 body, else `unexpected-status`). */
export async function parseProblem(response: Response): Promise<CriptonProblemError> {
  const retryAfterSeconds = retryAfter(response);
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = undefined;
  }
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
  );
}
