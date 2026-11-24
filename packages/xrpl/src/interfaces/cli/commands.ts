import { type CliReveal, CriptonValidationError } from "@criptonlabs/agent-apis-core";
import type { CliCommand } from "@criptonlabs/agent-apis-core/cli";
import type { XrplAgentKit } from "../../index.js";
import { startXrplMcpServerWithKit } from "../mcp/server.js";

type Args = Parameters<CliCommand["run"]>[0];

function text(args: Args, name: string): string | undefined {
  const value = args.values[name];
  return typeof value === "string" ? value : undefined;
}

function required(args: Args, name: string): string {
  const value = text(args, name);
  if (value === undefined) {
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

function num(args: Args, name: string): number | undefined {
  const value = text(args, name);
  return value === undefined ? undefined : Number(value);
}

function depthNum(args: Args): number | undefined {
  const value = text(args, "depth");
  if (value !== undefined && !/^[0-9]+$/.test(value)) {
    throw new CriptonValidationError(
      "depth",
      "depth must be a positive integer no larger than 9007199254740991",
    );
  }
  return value === undefined ? undefined : Number(value);
}

function defined<R extends object>(value: object): R {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as R;
}

const str = { type: "string" } as const;

const TOKEN_NOTICE = "Store this credit token in CRIPTON_CREDITS_TOKEN now: it is not shown again.";

const TOPUP_HELP = `Usage: agent-apis-xrpl topup <bundle> --max <amount> [--json]

Buys one prepaid credit bundle with the XRPL wallet (RLUSD) and prints the new
credit token once. Needs CRIPTON_XRPL_PAYER_SEED. Bundle ids and prices come
from the API's credits offer at run time; none is fixed in the kit.

Purchase limits:
  - --max <amount> is mandatory: the most this purchase may pay, decimal string.
    A bundle priced above it is refused before anything is signed.
  - maxPerCall (CRIPTON_MAX_PER_CALL) and sessionBudget (CRIPTON_SESSION_BUDGET)
    never apply to purchases; they limit per-call payments only.
  - CRIPTON_TOPUP_MAX and CRIPTON_TOPUP_BUDGET configure only the Solana purchase
    tool; the XRPL kit ignores them (they must still be set together or not at all).
  - The credit token is shown once: store it in CRIPTON_CREDITS_TOKEN right away.
    An XRPL wallet cannot recover a lost credit token (no rotation on XRPL).
  - No tool buys credits in the XRPL kit; top-ups happen only through this
    command and the programmatic kit.credits.topup.
`;

const CREDITS_HELP = `Usage: agent-apis-xrpl credits [--json]

Prints whether a credit token is configured (CRIPTON_CREDITS_TOKEN), the last
known balance per denomination and the amount spent on top-ups by this process.
Sends no request and never prints the token. A fresh process has balance null.
`;

const QUOTE_DEX_HELP = `Usage: agent-apis-xrpl quote-dex --base <asset> --quote <asset> --amount <amount> [--depth <n>] [--max-slippage <pct>] [--json]

Quotes buying --amount of the base asset on the XRPL DEX: filled amount,
average price, slippage and best venue. Refuses above --max-slippage percent.

Assets: XRP or CODE.issuer, where CODE is a case-sensitive 3-character code or
a 40-hex code (RLUSD: 524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De).
--depth is an integer from 1 to 9007199254740991; the API serves it in buckets
of 10, 50 or 100 levels per side, reported as depth_effective.
`;

export function xrplCommands(kitFactory: (env: NodeJS.ProcessEnv) => XrplAgentKit): CliCommand[] {
  return [
    {
      name: "mcp",
      description: "Start the stdio MCP server",
      async run(_args, env) {
        await startXrplMcpServerWithKit(kitFactory(env));
        // The server owns stdout from now on; never resolve so no result is printed to it.
        return new Promise<never>(() => {});
      },
    },
    {
      name: "fee",
      description: "Current transaction fee tiers and congestion",
      async run(_args, env) {
        return (await kitFactory(env).data.fee()).data;
      },
    },
    {
      name: "account",
      description: "Account summary: account <address>",
      positionals: 1,
      async run(args, env) {
        return (await kitFactory(env).data.accountSummary(positional(args, "address"))).data;
      },
    },
    {
      name: "token",
      description: "Issued token data: token <asset>",
      positionals: 1,
      async run(args, env) {
        return (await kitFactory(env).data.token(positional(args, "asset"))).data;
      },
    },
    {
      name: "readiness",
      description:
        "Payment readiness: --from --to [--asset --amount --destination-tag --credentials <id[,id...]>]",
      options: {
        from: str,
        to: str,
        asset: str,
        amount: str,
        "destination-tag": str,
        credentials: str,
      },
      async run(args, env) {
        const query = defined<Parameters<XrplAgentKit["data"]["paymentReadiness"]>[0]>({
          source: required(args, "from"),
          destination: required(args, "to"),
          asset: text(args, "asset"),
          amount: text(args, "amount"),
          destinationTag: num(args, "destination-tag"),
          credentials: text(args, "credentials")?.split(","),
        });
        return (await kitFactory(env).data.paymentReadiness(query)).data;
      },
    },
    {
      name: "prepare-payment",
      description:
        "Prepare an unsigned payment: --from --to --asset --amount [--destination-tag --source-asset --send-max-tolerance --fee-tier --max-fee]",
      options: {
        from: str,
        to: str,
        asset: str,
        amount: str,
        "destination-tag": str,
        "source-asset": str,
        "send-max-tolerance": str,
        "fee-tier": str,
        "max-fee": str,
      },
      async run(args, env) {
        const intent = defined<Parameters<XrplAgentKit["preparePayment"]>[0]>({
          source: required(args, "from"),
          destination: required(args, "to"),
          asset: required(args, "asset"),
          amount: required(args, "amount"),
          destinationTag: num(args, "destination-tag"),
          sourceAsset: text(args, "source-asset"),
          sendMaxTolerancePct: text(args, "send-max-tolerance"),
          feeTier: text(args, "fee-tier"),
          maxFeeDrops: text(args, "max-fee"),
        });
        return kitFactory(env).preparePayment(intent);
      },
    },
    {
      name: "quote-dex",
      description: "DEX quote: --base --quote --amount [--depth --max-slippage]",
      help: QUOTE_DEX_HELP,
      options: { base: str, quote: str, amount: str, depth: str, "max-slippage": str },
      async run(args, env) {
        const input = defined<Parameters<XrplAgentKit["dexQuote"]>[0]>({
          base: required(args, "base"),
          quote: required(args, "quote"),
          amount: required(args, "amount"),
          depth: depthNum(args),
          maxSlippagePct: text(args, "max-slippage"),
        });
        return kitFactory(env).dexQuote(input);
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
      name: "credits",
      description: "Credit status: whether a token is configured, last known balance, top-up spend",
      help: CREDITS_HELP,
      async run(_args, env) {
        const { credits } = kitFactory(env);
        return {
          hasToken: credits.hasToken(),
          balance: credits.lastKnownBalance(),
          topupSpent: credits.topupSpent(),
        };
      },
    },
  ];
}
