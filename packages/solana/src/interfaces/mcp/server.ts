import {
  createMcpServer,
  startMcpServer,
  type McpServerLike,
} from "@criptonlabs/agent-apis-core/mcp";
import type { SolanaAgentKit, SolanaKitConfig } from "../../index.js";
import { createSolanaTools } from "../tools/registry.js";
import { resolveKit } from "../tools/kit.js";
import { SOLANA_KIT_VERSION } from "../../infrastructure/config/version.js";

function info(): { name: string; version: string } {
  return { name: "criptonlabs-agent-apis-solana", version: SOLANA_KIT_VERSION };
}

export async function createSolanaMcpServer(
  kit: SolanaAgentKit,
  opts?: { importer?: (specifier: string) => Promise<unknown> },
): Promise<McpServerLike> {
  return createMcpServer(createSolanaTools(kit), info(), opts);
}

export async function startSolanaMcpServerWithKit(kit: SolanaAgentKit): Promise<void> {
  await startMcpServer(createSolanaTools(kit), info());
}

export async function startSolanaMcpServer(config?: SolanaKitConfig): Promise<void> {
  await startSolanaMcpServerWithKit(resolveKit(config));
}
