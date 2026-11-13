import { readCommonEnv } from "@criptonlabs/agent-apis-core";
import {
  createMcpServer,
  startMcpServer,
  type McpServerLike,
} from "@criptonlabs/agent-apis-core/mcp";
import type { SolanaAgentKit, SolanaKitConfig } from "../../index.js";
import { createSolanaTools } from "../tools/registry.js";
import { resolveKit } from "../tools/kit.js";
import { SOLANA_KIT_VERSION } from "../../infrastructure/config/version.js";

/** The purchase tool's per-purchase maximum; the tool exists only with it (design D13). */
type TopupOptions = { topup?: { maxAmount: string } };

function info(): { name: string; version: string } {
  return { name: "criptonlabs-agent-apis-solana", version: SOLANA_KIT_VERSION };
}

export async function createSolanaMcpServer(
  kit: SolanaAgentKit,
  opts?: {
    importer?: (specifier: string) => Promise<unknown>;
    topup?: { maxAmount: string };
  },
): Promise<McpServerLike> {
  return createMcpServer(createSolanaTools(kit, opts), info(), opts);
}

/**
 * The purchase tool options from an environment: `CRIPTON_TOPUP_MAX` as the per-purchase maximum
 * (the core accepts it only together with `CRIPTON_TOPUP_BUDGET`); none without it.
 */
export function solanaMcpOptions(env: NodeJS.ProcessEnv): TopupOptions {
  const { topupMax } = readCommonEnv(env);
  return topupMax === undefined ? {} : { topup: { maxAmount: topupMax } };
}

export async function startSolanaMcpServerWithKit(
  kit: SolanaAgentKit,
  opts?: TopupOptions,
): Promise<void> {
  await startMcpServer(createSolanaTools(kit, opts), info());
}

/** Without a config, the kit and the purchase tool options come from `process.env`. */
export async function startSolanaMcpServer(config?: SolanaKitConfig): Promise<void> {
  const kit = resolveKit(config);
  await startSolanaMcpServerWithKit(kit, config === undefined ? solanaMcpOptions(process.env) : {});
}
