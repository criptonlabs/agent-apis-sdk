import { toMastraTools } from "@criptonlabs/agent-apis-core/mastra";
import type { SolanaAgentKit, SolanaKitConfig } from "../../index.js";
import { resolveKit } from "../tools/kit.js";
import { createSolanaTools } from "../tools/registry.js";

export async function createMastraSolanaTools(
  kitOrConfig?: SolanaAgentKit | SolanaKitConfig,
): Promise<Record<string, unknown>> {
  return toMastraTools(createSolanaTools(resolveKit(kitOrConfig)));
}
