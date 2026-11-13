import type { z } from "zod";
import type {
  Clock,
  CreditBalance,
  KitConfig,
  KitResponse,
  NetworkDescriptor,
  PriceIndex,
  RotationResult,
  TopupRequest,
  TopupResult,
} from "../../application/ports.js";
import { parseCreditBalance } from "../../domain/credit-balance.js";
import { assertCreditToken, assertIdempotencyKey } from "../../domain/credit-token.js";
import { assertDecimal } from "../../domain/decimal.js";
import {
  CriptonKitError,
  CriptonNetworkError,
  CriptonResponseError,
  CriptonValidationError,
} from "../../domain/errors.js";
import { SpendLedger } from "../../domain/spend-ledger.js";
import { TopupLedger } from "../../domain/topup-ledger.js";
import { CORE_VERSION } from "../config/version.js";
import { rotateCreditToken, SiwxSpending, type SiwxSend } from "../credits/siwx-flow.js";
import { buyBundle, validTopup } from "../credits/topup.js";
import { toPriceIndex } from "../x402/price-index.js";
import { toPriceLookup, type PriceLookupResult } from "../x402/price-lookup.js";
import { handlePaymentRequired } from "../x402/x402-flow.js";
import { parseProblem } from "./problem.js";
import { defaultTransport } from "./transport.js";

export interface RouteCall<T> {
  route: string;
  query?: Record<string, string | undefined>;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  idempotencyKey?: string;
}

const DEFAULT_BASE_URL = "https://api.criptonlabs.com";
const DEFAULT_TIMEOUT_MS = 10_000;
/** Floor of the signed retry: the API waits for settlement (~8.5 s measured on testnet). */
const PAID_RETRY_TIMEOUT_MS = 30_000;
/** The process clock, used when the configuration has none. */
const SYSTEM_CLOCK: Clock = { nowMs: () => Date.now() };

function toNetworkError(error: unknown): CriptonKitError {
  if (error instanceof CriptonKitError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new CriptonNetworkError("timeout", "Request timed out");
  }
  return new CriptonNetworkError("network-error", "Network request failed");
}

/** Parses a JSON body; a syntax error becomes `invalid-response`. */
async function jsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new CriptonResponseError("Response body is not valid JSON");
    throw error;
  }
}

