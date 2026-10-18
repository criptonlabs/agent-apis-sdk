import { runCli, type CliIo } from "@criptonlabs/agent-apis-core/cli";
import { createXrplAgentKit } from "../../index.js";
import { readXrplEnv } from "../../infrastructure/config/xrpl-env.js";
import { xrplCommands } from "./commands.js";

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  return runCli(
    xrplCommands((processEnv) => createXrplAgentKit(readXrplEnv(processEnv))),
    argv,
    env,
    io,
  );
}
