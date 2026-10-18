import { toAiSdkTools, type AiSdkTool } from "@criptonlabs/agent-apis-core/ai-sdk";
import type { XrplAgentKit, XrplKitConfig } from "../../index.js";
import { resolveKit } from "../tools/kit.js";
import { createXrplTools } from "../tools/registry.js";

export function createCriptonXrplTools(
  kitOrConfig?: XrplAgentKit | XrplKitConfig,
): Record<string, AiSdkTool> {
  return toAiSdkTools(createXrplTools(resolveKit(kitOrConfig)));
}
