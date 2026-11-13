import { parseArgs } from "node:util";
import { CriptonProblemError } from "../../domain/errors.js";
import { toErrorJson } from "../tools/error-json.js";
import { exitCodeFor } from "./exit-codes.js";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

/**
 * A command result that carries a secret the user must see once (design D13): `reveal` goes to
 * stdout and `notice` to stderr, so the secret never passes through a redacting `toJSON`.
 */
export interface CliReveal {
  reveal: Record<string, unknown>;
  notice: string;
}

export interface CliCommand {
  name: string;
  description: string;
  /** Printed by `<command> --help`; the description is printed when absent. */
  help?: string;
  options?: Record<string, { type: "string" | "boolean"; short?: string }>;
  positionals?: number;
  run(
    args: { values: Record<string, string | boolean | undefined>; positionals: string[] },
    env: NodeJS.ProcessEnv,
  ): Promise<unknown>;
}

const SECRET_FLAGS = [
  "--seed",
  "--secret",
  "--private-key",
  "--key",
  "--payer-key",
  "--token",
  "--credits-token",
];
const CREDIT_TOKEN_PREFIX = "clc_";
const PENDING_TOKEN_NOTICE =
  "The provisional credit token becomes valid only if the payment is reconciled.";

function usage(commands: readonly CliCommand[]): string {
  const lines = commands.map((c) => `  ${c.name}  ${c.description}`);
  return `Usage: <command> [options]\nCommands:\n${lines.join("\n")}\n`;
}

/** A secret flag, or any argument that holds a credit token (design D8). */
function isSecretArgument(arg: string): boolean {
  if (arg.includes(CREDIT_TOKEN_PREFIX)) return true;
  return SECRET_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`));
}

function line(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function formatJson(value: unknown, json: boolean): string {
  return `${json ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`;
}

function isCliReveal(result: unknown): result is CliReveal {
  if (typeof result !== "object" || result === null) return false;
  const { reveal, notice } = result as Partial<Record<keyof CliReveal, unknown>>;
  return typeof reveal === "object" && reveal !== null && typeof notice === "string";
}

function printResult(result: unknown, json: boolean, io: CliIo): void {
  if (!isCliReveal(result)) {
    io.stdout(formatJson(result, json));
    return;
  }
  io.stdout(formatJson(result.reveal, json));
  io.stderr(line(result.notice));
}

/** Prints an error and returns its exit code; an ambiguous top-up reveals its provisional token once. */
function printError(error: unknown, json: boolean, io: CliIo): number {
  if (error instanceof CriptonProblemError && error.pendingToken !== undefined) {
    const { code, eventId, pendingToken } = error;
    io.stdout(formatJson({ code, eventId, pendingToken }, json));
    io.stderr(line(PENDING_TOKEN_NOTICE));
    return 4;
  }
  const errorJson = toErrorJson(error);
  if (json) io.stdout(`${JSON.stringify(errorJson)}\n`);
  else io.stderr(`${errorJson.code}: ${errorJson.message}\n`);
  return exitCodeFor(error);
}

export async function runCli(
  commands: readonly CliCommand[],
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  if (argv.some(isSecretArgument)) {
    io.stderr("Secrets must not be passed as arguments; use environment variables.\n");
    return 2;
  }
  const [name, ...rest] = argv;
  const command = commands.find((c) => c.name === name);
  if (command === undefined) {
    io.stderr(usage(commands));
    return 2;
  }
  if (rest.includes("--help")) {
    io.stdout(line(command.help ?? command.description));
    return 0;
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
    printResult(result, json, io);
    return 0;
  } catch (error) {
    return printError(error, json, io);
  }
}
