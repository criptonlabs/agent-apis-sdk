import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMcpServer,
  startMcpServer,
  type McpServerLike,
} from "@criptonlabs/agent-apis-core/mcp";
import type { XrplAgentKit, XrplKitConfig } from "../../index.js";
import { createXrplTools } from "../tools/registry.js";
import { resolveKit } from "../tools/kit.js";

const PACKAGE_NAME = "@criptonlabs/xrpl-agent-kit";

function packageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string };
      if (pkg.name === PACKAGE_NAME && pkg.version !== undefined) return pkg.version;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json of ${PACKAGE_NAME} not found`);
    dir = parent;
  }
}

function info(): { name: string; version: string } {
  return { name: "criptonlabs-xrpl-agent-kit", version: packageVersion() };
}

export async function createXrplMcpServer(
  kit: XrplAgentKit,
  opts?: { importer?: (specifier: string) => Promise<unknown> },
): Promise<McpServerLike> {
  return createMcpServer(createXrplTools(kit), info(), opts);
}

export async function startXrplMcpServerWithKit(kit: XrplAgentKit): Promise<void> {
  await startMcpServer(createXrplTools(kit), info());
}

export async function startXrplMcpServer(config?: XrplKitConfig): Promise<void> {
  await startXrplMcpServerWithKit(resolveKit(config));
}
