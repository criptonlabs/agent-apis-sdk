import type { z } from "zod";
import type { KitConfig, KitResponse, NetworkDescriptor } from "../../application/ports.js";
import { CriptonKitError, CriptonNetworkError, CriptonResponseError } from "../../domain/errors.js";
import { SpendLedger } from "../../domain/spend-ledger.js";
import { CORE_VERSION } from "../config/version.js";
import { toPriceLookup, type PriceLookupResult } from "../x402/price-lookup.js";
import { handlePaymentRequired } from "../x402/x402-flow.js";
import { parseProblem } from "./problem.js";
import { defaultTransport } from "./transport.js";

export interface RouteCall<T> {
  route: string;
  query?: Record<string, string | undefined>;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.criptonlabs.com";
const DEFAULT_TIMEOUT_MS = 10_000;

function toNetworkError(error: unknown): CriptonKitError {
  if (error instanceof CriptonKitError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new CriptonNetworkError("timeout", "Request timed out");
  }
  return new CriptonNetworkError("network-error", "Network request failed");
}

export class ApiClient {
  private readonly ledger: SpendLedger | undefined;

  constructor(
    readonly descriptor: NetworkDescriptor,
    readonly config: KitConfig = {},
  ) {
    const payment = config.payment;
    this.ledger = payment
      ? new SpendLedger({
          maxPerCall: payment.maxPerCall,
          ...(payment.sessionBudget !== undefined ? { sessionBudget: payment.sessionBudget } : {}),
        })
      : undefined;
  }

  async request<T>(call: RouteCall<T>): Promise<KitResponse<T>> {
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const prefix =
      this.config.tier === "pro"
        ? `/v1/pro/${this.descriptor.network}`
        : `/v1/${this.descriptor.network}`;
    const url = new URL(`${base}${prefix}/${call.route}`);
    for (const [key, value] of Object.entries(call.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const timeoutMs =
      call.timeoutMs ??
      this.descriptor.routeTimeoutsMs?.[call.route] ??
      this.config.timeoutMs ??
      DEFAULT_TIMEOUT_MS;
    const send = (extra: Record<string, string>): Promise<Response> =>
      this.send(url.toString(), timeoutMs, extra);
    const parse = async (response: Response): Promise<T> => {
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new CriptonResponseError("Response body is not valid JSON");
        throw error;
      }
      const parsed = call.schema.safeParse(body);
      if (!parsed.success) {
        throw new CriptonResponseError("Response does not match the expected schema");
      }
      return parsed.data;
    };
    try {
      const response = await send({});
      if (response.ok) return { data: await parse(response), receipt: null };
      if (response.status === 402) {
        return await handlePaymentRequired(response, this.config.payment, this.ledger, send, parse);
      }
      throw await parseProblem(response);
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  async priceOf(resource: string): Promise<PriceLookupResult> {
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const url = `${base}/v1/pro/requirements?resource=${encodeURIComponent(resource)}`;
    try {
      const response = await this.send(url, this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS, {});
      if (!response.ok) throw await parseProblem(response);
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new CriptonResponseError("Response body is not valid JSON");
        throw error;
      }
      return toPriceLookup(body);
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  spent(): string {
    return this.ledger?.spent ?? "0";
  }

  private send(url: string, timeoutMs: number, extra: Record<string, string>): Promise<Response> {
    const transport = this.config.transport ?? defaultTransport;
    return transport(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": `${this.descriptor.productToken} agent-apis-core/${CORE_VERSION}`,
        ...extra,
      },
    });
  }
}
