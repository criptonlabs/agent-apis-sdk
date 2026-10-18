import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
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

function defined<R extends object>(value: object): R {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as R;
}

const str = { type: "string" } as const;

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
      description: "Payment readiness: --from --to [--asset --amount --destination-tag]",
      options: { from: str, to: str, asset: str, amount: str, "destination-tag": str },
      async run(args, env) {
        const query = defined<Parameters<XrplAgentKit["data"]["paymentReadiness"]>[0]>({
          source: required(args, "from"),
          destination: required(args, "to"),
          asset: text(args, "asset"),
          amount: text(args, "amount"),
          destinationTag: num(args, "destination-tag"),
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
      options: { base: str, quote: str, amount: str, depth: str, "max-slippage": str },
      async run(args, env) {
        const input = defined<Parameters<XrplAgentKit["dexQuote"]>[0]>({
          base: required(args, "base"),
          quote: required(args, "quote"),
          amount: required(args, "amount"),
          depth: num(args, "depth"),
          maxSlippagePct: text(args, "max-slippage"),
        });
        return kitFactory(env).dexQuote(input);
      },
    },
  ];
}
