import { assertDecimal, type ApiClient } from "@criptonlabs/agent-apis-core";
import type { XrplDataPort } from "../../application/ports.js";
import { parseAsset } from "../../domain/asset.js";
import {
  assertClassicAddress,
  assertDepth,
  assertDestinationTag,
  assertHistoryWindow,
  assertLimit,
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

function asset(field: string, value: string): string {
  parseAsset(field, value);
  return value;
}

function opt<T>(value: T | undefined, map: (v: T) => string): string | undefined {
  return value === undefined ? undefined : map(value);
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
    fee: async () => api.request({ route: "fee", schema: RESPONSE_SCHEMAS["/v1/xrpl/fee"] }),
    health: async () =>
      api.request({ route: "health", schema: RESPONSE_SCHEMAS["/v1/xrpl/health"] }),
    networkHealth: async () =>
      api.request({ route: "network/health", schema: RESPONSE_SCHEMAS["/v1/xrpl/network/health"] }),
    healthHistory: async (q) => {
      const window = opt(q?.window, (w) => assertHistoryWindow("window", w));
      return api.request({
        route: "health/history",
        query: { window },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/health/history"],
      });
    },
    latestLedger: async () =>
      api.request({ route: "ledger/latest", schema: RESPONSE_SCHEMAS["/v1/xrpl/ledger/latest"] }),
    orderbook: async (q) => {
      const base = asset("base", q.base);
      const quote = asset("quote", q.quote);
      const depth = opt(q.depth, (d) => String(assertDepth("depth", d)));
      return api.request({
        route: "orderbook",
        query: { base, quote, depth },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/orderbook"],
      });
    },
    slippage: async (q) => {
      const base = asset("base", q.base);
      const quote = asset("quote", q.quote);
      const amount = assertDecimal("amount", q.amount);
      const depth = opt(q.depth, (d) => String(assertDepth("depth", d)));
      return api.request({
        route: "slippage",
        query: { base, quote, amount, depth },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/slippage"],
      });
    },
    amm: async (a, b) => {
      const first = asset("a", a);
      const second = asset("b", b);
      return api.request({
        route: `amm/${enc(first)}/${enc(second)}`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/amm/{a}/{b}"],
      });
    },
    accountSummary: async (address) =>
      api.request({
        route: `account/${assertClassicAddress("address", address)}/summary`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/summary"],
      }),
    accountLines: async (address, q) => {
      const checked = assertClassicAddress("address", address);
      const lines = limit(q?.limit, LINES_LIMIT);
      const peer = opt(q?.peer, (p) => assertClassicAddress("peer", p));
      return api.request({
        route: `account/${checked}/lines`,
        query: { limit: lines, peer, marker: q?.marker },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/lines"],
      });
    },
    accountTransactions: async (address, q) => {
      const checked = assertClassicAddress("address", address);
      const txLimit = limit(q?.limit, TX_LIMIT);
      return api.request({
        route: `account/${checked}/transactions`,
        query: { limit: txLimit, marker: q?.marker },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/account/{address}/transactions"],
      });
    },
    token: async (value) =>
      api.request({
        route: `token/${enc(asset("asset", value))}`,
        schema: RESPONSE_SCHEMAS["/v1/xrpl/token/{asset}"],
      }),
    paymentReadiness: async (q) => {
      const source = assertClassicAddress("source", q.source);
      const destination = assertClassicAddress("destination", q.destination);
      const tag = opt(q.destinationTag, (t) => String(assertDestinationTag("destinationTag", t)));
      return api.request({
        route: "payment-readiness",
        query: {
          source,
          destination,
          asset: opt(q.asset, (a) => asset("asset", a)),
          amount: opt(q.amount, (a) => assertDecimal("amount", a)),
          destination_tag: tag,
        },
        schema: RESPONSE_SCHEMAS["/v1/xrpl/payment-readiness"],
      });
    },
    paths: async (q) => {
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
      });
    },
  };
}
