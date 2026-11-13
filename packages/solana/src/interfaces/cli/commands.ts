import { type CliReveal, CriptonValidationError } from "@criptonlabs/agent-apis-core";
import type { CliCommand } from "@criptonlabs/agent-apis-core/cli";
import type { SolanaAgentKit, TransferIntent } from "../../index.js";
import { solanaMcpOptions, startSolanaMcpServerWithKit } from "../mcp/server.js";

type Args = Parameters<CliCommand["run"]>[0];

function required(args: Args, name: string): string {
  const value = args.values[name];
  if (typeof value !== "string") {
    throw new CriptonValidationError(name, `--${name} is required`);
  }
  return value;
}

function positional(args: Args, field: string): string {
  const value = args.positionals[0];
  if (value === undefined) {
    throw new CriptonValidationError(field, `${field} is required`);
  }
  return value;
}

function transferIntent(args: Args): TransferIntent {
  return {
    source: required(args, "from"),
    destination: required(args, "to"),
    mint: required(args, "mint"),
    amount: required(args, "amount"),
  };
}

const str = { type: "string" } as const;
const transferOptions = { from: str, to: str, mint: str, amount: str };

const TOKEN_NOTICE = "Store this credit token in CRIPTON_CREDITS_TOKEN now: it is not shown again.";

const TOPUP_HELP = `Usage: agent-apis-solana topup <bundle> --max <amount> [--json]

Buys one prepaid credit bundle with the Solana wallet (CRIPTON_SOLANA_PAYER_KEY)
in its configured asset (CRIPTON_SOLANA_PAY_ASSET: USDC pays the bundles priced
in USD, EURC the bundles priced in EUR) and prints the new credit token once.
Bundle ids and prices come from the API's credits offer at run time; none is
fixed in the kit.

Purchase limits:
  - --max <amount> is mandatory: the most this purchase may pay, decimal string.
    A bundle priced above it is refused before anything is signed.
  - maxPerCall (CRIPTON_MAX_PER_CALL) and sessionBudget (CRIPTON_SESSION_BUDGET)
    never apply to purchases; they limit per-call payments only.
  - CRIPTON_TOPUP_BUDGET (set together with CRIPTON_TOPUP_MAX) caps the total of
    this process's purchases.
  - The credit token is shown once: store it in CRIPTON_CREDITS_TOKEN right away.
    A Solana wallet recovers its credits with agent-apis-solana rotate-token,
    which revokes the wallet's earlier tokens.
  - The MCP tool solana_credits_topup exists only with CRIPTON_TIER=pro,
    CRIPTON_SOLANA_PAYER_KEY, CRIPTON_TOPUP_MAX (its per-purchase maximum) and
    CRIPTON_TOPUP_BUDGET (its per-process budget). It keeps the bought token in
    process memory and never shows it to the model; with CRIPTON_CREDITS_TOKEN
    set, it keeps using that token and does not keep the bought one.
  - Its result reports tokenKept: true when the bought token became the
    process's token. When tokenKept is false (a token was already configured,
    or the bought token could not be kept), the purchase still happened:
    agent-apis-solana rotate-token gives the wallet a token for its credits and
    revokes the wallet's earlier tokens.
`;

const ROTATE_TOKEN_HELP = `Usage: agent-apis-solana rotate-token [--json]

Issues a new credit token for the Solana wallet (CRIPTON_SOLANA_PAYER_KEY) with a
Sign-In-With-X proof and prints it once; the API revokes every earlier token of
the wallet. Use it to recover the wallet's credits when its token is lost. It
never debits credits; a wallet without credits gets credits-required. Needs the
optional peer @x402/extensions. Store the new token in CRIPTON_CREDITS_TOKEN
right away: it is not shown again.
`;

const CREDITS_HELP = `Usage: agent-apis-solana credits [--json]

Prints whether a credit token is configured (CRIPTON_CREDITS_TOKEN), whether SIWX
spending is on (CRIPTON_SOLANA_SIWX), the last known balance per denomination and
the amount spent on top-ups by this process. Sends no request and never prints
the token. A fresh process has balance null.
`;

export function solanaCommands(
  kitFactory: (env: NodeJS.ProcessEnv) => SolanaAgentKit,
): CliCommand[] {
  return [
    {
      name: "mcp",
      description: "Start the stdio MCP server",
      async run(_args, env) {
        await startSolanaMcpServerWithKit(kitFactory(env), solanaMcpOptions(env));
        // The server owns stdout from now on; never resolve so no result is printed to it.
        return new Promise<never>(() => {});
      },
    },
    {
      name: "slot",
      description: "Latest Solana slot and block time",
      async run(_args, env) {
        return (await kitFactory(env).data.latestSlot()).data;
      },
    },
    {
      name: "health",
      description: "Solana network health summary",
      async run(_args, env) {
        return (await kitFactory(env).data.health()).data;
      },
    },
    {
      name: "token",
      description: "SPL token mint data: token <mint>",
      positionals: 1,
      async run(args, env) {
        return (await kitFactory(env).data.token(positional(args, "mint"))).data;
      },
    },
    {
      name: "readiness",
      description: "Transfer readiness: --from --to --mint --amount",
      options: transferOptions,
      async run(args, env) {
        return (await kitFactory(env).data.transferReadiness(transferIntent(args))).data;
      },
    },
    {
      name: "prepare-transfer",
      description: "Prepare an unsigned transfer description: --from --to --mint --amount",
      options: transferOptions,
      async run(args, env) {
        return kitFactory(env).prepareTransfer(transferIntent(args));
      },
    },
    {
      name: "topup",
      description: "Buy a prepaid credit bundle: topup <bundle> --max <amount>",
      help: TOPUP_HELP,
      positionals: 1,
      options: { max: str },
      async run(args, env): Promise<CliReveal> {
        const bundle = positional(args, "bundle");
        const maxAmount = required(args, "max");
        const result = await kitFactory(env).credits.topup({ bundle, maxAmount });
        const { token, wallet, denomination, balance, lotExpiresAt, pending, receipt } = result;
        return {
          reveal: {
            bundle: result.bundle,
            token,
            wallet,
            denomination,
            balance,
            lotExpiresAt,
            pending,
            receipt,
          },
          notice: TOKEN_NOTICE,
        };
      },
    },
    {
      name: "rotate-token",
      description: "Issue a new credit token for the wallet (revokes its earlier tokens)",
      help: ROTATE_TOKEN_HELP,
      async run(_args, env): Promise<CliReveal> {
        const { token } = await kitFactory(env).credits.rotateToken();
        return { reveal: { token }, notice: TOKEN_NOTICE };
      },
    },
    {
      name: "credits",
      description:
        "Credit status: whether a token is configured, SIWX spending, last known balance, top-up spend",
      help: CREDITS_HELP,
      async run(_args, env) {
        const { credits } = kitFactory(env);
        return {
          hasToken: credits.hasToken(),
          siwxEnabled: credits.siwxEnabled(),
          balance: credits.lastKnownBalance(),
          topupSpent: credits.topupSpent(),
        };
      },
    },
  ];
}
