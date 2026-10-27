import {
  createMcpServer,
  startMcpServer,
  type McpServerLike,
} from "@criptonlabs/agent-apis-core/mcp";
import type { XrplAgentKit, XrplKitConfig } from "../../index.js";
import { createXrplTools } from "../tools/registry.js";
import { resolveKit } from "../tools/kit.js";
import { XRPL_KIT_VERSION } from "../../infrastructure/config/version.js";

function info(): { name: string; version: string } {
  return { name: "criptonlabs-xrpl-agent-kit", version: XRPL_KIT_VERSION };
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
