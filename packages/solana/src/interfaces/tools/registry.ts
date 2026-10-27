import type { KitResponse, ToolDefinition } from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type { SolanaAgentKit } from "../../index.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
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

export function createSolanaTools(kit: SolanaAgentKit): ToolDefinition<unknown, unknown>[] {
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
      "SPL token mint data: token program, decimals, supply, mint and freeze authorities, extensions, transfer fee and a safety verdict with reasons. Read-only.",
      z.object({ mint: address("Token mint (SOL is not a mint)") }),
      async (i) => unwrap(await data.token(i.mint)),
    ),
    define(
      "solana_transfer_readiness",
      "Checks whether a SOL or SPL token transfer between two wallets can succeed (balance, token accounts, fees) and returns a verdict with blockers. Read-only.",
      transfer,
      async (i) => unwrap(await data.transferReadiness(i)),
    ),
    define(
      "solana_prepare_transfer",
      "Builds an unsigned Solana transfer description (instructions, readiness and token account creation cost) after checking readiness. Returns the unsigned transfer description only; it never signs or sends a transaction. Read-only.",
      transfer,
      async (i) => kit.prepareTransfer(i),
    ),
  ];
}
