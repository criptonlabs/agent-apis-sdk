import type { KitResponse, ToolDefinition } from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type { SolanaAgentKit } from "../../index.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** The purchase tool spends funds and each call buys again. */
const PURCHASE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const address = (what: string) =>
  z.string().describe(`${what}: a base58 Solana address (32 bytes once decoded).`);
const transferMint = z
  .string()
  .describe('Asset to send: a base58 SPL mint address or "SOL" for native SOL.');
const amount = (what: string) => z.string().describe(`${what}: a decimal string, never a float.`);

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

const transfer = z.object({
  source: address("Sending wallet"),
  destination: address("Receiving wallet"),
  mint: transferMint,
  amount: amount("Amount to send in the asset's units"),
});

const purchase = z.object({
  bundle: z
    .string()
    .describe(
      "Credit bundle id, as listed in the API's prepaid credits offer (details.prepaidOffer.bundles[].id of a payment-disabled or credits-required error) or in GET /v1/pro/requirements.",
    ),
});

/**
 * Makes the bought token the kit's token when none is configured; false when one is configured or
 * the kit refuses it. The refusal is dropped, never raised: the purchase has settled (finding F2).
 */
function keepToken(kit: SolanaAgentKit, token: string): boolean {
  if (kit.credits.hasToken()) return false;
  try {
    kit.credits.adoptToken(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Buys one credit bundle within the configured per-purchase maximum and the kit's top-up budget,
 * keeps the bought token in the kit's memory only when none is configured (design D8, D13), and
 * returns the purchase without the token, with `tokenKept`.
 */
function purchaseTool(kit: SolanaAgentKit, maxAmount: string): ToolDefinition<unknown, unknown> {
  return {
    name: "solana_credits_topup",
    description:
      "Buys one prepaid credit bundle with the configured Solana wallet, paying at most the operator's per-purchase maximum and never more than the process's top-up budget. Each call is a new purchase. The bought credit token is never returned: when no token is configured it is kept in this process for later paid calls; when one is configured, that one stays in use. Returns the bundle, wallet, denomination, balance, lot expiry, pending flag, payment receipt and tokenKept (true when the bought token became this process's token). With tokenKept false the purchase still happened; the CLI rotate-token gives the wallet a token for its credits. A payment-settlement-failed error with details.eventId means the API could not confirm the purchase: it may still settle and its amount already counts toward the top-up budget, so do not buy it again; once the API reconciles the payment, the credits belong to the wallet and the CLI rotate-token gives it a token for them.",
    inputSchema: purchase,
    annotations: PURCHASE_ANNOTATIONS,
    run: async (input) => {
      const { bundle } = purchase.parse(input);
      const result = await kit.credits.topup({ bundle, maxAmount });
      const tokenKept = keepToken(kit, result.token);
      const { wallet, denomination, balance, lotExpiresAt, pending, receipt } = result;
      return {
        bundle: result.bundle,
        wallet,
        denomination,
        balance,
        lotExpiresAt,
        pending,
        receipt,
        tokenKept,
      };
    },
  };
}

/**
 * The 7 Solana tools, plus `solana_credits_topup` only when `options.topup` is given and the kit
 * has tier pro, a wallet and a top-up budget.
 */
export function createSolanaTools(
  kit: SolanaAgentKit,
  options?: { topup?: { maxAmount: string } },
): ToolDefinition<unknown, unknown>[] {
  const tools = readTools(kit);
  const topup = options?.topup;
  if (topup === undefined || !kit.credits.topupReady()) return tools;
  return [...tools, purchaseTool(kit, topup.maxAmount)];
}

function readTools(kit: SolanaAgentKit): ToolDefinition<unknown, unknown>[] {
  const { data } = kit;
  return [
    define(
      "solana_latest_slot",
      "Latest Solana slot: slot number and block time. Read-only.",
      empty,
      async () => unwrap(await data.latestSlot()),
    ),
    define(
      "solana_network_health",
      "Solana network health summary: status (up, down, unknown or unavailable), latest slot, probe latency and last probe time. Read-only.",
      empty,
      async () => unwrap(await data.health()),
    ),
    define(
      "solana_health_history",
      "Solana network health history over a time window: time buckets with samples, uptime percent and average latency. Read-only.",
      z.object({
        window: z
          .enum(["1h", "24h", "7d"])
          .optional()
          .describe("Time window: 1h, 24h or 7d (API default when omitted)."),
      }),
      async (i) => unwrap(await data.healthHistory(strip(i))),
    ),
    define(
      "solana_token",
      "SPL token mint data: token program, decimals, supply in display units and supply_atomic in base units, mint and freeze authorities, extensions, transfer fee and a safety verdict (safe, warn or danger, the highest level matched) with every matched reason code. Read-only.",
      z.object({ mint: address("Token mint (SOL is not a mint)") }),
      async (i) => unwrap(await data.token(i.mint)),
    ),
    define(
      "solana_transfer_readiness",
      "Checks whether a SOL or SPL token transfer between two wallets can succeed (balance, token accounts, fees). Returns a verdict (ready, not_ready or unknown), reasons (blocking codes), warnings and checks_failed (token accounts that exist but cannot be decoded), with amount_atomic, transfer_fee_atomic and net_amount_atomic in base units. The verdict is not_ready on any reason, else unknown on any failed check, else ready. Read-only.",
      transfer,
      async (i) => unwrap(await data.transferReadiness(i)),
    ),
    define(
      "solana_prepare_transfer",
      "Builds an unsigned Solana transfer description (instructions, readiness and token account creation cost) after checking readiness. A not_ready verdict fails with transfer-not-ready (details.reasons, details.warnings); an unknown or any other verdict fails with transfer-readiness-unknown (also details.checksFailed). Returns the unsigned transfer description only; it never signs or sends a transaction. Read-only.",
      transfer,
      async (i) => kit.prepareTransfer(i),
    ),
    define(
      "solana_credits_status",
      "Prepaid credit status of this process: whether a credit token is configured, whether SIWX spending is on, the last known balance per denomination (null before any credit-paid response) and the amount spent on top-ups. Sends no request and never returns the token. Read-only.",
      empty,
      async () => ({
        hasToken: kit.credits.hasToken(),
        siwxEnabled: kit.credits.siwxEnabled(),
        balance: kit.credits.lastKnownBalance(),
        topupSpent: kit.credits.topupSpent(),
      }),
    ),
  ];
}
