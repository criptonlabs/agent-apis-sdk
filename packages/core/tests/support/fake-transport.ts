import type { Transport } from "../../src/application/ports.js";

export interface ScriptedResponse {
  status?: number;
  headers?: Record<string, string>;
  /** A string is sent as is; an object is sent as JSON. */
  body?: string | object;
}

export interface RecordedRequest {
  url: string;
  method: string;
  /** Header names are lower-cased. */
  headers: Record<string, string>;
}

type Step =
  | { kind: "response"; response: ScriptedResponse }
  | { kind: "hang" }
  | { kind: "reject"; error: unknown };

function plainHeaders(
  headers: ConstructorParameters<typeof Headers>[0] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function toResponse(scripted: ScriptedResponse): Response {
  const headers = new Headers(scripted.headers);
  let body: string | null = null;
  if (typeof scripted.body === "string") {
    body = scripted.body;
  } else if (scripted.body !== undefined) {
    body = JSON.stringify(scripted.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new Response(body, { status: scripted.status ?? 200, headers });
}

/** Scripted queue of responses; records every request. */
export class FakeTransport {
  readonly requests: RecordedRequest[] = [];
  private readonly steps: Step[] = [];
  private responder: ((request: RecordedRequest) => ScriptedResponse) | undefined;

  respond(response: ScriptedResponse): this {
    this.steps.push({ kind: "response", response });
    return this;
  }

  /** Never resolves; rejects with the abort reason when `init.signal` aborts. */
  hang(): this {
    this.steps.push({ kind: "hang" });
    return this;
  }

  reject(error: unknown): this {
    this.steps.push({ kind: "reject", error });
    return this;
  }

  /** Answers every request with the function result instead of the queue (order-independent scripts). */
  respondWith(fn: (request: RecordedRequest) => ScriptedResponse): this {
    this.responder = fn;
    return this;
  }

  readonly transport: Transport = (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init.method ?? "GET",
      headers: plainHeaders(init.headers),
    };
    this.requests.push(request);
    if (this.responder) return Promise.resolve(toResponse(this.responder(request)));
    const step = this.steps.shift();
    if (!step) return Promise.reject(new Error("fake-transport: no scripted response left"));
    if (step.kind === "reject") return Promise.reject(step.error);
    if (step.kind === "response") return Promise.resolve(toResponse(step.response));
    return new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
}
