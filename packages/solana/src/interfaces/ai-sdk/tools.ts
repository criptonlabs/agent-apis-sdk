import { toAiSdkTools, type AiSdkTool } from "@criptonlabs/agent-apis-core/ai-sdk";
import type { SolanaAgentKit, SolanaKitConfig } from "../../index.js";
import { resolveKit } from "../tools/kit.js";
import { createSolanaTools } from "../tools/registry.js";

export function createCriptonSolanaTools(
  kitOrConfig?: SolanaAgentKit | SolanaKitConfig,
): Record<string, AiSdkTool> {
  return toAiSdkTools(createSolanaTools(resolveKit(kitOrConfig)));
}
