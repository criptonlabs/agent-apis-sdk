import { toMastraTools } from "@criptonlabs/agent-apis-core/mastra";
import type { XrplAgentKit, XrplKitConfig } from "../../index.js";
import { resolveKit } from "../tools/kit.js";
import { createXrplTools } from "../tools/registry.js";

export async function createMastraXrplTools(
  kitOrConfig?: XrplAgentKit | XrplKitConfig,
): Promise<Record<string, unknown>> {
  return toMastraTools(createXrplTools(resolveKit(kitOrConfig)));
}