function withQuery(url: URL, query: Record<string, string | undefined> = {}): URL {
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

/**
 * The configured credit token. Credit credentials (a token or SIWX spending) need the paid tier
 * and a token needs the API grammar; neither error carries the token.
 */
function creditTokenOf(config: KitConfig): string | undefined {
  const credits = config.credits ?? {};
  const wantsCredentials = credits.token !== undefined || credits.siwxSpend === true;
  if (wantsCredentials && config.tier !== "pro") {
    throw new CriptonValidationError("tier", "Credit credentials need tier pro");
  }
  return credits.token === undefined
    ? undefined
    : assertCreditToken("credits.token", credits.token);
}

/** The top-up budget, checked when the client is built, before any request (design D7). */
function topupBudgetOf(config: KitConfig): string | undefined {
  const budget = config.credits?.topupBudget;
  return budget === undefined ? undefined : assertDecimal("credits.topupBudget", budget);
}

/** SIWX spending when it is on and the wallet's SIWX signer is configured (design D4, D9). */
function siwxSpendingOf(config: KitConfig): SiwxSpending | undefined {
  const { siwxSigner, siwxSpend } = config.credits ?? {};
  if (siwxSpend !== true || siwxSigner === undefined) return undefined;
  return new SiwxSpending({
    signer: siwxSigner,
    clock: config.clock ?? SYSTEM_CLOCK,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
  });
}

/** The idempotency key as a header, checked before any request; sent only with credit credentials. */
function idempotencyHeaders(idempotencyKey: string | undefined): Record<string, string> {
  if (idempotencyKey === undefined) return {};
  return { "Idempotency-Key": assertIdempotencyKey("idempotencyKey", idempotencyKey) };
}

/** The configuration without the credit token, which lives only in a private field (design D8). */
function withoutToken(config: KitConfig): KitConfig {
  if (config.credits?.token === undefined) return config;
  const { token: _token, ...credits } = config.credits;
  return { ...config, credits };
}

export class ApiClient {
  readonly config: KitConfig;
  private readonly ledger: SpendLedger | undefined;
  readonly #topups: TopupLedger;
  #token: string | undefined;
  readonly #siwx: SiwxSpending | undefined;
  #balance: CreditBalance | null = null;

  constructor(
    readonly descriptor: NetworkDescriptor,
    config: KitConfig = {},
  ) {
    this.#token = creditTokenOf(config);
    this.config = withoutToken(config);
    const payment = config.payment;
    this.ledger = payment
      ? new SpendLedger({
          maxPerCall: payment.maxPerCall,
          ...(payment.sessionBudget !== undefined ? { sessionBudget: payment.sessionBudget } : {}),
        })
      : undefined;
    this.#topups = new TopupLedger(topupBudgetOf(config));
    this.#siwx = siwxSpendingOf(config);
  }

  private routeUrl(route: string, query?: Record<string, string | undefined>): string {
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const { network } = this.descriptor;
    const prefix = this.config.tier === "pro" ? `/v1/pro/${network}` : `/v1/${network}`;
    return withQuery(new URL(`${base}${prefix}/${route}`), query).toString();
  }

  private timeoutFor(call: RouteCall<unknown>): number {
    return (
      call.timeoutMs ??
      this.descriptor.routeTimeoutsMs?.[call.route] ??
      this.config.timeoutMs ??
      DEFAULT_TIMEOUT_MS
    );
  }

  async request<T>(call: RouteCall<T>): Promise<KitResponse<T>> {
    const idempotency = idempotencyHeaders(call.idempotencyKey);
    const url = this.routeUrl(call.route, call.query);
    const timeoutMs = this.timeoutFor(call);
    const send = (extra: Record<string, string>): Promise<Response> =>
      this.send(url, timeoutMs, extra);
    const paidSend = (extra: Record<string, string>): Promise<Response> =>
      this.send(url, Math.max(timeoutMs, PAID_RETRY_TIMEOUT_MS), extra);
    const parse = async (response: Response): Promise<T> => {
      const parsed = call.schema.safeParse(await jsonBody(response));
      if (!parsed.success) {
        throw new CriptonResponseError("Response does not match the expected schema");
      }
      return parsed.data;
    };
    try {
      const response = await this.withCredentials(url, idempotency, send);
      if (response.ok) return await this.answered(response, parse);
      // A credit refusal carries the route's challenge: it is handled as a request without
      // credentials, and the paid retry never resends them (design D5).
      if (response.status === 402) {
        return await handlePaymentRequired(
          response,
          { payer: this.config.wallet, ledger: this.ledger },
          paidSend,
          parse,
        );
      }
      throw await parseProblem(response);
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  /** The free price of one paid resource, without credentials (design D5, D12). */
  async priceOf(resource: string): Promise<PriceLookupResult> {
    return toPriceLookup(await this.requirements(`?resource=${encodeURIComponent(resource)}`));
  }

  /** The free price index of every paid route, without `resource` or credentials (design D12). */
  async priceIndex(): Promise<PriceIndex> {
    return toPriceIndex(await this.requirements(""));
  }

  /**
   * Buys a credit bundle with the kit wallet (design D7): `POST /v1/pro/credits/<bundle>` whatever
   * the tier, without credentials, paid within `maxAmount` and the top-up budget, never retried.
   */
  async topup(request: TopupRequest): Promise<TopupResult> {
    const { bundle, maxAmount } = validTopup(request);
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const url = new URL(`${base}/v1/pro/credits/${bundle}`).toString();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      return await buyBundle(
        { bundle, maxAmount },
        {
          wallet: this.config.wallet,
          ledger: this.#topups,
          send: (headers) => this.send(url, timeoutMs, headers, "POST"),
          sendSigned: (headers) =>
            this.send(url, Math.max(timeoutMs, PAID_RETRY_TIMEOUT_MS), headers, "POST"),
        },
      );
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  /**
   * Rotates the wallet's credit tokens with a SIWX proof (design D10): `POST /v1/pro/credits/token`
   * without credentials, never debited. The configured token is left as is.
   */
  async rotateToken(): Promise<RotationResult> {
    const signer = this.config.credits?.siwxSigner;
    if (signer === undefined) {
      throw new CriptonValidationError("wallet", "Token rotation needs a wallet");
    }
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const url = new URL(`${base}/v1/pro/credits/token`).toString();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      return await rotateCreditToken({
        signer,
        baseUrl: base,
        url,
        send: (headers) => this.send(url, timeoutMs, headers, "POST"),
      });
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  /**
   * Keeps a bought credit token in the private field when the tier is pro and none is configured
   * (design D8, D13); a refusal changes nothing. No error carries the token.
   */
  adoptToken(token: string): void {
    if (this.config.tier !== "pro") {
      throw new CriptonValidationError("tier", "Credit credentials need tier pro");
    }
    if (this.#token !== undefined) {
      throw new CriptonValidationError("token", "A credit token is already configured");
    }
    this.#token = assertCreditToken("token", token);
  }

  hasCreditToken(): boolean {
    return this.#token !== undefined;
  }

  /** Whether SIWX spending is on: `siwxSpend` with the wallet's SIWX signer. */
  siwxEnabled(): boolean {
    return this.#siwx !== undefined;
  }

  lastKnownBalance(): CreditBalance | null {
    return this.#balance;
  }

  spent(): string {
    return this.ledger?.spent ?? "0";
  }

  /** The amount signed for top-ups in this process, reported apart from `spent()`. */
  topupSpent(): string {
    return this.#topups.spent;
  }

  /** The JSON body of `GET /v1/pro/requirements<query>`, sent without credentials. */
  private async requirements(query: string): Promise<unknown> {
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const url = `${base}/v1/pro/requirements${query}`;
    try {
      const response = await this.send(url, this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS, {});
      if (!response.ok) throw await parseProblem(response);
      return await jsonBody(response);
    } catch (error) {
      throw toNetworkError(error);
    }
  }

  /**
   * Sends a data request with one credential, in API order (design D5): the Bearer token when one
   * is configured (never followed by a SIWX proof), else SIWX spending when it is on, else none.
   * The idempotency key goes only with a credential.
   */
  private withCredentials(
    url: string,
    idempotency: Record<string, string>,
    send: SiwxSend,
  ): Promise<Response> {
    if (this.#token !== undefined) {
      return send({ Authorization: `Bearer ${this.#token}`, ...idempotency });
    }
    if (this.#siwx === undefined) return send({});
    return this.#siwx.send({ url, proofHeaders: idempotency, send });
  }

  /** A direct answer with the credit balance it reports (kept when valid) and its replay flag. */
  private async answered<T>(
    response: Response,
    parse: (response: Response) => Promise<T>,
  ): Promise<KitResponse<T>> {
    const credits = parseCreditBalance(response.headers.get("x-credits-remaining"));
    if (credits !== null) this.#balance = credits;
    const replayed = response.headers.get("idempotency-replayed") === "true";
    return { data: await parse(response), receipt: null, credits, replayed };
  }

  private send(
    url: string,
    timeoutMs: number,
    extra: Record<string, string>,
    method: "GET" | "POST" = "GET",
  ): Promise<Response> {
    const transport = this.config.transport ?? defaultTransport;
    return transport(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": `${this.descriptor.productToken} agent-apis-core/${CORE_VERSION}`,
        ...extra,
      },
    });
  }
}
