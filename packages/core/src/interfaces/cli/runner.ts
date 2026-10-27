import { parseArgs } from "node:util";
import { toErrorJson } from "../tools/error-json.js";
import { exitCodeFor } from "./exit-codes.js";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface CliCommand {
  name: string;
  description: string;
  options?: Record<string, { type: "string" | "boolean"; short?: string }>;
  positionals?: number;
  run(
    args: { values: Record<string, string | boolean | undefined>; positionals: string[] },
    env: NodeJS.ProcessEnv,
  ): Promise<unknown>;
}

const SECRET_FLAGS = ["--seed", "--secret", "--private-key", "--key", "--payer-key"];

function usage(commands: readonly CliCommand[]): string {
  const lines = commands.map((c) => `  ${c.name}  ${c.description}`);
  return `Usage: <command> [options]\nCommands:\n${lines.join("\n")}\n`;
}

function isSecretFlag(arg: string): boolean {
  return SECRET_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`));
}

export async function runCli(
  commands: readonly CliCommand[],
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  if (argv.some(isSecretFlag)) {
    io.stderr("Secrets must not be passed as arguments; use environment variables.\n");
    return 2;
  }
  const [name, ...rest] = argv;
  const command = commands.find((c) => c.name === name);
  if (command === undefined) {
    io.stderr(usage(commands));
    return 2;
  }
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: rest,
      options: { ...command.options, json: { type: "boolean" } },
      strict: true,
      allowPositionals: true,
    });
  } catch {
    io.stderr(`Invalid arguments for ${command.name}\n${usage(commands)}`);
    return 2;
  }
  const json = parsed.values.json === true;
  try {
    const result = await command.run(
      {
        values: parsed.values as Record<string, string | boolean | undefined>,
        positionals: parsed.positionals,
      },
      env,
    );
    io.stdout(`${json ? JSON.stringify(result) : JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const errorJson = toErrorJson(error);
    if (json) io.stdout(`${JSON.stringify(errorJson)}\n`);
    else io.stderr(`${errorJson.code}: ${errorJson.message}\n`);
    return exitCodeFor(error);
  }
}
