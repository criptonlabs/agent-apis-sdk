import type { KitResponse, ToolDefinition } from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type { XrplAgentKit } from "../../index.js";
import { LINES_LIMIT, TX_LIMIT } from "../../infrastructure/http/xrpl-client.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const depth = z.number().int().optional().describe("Order book depth: 10, 50, 100 or 200.");
const asset = (what: string) =>
  z.string().describe(`${what}: "XRP" or "<currency>.<issuer>", for example "USD.rIssuer...".`);
const address = (what: string) => z.string().describe(`${what}: a classic XRPL address (r...).`);
const amount = (what: string) => z.string().describe(`${what}: a decimal string, never a float.`);
const ranged = (range: { readonly min: number; readonly max: number }, what: string) =>
  z
    .number()
    .int()
    .min(range.min)
    .max(range.max)
    .optional()
    .describe(`Maximum number of ${what} per page, ${range.min} to ${range.max}.`);

/** Drops undefined fields so optional kit parameters stay absent (exactOptionalPropertyTypes). */
function strip<R extends object>(value: object): R {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as R;
}

function unwrap<T>(response: KitResponse<T>): unknown {
  return response.receipt === null
    ? response.data
    : { ...response.data, receipt: response.receipt };
}

function define<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  run: (input: z.infer<S>) => Promise<unknown>,
): ToolDefinition<unknown, unknown> {
  return {
    name,
    description,
    inputSchema: schema,
    annotations: ANNOTATIONS,
    run: (input) => run(schema.parse(input)),
  };
}

const empty = z.object({});

