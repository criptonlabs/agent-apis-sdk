import { runCli, type CliIo } from "@criptonlabs/agent-apis-core/cli";
import { createSolanaAgentKit } from "../../index.js";
import { readSolanaEnv } from "../../infrastructure/config/solana-env.js";
import { solanaCommands } from "./commands.js";

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  return runCli(
    solanaCommands((processEnv) => createSolanaAgentKit(readSolanaEnv(processEnv))),
    argv,
    env,
    io,
  );
}
