import { main } from "./interfaces/cli/main.js";

process.exitCode = await main(process.argv.slice(2), process.env, {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
