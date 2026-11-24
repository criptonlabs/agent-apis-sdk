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

const depth = z
  .number()
  .int()
  .optional()
  .describe(
    "Order book depth: an integer from 1 to 9007199254740991; the API serves it in buckets of 10, 50 or 100 levels per side, reported as depth_effective.",
  );
const ASSET_FORMS =
  '"XRP" or "CODE.issuer", where CODE is a case-sensitive 3-character code ("usd" and "USD" are different tokens) or a 40-hex code and issuer is a classic XRPL address, for example "USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"; a longer code such as RLUSD goes in its 40-hex form, "524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"';
const asset = (what: string) => z.string().describe(`${what}: ${ASSET_FORMS}.`);
const domain = (effect: string) =>
  z.string().optional().describe(`PermissionedDomain id (64 hex characters): ${effect}.`);
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
      z.object({
        base: asset("Base asset"),
        quote: asset("Quote asset"),
        depth,
        domain: domain("reads the permissioned order book of that domain instead of the open book"),
      }),
      async (i) => unwrap(await data.orderbook(strip(i))),
    ),
    define(
      "xrpl_slippage",
      "Estimated slippage of buying or selling an amount of the base asset on the order book and the AMM pool, and the best venue. Read-only.",
      z.object({
        base: asset("Base asset, bought (side buy) or sold (side sell)"),
        quote: asset("Quote asset, paid (side buy) or received (side sell)"),
        amount: amount("Amount of the base asset to buy or sell"),
        depth,
        side: z
          .enum(["buy", "sell"])
          .optional()
          .describe(
            "Trade direction: buy (the API default) walks the asks, paying quote for the amount of base; sell walks the bids, selling the amount of base for quote.",
          ),
        domain: domain(
          "reads the permissioned order book of that domain instead of the open book; the AMM is then not read",
        ),
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
      "Summary of an XRPL account: XRP balance, sequence, owner count, transfer fee percent and trust lines. Read-only.",
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
        asset: z
          .string()
          .optional()
          .describe(
            `Asset to send: ${ASSET_FORMS}; or a 48-hex MPT issuance id, for example "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47", with amount in whole base units.`,
          ),
        amount: amount("Amount to send").optional(),
        destinationTag: z.number().int().optional().describe("Destination tag, 0 to 4294967295."),
        credentials: z
          .array(z.string())
          .optional()
          .describe(
            "Credential entry ids to present, 1 to 8 distinct ids of 64 hex characters; the deposit_authorized check reads them even when the destination does not require deposit authorization.",
          ),
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
        sendMaxAsset: asset("Asset the source spends at most").optional(),
        sendMax: z
          .string()
          .optional()
          .describe("Maximum amount the source spends, decimal string."),
        sourceAssets: z
          .array(z.string())
          .optional()
          .describe(`Candidate assets to spend, each ${ASSET_FORMS}.`),
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
        sourceAsset: asset("Asset to spend for a cross-currency payment").optional(),
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