export function createXrplTools(kit: XrplAgentKit): ToolDefinition<unknown, unknown>[] {
  const { data } = kit;
  return [
    define(
      "xrpl_fee",
      "Current XRP Ledger transaction fee tiers (economy, standard, priority) in drops and the network congestion band. Read-only.",
      empty,
      async () => unwrap(await data.fee()),
    ),
    define(
      "xrpl_network_health",
      "XRP Ledger network health summary: status (ok, degraded, down or unknown), latest ledger index and per-node probe results. Read-only.",
      empty,
      async () => unwrap(await data.networkHealth()),
    ),
    define(
      "xrpl_latest_ledger",
      "Latest validated XRP Ledger: index, hash and close time. Read-only.",
      empty,
      async () => unwrap(await data.latestLedger()),
    ),
    define(
      "xrpl_orderbook",
      "Funded order book of a market on the XRPL decentralized exchange (bids and asks with real, funded liquidity). Read-only.",
      z.object({ base: asset("Base asset"), quote: asset("Quote asset"), depth }),
      async (i) => unwrap(await data.orderbook(strip(i))),
    ),
    define(
      "xrpl_slippage",
      "Estimated slippage of buying an amount of the base asset on the order book and the AMM pool, and the best venue. Read-only.",
      z.object({
        base: asset("Base asset"),
        quote: asset("Quote asset"),
        amount: amount("Amount of the base asset to buy"),
        depth,
      }),
      async (i) => unwrap(await data.slippage(strip(i))),
    ),
    define(
      "xrpl_amm",
      "AMM pool of an asset pair: the two reserves and the trading fee. Read-only.",
      z.object({ a: asset("First asset"), b: asset("Second asset") }),
      async (i) => unwrap(await data.amm(i.a, i.b)),
    ),
    define(
      "xrpl_account_summary",
      "Summary of an XRPL account: XRP balance, sequence, owner count, transfer rate and trust lines. Read-only.",
      z.object({ address: address("Account") }),
      async (i) => unwrap(await data.accountSummary(i.address)),
    ),
    define(
      "xrpl_account_lines",
      "Trust lines of an XRPL account, paginated with a marker. Read-only.",
      z.object({
        address: address("Account"),
        limit: ranged(LINES_LIMIT, "lines"),
        peer: z.string().optional().describe("Only the lines with this counterparty address."),
        marker: z.string().optional().describe("Opaque page marker from a previous response."),
      }),
      async (i) => {
        const { address: account, ...query } = i;
        return unwrap(await data.accountLines(account, strip(query)));
      },
    ),
    define(
      "xrpl_account_transactions",
      "Recent transactions of an XRPL account, paginated with a marker. Read-only.",
      z.object({
        address: address("Account"),
        limit: ranged(TX_LIMIT, "transactions"),
        marker: z.string().optional().describe("Opaque page marker from a previous response."),
      }),
      async (i) => {
        const { address: account, ...query } = i;
        return unwrap(await data.accountTransactions(account, strip(query)));
      },
    ),
    define(
      "xrpl_token",
      "Issued token data: issuer, currency, transfer fee, freeze and authorization flags, domain and outstanding obligations. Read-only.",
      z.object({ asset: asset("Token") }),
      async (i) => unwrap(await data.token(i.asset)),
    ),
    define(
      "xrpl_payment_readiness",
      "Checks whether a payment between two accounts can succeed (trust line, reserve, destination rules) and returns a verdict with reasons. Read-only.",
      z.object({
        source: address("Sending account"),
        destination: address("Receiving account"),
        asset: asset("Asset to send").optional(),
        amount: amount("Amount to send").optional(),
        destinationTag: z.number().int().optional().describe("Destination tag, 0 to 4294967295."),
      }),
      async (i) => unwrap(await data.paymentReadiness(strip(i))),
    ),
    define(
      "xrpl_paths",
      "Multi-hop payment paths for a cross-currency payment: alternatives with the source amount needed. Can take up to about 20 seconds. Read-only.",
      z.object({
        source: address("Sending account"),
        destination: address("Receiving account"),
        asset: asset("Asset the destination receives"),
        amount: amount("Amount the destination receives"),
        sendMaxAsset: z.string().optional().describe("Asset the source spends at most."),
        sendMax: z
          .string()
          .optional()
          .describe("Maximum amount the source spends, decimal string."),
        sourceAssets: z.array(z.string()).optional().describe("Candidate assets to spend."),
      }),
      async (i) => unwrap(await data.paths(strip(i))),
    ),
    define(
      "xrpl_prepare_payment",
      "Builds an unsigned XRPL Payment transaction after checking readiness, finding a path for cross-currency payments and choosing a fee. Never signs or submits. Read-only.",
      z.object({
        source: address("Sending account"),
        destination: address("Receiving account"),
        asset: asset("Asset the destination receives"),
        amount: amount("Amount the destination receives"),
        destinationTag: z.number().int().optional().describe("Destination tag, 0 to 4294967295."),
        sourceAsset: z.string().optional().describe("Asset to spend for a cross-currency payment."),
        sendMaxTolerancePct: z
          .string()
          .optional()
          .describe("Percent margin over the quoted source amount; required for cross-currency."),
        feeTier: z.enum(["economy", "standard", "priority"]).optional(),
        maxFeeDrops: z.string().optional().describe("Refuse when the fee exceeds these drops."),
      }),
      async (i) => kit.preparePayment(strip(i)),
    ),
    define(
      "xrpl_dex_quote",
      "Quote for buying an amount of the base asset on the XRPL DEX: filled amount, average price, slippage and best venue. Refuses when slippage exceeds the limit. Read-only.",
      z.object({
        base: asset("Base asset"),
        quote: asset("Quote asset"),
        amount: amount("Amount of the base asset to buy"),
        depth,
        maxSlippagePct: z.string().optional().describe("Refuse above this slippage percent."),
      }),
      async (i) => kit.dexQuote(strip(i)),
    ),
    define(
      "xrpl_credits_status",
      "Prepaid credit status of this process: whether a credit token is configured, the last known balance per denomination (null before any credit-paid response) and the amount spent on top-ups. Sends no request and never returns the token. Read-only.",
      empty,
      async () => ({
        hasToken: kit.credits.hasToken(),
        balance: kit.credits.lastKnownBalance(),
        topupSpent: kit.credits.topupSpent(),
      }),
    ),
  ];
}
