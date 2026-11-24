import { assertDecimal, type ApiClient, type CallOptions } from "@criptonlabs/agent-apis-core";
import type { XrplDataPort } from "../../application/ports.js";
import { parseAsset } from "../../domain/asset.js";
import {
  assertClassicAddress,
  assertCredentials,
  assertDepth,
  assertDestinationTag,
  assertDomainId,
  assertHistoryWindow,
  assertLimit,
  assertSide,
} from "../../domain/validation.js";
import { PATHS_TIMEOUT_MS } from "../descriptor.js";
import { RESPONSE_SCHEMAS } from "./schemas.js";

const enc = encodeURIComponent;

// Page-size ranges enforced by the API (400 `invalid-parameters` outside them); checked locally first.
export const LINES_LIMIT = { min: 10, max: 400 } as const;
export const TX_LIMIT = { min: 1, max: 50 } as const;

function limit(value: number | undefined, range: { min: number; max: number }): string | undefined {
  return opt(value, (v) => String(assertLimit("limit", v, range.min, range.max)));
}

function asset(field: string, value: string, options?: { allowMpt?: boolean }): string {
  parseAsset(field, value, options);
  return value;
}

function opt<T>(value: T | undefined, map: (v: T) => string): string | undefined {
  return value === undefined ? undefined : map(value);
}

/** The call options forwarded to the core, which validates and sends them (design D11). */
function call(options: CallOptions | undefined): { idempotencyKey?: string } {
  return options?.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey };
}

export interface XrplDataClientOptions {
  pathsTimeoutMs?: number;
}

export function createXrplDataClient(
  api: ApiClient,
  options: XrplDataClientOptions = {},
): XrplDataPort {
  const pathsTimeoutMs = options.pathsTimeoutMs ?? PATHS_TIMEOUT_MS;
  return {
    fee: async (options) =>
      api.request({ route: "fee", schema: RESPONSE_SCHEMAS["/v1/xrpl/fee"], ...call(options) }),
    health: async (options) =>
      api.request({
        route: "health",
        schema: RESPONSE_SCHEMAS["/v1/xrpl/health"],
        ...call(options),
      }),
    networkHealth: async (options) =>
      api.request({
        route: "network/health",
        schema: RESPONSE_SCHEMAS["/v1/xrpl/network/health"],
        ...call(options),
      }),
    healthHistory: async (q, options) => {
      const window = opt(q?.window, (w) => assertHistoryWindow("window", w));
      return api.request({
        route: "health/history",
        query: { window },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/health/history"],
        ...call(options),
      });
    },
    latestLedger: async (options) =>
      api.request({
        route: "ledger/latest",
        schema: RESPONSE_SCHEMAS["/v1/xrpl/ledger/latest"],
        ...call(options),
      }),
    orderbook: async (q, options) => {
      const base = asset("base", q.base);
      const quote = asset("quote", q.quote);
      const depth = opt(q.depth, (d) => String(assertDepth("depth", d)));
      const domain = opt(q.domain, (d) => assertDomainId("domain", d));
      return api.request({
        route: "orderbook",
        query: { base, quote, depth, domain },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/orderbook"],
        ...call(options),
      });
    },
    slippage: async (q, options) => {
      const base = asset("base", q.base);
      const quote = asset("quote", q.quote);
      const amount = assertDecimal("amount", q.amount);
      const depth = opt(q.depth, (d) => String(assertDepth("depth", d)));
      const side = opt(q.side, (s) => assertSide("side", s));
      const domain = opt(q.domain, (d) => assertDomainId("domain", d));
      return api.request({
        route: "slippage",
        query: { base, quote, amount, depth, side, domain },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/slippage"],
        ...call(options),
      });
    },
    amm: async (a, b, options) => {
      const first = asset("a", a);
      const second = asset("b", b);
      return api.request({
        route: `amm/${enc(first)}/${enc(second)}`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/amm/{a}/{b}"],
        ...call(options),
      });
    },
    accountSummary: async (address, options) =>
      api.request({
        route: `account/${assertClassicAddress("address", address)}/summary`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/summary"],
        ...call(options),
      }),
    accountLines: async (address, q, options) => {
      const checked = assertClassicAddress("address", address);
      const lines = limit(q?.limit, LINES_LIMIT);
      const peer = opt(q?.peer, (p) => assertClassicAddress("peer", p));
      return api.request({
        route: `account/${checked}/lines`,
        query: { limit: lines, peer, marker: q?.marker },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/lines"],
        ...call(options),
      });
    },
    accountTransactions: async (address, q, options) => {
      const checked = assertClassicAddress("address", address);
      const txLimit = limit(q?.limit, TX_LIMIT);
      return api.request({
        route: `account/${checked}/transactions`,
        query: { limit: txLimit, marker: q?.marker },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/transactions"],
        ...call(options),
      });
    },
    token: async (value, options) =>
      api.request({
        route: `token/${enc(asset("asset", value))}`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/token/{asset}"],
        ...call(options),
      }),
    paymentReadiness: async (q, options) => {
      const source = assertClassicAddress("source", q.source);
      const destination = assertClassicAddress("destination", q.destination);
      const tag = opt(q.destinationTag, (t) => String(assertDestinationTag("destinationTag", t)));
      return api.request({
        route: "payment-readiness",
        query: {
          source,
          destination,
          asset: opt(q.asset, (a) => asset("asset", a, { allowMpt: true })),
          amount: opt(q.amount, (a) => assertDecimal("amount", a)),
          destination_tag: tag,
          credentials: opt(q.credentials, (c) => assertCredentials("credentials", c).join(",")),
        },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/payment-readiness"],
        ...call(options),
      });
    },
    paths: async (q, options) => {
      const source = assertClassicAddress("source", q.source);
      const destination = assertClassicAddress("destination", q.destination);
      const assetValue = asset("asset", q.asset);
      const amount = assertDecimal("amount", q.amount);
      return api.request({
        route: "paths",
        query: {
          source,
          destination,
          asset: assetValue,
          amount,
          send_max_asset: opt(q.sendMaxAsset, (a) => asset("sendMaxAsset", a)),
          send_max: opt(q.sendMax, (a) => assertDecimal("sendMax", a)),
          source_assets: opt(q.sourceAssets, (list) =>
            list.map((a) => asset("sourceAssets", a)).join(","),
          ),
        },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/paths"],
        timeoutMs: pathsTimeoutMs,
        ...call(options),
      });
    },
  };
}
