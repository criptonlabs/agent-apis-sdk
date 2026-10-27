import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import type { CliCommand } from "@criptonlabs/agent-apis-core/cli";
import type { SolanaAgentKit, TransferIntent } from "../../index.js";
import { startSolanaMcpServerWithKit } from "../mcp/server.js";

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

export function solanaCommands(
  kitFactory: (env: NodeJS.ProcessEnv) => SolanaAgentKit,
): CliCommand[] {
  return [
    {
      name: "mcp",
      description: "Start the stdio MCP server",
      async run(_args, env) {
        await startSolanaMcpServerWithKit(kitFactory(env));
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
  ];
}
